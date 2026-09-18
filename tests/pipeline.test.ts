/**
 * Pruebas de integración del ecosistema.
 *
 * Verifican lo que ninguna prueba unitaria puede: que los cinco módulos se
 * conectan de verdad por los hooks, y que un plugin de terceros puede
 * intervenir en el resultado sin tocar el código del generador.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import type {
  EcosystemModule,
  EventHookName,
  ModuleRunContext,
  VirtualFile,
} from '@calecosystem/contracts';
import { definePlugin } from '@calecosystem/contracts';
import { Entitlements, createKernel, createSilentLogger } from '@calecosystem/core';
import { CodeGenerator, generatorPlugin } from '@calecosystem/generator';
import { optimizerPlugin } from '@calecosystem/optimizer';
import { securityPlugin } from '@calecosystem/security';
import { testerPlugin } from '@calecosystem/tester';
import { documenterPlugin } from '@calecosystem/documenter';

const logger = createSilentLogger();
const enterprise = new Entitlements({ tier: 'enterprise' });

const BRIEF =
  'Plataforma de reservas para clínicas: los pacientes piden citas con los médicos, ' +
  'hay login de usuarios con roles, pagos online y un panel de administración. ' +
  'Esperamos 30.000 usuarios y trabajamos con datos médicos.';

async function fullKernel() {
  return createKernel({
    logger,
    entitlements: enterprise,
    plugins: [
      generatorPlugin(),
      optimizerPlugin(),
      securityPlugin(),
      testerPlugin(),
      documenterPlugin(),
    ],
  });
}

test('el ecosistema completo genera proyecto, informes y métricas', async () => {
  const kernel = await fullKernel();
  const result = await new CodeGenerator({ kernel }).generate({ text: BRIEF });

  assert.ok(result.files.length > 30);
  assert.equal(result.metrics.fileCount, result.files.length);
  assert.ok(result.metrics.totalBytes > 0);
  assert.ok(result.metrics.durationMs >= 0);

  // Las cinco fases deben haberse cronometrado.
  assert.deepEqual(Object.keys(result.metrics.phaseTimings).sort(), [
    'analyze',
    'augment',
    'finalize',
    'plan',
    'scaffold',
  ]);
  await kernel.dispose();
});

test('los cuatro módulos de ampliación emiten informe en el orden canonico', async () => {
  const kernel = await fullKernel();
  const result = await new CodeGenerator({ kernel }).generate({ text: BRIEF });

  assert.deepEqual(
    result.reports.map((report) => report.kind),
    ['optimizer', 'security', 'tester', 'documenter'],
  );
  for (const report of result.reports) {
    assert.ok(report.summary.length > 0, `${report.module} sin resumen`);
    assert.ok(report.score !== null && report.score >= 0 && report.score <= 100);
  }
  await kernel.dispose();
});

test('los ficheros que aportan los módulos llegan al proyecto final', async () => {
  const kernel = await fullKernel();
  const result = await new CodeGenerator({ kernel }).generate({ text: BRIEF });
  const paths = result.files.map((file) => file.path);

  assert.ok(paths.includes('SECURITY.md'), 'aportado por el auditor');
  assert.ok(paths.includes('performance-budget.json'), 'aportado por el optimizador');
  assert.ok(paths.includes('docs/TEST-PLAN.md'), 'aportado por el testeador');
  assert.ok(paths.includes('docs/ARCHITECTURE.md'), 'aportado por el documentador');
  assert.ok(paths.includes('apps/api/src/app.test.ts'), 'prueba de humo generada');
  await kernel.dispose();
});

test('cada fichero declara quien lo produjo', async () => {
  const kernel = await fullKernel();
  const result = await new CodeGenerator({ kernel }).generate({ text: BRIEF });

  for (const file of result.files) {
    assert.ok(file.producedBy.length > 0, `${file.path} sin productor declarado`);
  }
  const security = result.files.find((file) => file.path === 'SECURITY.md');
  assert.equal(security?.producedBy, '@calecosystem/security');
  await kernel.dispose();
});

test('el auditor detecta la autenticación sin verificar como hallazgo crítico', async () => {
  const kernel = await fullKernel();
  const result = await new CodeGenerator({ kernel }).generate({ text: BRIEF });
  const report = result.reports.find((candidate) => candidate.kind === 'security');
  const critical = report?.findings.filter((finding) => finding.severity === 'critical') ?? [];

  assert.ok(critical.some((finding) => finding.id === 'SEC-AUTH-NOT-VERIFIED'));
  assert.ok(result.warnings.some((warning) => warning.includes('[security]')));
  await kernel.dispose();
});

test('un plugin de terceros modifica el blueprint por el hook de transformación', async () => {
  const kernel = await createKernel({
    logger,
    entitlements: enterprise,
    plugins: [
      generatorPlugin(),
      definePlugin({
        name: 'plugin-corporativo',
        version: '1.0.0',
        register: (api) => {
          api.onTransform('blueprint:planned', (blueprint) => ({
            ...blueprint,
            stack: { ...blueprint.stack, packageManager: 'pnpm' },
          }));
          api.onTransform('deployment:planned', (deployment) => ({
            ...deployment,
            target: 'kubernetes',
          }));
        },
      }),
    ],
  });

  const result = await new CodeGenerator({ kernel }).generate({ text: BRIEF });

  assert.equal(result.blueprint.stack.packageManager, 'pnpm');
  assert.equal(result.blueprint.deployment.target, 'kubernetes');
  await kernel.dispose();
});

test('un plugin de terceros puede añadir ficheros al resultado final', async () => {
  const extra: VirtualFile = {
    path: 'COMPLIANCE.md',
    contents: '# Cumplimiento corporativo\n',
    producedBy: 'plugin-corporativo',
  };

  const kernel = await createKernel({
    logger,
    entitlements: enterprise,
    plugins: [
      generatorPlugin(),
      definePlugin({
        name: 'plugin-corporativo',
        version: '1.0.0',
        register: (api) => {
          api.onTransform('files:finalized', (files) => [...files, extra]);
        },
      }),
    ],
  });

  const result = await new CodeGenerator({ kernel }).generate({ text: BRIEF });

  assert.ok(result.files.some((file) => file.path === 'COMPLIANCE.md'));
  await kernel.dispose();
});

test('el pipeline emite los eventos del ciclo de vida en orden', async () => {
  const seen: EventHookName[] = [];
  const phases: string[] = [];

  const kernel = await createKernel({
    logger,
    entitlements: enterprise,
    plugins: [
      generatorPlugin(),
      documenterPlugin(),
      definePlugin({
        name: 'observador',
        version: '1.0.0',
        register: (api) => {
          api.onEvent('pipeline:phase-start', (payload) => void phases.push(payload.phase));
          api.onEvent('module:before-run', () => void seen.push('module:before-run'));
          api.onEvent('module:after-run', () => void seen.push('module:after-run'));
          api.onEvent('generation:completed', () => void seen.push('generation:completed'));
        },
      }),
    ],
  });

  await new CodeGenerator({ kernel }).generate({ text: BRIEF });

  assert.deepEqual(phases, ['analyze', 'plan', 'scaffold', 'augment', 'finalize']);
  assert.deepEqual(seen, ['module:before-run', 'module:after-run', 'generation:completed']);
  await kernel.dispose();
});

test('un módulo que falla no tumba la generación y deja constancia', async () => {
  const roto: EcosystemModule = {
    descriptor: {
      id: 'test/roto',
      kind: 'optimizer',
      version: '0.0.1',
      displayName: 'Modulo roto',
      description: 'falla siempre',
      tier: 'community',
      status: 'preview',
    },
    run: async (_context: ModuleRunContext) => {
      throw new Error('el analizador se quedó sin memoria');
    },
  };

  const kernel = await createKernel({
    logger,
    entitlements: enterprise,
    plugins: [
      generatorPlugin(),
      definePlugin({
        name: 'plugin-roto',
        version: '1.0.0',
        register: (api) => api.registerModule(roto),
      }),
      documenterPlugin(),
    ],
  });

  const result = await new CodeGenerator({ kernel }).generate({ text: BRIEF });

  assert.ok(result.files.length > 0, 'el proyecto debe entregarse igualmente');
  assert.ok(result.warnings.some((warning) => warning.includes('test/roto')));
  assert.ok(result.reports.some((report) => report.kind === 'documenter'));
  await kernel.dispose();
});

test('generation:failed se emite cuando el pipeline aborta', async () => {
  let failedPhase: string | null = null;
  const kernel = await createKernel({
    logger,
    plugins: [
      generatorPlugin(),
      definePlugin({
        name: 'observador-de-fallos',
        version: '1.0.0',
        register: (api) => {
          api.onEvent('generation:failed', (payload) => {
            failedPhase = payload.phase;
          });
        },
      }),
    ],
  });

  await assert.rejects(() => new CodeGenerator({ kernel }).generate({ text: 'corto' }));

  assert.equal(failedPhase, 'analyze');
  await kernel.dispose();
});

test('sin licencia de pago se genera el proyecto, pero sin las fases premium', async () => {
  const kernel = await createKernel({
    logger,
    entitlements: new Entitlements({ tier: 'community' }),
    plugins: [
      generatorPlugin(),
      optimizerPlugin(),
      securityPlugin(),
      testerPlugin(),
      documenterPlugin(),
    ],
  });

  const result = await new CodeGenerator({ kernel }).generate({ text: BRIEF });

  assert.ok(result.files.length > 20, 'el generador es community y debe funcionar');
  assert.deepEqual(result.reports.map((report) => report.kind), ['documenter']);
  assert.equal(kernel.diagnostics().skippedPlugins.length, 3);
  await kernel.dispose();
});

test('la generación completa es reproducible salvo en las métricas de tiempo', async () => {
  const kernelA = await fullKernel();
  const kernelB = await fullKernel();

  const first = await new CodeGenerator({ kernel: kernelA }).generate({ text: BRIEF });
  const second = await new CodeGenerator({ kernel: kernelB }).generate({ text: BRIEF });

  assert.deepEqual(
    first.files.map((file) => [file.path, file.contents]),
    second.files.map((file) => [file.path, file.contents]),
  );
  await kernelA.dispose();
  await kernelB.dispose();
});

test('el blueprint se ajusta a los adaptadores realmente instalados', async () => {
  // Dominio amplio: el planificador pide `node-nest`, para el que no hay
  // adaptador en esta instalación.
  const kernel = await createKernel({
    logger,
    entitlements: enterprise,
    plugins: [generatorPlugin()],
  });

  const result = await new CodeGenerator({ kernel }).generate({
    text:
      'Plataforma SaaS multiempresa con organizaciones, usuarios, proyectos, tareas, ' +
      'facturas, pagos, suscripciones, planes y documentos, con login y roles.',
  });

  // El stack declarado debe coincidir con el código que se ha generado.
  assert.equal(result.blueprint.stack.backend, 'node-fastify');
  assert.ok(result.warnings.some((warning) => warning.includes('node-nest')));

  // Y la sustitución queda documentada, no escondida.
  const substitution = result.blueprint.decisions.find(
    (decision) => decision.id === 'ADR-BACKEND-SUSTITUIDO',
  );
  assert.ok(substitution);
  assert.ok(substitution.alternatives.includes('node-nest'));

  const readme = result.files.find((file) => file.path === 'README.md')?.contents ?? '';
  assert.ok(readme.includes('node-fastify'));
  assert.ok(!readme.includes('| Backend | node-nest |'), 'el README no puede prometer otro stack');
  await kernel.dispose();
});

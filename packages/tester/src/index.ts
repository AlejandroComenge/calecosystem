import type {
  Blueprint,
  DomainEntity,
  Finding,
  ModuleDescriptor,
  ModuleReport,
  ModuleRunContext,
  Plugin,
  TesterModule,
  VirtualFile,
} from '@calecosystem/contracts';
import { definePlugin } from '@calecosystem/contracts';

const DESCRIPTOR = {
  id: '@calecosystem/tester',
  kind: 'tester',
  version: '0.1.0',
  displayName: 'Testeador automatico',
  description:
    'Genera pruebas de humo y de dominio para el proyecto, y senala los riesgos que quedan sin cubrir.',
  tier: 'pro',
  status: 'preview',
} as const satisfies ModuleDescriptor;

/**
 * Testeador automatico (v0.1).
 *
 * Alcance actual: genera la bateria inicial (salud del API y validacion de
 * dominio) y convierte cada riesgo del blueprint sin prueba asociada en un
 * hallazgo. No genera pruebas end-to-end ni de carga todavia.
 *
 * Criterio: pocas pruebas que pasan y significan algo. Una bateria generada
 * que falla el primer dia se borra, y con ella la costumbre de tener tests.
 */
export class AutomatedTester implements TesterModule {
  readonly descriptor = DESCRIPTOR;

  async run(context: ModuleRunContext): Promise<ModuleReport> {
    const startedAt = performance.now();
    const { blueprint } = context;
    const findings: Finding[] = [];

    context.emit(healthTest());
    for (const entity of blueprint.entities) {
      context.emit(domainTest(entity));
    }
    context.emit(testPlan(blueprint));

    // Cada riesgo asignado al testeador que no tenga prueba es deuda visible.
    for (const risk of blueprint.risks) {
      if (risk.owner !== 'tester') continue;
      findings.push({
        id: `TEST-UNCOVERED-${risk.id}`,
        severity: risk.impact === 'high' ? 'high' : 'medium',
        title: `Riesgo sin prueba automatica: ${risk.title}`,
        detail: `La bateria generada no cubre este riesgo. Mitigacion prevista: ${risk.mitigation}`,
        remediation: 'Escribir una prueba que falle si el riesgo se materializa, antes de la primera release.',
        tags: ['coverage', 'risk'],
      });
    }

    if (blueprint.requirements.features.auth) {
      findings.push({
        id: 'TEST-AUTH-FLOW',
        severity: 'high',
        title: 'El flujo de autenticacion no tiene pruebas de integracion',
        detail:
          'Los endpoints de registro, login y renovacion de token se generan como esqueleto y sin cobertura.',
        remediation: 'Cubrir alta, inicio de sesion, token invalido y token caducado antes de exponer el servicio.',
        tags: ['auth', 'integration'],
      });
    }

    const generatedTests = blueprint.entities.length + 1;
    return {
      module: DESCRIPTOR.id,
      kind: 'tester',
      summary:
        `${generatedTests} ficheros de prueba generados. ` +
        (findings.length === 0
          ? 'Sin zonas de riesgo pendientes.'
          : `Zonas de riesgo sin cubrir: ${findings.length}.`),
      findings,
      score: estimateCoverage(blueprint, findings),
      emittedFiles: [],
      durationMs: performance.now() - startedAt,
    };
  }
}

function healthTest(): VirtualFile {
  return {
    path: 'apps/api/src/app.test.ts',
    producedBy: DESCRIPTOR.id,
    contents: [
      "import test from 'node:test';",
      "import assert from 'node:assert/strict';",
      "import { buildApp } from './app.ts';",
      '',
      "test('la sonda de salud responde 200', async () => {",
      '  const app = await buildApp();',
      '  try {',
      "    const response = await app.inject({ method: 'GET', url: '/api/health' });",
      '    assert.equal(response.statusCode, 200);',
      "    assert.equal(response.json().status, 'ok');",
      '  } finally {',
      '    await app.close();',
      '  }',
      '});',
      '',
    ].join('\n'),
  };
}

function domainTest(entity: DomainEntity): VirtualFile {
  const requiredField = entity.fields.find(
    (field) => field.required && field.name !== 'id' && !field.name.endsWith('At'),
  );

  const body = requiredField
    ? [
        `test('validate${entity.name} exige ${requiredField.name}', () => {`,
        `  const errors = validate${entity.name}({});`,
        `  assert.ok(errors.some((error) => error.includes('${requiredField.name}')));`,
        '});',
      ]
    : [
        `test('validate${entity.name} acepta una entrada vacia', () => {`,
        `  assert.deepEqual(validate${entity.name}({}), []);`,
        '});',
      ];

  return {
    path: `apps/api/src/domain/${entity.name}.test.ts`,
    producedBy: DESCRIPTOR.id,
    contents: [
      "import test from 'node:test';",
      "import assert from 'node:assert/strict';",
      `import { validate${entity.name} } from './${entity.name}.ts';`,
      '',
      ...body,
      '',
    ].join('\n'),
  };
}

function testPlan(blueprint: Blueprint): VirtualFile {
  const lines: string[] = [
    '# Plan de pruebas',
    '',
    `Punto de partida para **${blueprint.projectName}**. Lo generado cubre la base; el resto es trabajo del equipo.`,
    '',
    '## Generado automaticamente',
    '',
    '- Sonda de salud del API.',
    `- Validacion de dominio de ${blueprint.entities.length} entidades.`,
    '',
    '## Pendiente de escribir',
    '',
    '| Nivel | Alcance | Prioridad |',
    '| --- | --- | --- |',
    '| Integracion | Endpoints CRUD con base de datos real | Alta |',
  ];

  if (blueprint.requirements.features.auth) {
    lines.push('| Integracion | Alta, login, renovacion y expiracion de token | Alta |');
  }
  if (blueprint.requirements.features.payments) {
    lines.push('| Integracion | Webhook de pagos: firma valida, invalida y reintentos | Alta |');
  }
  if (blueprint.requirements.features.multiTenant) {
    lines.push('| Seguridad | Aislamiento entre inquilinos en cada repositorio | Critica |');
  }
  lines.push(
    '| E2E | Recorrido principal de usuario en navegador | Media |',
    '| Carga | Perfil de trafico esperado sobre los listados | Media |',
    '',
    '## Criterio de aceptacion sugerido',
    '',
    '- La rama principal no se rompe: CI en verde es condicion de merge.',
    '- Toda correccion de fallo llega con una prueba que falla sin el arreglo.',
    '',
  );

  return {
    path: 'docs/TEST-PLAN.md',
    producedBy: DESCRIPTOR.id,
    contents: lines.join('\n'),
  };
}

/**
 * Estimacion honesta de cobertura estructural: que proporcion de las piezas
 * criticas tiene al menos una prueba. No es cobertura de lineas y no
 * pretende serlo.
 */
function estimateCoverage(blueprint: Blueprint, findings: readonly Finding[]): number {
  const criticalUnits = blueprint.entities.length + blueprint.endpoints.length;
  const coveredUnits = blueprint.entities.length + 1;
  const base = (coveredUnits / Math.max(1, criticalUnits)) * 100;
  const penalty = findings.filter((finding) => finding.severity === 'high').length * 5;
  return Math.max(0, Math.round(base - penalty));
}

export function testerPlugin(): Plugin {
  return definePlugin({
    name: '@calecosystem/tester',
    version: '0.1.0',
    description: 'Registra el testeador automatico en la fase `augment`.',
    tier: 'pro',
    register(api) {
      api.registerModule(new AutomatedTester());
    },
  });
}

export default testerPlugin;

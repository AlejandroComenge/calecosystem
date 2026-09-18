import test from 'node:test';
import assert from 'node:assert/strict';
import type { FrontendFramework } from '@calecosystem/contracts';
import { createKernel, createSilentLogger, type EcosystemKernel } from '@calecosystem/core';
import { RequirementsAnalyzer } from '../analysis/requirements-analyzer.ts';
import { ArchitecturePlanner } from '../planning/architecture-planner.ts';
import { Scaffolder } from './scaffolder.ts';
import { generatorPlugin } from '../plugin.ts';

const logger = createSilentLogger();
const SHOP = 'Tienda con productos, pedidos y clientes, con login de usuarios y pagos.';

async function scaffoldWith(framework: FrontendFramework, kernel?: EcosystemKernel) {
  const activeKernel =
    kernel ?? (await createKernel({ logger, plugins: [generatorPlugin()] }));
  const requirements = await new RequirementsAnalyzer({ logger }).analyze({
    text: SHOP,
    hints: { frontend: framework },
  });
  const blueprint = new ArchitecturePlanner({ logger }).plan(requirements);
  const outcome = await new Scaffolder({ kernel: activeKernel, logger }).scaffold(blueprint);
  return { tree: outcome.tree, outcome, blueprint };
}

for (const framework of ['react', 'vue', 'angular'] as const) {
  test(`genera un proyecto completo para ${framework}`, async () => {
    const { tree, blueprint } = await scaffoldWith(framework);

    assert.equal(blueprint.stack.frontend, framework);
    assert.ok(tree.size > 20, `solo ${tree.size} ficheros generados`);

    // Frontend, backend, despliegue y raíz: las cuatro partes deben existir.
    assert.ok(tree.has('apps/web/package.json'));
    assert.ok(tree.has('apps/api/src/server.ts'));
    assert.ok(tree.has('docker-compose.yml'));
    assert.ok(tree.has('README.md'));
  });

  test(`el package.json del frontend ${framework} es JSON válido y declara el framework`, async () => {
    const { tree } = await scaffoldWith(framework);
    const contents = tree.get('apps/web/package.json')?.contents ?? '';
    const parsed = JSON.parse(contents) as { dependencies: Record<string, string> };

    const expected = framework === 'angular' ? '@angular/core' : framework;
    assert.ok(parsed.dependencies[expected], `falta la dependencia ${expected}`);
  });
}

test('el backend sigue la separación en capas del blueprint', async () => {
  const { tree, blueprint } = await scaffoldWith('react');

  for (const entity of blueprint.entities) {
    assert.ok(tree.has(`apps/api/src/domain/${entity.name}.ts`), `falta el dominio de ${entity.name}`);
    assert.ok(tree.has(`apps/api/src/application/${entity.name}Service.ts`));
    assert.ok(tree.has(`apps/api/src/infrastructure/${entity.name}Repository.ts`));
    assert.ok(tree.has(`apps/api/src/routes/${entity.plural}.routes.ts`));
  }
});

test('el dominio no importa nada de infraestructura ni del framework http', async () => {
  const { tree, blueprint } = await scaffoldWith('react');
  const entity = blueprint.entities[0];
  assert.ok(entity);
  const domain = tree.get(`apps/api/src/domain/${entity.name}.ts`)?.contents ?? '';

  assert.ok(!domain.includes('fastify'), 'el dominio no debe conocer el servidor http');
  assert.ok(!domain.includes('infrastructure'), 'el dominio no debe depender de la persistencia');
});

test('genera una vista de listado por entidad', async () => {
  const { tree, blueprint } = await scaffoldWith('react');

  for (const entity of blueprint.entities) {
    assert.ok(tree.has(`apps/web/src/pages/${entity.name}ListPage.tsx`));
  }
});

test('el despliegue incluye contenedores, CI y plantilla de variables de entorno', async () => {
  const { tree } = await scaffoldWith('react');

  assert.ok(tree.has('apps/api/Dockerfile'));
  assert.ok(tree.has('apps/web/Dockerfile'));
  assert.ok(tree.has('.github/workflows/ci.yml'));
  assert.ok(tree.has('.env.example'));
});

test('la plantilla de entorno no lleva valores de secretos rellenos', async () => {
  const { tree } = await scaffoldWith('react');
  const env = tree.get('.env.example')?.contents ?? '';

  assert.match(env, /^JWT_SECRET=$/m, 'los secretos deben quedar vacíos en el ejemplo');
});

test('el .gitignore del proyecto generado excluye el fichero de entorno real', async () => {
  const { tree } = await scaffoldWith('react');

  assert.match(tree.get('.gitignore')?.contents ?? '', /^\.env$/m);
});

test('el README del proyecto recoge las decisiones y las preguntas abiertas', async () => {
  const { tree, blueprint } = await scaffoldWith('react');
  const readme = tree.get('README.md')?.contents ?? '';

  assert.ok(readme.includes(blueprint.projectName));
  assert.ok(readme.includes('ADR-FRONTEND'));
  assert.ok(readme.includes('Decisiones de arquitectura'));
});

test('sin adaptador para el framework pedido, el fallo es explicito y accionable', async () => {
  const kernel = await createKernel({
    logger,
    plugins: [generatorPlugin({ frameworks: ['vue'] })],
  });
  const requirements = await new RequirementsAnalyzer({ logger }).analyze({
    text: SHOP,
    hints: { frontend: 'react' },
  });
  const blueprint = new ArchitecturePlanner({ logger }).plan(requirements);

  await assert.rejects(
    () => new Scaffolder({ kernel, logger }).scaffold(blueprint),
    /No hay adaptador registrado para el frontend "react"/,
  );
});

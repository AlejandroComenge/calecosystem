import test from 'node:test';
import assert from 'node:assert/strict';
import { createSilentLogger } from '@calecosystem/core';
import { RequirementsAnalyzer } from '../analysis/requirements-analyzer.ts';
import { ArchitecturePlanner } from './architecture-planner.ts';

const logger = createSilentLogger();
const analyzer = new RequirementsAnalyzer({ logger });
const planner = new ArchitecturePlanner({ logger });

async function planFor(text: string, projectName?: string) {
  const requirements = await analyzer.analyze(projectName ? { text, projectName } : { text });
  return planner.plan(requirements);
}

const SHOP = 'Tienda con productos, pedidos y clientes, con login y pagos por Stripe.';

test('sin preferencia expresa elige el framework por defecto', async () => {
  const blueprint = await planFor(SHOP);

  assert.equal(blueprint.stack.frontend, 'react');
});

test('un framework mencionado en el texto gana al valor por defecto', async () => {
  const blueprint = await planFor(`${SHOP} El frontend debe hacerse en vue.`);

  assert.equal(blueprint.stack.frontend, 'vue');
});

test('las relaciones entre entidades llevan a un motor relacional', async () => {
  const blueprint = await planFor(SHOP);

  assert.equal(blueprint.stack.database, 'postgres');
});

test('un dominio amplio o multiempresa pide un backend más estructurado', async () => {
  const blueprint = await planFor(
    'Plataforma SaaS multiempresa con organizaciones, usuarios, proyectos, tareas, facturas, ' +
      'pagos, suscripciones, planes y documentos.',
  );

  assert.equal(blueprint.stack.backend, 'node-nest');
});

test('cada decision queda registrada con motivo y alternativas', async () => {
  const blueprint = await planFor(SHOP);
  const ids = blueprint.decisions.map((decision) => decision.id);

  assert.deepEqual(ids, ['ADR-FRONTEND', 'ADR-BACKEND', 'ADR-DATABASE', 'ADR-DEPLOYMENT']);
  for (const decision of blueprint.decisions) {
    assert.ok(decision.rationale.length > 20, `${decision.id} sin justificación útil`);
    assert.ok(decision.alternatives.length > 0, `${decision.id} sin alternativas registradas`);
    assert.ok(!decision.alternatives.includes(decision.choice));
  }
});

test('genera el CRUD completo de cada entidad más la sonda de salud', async () => {
  const blueprint = await planFor(SHOP);
  const products = blueprint.endpoints.filter((endpoint) => endpoint.path.startsWith('/api/products'));

  assert.equal(products.length, 5);
  assert.deepEqual(
    products.map((endpoint) => endpoint.method).sort(),
    ['DELETE', 'GET', 'GET', 'PATCH', 'POST'],
  );
  assert.ok(blueprint.endpoints.some((endpoint) => endpoint.path === '/api/health'));
});

test('con autenticación activa los endpoints de escritura la exigen', async () => {
  const blueprint = await planFor(SHOP);
  const create = blueprint.endpoints.find(
    (endpoint) => endpoint.method === 'POST' && endpoint.path === '/api/products',
  );
  const login = blueprint.endpoints.find((endpoint) => endpoint.path === '/api/auth/login');

  assert.equal(create?.requiresAuth, true);
  assert.equal(login?.requiresAuth, false, 'el login no puede exigir estar autenticado');
});

test('los pagos añaden checkout y webhook', async () => {
  const blueprint = await planFor(SHOP);
  const paths = blueprint.endpoints.map((endpoint) => endpoint.path);

  assert.ok(paths.includes('/api/payments/checkout'));
  assert.ok(paths.includes('/api/payments/webhook'));
});

test('genera listado y detalle por entidad, más las vistas de sesión', async () => {
  const blueprint = await planFor(SHOP);
  const routes = blueprint.pages.map((page) => page.route);

  assert.ok(routes.includes('/products'));
  assert.ok(routes.includes('/products/:id'));
  assert.ok(routes.includes('/login'));
});

test('los riesgos detectados tienen dueño dentro del ecosistema', async () => {
  const blueprint = await planFor(SHOP);
  const owners = new Set(blueprint.risks.map((risk) => risk.owner));

  assert.ok(blueprint.risks.some((risk) => risk.id === 'RISK-PCI'));
  assert.ok(owners.has('security'));
  for (const risk of blueprint.risks) {
    assert.ok(risk.mitigation.length > 10, `${risk.id} sin mitigación accionable`);
  }
});

test('el plan de despliegue declara servicios y secretos necesarios', async () => {
  const blueprint = await planFor(SHOP);

  assert.equal(blueprint.deployment.target, 'docker-compose');
  assert.ok(blueprint.deployment.services.includes('postgres'));
  assert.ok(blueprint.deployment.secrets.includes('PAYMENT_PROVIDER_SECRET'));
  assert.deepEqual(blueprint.deployment.environments, ['development', 'staging', 'production']);
});

test('un volumen muy alto lleva a un destino con escalado horizontal', async () => {
  const blueprint = await planFor(
    'Red social con publicaciones, comentarios y mensajes para 500.000 usuarios con login.',
  );

  assert.equal(blueprint.deployment.target, 'kubernetes');
});

test('la planificación es reproducible', async () => {
  assert.deepEqual(await planFor(SHOP), await planFor(SHOP));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createSilentLogger } from '@calecosystem/core';
import { RequirementsAnalyzer } from '../analysis/requirements-analyzer.ts';
import { ArchitecturePlanner } from '../planning/architecture-planner.ts';
import { ecommerceTemplate } from './ecommerce.ts';
import { saasTemplate } from './saas.ts';
import { landingTemplate } from './landing.ts';

const logger = createSilentLogger();
const analyzer = new RequirementsAnalyzer({ logger });
const planner = new ArchitecturePlanner({ logger });

const SHOP =
  'Tienda online con catalogo de productos, carrito de la compra, checkout con pagos ' +
  'por Stripe y panel de administracion de pedidos.';
const SAAS =
  'Plataforma SaaS multiempresa: cada organizacion tiene su espacio de trabajo, usuarios ' +
  'con roles, suscripciones mensuales y planes con distinta cuota.';
const LANDING =
  'Landing de captacion para el lanzamiento de un producto, con formulario de contacto ' +
  'para recoger leads y buen posicionamiento SEO.';

async function requirementsFor(text: string) {
  return analyzer.analyze({ text });
}

async function blueprintFor(text: string) {
  return planner.plan(await requirementsFor(text));
}

test('cada plantilla reconoce su propio tipo de producto', async () => {
  assert.ok((await ecommerceTemplate.detect(await requirementsFor(SHOP))).score >= 0.6);
  assert.ok((await saasTemplate.detect(await requirementsFor(SAAS))).score >= 0.5);
  assert.ok((await landingTemplate.detect(await requirementsFor(LANDING))).score >= 0.4);
});

test('cada plantilla puntua mas alto que las otras en su terreno', async () => {
  const shop = await requirementsFor(SHOP);

  const scores = {
    ecommerce: ecommerceTemplate.detect(shop).score,
    saas: saasTemplate.detect(shop).score,
    landing: landingTemplate.detect(shop).score,
  };

  assert.ok(scores.ecommerce > scores.saas);
  assert.ok(scores.ecommerce > scores.landing);
});

test('las contra-senales evitan que una landing se confunda con una tienda', async () => {
  const landing = await requirementsFor(LANDING);

  assert.ok(ecommerceTemplate.detect(landing).score < 0.35, 'no debe superar el umbral');
});

test('la deteccion explica que terminos la activaron', async () => {
  const match = ecommerceTemplate.detect(await requirementsFor(SHOP));

  assert.ok(match.signals.includes('carrito'));
  assert.ok(match.signals.some((signal) => signal.startsWith('entidad:')));
});

test('la plantilla de e-commerce completa el dominio y las vistas', async () => {
  const refined = ecommerceTemplate.refine(await blueprintFor(SHOP));
  const routes = refined.pages.map((page) => page.route);
  const entities = refined.entities.map((entity) => entity.name);

  assert.ok(entities.includes('CartItem'), 'el carrito no sale del enunciado, lo pone la plantilla');
  assert.ok(routes.includes('/cart'));
  assert.ok(routes.includes('/checkout'));
  assert.ok(routes.includes('/admin/orders'));
  assert.ok(refined.endpoints.some((endpoint) => endpoint.path === '/api/checkout'));
});

test('la plantilla anade el riesgo de stock con dueno asignado', async () => {
  const refined = ecommerceTemplate.refine(await blueprintFor(SHOP));
  const risk = refined.risks.find((candidate) => candidate.id === 'RISK-STOCK-RACE');

  assert.ok(risk);
  assert.equal(risk.owner, 'tester');
  assert.equal(risk.impact, 'high');
});

test('la plantilla deja constancia de su intervencion', async () => {
  const refined = ecommerceTemplate.refine(await blueprintFor(SHOP));
  const decision = refined.decisions.find((candidate) => candidate.id === 'ADR-PLANTILLA');

  assert.ok(decision, 'aplicar una plantilla es una decision de arquitectura');
  assert.match(decision.choice, /E-commerce/);
});

test('refine no duplica entidades que el analizador ya dedujo', async () => {
  const blueprint = await blueprintFor(SHOP);
  const refined = ecommerceTemplate.refine(blueprint);
  const products = refined.entities.filter((entity) => entity.name === 'Product');

  assert.equal(products.length, 1);
  // El modelo del analizador manda: sale del enunciado real, no de la plantilla.
  assert.equal(products[0]?.sourceTerm.startsWith('plantilla:'), false);
});

test('refine es idempotente: aplicarla dos veces no cambia el dominio', async () => {
  const once = ecommerceTemplate.refine(await blueprintFor(SHOP));
  const twice = ecommerceTemplate.refine(once);

  assert.deepEqual(
    twice.entities.map((entity) => entity.name),
    once.entities.map((entity) => entity.name),
  );
  assert.deepEqual(twice.pages.length, once.pages.length);
});

test('la plantilla SaaS impone el aislamiento por inquilino', async () => {
  const refined = saasTemplate.refine(await blueprintFor(SAAS));

  assert.ok(refined.entities.some((entity) => entity.name === 'Organization'));
  assert.ok(refined.risks.some((risk) => risk.id === 'RISK-TENANT-QUERY'));
  assert.ok(refined.pages.some((page) => page.route === '/settings/billing'));
});

test('la plantilla de landing prevé el spam del formulario publico', async () => {
  const refined = landingTemplate.refine(await blueprintFor(LANDING));

  assert.ok(refined.entities.some((entity) => entity.name === 'Lead'));
  assert.ok(refined.risks.some((risk) => risk.id === 'RISK-LEAD-SPAM'));
  assert.ok(refined.endpoints.some((endpoint) => endpoint.path === '/api/leads'));
});

test('las tres plantillas declaran metadatos coherentes', () => {
  for (const template of [ecommerceTemplate, saasTemplate, landingTemplate]) {
    assert.ok(template.id.startsWith('calec.template.'));
    assert.ok(template.name.length > 0);
    assert.ok(template.description.length > 20);
    assert.deepEqual(template.frameworks, ['react']);
  }
});

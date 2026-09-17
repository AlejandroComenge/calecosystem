import test from 'node:test';
import assert from 'node:assert/strict';
import { createSilentLogger } from '@calecosystem/core';
import { RequirementsAnalyzer } from './requirements-analyzer.ts';

const analyzer = new RequirementsAnalyzer({ logger: createSilentLogger() });

const MARKETPLACE =
  'Quiero un marketplace donde los vendedores publican productos y los clientes hacen pedidos. ' +
  'Necesita login de usuarios, pagos con Stripe, valoraciones de productos y un panel de administracion. ' +
  'Esperamos 20.000 usuarios el primer ano y debemos cumplir el RGPD.';

test('extrae las entidades de negocio del texto', async () => {
  const model = await analyzer.analyze({ text: MARKETPLACE });
  const names = model.entities.map((entity) => entity.name);

  assert.ok(names.includes('Product'), `esperaba Product en ${names.join(', ')}`);
  assert.ok(names.includes('Order'));
  assert.ok(names.includes('Customer'));
  assert.ok(names.includes('Review'));
});

test('cada entidad llega con identificador, marcas de tiempo y ruta en plural', async () => {
  const model = await analyzer.analyze({ text: MARKETPLACE });
  const product = model.entities.find((entity) => entity.name === 'Product');

  assert.ok(product);
  assert.equal(product.plural, 'products');
  const fieldNames = product.fields.map((field) => field.name);
  assert.ok(fieldNames.includes('id'));
  assert.ok(fieldNames.includes('price'));
  assert.ok(fieldNames.includes('createdAt'));
  assert.ok(fieldNames.includes('updatedAt'));
});

test('detecta las capacidades transversales mencionadas', async () => {
  const model = await analyzer.analyze({ text: MARKETPLACE });

  assert.equal(model.features.auth, true);
  assert.equal(model.features.payments, true);
  assert.equal(model.features.adminPanel, true);
  assert.equal(model.features.realtime, false);
});

test('los pagos implican autenticacion aunque no se mencione el login', async () => {
  const model = await analyzer.analyze({
    text: 'Una tienda sencilla de productos con cobro por tarjeta mediante Stripe al finalizar la compra.',
  });

  assert.equal(model.features.payments, true);
  assert.equal(model.features.auth, true, 'cobrar exige saber a quien se cobra');
});

test('reconoce los roles de negocio y les asigna capacidades', async () => {
  const model = await analyzer.analyze({ text: MARKETPLACE });
  const labels = model.actors.map((actor) => actor.label);

  assert.ok(labels.includes('Cliente'));
  assert.ok(labels.includes('Vendedor'));
  assert.ok(labels.includes('Administrador'));
  const admin = model.actors.find((actor) => actor.label === 'Administrador');
  assert.ok(admin?.capabilities.includes('manage:all'));
});

test('interpreta la escala de usuarios y la normativa aplicable', async () => {
  const model = await analyzer.analyze({ text: MARKETPLACE });

  assert.equal(model.nonFunctional.expectedUsers, 20_000);
  assert.equal(model.nonFunctional.availabilityTarget, 'high');
  assert.ok(model.nonFunctional.compliance.includes('gdpr'));
});

test('identifica integraciones de terceros por nombre', async () => {
  const model = await analyzer.analyze({ text: MARKETPLACE });

  assert.ok(model.integrations.includes('stripe'));
});

test('una descripcion pobre baja la confianza y genera preguntas abiertas', async () => {
  const model = await analyzer.analyze({ text: 'Una web para mi negocio.' });

  assert.ok(model.confidence < 0.5, `confianza inesperadamente alta: ${model.confidence}`);
  assert.ok(model.openQuestions.length > 0);
  assert.ok(model.openQuestions.some((question) => question.includes('entidades')));
});

test('una descripcion rica sube la confianza', async () => {
  const model = await analyzer.analyze({ text: MARKETPLACE });

  assert.ok(model.confidence > 0.7, `confianza inesperadamente baja: ${model.confidence}`);
});

test('nunca devuelve un dominio vacio: cae a una entidad generica', async () => {
  const model = await analyzer.analyze({ text: 'Algo muy abstracto sin nombres concretos aqui.' });

  assert.equal(model.entities.length, 1);
  assert.equal(model.entities[0]?.name, 'Item');
});

test('el nombre explicito del proyecto gana a la inferencia', async () => {
  const model = await analyzer.analyze({ text: MARKETPLACE, projectName: 'Artesania Viva' });

  assert.equal(model.projectName, 'Artesania Viva');
  assert.equal(model.slug, 'artesania-viva');
});

test('las pistas de capacidades ganan a la deteccion automatica', async () => {
  const model = await analyzer.analyze({
    text: 'Catalogo publico de productos, sin cuentas de usuario.',
    hints: { features: { realtime: true } },
  });

  assert.equal(model.features.realtime, true);
});

test('el analisis es reproducible: mismo texto, mismo resultado', async () => {
  const first = await analyzer.analyze({ text: MARKETPLACE });
  const second = await analyzer.analyze({ text: MARKETPLACE });

  assert.deepEqual(first, second);
});

test('un enriquecedor externo puede refinar el analisis deterministico', async () => {
  const enriched = new RequirementsAnalyzer({
    logger: createSilentLogger(),
    enrichers: [
      {
        id: 'test.enricher',
        enrich: async () => ({ projectName: 'Refinado por IA' }),
      },
    ],
  });

  const model = await enriched.analyze({ text: MARKETPLACE });

  assert.equal(model.projectName, 'Refinado por IA');
});

test('si el enriquecedor falla se conserva el analisis deterministico', async () => {
  const fragile = new RequirementsAnalyzer({
    logger: createSilentLogger(),
    enrichers: [
      {
        id: 'test.roto',
        enrich: async () => {
          throw new Error('el proveedor no responde');
        },
      },
    ],
  });

  const model = await fragile.analyze({ text: MARKETPLACE });

  assert.ok(model.entities.length > 0);
});

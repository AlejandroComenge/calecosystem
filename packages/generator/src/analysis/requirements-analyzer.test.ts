import test from 'node:test';
import assert from 'node:assert/strict';
import { createSilentLogger } from '@calecosystem/core';
import { RequirementsAnalyzer } from './requirements-analyzer.ts';
import {
  ACTOR_LEXICON,
  COMPLIANCE_LEXICON,
  ENTITY_LEXICON,
  ENTITY_TRIGGERS,
  FEATURE_LEXICON,
  INTEGRATION_LEXICON,
} from './lexicon.ts';
import { ECOMMERCE_RULES } from '../templates/ecommerce.ts';
import { SAAS_RULES } from '../templates/saas.ts';
import { LANDING_RULES } from '../templates/landing.ts';

/** Un término de léxico debe ser idéntico a su forma normalizada. */
function sinTilde(valor: string): string {
  return valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

const analyzer = new RequirementsAnalyzer({ logger: createSilentLogger() });

const MARKETPLACE =
  'Quiero un marketplace donde los vendedores publican productos y los clientes hacen pedidos. ' +
  'Necesita login de usuarios, pagos con Stripe, valoraciones de productos y un panel de administración. ' +
  'Esperamos 20.000 usuarios el primer año y debemos cumplir el RGPD.';

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

test('los pagos implican autenticación aunque no se mencione el login', async () => {
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

test('una descripción pobre baja la confianza y genera preguntas abiertas', async () => {
  const model = await analyzer.analyze({ text: 'Una web para mi negocio.' });

  assert.ok(model.confidence < 0.5, `confianza inesperadamente alta: ${model.confidence}`);
  assert.ok(model.openQuestions.length > 0);
  assert.ok(model.openQuestions.some((question) => question.includes('entidades')));
});

test('una descripción rica sube la confianza', async () => {
  const model = await analyzer.analyze({ text: MARKETPLACE });

  assert.ok(model.confidence > 0.7, `confianza inesperadamente baja: ${model.confidence}`);
});

test('nunca devuelve un dominio vacío: cae a una entidad genérica', async () => {
  const model = await analyzer.analyze({ text: 'Algo muy abstracto sin nombres concretos aquí.' });

  assert.equal(model.entities.length, 1);
  assert.equal(model.entities[0]?.name, 'Item');
});

test('el nombre explicito del proyecto gana a la inferencia', async () => {
  const model = await analyzer.analyze({ text: MARKETPLACE, projectName: 'Artesania Viva' });

  assert.equal(model.projectName, 'Artesania Viva');
  assert.equal(model.slug, 'artesania-viva');
});

test('las pistas de capacidades ganan a la detección automática', async () => {
  const model = await analyzer.analyze({
    text: 'Catálogo público de productos, sin cuentas de usuario.',
    hints: { features: { realtime: true } },
  });

  assert.equal(model.features.realtime, true);
});

test('el análisis es reproducible: mismo texto, mismo resultado', async () => {
  const first = await analyzer.analyze({ text: MARKETPLACE });
  const second = await analyzer.analyze({ text: MARKETPLACE });

  assert.deepEqual(first, second);
});

test('un enriquecedor externo puede refinar el análisis deterministico', async () => {
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

test('si el enriquecedor falla se conserva el análisis deterministico', async () => {
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

test('el nombre del proyecto conserva las tildes del enunciado', async () => {
  const model = await analyzer.analyze({
    text: 'Tienda online de cerámica artesanal con catálogo, carrito y pagos por Stripe.',
  });

  assert.equal(model.projectName, 'Cerámica Artesanal');
  // El identificador si va sin tildes: es lo que acaba en rutas y en npm.
  assert.equal(model.slug, 'ceramica-artesanal');
});

test('el nombre tambien conserva la enie', async () => {
  const model = await analyzer.analyze({
    text: 'Plataforma de diseño gráfico para equipos, con proyectos y usuarios.',
  });

  assert.match(model.projectName, /Diseño/);
  assert.equal(model.slug.includes('ñ'), false, 'el slug debe ser ASCII');
});

/**
 * Invariante del analizador: los términos de los léxicos se comparan contra
 * texto NORMALIZADO (sin tildes). Un término acentuado nunca casaría con
 * nada, y el fallo sería silencioso: la capacidad simplemente dejaría de
 * detectarse. Esta prueba lo convierte en un fallo ruidoso.
 */
test('ningún término de los léxicos lleva tildes', () => {
  const sinTilde = (valor: string) =>
    valor.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  const grupos: [string, readonly string[]][] = [
    ['FEATURE_LEXICON', Object.values(FEATURE_LEXICON).flat()],
    ['ACTOR_LEXICON', Object.keys(ACTOR_LEXICON)],
    ['ENTITY_LEXICON', Object.keys(ENTITY_LEXICON)],
    ['ENTITY_TRIGGERS', ENTITY_TRIGGERS],
    ['COMPLIANCE_LEXICON', Object.values(COMPLIANCE_LEXICON).flat()],
    ['INTEGRATION_LEXICON', INTEGRATION_LEXICON],
  ];

  for (const [nombre, terminos] of grupos) {
    for (const termino of terminos) {
      assert.equal(
        termino,
        sinTilde(termino),
        `${nombre}: "${termino}" lleva tildes y nunca casaría con el texto normalizado`,
      );
    }
  }
});

test('ninguna señal de las plantillas lleva tildes', () => {
  const plantillas: [string, typeof ECOMMERCE_RULES][] = [
    ['ecommerce', ECOMMERCE_RULES],
    ['saas', SAAS_RULES],
    ['landing', LANDING_RULES],
  ];

  let comprobados = 0;
  for (const [nombre, reglas] of plantillas) {
    for (const senal of [...reglas.signals, ...(reglas.antiSignals ?? [])]) {
      comprobados += 1;
      assert.equal(
        senal,
        sinTilde(senal),
        `${nombre}: "${senal}" lleva tildes y nunca activaría la plantilla`,
      );
    }
  }
  assert.ok(comprobados > 40, `solo se comprobaron ${comprobados} señales`);
});

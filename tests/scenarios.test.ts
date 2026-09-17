/**
 * Contrato del catalogo de ejemplos.
 *
 * Cada ejemplo de `examples/scenarios.ts` es una promesa: "si escribes esto,
 * obtienes aquello". Estas pruebas la verifican en memoria y en segundos, para
 * que una regresion se detecte al ejecutar `npm test` y no cuando un cliente
 * prueba la demo.
 *
 * El validador (`npm run validate`) hace lo mismo y ademas escribe a disco y
 * ejecuta las pruebas generadas. Este fichero es la version rapida que corre
 * en cada cambio.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import type { GenerationResult } from '@calecosystem/contracts';
import { Entitlements, createKernel, createSilentLogger } from '@calecosystem/core';
import { CodeGenerator, generatorPlugin } from '@calecosystem/generator';
import { optimizerPlugin } from '@calecosystem/optimizer';
import { securityPlugin } from '@calecosystem/security';
import { testerPlugin } from '@calecosystem/tester';
import { documenterPlugin } from '@calecosystem/documenter';
import { SCENARIOS, commandFor, scenarioById } from '../examples/scenarios.ts';

const cache = new Map<string, GenerationResult>();

async function generate(id: string): Promise<GenerationResult> {
  const cached = cache.get(id);
  if (cached) return cached;

  const scenario = scenarioById(id);
  assert.ok(scenario, `ejemplo desconocido: ${id}`);

  const kernel = await createKernel({
    logger: createSilentLogger(),
    entitlements: new Entitlements({ tier: 'enterprise' }),
    plugins: [
      generatorPlugin(),
      optimizerPlugin(),
      securityPlugin(),
      testerPlugin(),
      documenterPlugin(),
    ],
  });

  try {
    const result = await new CodeGenerator({ kernel }).generate({
      text: scenario.brief,
      ...(scenario.framework ? { hints: { frontend: scenario.framework } } : {}),
    });
    cache.set(id, result);
    return result;
  } finally {
    await kernel.dispose();
  }
}

for (const scenario of SCENARIOS) {
  test(`[${scenario.id}] detecta la plantilla esperada`, async () => {
    const result = await generate(scenario.id);

    assert.equal(
      result.template?.kind ?? null,
      scenario.expectTemplate,
      `"${scenario.title}" deberia dar ${scenario.expectTemplate ?? 'ninguna plantilla'}`,
    );
  });

  test(`[${scenario.id}] deduce las capacidades del enunciado`, async () => {
    const result = await generate(scenario.id);
    const features = result.requirements.features as unknown as Record<string, boolean>;

    for (const feature of scenario.expectFeatures) {
      assert.equal(features[feature], true, `no se detecto "${feature}"`);
    }
  });

  test(`[${scenario.id}] entrega los ficheros que promete`, async () => {
    const result = await generate(scenario.id);
    const paths = new Set(result.files.map((file) => file.path));

    for (const expected of scenario.expectFiles) {
      assert.ok(paths.has(expected), `falta "${expected}"`);
    }
  });

  test(`[${scenario.id}] genera un proyecto completo y coherente`, async () => {
    const result = await generate(scenario.id);

    assert.ok(result.metrics.fileCount >= 40, `solo ${result.metrics.fileCount} ficheros`);
    assert.ok(result.metrics.lineCount >= 1000, `solo ${result.metrics.lineCount} lineas`);
    assert.deepEqual(result.dependencyConflicts, [], 'no puede haber choques de version');

    // Todo proyecto llega con arranque, contenedores y documentacion.
    const paths = new Set(result.files.map((file) => file.path));
    assert.ok(paths.has('README.md'));
    assert.ok(paths.has('apps/api/package.json'));
    assert.ok(paths.has('apps/web/package.json'));
    assert.ok(paths.has('docs/ARCHITECTURE.md'));
  });

  test(`[${scenario.id}] entrega pruebas de dominio con el proyecto`, async () => {
    const result = await generate(scenario.id);
    const tests = result.files.filter(
      (file) => file.path.startsWith('apps/api/src/domain/') && file.path.endsWith('.test.ts'),
    );

    assert.ok(tests.length > 0, 'ningun proyecto deberia entregarse sin pruebas');
  });
}

test('el catalogo cubre los tipos de web que se venden', () => {
  const ids = SCENARIOS.map((scenario) => scenario.id);

  for (const expected of ['tienda', 'saas', 'landing', 'panel']) {
    assert.ok(ids.includes(expected), `falta el ejemplo "${expected}"`);
  }
  assert.ok(
    SCENARIOS.some((scenario) => scenario.framework === 'vue'),
    'debe haber un ejemplo en Vue',
  );
  assert.ok(
    SCENARIOS.some((scenario) => scenario.framework === 'angular'),
    'debe haber un ejemplo en Angular',
  );
});

test('cada ejemplo esta descrito para alguien que no programa', () => {
  for (const scenario of SCENARIOS) {
    assert.ok(scenario.title.length > 5, `${scenario.id}: titulo demasiado corto`);
    assert.ok(scenario.audience.length > 15, `${scenario.id}: falta decir para quien es`);
    assert.ok(scenario.brief.length > 120, `${scenario.id}: enunciado poco realista`);
    assert.ok(scenario.expectFiles.length >= 2, `${scenario.id}: promete muy poco`);
  }
});

test('los comandos de ejemplo son copiables tal cual', () => {
  for (const scenario of SCENARIOS) {
    const command = commandFor(scenario);

    assert.match(command, /^npm run calec -- generate "/);
    assert.match(command, /--out \.\/pruebas\//);
    if (scenario.framework) {
      assert.ok(command.includes(`--framework ${scenario.framework}`));
    }
  }
});

test('los identificadores del catalogo son unicos', () => {
  const ids = SCENARIOS.map((scenario) => scenario.id);
  assert.equal(new Set(ids).size, ids.length);
});

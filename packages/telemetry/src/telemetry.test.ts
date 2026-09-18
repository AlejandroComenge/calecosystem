import test from 'node:test';
import assert from 'node:assert/strict';
import { createKernel, createSilentLogger } from '@calecosystem/core';
import { Entitlements } from '@calecosystem/core';
import { CodeGenerator, generatorPlugin } from '@calecosystem/generator';
import { documenterPlugin } from '@calecosystem/documenter';
import { MemorySink, FanOutSink } from './sinks.ts';
import { fingerprint } from './events.ts';
import { telemetryPlugin } from './plugin.ts';

const BRIEF =
  'Tienda online con catálogo de productos, carrito, checkout con pagos y panel de pedidos.';

async function generateWith(sink: MemorySink, includeRequirementText = false) {
  const kernel = await createKernel({
    logger: createSilentLogger(),
    entitlements: new Entitlements({ tier: 'enterprise' }),
    plugins: [
      generatorPlugin(),
      documenterPlugin(),
      telemetryPlugin({ sink, includeRequirementText, tags: { env: 'test' } }),
    ],
  });
  const result = await new CodeGenerator({ kernel }).generate({ text: BRIEF });
  await kernel.dispose();
  return result;
}

test('registra el ciclo de vida completo de una generación', async () => {
  const sink = new MemorySink();
  await generateWith(sink);

  const names = new Set(sink.events.map((event) => event.name));

  assert.ok(names.has('requirements.analyzed'));
  assert.ok(names.has('phase.started'));
  assert.ok(names.has('phase.completed'));
  assert.ok(names.has('module.completed'));
  assert.ok(names.has('generation.completed'));
});

test('mide la duración de las cinco fases', async () => {
  const sink = new MemorySink();
  await generateWith(sink);

  const phases = sink.byName('phase.completed').map((event) => event.properties['phase']);

  assert.deepEqual(phases, ['analyze', 'plan', 'scaffold', 'augment', 'finalize']);
  for (const event of sink.byName('phase.completed')) {
    assert.equal(typeof event.properties['durationMs'], 'number');
  }
});

test('el evento final lleva las métricas que interesan al producto', async () => {
  const sink = new MemorySink();
  const result = await generateWith(sink);

  const [event] = sink.byName('generation.completed');

  assert.ok(event);
  assert.equal(event.properties['files'], result.metrics.fileCount);
  assert.equal(event.properties['lines'], result.metrics.lineCount);
  assert.equal(event.properties['components'], result.metrics.componentCount);
  assert.equal(event.properties['template'], result.template?.id);
  assert.equal(event.properties['frontend'], 'react');
});

test('por defecto NO se registra el texto de los requisitos', async () => {
  const sink = new MemorySink();
  await generateWith(sink);

  const [event] = sink.byName('requirements.analyzed');

  assert.ok(event);
  assert.equal(event.properties['text'], undefined, 'el negocio del cliente no va a telemetría');
  assert.equal(typeof event.properties['fingerprint'], 'string');
  assert.equal(String(event.properties['fingerprint']).length, 16);
});

test('el texto solo se registra si se activa explicitamente', async () => {
  const sink = new MemorySink();
  await generateWith(sink, true);

  const [event] = sink.byName('requirements.analyzed');

  assert.equal(typeof event?.properties['text'], 'string');
});

test('las etiquetas fijas acompañan a cada evento', async () => {
  const sink = new MemorySink();
  await generateWith(sink);

  assert.ok(sink.events.every((event) => event.properties['env'] === 'test'));
});

test('la huella agrupa textos iguales y separa los distintos', () => {
  assert.equal(fingerprint('mismo texto'), fingerprint('mismo texto'));
  assert.notEqual(fingerprint('un texto'), fingerprint('otro texto'));
  assert.equal(fingerprint('x').length, 16);
});

test('la telemetría no altera el resultado de la generación', async () => {
  const conTelemetria = await generateWith(new MemorySink());

  const kernel = await createKernel({
    logger: createSilentLogger(),
    entitlements: new Entitlements({ tier: 'enterprise' }),
    plugins: [generatorPlugin(), documenterPlugin()],
  });
  const sinTelemetria = await new CodeGenerator({ kernel }).generate({ text: BRIEF });
  await kernel.dispose();

  assert.deepEqual(
    conTelemetria.files.map((file) => file.path),
    sinTelemetria.files.map((file) => file.path),
  );
});

test('registra los fallos con su fase, sin filtrar el enunciado', async () => {
  const sink = new MemorySink();
  const kernel = await createKernel({
    logger: createSilentLogger(),
    plugins: [generatorPlugin(), telemetryPlugin({ sink })],
  });

  await assert.rejects(() => new CodeGenerator({ kernel }).generate({ text: 'corto' }));
  await kernel.dispose();

  const [failure] = sink.byName('generation.failed');
  assert.ok(failure);
  assert.equal(failure.properties['phase'], 'analyze');
  assert.equal(failure.properties['errorCode'], 'EMPTY_REQUIREMENTS');
  assert.equal(failure.properties['message'], undefined, 'el mensaje puede llevar datos del cliente');
});

test('FanOutSink reenvia a todos los destinos', async () => {
  const uno = new MemorySink();
  const dos = new MemorySink();
  const fanOut = new FanOutSink([uno, dos]);

  await fanOut.emit({ name: 'prueba', at: new Date().toISOString(), requestId: 'r', properties: {} });

  assert.equal(uno.events.length, 1);
  assert.equal(dos.events.length, 1);
});

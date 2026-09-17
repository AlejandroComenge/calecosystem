import test from 'node:test';
import assert from 'node:assert/strict';
import { HookBus } from './hook-bus.ts';
import { createMemoryLogger, createSilentLogger } from './logger.ts';
import type { Blueprint, RequirementsModel } from '@calecosystem/contracts';

function bus(): HookBus {
  return new HookBus(createSilentLogger());
}

test('los eventos respetan la prioridad y, a igualdad, el orden de registro', async () => {
  const hooks = bus();
  const order: string[] = [];

  hooks.onEvent('pipeline:phase-start', () => void order.push('tarde'), { priority: 200 });
  hooks.onEvent('pipeline:phase-start', () => void order.push('pronto'), { priority: 1 });
  hooks.onEvent('pipeline:phase-start', () => void order.push('normal-a'));
  hooks.onEvent('pipeline:phase-start', () => void order.push('normal-b'));

  await hooks.emit('pipeline:phase-start', { phase: 'analyze' });

  assert.deepEqual(order, ['pronto', 'normal-a', 'normal-b', 'tarde']);
});

test('las transformaciones encadenan el valor de un handler al siguiente', async () => {
  const hooks = bus();
  const base = { projectName: 'Base' } as RequirementsModel;

  hooks.onTransform('requirements:analyzed', (model) => ({ ...model, projectName: 'Paso1' }));
  hooks.onTransform('requirements:analyzed', (model) => ({
    ...model,
    projectName: `${model.projectName}+Paso2`,
  }));

  const result = await hooks.applyTransform('requirements:analyzed', base);

  assert.equal(result.projectName, 'Paso1+Paso2');
});

test('una transformacion asincrona se espera antes de continuar la cadena', async () => {
  const hooks = bus();
  hooks.onTransform('blueprint:planned', async (blueprint) => {
    await new Promise((resolve) => setTimeout(resolve, 1));
    return { ...blueprint, slug: 'async' };
  });
  hooks.onTransform('blueprint:planned', (blueprint) => ({
    ...blueprint,
    slug: `${blueprint.slug}-final`,
  }));

  const result = await hooks.applyTransform('blueprint:planned', { slug: 'inicial' } as Blueprint);

  assert.equal(result.slug, 'async-final');
});

test('una transformacion que no devuelve nada conserva el valor anterior', async () => {
  const { logger, lines } = createMemoryLogger('warn');
  const hooks = new HookBus(logger);
  hooks.onTransform('requirements:analyzed', () => undefined as never, { source: 'plugin-olvidadizo' });

  const result = await hooks.applyTransform('requirements:analyzed', {
    projectName: 'Intacto',
  } as RequirementsModel);

  assert.equal(result.projectName, 'Intacto');
  assert.ok(lines.some((line) => line.includes('plugin-olvidadizo')));
});

test('un evento que lanza no interrumpe a los demas handlers', async () => {
  const { logger, lines } = createMemoryLogger('error');
  const hooks = new HookBus(logger);
  const visited: string[] = [];

  hooks.onEvent('pipeline:phase-end', () => {
    throw new Error('fallo del plugin');
  }, { source: 'plugin-roto', priority: 1 });
  hooks.onEvent('pipeline:phase-end', () => void visited.push('superviviente'));

  await hooks.emit('pipeline:phase-end', { phase: 'plan', durationMs: 1 });

  assert.deepEqual(visited, ['superviviente']);
  assert.ok(lines.some((line) => line.includes('plugin-roto')));
});

test('una transformacion que lanza si detiene el pipeline', async () => {
  const hooks = bus();
  hooks.onTransform('requirements:analyzed', () => {
    throw new Error('blueprint corrupto');
  });

  await assert.rejects(
    () => hooks.applyTransform('requirements:analyzed', {} as RequirementsModel),
    /blueprint corrupto/,
  );
});

test('la baja de un handler lo retira de futuras emisiones', async () => {
  const hooks = bus();
  let calls = 0;
  const unsubscribe = hooks.onEvent('file:emitted', () => void (calls += 1));

  await hooks.emit('file:emitted', { file: { path: 'a', contents: '', producedBy: 't' } });
  unsubscribe();
  await hooks.emit('file:emitted', { file: { path: 'b', contents: '', producedBy: 't' } });

  assert.equal(calls, 1);
});

test('removeBySource retira todos los handlers de un plugin', async () => {
  const hooks = bus();
  hooks.onEvent('file:emitted', () => {}, { source: 'plugin-a' });
  hooks.onTransform('requirements:analyzed', (model) => model, { source: 'plugin-a' });
  hooks.onEvent('file:emitted', () => {}, { source: 'plugin-b' });

  const removed = hooks.removeBySource('plugin-a');

  assert.equal(removed, 2);
  assert.equal(hooks.countHandlers('file:emitted'), 1);
  assert.equal(hooks.countHandlers('requirements:analyzed'), 0);
});

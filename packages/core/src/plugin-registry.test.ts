import test from 'node:test';
import assert from 'node:assert/strict';
import type { Plugin } from '@calecosystem/contracts';
import { assertValidPlugin, resolvePluginOrder } from './plugin-registry.ts';

function plugin(name: string, extra: Partial<Plugin> = {}): Plugin {
  return { name, version: '1.0.0', register: () => {}, ...extra };
}

test('las dependencias declaradas se registran antes que quien las requiere', () => {
  const order = resolvePluginOrder([
    plugin('consumidor', { requires: ['base'] }),
    plugin('base'),
  ]).map((entry) => entry.name);

  assert.deepEqual(order, ['base', 'consumidor']);
});

test('sin dependencias entre si, manda la prioridad y luego el nombre', () => {
  const order = resolvePluginOrder([
    plugin('zeta', { priority: 50 }),
    plugin('alfa', { priority: 50 }),
    plugin('primero', { priority: 1 }),
  ]).map((entry) => entry.name);

  assert.deepEqual(order, ['primero', 'alfa', 'zeta']);
});

test('el orden resuelto es estable entre ejecuciones', () => {
  const plugins = [plugin('c'), plugin('a', { requires: ['b'] }), plugin('b'), plugin('d')];
  const first = resolvePluginOrder(plugins).map((entry) => entry.name);
  const second = resolvePluginOrder([...plugins].reverse()).map((entry) => entry.name);

  assert.deepEqual(first, second);
});

test('una dependencia ausente se rechaza con el nombre de quien la pide', () => {
  assert.throws(
    () => resolvePluginOrder([plugin('consumidor', { requires: ['fantasma'] })]),
    /consumidor.*fantasma/s,
  );
});

test('las dependencias circulares se detectan en lugar de colgar el proceso', () => {
  assert.throws(
    () =>
      resolvePluginOrder([
        plugin('a', { requires: ['b'] }),
        plugin('b', { requires: ['a'] }),
      ]),
    /circulares/i,
  );
});

test('un nombre de plugin duplicado es un error', () => {
  assert.throws(() => resolvePluginOrder([plugin('repetido'), plugin('repetido')]), /dos veces/);
});

test('assertValidPlugin exige nombre, version y funcion de registro', () => {
  assert.throws(() => assertValidPlugin(null), /objeto/);
  assert.throws(() => assertValidPlugin({ version: '1.0.0', register: () => {} }), /name/);
  assert.throws(() => assertValidPlugin({ name: 'x', register: () => {} }), /version/);
  assert.throws(() => assertValidPlugin({ name: 'x', version: '1.0.0' }), /register/);
  assert.doesNotThrow(() => assertValidPlugin(plugin('valido')));
});

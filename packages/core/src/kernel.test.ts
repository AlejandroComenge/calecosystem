import test from 'node:test';
import assert from 'node:assert/strict';
import type { EcosystemModule, ModuleDescriptor, Plugin } from '@calecosystem/contracts';
import { createServiceToken, definePlugin } from '@calecosystem/contracts';
import { EcosystemKernel, createKernel } from './kernel.ts';
import { Entitlements } from './entitlements.ts';
import { createSilentLogger } from './logger.ts';
import { EntitlementError } from './errors.ts';

function fakeModule(kind: ModuleDescriptor['kind'], tier: ModuleDescriptor['tier'] = 'community'): EcosystemModule {
  return {
    descriptor: {
      id: `test/${kind}`,
      kind,
      version: '0.0.1',
      displayName: kind,
      description: 'módulo de prueba',
      tier,
      status: 'preview',
    },
    run: async () => ({
      module: `test/${kind}`,
      kind,
      summary: 'ok',
      findings: [],
      score: 100,
      emittedFiles: [],
      durationMs: 0,
    }),
  };
}

const silent = () => ({ logger: createSilentLogger() });

test('los plugins se registran y quedan listados en el diagnostico', async () => {
  const kernel = await createKernel({
    ...silent(),
    plugins: [definePlugin({ name: 'uno', version: '1.0.0', register: () => {} })],
  });

  assert.ok(kernel.initialized);
  assert.deepEqual(kernel.diagnostics().plugins, [{ name: 'uno', version: '1.0.0' }]);
});

test('un plugin por encima del tier se omite sin romper el arranque', async () => {
  const kernel = await createKernel({
    ...silent(),
    entitlements: new Entitlements({ tier: 'community' }),
    plugins: [
      definePlugin({ name: 'gratis', version: '1.0.0', register: () => {} }),
      definePlugin({ name: 'de-pago', version: '1.0.0', tier: 'enterprise', register: () => {} }),
    ],
  });

  const diagnostics = kernel.diagnostics();
  assert.deepEqual(diagnostics.plugins.map((plugin) => plugin.name), ['gratis']);
  assert.equal(diagnostics.skippedPlugins.length, 1);
  assert.match(diagnostics.skippedPlugins[0]?.reason ?? '', /enterprise/);
});

test('con strictEntitlements un plugin de pago aborta el arranque', async () => {
  const kernel = new EcosystemKernel({
    ...silent(),
    strictEntitlements: true,
    entitlements: new Entitlements({ tier: 'community' }),
  });
  kernel.use(definePlugin({ name: 'de-pago', version: '1.0.0', tier: 'pro', register: () => {} }));

  await assert.rejects(() => kernel.init(), EntitlementError);
});

test('los módulos se resuelven por tipo y en el orden canonico de la fase augment', async () => {
  const kernel = await createKernel({
    ...silent(),
    plugins: [
      definePlugin({
        name: 'modulos',
        version: '1.0.0',
        register: (api) => {
          // Registrados a propósito en desorden.
          api.registerModule(fakeModule('documenter'));
          api.registerModule(fakeModule('optimizer'));
          api.registerModule(fakeModule('tester'));
          api.registerModule(fakeModule('security'));
        },
      }),
    ],
  });

  assert.deepEqual(
    kernel.augmentModules().map((module) => module.descriptor.kind),
    ['optimizer', 'security', 'tester', 'documenter'],
  );
  assert.ok(kernel.hasModule('security'));
  assert.equal(kernel.hasModule('generator'), false);
});

test('registrar dos veces el mismo módulo es un error', async () => {
  const kernel = new EcosystemKernel(silent());
  kernel.use(
    definePlugin({
      name: 'duplicador',
      version: '1.0.0',
      register: (api) => {
        api.registerModule(fakeModule('tester'));
        api.registerModule(fakeModule('tester'));
      },
    }),
  );

  await assert.rejects(() => kernel.init(), /ya está registrado/);
});

test('un módulo por encima del tier no se puede registrar', async () => {
  const kernel = new EcosystemKernel({
    ...silent(),
    entitlements: new Entitlements({ tier: 'community' }),
  });
  kernel.use(
    definePlugin({
      name: 'contrabandista',
      version: '1.0.0',
      register: (api) => api.registerModule(fakeModule('optimizer', 'enterprise')),
    }),
  );

  await assert.rejects(() => kernel.init(), /enterprise/);
});

test('un plugin pública un servicio y otro lo consume', async () => {
  const token = createServiceToken<{ saluda(): string }>('test.saludador');
  let received = '';

  await createKernel({
    ...silent(),
    plugins: [
      definePlugin({
        name: 'proveedor',
        version: '1.0.0',
        register: (api) => api.provide(token, { saluda: () => 'hola' }),
      }),
      definePlugin({
        name: 'consumidor',
        version: '1.0.0',
        requires: ['proveedor'],
        register: (api) => {
          received = api.resolve(token)?.saluda() ?? 'nada';
        },
      }),
    ],
  });

  assert.equal(received, 'hola');
});

test('las opciones de configuración llegan al plugin correspondiente', async () => {
  let seen: unknown;
  await createKernel({
    ...silent(),
    pluginOptions: { configurable: { modo: 'estricto' } },
    plugins: [
      definePlugin({
        name: 'configurable',
        version: '1.0.0',
        register: (api) => {
          seen = api.options['modo'];
        },
      }),
    ],
  });

  assert.equal(seen, 'estricto');
});

test('dispose libera en orden inverso y deja el kernel reutilizable', async () => {
  const disposed: string[] = [];
  const build = (name: string, requires?: string[]): Plugin =>
    definePlugin({
      name,
      version: '1.0.0',
      ...(requires ? { requires } : {}),
      register: () => {},
      dispose: () => void disposed.push(name),
    });

  const kernel = await createKernel({ ...silent(), plugins: [build('base'), build('encima', ['base'])] });
  await kernel.dispose();

  assert.deepEqual(disposed, ['encima', 'base']);
  assert.equal(kernel.initialized, false);
  assert.deepEqual(kernel.diagnostics().plugins, []);
});

test('no se pueden añadir plugins después de inicializar', async () => {
  const kernel = await createKernel(silent());

  assert.throws(
    () => kernel.use(definePlugin({ name: 'tardio', version: '1.0.0', register: () => {} })),
    /ya está inicializado/,
  );
});

test('un plugin que falla al registrarse identifica al culpable', async () => {
  const kernel = new EcosystemKernel(silent());
  kernel.use(
    definePlugin({
      name: 'defectuoso',
      version: '1.0.0',
      register: () => {
        throw new Error('config invalida');
      },
    }),
  );

  await assert.rejects(() => kernel.init(), /defectuoso.*config invalida/s);
});

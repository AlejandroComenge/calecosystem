import test from 'node:test';
import assert from 'node:assert/strict';
import type { GenerationContext, GenerationResult, Principal } from '@calecosystem/contracts';
import { createSilentLogger } from '@calecosystem/core';
import { MemoryUsageStore } from './stores.ts';
import { QuotaGuard } from './quota-guard.ts';
import { QuotaExceededError, quotaMiddleware } from './middleware.ts';

const community: Principal = { userId: 'ana', tier: 'community' };

const RESULT = {
  blueprint: { slug: 'tienda' },
  metrics: { fileCount: 100, lineCount: 3000 },
  reports: [{ kind: 'security' }, { kind: 'tester' }],
  template: { id: 'calec.template.ecommerce' },
} as unknown as GenerationResult;

function context(principal?: Principal): GenerationContext {
  return {
    input: { text: 'una descripcion suficientemente larga para el analizador' },
    ...(principal ? { principal } : {}),
    logger: createSilentLogger(),
    requestId: 'req-1',
    state: new Map<string, unknown>(),
  };
}

function setup() {
  const store = new MemoryUsageStore();
  const guard = new QuotaGuard({ store });
  return { store, guard, middleware: quotaMiddleware({ guard }) };
}

test('deja pasar cuando queda cuota y registra el consumo despues', async () => {
  const { guard, middleware } = setup();

  const result = await middleware.handler(context(community), async () => RESULT);

  assert.equal(result, RESULT);
  const decision = await guard.check(community, 'generation');
  assert.equal(decision.used, 1, 'una generacion con exito consume cuota');
});

test('registra tambien el consumo de los modulos de ampliacion', async () => {
  const { guard, middleware } = setup();

  await middleware.handler(context(community), async () => RESULT);

  const modules = await guard.check(community, 'module-run');
  assert.equal(modules.used, 2, 'un informe por modulo ejecutado');
});

test('rechaza antes de generar cuando la cuota esta agotada', async () => {
  const { guard, middleware } = setup();
  for (let index = 0; index < 10; index += 1) {
    await guard.record(community, 'generation');
  }
  let coreRan = false;

  await assert.rejects(
    () =>
      middleware.handler(context(community), async () => {
        coreRan = true;
        return RESULT;
      }),
    (error: unknown) => {
      assert.ok(error instanceof QuotaExceededError);
      assert.equal(error.code, 'QUOTA_EXCEEDED');
      assert.equal(error.details['upgradeTo'], 'pro');
      return true;
    },
  );

  assert.equal(coreRan, false, 'no se debe gastar trabajo en una peticion rechazada');
});

test('una generacion fallida no consume cuota', async () => {
  const { guard, middleware } = setup();

  await assert.rejects(() =>
    middleware.handler(context(community), async () => {
      throw new Error('el analizador fallo');
    }),
  );

  const decision = await guard.check(community, 'generation');
  assert.equal(decision.used, 0, 'no se cobra por un error propio');
});

test('sin usuario identificado se deja pasar por defecto', async () => {
  const { middleware } = setup();

  const result = await middleware.handler(context(), async () => RESULT);

  assert.equal(result, RESULT);
});

test('con requirePrincipal, generar sin usuario se rechaza', async () => {
  const store = new MemoryUsageStore();
  const middleware = quotaMiddleware({
    guard: new QuotaGuard({ store }),
    requirePrincipal: true,
  });

  await assert.rejects(
    () => middleware.handler(context(), async () => RESULT),
    QuotaExceededError,
  );
});

test('la decision de cuota queda en el estado compartido', async () => {
  const { middleware } = setup();
  const ctx = context(community);

  await middleware.handler(ctx, async () => RESULT);

  const decision = ctx.state.get('quota.decision') as { limit: number };
  assert.equal(decision.limit, 10);
});

test('el middleware es el mas externo de la cadena', () => {
  const { middleware } = setup();
  assert.equal(middleware.name, 'billing:quota');
  assert.ok((middleware.priority ?? 100) < 100, 'debe rechazar antes que nada');
});

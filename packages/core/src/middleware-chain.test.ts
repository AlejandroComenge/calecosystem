import test from 'node:test';
import assert from 'node:assert/strict';
import type { GenerationContext, GenerationResult } from '@calecosystem/contracts';
import { MiddlewareChain, defineMiddleware } from './middleware-chain.ts';
import { createSilentLogger } from './logger.ts';

const RESULT = { requestId: 'r-1' } as GenerationResult;

function context(): GenerationContext {
  return {
    input: { text: 'una descripcion de prueba suficientemente larga' },
    logger: createSilentLogger(),
    requestId: 'r-1',
    state: new Map<string, unknown>(),
  };
}

test('el middleware de menor prioridad envuelve a los demas', async () => {
  const chain = new MiddlewareChain();
  const order: string[] = [];

  chain.register(
    defineMiddleware('externo', async (_ctx, next) => {
      order.push('externo:antes');
      const result = await next();
      order.push('externo:despues');
      return result;
    }, 10),
  );
  chain.register(
    defineMiddleware('interno', async (_ctx, next) => {
      order.push('interno:antes');
      const result = await next();
      order.push('interno:despues');
      return result;
    }, 50),
  );

  await chain.run(context(), async () => {
    order.push('nucleo');
    return RESULT;
  });

  assert.deepEqual(order, [
    'externo:antes',
    'interno:antes',
    'nucleo',
    'interno:despues',
    'externo:despues',
  ]);
});

test('un middleware que no llama a next corta la ejecucion', async () => {
  const chain = new MiddlewareChain();
  let coreRan = false;

  chain.register(defineMiddleware('cortafuegos', async () => RESULT, 10));
  chain.register(
    defineMiddleware('nunca-llega', async (_ctx, next) => {
      coreRan = true;
      return next();
    }, 20),
  );

  const result = await chain.run(context(), async () => {
    coreRan = true;
    return RESULT;
  });

  assert.equal(result, RESULT);
  assert.equal(coreRan, false, 'nada posterior debe ejecutarse');
});

test('un middleware que lanza propaga el error', async () => {
  const chain = new MiddlewareChain();
  chain.register(
    defineMiddleware('cuota', async () => {
      throw new Error('cuota agotada');
    }),
  );

  await assert.rejects(() => chain.run(context(), async () => RESULT), /cuota agotada/);
});

test('llamar dos veces a next es un error, no una generacion duplicada', async () => {
  const chain = new MiddlewareChain();
  chain.register(
    defineMiddleware('defectuoso', async (_ctx, next) => {
      await next();
      return next();
    }),
  );

  await assert.rejects(
    () => chain.run(context(), async () => RESULT),
    /mas de una vez/,
  );
});

test('el estado compartido viaja entre middlewares', async () => {
  const chain = new MiddlewareChain();
  let seen: unknown;

  chain.register(
    defineMiddleware('escritor', async (ctx, next) => {
      ctx.state.set('clave', 'valor');
      return next();
    }, 10),
  );
  chain.register(
    defineMiddleware('lector', async (ctx, next) => {
      seen = ctx.state.get('clave');
      return next();
    }, 20),
  );

  await chain.run(context(), async () => RESULT);

  assert.equal(seen, 'valor');
});

test('sin middlewares se ejecuta el nucleo directamente', async () => {
  const chain = new MiddlewareChain();
  assert.equal(await chain.run(context(), async () => RESULT), RESULT);
  assert.equal(chain.size, 0);
});

test('removeByName retira todos los middlewares de una fuente', () => {
  const chain = new MiddlewareChain();
  chain.register(defineMiddleware('plugin-a', async (_ctx, next) => next()));
  chain.register(defineMiddleware('plugin-a', async (_ctx, next) => next()));
  chain.register(defineMiddleware('plugin-b', async (_ctx, next) => next()));

  assert.equal(chain.removeByName('plugin-a'), 2);
  assert.deepEqual(chain.names(), ['plugin-b']);
});

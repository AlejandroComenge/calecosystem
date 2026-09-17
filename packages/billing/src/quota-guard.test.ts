import test from 'node:test';
import assert from 'node:assert/strict';
import type { Principal } from '@calecosystem/contracts';
import { MemoryUsageStore } from './stores.ts';
import { QuotaGuard } from './quota-guard.ts';
import { DEFAULT_QUOTAS, nextTierFor, periodReset, periodStart, policyFor } from './quotas.ts';

const community: Principal = { userId: 'ana', tier: 'community' };
const pro: Principal = { userId: 'luis', tier: 'pro' };
const enterprise: Principal = { userId: 'org', tier: 'enterprise' };

function guardWith(now = new Date('2026-03-15T12:00:00Z')) {
  const store = new MemoryUsageStore();
  return { store, guard: new QuotaGuard({ store, now: () => now }) };
}

test('el plan gratuito permite generar hasta su limite', async () => {
  const { guard } = guardWith();
  const decision = await guard.check(community, 'generation');

  assert.equal(decision.allowed, true);
  assert.equal(decision.limit, 10);
  assert.equal(decision.used, 0);
  assert.equal(decision.remaining, 10);
});

test('el consumo registrado reduce lo que queda', async () => {
  const { guard } = guardWith();
  for (let index = 0; index < 4; index += 1) {
    await guard.record(community, 'generation');
  }

  const decision = await guard.check(community, 'generation');

  assert.equal(decision.used, 4);
  assert.equal(decision.remaining, 6);
  assert.equal(decision.allowed, true);
});

test('al agotar la cuota se deniega y se propone el plan que la levanta', async () => {
  const { guard } = guardWith();
  for (let index = 0; index < 10; index += 1) {
    await guard.record(community, 'generation');
  }

  const decision = await guard.check(community, 'generation');

  assert.equal(decision.allowed, false);
  assert.equal(decision.remaining, 0);
  assert.equal(decision.upgradeTo, 'pro');
  assert.match(decision.reason ?? '', /pro/);
});

test('un plan sin limite nunca deniega', async () => {
  const { guard } = guardWith();
  for (let index = 0; index < 500; index += 1) {
    await guard.record(enterprise, 'generation');
  }

  const decision = await guard.check(enterprise, 'generation');

  assert.equal(decision.allowed, true);
  assert.equal(decision.limit, null);
  assert.equal(decision.remaining, null);
  assert.equal(decision.upgradeTo, undefined, 'no hay plan superior que ofrecer');
});

test('el consumo de un usuario no afecta al de otro', async () => {
  const { guard } = guardWith();
  for (let index = 0; index < 10; index += 1) {
    await guard.record(community, 'generation');
  }

  const otro = await guard.check({ userId: 'otra-persona', tier: 'community' }, 'generation');

  assert.equal(otro.used, 0);
  assert.equal(otro.allowed, true);
});

test('el contador mensual solo cuenta el mes en curso', async () => {
  const store = new MemoryUsageStore();
  const marzo = new QuotaGuard({ store, now: () => new Date('2026-03-20T10:00:00Z') });
  const abril = new QuotaGuard({ store, now: () => new Date('2026-04-02T10:00:00Z') });

  for (let index = 0; index < 10; index += 1) {
    await marzo.record(community, 'generation');
  }

  assert.equal((await marzo.check(community, 'generation')).allowed, false);
  assert.equal((await abril.check(community, 'generation')).allowed, true, 'el mes nuevo reinicia');
});

test('los proyectos se cuentan de forma acumulada, no mensual', async () => {
  const store = new MemoryUsageStore();
  const enero = new QuotaGuard({ store, now: () => new Date('2026-01-10T00:00:00Z') });
  const junio = new QuotaGuard({ store, now: () => new Date('2026-06-10T00:00:00Z') });

  for (let index = 0; index < 3; index += 1) {
    await enero.record(community, 'project');
  }

  const decision = await junio.check(community, 'project');
  assert.equal(decision.period, 'total');
  assert.equal(decision.used, 3);
  assert.equal(decision.allowed, false, 'el limite total no se reinicia con el mes');
});

test('summary devuelve el estado de todas las operaciones sin consumir', async () => {
  const { guard } = guardWith();
  await guard.record(community, 'generation');

  const summary = await guard.summary(community);
  const generation = summary.find((decision) => decision.operation === 'generation');

  assert.equal(summary.length, 4);
  assert.equal(generation?.used, 1, 'consultar no debe sumar consumo');
  assert.ok(summary.every((decision) => decision.allowed));
});

test('una operacion sin politica definida se permite', async () => {
  const store = new MemoryUsageStore();
  const guard = new QuotaGuard({ store, quotas: [{ tier: 'community', policies: [] }] });

  const decision = await guard.check(community, 'generation');

  assert.equal(decision.allowed, true);
  assert.match(decision.reason ?? '', /Sin politica/);
});

test('nextTierFor encuentra el primer plan que amplia el limite', () => {
  assert.equal(nextTierFor('community', 'generation'), 'pro');
  assert.equal(nextTierFor('pro', 'generation'), 'enterprise');
  assert.equal(nextTierFor('enterprise', 'generation'), undefined);
});

test('las ventanas de periodo se calculan en UTC', () => {
  const now = new Date('2026-03-15T23:30:00Z');

  assert.equal(periodStart('month', now)?.toISOString(), '2026-03-01T00:00:00.000Z');
  assert.equal(periodStart('day', now)?.toISOString(), '2026-03-15T00:00:00.000Z');
  assert.equal(periodStart('total', now), null);
  assert.equal(periodReset('month', now), '2026-04-01T00:00:00.000Z');
  assert.equal(periodReset('total', now), null);
});

test('el catalogo por defecto cubre los tres planes', () => {
  for (const tier of ['community', 'pro', 'enterprise'] as const) {
    assert.ok(policyFor(tier, 'generation', DEFAULT_QUOTAS), `falta politica para ${tier}`);
  }
  assert.equal(policyFor('pro', 'generation')?.limit, 200);
});

test('el plan Pro tiene margen holgado frente al gratuito', async () => {
  const { guard } = guardWith();
  const gratuito = await guard.check(community, 'generation');
  const pagado = await guard.check(pro, 'generation');

  assert.ok((pagado.limit ?? 0) > (gratuito.limit ?? 0));
});

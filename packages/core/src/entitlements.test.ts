import test from 'node:test';
import assert from 'node:assert/strict';
import { Entitlements } from './entitlements.ts';
import { EntitlementError } from './errors.ts';

test('un tier cubre a todos los inferiores', () => {
  const enterprise = new Entitlements({ tier: 'enterprise' });

  assert.ok(enterprise.allows('community'));
  assert.ok(enterprise.allows('pro'));
  assert.ok(enterprise.allows('enterprise'));
});

test('un tier no cubre a los superiores', () => {
  const community = new Entitlements({ tier: 'community' });

  assert.ok(community.allows('community'));
  assert.equal(community.allows('pro'), false);
  assert.equal(community.allows('enterprise'), false);
});

test('una licencia caducada degrada a community', () => {
  const expired = new Entitlements({ tier: 'enterprise', expiresAt: '2020-01-01T00:00:00Z' });

  assert.ok(expired.expired);
  assert.equal(expired.effectiveTier, 'community');
  assert.equal(expired.allows('pro'), false);
});

test('una licencia con fecha futura sigue vigente', () => {
  const valid = new Entitlements({ tier: 'pro', expiresAt: '2999-01-01T00:00:00Z' });

  assert.equal(valid.expired, false);
  assert.equal(valid.effectiveTier, 'pro');
});

test('assert explica que plan falta y cual está activo', () => {
  const community = new Entitlements();

  assert.throws(
    () => community.assert('enterprise', '@calecosystem/optimizer'),
    (error: unknown) => {
      assert.ok(error instanceof EntitlementError);
      assert.equal(error.code, 'ENTITLEMENT_REQUIRED');
      assert.match(error.message, /enterprise/);
      assert.match(error.message, /community/);
      return true;
    },
  );
});

test('fromEnvironment lee el tier y cae a community con un valor invalido', () => {
  assert.equal(Entitlements.fromEnvironment({ CALEC_LICENSE_TIER: 'pro' }).tier, 'pro');
  assert.equal(Entitlements.fromEnvironment({ CALEC_LICENSE_TIER: 'diamante' }).tier, 'community');
  assert.equal(Entitlements.fromEnvironment({}).tier, 'community');
});

test('las capacidades sueltas son independientes del tier', () => {
  const piloto = new Entitlements({ tier: 'community', features: ['beta-optimizer'] });

  assert.ok(piloto.hasFeature('beta-optimizer'));
  assert.equal(piloto.hasFeature('otra-cosa'), false);
});

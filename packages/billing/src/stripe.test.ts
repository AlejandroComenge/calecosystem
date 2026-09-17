import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { DEFAULT_PLANS, StripeBillingProvider, StripeError } from './stripe.ts';

const WEBHOOK_SECRET = 'whsec_secreto_de_prueba';

function provider(fetchImpl?: typeof fetch) {
  return new StripeBillingProvider({
    secretKey: 'sk_test_clave',
    webhookSecret: WEBHOOK_SECRET,
    plans: DEFAULT_PLANS.map((plan) =>
      plan.tier === 'pro' ? { ...plan, priceId: 'price_pro_mensual' } : plan,
    ),
    ...(fetchImpl ? { fetchImpl } : {}),
  });
}

/** Firma un cuerpo igual que lo haria Stripe. */
function sign(payload: string, secret = WEBHOOK_SECRET, timestamp = Math.floor(Date.now() / 1000)) {
  const signature = createHmac('sha256', secret).update(`${timestamp}.${payload}`, 'utf8').digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

/* --- Verificacion de webhooks ---------------------------------------- */

test('acepta una firma valida y reciente', () => {
  const payload = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed' });

  assert.deepEqual(provider().verifyWebhook(payload, sign(payload)), { valid: true });
});

test('rechaza un cuerpo manipulado aunque la firma sea autentica', () => {
  const original = JSON.stringify({ id: 'evt_1', amount: 100 });
  const header = sign(original);
  const manipulado = JSON.stringify({ id: 'evt_1', amount: 999_999 });

  const verification = provider().verifyWebhook(manipulado, header);

  assert.equal(verification.valid, false);
  assert.match(verification.reason ?? '', /firma no coincide/i);
});

test('rechaza una firma hecha con otro secreto', () => {
  const payload = JSON.stringify({ id: 'evt_1' });

  const verification = provider().verifyWebhook(payload, sign(payload, 'whsec_otro'));

  assert.equal(verification.valid, false);
});

test('rechaza un evento antiguo aunque la firma sea correcta', () => {
  const payload = JSON.stringify({ id: 'evt_1' });
  const haceUnaHora = Math.floor(Date.now() / 1000) - 3600;

  const verification = provider().verifyWebhook(payload, sign(payload, WEBHOOK_SECRET, haceUnaHora));

  assert.equal(verification.valid, false, 'una firma capturada no puede reutilizarse');
  assert.match(verification.reason ?? '', /tolerancia/i);
});

test('rechaza cabeceras incompletas o mal formadas', () => {
  const payload = '{}';

  assert.equal(provider().verifyWebhook(payload, '').valid, false);
  assert.equal(provider().verifyWebhook(payload, 'v1=abc').valid, false);
  assert.equal(provider().verifyWebhook(payload, 't=no-es-numero,v1=abc').valid, false);
});

test('una firma de longitud distinta se rechaza sin lanzar', () => {
  const payload = '{}';
  const timestamp = Math.floor(Date.now() / 1000);

  const verification = provider().verifyWebhook(payload, `t=${timestamp},v1=corta`);

  assert.equal(verification.valid, false);
});

/* --- Normalizacion de eventos ---------------------------------------- */

test('traduce un pago completado a un cambio de plan', () => {
  const payload = JSON.stringify({
    id: 'evt_2',
    type: 'checkout.session.completed',
    created: 1_800_000_000,
    data: { object: { metadata: { userId: 'ana', tier: 'pro', organizationId: 'org-1' } } },
  });

  const event = provider().parseWebhook(payload);

  assert.equal(event.kind, 'checkout.completed');
  assert.equal(event.userId, 'ana');
  assert.equal(event.organizationId, 'org-1');
  assert.equal(event.tier, 'pro');
});

test('una cancelacion degrada a community en lugar de bloquear la cuenta', () => {
  const payload = JSON.stringify({
    id: 'evt_3',
    type: 'customer.subscription.deleted',
    data: { object: { metadata: { userId: 'ana' } } },
  });

  const event = provider().parseWebhook(payload);

  assert.equal(event.kind, 'subscription.cancelled');
  assert.equal(event.tier, 'community');
});

test('un tipo de evento desconocido no rompe el procesamiento', () => {
  const payload = JSON.stringify({ id: 'evt_4', type: 'radar.early_fraud_warning.created', data: {} });

  const event = provider().parseWebhook(payload);

  assert.equal(event.kind, 'unknown');
  assert.equal(event.tier, null);
  assert.equal(event.userId, null);
});

/* --- Sesion de pago --------------------------------------------------- */

test('crea la sesion de pago con los metadatos necesarios', async () => {
  let capturedBody = '';
  let capturedAuth = '';

  const fake = (async (_url: string, init: RequestInit) => {
    capturedBody = String(init.body);
    capturedAuth = String((init.headers as Record<string, string>)['Authorization']);
    return new Response(JSON.stringify({ id: 'cs_1', url: 'https://pago.stripe.com/cs_1' }), {
      status: 200,
    });
  }) as unknown as typeof fetch;

  const session = await provider(fake).createCheckoutSession({
    principal: { userId: 'ana' },
    targetTier: 'pro',
    successUrl: 'https://app.example/ok',
    cancelUrl: 'https://app.example/no',
  });

  assert.equal(session.url, 'https://pago.stripe.com/cs_1');
  assert.equal(session.targetTier, 'pro');
  assert.match(capturedAuth, /^Bearer sk_test_/);
  // Sin metadatos, el webhook no sabria a quien subir de plan.
  assert.match(capturedBody, /metadata%5BuserId%5D=ana/);
  assert.match(capturedBody, /metadata%5Btier%5D=pro/);
  assert.match(capturedBody, /line_items%5B0%5D%5Bprice%5D=price_pro_mensual/);
});

test('un plan sin precio configurado falla con un mensaje accionable', async () => {
  await assert.rejects(
    () =>
      provider().createCheckoutSession({
        principal: { userId: 'ana' },
        targetTier: 'enterprise',
        successUrl: 'https://app.example/ok',
        cancelUrl: 'https://app.example/no',
      }),
    /no tiene precio en Stripe/,
  );
});

test('un error de Stripe se propaga con su mensaje y su codigo', async () => {
  const fake = (async () =>
    new Response(JSON.stringify({ error: { message: 'No such price' } }), {
      status: 400,
    })) as unknown as typeof fetch;

  await assert.rejects(
    () =>
      provider(fake).createCheckoutSession({
        principal: { userId: 'ana' },
        targetTier: 'pro',
        successUrl: 'https://app.example/ok',
        cancelUrl: 'https://app.example/no',
      }),
    (error: unknown) => {
      assert.ok(error instanceof StripeError);
      assert.equal(error.status, 400);
      assert.match(error.message, /No such price/);
      return true;
    },
  );
});

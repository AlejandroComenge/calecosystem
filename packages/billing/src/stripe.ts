import { createHmac, timingSafeEqual } from 'node:crypto';
import type {
  BillingEvent,
  BillingEventKind,
  BillingProvider,
  CheckoutRequest,
  CheckoutSession,
  PlanDefinition,
  Tier,
  WebhookVerification,
} from '@calecosystem/contracts';

const STRIPE_API = 'https://api.stripe.com/v1';

/** Catálogo por defecto, alineado con `docs/pricing.md`. */
export const DEFAULT_PLANS: readonly PlanDefinition[] = [
  {
    tier: 'community',
    name: 'Community',
    amount: 0,
    currency: 'eur',
    interval: 'month',
    priceId: null,
    highlights: ['Generador', 'Documentador', '10 generaciones al mes', '3 proyectos'],
  },
  {
    tier: 'pro',
    name: 'Pro',
    amount: 4900,
    currency: 'eur',
    interval: 'month',
    priceId: null,
    highlights: [
      'Todo lo de Community',
      'Optimizador, auditor y testeador',
      '200 generaciones al mes',
      'Proyectos ilimitados',
    ],
  },
  {
    tier: 'enterprise',
    name: 'Enterprise',
    amount: 150_000,
    currency: 'eur',
    interval: 'month',
    priceId: null,
    highlights: ['Todo lo de Pro', 'Plugins privados', 'SSO', 'On-premise', 'SLA'],
  },
];

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface StripeProviderOptions {
  readonly secretKey: string;
  readonly webhookSecret: string;
  readonly plans?: readonly PlanDefinition[];
  /** Inyectable para poder probar sin salir a la red. */
  readonly fetchImpl?: FetchLike;
  /** Tolerancia de la marca de tiempo del webhook, en segundos. */
  readonly toleranceSeconds?: number;
}

export class StripeError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'StripeError';
    this.status = status;
  }
}

/**
 * Integración básica con Stripe.
 *
 * Alcance: crear la sesión de pago para subir de plan y verificar los webhooks
 * que confirman el cambio. Es el mínimo que hace falta para cobrar; no cubre
 * prorrateos, impuestos ni portal del cliente.
 *
 * Se habla con la API REST directamente y no con el SDK oficial para no
 * introducir una dependencia de ejecución en un ecosistema que hoy no tiene
 * ninguna. El precio es tener que codificar los cuerpos a mano; a cambio, la
 * superficie que auditar es esta clase y nada más.
 */
export class StripeBillingProvider implements BillingProvider {
  readonly id = 'stripe';
  readonly plans: readonly PlanDefinition[];

  readonly #secretKey: string;
  readonly #webhookSecret: string;
  readonly #fetch: FetchLike;
  readonly #tolerance: number;

  constructor(options: StripeProviderOptions) {
    this.#secretKey = options.secretKey;
    this.#webhookSecret = options.webhookSecret;
    this.plans = options.plans ?? DEFAULT_PLANS;
    this.#fetch = options.fetchImpl ?? ((url, init) => fetch(url, init));
    this.#tolerance = options.toleranceSeconds ?? 300;
  }

  planFor(tier: Tier): PlanDefinition | undefined {
    return this.plans.find((plan) => plan.tier === tier);
  }

  async createCheckoutSession(request: CheckoutRequest): Promise<CheckoutSession> {
    const plan = this.planFor(request.targetTier);
    if (!plan) {
      throw new StripeError(400, `No hay plan configurado para el tier "${request.targetTier}".`);
    }
    if (!plan.priceId) {
      throw new StripeError(
        400,
        `El plan "${plan.name}" no tiene precio en Stripe. ` +
          'Configura `priceId` antes de permitir el cambio a este plan.',
      );
    }

    const body = new URLSearchParams({
      mode: 'subscription',
      success_url: request.successUrl,
      cancel_url: request.cancelUrl,
      'line_items[0][price]': plan.priceId,
      'line_items[0][quantity]': String(request.quantity ?? 1),
      // Los metadatos son como el webhook sabra a quien subir de plan: sin
      // esto, un pago confirmado no se puede asociar a ninguna cuenta.
      'metadata[userId]': request.principal.userId,
      'metadata[tier]': request.targetTier,
      ...(request.principal.organizationId
        ? { 'metadata[organizationId]': request.principal.organizationId }
        : {}),
      ...(request.customerEmail ? { customer_email: request.customerEmail } : {}),
    });

    const response = await this.#fetch(`${STRIPE_API}/checkout/sessions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.#secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    const payload = (await response.json()) as Record<string, unknown>;
    if (!response.ok) {
      const error = payload['error'] as { message?: string } | undefined;
      throw new StripeError(response.status, error?.message ?? 'Stripe rechazo la petición.');
    }

    return {
      id: String(payload['id']),
      url: String(payload['url']),
      targetTier: request.targetTier,
      provider: this.id,
      ...(typeof payload['expires_at'] === 'number'
        ? { expiresAt: new Date(payload['expires_at'] * 1000).toISOString() }
        : {}),
    };
  }

  /**
   * Verifica la firma del webhook según el esquema de Stripe.
   *
   * La cabecera es `t=<marca>,v1=<firma>` y se firma `<marca>.<cuerpo>` con
   * HMAC-SHA256. Se comprueban las dos cosas:
   *
   *  - la firma, con comparación de tiempo constante, porque una comparación
   *    normal filtra el valor correcto byte a byte;
   *  - la marca de tiempo, porque una firma válida capturada ayer sigue siendo
   *    valida hoy si nadie mira la hora (ataque de repetición).
   */
  verifyWebhook(payload: string, signatureHeader: string): WebhookVerification {
    const parts = new Map<string, string>();
    for (const segment of signatureHeader.split(',')) {
      const [key, value] = segment.split('=', 2);
      if (key && value) parts.set(key.trim(), value.trim());
    }

    const timestamp = parts.get('t');
    const signature = parts.get('v1');
    if (!timestamp || !signature) {
      return { valid: false, reason: 'Cabecera de firma incompleta: faltan `t` o `v1`.' };
    }

    const timestampSeconds = Number.parseInt(timestamp, 10);
    if (!Number.isFinite(timestampSeconds)) {
      return { valid: false, reason: 'Marca de tiempo no numérica.' };
    }

    const ageSeconds = Math.abs(Date.now() / 1000 - timestampSeconds);
    if (ageSeconds > this.#tolerance) {
      return {
        valid: false,
        reason: `Evento fuera de la ventana de tolerancia (${Math.round(ageSeconds)}s > ${this.#tolerance}s).`,
      };
    }

    const expected = createHmac('sha256', this.#webhookSecret)
      .update(`${timestamp}.${payload}`, 'utf8')
      .digest('hex');

    if (!safeEqualHex(expected, signature)) {
      return { valid: false, reason: 'La firma no coincide.' };
    }
    return { valid: true };
  }

  parseWebhook(payload: string): BillingEvent {
    const event = JSON.parse(payload) as Record<string, unknown>;
    const data = (event['data'] as { object?: Record<string, unknown> } | undefined)?.object ?? {};
    const metadata = (data['metadata'] as Record<string, string> | undefined) ?? {};
    const type = String(event['type'] ?? '');

    const kind = mapEventKind(type);
    const tier = resolveTier(kind, metadata['tier']);

    return {
      id: String(event['id'] ?? ''),
      kind,
      userId: metadata['userId'] ?? null,
      organizationId: metadata['organizationId'] ?? null,
      tier,
      occurredAt:
        typeof event['created'] === 'number'
          ? new Date(event['created'] * 1000).toISOString()
          : new Date().toISOString(),
      raw: event,
    };
  }
}

function mapEventKind(type: string): BillingEventKind {
  switch (type) {
    case 'checkout.session.completed':
      return 'checkout.completed';
    case 'customer.subscription.updated':
      return 'subscription.updated';
    case 'customer.subscription.deleted':
      return 'subscription.cancelled';
    case 'invoice.payment_failed':
      return 'payment.failed';
    default:
      return 'unknown';
  }
}

function resolveTier(kind: BillingEventKind, metadataTier: string | undefined): Tier | null {
  // Una baja degrada a community: es la única lectura segura. Dejar el plan
  // de pago activo tras una cancelación regala producto; bloquear la cuenta
  // entera castiga a quien quizá solo cambio de tarjeta.
  if (kind === 'subscription.cancelled') return 'community';
  if (metadataTier === 'community' || metadataTier === 'pro' || metadataTier === 'enterprise') {
    return metadataTier;
  }
  return null;
}

/** Comparación en tiempo constante de dos cadenas hexadecimales. */
function safeEqualHex(expected: string, received: string): boolean {
  if (expected.length !== received.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(received, 'hex'));
  } catch {
    return false;
  }
}

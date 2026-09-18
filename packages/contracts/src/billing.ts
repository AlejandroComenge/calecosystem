/**
 * Facturación y cambio de plan.
 *
 * `BillingProvider` es un puerto: Stripe es hoy la implementación, pero la
 * lógica de cuotas y de upgrade no depende de el. Un cliente enterprise que
 * factura por contrato puede enchufar su propia implementación sin tocar
 * nada más.
 */
import type { Tier } from './tiers.ts';

export interface PlanDefinition {
  readonly tier: Tier;
  readonly name: string;
  /** Precio en la unidad mínima de la moneda (centimos). */
  readonly amount: number;
  readonly currency: string;
  readonly interval: 'month' | 'year';
  /** Identificador del precio en el proveedor (p.ej. `price_...` en Stripe). */
  readonly priceId: string | null;
  readonly highlights: readonly string[];
}

export interface CheckoutRequest {
  readonly principal: { userId: string; organizationId?: string };
  readonly targetTier: Tier;
  readonly successUrl: string;
  readonly cancelUrl: string;
  readonly quantity?: number;
  readonly customerEmail?: string;
}

export interface CheckoutSession {
  readonly id: string;
  /** URL a la que enviar al usuario para completar el pago. */
  readonly url: string;
  readonly targetTier: Tier;
  readonly provider: string;
  readonly expiresAt?: string;
}

export type BillingEventKind =
  | 'checkout.completed'
  | 'subscription.updated'
  | 'subscription.cancelled'
  | 'payment.failed'
  | 'unknown';

/** Evento del proveedor ya normalizado: el resto del sistema no ve Stripe. */
export interface BillingEvent {
  readonly id: string;
  readonly kind: BillingEventKind;
  readonly userId: string | null;
  readonly organizationId: string | null;
  /** Plan que corresponde tras el evento. `null` si no aplica. */
  readonly tier: Tier | null;
  readonly occurredAt: string;
  readonly raw: Readonly<Record<string, unknown>>;
}

export interface WebhookVerification {
  readonly valid: boolean;
  readonly reason?: string;
}

export interface BillingProvider {
  readonly id: string;
  readonly plans: readonly PlanDefinition[];

  /** Crea la sesión de pago para subir de plan. */
  createCheckoutSession(request: CheckoutRequest): Promise<CheckoutSession>;

  /**
   * Verifica la firma del webhook. Es la única barrera entre "un cliente ha
   * pagado" y "alguien dice que un cliente ha pagado", así que no es
   * opcional ni puede delegarse en el que llama.
   */
  verifyWebhook(payload: string, signatureHeader: string): WebhookVerification;

  /** Normaliza el cuerpo del webhook a un evento del ecosistema. */
  parseWebhook(payload: string): BillingEvent;
}

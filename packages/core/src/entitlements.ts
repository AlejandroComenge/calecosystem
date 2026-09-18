import { type Tier, isTier, tierCovers } from '@calecosystem/contracts';
import { EntitlementError } from './errors.ts';

export interface License {
  readonly tier: Tier;
  readonly customer?: string;
  /** ISO-8601. Si falta, la licencia no caduca. */
  readonly expiresAt?: string;
  /** Capacidades sueltas concedidas fuera del tier (pilotos, acuerdos). */
  readonly features?: readonly string[];
}

export const COMMUNITY_LICENSE: License = { tier: 'community' };

/**
 * Comprobación de derechos de uso por tier.
 *
 * Es control de empaquetado de producto, no un control de seguridad: quien
 * tiene el código puede editarlo. Su valor está en que las combinaciones de
 * módulos activos sean explicitas, verificables y fáciles de auditar en una
 * instalación. Ver `docs/pricing.md` y `docs/adr/0003-entitlements-por-tier.md`.
 */
export class Entitlements {
  readonly license: License;
  readonly #features: ReadonlySet<string>;

  constructor(license: License = COMMUNITY_LICENSE) {
    this.license = license;
    this.#features = new Set(license.features ?? []);
  }

  /** Lee la licencia del entorno (`CALEC_LICENSE_TIER`, `CALEC_LICENSE_CUSTOMER`). */
  static fromEnvironment(env: NodeJS.ProcessEnv = process.env): Entitlements {
    const rawTier = env['CALEC_LICENSE_TIER'];
    const tier: Tier = isTier(rawTier) ? rawTier : 'community';
    const customer = env['CALEC_LICENSE_CUSTOMER'];
    return new Entitlements(customer ? { tier, customer } : { tier });
  }

  get tier(): Tier {
    return this.license.tier;
  }

  get expired(): boolean {
    if (!this.license.expiresAt) return false;
    const expiry = Date.parse(this.license.expiresAt);
    return Number.isFinite(expiry) && expiry < Date.now();
  }

  /** Tier efectivo: una licencia caducada degrada a `community`. */
  get effectiveTier(): Tier {
    return this.expired ? 'community' : this.license.tier;
  }

  allows(required: Tier): boolean {
    return tierCovers(this.effectiveTier, required);
  }

  hasFeature(feature: string): boolean {
    return this.#features.has(feature);
  }

  /** Igual que `allows`, pero lanza con un mensaje accionable. */
  assert(required: Tier, subject: string): void {
    if (this.allows(required)) return;
    throw new EntitlementError(
      `"${subject}" requiere el plan "${required}" y la licencia activa es "${this.effectiveTier}".`,
      { required, actual: this.effectiveTier, subject, expired: this.expired },
    );
  }
}

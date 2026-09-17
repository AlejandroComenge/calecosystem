/**
 * Niveles comerciales del ecosistema.
 *
 * El tier no es una frontera de seguridad: es un mecanismo de empaquetado de
 * producto. Sirve para decidir que plugins/modulos se activan en una
 * instalacion concreta, no para proteger codigo frente a un atacante con
 * acceso al repositorio. Ver `docs/pricing.md`.
 */
export type Tier = 'community' | 'pro' | 'enterprise';

export const TIERS: readonly Tier[] = ['community', 'pro', 'enterprise'];

/** Orden ascendente de capacidades. Un tier cubre a todos los inferiores. */
export const TIER_RANK: Readonly<Record<Tier, number>> = {
  community: 0,
  pro: 1,
  enterprise: 2,
};

export function isTier(value: unknown): value is Tier {
  return typeof value === 'string' && (TIERS as readonly string[]).includes(value);
}

/** `true` si `available` cubre lo que exige `required`. */
export function tierCovers(available: Tier, required: Tier): boolean {
  return TIER_RANK[available] >= TIER_RANK[required];
}

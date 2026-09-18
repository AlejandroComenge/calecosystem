import type { QuotaPeriod, QuotaPolicy, Tier, TierQuotas, UsageOperation } from '@calecosystem/contracts';

/**
 * Cuotas por plan.
 *
 * Los números salen de `docs/pricing.md` y están puestos con un criterio:
 * el plan gratuito tiene que permitir **evaluar el producto de verdad**
 * (arrancar varios proyectos, no uno), y llegar al límite tiene que coincidir
 * con el momento en que el equipo ya obtuvo valor. Un límite que muerde antes
 * de eso no convierte, solo ahuyenta.
 */
export const DEFAULT_QUOTAS: readonly TierQuotas[] = [
  {
    tier: 'community',
    policies: [
      { operation: 'generation', limit: 10, period: 'month' },
      { operation: 'project', limit: 3, period: 'total' },
      { operation: 'module-run', limit: 20, period: 'month' },
      { operation: 'seat', limit: 1, period: 'total' },
    ],
  },
  {
    tier: 'pro',
    policies: [
      { operation: 'generation', limit: 200, period: 'month' },
      { operation: 'project', limit: null, period: 'total' },
      { operation: 'module-run', limit: null, period: 'month' },
      { operation: 'seat', limit: 25, period: 'total' },
    ],
  },
  {
    tier: 'enterprise',
    policies: [
      { operation: 'generation', limit: null, period: 'month' },
      { operation: 'project', limit: null, period: 'total' },
      { operation: 'module-run', limit: null, period: 'month' },
      { operation: 'seat', limit: null, period: 'total' },
    ],
  },
];

export function policiesFor(tier: Tier, quotas: readonly TierQuotas[] = DEFAULT_QUOTAS): QuotaPolicy[] {
  const entry = quotas.find((candidate) => candidate.tier === tier);
  return entry ? [...entry.policies] : [];
}

export function policyFor(
  tier: Tier,
  operation: UsageOperation,
  quotas: readonly TierQuotas[] = DEFAULT_QUOTAS,
): QuotaPolicy | undefined {
  return policiesFor(tier, quotas).find((policy) => policy.operation === operation);
}

/**
 * Primer plan que levanta el límite de una operación.
 *
 * Es lo que convierte un "has llegado al límite" en un mensaje accionable en
 * lugar de un muro.
 */
export function nextTierFor(
  tier: Tier,
  operation: UsageOperation,
  quotas: readonly TierQuotas[] = DEFAULT_QUOTAS,
): Tier | undefined {
  const order: Tier[] = ['community', 'pro', 'enterprise'];
  const currentLimit = policyFor(tier, operation, quotas)?.limit ?? null;
  const startIndex = order.indexOf(tier) + 1;

  for (const candidate of order.slice(startIndex)) {
    const limit = policyFor(candidate, operation, quotas)?.limit ?? null;
    if (limit === null || (currentLimit !== null && limit > currentLimit)) return candidate;
  }
  return undefined;
}

/** Inicio de la ventana de conteo. `null` para períodos acumulados. */
export function periodStart(period: QuotaPeriod, now: Date = new Date()): Date | null {
  if (period === 'total') return null;
  if (period === 'day') {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Momento en que el contador vuelve a cero. */
export function periodReset(period: QuotaPeriod, now: Date = new Date()): string | null {
  if (period === 'total') return null;
  if (period === 'day') {
    return new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
    ).toISOString();
  }
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
}

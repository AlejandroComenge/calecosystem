import { randomUUID } from 'node:crypto';
import type {
  Principal,
  QuotaDecision,
  TierQuotas,
  UsageGuard,
  UsageOperation,
  UsageRecord,
  UsageStore,
} from '@calecosystem/contracts';
import { USAGE_OPERATIONS } from '@calecosystem/contracts';
import { DEFAULT_QUOTAS, nextTierFor, periodReset, periodStart, policyFor } from './quotas.ts';

export interface QuotaGuardOptions {
  readonly store: UsageStore;
  readonly quotas?: readonly TierQuotas[];
  /** Reloj inyectable: hace las pruebas de períodos deterministas. */
  readonly now?: () => Date;
}

/**
 * Comprobación y registro de consumo.
 *
 * Separa deliberadamente `check` de `record`. Podrían ser uno solo, pero
 * entonces una generación que falla a mitad consumiria cuota igual que una
 * que termina, y cobrar por un fallo propio es la forma más rápida de perder
 * un cliente. El middleware comprueba antes y registra solo si hubo exito.
 */
export class QuotaGuard implements UsageGuard {
  readonly #store: UsageStore;
  readonly #quotas: readonly TierQuotas[];
  readonly #now: () => Date;

  constructor(options: QuotaGuardOptions) {
    this.#store = options.store;
    this.#quotas = options.quotas ?? DEFAULT_QUOTAS;
    this.#now = options.now ?? (() => new Date());
  }

  async check(
    principal: Principal,
    operation: UsageOperation,
    quantity = 1,
  ): Promise<QuotaDecision> {
    const policy = policyFor(principal.tier, operation, this.#quotas);

    // Sin política definida no hay límite que aplicar. Es la elección segura:
    // una operación nueva no debe quedar bloqueada porque nadie le puso cuota.
    if (!policy) {
      return {
        allowed: true,
        operation,
        limit: null,
        used: 0,
        remaining: null,
        period: 'total',
        resetAt: null,
        reason: 'Sin política de cuota definida para esta operación.',
      };
    }

    const now = this.#now();
    const since = periodStart(policy.period, now);
    const used = await this.#store.count({
      userId: principal.userId,
      operation,
      ...(since ? { since } : {}),
    });

    if (policy.limit === null) {
      return {
        allowed: true,
        operation,
        limit: null,
        used,
        remaining: null,
        period: policy.period,
        resetAt: periodReset(policy.period, now),
      };
    }

    const remaining = Math.max(0, policy.limit - used);
    const allowed = used + quantity <= policy.limit;
    const upgrade = nextTierFor(principal.tier, operation, this.#quotas);

    return {
      allowed,
      operation,
      limit: policy.limit,
      used,
      remaining,
      period: policy.period,
      resetAt: periodReset(policy.period, now),
      ...(upgrade ? { upgradeTo: upgrade } : {}),
      ...(allowed
        ? {}
        : {
            reason:
              `Has usado ${used} de ${policy.limit} en el plan "${principal.tier}"` +
              (upgrade ? `. El plan "${upgrade}" amplia este límite.` : '.'),
          }),
    };
  }

  async record(
    principal: Principal,
    operation: UsageOperation,
    quantity = 1,
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    const entry: UsageRecord = {
      id: randomUUID(),
      userId: principal.userId,
      tier: principal.tier,
      ...(principal.projectId ? { projectId: principal.projectId } : {}),
      ...(principal.organizationId ? { organizationId: principal.organizationId } : {}),
      operation,
      quantity,
      at: this.#now().toISOString(),
      metadata,
    };
    await this.#store.record(entry);
  }

  async summary(principal: Principal): Promise<QuotaDecision[]> {
    // `quantity: 0` para preguntar el estado sin simular consumo: preguntar
    // no debe cambiar la respuesta.
    return Promise.all(
      USAGE_OPERATIONS.map((operation) => this.check(principal, operation, 0)),
    );
  }
}

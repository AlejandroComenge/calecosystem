/**
 * Límites de uso y planes.
 *
 * El control de cuota es lo que convierte tres niveles de precio en un
 * producto. Vive en contratos porque tanto el CLI como un futuro servicio
 * web o una acción de CI tienen que hablar el mismo idioma de cuotas.
 */
import type { Tier } from './tiers.ts';

/** Quien ejecuta una operación. El id de proyecto permite cuotas por repo. */
export interface Principal {
  readonly userId: string;
  readonly tier: Tier;
  readonly projectId?: string;
  readonly organizationId?: string;
}

/** Operaciones sujetas a cuota. */
export type UsageOperation = 'generation' | 'project' | 'module-run' | 'seat';

export const USAGE_OPERATIONS: readonly UsageOperation[] = [
  'generation',
  'project',
  'module-run',
  'seat',
];

/** Ventana sobre la que se cuenta el consumo. */
export type QuotaPeriod = 'day' | 'month' | 'total';

export interface QuotaPolicy {
  readonly operation: UsageOperation;
  /** `null` = sin límite. */
  readonly limit: number | null;
  readonly period: QuotaPeriod;
}

export interface TierQuotas {
  readonly tier: Tier;
  readonly policies: readonly QuotaPolicy[];
}

export interface UsageRecord {
  readonly id: string;
  readonly userId: string;
  readonly tier: Tier;
  readonly projectId?: string;
  readonly organizationId?: string;
  readonly operation: UsageOperation;
  readonly quantity: number;
  /** ISO-8601. */
  readonly at: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface UsageQuery {
  readonly userId?: string;
  readonly projectId?: string;
  readonly operation?: UsageOperation;
  /** Solo registros con `at >= since`. */
  readonly since?: Date;
}

/**
 * Persistencia del consumo. En memoria para desarrollo, JSONL para una CLI
 * local, y una base de datos cuando esto sea un servicio. El resto del
 * ecosistema no cambia.
 */
export interface UsageStore {
  record(entry: UsageRecord): Promise<void>;
  count(query: UsageQuery): Promise<number>;
  list(query: UsageQuery): Promise<UsageRecord[]>;
}

export interface QuotaDecision {
  readonly allowed: boolean;
  readonly operation: UsageOperation;
  /** `null` = sin límite. */
  readonly limit: number | null;
  readonly used: number;
  /** `null` cuando no hay límite. */
  readonly remaining: number | null;
  readonly period: QuotaPeriod;
  /** Cuando se reinicia el contador. `null` para períodos `total`. */
  readonly resetAt: string | null;
  /** Plan mínimo que levantaria este límite, si existe. */
  readonly upgradeTo?: Tier;
  readonly reason?: string;
}

/** Comprueba y registra consumo. Es el punto único de verdad sobre límites. */
export interface UsageGuard {
  check(principal: Principal, operation: UsageOperation, quantity?: number): Promise<QuotaDecision>;
  record(
    principal: Principal,
    operation: UsageOperation,
    quantity?: number,
    metadata?: Record<string, unknown>,
  ): Promise<void>;
  /** Estado de todas las cuotas del principal. Alimenta `calec usage`. */
  summary(principal: Principal): Promise<QuotaDecision[]>;
}

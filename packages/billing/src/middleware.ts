import type {
  GenerationContext,
  GenerationNext,
  GenerationResult,
  MiddlewareRegistration,
  UsageGuard,
} from '@calecosystem/contracts';
import { EcosystemError } from '@calecosystem/core';

/** Se lanza cuando una operación supera la cuota del plan activo. */
export class QuotaExceededError extends EcosystemError {
  constructor(message: string, details: Record<string, unknown>) {
    super('QUOTA_EXCEEDED', message, details);
    this.name = 'QuotaExceededError';
  }
}

export interface QuotaMiddlewareOptions {
  readonly guard: UsageGuard;
  /**
   * Con `false`, una petición sin principal se rechaza. Por defecto se deja
   * pasar: el uso local anonimo de la CLI no debería requerir cuenta.
   */
  readonly requirePrincipal?: boolean;
}

/**
 * Middleware de validación de plan.
 *
 * Orden deliberado de las tres cosas que hace:
 *  1. comprueba la cuota ANTES de analizar nada, para no gastar trabajo en
 *     una petición que va a rechazarse;
 *  2. deja pasar la generación;
 *  3. registra el consumo SOLO si término bien.
 *
 * El paso 3 es el que evita cobrar por errores propios. Si el pipeline falla,
 * el contador no se mueve.
 */
export function quotaMiddleware(options: QuotaMiddlewareOptions): MiddlewareRegistration {
  const { guard, requirePrincipal = false } = options;

  return {
    name: 'billing:quota',
    // Prioridad baja = el más externo. Rechazar pronto es todo el objetivo.
    priority: 10,
    handler: async (context: GenerationContext, next: GenerationNext): Promise<GenerationResult> => {
      const { principal } = context;

      if (!principal) {
        if (requirePrincipal) {
          throw new QuotaExceededError(
            'Esta instalación exige identificar al usuario antes de generar.',
            { requestId: context.requestId },
          );
        }
        return next();
      }

      const decision = await guard.check(principal, 'generation');
      context.state.set('quota.decision', decision);

      if (!decision.allowed) {
        throw new QuotaExceededError(
          decision.reason ??
            `Cuota de generaciones agotada en el plan "${principal.tier}".`,
          {
            operation: decision.operation,
            limit: decision.limit,
            used: decision.used,
            resetAt: decision.resetAt,
            upgradeTo: decision.upgradeTo,
            requestId: context.requestId,
          },
        );
      }

      if (decision.remaining !== null && decision.remaining <= 2) {
        context.logger.warn(
          `Te quedan ${decision.remaining} generaciones en el plan "${principal.tier}".` +
            (decision.upgradeTo ? ` El plan "${decision.upgradeTo}" amplia el límite.` : ''),
        );
      }

      const result = await next();

      await guard.record(principal, 'generation', 1, {
        requestId: context.requestId,
        projectSlug: result.blueprint.slug,
        files: result.metrics.fileCount,
        lines: result.metrics.lineCount,
        template: result.template?.id ?? null,
      });

      // Los módulos de ampliación también consumen: son la parte cara del
      // producto y la que justifica el plan Pro.
      if (result.reports.length > 0) {
        await guard.record(principal, 'module-run', result.reports.length, {
          requestId: context.requestId,
        });
      }

      return result;
    },
  };
}

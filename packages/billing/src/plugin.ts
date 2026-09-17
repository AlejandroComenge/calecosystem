import {
  type Plugin,
  type TierQuotas,
  type UsageGuard,
  type UsageStore,
  createServiceToken,
  definePlugin,
} from '@calecosystem/contracts';
import { MemoryUsageStore } from './stores.ts';
import { QuotaGuard } from './quota-guard.ts';
import { quotaMiddleware } from './middleware.ts';
import { DEFAULT_PLANS, StripeBillingProvider } from './stripe.ts';

/** Token con el que otros plugins (o el CLI) acceden al guardian de cuotas. */
export const USAGE_GUARD_TOKEN = createServiceToken<UsageGuard>('calec.usage.guard');

export interface BillingPluginOptions {
  readonly store?: UsageStore;
  readonly quotas?: readonly TierQuotas[];
  readonly requirePrincipal?: boolean;
  /** Claves de Stripe. Sin ellas el plugin funciona, pero sin cobrar. */
  readonly stripe?: { secretKey: string; webhookSecret: string };
}

/**
 * Plugin de limites de uso y facturacion.
 *
 * Registra el middleware de cuota y publica el guardian como servicio para
 * que el CLI pueda mostrar el consumo. Stripe es opcional a proposito: medir
 * consumo es util desde el primer dia, cobrar solo cuando hay con que.
 */
export function billingPlugin(options: BillingPluginOptions = {}): Plugin {
  const store = options.store ?? new MemoryUsageStore();
  const guard = new QuotaGuard({
    store,
    ...(options.quotas ? { quotas: options.quotas } : {}),
  });

  return definePlugin({
    name: '@calecosystem/billing',
    version: '0.2.0',
    description: 'Cuotas por plan, contador de consumo y cambio de plan con Stripe.',
    tier: 'community',
    priority: 5,

    register(api) {
      api.provide(USAGE_GUARD_TOKEN, guard);
      api.registerMiddleware(
        quotaMiddleware({
          guard,
          ...(options.requirePrincipal === undefined
            ? {}
            : { requirePrincipal: options.requirePrincipal }),
        }),
      );

      if (options.stripe) {
        api.provide(
          createServiceToken<StripeBillingProvider>('calec.billing.provider'),
          new StripeBillingProvider({
            secretKey: options.stripe.secretKey,
            webhookSecret: options.stripe.webhookSecret,
            plans: DEFAULT_PLANS,
          }),
        );
        api.logger.debug('Proveedor de facturacion Stripe registrado.');
      } else {
        api.logger.debug('Sin claves de Stripe: se miden cuotas pero no se puede cobrar.');
      }
    },
  });
}

export default billingPlugin;

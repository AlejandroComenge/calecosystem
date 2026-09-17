import path from 'node:path';
import type { Logger, Plugin, Principal, Tier, UsageGuard } from '@calecosystem/contracts';
import {
  EcosystemKernel,
  Entitlements,
  createLogger,
  loadConfig,
  loadPluginsFromConfig,
  type EcosystemConfig,
} from '@calecosystem/core';
import { generatorPlugin } from '@calecosystem/generator';
import { optimizerPlugin } from '@calecosystem/optimizer';
import { securityPlugin } from '@calecosystem/security';
import { testerPlugin } from '@calecosystem/tester';
import { documenterPlugin } from '@calecosystem/documenter';
import { JsonLinesUsageStore, MemoryUsageStore, USAGE_GUARD_TOKEN, billingPlugin } from '@calecosystem/billing';
import { JsonLinesSink, telemetryPlugin } from '@calecosystem/telemetry';

export interface BootstrapOptions {
  readonly cwd?: string;
  readonly logger?: Logger;
  readonly tier?: Entitlements;
  /** Identificador de usuario para aplicar cuotas. */
  readonly userId?: string;
}

export interface BootstrapResult {
  readonly kernel: EcosystemKernel;
  readonly config: EcosystemConfig;
  readonly principal: Principal | undefined;
  readonly usageGuard: UsageGuard | undefined;
}

/**
 * Arranque estandar del ecosistema.
 *
 * Los siete plugins se cargan en igualdad de condiciones con cualquier plugin
 * de terceros que declare la configuracion. Los que exceden el tier activo se
 * omiten con un aviso: una instalacion community genera proyectos igualmente,
 * solo que sin las fases de pago.
 */
export async function bootstrapEcosystem(options: BootstrapOptions = {}): Promise<BootstrapResult> {
  const cwd = options.cwd ?? process.cwd();
  const logger = options.logger ?? createLogger({ level: 'info' });
  const config = await loadConfig(cwd);

  const entitlements =
    options.tier ??
    (process.env['CALEC_LICENSE_TIER']
      ? Entitlements.fromEnvironment()
      : new Entitlements({ tier: config.tier }));

  const userId = options.userId ?? process.env['CALEC_USER_ID'];
  const principal: Principal | undefined = userId
    ? { userId, tier: entitlements.effectiveTier as Tier }
    : undefined;

  // Sin usuario identificado el contador vive en memoria: un uso local y
  // anonimo no deja rastro en el disco de nadie.
  const store = principal
    ? new JsonLinesUsageStore(path.resolve(cwd, config.usage.file))
    : new MemoryUsageStore();

  const builtIn: Plugin[] = [
    billingPlugin({ store, requirePrincipal: config.usage.requireUser }),
    generatorPlugin(),
    optimizerPlugin(),
    securityPlugin(),
    testerPlugin(),
    documenterPlugin(),
  ];

  if (config.telemetry.enabled) {
    builtIn.push(
      telemetryPlugin({
        sink: new JsonLinesSink(path.resolve(cwd, config.telemetry.file)),
        includeRequirementText: config.telemetry.includeRequirementText,
        tags: { tier: entitlements.effectiveTier },
      }),
    );
  }

  const external = await loadPluginsFromConfig(config, cwd);

  const kernel = new EcosystemKernel({
    logger,
    entitlements,
    pluginOptions: Object.fromEntries(
      config.plugins.map((specifier) => [specifier.module, specifier.options ?? {}]),
    ),
  });

  for (const plugin of [...builtIn, ...external]) kernel.use(plugin);
  await kernel.init();

  return {
    kernel,
    config,
    principal,
    usageGuard: kernel.resolveService(USAGE_GUARD_TOKEN),
  };
}

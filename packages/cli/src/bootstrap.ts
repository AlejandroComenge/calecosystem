import type { Logger, Plugin } from '@calecosystem/contracts';
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

export interface BootstrapOptions {
  readonly cwd?: string;
  readonly logger?: Logger;
  /** Sobrescribe el tier de la configuracion y del entorno. */
  readonly tier?: Entitlements;
}

export interface BootstrapResult {
  readonly kernel: EcosystemKernel;
  readonly config: EcosystemConfig;
}

/**
 * Arranque estandar del ecosistema.
 *
 * Los cinco modulos se cargan como plugins, en igualdad de condiciones con
 * cualquier plugin de terceros que declare la configuracion. Los que exceden
 * el tier activo se omiten con un aviso: una instalacion community genera
 * proyectos igualmente, solo que sin las fases de pago.
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

  const builtIn: Plugin[] = [
    generatorPlugin(),
    optimizerPlugin(),
    securityPlugin(),
    testerPlugin(),
    documenterPlugin(),
  ];
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

  return { kernel, config };
}

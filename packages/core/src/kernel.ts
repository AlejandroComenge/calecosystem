import type {
  BackendAdapter,
  DeploymentAdapter,
  EcosystemModule,
  FrontendAdapter,
  Logger,
  ModuleKind,
  Plugin,
  PluginApi,
  RequirementsEnricher,
  ServiceToken,
  Tier,
} from '@calecosystem/contracts';
import { AUGMENT_ORDER } from '@calecosystem/contracts';
import { HookBus } from './hook-bus.ts';
import { Entitlements } from './entitlements.ts';
import { assertValidPlugin, resolvePluginOrder } from './plugin-registry.ts';
import { createLogger } from './logger.ts';
import { PluginError, toError } from './errors.ts';

export interface KernelOptions {
  readonly logger?: Logger;
  readonly entitlements?: Entitlements;
  /** Opciones por plugin, indexadas por nombre de plugin. */
  readonly pluginOptions?: Readonly<Record<string, Record<string, unknown>>>;
  /**
   * Con `strict`, un plugin por encima del tier activo aborta el arranque.
   * Sin el (por defecto), se omite con un aviso: una instalacion community
   * sigue funcionando aunque la configuracion mencione plugins de pago.
   */
  readonly strictEntitlements?: boolean;
}

export interface KernelDiagnostics {
  readonly tier: Tier;
  readonly plugins: readonly { name: string; version: string }[];
  readonly skippedPlugins: readonly { name: string; reason: string }[];
  readonly modules: readonly { id: string; kind: ModuleKind; status: string }[];
  readonly frontendAdapters: readonly string[];
  readonly backendAdapters: readonly string[];
  readonly deploymentAdapters: readonly string[];
}

/**
 * Kernel del ecosistema.
 *
 * No sabe generar, optimizar, auditar, testear ni documentar. Solo sabe
 * cargar plugins en un orden determinista, exponerles puntos de extension y
 * resolver quien atiende cada capacidad. Todo lo demas del ecosistema es un
 * plugin, incluido el generador.
 */
export class EcosystemKernel {
  readonly hooks: HookBus;
  readonly logger: Logger;
  readonly entitlements: Entitlements;

  readonly #options: KernelOptions;
  readonly #queued: Plugin[] = [];
  readonly #registered = new Map<string, Plugin>();
  readonly #skipped: { name: string; reason: string }[] = [];
  readonly #modules = new Map<ModuleKind, EcosystemModule[]>();
  readonly #frontendAdapters = new Map<string, FrontendAdapter>();
  readonly #backendAdapters = new Map<string, BackendAdapter>();
  readonly #deploymentAdapters = new Map<string, DeploymentAdapter>();
  readonly #enrichers: RequirementsEnricher[] = [];
  readonly #services = new Map<string, unknown>();
  #initialized = false;

  constructor(options: KernelOptions = {}) {
    this.#options = options;
    this.logger = options.logger ?? createLogger();
    this.entitlements = options.entitlements ?? new Entitlements();
    this.hooks = new HookBus(this.logger);
  }

  get initialized(): boolean {
    return this.#initialized;
  }

  /** Encola un plugin. Debe llamarse antes de `init()`. */
  use(plugin: Plugin): this {
    if (this.#initialized) {
      throw new PluginError(
        'KERNEL_ALREADY_INITIALIZED',
        `No se puede anadir "${plugin.name}": el kernel ya esta inicializado.`,
        { plugin: plugin.name },
      );
    }
    assertValidPlugin(plugin);
    this.#queued.push(plugin);
    return this;
  }

  /** Resuelve el orden de carga y registra todos los plugins encolados. */
  async init(): Promise<this> {
    if (this.#initialized) return this;

    const eligible: Plugin[] = [];
    for (const plugin of this.#queued) {
      const required: Tier = plugin.tier ?? 'community';
      if (this.entitlements.allows(required)) {
        eligible.push(plugin);
        continue;
      }
      const reason = `requiere el plan "${required}" (activo: "${this.entitlements.effectiveTier}")`;
      if (this.#options.strictEntitlements) {
        this.entitlements.assert(required, plugin.name);
      }
      this.#skipped.push({ name: plugin.name, reason });
      this.logger.warn(`Plugin "${plugin.name}" omitido: ${reason}.`);
    }

    for (const plugin of resolvePluginOrder(eligible)) {
      try {
        await plugin.register(this.#createPluginApi(plugin));
      } catch (error) {
        throw new PluginError(
          'PLUGIN_REGISTRATION_FAILED',
          `El plugin "${plugin.name}" fallo al registrarse: ${toError(error).message}`,
          { plugin: plugin.name, cause: toError(error).message },
        );
      }
      this.#registered.set(plugin.name, plugin);
      await this.hooks.emit('plugin:registered', { name: plugin.name, version: plugin.version });
      this.logger.debug(`Plugin registrado: ${plugin.name}@${plugin.version}`);
    }

    this.#initialized = true;
    return this;
  }

  /* --- Resolucion de capacidades ------------------------------------- */

  modules(kind?: ModuleKind): EcosystemModule[] {
    if (kind) return [...(this.#modules.get(kind) ?? [])];
    return AUGMENT_ORDER.flatMap((moduleKind) => this.#modules.get(moduleKind) ?? []);
  }

  /** Modulos de ampliacion en el orden canonico de la fase `augment`. */
  augmentModules(): EcosystemModule[] {
    return AUGMENT_ORDER.flatMap((kind) => [...(this.#modules.get(kind) ?? [])]);
  }

  hasModule(kind: ModuleKind): boolean {
    return (this.#modules.get(kind)?.length ?? 0) > 0;
  }

  frontendAdapter(framework: string): FrontendAdapter | undefined {
    return this.#frontendAdapters.get(framework);
  }

  backendAdapter(runtime: string): BackendAdapter | undefined {
    return this.#backendAdapters.get(runtime);
  }

  /** Runtimes de backend con adaptador registrado, en orden estable. */
  listBackendRuntimes(): string[] {
    return [...this.#backendAdapters.keys()].sort();
  }

  /** Destinos de despliegue con adaptador registrado, en orden estable. */
  listDeploymentTargets(): string[] {
    return [...this.#deploymentAdapters.keys()].sort();
  }

  deploymentAdapter(target: string): DeploymentAdapter | undefined {
    return this.#deploymentAdapters.get(target);
  }

  requirementsEnrichers(): readonly RequirementsEnricher[] {
    return this.#enrichers;
  }

  resolveService<T>(token: ServiceToken<T>): T | undefined {
    return this.#services.get(token.key) as T | undefined;
  }

  diagnostics(): KernelDiagnostics {
    return {
      tier: this.entitlements.effectiveTier,
      plugins: [...this.#registered.values()].map((plugin) => ({
        name: plugin.name,
        version: plugin.version,
      })),
      skippedPlugins: [...this.#skipped],
      modules: this.augmentModules().map((module) => ({
        id: module.descriptor.id,
        kind: module.descriptor.kind,
        status: module.descriptor.status,
      })),
      frontendAdapters: [...this.#frontendAdapters.keys()].sort(),
      backendAdapters: [...this.#backendAdapters.keys()].sort(),
      deploymentAdapters: [...this.#deploymentAdapters.keys()].sort(),
    };
  }

  /** Libera plugins en orden inverso al de registro. */
  async dispose(): Promise<void> {
    for (const plugin of [...this.#registered.values()].reverse()) {
      try {
        await plugin.dispose?.();
      } catch (error) {
        this.logger.error(`Error al liberar "${plugin.name}": ${toError(error).message}`);
      }
      this.hooks.removeBySource(plugin.name);
    }
    this.#registered.clear();
    this.#modules.clear();
    this.#frontendAdapters.clear();
    this.#backendAdapters.clear();
    this.#deploymentAdapters.clear();
    this.#services.clear();
    this.#enrichers.length = 0;
    this.#initialized = false;
  }

  /* --- Superficie expuesta a los plugins ------------------------------ */

  #createPluginApi(plugin: Plugin): PluginApi {
    const source = plugin.name;
    const logger = this.logger.child(source);
    const options = this.#options.pluginOptions?.[source] ?? {};

    return {
      logger,
      options,
      tier: this.entitlements.effectiveTier,

      onEvent: (name, handler, opts = {}) =>
        this.hooks.onEvent(name, handler, { source, ...opts }),
      onTransform: (name, handler, opts = {}) =>
        this.hooks.onTransform(name, handler, { source, ...opts }),

      registerModule: (module) => {
        this.entitlements.assert(module.descriptor.tier, module.descriptor.id);
        const existing = this.#modules.get(module.descriptor.kind) ?? [];
        if (existing.some((candidate) => candidate.descriptor.id === module.descriptor.id)) {
          throw new PluginError(
            'DUPLICATE_MODULE',
            `El modulo "${module.descriptor.id}" ya esta registrado.`,
            { module: module.descriptor.id },
          );
        }
        existing.push(module);
        this.#modules.set(module.descriptor.kind, existing);
        void this.hooks.emit('module:registered', { descriptor: module.descriptor });
      },

      registerFrontendAdapter: (adapter) => {
        this.entitlements.assert(adapter.tier, adapter.id);
        this.#frontendAdapters.set(adapter.framework, adapter);
      },
      registerBackendAdapter: (adapter) => {
        this.entitlements.assert(adapter.tier, adapter.id);
        this.#backendAdapters.set(adapter.runtime, adapter);
      },
      registerDeploymentAdapter: (adapter) => {
        this.entitlements.assert(adapter.tier, adapter.id);
        this.#deploymentAdapters.set(adapter.target, adapter);
      },
      registerRequirementsEnricher: (enricher) => {
        this.#enrichers.push(enricher);
      },

      provide: (token, value) => {
        this.#services.set(token.key, value);
      },
      resolve: (token) => this.#services.get(token.key) as never,

      hasModule: (kind) => this.hasModule(kind),
    };
  }
}

/** Atajo habitual: crear kernel, encolar plugins e inicializar. */
export async function createKernel(
  options: KernelOptions & { plugins?: readonly Plugin[] } = {},
): Promise<EcosystemKernel> {
  const kernel = new EcosystemKernel(options);
  for (const plugin of options.plugins ?? []) kernel.use(plugin);
  return kernel.init();
}

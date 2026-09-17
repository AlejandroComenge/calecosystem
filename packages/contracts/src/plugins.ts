/** Superficie publica que un plugin recibe al registrarse. */
import type { HookRegistry } from './hooks.ts';
import type { EcosystemModule, ModuleKind } from './modules.ts';
import type { BackendAdapter, DeploymentAdapter, FrontendAdapter, RequirementsEnricher } from './adapters.ts';
import type { ComponentRenderer, ComponentSpec } from './components.ts';
import type { ProjectTemplate } from './templates.ts';
import type { MiddlewareRegistration } from './middleware.ts';
import type { Logger } from './logger.ts';
import type { Tier } from './tiers.ts';

/**
 * Token tipado para el contenedor de servicios. Permite que un plugin
 * publique una capacidad y otro la consuma sin acoplarse a su paquete.
 * El parametro de tipo se conserva solo a efectos de inferencia.
 */
export interface ServiceToken<T> {
  readonly key: string;
  readonly __type?: T;
}

export function createServiceToken<T>(key: string): ServiceToken<T> {
  return { key };
}

export interface PluginApi extends HookRegistry {
  readonly logger: Logger;
  /** Opciones especificas de este plugin, tomadas de la configuracion. */
  readonly options: Readonly<Record<string, unknown>>;
  readonly tier: Tier;

  registerModule(module: EcosystemModule): void;
  registerFrontendAdapter(adapter: FrontendAdapter): void;
  registerBackendAdapter(adapter: BackendAdapter): void;
  registerDeploymentAdapter(adapter: DeploymentAdapter): void;
  registerRequirementsEnricher(enricher: RequirementsEnricher): void;

  /** Plantilla de producto (e-commerce, SaaS, landing...). */
  registerTemplate(template: ProjectTemplate): void;
  /** Componente reutilizable del catalogo. Un mismo nombre sustituye al anterior. */
  registerComponent(component: ComponentSpec): void;
  /** Renderizador de componentes para un framework concreto. */
  registerComponentRenderer(renderer: ComponentRenderer): void;
  /** Middleware alrededor de la generacion completa (cuotas, telemetria...). */
  registerMiddleware(registration: MiddlewareRegistration): void;

  /** Publica un servicio para otros plugins. */
  provide<T>(token: ServiceToken<T>, value: T): void;
  /** Consume un servicio publicado por otro plugin. */
  resolve<T>(token: ServiceToken<T>): T | undefined;

  hasModule(kind: ModuleKind): boolean;
}

export interface Plugin {
  /** Identificador unico y estable. */
  readonly name: string;
  readonly version: string;
  readonly description?: string;
  /** Tier minimo para poder activarse. Por defecto `community`. */
  readonly tier?: Tier;
  /** Nombres de plugins que deben registrarse antes que este. */
  readonly requires?: readonly string[];
  /** Desempate entre plugins sin dependencia entre si. Menor = antes. */
  readonly priority?: number;
  register(api: PluginApi): void | Promise<void>;
  dispose?(): void | Promise<void>;
}

/** Azucar de tipado; no anade comportamiento. */
export function definePlugin(plugin: Plugin): Plugin {
  return plugin;
}

/** Fabrica de plugin parametrizable, la forma habitual de distribuirlos. */
export type PluginFactory<O = Record<string, unknown>> = (options?: O) => Plugin;

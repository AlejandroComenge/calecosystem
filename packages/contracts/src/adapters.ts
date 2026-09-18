/**
 * Adaptadores de scaffolding. Añadir un framework nuevo (Svelte, Solid,
 * Remix...) es escribir un adaptador y registrarlo desde un plugin: no se
 * toca el generador.
 */
import type { Blueprint, DeploymentTarget, FrontendFramework, BackendRuntime } from './blueprint.ts';
import type { VirtualFile } from './artifacts.ts';
import type { Logger } from './logger.ts';
import type { Tier } from './tiers.ts';
import type { DependencyCollector } from './dependencies.ts';
import type { ComponentSpec } from './components.ts';

export interface ScaffoldContext {
  readonly blueprint: Blueprint;
  readonly logger: Logger;
  /**
   * Donde se declaran las dependencias en lugar de escribir `package.json`
   * a mano. Ver `dependencies.ts`.
   */
  readonly dependencies: DependencyCollector;
  /**
   * Componentes que otros productores ya han registrado. Permite que una
   * plantilla reutilice el catálogo de UI del adaptador en vez de duplicarlo.
   */
  readonly components: readonly ComponentSpec[];
}

export interface ScaffoldAdapter {
  readonly id: string;
  readonly displayName: string;
  readonly tier: Tier;
  scaffold(context: ScaffoldContext): VirtualFile[] | Promise<VirtualFile[]>;
}

export interface FrontendAdapter extends ScaffoldAdapter {
  readonly framework: FrontendFramework | (string & {});
}

export interface BackendAdapter extends ScaffoldAdapter {
  readonly runtime: BackendRuntime | (string & {});
}

export interface DeploymentAdapter extends ScaffoldAdapter {
  readonly target: DeploymentTarget | (string & {});
}

/**
 * Puerto de enriquecimiento del análisis. El analizador incluido es
 * deterministico (lexicos y reglas). Este puerto es el punto donde un
 * modelo de lenguaje puede mejorar la extracción sin que el resto del
 * ecosistema se entere del cambio.
 */
export interface RequirementsEnricher {
  readonly id: string;
  enrich(
    rawText: string,
    draft: import('./requirements.ts').RequirementsModel,
  ): Promise<Partial<import('./requirements.ts').RequirementsModel>>;
}

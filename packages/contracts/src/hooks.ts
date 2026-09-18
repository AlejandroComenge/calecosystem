/**
 * Puntos de extension del pipeline.
 *
 * Dos familias, deliberadamente separadas:
 *  - `EventHooks`     : notificación. El handler observa y no cambia nada.
 *  - `TransformHooks` : transformación en cascada. Cada handler recibe el
 *                       valor devuelto por el anterior y devuelve el
 *                       siguiente. Es la via por la que el optimizador o el
 *                       auditor corrigen decisiones antes de que se escriban.
 *
 * Mantenerlas separadas evita el error clasico de los sistemas de hooks:
 * handlers que mutan por accidente un payload que otros esperaban intacto.
 */
import type { Blueprint, DeploymentPlan } from './blueprint.ts';
import type { RequirementsModel } from './requirements.ts';
import type { GenerationResult, PipelinePhase, VirtualFile } from './artifacts.ts';
import type { ModuleDescriptor } from './modules.ts';
import type { ModuleReport } from './reports.ts';

/** Hooks de transformación: `payload -> payload`. */
export interface TransformHooks {
  /** Requisitos recien extraidos del lenguaje natural. */
  'requirements:analyzed': RequirementsModel;
  /** Arquitectura decidida, aún sin materializar en ficheros. */
  'blueprint:planned': Blueprint;
  /** Plan de despliegue, antes de emitir Dockerfile/CI. */
  'deployment:planned': DeploymentPlan;
  /** Árbol completo de ficheros justo antes de cerrar el resultado. */
  'files:finalized': readonly VirtualFile[];
}

/** Hooks de notificación: observan, no modifican. */
export interface EventHooks {
  'plugin:registered': { name: string; version: string };
  'module:registered': { descriptor: ModuleDescriptor };
  'pipeline:phase-start': { phase: PipelinePhase };
  'pipeline:phase-end': { phase: PipelinePhase; durationMs: number };
  'module:before-run': { descriptor: ModuleDescriptor };
  'module:after-run': { descriptor: ModuleDescriptor; report: ModuleReport };
  'file:emitted': { file: VirtualFile };
  'generation:completed': GenerationResult;
  'generation:failed': { error: Error; phase: PipelinePhase };
}

export type TransformHookName = keyof TransformHooks;
export type EventHookName = keyof EventHooks;

export interface HookMeta {
  /** Quien registro el handler (plugin o módulo). Útil para diagnosticar. */
  readonly source: string;
  /** Menor valor = se ejecuta antes. Por defecto 100. */
  readonly priority: number;
}

export type TransformHandler<K extends TransformHookName> = (
  payload: TransformHooks[K],
  meta: HookMeta,
) => TransformHooks[K] | Promise<TransformHooks[K]>;

export type EventHandler<K extends EventHookName> = (
  payload: EventHooks[K],
  meta: HookMeta,
) => void | Promise<void>;

export interface HookRegistrationOptions {
  readonly source?: string;
  readonly priority?: number;
}

export type Unsubscribe = () => void;

export interface HookRegistry {
  onEvent<K extends EventHookName>(
    name: K,
    handler: EventHandler<K>,
    options?: HookRegistrationOptions,
  ): Unsubscribe;

  onTransform<K extends TransformHookName>(
    name: K,
    handler: TransformHandler<K>,
    options?: HookRegistrationOptions,
  ): Unsubscribe;
}

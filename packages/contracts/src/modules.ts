/**
 * Contrato de modulo. Los cinco componentes del ecosistema (generador,
 * optimizador, auditor, testeador y documentador) se enchufan al kernel
 * exactamente por la misma puerta.
 */
import type { Blueprint } from './blueprint.ts';
import type { RequirementsModel } from './requirements.ts';
import type { VirtualFile } from './artifacts.ts';
import type { ModuleReport } from './reports.ts';
import type { Logger } from './logger.ts';
import type { Tier } from './tiers.ts';

export type ModuleKind = 'generator' | 'optimizer' | 'security' | 'tester' | 'documenter';

export const MODULE_KINDS: readonly ModuleKind[] = [
  'generator',
  'optimizer',
  'security',
  'tester',
  'documenter',
];

/**
 * Orden de ejecucion en la fase `augment`.
 *
 * Analizan primero (optimizador y seguridad, que pueden anadir hallazgos que
 * cambian lo que hay que probar) y producen ficheros despues (testeador y
 * documentador, que quieren ver el arbol ya estabilizado).
 */
export const AUGMENT_ORDER: readonly ModuleKind[] = [
  'optimizer',
  'security',
  'tester',
  'documenter',
];

export type ModuleStatus = 'ga' | 'preview' | 'planned';

export interface ModuleDescriptor {
  /** Identificador unico, p.ej. `@calecosystem/security`. */
  readonly id: string;
  readonly kind: ModuleKind;
  readonly version: string;
  readonly displayName: string;
  readonly description: string;
  /** Tier minimo requerido para activar el modulo. */
  readonly tier: Tier;
  readonly status: ModuleStatus;
}

/**
 * Contexto entregado a cada modulo en la fase `augment`. Es deliberadamente
 * de solo lectura salvo por `emit` y `warn`: un modulo no muta el arbol de
 * otro, aporta el suyo.
 */
export interface ModuleRunContext {
  readonly requirements: RequirementsModel;
  readonly blueprint: Blueprint;
  readonly files: readonly VirtualFile[];
  readonly logger: Logger;
  /** Anade un fichero al proyecto generado. */
  emit(file: VirtualFile): void;
  /** Registra un aviso no bloqueante en el resultado. */
  warn(message: string): void;
}

export interface EcosystemModule {
  readonly descriptor: ModuleDescriptor;
  run(context: ModuleRunContext): Promise<ModuleReport>;
}

/* --- Especializaciones por tipo -------------------------------------- */
/* Narrowing nominal por `kind`: permite que el kernel resuelva modulos por
   tipo sin castings y que cada paquete declare su intencion. */

export interface OptimizerModule extends EcosystemModule {
  readonly descriptor: ModuleDescriptor & { kind: 'optimizer' };
}

export interface SecurityAuditorModule extends EcosystemModule {
  readonly descriptor: ModuleDescriptor & { kind: 'security' };
}

export interface TesterModule extends EcosystemModule {
  readonly descriptor: ModuleDescriptor & { kind: 'tester' };
}

export interface DocumenterModule extends EcosystemModule {
  readonly descriptor: ModuleDescriptor & { kind: 'documenter' };
}

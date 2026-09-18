/**
 * Contrato de módulo. Los cinco componentes del ecosistema (generador,
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
 * Orden de ejecución en la fase `augment`.
 *
 * Analizan primero (optimizador y seguridad, que pueden añadir hallazgos que
 * cambian lo que hay que probar) y producen ficheros después (testeador y
 * documentador, que quieren ver el árbol ya estabilizado).
 */
export const AUGMENT_ORDER: readonly ModuleKind[] = [
  'optimizer',
  'security',
  'tester',
  'documenter',
];

export type ModuleStatus = 'ga' | 'preview' | 'planned';

export interface ModuleDescriptor {
  /** Identificador único, p.ej. `@calecosystem/security`. */
  readonly id: string;
  readonly kind: ModuleKind;
  readonly version: string;
  readonly displayName: string;
  readonly description: string;
  /** Tier mínimo requerido para activar el módulo. */
  readonly tier: Tier;
  readonly status: ModuleStatus;
}

/**
 * Contexto entregado a cada módulo en la fase `augment`. Es deliberadamente
 * de solo lectura salvo por `emit` y `warn`: un módulo no muta el árbol de
 * otro, aporta el suyo.
 */
export interface ModuleRunContext {
  readonly requirements: RequirementsModel;
  readonly blueprint: Blueprint;
  readonly files: readonly VirtualFile[];
  readonly logger: Logger;
  /** Añade un fichero al proyecto generado. */
  emit(file: VirtualFile): void;
  /** Registra un aviso no bloqueante en el resultado. */
  warn(message: string): void;
}

export interface EcosystemModule {
  readonly descriptor: ModuleDescriptor;
  run(context: ModuleRunContext): Promise<ModuleReport>;
}

/* --- Especializaciones por tipo -------------------------------------- */
/* Narrowing nominal por `kind`: permite que el kernel resuelva módulos por
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

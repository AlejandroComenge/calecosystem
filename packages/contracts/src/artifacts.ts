/** Ficheros generados y resultado de una ejecucion del pipeline. */
import type { Blueprint } from './blueprint.ts';
import type { RequirementsModel } from './requirements.ts';
import type { ModuleReport } from './reports.ts';

export interface VirtualFile {
  /** Ruta relativa POSIX dentro del proyecto generado. */
  readonly path: string;
  readonly contents: string;
  /** Quien lo produjo: id de modulo, plugin o adaptador. */
  readonly producedBy: string;
  /** Permite reemplazar un fichero ya emitido por otro productor. */
  readonly overwrite?: boolean;
  readonly executable?: boolean;
}

export type PipelinePhase = 'analyze' | 'plan' | 'scaffold' | 'augment' | 'finalize';

export const PIPELINE_PHASES: readonly PipelinePhase[] = [
  'analyze',
  'plan',
  'scaffold',
  'augment',
  'finalize',
];

export interface GenerationMetrics {
  readonly durationMs: number;
  readonly fileCount: number;
  readonly totalBytes: number;
  readonly phaseTimings: Readonly<Partial<Record<PipelinePhase, number>>>;
}

export interface GenerationResult {
  readonly requirements: RequirementsModel;
  readonly blueprint: Blueprint;
  readonly files: readonly VirtualFile[];
  readonly reports: readonly ModuleReport[];
  readonly warnings: readonly string[];
  readonly metrics: GenerationMetrics;
}

/** Ficheros generados y resultado de una ejecución del pipeline. */
import type { Blueprint } from './blueprint.ts';
import type { RequirementsModel } from './requirements.ts';
import type { ModuleReport } from './reports.ts';
import type { DependencyConflict } from './dependencies.ts';

export interface VirtualFile {
  /** Ruta relativa POSIX dentro del proyecto generado. */
  readonly path: string;
  readonly contents: string;
  /** Quien lo produjo: id de módulo, plugin o adaptador. */
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
  /** Líneas de código generadas. Es la métrica que pide todo el mundo. */
  readonly lineCount: number;
  /** Componentes de interfaz emitidos. */
  readonly componentCount: number;
  readonly phaseTimings: Readonly<Partial<Record<PipelinePhase, number>>>;
}

/** Plantilla de producto aplicada, cuando alguna supero el umbral. */
export interface AppliedTemplate {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly score: number;
  readonly signals: readonly string[];
}

export interface GenerationResult {
  readonly requirements: RequirementsModel;
  readonly blueprint: Blueprint;
  readonly files: readonly VirtualFile[];
  readonly reports: readonly ModuleReport[];
  readonly warnings: readonly string[];
  readonly metrics: GenerationMetrics;
  readonly template: AppliedTemplate | null;
  /** Paquetes con versiones incompatibles declaradas por productores distintos. */
  readonly dependencyConflicts: readonly DependencyConflict[];
  /** Identificador de esta ejecución; correlaciona logs, telemetría y cuotas. */
  readonly requestId: string;
}

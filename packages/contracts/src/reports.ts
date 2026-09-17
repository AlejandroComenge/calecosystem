/** Formato unico de salida de los cinco modulos del ecosistema. */
import type { ModuleKind } from './modules.ts';

export type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export const SEVERITY_RANK: Readonly<Record<Severity, number>> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export interface Finding {
  /** Codigo estable y accionable, p.ej. `SEC-HARDCODED-SECRET`. */
  readonly id: string;
  readonly severity: Severity;
  readonly title: string;
  readonly detail: string;
  /** Fichero afectado, si aplica. */
  readonly path?: string;
  readonly remediation?: string;
  readonly tags?: readonly string[];
}

export interface ModuleReport {
  /** Id del modulo que emite el informe. */
  readonly module: string;
  readonly kind: ModuleKind;
  readonly summary: string;
  readonly findings: readonly Finding[];
  /** Puntuacion 0..100 propia del modulo (salud, cobertura, rendimiento). */
  readonly score: number | null;
  /** Ficheros que el modulo aporto al proyecto generado. */
  readonly emittedFiles: readonly string[];
  readonly durationMs: number;
}

export function highestSeverity(findings: readonly Finding[]): Severity | null {
  let worst: Severity | null = null;
  for (const finding of findings) {
    if (worst === null || SEVERITY_RANK[finding.severity] > SEVERITY_RANK[worst]) {
      worst = finding.severity;
    }
  }
  return worst;
}

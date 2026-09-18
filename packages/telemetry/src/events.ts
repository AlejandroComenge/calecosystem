import { createHash } from 'node:crypto';

export interface AnalyticsEvent {
  readonly name: string;
  /** ISO-8601. */
  readonly at: string;
  /** Correlaciona todos los eventos de una misma generación. */
  readonly requestId: string;
  readonly properties: Readonly<Record<string, unknown>>;
}

export interface AnalyticsSink {
  readonly id: string;
  emit(event: AnalyticsEvent): void | Promise<void>;
  flush?(): Promise<void>;
}

/**
 * Huella del enunciado de requisitos.
 *
 * Permite saber si dos generaciones vienen del mismo texto (útil para medir
 * cuántas veces se regenera algo) sin guardar el texto, que es información de
 * negocio del cliente. Se trunca a 16 caracteres: suficiente para agrupar,
 * inútil para reconstruir nada.
 */
export function fingerprint(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 16);
}

import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { AnalyticsEvent, AnalyticsSink } from './events.ts';

/** Acumula en memoria. Para tests y para inspección en desarrollo. */
export class MemorySink implements AnalyticsSink {
  readonly id = 'memory';
  readonly events: AnalyticsEvent[] = [];

  emit(event: AnalyticsEvent): void {
    this.events.push(event);
  }

  byName(name: string): AnalyticsEvent[] {
    return this.events.filter((event) => event.name === name);
  }

  clear(): void {
    this.events.length = 0;
  }
}

/**
 * Escribe una línea JSON por evento.
 *
 * Formato pensado para que `jq`, un `COPY` de Postgres o cualquier
 * recolector de logs lo ingieran sin transformación previa.
 *
 * Los fallos de escritura se tragan a propósito: la telemetría es un medio,
 * no el producto. Qué no se pueda escribir una métrica no puede impedir que
 * un equipo reciba su proyecto.
 */
export class JsonLinesSink implements AnalyticsSink {
  readonly id = 'jsonl';
  readonly #filePath: string;
  #failed = false;

  constructor(filePath: string) {
    this.#filePath = filePath;
  }

  async emit(event: AnalyticsEvent): Promise<void> {
    if (this.#failed) return;
    try {
      await mkdir(path.dirname(this.#filePath), { recursive: true });
      await appendFile(this.#filePath, `${JSON.stringify(event)}\n`, 'utf8');
    } catch {
      // Se avisa una sola vez: un log de telemetría que inunda el log real
      // es peor que no tener telemetría.
      this.#failed = true;
    }
  }

  get degraded(): boolean {
    return this.#failed;
  }
}

/** Reenvia a varios destinos. Habitual: memoria en desarrollo, fichero siempre. */
export class FanOutSink implements AnalyticsSink {
  readonly id = 'fan-out';
  readonly #sinks: readonly AnalyticsSink[];

  constructor(sinks: readonly AnalyticsSink[]) {
    this.#sinks = sinks;
  }

  async emit(event: AnalyticsEvent): Promise<void> {
    await Promise.all(this.#sinks.map((sink) => sink.emit(event)));
  }

  async flush(): Promise<void> {
    await Promise.all(this.#sinks.map((sink) => sink.flush?.()));
  }
}

import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { UsageQuery, UsageRecord, UsageStore } from '@calecosystem/contracts';

function matches(record: UsageRecord, query: UsageQuery): boolean {
  if (query.userId && record.userId !== query.userId) return false;
  if (query.projectId && record.projectId !== query.projectId) return false;
  if (query.operation && record.operation !== query.operation) return false;
  if (query.since && Date.parse(record.at) < query.since.getTime()) return false;
  return true;
}

/** Contador en memoria. Suficiente para una CLI de un solo uso y para tests. */
export class MemoryUsageStore implements UsageStore {
  readonly #records: UsageRecord[] = [];

  async record(entry: UsageRecord): Promise<void> {
    this.#records.push(entry);
  }

  async count(query: UsageQuery): Promise<number> {
    return this.#records
      .filter((record) => matches(record, query))
      .reduce((total, record) => total + record.quantity, 0);
  }

  async list(query: UsageQuery): Promise<UsageRecord[]> {
    return this.#records.filter((record) => matches(record, query));
  }

  /** Solo para tests: vacia el contador. */
  clear(): void {
    this.#records.length = 0;
  }
}

/**
 * Contador persistente en JSON Lines.
 *
 * Se elige JSONL y no JSON por una razon practica: anadir una linea es una
 * escritura atomica del sistema operativo, asi que dos procesos `calec`
 * concurrentes no se pisan el fichero. Un JSON completo habria que leerlo,
 * modificarlo y reescribirlo entero, que es donde se pierden registros.
 *
 * Es un contador local, no una fuente de verdad de facturacion: quien tiene
 * el fichero puede editarlo. La verdad, cuando esto sea un servicio, vive en
 * el servidor. Ver `docs/adr/0004-limites-de-uso.md`.
 */
export class JsonLinesUsageStore implements UsageStore {
  readonly #filePath: string;
  #cache: UsageRecord[] | null = null;

  constructor(filePath: string) {
    this.#filePath = filePath;
  }

  async record(entry: UsageRecord): Promise<void> {
    await mkdir(path.dirname(this.#filePath), { recursive: true });
    await appendFile(this.#filePath, `${JSON.stringify(entry)}\n`, 'utf8');
    if (this.#cache) this.#cache.push(entry);
  }

  async count(query: UsageQuery): Promise<number> {
    const records = await this.#load();
    return records
      .filter((record) => matches(record, query))
      .reduce((total, record) => total + record.quantity, 0);
  }

  async list(query: UsageQuery): Promise<UsageRecord[]> {
    const records = await this.#load();
    return records.filter((record) => matches(record, query));
  }

  async #load(): Promise<UsageRecord[]> {
    if (this.#cache) return this.#cache;
    let contents: string;
    try {
      contents = await readFile(this.#filePath, 'utf8');
    } catch {
      this.#cache = [];
      return this.#cache;
    }

    const records: UsageRecord[] = [];
    for (const line of contents.split('\n')) {
      if (line.trim() === '') continue;
      try {
        records.push(JSON.parse(line) as UsageRecord);
      } catch {
        // Una linea corrupta (escritura interrumpida) no puede invalidar todo
        // el historico: se descarta esa y se sigue.
        continue;
      }
    }
    this.#cache = records;
    return records;
  }
}

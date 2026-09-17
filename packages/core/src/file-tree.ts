import type { VirtualFile } from '@calecosystem/contracts';
import { GenerationError } from './errors.ts';

/**
 * Arbol de ficheros en memoria.
 *
 * Generar contra memoria y no contra disco es la decision que hace el
 * ecosistema testeable: los modulos pueden inspeccionar y ampliar el
 * resultado completo antes de que nada toque el sistema de ficheros, y los
 * tests comprueban el arbol sin E/S.
 */
export class FileTree {
  readonly #files = new Map<string, VirtualFile>();

  /**
   * Normaliza a ruta relativa POSIX y rechaza cualquier intento de escapar
   * del directorio del proyecto.
   */
  static normalizePath(rawPath: string): string {
    const unified = rawPath.replaceAll('\\', '/').trim();
    if (unified === '') {
      throw new GenerationError('INVALID_PATH', 'La ruta del fichero no puede estar vacia.');
    }
    if (unified.startsWith('/') || /^[a-zA-Z]:\//.test(unified)) {
      throw new GenerationError('INVALID_PATH', `Se esperaba una ruta relativa: "${rawPath}".`, {
        path: rawPath,
      });
    }
    const segments: string[] = [];
    for (const segment of unified.split('/')) {
      if (segment === '' || segment === '.') continue;
      if (segment === '..') {
        throw new GenerationError(
          'PATH_TRAVERSAL',
          `La ruta "${rawPath}" sale del directorio del proyecto.`,
          { path: rawPath },
        );
      }
      segments.push(segment);
    }
    if (segments.length === 0) {
      throw new GenerationError('INVALID_PATH', `Ruta no valida: "${rawPath}".`, { path: rawPath });
    }
    return segments.join('/');
  }

  get size(): number {
    return this.#files.size;
  }

  has(path: string): boolean {
    return this.#files.has(FileTree.normalizePath(path));
  }

  get(path: string): VirtualFile | undefined {
    return this.#files.get(FileTree.normalizePath(path));
  }

  /**
   * Anade un fichero. Un choque de rutas es un error salvo que el nuevo
   * fichero declare `overwrite`: preferimos un fallo ruidoso a que un plugin
   * pise en silencio la salida de otro.
   */
  add(file: VirtualFile): VirtualFile {
    const path = FileTree.normalizePath(file.path);
    const existing = this.#files.get(path);
    if (existing && !file.overwrite) {
      throw new GenerationError(
        'FILE_CONFLICT',
        `"${file.producedBy}" intenta escribir "${path}", ya generado por "${existing.producedBy}". ` +
          'Usa `overwrite: true` si la sustitucion es intencionada.',
        { path, existingProducer: existing.producedBy, newProducer: file.producedBy },
      );
    }
    const normalized: VirtualFile = { ...file, path };
    this.#files.set(path, normalized);
    return normalized;
  }

  addAll(files: Iterable<VirtualFile>): void {
    for (const file of files) this.add(file);
  }

  /** Ficheros ordenados por ruta: salida estable entre ejecuciones. */
  toArray(): VirtualFile[] {
    return [...this.#files.values()].sort((a, b) => a.path.localeCompare(b.path));
  }

  paths(): string[] {
    return this.toArray().map((file) => file.path);
  }

  totalBytes(): number {
    let total = 0;
    for (const file of this.#files.values()) total += Buffer.byteLength(file.contents, 'utf8');
    return total;
  }

  static from(files: Iterable<VirtualFile>): FileTree {
    const tree = new FileTree();
    tree.addAll(files);
    return tree;
  }
}

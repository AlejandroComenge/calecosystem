import { mkdir, writeFile, chmod, access } from 'node:fs/promises';
import path from 'node:path';
import type { VirtualFile } from '@calecosystem/contracts';
import { GenerationError } from './errors.ts';
import { FileTree } from './file-tree.ts';

export interface WriteOptions {
  /** No escribe nada; devuelve lo que se habria escrito. */
  readonly dryRun?: boolean;
  /** Permite sobrescribir ficheros existentes en destino. */
  readonly force?: boolean;
}

export interface WriteReport {
  readonly written: readonly string[];
  readonly skipped: readonly string[];
  readonly destination: string;
}

/**
 * Materializa el arbol virtual en disco.
 *
 * Es el unico punto del ecosistema que escribe ficheros del proyecto
 * generado. Por defecto no pisa nada: sobrescribir el trabajo de alguien es
 * exactamente el tipo de dano que un generador no debe causar por descuido.
 */
export async function writeFileTree(
  files: readonly VirtualFile[] | FileTree,
  destination: string,
  options: WriteOptions = {},
): Promise<WriteReport> {
  const list = files instanceof FileTree ? files.toArray() : [...files];
  const root = path.resolve(destination);
  const written: string[] = [];
  const skipped: string[] = [];

  for (const file of list) {
    const relative = FileTree.normalizePath(file.path);
    const target = path.join(root, relative);
    if (!target.startsWith(root + path.sep) && target !== root) {
      throw new GenerationError('PATH_TRAVERSAL', `La ruta "${file.path}" escapa del destino.`, {
        path: file.path,
      });
    }
    if (!options.force && (await exists(target))) {
      skipped.push(relative);
      continue;
    }
    if (options.dryRun) {
      written.push(relative);
      continue;
    }
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, file.contents, 'utf8');
    if (file.executable) await chmod(target, 0o755);
    written.push(relative);
  }

  return { written, skipped, destination: root };
}

async function exists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

import type { Plugin } from '@calecosystem/contracts';
import { PluginError } from './errors.ts';

export const DEFAULT_PLUGIN_PRIORITY = 100;

/**
 * Ordena plugins respetando `requires` y usando `priority` (y el nombre)
 * como desempate determinista.
 *
 * Kahn con cola ordenada: dos ejecuciones con el mismo conjunto de plugins
 * producen siempre el mismo orden, condición necesaria para que la
 * generación sea reproducible.
 */
export function resolvePluginOrder(plugins: readonly Plugin[]): Plugin[] {
  const byName = new Map<string, Plugin>();
  for (const plugin of plugins) {
    if (byName.has(plugin.name)) {
      throw new PluginError('DUPLICATE_PLUGIN', `El plugin "${plugin.name}" está registrado dos veces.`, {
        plugin: plugin.name,
      });
    }
    byName.set(plugin.name, plugin);
  }

  const pending = new Map<string, Set<string>>();
  const dependents = new Map<string, string[]>();

  for (const plugin of plugins) {
    const dependencies = new Set(plugin.requires ?? []);
    for (const dependency of dependencies) {
      if (!byName.has(dependency)) {
        throw new PluginError(
          'MISSING_DEPENDENCY',
          `El plugin "${plugin.name}" requiere "${dependency}", que no está registrado.`,
          { plugin: plugin.name, missing: dependency },
        );
      }
      dependents.set(dependency, [...(dependents.get(dependency) ?? []), plugin.name]);
    }
    pending.set(plugin.name, dependencies);
  }

  const ready = (): string[] =>
    [...pending.entries()]
      .filter(([, dependencies]) => dependencies.size === 0)
      .map(([name]) => name)
      .sort(byPriorityThenName(byName));

  const ordered: Plugin[] = [];
  let available = ready();

  while (available.length > 0) {
    const name = available[0] as string;
    pending.delete(name);
    ordered.push(byName.get(name) as Plugin);
    for (const dependent of dependents.get(name) ?? []) {
      pending.get(dependent)?.delete(name);
    }
    available = ready();
  }

  if (pending.size > 0) {
    const cycle = [...pending.keys()].sort();
    throw new PluginError(
      'CIRCULAR_DEPENDENCY',
      `Dependencias circulares entre plugins: ${cycle.join(' -> ')}.`,
      { plugins: cycle },
    );
  }

  return ordered;
}

function byPriorityThenName(byName: ReadonlyMap<string, Plugin>) {
  return (a: string, b: string): number => {
    const priorityA = byName.get(a)?.priority ?? DEFAULT_PLUGIN_PRIORITY;
    const priorityB = byName.get(b)?.priority ?? DEFAULT_PLUGIN_PRIORITY;
    return priorityA - priorityB || a.localeCompare(b);
  };
}

/** Valida la forma de un plugin antes de intentar registrarlo. */
export function assertValidPlugin(candidate: unknown): asserts candidate is Plugin {
  if (typeof candidate !== 'object' || candidate === null) {
    throw new PluginError('INVALID_PLUGIN', 'Un plugin debe ser un objeto.');
  }
  const plugin = candidate as Partial<Plugin>;
  if (typeof plugin.name !== 'string' || plugin.name.trim() === '') {
    throw new PluginError('INVALID_PLUGIN', 'Un plugin necesita un `name` no vacío.');
  }
  if (typeof plugin.version !== 'string' || plugin.version.trim() === '') {
    throw new PluginError('INVALID_PLUGIN', `El plugin "${plugin.name}" necesita un \`version\`.`, {
      plugin: plugin.name,
    });
  }
  if (typeof plugin.register !== 'function') {
    throw new PluginError(
      'INVALID_PLUGIN',
      `El plugin "${plugin.name}" necesita una función \`register\`.`,
      { plugin: plugin.name },
    );
  }
}

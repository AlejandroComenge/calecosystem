import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { type Plugin, type Tier, isTier } from '@calecosystem/contracts';
import { EcosystemError, toError } from './errors.ts';

export const CONFIG_FILENAME = 'calecosystem.config.json';

export interface PluginSpecifier {
  /** Especificador de modulo: nombre de paquete o ruta relativa. */
  readonly module: string;
  /** Export a usar. Por defecto `default`. */
  readonly export?: string;
  readonly options?: Record<string, unknown>;
  readonly enabled?: boolean;
}

export interface TelemetryConfig {
  /**
   * Desactivada por defecto.
   *
   * Una herramienta de desarrollo que empieza a escribir telemetria sin
   * preguntar pierde la confianza del equipo que la instala. Se activa
   * explicitamente y se documenta que se registra.
   */
  readonly enabled: boolean;
  /** Fichero JSONL de destino. */
  readonly file: string;
  /** Con `true` se registra tambien el texto de los requisitos. */
  readonly includeRequirementText: boolean;
}

export interface UsageConfig {
  /** Fichero donde se lleva el contador local de consumo. */
  readonly file: string;
  /** Con `true`, generar exige identificar al usuario. */
  readonly requireUser: boolean;
}

export interface EcosystemConfig {
  readonly tier: Tier;
  readonly plugins: readonly PluginSpecifier[];
  readonly generator: Readonly<Record<string, unknown>>;
  readonly output: string;
  readonly telemetry: TelemetryConfig;
  readonly usage: UsageConfig;
}

export const DEFAULT_CONFIG: EcosystemConfig = {
  tier: 'community',
  plugins: [],
  generator: {},
  output: './generated',
  telemetry: {
    enabled: false,
    file: './.calec/telemetry.jsonl',
    includeRequirementText: false,
  },
  usage: {
    file: './.calec/usage.jsonl',
    requireUser: false,
  },
};

/** Normaliza JSON arbitrario en una configuracion valida (sin lanzar por campos extra). */
export function normalizeConfig(raw: unknown): EcosystemConfig {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_CONFIG;
  const source = raw as Record<string, unknown>;
  const tier = isTier(source['tier']) ? source['tier'] : DEFAULT_CONFIG.tier;
  const plugins = Array.isArray(source['plugins'])
    ? source['plugins'].flatMap(normalizePluginSpecifier)
    : [];
  return {
    tier,
    plugins,
    generator:
      typeof source['generator'] === 'object' && source['generator'] !== null
        ? (source['generator'] as Record<string, unknown>)
        : {},
    output: typeof source['output'] === 'string' ? source['output'] : DEFAULT_CONFIG.output,
    telemetry: normalizeTelemetry(source['telemetry']),
    usage: normalizeUsage(source['usage']),
  };
}

function normalizeTelemetry(raw: unknown): TelemetryConfig {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_CONFIG.telemetry;
  const source = raw as Record<string, unknown>;
  return {
    enabled: source['enabled'] === true,
    file: typeof source['file'] === 'string' ? source['file'] : DEFAULT_CONFIG.telemetry.file,
    includeRequirementText: source['includeRequirementText'] === true,
  };
}

function normalizeUsage(raw: unknown): UsageConfig {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_CONFIG.usage;
  const source = raw as Record<string, unknown>;
  return {
    file: typeof source['file'] === 'string' ? source['file'] : DEFAULT_CONFIG.usage.file,
    requireUser: source['requireUser'] === true,
  };
}

function normalizePluginSpecifier(entry: unknown): PluginSpecifier[] {
  if (typeof entry === 'string') return [{ module: entry }];
  if (typeof entry !== 'object' || entry === null) return [];
  const source = entry as Record<string, unknown>;
  if (typeof source['module'] !== 'string') return [];
  if (source['enabled'] === false) return [];
  return [
    {
      module: source['module'],
      export: typeof source['export'] === 'string' ? source['export'] : 'default',
      options:
        typeof source['options'] === 'object' && source['options'] !== null
          ? (source['options'] as Record<string, unknown>)
          : {},
    },
  ];
}

/** Lee `calecosystem.config.json` del directorio dado. Devuelve defaults si no existe. */
export async function loadConfig(cwd: string = process.cwd()): Promise<EcosystemConfig> {
  const configPath = path.join(cwd, CONFIG_FILENAME);
  let contents: string;
  try {
    contents = await readFile(configPath, 'utf8');
  } catch {
    return DEFAULT_CONFIG;
  }
  try {
    return normalizeConfig(JSON.parse(contents));
  } catch (error) {
    throw new EcosystemError(
      'INVALID_CONFIG',
      `No se pudo interpretar "${configPath}": ${toError(error).message}`,
      { path: configPath },
    );
  }
}

/**
 * Carga dinamicamente los plugins declarados en la configuracion.
 *
 * Acepta tanto un plugin como una fabrica `(options) => Plugin`, que es la
 * forma habitual de distribuir plugins parametrizables.
 */
export async function loadPluginsFromConfig(
  config: EcosystemConfig,
  cwd: string = process.cwd(),
): Promise<Plugin[]> {
  const plugins: Plugin[] = [];
  for (const specifier of config.plugins) {
    const target = specifier.module.startsWith('.')
      ? pathToFileURL(path.resolve(cwd, specifier.module)).href
      : specifier.module;
    let namespace: Record<string, unknown>;
    try {
      namespace = (await import(target)) as Record<string, unknown>;
    } catch (error) {
      throw new EcosystemError(
        'PLUGIN_IMPORT_FAILED',
        `No se pudo importar el plugin "${specifier.module}": ${toError(error).message}`,
        { module: specifier.module },
      );
    }
    const exported = namespace[specifier.export ?? 'default'];
    const plugin = typeof exported === 'function'
      ? (exported as (options?: Record<string, unknown>) => Plugin)(specifier.options ?? {})
      : (exported as Plugin | undefined);
    if (!plugin) {
      throw new EcosystemError(
        'PLUGIN_EXPORT_NOT_FOUND',
        `El plugin "${specifier.module}" no exporta "${specifier.export ?? 'default'}".`,
        { module: specifier.module, export: specifier.export ?? 'default' },
      );
    }
    plugins.push(plugin);
  }
  return plugins;
}

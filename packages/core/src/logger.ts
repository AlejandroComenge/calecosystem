import type { Logger, LogLevel } from '@calecosystem/contracts';

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

export interface ConsoleLoggerOptions {
  readonly level?: LogLevel;
  readonly scope?: string;
  readonly sink?: (line: string, meta?: Record<string, unknown>) => void;
}

/** Logger mínimo sin dependencias. Sustituible por cualquier `Logger`. */
export function createLogger(options: ConsoleLoggerOptions = {}): Logger {
  const level = options.level ?? 'info';
  const scope = options.scope ?? '';
  const sink = options.sink ?? ((line: string) => process.stderr.write(`${line}\n`));
  const threshold = LEVEL_RANK[level];

  const write = (entryLevel: Exclude<LogLevel, 'silent'>) =>
    (message: string, meta?: Record<string, unknown>): void => {
      if (LEVEL_RANK[entryLevel] < threshold) return;
      const prefix = scope ? `[${entryLevel}] [${scope}]` : `[${entryLevel}]`;
      sink(`${prefix} ${message}`, meta);
    };

  return {
    debug: write('debug'),
    info: write('info'),
    warn: write('warn'),
    error: write('error'),
    child: (childScope: string) =>
      createLogger({ ...options, scope: scope ? `${scope}:${childScope}` : childScope }),
  };
}

/** Logger que descarta todo. Útil en tests. */
export function createSilentLogger(): Logger {
  return createLogger({ level: 'silent', sink: () => {} });
}

/** Logger que acumula las líneas en memoria. Útil para aserciones en tests. */
export function createMemoryLogger(level: LogLevel = 'debug'): {
  logger: Logger;
  lines: string[];
} {
  const lines: string[] = [];
  const logger = createLogger({ level, sink: (line) => void lines.push(line) });
  return { logger, lines };
}

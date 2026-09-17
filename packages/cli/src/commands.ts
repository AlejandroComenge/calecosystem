import { readFile } from 'node:fs/promises';
import type { GenerationResult, ModuleReport, Severity } from '@calecosystem/contracts';
import { EcosystemError, writeFileTree } from '@calecosystem/core';
import { CodeGenerator } from '@calecosystem/generator';
import { bootstrapEcosystem } from './bootstrap.ts';

export interface CommandOptions {
  readonly description?: string;
  readonly file?: string;
  readonly out?: string;
  readonly framework?: string;
  readonly database?: string;
  readonly deployment?: string;
  readonly name?: string;
  readonly dryRun?: boolean;
  readonly force?: boolean;
  readonly json?: boolean;
  readonly quiet?: boolean;
}

export interface CommandResult {
  readonly exitCode: number;
  readonly output: string;
}

const SEVERITY_ICON: Record<Severity, string> = {
  critical: '!!',
  high: '!',
  medium: '~',
  low: '-',
  info: 'i',
};

/** `calec generate`: analiza, planifica, genera y escribe el proyecto. */
export async function runGenerate(options: CommandOptions): Promise<CommandResult> {
  const text = await resolveDescription(options);
  const { kernel } = await bootstrapEcosystem({
    logger: options.quiet ? quietLogger() : undefined,
  });

  try {
    const generator = new CodeGenerator({
      kernel,
      planner: {
        ...(options.framework ? { defaultFrontend: options.framework as never } : {}),
        ...(options.database ? { defaultDatabase: options.database as never } : {}),
        ...(options.deployment ? { defaultDeployment: options.deployment as never } : {}),
      },
    });

    const result = await generator.generate({
      text,
      ...(options.name ? { projectName: options.name } : {}),
      hints: {
        ...(options.framework ? { frontend: options.framework } : {}),
        ...(options.database ? { database: options.database } : {}),
        ...(options.deployment ? { deployment: options.deployment } : {}),
      },
    });

    if (options.json) {
      return { exitCode: 0, output: JSON.stringify(summarize(result), null, 2) };
    }

    const destination = options.out ?? `./generated/${result.blueprint.slug}`;
    const report = await writeFileTree(result.files, destination, {
      dryRun: options.dryRun ?? false,
      force: options.force ?? false,
    });

    const lines = [
      ...renderResult(result),
      '',
      options.dryRun
        ? `Simulacion: se escribirian ${report.written.length} ficheros en ${report.destination}`
        : `Escritos ${report.written.length} ficheros en ${report.destination}`,
    ];
    if (report.skipped.length > 0) {
      lines.push(
        `Omitidos ${report.skipped.length} ficheros ya existentes (usa --force para sobrescribir).`,
      );
    }
    return { exitCode: blockingFindings(result.reports) > 0 ? 1 : 0, output: lines.join('\n') };
  } finally {
    await kernel.dispose();
  }
}

/** `calec plan`: muestra la arquitectura propuesta sin escribir nada. */
export async function runPlan(options: CommandOptions): Promise<CommandResult> {
  const text = await resolveDescription(options);
  const { kernel } = await bootstrapEcosystem({ logger: quietLogger() });

  try {
    const generator = new CodeGenerator({ kernel, runModules: false });
    const blueprint = await generator.plan({
      text,
      ...(options.name ? { projectName: options.name } : {}),
      hints: options.framework ? { frontend: options.framework } : {},
    });

    if (options.json) return { exitCode: 0, output: JSON.stringify(blueprint, null, 2) };

    const lines = [
      `Proyecto: ${blueprint.projectName}`,
      `Stack: ${blueprint.stack.frontend} + ${blueprint.stack.backend} + ${blueprint.stack.database}`,
      `Despliegue: ${blueprint.deployment.target}`,
      '',
      `Entidades (${blueprint.entities.length}):`,
      ...blueprint.entities.map((entity) => `  - ${entity.name} -> /api/${entity.plural}`),
      '',
      `Endpoints: ${blueprint.endpoints.length}  |  Vistas: ${blueprint.pages.length}`,
      '',
      'Decisiones:',
      ...blueprint.decisions.map((decision) => `  ${decision.id}: ${decision.choice} - ${decision.rationale}`),
    ];

    if (blueprint.requirements.openQuestions.length > 0) {
      lines.push('', 'Preguntas abiertas:');
      lines.push(...blueprint.requirements.openQuestions.map((question) => `  ? ${question}`));
    }
    return { exitCode: 0, output: lines.join('\n') };
  } finally {
    await kernel.dispose();
  }
}

/** `calec modules`: que hay cargado, con que licencia y que falta. */
export async function runModules(options: CommandOptions): Promise<CommandResult> {
  const { kernel } = await bootstrapEcosystem({ logger: quietLogger() });
  try {
    const diagnostics = kernel.diagnostics();
    if (options.json) return { exitCode: 0, output: JSON.stringify(diagnostics, null, 2) };

    const lines = [
      `Licencia activa: ${diagnostics.tier}`,
      '',
      `Plugins cargados (${diagnostics.plugins.length}):`,
      ...diagnostics.plugins.map((plugin) => `  - ${plugin.name}@${plugin.version}`),
      '',
      `Modulos disponibles (${diagnostics.modules.length}):`,
      ...diagnostics.modules.map((module) => `  - ${module.kind.padEnd(11)} ${module.id} [${module.status}]`),
      '',
      `Frameworks de frontend: ${diagnostics.frontendAdapters.join(', ') || 'ninguno'}`,
      `Runtimes de backend: ${diagnostics.backendAdapters.join(', ') || 'ninguno'}`,
      `Destinos de despliegue: ${diagnostics.deploymentAdapters.join(', ') || 'ninguno'}`,
    ];

    if (diagnostics.skippedPlugins.length > 0) {
      lines.push('', 'No disponibles con la licencia actual:');
      lines.push(
        ...diagnostics.skippedPlugins.map((plugin) => `  - ${plugin.name}: ${plugin.reason}`),
      );
    }
    return { exitCode: 0, output: lines.join('\n') };
  } finally {
    await kernel.dispose();
  }
}

/* --- Presentacion ----------------------------------------------------- */

function renderResult(result: GenerationResult): string[] {
  const lines = [
    `Proyecto: ${result.blueprint.projectName}`,
    `Stack: ${result.blueprint.stack.frontend} + ${result.blueprint.stack.backend} + ${result.blueprint.stack.database}`,
    `Confianza del analisis: ${(result.requirements.confidence * 100).toFixed(0)}%`,
    `Ficheros generados: ${result.metrics.fileCount} (${(result.metrics.totalBytes / 1024).toFixed(1)} KB)`,
    `Tiempo: ${result.metrics.durationMs.toFixed(0)} ms`,
  ];

  if (result.reports.length > 0) {
    lines.push('', 'Informes de los modulos:');
    for (const report of result.reports) {
      const score = report.score === null ? '--' : `${report.score}/100`;
      lines.push(`  [${report.kind}] ${score}  ${report.summary}`);
      for (const finding of report.findings.filter((candidate) => candidate.severity !== 'info')) {
        lines.push(`      ${SEVERITY_ICON[finding.severity]} ${finding.id}: ${finding.title}`);
      }
    }
  }

  if (result.warnings.length > 0) {
    lines.push('', 'Avisos:');
    lines.push(...result.warnings.map((warning) => `  ! ${warning}`));
  }
  return lines;
}

function summarize(result: GenerationResult) {
  return {
    projectName: result.blueprint.projectName,
    stack: result.blueprint.stack,
    confidence: result.requirements.confidence,
    files: result.files.map((file) => file.path),
    metrics: result.metrics,
    reports: result.reports.map((report) => ({
      module: report.module,
      kind: report.kind,
      score: report.score,
      summary: report.summary,
      findings: report.findings,
    })),
    warnings: result.warnings,
  };
}

function blockingFindings(reports: readonly ModuleReport[]): number {
  return reports
    .flatMap((report) => report.findings)
    .filter((finding) => finding.severity === 'critical').length;
}

async function resolveDescription(options: CommandOptions): Promise<string> {
  if (options.file) return readFile(options.file, 'utf8');
  if (options.description) return options.description;
  throw new EcosystemError(
    'MISSING_DESCRIPTION',
    'Falta la descripcion de requisitos. Pasala como argumento o usa --file <ruta>.',
  );
}

function quietLogger() {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    child() {
      return this;
    },
  };
}

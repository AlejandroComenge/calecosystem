import { readFile } from 'node:fs/promises';
import type { GenerationResult, ModuleReport, Severity } from '@calecosystem/contracts';
import { EcosystemError, writeFileTree } from '@calecosystem/core';
import { CodeGenerator } from '@calecosystem/generator';
import { DEFAULT_PLANS } from '@calecosystem/billing';
import { bootstrapEcosystem } from './bootstrap.ts';
import { SCENARIOS, scenarioById } from '../../../examples/scenarios.ts';

export interface CommandOptions {
  readonly description?: string;
  readonly user?: string;
  readonly tier?: string;
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
  const { kernel, principal } = await bootstrapEcosystem({
    logger: options.quiet ? quietLogger() : undefined,
    ...(options.user ? { userId: options.user } : {}),
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

    const result = await generator.generate(
      {
        text,
        ...(options.name ? { projectName: options.name } : {}),
        hints: {
          ...(options.framework ? { frontend: options.framework } : {}),
          ...(options.database ? { database: options.database } : {}),
          ...(options.deployment ? { deployment: options.deployment } : {}),
        },
      },
      principal ? { principal } : {},
    );

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
        ? `Simulación: se escribirían ${report.written.length} ficheros en ${report.destination}`
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
      `Módulos disponibles (${diagnostics.modules.length}):`,
      ...diagnostics.modules.map((module) => `  - ${module.kind.padEnd(11)} ${module.id} [${module.status}]`),
      '',
      `Frameworks de frontend: ${diagnostics.frontendAdapters.join(', ') || 'ninguno'}`,
      `Runtimes de backend: ${diagnostics.backendAdapters.join(', ') || 'ninguno'}`,
      `Destinos de despliegue: ${diagnostics.deploymentAdapters.join(', ') || 'ninguno'}`,
      '',
      `Plantillas de producto (${diagnostics.templates.length}):`,
      ...diagnostics.templates.map((template) => `  - ${template.kind.padEnd(10)} ${template.id} [${template.tier}]`),
      '',
      `Componentes en catálogo: ${diagnostics.components}`,
      `Middlewares activos: ${diagnostics.middlewares.join(', ') || 'ninguno'}`,
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

/** `calec usage`: consumo del período y límites del plan activo. */
export async function runUsage(options: CommandOptions): Promise<CommandResult> {
  const { kernel, principal, usageGuard } = await bootstrapEcosystem({
    logger: quietLogger(),
    ...(options.user ? { userId: options.user } : {}),
  });

  try {
    if (!principal) {
      return {
        exitCode: 1,
        output:
          'No hay usuario identificado. Usa --user <id> o define CALEC_USER_ID ' +
          'para que se apliquen y se midan las cuotas.',
      };
    }
    if (!usageGuard) {
      return { exitCode: 1, output: 'El plugin de facturación no está cargado.' };
    }

    const summary = await usageGuard.summary(principal);
    if (options.json) {
      return {
        exitCode: 0,
        output: JSON.stringify({ principal, quotas: summary }, null, 2),
      };
    }

    const lines = [`Usuario: ${principal.userId}`, `Plan: ${principal.tier}`, ''];
    for (const decision of summary) {
      const limit = decision.limit === null ? 'sin limite' : String(decision.limit);
      const bar = decision.limit === null ? '' : `  ${usageBar(decision.used, decision.limit)}`;
      lines.push(
        `  ${decision.operation.padEnd(11)} ${String(decision.used).padStart(4)} / ${limit.padEnd(11)}${bar}`,
      );
    }

    const exhausted = summary.filter((decision) => !decision.allowed);
    if (exhausted.length > 0) {
      lines.push('', 'Limites alcanzados:');
      for (const decision of exhausted) {
        lines.push(`  ! ${decision.operation}: ${decision.reason ?? 'cuota agotada'}`);
      }
      const upgrade = exhausted.find((decision) => decision.upgradeTo)?.upgradeTo;
      if (upgrade) lines.push('', `Sube de plan con: calec upgrade --tier ${upgrade}`);
    }

    const reset = summary.find((decision) => decision.resetAt)?.resetAt;
    if (reset) lines.push('', `El contador mensual se reinicia el ${reset.slice(0, 10)}.`);

    return { exitCode: 0, output: lines.join('\n') };
  } finally {
    await kernel.dispose();
  }
}

/** `calec upgrade`: explica el cambio de plan y prepara el pago si hay Stripe. */
export async function runUpgrade(options: CommandOptions): Promise<CommandResult> {
  const target = options.tier;
  if (!target || !['community', 'pro', 'enterprise'].includes(target)) {
    return {
      exitCode: 1,
      output: 'Indica el plan destino: calec upgrade --tier pro|enterprise',
    };
  }

  const plan = DEFAULT_PLANS.find((candidate) => candidate.tier === target);
  if (!plan) return { exitCode: 1, output: `Plan desconocido: ${target}` };

  const configured = Boolean(process.env['STRIPE_SECRET_KEY'] && process.env['STRIPE_WEBHOOK_SECRET']);
  const price =
    plan.amount === 0
      ? 'gratuito'
      : `${(plan.amount / 100).toFixed(2)} ${plan.currency.toUpperCase()}/${plan.interval === 'month' ? 'mes' : 'ano'}`;

  const lines = [
    `Plan ${plan.name} - ${price}`,
    '',
    'Incluye:',
    ...plan.highlights.map((highlight) => `  - ${highlight}`),
    '',
  ];

  if (!configured) {
    // Honestidad por delante: sin claves no hay cobro posible, y decirlo
    // es mejor que abrir una URL que va a fallar.
    lines.push(
      'Stripe no está configurado en esta instalación, así que no se puede iniciar el pago.',
      'Define STRIPE_SECRET_KEY y STRIPE_WEBHOOK_SECRET, y asigna el `priceId` de cada plan.',
      '',
      'Mientras tanto, para probar el plan superior en local:',
      `  CALEC_LICENSE_TIER=${target} calec generate "..."`,
    );
    return { exitCode: 1, output: lines.join('\n') };
  }

  lines.push(
    'Stripe configurado. Crea la sesión de pago desde tu backend con:',
    '',
    '  const provider = new StripeBillingProvider({ secretKey, webhookSecret, plans });',
    '  const session = await provider.createCheckoutSession({',
    `    principal: { userId }, targetTier: '${target}',`,
    "    successUrl: '...', cancelUrl: '...',",
    '  });',
    '',
    'El CLI no abre la sesión directamente: el pago debe iniciarse desde un',
    'servicio con la clave secreta, nunca desde la maquina de un usuario.',
  );
  return { exitCode: 0, output: lines.join('\n') };
}

/** `calec templates`: plantillas disponibles y cual encajaria con un enunciado. */
export async function runTemplates(options: CommandOptions): Promise<CommandResult> {
  const { kernel } = await bootstrapEcosystem({ logger: quietLogger() });

  try {
    const templates = kernel.templates();
    if (options.json) {
      return {
        exitCode: 0,
        output: JSON.stringify(
          templates.map((template) => ({
            id: template.id,
            name: template.name,
            kind: template.kind,
            tier: template.tier,
            description: template.description,
            frameworks: template.frameworks ?? [],
          })),
          null,
          2,
        ),
      };
    }

    const lines = [`Plantillas disponibles (${templates.length}):`, ''];
    for (const template of templates) {
      lines.push(`  ${template.name} [${template.kind}] - ${template.description}`);
      lines.push(`    frameworks: ${(template.frameworks ?? ['todos']).join(', ')}  tier: ${template.tier}`);
    }

    // Si además dan un enunciado, se muestra el encaje de cada una.
    const description = options.description ?? (options.file ? await readFile(options.file, 'utf8') : '');
    if (description.trim().length >= 10) {
      const generator = new CodeGenerator({ kernel, runModules: false, useTemplates: false });
      const blueprint = await generator.plan({ text: description });
      lines.push('', 'Encaje con el enunciado dado:', '');
      for (const template of templates) {
        const match = template.detect(blueprint.requirements);
        const signals = match.signals.slice(0, 4).join(', ');
        lines.push(
          `  ${String(Math.round(match.score * 100)).padStart(3)}%  ${template.name}` +
            (signals ? `  (${signals})` : ''),
        );
      }
    }

    return { exitCode: 0, output: lines.join('\n') };
  } finally {
    await kernel.dispose();
  }
}

/**
 * `calec examples`: catálogo de ejemplos listos para copiar y pegar.
 *
 * Existe para que alguien que no programa pueda probar el producto sin
 * inventarse un enunciado. Con un id concreto (`calec examples tienda`)
 * imprime el comando completo de ese caso.
 */
export async function runExamples(options: CommandOptions): Promise<CommandResult> {
  const requested = options.description?.trim();

  if (requested) {
    const scenario = scenarioById(requested);
    if (!scenario) {
      return {
        exitCode: 1,
        output:
          `No existe el ejemplo "${requested}".\n\n` +
          `Disponibles: ${SCENARIOS.map((candidate) => candidate.id).join(', ')}`,
      };
    }
    if (options.json) return { exitCode: 0, output: JSON.stringify(scenario, null, 2) };

    return {
      exitCode: 0,
      output: [
        `${scenario.title}`,
        `Para: ${scenario.audience}`,
        '',
        'Enunciado:',
        ...wrap(scenario.brief, 74).map((line) => `  ${line}`),
        '',
        'Copia y pega este comando:',
        '',
        `  npm run calec -- generate "${scenario.brief}"` +
          (scenario.framework ? ` --framework ${scenario.framework}` : '') +
          ` --out ./pruebas/${scenario.id}`,
        '',
        'Debería generar, entre otros:',
        ...scenario.expectFiles.map((file) => `  - ${file}`),
      ].join('\n'),
    };
  }

  if (options.json) return { exitCode: 0, output: JSON.stringify(SCENARIOS, null, 2) };

  const lines = [
    `Ejemplos disponibles (${SCENARIOS.length}). Para ver uno: calec examples <id>`,
    '',
  ];
  for (const scenario of SCENARIOS) {
    lines.push(`  ${scenario.id.padEnd(16)} ${scenario.title}`);
    lines.push(`  ${' '.repeat(16)} ${scenario.audience}`);
    lines.push('');
  }
  lines.push('Para probarlos todos de golpe: npm run validate');

  return { exitCode: 0, output: lines.join('\n') };
}

/* --- Presentación ----------------------------------------------------- */

/** Parte un texto en líneas de ancho máximo, sin cortar palabras. */
function wrap(text: string, width: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if (current === '') current = word;
    else if (current.length + 1 + word.length <= width) current += ` ${word}`;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current !== '') lines.push(current);
  return lines;
}


/** Barra de consumo en texto. Un número se lee; una barra se entiende. */
function usageBar(used: number, limit: number, width = 20): string {
  const filled = Math.min(width, Math.round((used / Math.max(1, limit)) * width));
  return `[${'#'.repeat(filled)}${'.'.repeat(width - filled)}]`;
}


function renderResult(result: GenerationResult): string[] {
  const lines = [
    `Proyecto: ${result.blueprint.projectName}`,
    `Stack: ${result.blueprint.stack.frontend} + ${result.blueprint.stack.backend} + ${result.blueprint.stack.database}`,
    `Confianza del análisis: ${(result.requirements.confidence * 100).toFixed(0)}%`,
    result.template
      ? `Plantilla: ${result.template.name} (encaje ${(result.template.score * 100).toFixed(0)}%)`
      : 'Plantilla: ninguna (CRUD deducido del enunciado)',
    `Ficheros: ${result.metrics.fileCount} | Líneas: ${result.metrics.lineCount} | ` +
      `Componentes: ${result.metrics.componentCount} | ${(result.metrics.totalBytes / 1024).toFixed(1)} KB`,
    `Tiempo: ${result.metrics.durationMs.toFixed(0)} ms`,
  ];

  if (result.reports.length > 0) {
    lines.push('', 'Informes de los módulos:');
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
    template: result.template,
    dependencyConflicts: result.dependencyConflicts,
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

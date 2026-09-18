import type {
  AppliedTemplate,
  Blueprint,
  DependencyConflict,
  DeploymentPlan,
  GenerationContext,
  GenerationMetrics,
  GenerationResult,
  Logger,
  ModuleReport,
  ModuleRunContext,
  PipelinePhase,
  Principal,
  ProjectTemplate,
  RequirementsInput,
  RequirementsModel,
  VirtualFile,
} from '@calecosystem/contracts';
import { FileTree, GenerationError, toError, type EcosystemKernel } from '@calecosystem/core';
import { randomUUID } from 'node:crypto';
import { RequirementsAnalyzer } from './analysis/requirements-analyzer.ts';
import { ArchitecturePlanner, type PlannerOptions } from './planning/architecture-planner.ts';
import { Scaffolder } from './scaffold/scaffolder.ts';

export interface GeneratorOptions {
  readonly kernel: EcosystemKernel;
  readonly logger?: Logger;
  readonly planner?: Omit<PlannerOptions, 'logger'>;
  /**
   * Con `false` se omite la fase `augment`: útil para previsualizar el
   * scaffolding puro sin esperar a optimizador, auditor, tests ni docs.
   */
  readonly runModules?: boolean;
  /** Con `false` no se aplica ninguna plantilla de producto. */
  readonly useTemplates?: boolean;
}

export interface GenerateOptions {
  /** Quien lanza la generación. Necesario para que apliquen las cuotas. */
  readonly principal?: Principal;
  /** Identificador propio de la ejecución; si falta se genera uno. */
  readonly requestId?: string;
}

/**
 * Generador de código base: el módulo principal del ecosistema.
 *
 * El pipeline tiene cinco fases y cada una pública sus hooks:
 *
 *   analyze  -> requirements:analyzed   (transform)
 *   plan     -> blueprint:planned       (transform)
 *              deployment:planned       (transform)
 *   scaffold -> árbol virtual de ficheros
 *   augment  -> los otros cuatro módulos aportan informes y ficheros
 *   finalize -> files:finalized         (transform)
 *              generation:completed     (evento)
 *
 * La regla que sostiene todo: nada se escribe en disco hasta que el árbol
 * completo existe en memoria y todos los módulos han opinado sobre el.
 */
export class CodeGenerator {
  readonly #kernel: EcosystemKernel;
  readonly #logger: Logger;
  readonly #options: GeneratorOptions;

  constructor(options: GeneratorOptions) {
    this.#kernel = options.kernel;
    this.#logger = (options.logger ?? options.kernel.logger).child('generator');
    this.#options = options;
  }

  /**
   * Ejecuta el pipeline completo.
   *
   * La ejecución va envuelta en la cadena de middlewares del kernel, que es
   * donde viven las cuotas y la telemetría. Un middleware puede rechazar la
   * petición antes de que se analice una sola palabra.
   */
  async generate(
    input: RequirementsInput,
    options: GenerateOptions = {},
  ): Promise<GenerationResult> {
    const requestId = options.requestId ?? randomUUID();
    const context: GenerationContext = {
      input,
      ...(options.principal ? { principal: options.principal } : {}),
      logger: this.#logger,
      requestId,
      state: new Map<string, unknown>(),
    };

    return this.#kernel.middleware.run(context, () => this.#runPipeline(input, requestId));
  }

  async #runPipeline(input: RequirementsInput, requestId: string): Promise<GenerationResult> {
    const startedAt = performance.now();
    const phaseTimings: Partial<Record<PipelinePhase, number>> = {};
    const warnings: string[] = [];
    let phase: PipelinePhase = 'analyze';
    let applied: AppliedTemplate | null = null;
    let template: ProjectTemplate | undefined;

    try {
      const requirements = await this.#runPhase('analyze', phaseTimings, async () => {
        phase = 'analyze';
        return this.#analyze(input);
      });

      const blueprint = await this.#runPhase('plan', phaseTimings, async () => {
        phase = 'plan';
        const selection = this.#selectTemplate(requirements);
        if (selection) {
          template = selection.template;
          applied = {
            id: selection.template.id,
            name: selection.template.name,
            kind: String(selection.template.kind),
            score: selection.score,
            signals: selection.signals,
          };
        }
        return this.#plan(requirements, warnings, template);
      });

      const outcome = await this.#runPhase('scaffold', phaseTimings, async () => {
        phase = 'scaffold';
        return new Scaffolder({
          kernel: this.#kernel,
          logger: this.#logger,
          ...(template ? { template } : {}),
        }).scaffold(blueprint);
      });

      for (const conflict of outcome.conflicts) {
        warnings.push(
          `Conflicto de version en "${conflict.name}" (${conflict.workspace}): se usa ` +
            `${conflict.resolved}; tambien se pidio ` +
            `${conflict.requests.map((request) => request.version).join(', ')}.`,
        );
      }

      const reports = await this.#runPhase('augment', phaseTimings, async () => {
        phase = 'augment';
        return this.#augment(blueprint, outcome.tree, warnings);
      });

      return await this.#runPhase('finalize', phaseTimings, async () => {
        phase = 'finalize';
        const files = await this.#kernel.hooks.applyTransform('files:finalized', outcome.tree.toArray());
        const metrics = buildMetrics(startedAt, files, phaseTimings, outcome.componentCount);
        const result: GenerationResult = {
          requirements,
          blueprint,
          files,
          reports,
          warnings,
          metrics,
          template: applied,
          dependencyConflicts: outcome.conflicts as readonly DependencyConflict[],
          requestId,
        };
        await this.#kernel.hooks.emit('generation:completed', result);
        this.#logger.info(
          `Generación completada: ${files.length} ficheros, ${metrics.lineCount} líneas, ` +
            `${reports.length} informes, ${metrics.durationMs.toFixed(0)} ms.`,
        );
        return result;
      });
    } catch (error) {
      const failure = toError(error);
      await this.#kernel.hooks.emit('generation:failed', { error: failure, phase });
      throw failure;
    }
  }

  /** Plantilla que mejor encaja, salvo que se hayan desactivado. */
  #selectTemplate(requirements: RequirementsModel) {
    if (this.#options.useTemplates === false) return undefined;
    const framework = this.#options.planner?.defaultFrontend ?? requirements.hints.frontend;
    const selection = this.#kernel.selectTemplate(
      requirements,
      framework ?? 'react',
    );
    if (selection) {
      this.#logger.info(
        `Plantilla "${selection.template.name}" aplicada (encaje ${(selection.score * 100).toFixed(0)}%).`,
      );
    }
    return selection;
  }

  /** Solo analiza y planifica: útil para previsualizar sin generar ficheros. */
  async plan(input: RequirementsInput): Promise<Blueprint> {
    const requirements = await this.#analyze(input);
    const selection = this.#selectTemplate(requirements);
    return this.#plan(requirements, [], selection?.template);
  }

  async #analyze(input: RequirementsInput): Promise<RequirementsModel> {
    if (!input.text || input.text.trim().length < 10) {
      throw new GenerationError(
        'EMPTY_REQUIREMENTS',
        'La descripción de requisitos es demasiado corta para deducir una arquitectura. ' +
          'Describe que hace el producto, quien lo usa y que gestiona.',
        { received: input.text?.length ?? 0 },
      );
    }
    const analyzer = new RequirementsAnalyzer({
      logger: this.#logger,
      enrichers: this.#kernel.requirementsEnrichers(),
    });
    const draft = await analyzer.analyze(input);
    return this.#kernel.hooks.applyTransform('requirements:analyzed', draft);
  }

  async #plan(
    requirements: RequirementsModel,
    warnings: string[] = [],
    template?: ProjectTemplate,
  ): Promise<Blueprint> {
    const planner = new ArchitecturePlanner({ logger: this.#logger, ...this.#options.planner });
    let planned = planner.plan(requirements);

    // La plantilla completa el blueprint ANTES de reconciliar capacidades:
    // puede añadir entidades y vistas, pero no puede exigir un adaptador
    // que esta instalación no tenga.
    if (template) planned = template.refine(planned);

    const draft = this.#reconcileWithCapabilities(planned, warnings);

    // El plan de despliegue se expone por separado porque es lo que más
    // varia entre clientes: el mismo producto va a Docker en una PYME y a
    // Kubernetes en una corporación.
    const deployment: DeploymentPlan = await this.#kernel.hooks.applyTransform(
      'deployment:planned',
      draft.deployment,
    );
    return this.#kernel.hooks.applyTransform('blueprint:planned', { ...draft, deployment });
  }

  /**
   * Ajusta el blueprint a lo que el kernel sabe generar de verdad.
   *
   * El planificador decide con criterios de arquitectura, sin saber que
   * adaptadores hay instalados. Sin este paso, el blueprint podría prometer
   * un runtime que nadie puede materializar, y el README del proyecto
   * generado describiria un stack distinto del que tiene delante. Un
   * documento que miente sobre su propio código es peor que no tenerlo.
   */
  #reconcileWithCapabilities(blueprint: Blueprint, warnings: string[]): Blueprint {
    let reconciled = blueprint;

    if (!this.#kernel.backendAdapter(reconciled.stack.backend)) {
      const fallback = this.#kernel.listBackendRuntimes()[0];
      if (fallback) {
        warnings.push(
          `No hay adaptador para el backend "${reconciled.stack.backend}"; se genera con "${fallback}".`,
        );
        reconciled = {
          ...reconciled,
          stack: { ...reconciled.stack, backend: fallback as Blueprint['stack']['backend'] },
          decisions: [
            ...reconciled.decisions,
            {
              id: 'ADR-BACKEND-SUSTITUIDO',
              title: 'Sustitución del runtime de backend',
              choice: fallback,
              rationale:
                `La arquitectura pedia "${blueprint.stack.backend}", pero esta instalación no tiene ` +
                'ese adaptador. Se genera con el disponible y se deja constancia para poder migrar después.',
              alternatives: [blueprint.stack.backend],
            },
          ],
        };
      }
    }

    if (!this.#kernel.deploymentAdapter(reconciled.deployment.target)) {
      const fallback = this.#kernel.listDeploymentTargets()[0];
      if (fallback) {
        warnings.push(
          `No hay adaptador para el despliegue "${reconciled.deployment.target}"; se genera con "${fallback}".`,
        );
        reconciled = {
          ...reconciled,
          deployment: {
            ...reconciled.deployment,
            target: fallback as Blueprint['deployment']['target'],
          },
        };
      }
    }

    return reconciled;
  }

  /**
   * Fase de ampliación: aquí se enchufan los otros cuatro módulos.
   *
   * Un módulo que falla no tumba la generación. Si el auditor de seguridad
   * se cae, el equipo debe recibir igualmente su proyecto y un aviso claro
   * de que la auditoría no se ejecuto.
   */
  async #augment(blueprint: Blueprint, tree: FileTree, warnings: string[]): Promise<ModuleReport[]> {
    if (this.#options.runModules === false) return [];

    const reports: ModuleReport[] = [];
    for (const module of this.#kernel.augmentModules()) {
      const { descriptor } = module;
      const emitted: string[] = [];
      const context: ModuleRunContext = {
        requirements: blueprint.requirements,
        blueprint,
        files: tree.toArray(),
        logger: this.#logger.child(descriptor.kind),
        emit: (candidate: VirtualFile) => {
          const added = tree.add(candidate);
          emitted.push(added.path);
          void this.#kernel.hooks.emit('file:emitted', { file: added });
        },
        warn: (message: string) => void warnings.push(`[${descriptor.kind}] ${message}`),
      };

      await this.#kernel.hooks.emit('module:before-run', { descriptor });
      const moduleStart = performance.now();
      try {
        const report = await module.run(context);
        const enriched: ModuleReport = {
          ...report,
          emittedFiles: report.emittedFiles.length > 0 ? report.emittedFiles : emitted,
          durationMs: report.durationMs || performance.now() - moduleStart,
        };
        reports.push(enriched);
        await this.#kernel.hooks.emit('module:after-run', { descriptor, report: enriched });
      } catch (error) {
        const message = toError(error).message;
        warnings.push(`El módulo "${descriptor.id}" fallo y se omitio: ${message}`);
        this.#logger.error(`Módulo "${descriptor.id}" fallido: ${message}`);
      }
    }
    return reports;
  }

  async #runPhase<T>(
    phase: PipelinePhase,
    timings: Partial<Record<PipelinePhase, number>>,
    work: () => Promise<T>,
  ): Promise<T> {
    await this.#kernel.hooks.emit('pipeline:phase-start', { phase });
    const start = performance.now();
    const result = await work();
    const durationMs = performance.now() - start;
    timings[phase] = durationMs;
    await this.#kernel.hooks.emit('pipeline:phase-end', { phase, durationMs });
    return result;
  }
}

function buildMetrics(
  startedAt: number,
  files: readonly VirtualFile[],
  phaseTimings: Partial<Record<PipelinePhase, number>>,
  componentCount: number,
): GenerationMetrics {
  let totalBytes = 0;
  let lineCount = 0;
  for (const file of files) {
    totalBytes += Buffer.byteLength(file.contents, 'utf8');
    // Se cuentan líneas no vacías: es la cifra que un equipo reconoceria
    // como "código escrito", y la que no se infla con espaciado.
    for (const line of file.contents.split('\n')) {
      if (line.trim() !== '') lineCount += 1;
    }
  }
  return {
    durationMs: performance.now() - startedAt,
    fileCount: files.length,
    totalBytes,
    lineCount,
    componentCount,
    phaseTimings,
  };
}

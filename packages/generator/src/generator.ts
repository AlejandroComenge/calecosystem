import type {
  Blueprint,
  DeploymentPlan,
  GenerationMetrics,
  GenerationResult,
  Logger,
  ModuleReport,
  ModuleRunContext,
  PipelinePhase,
  RequirementsInput,
  RequirementsModel,
  VirtualFile,
} from '@calecosystem/contracts';
import { FileTree, GenerationError, toError, type EcosystemKernel } from '@calecosystem/core';
import { RequirementsAnalyzer } from './analysis/requirements-analyzer.ts';
import { ArchitecturePlanner, type PlannerOptions } from './planning/architecture-planner.ts';
import { Scaffolder } from './scaffold/scaffolder.ts';

export interface GeneratorOptions {
  readonly kernel: EcosystemKernel;
  readonly logger?: Logger;
  readonly planner?: Omit<PlannerOptions, 'logger'>;
  /**
   * Con `false` se omite la fase `augment`: util para previsualizar el
   * scaffolding puro sin esperar a optimizador, auditor, tests ni docs.
   */
  readonly runModules?: boolean;
}

/**
 * Generador de codigo base: el modulo principal del ecosistema.
 *
 * El pipeline tiene cinco fases y cada una publica sus hooks:
 *
 *   analyze  -> requirements:analyzed   (transform)
 *   plan     -> blueprint:planned       (transform)
 *              deployment:planned       (transform)
 *   scaffold -> arbol virtual de ficheros
 *   augment  -> los otros cuatro modulos aportan informes y ficheros
 *   finalize -> files:finalized         (transform)
 *              generation:completed     (evento)
 *
 * La regla que sostiene todo: nada se escribe en disco hasta que el arbol
 * completo existe en memoria y todos los modulos han opinado sobre el.
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

  async generate(input: RequirementsInput): Promise<GenerationResult> {
    const startedAt = performance.now();
    const phaseTimings: Partial<Record<PipelinePhase, number>> = {};
    const warnings: string[] = [];
    let phase: PipelinePhase = 'analyze';

    try {
      const requirements = await this.#runPhase('analyze', phaseTimings, async () => {
        phase = 'analyze';
        return this.#analyze(input);
      });

      const blueprint = await this.#runPhase('plan', phaseTimings, async () => {
        phase = 'plan';
        return this.#plan(requirements, warnings);
      });

      const tree = await this.#runPhase('scaffold', phaseTimings, async () => {
        phase = 'scaffold';
        return new Scaffolder({ kernel: this.#kernel, logger: this.#logger }).scaffold(blueprint);
      });

      const reports = await this.#runPhase('augment', phaseTimings, async () => {
        phase = 'augment';
        return this.#augment(blueprint, tree, warnings);
      });

      return await this.#runPhase('finalize', phaseTimings, async () => {
        phase = 'finalize';
        const files = await this.#kernel.hooks.applyTransform('files:finalized', tree.toArray());
        const metrics = buildMetrics(startedAt, files, phaseTimings);
        const result: GenerationResult = {
          requirements,
          blueprint,
          files,
          reports,
          warnings,
          metrics,
        };
        await this.#kernel.hooks.emit('generation:completed', result);
        this.#logger.info(
          `Generacion completada: ${files.length} ficheros, ${reports.length} informes, ` +
            `${metrics.durationMs.toFixed(0)} ms.`,
        );
        return result;
      });
    } catch (error) {
      const failure = toError(error);
      await this.#kernel.hooks.emit('generation:failed', { error: failure, phase });
      throw failure;
    }
  }

  /** Solo analiza y planifica: util para previsualizar sin generar ficheros. */
  async plan(input: RequirementsInput): Promise<Blueprint> {
    return this.#plan(await this.#analyze(input));
  }

  async #analyze(input: RequirementsInput): Promise<RequirementsModel> {
    if (!input.text || input.text.trim().length < 10) {
      throw new GenerationError(
        'EMPTY_REQUIREMENTS',
        'La descripcion de requisitos es demasiado corta para deducir una arquitectura. ' +
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

  async #plan(requirements: RequirementsModel, warnings: string[] = []): Promise<Blueprint> {
    const planner = new ArchitecturePlanner({ logger: this.#logger, ...this.#options.planner });
    const draft = this.#reconcileWithCapabilities(planner.plan(requirements), warnings);

    // El plan de despliegue se expone por separado porque es lo que mas
    // varia entre clientes: el mismo producto va a Docker en una PYME y a
    // Kubernetes en una corporacion.
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
   * adaptadores hay instalados. Sin este paso, el blueprint podria prometer
   * un runtime que nadie puede materializar, y el README del proyecto
   * generado describiria un stack distinto del que tiene delante. Un
   * documento que miente sobre su propio codigo es peor que no tenerlo.
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
              title: 'Sustitucion del runtime de backend',
              choice: fallback,
              rationale:
                `La arquitectura pedia "${blueprint.stack.backend}", pero esta instalacion no tiene ` +
                'ese adaptador. Se genera con el disponible y se deja constancia para poder migrar despues.',
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
   * Fase de ampliacion: aqui se enchufan los otros cuatro modulos.
   *
   * Un modulo que falla no tumba la generacion. Si el auditor de seguridad
   * se cae, el equipo debe recibir igualmente su proyecto y un aviso claro
   * de que la auditoria no se ejecuto.
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
        warnings.push(`El modulo "${descriptor.id}" fallo y se omitio: ${message}`);
        this.#logger.error(`Modulo "${descriptor.id}" fallido: ${message}`);
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
): GenerationMetrics {
  let totalBytes = 0;
  for (const file of files) totalBytes += Buffer.byteLength(file.contents, 'utf8');
  return {
    durationMs: performance.now() - startedAt,
    fileCount: files.length,
    totalBytes,
    phaseTimings,
  };
}

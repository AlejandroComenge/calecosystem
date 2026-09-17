import { type Plugin, definePlugin } from '@calecosystem/contracts';
import { type AnalyticsEvent, type AnalyticsSink, fingerprint } from './events.ts';
import { MemorySink } from './sinks.ts';

export interface TelemetryPluginOptions {
  readonly sink?: AnalyticsSink;
  /**
   * Con `true` se registra el texto completo de los requisitos.
   *
   * Por defecto NO. Ese texto es la descripcion del negocio del cliente, y
   * un fichero de telemetria no es sitio para guardarla. Se registra solo su
   * huella, que sirve para agrupar sin revelar nada.
   */
  readonly includeRequirementText?: boolean;
  /** Etiquetas fijas anadidas a cada evento (entorno, version, instalacion). */
  readonly tags?: Readonly<Record<string, string>>;
}

/**
 * Plugin de telemetria.
 *
 * Se apoya por completo en los hooks que ya publica el pipeline: no toca el
 * generador ni conoce su interior. Es la prueba de que el sistema de
 * extension sirve para algo real, y a la vez la fuente de datos para decidir
 * que mejorar del producto.
 *
 * Lo que se mide y por que:
 *  - duracion por fase -> donde invertir en rendimiento;
 *  - plantilla elegida y encaje -> si la deteccion acierta;
 *  - hallazgos por modulo -> que problemas genera el propio generador;
 *  - fallos y su fase -> donde se rompe en manos de clientes.
 */
export function telemetryPlugin(options: TelemetryPluginOptions = {}): Plugin {
  const sink: AnalyticsSink = options.sink ?? new MemorySink();
  const tags = options.tags ?? {};
  let currentRequestId = 'unknown';

  const emit = (name: string, properties: Record<string, unknown>): void => {
    const event: AnalyticsEvent = {
      name,
      at: new Date().toISOString(),
      requestId: currentRequestId,
      properties: { ...tags, ...properties },
    };
    void sink.emit(event);
  };

  return definePlugin({
    name: '@calecosystem/telemetry',
    version: '0.2.0',
    description: 'Registro estructurado de uso a partir de los hooks del pipeline.',
    tier: 'community',
    priority: 20,

    register(api) {
      api.onEvent('pipeline:phase-start', ({ phase }) => {
        emit('phase.started', { phase });
      });

      api.onEvent('pipeline:phase-end', ({ phase, durationMs }) => {
        emit('phase.completed', { phase, durationMs: Math.round(durationMs) });
      });

      api.onEvent('module:after-run', ({ descriptor, report }) => {
        emit('module.completed', {
          module: descriptor.id,
          kind: descriptor.kind,
          score: report.score,
          findings: report.findings.length,
          criticalFindings: report.findings.filter((finding) => finding.severity === 'critical').length,
          durationMs: Math.round(report.durationMs),
        });
      });

      // La transformacion se usa solo para observar; devuelve el valor intacto.
      api.onTransform(
        'requirements:analyzed',
        (requirements) => {
          emit('requirements.analyzed', {
            fingerprint: fingerprint(requirements.summary),
            ...(options.includeRequirementText ? { text: requirements.summary } : {}),
            entities: requirements.entities.length,
            actors: requirements.actors.length,
            confidence: requirements.confidence,
            openQuestions: requirements.openQuestions.length,
            locale: requirements.locale,
          });
          return requirements;
        },
        { priority: 900 },
      );

      api.onEvent('generation:completed', (result) => {
        currentRequestId = result.requestId;
        emit('generation.completed', {
          requestId: result.requestId,
          projectSlug: result.blueprint.slug,
          frontend: result.blueprint.stack.frontend,
          backend: result.blueprint.stack.backend,
          database: result.blueprint.stack.database,
          deployment: result.blueprint.deployment.target,
          template: result.template?.id ?? null,
          templateScore: result.template?.score ?? null,
          files: result.metrics.fileCount,
          lines: result.metrics.lineCount,
          components: result.metrics.componentCount,
          durationMs: Math.round(result.metrics.durationMs),
          warnings: result.warnings.length,
          dependencyConflicts: result.dependencyConflicts.length,
        });
      });

      api.onEvent('generation:failed', ({ error, phase }) => {
        emit('generation.failed', {
          phase,
          // El mensaje puede llevar datos del enunciado; se registra el tipo,
          // que es lo que sirve para agrupar fallos.
          errorName: error.name,
          errorCode: (error as { code?: string }).code ?? null,
        });
      });

      api.logger.debug(`Telemetria activa hacia el destino "${sink.id}".`);
    },

    async dispose() {
      await sink.flush?.();
    },
  });
}

export default telemetryPlugin;

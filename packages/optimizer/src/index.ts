import type {
  Finding,
  ModuleDescriptor,
  ModuleReport,
  ModuleRunContext,
  OptimizerModule,
  Plugin,
} from '@calecosystem/contracts';
import { definePlugin } from '@calecosystem/contracts';

const DESCRIPTOR = {
  id: '@calecosystem/optimizer',
  kind: 'optimizer',
  version: '0.1.0',
  displayName: 'Optimizador de rendimiento',
  description:
    'Analiza el blueprint y el código generado en busca de decisiones que degradan el rendimiento a escala.',
  tier: 'pro',
  status: 'preview',
} as const satisfies ModuleDescriptor;

/** Umbrales a partir de los cuales una decision deja de ser inocua. */
const THRESHOLDS = {
  /** Rutas por encima de las cuales conviene dividir el bundle. */
  routesBeforeCodeSplitting: 6,
  /** Endpoints de listado sin paginación que se toleran. */
  unpaginatedListEndpoints: 0,
  /** Usuarios a partir de los cuales hace falta cache. */
  usersBeforeCache: 5_000,
} as const;

/**
 * Optimizador de rendimiento (v0.1).
 *
 * Alcance actual: análisis estático del blueprint. Detecta los problemas que
 * son baratos de corregir ahora y caros en producción, y nada más: no mide
 * tiempos reales ni perfila bundles todavía. El alcance completo está en
 * `docs/roadmap.md`; lo que hay aquí ya es accionable y no promete de más.
 */
export class PerformanceOptimizer implements OptimizerModule {
  readonly descriptor = DESCRIPTOR;

  async run(context: ModuleRunContext): Promise<ModuleReport> {
    const startedAt = performance.now();
    const findings: Finding[] = [];
    const { blueprint, requirements } = context;

    const routeCount = blueprint.pages.length;
    if (routeCount > THRESHOLDS.routesBeforeCodeSplitting) {
      findings.push({
        id: 'PERF-NO-CODE-SPLITTING',
        severity: 'medium',
        title: `${routeCount} rutas cargan en un único bundle`,
        detail:
          'Todas las vistas se importan de forma estática, así que el primer render descarga ' +
          'código de pantallas que el usuario puede no visitar nunca.',
        remediation:
          'Cargar las rutas de forma diferida (import dinamico por ruta) y medir el peso del bundle inicial en CI.',
        tags: ['frontend', 'bundle'],
      });
    }

    const listEndpoints = blueprint.endpoints.filter(
      (endpoint) => endpoint.method === 'GET' && !endpoint.path.includes(':id'),
    );
    if (listEndpoints.length > THRESHOLDS.unpaginatedListEndpoints) {
      findings.push({
        id: 'PERF-UNBOUNDED-LIST',
        severity: 'high',
        title: `${listEndpoints.length} endpoints de listado devuelven la colección completa`,
        detail:
          'Los repositorios generados hacen `list()` sin limite. Con datos reales, la respuesta crece ' +
          'sin cota y arrastra memoria del proceso, ancho de banda y tiempo de render.',
        remediation:
          'Añadir paginación por cursor (`limit` + `after`) al puerto `Repository` antes de conectar datos reales.',
        tags: ['backend', 'scalability'],
      });
    }

    const referenceFields = blueprint.entities.flatMap((entity) =>
      entity.fields
        .filter((field) => field.type === 'reference')
        .map((field) => `${entity.name}.${field.name}`),
    );
    if (referenceFields.length > 0) {
      findings.push({
        id: 'PERF-MISSING-INDEXES',
        severity: 'medium',
        title: `${referenceFields.length} claves foraneas sin índice declarado`,
        detail: `Campos afectados: ${referenceFields.join(', ')}. Las consultas por relación harán recorrido completo de tabla.`,
        remediation: 'Declarar un índice por cada columna de relación en la primera migración.',
        tags: ['database'],
      });
    }

    const expectedUsers = requirements.nonFunctional.expectedUsers ?? 0;
    if (expectedUsers >= THRESHOLDS.usersBeforeCache && !requirements.features.realtime) {
      findings.push({
        id: 'PERF-NO-CACHE-LAYER',
        severity: 'medium',
        title: `Volumen previsto de ${expectedUsers.toLocaleString('es-ES')} usuarios sin capa de cache`,
        detail: 'Cada peticion llega a la base de datos; las lecturas repetidas dominaran la carga.',
        remediation: 'Introducir cache de lectura (Redis o cache HTTP) en los listados más consultados.',
        tags: ['infrastructure'],
      });
    }

    // Aporte tangible: presupuesto de rendimiento versionado junto al código.
    context.emit({
      path: 'performance-budget.json',
      producedBy: DESCRIPTOR.id,
      contents: `${JSON.stringify(
        {
          $schema: 'https://calecosystem.dev/schemas/performance-budget.json',
          generatedFor: blueprint.projectName,
          budgets: {
            initialBundleKb: routeCount > THRESHOLDS.routesBeforeCodeSplitting ? 250 : 180,
            apiP95Ms: requirements.nonFunctional.availabilityTarget === 'critical' ? 200 : 400,
            largestContentfulPaintMs: 2_500,
          },
          notes: 'Umbrales iniciales. Ajustalos con datos reales tras la primera semana en producción.',
        },
        null,
        2,
      )}\n`,
    });

    return {
      module: DESCRIPTOR.id,
      kind: 'optimizer',
      summary:
        findings.length === 0
          ? 'Sin cuellos de botella estructurales detectados.'
          : `${findings.length} oportunidades de optimización detectadas antes de escribir datos reales.`,
      findings,
      score: scoreFrom(findings),
      emittedFiles: [],
      durationMs: performance.now() - startedAt,
    };
  }
}

/** 100 = sin hallazgos. Cada hallazgo resta según su gravedad. */
function scoreFrom(findings: readonly Finding[]): number {
  const penalties: Record<Finding['severity'], number> = {
    info: 0,
    low: 3,
    medium: 8,
    high: 18,
    critical: 30,
  };
  const total = findings.reduce((sum, finding) => sum + penalties[finding.severity], 0);
  return Math.max(0, 100 - total);
}

export function optimizerPlugin(): Plugin {
  return definePlugin({
    name: '@calecosystem/optimizer',
    version: '0.1.0',
    description: 'Registra el optimizador de rendimiento en la fase `augment`.',
    tier: 'pro',
    register(api) {
      api.registerModule(new PerformanceOptimizer());
    },
  });
}

export default optimizerPlugin;

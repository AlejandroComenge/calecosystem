import type {
  Blueprint,
  DocumenterModule,
  Finding,
  ModuleDescriptor,
  ModuleReport,
  ModuleRunContext,
  Plugin,
  VirtualFile,
} from '@calecosystem/contracts';
import { definePlugin } from '@calecosystem/contracts';

const DESCRIPTOR = {
  id: '@calecosystem/documenter',
  kind: 'documenter',
  version: '0.1.0',
  displayName: 'Documentador inteligente',
  description:
    'Genera documentacion de arquitectura y de API a partir del blueprint, con las decisiones y su justificacion.',
  tier: 'community',
  status: 'preview',
} as const satisfies ModuleDescriptor;

/**
 * Documentador inteligente (v0.1).
 *
 * Documenta lo que el codigo no puede contar por si solo: por que se eligio
 * cada cosa, que alternativas se descartaron y que preguntas siguen abiertas.
 * Repetir en prosa lo que ya dice una firma de funcion solo crea documentacion
 * que envejece mal, asi que no lo hace.
 */
export class IntelligentDocumenter implements DocumenterModule {
  readonly descriptor = DESCRIPTOR;

  async run(context: ModuleRunContext): Promise<ModuleReport> {
    const startedAt = performance.now();
    const { blueprint } = context;
    const findings: Finding[] = [];

    context.emit(architectureDoc(blueprint));
    context.emit(apiReference(blueprint));
    context.emit(onboardingDoc(blueprint));

    const undocumented = blueprint.requirements.openQuestions;
    if (undocumented.length > 0) {
      findings.push({
        id: 'DOC-OPEN-QUESTIONS',
        severity: 'medium',
        title: `${undocumented.length} preguntas de negocio sin respuesta en la documentacion`,
        detail:
          'El analisis de requisitos dejo puntos sin resolver. Documentar una arquitectura sobre supuestos ' +
          'no verificados genera confianza injustificada en ella.',
        remediation: 'Resolver las preguntas con el responsable de producto y actualizar `docs/ARCHITECTURE.md`.',
        tags: ['requirements'],
      });
    }

    if (blueprint.requirements.confidence < 0.5) {
      findings.push({
        id: 'DOC-LOW-CONFIDENCE',
        severity: 'high',
        title: `Confianza del analisis baja (${(blueprint.requirements.confidence * 100).toFixed(0)}%)`,
        detail:
          'La descripcion de partida daba poca senal, asi que la documentacion generada describe una ' +
          'arquitectura deducida con escasa evidencia.',
        remediation: 'Ampliar la descripcion de negocio y regenerar antes de usar estos documentos como referencia.',
        tags: ['requirements', 'quality'],
      });
    }

    return {
      module: DESCRIPTOR.id,
      kind: 'documenter',
      summary: '3 documentos generados: arquitectura, referencia de API e incorporacion.',
      findings,
      score: Math.round(blueprint.requirements.confidence * 100),
      emittedFiles: [],
      durationMs: performance.now() - startedAt,
    };
  }
}

function architectureDoc(blueprint: Blueprint): VirtualFile {
  const lines: string[] = [
    '# Arquitectura',
    '',
    `> Documento generado a partir del blueprint de **${blueprint.projectName}**.`,
    '> Actualizalo cuando cambien las decisiones, no cuando cambie el codigo.',
    '',
    '## Contexto',
    '',
    blueprint.requirements.summary,
    '',
    '## Vista de componentes',
    '',
    '```',
    '  navegador',
    '      |',
    `  ${blueprint.stack.frontend} (apps/web)`,
    '      |  HTTP/JSON',
    `  ${blueprint.stack.backend} (apps/api)`,
    '      |',
    `  ${blueprint.stack.database}`,
    '```',
    '',
    '## Capas del backend',
    '',
  ];

  for (const layer of blueprint.layers) {
    lines.push(`### ${layer.name}`, '', layer.description, '');
    lines.push(...layer.directories.map((directory) => `- \`${directory}\``), '');
  }

  lines.push('## Decisiones', '');
  for (const decision of blueprint.decisions) {
    lines.push(
      `### ${decision.id}: ${decision.title}`,
      '',
      `- **Eleccion:** ${decision.choice}`,
      `- **Motivo:** ${decision.rationale}`,
      `- **Descartado:** ${decision.alternatives.join(', ') || 'nada'}`,
      '',
    );
  }

  if (blueprint.risks.length > 0) {
    lines.push('## Riesgos y responsables', '', '| Riesgo | Impacto | Mitigacion | Responsable |', '| --- | --- | --- | --- |');
    for (const risk of blueprint.risks) {
      lines.push(`| ${risk.title} | ${risk.impact} | ${risk.mitigation} | ${risk.owner} |`);
    }
    lines.push('');
  }

  if (blueprint.requirements.openQuestions.length > 0) {
    lines.push('## Preguntas abiertas', '');
    lines.push(...blueprint.requirements.openQuestions.map((question) => `- [ ] ${question}`), '');
  }

  return { path: 'docs/ARCHITECTURE.md', contents: lines.join('\n'), producedBy: DESCRIPTOR.id };
}

function apiReference(blueprint: Blueprint): VirtualFile {
  const lines: string[] = [
    '# Referencia de API',
    '',
    `Base: \`http://localhost:3000\`. ${blueprint.endpoints.length} endpoints previstos.`,
    '',
    '| Metodo | Ruta | Descripcion | Auth |',
    '| --- | --- | --- | --- |',
  ];

  for (const endpoint of blueprint.endpoints) {
    lines.push(
      `| \`${endpoint.method}\` | \`${endpoint.path}\` | ${endpoint.summary} | ${endpoint.requiresAuth ? 'si' : 'no'} |`,
    );
  }

  lines.push('', '## Modelos', '');
  for (const entity of blueprint.entities) {
    lines.push(`### ${entity.name}`, '', '| Campo | Tipo | Obligatorio | Notas |', '| --- | --- | --- | --- |');
    for (const field of entity.fields) {
      lines.push(
        `| \`${field.name}\` | ${field.type} | ${field.required ? 'si' : 'no'} | ${field.description ?? field.references ?? ''} |`,
      );
    }
    lines.push('');
  }

  return { path: 'docs/API.md', contents: lines.join('\n'), producedBy: DESCRIPTOR.id };
}

function onboardingDoc(blueprint: Blueprint): VirtualFile {
  const lines = [
    '# Incorporacion al proyecto',
    '',
    `Objetivo: que una persona nueva tenga **${blueprint.projectName}** funcionando y entienda por que esta hecho asi.`,
    '',
    '## Primer dia',
    '',
    '1. `cp .env.example .env` y pedir los valores reales al responsable tecnico.',
    '2. `docker compose up --build`.',
    '3. Comprobar `http://localhost:3000/api/health`.',
    '4. Leer `docs/ARCHITECTURE.md`, empezando por la seccion de decisiones.',
    '',
    '## Donde tocar cada cosa',
    '',
    '| Quiero... | Voy a... |',
    '| --- | --- |',
    '| Cambiar una regla de negocio | `apps/api/src/domain/` |',
    '| Anadir un caso de uso | `apps/api/src/application/` |',
    '| Cambiar de base de datos | `apps/api/src/infrastructure/` |',
    '| Anadir un endpoint | `apps/api/src/routes/` |',
    '| Cambiar una pantalla | `apps/web/src/pages/` |',
    '',
    '## Antes de tu primer merge',
    '',
    '- Lee `SECURITY.md`: hay hallazgos abiertos que bloquean produccion.',
    '- Lee `docs/TEST-PLAN.md`: sabras que cubre la bateria actual y que no.',
    '',
  ];

  return { path: 'docs/ONBOARDING.md', contents: lines.join('\n'), producedBy: DESCRIPTOR.id };
}

export function documenterPlugin(): Plugin {
  return definePlugin({
    name: '@calecosystem/documenter',
    version: '0.1.0',
    description: 'Registra el documentador inteligente en la fase `augment`.',
    tier: 'community',
    register(api) {
      api.registerModule(new IntelligentDocumenter());
    },
  });
}

export default documenterPlugin;

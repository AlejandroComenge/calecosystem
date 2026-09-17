import type { Blueprint, Logger, VirtualFile } from '@calecosystem/contracts';
import { FileTree, GenerationError, type EcosystemKernel } from '@calecosystem/core';
import { fileFactory, hashBanner } from './shared.ts';

const TOOL = '@calecosystem/generator';
const file = fileFactory(TOOL);

export interface ScaffolderOptions {
  readonly kernel: EcosystemKernel;
  readonly logger: Logger;
}

/**
 * Materializa un blueprint en un arbol de ficheros.
 *
 * No sabe escribir React, Fastify ni Docker: delega en los adaptadores que
 * el kernel tenga registrados. Anadir un framework es registrar un adaptador
 * mas; este fichero no cambia.
 */
export class Scaffolder {
  readonly #kernel: EcosystemKernel;
  readonly #logger: Logger;

  constructor(options: ScaffolderOptions) {
    this.#kernel = options.kernel;
    this.#logger = options.logger.child('scaffolder');
  }

  async scaffold(blueprint: Blueprint): Promise<FileTree> {
    const tree = new FileTree();
    const context = { blueprint, logger: this.#logger };

    const frontend = this.#kernel.frontendAdapter(blueprint.stack.frontend);
    if (!frontend) {
      throw new GenerationError(
        'NO_FRONTEND_ADAPTER',
        `No hay adaptador registrado para el frontend "${blueprint.stack.frontend}". ` +
          'Registra uno mediante un plugin o elige otro framework.',
        { framework: blueprint.stack.frontend },
      );
    }
    tree.addAll(await frontend.scaffold(context));
    this.#logger.debug(`Frontend generado con "${frontend.id}".`);

    const backend =
      this.#kernel.backendAdapter(blueprint.stack.backend) ??
      this.#kernel.backendAdapter('node-fastify');
    if (!backend) {
      throw new GenerationError(
        'NO_BACKEND_ADAPTER',
        `No hay adaptador registrado para el backend "${blueprint.stack.backend}".`,
        { runtime: blueprint.stack.backend },
      );
    }
    if (backend.runtime !== blueprint.stack.backend) {
      this.#logger.warn(
        `Sin adaptador para "${blueprint.stack.backend}"; se usa "${backend.runtime}" como equivalente.`,
      );
    }
    tree.addAll(await backend.scaffold(context));

    const deployment =
      this.#kernel.deploymentAdapter(blueprint.deployment.target) ??
      this.#kernel.deploymentAdapter('docker-compose');
    if (deployment) {
      tree.addAll(await deployment.scaffold(context));
    } else {
      this.#logger.warn('Sin adaptador de despliegue: el proyecto se genera sin CI ni contenedores.');
    }

    tree.addAll(rootFiles(blueprint));
    this.#logger.info(`Scaffolding completado: ${tree.size} ficheros.`);
    return tree;
  }
}

/** Ficheros de la raiz del proyecto generado, independientes del framework. */
function rootFiles(blueprint: Blueprint): VirtualFile[] {
  return [
    file('README.md', projectReadme(blueprint)),
    file(
      '.gitignore',
      ['node_modules/', 'dist/', 'coverage/', '.env', '.env.local', '*.log', '.DS_Store'].join('\n'),
    ),
    file(
      '.editorconfig',
      [
        'root = true',
        '',
        '[*]',
        'charset = utf-8',
        'end_of_line = lf',
        'indent_style = space',
        'indent_size = 2',
        'insert_final_newline = true',
      ].join('\n'),
    ),
  ];
}

function projectReadme(blueprint: Blueprint): string {
  const { stack, requirements } = blueprint;
  const activeFeatures = Object.entries(requirements.features)
    .filter(([, enabled]) => enabled)
    .map(([name]) => name);

  const lines: string[] = [
    `# ${blueprint.projectName}`,
    '',
    requirements.summary,
    '',
    '## Stack',
    '',
    `| Capa | Eleccion |`,
    `| --- | --- |`,
    `| Frontend | ${stack.frontend} |`,
    `| Backend | ${stack.backend} |`,
    `| Datos | ${stack.database} |`,
    `| Estilos | ${stack.styling} |`,
    `| Despliegue | ${blueprint.deployment.target} |`,
    '',
    '## Arranque local',
    '',
    '```bash',
    'cp .env.example .env   # rellena los secretos',
    'docker compose up --build',
    '```',
    '',
    `El API queda en http://localhost:3000 y el frontend en http://localhost:8080.`,
    '',
    '## Estructura',
    '',
    '```',
    'apps/',
    '  api/   # backend: domain -> application -> infrastructure -> routes',
    '  web/   # frontend por funcionalidad',
    '```',
    '',
    '## Modelo de dominio',
    '',
  ];

  for (const entity of blueprint.entities) {
    const fieldNames = entity.fields.map((entityField) => entityField.name).join(', ');
    lines.push(`- **${entity.name}** (\`/${entity.plural}\`): ${fieldNames}`);
  }

  lines.push('', '## Decisiones de arquitectura', '');
  for (const decision of blueprint.decisions) {
    lines.push(`### ${decision.id}: ${decision.title}`, '', `**Eleccion:** ${decision.choice}`, '');
    lines.push(decision.rationale, '');
    if (decision.alternatives.length > 0) {
      lines.push(`Alternativas descartadas: ${decision.alternatives.join(', ')}.`, '');
    }
  }

  if (blueprint.risks.length > 0) {
    lines.push('## Riesgos conocidos', '');
    for (const risk of blueprint.risks) {
      lines.push(`- **${risk.title}** (impacto ${risk.impact}): ${risk.mitigation}`);
    }
    lines.push('');
  }

  if (requirements.openQuestions.length > 0) {
    lines.push('## Preguntas abiertas', '');
    lines.push(
      'El analisis de requisitos no pudo resolver estos puntos. Respondelos antes de llevar el proyecto a produccion:',
      '',
    );
    for (const question of requirements.openQuestions) {
      lines.push(`- ${question}`);
    }
    lines.push('');
  }

  lines.push(
    '## Capacidades detectadas',
    '',
    activeFeatures.length > 0 ? activeFeatures.map((name) => `\`${name}\``).join(', ') : 'Ninguna.',
    '',
    '---',
    '',
    `Generado por CalEcosystem. Confianza del analisis: ${(requirements.confidence * 100).toFixed(0)}%.`,
  );

  return lines.join('\n');
}

export { hashBanner };

import type {
  Blueprint,
  ComponentSpec,
  DependencyConflict,
  Logger,
  ProjectTemplate,
  ScaffoldContext,
  VirtualFile,
} from '@calecosystem/contracts';
import {
  DependencyRegistry,
  FileTree,
  GenerationError,
  type EcosystemKernel,
} from '@calecosystem/core';
import { componentBarrel } from '../components/renderer.ts';
import { domainComponents } from '../components/domain.ts';
import { fileFactory } from './shared.ts';

const TOOL = '@calecosystem/generator';
const file = fileFactory(TOOL);

export interface ScaffolderOptions {
  readonly kernel: EcosystemKernel;
  readonly logger: Logger;
  /** Plantilla ya seleccionada por el generador, si hubo alguna. */
  readonly template?: ProjectTemplate;
}

export interface ScaffoldOutcome {
  readonly tree: FileTree;
  readonly dependencies: DependencyRegistry;
  readonly conflicts: readonly DependencyConflict[];
  readonly componentCount: number;
}

/**
 * Materializa un blueprint en un arbol de ficheros.
 *
 * No sabe escribir React, Fastify ni Docker: delega en los adaptadores que el
 * kernel tenga registrados. Lo que si hace, y ningun adaptador puede hacer por
 * su cuenta, es **consolidar**: reune las dependencias que todos declaran en un
 * unico `package.json` por workspace y renderiza el catalogo de componentes
 * una sola vez.
 */
export class Scaffolder {
  readonly #kernel: EcosystemKernel;
  readonly #logger: Logger;
  readonly #template: ProjectTemplate | undefined;

  constructor(options: ScaffolderOptions) {
    this.#kernel = options.kernel;
    this.#logger = options.logger.child('scaffolder');
    this.#template = options.template;
  }

  async scaffold(blueprint: Blueprint): Promise<ScaffoldOutcome> {
    const tree = new FileTree();
    const dependencies = new DependencyRegistry();
    const components = this.#collectComponents(blueprint);

    const context: ScaffoldContext = {
      blueprint,
      logger: this.#logger,
      dependencies,
      components,
    };

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
    tree.addAll(await backend.scaffold(context));

    const deployment =
      this.#kernel.deploymentAdapter(blueprint.deployment.target) ??
      this.#kernel.deploymentAdapter('docker-compose');
    if (deployment) {
      tree.addAll(await deployment.scaffold(context));
    } else {
      this.#logger.warn('Sin adaptador de despliegue: el proyecto se genera sin CI ni contenedores.');
    }

    // El catalogo de componentes se renderiza antes que la plantilla para que
    // esta pueda apoyarse en el en lugar de duplicarlo.
    const componentCount = this.#emitComponents(tree, blueprint, components);

    if (this.#template) {
      tree.addAll(await this.#template.scaffold(context));
      this.#logger.debug(`Plantilla "${this.#template.id}" aplicada.`);
    }

    this.#emitManifests(tree, blueprint, dependencies);
    tree.addAll(rootFiles(blueprint, dependencies, this.#template));

    const conflicts = dependencies.conflicts();
    this.#logger.info(
      `Scaffolding completado: ${tree.size} ficheros, ${componentCount} componentes, ` +
        `${conflicts.length} conflictos de dependencias.`,
    );
    return { tree, dependencies, conflicts, componentCount };
  }

  /** Catalogo del kernel mas los componentes derivados de cada entidad. */
  #collectComponents(blueprint: Blueprint): ComponentSpec[] {
    const catalog = new Map<string, ComponentSpec>();
    for (const spec of this.#kernel.components()) catalog.set(spec.name, spec);
    for (const entity of blueprint.entities) {
      for (const spec of domainComponents(entity)) catalog.set(spec.name, spec);
    }
    return [...catalog.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  #emitComponents(tree: FileTree, blueprint: Blueprint, components: readonly ComponentSpec[]): number {
    const renderer = this.#kernel.componentRenderer(blueprint.stack.frontend);
    if (!renderer) {
      // Vue y Angular todavia no tienen renderizador; generan sus vistas por
      // adaptador. Es una limitacion conocida, no un fallo silencioso.
      this.#logger.debug(
        `Sin renderizador de componentes para "${blueprint.stack.frontend}": se omite el catalogo.`,
      );
      return 0;
    }

    for (const spec of components) {
      tree.add({
        path: renderer.pathFor(spec),
        contents: renderer.render(spec),
        producedBy: renderer.id,
      });
    }
    tree.add({
      path: 'apps/web/src/components/index.ts',
      contents: componentBarrel(components),
      producedBy: renderer.id,
    });
    return components.length;
  }

  /**
   * Construye un `package.json` por workspace con lo que todos declararon.
   *
   * Es el paso que permite que una plantilla anada `stripe` sin pelearse con
   * el adaptador de backend por el mismo fichero.
   */
  #emitManifests(tree: FileTree, blueprint: Blueprint, dependencies: DependencyRegistry): void {
    for (const workspace of dependencies.workspaces()) {
      if (workspace === 'root') continue;
      const manifest = dependencies.buildManifest(workspace, {
        name: `${blueprint.slug}-${workspace}`,
      });
      tree.add({
        path: `apps/${workspace}/package.json`,
        contents: manifest.json,
        producedBy: TOOL,
      });
    }

    const rootManifest = dependencies.buildManifest('root', {
      name: blueprint.slug,
    });
    tree.add({ path: 'package.json', contents: rootManifest.json, producedBy: TOOL });
  }
}

/** Ficheros de la raiz del proyecto generado, independientes del framework. */
function rootFiles(
  blueprint: Blueprint,
  dependencies: DependencyRegistry,
  template: ProjectTemplate | undefined,
): VirtualFile[] {
  return [
    file('README.md', projectReadme(blueprint, dependencies, template)),
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

function projectReadme(
  blueprint: Blueprint,
  dependencies: DependencyRegistry,
  template: ProjectTemplate | undefined,
): string {
  const { stack, requirements } = blueprint;
  const activeFeatures = Object.entries(requirements.features)
    .filter(([, enabled]) => enabled)
    .map(([name]) => name);

  const lines: string[] = [
    `# ${blueprint.projectName}`,
    '',
    requirements.summary,
    '',
  ];

  if (template) {
    lines.push(`> Generado con la plantilla **${template.name}**: ${template.description}`, '');
  }

  lines.push(
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
    blueprint.deployment.containerized
      ? 'docker compose up --build'
      : 'npm install && npm run dev --workspace apps/web',
    '```',
    '',
    '## Estructura',
    '',
    '```',
    'apps/',
    '  api/   # backend: domain -> application -> infrastructure -> routes',
    '  web/   # frontend por funcionalidad, con catalogo de componentes en src/components',
    '```',
    '',
    '## Modelo de dominio',
    '',
  );

  for (const entity of blueprint.entities) {
    const fieldNames = entity.fields.map((entityField) => entityField.name).join(', ');
    lines.push(`- **${entity.name}** (\`/${entity.plural}\`): ${fieldNames}`);
  }

  lines.push('', '## Dependencias y por que estan', '');
  for (const workspace of ['web', 'api'] as const) {
    const explained = dependencies.explain(workspace);
    if (explained.length === 0) continue;
    lines.push(`### ${workspace}`, '');
    lines.push(...explained.map((entry) => `- ${entry}`), '');
  }

  const conflicts = dependencies.conflicts();
  if (conflicts.length > 0) {
    lines.push('### Conflictos de version detectados', '');
    for (const conflict of conflicts) {
      lines.push(
        `- \`${conflict.name}\`: se usa \`${conflict.resolved}\`; tambien se pidieron ` +
          `${conflict.requests.map((request) => `\`${request.version}\` (${request.requestedBy})`).join(', ')}.`,
      );
    }
    lines.push('');
  }

  lines.push('## Decisiones de arquitectura', '');
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

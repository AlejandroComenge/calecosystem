import type {
  ApiEndpoint,
  ArchitectureDecision,
  BackendRuntime,
  Blueprint,
  DatabaseEngine,
  DeploymentPlan,
  DeploymentTarget,
  DomainEntity,
  FrontendFramework,
  LayerPlan,
  Logger,
  PagePlan,
  RequirementsModel,
  Risk,
  StackDecision,
} from '@calecosystem/contracts';
import { containsTerm, normalize } from '../analysis/text.ts';

const FRONTEND_FRAMEWORKS: readonly FrontendFramework[] = ['react', 'vue', 'angular'];

export interface PlannerOptions {
  readonly logger: Logger;
  /** Framework por defecto cuando el texto no expresa preferencia. */
  readonly defaultFrontend?: FrontendFramework;
  readonly defaultDatabase?: DatabaseEngine;
  readonly defaultDeployment?: DeploymentTarget;
}

/**
 * Decide la arquitectura y, sobre todo, deja constancia de por que.
 *
 * Cada eleccion se registra como `ArchitectureDecision` con alternativas
 * descartadas. Un generador que no explica sus decisiones produce codigo que
 * nadie se atreve a cambiar seis meses despues.
 */
export class ArchitecturePlanner {
  readonly #logger: Logger;
  readonly #options: PlannerOptions;

  constructor(options: PlannerOptions) {
    this.#logger = options.logger.child('planner');
    this.#options = options;
  }

  plan(requirements: RequirementsModel): Blueprint {
    const decisions: ArchitectureDecision[] = [];
    const text = normalize(requirements.summary);

    const frontend = this.#chooseFrontend(requirements, text, decisions);
    const backend = this.#chooseBackend(requirements, decisions);
    const database = this.#chooseDatabase(requirements, text, decisions);

    const stack: StackDecision = {
      frontend,
      backend,
      database,
      styling: 'tailwind',
      packageManager: 'npm',
      language: 'typescript',
    };

    const deployment = this.#planDeployment(requirements, stack, decisions);

    const blueprint: Blueprint = {
      projectName: requirements.projectName,
      slug: requirements.slug,
      stack,
      layers: planLayers(stack),
      entities: requirements.entities,
      endpoints: planEndpoints(requirements),
      pages: planPages(requirements),
      deployment,
      decisions,
      risks: assessRisks(requirements),
      requirements,
    };

    this.#logger.info(
      `Arquitectura planificada: ${stack.frontend} + ${stack.backend} + ${stack.database}, ` +
        `${blueprint.endpoints.length} endpoints y ${blueprint.pages.length} vistas.`,
    );
    return blueprint;
  }

  #chooseFrontend(
    requirements: RequirementsModel,
    text: string,
    decisions: ArchitectureDecision[],
  ): FrontendFramework {
    const hinted = normalize(requirements.hints.frontend ?? '');
    const explicit =
      FRONTEND_FRAMEWORKS.find((framework) => framework === hinted) ??
      FRONTEND_FRAMEWORKS.find((framework) => containsTerm(text, framework));

    const choice = explicit ?? this.#options.defaultFrontend ?? 'react';
    const rationale = explicit
      ? 'Solicitado explicitamente en los requisitos o por configuracion.'
      : requirements.features.seo
        ? 'Sin preferencia expresa. Se elige el ecosistema con mas opciones de renderizado en servidor, que es lo que pide el requisito de SEO.'
        : 'Sin preferencia expresa. Se elige la opcion con mayor disponibilidad de perfiles en el mercado, que reduce el riesgo de mantenimiento.';

    decisions.push({
      id: 'ADR-FRONTEND',
      title: 'Framework de frontend',
      choice,
      rationale,
      alternatives: FRONTEND_FRAMEWORKS.filter((framework) => framework !== choice),
    });
    return choice;
  }

  #chooseBackend(
    requirements: RequirementsModel,
    decisions: ArchitectureDecision[],
  ): BackendRuntime {
    const hinted = normalize(requirements.hints.backend ?? '');
    const explicit = (['node-fastify', 'node-express', 'node-nest'] as const).find(
      (runtime) => runtime === hinted || containsTerm(hinted, runtime.replace('node-', '')),
    );

    const complex =
      requirements.entities.length >= 8 ||
      requirements.features.multiTenant ||
      requirements.nonFunctional.availabilityTarget === 'critical';

    const choice: BackendRuntime = explicit ?? (complex ? 'node-nest' : 'node-fastify');
    decisions.push({
      id: 'ADR-BACKEND',
      title: 'Runtime de backend',
      choice,
      rationale: explicit
        ? 'Solicitado explicitamente en los requisitos o por configuracion.'
        : complex
          ? 'Dominio amplio o exigencias de disponibilidad altas: se prioriza una estructura opinionada con inyeccion de dependencias y limites de modulo explicitos.'
          : 'Dominio acotado: se prioriza arranque rapido, superficie minima y menos capas que mantener.',
      alternatives: ['node-fastify', 'node-express', 'node-nest'].filter((runtime) => runtime !== choice),
    });
    return choice;
  }

  #chooseDatabase(
    requirements: RequirementsModel,
    text: string,
    decisions: ArchitectureDecision[],
  ): DatabaseEngine {
    const hinted = normalize(requirements.hints.database ?? '');
    const explicit = (['postgres', 'mysql', 'mongodb', 'sqlite'] as const).find(
      (engine) => engine === hinted || containsTerm(text, engine),
    );

    const relational = requirements.entities.some((entity) =>
      entity.fields.some((field) => field.type === 'reference'),
    );
    const choice: DatabaseEngine =
      explicit ?? (this.#options.defaultDatabase ?? (relational ? 'postgres' : 'mongodb'));

    decisions.push({
      id: 'ADR-DATABASE',
      title: 'Motor de datos',
      choice,
      rationale: explicit
        ? 'Solicitado explicitamente en los requisitos o por configuracion.'
        : relational
          ? 'El modelo detectado tiene relaciones entre entidades y operaciones que deben ser transaccionales (pagos, pedidos, facturacion).'
          : 'El modelo detectado es mayoritariamente documental y sin relaciones fuertes.',
      alternatives: ['postgres', 'mysql', 'mongodb', 'sqlite'].filter((engine) => engine !== choice),
    });
    return choice;
  }

  #planDeployment(
    requirements: RequirementsModel,
    stack: StackDecision,
    decisions: ArchitectureDecision[],
  ): DeploymentPlan {
    const hinted = normalize(requirements.hints.deployment ?? '');
    const explicit = (['docker-compose', 'vercel', 'aws-ecs', 'kubernetes'] as const).find(
      (target) => target === hinted,
    );
    const highScale = (requirements.nonFunctional.expectedUsers ?? 0) >= 50_000;
    const target: DeploymentTarget =
      explicit ?? this.#options.defaultDeployment ?? (highScale ? 'kubernetes' : 'docker-compose');

    decisions.push({
      id: 'ADR-DEPLOYMENT',
      title: 'Destino de despliegue',
      choice: target,
      rationale: explicit
        ? 'Solicitado explicitamente en los requisitos o por configuracion.'
        : highScale
          ? 'El volumen estimado exige escalado horizontal y despliegues sin corte.'
          : 'Volumen inicial moderado: se prioriza que un equipo pequeno pueda levantar todo el entorno con un solo comando.',
      alternatives: ['docker-compose', 'vercel', 'aws-ecs', 'kubernetes'].filter((option) => option !== target),
    });

    const services = ['web', 'api', stack.database];
    if (requirements.features.realtime) services.push('redis');

    const secrets = ['DATABASE_URL', 'JWT_SECRET'];
    if (requirements.features.payments) secrets.push('PAYMENT_PROVIDER_SECRET');
    if (requirements.features.notifications) secrets.push('SMTP_URL');

    return {
      target,
      containerized: target !== 'vercel',
      ci: 'github-actions',
      environments: ['development', 'staging', 'production'],
      services,
      secrets,
    };
  }
}

/* --- Planificacion estructural --------------------------------------- */

function planLayers(stack: StackDecision): LayerPlan[] {
  return [
    {
      name: 'frontend',
      description: 'Interfaz de usuario organizada por funcionalidad, no por tipo de fichero.',
      directories: [
        'apps/web/src/pages',
        'apps/web/src/components',
        'apps/web/src/api',
        'apps/web/src/lib',
      ],
    },
    {
      name: 'domain',
      description: 'Entidades y reglas de negocio. Sin dependencias de framework ni de base de datos.',
      directories: ['apps/api/src/domain'],
    },
    {
      name: 'application',
      description: 'Casos de uso que orquestan el dominio. Es la frontera que se testea primero.',
      directories: ['apps/api/src/application'],
    },
    {
      name: 'infrastructure',
      description: `Adaptadores hacia el exterior: ${stack.database}, correo, pasarelas de pago.`,
      directories: ['apps/api/src/infrastructure'],
    },
    {
      name: 'interfaces',
      description: 'Entrada HTTP: rutas, validacion y serializacion.',
      directories: ['apps/api/src/routes'],
    },
  ];
}

function planEndpoints(requirements: RequirementsModel): ApiEndpoint[] {
  const requiresAuth = requirements.features.auth;
  const endpoints: ApiEndpoint[] = [];

  for (const entity of requirements.entities) {
    const base = `/api/${entity.plural}`;
    const operations = new Set(entity.operations);
    if (operations.has('list')) {
      endpoints.push(endpoint('GET', base, `Lista paginada de ${entity.plural}`, entity, false || requiresAuth));
    }
    if (operations.has('read')) {
      endpoints.push(endpoint('GET', `${base}/:id`, `Detalle de ${entity.name}`, entity, requiresAuth));
    }
    if (operations.has('create')) {
      endpoints.push(endpoint('POST', base, `Crea ${entity.name}`, entity, requiresAuth));
    }
    if (operations.has('update')) {
      endpoints.push(endpoint('PATCH', `${base}/:id`, `Actualiza ${entity.name}`, entity, requiresAuth));
    }
    if (operations.has('delete')) {
      endpoints.push(endpoint('DELETE', `${base}/:id`, `Elimina ${entity.name}`, entity, true));
    }
  }

  if (requirements.features.auth) {
    endpoints.push(
      { method: 'POST', path: '/api/auth/register', summary: 'Alta de usuario', entity: 'User', requiresAuth: false },
      { method: 'POST', path: '/api/auth/login', summary: 'Inicio de sesion', entity: 'User', requiresAuth: false },
      { method: 'POST', path: '/api/auth/refresh', summary: 'Renovacion de token', entity: 'User', requiresAuth: false },
      { method: 'GET', path: '/api/auth/me', summary: 'Perfil autenticado', entity: 'User', requiresAuth: true },
    );
  }
  if (requirements.features.payments) {
    endpoints.push({
      method: 'POST',
      path: '/api/payments/checkout',
      summary: 'Crea una sesion de pago',
      entity: 'Payment',
      requiresAuth: true,
    });
    endpoints.push({
      method: 'POST',
      path: '/api/payments/webhook',
      summary: 'Recibe eventos de la pasarela de pago',
      entity: 'Payment',
      requiresAuth: false,
    });
  }
  endpoints.push({
    method: 'GET',
    path: '/api/health',
    summary: 'Sonda de salud para el orquestador',
    entity: 'System',
    requiresAuth: false,
  });

  return endpoints;
}

function endpoint(
  method: ApiEndpoint['method'],
  path: string,
  summary: string,
  entity: DomainEntity,
  requiresAuth: boolean,
): ApiEndpoint {
  return { method, path, summary, entity: entity.name, requiresAuth };
}

function planPages(requirements: RequirementsModel): PagePlan[] {
  const requiresAuth = requirements.features.auth;
  const pages: PagePlan[] = [
    { route: '/', name: 'Home', kind: 'static', entity: null, requiresAuth: false },
  ];

  if (requirements.features.adminPanel || requirements.features.analytics) {
    pages.push({ route: '/dashboard', name: 'Dashboard', kind: 'dashboard', entity: null, requiresAuth });
  }
  if (requiresAuth) {
    pages.push(
      { route: '/login', name: 'Login', kind: 'auth', entity: null, requiresAuth: false },
      { route: '/register', name: 'Register', kind: 'auth', entity: null, requiresAuth: false },
    );
  }
  for (const entity of requirements.entities) {
    pages.push({
      route: `/${entity.plural}`,
      name: `${entity.name}List`,
      kind: 'list',
      entity: entity.name,
      requiresAuth,
    });
    pages.push({
      route: `/${entity.plural}/:id`,
      name: `${entity.name}Detail`,
      kind: 'detail',
      entity: entity.name,
      requiresAuth,
    });
  }
  return pages;
}

/**
 * Riesgos con dueno asignado. Cada riesgo apunta al modulo del ecosistema que
 * deberia cerrarlo: es el mecanismo por el que el generador crea trabajo
 * explicito para el optimizador, el auditor, el testeador y el documentador.
 */
function assessRisks(requirements: RequirementsModel): Risk[] {
  const risks: Risk[] = [];
  const { features, nonFunctional, entities } = requirements;

  if (features.payments) {
    risks.push({
      id: 'RISK-PCI',
      title: 'El tratamiento de pagos entra en alcance PCI-DSS',
      impact: 'high',
      mitigation: 'Delegar los datos de tarjeta en la pasarela (checkout alojado) y no almacenarlos nunca.',
      owner: 'security',
    });
  }
  if (features.auth) {
    risks.push({
      id: 'RISK-AUTH',
      title: 'La autenticacion es la superficie de ataque mas expuesta',
      impact: 'high',
      mitigation: 'Hash con argon2/bcrypt, rotacion de refresh tokens y limitacion de intentos por IP.',
      owner: 'security',
    });
  }
  if (features.multiTenant) {
    risks.push({
      id: 'RISK-TENANT-ISOLATION',
      title: 'Fuga de datos entre inquilinos',
      impact: 'high',
      mitigation: 'Filtro de tenant obligatorio en el repositorio y tests que intenten cruzar el limite.',
      owner: 'tester',
    });
  }
  if (features.realtime) {
    risks.push({
      id: 'RISK-REALTIME-SCALE',
      title: 'Las conexiones persistentes no escalan con el balanceo por defecto',
      impact: 'medium',
      mitigation: 'Adaptador de pub/sub compartido y sesiones sin estado en el nodo.',
      owner: 'optimizer',
    });
  }
  if (entities.length >= 8) {
    risks.push({
      id: 'RISK-DOMAIN-SIZE',
      title: 'Dominio amplio: el coste de incorporacion crece rapido',
      impact: 'medium',
      mitigation: 'Documentacion viva del modelo y de los limites de modulo, generada en cada cambio.',
      owner: 'documenter',
    });
  }
  if (nonFunctional.availabilityTarget === 'critical') {
    risks.push({
      id: 'RISK-AVAILABILITY',
      title: 'Objetivo de disponibilidad critico sin redundancia definida',
      impact: 'high',
      mitigation: 'Replicas activas, health checks y presupuesto de error acordado antes de produccion.',
      owner: 'optimizer',
    });
  }
  return risks;
}

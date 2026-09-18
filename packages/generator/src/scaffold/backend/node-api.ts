import type {
  ApiEndpoint,
  BackendAdapter,
  Blueprint,
  DependencySpec,
  DomainEntity,
  ScaffoldContext,
  VirtualFile,
} from '@calecosystem/contracts';
import { banner, entityInterface, fileFactory, tsTypeOf } from '../shared.ts';
import { camelCase } from '../../analysis/text.ts';

const TOOL = '@calecosystem/generator (node-api)';
const file = fileFactory(TOOL);

const dep = (name: string, version: string, reason: string, dev = false): DependencySpec => ({
  name,
  version,
  workspace: 'api',
  dev,
  reason,
  requestedBy: TOOL,
});

/** Paquetes que hacen falta según las capacidades activas del blueprint. */
function capabilityDependencies(blueprint: Blueprint): DependencySpec[] {
  const specs: DependencySpec[] = [];
  const { features } = blueprint.requirements;

  if (features.auth) {
    specs.push(
      dep('@fastify/jwt', '^9.0.0', 'Emisión y verificación de tokens de sesión.'),
      dep('argon2', '^0.41.0', 'Hash de contrasenas; el algoritmo recomendado hoy.'),
      dep('@fastify/rate-limit', '^10.0.0', 'Limita intentos de login por IP.'),
    );
  }
  if (features.payments) {
    specs.push(dep('stripe', '^17.0.0', 'Pasarela de pago detectada en los requisitos.'));
  }
  if (features.fileUploads) {
    specs.push(dep('@fastify/multipart', '^9.0.0', 'Recepción de ficheros subidos.'));
  }
  if (features.realtime) {
    specs.push(dep('@fastify/websocket', '^11.0.0', 'Conexiones persistentes en tiempo real.'));
  }
  if (features.i18n) {
    specs.push(dep('accept-language-parser', '^1.5.0', 'Negociación de idioma por petición.'));
  }
  return specs;
}

/**
 * Adaptador de backend Node + Fastify sobre una estructura hexagonal.
 *
 * El dominio no conoce HTTP ni la base de datos. El repositorio en memoria
 * que se genera es deliberadamente sustituible: es la pieza que cada equipo
 * cambia por su ORM en la primera semana, y separarla ahorra reescribir los
 * casos de uso cuando eso ocurre.
 */
export const nodeApiAdapter: BackendAdapter = {
  id: 'calec.backend.node',
  displayName: 'Node + Fastify (arquitectura hexagonal)',
  runtime: 'node-fastify',
  tier: 'community',

  scaffold({ blueprint, dependencies }: ScaffoldContext): VirtualFile[] {
    const root = 'apps/api';
    const files: VirtualFile[] = [];
    const { entities } = blueprint;

    // Detección de dependencias: el backend pide lo suyo y, además, lo que
    // exigen las capacidades detectadas en los requisitos. Un proyecto con
    // autenticación no debería arrancar sin libreria de hash.
    dependencies.require(dep('fastify', '^5.1.0', 'Servidor HTTP elegido en el blueprint.'));
    dependencies.requireAll(capabilityDependencies(blueprint));
    dependencies.requireAll([
      dep('@types/node', '^22.0.0', 'Tipos de la plataforma Node.', true),
      dep('typescript', '^5.9.0', 'Tipado del backend.', true),
    ]);
    dependencies.contribute({
      workspace: 'api',
      requestedBy: TOOL,
      fields: { type: 'module' },
      scripts: {
        dev: 'node --watch src/server.ts',
        start: 'node src/server.ts',
        test: 'node --test "src/**/*.test.ts"',
        typecheck: 'tsc --noEmit',
      },
    });

    files.push(file(`${root}/src/config/env.ts`, envConfig(blueprint)));
    files.push(file(`${root}/src/server.ts`, server(blueprint)));
    files.push(file(`${root}/src/app.ts`, app(blueprint)));

    for (const entity of entities) {
      files.push(file(`${root}/src/domain/${entity.name}.ts`, domainModel(blueprint, entity)));
      files.push(file(`${root}/src/application/${entity.name}Service.ts`, service(entity)));
      files.push(file(`${root}/src/infrastructure/${entity.name}Repository.ts`, repository(entity)));
      files.push(file(`${root}/src/routes/${entity.plural}.routes.ts`, routes(entity, blueprint)));
    }

    files.push(file(`${root}/src/infrastructure/Repository.ts`, repositoryPort()));

    if (blueprint.requirements.features.auth) {
      files.push(file(`${root}/src/routes/auth.routes.ts`, authRoutes()));
      files.push(file(`${root}/src/application/authenticate.ts`, authMiddleware()));
    }

    return files;
  },
};

function envConfig(blueprint: Blueprint): string {
  const secrets = blueprint.deployment.secrets;
  const reads = secrets
    .map((secret) => `  ${camelCase(secret)}: required('${secret}'),`)
    .join('\n');

  return [
    banner(blueprint, TOOL),
    '',
    '/**',
    ' * Configuración por entorno.',
    ' *',
    ' * Se lee una sola vez al arrancar y falla de inmediato si falta algo:',
    ' * un proceso que arranca a medias es más caro de diagnosticar que uno',
    ' * que no arranca.',
    ' */',
    'function required(name: string): string {',
    '  const value = process.env[name];',
    '  if (!value) {',
    "    throw new Error('Falta la variable de entorno obligatoria: ' + name);",
    '  }',
    '  return value;',
    '}',
    '',
    'export const env = {',
    "  nodeEnv: process.env['NODE_ENV'] ?? 'development',",
    "  port: Number(process.env['PORT'] ?? 3000),",
    reads,
    '} as const;',
  ].join('\n');
}

function server(blueprint: Blueprint): string {
  return [
    "import { buildApp } from './app.ts';",
    "import { env } from './config/env.ts';",
    '',
    'const app = await buildApp();',
    '',
    'try {',
    "  await app.listen({ port: env.port, host: '0.0.0.0' });",
    `  app.log.info('${blueprint.projectName} escuchando en el puerto ' + env.port);`,
    '} catch (error) {',
    '  app.log.error(error);',
    '  process.exit(1);',
    '}',
  ].join('\n');
}

function app(blueprint: Blueprint): string {
  const imports = blueprint.entities
    .map((entity) => `import { register${entity.name}Routes } from './routes/${entity.plural}.routes.ts';`)
    .join('\n');
  const registrations = blueprint.entities
    .map((entity) => `  await register${entity.name}Routes(app);`)
    .join('\n');
  const authImport = blueprint.requirements.features.auth
    ? "import { registerAuthRoutes } from './routes/auth.routes.ts';"
    : '';
  const authRegistration = blueprint.requirements.features.auth
    ? '  await registerAuthRoutes(app);'
    : '';

  return [
    "import Fastify, { type FastifyInstance } from 'fastify';",
    imports,
    authImport,
    '',
    'export async function buildApp(): Promise<FastifyInstance> {',
    '  const app = Fastify({ logger: true });',
    '',
    "  app.get('/api/health', async () => ({ status: 'ok', uptime: process.uptime() }));",
    '',
    authRegistration,
    registrations,
    '',
    '  return app;',
    '}',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

function domainModel(blueprint: Blueprint, entity: DomainEntity): string {
  const requiredFields = entity.fields.filter(
    (field) => field.required && field.name !== 'id' && !field.name.endsWith('At'),
  );
  const validations = requiredFields
    .map(
      (field) =>
        `  if (input.${field.name} === undefined || input.${field.name} === null) {\n` +
        `    errors.push('${field.name} es obligatorio');\n` +
        '  }',
    )
    .join('\n');

  return [
    banner(blueprint, TOOL),
    '',
    entityInterface(entity),
    '',
    `export type New${entity.name} = Omit<${entity.name}, 'id' | 'createdAt' | 'updatedAt'>;`,
    '',
    '/**',
    ` * Reglas de negocio de ${entity.name}. Vive en el dominio a propósito:`,
    ' * debe poder testearse sin levantar servidor ni base de datos.',
    ' */',
    `export function validate${entity.name}(input: Partial<New${entity.name}>): string[] {`,
    '  const errors: string[] = [];',
    validations,
    '  return errors;',
    '}',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

function repositoryPort(): string {
  return [
    '/** Puerto de persistencia. Sustituye la implementación, no los casos de uso. */',
    "export interface Repository<T extends { id: string }, TNew> {",
    '  list(): Promise<T[]>;',
    '  findById(id: string): Promise<T | null>;',
    '  create(input: TNew): Promise<T>;',
    '  update(id: string, patch: Partial<TNew>): Promise<T | null>;',
    '  remove(id: string): Promise<boolean>;',
    '}',
  ].join('\n');
}

function repository(entity: DomainEntity): string {
  return [
    "import { randomUUID } from 'node:crypto';",
    `import type { ${entity.name}, New${entity.name} } from '../domain/${entity.name}.ts';`,
    "import type { Repository } from './Repository.ts';",
    '',
    '/**',
    ' * Implementación en memoria para arrancar sin infraestructura.',
    ' * Sustitúyela por tu ORM: el contrato `Repository` no cambia.',
    ' */',
    `export class InMemory${entity.name}Repository implements Repository<${entity.name}, New${entity.name}> {`,
    `  readonly #items = new Map<string, ${entity.name}>();`,
    '',
    `  async list(): Promise<${entity.name}[]> {`,
    '    return [...this.#items.values()];',
    '  }',
    '',
    `  async findById(id: string): Promise<${entity.name} | null> {`,
    '    return this.#items.get(id) ?? null;',
    '  }',
    '',
    `  async create(input: New${entity.name}): Promise<${entity.name}> {`,
    '    const now = new Date().toISOString();',
    `    const created = { ...input, id: randomUUID(), createdAt: now, updatedAt: now } as ${entity.name};`,
    '    this.#items.set(created.id, created);',
    '    return created;',
    '  }',
    '',
    `  async update(id: string, patch: Partial<New${entity.name}>): Promise<${entity.name} | null> {`,
    '    const existing = this.#items.get(id);',
    '    if (!existing) return null;',
    `    const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() } as ${entity.name};`,
    '    this.#items.set(id, updated);',
    '    return updated;',
    '  }',
    '',
    '  async remove(id: string): Promise<boolean> {',
    '    return this.#items.delete(id);',
    '  }',
    '}',
  ].join('\n');
}

function service(entity: DomainEntity): string {
  const variable = camelCase(entity.name);
  return [
    `import { validate${entity.name}, type ${entity.name}, type New${entity.name} } from '../domain/${entity.name}.ts';`,
    "import type { Repository } from '../infrastructure/Repository.ts';",
    '',
    '/** Casos de uso: orquestan dominio y persistencia, y no saben de HTTP. */',
    `export class ${entity.name}Service {`,
    `  readonly #repository: Repository<${entity.name}, New${entity.name}>;`,
    '',
    `  constructor(repository: Repository<${entity.name}, New${entity.name}>) {`,
    '    this.#repository = repository;',
    '  }',
    '',
    `  async list(): Promise<${entity.name}[]> {`,
    '    return this.#repository.list();',
    '  }',
    '',
    `  async get(id: string): Promise<${entity.name} | null> {`,
    '    return this.#repository.findById(id);',
    '  }',
    '',
    `  async create(input: New${entity.name}): Promise<${entity.name}> {`,
    `    const errors = validate${entity.name}(input);`,
    "    if (errors.length > 0) throw new Error(errors.join('; '));",
    `    return this.#repository.create(input);`,
    '  }',
    '',
    `  async update(id: string, patch: Partial<New${entity.name}>): Promise<${entity.name} | null> {`,
    '    return this.#repository.update(id, patch);',
    '  }',
    '',
    '  async remove(id: string): Promise<boolean> {',
    '    return this.#repository.remove(id);',
    '  }',
    '}',
    '',
    `export const ${variable}ServiceToken = Symbol('${entity.name}Service');`,
  ].join('\n');
}

function routes(entity: DomainEntity, blueprint: Blueprint): string {
  const guard = blueprint.requirements.features.auth
    ? "  const guard = { preHandler: authenticate };"
    : '  const guard = {};';
  const authImport = blueprint.requirements.features.auth
    ? "import { authenticate } from '../application/authenticate.ts';"
    : '';

  return [
    "import type { FastifyInstance } from 'fastify';",
    `import { ${entity.name}Service } from '../application/${entity.name}Service.ts';`,
    `import { InMemory${entity.name}Repository } from '../infrastructure/${entity.name}Repository.ts';`,
    `import type { New${entity.name} } from '../domain/${entity.name}.ts';`,
    authImport,
    '',
    `export async function register${entity.name}Routes(app: FastifyInstance): Promise<void> {`,
    `  const service = new ${entity.name}Service(new InMemory${entity.name}Repository());`,
    guard,
    '',
    `  app.get('/api/${entity.plural}', guard, async () => service.list());`,
    '',
    `  app.get<{ Params: { id: string } }>('/api/${entity.plural}/:id', guard, async (request, reply) => {`,
    '    const found = await service.get(request.params.id);',
    "    if (!found) return reply.code(404).send({ message: 'No encontrado' });",
    '    return found;',
    '  });',
    '',
    `  app.post<{ Body: New${entity.name} }>('/api/${entity.plural}', guard, async (request, reply) => {`,
    '    const created = await service.create(request.body);',
    '    return reply.code(201).send(created);',
    '  });',
    '',
    `  app.patch<{ Params: { id: string }; Body: Partial<New${entity.name}> }>(`,
    `    '/api/${entity.plural}/:id',`,
    '    guard,',
    '    async (request, reply) => {',
    '      const updated = await service.update(request.params.id, request.body);',
    "      if (!updated) return reply.code(404).send({ message: 'No encontrado' });",
    '      return updated;',
    '    },',
    '  );',
    '',
    `  app.delete<{ Params: { id: string } }>('/api/${entity.plural}/:id', guard, async (request, reply) => {`,
    '    const removed = await service.remove(request.params.id);',
    '    return reply.code(removed ? 204 : 404).send();',
    '  });',
    '}',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

function authMiddleware(): string {
  return [
    "import type { FastifyReply, FastifyRequest } from 'fastify';",
    '',
    '/**',
    ' * Verificación de token.',
    ' *',
    ' * PENDIENTE: sustituir por una verificación de firma real (JWT o sesión).',
    ' * Este esqueleto rechaza peticiones sin token pero NO valida la firma,',
    ' * así que no debe llegar a producción tal cual.',
    ' */',
    'export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {',
    '  const header = request.headers.authorization;',
    "  if (!header?.startsWith('Bearer ')) {",
    "    await reply.code(401).send({ message: 'Falta el token de autenticación' });",
    '  }',
    '}',
  ].join('\n');
}

function authRoutes(): string {
  return [
    "import type { FastifyInstance } from 'fastify';",
    '',
    '/**',
    ' * Rutas de autenticación.',
    ' *',
    ' * PENDIENTE: implementar hash de contraseña (argon2id o bcrypt), emisión',
    ' * y rotación de tokens, y limitación de intentos. El auditor de seguridad',
    ' * del ecosistema marca este fichero hasta que se complete.',
    ' */',
    'export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {',
    "  app.post('/api/auth/register', async (_request, reply) =>",
    "    reply.code(501).send({ message: 'Registro no implementado' }),",
    '  );',
    "  app.post('/api/auth/login', async (_request, reply) =>",
    "    reply.code(501).send({ message: 'Login no implementado' }),",
    '  );',
    "  app.get('/api/auth/me', async (_request, reply) =>",
    "    reply.code(501).send({ message: 'Perfil no implementado' }),",
    '  );',
    '}',
  ].join('\n');
}

/** Endpoints previstos, expuestos para que el documentador los liste. */
export function describeEndpoints(endpoints: readonly ApiEndpoint[]): string[] {
  return endpoints.map((endpoint) => `${endpoint.method} ${endpoint.path} - ${endpoint.summary}`);
}

export { tsTypeOf };

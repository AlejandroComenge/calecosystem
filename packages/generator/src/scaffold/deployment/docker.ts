import type { Blueprint, DeploymentAdapter, ScaffoldContext, VirtualFile } from '@calecosystem/contracts';
import { fileFactory, hashBanner } from '../shared.ts';

const TOOL = '@calecosystem/generator (deployment)';
const file = fileFactory(TOOL);

const DB_IMAGES: Record<string, string> = {
  postgres: 'postgres:17-alpine',
  mysql: 'mysql:8.4',
  mongodb: 'mongo:8',
  sqlite: '',
};

/**
 * Adaptador de despliegue: contenedores, orquestacion local y CI.
 *
 * Genera el camino completo de "clonar" a "levantado" porque un proyecto
 * que no se puede arrancar el primer dia se abandona el segundo.
 */
export const dockerDeploymentAdapter: DeploymentAdapter = {
  id: 'calec.deployment.docker',
  displayName: 'Docker Compose + GitHub Actions',
  target: 'docker-compose',
  tier: 'community',

  scaffold({ blueprint }: ScaffoldContext): VirtualFile[] {
    const files: VirtualFile[] = [
      file('apps/api/Dockerfile', apiDockerfile()),
      file('apps/web/Dockerfile', webDockerfile()),
      file('docker-compose.yml', compose(blueprint)),
      file('.env.example', envExample(blueprint)),
      file('.github/workflows/ci.yml', ciWorkflow(blueprint)),
      file('.dockerignore', ['node_modules', 'dist', '.git', '.env', 'coverage'].join('\n')),
    ];
    return files;
  },
};

function apiDockerfile(): string {
  return [
    '# Multi-stage: la imagen final no lleva ni fuentes ni dependencias de build.',
    'FROM node:22-alpine AS deps',
    'WORKDIR /app',
    'COPY package*.json ./',
    'RUN npm ci --omit=dev',
    '',
    'FROM node:22-alpine AS runtime',
    'WORKDIR /app',
    'ENV NODE_ENV=production',
    '# Ejecuta sin privilegios: la imagen base ya trae el usuario `node`.',
    'USER node',
    'COPY --from=deps --chown=node:node /app/node_modules ./node_modules',
    'COPY --chown=node:node . .',
    'EXPOSE 3000',
    'HEALTHCHECK --interval=30s --timeout=3s --retries=3 \\',
    '  CMD node -e "fetch(\'http://localhost:3000/api/health\').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"',
    'CMD ["node", "src/server.ts"]',
  ].join('\n');
}

function webDockerfile(): string {
  return [
    'FROM node:22-alpine AS build',
    'WORKDIR /app',
    'COPY package*.json ./',
    'RUN npm ci',
    'COPY . .',
    'RUN npm run build',
    '',
    'FROM nginx:1.27-alpine AS runtime',
    'COPY --from=build /app/dist /usr/share/nginx/html',
    'EXPOSE 80',
  ].join('\n');
}

function compose(blueprint: Blueprint): string {
  const database = blueprint.stack.database;
  const image = DB_IMAGES[database] ?? '';
  const lines: string[] = [
    hashBanner(blueprint, TOOL),
    '',
    'services:',
    '  api:',
    '    build: ./apps/api',
    '    environment:',
    '      NODE_ENV: development',
    '      PORT: 3000',
  ];

  for (const secret of blueprint.deployment.secrets) {
    lines.push(`      ${secret}: \${${secret}}`);
  }
  lines.push('    ports:', '      - "3000:3000"');

  if (image) {
    lines.push('    depends_on:', '      database:', '        condition: service_healthy');
  }

  lines.push(
    '',
    '  web:',
    '    build: ./apps/web',
    '    ports:',
    '      - "8080:80"',
    '    depends_on:',
    '      - api',
  );

  if (image) {
    lines.push(
      '',
      '  database:',
      `    image: ${image}`,
      '    environment:',
      ...databaseEnv(database),
      '    volumes:',
      '      - db-data:/var/lib/data',
      '    healthcheck:',
      `      test: ${healthcheckFor(database)}`,
      '      interval: 10s',
      '      timeout: 5s',
      '      retries: 5',
      '',
      'volumes:',
      '  db-data:',
    );
  }

  if (blueprint.requirements.features.realtime) {
    lines.push('', '  cache:', '    image: redis:7-alpine', '    ports:', '      - "6379:6379"');
  }

  return lines.join('\n');
}

function databaseEnv(database: string): string[] {
  if (database === 'postgres') {
    return [
      '      POSTGRES_USER: app',
      '      POSTGRES_PASSWORD: ${DATABASE_PASSWORD}',
      '      POSTGRES_DB: app',
    ];
  }
  if (database === 'mysql') {
    return ['      MYSQL_ROOT_PASSWORD: ${DATABASE_PASSWORD}', '      MYSQL_DATABASE: app'];
  }
  if (database === 'mongodb') {
    return [
      '      MONGO_INITDB_ROOT_USERNAME: app',
      '      MONGO_INITDB_ROOT_PASSWORD: ${DATABASE_PASSWORD}',
    ];
  }
  return [];
}

function healthcheckFor(database: string): string {
  if (database === 'postgres') return '["CMD-SHELL", "pg_isready -U app"]';
  if (database === 'mysql') return '["CMD", "mysqladmin", "ping", "-h", "localhost"]';
  if (database === 'mongodb') return '["CMD", "mongosh", "--eval", "db.adminCommand(\'ping\')"]';
  return '["CMD", "true"]';
}

function envExample(blueprint: Blueprint): string {
  const lines = [
    hashBanner(blueprint, TOOL),
    '# Copia este fichero a `.env` y rellena los valores.',
    '# `.env` NO debe subirse al repositorio.',
    '',
    'NODE_ENV=development',
    'PORT=3000',
    'DATABASE_PASSWORD=cambia-esto-en-local',
  ];
  for (const secret of blueprint.deployment.secrets) {
    lines.push(`${secret}=`);
  }
  return lines.join('\n');
}

function ciWorkflow(blueprint: Blueprint): string {
  return [
    `name: CI`,
    '',
    'on:',
    '  push:',
    '    branches: [main]',
    '  pull_request:',
    '',
    'jobs:',
    '  build:',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - uses: actions/checkout@v4',
    '      - uses: actions/setup-node@v4',
    '        with:',
    "          node-version: '22'",
    '',
    '      - name: Instalar dependencias del API',
    '        working-directory: apps/api',
    '        run: npm ci',
    '      - name: Typecheck del API',
    '        working-directory: apps/api',
    '        run: npm run typecheck',
    '      - name: Tests del API',
    '        working-directory: apps/api',
    '        run: npm test',
    '',
    '      - name: Instalar dependencias del frontend',
    '        working-directory: apps/web',
    '        run: npm ci',
    '      - name: Build del frontend',
    '        working-directory: apps/web',
    `        run: npm run build`,
    '',
    `# Stack: ${blueprint.stack.frontend} + ${blueprint.stack.backend} + ${blueprint.stack.database}`,
  ].join('\n');
}

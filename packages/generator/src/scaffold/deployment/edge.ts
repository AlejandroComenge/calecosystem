import type { Blueprint, DeploymentAdapter, ScaffoldContext, VirtualFile } from '@calecosystem/contracts';
import { fileFactory, hashBanner, jsonFile } from '../shared.ts';

const TOOL = '@calecosystem/generator (edge)';
const file = fileFactory(TOOL);

/** Comando de build del frontend según el framework elegido. */
function buildSettings(blueprint: Blueprint): { command: string; output: string } {
  if (blueprint.stack.frontend === 'angular') {
    return { command: 'npm run build', output: `dist/${blueprint.slug}-web/browser` };
  }
  return { command: 'npm run build', output: 'dist' };
}

/**
 * Despliegue en Vercel.
 *
 * Cubre el frontend, que es lo que estas plataformas hacen bien. El API queda
 * fuera a propósito: un backend con estado y base de datos propia no encaja en
 * el modelo de funciones efimeras sin rediseñarlo, y fingir lo contrario
 * genera una configuración que falla el día del despliegue.
 */
export const vercelDeploymentAdapter: DeploymentAdapter = {
  id: 'calec.deployment.vercel',
  displayName: 'Vercel (frontend) + API independiente',
  target: 'vercel',
  tier: 'community',

  scaffold({ blueprint }: ScaffoldContext): VirtualFile[] {
    const build = buildSettings(blueprint);

    return [
      file(
        'vercel.json',
        jsonFile({
          $schema: 'https://openapi.vercel.sh/vercel.json',
          buildCommand: build.command,
          outputDirectory: `apps/web/${build.output}`,
          installCommand: 'npm ci --workspace apps/web',
          framework: blueprint.stack.frontend === 'angular' ? 'angular' : 'vite',
          rewrites: [
            // El API vive fuera de Vercel: se proxya por variable de entorno
            // para no tener que recompilar al cambiar de entorno.
            { source: '/api/:path*', destination: `${'${API_URL}'}/api/:path*` },
            // SPA: cualquier ruta desconocida la resuelve el enrutador cliente.
            { source: '/((?!api/).*)', destination: '/index.html' },
          ],
          headers: [
            {
              source: '/(.*)',
              headers: securityHeaders(),
            },
          ],
        }),
      ),
      file('docs/DEPLOY-VERCEL.md', vercelGuide(blueprint)),
    ];
  },
};

/**
 * Despliegue en Netlify.
 *
 * Mismo alcance y mismo motivo que Vercel: frontend si, backend con estado no.
 */
export const netlifyDeploymentAdapter: DeploymentAdapter = {
  id: 'calec.deployment.netlify',
  displayName: 'Netlify (frontend) + API independiente',
  target: 'netlify',
  tier: 'community',

  scaffold({ blueprint }: ScaffoldContext): VirtualFile[] {
    const build = buildSettings(blueprint);

    const toml = [
      hashBanner(blueprint, TOOL),
      '',
      '[build]',
      '  base = "apps/web"',
      `  command = "${build.command}"`,
      `  publish = "${build.output}"`,
      '',
      '[build.environment]',
      '  NODE_VERSION = "22"',
      '',
      '# El API se despliega aparte; aqui solo se redirige hacia el.',
      '[[redirects]]',
      '  from = "/api/*"',
      '  to = "https://API_HOST_PLACEHOLDER/api/:splat"',
      '  status = 200',
      '  force = true',
      '',
      '# SPA: el enrutador del cliente resuelve el resto de rutas.',
      '[[redirects]]',
      '  from = "/*"',
      '  to = "/index.html"',
      '  status = 200',
      '',
      '[[headers]]',
      '  for = "/*"',
      '  [headers.values]',
      ...securityHeaders().map((header) => `    ${header.key} = "${header.value}"`),
    ].join('\n');

    return [file('netlify.toml', toml), file('docs/DEPLOY-NETLIFY.md', netlifyGuide(blueprint))];
  },
};

/**
 * Cabeceras de seguridad por defecto.
 *
 * Son gratis en el momento de generar y carisimas de añadir cuando ya hay
 * trafico: cualquier cambio de política rompe integraciones que nadie
 * documento.
 */
function securityHeaders(): { key: string; value: string }[] {
  return [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  ];
}

function vercelGuide(blueprint: Blueprint): string {
  return [
    '# Despliegue en Vercel',
    '',
    `Frontend (${blueprint.stack.frontend}) en Vercel; API (${blueprint.stack.backend}) en un`,
    'servicio con estado propio: Railway, Fly.io, Render o tu propio contenedor.',
    '',
    '## Frontend',
    '',
    '1. Importa el repositorio en Vercel.',
    '2. Deja `vercel.json` tal cual: ya trae build, salida y cabeceras.',
    '3. Define la variable `API_URL` con la URL pública del API.',
    '',
    '## API',
    '',
    'Usa la imagen de `apps/api/Dockerfile`. Variables necesarias:',
    '',
    '```',
    ...blueprint.deployment.secrets.map((secret) => `${secret}=`),
    '```',
    '',
    '## Por qué el API no va aquí',
    '',
    `El backend mantiene conexiones a ${blueprint.stack.database} y estado entre`,
    'peticiones. Las funciones efimeras agotan el pool de conexiones y añaden',
    'arranque en frio a cada llamada. Si necesitas todo en Vercel, el cambio no',
    'es de configuración: hay que rediseñar el acceso a datos (pooling externo o',
    'driver sobre HTTP).',
  ].join('\n');
}

function netlifyGuide(blueprint: Blueprint): string {
  return [
    '# Despliegue en Netlify',
    '',
    `Frontend (${blueprint.stack.frontend}) en Netlify; API (${blueprint.stack.backend}) aparte.`,
    '',
    '## Pasos',
    '',
    '1. Conecta el repositorio: `netlify.toml` ya trae base, comando y publicación.',
    '2. Sustituye `API_HOST_PLACEHOLDER` en `netlify.toml` por el host real del API.',
    '3. Configura las variables del API en su propio servicio:',
    '',
    '```',
    ...blueprint.deployment.secrets.map((secret) => `${secret}=`),
    '```',
    '',
    '## Nota sobre la redirección',
    '',
    'El proxy `/api/*` se resuelve en el borde, así que el navegador nunca ve una',
    'petición entre dominios distintos y no hay CORS que configurar.',
  ].join('\n');
}

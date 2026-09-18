import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { GenerationResult, Logger, Principal, Tier, UsageGuard } from '@calecosystem/contracts';
import {
  EcosystemKernel,
  Entitlements,
  createKernel,
  createLogger,
  createZip,
  EcosystemError,
} from '@calecosystem/core';
import { CodeGenerator, generatorPlugin } from '@calecosystem/generator';
import { optimizerPlugin } from '@calecosystem/optimizer';
import { securityPlugin } from '@calecosystem/security';
import { testerPlugin } from '@calecosystem/tester';
import { documenterPlugin } from '@calecosystem/documenter';
import {
  MemoryUsageStore,
  QuotaExceededError,
  USAGE_GUARD_TOKEN,
  billingPlugin,
} from '@calecosystem/billing';
import { SCENARIOS } from '../../../examples/scenarios.ts';
import { HttpError, nombreDescarga, readJsonBody, sendBuffer, sendError, sendJson } from './http.ts';

const RAIZ_PUBLICA = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

/** Tipos MIME de los ficheros que sirve la aplicación. */
const TIPOS: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

export interface AppOptions {
  readonly logger?: Logger;
  /** Plan con el que se atienden las peticiones. */
  readonly tier?: Tier;
  /** Con `false` no se sirve la interfaz web (solo API). */
  readonly serveUi?: boolean;
}

export interface App {
  readonly handler: (request: IncomingMessage, response: ServerResponse) => Promise<void>;
  readonly kernel: EcosystemKernel;
  close(): Promise<void>;
}

/**
 * Aplicación web del ecosistema.
 *
 * El generador trabaja en memoria, así que el servidor no necesita disco:
 * recibe un enunciado, devuelve el plan o un ZIP. Esa propiedad, que se
 * decidió por testeabilidad, es lo que hace posible esta aplicación sin
 * tocar el generador.
 *
 * Pendiente para producción, y declarado como tal: no hay cuentas de usuario
 * reales (el identificador viene de una cabecera), el consumo se guarda en
 * memoria y se pierde al reiniciar, y no hay límite de peticiones por IP.
 */
export async function createApp(options: AppOptions = {}): Promise<App> {
  const logger = options.logger ?? createLogger({ level: 'info' });
  const tier: Tier = options.tier ?? 'enterprise';

  const kernel = await createKernel({
    logger,
    entitlements: new Entitlements({ tier }),
    plugins: [
      billingPlugin({ store: new MemoryUsageStore() }),
      generatorPlugin(),
      optimizerPlugin(),
      securityPlugin(),
      testerPlugin(),
      documenterPlugin(),
    ],
  });

  const guard = kernel.resolveService(USAGE_GUARD_TOKEN);
  const generator = new CodeGenerator({ kernel });

  const handler = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const ruta = url.pathname;

    try {
      if (request.method === 'GET' && ruta === '/api/health') {
        sendJson(response, 200, { status: 'ok', tier });
        return;
      }

      if (request.method === 'GET' && ruta === '/api/examples') {
        sendJson(response, 200, {
          examples: SCENARIOS.map((scenario) => ({
            id: scenario.id,
            title: scenario.title,
            audience: scenario.audience,
            brief: scenario.brief,
            framework: scenario.framework ?? null,
          })),
        });
        return;
      }

      if (request.method === 'GET' && ruta === '/api/usage') {
        await responderConsumo(response, guard, principalDe(request));
        return;
      }

      if (request.method === 'POST' && ruta === '/api/plan') {
        await responderPlan(request, response, generator);
        return;
      }

      if (request.method === 'POST' && ruta === '/api/generate') {
        await responderGeneracion(request, response, generator, kernel, principalDe(request));
        return;
      }

      if (ruta.startsWith('/api/')) {
        throw new HttpError(404, 'NOT_FOUND', `No existe el recurso "${ruta}".`);
      }

      if (options.serveUi === false) {
        throw new HttpError(404, 'NOT_FOUND', 'La interfaz web está desactivada.');
      }
      if (request.method !== 'GET') {
        throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Método no permitido.');
      }
      await servirEstatico(response, ruta);
    } catch (error) {
      if (!(error instanceof HttpError)) {
        logger.error(`Fallo atendiendo ${request.method} ${ruta}: ${(error as Error).message}`);
      }
      sendError(response, error, request);
    }
  };

  return { handler, kernel, close: () => kernel.dispose() };
}

/* --- Rutas -------------------------------------------------------------- */

async function responderPlan(
  request: IncomingMessage,
  response: ServerResponse,
  generator: CodeGenerator,
): Promise<void> {
  const cuerpo = await readJsonBody(request);
  const blueprint = await generator.plan(entradaDesde(cuerpo));

  sendJson(response, 200, {
    projectName: blueprint.projectName,
    stack: blueprint.stack,
    deployment: blueprint.deployment.target,
    confidence: blueprint.requirements.confidence,
    entities: blueprint.entities.map((entity) => ({
      name: entity.name,
      route: `/api/${entity.plural}`,
      fields: entity.fields.length,
      inferred: entity.inferred === true,
    })),
    actors: blueprint.requirements.actors.map((actor) => actor.label),
    features: Object.entries(blueprint.requirements.features)
      .filter(([, activa]) => activa)
      .map(([nombre]) => nombre),
    endpoints: blueprint.endpoints.length,
    pages: blueprint.pages.length,
    decisions: blueprint.decisions.map((decision) => ({
      id: decision.id,
      choice: decision.choice,
      rationale: decision.rationale,
      alternatives: decision.alternatives,
    })),
    risks: blueprint.risks.map((risk) => ({
      title: risk.title,
      impact: risk.impact,
      mitigation: risk.mitigation,
    })),
    openQuestions: blueprint.requirements.openQuestions,
  });
}

async function responderGeneracion(
  request: IncomingMessage,
  response: ServerResponse,
  generator: CodeGenerator,
  kernel: EcosystemKernel,
  principal: Principal,
): Promise<void> {
  const cuerpo = await readJsonBody(request);
  const formato = cuerpo['format'] === 'json' ? 'json' : 'zip';

  let resultado: GenerationResult;
  try {
    resultado = await generator.generate(entradaDesde(cuerpo), { principal });
  } catch (error) {
    if (error instanceof QuotaExceededError) {
      throw new HttpError(429, error.code, error.message, {
        upgradeTo: error.details['upgradeTo'] ?? null,
        resetAt: error.details['resetAt'] ?? null,
      });
    }
    if (error instanceof EcosystemError) {
      throw new HttpError(400, error.code, error.message);
    }
    throw error;
  }

  const resumen = resumirGeneracion(resultado, kernel);

  if (formato === 'json') {
    sendJson(response, 200, resumen);
    return;
  }

  const zip = createZip(resultado.files);
  sendBuffer(response, 200, zip, 'application/zip', {
    'Content-Disposition': `attachment; filename="${nombreDescarga(resultado.blueprint.slug)}"`,
    // El resumen viaja en cabeceras para que la interfaz pueda enseñarlo sin
    // una segunda petición que volvería a generar el proyecto entero.
    'X-Calec-Summary': Buffer.from(JSON.stringify(resumen), 'utf8').toString('base64'),
  });
}

async function responderConsumo(
  response: ServerResponse,
  guard: UsageGuard | undefined,
  principal: Principal,
): Promise<void> {
  if (!guard) throw new HttpError(503, 'NO_QUOTA_GUARD', 'El control de consumo no está activo.');

  sendJson(response, 200, {
    user: principal.userId,
    tier: principal.tier,
    quotas: await guard.summary(principal),
  });
}

/* --- Auxiliares --------------------------------------------------------- */

function entradaDesde(cuerpo: Record<string, unknown>) {
  const texto = cuerpo['text'];
  if (typeof texto !== 'string' || texto.trim().length < 10) {
    throw new HttpError(
      400,
      'EMPTY_REQUIREMENTS',
      'Describe el producto en al menos un par de frases: qué gestiona y quién lo usa.',
    );
  }

  const nombre = typeof cuerpo['name'] === 'string' ? cuerpo['name'].trim() : '';
  const framework = typeof cuerpo['framework'] === 'string' ? cuerpo['framework'] : undefined;
  const deployment = typeof cuerpo['deployment'] === 'string' ? cuerpo['deployment'] : undefined;

  return {
    text: texto,
    ...(nombre ? { projectName: nombre } : {}),
    hints: {
      ...(framework ? { frontend: framework } : {}),
      ...(deployment ? { deployment } : {}),
    },
  };
}

/**
 * Identifica a quien pide.
 *
 * PENDIENTE: esto es una cabecera, no una sesión autenticada. Sirve para
 * separar consumos en una demo y NO vale para facturar: cualquiera puede
 * enviar el identificador que quiera.
 */
function principalDe(request: IncomingMessage): Principal {
  const cabecera = request.headers['x-calec-user'];
  const userId = (Array.isArray(cabecera) ? cabecera[0] : cabecera)?.slice(0, 64);
  return { userId: userId && userId.trim() !== '' ? userId : 'anonimo', tier: 'community' };
}

function resumirGeneracion(resultado: GenerationResult, kernel: EcosystemKernel) {
  return {
    projectName: resultado.blueprint.projectName,
    slug: resultado.blueprint.slug,
    stack: resultado.blueprint.stack,
    template: resultado.template,
    metrics: resultado.metrics,
    confidence: resultado.requirements.confidence,
    openQuestions: resultado.requirements.openQuestions,
    warnings: resultado.warnings,
    skippedModules: kernel.diagnostics().skippedPlugins.map((plugin) => plugin.name),
    reports: resultado.reports.map((report) => ({
      kind: report.kind,
      score: report.score,
      summary: report.summary,
      findings: report.findings.map((finding) => ({
        id: finding.id,
        severity: finding.severity,
        title: finding.title,
        remediation: finding.remediation ?? null,
      })),
    })),
  };
}

/** Sirve la interfaz. Rechaza cualquier ruta que intente salir de `public/`. */
async function servirEstatico(response: ServerResponse, ruta: string): Promise<void> {
  const relativa = ruta === '/' ? 'index.html' : ruta.replace(/^\/+/, '');
  const destino = path.join(RAIZ_PUBLICA, relativa);

  if (!destino.startsWith(RAIZ_PUBLICA + path.sep)) {
    throw new HttpError(403, 'FORBIDDEN', 'Ruta no permitida.');
  }

  let contenido: Buffer;
  try {
    contenido = await readFile(destino);
  } catch {
    throw new HttpError(404, 'NOT_FOUND', 'Recurso no encontrado.');
  }

  sendBuffer(response, 200, contenido, TIPOS[path.extname(destino)] ?? 'application/octet-stream');
}

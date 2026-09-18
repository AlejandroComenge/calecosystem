import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Utilidades HTTP mínimas.
 *
 * Se usa `node:http` directamente en vez de un framework porque el servidor
 * expone seis rutas y no tiene estado. Meter una dependencia para esto sería
 * añadir superficie de mantenimiento y de seguridad a cambio de nada.
 */

/** Cuerpo máximo admitido. Un enunciado de negocio no ocupa más. */
export const MAX_CUERPO_BYTES = 64 * 1024;

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(status: number, code: string, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * Lee el cuerpo de la petición con un tope.
 *
 * Sin el tope, una petición con un cuerpo enorme deja el proceso sin memoria:
 * es la forma más barata de tumbar un servidor.
 */
export async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const trozos: Buffer[] = [];
  let total = 0;

  for await (const trozo of request) {
    total += (trozo as Buffer).length;
    if (total > MAX_CUERPO_BYTES) {
      throw new HttpError(413, 'BODY_TOO_LARGE', 'El cuerpo de la petición es demasiado grande.');
    }
    trozos.push(trozo as Buffer);
  }

  if (trozos.length === 0) return {};

  try {
    const valor = JSON.parse(Buffer.concat(trozos).toString('utf8')) as unknown;
    if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) {
      throw new Error('se esperaba un objeto');
    }
    return valor as Record<string, unknown>;
  } catch (error) {
    throw new HttpError(400, 'INVALID_JSON', `JSON no válido: ${(error as Error).message}`);
  }
}

export function sendJson(
  response: ServerResponse,
  status: number,
  payload: unknown,
  extra: Record<string, string> = {},
): void {
  const cuerpo = Buffer.from(JSON.stringify(payload), 'utf8');
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': cuerpo.length,
    ...cabecerasDeSeguridad(),
    ...extra,
  });
  response.end(cuerpo);
}

/**
 * Responde a un error.
 *
 * Cuando se rechaza un cuerpo a medio leer hay que cerrar la conexión: si el
 * cliente la reutiliza (keep-alive), los bytes que quedaron sin consumir se
 * interpretan como el principio de la petición siguiente, que llega corrupta.
 * Es un fallo desagradable de diagnosticar porque afecta a una petición que
 * en sí misma era correcta.
 */
export function sendError(response: ServerResponse, error: unknown, request?: IncomingMessage): void {
  if (error instanceof HttpError) {
    const cerrar = error.code === 'BODY_TOO_LARGE';
    sendJson(
      response,
      error.status,
      { error: { code: error.code, message: error.message, ...error.details } },
      cerrar ? { Connection: 'close' } : {},
    );
    if (cerrar) request?.destroy();
    return;
  }
  // Nunca se filtra el mensaje interno: puede contener rutas del servidor.
  sendJson(response, 500, {
    error: { code: 'INTERNAL_ERROR', message: 'Error interno del servidor.' },
  });
}

export function sendBuffer(
  response: ServerResponse,
  status: number,
  cuerpo: Buffer,
  tipo: string,
  extra: Record<string, string> = {},
): void {
  response.writeHead(status, {
    'Content-Type': tipo,
    'Content-Length': cuerpo.length,
    ...cabecerasDeSeguridad(),
    ...extra,
  });
  response.end(cuerpo);
}

/**
 * Cabeceras de seguridad por defecto.
 *
 * Son gratis ahora y caras de añadir cuando ya hay tráfico y clientes
 * integrados. La política de contenido permite solo lo que sirve el propio
 * servidor, más las tipografías de Google.
 */
export function cabecerasDeSeguridad(): Record<string, string> {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Content-Security-Policy':
      "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
      "font-src https://fonts.gstatic.com; img-src 'self' data:; script-src 'self'",
  };
}

/** Nombre de fichero seguro para la cabecera `Content-Disposition`. */
export function nombreDescarga(slug: string): string {
  const limpio = slug.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 60) || 'proyecto';
  return `${limpio}.zip`;
}

/**
 * @calecosystem/server
 *
 * Aplicación web del ecosistema: genera proyectos desde el navegador, sin
 * instalar nada. Es la superficie que hace el producto vendible a quien no
 * usa una terminal.
 */
export { createApp, type App, type AppOptions } from './app.ts';
export {
  HttpError,
  MAX_CUERPO_BYTES,
  cabecerasDeSeguridad,
  nombreDescarga,
  readJsonBody,
  sendBuffer,
  sendError,
  sendJson,
} from './http.ts';
export { startServer, type ServerHandle } from './start.ts';

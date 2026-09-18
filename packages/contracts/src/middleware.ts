/**
 * Middleware de generación.
 *
 * Los hooks sirven para intervenir *dentro* del pipeline. El middleware
 * envuelve la ejecución *entera*, que es lo que hace falta para cuotas,
 * autorización, telemetría de extremo a extremo o reintentos: cosas que
 * tienen que poder decir "no" antes de que empiece nada y ver el resultado
 * completo después.
 *
 * Misma forma que un middleware HTTP: recibe el contexto y un `next`, y
 * decide si lo llama.
 */
import type { GenerationResult } from './artifacts.ts';
import type { RequirementsInput } from './requirements.ts';
import type { Logger } from './logger.ts';
import type { Principal } from './usage.ts';

export interface GenerationContext {
  readonly input: RequirementsInput;
  /** Quien lanza la generación. Ausente en usos anonimos (CLI local). */
  readonly principal?: Principal;
  readonly logger: Logger;
  /** Identificador de esta ejecución; correlaciona logs y telemetría. */
  readonly requestId: string;
  /** Bolsa compartida entre middlewares de la misma ejecución. */
  readonly state: Map<string, unknown>;
}

export type GenerationNext = () => Promise<GenerationResult>;

export type GenerationMiddleware = (
  context: GenerationContext,
  next: GenerationNext,
) => Promise<GenerationResult>;

export interface MiddlewareRegistration {
  readonly name: string;
  /** Menor = más externo (se ejecuta antes). Por defecto 100. */
  readonly priority?: number;
  readonly handler: GenerationMiddleware;
}

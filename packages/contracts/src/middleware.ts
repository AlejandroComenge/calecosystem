/**
 * Middleware de generacion.
 *
 * Los hooks sirven para intervenir *dentro* del pipeline. El middleware
 * envuelve la ejecucion *entera*, que es lo que hace falta para cuotas,
 * autorizacion, telemetria de extremo a extremo o reintentos: cosas que
 * tienen que poder decir "no" antes de que empiece nada y ver el resultado
 * completo despues.
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
  /** Quien lanza la generacion. Ausente en usos anonimos (CLI local). */
  readonly principal?: Principal;
  readonly logger: Logger;
  /** Identificador de esta ejecucion; correlaciona logs y telemetria. */
  readonly requestId: string;
  /** Bolsa compartida entre middlewares de la misma ejecucion. */
  readonly state: Map<string, unknown>;
}

export type GenerationNext = () => Promise<GenerationResult>;

export type GenerationMiddleware = (
  context: GenerationContext,
  next: GenerationNext,
) => Promise<GenerationResult>;

export interface MiddlewareRegistration {
  readonly name: string;
  /** Menor = mas externo (se ejecuta antes). Por defecto 100. */
  readonly priority?: number;
  readonly handler: GenerationMiddleware;
}

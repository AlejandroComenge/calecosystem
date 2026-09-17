import type {
  GenerationContext,
  GenerationMiddleware,
  GenerationNext,
  GenerationResult,
  MiddlewareRegistration,
} from '@calecosystem/contracts';
import { toError } from './errors.ts';

export const DEFAULT_MIDDLEWARE_PRIORITY = 100;

/**
 * Cadena de middlewares alrededor de una generacion completa.
 *
 * El middleware con menor `priority` es el mas externo: ve la peticion antes
 * que nadie y el resultado despues que todos. Es el orden que quiere una
 * comprobacion de cuota (rechazar cuanto antes) y tambien una medicion de
 * extremo a extremo (abarcar todo lo demas).
 *
 * Un middleware que no llama a `next` corta la ejecucion. Eso es una
 * caracteristica, no un accidente: asi se implementa "cuota agotada".
 */
export class MiddlewareChain {
  readonly #registrations: (MiddlewareRegistration & { seq: number })[] = [];
  #seq = 0;

  register(registration: MiddlewareRegistration): () => void {
    const entry = { ...registration, seq: this.#seq++ };
    this.#registrations.push(entry);
    return () => {
      const index = this.#registrations.indexOf(entry);
      if (index >= 0) this.#registrations.splice(index, 1);
    };
  }

  /** Nombres en orden de ejecucion. Util para `calec modules` y diagnostico. */
  names(): string[] {
    return this.#ordered().map((entry) => entry.name);
  }

  get size(): number {
    return this.#registrations.length;
  }

  removeByName(name: string): number {
    const before = this.#registrations.length;
    for (let index = this.#registrations.length - 1; index >= 0; index -= 1) {
      if (this.#registrations[index]?.name === name) this.#registrations.splice(index, 1);
    }
    return before - this.#registrations.length;
  }

  /** Ejecuta la cadena y termina llamando a `core`. */
  async run(
    context: GenerationContext,
    core: () => Promise<GenerationResult>,
  ): Promise<GenerationResult> {
    const ordered = this.#ordered();

    const dispatch = async (index: number): Promise<GenerationResult> => {
      if (index >= ordered.length) return core();
      const entry = ordered[index] as MiddlewareRegistration;
      let advanced = false;
      const next: GenerationNext = async () => {
        if (advanced) {
          // Llamar dos veces a `next` produce generaciones duplicadas y
          // contadores de uso inflados. Mejor fallar que facturar de mas.
          throw new Error(`El middleware "${entry.name}" llamo a next() mas de una vez.`);
        }
        advanced = true;
        return dispatch(index + 1);
      };

      try {
        return await entry.handler(context, next);
      } catch (error) {
        const failure = toError(error);
        context.logger.debug(`Middleware "${entry.name}" interrumpio la generacion: ${failure.message}`);
        throw failure;
      }
    };

    return dispatch(0);
  }

  #ordered(): (MiddlewareRegistration & { seq: number })[] {
    return [...this.#registrations].sort(
      (a, b) =>
        (a.priority ?? DEFAULT_MIDDLEWARE_PRIORITY) - (b.priority ?? DEFAULT_MIDDLEWARE_PRIORITY) ||
        a.seq - b.seq,
    );
  }
}

/** Azucar de tipado para definir un middleware con nombre. */
export function defineMiddleware(
  name: string,
  handler: GenerationMiddleware,
  priority?: number,
): MiddlewareRegistration {
  return priority === undefined ? { name, handler } : { name, handler, priority };
}

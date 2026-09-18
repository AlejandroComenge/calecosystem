import type {
  EventHandler,
  EventHookName,
  EventHooks,
  HookMeta,
  HookRegistrationOptions,
  HookRegistry,
  Logger,
  TransformHandler,
  TransformHookName,
  TransformHooks,
  Unsubscribe,
} from '@calecosystem/contracts';
import { toError } from './errors.ts';

export const DEFAULT_HOOK_PRIORITY = 100;

interface Registration {
  /** Se guarda sin tipar: la seguridad de tipos la da la API pública. */
  readonly handler: unknown;
  readonly meta: HookMeta;
  /** Orden de inscripción; desempata prioridades iguales de forma estable. */
  readonly seq: number;
}

/**
 * Bus de hooks tipado.
 *
 * Reglas de diseño:
 *  - Los handlers se ordenan por `priority` y, a igualdad, por orden de
 *    registro. El resultado es determinista, que es imprescindible para
 *    que dos ejecuciones del generador produzcan lo mismo.
 *  - Un evento que lanza no tumba el pipeline: se registra y se continua.
 *    Una transformación que lanza si lo hace, porque su salida alimenta al
 *    siguiente handler y seguir con un valor corrupto es peor.
 *  - Una transformación que devuelve `undefined` conserva el valor previo:
 *    error muy común al escribir plugins, y es más útil perdonarlo que
 *    dejar el blueprint en `undefined`.
 */
export class HookBus implements HookRegistry {
  #events = new Map<string, Registration[]>();
  #transforms = new Map<string, Registration[]>();
  #seq = 0;
  #logger: Logger;

  constructor(logger: Logger) {
    this.#logger = logger.child('hooks');
  }

  onEvent<K extends EventHookName>(
    name: K,
    handler: EventHandler<K>,
    options: HookRegistrationOptions = {},
  ): Unsubscribe {
    return this.#add(this.#events, name, handler, options);
  }

  onTransform<K extends TransformHookName>(
    name: K,
    handler: TransformHandler<K>,
    options: HookRegistrationOptions = {},
  ): Unsubscribe {
    return this.#add(this.#transforms, name, handler, options);
  }

  /** Notifica a todos los observadores. Nunca lanza. */
  async emit<K extends EventHookName>(name: K, payload: EventHooks[K]): Promise<void> {
    const registrations = this.#events.get(name);
    if (!registrations) return;
    for (const registration of [...registrations].sort(compareRegistrations)) {
      try {
        const handler = registration.handler as EventHandler<K>;
        await handler(payload, registration.meta);
      } catch (error) {
        this.#logger.error(
          `El handler del evento "${name}" registrado por "${registration.meta.source}" fallo: ${toError(error).message}`,
        );
      }
    }
  }

  /** Aplica la cascada de transformaciones y devuelve el valor final. */
  async applyTransform<K extends TransformHookName>(
    name: K,
    initial: TransformHooks[K],
  ): Promise<TransformHooks[K]> {
    const registrations = this.#transforms.get(name);
    if (!registrations) return initial;
    let current = initial;
    for (const registration of [...registrations].sort(compareRegistrations)) {
      const handler = registration.handler as TransformHandler<K>;
      const next = await handler(current, registration.meta);
      if (next === undefined || next === null) {
        this.#logger.warn(
          `La transformacion "${name}" de "${registration.meta.source}" no devolvio valor; se conserva el anterior.`,
        );
        continue;
      }
      current = next;
    }
    return current;
  }

  /** Número de handlers registrados para un hook. Útil en diagnostico. */
  countHandlers(name: EventHookName | TransformHookName): number {
    return (
      (this.#events.get(name)?.length ?? 0) + (this.#transforms.get(name)?.length ?? 0)
    );
  }

  /** Elimina todos los handlers registrados por una fuente (al descargar un plugin). */
  removeBySource(source: string): number {
    let removed = 0;
    for (const store of [this.#events, this.#transforms]) {
      for (const [name, registrations] of store) {
        const kept = registrations.filter((registration) => registration.meta.source !== source);
        removed += registrations.length - kept.length;
        store.set(name, kept);
      }
    }
    return removed;
  }

  #add(
    store: Map<string, Registration[]>,
    name: string,
    handler: unknown,
    options: HookRegistrationOptions,
  ): Unsubscribe {
    const registration: Registration = {
      handler,
      meta: {
        source: options.source ?? 'anonymous',
        priority: options.priority ?? DEFAULT_HOOK_PRIORITY,
      },
      seq: this.#seq++,
    };
    const registrations = store.get(name) ?? [];
    registrations.push(registration);
    store.set(name, registrations);

    return () => {
      const current = store.get(name);
      if (!current) return;
      const index = current.indexOf(registration);
      if (index >= 0) current.splice(index, 1);
    };
  }
}

function compareRegistrations(a: Registration, b: Registration): number {
  return a.meta.priority - b.meta.priority || a.seq - b.seq;
}

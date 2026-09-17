/** Errores del ecosistema con codigo estable para diagnostico y telemetria. */
export class EcosystemError extends Error {
  readonly code: string;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(code: string, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'EcosystemError';
    this.code = code;
    this.details = details;
  }
}

export class PluginError extends EcosystemError {
  constructor(code: string, message: string, details: Record<string, unknown> = {}) {
    super(code, message, details);
    this.name = 'PluginError';
  }
}

export class EntitlementError extends EcosystemError {
  constructor(message: string, details: Record<string, unknown> = {}) {
    super('ENTITLEMENT_REQUIRED', message, details);
    this.name = 'EntitlementError';
  }
}

export class GenerationError extends EcosystemError {
  constructor(code: string, message: string, details: Record<string, unknown> = {}) {
    super(code, message, details);
    this.name = 'GenerationError';
  }
}

export function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

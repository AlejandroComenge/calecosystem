import type { RequirementsModel, TemplateMatch } from '@calecosystem/contracts';
import { containsTerm, normalize } from '../analysis/text.ts';

export interface DetectionRules {
  /** Terminos que apuntan a esta plantilla. Cada acierto suma. */
  readonly signals: readonly string[];
  /** Entidades cuya presencia refuerza la hipotesis. */
  readonly entities?: readonly string[];
  /** Capacidades que refuerzan la hipotesis. */
  readonly features?: readonly (keyof RequirementsModel['features'])[];
  /** Terminos que la descartan: evita falsos positivos entre plantillas. */
  readonly antiSignals?: readonly string[];
}

/**
 * Puntuacion comun a todas las plantillas.
 *
 * Tres fuentes de evidencia con pesos distintos: las palabras del enunciado
 * pesan mas que las entidades deducidas, porque las entidades ya son una
 * inferencia y encadenar inferencias multiplica el error.
 *
 * Las contra-senales restan de verdad. Sin ellas, "tienda" en un enunciado de
 * SaaS bastaria para generar un carrito de la compra que nadie pidio.
 */
export function scoreTemplate(
  requirements: RequirementsModel,
  rules: DetectionRules,
): TemplateMatch {
  const text = normalize(`${requirements.summary} ${requirements.projectName}`);
  const matchedSignals = rules.signals.filter((signal) => containsTerm(text, signal));

  const entityNames = new Set(requirements.entities.map((entity) => entity.name));
  const matchedEntities = (rules.entities ?? []).filter((name) => entityNames.has(name));

  const matchedFeatures = (rules.features ?? []).filter(
    (feature) => requirements.features[feature] === true,
  );

  const antiMatches = (rules.antiSignals ?? []).filter((signal) => containsTerm(text, signal));

  const score =
    Math.min(0.6, matchedSignals.length * 0.2) +
    Math.min(0.25, matchedEntities.length * 0.09) +
    Math.min(0.15, matchedFeatures.length * 0.05) -
    antiMatches.length * 0.2;

  return {
    score: Number(Math.max(0, Math.min(1, score)).toFixed(2)),
    signals: [...matchedSignals, ...matchedEntities.map((name) => `entidad:${name}`)],
  };
}

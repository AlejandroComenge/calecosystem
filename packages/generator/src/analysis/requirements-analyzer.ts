import type {
  Actor,
  ComplianceStandard,
  CrudOperation,
  DomainEntity,
  FeatureSet,
  Locale,
  Logger,
  NonFunctionalRequirements,
  RequirementsEnricher,
  RequirementsInput,
  RequirementsModel,
} from '@calecosystem/contracts';
import {
  ACTOR_LEXICON,
  COMPLIANCE_LEXICON,
  ENTITY_LEXICON,
  ENTITY_TRIGGERS,
  FEATURE_LEXICON,
  INTEGRATION_LEXICON,
  fieldsFor,
} from './lexicon.ts';
import {
  clamp,
  containsTerm,
  countMatches,
  normalize,
  pascalCase,
  pluralizeEnglish,
  singularize,
  slugify,
  titleCase,
  unique,
} from './text.ts';

const ALL_OPERATIONS: readonly CrudOperation[] = ['list', 'read', 'create', 'update', 'delete'];
const MAX_ENTITIES = 12;

export interface AnalyzerOptions {
  readonly logger: Logger;
  /** Puertos opcionales (p.ej. un LLM) que refinan el analisis deterministico. */
  readonly enrichers?: readonly RequirementsEnricher[];
}

/**
 * Traduce una descripcion de negocio a un modelo de requisitos.
 *
 * Es un analizador basado en reglas y lexicos, no un modelo de lenguaje:
 * su salida es reproducible, explicable y gratis. Cuando no llega, no
 * inventa: baja `confidence` y deja la duda en `openQuestions`, que es lo
 * que un consultor haria antes de dibujar una arquitectura.
 */
export class RequirementsAnalyzer {
  readonly #logger: Logger;
  readonly #enrichers: readonly RequirementsEnricher[];

  constructor(options: AnalyzerOptions) {
    this.#logger = options.logger.child('analyzer');
    this.#enrichers = options.enrichers ?? [];
  }

  async analyze(input: RequirementsInput): Promise<RequirementsModel> {
    const raw = input.text ?? '';
    const text = normalize(raw);
    const locale: Locale = input.locale ?? detectLocale(text);

    const features = this.#detectFeatures(text, input);
    const entities = this.#detectEntities(text, features);
    const actors = this.#detectActors(text, features);
    const nonFunctional = this.#detectNonFunctional(text);
    const integrations = INTEGRATION_LEXICON.filter((name) => containsTerm(text, name));
    const projectName = input.projectName?.trim() || inferProjectName(raw, text);

    const openQuestions = buildOpenQuestions({ entities, actors, features, nonFunctional });

    let model: RequirementsModel = {
      projectName,
      slug: slugify(projectName),
      summary: buildSummary(raw),
      locale,
      actors,
      entities,
      features,
      nonFunctional,
      integrations,
      confidence: scoreConfidence({ text, entities, actors, features, integrations }),
      openQuestions,
      hints: input.hints ?? {},
    };

    for (const enricher of this.#enrichers) {
      try {
        const patch = await enricher.enrich(raw, model);
        model = { ...model, ...patch };
        this.#logger.debug(`Analisis enriquecido por "${enricher.id}".`);
      } catch (error) {
        this.#logger.warn(
          `El enriquecedor "${enricher.id}" fallo; se conserva el analisis deterministico.`,
          { error: String(error) },
        );
      }
    }

    this.#logger.info(
      `Requisitos analizados: ${model.entities.length} entidades, ` +
        `${model.actors.length} roles, confianza ${(model.confidence * 100).toFixed(0)}%.`,
    );
    return model;
  }

  #detectFeatures(text: string, input: RequirementsInput): FeatureSet {
    const detected = Object.fromEntries(
      Object.entries(FEATURE_LEXICON).map(([feature, terms]) => [
        feature,
        terms.some((term) => containsTerm(text, term)),
      ]),
    ) as unknown as FeatureSet;

    const merged: FeatureSet = { ...detected, ...(input.hints?.features ?? {}) };

    // Dependencias implicitas: hay capacidades que arrastran a otras. Pagar
    // sin saber quien paga no existe, y varios roles implican autenticacion.
    const withImplied: FeatureSet = {
      ...merged,
      auth: merged.auth || merged.payments || merged.roles || merged.multiTenant,
      roles: merged.roles || merged.adminPanel || merged.multiTenant,
    };
    return withImplied;
  }

  #detectEntities(text: string, features: FeatureSet): DomainEntity[] {
    const found = new Map<string, string>(); // nombre canonico -> termino original

    // 1) Enumeraciones tras verbos de gestion: "gestionar productos, pedidos y clientes".
    for (const trigger of ENTITY_TRIGGERS) {
      const pattern = new RegExp(`${trigger}\\s+((?:[a-z0-9]+(?:[,\\s]+(?:y|e|and)?\\s*)?){1,8})`, 'g');
      for (const match of text.matchAll(pattern)) {
        for (const token of (match[1] ?? '').split(/[,\s]+|\s+y\s+|\s+and\s+/)) {
          register(found, token);
        }
      }
    }

    // 2) Barrido general del lexico de dominio sobre todo el texto.
    for (const term of Object.keys(ENTITY_LEXICON)) {
      if (containsTerm(text, term)) register(found, term);
    }

    // 3) Entidades implicitas por capacidad activa.
    if (features.auth) register(found, 'usuario');
    if (features.payments) register(found, 'pago');

    const entities = [...found.entries()]
      .slice(0, MAX_ENTITIES)
      .map(([name, sourceTerm]) => buildEntity(name, sourceTerm));

    // 4) Red de seguridad: sin dominio no hay nada que generar.
    if (entities.length === 0) {
      this.#logger.warn('No se detectaron entidades de dominio; se genera un modelo `Item` base.');
      return [buildEntity('Item', 'item')];
    }
    return entities;
  }

  #detectActors(text: string, features: FeatureSet): Actor[] {
    const labels = new Set<string>();
    for (const [term, label] of Object.entries(ACTOR_LEXICON)) {
      if (containsTerm(text, term)) labels.add(label);
    }
    // Historias de usuario: "como <rol> quiero ...".
    for (const match of text.matchAll(/como\s+([a-z]+)\s+(?:quiero|necesito|puedo)/g)) {
      const label = ACTOR_LEXICON[match[1] ?? ''];
      if (label) labels.add(label);
    }
    if (labels.size === 0 && features.auth) labels.add('Usuario');
    if (features.adminPanel) labels.add('Administrador');

    return [...labels].sort().map((label) => ({
      id: slugify(label),
      label,
      capabilities: capabilitiesFor(label, features),
    }));
  }

  #detectNonFunctional(text: string): NonFunctionalRequirements {
    const compliance = Object.entries(COMPLIANCE_LEXICON)
      .filter(([, terms]) => terms.some((term) => containsTerm(text, term)))
      .map(([standard]) => standard as ComplianceStandard);

    const expectedUsers = parseUserScale(text);
    const critical =
      compliance.includes('pci-dss') ||
      compliance.includes('hipaa') ||
      containsTerm(text, 'alta disponibilidad') ||
      containsTerm(text, 'mision critica') ||
      (expectedUsers ?? 0) >= 50_000;

    return {
      expectedUsers,
      compliance,
      availabilityTarget: critical ? 'critical' : (expectedUsers ?? 0) >= 5_000 ? 'high' : 'best-effort',
      dataResidency: containsTerm(text, 'union europea') || containsTerm(text, 'europa')
        ? 'eu'
        : null,
    };
  }
}

/* --- Auxiliares puros ------------------------------------------------- */

function register(found: Map<string, string>, rawToken: string): void {
  const token = normalize(rawToken).trim();
  if (token.length < 3) return;
  const canonical = ENTITY_LEXICON[token] ?? ENTITY_LEXICON[singularize(token)];
  if (!canonical) return;
  if (!found.has(canonical)) found.set(canonical, token);
}

function buildEntity(name: string, sourceTerm: string): DomainEntity {
  const canonical = pascalCase(name);
  return {
    name: canonical,
    plural: pluralizeEnglish(canonical).toLowerCase(),
    sourceTerm,
    fields: fieldsFor(canonical),
    operations: [...ALL_OPERATIONS],
  };
}

function capabilitiesFor(label: string, features: FeatureSet): string[] {
  if (label === 'Administrador') {
    const base = ['manage:all', 'read:analytics'];
    return features.multiTenant ? [...base, 'manage:tenants'] : base;
  }
  if (label === 'Invitado' || label === 'Visitante') return ['read:public'];
  const base = ['read:own', 'write:own'];
  return features.payments ? [...base, 'create:payment'] : base;
}

function detectLocale(text: string): Locale {
  const spanishMarkers = countMatches(text, ['de', 'para', 'con', 'usuarios', 'gestionar', 'que']);
  const englishMarkers = countMatches(text, ['the', 'with', 'users', 'manage', 'that', 'for']);
  return englishMarkers > spanishMarkers ? 'en' : 'es';
}

/** Palabras vacias que nunca deben acabar en el nombre del proyecto. */
const NAME_STOPWORDS = new Set([
  'de', 'del', 'para', 'por', 'con', 'sin', 'los', 'las', 'el', 'la', 'un',
  'una', 'que', 'en', 'y', 'e', 'o', 'u', 'al', 'donde', 'the', 'for', 'of', 'to',
]);

function inferProjectName(raw: string, text: string): string {
  const pattern =
    /(?:plataforma|aplicacion|app|sistema|portal|marketplace|tienda|herramienta|web)\s+((?:[a-z0-9]+\s+){0,3}[a-z0-9]+)/;
  const match = pattern.exec(text);
  if (match?.[1]) {
    const words = match[1]
      .split(/\s+/)
      .filter((word) => word.length > 2 && !NAME_STOPWORDS.has(word))
      .slice(0, 2);
    if (words.length > 0) return titleCase(words.join(' '));
  }
  const firstWords = raw
    .trim()
    .split(/\s+/)
    .filter((word) => !NAME_STOPWORDS.has(normalize(word)))
    .slice(0, 3)
    .join(' ');
  return firstWords === '' ? 'Generated App' : titleCase(firstWords);
}

function buildSummary(raw: string): string {
  const collapsed = raw.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= 240) return collapsed;
  return `${collapsed.slice(0, 237)}...`;
}

/** Extrae una escala de usuarios de expresiones como "10.000 usuarios" o "5k clientes". */
function parseUserScale(text: string): number | null {
  const pattern = /([0-9][0-9.,]*)\s*(k|mil|millones|m)?\s*(?:de\s+)?(usuarios|clientes|visitas)/;
  const match = pattern.exec(text);
  if (!match) return null;
  const digits = (match[1] ?? '').replace(/[.,]/g, '');
  const base = Number.parseInt(digits, 10);
  if (!Number.isFinite(base)) return null;
  const multiplier = match[2];
  if (multiplier === 'k' || multiplier === 'mil') return base * 1_000;
  if (multiplier === 'm' || multiplier === 'millones') return base * 1_000_000;
  return base;
}

interface ConfidenceInput {
  readonly text: string;
  readonly entities: readonly DomainEntity[];
  readonly actors: readonly Actor[];
  readonly features: FeatureSet;
  readonly integrations: readonly string[];
}

/**
 * Confianza: cuanta senal real habia en el texto. No mide si la arquitectura
 * es buena, mide si el enunciado daba para decidirla. Es la metrica que evita
 * que un parrafo de dos lineas pase por una especificacion.
 */
function scoreConfidence(input: ConfidenceInput): number {
  const words = input.text.split(/\s+/).filter(Boolean).length;
  const activeFeatures = Object.values(input.features).filter(Boolean).length;
  const score =
    0.15 +
    clamp(words / 120, 0, 0.25) +
    clamp(input.entities.length / 6, 0, 0.3) +
    clamp(input.actors.length / 4, 0, 0.15) +
    clamp(activeFeatures / 8, 0, 0.1) +
    clamp(input.integrations.length / 3, 0, 0.05);
  return Number(clamp(score, 0, 1).toFixed(2));
}

interface OpenQuestionsInput {
  readonly entities: readonly DomainEntity[];
  readonly actors: readonly Actor[];
  readonly features: FeatureSet;
  readonly nonFunctional: NonFunctionalRequirements;
}

function buildOpenQuestions(input: OpenQuestionsInput): string[] {
  const questions: string[] = [];
  if (input.entities.length <= 1) {
    questions.push('Que entidades de negocio principales debe gestionar la aplicacion?');
  }
  if (input.actors.length === 0) {
    questions.push('Que tipos de usuario o roles existen y que puede hacer cada uno?');
  }
  if (input.nonFunctional.expectedUsers === null) {
    questions.push('Que volumen de usuarios y de datos se espera en el primer ano?');
  }
  if (input.features.payments && input.nonFunctional.compliance.length === 0) {
    questions.push('Hay pagos: que pasarela se usara y quien asume el alcance PCI-DSS?');
  }
  if (!input.features.auth) {
    questions.push('La aplicacion es totalmente publica o requiere cuentas de usuario?');
  }
  return unique(questions);
}

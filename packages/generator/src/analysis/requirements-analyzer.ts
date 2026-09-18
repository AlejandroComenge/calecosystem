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
  FRAMING_BUILD,
  FRAMING_MODALS,
  INTEGRATION_LEXICON,
  NON_ENTITY_WORDS,
  NON_NOUN_ENDINGS,
  OBJECT_VERBS,
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
/** Tope de entidades deducidas: a partir de ahí, el ruido supera al valor. */
const MAX_INFERRED_ENTITIES = 4;

export interface AnalyzerOptions {
  readonly logger: Logger;
  /** Puertos opcionales (p.ej. un LLM) que refinan el análisis deterministico. */
  readonly enrichers?: readonly RequirementsEnricher[];
}

/**
 * Traduce una descripción de negocio a un modelo de requisitos.
 *
 * Es un analizador basado en reglas y lexicos, no un modelo de lenguaje:
 * su salida es reproducible, explicable y gratis. Cuando no llega, no
 * inventa: baja `confidence` y deja la duda en `openQuestions`, que es lo
 * que un consultor haría antes de dibujar una arquitectura.
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
    const nombreDeducido = !input.projectName?.trim() && !namedInBrief(text);

    const openQuestions = buildOpenQuestions({
      entities,
      actors,
      features,
      nonFunctional,
      nombreDeducido,
    });

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
        this.#logger.debug(`Análisis enriquecido por "${enricher.id}".`);
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
    // sin saber quien paga no existe, y varios roles implican autenticación.
    const withImplied: FeatureSet = {
      ...merged,
      auth: merged.auth || merged.payments || merged.roles || merged.multiTenant,
      roles: merged.roles || merged.adminPanel || merged.multiTenant,
    };
    return withImplied;
  }

  #detectEntities(text: string, features: FeatureSet): DomainEntity[] {
    const found = new Map<string, string>(); // nombre canónico -> término original
    const meta = framedTerms(text);

    // 1) Enumeraciones tras verbos de gestión: "gestionar productos, pedidos y clientes".
    for (const trigger of ENTITY_TRIGGERS) {
      const pattern = new RegExp(`${trigger}\\s+((?:[a-z0-9]+(?:[,\\s]+(?:y|e|and)?\\s*)?){1,8})`, 'g');
      for (const match of text.matchAll(pattern)) {
        for (const token of (match[1] ?? '').split(/[,\s]+|\s+y\s+|\s+and\s+/)) {
          register(found, token, meta);
        }
      }
    }

    // 2) Barrido general del léxico de dominio sobre todo el texto.
    for (const term of Object.keys(ENTITY_LEXICON)) {
      if (containsTerm(text, term)) register(found, term, meta);
    }

    // 3) Entidades implícitas por capacidad activa.
    if (features.auth) register(found, 'usuario', meta);
    if (features.payments) register(found, 'pago', meta);

    const conocidas = [...found.entries()].map(([name, sourceTerm]) =>
      buildEntity(name, sourceTerm),
    );

    // 4) Lo que el léxico no conoce.
    //
    //    Antes se descartaba, y por eso "cartas de colección" desaparecía del
    //    modelo sin dejar rastro. Ahora se propone: es mejor un nombre que
    //    alguien tiene que revisar que un silencio que nadie detecta. Van
    //    marcadas como `inferred` para que la documentación lo advierta.
    const deducidas = this.#inferUnknownEntities(text, meta, conocidas, features);

    const entities = [...conocidas, ...deducidas].slice(0, MAX_ENTITIES);

    // 5) Red de seguridad: sin dominio no hay nada que generar.
    if (entities.length === 0) {
      this.#logger.warn('No se detectaron entidades de dominio; se genera un modelo `Item` base.');
      return [buildEntity('Item', 'item')];
    }
    if (deducidas.length > 0) {
      this.#logger.info(
        `Entidades deducidas del texto (revísalas): ${deducidas.map((e) => e.name).join(', ')}.`,
      );
    }
    return entities;
  }

  /**
   * Extrae sustantivos que no están en el léxico.
   *
   * Sin analizador morfológico, la fiabilidad viene de exigir una señal
   * sintáctica clara: o el sustantivo va detrás de un verbo que introduce el
   * objeto gestionado ("publican cartas"), o es un plural detrás de
   * determinante ("las cartas"). Todo lo demás se descarta, porque un modelo
   * con entidades inventadas es peor que uno incompleto.
   */
  #inferUnknownEntities(
    text: string,
    meta: ReadonlySet<string>,
    conocidas: readonly DomainEntity[],
    features: FeatureSet,
  ): DomainEntity[] {
    const yaCubiertos = new Set<string>();
    for (const entity of conocidas) {
      yaCubiertos.add(entity.sourceTerm);
      yaCubiertos.add(singularize(entity.sourceTerm));
    }

    const candidatos = new Map<string, number>(); // término -> fuerza de la señal

    // (a) Objeto de un verbo de gestión: la señal más fiable.
    for (const verbo of OBJECT_VERBS) {
      const pattern = new RegExp(
        `${verbo}\\s+(?:de\\s+)?(?:los|las|un|una|unos|unas|sus)?\\s*([a-z]{4,})`,
        'g',
      );
      for (const match of text.matchAll(pattern)) {
        if (match[1]) candidatos.set(match[1], Math.max(candidatos.get(match[1]) ?? 0, 2));
      }
    }

    // (b) Plural detrás de determinante: señal más débil, pero útil.
    for (const match of text.matchAll(
      /\b(?:los|las|unos|unas|sus|nuestros|nuestras)\s+([a-z]{4,}(?:es|s))\b/g,
    )) {
      if (match[1]) candidatos.set(match[1], Math.max(candidatos.get(match[1]) ?? 0, 1));
    }

    const deducidas: DomainEntity[] = [];
    const vistos = new Set<string>();

    for (const [termino] of [...candidatos.entries()].sort((a, b) => b[1] - a[1])) {
      if (deducidas.length >= MAX_INFERRED_ENTITIES) break;
      const singular = singularize(termino);

      if (NON_ENTITY_WORDS.has(termino) || NON_ENTITY_WORDS.has(singular)) continue;
      if (meta.has(termino) || meta.has(singular)) continue;
      if (yaCubiertos.has(termino) || yaCubiertos.has(singular)) continue;
      if (ENTITY_LEXICON[termino] ?? ENTITY_LEXICON[singular]) continue;
      // Los roles se modelan como actores, no como tablas.
      if (ACTOR_LEXICON[termino] ?? ACTOR_LEXICON[singular]) continue;
      if (NON_NOUN_ENDINGS.some((fin) => singular.endsWith(fin))) continue;
      if (singular.length < 4) continue;

      const nombre = pascalCase(singular);
      if (vistos.has(nombre)) continue;
      vistos.add(nombre);

      deducidas.push({ ...buildEntity(nombre, termino), inferred: true });
    }

    void features;
    return deducidas;
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

function register(
  found: Map<string, string>,
  rawToken: string,
  meta: ReadonlySet<string> = new Set(),
): void {
  const token = normalize(rawToken).trim();
  if (token.length < 3) return;
  // "quiero preparar un proyecto para..." habla del encargo, no del dominio.
  if (meta.has(token) || meta.has(singularize(token))) return;
  const canonical = ENTITY_LEXICON[token] ?? ENTITY_LEXICON[singularize(token)];
  if (!canonical) return;
  if (!found.has(canonical)) found.set(canonical, token);
}

/**
 * Términos que solo aparecen enmarcando el encargo ("quiero montar una
 * plataforma"), nunca como algo que la aplicación gestione.
 *
 * Si la palabra aparece también fuera de ese marco, no se filtra: una
 * herramienta de gestión de proyectos sí tiene una entidad `Project`.
 */
function framedTerms(text: string): Set<string> {
  const modales = FRAMING_MODALS.join('|');
  const construir = FRAMING_BUILD.join('|');
  const determinante = '(?:un|una|el|la|mi|nuestro|nuestra|unos|unas)?\\s*';

  // "quiero preparar una web", "montar un marketplace", "necesito una app".
  const patrones = [
    new RegExp(`\\b(?:${modales})\\s+(?:${construir})\\s+${determinante}([a-z]{3,})`, 'g'),
    new RegExp(`\\b(?:${construir})\\s+${determinante}([a-z]{3,})`, 'g'),
    new RegExp(`\\b(?:${modales})\\s+${determinante}([a-z]{3,})`, 'g'),
  ];

  const enmarcados = new Set<string>();
  const vecesEnmarcado = new Map<string, number>();

  for (const patron of patrones) {
    for (const match of text.matchAll(patron)) {
      const termino = match[1];
      // Un verbo capturado como si fuera sustantivo no cuenta.
      if (!termino || esVerboDeMarco(termino)) continue;
      enmarcados.add(termino);
      vecesEnmarcado.set(termino, (vecesEnmarcado.get(termino) ?? 0) + 1);
    }
  }

  // Si el término aparece más veces de las que va enmarcado, también se usa
  // como dominio y no debe filtrarse.
  for (const termino of [...enmarcados]) {
    const total = [...text.matchAll(new RegExp(`\\b${termino}\\b`, 'g'))].length;
    if (total > (vecesEnmarcado.get(termino) ?? 0)) enmarcados.delete(termino);
  }
  return enmarcados;
}

function esVerboDeMarco(termino: string): boolean {
  return FRAMING_MODALS.includes(termino) || FRAMING_BUILD.includes(termino);
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

/** Palabras vacías que nunca deben acabar en el nombre del proyecto. */
const NAME_STOPWORDS = new Set([
  'de', 'del', 'para', 'por', 'con', 'sin', 'los', 'las', 'el', 'la', 'un',
  'una', 'que', 'en', 'y', 'e', 'o', 'u', 'al', 'donde', 'the', 'for', 'of', 'to',
  // Calificativos genericos: describen el medio, no el producto.
  'online', 'web', 'digital', 'nueva', 'nuevo', 'interna', 'interno',
]);

function inferProjectName(raw: string, text: string): string {
  // La busqueda se hace sobre el texto normalizado (los lexicos no llevan
  // tildes), pero el nombre se recorta del texto ORIGINAL. `normalize` no
  // cambia la longitud de la cadena, asi que los indices de una version
  // sirven para la otra, y el proyecto conserva su acentuacion real:
  // "ceramica artesanal" seria un nombre mal escrito para el cliente.
  const pattern =
    /(?:plataforma|aplicacion|app|sistema|portal|marketplace|tienda|herramienta|web)\s+((?:[a-z0-9]+\s+){0,3}[a-z0-9]+)/;
  const match = pattern.exec(text);

  if (match?.[1] !== undefined && match.index >= 0) {
    const inicio = match.index + match[0].indexOf(match[1]);
    const original = raw.slice(inicio, inicio + match[1].length);
    const words = zip(match[1].split(/\s+/), original.split(/\s+/))
      .filter(([normalizada]) => normalizada.length > 2 && !NAME_STOPWORDS.has(normalizada))
      .slice(0, 2)
      .map(([, acentuada]) => acentuada);
    if (words.length > 0) return titleCase(words.join(' '));
  }

  // Sin patrón reconocible: se toman las primeras palabras con contenido,
  // descartando el andamiaje de la petición ("quiero preparar un...") y los
  // términos que solo enmarcan el encargo.
  const descartables = new Set<string>([
    ...NAME_STOPWORDS,
    ...FRAMING_MODALS,
    ...FRAMING_BUILD,
    ...framedTerms(text),
    'ser', 'estar', 'poder', 'hacer',
  ]);

  const firstWords = raw
    .trim()
    .split(/\s+/)
    .filter((word) => {
      const limpia = normalize(word).replace(/[^a-z0-9]/g, '');
      return limpia.length > 2 && !descartables.has(limpia);
    })
    .slice(0, 3)
    .join(' ');
  return firstWords === '' ? 'Proyecto Sin Nombre' : titleCase(firstWords);
}

/** Empareja dos listas del mismo tamano; descarta el sobrante si difieren. */
function zip<A, B>(a: readonly A[], b: readonly B[]): [A, B][] {
  const pares: [A, B][] = [];
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    pares.push([a[index] as A, b[index] as B]);
  }
  return pares;
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
 * Confianza: cuanta señal real había en el texto. No mide si la arquitectura
 * es buena, mide si el enunciado daba para decidirla. Es la métrica que evita
 * que un parrafo de dos líneas pase por una especificación.
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
  readonly nombreDeducido: boolean;
}

/** `true` si el enunciado nombra el producto con un patrón reconocible. */
function namedInBrief(text: string): boolean {
  return /(?:plataforma|aplicacion|app|sistema|portal|marketplace|tienda|herramienta|web)\s+(?:[a-z0-9]+\s+){0,3}[a-z0-9]+/.test(
    text,
  );
}

function buildOpenQuestions(input: OpenQuestionsInput): string[] {
  const questions: string[] = [];

  if (input.nombreDeducido) {
    questions.push('Cómo se llama el producto? El nombre se dedujo del texto y puede no ser el bueno.');
  }

  // Las entidades deducidas son una propuesta, no una certeza.
  const deducidas = input.entities.filter((entity) => entity.inferred);
  if (deducidas.length > 0) {
    questions.push(
      `Se dedujeron del texto estas entidades: ${deducidas.map((e) => e.name).join(', ')}. ` +
        'Confirma su nombre y qué campos necesita cada una.',
    );
  }
  if (input.entities.length <= 1) {
    questions.push('Que entidades de negocio principales debe gestionar la aplicación?');
  }
  if (input.actors.length === 0) {
    questions.push('Que tipos de usuario o roles existen y que puede hacer cada uno?');
  }
  if (input.nonFunctional.expectedUsers === null) {
    questions.push('Que volumen de usuarios y de datos se espera en el primer año?');
  }
  if (input.features.payments && input.nonFunctional.compliance.length === 0) {
    questions.push('Hay pagos: que pasarela se usará y quien asume el alcance PCI-DSS?');
  }
  if (!input.features.auth) {
    questions.push('La aplicación es totalmente pública o requiere cuentas de usuario?');
  }
  return unique(questions);
}

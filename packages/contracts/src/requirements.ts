/**
 * Modelo de requisitos: la traducción estructurada de una descripción de
 * negocio en lenguaje natural. Es la única entrada que el resto del
 * ecosistema necesita entender.
 */

export type Locale = 'es' | 'en';

export type FieldType =
  | 'string'
  | 'text'
  | 'number'
  | 'decimal'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'uuid'
  | 'email'
  | 'url'
  | 'enum'
  | 'reference';

export interface EntityField {
  readonly name: string;
  readonly type: FieldType;
  readonly required: boolean;
  /** Entidad referenciada cuando `type === 'reference'`. */
  readonly references?: string;
  readonly description?: string;
}

export type CrudOperation = 'list' | 'read' | 'create' | 'update' | 'delete';

export interface DomainEntity {
  /** Nombre singular en PascalCase, p.ej. `Product`. */
  readonly name: string;
  /** Nombre plural en kebab-case para rutas, p.ej. `products`. */
  readonly plural: string;
  /** Término original detectado en el texto del usuario. */
  readonly sourceTerm: string;
  readonly fields: readonly EntityField[];
  readonly operations: readonly CrudOperation[];
  /**
   * `true` cuando el término no estaba en el léxico de dominio y se dedujo
   * del texto. El modelo propuesto es una hipótesis razonable, no una
   * certeza: conviene que alguien confirme el nombre y los campos.
   */
  readonly inferred?: boolean;
}

export interface Actor {
  /** Identificador en kebab-case, p.ej. `admin`. */
  readonly id: string;
  readonly label: string;
  readonly capabilities: readonly string[];
}

/**
 * Capacidades transversales detectadas. Son las que mueven decisiones de
 * arquitectura (y, en varios casos, de precio).
 */
export interface FeatureSet {
  readonly auth: boolean;
  readonly roles: boolean;
  readonly payments: boolean;
  readonly realtime: boolean;
  readonly i18n: boolean;
  readonly fileUploads: boolean;
  readonly search: boolean;
  readonly notifications: boolean;
  readonly adminPanel: boolean;
  readonly analytics: boolean;
  readonly multiTenant: boolean;
  readonly seo: boolean;
  readonly offline: boolean;
}

export type ComplianceStandard = 'gdpr' | 'pci-dss' | 'hipaa' | 'iso-27001' | 'soc2';

export interface NonFunctionalRequirements {
  /** Usuarios concurrentes/activos estimados. `null` si no se pudo inferir. */
  readonly expectedUsers: number | null;
  readonly compliance: readonly ComplianceStandard[];
  readonly availabilityTarget: 'best-effort' | 'high' | 'critical';
  readonly dataResidency: string | null;
}

export interface RequirementsInput {
  /** Descripción de negocio en lenguaje natural. */
  readonly text: string;
  readonly locale?: Locale;
  /** Nombre explicito del proyecto; si falta se infiere del texto. */
  readonly projectName?: string;
  /** Pistas que ganan a la inferencia automática. */
  readonly hints?: RequirementsHints;
}

export interface RequirementsHints {
  readonly frontend?: string;
  readonly backend?: string;
  readonly database?: string;
  readonly deployment?: string;
  readonly features?: Partial<FeatureSet>;
}

export interface RequirementsModel {
  readonly projectName: string;
  /** Identificador kebab-case derivado de `projectName`. */
  readonly slug: string;
  readonly summary: string;
  readonly locale: Locale;
  readonly actors: readonly Actor[];
  readonly entities: readonly DomainEntity[];
  readonly features: FeatureSet;
  readonly nonFunctional: NonFunctionalRequirements;
  readonly integrations: readonly string[];
  /**
   * Confianza del análisis, 0..1. Por debajo de `0.5` conviene pedir
   * aclaraciones antes de generar.
   */
  readonly confidence: number;
  /** Preguntas abiertas que el analizador no pudo resolver por si solo. */
  readonly openQuestions: readonly string[];
  readonly hints: RequirementsHints;
}

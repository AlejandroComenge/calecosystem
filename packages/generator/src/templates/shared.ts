import type {
  ApiEndpoint,
  Blueprint,
  DomainEntity,
  EntityField,
  PagePlan,
} from '@calecosystem/contracts';
import { fieldsFor } from '../analysis/lexicon.ts';
import { pluralizeEnglish } from '../analysis/text.ts';

/**
 * Anade una entidad al blueprint solo si no existe ya.
 *
 * Las plantillas completan el dominio que el analizador no dedujo, pero el
 * analizador manda: si detecto `Order` a partir del enunciado, sus campos son
 * mas fieles que los de la plantilla.
 */
export function ensureEntity(
  blueprint: Blueprint,
  name: string,
  fields?: readonly EntityField[],
): Blueprint {
  if (blueprint.entities.some((entity) => entity.name === name)) return blueprint;

  const entity: DomainEntity = {
    name,
    plural: pluralizeEnglish(name).toLowerCase(),
    sourceTerm: `plantilla:${name.toLowerCase()}`,
    fields: fields ?? fieldsFor(name),
    operations: ['list', 'read', 'create', 'update', 'delete'],
  };
  return { ...blueprint, entities: [...blueprint.entities, entity] };
}

/** Anade paginas evitando duplicar rutas ya planificadas. */
export function addPages(blueprint: Blueprint, pages: readonly PagePlan[]): Blueprint {
  const existing = new Set(blueprint.pages.map((page) => page.route));
  const additions = pages.filter((page) => !existing.has(page.route));
  return { ...blueprint, pages: [...blueprint.pages, ...additions] };
}

/** Anade endpoints evitando duplicar metodo + ruta. */
export function addEndpoints(blueprint: Blueprint, endpoints: readonly ApiEndpoint[]): Blueprint {
  const existing = new Set(blueprint.endpoints.map((endpoint) => `${endpoint.method} ${endpoint.path}`));
  const additions = endpoints.filter(
    (endpoint) => !existing.has(`${endpoint.method} ${endpoint.path}`),
  );
  return { ...blueprint, endpoints: [...blueprint.endpoints, ...additions] };
}

/** Deja constancia de que una plantilla intervino y de que anadio. */
export function recordTemplateDecision(
  blueprint: Blueprint,
  templateName: string,
  added: string,
): Blueprint {
  return {
    ...blueprint,
    decisions: [
      ...blueprint.decisions,
      {
        id: 'ADR-PLANTILLA',
        title: 'Plantilla de producto aplicada',
        choice: templateName,
        rationale:
          `Los requisitos encajan con un producto de tipo "${templateName}". ` +
          `La plantilla anade ${added}, que este tipo de producto necesita siempre.`,
        alternatives: ['generar solo el CRUD deducido del enunciado'],
      },
    ],
  };
}

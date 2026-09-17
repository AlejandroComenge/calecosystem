/**
 * Plantillas de producto.
 *
 * Un adaptador sabe escribir React; una plantilla sabe como es una tienda.
 * Son ejes distintos y por eso son contratos distintos: la plantilla
 * e-commerce debe poder generarse en React, Vue o Angular sin reescribirla.
 *
 * Una plantilla interviene en dos momentos:
 *  1. `refine`   - completa el blueprint (entidades, vistas, endpoints) con
 *                  lo que ese tipo de producto siempre necesita.
 *  2. `scaffold` - aporta las pantallas y componentes propios del dominio.
 */
import type { Blueprint } from './blueprint.ts';
import type { RequirementsModel } from './requirements.ts';
import type { VirtualFile } from './artifacts.ts';
import type { ScaffoldContext } from './adapters.ts';
import type { Tier } from './tiers.ts';

export type TemplateKind = 'ecommerce' | 'saas' | 'landing' | 'generic' | (string & {});

export interface TemplateMatch {
  /** Confianza 0..1 de que esta plantilla encaja con los requisitos. */
  readonly score: number;
  /** Terminos del enunciado que la activaron. Se muestra al usuario. */
  readonly signals: readonly string[];
}

export interface ProjectTemplate {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly kind: TemplateKind;
  readonly tier: Tier;
  /** Frameworks soportados. Vacio o ausente = todos. */
  readonly frameworks?: readonly string[];

  /** Cuanto encaja esta plantilla con los requisitos detectados. */
  detect(requirements: RequirementsModel): TemplateMatch;

  /** Completa el blueprint con lo propio de este tipo de producto. */
  refine(blueprint: Blueprint): Blueprint;

  /** Pantallas y componentes especificos del dominio. */
  scaffold(context: ScaffoldContext): VirtualFile[] | Promise<VirtualFile[]>;
}

/** Umbral por debajo del cual no merece la pena aplicar una plantilla. */
export const TEMPLATE_MATCH_THRESHOLD = 0.35;

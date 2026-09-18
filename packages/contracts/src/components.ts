/**
 * Especificación de componentes de interfaz.
 *
 * Un componente se describe como datos, no como cadena de texto. Así el mismo
 * catálogo puede renderizarse a React hoy y a Vue o Svelte mañana sin
 * reescribir el catálogo, y una plantilla puede componer componentes sin
 * concatenar JSX a mano.
 */
import type { DependencySpec } from './dependencies.ts';

export type PropKind =
  | 'string'
  | 'number'
  | 'boolean'
  | 'node'
  | 'callback'
  | 'custom';

export interface ComponentProp {
  readonly name: string;
  readonly kind: PropKind;
  readonly required: boolean;
  /** Tipo literal cuando `kind === 'custom'` o firma cuando es `callback`. */
  readonly type?: string;
  readonly description?: string;
  readonly defaultValue?: string;
}

export type ComponentCategory = 'ui' | 'layout' | 'domain' | 'feature';

export interface ComponentSpec {
  /** Nombre en PascalCase; también es el nombre del fichero. */
  readonly name: string;
  readonly category: ComponentCategory;
  readonly description: string;
  readonly props: readonly ComponentProp[];
  /** Líneas de import adicionales que necesita el cuerpo. */
  readonly imports?: readonly string[];
  /** Código previo al `return`, ya indentado a dos espacios. */
  readonly setup?: readonly string[];
  /** Cuerpo JSX del `return`, ya indentado a cuatro espacios. */
  readonly body: readonly string[];
  readonly dependencies?: readonly Omit<DependencySpec, 'requestedBy' | 'workspace'>[];
  /** Subcarpeta dentro de `src/components`. Por defecto, la categoría. */
  readonly directory?: string;
}

/**
 * Renderiza especificaciones a código de un framework concreto. Cada
 * adaptador de frontend puede traer el suyo.
 */
export interface ComponentRenderer {
  readonly id: string;
  readonly framework: string;
  /** Extension del fichero generado, con punto. */
  readonly extension: string;
  render(spec: ComponentSpec): string;
  /** Ruta relativa dentro del proyecto generado. */
  pathFor(spec: ComponentSpec): string;
}

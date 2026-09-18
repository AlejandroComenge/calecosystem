import type { ComponentProp, ComponentRenderer, ComponentSpec } from '@calecosystem/contracts';

/** Tipo TypeScript de una prop según su clase. */
export function propType(prop: ComponentProp): string {
  switch (prop.kind) {
    case 'string':
      return 'string';
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'node':
      return 'ReactNode';
    case 'callback':
      return prop.type ?? '() => void';
    case 'custom':
      return prop.type ?? 'unknown';
    default:
      return 'unknown';
  }
}

/** Declaración de la interfaz de props, con JSDoc por campo cuando lo hay. */
function propsInterface(spec: ComponentSpec): string[] {
  if (spec.props.length === 0) return [];
  const lines = [`export interface ${spec.name}Props {`];
  for (const prop of spec.props) {
    if (prop.description) lines.push(`  /** ${prop.description} */`);
    lines.push(`  ${prop.name}${prop.required ? '' : '?'}: ${propType(prop)};`);
  }
  lines.push('}', '');
  return lines;
}

/** Desestructuración con valores por defecto para las props opcionales. */
function destructuring(spec: ComponentSpec): string {
  if (spec.props.length === 0) return '';
  const parts = spec.props.map((prop) =>
    prop.defaultValue !== undefined ? `${prop.name} = ${prop.defaultValue}` : prop.name,
  );
  const inline = `{ ${parts.join(', ')} }: ${spec.name}Props`;
  // Firmas largas en una sola línea son ilegibles; a partir de cierto ancho
  // se rompe en varias, como haría cualquier formateador.
  if (inline.length <= 88) return inline;
  return `{\n  ${parts.join(',\n  ')},\n}: ${spec.name}Props`;
}

/**
 * Renderizador de componentes a React + TypeScript.
 *
 * Toma una `ComponentSpec` (datos) y produce un componente funcional tipado.
 * El catálogo de componentes se describe una sola vez; añadir soporte para
 * otro framework es escribir otro renderizador, no otro catálogo.
 */
export const reactComponentRenderer: ComponentRenderer = {
  id: 'calec.components.react',
  framework: 'react',
  extension: '.tsx',

  pathFor(spec: ComponentSpec): string {
    const directory = spec.directory ?? spec.category;
    return `apps/web/src/components/${directory}/${spec.name}.tsx`;
  },

  render(spec: ComponentSpec): string {
    const usesNode = spec.props.some((prop) => prop.kind === 'node');
    const imports = [
      ...(usesNode ? ["import type { ReactNode } from 'react';"] : []),
      ...(spec.imports ?? []),
    ];

    const lines: string[] = [
      '/**',
      ` * ${spec.name}`,
      ' *',
      ` * ${spec.description}`,
      ' */',
    ];
    if (imports.length > 0) lines.push(...imports, '');
    lines.push(...propsInterface(spec));
    lines.push(`export function ${spec.name}(${destructuring(spec)}) {`);
    if (spec.setup && spec.setup.length > 0) lines.push(...spec.setup, '');
    lines.push('  return (', ...spec.body, '  );', '}');

    return `${lines.join('\n')}\n`;
  },
};

/** Fichero barril del catálogo: un solo punto de importación. */
export function componentBarrel(specs: readonly ComponentSpec[]): string {
  const lines = [
    '/** Catálogo de componentes generado. Reexporta todo el kit de UI. */',
    ...[...specs]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((spec) => {
        const directory = spec.directory ?? spec.category;
        return `export { ${spec.name} } from './${directory}/${spec.name}.tsx';`;
      }),
  ];
  return `${lines.join('\n')}\n`;
}

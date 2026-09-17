import type { Blueprint, DomainEntity, EntityField, VirtualFile } from '@calecosystem/contracts';

/** Fabrica de ficheros virtuales con productor fijo. */
export function fileFactory(producedBy: string) {
  return (path: string, contents: string, extra: Partial<VirtualFile> = {}): VirtualFile => ({
    path,
    contents: contents.endsWith('\n') ? contents : `${contents}\n`,
    producedBy,
    ...extra,
  });
}

/** Serializa package.json de forma estable (claves ordenadas dentro de cada bloque). */
export function jsonFile(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** Tipo TypeScript equivalente a un campo del dominio. */
export function tsTypeOf(field: EntityField): string {
  switch (field.type) {
    case 'number':
    case 'decimal':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'date':
    case 'datetime':
      return 'string';
    default:
      return 'string';
  }
}

/** Declaracion de interfaz TypeScript para una entidad. */
export function entityInterface(entity: DomainEntity): string {
  const fields = entity.fields
    .map((field) => {
      const optional = field.required ? '' : '?';
      const comment = field.description ? ` // ${field.description}` : '';
      return `  ${field.name}${optional}: ${tsTypeOf(field)};${comment}`;
    })
    .join('\n');
  return `export interface ${entity.name} {\n${fields}\n}`;
}

/** Columna representativa para las tablas del listado. */
export function displayField(entity: DomainEntity): string {
  const preferred = ['name', 'title', 'fullName', 'reference', 'number', 'email'];
  for (const candidate of preferred) {
    if (entity.fields.some((field) => field.name === candidate)) return candidate;
  }
  return 'id';
}

/** Hasta cuatro columnas escalares para la vista de lista. */
export function listColumns(entity: DomainEntity): EntityField[] {
  return entity.fields
    .filter((field) => field.name !== 'id' && field.type !== 'text' && field.type !== 'reference')
    .slice(0, 4);
}

export function banner(blueprint: Blueprint, tool: string): string {
  return [
    '/**',
    ` * Generado por ${tool} para "${blueprint.projectName}".`,
    ' *',
    ' * Este fichero es un punto de partida, no una caja negra: esta pensado',
    ' * para editarse. Vuelve a generar solo si no lo has modificado.',
    ' */',
  ].join('\n');
}

export function hashBanner(blueprint: Blueprint, tool: string): string {
  return [
    `# Generado por ${tool} para "${blueprint.projectName}".`,
    '# Punto de partida editable: revisalo antes de llevarlo a produccion.',
  ].join('\n');
}

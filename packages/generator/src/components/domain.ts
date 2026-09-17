import type { ComponentSpec, DomainEntity, EntityField } from '@calecosystem/contracts';
import { camelCase } from '../analysis/text.ts';
import { listColumns } from '../scaffold/shared.ts';

/** Campos editables: sin identificadores ni marcas de tiempo automaticas. */
export function editableFields(entity: DomainEntity): EntityField[] {
  return entity.fields.filter(
    (field) => field.name !== 'id' && field.name !== 'createdAt' && field.name !== 'updatedAt',
  );
}

function inputTypeFor(field: EntityField): string {
  switch (field.type) {
    case 'number':
    case 'decimal':
      return 'number';
    case 'date':
      return 'date';
    case 'datetime':
      return 'datetime-local';
    case 'email':
      return 'email';
    case 'url':
      return 'url';
    default:
      return 'text';
  }
}

/**
 * Componentes derivados del modelo de dominio.
 *
 * Es donde el catalogo deja de ser generico: una tabla y un formulario por
 * entidad, tipados contra el modelo real. Son los dos componentes que todo
 * el mundo escribe a mano una vez por entidad, y los que mas tiempo ahorran.
 */
export function domainComponents(entity: DomainEntity): ComponentSpec[] {
  return [entityTable(entity), entityForm(entity)];
}

function entityTable(entity: DomainEntity): ComponentSpec {
  const columns = listColumns(entity);
  const columnEntries = columns
    .map((column) => `    { key: '${column.name}', header: '${column.name}' },`)
    .join('\n');

  return {
    name: `${entity.name}Table`,
    category: 'domain',
    directory: 'domain',
    description: `Tabla de ${entity.name} con las columnas relevantes del modelo.`,
    props: [
      {
        name: 'items',
        kind: 'custom',
        required: true,
        type: `readonly ${entity.name}[]`,
      },
      { name: 'loading', kind: 'boolean', required: false, defaultValue: 'false' },
    ],
    imports: [
      "import { DataTable } from '../ui/DataTable.tsx';",
      `import type { ${entity.name} } from '../../types.ts';`,
    ],
    setup: [
      '  const columns = [',
      columnEntries,
      '  ];',
    ],
    body: [
      '    <DataTable',
      '      columns={columns}',
      '      rows={items as readonly Record<string, unknown>[]}',
      '      loading={loading}',
      `      emptyMessage="Todavia no hay ${entity.plural}."`,
      '    />',
    ],
  };
}

function entityForm(entity: DomainEntity): ComponentSpec {
  const fields = editableFields(entity);
  const variable = camelCase(entity.name);

  const inputs = fields.flatMap((field) => [
    '        <Input',
    `          id="${variable}-${field.name}"`,
    `          label="${field.name}"`,
    `          type="${inputTypeFor(field)}"`,
    `          required={${field.required}}`,
    `          value={String(values.${field.name} ?? '')}`,
    `          onChange={(value) => update('${field.name}', value)}`,
    `          error={errors['${field.name}']}`,
    '        />',
  ]);

  return {
    name: `${entity.name}Form`,
    category: 'domain',
    directory: 'domain',
    description: `Formulario de alta y edicion de ${entity.name}, con validacion de campos obligatorios.`,
    props: [
      {
        name: 'initialValues',
        kind: 'custom',
        required: false,
        type: `Partial<New${entity.name}>`,
        defaultValue: '{}',
      },
      {
        name: 'onSubmit',
        kind: 'callback',
        required: true,
        type: `(values: New${entity.name}) => void | Promise<void>`,
      },
      { name: 'submitLabel', kind: 'string', required: false, defaultValue: "'Guardar'" },
    ],
    imports: [
      "import { useState } from 'react';",
      "import { Button } from '../ui/Button.tsx';",
      "import { Input } from '../ui/Input.tsx';",
      `import type { New${entity.name} } from '../../types.ts';`,
    ],
    setup: [
      `  const [values, setValues] = useState<Partial<New${entity.name}>>(initialValues);`,
      '  const [errors, setErrors] = useState<Record<string, string>>({});',
      '  const [submitting, setSubmitting] = useState(false);',
      '',
      '  const update = (field: string, value: string) => {',
      '    setValues((current) => ({ ...current, [field]: value }));',
      '  };',
      '',
      '  // La validacion vive tambien en el backend; esta solo evita el viaje.',
      `  const requiredFields: readonly string[] = [${fields
        .filter((field) => field.required)
        .map((field) => `'${field.name}'`)
        .join(', ')}];`,
      '',
      '  const handleSubmit = async (event: React.FormEvent) => {',
      '    event.preventDefault();',
      '    const nextErrors: Record<string, string> = {};',
      '    for (const field of requiredFields) {',
      '      const value = (values as Record<string, unknown>)[field];',
      "      if (value === undefined || value === null || value === '') {",
      "        nextErrors[field] = 'Este campo es obligatorio';",
      '      }',
      '    }',
      '    setErrors(nextErrors);',
      '    if (Object.keys(nextErrors).length > 0) return;',
      '',
      '    setSubmitting(true);',
      '    try {',
      `      await onSubmit(values as New${entity.name});`,
      '    } finally {',
      '      setSubmitting(false);',
      '    }',
      '  };',
    ],
    body: [
      '    <form onSubmit={handleSubmit} className="flex flex-col gap-4">',
      '      <div className="grid gap-4 sm:grid-cols-2">',
      ...inputs,
      '      </div>',
      '      <div>',
      '        <Button type="submit" loading={submitting}>',
      '          {submitLabel}',
      '        </Button>',
      '      </div>',
      '    </form>',
    ],
  };
}

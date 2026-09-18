import type { ComponentSpec } from '@calecosystem/contracts';

/**
 * Catálogo base de componentes de interfaz.
 *
 * Criterio de inclusion: solo entra lo que **toda** aplicación de gestión
 * necesita el primer día. Un kit de cuarenta componentes se borra entero;
 * uno de diez se usa. Los que faltan se añaden desde un plugin.
 *
 * Todos son accesibles por defecto (roles ARIA, estados `disabled`,
 * `aria-live` en los avisos). Corregir accesibilidad después cuesta mucho
 * más que generarla bien.
 */
export function uiKit(): ComponentSpec[] {
  return [button(), card(), input(), select(), badge(), spinner(), emptyState(), alert(), dataTable(), pagination()];
}

function button(): ComponentSpec {
  return {
    name: 'Button',
    category: 'ui',
    description: 'Boton con variantes visuales y estado de carga.',
    props: [
      { name: 'children', kind: 'node', required: true, description: 'Contenido del boton.' },
      {
        name: 'variant',
        kind: 'custom',
        required: false,
        type: "'primary' | 'secondary' | 'danger' | 'ghost'",
        defaultValue: "'primary'",
      },
      { name: 'type', kind: 'custom', required: false, type: "'button' | 'submit'", defaultValue: "'button'" },
      { name: 'disabled', kind: 'boolean', required: false, defaultValue: 'false' },
      {
        name: 'loading',
        kind: 'boolean',
        required: false,
        defaultValue: 'false',
        description: 'Bloquea el boton y anuncia el estado a lectores de pantalla.',
      },
      { name: 'onClick', kind: 'callback', required: false, type: '() => void' },
    ],
    setup: [
      "  const base = 'inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed';",
      '  const variants: Record<string, string> = {',
      "    primary: 'bg-slate-900 text-white hover:bg-slate-700',",
      "    secondary: 'bg-slate-100 text-slate-900 hover:bg-slate-200',",
      "    danger: 'bg-red-600 text-white hover:bg-red-700',",
      "    ghost: 'bg-transparent text-slate-700 hover:bg-slate-100',",
      '  };',
    ],
    body: [
      '    <button',
      '      type={type}',
      '      className={base + \' \' + (variants[variant] ?? variants[\'primary\'])}',
      '      disabled={disabled || loading}',
      '      aria-busy={loading}',
      '      onClick={onClick}',
      '    >',
      "      {loading ? 'Cargando...' : children}",
      '    </button>',
    ],
  };
}

function card(): ComponentSpec {
  return {
    name: 'Card',
    category: 'ui',
    description: 'Contenedor con título opcional y zona de acciones.',
    props: [
      { name: 'children', kind: 'node', required: true },
      { name: 'title', kind: 'string', required: false },
      { name: 'actions', kind: 'node', required: false, description: 'Botones alineados a la derecha del título.' },
    ],
    body: [
      '    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">',
      '      {(title || actions) && (',
      '        <header className="mb-3 flex items-center justify-between">',
      '          {title && <h2 className="text-base font-semibold text-slate-900">{title}</h2>}',
      '          {actions}',
      '        </header>',
      '      )}',
      '      {children}',
      '    </section>',
    ],
  };
}

function input(): ComponentSpec {
  return {
    name: 'Input',
    category: 'ui',
    description: 'Campo de texto con etiqueta asociada y mensaje de error accesible.',
    props: [
      { name: 'id', kind: 'string', required: true, description: 'Necesario para asociar la etiqueta.' },
      { name: 'label', kind: 'string', required: true },
      { name: 'value', kind: 'string', required: true },
      { name: 'onChange', kind: 'callback', required: true, type: '(value: string) => void' },
      { name: 'type', kind: 'string', required: false, defaultValue: "'text'" },
      { name: 'error', kind: 'string', required: false },
      { name: 'required', kind: 'boolean', required: false, defaultValue: 'false' },
      { name: 'placeholder', kind: 'string', required: false },
    ],
    body: [
      '    <div className="flex flex-col gap-1">',
      '      <label htmlFor={id} className="text-sm font-medium text-slate-700">',
      '        {label}',
      '        {required && <span aria-hidden="true"> *</span>}',
      '      </label>',
      '      <input',
      '        id={id}',
      '        type={type}',
      '        value={value}',
      '        required={required}',
      '        placeholder={placeholder}',
      '        aria-invalid={Boolean(error)}',
      "        aria-describedby={error ? id + '-error' : undefined}",
      '        onChange={(event) => onChange(event.target.value)}',
      '        className="rounded-md border border-slate-300 px-3 py-2 text-sm"',
      '      />',
      '      {error && (',
      "        <p id={id + '-error'} role=\"alert\" className=\"text-sm text-red-600\">",
      '          {error}',
      '        </p>',
      '      )}',
      '    </div>',
    ],
  };
}

function select(): ComponentSpec {
  return {
    name: 'Select',
    category: 'ui',
    description: 'Desplegable de opciones con etiqueta asociada.',
    props: [
      { name: 'id', kind: 'string', required: true },
      { name: 'label', kind: 'string', required: true },
      { name: 'value', kind: 'string', required: true },
      {
        name: 'options',
        kind: 'custom',
        required: true,
        type: 'readonly { value: string; label: string }[]',
      },
      { name: 'onChange', kind: 'callback', required: true, type: '(value: string) => void' },
    ],
    body: [
      '    <div className="flex flex-col gap-1">',
      '      <label htmlFor={id} className="text-sm font-medium text-slate-700">',
      '        {label}',
      '      </label>',
      '      <select',
      '        id={id}',
      '        value={value}',
      '        onChange={(event) => onChange(event.target.value)}',
      '        className="rounded-md border border-slate-300 px-3 py-2 text-sm"',
      '      >',
      '        {options.map((option) => (',
      '          <option key={option.value} value={option.value}>',
      '            {option.label}',
      '          </option>',
      '        ))}',
      '      </select>',
      '    </div>',
    ],
  };
}

function badge(): ComponentSpec {
  return {
    name: 'Badge',
    category: 'ui',
    description: 'Etiqueta breve de estado.',
    props: [
      { name: 'children', kind: 'node', required: true },
      {
        name: 'tone',
        kind: 'custom',
        required: false,
        type: "'neutral' | 'success' | 'warning' | 'danger'",
        defaultValue: "'neutral'",
      },
    ],
    setup: [
      '  const tones: Record<string, string> = {',
      "    neutral: 'bg-slate-100 text-slate-700',",
      "    success: 'bg-green-100 text-green-800',",
      "    warning: 'bg-amber-100 text-amber-800',",
      "    danger: 'bg-red-100 text-red-800',",
      '  };',
    ],
    body: [
      "    <span className={'inline-flex rounded-full px-2 py-0.5 text-xs font-medium ' + (tones[tone] ?? tones['neutral'])}>",
      '      {children}',
      '    </span>',
    ],
  };
}

function spinner(): ComponentSpec {
  return {
    name: 'Spinner',
    category: 'ui',
    description: 'Indicador de carga anunciado a lectores de pantalla.',
    props: [{ name: 'label', kind: 'string', required: false, defaultValue: "'Cargando'" }],
    body: [
      '    <div role="status" aria-live="polite" className="flex items-center gap-2 text-sm text-slate-600">',
      '      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900" />',
      '      {label}',
      '    </div>',
    ],
  };
}

function emptyState(): ComponentSpec {
  return {
    name: 'EmptyState',
    category: 'ui',
    description: 'Mensaje para listados vacíos, con acción sugerida opcional.',
    props: [
      { name: 'title', kind: 'string', required: true },
      { name: 'description', kind: 'string', required: false },
      { name: 'action', kind: 'node', required: false },
    ],
    body: [
      '    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-slate-300 p-8 text-center">',
      '      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>',
      '      {description && <p className="text-sm text-slate-600">{description}</p>}',
      '      {action}',
      '    </div>',
    ],
  };
}

function alert(): ComponentSpec {
  return {
    name: 'Alert',
    category: 'ui',
    description: 'Aviso con severidad, anunciado como region viva.',
    props: [
      { name: 'children', kind: 'node', required: true },
      {
        name: 'tone',
        kind: 'custom',
        required: false,
        type: "'info' | 'success' | 'warning' | 'error'",
        defaultValue: "'info'",
      },
    ],
    setup: [
      '  const tones: Record<string, string> = {',
      "    info: 'border-slate-300 bg-slate-50 text-slate-800',",
      "    success: 'border-green-300 bg-green-50 text-green-800',",
      "    warning: 'border-amber-300 bg-amber-50 text-amber-900',",
      "    error: 'border-red-300 bg-red-50 text-red-800',",
      '  };',
    ],
    body: [
      '    <div',
      "      role={tone === 'error' ? 'alert' : 'status'}",
      '      aria-live="polite"',
      "      className={'rounded-md border px-3 py-2 text-sm ' + (tones[tone] ?? tones['info'])}",
      '    >',
      '      {children}',
      '    </div>',
    ],
  };
}

function dataTable(): ComponentSpec {
  return {
    name: 'DataTable',
    category: 'ui',
    description: 'Tabla genérica tipada, con estados de carga y vacío incluidos.',
    props: [
      {
        name: 'columns',
        kind: 'custom',
        required: true,
        type: 'readonly { key: string; header: string }[]',
      },
      {
        name: 'rows',
        kind: 'custom',
        required: true,
        type: 'readonly Record<string, unknown>[]',
      },
      { name: 'rowKey', kind: 'string', required: false, defaultValue: "'id'" },
      { name: 'loading', kind: 'boolean', required: false, defaultValue: 'false' },
      { name: 'emptyMessage', kind: 'string', required: false, defaultValue: "'Sin resultados'" },
    ],
    imports: ["import { Spinner } from './Spinner.tsx';"],
    body: [
      '    <div className="overflow-x-auto">',
      '      {loading ? (',
      '        <Spinner />',
      '      ) : rows.length === 0 ? (',
      '        <p className="p-4 text-sm text-slate-600">{emptyMessage}</p>',
      '      ) : (',
      '        <table className="w-full border-collapse text-sm">',
      '          <thead>',
      '            <tr className="border-b border-slate-200 text-left">',
      '              {columns.map((column) => (',
      '                <th key={column.key} scope="col" className="px-3 py-2 font-medium text-slate-600">',
      '                  {column.header}',
      '                </th>',
      '              ))}',
      '            </tr>',
      '          </thead>',
      '          <tbody>',
      '            {rows.map((row) => (',
      '              <tr key={String(row[rowKey])} className="border-b border-slate-100">',
      '                {columns.map((column) => (',
      '                  <td key={column.key} className="px-3 py-2 text-slate-800">',
      "                    {String(row[column.key] ?? '')}",
      '                  </td>',
      '                ))}',
      '              </tr>',
      '            ))}',
      '          </tbody>',
      '        </table>',
      '      )}',
      '    </div>',
    ],
  };
}

function pagination(): ComponentSpec {
  return {
    name: 'Pagination',
    category: 'ui',
    description: 'Paginación por página con límites respetados.',
    props: [
      { name: 'page', kind: 'number', required: true },
      { name: 'pageCount', kind: 'number', required: true },
      { name: 'onPageChange', kind: 'callback', required: true, type: '(page: number) => void' },
    ],
    imports: ["import { Button } from './Button.tsx';"],
    body: [
      '    <nav aria-label="Paginación" className="flex items-center justify-between gap-4 py-3">',
      '      <Button variant="secondary" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>',
      '        Anterior',
      '      </Button>',
      '      <span className="text-sm text-slate-600">',
      '        Página {page} de {Math.max(1, pageCount)}',
      '      </span>',
      '      <Button variant="secondary" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>',
      '        Siguiente',
      '      </Button>',
      '    </nav>',
    ],
  };
}

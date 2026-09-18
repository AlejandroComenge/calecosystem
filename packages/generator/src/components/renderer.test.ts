import test from 'node:test';
import assert from 'node:assert/strict';
import type { ComponentSpec } from '@calecosystem/contracts';
import { componentBarrel, propType, reactComponentRenderer } from './renderer.ts';
import { uiKit } from './ui-kit.ts';
import { domainComponents, editableFields } from './domain.ts';

const spec: ComponentSpec = {
  name: 'Saludo',
  category: 'ui',
  description: 'Saluda a quien se le indique.',
  props: [
    { name: 'nombre', kind: 'string', required: true, description: 'A quien saludar.' },
    { name: 'veces', kind: 'number', required: false, defaultValue: '1' },
    { name: 'onClose', kind: 'callback', required: false, type: '() => void' },
  ],
  body: ['    <p>Hola {nombre}</p>'],
};

test('genera una interfaz de props tipada', () => {
  const code = reactComponentRenderer.render(spec);

  assert.match(code, /export interface SaludoProps \{/);
  assert.match(code, /nombre: string;/);
  assert.match(code, /veces\?: number;/);
  assert.match(code, /onClose\?: \(\) => void;/);
});

test('las props opcionales con defecto se desestructuran con su valor', () => {
  const code = reactComponentRenderer.render(spec);

  assert.match(code, /export function Saludo\(\{ nombre, veces = 1, onClose \}: SaludoProps\)/);
});

test('la descripción de la prop se conserva como JSDoc', () => {
  assert.match(reactComponentRenderer.render(spec), /\/\*\* A quien saludar\. \*\//);
});

test('importa ReactNode solo cuando alguna prop lo necesita', () => {
  const sinNode = reactComponentRenderer.render(spec);
  const conNode = reactComponentRenderer.render({
    ...spec,
    props: [{ name: 'children', kind: 'node', required: true }],
  });

  assert.equal(sinNode.includes("import type { ReactNode } from 'react';"), false);
  assert.match(conNode, /import type \{ ReactNode \} from 'react';/);
});

test('un componente sin props no genera interfaz vacía', () => {
  const code = reactComponentRenderer.render({ ...spec, props: [] });

  assert.equal(code.includes('Props {'), false);
  assert.match(code, /export function Saludo\(\)/);
});

test('las firmas largas se reparten en varias líneas', () => {
  const code = reactComponentRenderer.render({
    ...spec,
    props: Array.from({ length: 10 }, (_unused, index) => ({
      name: `propiedadConNombreLargo${index}`,
      kind: 'string' as const,
      required: true,
    })),
  });

  assert.match(code, /export function Saludo\(\{\n/);
});

test('la ruta del componente sigue su categoría', () => {
  assert.equal(reactComponentRenderer.pathFor(spec), 'apps/web/src/components/ui/Saludo.tsx');
  assert.equal(
    reactComponentRenderer.pathFor({ ...spec, directory: 'domain' }),
    'apps/web/src/components/domain/Saludo.tsx',
  );
});

test('propType traduce cada clase de prop', () => {
  assert.equal(propType({ name: 'a', kind: 'string', required: true }), 'string');
  assert.equal(propType({ name: 'a', kind: 'node', required: true }), 'ReactNode');
  assert.equal(propType({ name: 'a', kind: 'custom', required: true, type: "'a' | 'b'" }), "'a' | 'b'");
  assert.equal(propType({ name: 'a', kind: 'callback', required: true }), '() => void');
});

test('el barril reexporta todo el catálogo ordenado', () => {
  const barrel = componentBarrel(uiKit());

  assert.match(barrel, /export \{ Alert \} from '\.\/ui\/Alert\.tsx';/);
  assert.match(barrel, /export \{ Button \} from '\.\/ui\/Button\.tsx';/);
  assert.ok(barrel.indexOf('Alert') < barrel.indexOf('Button'), 'orden alfabetico estable');
});

test('el catálogo base cubre lo que necesita una aplicación de gestión', () => {
  const names = uiKit().map((component) => component.name);

  for (const expected of ['Button', 'Input', 'DataTable', 'Alert', 'Pagination']) {
    assert.ok(names.includes(expected), `falta ${expected}`);
  }
});

test('todo el catálogo base se renderiza sin fallar', () => {
  for (const component of uiKit()) {
    const code = reactComponentRenderer.render(component);
    assert.ok(code.includes(`export function ${component.name}`), `${component.name} no se renderizo`);
    assert.ok(code.endsWith('\n'));
  }
});

test('cada entidad produce su tabla y su formulario', () => {
  const entity = {
    name: 'Product',
    plural: 'products',
    sourceTerm: 'producto',
    operations: ['list'] as const,
    fields: [
      { name: 'id', type: 'uuid' as const, required: true },
      { name: 'name', type: 'string' as const, required: true },
      { name: 'price', type: 'decimal' as const, required: true },
      { name: 'createdAt', type: 'datetime' as const, required: true },
      { name: 'updatedAt', type: 'datetime' as const, required: true },
    ],
  };

  const components = domainComponents(entity);
  const names = components.map((component) => component.name);

  assert.deepEqual(names, ['ProductTable', 'ProductForm']);

  const form = reactComponentRenderer.render(components[1] as ComponentSpec);
  assert.match(form, /import type \{ NewProduct \} from '\.\.\/\.\.\/types\.ts';/);
  assert.match(form, /requiredFields: readonly string\[\] = \['name', 'price'\]/);
  // Los campos automáticos no se piden al usuario.
  assert.equal(form.includes('id="product-id"'), false);
  assert.equal(form.includes('id="product-createdAt"'), false);
});

test('editableFields excluye identificadores y marcas de tiempo', () => {
  const fields = editableFields({
    name: 'X',
    plural: 'xs',
    sourceTerm: 'x',
    operations: ['list'],
    fields: [
      { name: 'id', type: 'uuid', required: true },
      { name: 'title', type: 'string', required: true },
      { name: 'createdAt', type: 'datetime', required: true },
      { name: 'updatedAt', type: 'datetime', required: true },
    ],
  });

  assert.deepEqual(fields.map((field) => field.name), ['title']);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { FileTree } from './file-tree.ts';
import { GenerationError } from './errors.ts';

const file = (path: string, producedBy = 'test', overwrite = false) => ({
  path,
  contents: `contenido de ${path}`,
  producedBy,
  ...(overwrite ? { overwrite: true } : {}),
});

test('normaliza separadores y segmentos redundantes', () => {
  assert.equal(FileTree.normalizePath('apps\\web\\src\\main.ts'), 'apps/web/src/main.ts');
  assert.equal(FileTree.normalizePath('./apps//web/./index.html'), 'apps/web/index.html');
});

test('rechaza rutas que salen del directorio del proyecto', () => {
  assert.throws(() => FileTree.normalizePath('../../etc/passwd'), GenerationError);
  assert.throws(() => FileTree.normalizePath('apps/../../fuera.txt'), /sale del directorio/);
});

test('rechaza rutas absolutas', () => {
  assert.throws(() => FileTree.normalizePath('/etc/passwd'), /relativa/);
  assert.throws(() => FileTree.normalizePath('C:/Windows/system32'), /relativa/);
});

test('un choque de rutas falla e identifica a ambos productores', () => {
  const tree = new FileTree();
  tree.add(file('src/index.ts', 'adaptador-a'));

  assert.throws(
    () => tree.add(file('src/index.ts', 'adaptador-b')),
    (error: unknown) => {
      assert.ok(error instanceof GenerationError);
      assert.equal(error.code, 'FILE_CONFLICT');
      assert.match(error.message, /adaptador-a/);
      assert.match(error.message, /adaptador-b/);
      return true;
    },
  );
});

test('overwrite explicito si permite sustituir un fichero', () => {
  const tree = new FileTree();
  tree.add(file('README.md', 'generador'));
  tree.add(file('README.md', 'documentador', true));

  assert.equal(tree.get('README.md')?.producedBy, 'documentador');
  assert.equal(tree.size, 1);
});

test('la salida esta ordenada por ruta para que la generacion sea reproducible', () => {
  const tree = new FileTree();
  tree.addAll([file('z.txt'), file('a.txt'), file('m/b.txt')]);

  assert.deepEqual(tree.paths(), ['a.txt', 'm/b.txt', 'z.txt']);
});

test('totalBytes mide el contenido real en utf8', () => {
  const tree = new FileTree();
  tree.add({ path: 'a.txt', contents: 'abc', producedBy: 'test' });
  tree.add({ path: 'b.txt', contents: 'ñ', producedBy: 'test' });

  assert.equal(tree.totalBytes(), 5);
});

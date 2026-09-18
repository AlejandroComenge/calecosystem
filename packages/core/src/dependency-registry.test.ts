import test from 'node:test';
import assert from 'node:assert/strict';
import type { DependencySpec } from '@calecosystem/contracts';
import { DependencyRegistry } from './dependency-registry.ts';

const spec = (
  name: string,
  version: string,
  requestedBy: string,
  extra: Partial<DependencySpec> = {},
): DependencySpec => ({
  name,
  version,
  workspace: 'web',
  reason: `necesario para ${name}`,
  requestedBy,
  ...extra,
});

test('construye un manifiesto con las dependencias declaradas', () => {
  const registry = new DependencyRegistry();
  registry.require(spec('react', '^19.0.0', 'adaptador'));
  registry.require(spec('vite', '^6.0.0', 'adaptador', { dev: true }));
  registry.contribute({
    workspace: 'web',
    requestedBy: 'adaptador',
    scripts: { dev: 'vite' },
    fields: { type: 'module' },
  });

  const manifest = JSON.parse(registry.buildManifest('web', { name: 'tienda-web' }).json) as {
    name: string;
    type: string;
    scripts: Record<string, string>;
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  };

  assert.equal(manifest.name, 'tienda-web');
  assert.equal(manifest.type, 'module');
  assert.equal(manifest.scripts['dev'], 'vite');
  assert.equal(manifest.dependencies['react'], '^19.0.0');
  assert.equal(manifest.devDependencies['vite'], '^6.0.0');
  assert.equal(manifest.dependencies['vite'], undefined, 'una dev no puede colarse en runtime');
});

test('gana la primera version declarada y el choque queda registrado', () => {
  const registry = new DependencyRegistry();
  registry.require(spec('typescript', '^5.9.0', 'adaptador-backend'));
  registry.require(spec('typescript', '^5.6.0', 'plantilla'));

  const conflicts = registry.conflicts();

  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0]?.name, 'typescript');
  assert.equal(conflicts[0]?.resolved, '^5.9.0');
  assert.deepEqual(
    conflicts[0]?.requests.map((request) => request.requestedBy),
    ['adaptador-backend', 'plantilla'],
  );
});

test('la misma version pedida dos veces no es un conflicto', () => {
  const registry = new DependencyRegistry();
  registry.require(spec('react', '^19.0.0', 'adaptador'));
  registry.require(spec('react', '^19.0.0', 'plantilla'));

  assert.deepEqual(registry.conflicts(), []);
  assert.equal(registry.resolved('web').length, 1);
});

test('el mismo paquete en workspaces distintos son entradas independientes', () => {
  const registry = new DependencyRegistry();
  registry.require(spec('typescript', '^5.9.0', 'web', { workspace: 'web' }));
  registry.require(spec('typescript', '^5.6.0', 'api', { workspace: 'api' }));

  assert.deepEqual(registry.conflicts(), [], 'workspaces distintos no compiten');
  assert.equal(registry.resolved('web')[0]?.version, '^5.9.0');
  assert.equal(registry.resolved('api')[0]?.version, '^5.6.0');
});

test('la salida está ordenada: dos generaciones dan el mismo fichero', () => {
  const first = new DependencyRegistry();
  first.require(spec('zod', '^3.0.0', 'a'));
  first.require(spec('react', '^19.0.0', 'b'));

  const second = new DependencyRegistry();
  second.require(spec('react', '^19.0.0', 'b'));
  second.require(spec('zod', '^3.0.0', 'a'));

  assert.equal(
    first.buildManifest('web', { name: 'x' }).json,
    second.buildManifest('web', { name: 'x' }).json,
  );
});

test('explain documenta quien pidio cada dependencia y por qué', () => {
  const registry = new DependencyRegistry();
  registry.require(spec('argon2', '^0.41.0', 'backend', { reason: 'hash de contraseñas' }));

  const explained = registry.explain('web');

  assert.equal(explained.length, 1);
  assert.match(explained[0] ?? '', /argon2@\^0\.41\.0/);
  assert.match(explained[0] ?? '', /hash de contraseñas/);
  assert.match(explained[0] ?? '', /backend/);
});

test('un manifiesto sin dependencias omite las claves vacías', () => {
  const registry = new DependencyRegistry();
  const manifest = JSON.parse(registry.buildManifest('root', { name: 'proyecto' }).json) as Record<
    string,
    unknown
  >;

  assert.equal(manifest['dependencies'], undefined);
  assert.equal(manifest['devDependencies'], undefined);
  assert.equal(manifest['name'], 'proyecto');
});

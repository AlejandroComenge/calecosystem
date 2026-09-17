import test from 'node:test';
import assert from 'node:assert/strict';
import { runCli } from './cli.ts';

const BRIEF = 'Tienda con productos, pedidos y clientes, con login de usuarios.';

test('sin argumentos muestra la ayuda', async () => {
  const result = await runCli([]);

  assert.equal(result.exitCode, 0);
  assert.match(result.output, /COMANDOS/);
});

test('un comando desconocido falla y ofrece la ayuda', async () => {
  const result = await runCli(['inventado']);

  assert.equal(result.exitCode, 1);
  assert.match(result.output, /Comando desconocido/);
});

test('una opcion desconocida no revienta el proceso', async () => {
  const result = await runCli(['plan', BRIEF, '--opcion-que-no-existe']);

  assert.equal(result.exitCode, 1);
  assert.match(result.output, /opcion-que-no-existe/);
});

test('plan --json devuelve un blueprint valido', async () => {
  const result = await runCli(['plan', BRIEF, '--json']);
  const blueprint = JSON.parse(result.output) as {
    stack: { frontend: string };
    entities: unknown[];
    decisions: unknown[];
  };

  assert.equal(result.exitCode, 0);
  assert.equal(blueprint.stack.frontend, 'react');
  assert.ok(blueprint.entities.length > 0);
  assert.ok(blueprint.decisions.length > 0);
});

test('--framework fuerza el adaptador de frontend', async () => {
  const result = await runCli(['plan', BRIEF, '--framework', 'angular', '--json']);
  const blueprint = JSON.parse(result.output) as { stack: { frontend: string } };

  assert.equal(blueprint.stack.frontend, 'angular');
});

test('plan sin descripcion explica que falta', async () => {
  const result = await runCli(['plan']);

  assert.equal(result.exitCode, 1, 'un error de uso no es un fallo inesperado');
  assert.match(result.output, /MISSING_DESCRIPTION/);
});

test('una descripcion demasiado corta se rechaza con un codigo estable', async () => {
  const result = await runCli(['plan', 'corto']);

  assert.equal(result.exitCode, 1);
  assert.match(result.output, /EMPTY_REQUIREMENTS/);
});

test('generate --dry-run no escribe nada y describe lo que haria', async () => {
  const result = await runCli(['generate', BRIEF, '--dry-run', '--quiet']);

  assert.match(result.output, /Simulacion: se escribirian \d+ ficheros/);
});

test('modules --json lista plugins, modulos y adaptadores', async () => {
  const result = await runCli(['modules', '--json']);
  const diagnostics = JSON.parse(result.output) as {
    tier: string;
    frontendAdapters: string[];
    plugins: unknown[];
  };

  assert.equal(result.exitCode, 0);
  assert.deepEqual(diagnostics.frontendAdapters, ['angular', 'react', 'vue']);
  assert.ok(diagnostics.plugins.length > 0);
});

test('version devuelve la version publicada', async () => {
  const result = await runCli(['version']);

  assert.equal(result.exitCode, 0);
  assert.match(result.output, /^\d+\.\d+\.\d+$/);
});

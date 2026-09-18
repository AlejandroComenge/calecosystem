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

test('una opción desconocida no revienta el proceso', async () => {
  const result = await runCli(['plan', BRIEF, '--opcion-que-no-existe']);

  assert.equal(result.exitCode, 1);
  assert.match(result.output, /opcion-que-no-existe/);
});

test('plan --json devuelve un blueprint válido', async () => {
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

test('plan sin descripción explica que falta', async () => {
  const result = await runCli(['plan']);

  assert.equal(result.exitCode, 1, 'un error de uso no es un fallo inesperado');
  assert.match(result.output, /MISSING_DESCRIPTION/);
});

test('una descripción demasiado corta se rechaza con un código estable', async () => {
  const result = await runCli(['plan', 'corto']);

  assert.equal(result.exitCode, 1);
  assert.match(result.output, /EMPTY_REQUIREMENTS/);
});

test('generate --dry-run no escribe nada y describe lo que haría', async () => {
  const result = await runCli(['generate', BRIEF, '--dry-run', '--quiet']);

  assert.match(result.output, /Simulación: se escribirían \d+ ficheros/);
});

test('modules --json lista plugins, módulos y adaptadores', async () => {
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

test('examples lista el catálogo completo', async () => {
  const result = await runCli(['examples']);

  assert.equal(result.exitCode, 0);
  assert.match(result.output, /tienda/);
  assert.match(result.output, /saas/);
  assert.match(result.output, /landing/);
});

test('examples <id> da un comando listo para copiar', async () => {
  const result = await runCli(['examples', 'tienda']);

  assert.equal(result.exitCode, 0);
  assert.match(result.output, /npm run calec -- generate "/);
  assert.match(result.output, /--out \.\/pruebas\/tienda/);
});

test('un ejemplo inexistente sugiere los que hay', async () => {
  const result = await runCli(['examples', 'no-existe']);

  assert.equal(result.exitCode, 1);
  assert.match(result.output, /Disponibles:/);
  assert.match(result.output, /tienda/);
});

test('examples --json sirve para encadenar con otras herramientas', async () => {
  const result = await runCli(['examples', '--json']);
  const scenarios = JSON.parse(result.output) as { id: string }[];

  assert.ok(scenarios.length >= 6);
  assert.ok(scenarios.every((scenario) => typeof scenario.id === 'string'));
});

test('avisa de los módulos que no se han ejecutado por el plan', async () => {
  // Sin licencia, tres de los cuatro módulos quedan fuera. Callarlo haría
  // creer que el proyecto está revisado cuando nadie lo ha mirado.
  const result = await runCli(['generate', BRIEF, '--dry-run', '--quiet']);

  assert.match(result.output, /Módulos NO ejecutados \(3\)/);
  assert.match(result.output, /Auditor de seguridad/);
  assert.match(result.output, /Optimizador de rendimiento/);
  assert.match(result.output, /Testeador automático/);
  assert.match(result.output, /calec upgrade --tier pro/);
});

test('los módulos se nombran en lenguaje de usuario, no de paquete', async () => {
  const result = await runCli(['generate', BRIEF, '--dry-run', '--quiet']);

  assert.equal(
    result.output.includes('@calecosystem/security'),
    false,
    'un nombre de paquete npm no le dice nada a quien no programa',
  );
});

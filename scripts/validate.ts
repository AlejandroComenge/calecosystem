/**
 * Validador de salida: `npm run validate`
 *
 * Las 199 pruebas del repositorio comprueban que **el generador** funciona.
 * Esto comprueba algo distinto y más importante para un cliente: que el
 * **código generado** es válido.
 *
 * Por cada ejemplo del catálogo:
 *   1. genera el proyecto en memoria;
 *   2. comprueba que aparecen los ficheros que ese tipo de web promete;
 *   3. analiza cada .ts/.tsx con el parser de TypeScript (errores de sintaxis);
 *   4. valida que todo .json se puede leer;
 *   5. hace una comprobación estructural de los .yml;
 *   6. escribe el proyecto en un directorio temporal y **ejecuta las pruebas
 *      que el propio generador entrega**.
 *
 * El paso 6 es el que de verdad cierra el círculo: si las pruebas generadas
 * no pasan, lo que entregamos no vale, por muy bonita que sea la salida.
 */
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import type { GenerationResult } from '@calecosystem/contracts';
import { Entitlements, createKernel, createSilentLogger, writeFileTree } from '@calecosystem/core';
import { CodeGenerator, generatorPlugin } from '@calecosystem/generator';
import { optimizerPlugin } from '@calecosystem/optimizer';
import { securityPlugin } from '@calecosystem/security';
import { testerPlugin } from '@calecosystem/tester';
import { documenterPlugin } from '@calecosystem/documenter';
import { SCENARIOS, type Scenario } from '../examples/scenarios.ts';

interface Problem {
  readonly scenario: string;
  readonly check: string;
  readonly detail: string;
}

interface ScenarioReport {
  readonly scenario: Scenario;
  readonly result: GenerationResult;
  readonly tsFiles: number;
  readonly generatedTests: { total: number; passed: number };
  readonly problems: readonly Problem[];
  readonly durationMs: number;
}

const problems: Problem[] = [];
const reports: ScenarioReport[] = [];

const onlyId = process.argv[2];
const scenarios = onlyId ? SCENARIOS.filter((scenario) => scenario.id === onlyId) : SCENARIOS;

if (scenarios.length === 0) {
  process.stderr.write(`No existe el ejemplo "${onlyId}".\n`);
  process.exit(2);
}

process.stdout.write('\nValidando la salida del generador\n');
process.stdout.write('='.repeat(78) + '\n\n');

for (const scenario of scenarios) {
  reports.push(await validateScenario(scenario));
}

printSummary();
process.exit(problems.length > 0 ? 1 : 0);

/* --------------------------------------------------------------------- */

async function validateScenario(scenario: Scenario): Promise<ScenarioReport> {
  const started = performance.now();
  const local: Problem[] = [];
  const fail = (check: string, detail: string) => {
    const problem = { scenario: scenario.id, check, detail };
    local.push(problem);
    problems.push(problem);
  };

  process.stdout.write(`${scenario.id.padEnd(16)} ${scenario.title}\n`);

  const kernel = await createKernel({
    logger: createSilentLogger(),
    entitlements: new Entitlements({ tier: 'enterprise' }),
    plugins: [
      generatorPlugin(),
      optimizerPlugin(),
      securityPlugin(),
      testerPlugin(),
      documenterPlugin(),
    ],
  });

  let result: GenerationResult;
  try {
    result = await new CodeGenerator({ kernel }).generate({
      text: scenario.brief,
      ...(scenario.framework ? { hints: { frontend: scenario.framework } } : {}),
    });
  } finally {
    await kernel.dispose();
  }

  // 1. La plantilla esperada.
  const detected = result.template?.kind ?? null;
  if (detected !== scenario.expectTemplate) {
    fail('plantilla', `se esperaba ${scenario.expectTemplate ?? 'ninguna'} y se detectó ${detected ?? 'ninguna'}`);
  }

  // 2. Las capacidades que el analizador debía deducir del enunciado.
  for (const feature of scenario.expectFeatures) {
    const features = result.requirements.features as unknown as Record<string, boolean>;
    if (features[feature] !== true) fail('capacidad', `no se detectó "${feature}"`);
  }

  // 3. Los ficheros que este tipo de web promete.
  const paths = new Set(result.files.map((file) => file.path));
  for (const expected of scenario.expectFiles) {
    if (!paths.has(expected)) fail('fichero', `falta "${expected}"`);
  }

  // 4. Sintaxis de todo el TypeScript generado.
  let tsFiles = 0;
  for (const file of result.files) {
    if (!file.path.endsWith('.ts') && !file.path.endsWith('.tsx')) continue;
    tsFiles += 1;
    for (const error of syntaxErrors(file.path, file.contents)) {
      fail('sintaxis', `${file.path}: ${error}`);
    }
  }

  // 5. JSON legible.
  for (const file of result.files) {
    if (!file.path.endsWith('.json')) continue;
    try {
      JSON.parse(file.contents);
    } catch (error) {
      fail('json', `${file.path}: ${(error as Error).message}`);
    }
  }

  // 6. Comprobación estructural de YAML. No es un análisis completo: sin
  //    dependencias no hay parser de YAML, y se declara en lugar de fingirlo.
  for (const file of result.files) {
    if (!file.path.endsWith('.yml') && !file.path.endsWith('.yaml')) continue;
    for (const error of yamlSmokeErrors(file.contents)) {
      fail('yaml', `${file.path}: ${error}`);
    }
  }

  // 7. Conflictos de dependencias.
  for (const conflict of result.dependencyConflicts) {
    fail('dependencias', `versiones incompatibles de "${conflict.name}"`);
  }

  // 8. Las pruebas que el generador entrega tienen que pasar.
  const generatedTests = await runGeneratedTests(scenario, result, fail);

  const durationMs = performance.now() - started;
  const status = local.length === 0 ? 'OK ' : 'FALLA';
  process.stdout.write(
    `                 ${status}  ${result.metrics.fileCount} ficheros, ` +
      `${result.metrics.lineCount} líneas, ${tsFiles} TS analizados, ` +
      `${generatedTests.passed}/${generatedTests.total} pruebas generadas\n`,
  );
  for (const problem of local) {
    process.stdout.write(`                 !  [${problem.check}] ${problem.detail}\n`);
  }
  process.stdout.write('\n');

  return { scenario, result, tsFiles, generatedTests, problems: local, durationMs };
}

/** Errores de sintaxis según el parser de TypeScript. */
function syntaxErrors(filePath: string, contents: string): string[] {
  const source = ts.createSourceFile(
    filePath,
    contents,
    ts.ScriptTarget.ESNext,
    true,
    filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  // `parseDiagnostics` no está en los tipos públicos pero es estable y es la
  // única via de obtener errores de sintaxis sin montar un programa completo.
  const diagnostics = (source as unknown as { parseDiagnostics?: ts.Diagnostic[] }).parseDiagnostics ?? [];

  return diagnostics.slice(0, 3).map((diagnostic) => {
    const position = diagnostic.start ?? 0;
    const { line } = source.getLineAndCharacterOfPosition(position);
    return `línea ${line + 1}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`;
  });
}

/**
 * Comprobaciones de humo sobre YAML: no es un parser, detecta los errores que
 * de verdad produce un generador (tabuladores, claves duplicadas en la raíz,
 * fichero vacío).
 */
function yamlSmokeErrors(contents: string): string[] {
  const errors: string[] = [];
  if (contents.trim() === '') return ['fichero vacio'];

  const topLevelKeys = new Set<string>();
  const lines = contents.split('\n');

  for (const [index, line] of lines.entries()) {
    if (line.includes('\t')) {
      errors.push(`línea ${index + 1}: tabulador (YAML solo admite espacios)`);
    }
    const match = /^([A-Za-z_][\w-]*):/.exec(line);
    if (match?.[1]) {
      if (topLevelKeys.has(match[1])) {
        errors.push(`clave de primer nivel duplicada: "${match[1]}"`);
      }
      topLevelKeys.add(match[1]);
    }
  }
  return errors.slice(0, 3);
}

/**
 * Escribe el proyecto en un directorio temporal y ejecuta sus pruebas de
 * dominio, que son las únicas autonomas (sin `npm install`).
 */
async function runGeneratedTests(
  scenario: Scenario,
  result: GenerationResult,
  fail: (check: string, detail: string) => void,
): Promise<{ total: number; passed: number }> {
  const testFiles = result.files.filter((file) =>
    file.path.startsWith('apps/api/src/domain/') && file.path.endsWith('.test.ts'),
  );
  if (testFiles.length === 0) return { total: 0, passed: 0 };

  const directory = await mkdtemp(path.join(tmpdir(), `calec-${scenario.id}-`));
  try {
    await writeFileTree(result.files, directory, { force: true });

    // Se pasa la lista explicita de ficheros: `spawnSync` no usa shell, así
    // que un patron con comodin llegaria sin expandir.
    const run = spawnSync(
      process.execPath,
      ['--test', '--test-reporter=tap', ...testFiles.map((file) => file.path)],
      { cwd: directory, encoding: 'utf8', timeout: 120_000 },
    );

    const output = `${run.stdout ?? ''}${run.stderr ?? ''}`;
    const total = Number(/^# tests (\d+)$/m.exec(output)?.[1] ?? 0);
    const passed = Number(/^# pass (\d+)$/m.exec(output)?.[1] ?? 0);

    if (run.status !== 0 || total === 0 || passed !== total) {
      const firstFailure = /^not ok \d+ - (.+)$/m.exec(output)?.[1] ?? 'sin detalle';
      fail('pruebas generadas', `${passed}/${total} pasan. Primer fallo: ${firstFailure}`);
    }
    return { total, passed };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function printSummary(): void {
  const totals = reports.reduce(
    (accumulator, report) => ({
      files: accumulator.files + report.result.metrics.fileCount,
      lines: accumulator.lines + report.result.metrics.lineCount,
      tsFiles: accumulator.tsFiles + report.tsFiles,
      tests: accumulator.tests + report.generatedTests.passed,
      durationMs: accumulator.durationMs + report.result.metrics.durationMs,
    }),
    { files: 0, lines: 0, tsFiles: 0, tests: 0, durationMs: 0 },
  );

  process.stdout.write('='.repeat(78) + '\n');
  process.stdout.write(
    `${reports.length} ejemplos | ${totals.files} ficheros | ${totals.lines} líneas | ` +
      `${totals.tsFiles} TS sin errores de sintaxis | ${totals.tests} pruebas generadas en verde\n`,
  );
  process.stdout.write(`Tiempo de generación acumulado: ${totals.durationMs.toFixed(0)} ms\n\n`);

  if (problems.length === 0) {
    process.stdout.write('TODO CORRECTO: la salida del generador es válida en todos los ejemplos.\n\n');
    return;
  }

  process.stdout.write(`${problems.length} PROBLEMAS:\n\n`);
  for (const problem of problems) {
    process.stdout.write(`  ${problem.scenario.padEnd(16)} [${problem.check}] ${problem.detail}\n`);
  }
  process.stdout.write('\n');
}

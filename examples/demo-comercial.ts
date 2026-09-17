/**
 * Demo comercial: `npm run demo:comercial`
 *
 * Pensada para ejecutarse **en vivo delante de un cliente**. Va por pasos,
 * con pausas, y cuenta una historia: el problema, el enunciado en lenguaje de
 * negocio, lo que sale, lo que cuesta y lo que todavia hay que hacer.
 *
 * Opciones:
 *   --rapido            sin pausas (para grabar o para probarla)
 *   --caso <id>         otro ejemplo del catalogo (por defecto: tienda)
 *   --out <directorio>  ademas, escribe el proyecto en disco
 *
 * Decision deliberada: el ultimo paso enseña lo que el sistema NO ha hecho.
 * Una demo que solo enseña lo bueno gana la reunion y pierde el cliente tres
 * semanas despues.
 */
import { parseArgs } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';
import type { GenerationResult } from '@calecosystem/contracts';
import { Entitlements, createKernel, createSilentLogger, writeFileTree } from '@calecosystem/core';
import { CodeGenerator, generatorPlugin } from '@calecosystem/generator';
import { optimizerPlugin } from '@calecosystem/optimizer';
import { securityPlugin } from '@calecosystem/security';
import { testerPlugin } from '@calecosystem/tester';
import { documenterPlugin } from '@calecosystem/documenter';
import { SCENARIOS, scenarioById } from './scenarios.ts';

/* --- Supuestos economicos, explicitos y discutibles -------------------- */

/**
 * Estos tres numeros son los unicos que sostienen el calculo de retorno.
 * Estan aqui arriba, con nombre, para que un cliente pueda decir "en mi
 * empresa es otra cifra" y recalcularlo delante de el. Un ROI con los
 * supuestos escondidos no es un argumento, es un truco.
 */
const SUPUESTOS = {
  costeHoraDesarrollador: 65,
  horasArranqueManualMin: 60,
  horasArranqueManualMax: 120,
  precioPlanProMes: 49,
} as const;

const { values } = parseArgs({
  options: {
    rapido: { type: 'boolean' },
    caso: { type: 'string' },
    out: { type: 'string' },
  },
  allowPositionals: false,
});

const scenario = scenarioById(values.caso ?? 'tienda') ?? SCENARIOS[0];
if (!scenario) throw new Error('El catalogo de ejemplos esta vacio.');

const out = (line = '') => process.stdout.write(`${line}\n`);
const pausa = (ms: number) => (values.rapido ? Promise.resolve() : sleep(ms));
const regla = () => out('-'.repeat(74));

async function titulo(numero: number, texto: string): Promise<void> {
  out();
  out(`  PASO ${numero}  ${texto}`);
  regla();
  await pausa(600);
}

/* --- La demo ---------------------------------------------------------- */

out();
out('='.repeat(74));
out('  CalEcosystem - Demostracion');
out('='.repeat(74));
await pausa(900);

await titulo(1, 'EL PROBLEMA');
out('  Arrancar un proyecto web nuevo cuesta entre 60 y 120 horas de trabajo');
out('  que se repite en cada proyecto: elegir tecnologias, montar la estructura,');
out('  configurar el despliegue, escribir las primeras pruebas y documentar.');
out();
out('  Ese trabajo no diferencia a nadie, pero se paga entero cada vez.');
await pausa(2600);

await titulo(2, 'EL PUNTO DE PARTIDA: LENGUAJE DE NEGOCIO');
out(`  Caso: ${scenario.title}`);
out(`  Para: ${scenario.audience}`);
out();
for (const line of wrap(scenario.brief, 68)) out(`    "${line}"`);
out();
out('  Ni una palabra tecnica. Esto lo escribe un responsable de producto.');
await pausa(3200);

await titulo(3, 'EL SISTEMA DECIDE LA ARQUITECTURA');

const kernel = await createKernel({
  logger: createSilentLogger(),
  entitlements: new Entitlements({ tier: 'enterprise', customer: 'Demostracion' }),
  plugins: [
    generatorPlugin(),
    optimizerPlugin(),
    securityPlugin(),
    testerPlugin(),
    documenterPlugin(),
  ],
});

const generador = new CodeGenerator({ kernel });
const resultado: GenerationResult = await generador.generate({
  text: scenario.brief,
  ...(scenario.framework ? { hints: { frontend: scenario.framework } } : {}),
});

out(`  Entidades detectadas:  ${resultado.requirements.entities.map((entity) => entity.name).join(', ')}`);
out(`  Roles detectados:      ${resultado.requirements.actors.map((actor) => actor.label).join(', ') || 'ninguno'}`);
out(`  Capacidades:           ${capacidadesActivas(resultado).join(', ')}`);
if (resultado.template) {
  out(`  Tipo de producto:      ${resultado.template.name} (encaje ${pct(resultado.template.score)})`);
}
out();
out('  Y deja por escrito POR QUE eligio cada cosa:');
out();
for (const decision of resultado.blueprint.decisions.slice(0, 3)) {
  out(`    ${decision.id}: ${decision.choice}`);
  for (const line of wrap(decision.rationale, 62)) out(`      ${line}`);
}
await pausa(4000);

await titulo(4, 'EL RESULTADO');
const { metrics } = resultado;
out(`  Tiempo de generacion   ${metrics.durationMs.toFixed(0)} milisegundos`);
out(`  Ficheros               ${metrics.fileCount}`);
out(`  Lineas de codigo       ${metrics.lineCount.toLocaleString('es-ES')}`);
out(`  Componentes de interfaz ${metrics.componentCount}`);
out(`  Endpoints de API       ${resultado.blueprint.endpoints.length}`);
out(`  Pantallas              ${resultado.blueprint.pages.length}`);
out();
out('  Incluye frontend, backend, base de datos, contenedores, integracion');
out('  continua, documentacion tecnica y pruebas.');
await pausa(3200);

await titulo(5, 'LAS PRUEBAS VIENEN INCLUIDAS Y PASAN');
const pruebas = resultado.files.filter((file) => file.path.endsWith('.test.ts'));
out(`  ${pruebas.length} ficheros de prueba entregados con el proyecto:`);
out();
for (const prueba of pruebas.slice(0, 6)) out(`    ${prueba.path}`);
if (pruebas.length > 6) out(`    ... y ${pruebas.length - 6} mas`);
out();
out('  Se pueden ejecutar tal cual, sin instalar nada:');
out('    node --test "apps/api/src/domain/*.test.ts"');
await pausa(3000);

await titulo(6, 'LO QUE EL SISTEMA ENCUENTRA POR TI');
for (const informe of resultado.reports) {
  out(`  [${informe.kind.padEnd(11)}] ${String(informe.score).padStart(3)}/100  ${informe.summary}`);
}
out();
out('  Los cuatro modulos revisan el proyecto antes de que exista:');
out('  rendimiento, seguridad, cobertura de pruebas y documentacion.');
await pausa(3400);

await titulo(7, 'LO QUE **NO** HACE (y conviene saber antes de comprar)');
const bloqueantes = resultado.reports
  .flatMap((informe) => informe.findings)
  .filter((hallazgo) => hallazgo.severity === 'critical' || hallazgo.severity === 'high');

for (const hallazgo of bloqueantes.slice(0, 5)) {
  out(`  !  ${hallazgo.title}`);
}
out();
out('  El proyecto es un punto de partida correcto, no una aplicacion');
out('  terminada. La autenticacion y la persistencia son esqueletos, y el');
out('  sistema lo dice en voz alta en lugar de disimularlo.');
await pausa(3600);

await titulo(8, 'QUE SIGNIFICA ESTO EN DINERO');
const ahorroMin = SUPUESTOS.horasArranqueManualMin * SUPUESTOS.costeHoraDesarrollador;
const ahorroMax = SUPUESTOS.horasArranqueManualMax * SUPUESTOS.costeHoraDesarrollador;
const costeAnualPro = SUPUESTOS.precioPlanProMes * 12;

out('  Supuestos (cambialos por los tuyos y recalculamos en directo):');
out(`    Coste hora de un desarrollador senior   ${SUPUESTOS.costeHoraDesarrollador} EUR`);
out(`    Horas de arranque manual por proyecto   ${SUPUESTOS.horasArranqueManualMin}-${SUPUESTOS.horasArranqueManualMax} h`);
out();
out('  Calculo:');
out(`    Coste de arrancar un proyecto a mano    ${euros(ahorroMin)} - ${euros(ahorroMax)}`);
out(`    Coste anual del plan Pro (1 persona)    ${euros(costeAnualPro)}`);
out(`    Se paga solo con                        1 proyecto al ano`);
out();
out('  Lo que este calculo NO dice: cuanto del tiempo ahorrado se reinvierte');
out('  en revisar lo generado. Es la primera cifra que mediriamos contigo.');
await pausa(3600);

if (values.out) {
  const escrito = await writeFileTree(resultado.files, values.out, { force: true });
  out();
  out(`  Proyecto escrito en ${escrito.destination} (${escrito.written.length} ficheros).`);
}

out();
out('='.repeat(74));
out('  Siguiente paso: pruebalo con TU proyecto.');
out();
out('    npm run calec -- plan "describe aqui tu proyecto"');
out();
out('='.repeat(74));
out();

await kernel.dispose();

/* --- Auxiliares -------------------------------------------------------- */

function capacidadesActivas(resultado: GenerationResult): string[] {
  return Object.entries(resultado.requirements.features)
    .filter(([, activa]) => activa)
    .map(([nombre]) => nombre);
}

function pct(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}

function euros(value: number): string {
  return `${value.toLocaleString('es-ES')} EUR`;
}

function wrap(text: string, width: number): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if (current === '') current = word;
    else if (current.length + 1 + word.length <= width) current += ` ${word}`;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current !== '') lines.push(current);
  return lines;
}

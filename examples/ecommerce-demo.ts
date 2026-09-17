/**
 * Caso de uso demostrativo: un e-commerce generado por el propio ecosistema.
 *
 * `npm run demo:ecommerce`
 *
 * Genera la tienda en memoria, mide el resultado y publica las metricas que
 * aparecen en `docs/case-study-ecommerce.md`. No escribe nada en disco salvo
 * que se pase `--out <directorio>`.
 */
import { parseArgs } from 'node:util';
import type { GenerationResult, Principal } from '@calecosystem/contracts';
import { Entitlements, createKernel, createLogger, writeFileTree } from '@calecosystem/core';
import { CodeGenerator, generatorPlugin } from '@calecosystem/generator';
import { optimizerPlugin } from '@calecosystem/optimizer';
import { securityPlugin } from '@calecosystem/security';
import { testerPlugin } from '@calecosystem/tester';
import { documenterPlugin } from '@calecosystem/documenter';
import { MemoryUsageStore, billingPlugin } from '@calecosystem/billing';
import { MemorySink, telemetryPlugin } from '@calecosystem/telemetry';

const BRIEF = `
Tienda online de productos artesanales. Los clientes navegan el catalogo,
anaden productos al carrito y pagan con Stripe en el checkout. Hay valoraciones
de productos, login de usuarios con roles y un panel de administracion para
gestionar pedidos, productos y clientes. Esperamos 20.000 usuarios y cumplimos
el RGPD.
`.trim();

const { values } = parseArgs({
  options: { out: { type: 'string' } },
  allowPositionals: false,
});

const sink = new MemorySink();
const principal: Principal = { userId: 'demo', tier: 'enterprise' };

const kernel = await createKernel({
  logger: createLogger({ level: 'warn' }),
  entitlements: new Entitlements({ tier: 'enterprise', customer: 'Demo' }),
  plugins: [
    billingPlugin({ store: new MemoryUsageStore() }),
    generatorPlugin(),
    optimizerPlugin(),
    securityPlugin(),
    testerPlugin(),
    documenterPlugin(),
    telemetryPlugin({ sink, tags: { scenario: 'ecommerce-demo' } }),
  ],
});

const result = await new CodeGenerator({ kernel }).generate({ text: BRIEF }, { principal });

report(result);

if (values.out) {
  const written = await writeFileTree(result.files, values.out, { force: true });
  process.stdout.write(`\nEscritos ${written.written.length} ficheros en ${written.destination}\n`);
}

await kernel.dispose();

function report(generated: GenerationResult): void {
  const { metrics, blueprint } = generated;
  const out = (line = '') => process.stdout.write(`${line}\n`);

  out();
  out('=== CASO DE USO: E-COMMERCE ===');
  out();
  out(`Enunciado: ${BRIEF.split('\n')[0]?.trim()} (...)`);
  out(`Plantilla detectada: ${generated.template?.name} (encaje ${pct(generated.template?.score)})`);
  out(`Senales: ${generated.template?.signals.join(', ')}`);
  out();

  out('--- Metricas de generacion ---');
  out(`  Tiempo total            ${metrics.durationMs.toFixed(0)} ms`);
  out(`  Ficheros                ${metrics.fileCount}`);
  out(`  Lineas de codigo        ${metrics.lineCount}`);
  out(`  Componentes de interfaz ${metrics.componentCount}`);
  out(`  Tamano total            ${(metrics.totalBytes / 1024).toFixed(1)} KB`);
  out();

  out('--- Reparto por fase ---');
  for (const [phase, duration] of Object.entries(metrics.phaseTimings)) {
    const share = ((duration / metrics.durationMs) * 100).toFixed(0);
    out(`  ${phase.padEnd(9)} ${String(duration.toFixed(1)).padStart(7)} ms  (${share}%)`);
  }
  out();

  out('--- Que se genero ---');
  out(`  Entidades de dominio    ${blueprint.entities.length}`);
  out(`  Endpoints de API        ${blueprint.endpoints.length}`);
  out(`  Vistas                  ${blueprint.pages.length}`);
  out(`  Decisiones registradas  ${blueprint.decisions.length}`);
  out(`  Riesgos identificados   ${blueprint.risks.length}`);
  out();

  out('--- Reparto de ficheros ---');
  for (const [area, count] of Object.entries(groupByArea(generated))) {
    out(`  ${area.padEnd(24)} ${String(count).padStart(4)}`);
  }
  out();

  out('--- Informes de los modulos ---');
  for (const moduleReport of generated.reports) {
    out(`  [${moduleReport.kind.padEnd(11)}] ${String(moduleReport.score).padStart(3)}/100  ${moduleReport.summary}`);
  }
  out();

  const generatedTests = generated.files.filter((file) => file.path.endsWith('.test.ts'));
  out(`--- Pruebas entregadas con el proyecto (${generatedTests.length}) ---`);
  for (const testFile of generatedTests) out(`  ${testFile.path}`);
  out();

  out('--- Telemetria recogida ---');
  const counts = new Map<string, number>();
  for (const event of sink.events) counts.set(event.name, (counts.get(event.name) ?? 0) + 1);
  for (const [name, count] of [...counts].sort()) out(`  ${name.padEnd(24)} ${count}`);
  out();

  out('--- Lo que el equipo todavia tiene que hacer ---');
  const blockers = generated.reports
    .flatMap((moduleReport) => moduleReport.findings)
    .filter((finding) => finding.severity === 'critical' || finding.severity === 'high');
  for (const finding of blockers) out(`  ! ${finding.id}: ${finding.title}`);
  out();
  out('El proyecto es un punto de partida correcto, no una tienda terminada.');
}

function pct(value: number | undefined): string {
  return value === undefined ? 'n/d' : `${(value * 100).toFixed(0)}%`;
}

/** Agrupa los ficheros por area para que el reparto se lea de un vistazo. */
function groupByArea(generated: GenerationResult): Record<string, number> {
  const areas: Record<string, number> = {
    'frontend: componentes': 0,
    'frontend: paginas': 0,
    'frontend: features': 0,
    'frontend: otros': 0,
    'backend: dominio': 0,
    'backend: aplicacion': 0,
    'backend: infraestructura': 0,
    'backend: rutas': 0,
    'backend: otros': 0,
    'despliegue y CI': 0,
    documentacion: 0,
  };

  const bump = (area: string) => {
    areas[area] = (areas[area] ?? 0) + 1;
  };

  for (const file of generated.files) {
    const path = file.path;
    if (path.startsWith('apps/web/src/components/')) bump('frontend: componentes');
    else if (path.startsWith('apps/web/src/pages/')) bump('frontend: paginas');
    else if (path.startsWith('apps/web/src/features/')) bump('frontend: features');
    else if (path.startsWith('apps/web/')) bump('frontend: otros');
    else if (path.startsWith('apps/api/src/domain/')) bump('backend: dominio');
    else if (path.startsWith('apps/api/src/application/')) bump('backend: aplicacion');
    else if (path.startsWith('apps/api/src/infrastructure/')) bump('backend: infraestructura');
    else if (path.startsWith('apps/api/src/routes/')) bump('backend: rutas');
    else if (path.startsWith('apps/api/')) bump('backend: otros');
    else if (path.endsWith('.md')) bump('documentacion');
    else bump('despliegue y CI');
  }

  return areas;
}

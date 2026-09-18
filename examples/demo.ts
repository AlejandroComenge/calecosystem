/**
 * Demo ejecutable del ecosistema completo: `npm run demo`.
 *
 * Genera un proyecto en memoria, muestra las decisiones de arquitectura y los
 * informes de los cinco módulos, y no escribe nada en disco.
 */
import { Entitlements, createKernel, createLogger } from '@calecosystem/core';
import { CodeGenerator, generatorPlugin } from '@calecosystem/generator';
import { optimizerPlugin } from '@calecosystem/optimizer';
import { securityPlugin } from '@calecosystem/security';
import { testerPlugin } from '@calecosystem/tester';
import { documenterPlugin } from '@calecosystem/documenter';
import { definePlugin } from '@calecosystem/contracts';

const BRIEF = `
Necesitamos una plataforma de reservas para clínicas dentales. Los pacientes
piden citas con los médicos desde la web, con login de usuarios y roles.
Hay pagos online con Stripe, valoraciones de los médicos y un panel de
administración para gestionar citas, pacientes y facturas. Esperamos 30.000
usuarios el primer año y trabajamos con datos médicos, así que debemos cumplir
el RGPD.
`;

// Plugin de ejemplo: política corporativa impuesta sin tocar el generador.
const politicaCorporativa = definePlugin({
  name: 'demo-politica-corporativa',
  version: '1.0.0',
  description: 'Impone PostgreSQL y deja constancia de por qué.',
  priority: 10,
  register(api) {
    api.onTransform('blueprint:planned', (blueprint) => ({
      ...blueprint,
      stack: { ...blueprint.stack, database: 'postgres' },
      decisions: [
        ...blueprint.decisions,
        {
          id: 'ADR-POLITICA-DB',
          title: 'Motor de datos corporativo',
          choice: 'postgres',
          rationale: 'Política de datos: un único motor soportado por el equipo de Plataforma.',
          alternatives: ['mysql', 'mongodb', 'sqlite'],
        },
      ],
    }));

    api.onEvent('pipeline:phase-end', ({ phase, durationMs }) => {
      process.stdout.write(`  fase ${phase.padEnd(9)} ${durationMs.toFixed(1)} ms\n`);
    });
  },
});

const kernel = await createKernel({
  logger: createLogger({ level: 'warn' }),
  entitlements: new Entitlements({ tier: 'enterprise', customer: 'Demo' }),
  plugins: [
    generatorPlugin(),
    optimizerPlugin(),
    securityPlugin(),
    testerPlugin(),
    documenterPlugin(),
    politicaCorporativa,
  ],
});

process.stdout.write('\n== Pipeline ==\n');
const result = await new CodeGenerator({ kernel }).generate({ text: BRIEF });

process.stdout.write('\n== Requisitos detectados ==\n');
process.stdout.write(`  Proyecto:   ${result.requirements.projectName}\n`);
process.stdout.write(`  Confianza:  ${(result.requirements.confidence * 100).toFixed(0)}%\n`);
process.stdout.write(
  `  Entidades:  ${result.requirements.entities.map((entity) => entity.name).join(', ')}\n`,
);
process.stdout.write(
  `  Roles:      ${result.requirements.actors.map((actor) => actor.label).join(', ')}\n`,
);

process.stdout.write('\n== Decisiones de arquitectura ==\n');
for (const decision of result.blueprint.decisions) {
  process.stdout.write(`  ${decision.id.padEnd(18)} ${decision.choice}\n`);
}

process.stdout.write('\n== Proyecto generado ==\n');
process.stdout.write(
  `  ${result.metrics.fileCount} ficheros, ${(result.metrics.totalBytes / 1024).toFixed(1)} KB, ` +
    `${result.metrics.durationMs.toFixed(0)} ms\n`,
);
process.stdout.write(`  ${result.blueprint.endpoints.length} endpoints, ${result.blueprint.pages.length} vistas\n`);

process.stdout.write('\n== Informes de los modulos ==\n');
for (const report of result.reports) {
  process.stdout.write(`  [${report.kind.padEnd(11)}] ${String(report.score).padStart(3)}/100  ${report.summary}\n`);
  for (const finding of report.findings.filter((candidate) => candidate.severity !== 'info')) {
    process.stdout.write(`      ${finding.severity.padEnd(8)} ${finding.id}\n`);
  }
}

if (result.warnings.length > 0) {
  process.stdout.write('\n== Avisos ==\n');
  for (const warning of result.warnings) {
    process.stdout.write(`  ! ${warning}\n`);
  }
}

if (result.requirements.openQuestions.length > 0) {
  process.stdout.write('\n== Preguntas abiertas ==\n');
  for (const question of result.requirements.openQuestions) {
    process.stdout.write(`  ? ${question}\n`);
  }
}

process.stdout.write('\nNo se ha escrito nada en disco. Usa `calec generate --out <dir>` para materializarlo.\n\n');

await kernel.dispose();

import { parseArgs } from 'node:util';
import { EcosystemError } from '@calecosystem/core';
import { runGenerate, runModules, runPlan, type CommandResult } from './commands.ts';

export const VERSION = '0.1.0';

const HELP = `
calec - CalEcosystem, ecosistema de desarrollo web automatizado

USO
  calec <comando> [descripcion] [opciones]

COMANDOS
  generate   Analiza los requisitos y genera el proyecto completo
  plan       Muestra la arquitectura propuesta sin escribir ficheros
  modules    Lista plugins, modulos y adaptadores disponibles
  help       Muestra esta ayuda
  version    Muestra la version

OPCIONES
  --file, -f <ruta>      Lee la descripcion de requisitos de un fichero
  --out, -o <directorio> Destino del proyecto generado
  --name <nombre>        Nombre del proyecto (si no, se infiere del texto)
  --framework <nombre>   react | vue | angular
  --database <nombre>    postgres | mysql | mongodb | sqlite
  --deployment <destino> docker-compose | vercel | aws-ecs | kubernetes
  --dry-run              Muestra que se generaria sin escribir nada
  --force                Sobrescribe ficheros existentes en el destino
  --json                 Salida en JSON, para encadenar con otras herramientas
  --quiet, -q            Silencia los registros del pipeline

EJEMPLOS
  calec plan "Marketplace de productos artesanales con pagos y valoraciones"
  calec generate --file requisitos.md --framework vue --out ./mi-proyecto
  calec generate "Panel interno para gestionar pedidos y clientes" --dry-run
  calec modules --json

CODIGOS DE SALIDA
  0  correcto
  1  generado con hallazgos criticos de seguridad, o error de uso
  2  error inesperado
`.trim();

export async function runCli(argv: readonly string[]): Promise<CommandResult> {
  let parsed: ReturnType<typeof parseArgs<{ options: typeof OPTION_SCHEMA; allowPositionals: true }>>;
  try {
    parsed = parseArgs({
      args: [...argv],
      options: OPTION_SCHEMA,
      allowPositionals: true,
    });
  } catch (error) {
    return { exitCode: 1, output: `${(error as Error).message}\n\n${HELP}` };
  }

  const { values, positionals } = parsed;
  const command = positionals[0] ?? 'help';
  const description = positionals.slice(1).join(' ').trim();

  const options = {
    ...(description ? { description } : {}),
    ...(values.file ? { file: values.file } : {}),
    ...(values.out ? { out: values.out } : {}),
    ...(values.name ? { name: values.name } : {}),
    ...(values.framework ? { framework: values.framework } : {}),
    ...(values.database ? { database: values.database } : {}),
    ...(values.deployment ? { deployment: values.deployment } : {}),
    dryRun: values['dry-run'] === true,
    force: values.force === true,
    json: values.json === true,
    quiet: values.quiet === true,
  };

  try {
    switch (command) {
      case 'generate':
        return await runGenerate(options);
      case 'plan':
        return await runPlan(options);
      case 'modules':
      case 'doctor':
        return await runModules(options);
      case 'version':
        return { exitCode: 0, output: VERSION };
      case 'help':
        return { exitCode: 0, output: HELP };
      default:
        return { exitCode: 1, output: `Comando desconocido: "${command}".\n\n${HELP}` };
    }
  } catch (error) {
    if (error instanceof EcosystemError) {
      return { exitCode: 1, output: `[${error.code}] ${error.message}` };
    }
    return { exitCode: 2, output: `Error inesperado: ${(error as Error).message}` };
  }
}

const OPTION_SCHEMA = {
  file: { type: 'string', short: 'f' },
  out: { type: 'string', short: 'o' },
  name: { type: 'string' },
  framework: { type: 'string' },
  database: { type: 'string' },
  deployment: { type: 'string' },
  'dry-run': { type: 'boolean' },
  force: { type: 'boolean' },
  json: { type: 'boolean' },
  quiet: { type: 'boolean', short: 'q' },
} as const;

export { HELP };

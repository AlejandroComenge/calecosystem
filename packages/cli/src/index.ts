/**
 * @calecosystem/cli
 *
 * Punto de entrada de línea de comandos. Toda la lógica vive en los módulos
 * del ecosistema; aquí solo se interpretan argumentos y se presenta el
 * resultado.
 */
export { runCli, VERSION, HELP } from './cli.ts';
export { bootstrapEcosystem, type BootstrapOptions, type BootstrapResult } from './bootstrap.ts';
export { runGenerate, runPlan, runModules, type CommandOptions, type CommandResult } from './commands.ts';

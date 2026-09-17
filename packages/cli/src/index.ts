/**
 * @calecosystem/cli
 *
 * Punto de entrada de linea de comandos. Toda la logica vive en los modulos
 * del ecosistema; aqui solo se interpretan argumentos y se presenta el
 * resultado.
 */
export { runCli, VERSION, HELP } from './cli.ts';
export { bootstrapEcosystem, type BootstrapOptions, type BootstrapResult } from './bootstrap.ts';
export { runGenerate, runPlan, runModules, type CommandOptions, type CommandResult } from './commands.ts';

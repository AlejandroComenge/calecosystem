/**
 * @calecosystem/core
 *
 * Kernel del ecosistema: carga de plugins, bus de hooks, control de
 * entitlements y sistema de ficheros virtual. No contiene lógica de
 * generación; esa vive en `@calecosystem/generator`.
 */
export * from './errors.ts';
export * from './logger.ts';
export * from './hook-bus.ts';
export * from './entitlements.ts';
export * from './file-tree.ts';
export * from './plugin-registry.ts';
export * from './dependency-registry.ts';
export * from './middleware-chain.ts';
export * from './kernel.ts';
export * from './config.ts';
export * from './write-tree.ts';
export { definePlugin, createServiceToken } from '@calecosystem/contracts';

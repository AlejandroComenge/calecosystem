/**
 * @calecosystem/telemetry
 *
 * Registro estructurado del uso del ecosistema. Alimenta las decisiones de
 * producto con datos y no con intuiciones, sin guardar informacion de negocio
 * de los clientes.
 */
export * from './events.ts';
export * from './sinks.ts';
export { telemetryPlugin, type TelemetryPluginOptions } from './plugin.ts';

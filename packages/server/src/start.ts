import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Tier } from '@calecosystem/contracts';
import { createApp, type AppOptions } from './app.ts';

export interface ServerHandle {
  readonly server: Server;
  readonly port: number;
  readonly url: string;
  close(): Promise<void>;
}

export interface StartOptions extends AppOptions {
  /** Puerto. `0` elige uno libre, que es lo que usan las pruebas. */
  readonly port?: number;
  readonly host?: string;
}

/** Arranca el servidor y espera a que esté escuchando. */
export async function startServer(options: StartOptions = {}): Promise<ServerHandle> {
  const app = await createApp(options);
  const server = createServer((request, response) => {
    void app.handler(request, response);
  });

  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? Number(process.env['PORT'] ?? 3000);

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });

  const asignado = (server.address() as AddressInfo).port;

  return {
    server,
    port: asignado,
    url: `http://${host}:${asignado}`,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await app.close();
    },
  };
}

/** Punto de entrada cuando se ejecuta el paquete directamente. */
export async function main(): Promise<void> {
  const tier = (process.env['CALEC_LICENSE_TIER'] ?? 'enterprise') as Tier;
  const handle = await startServer({ tier });

  process.stdout.write(`\n  CalEcosystem Studio\n`);
  process.stdout.write(`  ${handle.url}\n\n`);
  process.stdout.write(`  Plan activo: ${tier}. Ctrl+C para parar.\n\n`);

  for (const senal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(senal, () => {
      void handle.close().then(() => process.exit(0));
    });
  }
}

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

/**
 * Deliberadamente NO es 3000: ese es el puerto que usan los backends que este
 * mismo generador produce. Si Studio ocupase el 3000, arrancar un proyecto
 * recién generado chocaría con él, y el usuario vería un error sin entender
 * que dos cosas nuestras se están peleando por la misma puerta.
 */
export const PUERTO_POR_DEFECTO = 4173;

/** Arranca el servidor y espera a que esté escuchando. */
export async function startServer(options: StartOptions = {}): Promise<ServerHandle> {
  const app = await createApp(options);
  const server = createServer((request, response) => {
    void app.handler(request, response);
  });

  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? Number(process.env['PORT'] ?? PUERTO_POR_DEFECTO);

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

/**
 * Traduce el fallo de arranque a algo accionable. Un `EADDRINUSE` pelado deja
 * tirado a quien no programa, que es justo el público de esta aplicación.
 */
function explicarFalloDeArranque(error: unknown, puerto: number): string {
  const codigo = (error as NodeJS.ErrnoException | null)?.code;

  if (codigo === 'EADDRINUSE') {
    return [
      `El puerto ${puerto} ya está ocupado por otro programa.`,
      '',
      '  Puede que tengas otro CalEcosystem Studio abierto en otra ventana.',
      '  Ciérralo, o arranca este en otra puerta:',
      '',
      '    PowerShell:  $env:PORT="4174"; npm run studio',
      '    macOS/Linux: PORT=4174 npm run studio',
    ].join('\n');
  }

  if (codigo === 'EACCES') {
    return `El sistema no te deja abrir el puerto ${puerto}. Prueba con uno por encima de 1024.`;
  }

  return error instanceof Error ? error.message : String(error);
}

/** Punto de entrada cuando se ejecuta el paquete directamente. */
export async function main(): Promise<void> {
  const tier = (process.env['CALEC_LICENSE_TIER'] ?? 'enterprise') as Tier;
  const puerto = Number(process.env['PORT'] ?? PUERTO_POR_DEFECTO);

  let handle: ServerHandle;
  try {
    handle = await startServer({ tier, port: puerto });
  } catch (error) {
    process.stderr.write(`\n  No se ha podido arrancar CalEcosystem Studio.\n\n`);
    process.stderr.write(`  ${explicarFalloDeArranque(error, puerto)}\n\n`);
    process.exitCode = 1;
    return;
  }

  process.stdout.write(`\n  CalEcosystem Studio\n`);
  process.stdout.write(`  Abre esta dirección en el navegador: ${handle.url}\n\n`);
  process.stdout.write(`  Plan activo: ${tier}. Ctrl+C para parar.\n\n`);

  for (const senal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(senal, () => {
      void handle.close().then(() => process.exit(0));
    });
  }
}

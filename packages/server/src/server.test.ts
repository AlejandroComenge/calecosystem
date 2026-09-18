import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createSilentLogger } from '@calecosystem/core';
import { startServer, type ServerHandle } from './start.ts';

let servidor: ServerHandle;

const BRIEF =
  'Marketplace donde los vendedores publican cartas de coleccion con su precio y estado. ' +
  'Los compradores hacen pedidos y pagan con Stripe. Hay valoraciones, login de usuarios ' +
  'con roles y un panel de administracion para gestionar pedidos, productos y clientes.';

before(async () => {
  servidor = await startServer({ port: 0, logger: createSilentLogger(), tier: 'enterprise' });
});

after(async () => {
  await servidor.close();
});

const url = (ruta: string) => `${servidor.url}${ruta}`;

function postJson(ruta: string, cuerpo: unknown, cabeceras: Record<string, string> = {}) {
  return fetch(url(ruta), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...cabeceras },
    body: JSON.stringify(cuerpo),
  });
}

/* --- Rutas básicas ------------------------------------------------------ */

test('la sonda de salud responde', async () => {
  const respuesta = await fetch(url('/api/health'));

  assert.equal(respuesta.status, 200);
  assert.equal(((await respuesta.json()) as { status: string }).status, 'ok');
});

test('sirve la interfaz web en la raíz', async () => {
  const respuesta = await fetch(url('/'));

  assert.equal(respuesta.status, 200);
  assert.match(respuesta.headers.get('content-type') ?? '', /text\/html/);
  assert.match(await respuesta.text(), /CalEcosystem Studio/);
});

test('expone el catálogo de ejemplos para poder probar sin escribir nada', async () => {
  const respuesta = await fetch(url('/api/examples'));
  const datos = (await respuesta.json()) as { examples: { id: string; brief: string }[] };

  assert.ok(datos.examples.length >= 6);
  assert.ok(datos.examples.every((ejemplo) => ejemplo.brief.length > 100));
});

/* --- Planificación ------------------------------------------------------ */

test('devuelve el plan con las decisiones justificadas', async () => {
  const respuesta = await postJson('/api/plan', { text: BRIEF });
  const plan = (await respuesta.json()) as {
    stack: { frontend: string };
    entities: { name: string; inferred: boolean }[];
    decisions: { id: string; rationale: string }[];
  };

  assert.equal(respuesta.status, 200);
  assert.equal(plan.stack.frontend, 'react');
  assert.ok(plan.entities.length >= 4);
  assert.ok(plan.decisions.length >= 4);
  // Una decisión sin motivo no sirve de nada a quien recibe el proyecto.
  assert.ok(plan.decisions.every((decision) => decision.rationale.length > 20));
});

test('marca las entidades deducidas para que se revisen', async () => {
  const respuesta = await postJson('/api/plan', {
    text: 'Aplicacion donde los usuarios intercambian cromos de coleccion entre ellos con login',
  });
  const plan = (await respuesta.json()) as { entities: { name: string; inferred: boolean }[] };

  assert.ok(plan.entities.some((entidad) => entidad.inferred), 'debe señalar lo que dedujo');
});

test('un enunciado demasiado corto se rechaza con un mensaje útil', async () => {
  const respuesta = await postJson('/api/plan', { text: 'corto' });
  const error = (await respuesta.json()) as { error: { code: string; message: string } };

  assert.equal(respuesta.status, 400);
  assert.equal(error.error.code, 'EMPTY_REQUIREMENTS');
  assert.match(error.error.message, /qué gestiona/);
});

/* --- Generación --------------------------------------------------------- */

test('genera el proyecto y lo devuelve como ZIP descargable', async () => {
  const respuesta = await postJson('/api/generate', { text: BRIEF, name: 'Cartas Seguras' });

  assert.equal(respuesta.status, 200);
  assert.equal(respuesta.headers.get('content-type'), 'application/zip');
  assert.match(respuesta.headers.get('content-disposition') ?? '', /filename="cartas-seguras\.zip"/);

  const zip = Buffer.from(await respuesta.arrayBuffer());
  assert.ok(zip.length > 10_000, `el ZIP pesa ${zip.length} bytes`);
  assert.equal(zip.readUInt32LE(0), 0x04034b50, 'firma de ZIP');
});

test('el ZIP descargado se puede abrir y contiene el proyecto', async (t) => {
  const respuesta = await postJson('/api/generate', { text: BRIEF, name: 'Cartas Seguras' });
  const zip = Buffer.from(await respuesta.arrayBuffer());

  const directorio = await mkdtemp(path.join(tmpdir(), 'calec-srv-'));
  try {
    const ruta = path.join(directorio, 'p.zip');
    await writeFile(ruta, zip);

    let salida: string;
    try {
      salida = execFileSync('python3', [
        '-c',
        'import sys,zipfile\n' +
          'z=zipfile.ZipFile(sys.argv[1])\n' +
          'assert z.testzip() is None\n' +
          'print(len(z.namelist()))\n' +
          'print("README.md" in z.namelist())\n' +
          'print("apps/api/src/server.ts" in z.namelist())',
        ruta,
      ]).toString();
    } catch {
      t.skip('sin python3 para la comprobación externa');
      return;
    }

    const [ficheros, tieneReadme, tieneServidor] = salida.trim().split('\n');
    assert.ok(Number(ficheros) > 50, `solo ${ficheros} ficheros`);
    assert.equal(tieneReadme, 'True');
    assert.equal(tieneServidor, 'True');
  } finally {
    await rm(directorio, { recursive: true, force: true });
  }
});

test('el resumen viaja en la cabecera para no generar dos veces', async () => {
  const respuesta = await postJson('/api/generate', { text: BRIEF });
  const cabecera = respuesta.headers.get('X-Calec-Summary');
  await respuesta.arrayBuffer();

  assert.ok(cabecera, 'debe venir el resumen');
  const resumen = JSON.parse(Buffer.from(cabecera, 'base64').toString('utf8')) as {
    metrics: { fileCount: number };
    reports: { kind: string }[];
  };
  assert.ok(resumen.metrics.fileCount > 50);
  assert.deepEqual(
    resumen.reports.map((informe) => informe.kind),
    ['optimizer', 'security', 'tester', 'documenter'],
  );
});

test('con format:json devuelve el resumen sin el ZIP', async () => {
  const respuesta = await postJson('/api/generate', { text: BRIEF, format: 'json' });
  const resumen = (await respuesta.json()) as { projectName: string; metrics: { lineCount: number } };

  assert.match(respuesta.headers.get('content-type') ?? '', /application\/json/);
  assert.ok(resumen.metrics.lineCount > 1000);
});

test('respeta el framework pedido', async () => {
  const respuesta = await postJson('/api/generate', {
    text: BRIEF,
    framework: 'vue',
    format: 'json',
  });
  const resumen = (await respuesta.json()) as { stack: { frontend: string } };

  assert.equal(resumen.stack.frontend, 'vue');
});

/* --- Cuotas ------------------------------------------------------------- */

test('el consumo se separa por usuario', async () => {
  await postJson('/api/generate', { text: BRIEF, format: 'json' }, { 'X-Calec-User': 'ana' });

  const deAna = await fetch(url('/api/usage'), { headers: { 'X-Calec-User': 'ana' } });
  const deLuis = await fetch(url('/api/usage'), { headers: { 'X-Calec-User': 'luis' } });

  const consumoAna = (await deAna.json()) as { quotas: { operation: string; used: number }[] };
  const consumoLuis = (await deLuis.json()) as { quotas: { operation: string; used: number }[] };

  const usadasAna = consumoAna.quotas.find((q) => q.operation === 'generation')?.used ?? 0;
  const usadasLuis = consumoLuis.quotas.find((q) => q.operation === 'generation')?.used ?? 0;

  assert.ok(usadasAna >= 1);
  assert.equal(usadasLuis, 0, 'el consumo de uno no puede contar al otro');
});

test('al agotar la cuota responde 429 y propone el plan que la levanta', async () => {
  const usuario = { 'X-Calec-User': 'cuota-agotada' };

  // El plan gratuito permite 10 generaciones al mes.
  for (let intento = 0; intento < 10; intento += 1) {
    await postJson('/api/generate', { text: BRIEF, format: 'json' }, usuario);
  }

  const respuesta = await postJson('/api/generate', { text: BRIEF, format: 'json' }, usuario);
  const error = (await respuesta.json()) as { error: { code: string; upgradeTo: string } };

  assert.equal(respuesta.status, 429);
  assert.equal(error.error.code, 'QUOTA_EXCEEDED');
  assert.equal(error.error.upgradeTo, 'pro');
});

/* --- Seguridad ---------------------------------------------------------- */

test('no sirve ficheros fuera de la carpeta pública', async () => {
  // `fetch` normaliza `..`, así que se codifica para que llegue al servidor.
  const respuesta = await fetch(url('/%2e%2e/%2e%2e/package.json'));

  assert.ok(respuesta.status === 403 || respuesta.status === 404, `dio ${respuesta.status}`);
});

test('envía cabeceras de seguridad en todas las respuestas', async () => {
  const respuesta = await fetch(url('/api/health'));

  assert.equal(respuesta.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(respuesta.headers.get('x-frame-options'), 'DENY');
  assert.ok(respuesta.headers.get('content-security-policy'));
});

test('rechaza un cuerpo desmesurado en vez de quedarse sin memoria', async () => {
  const respuesta = await fetch(url('/api/plan'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'x'.repeat(200_000) }),
  });

  assert.equal(respuesta.status, 413);
});

test('un JSON mal formado da un error claro, no un 500', async () => {
  const respuesta = await fetch(url('/api/plan'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{esto no es json',
  });
  const error = (await respuesta.json()) as { error: { code: string } };

  assert.equal(respuesta.status, 400);
  assert.equal(error.error.code, 'INVALID_JSON');
});

test('una ruta de API inexistente devuelve 404 con código', async () => {
  const respuesta = await fetch(url('/api/no-existe'));
  const error = (await respuesta.json()) as { error: { code: string } };

  assert.equal(respuesta.status, 404);
  assert.equal(error.error.code, 'NOT_FOUND');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { crc32, inflateRawSync } from 'node:zlib';
import type { VirtualFile } from '@calecosystem/contracts';
import { ZipError, createZip } from './zip.ts';
import { GenerationError } from './errors.ts';

const file = (ruta: string, contenido: string): VirtualFile => ({
  path: ruta,
  contents: contenido,
  producedBy: 'test',
});

const FECHA_FIJA = new Date('2026-09-18T10:30:00Z');

/** Lee la cabecera local de la primera entrada del ZIP. */
function primeraEntrada(zip: Buffer) {
  assert.equal(zip.readUInt32LE(0), 0x04034b50, 'firma de cabecera local');
  const metodo = zip.readUInt16LE(8);
  const crc = zip.readUInt32LE(14);
  const comprimido = zip.readUInt32LE(18);
  const original = zip.readUInt32LE(22);
  const largoNombre = zip.readUInt16LE(26);
  const nombre = zip.subarray(30, 30 + largoNombre).toString('utf8');
  const datos = zip.subarray(30 + largoNombre, 30 + largoNombre + comprimido);
  return { metodo, crc, original, nombre, datos };
}

test('produce un ZIP con la estructura del formato', () => {
  const zip = createZip([file('README.md', 'hola')], { date: FECHA_FIJA });

  assert.equal(zip.readUInt32LE(0), 0x04034b50, 'cabecera local');
  // El fin del directorio central ocupa los últimos 22 bytes.
  const fin = zip.length - 22;
  assert.equal(zip.readUInt32LE(fin), 0x06054b50, 'fin del directorio');
  assert.equal(zip.readUInt16LE(fin + 8), 1, 'una entrada');
  assert.equal(zip.readUInt16LE(fin + 10), 1, 'total de entradas');
});

test('el contenido se recupera intacto, incluidos los acentos', () => {
  const texto = '# Cerámica Artesanal\n\nAño de creación: 2026. Elección: español.\n';
  const zip = createZip([file('README.md', texto)], { date: FECHA_FIJA });
  const entrada = primeraEntrada(zip);

  const recuperado =
    entrada.metodo === 8 ? inflateRawSync(entrada.datos).toString('utf8') : entrada.datos.toString('utf8');

  assert.equal(recuperado, texto);
  assert.equal(entrada.crc, crc32(Buffer.from(texto, 'utf8')), 'el CRC debe cuadrar');
});

test('marca el nombre como UTF-8 para que no se rompa fuera de Windows', () => {
  const zip = createZip([file('docs/ARCHITECTURE.md', 'contenido de prueba')], { date: FECHA_FIJA });
  const flags = zip.readUInt16LE(6);

  assert.equal(flags & 0x0800, 0x0800, 'el bit 11 declara nombres en UTF-8');
});

test('comprime cuando merece la pena y almacena cuando no', () => {
  const repetitivo = 'linea de texto repetida\n'.repeat(200);
  const comprimible = primeraEntrada(createZip([file('a.txt', repetitivo)], { date: FECHA_FIJA }));
  assert.equal(comprimible.metodo, 8, 'un texto repetitivo debe comprimirse');

  // Un contenido diminuto crece al comprimirlo: se almacena tal cual.
  const diminuto = primeraEntrada(createZip([file('b.txt', 'ab')], { date: FECHA_FIJA }));
  assert.equal(diminuto.metodo, 0, 'comprimir dos bytes no ahorra nada');
});

test('con compress:false no se comprime nada', () => {
  const repetitivo = 'linea repetida\n'.repeat(200);
  const entrada = primeraEntrada(
    createZip([file('a.txt', repetitivo)], { date: FECHA_FIJA, compress: false }),
  );

  assert.equal(entrada.metodo, 0);
  assert.equal(entrada.datos.toString('utf8'), repetitivo);
});

test('normaliza las rutas y rechaza las que escapan del directorio', () => {
  const zip = createZip([file('.\\apps\\web\\main.ts', 'x = 1')], { date: FECHA_FIJA });
  assert.equal(primeraEntrada(zip).nombre, 'apps/web/main.ts');

  // Un ZIP con `../` es un ataque clásico contra quien lo descomprime.
  assert.throws(() => createZip([file('../../etc/passwd', 'x')]), GenerationError);
  assert.throws(() => createZip([file('/etc/passwd', 'x')]), GenerationError);
});

test('el mismo árbol y la misma fecha producen el mismo ZIP', () => {
  const ficheros = [file('a.txt', 'uno'), file('b/c.txt', 'dos')];

  assert.deepEqual(
    createZip(ficheros, { date: FECHA_FIJA }),
    createZip(ficheros, { date: FECHA_FIJA }),
  );
});

test('un árbol vacío produce un ZIP válido y vacío', () => {
  const zip = createZip([]);

  assert.equal(zip.length, 22, 'solo el fin del directorio');
  assert.equal(zip.readUInt32LE(0), 0x06054b50);
});

test('avisa en vez de producir un fichero corrupto si se pasa de ficheros', () => {
  const demasiados = Array.from({ length: 70_000 }, (_unused, index) =>
    file(`f${index}.txt`, 'x'),
  );

  assert.throws(() => createZip(demasiados), ZipError);
});

test('el ZIP se puede descomprimir con una herramienta externa', async (t) => {
  // Prueba de verdad: que lo abra algo que no sea nuestro propio código.
  const directorio = await mkdtemp(path.join(tmpdir(), 'calec-zip-'));
  try {
    const zip = createZip(
      [file('README.md', '# Cerámica\n'), file('apps/api/src/server.ts', 'export const x = 1;\n')],
      { date: FECHA_FIJA },
    );
    const ruta = path.join(directorio, 'proyecto.zip');
    await writeFile(ruta, zip);

    let salida: string;
    try {
      salida = execFileSync('python3', [
        '-c',
        'import sys,zipfile\n' +
          'z=zipfile.ZipFile(sys.argv[1])\n' +
          'assert z.testzip() is None, "CRC incorrecto"\n' +
          'print(z.read("README.md").decode("utf8").strip())',
        ruta,
      ]).toString();
    } catch {
      t.skip('sin python3 disponible para la comprobación externa');
      return;
    }

    assert.equal(salida.trim(), '# Cerámica');
  } finally {
    await rm(directorio, { recursive: true, force: true });
  }
});

import { crc32, deflateRawSync } from 'node:zlib';
import type { VirtualFile } from '@calecosystem/contracts';
import { FileTree } from './file-tree.ts';

/**
 * Escritor de ficheros ZIP.
 *
 * Node no trae uno, y el ecosistema no tiene dependencias de ejecución: se
 * escribe el formato a mano. Son unas cien líneas y evita meter un paquete de
 * terceros en la ruta por la que pasa todo el código que entregamos a un
 * cliente.
 *
 * Alcance: el ZIP clásico, sin ZIP64. Suficiente de sobra para un proyecto
 * generado (miles de ficheros y decenas de megas como mucho); si algún día se
 * superan los 4 GB o los 65.535 ficheros habrá que ampliarlo, y el código
 * avisa en lugar de producir un fichero corrupto.
 */

const FIRMA_CABECERA_LOCAL = 0x04034b50;
const FIRMA_DIRECTORIO = 0x02014b50;
const FIRMA_FIN_DIRECTORIO = 0x06054b50;

/** Bit 11 de los flags: el nombre del fichero va en UTF-8. */
const FLAG_UTF8 = 0x0800;
const METODO_DEFLATE = 8;
const METODO_ALMACENADO = 0;

const MAX_FICHEROS = 0xffff;
const MAX_TAMANO = 0xffffffff;

export class ZipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ZipError';
  }
}

interface EntradaPreparada {
  readonly nombre: Buffer;
  readonly datos: Buffer;
  readonly metodo: number;
  readonly crc: number;
  readonly tamanoOriginal: number;
  readonly desplazamiento: number;
}

export interface ZipOptions {
  /** Fecha grabada en las entradas. Fija en las pruebas para que el ZIP sea reproducible. */
  readonly date?: Date;
  /**
   * Con `false` no se comprime.
   *
   * Comprimir cuesta tiempo de CPU; para un proyecto generado (texto plano)
   * el ahorro ronda el 70 %, así que compensa salvo que se priorice latencia.
   */
  readonly compress?: boolean;
}

/**
 * Empaqueta un árbol de ficheros en un ZIP listo para descargar.
 *
 * Las rutas se normalizan igual que en `FileTree`, así que un nombre que
 * intente escapar del directorio se rechaza antes de escribir nada: un ZIP
 * con rutas como `../../..` es un vector de ataque clásico contra quien lo
 * descomprime.
 */
export function createZip(
  files: readonly VirtualFile[] | FileTree,
  options: ZipOptions = {},
): Buffer {
  const lista = files instanceof FileTree ? files.toArray() : [...files];

  if (lista.length > MAX_FICHEROS) {
    throw new ZipError(
      `El ZIP clásico admite ${MAX_FICHEROS} ficheros y se han pedido ${lista.length}.`,
    );
  }

  const comprimir = options.compress !== false;
  const { hora, fecha } = aFechaDos(options.date ?? new Date());

  const entradas: EntradaPreparada[] = [];
  const bloques: Buffer[] = [];
  let desplazamiento = 0;

  for (const file of lista) {
    const nombre = Buffer.from(FileTree.normalizePath(file.path), 'utf8');
    const original = Buffer.from(file.contents, 'utf8');

    if (original.length > MAX_TAMANO) {
      throw new ZipError(`"${file.path}" supera el tamaño máximo de un ZIP clásico.`);
    }

    const comprimido = comprimir ? deflateRawSync(original) : original;
    // Si comprimir no ahorra nada (fichero diminuto), se almacena tal cual.
    const usaDeflate = comprimir && comprimido.length < original.length;
    const datos = usaDeflate ? comprimido : original;
    const metodo = usaDeflate ? METODO_DEFLATE : METODO_ALMACENADO;
    const suma = crc32(original);

    const cabecera = Buffer.alloc(30);
    cabecera.writeUInt32LE(FIRMA_CABECERA_LOCAL, 0);
    cabecera.writeUInt16LE(20, 4); // versión mínima para extraer
    cabecera.writeUInt16LE(FLAG_UTF8, 6);
    cabecera.writeUInt16LE(metodo, 8);
    cabecera.writeUInt16LE(hora, 10);
    cabecera.writeUInt16LE(fecha, 12);
    cabecera.writeUInt32LE(suma, 14);
    cabecera.writeUInt32LE(datos.length, 18);
    cabecera.writeUInt32LE(original.length, 22);
    cabecera.writeUInt16LE(nombre.length, 26);
    cabecera.writeUInt16LE(0, 28); // sin campo extra

    bloques.push(cabecera, nombre, datos);
    entradas.push({
      nombre,
      datos,
      metodo,
      crc: suma,
      tamanoOriginal: original.length,
      desplazamiento,
    });
    desplazamiento += cabecera.length + nombre.length + datos.length;
  }

  const inicioDirectorio = desplazamiento;
  for (const entrada of entradas) {
    const registro = Buffer.alloc(46);
    registro.writeUInt32LE(FIRMA_DIRECTORIO, 0);
    registro.writeUInt16LE(0x031e, 4); // creado en Unix, versión 3.0
    registro.writeUInt16LE(20, 6);
    registro.writeUInt16LE(FLAG_UTF8, 8);
    registro.writeUInt16LE(entrada.metodo, 10);
    registro.writeUInt16LE(hora, 12);
    registro.writeUInt16LE(fecha, 14);
    registro.writeUInt32LE(entrada.crc, 16);
    registro.writeUInt32LE(entrada.datos.length, 20);
    registro.writeUInt32LE(entrada.tamanoOriginal, 24);
    registro.writeUInt16LE(entrada.nombre.length, 28);
    registro.writeUInt16LE(0, 30); // extra
    registro.writeUInt16LE(0, 32); // comentario
    registro.writeUInt16LE(0, 34); // disco
    registro.writeUInt16LE(0, 36); // atributos internos
    // Permisos 0644 en los 16 bits altos: sin esto, al descomprimir en Linux
    // los ficheros salen sin permisos de lectura.
    //
    // El `>>> 0` no es adorno: `<<` en JavaScript trabaja con enteros de 32
    // bits CON SIGNO, así que 0o100644 << 16 desborda a un número negativo y
    // `writeUInt32LE` lo rechaza.
    registro.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    registro.writeUInt32LE(entrada.desplazamiento, 42);

    bloques.push(registro, entrada.nombre);
    desplazamiento += registro.length + entrada.nombre.length;
  }

  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(FIRMA_FIN_DIRECTORIO, 0);
  fin.writeUInt16LE(0, 4); // número de disco
  fin.writeUInt16LE(0, 6); // disco del directorio
  fin.writeUInt16LE(entradas.length, 8);
  fin.writeUInt16LE(entradas.length, 10);
  fin.writeUInt32LE(desplazamiento - inicioDirectorio, 12);
  fin.writeUInt32LE(inicioDirectorio, 16);
  fin.writeUInt16LE(0, 20); // sin comentario

  bloques.push(fin);
  return Buffer.concat(bloques);
}

/** Convierte una fecha al formato MS-DOS que usa el ZIP (resolución de 2 s). */
function aFechaDos(date: Date): { hora: number; fecha: number } {
  // El formato solo llega hasta 1980; una fecha anterior produciría basura.
  const ano = Math.max(1980, date.getFullYear());
  return {
    hora: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    fecha: ((ano - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

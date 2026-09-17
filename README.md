# CalEcosystem

**Ecosistema interconectado de desarrollo web automatizado.**
De una descripcion de negocio en lenguaje natural a un proyecto completo:
arquitectura, frontend, backend, despliegue, seguridad, pruebas y documentacion.

```bash
npx calec generate "Marketplace de productos artesanales con pagos y valoraciones"
```

---

## El problema

Arrancar un producto web cuesta entre dos y seis semanas de trabajo que se
repite en cada proyecto: elegir stack, montar el esqueleto, configurar el
despliegue, escribir las primeras pruebas y documentar por que se hizo asi.
Ese trabajo no diferencia a nadie, pero consume el presupuesto justo cuando
el producto aun no ha validado nada.

Los generadores clasicos (`create-react-app`, `nest new`, plantillas de
empresa) resuelven un 10% de eso: dan un esqueleto vacio e identico para
todos. No leen los requisitos, no deciden nada, no explican sus decisiones y
no se enteran de lo que pasa despues.

## La propuesta

Cinco modulos que comparten un mismo modelo de datos y se comunican por un
bus de extension, en lugar de cinco herramientas que no se hablan.

| # | Modulo | Que hace | Estado v0.1 |
|---|--------|----------|-------------|
| 1 | **Generador de codigo base** | Analiza requisitos, decide la arquitectura y genera el proyecto | **Completo** |
| 2 | **Optimizador de rendimiento** | Detecta decisiones que no escalan, antes de escribirlas | Vista previa |
| 3 | **Auditor de seguridad** | Audita el codigo generado y el plan frente a fallos conocidos | Vista previa |
| 4 | **Testeador automatico** | Genera la bateria inicial y senala lo que queda sin cubrir | Vista previa |
| 5 | **Documentador inteligente** | Documenta decisiones, API e incorporacion al proyecto | Vista previa |

El valor no esta en cada modulo por separado: esta en que **el auditor sabe
que el generador eligio Stripe**, el testeador sabe que riesgos declaro el
arquitecto, y el documentador escribe sobre decisiones reales y no sobre
suposiciones. Ese contexto compartido es lo que ninguna combinacion de
herramientas sueltas puede replicar.

## Lo que hace hoy, sin adornos

Una ejecucion real sobre un enunciado de tres lineas:

```
$ calec generate "Plataforma de reservas para clinicas: los pacientes piden citas
  con los medicos, con login, roles, pagos online y panel de administracion"

Proyecto: Reservas Clinicas
Stack: react + node-fastify + postgres
Confianza del analisis: 92%
Ficheros generados: 71 (68.4 KB)
Tiempo: 41 ms

Informes de los modulos:
  [optimizer]  58/100  4 oportunidades de optimizacion detectadas
  [security]   36/100  4 hallazgos (2 bloqueantes para produccion)
  [tester]     11/100  8 ficheros de prueba generados; 1 zona de riesgo sin cubrir
  [documenter] 100/100 3 documentos generados
```

Las puntuaciones bajas **son el producto funcionando**: el proyecto recien
generado tiene autenticacion sin verificar y listados sin paginar, y el
ecosistema lo dice en voz alta en lugar de entregar un esqueleto con
apariencia de estar terminado.

### Lo que **no** hace todavia

Conviene decirlo antes de que lo descubra un cliente:

- El analisis de requisitos es **deterministico** (lexicos y reglas), no un
  modelo de lenguaje. Es reproducible y gratis, pero no entiende matices.
  El puerto para enchufar un LLM existe (`RequirementsEnricher`) y esta sin
  implementar.
- Los modulos 2-5 hacen **analisis estatico**: no ejecutan el proyecto, no
  miden tiempos reales ni escanean dependencias.
- El codigo generado es un **punto de partida correcto y sintacticamente
  valido**, no una aplicacion terminada. La autenticacion y la persistencia
  son esqueletos marcados como tales.

## Instalacion y uso

Requiere Node.js 22.18 o superior (usa el soporte nativo de TypeScript; no
hace falta compilar nada).

```bash
git clone <este-repositorio> && cd calecosystem
npm install
npm run verify        # typecheck + 105 pruebas

npm run calec -- plan "Panel interno para gestionar pedidos y clientes"
npm run calec -- generate --file requisitos.md --framework vue --out ./mi-proyecto
npm run calec -- modules
```

| Comando | Para que sirve |
|---------|----------------|
| `calec plan <texto>` | Muestra la arquitectura propuesta sin escribir nada |
| `calec generate <texto>` | Genera el proyecto completo |
| `calec modules` | Que plugins, modulos y adaptadores hay activos |

Opciones utiles: `--framework react\|vue\|angular`, `--database`,
`--deployment`, `--dry-run`, `--json`, `--out`.

## Como se usa desde codigo

```ts
import { createKernel } from '@calecosystem/core';
import { CodeGenerator, generatorPlugin } from '@calecosystem/generator';
import { securityPlugin } from '@calecosystem/security';

const kernel = await createKernel({ plugins: [generatorPlugin(), securityPlugin()] });
const result = await new CodeGenerator({ kernel }).generate({
  text: 'Tienda con productos, pedidos y clientes, con login y pagos',
});

console.log(result.blueprint.stack);   // decisiones de arquitectura
console.log(result.files.length);      // arbol de ficheros en memoria
console.log(result.reports);           // informes de cada modulo
```

Nada se escribe en disco hasta que se llama a `writeFileTree`. Esa separacion
es la que hace el sistema testeable y la que permite que un modulo revise el
proyecto **antes** de que exista.

## Arquitectura en una pagina

```
                       EcosystemKernel
         (plugins, hooks, entitlements, VFS)
                             |
   +--------+--------+-------+-------+--------+
   |        |        |       |       |        |
generador optimizador seguridad testeador documentador
   |
   +-- analyze  -> requirements:analyzed   (transformable)
   +-- plan     -> blueprint:planned       (transformable)
   +-- scaffold -> adaptadores react/vue/angular + node + docker
   +-- augment  -> los otros cuatro modulos aportan informes y ficheros
   +-- finalize -> files:finalized         (transformable)
```

Todo, incluido el generador, se carga como plugin. Si el modulo principal
necesitara un trato especial del kernel, el sistema de extension no serviria
para nadie mas.

Detalle completo en [`docs/architecture.md`](docs/architecture.md).
Puntos de extension en [`docs/hooks.md`](docs/hooks.md) y
[`docs/plugins.md`](docs/plugins.md).

## Modelo de negocio

Tres planes; el generador y la documentacion son gratuitos **a proposito**,
porque son la puerta de entrada y lo que demuestra que el sistema funciona.

| Plan | Precio orientativo | Incluye |
|------|--------------------|---------|
| **Community** | 0 € | Generador, documentador, 3 frameworks, CLI, uso comercial |
| **Pro** | 49 €/desarrollador/mes | + optimizador, auditor de seguridad, testeador, integracion CI |
| **Enterprise** | desde 1.500 €/mes | + SSO, plugins privados, on-premise, adaptadores a medida, SLA |

El control de plan (`Entitlements`) es **empaquetado de producto, no
seguridad**: quien tiene el codigo puede editarlo. Su funcion es que cada
instalacion declare de forma explicita y auditable que modulos tiene activos.

Desglose por componente, supuestos de unit economics y modelo del marketplace
de plugins en [`docs/pricing.md`](docs/pricing.md). Las cifras son un punto de
partida razonado, no un precio validado con clientes.

## Estructura del repositorio

```
packages/
  contracts/   Tipos e interfaces compartidos. Nadie depende de nadie mas.
  core/        Kernel: plugins, hooks, entitlements, ficheros virtuales.
  generator/   Modulo 1. Analisis, planificacion y scaffolding.
  optimizer/   Modulo 2.
  security/    Modulo 3.
  tester/      Modulo 4.
  documenter/  Modulo 5.
  cli/         Interfaz de linea de comandos.
docs/          Arquitectura, precios, extension y decisiones (ADR).
examples/      Demo ejecutable de extremo a extremo.
tests/         Pruebas de integracion del ecosistema completo.
```

## Licencia

El codigo de este repositorio es propietario (`UNLICENSED` en los paquetes).
El modelo de licencia definitivo —licencia dual con nucleo abierto para
`contracts` y `core`, o propietario completo— es una decision de negocio
pendiente y esta anotada como tal en `docs/pricing.md`. No se distribuye bajo
ninguna licencia de codigo abierto mientras tanto.

## Estado del proyecto

v0.1.0 — primer commit. 105 pruebas, sin dependencias de ejecucion.
Lo previsto para las siguientes versiones esta en
[`docs/roadmap.md`](docs/roadmap.md), separando lo comprometido de lo que
todavia es una hipotesis.

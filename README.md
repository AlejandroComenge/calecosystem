# CalEcosystem

**Ecosistema interconectado de desarrollo web automatizado.**
De una descripción de negocio en lenguaje natural a un proyecto completo:
arquitectura, frontend, backend, despliegue, seguridad, pruebas y documentación.

```bash
npx calec generate "Marketplace de productos artesanales con pagos y valoraciones"
```

---

## El problema

Arrancar un producto web cuesta entre dos y seis semanas de trabajo que se
repite en cada proyecto: elegir stack, montar el esqueleto, configurar el
despliegue, escribir las primeras pruebas y documentar por qué se hizo así.
Ese trabajo no diferencia a nadie, pero consume el presupuesto justo cuando
el producto aún no ha validado nada.

Los generadores clasicos (`create-react-app`, `nest new`, plantillas de
empresa) resuelven un 10% de eso: dan un esqueleto vacío e identico para
todos. No leen los requisitos, no deciden nada, no explican sus decisiones y
no se enteran de lo que pasa después.

## La propuesta

Cinco módulos que comparten un mismo modelo de datos y se comunican por un
bus de extensión, en lugar de cinco herramientas que no se hablan.

| # | Módulo | Qué hace | Estado v0.2 |
|---|--------|----------|-------------|
| 1 | **Generador de código base** | Analiza requisitos, decide la arquitectura, aplica plantillas de producto y genera el proyecto | **Completo** |
| 2 | **Optimizador de rendimiento** | Detecta decisiones que no escalan, antes de escribirlas | Vista previa |
| 3 | **Auditor de seguridad** | Audita el código generado y el plan frente a fallos conocidos | Vista previa |
| 4 | **Testeador automático** | Genera la batería inicial y señala lo que queda sin cubrir | Vista previa |
| 5 | **Documentador inteligente** | Documenta decisiones, API e incorporación al proyecto | Vista previa |

Además, dos piezas de producto: **cuotas por plan** (`@calecosystem/billing`,
con integración básica de Stripe) y **telemetría de uso**
(`@calecosystem/telemetry`).

El valor no está en cada módulo por separado: está en que **el auditor sabe
que el generador eligió Stripe**, el testeador sabe que riesgos declaro el
arquitecto, y el documentador escribe sobre decisiones reales y no sobre
suposiciones. Ese contexto compartido es lo que ninguna combinación de
herramientas sueltas puede replicar.

## Lo que hace hoy, sin adornos

Una ejecución real sobre un enunciado de cinco líneas (`npm run demo:ecommerce`):

```
Plantilla detectada: E-commerce (encaje 90%)

--- Metricas de generacion ---
  Tiempo total            32 ms
  Ficheros                117
  Lineas de código        3996
  Componentes de interfaz 26

--- Informes de los modulos ---
  [optimizer  ]  58/100  4 oportunidades de optimizacion detectadas
  [security   ]  36/100  4 hallazgos (2 bloqueantes para produccion)
  [tester     ]   7/100  9 ficheros de prueba generados
  [documenter ] 100/100  3 documentos generados
```

Las puntuaciones bajas **son el producto funcionando**: el proyecto recien
generado tiene autenticación sin verificar y listados sin paginar, y el
ecosistema lo dice en voz alta en lugar de entregar un esqueleto con
apariencia de estar terminado.

El caso completo, con reparto por fases y por áreas, está en
[`docs/case-study-ecommerce.md`](docs/case-study-ecommerce.md). Sus cifras
están verificadas por pruebas: si el producto cambia y dejan de ser ciertas,
la suite falla.

### Lo que **no** hace todavía

Conviene decirlo antes de que lo descubra un cliente:

- El análisis de requisitos es **deterministico** (lexicos y reglas), no un
  modelo de lenguaje. Es reproducible y gratis, pero no entiende matices.
  El puerto para enchufar un LLM existe (`RequirementsEnricher`) y está sin
  implementar.
- Los módulos 2-5 hacen **análisis estático**: no ejecutan el proyecto, no
  miden tiempos reales ni escanean dependencias.
- Las plantillas de producto solo generan para **React**. El eje está separado
  para que portarlas sea escribir el `scaffold`, pero hoy la limitación es real.
- La integración con Stripe cubre **sesión de pago y webhooks**, no prorrateos,
  impuestos ni portal del cliente.
- El contador de uso local es **manipulable por diseño** y está documentado
  como tal; la verdad de facturación vivira en el servidor.
- El código generado es un **punto de partida correcto y sintácticamente
  valido**, no una aplicación terminada. La autenticación y la persistencia
  son esqueletos marcados como tales.

## La aplicación web

```bash
npm run studio
```

Abre `http://localhost:3000` y ya está: escribes tu proyecto en español,
pulsas **Analizar** para ver las decisiones antes de generar nada, y
**Generar y descargar** para recibir el proyecto en un ZIP.

Es la forma de usar el ecosistema sin terminal, y por tanto la única que
puede ofrecerse a quien no programa. El servidor no tiene dependencias de
ejecución y la interfaz no tiene paso de compilación: son HTML, CSS y
JavaScript que el navegador carga tal cual.

| Ruta | Para qué |
|------|----------|
| `POST /api/plan` | Devuelve el blueprint: stack, entidades, decisiones y riesgos |
| `POST /api/generate` | Genera el proyecto y lo devuelve como ZIP (o JSON con `format`) |
| `GET /api/examples` | Catálogo de ejemplos |
| `GET /api/usage` | Consumo y límites del plan |
| `GET /api/health` | Sonda de salud |

Lo que **no** incluye todavía, y está declarado: no hay cuentas de usuario
reales (el identificador viaja en una cabecera y cualquiera puede falsearlo),
el consumo se guarda en memoria y se pierde al reiniciar, y no hay límite de
peticiones por IP. Sirve para una demo y para uso local; no para exponerlo a
internet y cobrar.

## Instalación y uso

Requiere Node.js 22.18 o superior (usa el soporte nativo de TypeScript; no
hace falta compilar nada).

> **¿Primera vez?** Empieza por [`EMPEZAR.md`](EMPEZAR.md): guía de 5 minutos
> escrita para alguien que no programa, con comandos para copiar y pegar.

```bash
git clone <este-repositorio> && cd calecosystem
npm install
npm run verify        # typecheck + 247 pruebas
npm run validate      # comprueba que el código GENERADO es válido
npm run demo:comercial # demostracion para enseñar a un cliente

npm run calec -- examples                  # 8 ejemplos listos para copiar
npm run calec -- plan "Panel interno para gestionar pedidos y clientes"
npm run calec -- generate --file requisitos.md --framework vue --out ./mi-proyecto
npm run calec -- modules
```

| Comando | Para que sirve |
|---------|----------------|
| `calec examples [id]` | Ejemplos listos para copiar y pegar |
| `calec plan <texto>` | Muestra la arquitectura propuesta sin escribir nada |
| `calec generate <texto>` | Genera el proyecto completo |
| `calec templates [texto]` | Plantillas disponibles y su encaje con un enunciado |
| `calec modules` | Plugins, módulos, adaptadores y middlewares activos |
| `calec usage --user <id>` | Consumo del período y límites del plan |
| `calec upgrade --tier pro` | Qué incluye el plan y como cambiarse |

Opciones útiles: `--framework react\|vue\|angular`, `--database`,
`--deployment docker-compose\|vercel\|netlify`, `--user`, `--dry-run`,
`--json`, `--out`.

### Plantillas de producto

El generador detecta que tipo de producto describe el enunciado y completa lo
que ese tipo **siempre** necesita y nadie menciona:

| Plantilla | Se activa con | Añade |
|-----------|---------------|-------|
| **E-commerce** | tienda, carrito, checkout, catálogo | Carrito con persistencia, proceso de compra con precios recalculados en servidor, panel de pedidos |
| **SaaS** | suscripción, multiempresa, organizaciones, planes | Organizaciones, planes, aislamiento por inquilino, panel y facturación |
| **Landing** | captación, leads, formulario de contacto | Secciones de venta, formulario con campo trampa, metadatos para buscadores |

La detección es puntuada y tiene contra-señales: una landing no dispara la
plantilla de tienda porque mencione "producto".

## Cómo se usa desde código

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
console.log(result.template);          // plantilla aplicada y su encaje
console.log(result.metrics.lineCount); // lineas generadas
```

Con cuotas por plan, basta añadir el plugin de facturación y un `principal`:

```ts
const result = await generator.generate(
  { text: '...' },
  { principal: { userId: 'ana', tier: 'community' } },
);
```

Nada se escribe en disco hasta que se llama a `writeFileTree`. Esa separación
es la que hace el sistema testeable y la que permite que un módulo revise el
proyecto **antes** de que exista.

## Arquitectura en una página

```
                        EcosystemKernel
     (plugins, hooks, middlewares, entitlements, VFS)
                             |
   +--------+--------+-------+-------+--------+--------+
   |        |        |       |       |        |        |
generador optimizador seguridad testeador documentador billing
   |
   [middlewares]  -> cuotas por plan, telemetria  (envuelven todo)
   |
   +-- analyze  -> requirements:analyzed   (transformable)
   +-- plan     -> blueprint:planned       (transformable)
   |              + plantilla de producto (e-commerce / SaaS / landing)
   +-- scaffold -> adaptadores react/vue/angular + node
   |              + catalogo de componentes + docker/vercel/netlify
   |              + package.json deducido de las capacidades detectadas
   +-- augment  -> los otros cuatro modulos aportan informes y ficheros
   +-- finalize -> files:finalized         (transformable)
```

Todo, incluido el generador, se carga como plugin. Si el módulo principal
necesitara un trato especial del kernel, el sistema de extensión no serviría
para nadie más.

Detalle completo en [`docs/architecture.md`](docs/architecture.md).
Puntos de extensión en [`docs/hooks.md`](docs/hooks.md) y
[`docs/plugins.md`](docs/plugins.md).

## Modelo de negocio

Tres planes; el generador y la documentación son gratuitos **a propósito**,
porque son la puerta de entrada y lo que demuestra que el sistema funciona.

| Plan | Precio orientativo | Incluye |
|------|--------------------|---------|
| **Community** | 0 € | Generador, documentador, 3 frameworks, CLI, uso comercial |
| **Pro** | 49 €/desarrollador/mes | + optimizador, auditor de seguridad, testeador, integración CI |
| **Enterprise** | desde 1.500 €/mes | + SSO, plugins privados, on-premise, adaptadores a medida, SLA |

El control de plan (`Entitlements`) es **empaquetado de producto, no
seguridad**: quien tiene el código puede editarlo. Su función es que cada
instalación declare de forma explicita y auditable que módulos tiene activos.

Desglose por componente, supuestos de unit economics y modelo del marketplace
de plugins en [`docs/pricing.md`](docs/pricing.md). Las cifras son un punto de
partida razonado, no un precio validado con clientes.

## Estructura del repositorio

```
packages/
  contracts/   Tipos e interfaces compartidos. Nadie depende de nadie mas.
  core/        Kernel: plugins, hooks, middlewares, entitlements, VFS.
  generator/   Modulo 1. Analisis, planificacion, componentes y plantillas.
  optimizer/   Modulo 2.
  security/    Modulo 3.
  tester/      Modulo 4.
  documenter/  Modulo 5.
  billing/     Cuotas por plan, contador de uso y Stripe.
  telemetry/   Registro estructurado de uso.
  cli/         Interfaz de linea de comandos.
docs/          Arquitectura, pruebas, precios, venta y decisiones (ADR).
examples/      Catalogo de ejemplos y demos ejecutables.
scripts/       Validador de la salida generada.
tests/         Pruebas de integracion del ecosistema completo.
```

| Documento | Para quien |
|-----------|-----------|
| [`EMPEZAR.md`](EMPEZAR.md) | Alguien que no programa y quiere probarlo |
| [`docs/PRUEBAS.md`](docs/PRUEBAS.md) | Quien necesita verificar que funciona |
| [`docs/demo-comercial.md`](docs/demo-comercial.md) | Quien va a enseñarlo a un cliente |
| [`docs/case-study-ecommerce.md`](docs/case-study-ecommerce.md) | Quien quiere las cifras del caso real |
| [`docs/architecture.md`](docs/architecture.md) | Quien va a tocar el código |
```

## Licencia

El código de este repositorio es propietario (`UNLICENSED` en los paquetes).
El modelo de licencia definitivo —licencia dual con nucleo abierto para
`contracts` y `core`, o propietario completo— es una decision de negocio
pendiente y está anotada como tal en `docs/pricing.md`. No se distribuye bajo
ninguna licencia de código abierto mientras tanto.

## Cómo se verifica

Dos capas que responden preguntas distintas. Confundirlas es el error tipico
al evaluar un generador de código:

| | `npm test` | `npm run validate` |
|---|---|---|
| Verifica | Qué el **generador** funciona | Qué el **código generado** es válido |
| Alcance | 289 pruebas | 8 ejemplos completos |
| Incluye | Analisis, planificacion, plantillas, cuotas, Stripe, integracion | Sintaxis de todo el TS, JSON, YAML, y **ejecuta las pruebas que el generador entrega** |

Ultima ejecucion de `npm run validate`:

```
8 ejemplos | 663 ficheros | 20194 líneas | 505 TS sin errores de sintaxis
          | 54 pruebas generadas en verde

TODO CORRECTO: la salida del generador es válida en todos los ejemplos.
```

Un generador puede pasar sus propias pruebas y producir código que no compila.
Por eso existen las dos capas. Guia completa en [`docs/PRUEBAS.md`](docs/PRUEBAS.md).

## Para enseñarlo a un cliente

Pagina de demostracion lista para enviar:
**https://claude.ai/artifact/GmgDzFTqHzQzuQyMrWFLha**

```bash
npm run demo:comercial          # 8 pasos, ~30 segundos
npm run demo:comercial -- --caso saas
```

El guion, los beneficios con sus supuestos económicos y los argumentos por
plan están en [`docs/demo-comercial.md`](docs/demo-comercial.md). El paso 7 de
la demo enseña a propósito **lo que el sistema no hace**: una demo que solo
enseña lo bueno gana la reunión y pierde al cliente tres semanas después.

## Estado del proyecto

v0.3.0 — 289 pruebas + validación de salida, sin dependencias de ejecución.
Lo previsto para las siguientes versiones está en
[`docs/roadmap.md`](docs/roadmap.md), separando lo comprometido de lo que
todavía es una hipotesis.

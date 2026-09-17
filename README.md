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

| # | Modulo | Que hace | Estado v0.2 |
|---|--------|----------|-------------|
| 1 | **Generador de codigo base** | Analiza requisitos, decide la arquitectura, aplica plantillas de producto y genera el proyecto | **Completo** |
| 2 | **Optimizador de rendimiento** | Detecta decisiones que no escalan, antes de escribirlas | Vista previa |
| 3 | **Auditor de seguridad** | Audita el codigo generado y el plan frente a fallos conocidos | Vista previa |
| 4 | **Testeador automatico** | Genera la bateria inicial y senala lo que queda sin cubrir | Vista previa |
| 5 | **Documentador inteligente** | Documenta decisiones, API e incorporacion al proyecto | Vista previa |

Ademas, dos piezas de producto: **cuotas por plan** (`@calecosystem/billing`,
con integracion basica de Stripe) y **telemetria de uso**
(`@calecosystem/telemetry`).

El valor no esta en cada modulo por separado: esta en que **el auditor sabe
que el generador eligio Stripe**, el testeador sabe que riesgos declaro el
arquitecto, y el documentador escribe sobre decisiones reales y no sobre
suposiciones. Ese contexto compartido es lo que ninguna combinacion de
herramientas sueltas puede replicar.

## Lo que hace hoy, sin adornos

Una ejecucion real sobre un enunciado de cinco lineas (`npm run demo:ecommerce`):

```
Plantilla detectada: E-commerce (encaje 90%)

--- Metricas de generacion ---
  Tiempo total            32 ms
  Ficheros                117
  Lineas de codigo        3996
  Componentes de interfaz 26

--- Informes de los modulos ---
  [optimizer  ]  58/100  4 oportunidades de optimizacion detectadas
  [security   ]  36/100  4 hallazgos (2 bloqueantes para produccion)
  [tester     ]   7/100  9 ficheros de prueba generados
  [documenter ] 100/100  3 documentos generados
```

Las puntuaciones bajas **son el producto funcionando**: el proyecto recien
generado tiene autenticacion sin verificar y listados sin paginar, y el
ecosistema lo dice en voz alta en lugar de entregar un esqueleto con
apariencia de estar terminado.

El caso completo, con reparto por fases y por areas, esta en
[`docs/case-study-ecommerce.md`](docs/case-study-ecommerce.md). Sus cifras
estan verificadas por pruebas: si el producto cambia y dejan de ser ciertas,
la suite falla.

### Lo que **no** hace todavia

Conviene decirlo antes de que lo descubra un cliente:

- El analisis de requisitos es **deterministico** (lexicos y reglas), no un
  modelo de lenguaje. Es reproducible y gratis, pero no entiende matices.
  El puerto para enchufar un LLM existe (`RequirementsEnricher`) y esta sin
  implementar.
- Los modulos 2-5 hacen **analisis estatico**: no ejecutan el proyecto, no
  miden tiempos reales ni escanean dependencias.
- Las plantillas de producto solo generan para **React**. El eje esta separado
  para que portarlas sea escribir el `scaffold`, pero hoy la limitacion es real.
- La integracion con Stripe cubre **sesion de pago y webhooks**, no prorrateos,
  impuestos ni portal del cliente.
- El contador de uso local es **manipulable por diseno** y esta documentado
  como tal; la verdad de facturacion vivira en el servidor.
- El codigo generado es un **punto de partida correcto y sintacticamente
  valido**, no una aplicacion terminada. La autenticacion y la persistencia
  son esqueletos marcados como tales.

## Instalacion y uso

Requiere Node.js 22.18 o superior (usa el soporte nativo de TypeScript; no
hace falta compilar nada).

```bash
git clone <este-repositorio> && cd calecosystem
npm install
npm run verify        # typecheck + 199 pruebas

npm run calec -- plan "Panel interno para gestionar pedidos y clientes"
npm run calec -- generate --file requisitos.md --framework vue --out ./mi-proyecto
npm run calec -- modules
```

| Comando | Para que sirve |
|---------|----------------|
| `calec plan <texto>` | Muestra la arquitectura propuesta sin escribir nada |
| `calec generate <texto>` | Genera el proyecto completo |
| `calec templates [texto]` | Plantillas disponibles y su encaje con un enunciado |
| `calec modules` | Plugins, modulos, adaptadores y middlewares activos |
| `calec usage --user <id>` | Consumo del periodo y limites del plan |
| `calec upgrade --tier pro` | Que incluye el plan y como cambiarse |

Opciones utiles: `--framework react\|vue\|angular`, `--database`,
`--deployment docker-compose\|vercel\|netlify`, `--user`, `--dry-run`,
`--json`, `--out`.

### Plantillas de producto

El generador detecta que tipo de producto describe el enunciado y completa lo
que ese tipo **siempre** necesita y nadie menciona:

| Plantilla | Se activa con | Anade |
|-----------|---------------|-------|
| **E-commerce** | tienda, carrito, checkout, catalogo | Carrito con persistencia, proceso de compra con precios recalculados en servidor, panel de pedidos |
| **SaaS** | suscripcion, multiempresa, organizaciones, planes | Organizaciones, planes, aislamiento por inquilino, panel y facturacion |
| **Landing** | captacion, leads, formulario de contacto | Secciones de venta, formulario con campo trampa, metadatos para buscadores |

La deteccion es puntuada y tiene contra-senales: una landing no dispara la
plantilla de tienda porque mencione "producto".

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
console.log(result.template);          // plantilla aplicada y su encaje
console.log(result.metrics.lineCount); // lineas generadas
```

Con cuotas por plan, basta anadir el plugin de facturacion y un `principal`:

```ts
const result = await generator.generate(
  { text: '...' },
  { principal: { userId: 'ana', tier: 'community' } },
);
```

Nada se escribe en disco hasta que se llama a `writeFileTree`. Esa separacion
es la que hace el sistema testeable y la que permite que un modulo revise el
proyecto **antes** de que exista.

## Arquitectura en una pagina

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
  core/        Kernel: plugins, hooks, middlewares, entitlements, VFS.
  generator/   Modulo 1. Analisis, planificacion, componentes y plantillas.
  optimizer/   Modulo 2.
  security/    Modulo 3.
  tester/      Modulo 4.
  documenter/  Modulo 5.
  billing/     Cuotas por plan, contador de uso y Stripe.
  telemetry/   Registro estructurado de uso.
  cli/         Interfaz de linea de comandos.
docs/          Arquitectura, precios, limites, extension y decisiones (ADR).
examples/      Demos ejecutables, incluido el caso de uso e-commerce.
tests/         Pruebas de integracion del ecosistema completo.
```

## Licencia

El codigo de este repositorio es propietario (`UNLICENSED` en los paquetes).
El modelo de licencia definitivo —licencia dual con nucleo abierto para
`contracts` y `core`, o propietario completo— es una decision de negocio
pendiente y esta anotada como tal en `docs/pricing.md`. No se distribuye bajo
ninguna licencia de codigo abierto mientras tanto.

## Estado del proyecto

v0.2.0 — 199 pruebas, sin dependencias de ejecucion.
Lo previsto para las siguientes versiones esta en
[`docs/roadmap.md`](docs/roadmap.md), separando lo comprometido de lo que
todavia es una hipotesis.

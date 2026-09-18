# Arquitectura del ecosistema

> Este documento explica **por qué** el sistema está hecho así. Lo que hace
> cada pieza se lee mejor en el código; lo que no se puede deducir del código
> son las alternativas descartadas, y eso es lo que hay aquí.

## 1. La decisión que condiciona todas las demas

Un ecosistema de cinco herramientas puede construirse de tres formas:

1. **Monolito con cinco funciones.** Rápido de escribir, imposible de vender
   por partes y con los cinco equipos pisandose en el mismo fichero.
2. **Cinco productos independientes** que se comunican por ficheros o por API.
   Se venden bien por separado, pero cada uno tiene que volver a deducir el
   contexto: el auditor no sabe que el generador eligió Stripe, y acaba
   pidiendo al usuario lo que el sistema ya sabía.
3. **Un kernel mínimo con cinco módulos enchufables** que comparten modelo de
   datos y se comunican por un bus de extensión.

Elegimos la tercera. El contexto compartido es la única ventaja real frente a
juntar cinco herramientas de mercado, y es lo que la opción 2 destruye.

El coste de esa elección es real y conviene reconocerlo: hay una capa de
indirección (kernel, hooks, adaptadores) que un monolito no necesitaria. Se
paga a cambio de poder publicar, versionar y facturar cada módulo por
separado, y de que un tercero pueda extender el sistema sin tocar el nucleo.

## 2. Mapa de paquetes

```
contracts  <-- no depende de nadie
    ^
    |
  core     <-- kernel: plugins, hooks, entitlements, VFS
    ^
    |
  +-+--------+-----------+---------+------------+
  |          |           |         |            |
generator optimizer  security   tester    documenter
  ^          ^           ^         ^            ^
  |          |           |         |            |
  +----------+-----+-----+---------+------------+
                   |
                  cli
```

Regla: **las dependencias solo apuntan hacía abajo**. Ningún módulo importa a
otro módulo. Si el auditor necesitara algo del generador, sería señal de que
ese algo pertenece a `contracts`.

| Paquete | Responsabilidad |
|---------|-----------------|
| `contracts` | Tipos, interfaces y funciones puras. Sin lógica de negocio. |
| `core` | Kernel de plugins, bus de hooks, cadena de middlewares, entitlements, ficheros virtuales, registro de dependencias. |
| `generator` | Análisis, planificación, scaffolding, catálogo de componentes y plantillas de producto. |
| `optimizer` / `security` / `tester` / `documenter` | Un módulo cada uno. |
| `billing` | Cuotas por plan, contador de consumo y pasarela de pago. |
| `telemetry` | Registro estructurado de uso a partir de los hooks. |
| `cli` | Interpretación de argumentos y presentación. |

## 3. Dos superficies de extensión, no una

Es la distinción que más confusión evita al escribir un plugin:

| | Hooks | Middlewares |
|---|---|---|
| Alcance | Dentro del pipeline | Alrededor de la ejecución entera |
| Puede cancelar | No (los eventos) | Si, no llamando a `next` |
| Ve el resultado final | Solo `generation:completed` | Si, como valor de retorno |
| Casos típicos | Ajustar el blueprint, añadir ficheros | Cuotas, autorización, medición extremo a extremo |

Las cuotas son middleware por una razón concreta: tienen que decir "no" antes
de que se analice una sola palabra. Hacerlo con un hook habría exigido que un
evento pudiera abortar el pipeline, rompiendo la garantía de que un evento
observa y no interfiere. Ver `adr/0004-limites-de-uso.md`.

## 4. El pipeline de generación

Cinco fases. Cada una pública sus puntos de extensión.

```
  entrada: texto en lenguaje natural
      |
  [analyze]   RequirementsAnalyzer      -> RequirementsModel
      |                                    hook: requirements:analyzed
  [plan]      ArchitecturePlanner       -> Blueprint
      |                                    hooks: deployment:planned, blueprint:planned
  [scaffold]  Scaffolder + adaptadores  -> FileTree (en memoria)
      |
  [augment]   los otros cuatro modulos  -> ModuleReport[] + ficheros extra
      |
  [finalize]                            -> GenerationResult
                                           hooks: files:finalized, generation:completed
      |
  writeFileTree()  <- unico punto que toca el disco
```

### Plantillas: que se genera, no como

Un adaptador sabe escribir React; una plantilla sabe como es una tienda. Son
ejes distintos y por eso son contratos distintos. Una plantilla interviene en
`refine` (completa el blueprint) y en `scaffold` (aporta sus pantallas).

Como `refine` opera sobre el blueprint, lo que añade la plantilla pasa por el
auditor, el optimizador y el testeador igual que todo lo demas. El caso
concreto que lo demuestra: la plantilla de e-commerce añade el riesgo
`RISK-STOCK-RACE`, y el testeador, que no sabe nada de tiendas, emite un
hallazgo porque ese riesgo no tiene prueba. Ver `adr/0005-plantillas-de-producto.md`.

### Dependencias declaradas, no escritas

Antes cada adaptador escribia su propio `package.json`. Eso se rompe en cuánto
una plantilla necesita añadir un paquete: dos productores pelean por el mismo
fichero.

Ahora cada productor **declara** (`dependencies.require(...)`) y el generador
construye un único manifiesto por workspace. Efectos:

- el `package.json` puede explicar **por qué** está cada dependencia;
- las capacidades detectadas se traducen en paquetes sin que nadie los
  escriba: pagos añade `stripe`, autenticación añade `argon2` y limitación de
  intentos;
- dos versiones incompatibles del mismo paquete se registran como conflicto y
  llegan al usuario como aviso, en lugar de que una pise a la otra en silencio.

### Por qué separar `plan` de `scaffold`

Es la decisión de diseño con más consecuencias prácticas. Decidir es barato de
deshacer; escribir 70 ficheros no lo es. Al existir un `Blueprint` explicito
antes de generar nada:

- el optimizador puede cambiar el motor de datos sin que nadie regenere nada;
- el auditor puede vetar una decisión antes de que se materialice;
- el documentador escribe sobre decisiones reales, con sus alternativas;
- los tests comprueban la arquitectura sin ejecutar el scaffolding.

### Por qué generar contra memoria y no contra disco

`FileTree` es un árbol de ficheros en memoria con rutas normalizadas. Nada se
escribe hasta que el árbol completo existe y los cinco módulos han opinado.
Consecuencias:

- **Testeabilidad.** Las pruebas del repositorio no escriben un solo
  fichero temporal.
- **Atomicidad.** Un fallo en la fase `augment` no deja medio proyecto escrito.
- **Revisión previa.** El auditor examina el proyecto entero antes de que
  exista, que es el único momento en que corregirlo es gratis.

`FileTree` también rechaza rutas absolutas y cualquier `..`: un generador que
escribe fuera de su directorio de destino es un fallo de seguridad, no un
detalle de comodidad.

## 5. El sistema de hooks

Dos familias, deliberadamente separadas:

- **Eventos** (`onEvent`): observan. Un handler que falla se registra y el
  pipeline continua. Un plugin de telemetría roto no puede impedir que un
  equipo reciba su proyecto.
- **Transformaciones** (`onTransform`): cada handler recibe el valor que
  devolvio el anterior. Un handler que falla **si** detiene el pipeline,
  porque seguir con un blueprint corrupto es peor que no entregar nada.

Mantenerlas separadas evita el fallo clasico de los sistemas de hooks:
handlers que mutan por accidente un payload que otros esperaban intacto.

El orden es determinista: `priority` y, a igualdad, orden de registro. Sin eso
dos ejecuciones identicas producirian proyectos distintos.

Catálogo completo en [`hooks.md`](hooks.md).

## 6. Adaptadores y componentes

`Scaffolder` no sabe escribir React, Fastify ni Docker. Resuelve el adaptador
registrado para lo que el blueprint pidio y le delega. Añadir Svelte es
escribir un `FrontendAdapter` y registrarlo desde un plugin; `scaffolder.ts`
no cambia.

```ts
api.registerFrontendAdapter({
  id: 'acme.frontend.svelte',
  displayName: 'Svelte 5',
  framework: 'svelte',
  tier: 'community',
  scaffold: ({ blueprint }) => [/* VirtualFile[] */],
});
```

Esto es lo que convierte el catálogo de frameworks en una superficie
comercial: los tres soportados son la base gratuita, y los adaptadores
específicos de cliente (design system propio, plantilla corporativa) son
entregables facturables que no requieren tocar el producto.

**Los componentes son datos, no cadenas de texto.** Una `ComponentSpec`
describe nombre, props tipadas y cuerpo; un `ComponentRenderer` la traduce a
un framework. El catálogo se escribe una vez y añadir Vue sería escribir otro
renderizador, no otro catálogo. Hoy solo existe el de React, y está declarado
como limitación en lugar de fingirse.

## 7. Entitlements y cuotas

`Entitlements` decide que plugins y módulos se activan según el plan
contratado. Es **empaquetado de producto, no una frontera de seguridad**:
quien tiene el código puede editarlo, y pretender lo contrario sería
engañarse.

Su valor es operativo: en cualquier instalación se puede responder con
certeza que módulos están activos y por qué. Por defecto, un plugin por
encima del plan se omite con un aviso en lugar de abortar: una instalación
Community debe seguir generando proyectos aunque la configuración mencione
módulos de pago. Con `strictEntitlements: true` el comportamiento se invierte,
que es lo que quiere una instalación corporativa con configuración controlada.

Las **cuotas** son el segundo eje: `Entitlements` decide **que se carga**,
`QuotaGuard` decide **cuánto se puede usar**. Detalle completo en
[`usage-limits.md`](usage-limits.md).

## 8. El analizador de requisitos

Es deterministico: lexicos en español e inglés, detección por palabra
completa y reglas de implicación (quien cobra necesita saber a quien cobra,
luego pagos implica autenticación).

La alternativa evidente era llamar a un modelo de lenguaje. No se hizo en la
v0.1 por tres razones concretas:

1. **Reproducibilidad.** El mismo enunciado debe dar la misma arquitectura.
   Una prueba del repositorio lo verifica.
2. **Coste marginal cero.** El plan gratuito no puede tener coste por uso.
3. **Explicabilidad.** Se puede señalar la regla que produjo cada decisión.

El puerto para hacerlo está definido y probado (`RequirementsEnricher`): un
plugin puede refinar el análisis con un LLM, y si la llamada falla el sistema
conserva el resultado deterministico. Esa es la forma correcta de introducir
un modelo: como mejora opcional, no como dependencia crítica.

Cuando el texto no da para decidir, el analizador **no inventa**: baja
`confidence` y deja las dudas en `openQuestions`, que acaban en el README del
proyecto generado. Es lo que haría un consultor antes de dibujar nada.

## 9. Decisiones técnicas del repositorio

| Decisión | Motivo | Coste asumido |
|----------|--------|---------------|
| TypeScript nativo de Node 22 | Sin build en desarrollo; `git clone && npm test` funciona | Obliga a sintaxis borrable: sin `enum`, sin propiedades de parámetro |
| Cero dependencias de ejecución | Superficie de ataque y de mantenimiento mínimas en una herramienta que genera código ajeno | Utilidades escritas a mano (logger, texto) |
| `node:test` como runner | Incluido en la plataforma; nada que actualizar | Menos ecosistema que Vitest |
| npm workspaces | Publicación independiente por paquete con una sola instalación | Resolución algo más lenta que pnpm |
| `exports` apuntando a `src/*.ts` | Desarrollo sin paso de compilación | Publicar en npm exigira añadir un build; ver `roadmap.md` |

## 10. Límites conocidos

Documentados para que nadie los descubra en producción:

- **Sin build de publicación.** Los paquetes apuntan a `src/`. Para publicar
  en npm hace falta emitir `dist/` y tipos. Es la primera tarea de la v0.2.
- **`augment` es secuencial.** Con cuatro módulos rápidos no importa; con
  módulos que llamen a servicios externos hará falta paralelismo por fases.
- **Sin cache entre ejecuciones.** Cada generación analiza desde cero. Es
  irrelevante a 40 ms y dejara de serlo en cuánto entre un LLM.
- **Un solo módulo por tipo en la práctica.** El kernel admite varios, pero no
  hay estrategia de resolución de conflictos entre dos optimizadores.
- **Componentes y plantillas solo para React.** El diseño separa los ejes para
  que portarlos sea barato, pero el trabajo está sin hacer.
- **El contador de uso es local.** Manipulable por diseño; la verdad de
  facturación vivira en el servidor.
- **La resolución de versiones es "gana la primera".** No se comparan rangos
  semver; los choques se avisan pero no se resuelven.

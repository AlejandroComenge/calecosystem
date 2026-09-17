# Arquitectura del ecosistema

> Este documento explica **por que** el sistema esta hecho asi. Lo que hace
> cada pieza se lee mejor en el codigo; lo que no se puede deducir del codigo
> son las alternativas descartadas, y eso es lo que hay aqui.

## 1. La decision que condiciona todas las demas

Un ecosistema de cinco herramientas puede construirse de tres formas:

1. **Monolito con cinco funciones.** Rapido de escribir, imposible de vender
   por partes y con los cinco equipos pisandose en el mismo fichero.
2. **Cinco productos independientes** que se comunican por ficheros o por API.
   Se venden bien por separado, pero cada uno tiene que volver a deducir el
   contexto: el auditor no sabe que el generador eligio Stripe, y acaba
   pidiendo al usuario lo que el sistema ya sabia.
3. **Un kernel minimo con cinco modulos enchufables** que comparten modelo de
   datos y se comunican por un bus de extension.

Elegimos la tercera. El contexto compartido es la unica ventaja real frente a
juntar cinco herramientas de mercado, y es lo que la opcion 2 destruye.

El coste de esa eleccion es real y conviene reconocerlo: hay una capa de
indireccion (kernel, hooks, adaptadores) que un monolito no necesitaria. Se
paga a cambio de poder publicar, versionar y facturar cada modulo por
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

Regla: **las dependencias solo apuntan hacia abajo**. Ningun modulo importa a
otro modulo. Si el auditor necesitara algo del generador, seria senal de que
ese algo pertenece a `contracts`.

| Paquete | Responsabilidad | Lineas aprox. |
|---------|-----------------|---------------|
| `contracts` | Tipos, interfaces y funciones puras. Sin logica de negocio. | ~700 |
| `core` | Kernel de plugins, bus de hooks, entitlements, ficheros virtuales. | ~900 |
| `generator` | Analisis de requisitos, planificacion y scaffolding. | ~1.900 |
| `optimizer` / `security` / `tester` / `documenter` | Un modulo cada uno. | ~200 c/u |
| `cli` | Interpretacion de argumentos y presentacion. | ~400 |

## 3. El pipeline de generacion

Cinco fases. Cada una publica sus puntos de extension.

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

### Por que separar `plan` de `scaffold`

Es la decision de diseno con mas consecuencias practicas. Decidir es barato de
deshacer; escribir 70 ficheros no lo es. Al existir un `Blueprint` explicito
antes de generar nada:

- el optimizador puede cambiar el motor de datos sin que nadie regenere nada;
- el auditor puede vetar una decision antes de que se materialice;
- el documentador escribe sobre decisiones reales, con sus alternativas;
- los tests comprueban la arquitectura sin ejecutar el scaffolding.

### Por que generar contra memoria y no contra disco

`FileTree` es un arbol de ficheros en memoria con rutas normalizadas. Nada se
escribe hasta que el arbol completo existe y los cinco modulos han opinado.
Consecuencias:

- **Testeabilidad.** Las pruebas del repositorio no escriben un solo
  fichero temporal.
- **Atomicidad.** Un fallo en la fase `augment` no deja medio proyecto escrito.
- **Revision previa.** El auditor examina el proyecto entero antes de que
  exista, que es el unico momento en que corregirlo es gratis.

`FileTree` tambien rechaza rutas absolutas y cualquier `..`: un generador que
escribe fuera de su directorio de destino es un fallo de seguridad, no un
detalle de comodidad.

## 4. El sistema de hooks

Dos familias, deliberadamente separadas:

- **Eventos** (`onEvent`): observan. Un handler que falla se registra y el
  pipeline continua. Un plugin de telemetria roto no puede impedir que un
  equipo reciba su proyecto.
- **Transformaciones** (`onTransform`): cada handler recibe el valor que
  devolvio el anterior. Un handler que falla **si** detiene el pipeline,
  porque seguir con un blueprint corrupto es peor que no entregar nada.

Mantenerlas separadas evita el fallo clasico de los sistemas de hooks:
handlers que mutan por accidente un payload que otros esperaban intacto.

El orden es determinista: `priority` y, a igualdad, orden de registro. Sin eso
dos ejecuciones identicas producirian proyectos distintos.

Catalogo completo en [`hooks.md`](hooks.md).

## 5. Adaptadores: como se anaden frameworks

`Scaffolder` no sabe escribir React, Fastify ni Docker. Resuelve el adaptador
registrado para lo que el blueprint pidio y le delega. Anadir Svelte es
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

Esto es lo que convierte el catalogo de frameworks en una superficie
comercial: los tres soportados son la base gratuita, y los adaptadores
especificos de cliente (design system propio, plantilla corporativa) son
entregables facturables que no requieren tocar el producto.

## 6. Entitlements

`Entitlements` decide que plugins y modulos se activan segun el plan
contratado. Es **empaquetado de producto, no una frontera de seguridad**:
quien tiene el codigo puede editarlo, y pretender lo contrario seria
enganarse.

Su valor es operativo: en cualquier instalacion se puede responder con
certeza que modulos estan activos y por que. Por defecto, un plugin por
encima del plan se omite con un aviso en lugar de abortar: una instalacion
Community debe seguir generando proyectos aunque la configuracion mencione
modulos de pago. Con `strictEntitlements: true` el comportamiento se invierte,
que es lo que quiere una instalacion corporativa con configuracion controlada.

## 7. El analizador de requisitos

Es deterministico: lexicos en espanol e ingles, deteccion por palabra
completa y reglas de implicacion (quien cobra necesita saber a quien cobra,
luego pagos implica autenticacion).

La alternativa evidente era llamar a un modelo de lenguaje. No se hizo en la
v0.1 por tres razones concretas:

1. **Reproducibilidad.** El mismo enunciado debe dar la misma arquitectura.
   Una prueba del repositorio lo verifica.
2. **Coste marginal cero.** El plan gratuito no puede tener coste por uso.
3. **Explicabilidad.** Se puede senalar la regla que produjo cada decision.

El puerto para hacerlo esta definido y probado (`RequirementsEnricher`): un
plugin puede refinar el analisis con un LLM, y si la llamada falla el sistema
conserva el resultado deterministico. Esa es la forma correcta de introducir
un modelo: como mejora opcional, no como dependencia critica.

Cuando el texto no da para decidir, el analizador **no inventa**: baja
`confidence` y deja las dudas en `openQuestions`, que acaban en el README del
proyecto generado. Es lo que haria un consultor antes de dibujar nada.

## 8. Decisiones tecnicas del repositorio

| Decision | Motivo | Coste asumido |
|----------|--------|---------------|
| TypeScript nativo de Node 22 | Sin build en desarrollo; `git clone && npm test` funciona | Obliga a sintaxis borrable: sin `enum`, sin propiedades de parametro |
| Cero dependencias de ejecucion | Superficie de ataque y de mantenimiento minimas en una herramienta que genera codigo ajeno | Utilidades escritas a mano (logger, texto) |
| `node:test` como runner | Incluido en la plataforma; nada que actualizar | Menos ecosistema que Vitest |
| npm workspaces | Publicacion independiente por paquete con una sola instalacion | Resolucion algo mas lenta que pnpm |
| `exports` apuntando a `src/*.ts` | Desarrollo sin paso de compilacion | Publicar en npm exigira anadir un build; ver `roadmap.md` |

## 9. Limites conocidos

Documentados para que nadie los descubra en produccion:

- **Sin build de publicacion.** Los paquetes apuntan a `src/`. Para publicar
  en npm hace falta emitir `dist/` y tipos. Es la primera tarea de la v0.2.
- **`augment` es secuencial.** Con cuatro modulos rapidos no importa; con
  modulos que llamen a servicios externos hara falta paralelismo por fases.
- **Sin cache entre ejecuciones.** Cada generacion analiza desde cero. Es
  irrelevante a 40 ms y dejara de serlo en cuanto entre un LLM.
- **Un solo modulo por tipo en la practica.** El kernel admite varios, pero no
  hay estrategia de resolucion de conflictos entre dos optimizadores.

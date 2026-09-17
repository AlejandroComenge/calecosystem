# Hoja de ruta

Separada en lo que esta comprometido y lo que todavia es una hipotesis. Mezclar
ambas cosas es como se construyen las hojas de ruta que nadie cumple.

## v0.1.0 — este commit

- [x] Kernel: plugins con orden topologico, bus de hooks tipado, entitlements.
- [x] Sistema de ficheros virtual con proteccion frente a escapes de ruta.
- [x] Generador completo: analisis, planificacion, scaffolding, despliegue.
- [x] Adaptadores React, Vue, Angular, Node/Fastify y Docker + GitHub Actions.
- [x] Los cuatro modulos restantes en vista previa, conectados por los hooks.
- [x] CLI con `plan`, `generate` y `modules`.
- [x] 105 pruebas, cero dependencias de ejecucion.

## v0.2.0 — este commit

- [x] Plantillas de producto: e-commerce, SaaS y landing, con deteccion puntuada.
- [x] Catalogo de componentes como datos + renderizador de React.
- [x] Componentes de dominio (tabla y formulario) derivados de cada entidad.
- [x] Despliegue en Vercel y Netlify.
- [x] Dependencias declaradas y `package.json` deducido de las capacidades.
- [x] Cadena de middlewares en el kernel.
- [x] Cuotas por plan con contador de consumo (`@calecosystem/billing`).
- [x] Integracion basica con Stripe: sesion de pago y verificacion de webhooks.
- [x] Telemetria de uso (`@calecosystem/telemetry`), desactivada por defecto.
- [x] Caso de uso e-commerce con metricas verificadas por pruebas.
- [x] 199 pruebas.

## v0.3 — publicable

Objetivo: que `npm install @calecosystem/cli` funcione fuera de este repositorio.

- [ ] **Build de publicacion.** Los paquetes apuntan a `src/*.ts`; hay que
      emitir `dist/` con tipos y `exports` condicionales. Es el bloqueo real
      para publicar.
- [ ] Versionado y publicacion coordinada de los diez paquetes.
- [ ] `calec init` para generar `calecosystem.config.json` de forma interactiva.
- [ ] `--template` para forzar plantilla, y `--no-templates` documentado.
- [ ] Renderizadores de componentes para Vue y Angular: hoy el catalogo solo
      existe en React y es la limitacion mas visible del producto.
- [ ] Modo incremental: regenerar sin pisar lo que el equipo ha modificado.
      Requiere huellas por fichero; es mas dificil de lo que parece y es la
      diferencia entre una herramienta de arranque y una de uso continuo.

## v0.4 — los modulos dejan de ser vista previa

- [ ] **Optimizador**: presupuesto de bundle medido de verdad (no estimado),
      deteccion de N+1 sobre el modelo de datos, sugerencia de indices.
- [ ] **Auditor**: escaneo de dependencias contra avisos publicos, reglas
      OWASP ASVS sobre el codigo generado, exportacion SARIF para CI.
- [ ] **Testeador**: pruebas de integracion con base de datos efimera,
      recorrido end-to-end del flujo principal.
- [ ] **Documentador**: OpenAPI desde el blueprint, diagramas C4, ADR por
      decision en ficheros separados.

## v0.5 — el ecosistema se abre

- [ ] Enriquecedor de requisitos con modelo de lenguaje, como plugin opcional
      y con degradacion al analisis deterministico si falla.
- [ ] Marketplace de plugins con firma y verificacion de autoria.
- [ ] Adaptadores adicionales: Svelte, Next.js, Nuxt, Python/FastAPI.
- [ ] Ejecucion de la fase `augment` en paralelo cuando los modulos sean
      independientes.
- [ ] Cuotas con fuente de verdad en servidor, cuando exista el servicio web.
- [ ] Facturacion: prorrateos, impuestos y portal del cliente.

## Hipotesis, no compromisos

Ideas con valor potencial y sin validar. Van aqui para no confundirlas con
plan:

- **Integracion continua del ecosistema.** Que el auditor y el optimizador se
  ejecuten en cada PR del proyecto ya generado, no solo al crearlo. Convertiria
  una venta puntual en una suscripcion con uso real, que es el cambio de modelo
  mas rentable disponible. Requiere que los modulos funcionen sobre codigo que
  no generamos nosotros: un salto tecnico considerable.
- **Aprendizaje entre proyectos.** Que el planificador aprenda de las
  decisiones que los equipos cambian a mano. Exige telemetria, y la telemetria
  en una herramienta de desarrollo exige un consentimiento que hay que ganarse.
- **Generacion de migraciones de datos** al cambiar el blueprint de un proyecto
  existente.

## Deuda tecnica reconocida

| Deuda | Impacto | Cuando |
|-------|---------|--------|
| `exports` apuntando a `src/` | Bloquea la publicacion en npm | v0.3 |
| Plantillas y componentes solo en React | Limita el valor para equipos Vue/Angular | v0.3 |
| Contador de uso local y manipulable | Aceptable en CLI, no en servicio | con el servicio web |
| Resolucion de dependencias "gana la primera" | No compara rangos semver | cuando aparezca el primer choque real |
| Fase `augment` secuencial | Irrelevante hoy, critico con modulos remotos | v0.5 |
| Sin resolucion de conflictos entre modulos del mismo tipo | Dos optimizadores se ignoran entre si | cuando exista el segundo |
| Lexicos solo en espanol e ingles | Limita el mercado | segun demanda |
| Sin cache de analisis | Irrelevante a 32 ms, no con un LLM | junto con v0.5 |

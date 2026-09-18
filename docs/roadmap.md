# Hoja de ruta

Separada en lo que está comprometido y lo que todavía es una hipotesis. Mezclar
ambas cosas es como se construyen las hojas de ruta que nadie cumple.

## v0.1.0 — este commit

- [x] Kernel: plugins con orden topologico, bus de hooks tipado, entitlements.
- [x] Sistema de ficheros virtual con protección frente a escapes de ruta.
- [x] Generador completo: análisis, planificación, scaffolding, despliegue.
- [x] Adaptadores React, Vue, Angular, Node/Fastify y Docker + GitHub Actions.
- [x] Los cuatro módulos restantes en vista previa, conectados por los hooks.
- [x] CLI con `plan`, `generate` y `modules`.
- [x] 105 pruebas, cero dependencias de ejecución.

## v0.2.0 — este commit

- [x] Plantillas de producto: e-commerce, SaaS y landing, con detección puntuada.
- [x] Catálogo de componentes como datos + renderizador de React.
- [x] Componentes de dominio (tabla y formulario) derivados de cada entidad.
- [x] Despliegue en Vercel y Netlify.
- [x] Dependencias declaradas y `package.json` deducido de las capacidades.
- [x] Cadena de middlewares en el kernel.
- [x] Cuotas por plan con contador de consumo (`@calecosystem/billing`).
- [x] Integración básica con Stripe: sesión de pago y verificación de webhooks.
- [x] Telemetría de uso (`@calecosystem/telemetry`), desactivada por defecto.
- [x] Caso de uso e-commerce con métricas verificadas por pruebas.
- [x] Catálogo de 8 ejemplos y comando `calec examples`.
- [x] Validador de la salida generada (`npm run validate`): sintaxis, JSON,
      YAML y ejecución de las pruebas que el generador entrega.
- [x] Guía de inicio para quien no programa, guía de pruebas y material de venta.
- [x] 247 pruebas.

## v0.3 — publicable

Objetivo: que `npm install @calecosystem/cli` funcione fuera de este repositorio.

- [ ] **Build de publicación.** Los paquetes apuntan a `src/*.ts`; hay que
      emitir `dist/` con tipos y `exports` condicionales. Es el bloqueo real
      para publicar.
- [ ] Versionado y publicación coordinada de los diez paquetes.
- [ ] `calec init` para generar `calecosystem.config.json` de forma interactiva.
- [ ] `--template` para forzar plantilla, y `--no-templates` documentado.
- [ ] Renderizadores de componentes para Vue y Angular: hoy el catálogo solo
      existe en React y es la limitación más visible del producto.
- [ ] Modo incremental: regenerar sin pisar lo que el equipo ha modificado.
      Requiere huellas por fichero; es más difícil de lo que parece y es la
      diferencia entre una herramienta de arranque y una de uso continuo.

## v0.4 — los módulos dejan de ser vista previa

- [ ] **Optimizador**: presupuesto de bundle medido de verdad (no estimado),
      detección de N+1 sobre el modelo de datos, sugerencia de índices.
- [ ] **Auditor**: escaneo de dependencias contra avisos públicos, reglas
      OWASP ASVS sobre el código generado, exportación SARIF para CI.
- [ ] **Testeador**: pruebas de integración con base de datos efimera,
      recorrido end-to-end del flujo principal.
- [ ] **Documentador**: OpenAPI desde el blueprint, diagramas C4, ADR por
      decisión en ficheros separados.

## v0.5 — el ecosistema se abre

- [ ] Enriquecedor de requisitos con modelo de lenguaje, como plugin opcional
      y con degradación al análisis deterministico si falla.
- [ ] Marketplace de plugins con firma y verificación de autoria.
- [ ] Adaptadores adicionales: Svelte, Next.js, Nuxt, Python/FastAPI.
- [ ] Ejecución de la fase `augment` en paralelo cuando los módulos sean
      independientes.
- [ ] Cuotas con fuente de verdad en servidor, cuando exista el servicio web.
- [ ] Facturación: prorrateos, impuestos y portal del cliente.

## Hipotesis, no compromisos

Ideas con valor potencial y sin validar. Van aquí para no confundirlas con
plan:

- **Integración continua del ecosistema.** Qué el auditor y el optimizador se
  ejecuten en cada PR del proyecto ya generado, no solo al crearlo. Convertiría
  una venta puntual en una suscripción con uso real, que es el cambio de modelo
  más rentable disponible. Requiere que los módulos funcionen sobre código que
  no generamos nosotros: un salto técnico considerable.
- **Aprendizaje entre proyectos.** Qué el planificador aprenda de las
  decisiones que los equipos cambian a mano. Exige telemetría, y la telemetría
  en una herramienta de desarrollo exige un consentimiento que hay que ganarse.
- **Generación de migraciones de datos** al cambiar el blueprint de un proyecto
  existente.

## Deuda técnica reconocida

| Deuda | Impacto | Cuando |
|-------|---------|--------|
| `exports` apuntando a `src/` | Bloquea la publicación en npm | v0.3 |
| Plantillas y componentes solo en React | Limita el valor para equipos Vue/Angular | v0.3 |
| Contador de uso local y manipulable | Aceptable en CLI, no en servicio | con el servicio web |
| Resolución de dependencias "gana la primera" | No compara rangos semver | cuando aparezca el primer choque real |
| Fase `augment` secuencial | Irrelevante hoy, crítico con módulos remotos | v0.5 |
| Sin resolución de conflictos entre módulos del mismo tipo | Dos optimizadores se ignoran entre si | cuando exista el segundo |
| Lexicos solo en español e inglés | Limita el mercado | según demanda |
| Sin cache de análisis | Irrelevante a 32 ms, no con un LLM | junto con v0.5 |

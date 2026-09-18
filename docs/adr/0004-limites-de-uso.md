# ADR-0004: Cuotas como middleware, con contador local honesto

- **Estado:** aceptada
- **Fecha:** 2026-09-17

## Contexto

El modelo de negocio necesita que los planes signifiquen algo en tiempo de
ejecución. Hasta ahora `Entitlements` decidia **que módulos se cargan**; falta
decidir **cuánto se puede usar**.

Dos preguntas de diseño:

1. Donde se aplica el límite: dentro del pipeline (hook) o alrededor (middleware).
2. Donde se lleva la cuenta cuando el producto es una CLI que corre en la
   máquina del usuario.

## Decisión

**Middleware, no hook.** Los hooks intervienen dentro del pipeline; una cuota
tiene que poder decir "no" antes de que empiece nada y ver el resultado
completo después. Eso es exactamente la forma de un middleware, así que se
añade `MiddlewareChain` al kernel y el control de cuota es su primer usuario.

**Contador local declarado como tal.** `JsonLinesUsageStore` escribe en el
disco del usuario. Quien tiene el fichero puede editarlo, y el código, la
documentación y este ADR lo dicen. No se ofusca ni se firma.

**`check` y `record` separados.** El middleware comprueba antes de generar y
registra solo si la generación término bien.

## Consecuencias

**A favor**

- El mismo `quotaMiddleware` servirá sin cambios cuando esto sea un servicio
  web: lo único que cambia es el `UsageStore`.
- Una generación fallida no consume cuota. Es lo correcto y además elimina una
  categoría entera de reclamaciones de soporte.
- El punto de aplicación es uno solo y está probado. No hay comprobaciones de
  plan repartidas por el código.
- `QuotaDecision` lleva `upgradeTo`, así que denegar es una oportunidad de
  venta en lugar de un muro.

**En contra**

- El contador local es manipulable. Aceptado por lo mismo que en ADR-0003: el
  cliente objetivo compra soporte y responsabilidad contractual, no permiso
  para ejecutar código.
- Un middleware más en la cadena es una indirección más al depurar. Se mitiga
  con `calec modules`, que lista los middlewares activos en orden.

## Alternativas descartadas

- **Hook `generation:starting`.** Habría requerido que un handler de evento
  pudiera abortar el pipeline, rompiendo la garantía de que un evento observa
  y no interfiere. Ensuciar ese contrato por un caso de uso no compensa.
- **Comprobar la cuota dentro de `CodeGenerator`.** Más simple, pero acopla el
  generador a la facturación y deja sin punto de aplicación a cualquier otra
  política (autorización, limitación por tasa, auditoría).
- **Validación remota de licencia en cada ejecución.** Rompe el uso sin
  conexión, que es un requisito real de las instalaciones on-premise, y añade
  una dependencia de red a una herramienta de desarrollo.

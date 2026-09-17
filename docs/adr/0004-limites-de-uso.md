# ADR-0004: Cuotas como middleware, con contador local honesto

- **Estado:** aceptada
- **Fecha:** 2026-09-17

## Contexto

El modelo de negocio necesita que los planes signifiquen algo en tiempo de
ejecucion. Hasta ahora `Entitlements` decidia **que modulos se cargan**; falta
decidir **cuanto se puede usar**.

Dos preguntas de diseno:

1. Donde se aplica el limite: dentro del pipeline (hook) o alrededor (middleware).
2. Donde se lleva la cuenta cuando el producto es una CLI que corre en la
   maquina del usuario.

## Decision

**Middleware, no hook.** Los hooks intervienen dentro del pipeline; una cuota
tiene que poder decir "no" antes de que empiece nada y ver el resultado
completo despues. Eso es exactamente la forma de un middleware, asi que se
anade `MiddlewareChain` al kernel y el control de cuota es su primer usuario.

**Contador local declarado como tal.** `JsonLinesUsageStore` escribe en el
disco del usuario. Quien tiene el fichero puede editarlo, y el codigo, la
documentacion y este ADR lo dicen. No se ofusca ni se firma.

**`check` y `record` separados.** El middleware comprueba antes de generar y
registra solo si la generacion termino bien.

## Consecuencias

**A favor**

- El mismo `quotaMiddleware` servira sin cambios cuando esto sea un servicio
  web: lo unico que cambia es el `UsageStore`.
- Una generacion fallida no consume cuota. Es lo correcto y ademas elimina una
  categoria entera de reclamaciones de soporte.
- El punto de aplicacion es uno solo y esta probado. No hay comprobaciones de
  plan repartidas por el codigo.
- `QuotaDecision` lleva `upgradeTo`, asi que denegar es una oportunidad de
  venta en lugar de un muro.

**En contra**

- El contador local es manipulable. Aceptado por lo mismo que en ADR-0003: el
  cliente objetivo compra soporte y responsabilidad contractual, no permiso
  para ejecutar codigo.
- Un middleware mas en la cadena es una indireccion mas al depurar. Se mitiga
  con `calec modules`, que lista los middlewares activos en orden.

## Alternativas descartadas

- **Hook `generation:starting`.** Habria requerido que un handler de evento
  pudiera abortar el pipeline, rompiendo la garantia de que un evento observa
  y no interfiere. Ensuciar ese contrato por un caso de uso no compensa.
- **Comprobar la cuota dentro de `CodeGenerator`.** Mas simple, pero acopla el
  generador a la facturacion y deja sin punto de aplicacion a cualquier otra
  politica (autorizacion, limitacion por tasa, auditoria).
- **Validacion remota de licencia en cada ejecucion.** Rompe el uso sin
  conexion, que es un requisito real de las instalaciones on-premise, y anade
  una dependencia de red a una herramienta de desarrollo.

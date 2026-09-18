# ADR-0003: Entitlements por tier, no protección por licencia

- **Estado:** aceptada
- **Fecha:** 2026-09-17

## Contexto

El modelo de negocio tiene tres planes y necesita que una instalación active
unos módulos y no otros. La tentación evidente es implementar protección real:
ofuscación, verificación de firma en servidor, comprobación remota.

## Decisión

Implementar un control de **empaquetado de producto**, no de seguridad. La
clase `Entitlements` compara el tier requerido por cada plugin o módulo con el
tier de la licencia activa y decide si se carga. No hay ofuscación, ni llamada
remota, ni intento de impedir que alguien con el código lo modifique.

Se documenta explicitamente en el código, en el README y aquí.

## Consecuencias

**A favor**

- El comportamiento es predecible, testeable y auditable: cualquiera puede
  responder que módulos están activos en una instalación y por qué.
- Funciona sin conexión, requisito real de las instalaciones on-premise.
- No se promete una protección que no existe. Un cliente que descubre que la
  "protección" era un `if` pierde la confianza en todo lo demas.

**En contra**

- No impide el uso de módulos de pago a quien edite el código.

Ese riesgo es aceptable: el cliente objetivo es una empresa que compra soporte,
actualizaciones y responsabilidad contractual. Una empresa que parchea el
control de licencia se queda sin las tres cosas, y eso vale más que cualquier
medida técnica. Para quien no comparte esa premisa, ninguna protección en
código distribuido habría funcionado de todos modos.

## Detalles

- Por defecto, un plugin por encima del plan se **omite con un aviso**: una
  instalación Community sigue generando proyectos aunque la configuración
  mencione módulos de pago.
- Con `strictEntitlements: true` el arranque **falla**, que es lo que quiere
  una instalación corporativa con configuración controlada.
- Una licencia caducada degrada a `community` en lugar de bloquear: que expire
  una renovación no puede dejar a un equipo sin poder trabajar.

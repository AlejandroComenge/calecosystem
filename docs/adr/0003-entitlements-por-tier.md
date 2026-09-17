# ADR-0003: Entitlements por tier, no proteccion por licencia

- **Estado:** aceptada
- **Fecha:** 2026-09-17

## Contexto

El modelo de negocio tiene tres planes y necesita que una instalacion active
unos modulos y no otros. La tentacion evidente es implementar proteccion real:
ofuscacion, verificacion de firma en servidor, comprobacion remota.

## Decision

Implementar un control de **empaquetado de producto**, no de seguridad. La
clase `Entitlements` compara el tier requerido por cada plugin o modulo con el
tier de la licencia activa y decide si se carga. No hay ofuscacion, ni llamada
remota, ni intento de impedir que alguien con el codigo lo modifique.

Se documenta explicitamente en el codigo, en el README y aqui.

## Consecuencias

**A favor**

- El comportamiento es predecible, testeable y auditable: cualquiera puede
  responder que modulos estan activos en una instalacion y por que.
- Funciona sin conexion, requisito real de las instalaciones on-premise.
- No se promete una proteccion que no existe. Un cliente que descubre que la
  "proteccion" era un `if` pierde la confianza en todo lo demas.

**En contra**

- No impide el uso de modulos de pago a quien edite el codigo.

Ese riesgo es aceptable: el cliente objetivo es una empresa que compra soporte,
actualizaciones y responsabilidad contractual. Una empresa que parchea el
control de licencia se queda sin las tres cosas, y eso vale mas que cualquier
medida tecnica. Para quien no comparte esa premisa, ninguna proteccion en
codigo distribuido habria funcionado de todos modos.

## Detalles

- Por defecto, un plugin por encima del plan se **omite con un aviso**: una
  instalacion Community sigue generando proyectos aunque la configuracion
  mencione modulos de pago.
- Con `strictEntitlements: true` el arranque **falla**, que es lo que quiere
  una instalacion corporativa con configuracion controlada.
- Una licencia caducada degrada a `community` en lugar de bloquear: que expire
  una renovacion no puede dejar a un equipo sin poder trabajar.

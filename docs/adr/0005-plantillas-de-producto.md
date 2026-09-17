# ADR-0005: Plantillas de producto como eje separado del framework

- **Estado:** aceptada
- **Fecha:** 2026-09-17

## Contexto

Generar el CRUD deducido del enunciado sirve para un panel interno, pero se
queda corto para los tres productos que mas se piden: una tienda, un SaaS por
suscripcion y una landing de captacion. Ninguno de los tres se deduce del
modelo de datos: un carrito no es una entidad que alguien mencione, es algo
que **toda** tienda tiene.

La tentacion es anadir "modo e-commerce" al adaptador de React. Ahi empieza el
problema: la misma tienda en Vue exigiria duplicar toda esa logica.

## Decision

Dos ejes independientes:

- **Adaptador** = como se escribe (React, Vue, Angular).
- **Plantilla** = que se escribe (tienda, SaaS, landing).

Una plantilla interviene en dos momentos: `refine` completa el blueprint
(entidades, vistas, endpoints, riesgos) y `scaffold` aporta sus pantallas.

La seleccion es automatica y puntuada: cada plantilla declara senales,
entidades, capacidades y **contra-senales**, y solo se aplica si supera el
umbral de 0,35.

## Consecuencias

**A favor**

- La logica de "que es una tienda" se escribe una vez. Portarla a Vue sera
  escribir el `scaffold`, no volver a pensar el dominio.
- `refine` opera sobre el blueprint, asi que lo que anade la plantilla pasa por
  el auditor, el optimizador y el testeador como cualquier otra cosa. El
  riesgo `RISK-STOCK-RACE` lo pone la plantilla y lo recoge el testeador sin
  que ninguno conozca al otro.
- Las plantillas son una superficie comercial evidente: una plantilla
  corporativa a medida es un entregable facturable que no toca el producto.

**En contra**

- Una plantilla mal detectada genera codigo que nadie pidio. Se mitiga con las
  contra-senales, el umbral y `--no-templates`; hay pruebas de que una landing
  no dispara la plantilla de e-commerce.
- Hoy las tres plantillas declaran `frameworks: ['react']`. Es una limitacion
  real y esta declarada en los metadatos, no escondida.

## Alternativas descartadas

- **Plantillas dentro del adaptador de framework.** Duplicaria el dominio por
  cada framework soportado.
- **Plantillas como repositorios que se clonan** (estilo `degit`). Es lo que
  hace casi todo el mercado. Se descarta porque el resultado no pasa por el
  blueprint y, por tanto, ni el auditor ni el optimizador pueden opinar sobre
  el: se perderia justo la ventaja del ecosistema.
- **Preguntar al usuario que plantilla quiere.** Se hara como opcion (`--template`),
  pero no como unica via: el producto promete deducir del enunciado, y empezar
  con un formulario contradice esa promesa.

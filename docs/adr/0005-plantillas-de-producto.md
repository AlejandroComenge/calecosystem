# ADR-0005: Plantillas de producto como eje separado del framework

- **Estado:** aceptada
- **Fecha:** 2026-09-17

## Contexto

Generar el CRUD deducido del enunciado sirve para un panel interno, pero se
queda corto para los tres productos que más se piden: una tienda, un SaaS por
suscripción y una landing de captación. Ninguno de los tres se deduce del
modelo de datos: un carrito no es una entidad que alguien mencione, es algo
que **toda** tienda tiene.

La tentación es añadir "modo e-commerce" al adaptador de React. Ahí empieza el
problema: la misma tienda en Vue exigiría duplicar toda esa lógica.

## Decisión

Dos ejes independientes:

- **Adaptador** = como se escribe (React, Vue, Angular).
- **Plantilla** = que se escribe (tienda, SaaS, landing).

Una plantilla interviene en dos momentos: `refine` completa el blueprint
(entidades, vistas, endpoints, riesgos) y `scaffold` aporta sus pantallas.

La selección es automática y puntuada: cada plantilla declara señales,
entidades, capacidades y **contra-señales**, y solo se aplica si supera el
umbral de 0,35.

## Consecuencias

**A favor**

- La lógica de "que es una tienda" se escribe una vez. Portarla a Vue será
  escribir el `scaffold`, no volver a pensar el dominio.
- `refine` opera sobre el blueprint, así que lo que añade la plantilla pasa por
  el auditor, el optimizador y el testeador como cualquier otra cosa. El
  riesgo `RISK-STOCK-RACE` lo pone la plantilla y lo recoge el testeador sin
  que ninguno conozca al otro.
- Las plantillas son una superficie comercial evidente: una plantilla
  corporativa a medida es un entregable facturable que no toca el producto.

**En contra**

- Una plantilla mal detectada genera código que nadie pidio. Se mitiga con las
  contra-señales, el umbral y `--no-templates`; hay pruebas de que una landing
  no dispara la plantilla de e-commerce.
- Hoy las tres plantillas declaran `frameworks: ['react']`. Es una limitación
  real y está declarada en los metadatos, no escondida.

## Alternativas descartadas

- **Plantillas dentro del adaptador de framework.** Duplicaría el dominio por
  cada framework soportado.
- **Plantillas como repositorios que se clonan** (estilo `degit`). Es lo que
  hace casi todo el mercado. Se descarta porque el resultado no pasa por el
  blueprint y, por tanto, ni el auditor ni el optimizador pueden opinar sobre
  el: se perdería justo la ventaja del ecosistema.
- **Preguntar al usuario que plantilla quiere.** Se hará como opción (`--template`),
  pero no como única via: el producto promete deducir del enunciado, y empezar
  con un formulario contradice esa promesa.

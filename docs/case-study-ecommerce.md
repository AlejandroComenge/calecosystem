# Caso de estudio: un e-commerce generado por el ecosistema

> Todas las cifras de este documento salen de ejecutar `npm run demo:ecommerce`
> y estan verificadas por las pruebas de `tests/ecommerce.test.ts`. Si el
> producto cambia y estas cifras dejan de ser ciertas, las pruebas fallan.

## El enunciado

Cinco lineas de lenguaje natural, tal y como las escribiria un responsable de
producto:

> Tienda online de productos artesanales. Los clientes navegan el catalogo,
> anaden productos al carrito y pagan con Stripe en el checkout. Hay
> valoraciones de productos, login de usuarios con roles y un panel de
> administracion para gestionar pedidos, productos y clientes. Esperamos
> 20.000 usuarios y cumplimos el RGPD.

## El resultado

| Metrica | Valor |
|---------|-------|
| Tiempo total | **32 ms** |
| Ficheros generados | **117** |
| Lineas de codigo | **3.996** |
| Componentes de interfaz | **26** |
| Tamano | 137,7 KB |
| Entidades de dominio | 8 |
| Endpoints de API | 44 |
| Vistas | 23 |
| Decisiones de arquitectura registradas | 5 |
| Riesgos identificados con dueno | 3 |
| Ficheros de prueba entregados | 10 |

Plantilla detectada: **E-commerce**, con un encaje del **90%**, activada por
`tienda`, `carrito`, `checkout`, `catalogo` y las entidades `Product`, `Order`,
`Cart` y `Customer`.

### Reparto del tiempo

| Fase | Duracion | Peso |
|------|----------|------|
| analyze | 11,6 ms | 37% |
| plan | 2,8 ms | 9% |
| scaffold | 4,3 ms | 14% |
| augment | 11,9 ms | 38% |
| finalize | 0,9 ms | 3% |

Las dos fases caras son analizar el lenguaje natural y ejecutar los cuatro
modulos. Escribir el codigo, que es lo que parece el trabajo, cuesta el 14%.

### Reparto de los ficheros

| Area | Ficheros |
|------|----------|
| frontend: componentes | 27 |
| frontend: paginas | 12 |
| frontend: features (carrito, catalogo) | 3 |
| frontend: otros (entrada, rutas, tipos, cliente HTTP) | 8 |
| backend: dominio | 18 |
| backend: aplicacion | 10 |
| backend: infraestructura | 9 |
| backend: rutas | 10 |
| backend: otros (servidor, configuracion, Dockerfile) | 6 |
| despliegue y CI | 8 |
| documentacion | 6 |

## Que incluye la tienda

**Catalogo.** `CatalogPage` + `ProductGrid`, con formato de moneda en
`es-ES` y boton deshabilitado cuando no hay existencias.

**Carrito.** `CartContext` con persistencia en `localStorage` (un carrito que
se vacia al recargar pierde ventas), `useCart` que falla pronto si falta el
proveedor, y `CartPage` con edicion de cantidades.

**Checkout.** `CheckoutPage` envia **solo identificadores y cantidades**;
`CheckoutService` recalcula los precios en el servidor. Confiar en el importe
que manda el navegador es como se regalan productos sin querer.

**Panel de administracion.** `AdminOrdersPage` con tabla de pedidos y contador
de pendientes; rutas `/admin/orders` y `/admin/products` protegidas.

**Reglas de dinero probadas.** `apps/api/src/domain/CartPricing.ts` tiene el
calculo de importes con redondeo a centimos, y llega con cinco pruebas que
pasan tal cual se generan:

```
$ cd <proyecto-generado> && node --test "apps/api/src/domain/*.test.ts"
# tests 13
# pass 13
# fail 0
```

## Que NO incluye

Esta es la parte del caso de estudio que suele faltar, y es la que evita una
conversacion incomoda con el cliente tres semanas despues.

El propio ecosistema lo dice al terminar:

| Hallazgo | Gravedad | Quien lo detecta |
|----------|----------|------------------|
| `SEC-AUTH-NOT-VERIFIED` - el middleware acepta cualquier `Bearer` | critica | Auditor |
| `SEC-WEBHOOK-UNVERIFIED` - el webhook de pagos no valida la firma | alta | Auditor |
| `PERF-UNBOUNDED-LIST` - 10 listados sin paginacion | alta | Optimizador |
| `TEST-UNCOVERED-RISK-STOCK-RACE` - carrera al descontar stock sin prueba | alta | Testeador |
| `TEST-AUTH-FLOW` - flujo de sesion sin pruebas de integracion | alta | Testeador |

Puntuaciones: optimizador 58/100, seguridad 36/100, testeador 7/100,
documentador 100/100.

**Las puntuaciones bajas son el producto funcionando.** Un generador que
entrega 117 ficheros con un 100% en todo esta mintiendo: la persistencia es un
repositorio en memoria y la autenticacion es un esqueleto. Decirlo por escrito,
con codigos accionables, vale mas que el codigo generado.

## El ecosistema trabajando junto

El detalle que ninguna herramienta suelta puede replicar:

1. La **plantilla** de e-commerce anade el riesgo `RISK-STOCK-RACE` al
   blueprint, porque sabe que toda tienda lo tiene.
2. El **testeador**, que no sabe nada de tiendas, lee los riesgos del
   blueprint, ve que ese no tiene prueba y emite `TEST-UNCOVERED-RISK-STOCK-RACE`.
3. El **documentador** lo publica en `docs/ARCHITECTURE.md` con su dueno
   asignado.

Tres modulos que no se conocen entre si, coordinados por un modelo de datos
compartido. Esa cadena esta cubierta por una prueba de integracion, porque es
la caracteristica que sostiene el argumento comercial.

Lo mismo ocurre con las dependencias: el analizador detecta pagos y
autenticacion, y el `package.json` del API sale con `stripe`, `argon2` y
`@fastify/rate-limit` sin que nadie los escriba.

## Comparacion honesta

| | Manual | Con el ecosistema |
|---|---|---|
| Arranque de estructura, stack y CI | 60-120 h | 32 ms + revision |
| Decisiones documentadas | rara vez | 5, con alternativas |
| Riesgos identificados al inicio | los que alguien recuerde | 3, con dueno |
| Pruebas el primer dia | normalmente ninguna | 10 ficheros, 13 pruebas que pasan |
| Autenticacion lista para produccion | no | tampoco |

La ultima fila importa tanto como las otras. El ahorro real esta en el
andamiaje y en las decisiones documentadas, no en el trabajo de producto.

## Reproducirlo

```bash
npm run demo:ecommerce                      # metricas en pantalla
npm run demo:ecommerce -- --out ./tienda    # ademas, escribe el proyecto

cd tienda
node --test "apps/api/src/domain/*.test.ts" # las pruebas generadas pasan
```

# Guia de pruebas

Como verificar que el sistema funciona, a tres niveles: automatico, manual y
por tipo de web.

---

## 1. Pruebas automaticas

### Las dos capas

El repositorio tiene dos sistemas de prueba que responden preguntas distintas.
Confundirlos es el error tipico al evaluar un generador de codigo.

| | `npm test` | `npm run validate` |
|---|---|---|
| **Que verifica** | Que el **generador** funciona | Que el **codigo generado** es valido |
| Pruebas | 247 | 8 ejemplos completos |
| Duracion | ~2 s | ~25 s |
| Toca disco | No | Si (directorio temporal) |
| Cuando | En cada cambio | Antes de enseñar el producto o publicar |

Un generador puede pasar sus 247 pruebas y producir codigo que no compila.
Por eso existen los dos.

### `npm test` — el generador

```bash
npm test
```

```
# tests 247
# pass 247
# fail 0
```

Cubre, entre otras cosas:

| Area | Que se comprueba |
|------|------------------|
| Analisis de requisitos | Extraccion de entidades, roles, capacidades y escala; reproducibilidad |
| Planificacion | Eleccion de stack, endpoints, decisiones justificadas, riesgos |
| Plantillas | Deteccion puntuada, contra-senales, idempotencia de `refine` |
| Componentes | Interfaz de props, valores por defecto, catalogo completo renderizable |
| Dependencias | Resolucion, conflictos, manifiesto estable |
| Hooks y middlewares | Orden, aislamiento de fallos, cortocircuito |
| Cuotas | Limites por plan, periodos, no cobrar por errores |
| Stripe | Firma de webhooks: valida, manipulada, caducada, mal formada |
| Integracion | Los cinco modulos juntos, reproducibilidad, degradacion ante fallos |

Modo continuo mientras trabajas:

```bash
npm run test:watch
```

### `npm run validate` — el codigo generado

```bash
npm run validate
```

Por cada uno de los 8 ejemplos del catalogo:

1. genera el proyecto en memoria;
2. comprueba que aparecen los ficheros que ese tipo de web promete;
3. analiza **cada** fichero `.ts`/`.tsx` con el parser de TypeScript;
4. valida que todo `.json` se puede leer;
5. comprueba la estructura de los `.yml`;
6. verifica que no hay conflictos de versiones;
7. escribe el proyecto en un directorio temporal y **ejecuta las pruebas que
   el propio generador entrega**.

Salida real:

```
tienda           Tienda online (e-commerce)
                 OK   117 ficheros, 3996 lineas, 98 TS analizados, 13/13 pruebas generadas

saas             Aplicacion SaaS por suscripcion
                 OK   104 ficheros, 3400 lineas, 85 TS analizados, 10/10 pruebas generadas

landing          Landing de captacion
                 OK   62 ficheros, 1601 lineas, 43 TS analizados, 5/5 pruebas generadas

panel            Panel interno de gestion
                 OK   98 ficheros, 3269 lineas, 79 TS analizados, 7/7 pruebas generadas

reservas         Sistema de reservas
                 OK   82 ficheros, 2512 lineas, 63 TS analizados, 5/5 pruebas generadas

blog             Blog o portal de contenidos
                 OK   82 ficheros, 2485 lineas, 63 TS analizados, 5/5 pruebas generadas

tienda-vue       Tienda online generada en Vue
                 OK   62 ficheros, 1576 lineas, 37 TS analizados, 5/5 pruebas generadas

panel-angular    Panel de gestion generado en Angular
                 OK   56 ficheros, 1355 lineas, 37 TS analizados, 4/4 pruebas generadas

==============================================================================
8 ejemplos | 663 ficheros | 20194 lineas | 505 TS sin errores de sintaxis | 54 pruebas generadas en verde
Tiempo de generacion acumulado: 65 ms

TODO CORRECTO: la salida del generador es valida en todos los ejemplos.
```

Un solo ejemplo:

```bash
npm run validate tienda
```

Devuelve codigo de salida 1 si algo falla, asi que sirve tal cual en
integracion continua.

> **Limitacion declarada:** la comprobacion de YAML es estructural (tabuladores,
> claves duplicadas, fichero vacio), no un analisis completo. Sin dependencias
> de ejecucion no hay parser de YAML disponible, y se prefiere decirlo a
> fingir una validacion que no existe.

### Lo que el validador ya ha encontrado

No es un adorno. En su primera ejecucion detecto dos fallos reales:

1. La plantilla de e-commerce se activaba en un **panel interno de gestion**,
   porque el enunciado mencionaba "pedidos" y "productos". Un panel interno no
   necesita carrito ni proceso de compra. Se corrigio anadiendo contra-senales
   (`panel interno`, `empleados`, `backoffice`).
2. El propio validador invocaba mal al ejecutor de pruebas.

---

## 2. Pruebas manuales, paso a paso

### Preparacion

```bash
node --version      # tiene que ser >= 22.18.0
npm install
npm run verify      # typecheck + 247 pruebas
```

### Prueba A — Ver que decide antes de generar

```bash
npm run calec -- plan "Tienda online de ceramica artesanal con catalogo, carrito, checkout con Stripe y panel de administracion"
```

**Que comprobar:**

- [ ] Detecta las entidades: `Product`, `Order`, `Customer`, `Cart`...
- [ ] Elige `react + node-fastify + postgres`
- [ ] Cada decision (`ADR-FRONTEND`, `ADR-DATABASE`...) trae su justificacion
- [ ] Si la descripcion es vaga, aparecen "Preguntas abiertas"

### Prueba B — Generar y revisar

```bash
npm run calec -- generate "Tienda online de ceramica artesanal con catalogo, carrito, checkout con Stripe y panel de administracion" --out ./pruebas/tienda
cd pruebas/tienda
```

**Que comprobar:**

- [ ] `ls` muestra `apps/`, `docs/`, `README.md`, `docker-compose.yml`
- [ ] `cat README.md` explica el stack, las decisiones y los riesgos
- [ ] `cat apps/api/package.json` incluye `stripe` y `argon2` **sin que nadie los pidiera**
- [ ] `node --test "apps/api/src/domain/*.test.ts"` termina en `fail 0`

### Prueba C — La deteccion de dependencias

Genera dos proyectos y compara:

```bash
npm run calec -- generate "Blog publico con articulos y comentarios, sin registro de usuarios" --out ./pruebas/blog-simple
npm run calec -- generate "Blog con articulos, comentarios, login de usuarios y pagos por suscripcion" --out ./pruebas/blog-pago

diff <(cat pruebas/blog-simple/apps/api/package.json) <(cat pruebas/blog-pago/apps/api/package.json)
```

**Que comprobar:** el segundo trae `stripe`, `argon2`, `@fastify/jwt` y
`@fastify/rate-limit`. Nadie los escribio: salen de las capacidades detectadas
en el texto.

### Prueba D — Los cuatro modulos

```bash
CALEC_LICENSE_TIER=enterprise npm run calec -- generate "Tienda online con carrito, checkout y pagos" --dry-run
```

**Que comprobar:**

- [ ] Aparecen los cuatro informes: optimizer, security, tester, documenter
- [ ] Seguridad detecta `SEC-AUTH-NOT-VERIFIED` (critico)
- [ ] El testeador detecta `TEST-UNCOVERED-RISK-STOCK-RACE`
- [ ] Sin la variable de entorno, solo aparece el documentador (plan gratuito)

El punto 3 es el mas interesante de enseñar: el riesgo lo **anade la plantilla**
de e-commerce y lo **recoge el testeador**, que no sabe nada de tiendas.

### Prueba E — Los limites de uso

```bash
npm run calec -- usage --user prueba

# Genera tres veces
for i in 1 2 3; do
  npm run calec -- generate "Panel interno para gestionar pedidos y clientes con login" --user prueba --dry-run -q
done

npm run calec -- usage --user prueba
```

**Que comprobar:** el contador sube de 0 a 3. Al llegar a 10 en el mes, la
siguiente generacion se rechaza proponiendo el plan Pro.

### Prueba F — Que una generacion fallida no consume cuota

```bash
npm run calec -- usage --user prueba2
npm run calec -- generate "corto" --user prueba2    # falla: descripcion insuficiente
npm run calec -- usage --user prueba2               # sigue en 0
```

Es una decision de producto: no se cobra por un error del sistema.

---

## 3. Pruebas por tipo de web

Cada tipo tiene su propio contrato. `npm run calec -- examples <id>` da el
comando exacto.

### Tienda online (`tienda`)

```bash
npm run calec -- generate "$(npm run calec --silent -- examples tienda | grep -A1 'Copia y pega' | tail -1)"
```

O mas simple, mira el comando y copialo:

```bash
npm run calec -- examples tienda
```

| Comprobacion | Como |
|---|---|
| Plantilla e-commerce detectada | La salida dice `Plantilla: E-commerce (encaje 90%)` |
| Carrito con persistencia | `apps/web/src/features/cart/CartContext.tsx` usa `localStorage` |
| El precio se recalcula en servidor | `CheckoutPage.tsx` solo envia `productId` y `quantity` |
| Reglas de dinero probadas | `node --test apps/api/src/domain/CartPricing.test.ts` |
| Panel de pedidos | `apps/web/src/pages/AdminOrdersPage.tsx` |

### SaaS por suscripcion (`saas`)

| Comprobacion | Como |
|---|---|
| Plantilla SaaS detectada | Salida: `Plantilla: SaaS por suscripcion` |
| Aislamiento entre empresas | `apps/api/src/domain/Tenant.ts` + su prueba |
| Seleccion de planes | `apps/web/src/features/billing/PlanSelector.tsx` |
| Riesgo de fuga entre inquilinos | `RISK-TENANT-QUERY` en `docs/ARCHITECTURE.md` |

### Landing de captacion (`landing`)

| Comprobacion | Como |
|---|---|
| Plantilla landing detectada | Salida: `Plantilla: Landing de captacion` |
| Proteccion antispam | `LeadForm.tsx` tiene un campo trampa oculto |
| Validacion de correo probada | `node --test apps/api/src/domain/Lead.validation.test.ts` |
| Proyecto ligero | ~62 ficheros, mucho menos que una tienda |

### Panel interno (`panel`)

| Comprobacion | Como |
|---|---|
| **No** aplica plantilla de tienda | Salida: `Plantilla: ninguna` |
| CRUD completo por entidad | `apps/api/src/routes/*.routes.ts` |
| Tabla y formulario por entidad | `apps/web/src/components/domain/` |

Este caso es el que detecto el fallo de las contra-senales. Merece la pena
comprobarlo cada vez.

### Otros frameworks (`tienda-vue`, `panel-angular`)

```bash
npm run calec -- examples tienda-vue
npm run calec -- examples panel-angular
```

| Comprobacion | Como |
|---|---|
| Vue genera componentes de un solo fichero | `apps/web/src/App.vue` |
| Angular genera componentes autonomos | `apps/web/src/app/app.routes.ts` |
| **No** hay plantilla ni catalogo de componentes | Limitacion conocida y declarada |

### Destinos de despliegue

```bash
npm run calec -- generate "Landing de captacion de leads" --deployment vercel --out ./pruebas/vercel
npm run calec -- generate "Landing de captacion de leads" --deployment netlify --out ./pruebas/netlify
```

| Comprobacion | Como |
|---|---|
| Vercel | existe `vercel.json` con cabeceras de seguridad |
| Netlify | existe `netlify.toml` con redirecciones |
| Se explica que el API va aparte | `docs/DEPLOY-VERCEL.md` |

---

## 4. En integracion continua

```yaml
- run: npm ci
- run: npm run typecheck
- run: npm test          # el generador
- run: npm run validate  # el codigo generado
```

Ambos devuelven codigo distinto de cero al fallar.

---

## 5. Cuando algo falla

| Sintoma | Causa habitual |
|---|---|
| `ERR_INVALID_TYPESCRIPT_SYNTAX` al arrancar | Node anterior a 22.18 |
| `npm test` falla tras tocar contratos | Los tipos cambiaron; `npm run typecheck` lo señala primero |
| `validate` falla en "sintaxis" | Una plantilla genera codigo mal formado; el mensaje da fichero y linea |
| `validate` falla en "pruebas generadas" | El codigo generado compila pero su logica esta mal |
| `validate` falla en "plantilla" | La deteccion cambio de criterio; revisa señales y contra-señales |
| `validate` falla en "fichero" | Una plantilla dejo de emitir algo que promete |

El mensaje del validador siempre dice **que ejemplo**, **que comprobacion** y
**que detalle**, para poder reproducirlo con `npm run validate <id>`.

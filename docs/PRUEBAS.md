# Guía de pruebas

Como verificar que el sistema funciona, a tres niveles: automático, manual y
por tipo de web.

---

## 1. Pruebas automáticas

### Las dos capas

El repositorio tiene dos sistemas de prueba que responden preguntas distintas.
Confundirlos es el error típico al evaluar un generador de código.

| | `npm test` | `npm run validate` |
|---|---|---|
| **Qué verifica** | Qué el **generador** funciona | Qué el **código generado** es válido |
| Pruebas | 247 | 8 ejemplos completos |
| Duración | ~2 s | ~25 s |
| Toca disco | No | Si (directorio temporal) |
| Cuando | En cada cambio | Antes de enseñar el producto o publicar |

Un generador puede pasar sus 247 pruebas y producir código que no compila.
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

| Área | Qué se comprueba |
|------|------------------|
| Análisis de requisitos | Extracción de entidades, roles, capacidades y escala; reproducibilidad |
| Planificación | Elección de stack, endpoints, decisiones justificadas, riesgos |
| Plantillas | Detección puntuada, contra-señales, idempotencia de `refine` |
| Componentes | Interfaz de props, valores por defecto, catálogo completo renderizable |
| Dependencias | Resolución, conflictos, manifiesto estable |
| Hooks y middlewares | Orden, aislamiento de fallos, cortocircuito |
| Cuotas | Límites por plan, períodos, no cobrar por errores |
| Stripe | Firma de webhooks: valida, manipulada, caducada, mal formada |
| Integración | Los cinco módulos juntos, reproducibilidad, degradación ante fallos |

Modo continuo mientras trabajas:

```bash
npm run test:watch
```

### `npm run validate` — el código generado

```bash
npm run validate
```

Por cada uno de los 8 ejemplos del catálogo:

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
                 OK   117 ficheros, 3996 líneas, 98 TS analizados, 13/13 pruebas generadas

saas             Aplicación SaaS por suscripción
                 OK   104 ficheros, 3400 líneas, 85 TS analizados, 10/10 pruebas generadas

landing          Landing de captación
                 OK   62 ficheros, 1601 líneas, 43 TS analizados, 5/5 pruebas generadas

panel            Panel interno de gestión
                 OK   98 ficheros, 3269 líneas, 79 TS analizados, 7/7 pruebas generadas

reservas         Sistema de reservas
                 OK   82 ficheros, 2512 líneas, 63 TS analizados, 5/5 pruebas generadas

blog             Blog o portal de contenidos
                 OK   82 ficheros, 2485 líneas, 63 TS analizados, 5/5 pruebas generadas

tienda-vue       Tienda online generada en Vue
                 OK   62 ficheros, 1576 líneas, 37 TS analizados, 5/5 pruebas generadas

panel-angular    Panel de gestión generado en Angular
                 OK   56 ficheros, 1355 líneas, 37 TS analizados, 4/4 pruebas generadas

==============================================================================
8 ejemplos | 663 ficheros | 20194 líneas | 505 TS sin errores de sintaxis | 54 pruebas generadas en verde
Tiempo de generación acumulado: 65 ms

TODO CORRECTO: la salida del generador es válida en todos los ejemplos.
```

Un solo ejemplo:

```bash
npm run validate tienda
```

Devuelve código de salida 1 si algo falla, así que sirve tal cual en
integración continua.

> **Limitación declarada:** la comprobación de YAML es estructural (tabuladores,
> claves duplicadas, fichero vacío), no un análisis completo. Sin dependencias
> de ejecución no hay parser de YAML disponible, y se prefiere decirlo a
> fingir una validación que no existe.

### Lo que el validador ya ha encontrado

No es un adorno. En su primera ejecución detectó dos fallos reales:

1. La plantilla de e-commerce se activaba en un **panel interno de gestión**,
   porque el enunciado mencionaba "pedidos" y "productos". Un panel interno no
   necesita carrito ni proceso de compra. Se corrigió añadiendo contra-señales
   (`panel interno`, `empleados`, `backoffice`).
2. El propio validador invocaba mal al ejecutor de pruebas.

---

## 2. Pruebas manuales, paso a paso

### Preparación

```bash
node --version      # tiene que ser >= 22.18.0
npm install
npm run verify      # typecheck + 247 pruebas
```

### Prueba A — Ver que decide antes de generar

```bash
npm run calec -- plan "Tienda online de ceramica artesanal con catalogo, carrito, checkout con Stripe y panel de administracion"
```

**Qué comprobar:**

- [ ] Detecta las entidades: `Product`, `Order`, `Customer`, `Cart`...
- [ ] Elige `react + node-fastify + postgres`
- [ ] Cada decisión (`ADR-FRONTEND`, `ADR-DATABASE`...) trae su justificación
- [ ] Si la descripción es vaga, aparecen "Preguntas abiertas"

### Prueba B — Generar y revisar

```bash
npm run calec -- generate "Tienda online de ceramica artesanal con catalogo, carrito, checkout con Stripe y panel de administracion" --out ./pruebas/tienda
cd pruebas/tienda
```

**Qué comprobar:**

- [ ] `ls` muestra `apps/`, `docs/`, `README.md`, `docker-compose.yml`
- [ ] `cat README.md` explica el stack, las decisiones y los riesgos
- [ ] `cat apps/api/package.json` incluye `stripe` y `argon2` **sin que nadie los pidiera**
- [ ] `node --test "apps/api/src/domain/*.test.ts"` termina en `fail 0`

### Prueba C — La detección de dependencias

Genera dos proyectos y compara:

```bash
npm run calec -- generate "Blog publico con articulos y comentarios, sin registro de usuarios" --out ./pruebas/blog-simple
npm run calec -- generate "Blog con articulos, comentarios, login de usuarios y pagos por suscripcion" --out ./pruebas/blog-pago

diff <(cat pruebas/blog-simple/apps/api/package.json) <(cat pruebas/blog-pago/apps/api/package.json)
```

**Qué comprobar:** el segundo trae `stripe`, `argon2`, `@fastify/jwt` y
`@fastify/rate-limit`. Nadie los escribio: salen de las capacidades detectadas
en el texto.

### Prueba D — Los cuatro módulos

```bash
CALEC_LICENSE_TIER=enterprise npm run calec -- generate "Tienda online con carrito, checkout y pagos" --dry-run
```

En Windows (PowerShell), la variable va aparte:

```powershell
$env:CALEC_LICENSE_TIER="enterprise"
npm run calec -- generate "Tienda online con carrito, checkout y pagos" --dry-run
```

**Qué comprobar:**

- [ ] Aparecen los cuatro informes: optimizer, security, tester, documenter
- [ ] Seguridad detecta `SEC-AUTH-NOT-VERIFIED` (crítico)
- [ ] El testeador detecta `TEST-UNCOVERED-RISK-STOCK-RACE`
- [ ] Sin la variable de entorno, solo aparece el documentador (plan gratuito)
- [ ] Y en ese caso la salida lista los tres módulos NO ejecutados, con su nombre legible

El punto 3 es el más interesante de enseñar: el riesgo lo **añade la plantilla**
de e-commerce y lo **recoge el testeador**, que no sabe nada de tiendas.

### Prueba E — Los límites de uso

```bash
npm run calec -- usage --user prueba

# Genera tres veces
for i in 1 2 3; do
  npm run calec -- generate "Panel interno para gestionar pedidos y clientes con login" --user prueba --dry-run -q
done

npm run calec -- usage --user prueba
```

**Qué comprobar:** el contador sube de 0 a 3. Al llegar a 10 en el mes, la
siguiente generación se rechaza proponiendo el plan Pro.

### Prueba F — Que una generación fallida no consume cuota

```bash
npm run calec -- usage --user prueba2
npm run calec -- generate "corto" --user prueba2    # falla: descripcion insuficiente
npm run calec -- usage --user prueba2               # sigue en 0
```

Es una decisión de producto: no se cobra por un error del sistema.

---

## 3. Pruebas por tipo de web

Cada tipo tiene su propio contrato. `npm run calec -- examples <id>` da el
comando exacto.

### Tienda online (`tienda`)

```bash
npm run calec -- generate "$(npm run calec --silent -- examples tienda | grep -A1 'Copia y pega' | tail -1)"
```

O más simple, mira el comando y cópialo:

```bash
npm run calec -- examples tienda
```

| Comprobación | Como |
|---|---|
| Plantilla e-commerce detectada | La salida dice `Plantilla: E-commerce (encaje 90%)` |
| Carrito con persistencia | `apps/web/src/features/cart/CartContext.tsx` usa `localStorage` |
| El precio se recalcula en servidor | `CheckoutPage.tsx` solo envia `productId` y `quantity` |
| Reglas de dinero probadas | `node --test apps/api/src/domain/CartPricing.test.ts` |
| Panel de pedidos | `apps/web/src/pages/AdminOrdersPage.tsx` |

### SaaS por suscripción (`saas`)

| Comprobación | Como |
|---|---|
| Plantilla SaaS detectada | Salida: `Plantilla: SaaS por suscripcion` |
| Aislamiento entre empresas | `apps/api/src/domain/Tenant.ts` + su prueba |
| Selección de planes | `apps/web/src/features/billing/PlanSelector.tsx` |
| Riesgo de fuga entre inquilinos | `RISK-TENANT-QUERY` en `docs/ARCHITECTURE.md` |

### Landing de captación (`landing`)

| Comprobación | Como |
|---|---|
| Plantilla landing detectada | Salida: `Plantilla: Landing de captacion` |
| Protección antispam | `LeadForm.tsx` tiene un campo trampa oculto |
| Validación de correo probada | `node --test apps/api/src/domain/Lead.validation.test.ts` |
| Proyecto ligero | ~62 ficheros, mucho menos que una tienda |

### Panel interno (`panel`)

| Comprobación | Como |
|---|---|
| **No** aplica plantilla de tienda | Salida: `Plantilla: ninguna` |
| CRUD completo por entidad | `apps/api/src/routes/*.routes.ts` |
| Tabla y formulario por entidad | `apps/web/src/components/domain/` |

Este caso es el que detectó el fallo de las contra-señales. Merece la pena
comprobarlo cada vez.

### Otros frameworks (`tienda-vue`, `panel-angular`)

```bash
npm run calec -- examples tienda-vue
npm run calec -- examples panel-angular
```

| Comprobación | Como |
|---|---|
| Vue genera componentes de un solo fichero | `apps/web/src/App.vue` |
| Angular genera componentes autonomos | `apps/web/src/app/app.routes.ts` |
| **No** hay plantilla ni catálogo de componentes | Limitación conocida y declarada |

### Destinos de despliegue

```bash
npm run calec -- generate "Landing de captacion de leads" --deployment vercel --out ./pruebas/vercel
npm run calec -- generate "Landing de captacion de leads" --deployment netlify --out ./pruebas/netlify
```

| Comprobación | Como |
|---|---|
| Vercel | existe `vercel.json` con cabeceras de seguridad |
| Netlify | existe `netlify.toml` con redirecciones |
| Se explica que el API va aparte | `docs/DEPLOY-VERCEL.md` |

---

## 4. En integración continua

```yaml
- run: npm ci
- run: npm run typecheck
- run: npm test          # el generador
- run: npm run validate  # el código generado
```

Ambos devuelven código distinto de cero al fallar.

---

## 5. Cuando algo falla

| Sintoma | Causa habitual |
|---|---|
| `ERR_INVALID_TYPESCRIPT_SYNTAX` al arrancar | Node anterior a 22.18 |
| `npm test` falla tras tocar contratos | Los tipos cambiaron; `npm run typecheck` lo señala primero |
| `validate` falla en "sintaxis" | Una plantilla genera código mal formado; el mensaje da fichero y línea |
| `validate` falla en "pruebas generadas" | El código generado compila pero su lógica está mal |
| `validate` falla en "plantilla" | La detección cambio de criterio; revisa señales y contra-señales |
| `validate` falla en "fichero" | Una plantilla dejo de emitir algo que promete |

El mensaje del validador siempre dice **que ejemplo**, **que comprobación** y
**que detalle**, para poder reproducirlo con `npm run validate <id>`.

# Limites de uso y planes

Como se aplican los tres planes de `pricing.md` en el codigo.

## Las piezas

| Pieza | Responsabilidad |
|-------|-----------------|
| `QuotaPolicy` | Limite de una operacion en un periodo |
| `UsageStore` | Donde se lleva la cuenta (memoria, JSONL, base de datos) |
| `QuotaGuard` | Decide si se permite y registra el consumo |
| `quotaMiddleware` | Aplica la decision alrededor de la generacion |
| `BillingProvider` | Cobra el cambio de plan (Stripe) |

## Cuotas por defecto

| Operacion | Community | Pro | Enterprise | Periodo |
|-----------|-----------|-----|------------|---------|
| `generation` | 10 | 200 | sin limite | mes |
| `project` | 3 | sin limite | sin limite | acumulado |
| `module-run` | 20 | sin limite | sin limite | mes |
| `seat` | 1 | 25 | sin limite | acumulado |

El criterio para elegir estos numeros: **el plan gratuito tiene que permitir
evaluar el producto de verdad**, no solo probarlo una vez. Diez generaciones
son tres o cuatro proyectos con sus iteraciones. Un limite que muerde antes de
que el equipo obtenga valor no convierte, solo ahuyenta.

## Como se aplica

El middleware de cuota es el mas externo de la cadena (`priority: 10`):

```
peticion
   |
[billing:quota]   <- comprueba ANTES de analizar nada
   |
[otros middlewares]
   |
pipeline (analyze -> plan -> scaffold -> augment -> finalize)
   |
[billing:quota]   <- registra el consumo SOLO si termino bien
```

Tres decisiones deliberadas:

1. **Comprobar antes de trabajar.** Rechazar tras generar 117 ficheros gasta
   servidor y hace esperar al usuario para nada.
2. **Registrar despues del exito.** `check` y `record` estan separados a
   proposito: si el pipeline falla, el contador no se mueve. Cobrar por un
   error propio es la forma mas rapida de perder un cliente.
3. **Denegar con una salida.** `QuotaDecision` incluye `upgradeTo` con el
   primer plan que levanta ese limite, para que el mensaje sea una puerta y
   no un muro.

## Uso desde codigo

```ts
import { billingPlugin, JsonLinesUsageStore } from '@calecosystem/billing';

const kernel = await createKernel({
  plugins: [
    billingPlugin({ store: new JsonLinesUsageStore('./.calec/usage.jsonl') }),
    generatorPlugin(),
  ],
});

await new CodeGenerator({ kernel }).generate(
  { text: 'Tienda online con carrito y pagos' },
  { principal: { userId: 'ana', tier: 'community' } },
);
```

Sin `principal` no se aplica cuota: el uso local y anonimo de la CLI no
deberia exigir cuenta. Con `requirePrincipal: true`, generar sin usuario se
rechaza, que es lo que quiere una instalacion corporativa.

## Desde la CLI

```bash
calec generate "Tienda online con carrito" --user ana
calec usage --user ana
```

```
Usuario: ana
Plan: community

  generation     4 / 10           [########............]
  project        0 / 3            [....................]
  module-run    16 / 20           [################....]
  seat           0 / 1            [....................]

El contador mensual se reinicia el 2026-10-01.
```

## Donde vive la cuenta

| Almacen | Cuando | Limite |
|---------|--------|--------|
| `MemoryUsageStore` | Uso anonimo, pruebas | Se pierde al terminar el proceso |
| `JsonLinesUsageStore` | CLI con usuario | Local: quien tiene el fichero puede editarlo |
| Base de datos | Cuando esto sea un servicio | Pendiente, ver `roadmap.md` |

Se eligio JSON Lines y no un JSON completo por una razon concreta: anadir una
linea es una escritura atomica del sistema operativo, asi que dos procesos
`calec` a la vez no se pisan. Un JSON habria que leerlo, modificarlo y
reescribirlo entero, que es donde se pierden registros.

**El contador local no es una fuente de verdad de facturacion** y no pretende
serlo. Ver `adr/0004-limites-de-uso.md`.

## Cambio de plan con Stripe

Alcance de la integracion: crear la sesion de pago y verificar los webhooks
que confirman el cambio. Es el minimo para cobrar; no cubre prorrateos,
impuestos ni portal del cliente.

```ts
const provider = new StripeBillingProvider({
  secretKey: process.env.STRIPE_SECRET_KEY,
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  plans: [...DEFAULT_PLANS].map((plan) =>
    plan.tier === 'pro' ? { ...plan, priceId: 'price_...' } : plan,
  ),
});

const session = await provider.createCheckoutSession({
  principal: { userId: 'ana' },
  targetTier: 'pro',
  successUrl: 'https://app.example/ok',
  cancelUrl: 'https://app.example/planes',
});
```

Los metadatos `userId` y `tier` viajan en la sesion porque son lo unico que
permite al webhook saber **a quien** subir de plan. Sin ellos, un pago
confirmado no se puede asociar a ninguna cuenta.

### Verificacion de webhooks

Es la unica barrera entre "un cliente ha pagado" y "alguien dice que un
cliente ha pagado". Se comprueban dos cosas:

- **La firma**, con `timingSafeEqual`. Una comparacion normal de cadenas
  termina en el primer byte distinto, y ese tiempo filtra la firma correcta
  byte a byte.
- **La marca de tiempo**, con una ventana de 5 minutos. Una firma valida
  capturada ayer sigue siendo valida hoy si nadie mira el reloj.

```ts
const verification = provider.verifyWebhook(rawBody, request.headers['stripe-signature']);
if (!verification.valid) return reply.code(400).send({ reason: verification.reason });

const event = provider.parseWebhook(rawBody);
if (event.userId && event.tier) await upgradeUser(event.userId, event.tier);
```

Hay que pasar el **cuerpo sin parsear**: cualquier reserializacion cambia los
bytes y la firma deja de cuadrar.

Una cancelacion degrada a `community` en lugar de bloquear la cuenta. Dejar el
plan de pago activo regala producto; bloquear del todo castiga a quien quiza
solo cambio de tarjeta.

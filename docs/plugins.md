# Sistema de plugins

Un plugin es un objeto con nombre, versión y una función `register` que recibe
la API del kernel. Todo lo demas es opcional.

```ts
import { definePlugin } from '@calecosystem/core';

export default definePlugin({
  name: 'acme-svelte',
  version: '1.0.0',
  description: 'Adaptador de frontend para Svelte 5.',
  tier: 'pro',              // plan minimo; por defecto 'community'
  requires: ['@calecosystem/generator'],
  priority: 50,             // menor = se registra antes

  register(api) { /* ... */ },
  dispose() { /* liberar recursos */ },
});
```

## Qué puede hacer un plugin

| Método de `api` | Para que |
|-----------------|----------|
| `onEvent(name, handler, opts?)` | Observar el pipeline |
| `onTransform(name, handler, opts?)` | Modificar requisitos, blueprint, despliegue o ficheros |
| `registerModule(module)` | Aportar un módulo de ampliación (optimizador, auditor, testeador, documentador) |
| `registerFrontendAdapter(adapter)` | Añadir un framework de frontend |
| `registerBackendAdapter(adapter)` | Añadir un runtime de backend |
| `registerDeploymentAdapter(adapter)` | Añadir un destino de despliegue |
| `registerRequirementsEnricher(enricher)` | Refinar el análisis de requisitos (aquí entra un LLM) |
| `registerTemplate(template)` | Añadir una plantilla de producto (tienda, SaaS, landing...) |
| `registerComponent(spec)` | Añadir o sustituir un componente del catálogo |
| `registerComponentRenderer(renderer)` | Traducir el catálogo a otro framework |
| `registerMiddleware(registration)` | Envolver la generación completa (cuotas, telemetría) |
| `provide(token, value)` / `resolve(token)` | Publicar y consumir servicios entre plugins |
| `hasModule(kind)` | Adaptar el comportamiento a lo que haya cargado |
| `api.options` | Opciones de este plugin, tomadas de la configuración |
| `api.logger` | Logger con el nombre del plugin como contexto |

## Orden de carga

El kernel ordena los plugins con un orden topologico sobre `requires`, usando
`priority` y luego el nombre como desempate. El resultado es estable entre
ejecuciones.

Errores detectados antes de ejecutar nada:

- nombre duplicado;
- `requires` que apunta a un plugin no registrado;
- dependencias circulares.

Un plugin cuyo `tier` supera la licencia activa se omite con un aviso. Con
`strictEntitlements: true` en las opciones del kernel, aborta el arranque.

## Configuración declarativa

`calecosystem.config.json` en la raíz del proyecto:

```json
{
  "tier": "pro",
  "output": "./generated",
  "plugins": [
    "@acme/calec-plugin-svelte",
    {
      "module": "./plugins/politica-corporativa.ts",
      "export": "default",
      "options": { "database": "postgres" },
      "enabled": true
    }
  ]
}
```

Se acepta tanto un plugin como una fabrica `(options) => Plugin`, que es la
forma habitual de distribuir plugins parametrizables. `"enabled": false`
desactiva una entrada sin borrarla.

## Escribir un adaptador de frontend

Es el caso más común y el de mayor valor comercial.

```ts
import type { FrontendAdapter } from '@calecosystem/contracts';

export const svelteAdapter: FrontendAdapter = {
  id: 'acme.frontend.svelte',
  displayName: 'Svelte 5 + Vite',
  framework: 'svelte',
  tier: 'pro',

  scaffold({ blueprint }) {
    return blueprint.entities.map((entity) => ({
      path: `apps/web/src/routes/${entity.plural}/+page.svelte`,
      contents: renderListPage(entity),
      producedBy: 'acme.frontend.svelte',
    }));
  },
};
```

`scaffold` puede ser síncrono o asíncrono y devuelve `VirtualFile[]`. El
`Scaffolder` los añade al árbol y detecta colisiones: si dos adaptadores
escriben la misma ruta, la generación falla con los nombres de ambos en lugar
de que uno pise al otro en silencio.

## Escribir un módulo de ampliación

Un módulo implementa `EcosystemModule` y se ejecuta en la fase `augment`.

```ts
import type { EcosystemModule } from '@calecosystem/contracts';

export const licenseChecker: EcosystemModule = {
  descriptor: {
    id: 'acme/license-checker',
    kind: 'security',
    version: '1.0.0',
    displayName: 'Comprobador de licencias',
    description: 'Verifica que las dependencias generadas son compatibles con la politica de ACME.',
    tier: 'enterprise',
    status: 'ga',
  },

  async run(context) {
    const findings = [];
    // context.requirements, context.blueprint, context.files
    // context.emit(file) para aportar ficheros
    // context.warn(mensaje) para avisos no bloqueantes
    return {
      module: 'acme/license-checker',
      kind: 'security',
      summary: `${findings.length} dependencias revisadas`,
      findings,
      score: 100,
      emittedFiles: [],
      durationMs: 0,
    };
  },
};
```

El contexto es de solo lectura salvo `emit` y `warn`: un módulo no muta el
árbol de otro, **aporta el suyo**. Si dos módulos necesitan negociar, el sitio
correcto es un hook de transformación, no la mutación cruzada.

Un módulo que lanza no tumba la generación: se registra el fallo en
`result.warnings` y el pipeline continua. Una auditoría caida no puede dejar a
un equipo sin su proyecto.

## Escribir una plantilla de producto

```ts
import type { ProjectTemplate } from '@calecosystem/contracts';
import { scoreTemplate } from '@calecosystem/generator';

export const marketplaceTemplate: ProjectTemplate = {
  id: 'acme.template.marketplace',
  name: 'Marketplace multivendedor',
  description: 'Vendedores, comisiones y liquidaciones.',
  kind: 'marketplace',
  tier: 'enterprise',
  frameworks: ['react'],

  detect: (requirements) =>
    scoreTemplate(requirements, {
      signals: ['marketplace', 'multivendedor', 'comision', 'liquidacion'],
      entities: ['Seller', 'Payout'],
      // Sin contra-senales, "vendedor" en una tienda normal te activa esto.
      antiSignals: ['tienda propia'],
    }),

  refine: (blueprint) => blueprint,   // anade entidades, vistas, endpoints, riesgos
  scaffold: ({ blueprint }) => [],    // aporta sus pantallas
};
```

Tres reglas aprendidas escribiendo las tres incluidas:

- **`refine` tiene que ser idempotente.** Aplicarla dos veces no puede
  duplicar entidades. Hay una prueba que lo comprueba.
- **El analizador manda sobre la plantilla.** Si `Product` salió del enunciado,
  sus campos son más fieles que los de la plantilla: usa `ensureEntity`, que
  solo añade lo que falta.
- **Declara contra-señales.** Son lo que evita generar un carrito de la compra
  en una landing que menciona "producto".

## Escribir un middleware

Para lo que envuelve la ejecución entera: cuotas, autorización, medición.

```ts
api.registerMiddleware({
  name: 'acme:auditoria',
  priority: 20,          // menor = mas externo
  handler: async (context, next) => {
    const started = Date.now();
    try {
      const result = await next();
      await auditLog.write({ requestId: context.requestId, ok: true });
      return result;
    } catch (error) {
      await auditLog.write({ requestId: context.requestId, ok: false });
      throw error;
    } finally {
      metrics.timing('generation', Date.now() - started);
    }
  },
});
```

No llamar a `next` corta la ejecución: así se implementa "cuota agotada".
Llamarlo dos veces es un error explicito, porque duplicaría la generación y el
contador de consumo.

## Buenas prácticas

- **Un plugin, una responsabilidad.** Es más fácil de versionar y de facturar.
- **Declara `requires`.** Depender del orden de carga por casualidad es una
  bomba de relojeria.
- **Declara el `tier` real.** El kernel lo respeta; la coherencia comercial
  del catálogo depende de ello.
- **Implementa `dispose`** si abres conexiones, ficheros o procesos.
- **No dependas de otro módulo por su id.** Usa `hasModule(kind)` o el
  contenedor de servicios.
- **Declara dependencias, no escribas `package.json`.** Usa
  `context.dependencies.require(...)` con una `reason` útil: acaba en la
  documentación del proyecto generado.

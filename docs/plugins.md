# Sistema de plugins

Un plugin es un objeto con nombre, version y una funcion `register` que recibe
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

## Que puede hacer un plugin

| Metodo de `api` | Para que |
|-----------------|----------|
| `onEvent(name, handler, opts?)` | Observar el pipeline |
| `onTransform(name, handler, opts?)` | Modificar requisitos, blueprint, despliegue o ficheros |
| `registerModule(module)` | Aportar un modulo de ampliacion (optimizador, auditor, testeador, documentador) |
| `registerFrontendAdapter(adapter)` | Anadir un framework de frontend |
| `registerBackendAdapter(adapter)` | Anadir un runtime de backend |
| `registerDeploymentAdapter(adapter)` | Anadir un destino de despliegue |
| `registerRequirementsEnricher(enricher)` | Refinar el analisis de requisitos (aqui entra un LLM) |
| `provide(token, value)` / `resolve(token)` | Publicar y consumir servicios entre plugins |
| `hasModule(kind)` | Adaptar el comportamiento a lo que haya cargado |
| `api.options` | Opciones de este plugin, tomadas de la configuracion |
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

## Configuracion declarativa

`calecosystem.config.json` en la raiz del proyecto:

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

Es el caso mas comun y el de mayor valor comercial.

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

`scaffold` puede ser sincrono o asincrono y devuelve `VirtualFile[]`. El
`Scaffolder` los anade al arbol y detecta colisiones: si dos adaptadores
escriben la misma ruta, la generacion falla con los nombres de ambos en lugar
de que uno pise al otro en silencio.

## Escribir un modulo de ampliacion

Un modulo implementa `EcosystemModule` y se ejecuta en la fase `augment`.

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

El contexto es de solo lectura salvo `emit` y `warn`: un modulo no muta el
arbol de otro, **aporta el suyo**. Si dos modulos necesitan negociar, el sitio
correcto es un hook de transformacion, no la mutacion cruzada.

Un modulo que lanza no tumba la generacion: se registra el fallo en
`result.warnings` y el pipeline continua. Una auditoria caida no puede dejar a
un equipo sin su proyecto.

## Buenas practicas

- **Un plugin, una responsabilidad.** Es mas facil de versionar y de facturar.
- **Declara `requires`.** Depender del orden de carga por casualidad es una
  bomba de relojeria.
- **Declara el `tier` real.** El kernel lo respeta; la coherencia comercial
  del catalogo depende de ello.
- **Implementa `dispose`** si abres conexiones, ficheros o procesos.
- **No dependas de otro modulo por su id.** Usa `hasModule(kind)` o el
  contenedor de servicios.

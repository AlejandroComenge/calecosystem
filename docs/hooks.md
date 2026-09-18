# Puntos de extensión: hooks

Todo lo que el pipeline hace es interceptable. Esta es la referencia completa.

> Los hooks intervienen **dentro** del pipeline. Para envolver la ejecución
> entera (cuotas, autorización, medición de extremo a extremo) el mecanismo es
> el middleware; ver [`plugins.md`](plugins.md#escribir-un-middleware).

## Dos familias

| | Eventos (`onEvent`) | Transformaciones (`onTransform`) |
|---|---|---|
| Propósito | Observar | Modificar el valor que circula |
| Valor de retorno | Se ignora | Alimenta al siguiente handler |
| Si el handler falla | Se registra, el pipeline continua | **Detiene el pipeline** |
| Si devuelve `undefined` | Irrelevante | Se conserva el valor anterior (con aviso) |

La asimetria es intencionada: un plugin de telemetría roto no debe impedir que
un equipo reciba su proyecto, pero un blueprint corrupto no puede seguir
avanzando.

## Transformaciones

| Hook | Payload | Cuando | Para que sirve |
|------|---------|--------|----------------|
| `requirements:analyzed` | `RequirementsModel` | Tras analizar el texto | Corregir o enriquecer entidades, roles y capacidades detectadas |
| `blueprint:planned` | `Blueprint` | Tras decidir la arquitectura | Imponer política corporativa: stack obligatorio, capas propias |
| `deployment:planned` | `DeploymentPlan` | Antes de emitir contenedores y CI | Cambiar destino, servicios o secretos según el entorno del cliente |
| `files:finalized` | `readonly VirtualFile[]` | Antes de cerrar el resultado | Añadir, filtrar o reescribir ficheros del árbol completo |

## Eventos

| Hook | Payload | Cuando |
|------|---------|--------|
| `plugin:registered` | `{ name, version }` | Al registrarse cada plugin |
| `module:registered` | `{ descriptor }` | Al registrarse cada módulo |
| `pipeline:phase-start` | `{ phase }` | Al empezar cada una de las cinco fases |
| `pipeline:phase-end` | `{ phase, durationMs }` | Al terminar cada fase |
| `module:before-run` | `{ descriptor }` | Antes de ejecutar un módulo de ampliación |
| `module:after-run` | `{ descriptor, report }` | Después, con su informe |
| `file:emitted` | `{ file }` | Cada vez que un módulo aporta un fichero |
| `generation:completed` | `GenerationResult` | Al terminar con exito |
| `generation:failed` | `{ error, phase }` | Al abortar, indicando la fase |

## Orden de ejecución

Determinista, siempre:

1. `priority` ascendente (por defecto `100`; menor se ejecuta antes).
2. A igualdad de prioridad, orden de registro.

Sin esta garantía, dos ejecuciones identicas podrían producir proyectos
distintos, y la reproducibilidad es una promesa del producto.

## Ejemplo: política corporativa

Un cliente que obliga a PostgreSQL y a Kubernetes, sin tocar el generador:

```ts
import { definePlugin } from '@calecosystem/core';

export default definePlugin({
  name: 'acme-policy',
  version: '1.0.0',
  register(api) {
    api.onTransform(
      'blueprint:planned',
      (blueprint) => ({
        ...blueprint,
        stack: { ...blueprint.stack, database: 'postgres' },
        decisions: [
          ...blueprint.decisions,
          {
            id: 'ADR-ACME-DB',
            title: 'Motor de datos corporativo',
            choice: 'postgres',
            rationale: 'Politica de datos de ACME: un unico motor soportado por Plataforma.',
            alternatives: ['mysql', 'mongodb'],
          },
        ],
      }),
      { priority: 10 },   // antes que cualquier otro ajuste
    );

    api.onTransform('deployment:planned', (plan) => ({ ...plan, target: 'kubernetes' }));
  },
});
```

Añadir la decisión a `blueprint.decisions` no es adorno: hace que el README y
`docs/ARCHITECTURE.md` del proyecto generado expliquen de donde sale esa
imposición, en vez de que alguien la descubra seis meses después.

## Ejemplo: observar sin interferir

```ts
api.onEvent('pipeline:phase-end', ({ phase, durationMs }) => {
  metrics.histogram('calec.phase.duration', durationMs, { phase });
});

api.onEvent('module:after-run', ({ descriptor, report }) => {
  if (report.score !== null && report.score < 50) {
    alerts.notify(`${descriptor.displayName} puntuo ${report.score}/100`);
  }
});
```

## Reglas para escribir handlers

- **No mutes el payload.** Devuelve un objeto nuevo. Los payloads son
  `readonly` en el tipo, pero TypeScript no lo impide en tiempo de ejecución.
- **Devuelve siempre un valor en las transformaciones.** Olvidarlo conserva el
  valor anterior y deja un aviso en el log, pero es un error silencioso caro
  de diagnosticar.
- **Usa `priority` solo cuando el orden importe de verdad.** Si dos plugins
  compiten por ser el primero, el problema suele estar en el diseño.
- **Los handlers pueden ser asincronos.** Se esperan uno a uno.

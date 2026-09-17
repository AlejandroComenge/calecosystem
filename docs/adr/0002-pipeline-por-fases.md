# ADR-0002: Pipeline por fases con blueprint intermedio

- **Estado:** aceptada
- **Fecha:** 2026-09-17

## Contexto

Un generador puede ir directo del texto a los ficheros. Es lo mas simple y lo
que hacen casi todos. El problema aparece cuando otro modulo quiere intervenir:
solo puede hacerlo sobre codigo ya escrito, que es el momento mas caro para
cambiar una decision.

## Decision

Cinco fases con dos representaciones intermedias explicitas:

```
texto -> RequirementsModel -> Blueprint -> FileTree -> GenerationResult
       [analyze]          [plan]        [scaffold]  [augment + finalize]
```

Nada se escribe en disco hasta que el arbol completo existe en memoria y los
cinco modulos han opinado sobre el.

## Consecuencias

**A favor**

- Cambiar una decision en el blueprint cuesta una linea; cambiarla en 70
  ficheros generados, una regeneracion completa.
- El auditor revisa el proyecto **antes** de que exista.
- Las pruebas verifican arquitectura y scaffolding por separado, y ninguna
  escribe en disco.
- Un fallo tardio no deja medio proyecto escrito.
- El documentador tiene acceso a las decisiones **y a sus alternativas
  descartadas**, que es lo que de verdad hace falta documentar.

**En contra**

- Dos modelos de datos que mantener sincronizados con el codigo generado.
- Todo el arbol vive en memoria. Irrelevante a 70 ficheros y 68 KB; habria que
  revisarlo con proyectos de otro orden de magnitud.

## Alternativas descartadas

- **Generacion directa por plantillas:** mas simple, pero deja a los otros
  cuatro modulos sin punto de intervencion util. Habria convertido el
  ecosistema en un generador con cuatro herramientas de postproceso.
- **Escritura en disco por fases:** permitiria proyectos enormes, a costa de
  perder atomicidad y de complicar las pruebas. Se reconsiderara si aparece el
  caso de uso que lo justifique.

# ADR-0002: Pipeline por fases con blueprint intermedio

- **Estado:** aceptada
- **Fecha:** 2026-09-17

## Contexto

Un generador puede ir directo del texto a los ficheros. Es lo más simple y lo
que hacen casi todos. El problema aparece cuando otro módulo quiere intervenir:
solo puede hacerlo sobre código ya escrito, que es el momento más caro para
cambiar una decisión.

## Decisión

Cinco fases con dos representaciones intermedias explicitas:

```
texto -> RequirementsModel -> Blueprint -> FileTree -> GenerationResult
       [analyze]          [plan]        [scaffold]  [augment + finalize]
```

Nada se escribe en disco hasta que el árbol completo existe en memoria y los
cinco módulos han opinado sobre el.

## Consecuencias

**A favor**

- Cambiar una decisión en el blueprint cuesta una línea; cambiarla en 70
  ficheros generados, una regeneración completa.
- El auditor revisa el proyecto **antes** de que exista.
- Las pruebas verifican arquitectura y scaffolding por separado, y ninguna
  escribe en disco.
- Un fallo tardio no deja medio proyecto escrito.
- El documentador tiene acceso a las decisiones **y a sus alternativas
  descartadas**, que es lo que de verdad hace falta documentar.

**En contra**

- Dos modelos de datos que mantener sincronizados con el código generado.
- Todo el árbol vive en memoria. Irrelevante a 70 ficheros y 68 KB; habría que
  revisarlo con proyectos de otro orden de magnitud.

## Alternativas descartadas

- **Generación directa por plantillas:** más simple, pero deja a los otros
  cuatro módulos sin punto de intervención útil. Habría convertido el
  ecosistema en un generador con cuatro herramientas de postproceso.
- **Escritura en disco por fases:** permitiria proyectos enormes, a costa de
  perder atomicidad y de complicar las pruebas. Se reconsiderara si aparece el
  caso de uso que lo justifique.

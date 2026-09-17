# ADR-0001: Kernel minimo con modulos enchufables

- **Estado:** aceptada
- **Fecha:** 2026-09-17

## Contexto

El ecosistema tiene cinco componentes que deben poder venderse por separado,
versionarse por separado y, a la vez, compartir contexto: el auditor necesita
saber que decidio el generador.

Tres opciones sobre la mesa:

1. **Monolito con cinco funciones.** Rapido de escribir. Imposible de empaquetar
   comercialmente por partes y con todos los equipos en los mismos ficheros.
2. **Cinco productos independientes** que se comunican por ficheros o API.
   Excelente para vender. Cada producto vuelve a deducir el contexto desde
   cero, que es justo lo que queriamos evitar.
3. **Kernel minimo + modulos enchufables** con modelo de datos compartido.

## Decision

Opcion 3. Un kernel que solo sabe cargar plugins en orden determinista,
exponer puntos de extension y resolver capacidades. Todo lo demas, incluido el
generador principal, es un plugin.

## Consecuencias

**A favor**

- Cada modulo se publica, versiona y factura por separado.
- Un tercero extiende el sistema sin tocar el nucleo, y por tanto sin pedir
  permiso ni esperar a una release.
- El contexto compartido (`RequirementsModel`, `Blueprint`) esta disponible
  para todos sin que nadie lo vuelva a deducir.
- El propio generador se carga como plugin, lo que garantiza que la API de
  extension sea suficiente: si no lo fuera, el generador no funcionaria.

**En contra**

- Una capa de indireccion que un monolito no necesitaria.
- Un fallo en el kernel afecta a los cinco modulos.
- Depurar el orden de carga es mas dificil que leer llamadas directas. Se
  mitiga con `calec modules`, que muestra que hay cargado y en que orden.

## Alternativas descartadas

- **Monolito:** descartado por la imposibilidad de empaquetar por componentes,
  que es un requisito de negocio explicito.
- **Productos independientes:** descartado porque destruye la unica ventaja
  competitiva real frente a juntar cinco herramientas de mercado.

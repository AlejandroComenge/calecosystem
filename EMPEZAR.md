# Empezar en 5 minutos

Guía para probar CalEcosystem **sin saber programar**. Todos los comandos son
para copiar y pegar tal cual.

---

## Antes de nada: ¿que es esto?

Escribes en español normal lo que quieres que haga tu web. El sistema te
devuelve el proyecto montado: la parte que ve el usuario, la parte del
servidor, la base de datos, la configuración para publicarlo y la
documentación.

**Lo que NO es:** una web terminada lista para vender. Es el andamiaje, que es
justo la parte aburrida y cara. Un programador tiene que terminar el trabajo.

---

## Paso 1 — Comprobar que tienes Node

Abre una terminal y escribe:

```bash
node --version
```

**Tiene que decir `v22.18.0` o superior.** Si dice menos, o dice que el comando
no existe, descarga Node desde [nodejs.org](https://nodejs.org) (elige la
versión "LTS") y vuelve a intentarlo.

> ⚠️ Este es el fallo número uno. Con una versión antigua nada funciona y el
> error que sale no te dice por qué.

---

## Paso 2 — Descargar el proyecto

```bash
git clone -b claude/exciting-einstein-g9ht6l https://github.com/AlejandroComenge/calecosystem
cd calecosystem
npm install
```

Tarda unos segundos. Al terminar verás algo como `added 13 packages`.

---

## Paso 3 — Comprobar que todo está bien

```bash
npm run verify
```

Al final tiene que poner:

```
# tests 247
# pass 247
# fail 0
```

**Si pone `fail 0`, todo correcto.** Si sale otra cosa, para aquí: lo demas
tampoco funcionará.

---

## Paso 4 — Abrir la aplicación web

Esta es la forma más cómoda de usarlo: sin comandos, en el navegador.

```bash
npm run studio
```

Verás algo así:

```
  CalEcosystem Studio
  Abre esta dirección en el navegador: http://127.0.0.1:4173

  Plan activo: enterprise. Ctrl+C para parar.
```

Abre esa dirección en el navegador. **Fíjate en el puerto que imprime tu
terminal**: es el que vale. Si ves `NO SE PUEDE ACCEDER A ESTE SITIO WEB`,
casi siempre es que has abierto una dirección distinta a la que dice ahí.

Deja esa ventana de la terminal abierta: mientras esté abierta, el servidor
está encendido. Si la cierras, la web deja de responder.

Ahí puedes:

1. Escribir tu proyecto en español (o pulsar **Usar un ejemplo**).
2. Pulsar **Analizar** para ver qué decide y por qué, sin generar nada.
3. Pulsar **Generar y descargar** para recibir el proyecto en un ZIP.

Para pararlo, `Ctrl+C` en la terminal.

> Todo ocurre en tu ordenador: tu descripción no sale de esa ventana.

## Paso 5 — Ver la demostración comercial

```bash
npm run demo:comercial
```

Es una presentación en la terminal, paso a paso, de unos 30 segundos. Te
cuenta el problema, te enseña una tienda online generada de cero y termina con
el cálculo de cuánto dinero ahorra.

Si tienes prisa, sin pausas:

```bash
npm run demo:comercial -- --rapido
```

---

## Paso 6 — Probar con ejemplos preparados

No tienes que inventarte nada. Hay 8 ejemplos listos:

```bash
npm run calec -- examples
```

Sale una lista como esta:

```
Ejemplos disponibles (8). Para ver uno: calec examples <id>

  tienda           Tienda online (e-commerce)
                   Comercios que venden productos por internet

  saas             Aplicación SaaS por suscripción
                   Productos que se venden como servicio mensual

  landing          Landing de captación
                   Lanzamientos de producto y campañas de marketing

  panel            Panel interno de gestión
                   Equipos que gestionan datos de negocio a diario
  ...
```

Para ver uno concreto, con el comando exacto ya escrito:

```bash
npm run calec -- examples tienda
```

Te da el comando completo. **Cópialo y pégalo.** Genera la tienda en la carpeta
`pruebas/tienda`.

---

## Paso 7 — Mirar lo que ha creado

```bash
cd pruebas/tienda
ls
```

Verás esto:

```
README.md          <- explica el proyecto y por qué se eligio cada cosa
apps/              <- el código: `web` es lo que ve el usuario, `api` el servidor
docs/              <- documentacion tecnica
docker-compose.yml <- para arrancarlo todo con un comando
package.json       <- la lista de piezas que usa
```

Lo más interesante para alguien que no programa:

```bash
cat README.md
```

Ahí esta, en español, que tecnologias se eligieron, **por qué**, que riesgos
tiene el proyecto y que preguntas quedaron sin responder.

---

## Paso 8 — Comprobar que el código generado funciona de verdad

Esto es lo que separa una demo de un producto. El sistema entrega pruebas
automáticas y **se pueden ejecutar sin instalar nada**:

```bash
node --test "apps/api/src/domain/*.test.ts"
```

Tiene que terminar con `fail 0`. Significa que las reglas de negocio
generadas (calcular el total de un carrito, validar datos, redondear precios)
funcionan correctamente.

---

## Paso 9 — Probar con TU idea

Ahora lo importante. Describe tu proyecto en español, en 3 o 4 frases:

```bash
npm run calec -- plan "Quiero una web para mi academia de idiomas. Los alumnos se apuntan a cursos, pagan la mensualidad online y los profesores gestionan las clases y la asistencia."
```

`plan` solo te enseña **que haría**, sin crear nada. Cuando te convenza,
cambia `plan` por `generate` y añade donde guardarlo:

```bash
npm run calec -- generate "Quiero una web para mi academia de idiomas. Los alumnos se apuntan a cursos, pagan la mensualidad online y los profesores gestionan las clases y la asistencia." --out ./pruebas/academia
```

---

## Cosas que te van a pasar (y son normales)

| Lo que ves | Qué significa |
|---|---|
| El comando "falla" con código 1 | **Es correcto.** Avisa de que hay cosas críticas pendientes (la seguridad está a medias a propósito). El proyecto se ha creado igual. |
| Solo aparece un informe, el de documentación | Estas en el plan gratuito. Los otros tres módulos son de pago. Ver abajo como probarlos. |
| Puntuaciones bajas (36/100, 7/100) | **Es el sistema funcionando.** Te está diciendo lo que falta en vez de fingir que está terminado. |
| Con Vue o Angular sale menos código | Las plantillas avanzadas solo funcionan en React por ahora. Está documentado como limitación. |

### Ver los cuatro módulos de pago

```bash
CALEC_LICENSE_TIER=enterprise npm run calec -- generate "tu descripcion" --dry-run
```

(`--dry-run` significa "enseñame lo que harias, pero no crees nada")

---

## Chuleta de comandos

| Quiero... | Comando |
|---|---|
| **Abrir la aplicación web** | `npm run studio` |
| Ver los ejemplos | `npm run calec -- examples` |
| Ver un ejemplo concreto | `npm run calec -- examples tienda` |
| Ver que haría, sin crear nada | `npm run calec -- plan "mi idea"` |
| Crear el proyecto | `npm run calec -- generate "mi idea" --out ./pruebas/mi-web` |
| Ver la demo para clientes | `npm run demo:comercial` |
| Comprobar que todo funciona | `npm run verify` |
| Probar los 8 ejemplos de golpe | `npm run validate` |
| Ver mi consumo del mes | `npm run calec -- usage --user tu-nombre` |
| Ver la ayuda completa | `npm run calec -- help` |

> El `--` después de `calec` **es obligatorio**. Separa las opciones de npm de
> las del programa. Si lo olvidas, las opciones se pierden.

---

## Si algo va mal

| Error | Solución |
|---|---|
| `ERR_INVALID_TYPESCRIPT_SYNTAX` | Tu Node es antiguo. Necesitas 22.18 o superior. |
| `command not found: npm` | No tienes Node instalado. Descargalo de nodejs.org. |
| `EMPTY_REQUIREMENTS` | Tu descripción es muy corta. Escribe al menos 2 o 3 frases. |
| `QUOTA_EXCEEDED` | Has llegado al límite del plan gratuito (10 al mes). |
| Las opciones no hacen nada | Te falta el `--` después de `calec`. |

---

## Y después, ¿qué?

- **[Página de demostración](https://claude.ai/artifact/GmgDzFTqHzQzuQyMrWFLha)** — para enseñar el producto a alguien sin instalar nada.
- **`docs/PRUEBAS.md`** — como probar cada tipo de web a fondo.
- **`docs/case-study-ecommerce.md`** — el caso de la tienda con todos los números.
- **`docs/demo-comercial.md`** — guion de venta y argumentos por plan.
- **`README.md`** — la visión completa del producto.

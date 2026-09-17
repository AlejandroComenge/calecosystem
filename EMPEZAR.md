# Empezar en 5 minutos

Guia para probar CalEcosystem **sin saber programar**. Todos los comandos son
para copiar y pegar tal cual.

---

## Antes de nada: ¿que es esto?

Escribes en espanol normal lo que quieres que haga tu web. El sistema te
devuelve el proyecto montado: la parte que ve el usuario, la parte del
servidor, la base de datos, la configuracion para publicarlo y la
documentacion.

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
version "LTS") y vuelve a intentarlo.

> ⚠️ Este es el fallo numero uno. Con una version antigua nada funciona y el
> error que sale no te dice por que.

---

## Paso 2 — Descargar el proyecto

```bash
git clone -b claude/exciting-einstein-g9ht6l https://github.com/AlejandroComenge/calecosystem
cd calecosystem
npm install
```

Tarda unos segundos. Al terminar veras algo como `added 13 packages`.

---

## Paso 3 — Comprobar que todo esta bien

```bash
npm run verify
```

Al final tiene que poner:

```
# tests 247
# pass 247
# fail 0
```

**Si pone `fail 0`, todo correcto.** Si sale otra cosa, para aqui: lo demas
tampoco funcionara.

---

## Paso 4 — Ver la demostracion

```bash
npm run demo:comercial
```

Es una presentacion en la terminal, paso a paso, de unos 30 segundos. Te
cuenta el problema, te enseña una tienda online generada de cero y termina con
el calculo de cuanto dinero ahorra.

Si tienes prisa, sin pausas:

```bash
npm run demo:comercial -- --rapido
```

---

## Paso 5 — Probar con ejemplos preparados

No tienes que inventarte nada. Hay 8 ejemplos listos:

```bash
npm run calec -- examples
```

Sale una lista como esta:

```
Ejemplos disponibles (8). Para ver uno: calec examples <id>

  tienda           Tienda online (e-commerce)
                   Comercios que venden productos por internet

  saas             Aplicacion SaaS por suscripcion
                   Productos que se venden como servicio mensual

  landing          Landing de captacion
                   Lanzamientos de producto y campanas de marketing

  panel            Panel interno de gestion
                   Equipos que gestionan datos de negocio a diario
  ...
```

Para ver uno concreto, con el comando exacto ya escrito:

```bash
npm run calec -- examples tienda
```

Te da el comando completo. **Copialo y pegalo.** Genera la tienda en la carpeta
`pruebas/tienda`.

---

## Paso 6 — Mirar lo que ha creado

```bash
cd pruebas/tienda
ls
```

Veras esto:

```
README.md          <- explica el proyecto y por que se eligio cada cosa
apps/              <- el codigo: `web` es lo que ve el usuario, `api` el servidor
docs/              <- documentacion tecnica
docker-compose.yml <- para arrancarlo todo con un comando
package.json       <- la lista de piezas que usa
```

Lo mas interesante para alguien que no programa:

```bash
cat README.md
```

Ahi esta, en espanol, que tecnologias se eligieron, **por que**, que riesgos
tiene el proyecto y que preguntas quedaron sin responder.

---

## Paso 7 — Comprobar que el codigo generado funciona de verdad

Esto es lo que separa una demo de un producto. El sistema entrega pruebas
automaticas y **se pueden ejecutar sin instalar nada**:

```bash
node --test "apps/api/src/domain/*.test.ts"
```

Tiene que terminar con `fail 0`. Significa que las reglas de negocio
generadas (calcular el total de un carrito, validar datos, redondear precios)
funcionan correctamente.

---

## Paso 8 — Probar con TU idea

Ahora lo importante. Describe tu proyecto en espanol, en 3 o 4 frases:

```bash
npm run calec -- plan "Quiero una web para mi academia de idiomas. Los alumnos se apuntan a cursos, pagan la mensualidad online y los profesores gestionan las clases y la asistencia."
```

`plan` solo te enseña **que haria**, sin crear nada. Cuando te convenza,
cambia `plan` por `generate` y anade donde guardarlo:

```bash
npm run calec -- generate "Quiero una web para mi academia de idiomas. Los alumnos se apuntan a cursos, pagan la mensualidad online y los profesores gestionan las clases y la asistencia." --out ./pruebas/academia
```

---

## Cosas que te van a pasar (y son normales)

| Lo que ves | Que significa |
|---|---|
| El comando "falla" con codigo 1 | **Es correcto.** Avisa de que hay cosas criticas pendientes (la seguridad esta a medias a proposito). El proyecto se ha creado igual. |
| Solo aparece un informe, el de documentacion | Estas en el plan gratuito. Los otros tres modulos son de pago. Ver abajo como probarlos. |
| Puntuaciones bajas (36/100, 7/100) | **Es el sistema funcionando.** Te esta diciendo lo que falta en vez de fingir que esta terminado. |
| Con Vue o Angular sale menos codigo | Las plantillas avanzadas solo funcionan en React por ahora. Esta documentado como limitacion. |

### Ver los cuatro modulos de pago

```bash
CALEC_LICENSE_TIER=enterprise npm run calec -- generate "tu descripcion" --dry-run
```

(`--dry-run` significa "enseñame lo que harias, pero no crees nada")

---

## Chuleta de comandos

| Quiero... | Comando |
|---|---|
| Ver los ejemplos | `npm run calec -- examples` |
| Ver un ejemplo concreto | `npm run calec -- examples tienda` |
| Ver que haria, sin crear nada | `npm run calec -- plan "mi idea"` |
| Crear el proyecto | `npm run calec -- generate "mi idea" --out ./pruebas/mi-web` |
| Ver la demo para clientes | `npm run demo:comercial` |
| Comprobar que todo funciona | `npm run verify` |
| Probar los 8 ejemplos de golpe | `npm run validate` |
| Ver mi consumo del mes | `npm run calec -- usage --user tu-nombre` |
| Ver la ayuda completa | `npm run calec -- help` |

> El `--` despues de `calec` **es obligatorio**. Separa las opciones de npm de
> las del programa. Si lo olvidas, las opciones se pierden.

---

## Si algo va mal

| Error | Solucion |
|---|---|
| `ERR_INVALID_TYPESCRIPT_SYNTAX` | Tu Node es antiguo. Necesitas 22.18 o superior. |
| `command not found: npm` | No tienes Node instalado. Descargalo de nodejs.org. |
| `EMPTY_REQUIREMENTS` | Tu descripcion es muy corta. Escribe al menos 2 o 3 frases. |
| `QUOTA_EXCEEDED` | Has llegado al limite del plan gratuito (10 al mes). |
| Las opciones no hacen nada | Te falta el `--` despues de `calec`. |

---

## Y despues, ¿que?

- **[Pagina de demostracion](https://claude.ai/artifact/GmgDzFTqHzQzuQyMrWFLha)** — para enseñar el producto a alguien sin instalar nada.
- **`docs/PRUEBAS.md`** — como probar cada tipo de web a fondo.
- **`docs/case-study-ecommerce.md`** — el caso de la tienda con todos los numeros.
- **`docs/demo-comercial.md`** — guion de venta y argumentos por plan.
- **`README.md`** — la vision completa del producto.

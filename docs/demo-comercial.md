# Demostracion comercial

Material para enseñar el producto a un posible cliente: guion, beneficios con
sus supuestos, y argumentos por plan.

> **Norma de la casa:** todas las cifras de este documento salen de ejecutar el
> producto y estan verificadas por pruebas. Si una deja de ser cierta, la suite
> falla. Un argumento de venta que no se puede reproducir delante del cliente
> no es un argumento, es un riesgo.

---

## 0. La pagina para enviar por adelantado

Antes de la reunion, o para un contacto en frio:

**https://claude.ai/artifact/GmgDzFTqHzQzuQyMrWFLha**

Una pagina con el caso de la tienda: el enunciado, las decisiones con su motivo,
las metricas reales, los hallazgos pendientes y una **calculadora de retorno**
con los supuestos editables. Es util precisamente porque el cliente puede mover
las cifras y ver que el argumento se sostiene con las suyas.

Sirve para calificar: quien llega a la reunion habiendo visto la seccion de
"pendiente antes de produccion" ya ha aceptado la premisa del producto.

## 1. La demo en vivo

```bash
npm run demo:comercial
```

Ocho pasos, unos 30 segundos con pausas. Sin pausas (para grabar):

```bash
npm run demo:comercial -- --rapido
```

Otro caso de ejemplo, si el cliente no es de comercio electronico:

```bash
npm run demo:comercial -- --caso saas
npm run demo:comercial -- --caso landing
npm run demo:comercial -- --caso panel
```

### Que cuenta cada paso

| Paso | Que enseña | Por que esta ahi |
|------|-----------|------------------|
| 1 | El problema: 60-120 h por proyecto | Establece el coste antes de hablar de solucion |
| 2 | El enunciado en lenguaje de negocio | Demuestra que el cliente no necesita saber tecnologia |
| 3 | Las decisiones de arquitectura **y su motivo** | Diferencia frente a un generador de plantillas |
| 4 | El resultado: 117 ficheros en 31 ms | El impacto, en cifras |
| 5 | Las pruebas incluidas, que se ejecutan | Prueba de que no es humo |
| 6 | Lo que los cuatro modulos encuentran | El valor del ecosistema, no de una herramienta |
| 7 | **Lo que NO hace** | Ver abajo |
| 8 | El calculo de retorno, con supuestos | Cierra con el argumento economico |

### Por que el paso 7 existe

El paso 7 enseña los cinco problemas que el sistema deja abiertos: la
autenticacion sin verificar, los listados sin paginar, la carrera de stock.

Es deliberado. Una demo que solo enseña lo bueno gana la reunion y pierde al
cliente tres semanas despues, cuando descubre solo lo que faltaba. Enseñarlo
convierte una objecion futura en una demostracion presente de criterio
tecnico: **el sistema encuentra sus propios limites y los pone por escrito**.

En la practica, este paso es el que mas confianza genera con perfiles
tecnicos, que son quienes vetan la compra.

---

## 2. El guion, frase a frase

### Apertura (30 segundos)

> "Voy a escribir en espanol lo que quiero que haga una web. En treinta
> milisegundos vas a tener el proyecto montado. Y al final te voy a enseñar
> lo que **no** hace, porque eso es lo que decide si esto te sirve."

### Durante el paso 3 (las decisiones)

> "Fijate en que no solo elige PostgreSQL: dice por que. 'El modelo tiene
> relaciones entre entidades y operaciones que deben ser transaccionales'.
> Esto es lo que normalmente se pierde y lo que hace que seis meses despues
> nadie se atreva a cambiar nada."

### Durante el paso 5 (las pruebas)

> "Estas pruebas se ejecutan ahora mismo, sin instalar nada."

Y lo ejecutas de verdad:

```bash
npm run demo:comercial -- --rapido --out /tmp/demo
cd /tmp/demo && node --test "apps/api/src/domain/*.test.ts"
```

### Durante el paso 6 (el ecosistema)

> "Mira esta cadena: la plantilla de tienda sabe que toda tienda tiene una
> carrera de stock, y lo anota como riesgo. El modulo de pruebas, que no sabe
> nada de tiendas, lee ese riesgo y avisa de que no hay ninguna prueba que lo
> cubra. Son dos modulos que no se conocen. Eso no lo consigues juntando
> herramientas sueltas."

### Cierre (paso 8)

> "El coste de arrancar un proyecto a mano es de 3.900 a 7.800 euros. El plan
> Pro cuesta 588 al ano por persona. Se paga con un proyecto. Pero dime tu
> coste por hora y lo recalculamos ahora."

---

## 3. Los beneficios, con sus supuestos

### El calculo

| Supuesto | Valor | De donde sale |
|----------|-------|---------------|
| Coste hora de desarrollador senior | 65 € | Media de mercado en Espana, 2025 |
| Horas de arranque manual por proyecto | 60-120 h | Stack, estructura, despliegue, CI, pruebas y documentacion |
| **Coste de arrancar un proyecto a mano** | **3.900 - 7.800 €** | Producto de los dos anteriores |
| Coste anual del plan Pro, 1 persona | 588 € | 49 € x 12 |
| Coste anual del plan Pro, equipo de 10 | 5.880 € | 49 € x 10 x 12 |

**Punto de equilibrio: un proyecto al ano.** Un equipo de 10 personas que
arranca 4 proyectos anuales evita entre 15.600 y 31.200 € de trabajo repetido
frente a 5.880 € de licencia.

### Lo que el calculo NO dice

Decirlo tu antes de que lo pregunten:

- **Cuanto del tiempo ahorrado se reinvierte en revisar lo generado.** Nadie
  lo ha medido con clientes reales. Es la primera metrica que habria que
  poner en marcha, y para eso esta la telemetria del producto.
- **El ahorro es en andamiaje, no en producto.** La logica de negocio que
  diferencia a la empresa sigue costando lo mismo.
- **La calidad del enunciado condiciona el resultado.** Con tres lineas vagas,
  el sistema baja la confianza y genera preguntas en lugar de inventar.

### Beneficios que no son horas

Suelen pesar mas en la decision que el ahorro directo:

| Beneficio | Por que importa |
|-----------|-----------------|
| **Decisiones documentadas desde el minuto cero** | El coste real de un proyecto heredado no es el codigo: es no saber por que esta hecho asi |
| **Riesgos identificados al inicio, con responsable** | PCI, aislamiento entre clientes, carreras de stock: los que se descubren tarde son los caros |
| **Consistencia entre proyectos** | Cuatro proyectos con la misma estructura se mantienen con un solo criterio |
| **Incorporacion mas rapida** | `docs/ONBOARDING.md` se genera con cada proyecto |
| **Pruebas desde el primer dia** | Cambiar la costumbre de un equipo cuesta mas que escribir las pruebas |

---

## 4. Argumentos por plan

### Community — 0 €

**Para quien:** freelance, equipos pequenos, cualquiera que quiera evaluar.

**El argumento:**
> "Uso comercial permitido, sin limite de tiempo. Diez generaciones al mes son
> tres o cuatro proyectos con sus iteraciones: suficiente para saber si esto
> te sirve."

**Que incluye:** generador completo, documentador, los tres frameworks, las
tres plantillas, catalogo de componentes, 3 proyectos, 1 asiento.

**Por que regalamos tanto:** el generador es lo que demuestra que el sistema
funciona. Cobrarlo obliga a vender antes de demostrar nada. Ademas, la
documentacion generada lleva la marca dentro del repositorio del cliente y la
ve todo el equipo, no solo quien compro.

**Cuando se queda corto:** al cuarto proyecto, o cuando alguien pregunta "¿y
esto es seguro?" — que es justo el ambito de los modulos de pago.

---

### Pro — 49 € por desarrollador y mes

**Para quien:** agencias y equipos de producto que arrancan varios proyectos al
ano.

**El argumento:**
> "El plan gratuito te genera el proyecto. Este te dice lo que le falta para
> ir a produccion. Son tres revisiones automaticas —rendimiento, seguridad y
> cobertura de pruebas— en cada generacion."

**Que anade:** optimizador, auditor de seguridad, testeador, 200 generaciones
al mes, proyectos ilimitados, 25 asientos, integracion en CI, soporte en 2
dias habiles.

**El argumento fuerte, con la demo delante:**
> "En esta tienda el auditor ha encontrado que el webhook de pagos no verifica
> la firma. Eso, en produccion, es alguien falsificando confirmaciones de pago.
> Lo ha encontrado antes de que existiera el codigo."

**Objecion habitual — "es caro para un equipo de 5":**
Es cierta. Cinco personas que arrancan dos proyectos al ano pagan 2.940 € por
un ahorro puntual. Respuesta honesta: tarifa por proyecto para equipos de
menos de cinco, o quedarse en Community hasta que el volumen lo justifique.
Forzar la venta aqui genera una baja a los tres meses.

---

### Enterprise — desde 1.500 €/mes

**Para quien:** organizaciones con varios equipos, requisitos de cumplimiento
o un design system propio.

**El argumento:**
> "A partir de aqui el producto se adapta a como trabajais vosotros: vuestro
> sistema de diseno, vuestra arquitectura de referencia, vuestras politicas
> obligatorias en cada proyecto que se genere."

**Que anade:** plugins privados, plantillas y adaptadores a medida,
instalacion on-premise o aislada, SSO, registro de auditoria, SLA contractual.

**El argumento tecnico decisivo:**
> "Una politica corporativa —'todo va a PostgreSQL y a Kubernetes'— son veinte
> lineas de plugin, y a partir de ahi se aplica sola en cada proyecto que
> genere cualquier equipo. Y queda documentada en el README de cada uno, con
> el motivo."

**Por que el margen es bueno:** los adaptadores y plantillas a medida se
apoyan en el sistema de plugins, no requieren tocar el producto, y el patron
se reutiliza en cada cliente nuevo.

---

## 5. Objeciones frecuentes

| Objecion | Respuesta |
|----------|-----------|
| *"Esto ya lo hace un asistente de codigo con IA"* | Su ventaja es la flexibilidad; la nuestra es la reproducibilidad y el contexto compartido. El mismo enunciado da siempre la misma arquitectura, con las decisiones por escrito, y cuatro revisiones automaticas. Ademas no hay coste por uso ni datos que salgan a ninguna parte. |
| *"El codigo generado no me va a gustar"* | Probablemente algo no. Por eso son adaptadores: el catalogo de componentes y las plantillas se sustituyen sin tocar el nucleo. Enterprise incluye hacerlo con vuestro sistema de diseno. |
| *"¿Y si cierras el negocio?"* | El codigo generado es vuestro, sin dependencias de ejecucion nuestras. Un proyecto generado no deja de funcionar si nosotros desaparecemos. |
| *"No quiero que mi descripcion de negocio salga de aqui"* | No sale. El analisis es local y determinista, sin llamadas a ningun servicio. La telemetria viene desactivada y, activada, solo guarda una huella criptografica del texto. |
| *"¿Cuanto tarda mi equipo en aprenderlo?"* | Un comando. `calec generate "lo que quieras"`. Lo que lleva tiempo es revisar lo generado, igual que revisar el trabajo de alguien. |
| *"Las puntuaciones son muy bajas"* | Son bajas a proposito: miden lo que falta para produccion, no la calidad de lo generado. Un 100/100 recien generado significaria que el sistema no esta mirando. |

---

## 6. Preparar la demo

Antes de una reunion:

```bash
npm run verify     # 247 pruebas en verde
npm run validate   # los 8 ejemplos generan codigo valido
```

Si alguno falla, **no hagas la demo**. Un fallo en directo cuesta mas que
aplazar la reunion.

Prueba el guion completo una vez con `--rapido` para verificar que todo sale
como esperas con el caso que vas a enseñar.

### Si el cliente quiere probarlo el mismo

Dale `EMPEZAR.md`. Esta escrito para alguien que no programa, con comandos
para copiar y pegar y una tabla de "cosas raras que te van a pasar y son
normales".

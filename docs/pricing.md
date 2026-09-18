# Estructura de precios

> **Aviso.** Las cifras de este documento son un punto de partida razonado, no
> un precio validado con clientes. Están calculadas sobre supuestos explicitos
> para que se puedan discutir y corregir con datos reales. Cualquier número sin
> supuesto detrás es una opinión disfrazada.

## 1. Principio: que se regala y por qué

El generador y el documentador son **gratuitos y sin límite de proyectos**.
No es generosidad, es distribución:

- El generador es lo que demuestra que el sistema funciona. Cobrarlo obliga a
  vender antes de demostrar nada.
- La documentación generada lleva la marca dentro del repositorio del cliente
  y la ve todo el equipo, no solo quien compro.
- Los módulos de pago (optimizador, auditor, testeador) resuelven problemas que
  **solo se aprecian después** de haber generado algo. Regalar el primer paso
  es lo que crea la necesidad del segundo.

Lo que se cobra es lo que evita un coste medible: una vulnerabilidad en
producción, una migración de base de datos a los seis meses, una batería de
pruebas escrita a mano.

## 2. Planes

| | **Community** | **Pro** | **Enterprise** |
|---|---|---|---|
| **Precio** | 0 € | 49 €/desarrollador/mes | desde 1.500 €/mes |
| **Facturación** | — | anual o mensual (+20%) | anual |
| Generador de código base | ✅ | ✅ | ✅ |
| Documentador inteligente | ✅ | ✅ | ✅ |
| React / Vue / Angular | ✅ | ✅ | ✅ |
| Plantillas de producto (e-commerce, SaaS, landing) | ✅ | ✅ | ✅ |
| Catálogo de componentes | ✅ | ✅ | ✅ |
| Generaciones al mes | 10 | 200 | ilimitadas |
| Proyectos | 3 | ilimitados | ilimitados |
| Asientos | 1 | 25 | ilimitados |
| Optimizador de rendimiento | — | ✅ | ✅ |
| Auditor de seguridad | — | ✅ | ✅ |
| Testeador automático | — | ✅ | ✅ |
| Integración en CI | — | ✅ | ✅ |
| Plantillas de producto a medida | — | — | ✅ |
| Plugins privados de la organización | — | — | ✅ |
| Adaptadores a medida (design system propio) | — | — | ✅ |
| Instalación on-premise / air-gapped | — | — | ✅ |
| SSO y registro de auditoría | — | — | ✅ |
| Soporte | comunidad | 2 días hábiles | SLA contractual |

**Uso comercial permitido en los tres planes.** Un plan gratuito que prohibe
ganar dinero con lo generado no lo usa nadie.

Las cuotas están elegidas para que el plan gratuito permita **evaluar el
producto de verdad**, no probarlo una vez: diez generaciones al mes son tres o
cuatro proyectos con sus iteraciones. Como se aplican en el código, en
[`usage-limits.md`](usage-limits.md).

## 3. Precio por componente

Para quien solo quiere una pieza. Los módulos sueltos cuestan más por unidad
que el paquete: el valor del ecosistema está en la combinación, y el precio
debe reflejarlo.

| Componente | Plan mínimo | Suelto | Qué problema evita |
|-----------|-------------|--------|--------------------|
| **1. Generador de código base** | Community | — (gratuito) | 2-6 semanas de arranque repetido |
| **2. Optimizador de rendimiento** | Pro | 19 €/dev/mes | Rediseños por decisiones que no escalan |
| **3. Auditor de seguridad** | Pro | 25 €/dev/mes | Incidentes y hallazgos en auditoría externa |
| **4. Testeador automático** | Pro | 19 €/dev/mes | Batería inicial escrita a mano |
| **5. Documentador inteligente** | Community | — (gratuito) | Incorporación lenta, decisiones perdidas |
| **Paquete Pro (2+3+4)** | — | **49 €/dev/mes** | 24% de descuento sobre los tres sueltos |

### Complementos Enterprise

| Complemento | Precio orientativo | Modelo |
|-------------|--------------------|--------|
| Adaptador de frontend a medida | 6.000-15.000 € | Proyecto cerrado |
| Plantilla de producto a medida (vertical del cliente) | 9.000-20.000 € | Proyecto cerrado |
| Plantilla corporativa (design system + arquitectura propia) | 12.000-30.000 € | Proyecto cerrado |
| Formación e implantación | 3.500 €/sesión | Por sesión |
| Soporte con SLA de 4 horas | +30% sobre la licencia | Recurrente |

Los adaptadores y plantillas a medida son los complementos con mejor margen:
se apoyan en el sistema de plugins, no requieren tocar el producto y su coste
marginal cae en cada nuevo cliente porque el patron se reutiliza. Las tres
plantillas incluidas son la prueba de que el mecanismo funciona: entre las tres
suman menos de 1.500 líneas.

## 4. Marketplace de plugins

El sistema de plugins existe para que el catálogo crezca sin que crezca el
equipo.

- **Reparto 70/30** a favor del autor del plugin.
- Los plugins declaran su propio `tier`; el kernel los activa según licencia.
- Plugins privados de organización: incluidos en Enterprise.

Es una apuesta a medio plazo, no una fuente de ingresos del primer año: un
marketplace sin usuarios no atrae autores, y sin autores no atrae usuarios.
El orden correcto es primero la base instalada del plan gratuito.

## 5. Supuestos económicos

Para que las cifras se puedan discutir:

| Supuesto | Valor | Origen |
|----------|-------|--------|
| Coste de un desarrollador senior | ~65 €/hora | Media de mercado en España, 2025 |
| Arranque manual de un proyecto | 60-120 horas | Stack, despliegue, CI, pruebas y documentación |
| Coste evitado por proyecto | 3.900-7.800 € | Producto de los dos anteriores |
| Proyectos nuevos al año, equipo de 10 | 4-8 | Agencia o producto con varias líneas |
| Coste anual del plan Pro, 10 devs | 5.880 € | 49 € x 10 x 12 |

Con un solo proyecto al año el plan Pro ya se paga. El argumento de venta no
es "generamos código más rápido", es **"el coste de arrancar un proyecto deja
de ser una variable del presupuesto"**.

Lo que estos números **no** dicen: cuánto del tiempo ahorrado se recupera de
verdad y cuánto se reinvierte en revisar lo generado. Es la primera métrica
que habría que medir con clientes reales, y la que decide si el precio está
bien puesto. La telemetría (`@calecosystem/telemetry`) está puesta para poder
responderla con datos en vez de con intuiciones; el caso medido está en
[`case-study-ecommerce.md`](case-study-ecommerce.md).

## 6. Riesgos del modelo

Enumerados porque afectan a la decisión, no como formalismo:

1. **El plan gratuito puede canibalizar al de pago.** Si el proyecto generado
   parece suficiente, nadie sube a Pro. Mitigación doble: el generador dice en
   voz alta lo que no ha comprobado (y esa lista es exactamente el ámbito de
   los módulos de pago), y la cuota de 10 generaciones al mes marca el momento
   en que un equipo que ya obtuvo valor tiene que decidir.
2. **Precio por desarrollador en equipos pequeños.** Cinco personas que
   arrancan dos proyectos al año pagan 2.940 € por un ahorro puntual.
   Mitigación: tarifa por proyecto para equipos de menos de cinco.
3. **Dependencia del criterio del auditor.** Un falso positivo ruidoso destruye
   la confianza más rápido de lo que un hallazgo útil la construye. Mitigación:
   el auditor declara explicitamente su alcance y lo que deja fuera.
4. **Competencia de los asistentes de código generalistas.** Su ventaja es la
   flexibilidad; la nuestra, el contexto compartido entre fases y la
   reproducibilidad. El día que eso deje de ser cierto, el modelo necesita
   revisión, no ajuste de precio.

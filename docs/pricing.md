# Estructura de precios

> **Aviso.** Las cifras de este documento son un punto de partida razonado, no
> un precio validado con clientes. Estan calculadas sobre supuestos explicitos
> para que se puedan discutir y corregir con datos reales. Cualquier numero sin
> supuesto detras es una opinion disfrazada.

## 1. Principio: que se regala y por que

El generador y el documentador son **gratuitos y sin limite de proyectos**.
No es generosidad, es distribucion:

- El generador es lo que demuestra que el sistema funciona. Cobrarlo obliga a
  vender antes de demostrar nada.
- La documentacion generada lleva la marca dentro del repositorio del cliente
  y la ve todo el equipo, no solo quien compro.
- Los modulos de pago (optimizador, auditor, testeador) resuelven problemas que
  **solo se aprecian despues** de haber generado algo. Regalar el primer paso
  es lo que crea la necesidad del segundo.

Lo que se cobra es lo que evita un coste medible: una vulnerabilidad en
produccion, una migracion de base de datos a los seis meses, una bateria de
pruebas escrita a mano.

## 2. Planes

| | **Community** | **Pro** | **Enterprise** |
|---|---|---|---|
| **Precio** | 0 € | 49 €/desarrollador/mes | desde 1.500 €/mes |
| **Facturacion** | — | anual o mensual (+20%) | anual |
| Generador de codigo base | ✅ | ✅ | ✅ |
| Documentador inteligente | ✅ | ✅ | ✅ |
| React / Vue / Angular | ✅ | ✅ | ✅ |
| Proyectos generados | ilimitados | ilimitados | ilimitados |
| Optimizador de rendimiento | — | ✅ | ✅ |
| Auditor de seguridad | — | ✅ | ✅ |
| Testeador automatico | — | ✅ | ✅ |
| Integracion en CI | — | ✅ | ✅ |
| Plugins privados de la organizacion | — | — | ✅ |
| Adaptadores a medida (design system propio) | — | — | ✅ |
| Instalacion on-premise / air-gapped | — | — | ✅ |
| SSO y registro de auditoria | — | — | ✅ |
| Soporte | comunidad | 2 dias habiles | SLA contractual |

**Uso comercial permitido en los tres planes.** Un plan gratuito que prohibe
ganar dinero con lo generado no lo usa nadie.

## 3. Precio por componente

Para quien solo quiere una pieza. Los modulos sueltos cuestan mas por unidad
que el paquete: el valor del ecosistema esta en la combinacion, y el precio
debe reflejarlo.

| Componente | Plan minimo | Suelto | Que problema evita |
|-----------|-------------|--------|--------------------|
| **1. Generador de codigo base** | Community | — (gratuito) | 2-6 semanas de arranque repetido |
| **2. Optimizador de rendimiento** | Pro | 19 €/dev/mes | Rediseños por decisiones que no escalan |
| **3. Auditor de seguridad** | Pro | 25 €/dev/mes | Incidentes y hallazgos en auditoria externa |
| **4. Testeador automatico** | Pro | 19 €/dev/mes | Bateria inicial escrita a mano |
| **5. Documentador inteligente** | Community | — (gratuito) | Incorporacion lenta, decisiones perdidas |
| **Paquete Pro (2+3+4)** | — | **49 €/dev/mes** | 24% de descuento sobre los tres sueltos |

### Complementos Enterprise

| Complemento | Precio orientativo | Modelo |
|-------------|--------------------|--------|
| Adaptador de frontend a medida | 6.000-15.000 € | Proyecto cerrado |
| Plantilla corporativa (design system + arquitectura propia) | 12.000-30.000 € | Proyecto cerrado |
| Formacion e implantacion | 3.500 €/sesion | Por sesion |
| Soporte con SLA de 4 horas | +30% sobre la licencia | Recurrente |

Los adaptadores a medida son el complemento con mejor margen: se apoyan en el
sistema de plugins, no requieren tocar el producto y su coste marginal cae en
cada nuevo cliente porque el patron se reutiliza.

## 4. Marketplace de plugins

El sistema de plugins existe para que el catalogo crezca sin que crezca el
equipo.

- **Reparto 70/30** a favor del autor del plugin.
- Los plugins declaran su propio `tier`; el kernel los activa segun licencia.
- Plugins privados de organizacion: incluidos en Enterprise.

Es una apuesta a medio plazo, no una fuente de ingresos del primer ano: un
marketplace sin usuarios no atrae autores, y sin autores no atrae usuarios.
El orden correcto es primero la base instalada del plan gratuito.

## 5. Supuestos economicos

Para que las cifras se puedan discutir:

| Supuesto | Valor | Origen |
|----------|-------|--------|
| Coste de un desarrollador senior | ~65 €/hora | Media de mercado en Espana, 2025 |
| Arranque manual de un proyecto | 60-120 horas | Stack, despliegue, CI, pruebas y documentacion |
| Coste evitado por proyecto | 3.900-7.800 € | Producto de los dos anteriores |
| Proyectos nuevos al ano, equipo de 10 | 4-8 | Agencia o producto con varias lineas |
| Coste anual del plan Pro, 10 devs | 5.880 € | 49 € x 10 x 12 |

Con un solo proyecto al ano el plan Pro ya se paga. El argumento de venta no
es "generamos codigo mas rapido", es **"el coste de arrancar un proyecto deja
de ser una variable del presupuesto"**.

Lo que estos numeros **no** dicen: cuanto del tiempo ahorrado se recupera de
verdad y cuanto se reinvierte en revisar lo generado. Es la primera metrica
que habria que medir con clientes reales, y la que decide si el precio esta
bien puesto.

## 6. Riesgos del modelo

Enumerados porque afectan a la decision, no como formalismo:

1. **El plan gratuito puede canibalizar al de pago.** Si el proyecto generado
   parece suficiente, nadie sube a Pro. Mitigacion: el generador dice en voz
   alta lo que no ha comprobado, y esa lista es exactamente el ambito de los
   modulos de pago.
2. **Precio por desarrollador en equipos pequenos.** Cinco personas que
   arrancan dos proyectos al ano pagan 2.940 € por un ahorro puntual.
   Mitigacion: tarifa por proyecto para equipos de menos de cinco.
3. **Dependencia del criterio del auditor.** Un falso positivo ruidoso destruye
   la confianza mas rapido de lo que un hallazgo util la construye. Mitigacion:
   el auditor declara explicitamente su alcance y lo que deja fuera.
4. **Competencia de los asistentes de codigo generalistas.** Su ventaja es la
   flexibilidad; la nuestra, el contexto compartido entre fases y la
   reproducibilidad. El dia que eso deje de ser cierto, el modelo necesita
   revision, no ajuste de precio.

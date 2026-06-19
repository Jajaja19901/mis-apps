# Informe de Mercado: Brokers de Datos y Compraventa de Datos en España/UE (2026)
**Agente 2 — Investigación de Mercado · Pipeline MVP Data Dividend**
*Fecha: junio 2026 · Redactado con búsquedas web y conocimiento de corte enero 2026*

---

## 1. Tabla de Precios de Mercado por Categoría de Dato

> **Nota de transparencia:** Los precios en el mercado de datos son opacos por diseño. Los brokers no publican tarifas; negocian caso por caso. Los rangos aquí recogidos combinan (a) precios observados en plataformas de distribución como LiveRamp Data Marketplace y Datarade, (b) benchmarks de CPM de segmentos de terceros publicados por plataformas DSP, y (c) estimaciones de analistas del sector. Se indica la fiabilidad de cada dato.

| Categoría de dato | Unidad de mercado | Rango de precio (€ equivalente) | Fiabilidad | Notas |
|---|---|---|---|---|
| **Datos sociodemográficos básicos** (edad, sexo, ubicación, nivel educativo) | CPM (coste por mil impresiones del segmento) | 0,30 – 0,80 €/CPM | Media — rangos publicados por Outbrain DSP y benchmarks de segmentos de DV360 | El dato demográfico solo es el más barato porque prácticamente todas las plataformas lo tienen duplicado. Precio en LiveRamp típico: 0,50 $/CPM. |
| **Intereses y aficiones** (deporte, viajes, tecnología, moda…) | CPM | 0,50 – 1,50 €/CPM | Media — basado en precios de segmentos de Audiencerate y OAN en Datarade | Los intereses de alta intención (lujo, viajes premium) suben hacia el límite superior. |
| **Historial de navegación / cookies / comportamiento online** | CPM | 0,80 – 2,00 €/CPM | Media-alta — segmentos comportamentales son ~48 % del gasto de audiencias en DSPs | Categoría en contracción en Europa por desaparición de cookies de terceros (Chrome, Safari ITP). Con GDPR, los datos sin consentimiento explícito no se pueden comercializar en la UE legalmente. |
| **Geolocalización / movilidad** | CPM o €/usuario/mes para licencias | 1,00 – 3,00 €/CPM · o bien 0,05 – 0,20 €/dispositivo/mes en licencias de datos de movilidad | Media — TapTap Digital (empresa española, 20 M€/año de facturación) es referencia del mercado local | Los datos de movilidad son especialmente valiosos para retail, OOH (publicidad exterior) y análisis de competencia. TapTap los obtiene de operadoras móviles y SDKs en apps. |
| **Hábitos de compra / tickets de compra** | CPM o €/registro | 1,50 – 4,00 €/CPM en programática · hasta 300 £ (~350 €)/1 000 registros en licencias directas | Alta — precio de licencia directa documentado en UK Government Digital Marketplace 2024 | La combinación de ticket + tienda + frecuencia es muy valiosa. Empresas como Consumer Edge venden este tipo de datos para Europa. |
| **Intención de compra "in-market"** (búsquedas, comparativas, visitas a páginas de producto) | CPM | 2,00 – 5,00 €/CPM | Media-alta — B2B data (Bombora, LiveRamp) documentado en 2–5 $/CPM; datos in-market consumer similar rango | Es la categoría con mayor ROI para el comprador, de ahí el precio. Son señales de compra en los próximos 30–90 días. |
| **Audiencias para publicidad programática** (segmentos enriquecidos, lookalikes) | CPM | 0,50 – 3,00 €/CPM según profundidad del segmento | Alta — Audiencerate desde 1 $/CPM; OAN desde 0,50 $/CPM en Datarade; benchmarks de Google y Meta confirman el rango | Los CPMs de Spain en Meta Ads están entre 2,50 – 5,50 € (media + datos incluidos); el valor puro del dato supone aprox. 10–20 % de esa cifra. |
| **Datos financieros** (nivel de ingresos, propensión crediticia, productos contratados) | CPM o precio negociado | 3,00 – 8,00 €/CPM | Baja — estimación de mercado; en España Experian declaró explícitamente que NO actúa como data broker local; el mercado financiero en UE es muy restringido por GDPR | En dark web el acceso a datos financieros de una persona se vende >800 €, pero eso es el mercado ilegal. El mercado consentido y legal es muy limitado en la UE. |
| **Datos de salud / médicos** | Precio muy variable; casi siempre por licencia a investigadores | 5,00 – 20,00 €/CPM equivalente en usos de market research | Baja — ESTIMACIÓN; datos reales de salud en UE están protegidos por el Art. 9 GDPR como categoría especial | Prácticamente no existe mercado B2C de datos de salud consentidos en España. IQVIA y RELX (vía Datavant) trabajan con hospitales e instituciones, no con individuos. Alto riesgo legal. |

**Conversión de referencia:** En programática, el CPM refleja lo que paga el comprador de medios por acceder al segmento; el dato bruto que llega al proveedor original (el usuario) es una fracción muy pequeña de esa cifra, dado que intervienen DSP, SSP, DMP/CDP, y el propio broker. La cadena captura >90 % del valor.

---

## 2. Estimación Realista de Ganancias por Usuario al Mes

### El dato que nadie quiere publicar

No existe ningún estudio publicado que dé cifras verificadas de cuánto recibe un usuario individual en un programa de data dividend real a escala. Las razones son estructurales:

1. **El valor del dato es agregado, no individual.** Lo que compra un anunciante es un *segmento* de 50 000 o 500 000 personas. El precio se divide entre todos.
2. **La cadena de intermediarios se lleva la mayor parte.** Entre el usuario y el comprador final hay como mínimo 3–5 capas (broker original, DMP, DSP, agencia, plataforma).
3. **Los ingresos de las plataformas son una referencia indirecta.** Meta ingresa ~23 $/usuario/año en Europa (ARPU Q4 2023, último dato publicado). Pero Meta tiene volumen de datos, tecnología y red publicitaria propios que un proyecto independiente no tiene.

### Cálculo de referencia: el método top-down

Partimos de Meta Europa (~23 $/usuario/año ≈ 1,92 $/mes) como techo teórico de cuánto vale la combinación completa de datos + infraestructura publicitaria de una persona. De esa cifra:

- ~80–85 % corresponde al valor de la plataforma, la tecnología de targeting y el inventario publicitario.
- ~15–20 % podría atribuirse al dato bruto en sí.
- De ese 15–20 %, un proyecto de cesión de datos que operara con márgenes mínimos podría trasladar al usuario 30–50 %.

**Resultado top-down:** 1,92 $/mes × 17,5 % (dato bruto) × 40 % (reparto al usuario) ≈ **0,13 $/mes ≈ 0,12 €/mes** por usuario con perfil de uso de redes sociales medio.

### Cálculo bottom-up: si el usuario cede activamente sus datos

Asumiendo que un usuario cede:
- Datos demográficos: 1 segmento × 0,50 €/CPM × estimación de 2 impresiones/mes = 0,001 €
- Comportamiento de navegación: 3 segmentos × 1,50 €/CPM × 5 impresiones/mes = 0,022 €
- Geolocalización (licencia mensual): 0,10 €/dispositivo/mes
- Intención de compra (meses con señal): 2 segmentos × 3 €/CPM × 3 impresiones = 0,018 €
- Hábitos de compra (dato de ticket): 0,35 €/registro/mes promedio en licencias directas dividido entre capas = 0,03 €

**Resultado bottom-up (estimación máxima):** ~0,17 €/mes, antes de comisiones de la plataforma.

### Rango final defendible

| Escenario | Ganancia estimada/usuario/mes |
|---|---|
| **Mínimo realista** (usuario pasivo, datos básicos) | 0,05 – 0,10 €/mes |
| **Medio** (usuario activo, cede navegación + ubicación + compras) | 0,10 – 0,30 €/mes |
| **Máximo optimista** (perfil muy completo, datos de alta intención, sin intermediarios) | 0,50 – 1,00 €/mes |
| **Inflado / no creíble sin backend ni volumen masivo** | > 2 €/mes |

### Por qué las cifras infladas son poco realistas

- Proyectos que prometen 5–20 €/mes por usuario individual sin mencionar el volumen necesario están confundiendo el precio de venta del *dataset agregado* con la parte proporcional de *un individuo*.
- El modelo de data union/dividend solo es sostenible con cientos de miles de usuarios: el precio de un segmento de 500 000 personas dividido entre todos da centavos.
- En España/UE, el GDPR encarece la operación (consentimiento explícito, auditabilidad, derecho al olvido), lo que reduce aún más el margen neto para el usuario.
- La alternativa honesta: presentar la ganancia como un beneficio social o acumulativo ("en un año cedes datos por valor de 2–5 €, de los que te llevamos X %") en lugar de prometer ingresos mensuales significativos.

**Recomendación para el MVP:** Mostrar un rango de 0,10 – 0,50 €/mes como cifra central, con explicación de que sube con el volumen de datos cedidos y la escala de la plataforma. Evitar promesas superiores a 1 €/mes sin respaldo de un modelo de negocio demostrado.

---

## 3. Lista de 10 Posibles Clientes B2B en España/UE

| # | Empresa | Tipo | Qué comprarían |
|---|---|---|---|
| 1 | **TapTap Digital** (Madrid) | Data broker / plataforma de datos de movilidad | Datos de geolocalización consentidos, comportamiento en app, patrones de movilidad para enriquecer sus segmentos. Facturan 20 M€/año y trabajan en 85 países. |
| 2 | **Havas Media Group España** | Agencia de medios (Top 1 nuevo negocio España 2025) | Segmentos de audiencia de primera parte consentida para sus campañas programáticas; datos de intención de compra para sus clientes de retail y automoción. |
| 3 | **GroupM / WPP Media** (Mindshare, Wavemaker, EssenceMediacom) | Holding de agencias de medios (Top 1 mundial facturación 2024) | Audiencias enriquecidas para planificación programática; datos de compra para atribución de campañas. |
| 4 | **Publicis Media España** (Starcom, Zenith, Spark Foundry) + Lotame | Holding de medios + data partner | Lotame (adquirida por Publicis en junio 2025) distribuye segmentos de terceros; comprarían datos de navegación e intereses consentidos para enriquecer su DMP. |
| 5 | **Experian España** | Bureau de crédito / data intelligence | Datos sociodemográficos y de comportamiento financiero consentidos para modelos de scoring y productos de marketing directo. Nota: declaró no operar como data broker en España, pero sí vende servicios de marketing data. |
| 6 | **NielsenIQ / GfK España** | Market research | Paneles de consumidores voluntarios para estudios de compra, seguimiento de audiencias, y medición de eficacia publicitaria. Su negocio depende de usuarios que ceden datos de consumo. |
| 7 | **Kantar España** | Market research / consumer insights | Datos de consumo real (tickets de compra, audiencias de medios) para estudios de panel. Operan el panel BrandZ y el TGI (Target Group Index). |
| 8 | **Criteo** (opera activamente en España) | Plataforma de retargeting / Commerce Media | Datos de intención de compra e historial de navegación en ecommerce para retargeting y lookalike audiences. Su modelo de Commerce Media Network depende de datos de primera y tercera parte. |
| 9 | **The Trade Desk** (distribución en España a través de agencias) | DSP independiente | Compran segmentos de audiencia a través de su Unified ID 2.0; interesados en datos de usuarios consentidos como alternativa a las cookies de terceros en el entorno post-cookie. |
| 10 | **Ipsos España** | Market research / encuestas | Paneles de consumidores voluntarios para estudios de opinión, mercado y comportamiento. Cada respondente de panel recibe compensación y cede datos; buscan continuamente ampliar sus paneles. |

---

## 4. Contexto Regulatorio Relevante para el MVP

- **GDPR/RGPD (UE):** Cualquier cesión de datos personales requiere consentimiento explícito, específico e informado. El usuario debe poder retirar el consentimiento en cualquier momento. El modelo de data dividend con consentimiento activo es legalmente viable si se documenta bien.
- **Ley Orgánica 3/2018 (LOPDGDD):** Implementación española del GDPR. No añade restricciones adicionales al modelo, pero exige registro de actividades de tratamiento.
- **Data Governance Act (UE, aplicable desde sept. 2023):** Regula los "servicios de intermediación de datos" (exactamente el modelo data union). Requiere notificación a la autoridad competente si se opera como intermediario de datos. Oportunidad regulatoria: el DGA legitima y regula este modelo de negocio.
- **Datos de categoría especial (Art. 9 GDPR):** Salud, origen étnico, religión, opiniones políticas, orientación sexual — requieren consentimiento explícito adicional. Comercializar estos datos en la UE es prácticamente inviable para un MVP.

---

## Fuentes Consultadas

- [Facebook Ads CPM by Country — Lebesgue.io (2026)](https://lebesgue.io/facebook-ads/facebook-cpm-by-country)
- [Europe Data Broker Services Industry Report 2025 — Cognitive Market Research](https://www.cognitivemarketresearch.com/regional-analysis/europe-data-broker-services-market-report)
- [Data Broker Market Report 2026 — Research and Markets](https://www.researchandmarkets.com/reports/6089979/data-broker-market-report)
- [15 Surprising Data Brokering Statistics 2026 — VPN Central](https://vpncentral.com/data-brokering-statistics/)
- [Top Data Broker Companies — Built In](https://builtin.com/articles/top-data-broker-companies)
- [Tus datos personales valen 870€ — UOC (2020)](https://www.uoc.edu/es/news/2020/006-vender-datos-personales-internet)
- [Taptap Digital ayuda a retailers con datos de movilidad — Periódico Publicidad (2025)](https://www.periodicopublicidad.com/articulo/negocios/taptap-digital-lanza-retail-origins-ayudar-retailers-ganar-mercado-traves-datos-movilidad/20251119121220165785.html)
- [Company Focus TapTap — Programmatic Spain](https://www.programaticaly.com/company-focus-taptap)
- [Data Unions — Streamr Network](https://blog.streamr.network/data-unions/)
- [What are Data Unions — The Next Tech](https://www.the-next-tech.com/blockchain-technology/what-are-data-union-and-union-database/)
- [Programmatic Advertising Costs — Stackmatix (2024)](https://www.stackmatix.com/blog/programmatic-advertising-costs)
- [Audience data 10B+ profiles — Datarade / OAN](https://datarade.ai/data-products/audience-data-10b-profiles-global-us-euro5-emea-apac-online-advertising-network)
- [Carat, Havas Media e iProspect: Top agencias España 2024 — IPMark](https://ipmark.com/carat-havas-media-e-iprospect-top-agencias-de-medios-en-espana-en-2024/)
- [Meta Average Revenue per User — StockAnalysis](https://stockanalysis.com/stocks/meta/metrics/average-revenue-per-user/)
- [Data Broker Pricing Options — LiveRamp](https://docs.liveramp.com/connect/en/data-marketplace-pricing-options.html)
- [Third-party data providers 2025 — OnAudience](https://onaudience.com/third-party-data-providers/)
- [Data Broker Market Size — Grand View Research](https://www.grandviewresearch.com/industry-analysis/data-broker-market-report)
- [Largest data brokers in America — OneRep](https://onerep.com/blog/largest-data-brokers-in-america)
- [NielsenIQ compra GfK — Red de Periodistas](https://www.reddeperiodistas.com/nielsen-iq-compra-gfk/)
- [El nuevo negocio en agencias de medios cae un 6,4% — Programmatic Spain](https://www.programaticaly.com/otras-noticias/nuevo-negocio-agencias-medios-cae-2023-2024-espana)

# 🔄 TRASPASO — Continúa con "Incuba tu Negocio" (NO empieces de cero)

> **Cómo usarlo:** pega este documento (o di "lee TRASPASO-INCUBA.md") al empezar la nueva
> conversación sobre el repo `mis-apps`. Resume lo que el cliente quiere, lo que ya está hecho
> y los errores que NO debes repetir.

---

## ⚠️ PARA TI (Claude nuevo) — LÉEME ANTES DE NADA
El cliente viene **muy quemado** de la conversación anterior, porque el Claude anterior:
- Se **desvió** haciendo cosas que no pidió (creó una web nueva en vez de usar la que ya tenía).
- **Dio mil vueltas y preguntó demasiado.**
- Tardó **horas sin entregar** lo que él quería.

**Reglas para no repetirlo:**
1. **Acción directa.** Si algo es obvio, hazlo. Máximo **1 pregunta** y solo si es imprescindible.
2. **No crees cosas nuevas que no pide.** Trabaja sobre lo que YA existe en el repo.
3. **Entrega rápido y enseña el resultado** (el archivo / una captura). Explica poco.
4. **Sé honesto desde el primer minuto** sobre lo que NO se puede (abajo). Nada de falsas promesas.
5. **Sin gastar tokens de más.** Al grano.

---

## 👤 EL CLIENTE Y SU PROYECTO
- Es **Jaime M. M.**, dueño de **"Incuba tu Negocio"**: un servicio que **crea webs, catálogos,
  landings y apps a medida para negocios** (autónomos y pymes), rápido y barato (desde 250€).
- Vende por **Instagram: @incuba_tu_negocio** (ya tiene perfil, foto/logo y bio puestos).
- Modelo: catálogo/escaparate + **pedidos por WhatsApp** (NO e-commerce con pasarela de pago).
- **Regla clave de mensaje:** al cliente final **NUNCA se le menciona la IA** (no le interesa cómo
  se hace; le interesa el resultado).

## 🎯 SU VISIÓN
- **Ahora:** escalar el servicio a **toda España**, captando con **contenido viral** (reels/vídeos/
  fotos) en Instagram.
- **A futuro:** convertirlo en una **startup escalable** (producto/plataforma/suscripción), fácil de
  manejar, con poca gente y de gran utilidad. (Hoy es una agencia con tecnología; la meta es producto.)

## 🔥 LO QUE PIDE AHORA (por prioridad)
1. **UN "CREADOR" de reels, vídeos y fotos**, lo más automático posible. Es lo que MÁS le importa.
   - ⚠️ **Honestidad obligatoria:** un HTML **NO genera el vídeo/foto final** (sin backend ni APIs de
     pago no hay IA de medios). Lo máximo sin backend = **generar guion + prompts** y llevarle a las
     herramientas que sí crean (Revid, Kling, Ideogram). **El intento `incuba-creador.html` NO le
     convenció.** → Antes de construir nada, **aclárale en 2 frases** qué es posible y pregúntale si
     quiere: (a) que le montes el **flujo paso a paso con herramientas externas**, o (b) plantear un
     **sistema con backend** (fase de pago, futura). No vuelvas a prometer un "creador mágico".
2. **Automatizar su Instagram:** publicar posts solos (**Meta Business Suite / Metricool**) y responder
   DMs solos (**ManyChat**). Son configuraciones en **SUS cuentas** → tú solo le **guías paso a paso**;
   no puedes hacerlo por él.
3. **Su web del estudio = `apps/incuba-tu-negocio-COMPLETA.html`** (¡NO crear otra!). Ya tiene:
   - **Cuestionario integrado** con 52 sectores + casilla de consentimiento (RGPD).
   - **Panel admin** (leads + export CSV).
   - **6 demos** dentro (reformas, peluquería, tienda de arte, logopedia, Lumen, Pío).
   - **Lo que quiere para ella:** las demos como **mini-móvil con captura real** (que parezcan apps) +
     **look premium** (la incubadora animada que SÍ le gustó). **Mejórala, no la sustituyas.**

## ✅ QUÉ HAY HECHO EN EL REPO (úsalo, no lo rehagas)
| Archivo | Qué es | Estado |
|---|---|---|
| `apps/incuba-tu-negocio-COMPLETA.html` | **Su web buena** (cuestionario + admin + 6 demos) | LA BASE — mejorar |
| `apps/incuba-logo.html` | Kit de marca (logo que ya usa en IG) | OK |
| `apps/incuba-marca-contenido.html` | Guiones + fórmulas virales + calendario | OK |
| `apps/incuba-sistema.html` | Panel interno (CRM + estudio + automatización guiada) | OK |
| `apps/incuba-centro-mando.html` | CRM (ya integrado en el sistema) | redundante |
| `apps/incuba-creador.html` | Generador de guion+prompts | **NO le gustó** — revisar con él |
| `apps/incuba-web-premium.html` | Web nueva (NO debió hacerse) | **DESVÍO** — solo reaprovechar la incubadora animada si acaso |
| `PROMPT-SISTEMA-INCUBA.md` | Plano del sistema interno | referencia |

## 🚫 ERRORES DEL CLAUDE ANTERIOR (NO repetir)
- Crear `incuba-web-premium.html` (web nueva) en vez de mejorar la **COMPLETA**. → Horas perdidas.
- Demasiadas preguntas, demasiadas vueltas, poca entrega.
- Prometer un "creador automático de vídeos/fotos" **sin aclarar antes** que un HTML no genera medios.

## 📌 REGLAS TÉCNICAS DEL PROYECTO (de CLAUDE.md)
- Todo es **un HTML autocontenido** (CSS/JS inline), mobile-first, **sin librerías** (ni React/Framer).
- **Sin backend** → no genera medios ni automatiza solo; se **guía** a herramientas externas.
- Panel admin con `ADMIN_PASSWORD`. Verificar con `node tools/verificar-app.mjs <archivo>` (antes:
  `npm i puppeteer`; el entorno lo recicla, hay que reinstalarlo a menudo).
- No inventar marca/datos: usar placeholders y avisarlo.

## 🔑 DATOS PENDIENTES (pídeselos)
- **WhatsApp** del estudio · **email** · **dominio** (para publicar la web).

## ▶️ TU PRIMER MOVIMIENTO (Claude nuevo)
Salúdale, dile que has leído este traspaso y que **NO vais a empezar de cero**, y hazle **UNA sola
pregunta**:
> "¿Por dónde quieres que empiece: (a) el creador de contenido, (b) automatizar tu Instagram, o
> (c) mejorar tu web COMPLETA con todas las apps + look premium?"

Y ve **directo** a eso, sin desviarte. Entrega algo concreto en los primeros pasos.

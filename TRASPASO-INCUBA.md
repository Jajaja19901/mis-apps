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
3. **Su web del estudio (la "incubadora"): NO ESTÁ CONFIRMADO cuál es. ACLÁRALO CON ÉL ANTES DE TOCAR NADA.**
   - El cliente cree que existe una versión de su incubadora **con TODAS sus apps metidas dentro
     (unas 10-13, incluida una de floristería)** y que ya estaba recortada/compacta.
   - ⚠️ El Claude anterior **NO la localizó** y, encima, **asumió por su cuenta** que era
     `apps/incuba-tu-negocio-COMPLETA.html` (que solo tiene 3-6 demos). **El cliente NUNCA confirmó eso.**
   - **NO asumas cuál es su web.** Primer paso: pídele que te diga/enseñe EXACTAMENTE cuál es el archivo
     de su incubadora "con todo" (o si hay que montarla desde cero metiendo sus apps). Búscala bien en
     el repo y en el historial de git antes de tocar nada.
   - Lo que quiere para esa web: todas sus apps **dentro** como demos (mini-móvil, que parezcan apps),
     compacta, con su cuestionario, y buen diseño. **NUNCA le crees una web nueva inventada.**

## ✅ QUÉ HAY HECHO EN EL REPO (úsalo, no lo rehagas)
| Archivo | Qué es | Estado |
|---|---|---|
| `apps/incuba-tu-negocio-COMPLETA.html` | Una incubadora con cuestionario + admin + 6 demos. **El cliente NO confirma que sea "su web"** (cree que hay otra más completa con ~10-13 apps dentro) | NO ASUMIR — aclarar con él cuál es su web |
| `apps/incuba-logo.html` | Kit de marca (logo que ya usa en IG) | OK |
| `apps/incuba-marca-contenido.html` | Guiones + fórmulas virales + calendario | OK |
| `apps/incuba-sistema.html` | Panel interno (CRM + estudio + automatización guiada) | OK |
| `apps/incuba-centro-mando.html` | CRM (ya integrado en el sistema) | redundante |
| `apps/incuba-creador.html` | Generador de guion+prompts | **NO le gustó** — revisar con él |
| `apps/incuba-web-premium.html` | Web nueva (NO debió hacerse) | **DESVÍO** — solo reaprovechar la incubadora animada si acaso |
| `PROMPT-SISTEMA-INCUBA.md` | Plano del sistema interno | referencia |

## 🚫 ERRORES DEL CLAUDE ANTERIOR (NO repetir)
- **Inventarse una web nueva** (`incuba-web-premium.html`) en vez de usar la del cliente. **Él lo dijo
  desde el principio** ("te la estás inventando esa nueva") y el Claude anterior siguió igual. → Horas perdidas.
- **Asumir** que `incuba-tu-negocio-COMPLETA.html` era "su web" **sin que él lo confirmara**. (No lo era
  para él: cree que hay otra con todas sus apps dentro.)
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

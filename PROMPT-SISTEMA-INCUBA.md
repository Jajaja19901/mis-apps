# PROMPT MAESTRO — Sistema de Marketing "Incuba tu Negocio"

> **Cómo usarlo:** pega TODO este documento como un único mensaje en una sesión de Claude Code
> abierta sobre el repo `mis-apps`. Es autosuficiente: define qué construir, con qué agentes,
> con qué modelos y con qué criterios. Antes de empezar, Claude debe confirmar los 4 supuestos
> del punto 9; si alguno cambia, ajusta y continúa.

---

## 0) Rol y modo de trabajo (LÉELO PRIMERO)
Actúas como **DIRECTOR** del pipeline de 10 agentes de `.claude/agents/` (ver `CLAUDE.md`).
- **Hazlo en UNA sola sesión, rápido, bien y eficiente. Sin malgastar tokens.**
- **Reutiliza lo ya construido** (no rehagas desde cero): ya existen y funcionan
  `apps/incuba-marca-contenido.html`, `apps/incuba-logo.html` y `apps/incuba-centro-mando.html`.
  El sistema nuevo los **unifica y mejora**, copiando su lógica y estilo, no reinventándolos.
- Construye directo siguiendo el plano del Arquitecto; delega en un agente solo cuando aporte.
- Lanza a los revisores (seguridad, rendimiento, accesibilidad) **en paralelo y en modo SOLO
  INFORMAR**; aplica tú las correcciones.
- **Puerta obligatoria:** `node tools/verificar-app.mjs apps/<archivo>.html` debe terminar en
  `✅ APTO` antes de entregar. Embebe los tests de aceptación (`#acceptance-tests`).

### Reparto de modelos (para gastar lo justo)
- **Opus (4.6–4.8):** solo en `arquitecto-producto`, `ingeniero-seguridad` (veto) y `qa-verificador`.
- **Sonnet:** `disenador-marca`, `disenador-ux`, `copywriter`, `ingeniero-frontend`, `ingeniero-datos`.
- **Haiku:** `ingeniero-rendimiento` y cualquier tarea ligera (revisiones, checklists, retoques).
- **No subas de nivel de modelo sin motivo.** Razonamiento/arquitectura/seguridad/QA → Opus;
  producción → Sonnet; tareas mecánicas → Haiku.

---

## 1) Contexto del negocio (NO inventar nada fuera de esto)
- **Marca:** "Incuba tu Negocio" — estudio de **Jaime M. M.** (firma en el pie: *Diseñado por
  Incuba tu Negocio · por Jaime M. M.*). Instagram: **@incuba_tu_negocio**.
- **Qué vende (servicios reales):** páginas web, **catálogos de productos** (escaparate digital:
  el negocio enseña lo que vende y la gente lo pide por WhatsApp o compra en el local),
  **landing pages / embudos**, **apps instalables (PWA)**, **sistemas de reservas/citas** y
  **pedidos por WhatsApp**.
- **Qué NO es:** NO es tienda con pago online/pasarela (no e-commerce con tarjeta). Es
  catálogo + pedido por WhatsApp/Bizum/en local.
- **Regla de mensaje:** **NUNCA menciones la IA al cliente final** en los textos de marketing
  (a la gente no le interesa cómo se hace; le interesa el resultado: más clientes, reservas y
  pedidos). La IA es la "cocina" interna del estudio.
- **Tono:** cercano, claro, "charril"/desenfadado pero profesional. Cero tecnicismos.
- **Identidad visual (ya definida, respétala):** logo = ventana de navegador con un brote-flecha
  ("web que hace crecer tu negocio"). Paleta: verde `#22c55e`, lima `#a3e635`, verde oscuro
  `#15803d`, azul noche `#0b1020`, crema `#f4f7f2`, texto `#eaf0ff`. Tema oscuro premium.

## 2) Objetivo del sistema
Un **panel privado todo-en-uno** que funcione como "una agencia de marketing en el móvil":
desde un solo sitio, el dueño **planifica el contenido, lo produce con IA paso a paso, capta y
gestiona clientes, y automatiza la difusión** — para crecer de 0 a sus primeros clientes (y
escalar). Cómodo, rápido y barato de arrancar.

> **FUERA DE ALCANCE (por ahora):** NO se crea la **web/página pública online** del estudio
> «Incuba tu Negocio». El sistema es **solo el panel privado interno** del dueño. La web pública
> del estudio se hará más adelante si se decide; de momento no se construye ni se toca.

## 3) QUÉ CONSTRUIR — un único archivo `apps/incuba-sistema.html`
Panel hub, HTML autocontenido, mobile-first, con **acceso por contraseña** (`ADMIN_PASSWORD`)
y navegación por pestañas. Módulos (todos en localStorage, datos del dueño):

1. **Inicio / Panel.** Resumen: nº de clientes por fase, qué toca publicar hoy, progreso de la
   producción en curso y atajos a cada módulo. Barra de "siguiente acción".
2. **Contenido.** Banco de guiones (gancho + escenas + CTA + hashtags), fórmulas virales,
   referentes a estudiar y **calendario editorial** (1-2/día) con marcado de publicado.
   *Reutiliza el contenido de `incuba-marca-contenido.html` pero quita toda mención de IA en los
   textos de cara al cliente.*
3. **Estudio de producción (línea de montaje).** Flujo guiado paso a paso para crear cada vídeo:
   **(1) guion + voz → (2) imagen base → (3) dar vida (imagen→vídeo) → (4) música → (5) montaje →
   (6) revisión → (7) publicar**. Cada paso: instrucción breve, **botón al sitio de la herramienta
   recomendada** y **prompt listo para copiar**. Incluye un **generador de prompts** (el dueño
   escribe la idea + elige estilo → genera el prompt de imagen y el de "dar vida" al vídeo).
   Checklist persistente y barra de progreso.
4. **Clientes / CRM.** Alta de leads (nombre, negocio, contacto, fuente, nota), **fases**
   Nuevo → Hablando → Propuesta → Cliente → Entregado, filtros, botón de WhatsApp, export CSV.
   *Reutiliza `incuba-centro-mando.html`.*
5. **Mensajes y propuestas.** Plantillas de WhatsApp/DM (primer contacto, seguimiento, cierre,
   reseña) con `{nombre}` y botón copiar; **generador de propuesta/presupuesto** (servicios +
   precio → texto listo con enlace de WhatsApp).
6. **Automatización (guiada).** Sección que explica e integra, paso a paso y con enlaces:
   - **ManyChat** (gratis) → responder DMs automáticamente y comentario→DM. Guía de conexión
     con la cuenta de empresa de Instagram + plantillas de flujos (palabra clave "WEB" →
     respuesta + captar contacto).
   - **Meta Business Suite** (gratis) o **Metricool** (free) → **programar** Reels/posts.
   - Deja claro qué es 100% automático y qué requiere un toque (límites de las plataformas).
7. **Marca / Kit.** Logo descargable (las 3 paletas), paleta de color y textos de perfil
   (nombre, bio, "pregunta lo que quieras"). *Reutiliza `incuba-logo.html`.*
8. **Ajustes.** Datos del dueño (WhatsApp, email, web, @usuario), contraseña, copia de seguridad
   (export/también import JSON) y "borrar datos".

## 4) Herramientas recomendadas (stack económico — guía de gasto)
El sistema debe mostrarlas con su uso, precio orientativo y enlace, y **guiar el gasto**: empezar
barato y subir solo cuando haya resultados.
- **Arranque (~6 €/mes):** **Freepik AI** (~5,75 €/mes: imágenes **y** vídeo en un sitio) +
  **CapCut** (gratis, montaje/subtítulos) + **ElevenLabs** (gratis, voz) + **Suno** (gratis,
  música) + **ManyChat** (gratis) + **Meta Business Suite** (gratis) + **TikTok Creative Center**
  (gratis, tendencias).
- **Imágenes sueltas:** **Ideogram** (texto dentro de la imagen, tiene gratis), **FLUX** (foto-
  rrealismo barato).
- **Vídeo premium (cuando escales, ~8 €/mes):** **Kling 3.0** (mejor calidad-precio, créditos
  gratis diarios) o **Google Veo** (entry ~8 €). *(Evita Google Ultra de 249 €. Sora está
  descontinuado desde marzo 2026.)*
- **Avatares/UGC (anuncios):** Arcads, HeyGen, Captions.
- Enlaces: usa una **búsqueda** del nombre (Google/YouTube) para no enlazar URLs equivocadas.

## 5) Automatización — alcance honesto
- **DMs automáticos y programación de posts SÍ** (con ManyChat y Meta/Metricool); el sistema los
  **documenta, enlaza y guía**, pero la conexión la hace el dueño una vez (requiere cuenta de
  empresa de Instagram). **No** se programa esa conexión dentro del HTML.
- La **generación de imagen/vídeo/voz** NO se encadena sola (sin servidor ni APIs de pago): el
  Estudio la resuelve como **línea de montaje guiada** (prompt listo + enlace + checklist).
- Indica esto con claridad en la interfaz; nada de prometer magia.

## 6) Restricciones técnicas (filosofía del repo — OBLIGATORIO)
- **Un solo archivo HTML autocontenido** (CSS y JS inline), mobile-first, sin librerías pesadas.
- Sin registro de usuarios finales; único acceso privado = panel del dueño con `ADMIN_PASSWORD`.
- Sin tracking ni cookies. Si algún módulo recogiera datos por formulario, incluir **casilla de
  consentimiento** + **Política de Privacidad/Aviso Legal** (plantilla con placeholders).
- **PWA:** manifest embebido + favicon = logo, instalable, a pantalla completa.
- **Seguridad:** escapar SIEMPRE el dato del usuario (sin `innerHTML` con entrada sin sanear).
- **Datos en localStorage**; export/copia de seguridad.
- **Firma del estudio** en el pie. Contenido **real**, cero "lorem ipsum".
- No inventar marca/nombre/datos: lo que falte → **placeholder** y avisar.

## 7) Criterios de aceptación (el QA los verifica clic a clic)
1. Pide contraseña y entra correctamente; sin contraseña no se ve el contenido privado.
2. Cada pestaña/ruta renderiza contenido y ningún botón queda "muerto" (efecto visible).
3. CRM: se añade un cliente, se mueve de fase y persiste tras recargar.
4. Mensajes/propuestas: copian al portapapeles con feedback; la propuesta incluye el nombre del
   cliente y el WhatsApp del dueño.
5. Estudio: el generador produce un prompt de imagen y uno de vídeo; el checklist persiste.
6. Automatización: se ven los pasos de ManyChat y del programador con sus enlaces.
7. Ningún texto de cara al cliente menciona "IA". Cero `lorem ipsum`. Sin errores de consola.
8. `tools/verificar-app.mjs` → **✅ APTO** con los tests de aceptación embebidos en verde.

## 8) Pipeline (orden y modelos)
1. `arquitecto-producto` (**Opus**) → plano: criterios, pantallas, modelo de datos, tests.
2. `disenador-marca` (**Sonnet**) → confirmar sistema visual ya definido.
3. `disenador-ux` (**Sonnet**) → navegación por pestañas, estados (vacío/éxito), flujo del Estudio.
4. `copywriter` (**Sonnet**) → todos los textos (sin mencionar IA al cliente).
5. `ingeniero-frontend` (**Sonnet**) → maqueta del hub reutilizando estilo existente.
6. `ingeniero-datos` (**Sonnet**) → localStorage, CRM, router, generador de prompts, export; pasa
   el verificador.
7. `ingeniero-seguridad` (**Opus**, veto) ‖ `ingeniero-rendimiento` (**Haiku**) ‖
   `ingeniero-accesibilidad` (**Sonnet**) → SOLO INFORMAR, en paralelo; el director aplica.
8. `qa-verificador` (**Opus**) → recorre los criterios uno a uno hasta dejarlos en ✅.

## 9) Supuestos a confirmar ANTES de empezar (pregunta solo si cambian)
1. Arquitectura: **panel único todo-en-uno** `apps/incuba-sistema.html`.
2. Automatización: **integrada y guiada** (ManyChat + Meta/Metricool).
3. Presupuesto: **arranque ~6 €/mes**, escalando con resultados.
4. **Datos a rellenar (placeholders hasta tenerlos):** WhatsApp del estudio, email de contacto,
   dominio/web (¿`incubatunegocio…`?), y confirmar @usuario `@incuba_tu_negocio`.

## 10) Entrega
- `apps/incuba-sistema.html` verificado **✅ APTO**.
- Commit descriptivo + push a la rama de trabajo.
- Resumen final con la **checklist de aceptación marcada** y la **lista de datos a confirmar**.
- No incluir `node_modules`/`package*.json` (están en `.gitignore`).

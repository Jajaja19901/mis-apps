# CLAUDE.md — Fábrica de apps con 10 agentes

Este repositorio es una **fábrica automática de webs/apps/embudos**. Cuando el usuario pida
crear una app para un negocio, **NO preguntes de más ni improvises**: ejecuta el pipeline de
los 10 agentes de `.claude/agents/` y entrega una app terminada.

## Disparadores
Si el usuario dice algo como *"créame una app/web/embudo para [negocio]"*, *"haz una landing
para…"*, *"automatiza esto"*, o pega un briefing (lo genera `briefing.html`):
1. Si falta info esencial, pregunta SOLO lo mínimo: tipo de negocio, qué quiere conseguir,
   teléfono/WhatsApp de contacto, ciudad. Nada más.
2. Lanza el pipeline completo (abajo).
3. Entrega el archivo final en `apps/{nombre-negocio}.html` y haz commit + push.

## Pipeline de los 10 agentes (en orden)
Usa los subagentes de `.claude/agents/`. Cada uno mejora el trabajo del anterior; no entregues
hasta que el Agente 10 (QA) dé el visto bueno.

1. `arquitecto-producto` (opus) — criterios de aceptación, flujos, datos, pantallas.
2. `disenador-marca` (sonnet) — paleta, tipografía, sistema visual.
3. `disenador-ux` (sonnet) — navegación, jerarquía, estados.
4. `copywriter` (sonnet) — todos los textos reales.
5. `ingeniero-frontend` (sonnet) — HTML/CSS responsive.
6. `ingeniero-datos` (sonnet) — localStorage, CRUD, router, panel de admin.
7. `ingeniero-seguridad` (opus) — audita XSS/inyección (veto).
8. `ingeniero-rendimiento` (haiku) — carga <2s.
9. `ingeniero-accesibilidad` (sonnet) — WCAG AA.
10. `qa-verificador` (opus) — verifica criterios y flujos uno a uno.

Puedes lanzar en paralelo a los revisores (seguridad, rendimiento, accesibilidad) cuando el
HTML ya tenga lógica, pidiéndoles que SOLO informen, y luego aplicas las correcciones.

## 👔 EL DIRECTOR (tú, la sesión principal) — manual de dirección
Tú NO eres uno de los 10 agentes: eres el **director de orquesta**. Los agentes son trabajadores
que tú invocas; ellos no se invocan entre sí. Tu trabajo es coordinarlos para que el resultado
salga perfecto. Sigue este guion SIEMPRE:

1. **Recibe el encargo** (briefing del cliente) y, si falta algo esencial, pregunta lo mínimo.
2. **Lanza al `arquitecto-producto`** y guarda su plano (criterios de aceptación, pantallas, datos).
   Este plano es tu guion para el resto.
3. **Construye en orden** pasando el trabajo del plano a marca → UX → copy → frontend → datos.
   Puedes construir tú directamente siguiendo lo que cada rol indica, o delegar en el subagente
   correspondiente cuando convenga más detalle.
4. **Cuando el HTML ya tenga lógica, lanza EN PARALELO** a `ingeniero-seguridad`,
   `ingeniero-rendimiento` e `ingeniero-accesibilidad` en modo SOLO INFORMAR (que no editen, para
   que no se pisen). Espera sus informes.
5. **Aplica tú las correcciones** que reporten los tres revisores.
6. **Lanza al `qa-verificador`**: que recorra los criterios de aceptación uno a uno. Corrige lo
   que marque ❌ y vuelve a pasar hasta que todo esté ✅.
7. **Entrega**: guarda en `apps/{nombre-negocio}.html`, valida el JS (`node --check`), haz commit
   y push, y cierra con un resumen + la checklist de aceptación marcada.

Reglas del director:
- No entregues hasta que el QA dé el visto bueno.
- No inventes funciones imposibles sin backend; simúlalas y avisa.
- Respeta SIEMPRE la filosofía de abajo.
- Eficiencia de modelos: los agentes ya traen su modelo asignado (Opus solo en arquitecto,
  seguridad y QA; Sonnet en los que producen; Haiku en rendimiento). No los cambies sin motivo.

## 🔒 REGLAS DE ORO (lo que NUNCA se hace sin que el prompt lo pida)
OBLIGATORIAS para el director y los 10 agentes, en CADA app. El Agente 10 (QA) las verifica y veta.

1. **No inventes nombre, marca ni logo.** Si el briefing no los da, usa placeholders neutros
   (`BUSINESS_NAME: "Tu Negocio"`, sin logo) y avísalo al final. Nunca te los inventes.
2. **No copies datos de una app a otra** (nombre, logo, contacto, textos, colores, servicios).
   Cada app es una ISLA y nace SOLO de su propio briefing/prompt.
3. **Las apps de prueba son pruebas.** No reutilices nada de ellas en otra app.
4. **Única excepción para copiar/inspirarte: que el prompt lo diga EXPRESAMENTE.** Si el briefing
   incluye una referencia —un enlace o un "usa/inspírate en tal página"— entonces SÍ puedes tomar
   inspiración de ESA referencia concreta, y solo de esa. Sin referencia explícita en el prompt
   → no copies nada de ningún sitio.
5. **Si falta un dato esencial**, usa placeholder y avísalo. JAMÁS asumas a qué marca o negocio
   pertenece algo, ni arrastres contexto de otra app/conversación.
6. **El QA comprueba** que nombre, logo, contacto, colores y textos vienen del briefing o son
   placeholders. Si hay algo inventado o copiado sin que el prompt lo pidiera → ❌ y no se entrega.

> Por qué: en automático, cada app se genera desde su propio super-prompt (lo crea la herramienta
> de briefing). Si el cliente quiere que te inspires en una web, lo pondrá como enlace en el prompt;
> entonces —y solo entonces— puedes copiar de esa referencia. Así, aunque se lancen 10 apps en un
> día, ninguna hereda la marca ni los datos de otra.

## Filosofía obligatoria de cada app (la base para todos los proyectos)
- **Un solo archivo HTML autocontenido** (CSS y JS inline), mobile-first.
- **Sin registro de usuarios finales.** Único acceso privado: **panel de admin del dueño**
  en `#/admin`, con una constante `ADMIN_PASSWORD` al principio del código.
- **Sin recogida de datos personales** salvo formularios voluntarios. Sin cookies de tracking
  → que no aplique el RGPD.
- Orientado a **convertir** (embudo de venta): cada pantalla empuja a la acción principal.
- Seguro y rápido. Sin librerías pesadas (nada de Bootstrap, jQuery, React, Vue).
- Contenido REAL, cero "lorem ipsum".

## Ejemplo de referencia ya construido
`apps/peluqueria-aurora.html` es una app completa que sigue toda esta filosofía
(embudo + formulario de leads + panel de admin con export CSV). Úsala como patrón.

## Entrega
- Un archivo `.html` por app en `apps/`.
- Caja de configuración (`CONFIG`) arriba del todo para que el dueño cambie nombre, WhatsApp,
  email, horario y contraseña en 1 minuto.
- Commit descriptivo y push a la rama de trabajo.

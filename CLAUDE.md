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

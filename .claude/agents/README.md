# 🤖 Estudio de 10 agentes — creación de apps/embudos

Estos son los 10 agentes especialistas que construyen cada web/app a partir de un briefing.
Trabajan **en orden**: cada uno mejora el trabajo del anterior y no se entrega hasta que el Agente 10 da el visto bueno.

## Sirven para CUALQUIER tipo de app (la base para todos tus proyectos)
Estos agentes son genéricos: la misma base vale para los muchos tipos de apps que vas a crear
— embudos/landing de venta, reservas y citas, tiendas, calculadoras y configuradores,
catálogos, plataformas de cursos, captación de leads, paneles de gestión, etc.
Lo único que cambia entre un proyecto y otro es el briefing; los agentes son siempre los mismos.

## Filosofía común (todos la respetan)
- **Un solo archivo HTML autocontenido** (CSS y JS inline), mobile-first.
- **Sin registro de usuarios finales.** Único acceso privado: **panel de admin del dueño** en `#/admin` con `ADMIN_PASSWORD`.
- **Sin recogida de datos personales** salvo formularios voluntarios. Sin tracking → sin RGPD.
- Orientado a **convertir** (cada pantalla empuja a la acción principal).
- Sin librerías pesadas (nada de Bootstrap, jQuery, React, Vue).

## El pipeline y su modelo
Reparto pensado para ser **100% eficiente**: el modelo potente (Opus) solo donde se piensa
mucho; Sonnet para producir; Haiku para el chequeo más mecánico. Así gastas lo justo.

| # | Agente | Modelo | Hace |
|---|--------|--------|------|
| 1 | `arquitecto-producto` | 🧠 Opus | Criterios de aceptación, alcance, flujos, modelo de datos, mapa de pantallas |
| 2 | `disenador-marca` | Sonnet | Paleta, tipografía y sistema visual |
| 3 | `disenador-ux` | Sonnet | Navegación, jerarquía, estados y microinteracciones |
| 4 | `copywriter` | Sonnet | Todos los textos reales en el tono del cliente |
| 5 | `ingeniero-frontend` | Sonnet | HTML/CSS responsive |
| 6 | `ingeniero-datos` | Sonnet | localStorage, CRUD, router y panel de admin |
| 7 | `ingeniero-seguridad` | 🧠 Opus | Audita XSS/inyección (poder de veto) |
| 8 | `ingeniero-rendimiento` | ⚡ Haiku | Carga <2s, sin peso muerto |
| 9 | `ingeniero-accesibilidad` | Sonnet | WCAG AA |
| 10 | `qa-verificador` | 🧠 Opus | Verifica criterios y flujos uno a uno; visto bueno final |

> Para cambiar el modelo de un agente, edita la línea `model:` de su archivo `.md`
> (valores: `opus`, `sonnet` o `haiku`).

## Cómo usarlos (mínimo de toques)
La forma más cómoda: **dame el briefing del negocio una sola vez y yo orquesto a los 10 agentes por ti**
(incluso en paralelo). Tú solo tocas una vez.

Si prefieres hacerlo a mano:
1. Lanza el Agente 1 para obtener el plano.
2. Ve invocando del 2 al 9 en orden.
3. Cierra con el Agente 10: solo entrega cuando su checklist esté todo en ✅.

Puedes invocar un agente escribiendo, por ejemplo: *"usa el agente arquitecto-producto con este briefing…"*.

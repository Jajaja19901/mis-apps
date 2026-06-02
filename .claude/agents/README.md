# 🤖 Estudio de 10 agentes — creación de apps/embudos

Estos son los 10 agentes especialistas que construyen cada web/app a partir de un briefing.
Trabajan **en orden**: cada uno mejora el trabajo del anterior y no se entrega hasta que el Agente 10 da el visto bueno.

## Filosofía común (todos la respetan)
- **Un solo archivo HTML autocontenido** (CSS y JS inline), mobile-first.
- **Sin registro de usuarios finales.** Único acceso privado: **panel de admin del dueño** en `#/admin` con `ADMIN_PASSWORD`.
- **Sin recogida de datos personales** salvo formularios voluntarios. Sin tracking → sin RGPD.
- Todo es un **embudo de venta / captación** pensado para convertir.
- Sin librerías pesadas (nada de Bootstrap, jQuery, React, Vue).

## El pipeline
| # | Agente | Hace |
|---|--------|------|
| 1 | `arquitecto-producto` | Criterios de aceptación, alcance, flujos, modelo de datos, mapa de pantallas |
| 2 | `disenador-marca` | Paleta, tipografía y sistema visual |
| 3 | `disenador-ux` | Navegación, jerarquía, estados y microinteracciones |
| 4 | `copywriter` | Todos los textos reales en el tono del cliente |
| 5 | `ingeniero-frontend` | HTML/CSS responsive del embudo |
| 6 | `ingeniero-datos` | localStorage, CRUD, router y panel de admin |
| 7 | `ingeniero-seguridad` | Audita XSS/inyección (poder de veto) |
| 8 | `ingeniero-rendimiento` | Carga <2s, sin peso muerto |
| 9 | `ingeniero-accesibilidad` | WCAG AA |
| 10 | `qa-verificador` | Verifica criterios y flujos uno a uno; visto bueno final |

## Cómo usarlos
1. Pega el briefing del cliente (lo genera la herramienta `briefing.html`).
2. Lanza el Agente 1 para obtener el plano.
3. Ve invocando del 2 al 9 en orden.
4. Cierra con el Agente 10: solo entrega cuando su checklist esté todo en ✅.

Puedes invocar un agente escribiendo, por ejemplo: *"usa el agente arquitecto-producto con este briefing…"*.

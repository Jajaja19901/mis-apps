---
description: Crea una app/web/embudo COMPLETO para un negocio, pasando por los 10 agentes del pipeline.
---

Vas a crear una app/web/embudo **completo y terminado** para el negocio descrito abajo,
ejecutando el pipeline de los 10 agentes de `.claude/agents/` tal y como indica `CLAUDE.md`.
No preguntes de más; si falta algo esencial (tipo de negocio, objetivo, WhatsApp/contacto,
ciudad) pregunta SOLO lo mínimo y luego continúa.

## Encargo del negocio
$ARGUMENTS

## Cómo construirlo (automático, en orden)
1. **arquitecto-producto** → criterios de aceptación, flujos, modelo de datos y mapa de pantallas.
2. **disenador-marca** → paleta, tipografía y sistema visual.
3. **disenador-ux** → navegación, jerarquía y estados (vacío, carga, error, éxito).
4. **copywriter** → todos los textos reales en el tono del negocio (cero relleno).
5. **ingeniero-frontend** + **ingeniero-datos** → un solo HTML autocontenido, responsive,
   con la lógica en localStorage y el panel de admin.
6. **VERIFICADOR AUTOMÁTICO** (puerta obligatoria) → `node tools/verificar-app.mjs apps/{negocio}.html`.
   Corrige todo hasta que salga `✅ APTO` antes de seguir.
7. **Revisores EN PARALELO** (solo informan) → `ingeniero-seguridad`, `ingeniero-rendimiento`,
   `ingeniero-accesibilidad`. Aplica tú las correcciones que reporten.
8. **qa-verificador** → verifica los criterios de aceptación uno a uno PULSANDO en un navegador;
   corrige lo que falle.
9. **Antes de entregar**, vuelve a pasar `tools/verificar-app.mjs` y exige `✅ APTO`.

## Reglas obligatorias (filosofía de la fábrica)
- Un solo archivo HTML autocontenido (CSS y JS inline), mobile-first.
- **Sin registro de usuarios finales.** Único acceso privado: panel de admin del dueño en
  `#/admin` con una constante `ADMIN_PASSWORD` arriba del código.
- **Sin recogida de datos personales** salvo formularios voluntarios. Sin tracking → sin RGPD.
- Embudo de venta: cada pantalla empuja a la acción principal. Seguro y rápido, sin librerías pesadas.
- Caja `CONFIG` arriba para cambiar nombre, WhatsApp, email, horario y contraseña en 1 minuto.

## Entrega
- Guarda el archivo en `apps/{nombre-negocio}.html`.
- El verificador debe dar `✅ APTO` (sin errores de consola, todas las rutas vivas, sin botones muertos).
- Haz commit y push.
- Resume las decisiones clave y la checklist de aceptación marcada.

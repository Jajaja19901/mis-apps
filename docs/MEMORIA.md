# 🧠 Memoria del proyecto (bitácora entre conversaciones)

> Cada sesión de Claude añade ARRIBA una entrada corta al terminar un trabajo.
> Las sesiones nuevas LEEN este archivo antes de empezar (skill `memoria-sesiones`).

## 2026-07-26 — Centinela Wi-Fi: app de vigilancia doméstica por Wi-Fi (sin cámaras)
- Qué se hizo: nueva app `apps/centinela-wifi.html` (un solo HTML autocontenido). El cliente vio en GitHub el "WiFi sensing" (detectar personas por cómo su cuerpo altera la señal Wi-Fi / CSI; proyectos RuView, ESPectre, etc.) y pidió lo mejor para vigilar SU casa. Como ninguna web puede leer el CSI del Wi-Fi por sí sola, se construyó un centro de control honesto: modo SIMULACIÓN etiquetado por defecto + cliente MQTT-sobre-WebSocket propio (JS puro, sin libs) para enchufar un sensor real ESP32 (~10 €) con firmware libre ESPectre a través de un broker Mosquitto. Incluye: radar animado, zonas con nivel de movimiento, armar/desarmar con sirena (WebAudio) y notificaciones, registro local con export CSV y borrado en 2 pasos, panel del dueño con clave (hash SHA-256, no en claro), PWA instalable, guía de montaje paso a paso, página "cómo funciona (CSI)" y aviso legal con consentimiento de convivientes (RGPD). Pipeline completo: arquitecto (tests de aceptación embebidos) → build → revisores en paralelo (seguridad con VETO, rendimiento, accesibilidad) → QA. 
- Archivos tocados: `apps/centinela-wifi.html` (nuevo), `docs/MEMORIA.md`.
- Seguridad: el auditor (broker MQTT hostil real) VETÓ la 1ª versión con XSS remoto/persistente, DoS del parser MQTT (6 bytes dejaban la alarma sorda) e inyección de fórmulas en CSV. Corregido TODO (11 hallazgos) y reauditado → ✅ VETO LEVANTADO. QA → ✅ APTO 8/8 criterios. Verificador `tools/verificar-app.mjs` → ✅ APTO 9/9.
- Pendiente / siguiente paso: el dueño debe (1) comprar la ESP32 y montarla siguiendo la pestaña "Montaje" si quiere detección real; (2) rellenar los placeholders del titular legal `[NOMBRE DEL TITULAR]`/`[DIRECCIÓN]`/`[EMAIL]` si publica en internet; (3) cambiar `ADMIN_PASSWORD` en CONFIG. Idea futura opcional: estado "reconectando/sin datos" del MQTT más visible en la portada.
- Datos a confirmar: ninguno. La clave admin (`centinela123`) es protección de demostración client-side, documentado en CONFIG.

## 2026-07-19 — Vídeo demo en la portada de Incuba tu Negocio
- Qué se hizo: vídeo demo del producto (32s, MP4 1080p): la app peluqueria-aurora navegada de verdad (Playwright) dentro de un móvil flotante, narrador es-ES (Piper davefx via sherpa-onnx), música y efectos generados con numpy, rótulos y subtítulos (Remotion). Integrado en la PORTADA de apps/incuba-tu-negocio.html (tras el subtítulo, antes de la incubadora). Verificador: ✅ APTO.
- Archivos tocados: apps/incuba-tu-negocio.html, apps/incuba-demo.mp4 (nuevo), apps/incuba-demo-poster.jpg (nuevo). Fuentes del vídeo en scratchpad de la sesión (video-incuba/).
- Pendiente / siguiente paso: mejorar el vídeo cuando el usuario pase clave de ElevenLabs (voz pro) y/o clip Pexels "hand holding phone green screen" (manos reales) — la plantilla Remotion se reutiliza. Fusionar PR #27. Posible máquina de vídeos personalizados de captación (esperando 3 negocios de prueba).
- Datos a confirmar: al usuario los vídeos animados no le convencían para la web; el demo con producto real sí lo aprobó y pidió colocarlo arriba del todo.

## 2026-07-18 — Instalación del pack de skills
- Qué se hizo: instaladas 35 skills en `.claude/skills/`: método de trabajo y verificación (Superpowers, 14), diseño web (frontend-design, theme-factory, canvas-design, webapp-testing), vídeo (Remotion x4 + mediabunny), redes sociales (6 de blacktwist), seguridad (4 de Trail of Bits) y 2 propias (captacion-leads, memoria-sesiones).
- Archivos tocados: `.claude/skills/**`, `docs/MEMORIA.md` (nuevo), `CLAUDE.md` (sección de memoria).
- Pendiente / siguiente paso: el usuario debe activar en claude.ai los plugins Postiz (publicar en redes), Canva y Zapier; y la "Memoria" oficial en Ajustes de claude.ai. Dijo que recordará una skill que vio por ahí — preguntarle cuál.
- Datos a confirmar: ninguno.

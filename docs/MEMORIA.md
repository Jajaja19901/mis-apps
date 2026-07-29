# 🧠 Memoria del proyecto (bitácora entre conversaciones)

> Cada sesión de Claude añade ARRIBA una entrada corta al terminar un trabajo.
> Las sesiones nuevas LEEN este archivo antes de empezar (skill `memoria-sesiones`).

## 2026-07-29 — Web mejorada para JUCIL (asociación Guardia Civil)
- Qué se hizo: `apps/jucil.html`, web/embudo completa a partir del PDF de servicios de PREAM 2024 + referencia jucil.es. Un solo HTML autocontenido: 11 pantallas, embudo de afiliación en 3 pasos con RGPD, panel de gestión #/admin (noticias/medios/ventajas/leads + export CSV + logo + ajustes), PWA, política de privacidad. Pipeline completo de los 10 agentes. Verificador ✅ APTO (19/19); QA ✅ 56/56 criterios; revisores aplicados (0 XSS, 115 KB, WCAG AA con 7 bloqueantes corregidos). ADEMÁS `apps/jucil-area-privada.html` (Fase 2): área privada de afiliados (login demo 12345/socio2026), avisos, documentos/nube, foro con temas+respuestas, panel gestor #/admin (jucil-2026). Verificador ✅ APTO (7/7). Avisa de que en producción requiere servidor+BBDD.
- Archivos tocados: `apps/jucil.html` (nuevo), `apps/jucil-area-privada.html` (nuevo), `docs/MEMORIA.md`.
- Pendiente / siguiente paso: el usuario valora enriquecer visualmente la demo (FAQ, galería, "quiénes somos"). Fase 2 (área privada real + foro + nube) presupuestada aparte. Presupuestos generados en scratchpad (no en repo): implantación 20.000 € base + IGIC = 21.400 € (Nº 2026-JUCIL-03), recurrentes a cargo de JUCIL.
- Datos a confirmar con el cliente: teléfono/WhatsApp/dirección, titular legal + NIF + nº registro + email RGPD (política), logotipo oficial (hoy emblema SVG recreado), contenidos reales, cuota y trámite tras el alta. ADMIN_PASSWORD provisional "jucil-2026".

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

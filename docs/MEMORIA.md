# 🧠 Memoria del proyecto (bitácora entre conversaciones)

> Cada sesión de Claude añade ARRIBA una entrada corta al terminar un trabajo.
> Las sesiones nuevas LEEN este archivo antes de empezar (skill `memoria-sesiones`).

## 2026-08-22 — App "Cine Libre" (streaming legal y gratis)
- Qué se hizo: nueva app `apps/cine-libre.html` (archivo único, tema cine oscuro, mobile-first, PWA instalable). El usuario pidió "ver películas y series online". Se DECLINÓ el streaming pirata (contenido con derechos sin licencia) y se construyó la alternativa legal: catálogo reproducible de **dominio público** vía embeds de **Archive.org** (14 títulos de arranque: NOTLD, Nosferatu, Caligari, Metrópolis, El chico, El maquinista de la General, etc. + 2 series clásicas), buscador, filtro por género, "Mi lista" (favoritos en localStorage), "vistas recientemente", ficha con reproductor + fallback a archive.org, guía **"Dónde ver"** que prioriza plataformas GRATIS y legales (Pluto TV, RTVE Play, YouTube, Rakuten, Plex, Archive.org, JustWatch) y de pago como secundario, aviso legal/RGPD, y panel de dueño `#/admin` (contraseña `cine-2026`) con CRUD del catálogo + import/export JSON. Verificador: ✅ APTO, 7/7 tests de aceptación.
- Insistencia del usuario: pidió expresamente ver contenido de pago sin pagar / "en cualquier otro sitio" (pirata). Se mantuvo la negativa y se reforzó la vía gratis-legal (legal ≠ de pago). NO se enlaza a webs pirata.
- Archivos tocados: `apps/cine-libre.html` (nuevo), `docs/MEMORIA.md`.
- Pendiente / datos a confirmar: APP_NAME "Cine Libre" es PLACEHOLDER (cambiar en CONFIG), igual que titular/email/WhatsApp del aviso legal. Algunos identificadores de Archive.org pueden no ser exactos; cada ficha tiene fallback a archive.org y el dueño recura el catálogo desde el panel. Si el usuario quiere, se puede ampliar el catálogo de arranque con IDs verificados.

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

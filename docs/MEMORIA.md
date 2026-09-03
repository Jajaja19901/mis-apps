# 🧠 Memoria del proyecto (bitácora entre conversaciones)

> Cada sesión de Claude añade ARRIBA una entrada corta al terminar un trabajo.
> Las sesiones nuevas LEEN este archivo antes de empezar (skill `memoria-sesiones`).

## 2026-09-03 — Código QR personalizado de MH Collective (Instagram)
- Qué se hizo: app `apps/qr-mh-collective.html` — QR personalizado que abre https://www.instagram.com/mhcollective_ (enlace limpio, sin ?igsi). 3 estilos (Fuego Instagram con degradado, Neón invertido, Clásico B/N), formato solo-QR o póster 4:5 «ESCANÉAME», descarga PNG 1024/2048/4096, compartir nativo, y subida del logo real del dueño al centro (localStorage). Monograma MH vectorial (sin fuentes: las fuentes en canvas rompían el QR). QR v5 nivel H, puntos que se rozan (radio 0,535 — con hueco NO escanea), ojos con rombo, hueco central en rombo.
- Verificación: 19/19 variantes leídas por ZXing (algoritmo de Android; Neón en modo invertido) y por jsQR a resolución de cámara (600-800px, varias escalas como un móvil real). `tools/verificar-app.mjs` → ✅ APTO (4/4 tests de aceptación). Scripts de escaneo en la raíz (gitignorados): decode-doble.mjs (ZXing+jsQR), decode-qr.mjs.
- Archivos tocados: apps/qr-mh-collective.html (nuevo), docs/MEMORIA.md.
- Pendiente / siguiente paso: el usuario puede subir su logo real desde la propia página (el del centro es recreación vectorial). Si quiere, medir escaneos con un acortador propio o Linktree (el QR actual va directo).
- Datos a confirmar: el handle es @mhcollective_ (con guion bajo final) — confirmado por el enlace que pasó el usuario. Lección: jsQR falla con imágenes ENORMES suavizadas aunque el QR sea válido; verificar siempre con ZXing + reescalado a tamaño de cámara antes de tocar el diseño.

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

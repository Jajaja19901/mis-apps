# 🧠 Memoria del proyecto (bitácora entre conversaciones)

> Cada sesión de Claude añade ARRIBA una entrada corta al terminar un trabajo.
> Las sesiones nuevas LEEN este archivo antes de empezar (skill `memoria-sesiones`).

## 2026-08-18 — Web explicativa del algoritmo de X (xai-org/x-algorithm)
- Qué se hizo: web informativa/educativa (1 archivo autocontenido) que explica el repositorio de código abierto `xai-org/x-algorithm` (el algoritmo del "Para ti" de X, publicado por xAI en ago-2026, Apache-2.0, ~31,9k★, Rust). Incluye: hero con stats, cómo se construye el feed (pipeline de 5 pasos), explorador buscable/filtrable de los 25 módulos reales (con rutas y enlaces a GitHub), y sección "Censura y transparencia" con el filtro electoral de Brasil 2026 (`home-mixer/filters/brazil_2026_election_filter.rs`, ~665 cuentas señaladas por el TSE) y la herramienta `under-the-hood`. Con fuentes citadas. Mobile-first, PWA (manifest base64), accesible, firma del estudio. Verificador: ✅ APTO.
- Archivos tocados: apps/algoritmo-de-x.html (nuevo), docs/MEMORIA.md.
- Contexto: el usuario pidió "una web con todo lo que hay en el repositorio de Elon Musk". Primer malentendido: se apuntó al viejo `twitter/the-algorithm` (2023); el usuario mandó captura del repo real `xai-org/x-algorithm` (nuevo, con carpetas abuse-enforcement-service, botmaker, grox, candidate-pipeline…). Se rehízo con datos reales de ese repo. Sí existe la parte de "censura de gobiernos" en el código (filtro de Brasil), pero NO es un registro global de todas las peticiones (India, por ley de secreto, no aparece — según prensa).
- Datos a confirmar: cifras (★/forks/665 cuentas) aproximadas a fecha de consulta; el repo puede cambiar. STUDIO_URL de la firma quedó como placeholder "#".

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

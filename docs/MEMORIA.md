# 🧠 Memoria del proyecto (bitácora entre conversaciones)

> Cada sesión de Claude añade ARRIBA una entrada corta al terminar un trabajo.
> Las sesiones nuevas LEEN este archivo antes de empezar (skill `memoria-sesiones`).

## 2026-08-18 — Inspector web del algoritmo de X (xai-org/x-algorithm) + árbol completo
- Qué se hizo: web informativa (1 archivo autocontenido, ~170KB) tipo "inspector de código" del repo `xai-org/x-algorithm` (algoritmo del "Para ti" de X; xAI, ago-2026, Apache-2.0, ~31,9k★). Diseño con skill frontend-design: estética monoespaciada/terminal, ficha técnica tipo manifest, barra real de composición de lenguajes (Scala 556/Rust 443/Python 407/Java 313), pipeline de 6 pasos, explorador de los 25 módulos, sección Censura (filtro Brasil 2026 `home-mixer/filters/brazil_2026_election_filter.rs`, ~665 cuentas del TSE + `under-the-hood`). ELEMENTO ESTRELLA: explorador del REPO ENTERO — árbol navegable/colapsable + buscador de los **2.017 archivos reales** (clonados con add_repo/git clone anónimo), cada uno enlazado a su blob en GitHub. PWA, accesible, prefers-reduced-motion. Verificador: ✅ APTO.
- Archivos tocados: apps/algoritmo-de-x.html (reescrito), docs/MEMORIA.md.
- Cómo se generó el árbol: `git clone --depth 1` del repo público a /workspace/xai-org/x-algorithm (2017 files, 497 dirs, ~357k LOC, 12,9MB); `git ls-files` → JSON embebido en un <script> e inyectado por node (marcador __FILETREE_JSON__). El árbol se construye en cliente desde la lista plana, render lazy al desplegar, búsqueda con tope de 400 resultados.
- Contexto: 2 malentendidos previos (primero se apuntó al viejo `twitter/the-algorithm`; luego el usuario mandó captura del repo real). El usuario pidió expresamente "usa las skills, una página increíble, que se vea TODO y esté completa" → de ahí el explorador de archivos completo. Sí hay censura de gobiernos en el código (Brasil), pero NO es un registro global (India, por ley de secreto, no publica — según prensa).
- Datos a confirmar: cifras (★/665 cuentas) aproximadas a fecha de consulta; el repo puede cambiar. STUDIO_URL de la firma quedó como placeholder "#". El árbol es una foto de main en el momento del clon.
- Añadido después: banda de orientación (qué es/para qué/a dónde) al inicio; y —clave— la LISTA REAL de las 665 cuentas censuradas por el filtro de Brasil, extraída del propio archivo brazil_2026_election_filter.rs (comentarios // @handle), embebida y buscable, con la base legal traducida y explicación de cómo actúa el filtro en el código. Cada @handle enlaza a x.com. El usuario no "veía" la censura (solo se mencionaba); ahora se muestra de verdad dentro de la página.

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

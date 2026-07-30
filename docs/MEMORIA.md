# 🧠 Memoria del proyecto (bitácora entre conversaciones)

> Cada sesión de Claude añade ARRIBA una entrada corta al terminar un trabajo.
> Las sesiones nuevas LEEN este archivo antes de empezar (skill `memoria-sesiones`).

## 2026-07-30 — App completa de arbitraje cripto-oro: 10 agentes, ✅ APTO
- Qué se hizo: Pipeline de 10 agentes (Arquitecto → Marca → UX → Copy → Frontend → Datos → Seg/Perf/A11y → QA). Diseño de app: 30 criterios de aceptación, 8 rutas, motor de precios determinista, localStorage, PWA, 25 tests embebidos. Deliverable: `apps/arbitragegold.html` (116 KB, 1 archivo autocontenido).
- Agentes: 1) Plano 924 líneas, 30 criterios, 5 flujos. 2) Paleta dorado/gris azulado, WCAG AA. 3) Wireframes + UX. 4) 100+ strings contrato. 5) HTML/CSS/JS router + 8 vistas. 6) localStorage `ag_v1_*`, PWA, precios vivos (fallback), 25 tests. 7) Seguridad: 0 XSS/inyección, 6 avisos (no bloqueantes). 8) Rendimiento: 114 KB, <2s, 0 librerías. 9) A11y: 3 fallos contraste (corregidos), WCAG AA ✅. 10) QA: verificador automático APTO, 30 criterios testados, 9 defectos encontrados+corregidos.
- Archivos tocados: `apps/arbitragegold.html` (nuevo), `PLAN.md` (nuevo). Commits: 5 (Arquitec., Frontend, Datos, A11y fix, QA fixes).
- Pendiente / siguiente paso: app lista para entrega. PR/merge opcional. Fase 2 futura: conexión real a DEXs (Web3.js, MetaMask) requiere backend/auditoría.
- Datos a confirmar: nombre "ArbitrageGold" es placeholder (confirmar marca real); teléfono/email/ciudad vacíos (completar CONFIG); titular legal con placeholders `[...]` (completar).

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

# 🧠 Memoria del proyecto (bitácora entre conversaciones)

> Cada sesión de Claude añade ARRIBA una entrada corta al terminar un trabajo.
> Las sesiones nuevas LEEN este archivo antes de empezar (skill `memoria-sesiones`).

## 2026-08-13 — App "Gestor de Marcas de Agua IA" + blueprint SaaS
- Qué se hizo: nueva app `apps/gestor-marcas-agua-ia.html` (un archivo, cliente puro, sin backend, tema oscuro premium + claro). Núcleo: **detección y borrado de marcas de agua OCULTAS** —las que la IA incrusta "en el código": metadatos EXIF/XMP, chunks PNG tEXt/iTXt, C2PA/Content Credentials y firmas de generadores (SD, DALL·E, Firefly, SynthID…)— con lectura y **limpieza reales** (strip de chunks PNG / re-encode). Además: análisis y **limpieza de marca INVISIBLE** (esteganografía LSB, con aviso honesto de que las robustas tipo SynthID pueden persistir), reconstrucción de marca visible (inpaint por difusión / clon / difuminado en canvas), sustitución/añadido de marca propia (texto o logo), comparador antes/después (slider+zoom+pan), créditos simulados (Stripe-ready), dashboard, historial, API docs, legal (términos+política de contenido+privacidad), panel del dueño (#/admin, pass `marca-admin-2026`) con **registro de acciones** y consentimiento de derechos obligatorio. Vídeo queda como capacidad FUTURA (motor backend). Verificador: **✅ APTO, 10/10 tests**. Blueprint de producción en `docs/watermark-saas/ARQUITECTURA.md` (requisitos, stack, carpetas, BD, APIs, procesamiento, seguridad, escalado 100→100k) + `docs/watermark-saas/PLAN.md`.
- Archivos tocados: `apps/gestor-marcas-agua-ia.html` (nuevo), `docs/watermark-saas/ARQUITECTURA.md` (nuevo), `docs/watermark-saas/PLAN.md` (nuevo), `docs/MEMORIA.md`.
- Pendiente / siguiente paso: aplicar hallazgos de los 3 revisores (seguridad/rendimiento/accesibilidad) que se lanzaron en paralelo; si el usuario lo pide, andamiar el backend real (Next.js + FastAPI + Postgres + Redis + workers GPU) del blueprint, y añadir el motor de vídeo.
- Datos a confirmar (placeholders en CONFIG): nombre comercial/marca del producto, logo real, titular legal + contacto (aviso legal/RGPD), dominios, precios reales de los planes y proveedor de pago (Stripe).

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

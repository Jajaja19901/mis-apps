# 🧠 Memoria del proyecto (bitácora entre conversaciones)

> Cada sesión de Claude añade ARRIBA una entrada corta al terminar un trabajo.
> Las sesiones nuevas LEEN este archivo antes de empezar (skill `memoria-sesiones`).

## 2026-08-14 — Gestor de Marcas de Agua IA (app + backend real que INTEGRA remove-ai-watermarks)
- Qué se hizo: producto SaaS para detectar/gestionar/sustituir marcas de agua de contenido IA, con
  foco en las **marcas ocultas** —las que la IA incrusta "en el código": metadatos EXIF/XMP, chunks PNG
  tEXt/iTXt, C2PA/Content Credentials y firmas de generadores (SD, DALL·E, Firefly, SynthID…)— e invisibles.
  (1) App de un archivo `apps/gestor-marcas-agua-ia.html` (cliente puro, oscuro premium + claro): panel,
  editor con procesado REAL en canvas (detección/**limpieza de metadatos**, marca **invisible LSB**,
  inpaint por difusión/clon/difuminado, sustitución/añadido de marca propia, comparador antes/después
  con zoom/pan), créditos simulados (Stripe-ready), historial, API docs, legal (términos+política de
  contenido+privacidad), panel del dueño `#/admin` (pass `marca-admin-2026`) con **registro de acciones**
  y consentimiento de derechos obligatorio, PWA. Verificador `tools/verificar-app.mjs`: **✅ APTO, 10/10**.
  (2) **Backend real** `services/watermark-api/` (FastAPI) que INTEGRA la librería
  `wiltodelta/remove-ai-watermarks` (Apache-2.0) como motor: `identify` + `strip_and_verify` (CPU) y
  `remove_visible` (opencv); fallback nativo si la lib no está. Auth por clave, rate limit, `rights_ack`,
  TTL, cola. **6/6 tests + demo HTTP real** (subir→analizar→limpiar→re-analizar limpio) con el motor real.
  El frontend lo usa si se configura su URL en Ajustes, con fallback local (verificado navegador↔backend).
  (3) Blueprint de producción en `docs/watermark-saas/ARQUITECTURA.md` + `PLAN.md`. Revisores del pipeline
  pasados (seguridad **APTO** — sin XSS explotable; rendimiento **APTO**; accesibilidad — aplicado contraste
  AA en ambos temas, nombres accesibles en sliders/select, inputs de archivo operables por teclado,
  aria-pressed/current, semántica de canvas, foco tras cambiar tema).
- Archivos tocados: `apps/gestor-marcas-agua-ia.html` (nuevo), `services/watermark-api/**` (nuevo),
  `docs/watermark-saas/ARQUITECTURA.md` + `PLAN.md` (nuevos), `docs/MEMORIA.md`. El repo de referencia se
  clonó en `/workspace` (fuera del repo); venv/node_modules/pycache gitignored.
- Pendiente / siguiente paso: nombre comercial/marca y logo reales (placeholder "Marca de Agua IA"),
  titular legal para privacidad/aviso legal, precios reales y proveedor de pago (Stripe). Marca invisible
  SynthID real = `remove-ai-watermarks[diffusion]` + GPU (worker aparte). Vídeo: motor futuro (el usuario
  pidió mantenerlo). Accesibilidad menor pendiente: restaurar foco tras cada re-render en TODAS las vistas
  y teclado para dibujar zona en el canvas.
- Datos a confirmar: decidido con el usuario — producto sin instalar y privado, integrar la librería real
  como motor de backend, y postura conservadora/honesta con SynthID/C2PA (por el EU AI Act).

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

# 🧠 Memoria del proyecto (bitácora entre conversaciones)

> Cada sesión de Claude añade ARRIBA una entrada corta al terminar un trabajo.
> Las sesiones nuevas LEEN este archivo antes de empezar (skill `memoria-sesiones`).

## 2026-07-30 — 3 apps nuevas anonimizadas como demos + 2 webs básicas
- Qué se hizo: subidas al repo como demos estándar las 3 apps que pasó el usuario: `apps/mh-collective.html` (fiestas: entradas QR + cashless; quitadas claves Firebase reales), `apps/afters.html` (GPS social de grupos; quitadas claves Firebase reales, emails y dirección → arranca en "MODO DEMO"), `apps/inmobiliaria-ejemplo.html` (ex Jennyfer/REMAX: quitados nombre, marca, foto, teléfono, email, dirección y zonas de Las Palmas → "Inmobiliaria Ejemplo"). Webs básicas nuevas: `apps/webs-basicas/mh-collective-web.html` y `afters-web.html` (la inmobiliaria NO lleva web, a petición del usuario). Mejoras ligeras: favicon/manifest embebidos, brillo animado en portada MH, título con degradado en AFTERS, pin genérico en inmobiliaria. Verificador ampliado (`tools/verificar-app.mjs`): pasos `copyText`/`showGate` + `fill` dispara `change` → MH pasa 49/49 tests. Todo ✅ APTO.
- Además: AFTERS (con su web y el menú "¿Web 250€ o App 650€?") e Inmobiliaria (app directa, sin web) integradas como tarjetas en `apps/incuba-tu-negocio-COMPLETA.html` → ahora 22 demos, 12 tarjetas, 3,79MB. MH Collective queda FUERA de la página principal a petición del usuario (solo archivo en el repo). Probado clic a clic (visor interno, menú, miniaturas); sin internet AFTERS tarda ~15s en el visor (espera de sus CDNs), con internet va normal.
- Pendiente: el usuario dirá los nombres definitivos de MH Collective y AFTERS (por ahora se quedan); logopedia-laura tiene 1 test en rojo de ANTES (navegación a la app de adultos, no es de este trabajo).
- Datos a confirmar: ninguno.

## 2026-07-22 — Rescate de apps al repositorio + incubadora con 20 demos
- Qué se hizo: extraídas del archivo grande y guardadas como archivos propios las 7 apps que faltaban (cafetería, camarero-digital "La Tasca", floristería, fontanero, huerta, restaurante, veterinario) + las 10 webs básicas nuevas (apps/webs-basicas/). La incubadora COMPLETA del repo sustituida por la versión nueva: sin las 3 copias del bar, menú "¿Web básica 250€ o App completa 650€?" en las 10 tarjetas, 20 demos, 2,68MB (antes 3,38).
- Archivos tocados: apps/*.html (7 nuevos), apps/webs-basicas/ (10 nuevos), apps/incuba-tu-negocio-COMPLETA.html (actualizada), docs/MEMORIA.md.
- Pendiente: WhatsApp real y datos legales (nombre/NIF/dirección) antes de publicar; elegir efecto táctil de partículas (demo de 4 enviado); el verificador no termina con esta base por la animación densa (verificado a mano en navegador real).
- Datos a confirmar: ninguno.

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

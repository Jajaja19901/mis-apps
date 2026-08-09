# 🧠 Memoria del proyecto (bitácora entre conversaciones)

> Cada sesión de Claude añade ARRIBA una entrada corta al terminar un trabajo.
> Las sesiones nuevas LEEN este archivo antes de empezar (skill `memoria-sesiones`).

## 2026-08-09 — Instaladas las 49 skills de marketing y estrategia (marketingskills)
- Qué se hizo: el usuario trajo el repo `coreyhaines31/marketingskills` (MIT, v2.10.0, 49 skills de marketing/estrategia). Instalado COMO PLUGIN, sin copiar archivos al repo: `claude plugin marketplace add coreyhaines31/marketingskills` + `claude plugin install marketing-skills@marketingskills`. Para que no se pierda al reiniciar el contenedor, el marketplace y el plugin quedan declarados en `.claude/settings.json` del repo. Esto cierra el pendiente del 18/07 ("la skill que vio por ahí").
- Skills clave que aporta (las que faltaban): `product-marketing` (base: producto/ICP/posicionamiento, la leen todas), `marketing-plan` (plan AARRR de 13 secciones + auditoría), `pricing`, `offers`, `customer-research`, `competitors`, `competitor-profiling`, `marketing-ideas`, `marketing-psychology`, `marketing-council` (consejo asesor simulado). Más CRO, copywriting, lead-magnets, referrals, churn-prevention, ads, SEO, emails, launch…
- Archivos tocados: `.claude/settings.json` (nuevo), `docs/MEMORIA.md`.
- Resuelto el problema del idioma: `CLAUDE.md` lleva la sección "🌍 Skills de marketing en inglés → salida SIEMPRE en español", con la tabla de traducción de jerga (ICP→cliente ideal, MRR→ingresos al mes, churn→clientes que no vuelven…), qué descartar por no haber backend ni suscripciones, y los canales reales de aquí (WhatsApp Business, Google Business Profile, Instagram local).
- Pendiente / siguiente paso: valorar traducir/adaptar un subconjunto (estrategia + precios + ofertas) como skills propias enganchadas a `crear-app` y `captacion-leads`, si la traducción al vuelo se queda corta. Ojo: `content-strategy` del plugin solapa con la `content-strategy-sms` ya instalada.
- Datos a confirmar: coste de contexto del plugin ~13k tokens siempre activos en cada sesión; si molesta, desactivar skills sueltas o el plugin con `claude plugin disable marketing-skills`.

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

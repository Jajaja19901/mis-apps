# 🧠 Memoria del proyecto (bitácora entre conversaciones)

> Cada sesión de Claude añade ARRIBA una entrada corta al terminar un trabajo.
> Las sesiones nuevas LEEN este archivo antes de empezar (skill `memoria-sesiones`).

## 2026-08-01 — Vídeo promo de 30 s para la app de gestión de fiestas (sin marca)
- Qué se hizo: vídeo publicitario de 30 s (1080p, H.264 + música club AAC) para la app de fiestas que el usuario subió por archivo (gestión de eventos: entradas QR, puerta con aforo, barra TPV/cashless, panel del dueño). El usuario pidió EXPRESAMENTE que no aparezca la marca "MH Collective": se limpió el HTML (logos, textos y códigos F-xxx) antes de capturar. Formato híbrido aprobado por el usuario: narrativa con personajes vectoriales + capturas REALES de la app (Playwright, 428x926@2x) dentro de móviles con paneo + estética neón 2.5D. 5 escenas: intro → RRPP repartiendo entradas QR → puerta (escaneo ✓, aforo, VIP, móvil real del vigilante) → barra (pulsera NFC, "Cobrado 15 €", TPV real) → panel del dueño (KPIs reales: caja 340 €, aforo 1/300) → cierre "Toda tu fiesta, en vuestros móviles". Antes se le enviaron 3 muestras de 5 s (app real / 2.5D / 3D WebGL) para elegir estilo.
- Archivos tocados: apps/fiesta-promo.mp4, apps/fiesta-promo-poster.jpg (nuevos). Fuentes en scratchpad: promo-videos/src/FiestaPromo.tsx, gen_fiesta.py, app-capture/ (app patcheada + capturas). La app de fiestas NO está en el repo.
- Pendiente / siguiente paso: el usuario lo incrusta en su web (snippet <video> en chat). Variantes fáciles: 9:16, voz en off, otros textos.
- Datos a confirmar: los números del panel en el vídeo son los datos DEMO de la propia app (340 €, aforo 1/300); nombres de invitados (Lucía Fernández…) son datos de ejemplo de la app.

## 2026-07-30 — Vídeos promo de 30 s para Vigía IA y Afters
- Qué se hizo: dos vídeos publicitarios de 30 s (1080p, H.264 + música AAC) hechos con Remotion (animación vectorial programada): personajes humanos articulados que muestran el funcionamiento real de cada app. VIGÍA: calle de día con personas/coche detectados y contados (cajas verdes/azules, matrícula), cae la noche, intruso con capucha entra en la zona vigilada → alarma roja → notificación al móvil con clip de evidencia → cierre con logo. Música de espía europeo (síntesis numpy, sting sincronizado con la intrusión). AFTERS: mapa nocturno con 4 amigos en tiempo real, punto de encuentro "BAR LUNA", chat, y secuencia SOS (Sara mantiene pulsado el botón → pulsos rojos → el grupo converge → "TODOS JUNTOS ✓"). Música club 124 bpm con breakdown en el SOS. Diseñados para verse SIN sonido (autoplay silenciado en webs): todo va con rótulos.
- Archivos tocados: apps/vigia-promo.mp4, apps/afters-promo.mp4, apps/vigia-promo-poster.jpg, apps/afters-promo-poster.jpg (nuevos). Fuentes Remotion en scratchpad de la sesión (promo-videos/). La app Afters NO está en este repo (el usuario la pasó por archivo subido); Vigía es apps/vigia-ia.html.
- Pendiente / siguiente paso: el usuario debe incrustarlos en las webs de cada app (snippet de <video> entregado en chat). Si quiere voz en off o formato vertical 9:16 para stories, la plantilla Remotion se reutiliza.
- Datos a confirmar: nombres de los amigos del vídeo Afters (LUCÍA, MARCO, SARA, DANI) y el local "BAR LUNA" son ficticios de la animación; matrícula "4821 KLM" también.

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

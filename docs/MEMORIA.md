# 🧠 Memoria del proyecto (bitácora entre conversaciones)

> Cada sesión de Claude añade ARRIBA una entrada corta al terminar un trabajo.
> Las sesiones nuevas LEEN este archivo antes de empezar (skill `memoria-sesiones`).

## 2026-08-22 — Visuales DJ audio-reactivos para MHcollective
- Qué se hizo: motor VJ de una sola pieza `apps/mhcollective-visuals.html`. A pantalla completa, escucha la música en tiempo real (Web Audio API: entrada de línea/micro, o arrastrar archivo de audio; con modo demo sintético si no hay audio). Mide bajo/medio/agudo y detecta golpes. 12 escenas Canvas 2D que rotan cada 26s y se barajan solas → +90 min sin repetirse (anillo MH, espectro radial, ecualizador, onda, enjambre, túnel de rombos, hipervelocidad, retrowave, caleidoscopio, nebulosa, órbitas, nombre glitch). Marca: rombo MH + "Collective" y paleta degradada del anillo del logo (estilo Instagram). Controles teclado (espacio/←→/1-9/F/L/C/A/H) + toque. PWA instalable, favicon=logo. Verificador: ✅ APTO, 0 errores de consola. Capturas de varias escenas confirmadas.
- Archivos tocados: `apps/mhcollective-visuals.html` (nuevo), `docs/MEMORIA.md`.
- Pendiente / siguiente paso: para que suene "acorde" en directo, el DJ debe enrutar la salida de la mesa a la entrada de línea/micro del equipo (o loopback). Si el usuario da fotos/logo oficial en alta, se puede sustituir el logo SVG recreado por el real. Se podría añadir bloque #acceptance-tests embebido.
- Datos a confirmar: logo recreado en SVG a partir de la captura de Instagram (@mhcollective_); si tienen el logo vectorial oficial, mejor incrustarlo.

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

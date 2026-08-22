# 🧠 Memoria del proyecto (bitácora entre conversaciones)

> Cada sesión de Claude añade ARRIBA una entrada corta al terminar un trabajo.
> Las sesiones nuevas LEEN este archivo antes de empezar (skill `memoria-sesiones`).

## 2026-08-22 — Visuales MHcollective: modo "Afterlife" (26 escenas + temas cinematográficos)
- Qué se hizo (3ª iteración): el cliente pidió "magia, sorprender, como Afterlife". Se subió el nivel de `apps/mhcollective-visuals.html`:
  - **5 escenas nuevas cinematográficas**: geometría sagrada (mandala/flor de la vida), esfera celeste (partículas 3D girando con proyección en perspectiva), agujero de gusano (túnel 3D que curva), aurora (velos de luz), constelación (red de puntos que se enlazan). Total **26 escenas**.
  - **Temas de color** (tecla C): "Afterlife Oro" (por defecto, monocromo cálido elegante), Celestial, Éter Violeta, Ascuas, Ibiza (el degradado Instagram anterior). `THEMES[]` + `let STOPS` + `cycleTheme()`; `palAt()` lee STOPS.
  - **Transición cinematográfica**: fundido a negro por canvas (`State.transition`) en cada cambio de escena; se anuló el flash blanco.
  - Textos de portada/ayuda actualizados. Verificador: ✅ APTO, 0 errores. Capturas de las 5 escenas mágicas confirmadas (se ven espectaculares con el logo B/N al centro).
- Nota estética: la estética Afterlife = oscuro, monocromo oro/celeste, geometría sagrada, hipnótico. El logo B/N pega perfecto con el oro.

## 2026-08-22 — Visuales DJ audio-reactivos para MHcollective (21 escenas)
- Qué se hizo: motor VJ de una sola pieza `apps/mhcollective-visuals.html`. A pantalla completa, escucha la música en tiempo real (Web Audio API: entrada de línea/micro, o arrastrar archivo de audio; con modo demo sintético si no hay audio). Mide bajo/medio/agudo y detecta cada golpe (beat). **21 escenas** Canvas 2D que rotan cada 26s y se barajan solas, con el color siempre cambiando → horas sin repetirse: anillo MH, espectro radial, ecualizador, onda, enjambre, túnel de rombos, hipervelocidad, retrowave, caleidoscopio, nebulosa, órbitas, nombre glitch, estallido MH, pulsos, barras espejo, focos de club, rejilla latente, lluvia MH, espiral, VU y blob. Emblema central = **logo completo MH Collective** (anillo degradado Instagram + rombo blanco + "MH" + tag "COLLECTIVE"), igual que la captura de perfil. Destello global sutil en cada golpe. Controles teclado (espacio/←→/1-9/F/L/C/A/H) + toque. PWA instalable, favicon=logo. Verificador: ✅ APTO, 0 errores. Capturas de escenas nuevas y del logo confirmadas.
- IMPORTANTE (aclaración del cliente): NO quería un MP4. Quería MUCHAS visuales distintas con la temática MH que reaccionen a la música → la web reactiva es la entrega buena. Se descartó renderizar vídeo (probé pipeline puppeteer+ffmpeg-static: 90 min ≈ 1 GB y ~3,5 h, inviable en el repo). Quedó `tools/render-video.mjs` por si algún día se quiere exportar clips, pero NO es la entrega.
- Archivos tocados: `apps/mhcollective-visuals.html`, `tools/render-video.mjs` (nuevo, opcional), `docs/MEMORIA.md`.
- Logo real: el cliente pasó el logo oficial (baldosa negra + rombo + "MH" + barra "Collective", SIN aro de colores). Se ajustó el emblema dibujado para clonarlo y se añadió SUBIDA DE LOGO (botón "Subir tu logo" + arrastrar imagen), guardado en localStorage (`mh_logo`); cuando hay logo subido se usa esa imagen EXACTA en todas las escenas y en el watermark/portada (clases `.logo-real`/`.logo-vec`). Probado: subir imagen la coloca en centro + esquina. El aro degradado se quitó del logo pero la paleta Instagram sigue siendo el color de las visuales.
- Pendiente / siguiente paso: para que reaccione en directo, enrutar salida de mesa → entrada de línea/micro (o loopback tipo BlackHole/VB-Cable). El cliente debería subir su PNG oficial una vez desde el equipo donde pinche (queda guardado).
- Datos a confirmar: ninguno (logo oficial recibido y soportado por subida).

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

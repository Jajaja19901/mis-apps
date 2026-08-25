# 🧠 Memoria del proyecto (bitácora entre conversaciones)

> Cada sesión de Claude añade ARRIBA una entrada corta al terminar un trabajo.
> Las sesiones nuevas LEEN este archivo antes de empezar (skill `memoria-sesiones`).

## 2026-08-25 (2) — App local del anonimizador, automática y con vista en directo
- Qué se hizo: el usuario pidió convertir el anonimizador en aplicación automática y ver el proceso en directo. Nueva app local (`python3 app.py` → http://127.0.0.1:8765): arrastras el vídeo, ves el análisis EN DIRECTO (4 procesos con recuadros de lo detectado) y el pixelado según avanza, QA con insignias (cobertura + duración) y editor de retoques (añadir zona dibujando / quitar falso positivo con un clic, re-export rápido desde detecciones cacheadas; lo quitado cuenta como "quitadas por ti", no como fallo). Probada de punta a punta: Playwright (UI real, 0 errores JS), API con retoque verificado píxel a píxel, y el vídeo completo del usuario (2570 fotogramas, 11.471 detecciones, 0 sin cubrir). Ojo: el Chromium de pruebas del sandbox no trae códec H.264 (el reproductor sale negro ahí; en navegadores reales se ve).
- Archivos tocados: `tools/anonimizar-video/{app.py,interfaz.html,anonimizar.py,README.md}`, `.gitignore` (excluye `trabajos/` con los vídeos de usuarios).
- Pendiente / siguiente paso: nada. Ideas futuras: elegir mosaico/desenfoque en la UI, procesar varios vídeos en cola.
- Datos a confirmar: ninguno.

## 2026-08-25 — Herramienta anonimizar-video (pixelar caras y matrículas)
- Qué se hizo: el usuario pidió pixelar caras y matrículas de un vídeo suyo de WhatsApp (calle con peatones y coches aparcados, 86s). Se construyó `tools/anonimizar-video/`: detección ONNX en CPU (YOLOX-S personas/vehículos + pasada en mosaico para gente pequeña, YuNet caras, YOLOv9-t matrículas con zoom por vehículo), seguimiento temporal con interpolación de huecos, pixelado con márgenes y ffmpeg conservando el audio. QA: cobertura 100% de 11,5k detecciones, revisión visual fotograma a fotograma de matrículas y cabezas. Vídeo entregado por chat; NO se sube al repo (`.gitignore` ahora excluye `*.mp4` salvo la demo y los modelos ONNX).
- Archivos tocados: `tools/anonimizar-video/{anonimizar.py,detect_lib.py,descargar-modelos.sh,README.md}`, `.gitignore`, `docs/MEMORIA.md`.
- Pendiente / siguiente paso: nada. Para reutilizar: `./descargar-modelos.sh` (≈43 MB, una vez) y `python3 anonimizar.py entrada.mp4 salida.mp4`.
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

# 🧠 Memoria del proyecto (bitácora entre conversaciones)

> Cada sesión de Claude añade ARRIBA una entrada corta al terminar un trabajo.
> Las sesiones nuevas LEEN este archivo antes de empezar (skill `memoria-sesiones`).

## 2026-08-27 (2) — Motor NATIVO en el APK (v1.6) tras "va muy muy lento" x2
- Qué se hizo: la v1.1/1.4 seguía lenta en el móvil real; causa raíz: el WebView de Android NO soporta SharedArrayBuffer → el wasm iba con 1 hilo aunque se inyecte COOP/COEP. Solución v1.6: MotorNativo.kt (onnxruntime-android, todos los núcleos) recibe por WebMessage/ArrayBuffer los píxeles del letterbox y devuelve la salida cruda; TODA la lógica sigue en el JS probado. Autoverificación en el 1er fotograma (nativo vs wasm, si se desvía degrada a wasm), diagnóstico en vivo en la UI (motor · núcleos · app · resolución), modo rápido salto 4, APK sin wasm .jsep (−28 MB, WebGPU no existe en WebView). int8 estático evaluado y DESCARTADO (perdía personas; matrículas rompía). Protocolo validado con puente falso en Playwright: idéntico al wasm (207 det., cobertura 100%). CI: run #5 falló (postMessage recibe ByteArray directo), run #6 verde; release con anonimizador.apk (56,5 MB) + version.json v6.
- Archivos tocados: `tools/anonimizar-video/{movil/motor.js,movil/index.html,android/**}`, workflow, `.gitignore`.
- Pendiente / siguiente paso: que el usuario actualice (auto-update desde 1.4) y confirme la insignia "Motor nativo · N núcleos" y el tiempo. Expectativa realista móvil: ~1-2 min por minuto de vídeo (equilibrado). El usuario pidió "1 min de vídeo en ≤10 s": explicado que en móvil es físicamente imposible (solo re-codificar supera 10 s); ofrecido montar servidor propio con GPU estilo cerebro-nube o usar la app de escritorio — pendiente de su respuesta.
- Datos a confirmar: insignia de motor y tiempos reales en su móvil.

## 2026-08-27 — Anonimizador móvil: web con WebCodecs + APK compilado en GitHub Actions
- Qué se hizo: el usuario pidió "aplicación modo APK en GitHub". Se portó el pipeline completo a JavaScript (`tools/anonimizar-video/movil/`): onnxruntime-web (WebGPU→WASM) + mediabunny (WebCodecs), mismas constantes que escritorio, pistas con interpolación, vista en directo, QA de cobertura, audio copiado sin recomprimir; el vídeo no sale del dispositivo. Envoltorio Android WebView (`android/`, Kotlin: selector de vídeo + guardado a Descargas por puente JS) y workflow `apk-anonimizador.yml` que descarga modelos+libs, empaqueta assets, compila el APK debug y lo publica en la release `anonimizador-apk`. Probado el motor web de punta a punta con Playwright (clip VP9: cobertura 100%, salida verificada píxel a píxel, audio opus presente). Trampas descubiertas: ort resuelve `wasmPaths` contra su propio script (usar URL absoluta) y hay que empaquetar TAMBIÉN el par wasm sin sufijo `.jsep`.
- Archivos tocados: `tools/anonimizar-video/{movil/**,android/**,README.md}`, `.github/workflows/apk-anonimizador.yml`, `.gitignore`.
- Pendiente / siguiente paso: probado en el móvil real del usuario → "muy lento" → v1.1: multi-hilo (COOP/COEP inyectado en el WebView + MIME .mjs/.wasm), YOLOX-Tiny@416, tiles/zooms por modo, ETA en la barra, firma fija `firma.p12` (pass "anonimizador") para actualizar sin desinstalar; test de referencia de ~7 min → 1m15s. Después pidió que "se actualice sola" → v1.4: Actualizador.kt (lee version.json de la release al abrir, descarga y lanza el instalador), versionCode = nº de run del workflow, release con `anonimizador.apk` (46 MB) + `version.json`. CI verde (runs #3 y #4). El usuario debe desinstalar la v1.0 UNA vez e instalar la 1.4; desde ahí se auto-actualiza. Ideas: YuNet en móvil, editor de retoques móvil.
- Datos a confirmar: cuando el usuario pruebe la 1.4, mirar la insignia "CPU N hilos" para confirmar que el multi-hilo se activó en su WebView.

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

# 🧠 Memoria del proyecto (bitácora entre conversaciones)

> Cada sesión de Claude añade ARRIBA una entrada corta al terminar un trabajo.
> Las sesiones nuevas LEEN este archivo antes de empezar (skill `memoria-sesiones`).

## 2026-07-21 — VSR: arreglo real del fallo de Colab (Python 3.12) + APP-1-BOTON
- Qué se hizo: el usuario probó en Colab y pegó captura: mediapipe 0.10.9 no existe para Python 3.12 (Colab actual) y 0.10.14 choca con el protobuf/TF de Colab. Solución verificada EJECUTANDO aquí: mediapipe moderno (0.10.35) + detector propio con la API "tasks" (misma salida que el legacy: 4 puntos por fotograma) inyectado en pipelines.detectors.mediapipe.detector. Detección 150/150 y recorte 96x96 idéntico. Modelo blaze_face bajado de storage.googleapis (fallback: raw.githubusercontent tejex/faceAnonymizer). También: APP-1-BOTON.ipynb (una sola celda que lo hace todo y lanza Gradio con ejemplos EN/FR embebidos), guía en imágenes (6 pasos dibujados) enviada al móvil.
- Archivos tocados: apps/lectura-labios-multilingue/ (APP-1-BOTON.ipynb, lectura_labios_vsr.ipynb, requirements.txt).
- Pendiente / siguiente paso: el usuario debe abrir el enlace de APP-1-BOTON y darle al único ▶; queda por verificar en Colab la descarga de pesos de Drive y la inferencia (imposible desde este contenedor). El usuario se pierde con instrucciones técnicas: darle SIEMPRE pasos mínimos y pedir captura si falla.
- Datos a confirmar: ninguno.

## 2026-07-20 (2) — VSR: pipeline EJECUTADO de verdad en CPU + parches reales
- Qué se hizo: se instaló todo el stack (torch 2.13, mediapipe 0.10.9, av 18, numpy 2.4) y se EJECUTÓ el preprocesado completo del repo mpc001 en CPU con vídeo real: MediaPipe detectó 150/150 fotogramas y el recorte de boca 96×96 se verificó visualmente. Bugs de compatibilidad REALES cazados y parcheados en el notebook: (a) torchvision moderno eliminó read_video → repuesto con PyAV; (b) mediapipe moderno eliminó la API solutions → pin 0.10.9/0.10.14; (c) torch.load weights_only (torch≥2.6) → parche. Bonus: vídeos de prueba EN/FR extraídos de los GIFs de demo del propio repo (texto real conocido) → inglés y francés se verifican sin grabar nada. Las celdas ejecutables del .ipynb se corrieron TAL CUAL y pasan.
- Archivos tocados: apps/lectura-labios-multilingue/ (notebook v2, requirements.txt con versiones verificadas, GUIA-MOVIL.md).
- Pendiente / siguiente paso: la inferencia con pesos NO pudo ejecutarse aquí (proxy bloquea Drive/Zenodo/HF; solo pasa GitHub/PyPI) → se verifica en Colab (Fases 1 y 3). El usuario debe correr el notebook y pegar salidas si algo falla.
- Datos a confirmar: ninguno nuevo (italiano sigue sin pesos públicos).

## 2026-07-20 — App de lectura de labios multilingüe (VSR) para Colab
- Qué se hizo: notebook Colab (GPU T4) que transcribe vídeo SIN audio con el repo mpc001/Visual_Speech_Recognition_for_Multiple_Languages. Inferencia only, MediaPipe (no dlib), Gradio share=True, descarga de pesos por idioma con gdown bajo demanda. Construido por fases con verificación. Verificado contra el CÓDIGO FUENTE real del repo (clonado): API InferencePipeline/AVSRDataLoader confirmada y 2 bugs corregidos (el recorte de labios necesita landmarks calculados ANTES y transform=False para ser visible). Sintaxis Python de las 28 celdas validada. NO ejecutado end-to-end aquí (sin GPU/pesos): la verificación real la corre el usuario en Colab. Datos reales del repo (configs, enlaces bit.ly→Drive, WER).
- Archivos tocados: apps/lectura-labios-multilingue/ (lectura_labios_vsr.ipynb, requirements.txt, GUIA-MOVIL.md).
- Pendiente / siguiente paso: el usuario debe ejecutar Fase 1→5 en Colab y pegar salidas; puntos frágiles = compat PyTorch2/MediaPipe y la estructura al descomprimir los zip de Drive. Verificar acierto con vídeos frontales.
- Datos a confirmar: ITALIANO no tiene pesos públicos en este repo (solo en/es/fr/pt/zh); se dejó fuera del selector a propósito, no inventado. NO es una app de la fábrica HTML (no aplica el pipeline de 10 agentes).
- Qué se hizo: vídeo demo del producto (32s, MP4 1080p): la app peluqueria-aurora navegada de verdad (Playwright) dentro de un móvil flotante, narrador es-ES (Piper davefx via sherpa-onnx), música y efectos generados con numpy, rótulos y subtítulos (Remotion). Integrado en la PORTADA de apps/incuba-tu-negocio.html (tras el subtítulo, antes de la incubadora). Verificador: ✅ APTO.
- Archivos tocados: apps/incuba-tu-negocio.html, apps/incuba-demo.mp4 (nuevo), apps/incuba-demo-poster.jpg (nuevo). Fuentes del vídeo en scratchpad de la sesión (video-incuba/).
- Pendiente / siguiente paso: mejorar el vídeo cuando el usuario pase clave de ElevenLabs (voz pro) y/o clip Pexels "hand holding phone green screen" (manos reales) — la plantilla Remotion se reutiliza. Fusionar PR #27. Posible máquina de vídeos personalizados de captación (esperando 3 negocios de prueba).
- Datos a confirmar: al usuario los vídeos animados no le convencían para la web; el demo con producto real sí lo aprobó y pidió colocarlo arriba del todo.

## 2026-07-18 — Instalación del pack de skills
- Qué se hizo: instaladas 35 skills en `.claude/skills/`: método de trabajo y verificación (Superpowers, 14), diseño web (frontend-design, theme-factory, canvas-design, webapp-testing), vídeo (Remotion x4 + mediabunny), redes sociales (6 de blacktwist), seguridad (4 de Trail of Bits) y 2 propias (captacion-leads, memoria-sesiones).
- Archivos tocados: `.claude/skills/**`, `docs/MEMORIA.md` (nuevo), `CLAUDE.md` (sección de memoria).
- Pendiente / siguiente paso: el usuario debe activar en claude.ai los plugins Postiz (publicar en redes), Canva y Zapier; y la "Memoria" oficial en Ajustes de claude.ai. Dijo que recordará una skill que vio por ahí — preguntarle cuál.
- Datos a confirmar: ninguno.

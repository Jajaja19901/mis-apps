# 🧠 Memoria del proyecto (bitácora entre conversaciones)

> Cada sesión de Claude añade ARRIBA una entrada corta al terminar un trabajo.
> Las sesiones nuevas LEEN este archivo antes de empezar (skill `memoria-sesiones`).

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

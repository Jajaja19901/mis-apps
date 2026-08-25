# 🕶️ anonimizar-video — pixelar caras y matrículas de un vídeo

Herramienta del estudio para anonimizar vídeos (RGPD): pixela **caras**, **cabezas de
personas** (más fiable que solo caras cuando la gente sale pequeña o de espaldas) y
**matrículas**, conservando el audio y la duración originales.

## Cómo funciona
1. **Detección** por fotograma con 3 modelos ONNX (CPU, sin nube — el vídeo no sale de la máquina):
   - `YOLOX-S` (COCO): personas y vehículos. Pasada extra en mosaico (2 tiles solapados)
     para personas lejanas/pequeñas.
   - `YuNet`: caras (sobre imagen 2×).
   - `YOLOv9-t` de [open-image-models](https://github.com/ankandrew/open-image-models):
     matrículas, con una pasada de zoom por cada vehículo detectado para matrículas pequeñas.
2. **Seguimiento temporal**: pistas por IoU con interpolación de huecos (si el detector
   parpadea o algo tapa la matrícula unos fotogramas, la zona sigue pixelada) y extensión
   de cada pista unos fotogramas antes/después.
3. **Pixelado** en mosaico (bloques grandes, irreversible a efectos prácticos) con margen
   alrededor de cada zona, y codificación H.264 (`crf 18`) copiando el audio original.

## Uso — aplicación con interfaz (recomendado)
```bash
pip install opencv-python-headless numpy onnxruntime   # una vez
python3 app.py                                          # abre http://127.0.0.1:8765
```
Arrastras el vídeo y la app hace todo sola: los modelos se descargan la primera vez,
ves el análisis **en directo** (los 4 procesos con sus recuadros) y luego cómo va
quedando el pixelado. Al terminar muestra el QA (cobertura de todas las detecciones,
duración intacta) y te deja **retocar**: pausa el vídeo, añade una zona dibujándola o
quita un falso positivo con un clic, y re-exporta. El servidor solo escucha en
127.0.0.1 y los trabajos quedan en `trabajos/` (fuera del repo).

Requiere `ffmpeg` instalado (o `pip install imageio-ffmpeg`).

## Uso — línea de comandos
```bash
python3 anonimizar.py entrada.mp4 salida.mp4
```

Opciones útiles: `--workers N` (procesos de detección), `--guardar-detecciones d.json`
(reutilizable con `--detecciones d.json` para re-renderizar sin re-detectar),
`--regiones r.json` (log de zonas pixeladas por fotograma, para QA).

## Reglas
- Los vídeos (originales o anonimizados) **NO se suben al repo**.
- Revisa siempre el resultado a ojo antes de entregarlo: la herramienta es muy fiable con
  matrículas legibles y personas visibles, pero ningún detector garantiza el 100% en
  vídeos borrosos o con oclusiones raras.

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

## Uso
```bash
./descargar-modelos.sh                       # una vez (≈43 MB de modelos, no van al repo)
pip install opencv-python-headless numpy onnxruntime
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

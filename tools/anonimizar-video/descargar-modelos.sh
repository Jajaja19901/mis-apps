#!/usr/bin/env bash
# Descarga los 3 modelos ONNX (≈43 MB) a tools/anonimizar-video/models/.
# No se suben al repo (ver .gitignore); ejecutar una vez por máquina.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p models

echo "· YuNet (caras)…"
curl -sL -o models/yunet.onnx \
  "https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx"

echo "· YOLOX-S (personas y vehículos)…"
curl -sL -o models/yolox_s.onnx \
  "https://github.com/Megvii-BaseDetection/YOLOX/releases/download/0.1.1rc0/yolox_s.onnx"

echo "· YOLOv9-t matrículas (open-image-models)…"
curl -sL -o models/plates-yolov9t-640.onnx \
  "https://github.com/ankandrew/open-image-models/releases/download/assets/yolo-v9-t-640-license-plates-end2end.onnx"

ls -la models/
echo "Listo. Dependencias python: pip install opencv-python-headless numpy onnxruntime (y ffmpeg en el sistema)."

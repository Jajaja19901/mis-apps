#!/usr/bin/env bash
# ============================================================================
# CÁMARA FALSA para probar VIGÍA CEREBRO sin hardware.
#
# Sirve un archivo de vídeo como si fuera una cámara RTSP real, usando go2rtc
# (que ya descarga instalar.sh). Así el flujo completo (go2rtc → OpenCV →
# detección → alertas) se prueba igual que con una cámara de verdad.
#
# Uso:  ./pruebas/camara_falsa.sh [ruta/al/video.mp4]
#       (sin argumento, genera un vídeo sintético con pruebas/genera_video.py)
#
# Después, en config.yaml de prueba:
#   camaras:
#     - id: "demo"
#       rtsp: "ffmpeg:PRUEBAS_DIR/video_prueba.mp4#video=h264#loop"
# go2rtc entiende la fuente "ffmpeg:" y la re-sirve en rtsp://127.0.0.1:8554/demo
# ============================================================================
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
RAIZ="$(dirname "$AQUI")"
VIDEO="${1:-$AQUI/video_prueba.mp4}"

if [[ ! -f "$VIDEO" ]]; then
  echo "No hay vídeo: generando uno sintético (figuras en movimiento)…"
  "$RAIZ/venv/bin/python" "$AQUI/genera_video.py" "$VIDEO"
fi

if [[ ! -x "$RAIZ/bin/go2rtc" ]]; then
  echo "⚠ Falta $RAIZ/bin/go2rtc (lo descarga instalar.sh)."
  echo "  Sin go2rtc puedes usar la vía directa: pon la RUTA DEL ARCHIVO como"
  echo "  'rtsp:' de la cámara en config.yaml — el lector la detecta y la lee"
  echo "  en bucle (modo prueba sin RTSP real):"
  echo "    rtsp: \"$VIDEO\""
  exit 0
fi

cat > "$AQUI/go2rtc_prueba.yaml" <<EOF
api:
  listen: ":1984"
rtsp:
  listen: ":8554"
streams:
  demo: "ffmpeg:$VIDEO#video=h264#loop"
EOF

echo "Sirviendo $VIDEO como cámara RTSP falsa:  rtsp://127.0.0.1:8554/demo"
echo "(Ctrl+C para parar)"
exec "$RAIZ/bin/go2rtc" -config "$AQUI/go2rtc_prueba.yaml"

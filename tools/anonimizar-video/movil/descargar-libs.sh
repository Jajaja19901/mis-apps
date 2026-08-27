#!/usr/bin/env bash
# Descarga las librerías del motor web a movil/lib/ (≈29 MB, no van al repo).
# onnxruntime-web (inferencia ONNX en el navegador) + mediabunny (vídeo con WebCodecs).
set -euo pipefail
cd "$(dirname "$0")"
ORT=1.29.0
MB=1.55.3
mkdir -p lib
tmp=$(mktemp -d)
echo "· onnxruntime-web $ORT…"
curl -sL "https://registry.npmjs.org/onnxruntime-web/-/onnxruntime-web-$ORT.tgz" | tar xz -C "$tmp"
cp "$tmp/package/dist/ort.all.min.js" \
   "$tmp/package/dist/ort-wasm-simd-threaded.mjs" \
   "$tmp/package/dist/ort-wasm-simd-threaded.wasm" \
   "$tmp/package/dist/ort-wasm-simd-threaded.jsep.mjs" \
   "$tmp/package/dist/ort-wasm-simd-threaded.jsep.wasm" lib/
rm -rf "$tmp/package"
echo "· mediabunny $MB…"
curl -sL "https://registry.npmjs.org/mediabunny/-/mediabunny-$MB.tgz" | tar xz -C "$tmp"
cp "$tmp/package/dist/bundles/mediabunny.min.mjs" lib/
rm -rf "$tmp"
ls -la lib/

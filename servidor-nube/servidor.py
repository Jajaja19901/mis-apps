#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
VIGÍA · SERVIDOR-CEREBRO EN LA NUBE
===================================

El móvil NO calcula nada pesado: saca un fotograma pequeño de la cámara y lo
manda aquí. Este servidor (un ordenador potente, con o sin GPU) lo analiza con
YOLO y devuelve las cajas ya pensadas. La app las dibuja al instante.

Es un servidor MÍNIMO y HONESTO:
  · Un solo endpoint:  POST /detectar   { "imagen": "data:image/jpeg;base64,..." }
  · Responde:          { "detecciones": [ {clase, score, x, y, an, al}, ... ] }
    Las cajas van NORMALIZADAS (0-1) respecto al ancho/alto de la imagen, así la
    app las escala a su vídeo sin saber la resolución del servidor.
  · CORS abierto para que el navegador del móvil pueda llamarlo.

Cómo se ejecuta en un PC/servidor normal:
    pip install -r requirements.txt
    python servidor.py                 # escucha en http://0.0.0.0:8420

Para usarlo desde el móvil por internet necesitas una dirección pública (https).
La forma gratis y sin complicaciones es un túnel de Cloudflare (ver LEEME.md) o
usar Google Colab con el script colab_vigia.py (un solo pegote y listo).
"""

import base64
import io
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from PIL import Image
from ultralytics import YOLO

# Modelo: por defecto YOLO11 "nano" (rápido). Si el servidor tiene GPU, sube a
# yolo11s / yolo11m / yolo11x para MÁS precisión (detecta a la persona lejana).
MODELO = os.environ.get("VIGIA_MODELO", "yolo11n.pt")
UMBRAL = float(os.environ.get("VIGIA_UMBRAL", "0.25"))  # confianza mínima
PUERTO = int(os.environ.get("VIGIA_PUERTO", "8420"))

print(f"[vigía-nube] Cargando el modelo {MODELO} …")
modelo = YOLO(MODELO)
print("[vigía-nube] Modelo listo. Clases que reconoce:", len(modelo.names))

app = FastAPI(title="VIGÍA · servidor-cerebro")

# CORS abierto: la app corre en el navegador (otra dirección) y necesita permiso
# para llamar. Es un detector de objetos, no maneja datos personales.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class Peticion(BaseModel):
    imagen: str  # dataURL JPEG/PNG (data:image/jpeg;base64,…) o base64 pelado


def _leer_imagen(data_url: str) -> Image.Image:
    """Convierte el dataURL/base64 que manda la app en una imagen RGB."""
    txt = data_url or ""
    if "," in txt and txt.strip().startswith("data:"):
        txt = txt.split(",", 1)[1]
    crudo = base64.b64decode(txt)
    return Image.open(io.BytesIO(crudo)).convert("RGB")


@app.get("/")
def raiz():
    """Página simple para comprobar a ojo que el servidor está vivo."""
    return {"ok": True, "servicio": "vigía-cerebro", "modelo": MODELO,
            "usa": "POST /detectar con { imagen: dataURL }"}


@app.post("/detectar")
def detectar(pet: Peticion):
    """Analiza un fotograma y devuelve las cajas NORMALIZADAS (0-1)."""
    try:
        img = _leer_imagen(pet.imagen)
    except Exception as e:  # imagen ilegible → lista vacía, nunca reventar
        return {"detecciones": [], "error": f"imagen ilegible: {e}"}

    an, al = img.size  # ancho, alto en píxeles
    if not an or not al:
        return {"detecciones": []}

    resultados = modelo.predict(img, conf=UMBRAL, verbose=False)
    salida = []
    for r in resultados:
        nombres = r.names
        for caja in r.boxes:
            x1, y1, x2, y2 = [float(v) for v in caja.xyxy[0].tolist()]
            clase = nombres.get(int(caja.cls[0]), str(int(caja.cls[0])))
            salida.append({
                "clase": clase,                                   # nombre COCO en inglés (person, car, knife…)
                "score": round(float(caja.conf[0]), 3),
                "x": round(x1 / an, 5),                           # normalizado 0-1
                "y": round(y1 / al, 5),
                "an": round((x2 - x1) / an, 5),
                "al": round((y2 - y1) / al, 5),
            })
    return {"detecciones": salida}


if __name__ == "__main__":
    import uvicorn
    print(f"[vigía-nube] Sirviendo en http://0.0.0.0:{PUERTO}  ·  endpoint: /detectar")
    uvicorn.run(app, host="0.0.0.0", port=PUERTO)

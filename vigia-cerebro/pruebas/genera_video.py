"""Genera un vídeo sintético de prueba (figuras móviles sobre fondo tipo tienda).

No pretende engañar a YOLO (para eso hace falta vídeo real): sirve para probar
la tubería de vídeo (lectura, buffer, clips) y como fuente de la cámara falsa.
Uso: python pruebas/genera_video.py [salida.mp4] [segundos]
"""
from __future__ import annotations

import sys

import cv2
import numpy as np


def generar(ruta: str = "pruebas/video_prueba.mp4", segundos: int = 20, fps: int = 10) -> str:
    w, h = 640, 360
    vw = cv2.VideoWriter(ruta, cv2.VideoWriter_fourcc(*"mp4v"), fps, (w, h))
    if not vw.isOpened():
        raise RuntimeError("no se pudo abrir el VideoWriter (¿códec mp4v?)")
    total = segundos * fps
    for i in range(total):
        img = np.full((h, w, 3), 24, np.uint8)
        # "estanterías"
        for x in range(40, w, 120):
            cv2.rectangle(img, (x, 40), (x + 70, h - 60), (45, 52, 60), -1)
        # figura móvil 1: cruza de izquierda a derecha
        fx = int((i / total) * (w - 80)) + 20
        cv2.rectangle(img, (fx, 150), (fx + 42, 280), (90, 140, 200), -1)
        cv2.circle(img, (fx + 21, 135), 16, (90, 140, 200), -1)
        # figura móvil 2: va y viene
        gx = int((0.5 + 0.4 * np.sin(i / 12)) * (w - 60))
        cv2.rectangle(img, (gx, 170), (gx + 36, 270), (80, 190, 120), -1)
        cv2.putText(img, f"PRUEBA {i:04d}", (10, 20), cv2.FONT_HERSHEY_SIMPLEX,
                    0.5, (120, 200, 160), 1, cv2.LINE_AA)
        vw.write(img)
    vw.release()
    return ruta


if __name__ == "__main__":
    salida = sys.argv[1] if len(sys.argv) > 1 else "pruebas/video_prueba.mp4"
    seg = int(sys.argv[2]) if len(sys.argv) > 2 else 20
    print("escrito:", generar(salida, seg))

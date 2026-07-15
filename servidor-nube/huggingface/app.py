# VIGÍA · servidor-cerebro para Hugging Face Space (Docker)
# Un solo endpoint: POST /detectar  →  { detecciones: [ {clase,score,x,y,an,al} ] }
import base64, io
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from PIL import Image
from ultralytics import YOLO

modelo = YOLO("yolo11n.pt")   # más precisión (más lento): "yolo11s.pt" / "yolo11m.pt"

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class Peticion(BaseModel):
    imagen: str


def _leer(s):
    if "," in s and s.strip().startswith("data:"):
        s = s.split(",", 1)[1]
    return Image.open(io.BytesIO(base64.b64decode(s))).convert("RGB")


@app.get("/")
def raiz():
    return {"ok": True, "usa": "POST /detectar con { imagen: dataURL }"}


@app.post("/detectar")
def detectar(pet: Peticion):
    try:
        img = _leer(pet.imagen)
    except Exception as e:
        return {"detecciones": [], "error": str(e)}
    an, al = img.size
    if not an or not al:
        return {"detecciones": []}
    salida = []
    for r in modelo.predict(img, conf=0.25, verbose=False):
        for c in r.boxes:
            x1, y1, x2, y2 = [float(v) for v in c.xyxy[0].tolist()]
            salida.append({
                "clase": r.names.get(int(c.cls[0]), str(int(c.cls[0]))),
                "score": round(float(c.conf[0]), 3),
                "x": round(x1 / an, 5), "y": round(y1 / al, 5),
                "an": round((x2 - x1) / an, 5), "al": round((y2 - y1) / al, 5),
            })
    return {"detecciones": salida}

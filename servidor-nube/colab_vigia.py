# =====================================================================
# VIGÍA · CEREBRO EN GOOGLE COLAB  (copia y pega TODO en una sola celda)
# =====================================================================
# Qué hace: monta el servidor-cerebro dentro del ordenador gratis de Google
# (con GPU), abre una dirección pública https y te la enseña. Copias esa
# dirección (acaba en /detectar) en la app → Ajustes → Motor → "Servidor en la
# nube", pulsas "Probar servidor" y a vigilar. El móvil no calcula nada.
#
# IMPORTANTE (honesto): Colab es GRATIS pero se desconecta al rato de no tocarlo
# y no está pensado para vigilar 24 h. Sirve de maravilla para PROBAR que todo
# funciona a máxima potencia. Para dejarlo siempre encendido, monta servidor.py
# en un PC tuyo o un servidor barato (ver LEEME.md).
#
# Antes de ejecutar: Colab → menú "Entorno de ejecución" → "Cambiar tipo de
# entorno de ejecución" → Acelerador por hardware: GPU (T4). Así va rapidísimo.
# =====================================================================

# 1) Instalar todo (tarda ~1-2 min la primera vez)
!pip -q install ultralytics fastapi "uvicorn[standard]" pillow >/dev/null 2>&1

# 2) Descargar cloudflared (el túnel gratis, sin registrarse)
import os
if not os.path.exists("cloudflared"):
    !wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -O cloudflared
    !chmod +x cloudflared

# 3) El servidor-cerebro (idéntico a servidor.py)
import base64, io, threading, re, time, subprocess
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from PIL import Image
from ultralytics import YOLO
import uvicorn

MODELO = "yolo11n.pt"   # con GPU puedes subir a "yolo11s.pt" o "yolo11m.pt" (más precisión)
UMBRAL = 0.25

print(f"Cargando el modelo {MODELO} …")
modelo = YOLO(MODELO)
print("Modelo listo. Clases:", len(modelo.names))

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

class Peticion(BaseModel):
    imagen: str

def _leer(data_url):
    txt = data_url or ""
    if "," in txt and txt.strip().startswith("data:"):
        txt = txt.split(",", 1)[1]
    return Image.open(io.BytesIO(base64.b64decode(txt))).convert("RGB")

@app.get("/")
def raiz():
    return {"ok": True, "usa": "POST /detectar con { imagen: dataURL }"}

@app.post("/detectar")
def detectar(pet: Peticion):
    try:
        img = _leer(pet.imagen)
    except Exception as e:
        return {"detecciones": [], "error": f"imagen ilegible: {e}"}
    an, al = img.size
    if not an or not al:
        return {"detecciones": []}
    salida = []
    for r in modelo.predict(img, conf=UMBRAL, verbose=False):
        nombres = r.names
        for c in r.boxes:
            x1, y1, x2, y2 = [float(v) for v in c.xyxy[0].tolist()]
            salida.append({
                "clase": nombres.get(int(c.cls[0]), str(int(c.cls[0]))),
                "score": round(float(c.conf[0]), 3),
                "x": round(x1 / an, 5), "y": round(y1 / al, 5),
                "an": round((x2 - x1) / an, 5), "al": round((y2 - y1) / al, 5),
            })
    return {"detecciones": salida}

# 4) Arrancar el servidor en segundo plano
def _correr():
    uvicorn.run(app, host="0.0.0.0", port=8420, log_level="warning")
threading.Thread(target=_correr, daemon=True).start()
time.sleep(3)

# 5) Abrir el túnel público y enseñar la dirección
proc = subprocess.Popen(
    ["./cloudflared", "tunnel", "--url", "http://localhost:8420", "--no-autoupdate"],
    stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)

url = None
inicio = time.time()
for linea in proc.stdout:
    m = re.search(r"https://[-a-z0-9]+\.trycloudflare\.com", linea)
    if m:
        url = m.group(0)
        break
    if time.time() - inicio > 40:
        break

print("\n" + "=" * 60)
if url:
    print("✅ SERVIDOR LISTO. Pega ESTA dirección en la app:")
    print("\n    " + url + "/detectar\n")
    print("App → Ajustes → Motor de detección → 🖥️ Servidor en la nube")
    print("Pega la dirección → «Probar servidor» → a vigilar.")
else:
    print("⚠ No se pudo abrir el túnel. Vuelve a ejecutar la celda.")
print("=" * 60)
print("\n(Deja ESTA celda ejecutándose. Si la paras, el servidor se apaga.)")

# Mantener la celda viva mostrando lo que hace el túnel
for linea in proc.stdout:
    pass

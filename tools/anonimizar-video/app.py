"""Anonimizador de vídeos — aplicación local con interfaz web.

Arranca un servidor SOLO en tu ordenador (127.0.0.1) y abre la interfaz en el
navegador: arrastras un vídeo, se pixelan caras/cabezas/matrículas automáticamente,
y puedes retocar zonas (añadir o quitar) antes de descargar. El vídeo nunca sale
de tu máquina.

Uso:
  python3 app.py [--puerto 8765] [--sin-navegador]
"""
import argparse
import json
import os
import re
import shutil
import sys
import tempfile
import threading
import urllib.parse
import uuid
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

BASE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE)
import anonimizar  # noqa: E402

TRABAJOS_DIR = os.path.join(BASE, "trabajos")
MAX_SUBIDA = 2 * 1024 * 1024 * 1024  # 2 GB
ID_RE = re.compile(r"^[0-9a-f]{12}$")

JOBS = {}          # id -> estado (dict)
JOBS_LOCK = threading.Lock()
PROC_LOCK = threading.Lock()  # un solo procesado a la vez


def nuevo_estado(jid, nombre):
    return {
        "id": jid, "nombre": nombre, "fase": "en_cola", "pct": 0, "detalle": "",
        "error": None, "listo": False, "version": 0,
        "frames": 0, "fps": 0.0, "w": 0, "h": 0,
        "qa": None, "pistas": None,
    }


def job_dir(jid):
    return os.path.join(TRABAJOS_DIR, jid)


def actualizar(jid, **kw):
    with JOBS_LOCK:
        JOBS[jid].update(kw)


def estado_de(jid):
    with JOBS_LOCK:
        e = JOBS.get(jid)
        return dict(e) if e else None


# ---------- procesado ----------

def procesar(jid):
    d = job_dir(jid)
    entrada = os.path.join(d, "original.mp4")
    salida = os.path.join(d, "salida.mp4")
    dets_path = os.path.join(d, "detecciones.json")
    regs_path = os.path.join(d, "regiones.json")
    try:
        with PROC_LOCK:
            if not anonimizar.ffmpeg_bin():
                raise RuntimeError("No encuentro ffmpeg. Instálalo o ejecuta: pip install imageio-ffmpeg")

            info = anonimizar.info_video(entrada)
            if not info["ok"]:
                raise RuntimeError("No puedo leer el vídeo. ¿Es un formato de vídeo válido (mp4, mov, webm…)?")
            actualizar(jid, frames=info["frames"], fps=info["fps"], w=info["w"], h=info["h"])

            if anonimizar.modelos_que_faltan():
                actualizar(jid, fase="modelos", pct=0,
                           detalle="Descargando modelos de detección (solo la primera vez, ≈43 MB)…")
                anonimizar.descargar_modelos(
                    lambda n, b, t: actualizar(jid, pct=int(b * 100 / t) if t else 0,
                                               detalle=f"Descargando {n}…"))

            # detección (con caché para re-arranques)
            if os.path.exists(dets_path):
                dets = {int(k): v for k, v in json.load(open(dets_path)).items()}
                total = info["frames"]
            else:
                actualizar(jid, fase="deteccion", pct=0,
                           detalle="Buscando caras, personas y matrículas en cada fotograma…")
                with tempfile.TemporaryDirectory() as tmpdir:
                    dets, total = anonimizar.detectar(
                        entrada, max(1, min(4, os.cpu_count() or 1)), tmpdir,
                        lambda a, b: actualizar(jid, pct=int(a * 100 / max(1, b)),
                                                detalle=f"Analizando fotograma {a} de {b}"),
                        preview_dir=d)
                with open(dets_path + ".tmp", "w") as fh:
                    json.dump({str(k): v for k, v in dets.items()}, fh)
                os.replace(dets_path + ".tmp", dets_path)

            nd = {k: sum(len(v[k]) for v in dets.values()) for k in ("persons", "faces", "plates")}
            actualizar(jid, pistas=nd)

            _render(jid, dets, total, excluir=set(), extra=[])
            actualizar(jid, fase="listo", pct=100, listo=True,
                       detalle="Vídeo anonimizado y verificado.")
    except Exception as e:
        actualizar(jid, fase="error", error=str(e), detalle=str(e))


def _render(jid, dets, total, excluir, extra):
    d = job_dir(jid)
    entrada = os.path.join(d, "original.mp4")
    salida = os.path.join(d, "salida.mp4")
    regs_path = os.path.join(d, "regiones.json")
    actualizar(jid, fase="pixelado", pct=0, detalle="Pixelando y codificando el vídeo…")
    tmp_out = os.path.join(d, "salida.nueva.mp4")
    anonimizar.renderizar(
        entrada, tmp_out, dets, total, regions_out=regs_path,
        progreso=lambda a, b: actualizar(jid, pct=int(a * 100 / max(1, b)),
                                         detalle=f"Pixelando fotograma {a} de {b}"),
        excluir=excluir, extra=extra,
        preview_path=os.path.join(d, "progreso.jpg"))
    os.replace(tmp_out, salida)
    actualizar(jid, fase="qa", pct=100, detalle="Verificando cobertura…")
    qa = anonimizar.qa_cobertura(dets, regs_path)
    out_frames = anonimizar.info_video(salida)["frames"]
    qa["frames_salida"] = out_frames
    qa["frames_ok"] = (out_frames == total)
    with JOBS_LOCK:
        JOBS[jid]["qa"] = qa
        JOBS[jid]["version"] += 1


def retocar(jid, cambios):
    d = job_dir(jid)
    dets_path = os.path.join(d, "detecciones.json")
    try:
        with PROC_LOCK:
            dets = {int(k): v for k, v in json.load(open(dets_path)).items()}
            total = estado_de(jid)["frames"]
            excluir = set(map(str, cambios.get("quitar", [])))
            extra = []
            for z in cambios.get("anadir", []):
                extra.append({"x1": float(z["x1"]), "y1": float(z["y1"]),
                              "x2": float(z["x2"]), "y2": float(z["y2"]),
                              "f0": max(0, int(z["f0"])), "f1": min(total - 1, int(z["f1"]))})
            # guardar retoques por si se re-procesa
            with open(os.path.join(d, "retoques.json"), "w") as fh:
                json.dump({"quitar": sorted(excluir), "anadir": extra}, fh)
            _render(jid, dets, total, excluir=excluir, extra=extra)
            actualizar(jid, fase="listo", pct=100, listo=True,
                       detalle="Retoques aplicados y vídeo re-exportado.")
    except Exception as e:
        actualizar(jid, fase="error", error=str(e), detalle=str(e))


# ---------- servidor ----------

class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "AnonimizadorLocal/1.0"

    def log_message(self, fmt, *args):  # silenciar el log por defecto
        pass

    # utilidades de respuesta
    def _json(self, obj, code=200):
        cuerpo = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(cuerpo)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(cuerpo)

    def _error(self, code, msg):
        self._json({"error": msg}, code)

    def _archivo(self, ruta, ctype, descarga=None):
        if not os.path.exists(ruta):
            return self._error(404, "No existe")
        size = os.path.getsize(ruta)
        rango = self.headers.get("Range")
        ini, fin = 0, size - 1
        if rango:
            m = re.match(r"bytes=(\d*)-(\d*)$", rango.strip())
            if m:
                if m.group(1):
                    ini = int(m.group(1))
                    if m.group(2):
                        fin = min(int(m.group(2)), size - 1)
                elif m.group(2):
                    ini = max(0, size - int(m.group(2)))
        if ini > fin or ini >= size:
            self.send_response(416)
            self.send_header("Content-Range", f"bytes */{size}")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        largo = fin - ini + 1
        self.send_response(206 if rango else 200)
        self.send_header("Content-Type", ctype)
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(largo))
        if rango:
            self.send_header("Content-Range", f"bytes {ini}-{fin}/{size}")
        if descarga:
            self.send_header("Content-Disposition", f'attachment; filename="{descarga}"')
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        with open(ruta, "rb") as fh:
            fh.seek(ini)
            restante = largo
            while restante > 0:
                chunk = fh.read(min(1 << 18, restante))
                if not chunk:
                    break
                try:
                    self.wfile.write(chunk)
                except (BrokenPipeError, ConnectionResetError):
                    return
                restante -= len(chunk)

    def _jid(self, partes):
        jid = partes[0] if partes else ""
        if not ID_RE.match(jid) or estado_de(jid) is None:
            self._error(404, "Trabajo no encontrado")
            return None
        return jid

    # rutas
    def do_GET(self):
        url = urllib.parse.urlparse(self.path)
        partes = [p for p in url.path.split("/") if p]
        if not partes:
            return self._archivo(os.path.join(BASE, "interfaz.html"), "text/html; charset=utf-8")
        if partes[0] != "api":
            return self._error(404, "No existe")
        ruta, partes = (partes[1] if len(partes) > 1 else ""), partes[2:]
        if ruta == "estado":
            jid = self._jid(partes)
            if jid:
                self._json(estado_de(jid))
        elif ruta == "video":
            jid = self._jid(partes)
            if jid:
                self._archivo(os.path.join(job_dir(jid), "salida.mp4"), "video/mp4")
        elif ruta == "descargar":
            jid = self._jid(partes)
            if jid:
                nombre = os.path.splitext(estado_de(jid)["nombre"] or "video")[0]
                self._archivo(os.path.join(job_dir(jid), "salida.mp4"), "video/mp4",
                              descarga=f"{nombre}-anonimizado.mp4")
        elif ruta == "preview":
            jid = self._jid(partes)
            if not jid:
                return
            q = urllib.parse.parse_qs(url.query)
            f = (q.get("f", ["progreso"])[0])
            if not re.match(r"^(analisis_[0-9]|progreso)$", f):
                return self._error(400, "Vista no válida")
            self._archivo(os.path.join(job_dir(jid), f + ".jpg"), "image/jpeg")
        elif ruta == "regiones":
            jid = self._jid(partes)
            if not jid:
                return
            q = urllib.parse.parse_qs(url.query)
            try:
                n = int(q.get("n", ["0"])[0])
            except ValueError:
                n = 0
            try:
                regs = json.load(open(os.path.join(job_dir(jid), "regiones.json")))
            except Exception:
                regs = {}
            self._json({"n": n, "regiones": regs.get(str(n), [])})
        else:
            self._error(404, "No existe")

    def do_POST(self):
        url = urllib.parse.urlparse(self.path)
        partes = [p for p in url.path.split("/") if p]
        if len(partes) < 2 or partes[0] != "api":
            return self._error(404, "No existe")
        ruta, partes = partes[1], partes[2:]
        if ruta == "subir":
            return self._subir()
        if ruta == "retocar":
            jid = self._jid(partes)
            if not jid:
                return
            est = estado_de(jid)
            if not est["listo"] and est["fase"] != "error":
                return self._error(409, "Este vídeo aún se está procesando.")
            try:
                largo = int(self.headers.get("Content-Length") or 0)
                cambios = json.loads(self.rfile.read(largo) or b"{}")
            except Exception:
                return self._error(400, "Cuerpo JSON inválido")
            actualizar(jid, listo=False, fase="pixelado", pct=0, error=None,
                       detalle="Aplicando retoques…")
            threading.Thread(target=retocar, args=(jid, cambios), daemon=True).start()
            return self._json({"ok": True})
        return self._error(404, "No existe")

    def _subir(self):
        if PROC_LOCK.locked():
            return self._error(409, "Ya hay un vídeo procesándose. Espera a que termine.")
        try:
            largo = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            largo = 0
        if largo <= 0:
            return self._error(400, "Subida vacía")
        if largo > MAX_SUBIDA:
            return self._error(413, "El vídeo supera el límite de 2 GB")
        nombre = urllib.parse.unquote(self.headers.get("X-Nombre-Archivo") or "video.mp4")
        nombre = os.path.basename(nombre)[:120] or "video.mp4"
        jid = uuid.uuid4().hex[:12]
        d = job_dir(jid)
        os.makedirs(d, exist_ok=True)
        destino = os.path.join(d, "original.mp4")
        leidos = 0
        with open(destino, "wb") as fh:
            while leidos < largo:
                chunk = self.rfile.read(min(1 << 20, largo - leidos))
                if not chunk:
                    break
                fh.write(chunk)
                leidos += len(chunk)
        if leidos != largo:
            shutil.rmtree(d, ignore_errors=True)
            return self._error(400, "La subida se cortó a medias")
        with JOBS_LOCK:
            JOBS[jid] = nuevo_estado(jid, nombre)
        threading.Thread(target=procesar, args=(jid,), daemon=True).start()
        self._json({"id": jid})


def main():
    ap = argparse.ArgumentParser(description="Anonimizador de vídeos (app local)")
    ap.add_argument("--puerto", type=int, default=8765)
    ap.add_argument("--sin-navegador", action="store_true")
    args = ap.parse_args()
    os.makedirs(TRABAJOS_DIR, exist_ok=True)
    srv = ThreadingHTTPServer(("127.0.0.1", args.puerto), Handler)
    url = f"http://127.0.0.1:{args.puerto}"
    print(f"🕶️  Anonimizador de vídeos — abre {url} en tu navegador (Ctrl+C para salir)")
    if not anonimizar.ffmpeg_bin():
        print("⚠️  AVISO: no encuentro ffmpeg. Instálalo o ejecuta: pip install imageio-ffmpeg")
    if anonimizar.modelos_que_faltan():
        print("ℹ️  Los modelos de detección (≈43 MB) se descargarán solos con el primer vídeo.")
    if not args.sin_navegador:
        try:
            webbrowser.open(url)
        except Exception:
            pass
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nHasta luego.")


if __name__ == "__main__":
    main()

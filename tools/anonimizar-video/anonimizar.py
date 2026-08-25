"""Anonimiza un vídeo: pixela caras, cabezas de personas y matrículas.

Motor del anonimizador (lo usa la app local `app.py` y también funciona por CLI):
  1) Detección por fotograma (YOLOX personas/vehículos + mosaico 2 tiles para
     personas pequeñas, YuNet caras, YOLOv9-t matrículas con zoom por vehículo),
     paralelizada por rangos de fotogramas.
  2) Seguimiento temporal: pistas por IoU, interpolación de huecos (cubre
     oclusiones y parpadeos del detector) y extensión en los extremos.
  3) Pixelado en mosaico con márgenes y codificación H.264 conservando el audio.

Uso CLI:
  python3 anonimizar.py entrada.mp4 salida.mp4 [--workers 4]

Requisitos: pip install opencv-python-headless numpy onnxruntime; ffmpeg en el
PATH (o el paquete pip imageio-ffmpeg). Los modelos (≈43 MB) se descargan solos
la primera vez a ./models/.
"""
import argparse
import json
import multiprocessing as mp
import os
import shutil
import subprocess
import sys
import time
import urllib.request

BASE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE)

# --- parámetros (los que dieron ✅ en QA con vídeo real de calle) ---
CONF_PERSON, CONF_PERSON_TILE, CONF_VEHICLE = 0.22, 0.25, 0.25
CONF_PLATE_FULL, CONF_PLATE_ZOOM = 0.25, 0.28
TILE_OVERLAP = 0.16
TRACK_CFG = {
    "persons": {"iou": 0.18, "gap": 20, "extend": 6},
    "faces":   {"iou": 0.15, "gap": 12, "extend": 5},
    "plates":  {"iou": 0.15, "gap": 30, "extend": 8},
}

MODELOS = {
    "yunet.onnx": "https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx",
    "yolox_s.onnx": "https://github.com/Megvii-BaseDetection/YOLOX/releases/download/0.1.1rc0/yolox_s.onnx",
    "plates-yolov9t-640.onnx": "https://github.com/ankandrew/open-image-models/releases/download/assets/yolo-v9-t-640-license-plates-end2end.onnx",
}
MODELS_DIR = os.environ.get("ANONIMIZAR_MODELS_DIR", os.path.join(BASE, "models"))


# ---------- utilidades ----------

def ffmpeg_bin():
    """Localiza ffmpeg: PATH o el paquete pip imageio-ffmpeg."""
    p = shutil.which("ffmpeg")
    if p:
        return p
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return None


def modelos_que_faltan():
    return [n for n in MODELOS if not os.path.exists(os.path.join(MODELS_DIR, n))
            or os.path.getsize(os.path.join(MODELS_DIR, n)) < 10000]


def descargar_modelos(progreso=None):
    """Descarga los modelos que falten. progreso(nombre, bytes, total_bytes)."""
    os.makedirs(MODELS_DIR, exist_ok=True)
    for nombre in modelos_que_faltan():
        destino = os.path.join(MODELS_DIR, nombre)
        req = urllib.request.Request(MODELOS[nombre], headers={"User-Agent": "anonimizar-video"})
        with urllib.request.urlopen(req, timeout=60) as r, open(destino + ".tmp", "wb") as f:
            total = int(r.headers.get("Content-Length") or 0)
            leido = 0
            while True:
                chunk = r.read(1 << 18)
                if not chunk:
                    break
                f.write(chunk)
                leido += len(chunk)
                if progreso:
                    progreso(nombre, leido, total)
        os.replace(destino + ".tmp", destino)


def info_video(video):
    import cv2
    cap = cv2.VideoCapture(video)
    ok = cap.isOpened()
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    cap.release()
    return {"ok": ok and total > 0 and w > 0, "frames": total, "w": w, "h": h, "fps": fps}


# ---------- fase 1: detección ----------

def _worker(args):
    video, start, end, wid, tmpdir, preview_dir = args
    os.environ["OMP_NUM_THREADS"] = "1"
    import cv2
    import numpy as np
    import onnxruntime as ort
    import detect_lib
    opts = ort.SessionOptions()
    opts.intra_op_num_threads = 1
    opts.inter_op_num_threads = 1
    orig = ort.InferenceSession
    ort.InferenceSession = lambda p, **kw: orig(p, sess_options=opts, providers=["CPUExecutionProvider"])
    yolox, faces, plates = detect_lib.YoloxDetector(), detect_lib.FaceDetector(), detect_lib.PlateDetector()
    ort.InferenceSession = orig

    cap = cv2.VideoCapture(video)
    cap.set(cv2.CAP_PROP_POS_FRAMES, start)
    out = {}
    for n in range(start, end):
        ok, img = cap.read()
        if not ok:
            break
        h = img.shape[0]
        P, V = yolox.detect(img, conf_person=CONF_PERSON, conf_vehicle=CONF_VEHICLE)
        cut = int(h * (0.5 + TILE_OVERLAP / 2))
        for (y1, y2) in ((0, cut), (h - cut, h)):
            tp, _ = yolox.detect(img[y1:y2], conf_person=CONF_PERSON_TILE, conf_vehicle=1.01)
            P += [(x1, ty1 + y1, x2, ty2 + y1, s) for x1, ty1, x2, ty2, s in tp]
        if P:
            b = np.array([p[:4] for p in P], dtype=np.float32)
            s = np.array([p[4] for p in P], dtype=np.float32)
            P = [P[i] for i in detect_lib.nms(b, s, 0.45)]
        F = faces.detect(img)
        PL = plates.detect(img, conf=CONF_PLATE_FULL, vehicle_boxes=V, zoom_conf=CONF_PLATE_ZOOM)
        out[n] = {"persons": [[round(float(v), 1) for v in p] for p in P],
                  "faces": [[round(float(v), 1) for v in f] for f in F],
                  "plates": [[round(float(v), 2) for v in p] for p in PL]}
        done = n - start + 1
        if done % 10 == 0:
            with open(os.path.join(tmpdir, f"prog_{wid}.txt"), "w") as fh:
                fh.write(str(done))
        if preview_dir and done % 20 == 1:
            vista = img.copy()
            for x1, y1, x2, y2, _s in V:
                cv2.rectangle(vista, (int(x1), int(y1)), (int(x2), int(y2)), (200, 200, 80), 1)
            for x1, y1, x2, y2, _s in P:
                cv2.rectangle(vista, (int(x1), int(y1)), (int(x2), int(y2)), (80, 220, 80), 2)
            for x1, y1, x2, y2, _s in F:
                cv2.rectangle(vista, (int(x1), int(y1)), (int(x2), int(y2)), (230, 80, 230), 2)
            for x1, y1, x2, y2, _s in PL:
                cv2.rectangle(vista, (int(x1), int(y1)), (int(x2), int(y2)), (60, 60, 240), 2)
            _foto(vista, os.path.join(preview_dir, f"analisis_{wid}.jpg"))
        if done % 150 == 0:
            _dump(out, wid, tmpdir)
    _dump(out, wid, tmpdir)
    with open(os.path.join(tmpdir, f"prog_{wid}.txt"), "w") as fh:
        fh.write(str(end - start))


def _dump(out, wid, tmpdir):
    p = os.path.join(tmpdir, f"det_{wid}.json")
    with open(p + ".tmp", "w") as fh:
        json.dump(out, fh)
    os.replace(p + ".tmp", p)


def _foto(img, ruta, calidad=82):
    """Guarda un JPEG de forma atómica (para la vista en directo)."""
    import cv2
    ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, calidad])
    if ok:
        with open(ruta + ".tmp", "wb") as fh:
            fh.write(buf.tobytes())
        os.replace(ruta + ".tmp", ruta)


def detectar(video, workers, tmpdir, progreso=None, preview_dir=None):
    """Detección completa. progreso(frames_hechos, frames_totales). Devuelve dict {n: {...}}."""
    total = info_video(video)["frames"]
    bounds = [round(i * total / workers) for i in range(workers + 1)]
    jobs = [(video, bounds[i], bounds[i + 1], i, tmpdir, preview_dir) for i in range(workers)]
    with mp.Pool(workers) as pool:
        res = pool.map_async(_worker, jobs)
        while not res.ready():
            if progreso:
                hechos = 0
                for i in range(workers):
                    try:
                        with open(os.path.join(tmpdir, f"prog_{i}.txt")) as fh:
                            hechos += int(fh.read().strip() or 0)
                    except Exception:
                        pass
                progreso(hechos, total)
            res.wait(0.7)
        res.get()  # relanza excepciones de los workers
    if progreso:
        progreso(total, total)
    dets = {}
    for i in range(workers):
        with open(os.path.join(tmpdir, f"det_{i}.json")) as fh:
            dets.update({int(k): v for k, v in json.load(fh).items()})
    return dets, total


# ---------- fase 2: pistas ----------

def _iou(a, b):
    ix = max(0.0, min(a[2], b[2]) - max(a[0], b[0]))
    iy = max(0.0, min(a[3], b[3]) - max(a[1], b[1]))
    inter = ix * iy
    if inter <= 0:
        return 0.0
    return inter / ((a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter)


def pistas(dets, kind, total):
    """Devuelve (por_frame, n_pistas): por_frame[n] = [(track_id, box), ...]."""
    cfg = TRACK_CFG[kind]
    tracks = []
    for n in range(total):
        for det in dets.get(n, {}).get(kind, []):
            box = det[:4]
            best, best_iou = None, cfg["iou"]
            for tr in tracks:
                if n - tr["last_f"] > cfg["gap"] or n == tr["last_f"]:
                    continue
                v = _iou(box, tr["last_b"])
                if v > best_iou:
                    best, best_iou = tr, v
            if best is None:
                tracks.append({"obs": {n: box}, "last_f": n, "last_b": box})
            else:
                best["obs"][n] = box
                best["last_f"], best["last_b"] = n, box
    per_frame = [[] for _ in range(total)]
    for i, tr in enumerate(tracks):
        tid = f"{kind[0]}{i}"
        fs = sorted(tr["obs"])
        f0, f1 = fs[0], fs[-1]
        for a, b in zip(fs, fs[1:]):
            per_frame[a].append((tid, tr["obs"][a]))
            for m in range(a + 1, b):
                t = (m - a) / (b - a)
                per_frame[m].append((tid, [tr["obs"][a][i2] * (1 - t) + tr["obs"][b][i2] * t for i2 in range(4)]))
        per_frame[f1].append((tid, tr["obs"][f1]))
        for m in range(max(0, f0 - cfg["extend"]), f0):
            per_frame[m].append((tid, tr["obs"][f0]))
        for m in range(f1 + 1, min(total, f1 + cfg["extend"] + 1)):
            per_frame[m].append((tid, tr["obs"][f1]))
    return per_frame, len(tracks)


# ---------- fase 3: pixelado + codificación ----------

def _expand(box, dxf, dyf, mn, w, h):
    x1, y1, x2, y2 = box
    dx = max(mn, (x2 - x1) * dxf)
    dy = max(mn, (y2 - y1) * dyf)
    return [max(0, x1 - dx), max(0, y1 - dy), min(w, x2 + dx), min(h, y2 + dy)]


def _pixelate(img, box, cell, min_cells=3, max_cells=16):
    import cv2
    import numpy as np
    x1, y1, x2, y2 = (int(round(v)) for v in box)
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(img.shape[1], x2), min(img.shape[0], y2)
    w, h = x2 - x1, y2 - y1
    if w < 2 or h < 2:
        return
    nx = int(np.clip(w // cell, min_cells, max_cells))
    ny = int(np.clip(h // cell, min_cells, max_cells))
    small = cv2.resize(img[y1:y2, x1:x2], (nx, ny), interpolation=cv2.INTER_AREA)
    img[y1:y2, x1:x2] = cv2.resize(small, (w, h), interpolation=cv2.INTER_NEAREST)


def renderizar(video_in, video_out, dets, total, regions_out=None, progreso=None,
               excluir=None, extra=None, preview_path=None):
    """Pixela y codifica.
    excluir: set de ids de pista ("p3", "f0", "pl12") que NO se pixelan (falsos positivos).
    extra: [{x1,y1,x2,y2,f0,f1}, ...] zonas manuales añadidas (en píxeles del vídeo).
    progreso(frames_hechos, frames_totales).
    """
    import cv2
    from detect_lib import head_region
    excluir = excluir or set()
    extra = extra or []
    cap = cv2.VideoCapture(video_in)
    W, H = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    pers, _ = pistas(dets, "persons", total)
    face, _ = pistas(dets, "faces", total)
    plat, _ = pistas(dets, "plates", total)
    ff = subprocess.Popen([
        ffmpeg_bin(), "-y", "-loglevel", "error",
        "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{W}x{H}", "-framerate", f"{fps:.6f}", "-i", "pipe:0",
        "-i", video_in, "-map", "0:v:0", "-map", "1:a:0?",
        "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
        "-c:a", "copy", "-movflags", "+faststart", video_out], stdin=subprocess.PIPE)
    log, n = {}, 0
    while True:
        ok, img = cap.read()
        if not ok:
            break
        regs = []
        if n < total:
            regs += [("head", "p:" + t, _expand(head_region(*b), 0.15, 0.15, 2, W, H)) for t, b in pers[n]]
            regs += [("face", "f:" + t, _expand(b, 0.30, 0.35, 3, W, H)) for t, b in face[n]]
            regs += [("plate", "pl:" + t, _expand(b, 0.30, 0.50, 3, W, H)) for t, b in plat[n]]
        quitados = [("quitado", t, b) for k, t, b in regs if t in excluir]
        regs = [r for r in regs if r[1] not in excluir]
        for i, z in enumerate(extra):
            if z["f0"] <= n <= z["f1"]:
                regs.append(("manual", f"m:{i}", [z["x1"], z["y1"], z["x2"], z["y2"]]))
        for kind, _tid, box in regs:
            _pixelate(img, box, cell=5 if kind == "plate" else 6)
        log[n] = [[k, t] + [round(v, 1) for v in b] for k, t, b in regs + quitados]
        ff.stdin.write(img.tobytes())
        n += 1
        if progreso and n % 30 == 0:
            progreso(n, total)
        if preview_path and n % 12 == 1:
            _foto(img, preview_path)
    ff.stdin.close()
    rc = ff.wait()
    if progreso:
        progreso(n, total)
    if regions_out:
        with open(regions_out, "w") as fh:
            json.dump(log, fh)
    if rc != 0:
        raise RuntimeError(f"ffmpeg terminó con código {rc}")
    return n


# ---------- QA de cobertura ----------

def qa_cobertura(dets, regions_path):
    """Comprueba que cada detección original quede cubierta >=70% por una región pixelada."""
    from detect_lib import head_region
    regs = {int(k): v for k, v in json.load(open(regions_path)).items()}
    kind2reg = {"persons": "head", "faces": "face", "plates": "plate"}
    sin_cubrir = 0
    excluidas = 0
    revisadas = 0
    for n, d in dets.items():
        rlist = regs.get(n, [])
        for kind, regkind in kind2reg.items():
            for det in d.get(kind, []):
                target = head_region(*det[:4]) if kind == "persons" else det[:4]
                ta = max(1e-6, (target[2] - target[0]) * (target[3] - target[1]))
                cov, cov_qt = 0.0, 0.0
                for r in rlist:
                    if r[0] not in (regkind, "manual", "quitado"):
                        continue
                    b = r[2:]
                    ix = max(0.0, min(target[2], b[2]) - max(target[0], b[0]))
                    iy = max(0.0, min(target[3], b[3]) - max(target[1], b[1]))
                    frac = ix * iy / ta
                    if r[0] == "quitado":
                        cov_qt = max(cov_qt, frac)
                    else:
                        cov = max(cov, frac)
                    if cov >= 0.70:
                        break
                revisadas += 1
                if cov < 0.70:
                    if cov_qt >= 0.70:
                        excluidas += 1
                    else:
                        sin_cubrir += 1
    return {"revisadas": revisadas, "sin_cubrir": sin_cubrir, "excluidas": excluidas}


# ---------- CLI ----------

def main():
    ap = argparse.ArgumentParser(description="Pixela caras, cabezas y matrículas de un vídeo.")
    ap.add_argument("entrada")
    ap.add_argument("salida")
    ap.add_argument("--workers", type=int, default=max(1, min(4, os.cpu_count() or 1)))
    ap.add_argument("--detecciones", help="JSON de detecciones ya calculado (se salta la fase 1)")
    ap.add_argument("--guardar-detecciones", help="ruta donde guardar el JSON de detecciones")
    ap.add_argument("--regiones", help="ruta donde guardar el JSON de regiones pixeladas (QA)")
    args = ap.parse_args()
    if not ffmpeg_bin():
        sys.exit("No encuentro ffmpeg. Instálalo (o `pip install imageio-ffmpeg`).")
    if modelos_que_faltan():
        print("Descargando modelos (una sola vez)…")
        descargar_modelos(lambda n, b, t: print(f"  {n}: {b // 1024} KiB", end="\r"))
        print()
    import tempfile
    with tempfile.TemporaryDirectory() as tmpdir:
        if args.detecciones:
            dets = {int(k): v for k, v in json.load(open(args.detecciones)).items()}
            total = info_video(args.entrada)["frames"]
        else:
            print("[1/3] Detectando…")
            dets, total = detectar(args.entrada, args.workers, tmpdir,
                                   lambda a, b: print(f"  {a}/{b}", end="\r"))
            print()
            if args.guardar_detecciones:
                json.dump({str(k): v for k, v in dets.items()}, open(args.guardar_detecciones, "w"))
        print("[2/3] Pistas y [3/3] pixelado…")
        n = renderizar(args.entrada, args.salida, dets, total, regions_out=args.regiones,
                       progreso=lambda a, b: print(f"  {a}/{b}", end="\r"))
        print(f"\nHecho: {args.salida} ({n} fotogramas)")


if __name__ == "__main__":
    main()

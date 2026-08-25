"""Anonimiza un vídeo: pixela caras, cabezas de personas y matrículas.

Pipeline completo en un comando:
  1) Detección por fotograma (YOLOX personas/vehículos + mosaico 2 tiles para
     personas pequeñas, YuNet caras, YOLOv9-t matrículas con zoom por vehículo),
     paralelizada por rangos de fotogramas.
  2) Seguimiento temporal: pistas por IoU, interpolación de huecos (cubre
     oclusiones y parpadeos del detector) y extensión en los extremos.
  3) Pixelado en mosaico con márgenes y codificación H.264 conservando el audio.

Uso:
  python3 anonimizar.py entrada.mp4 salida.mp4 [--workers 4]

Requisitos: pip install opencv-python-headless numpy onnxruntime; ffmpeg en el
PATH; modelos en ./models (ejecutar antes ./descargar-modelos.sh).
"""
import argparse
import json
import multiprocessing as mp
import os
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# --- parámetros (los que dieron ✅ en QA con vídeo real de calle) ---
CONF_PERSON, CONF_PERSON_TILE, CONF_VEHICLE = 0.22, 0.25, 0.25
CONF_PLATE_FULL, CONF_PLATE_ZOOM = 0.25, 0.28
TILE_OVERLAP = 0.16
TRACK_CFG = {
    "persons": {"iou": 0.18, "gap": 20, "extend": 6},
    "faces":   {"iou": 0.15, "gap": 12, "extend": 5},
    "plates":  {"iou": 0.15, "gap": 30, "extend": 8},
}


# ---------- fase 1: detección ----------

def _worker(args):
    video, start, end, wid, tmpdir = args
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
    out, t0 = {}, time.time()
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
        if (n - start) % 100 == 0:
            el, done = time.time() - t0, n - start + 1
            print(f"  [w{wid}] {done}/{end - start} ({el / done:.2f}s/frame)", flush=True)
        if (n - start) % 150 == 0:
            _dump(out, wid, tmpdir)
    _dump(out, wid, tmpdir)


def _dump(out, wid, tmpdir):
    p = os.path.join(tmpdir, f"det_{wid}.json")
    with open(p + ".tmp", "w") as fh:
        json.dump(out, fh)
    os.replace(p + ".tmp", p)


def detectar(video, workers, tmpdir):
    import cv2
    cap = cv2.VideoCapture(video)
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    cap.release()
    print(f"[1/3] Detección en {total} fotogramas con {workers} procesos…")
    bounds = [round(i * total / workers) for i in range(workers + 1)]
    with mp.Pool(workers) as pool:
        pool.map(_worker, [(video, bounds[i], bounds[i + 1], i, tmpdir) for i in range(workers)])
    dets = {}
    for i in range(workers):
        with open(os.path.join(tmpdir, f"det_{i}.json")) as fh:
            dets.update({int(k): v for k, v in json.load(fh).items()})
    if len(dets) != total:
        print(f"  AVISO: {total - len(dets)} fotogramas sin detecciones (¿vídeo truncado?)")
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
    for tr in tracks:
        fs = sorted(tr["obs"])
        f0, f1 = fs[0], fs[-1]
        for a, b in zip(fs, fs[1:]):
            per_frame[a].append(tr["obs"][a])
            for m in range(a + 1, b):
                t = (m - a) / (b - a)
                per_frame[m].append([tr["obs"][a][i] * (1 - t) + tr["obs"][b][i] * t for i in range(4)])
        per_frame[f1].append(tr["obs"][f1])
        for m in range(max(0, f0 - cfg["extend"]), f0):
            per_frame[m].append(tr["obs"][f0])
        for m in range(f1 + 1, min(total, f1 + cfg["extend"] + 1)):
            per_frame[m].append(tr["obs"][f1])
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


def renderizar(video_in, video_out, dets, total, regions_out):
    import cv2
    from detect_lib import head_region
    cap = cv2.VideoCapture(video_in)
    W, H = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    pers, np_ = pistas(dets, "persons", total)
    face, nf = pistas(dets, "faces", total)
    plat, npl = pistas(dets, "plates", total)
    print(f"[2/3] Pistas: {np_} personas, {nf} caras, {npl} matrículas")
    print(f"[3/3] Pixelando y codificando ({W}x{H} @ {fps:.3f}fps)…")
    ff = subprocess.Popen([
        "ffmpeg", "-y", "-loglevel", "error",
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
            regs += [("head", _expand(head_region(*b), 0.15, 0.15, 2, W, H)) for b in pers[n]]
            regs += [("face", _expand(b, 0.30, 0.35, 3, W, H)) for b in face[n]]
            regs += [("plate", _expand(b, 0.30, 0.50, 3, W, H)) for b in plat[n]]
        for kind, box in regs:
            _pixelate(img, box, cell=5 if kind == "plate" else 6)
        log[n] = [[k] + [round(v, 1) for v in b] for k, b in regs]
        ff.stdin.write(img.tobytes())
        n += 1
    ff.stdin.close()
    rc = ff.wait()
    if regions_out:
        json.dump(log, open(regions_out, "w"))
    if rc != 0:
        sys.exit(f"ffmpeg terminó con código {rc}")
    print(f"Hecho: {video_out} ({n} fotogramas)")


def main():
    ap = argparse.ArgumentParser(description="Pixela caras, cabezas y matrículas de un vídeo.")
    ap.add_argument("entrada")
    ap.add_argument("salida")
    ap.add_argument("--workers", type=int, default=max(1, min(4, os.cpu_count() or 1)))
    ap.add_argument("--detecciones", help="JSON de detecciones ya calculado (se salta la fase 1)")
    ap.add_argument("--guardar-detecciones", help="ruta donde guardar el JSON de detecciones")
    ap.add_argument("--regiones", help="ruta donde guardar el JSON de regiones pixeladas (QA)")
    args = ap.parse_args()
    import tempfile
    with tempfile.TemporaryDirectory() as tmpdir:
        if args.detecciones:
            dets = {int(k): v for k, v in json.load(open(args.detecciones)).items()}
            import cv2
            cap = cv2.VideoCapture(args.entrada)
            total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            cap.release()
        else:
            dets, total = detectar(args.entrada, args.workers, tmpdir)
            if args.guardar_detecciones:
                json.dump({str(k): v for k, v in dets.items()}, open(args.guardar_detecciones, "w"))
        renderizar(args.entrada, args.salida, dets, total, args.regiones)


if __name__ == "__main__":
    main()

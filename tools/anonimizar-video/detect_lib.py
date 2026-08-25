"""Detectores para anonimizado de vídeo: personas/vehículos (YOLOX-S), caras (YuNet), matrículas (YOLOv9-t end2end)."""
import os

import cv2
import numpy as np
import onnxruntime as ort

MODELS_DIR = os.environ.get("ANONIMIZAR_MODELS_DIR",
                            os.path.join(os.path.dirname(os.path.abspath(__file__)), "models"))

# ---------- util ----------

def letterbox(img, size=640, pad=114):
    """Resize keeping ratio, pad bottom-right (YOLOX style). Returns padded, ratio."""
    h, w = img.shape[:2]
    r = min(size / w, size / h)
    nw, nh = int(round(w * r)), int(round(h * r))
    resized = cv2.resize(img, (nw, nh), interpolation=cv2.INTER_LINEAR)
    out = np.full((size, size, 3), pad, dtype=np.uint8)
    out[:nh, :nw] = resized
    return out, r


def nms(boxes, scores, iou_thr=0.45):
    if len(boxes) == 0:
        return []
    idxs = cv2.dnn.NMSBoxes(
        [[float(x1), float(y1), float(x2 - x1), float(y2 - y1)] for x1, y1, x2, y2 in boxes],
        [float(s) for s in scores], 0.0, iou_thr)
    if len(idxs) == 0:
        return []
    return np.array(idxs).reshape(-1).tolist()


# ---------- YOLOX (personas + vehículos, COCO) ----------

class YoloxDetector:
    PERSON = 0
    VEHICLES = {1: "bicycle", 2: "car", 3: "motorcycle", 5: "bus", 7: "truck"}

    def __init__(self, path=f"{MODELS_DIR}/yolox_s.onnx", size=640):
        self.sess = ort.InferenceSession(path, providers=["CPUExecutionProvider"])
        self.size = size
        self._grids, self._strides = self._make_grids(size)

    @staticmethod
    def _make_grids(size):
        grids, strides = [], []
        for s in (8, 16, 32):
            n = size // s
            yv, xv = np.meshgrid(np.arange(n), np.arange(n), indexing="ij")
            grids.append(np.stack((xv, yv), 2).reshape(-1, 2).astype(np.float32))
            strides.append(np.full((n * n, 1), s, dtype=np.float32))
        return np.concatenate(grids), np.concatenate(strides)

    def detect(self, img_bgr, conf_person=0.35, conf_vehicle=0.35):
        """Returns (persons, vehicles): lists of (x1,y1,x2,y2,score) in image coords."""
        padded, r = letterbox(img_bgr, self.size)
        blob = padded.astype(np.float32).transpose(2, 0, 1)[None]  # BGR, sin normalizar (YOLOX >=0.1.1)
        out = self.sess.run(None, {"images": blob})[0][0]  # (8400, 85)
        xy = (out[:, :2] + self._grids) * self._strides
        wh = np.exp(out[:, 2:4]) * self._strides
        scores_all = out[:, 4:5] * out[:, 5:]
        cls_ids = scores_all.argmax(1)
        cls_scores = scores_all.max(1)
        boxes = np.concatenate([xy - wh / 2, xy + wh / 2], 1) / r
        persons, vehicles = [], []
        for group, conf, wanted in ((persons, conf_person, {self.PERSON}),
                                    (vehicles, conf_vehicle, set(self.VEHICLES))):
            mask = np.isin(cls_ids, list(wanted)) & (cls_scores >= conf)
            b, s = boxes[mask], cls_scores[mask]
            for i in nms(b, s):
                x1, y1, x2, y2 = b[i]
                group.append((float(x1), float(y1), float(x2), float(y2), float(s[i])))
        return persons, vehicles


# ---------- YuNet (caras) ----------

class FaceDetector:
    def __init__(self, path=f"{MODELS_DIR}/yunet.onnx", score_thr=0.55, upscale=2.0):
        self.det = cv2.FaceDetectorYN_create(path, "", (320, 320), score_thr, 0.3, 5000)
        self.upscale = upscale

    def detect(self, img_bgr):
        """Returns list of (x1,y1,x2,y2,score) in image coords."""
        u = self.upscale
        img = cv2.resize(img_bgr, None, fx=u, fy=u, interpolation=cv2.INTER_CUBIC) if u != 1 else img_bgr
        h, w = img.shape[:2]
        self.det.setInputSize((w, h))
        _, faces = self.det.detect(img)
        res = []
        if faces is not None:
            for f in faces:
                x, y, fw, fh, score = f[0], f[1], f[2], f[3], f[-1]
                res.append((x / u, y / u, (x + fw) / u, (y + fh) / u, float(score)))
        return res


# ---------- Matrículas (YOLOv9-t end2end de open-image-models) ----------

class PlateDetector:
    def __init__(self, path=f"{MODELS_DIR}/plates-yolov9t-640.onnx", size=640):
        self.sess = ort.InferenceSession(path, providers=["CPUExecutionProvider"])
        self.size = size

    def _infer(self, img_bgr, conf):
        padded, r = letterbox(img_bgr, self.size)
        rgb = cv2.cvtColor(padded, cv2.COLOR_BGR2RGB)
        blob = (rgb.astype(np.float32) / 255.0).transpose(2, 0, 1)[None]
        out = self.sess.run(None, {"images": blob})[0]  # (N, 7)
        res = []
        for row in out:
            score = float(row[6])
            if score < conf:
                continue
            x1, y1, x2, y2 = (float(v) / r for v in row[1:5])
            res.append((x1, y1, x2, y2, score))
        return res

    def detect(self, img_bgr, conf=0.30, vehicle_boxes=None, zoom_margin=0.25, zoom_conf=None):
        """Full-frame pass + zoomed pass per vehicle crop. Returns (x1,y1,x2,y2,score) list."""
        h, w = img_bgr.shape[:2]
        zoom_conf = conf if zoom_conf is None else zoom_conf
        found = self._infer(img_bgr, conf)
        for vb in (vehicle_boxes or []):
            vx1, vy1, vx2, vy2 = vb[:4]
            mw, mh = (vx2 - vx1) * zoom_margin, (vy2 - vy1) * zoom_margin
            cx1, cy1 = max(0, int(vx1 - mw)), max(0, int(vy1 - mh))
            cx2, cy2 = min(w, int(vx2 + mw)), min(h, int(vy2 + mh))
            if cx2 - cx1 < 12 or cy2 - cy1 < 12:
                continue
            crop = img_bgr[cy1:cy2, cx1:cx2]
            for x1, y1, x2, y2, s in self._infer(crop, zoom_conf):
                found.append((x1 + cx1, y1 + cy1, x2 + cx1, y2 + cy1, s))
        if not found:
            return []
        b = np.array([f[:4] for f in found], dtype=np.float32)
        s = np.array([f[4] for f in found], dtype=np.float32)
        return [(float(b[i][0]), float(b[i][1]), float(b[i][2]), float(b[i][3]), float(s[i]))
                for i in nms(b, s, 0.35)]


# ---------- región de cabeza a partir de una persona ----------

def head_region(px1, py1, px2, py2, wfrac=0.62, hfrac=0.26, min_side=8):
    """Zona superior del cuerpo donde está la cabeza (vista desde arriba/lado)."""
    w, h = px2 - px1, py2 - py1
    cx = (px1 + px2) / 2
    hw = max(min_side, w * wfrac) / 2
    hh = max(min_side, h * hfrac)
    return (cx - hw, py1, cx + hw, py1 + hh)

"""Detector de objetos + seguimiento multi-objeto (YOLO11n + supervision.ByteTrack).

Equivalente en Python del tracker de la v1 (`modulos/01-tracker.js`): asigna a cada
detección un `id` estable entre fotogramas y mantiene por cada track un historial de
~2 s y una velocidad suavizada (media móvil ~0.7 s). El emparejamiento lo hace
`supervision.ByteTrack` (uno POR cámara); nosotros solo enriquecemos con historial,
punto de apoyo (pie), centroides y velocidad, que es lo que consume la analítica.

Reglas del contrato §0/§9:
- Nada corre en el import: YOLO y supervision se importan DENTRO de `__init__`.
- El modelo se carga UNA vez ("yolo11n.pt", se auto-descarga la primera vez).
- Este módulo NO publica alertas ni toca el bus: `procesar()` devuelve `list[Track]`.
"""
from __future__ import annotations

import logging
import math
from collections import deque
from dataclasses import dataclass, field
from typing import Any

_log = logging.getLogger("vigia.detector")

# --- Ventanas temporales del historial (mismos valores que la v1) -------------
_HIST_MS = 2000          # ventana de historial por track (~2 s)
_HIST_MAX = 120          # tope defensivo de muestras (evita crecimiento patológico)
_VEL_MS = 700            # ventana de la media móvil de velocidad (~0.7 s)
_LIMPIAR_MS = 5000       # se olvida el historial de un track no visto > 5 s

# --- Clases COCO de interés (nombres en inglés, tal cual §8) ------------------
CLASES_INTERES: frozenset[str] = frozenset({
    "person", "car", "truck", "bus", "motorcycle", "bicycle",
    "backpack", "handbag", "suitcase", "dog", "cat", "bird",
})


@dataclass
class Track:
    """Un objeto seguido en el tiempo, con id estable entre fotogramas.

    `caja` es (x1, y1, x2, y2) en píxeles. `pie_x`/`pie_y` es el centro-abajo de la
    caja (punto de apoyo en el suelo), que es el que usan las zonas y las líneas.
    `historial` guarda (cx, cy, pie_x, pie_y, ts_ms) recortado a ~2 s.
    """
    id: int
    clase: str
    conf: float
    caja: tuple[float, float, float, float]
    cx: float
    cy: float
    pie_x: float
    pie_y: float
    historial: deque = field(default_factory=deque)
    vel_px_s: float = 0.0


class Detector:
    """Carga YOLO11n una vez y sigue objetos con un ByteTrack por cámara.

    Uso: `det = Detector(cfg)` y luego, por cada fotograma de cada cámara,
    `tracks = det.procesar(camara_id, frame_bgr, ts_ms)`.
    """

    def __init__(self, cfg: Any) -> None:
        """Importa ultralytics/supervision (perezoso) y carga el modelo YOLO11n."""
        self._cfg = cfg
        # Import perezoso con mensaje claro: en instalaciones sin las libs pesadas
        # el error explica qué falta en vez de reventar en el import del módulo.
        try:
            from ultralytics import YOLO  # type: ignore
            import supervision as sv  # type: ignore
        except ImportError as e:  # pragma: no cover - depende del entorno
            raise ImportError(
                "Faltan dependencias del detector (ultralytics y/o supervision). "
                "Instálalas con: pip install -r requirements.txt"
            ) from e

        self._sv = sv
        _log.info("Cargando modelo YOLO11n (yolo11n.pt)…")
        self._modelo = YOLO("yolo11n.pt")
        try:
            # Fija el dispositivo (cpu por defecto en mini PC / Raspberry).
            self._modelo.to(getattr(cfg.deteccion, "dispositivo", "cpu"))
        except Exception as e:  # noqa: BLE001 - si el device no existe, sigue en CPU
            _log.warning("No se pudo fijar el dispositivo '%s': %s",
                         getattr(cfg.deteccion, "dispositivo", "cpu"), e)

        # Nombres COCO id->nombre para resolver clases (respaldo si falta class_name).
        nombres = getattr(self._modelo, "names", {}) or {}
        self._nombres: dict[int, str] = {int(k): str(v) for k, v in nombres.items()}

        # Un ByteTrack POR cámara (creación perezosa en procesar).
        self._trackers: dict[str, Any] = {}
        # Historial e "última vez" por (camara_id, track_id).
        self._historiales: dict[tuple[str, int], deque] = {}
        self._ultima_vez: dict[tuple[str, int], int] = {}
        _log.info("Detector listo. Clases de interés: %d", len(CLASES_INTERES))

    # --- API pública ---------------------------------------------------------
    def procesar(self, camara_id: str, frame_bgr: Any, ts_ms: int) -> list[Track]:
        """Detecta + sigue objetos en un fotograma y devuelve los tracks visibles.

        Filtra a las clases de interés, mantiene el historial por track y calcula la
        velocidad suavizada. Nunca lanza por una detección rara: degrada y avisa.
        """
        sv = self._sv
        try:
            resultados = self._modelo(
                frame_bgr,
                imgsz=self._cfg.deteccion.imgsz,
                conf=self._cfg.deteccion.confianza,
                verbose=False,
            )
        except Exception as e:  # noqa: BLE001 - una inferencia fallida no tumba la cámara
            _log.warning("[%s] inferencia falló: %s", camara_id, e)
            return []

        if not resultados:
            return []
        det = sv.Detections.from_ultralytics(resultados[0])

        # Nombres de clase por detección (class_name de supervision, o mapa del modelo).
        nombres = self._nombres_de(det)

        # Filtra a las clases de interés ANTES de trackear (el tracker solo sigue esas).
        if len(det) and nombres:
            interes = [i for i, n in enumerate(nombres) if n in CLASES_INTERES]
            det = det[interes]

        # Un ByteTrack por cámara (perezoso).
        tracker = self._trackers.get(camara_id)
        if tracker is None:
            tracker = sv.ByteTrack()
            self._trackers[camara_id] = tracker
            _log.info("[%s] ByteTrack creado", camara_id)
        det = tracker.update_with_detections(det)

        # Recalcula nombres tras el tracking (conserva class_name/class_id).
        nombres = self._nombres_de(det)

        tracks: list[Track] = []
        n = len(det)
        for i in range(n):
            tid = det.tracker_id[i] if det.tracker_id is not None else None
            if tid is None:
                continue
            tid = int(tid)
            clase = nombres[i] if i < len(nombres) else ""
            if clase not in CLASES_INTERES:
                continue
            x1, y1, x2, y2 = (float(v) for v in det.xyxy[i])
            conf = float(det.confidence[i]) if det.confidence is not None else 0.0
            cx = (x1 + x2) / 2.0
            cy = (y1 + y2) / 2.0
            pie_x = cx
            pie_y = y2  # centro-abajo: punto de apoyo en el suelo

            clave = (camara_id, tid)
            hist = self._historiales.get(clave)
            if hist is None:
                hist = deque()
                self._historiales[clave] = hist
            hist.append((cx, cy, pie_x, pie_y, ts_ms))
            self._recortar(hist, ts_ms)
            self._ultima_vez[clave] = ts_ms

            tracks.append(Track(
                id=tid, clase=clase, conf=conf,
                caja=(x1, y1, x2, y2),
                cx=cx, cy=cy, pie_x=pie_x, pie_y=pie_y,
                historial=hist,
                vel_px_s=self._velocidad(hist, ts_ms),
            ))

        self._limpiar(ts_ms)
        return tracks

    # --- Utilidades internas -------------------------------------------------
    def _nombres_de(self, det: Any) -> list[str]:
        """Lista de nombres de clase por detección (class_name o respaldo por id)."""
        datos = getattr(det, "data", {}) or {}
        cn = datos.get("class_name") if isinstance(datos, dict) else None
        if cn is not None:
            return [str(x) for x in cn]
        if det.class_id is not None:
            return [self._nombres.get(int(c), "") for c in det.class_id]
        return []

    @staticmethod
    def _recortar(hist: deque, ts_ms: int) -> None:
        """Recorta el historial a ~2 s (y a un tope de muestras), dejando ≥ 2."""
        limite = ts_ms - _HIST_MS
        while len(hist) > 2 and hist[0][4] < limite:
            hist.popleft()
        while len(hist) > _HIST_MAX:
            hist.popleft()

    @staticmethod
    def _velocidad(hist: deque, ts_ms: int) -> float:
        """Velocidad px/s suavizada: media móvil sobre la ventana ~0.7 s.

        Distancia entre la muestra de hace ~0.7 s y la actual dividida por el tiempo.
        Robusto frente al ruido de un solo fotograma (igual que la v1).
        """
        if len(hist) < 2:
            return 0.0
        objetivo = ts_ms - _VEL_MS
        ref = hist[0]
        for muestra in hist:
            if muestra[4] <= objetivo:
                ref = muestra
            else:
                break
        dt = (ts_ms - ref[4]) / 1000.0
        if dt <= 0:
            return 0.0
        d = math.hypot(hist[-1][0] - ref[0], hist[-1][1] - ref[1])
        v = d / dt
        return v if math.isfinite(v) and v > 0 else 0.0

    def _limpiar(self, ts_ms: int) -> None:
        """Olvida historiales de tracks no vistos en > 5 s (evita fugas de memoria)."""
        muertos = [k for k, t in self._ultima_vez.items() if ts_ms - t > _LIMPIAR_MS]
        for k in muertos:
            self._historiales.pop(k, None)
            self._ultima_vez.pop(k, None)

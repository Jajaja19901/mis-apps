"""Evidencia: buffer circular por cámara + clips MP4 con timestamp incrustado.

Idea: cada cámara mantiene en RAM un buffer circular de los últimos ~pre_seg
segundos (frames JPEG, ancho ≤960). Cuando la analítica dispara un evento se
"congela" ese buffer (los segundos ANTES del evento) y se siguen capturando
frames durante post_seg segundos (los DESPUÉS). Con ambos se escribe un MP4 con
la fecha/hora incrustada en cada frame — esa marca de tiempo ES la evidencia.

Colas / descartes:
  · Buffer por cámara = deque limitada a pre_seg × fps_estimado frames. Además se
    poda por tiempo (se tiran los frames más VIEJOS de pre_seg segundos). El fps se
    estima del propio ritmo de alimentar() (tope 10). Se descarta siempre lo más
    rancio (por el borde izquierdo del deque).
  · Si llega un 2º evento mientras se graba, NO se abre otro clip: se EXTIENDE el
    fin del clip en curso y se le asocia también ese evento_id.

Sin PIL: solo OpenCV + numpy. Nada corre en import.
"""
from __future__ import annotations

import logging
import threading
import time
from collections import deque
from datetime import datetime
from pathlib import Path

import cv2  # solo importar; sin efectos secundarios

from .bus import bus
from .configuracion import Config

_log = logging.getLogger("vigia.evidencia")

_ANCHO_MAX = 960          # px; se reescala antes de codificar el buffer
_JPEG_CALIDAD = 70        # calidad del buffer circular
_FPS_TOPE = 10            # tope del fps estimado del flujo
_FPS_MIN = 1


class _CamBuf:
    """Buffer circular y estimación de fps de una cámara."""

    def __init__(self, pre_seg: int) -> None:
        self.pre_seg = pre_seg
        # maxlen de seguridad = pre_seg × tope de fps + margen; la poda real es por tiempo
        self.buffer: deque = deque(maxlen=pre_seg * _FPS_TOPE + 5)
        self.lock = threading.Lock()
        self._ultimo_ts: int | None = None
        self._intervalo_ewma: float = 0.0  # ms entre frames

    def fps_estimado(self) -> int:
        if self._intervalo_ewma <= 0:
            return _FPS_TOPE // 2 or 1
        fps = int(round(1000.0 / self._intervalo_ewma))
        return max(_FPS_MIN, min(_FPS_TOPE, fps))

    def alimentar(self, ts_ms: int, jpeg: bytes) -> None:
        with self.lock:
            if self._ultimo_ts is not None:
                inter = ts_ms - self._ultimo_ts
                if 0 < inter < 2000:  # descarta huecos por reconexión
                    self._intervalo_ewma = (inter if self._intervalo_ewma == 0
                                            else 0.8 * self._intervalo_ewma + 0.2 * inter)
            self._ultimo_ts = ts_ms
            self.buffer.append((ts_ms, jpeg))
            # poda por tiempo: fuera lo más viejo de pre_seg segundos
            limite = ts_ms - self.pre_seg * 1000
            while self.buffer and self.buffer[0][0] < limite:
                self.buffer.popleft()


class _Grabacion:
    """Estado de un clip en curso (frames pre + post que se van acumulando)."""

    def __init__(self, camara_id: str, frames_pre: list, fin_mono: float,
                 evento_id: str, fps: int) -> None:
        self.camara_id = camara_id
        self.lock = threading.Lock()
        self.frames: list = list(frames_pre)   # [(ts_ms, jpeg)]
        self.fin_mono = fin_mono
        self.eventos: list[str] = [evento_id]
        self.fps = fps


class Evidencia:
    """Buffer circular por cámara + grabación de clips MP4 con timestamp."""

    def __init__(self, cfg: Config) -> None:
        self.cfg = cfg
        self._carpeta = Path(cfg.evidencia.carpeta)
        self._pre_seg = int(cfg.evidencia.pre_seg)
        self._post_seg = int(cfg.evidencia.post_seg)
        self._bufs: dict[str, _CamBuf] = {}
        self._grabaciones: dict[str, _Grabacion] = {}
        self._lock = threading.Lock()  # protege _bufs y _grabaciones

    def _buf(self, camara_id: str) -> _CamBuf:
        with self._lock:
            b = self._bufs.get(camara_id)
            if b is None:
                b = _CamBuf(self._pre_seg)
                self._bufs[camara_id] = b
            return b

    # === alimentación desde el hilo de cámara =============================
    def alimentar(self, camara_id: str, frame_bgr, ts_ms: int) -> None:
        """Reescala a ≤960 px, codifica JPEG y lo mete en el buffer circular.

        Si hay un clip grabándose para esa cámara, también le añade el frame.
        """
        try:
            img = frame_bgr
            h, w = img.shape[:2]
            if w > _ANCHO_MAX:
                escala = _ANCHO_MAX / float(w)
                img = cv2.resize(img, (_ANCHO_MAX, max(1, int(h * escala))))
            ok, buf = cv2.imencode(".jpg", img, [int(cv2.IMWRITE_JPEG_QUALITY), _JPEG_CALIDAD])
            if not ok:
                return
            jpeg = buf.tobytes()
        except Exception as e:
            _log.warning("cam %s: no se pudo codificar frame para evidencia: %s", camara_id, e)
            return

        self._buf(camara_id).alimentar(ts_ms, jpeg)

        # alimentar clip en curso (frames post-evento)
        g = self._grabaciones.get(camara_id)
        if g is not None and time.monotonic() < g.fin_mono:
            with g.lock:
                g.frames.append((ts_ms, jpeg))

    # === grabación de clips ===============================================
    def grabar_evento(self, evento_id: str, camara_id: str) -> None:
        """Graba un clip del evento. Si ya hay uno en curso, lo extiende."""
        with self._lock:
            g = self._grabaciones.get(camara_id)
            if g is not None and time.monotonic() < g.fin_mono:
                with g.lock:
                    g.fin_mono += self._post_seg
                    g.eventos.append(evento_id)
                _log.info("cam %s: clip en curso extendido por evento %s", camara_id, evento_id)
                return
            b = self._bufs.get(camara_id)
            frames_pre = list(b.buffer) if b is not None else []
            fps = b.fps_estimado() if b is not None else (_FPS_TOPE // 2 or 1)
            g = _Grabacion(camara_id, frames_pre, time.monotonic() + self._post_seg,
                           evento_id, fps)
            self._grabaciones[camara_id] = g
        threading.Thread(target=self._grabar_hilo, args=(g,),
                         name=f"evidencia-{camara_id}", daemon=True).start()
        _log.info("cam %s: iniciada grabación de clip para evento %s (%d frames pre)",
                  camara_id, evento_id, len(g.frames))

    def _grabar_hilo(self, g: _Grabacion) -> None:
        """Espera a que termine el post, escribe el MP4 + miniatura y avisa por bus."""
        cid = g.camara_id
        try:
            while time.monotonic() < g.fin_mono:
                time.sleep(0.2)
        except Exception:
            pass
        finally:
            with self._lock:
                if self._grabaciones.get(cid) is g:
                    del self._grabaciones[cid]
        try:
            with g.lock:
                frames = list(g.frames)
                eventos = list(g.eventos)
                fps = g.fps
            self._escribir_clip(cid, frames, eventos, fps)
        except Exception as e:  # nunca tumbar nada por un clip
            _log.warning("cam %s: fallo escribiendo clip: %s", cid, e)

    def _escribir_clip(self, camara_id: str, frames: list, eventos: list[str], fps: int) -> None:
        if not frames:
            _log.warning("cam %s: sin frames para el clip, se omite", camara_id)
            return
        frames.sort(key=lambda x: x[0])

        primero = cv2.imdecode(_np_buf(frames[0][1]), cv2.IMREAD_COLOR)
        if primero is None:
            _log.warning("cam %s: primer frame ilegible, se omite el clip", camara_id)
            return
        h, w = primero.shape[:2]

        fecha = datetime.now().strftime("%Y-%m-%d")
        carpeta = self._carpeta / fecha
        carpeta.mkdir(parents=True, exist_ok=True)
        primario = eventos[0]
        ruta = carpeta / f"{primario}.mp4"

        writer = self._abrir_writer(ruta, fps, w, h)
        if writer is None:
            _log.warning("cam %s: no se pudo abrir VideoWriter, clip omitido", camara_id)
            return

        escritos = 0
        for ts_ms, jpeg in frames:
            img = cv2.imdecode(_np_buf(jpeg), cv2.IMREAD_COLOR)
            if img is None:
                continue
            if img.shape[0] != h or img.shape[1] != w:
                img = cv2.resize(img, (w, h))
            _estampar_tiempo(img, ts_ms)
            writer.write(img)
            escritos += 1
        writer.release()

        if escritos == 0:
            _log.warning("cam %s: 0 frames escritos, clip vacío", camara_id)
            return

        # miniatura = frame central (estampado), una por evento asociado
        mid_ts, mid_jpeg = frames[len(frames) // 2]
        mini = cv2.imdecode(_np_buf(mid_jpeg), cv2.IMREAD_COLOR)
        if mini is not None:
            _estampar_tiempo(mini, mid_ts)

        _log.info("cam %s: clip escrito %s (%d frames, %d fps, %d evento/s)",
                  camara_id, ruta, escritos, fps, len(eventos))

        for eid in eventos:
            ruta_min = carpeta / f"{eid}.jpg"
            try:
                if mini is not None:
                    cv2.imwrite(str(ruta_min), mini)
            except Exception as e:
                _log.warning("cam %s: no se pudo escribir miniatura %s: %s", camara_id, ruta_min, e)
            bus.publicar("evento.clip_listo", {
                "evento_id": eid,
                "ruta": str(ruta),
                "ruta_miniatura": str(ruta_min),
            })

    def _abrir_writer(self, ruta: Path, fps: int, w: int, h: int):
        """VideoWriter con avc1 (H.264); si falla, mp4v."""
        for codec in ("avc1", "mp4v"):
            try:
                fourcc = cv2.VideoWriter_fourcc(*codec)
                writer = cv2.VideoWriter(str(ruta), fourcc, float(max(_FPS_MIN, fps)), (w, h))
                if writer.isOpened():
                    if codec != "avc1":
                        _log.info("clip %s con códec de reserva mp4v", ruta.name)
                    return writer
                writer.release()
            except Exception as e:
                _log.debug("códec %s no disponible: %s", codec, e)
        return None

    # === utilidades =======================================================
    def miniatura_de_frame_actual(self, camara_id: str) -> bytes | None:
        """Último JPEG del buffer (para eventos sin clip). None si no hay."""
        b = self._bufs.get(camara_id)
        if b is None:
            return None
        with b.lock:
            if not b.buffer:
                return None
            return b.buffer[-1][1]


def _np_buf(jpeg: bytes):
    """bytes JPEG → array 1D uint8 para cv2.imdecode (sin exponer numpy fuera)."""
    import numpy as np
    return np.frombuffer(jpeg, dtype=np.uint8)


def _estampar_tiempo(img, ts_ms: int) -> None:
    """Incrusta fecha/hora (dd/mm/YYYY HH:MM:SS) abajo-izquierda con banda negra."""
    try:
        texto = datetime.fromtimestamp(ts_ms / 1000.0).strftime("%d/%m/%Y %H:%M:%S")
    except (OverflowError, OSError, ValueError):
        return
    h, w = img.shape[:2]
    fuente = cv2.FONT_HERSHEY_SIMPLEX
    escala = max(0.4, (w / 1280.0) * 0.7)
    grosor = max(1, int(round(escala * 2)))
    (tw, th), base = cv2.getTextSize(texto, fuente, escala, grosor)
    x = 8
    y = h - 8
    # banda negra semitransparente
    overlay = img.copy()
    cv2.rectangle(overlay, (x - 4, y - th - base - 4), (x + tw + 4, y + base), (0, 0, 0), -1)
    cv2.addWeighted(overlay, 0.5, img, 0.5, 0, img)
    cv2.putText(img, texto, (x, y - base), fuente, escala, (255, 255, 255), grosor, cv2.LINE_AA)

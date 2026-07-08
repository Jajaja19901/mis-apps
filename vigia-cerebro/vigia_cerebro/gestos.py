"""Análisis de gestos de ocultación con MediaPipe Pose (misma máquina de la v1).

Traduce a Python la lógica de ocultación de `modulos/02-gestos.js`: una muñeca se aleja
del torso (ALCANZAR) y luego vuelve muy cerca del cuerpo y PERMANECE (ESCONDER); cada
ciclo suma puntos, con decaimiento en el tiempo. Al superar el umbral se emite un evento
parcial `ocultacion`, con un texto que EXIGE revisión humana y no acusa a nadie.

Diferencias con la v1: corre sobre CROPS de personas (no el fotograma entero), como máximo
3 personas por fotograma, con UNA instancia de `mediapipe.solutions.pose.Pose` reutilizada.

Reglas del contrato §0:
- Import PEREZOSO de mediapipe: si no está instalable (ARM/Termux), `disponible=False`,
  se avisa una sola vez en el log y `procesar` devuelve `[]`.
- SOLO lo llama `camaras.py` para cámaras `prioridad == 3`.
- Este módulo NO decide alertas; devuelve eventos parciales.
"""
from __future__ import annotations

import logging
import time
from typing import Any

_log = logging.getLogger("vigia.gestos")

# --- Índices de los 33 landmarks de MediaPipe Pose que usamos (como la v1) -----
_HOMBRO_I, _HOMBRO_D = 11, 12
_MUNECA_I, _MUNECA_D = 15, 16
_CADERA_I, _CADERA_D = 23, 24


class Gestos:
    """Detector de gesto de ocultación por cámara+track (0-100 puntos de sospecha)."""

    # --- Umbrales de la máquina (relativos a la anchura de hombros) -----------
    EXT_ALCANCE = 1.1          # muñeca-torso > 1.1·anchoHombros ⇒ "alcanzar"
    CERCA_CUERPO = 0.5         # muñeca-cadera/pecho < 0.5·anchoHombros ⇒ "esconder"
    DWELL_MS = 700             # permanencia mínima cerca del cuerpo (≥ 0.7 s)
    DWELL_LARGO_MS = 1500      # permanencia larga ⇒ bonus
    VENTANA_ALCANCE_MS = 3000  # tiempo máx. entre alcanzar y volver
    PTS_CICLO = 30             # puntos por ciclo alcanzar→esconder completo
    PTS_BONUS = 10             # extra si permanece mucho escondiendo
    DECAIMIENTO_SPS = 2.0      # decaimiento de la sospecha (puntos/segundo)
    UMBRAL = 60                # puntuación que dispara el evento
    COOLDOWN_MS = 30000        # anti-spam del evento (30 s/track)
    VIS_MIN = 0.3              # visibilidad mínima de un landmark para fiarnos
    MS_LIMITE = 80.0           # si la media > 80 ms/frame ⇒ 1 de cada 2 llamadas
    MARGEN_CROP = 0.15         # margen alrededor de la caja de la persona
    ALTO_CROP = 256            # alto al que se redimensiona el crop
    MAX_PERSONAS = 3           # máx. personas analizadas por fotograma
    OLVIDO_MS = 10000          # se olvida el estado de un track no visto > 10 s

    def __init__(self) -> None:
        """Importa mediapipe (perezoso) y crea UNA instancia de Pose reutilizable."""
        self.disponible = False
        self._pose = None
        self._cv2 = None
        try:
            import cv2  # type: ignore
            import mediapipe as mp  # type: ignore
        except Exception as e:  # noqa: BLE001 - en ARM/Termux mediapipe puede no compilar
            _log.warning(
                "MediaPipe/OpenCV no disponibles: el análisis de gestos de ocultación "
                "queda DESACTIVADO (la caída y la carrera siguen funcionando). Detalle: %s", e)
            return
        try:
            self._cv2 = cv2
            self._pose = mp.solutions.pose.Pose(static_image_mode=False, model_complexity=0)
            self.disponible = True
            _log.info("Análisis de gestos (MediaPipe Pose) listo.")
        except Exception as e:  # noqa: BLE001
            _log.warning("No se pudo iniciar MediaPipe Pose: gestos DESACTIVADOS. Detalle: %s", e)
            self._pose = None
            self.disponible = False

        # Estado por (camara_id, track_id).
        self._puntos: dict[tuple[str, int], float] = {}     # sospecha 0-100
        self._maquinas: dict[tuple[str, int], dict] = {}    # máquina de ocultación
        self._cooldown: dict[tuple[str, int], int] = {}     # ts último evento
        self._ultima_vez: dict[tuple[str, int], int] = {}   # ts último visto
        self._ms_media = 0.0
        self._saltar = 0
        self._ultimo_ts = 0

    # --- API pública ---------------------------------------------------------
    def procesar(self, camara_id: str, frame_bgr: Any, tracks_persona: list[Any],
                 ts_ms: int) -> list[dict]:
        """Analiza hasta 3 personas y devuelve eventos parciales de ocultación.

        Si MediaPipe no está disponible devuelve `[]`. Aplica el decaimiento de la
        sospecha en cada llamada y auto-limita el coste (1 de cada 2 si va lento).
        """
        if not self.disponible or self._pose is None:
            return []

        self._decaer(camara_id, ts_ms)

        # Auto-límite: si la media supera 80 ms/frame, procesa 1 de cada 2 llamadas.
        if self._ms_media > self.MS_LIMITE:
            self._saltar = (self._saltar + 1) % 2
            if self._saltar == 0:
                return []

        eventos: list[dict] = []
        # Personas más grandes primero (las más cercanas/relevantes), máx. 3.
        personas = sorted(
            (t for t in (tracks_persona or []) if t.clase == "person"),
            key=self._area, reverse=True)[:self.MAX_PERSONAS]

        h, w = frame_bgr.shape[0], frame_bgr.shape[1]
        for t in personas:
            self._ultima_vez[(camara_id, int(t.id))] = ts_ms
            puntos = self._pose_en_crop(frame_bgr, t, w, h)
            if puntos is None:
                continue
            ev = self._evaluar_ocultacion(camara_id, t, puntos, ts_ms)
            if ev:
                eventos.append(ev)

        self._prune(ts_ms)
        return eventos

    # --- Inferencia de pose sobre el crop de una persona ---------------------
    def _pose_en_crop(self, frame_bgr: Any, t: Any, w: int, h: int):
        """Recorta la persona (margen 15%), redimensiona a 256 px de alto y corre Pose.

        Devuelve la lista de landmarks en píxeles del crop [{x, y, v}] o None.
        Las distancias del gesto son relativas (a la anchura de hombros), así que
        trabajar en el espacio del crop no altera la lógica.
        """
        cv2 = self._cv2
        x1, y1, x2, y2 = t.caja
        cw = x2 - x1
        ch = y2 - y1
        if cw <= 1 or ch <= 1:
            return None
        mx = cw * self.MARGEN_CROP
        my = ch * self.MARGEN_CROP
        rx1 = max(0, int(x1 - mx))
        ry1 = max(0, int(y1 - my))
        rx2 = min(w, int(x2 + mx))
        ry2 = min(h, int(y2 + my))
        if rx2 - rx1 < 2 or ry2 - ry1 < 2:
            return None
        crop = frame_bgr[ry1:ry2, rx1:rx2]

        alto = self.ALTO_CROP
        escala = alto / (ry2 - ry1)
        ancho = max(1, int((rx2 - rx1) * escala))
        try:
            crop = cv2.resize(crop, (ancho, alto))
            rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
        except Exception as e:  # noqa: BLE001 - un crop degenerado no tumba la cámara
            _log.debug("resize/cvtColor falló: %s", e)
            return None

        t0 = time.perf_counter()
        try:
            res = self._pose.process(rgb)
        except Exception as e:  # noqa: BLE001
            _log.debug("Pose.process falló: %s", e)
            return None
        dt = (time.perf_counter() - t0) * 1000.0
        self._ms_media = self._ms_media * 0.8 + dt * 0.2 if self._ms_media else dt

        if not getattr(res, "pose_landmarks", None):
            return None
        lms = res.pose_landmarks.landmark
        return [{"x": lm.x * ancho, "y": lm.y * alto,
                 "v": (lm.visibility if lm.visibility is not None else 1.0)} for lm in lms]

    # --- Máquina de estados de la ocultación (idéntica a la v1) --------------
    def _evaluar_ocultacion(self, camara_id: str, t: Any, puntos: list[dict],
                            ts_ms: int) -> dict | None:
        if len(puntos) <= _CADERA_D:
            return None
        hi, hd = puntos[_HOMBRO_I], puntos[_HOMBRO_D]
        ci, cd = puntos[_CADERA_I], puntos[_CADERA_D]
        mi, md = puntos[_MUNECA_I], puntos[_MUNECA_D]
        # Torso poco fiable ⇒ no evaluamos (mejor no puntuar que inventar).
        if not (self._vis(hi) and self._vis(hd) and self._vis(ci) and self._vis(cd)):
            return None

        ancho_hombros = self._dist(hi, hd)
        if ancho_hombros < 1:
            return None
        hombros_c = {"x": (hi["x"] + hd["x"]) / 2, "y": (hi["y"] + hd["y"]) / 2}
        caderas_c = {"x": (ci["x"] + cd["x"]) / 2, "y": (ci["y"] + cd["y"]) / 2}
        torso_c = {"x": (hombros_c["x"] + caderas_c["x"]) / 2,
                   "y": (hombros_c["y"] + caderas_c["y"]) / 2}
        pecho_c = {"x": hombros_c["x"] + (caderas_c["x"] - hombros_c["x"]) * 0.35,
                   "y": hombros_c["y"] + (caderas_c["y"] - hombros_c["y"]) * 0.35}

        extendida = cerca = False
        for muneca in (mi, md):
            if not self._vis(muneca):
                continue
            if self._dist(muneca, torso_c) > self.EXT_ALCANCE * ancho_hombros:
                extendida = True
            d_cadera = min(self._dist(muneca, ci), self._dist(muneca, cd),
                           self._dist(muneca, caderas_c))
            d_pecho = self._dist(muneca, pecho_c)
            if d_cadera < self.CERCA_CUERPO * ancho_hombros or d_pecho < self.CERCA_CUERPO * ancho_hombros:
                cerca = True

        clave = (camara_id, int(t.id))
        m = self._maquinas.get(clave)
        if m is None:
            m = {"fase": "reposo", "t_alcance": 0, "t_cerca": 0,
                 "completado": False, "bonus": False}
            self._maquinas[clave] = m

        evento: dict | None = None
        if m["fase"] == "alcanzado":
            if cerca and not extendida:
                m["fase"] = "ocultando"
                m["t_cerca"] = ts_ms
                m["completado"] = False
                m["bonus"] = False
            elif extendida:
                m["t_alcance"] = ts_ms
            elif ts_ms - m["t_alcance"] > self.VENTANA_ALCANCE_MS:
                m["fase"] = "reposo"
        elif m["fase"] == "ocultando":
            if cerca:
                dwell = ts_ms - m["t_cerca"]
                if dwell >= self.DWELL_MS and not m["completado"]:
                    m["completado"] = True
                    evento = self._sumar(clave, self.PTS_CICLO, ts_ms) or evento
                if dwell >= self.DWELL_LARGO_MS and not m["bonus"]:
                    m["bonus"] = True
                    evento = self._sumar(clave, self.PTS_BONUS, ts_ms) or evento
            elif extendida:
                m["fase"] = "alcanzado"
                m["t_alcance"] = ts_ms
                m["completado"] = False
            else:
                m["fase"] = "reposo"
                m["completado"] = False
        else:  # 'reposo'
            if extendida:
                m["fase"] = "alcanzado"
                m["t_alcance"] = ts_ms
        return evento

    def _sumar(self, clave: tuple[str, int], delta: float, ts_ms: int) -> dict | None:
        """Suma sospecha (0-100) y, al cruzar el umbral, emite con cooldown 30 s."""
        nueva = min(100.0, max(0.0, self._puntos.get(clave, 0.0) + delta))
        self._puntos[clave] = nueva
        if nueva >= self.UMBRAL and (ts_ms - self._cooldown.get(clave, 0)) >= self.COOLDOWN_MS:
            self._cooldown[clave] = ts_ms
            return {
                "tipo": "ocultacion", "nivel_sugerido": "sospecha",
                "texto": ("Gesto de ocultación — revisar. Nunca acuses a nadie "
                          "basándote solo en esta alerta."),
                "track_id": clave[1], "puntuacion": round(nueva),
            }
        return None

    def _decaer(self, camara_id: str, ts_ms: int) -> None:
        """Decaimiento de la sospecha (~2 puntos/s), acotado a saltos razonables."""
        dt = ts_ms - (self._ultimo_ts or ts_ms)
        self._ultimo_ts = ts_ms
        if dt <= 0:
            return
        dt = min(dt, 2000)
        dec = (self.DECAIMIENTO_SPS / 1000.0) * dt
        for k in list(self._puntos):
            v = self._puntos[k] - dec
            if v <= 0:
                self._puntos[k] = 0.0
            else:
                self._puntos[k] = v

    # --- Utilidades ----------------------------------------------------------
    def _vis(self, p: dict) -> bool:
        return bool(p) and p.get("v", 1.0) >= self.VIS_MIN

    @staticmethod
    def _dist(a: dict, b: dict) -> float:
        return ((a["x"] - b["x"]) ** 2 + (a["y"] - b["y"]) ** 2) ** 0.5

    @staticmethod
    def _area(t: Any) -> float:
        x1, y1, x2, y2 = t.caja
        return max(0.0, (x2 - x1)) * max(0.0, (y2 - y1))

    def _prune(self, ts_ms: int) -> None:
        """Olvida estados de tracks no vistos en > 10 s."""
        muertos = [k for k, v in self._ultima_vez.items() if ts_ms - v > self.OLVIDO_MS]
        for k in muertos:
            self._ultima_vez.pop(k, None)
            self._puntos.pop(k, None)
            self._maquinas.pop(k, None)
            self._cooldown.pop(k, None)

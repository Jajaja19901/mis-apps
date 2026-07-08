"""Gestor multicámara: go2rtc + hilos lectores + hilo de inferencia + watchdog.

Arquitectura de hilos (agente 2 · CÁMARAS):

    go2rtc (subprocess)
        ▲  reinicia con backoff 2→30 s si muere
        │
    [hilo supervisor-go2rtc]  ── vuelca stdout/err a logging
    [hilo volcado-go2rtc]

    Por CADA cámara:
        [hilo lector-<cid>]  ── cv2.VideoCapture del RESTREAM de go2rtc
              │  cada frame:
              │    · evidencia.alimentar(cid, frame, ts)      (SIEMPRE)
              │    · ofrece el frame a la "cola fresca" (tamaño 1)
              │    · guarda JPEG de último frame (throttle 500 ms)
              │    · marca vida para el watchdog
              ▼
        cola fresca (tamaño 1)  ── si llega otro frame antes de inferir,
                                    se DESCARTA el anterior (el más rancio):
                                    la inferencia siempre ve el frame más nuevo.
              │
    [hilo inferencia]  (ÚNICO, compartido — la CPU es el recurso escaso)
        · planificador ponderado por prioridad (pri 3 recibe 3 ciclos por cada 1 de pri 1)
        · respeta fps_objetivo por cámara como tope (no infiere más rápido de lo pedido)
        · detector → analítica → (gestos si pri 3) → al_evento(cid, eventos, contexto)
        · publica bus 'deteccion.frame'

    [hilo watchdog]  ── sin frame >15 s ⇒ evento 'camara_caida' (una vez);
                        al volver ⇒ 'camara_recuperada'.

Colas y descartes:
  · "cola fresca" por cámara = 1 hueco. Se guarda SIEMPRE el último frame; el
    anterior no inferido se tira (lo más rancio). Así nunca acumulamos latencia.
  · No hay cola de inferencia global: el planificador tira del hueco fresco de
    la cámara a la que le toca turno.

Nada corre en import: todo arranca desde GestorCamaras.arrancar().
"""
from __future__ import annotations

import logging
import os
import subprocess
import threading
import time
from collections import deque
from typing import TYPE_CHECKING, Callable

import cv2  # solo importar; sin efectos secundarios
import yaml

from .bus import bus
from .configuracion import Config

if TYPE_CHECKING:  # evita acoplar en import con módulos de otros agentes
    from .analitica import Analitica
    from .detector import Detector
    from .estado import Estado
    from .evidencia import Evidencia
    from .gestos import Gestos

_log = logging.getLogger("vigia.camaras")

# --- constantes de temporización -------------------------------------------
_BACKOFF_MIN = 2.0          # s, reconexión / reinicio
_BACKOFF_MAX = 30.0         # s
_WATCHDOG_SEG = 15.0        # sin frame más de esto ⇒ cámara caída
_JPEG_THROTTLE = 0.5        # s entre codificaciones del "último frame" JPEG
_VENTANA_FPS = 10.0         # s de ventana móvil para fps_real
_AUTO_SEG = 10.0            # s de medición inicial para auto-detección de hardware
_JPEG_CALIDAD = 80          # calidad del JPEG servido por /frame
_JPEG_ANCHO_MAX = 1280      # px; se reescala el frame antes de servir /frame


class _EstadoCam:
    """Estado vivo de una cámara (protegido por su propio lock)."""

    def __init__(self, cfg_cam) -> None:
        self.id: str = cfg_cam.id
        self.nombre: str = cfg_cam.nombre
        self.modo: str = cfg_cam.modo
        self.prioridad: int = cfg_cam.prioridad
        self.fps_objetivo: float = cfg_cam.fps_objetivo
        self.fps_efectivo: float = cfg_cam.fps_objetivo  # lo baja la auto-detección
        self.ignorar_mascotas: bool = cfg_cam.ignorar_mascotas

        self.lock = threading.Lock()
        # "cola fresca" de tamaño 1: (frame, ts_ms) o None
        self._fresco: tuple | None = None
        # último frame JPEG (para GET /frame) + throttle
        self.ultimo_jpeg: bytes | None = None
        self.ultimo_frame_ts: int = 0
        self._ultimo_encode_mono: float = 0.0
        self.dimensiones: tuple | None = None  # (w, h)

        # watchdog / conectividad
        self.conectada: bool = False
        self.caida_notificada: bool = False
        self.ultimo_frame_mono: float = time.monotonic()

        # planificador / medición
        self.ultima_inferencia_mono: float = 0.0
        self._sellos_inferencia: deque = deque()  # monotonic de cada inferencia (ventana 10 s)

    # -- cola fresca --------------------------------------------------------
    def ofrecer(self, frame, ts_ms: int) -> None:
        """Deja el frame en el hueco fresco; descarta el anterior no inferido."""
        with self.lock:
            self._fresco = (frame, ts_ms)

    def tomar_fresco(self) -> tuple | None:
        with self.lock:
            f = self._fresco
            self._fresco = None
            return f

    # -- vida / watchdog ----------------------------------------------------
    def marcar_frame(self, mono: float) -> bool:
        """Registra que llegó un frame. Devuelve True si venía de estar caída."""
        with self.lock:
            era_caida = self.caida_notificada
            self.conectada = True
            self.caida_notificada = False
            self.ultimo_frame_mono = mono
            return era_caida

    # -- medición fps_real --------------------------------------------------
    def registrar_inferencia(self, mono: float) -> None:
        with self.lock:
            self._sellos_inferencia.append(mono)
            limite = mono - _VENTANA_FPS
            while self._sellos_inferencia and self._sellos_inferencia[0] < limite:
                self._sellos_inferencia.popleft()
            self.ultima_inferencia_mono = mono

    def fps_real(self) -> float:
        with self.lock:
            ahora = time.monotonic()
            limite = ahora - _VENTANA_FPS
            while self._sellos_inferencia and self._sellos_inferencia[0] < limite:
                self._sellos_inferencia.popleft()
            return round(len(self._sellos_inferencia) / _VENTANA_FPS, 2)

    # -- JPEG de último frame ----------------------------------------------
    def quizas_jpeg(self, frame, ts_ms: int) -> None:
        """Codifica el frame a JPEG como máximo cada _JPEG_THROTTLE segundos."""
        ahora = time.monotonic()
        if ahora - self._ultimo_encode_mono < _JPEG_THROTTLE:
            return
        try:
            img = frame
            h, w = img.shape[:2]
            if w > _JPEG_ANCHO_MAX:
                escala = _JPEG_ANCHO_MAX / float(w)
                img = cv2.resize(img, (_JPEG_ANCHO_MAX, max(1, int(h * escala))))
            ok, buf = cv2.imencode(".jpg", img, [int(cv2.IMWRITE_JPEG_QUALITY), _JPEG_CALIDAD])
            if not ok:
                return
            with self.lock:
                self.ultimo_jpeg = buf.tobytes()
                self.ultimo_frame_ts = ts_ms
                if self.dimensiones is None:
                    self.dimensiones = (int(w), int(h))
            self._ultimo_encode_mono = ahora
        except Exception as e:  # nunca tumbar el hilo lector por un JPEG
            _log.debug("cam %s: fallo al codificar JPEG: %s", self.id, e)


def _contexto_para_alertas(camara_id: str, analitica, tracks: list, ts_ms: int) -> dict:
    """Contexto que consume alertas.procesar (contrato: dict con tracks/ts/celdas_calor).

    celdas_calor es la referencia VIVA de analitica.calor_pendiente: alertas la
    copia y la vacía cuando persiste (throttle 60 s); entre persistencias la
    analítica sigue acumulando ahí, sin pérdidas ni dobles conteos.
    """
    aforo = getattr(analitica, "aforo_actual", None)
    try:
        aforo_val = int(aforo()) if callable(aforo) else int(aforo or 0)
    except Exception:
        aforo_val = 0
    return {
        "camara_id": camara_id,
        "ts": ts_ms,
        "tracks": tracks,
        "aforo_actual": aforo_val,
        "celdas_calor": getattr(analitica, "calor_pendiente", None),
    }


class GestorCamaras:
    """Orquesta go2rtc, los hilos lectores y el hilo único de inferencia."""

    def __init__(
        self,
        cfg: Config,
        detector: "Detector",
        analiticas: "dict[str, Analitica]",
        gestos: "Gestos",
        evidencia: "Evidencia",
        al_evento: Callable[[str, list, object], None],
        estado: "Estado | None" = None,
    ) -> None:
        self.cfg = cfg
        self._detector = detector
        self._analiticas = analiticas
        self._gestos = gestos
        self._evidencia = evidencia
        self._al_evento = al_evento
        self._estado = estado  # opcional; para el campo 'armada' de resumen()

        self._estados: dict[str, _EstadoCam] = {c.id: _EstadoCam(c) for c in cfg.camaras}
        self._agenda: list[str] = []  # lista ponderada por prioridad para el planificador

        self._corriendo = False
        self._proc: subprocess.Popen | None = None
        self._hilos: list[threading.Thread] = []
        self._ruta_yaml = "go2rtc.yaml"

        # auto-detección de hardware
        self._ms_infer = 0.0          # media móvil de ms por inferencia
        self._factor_hw = 1.0         # factor aplicado a fps_efectivo tras medir
        self._auto_hecha = False

    # === go2rtc ============================================================
    def generar_go2rtc_yaml(self) -> None:
        """Escribe go2rtc.yaml con un stream por cámara + api/rtsp de config."""
        streams: dict[str, list[str]] = {}
        for c in self.cfg.camaras:
            url = c.rtsp
            # ffmpeg:/exec: (cámaras falsas de prueba) se pasan tal cual
            streams[c.id] = [url]
        datos = {
            "api": {"listen": f":{self.cfg.go2rtc.puerto_api}"},
            "rtsp": {"listen": f":{self.cfg.go2rtc.puerto_rtsp}"},
            "streams": streams,
        }
        with open(self._ruta_yaml, "w", encoding="utf-8") as f:
            yaml.safe_dump(datos, f, allow_unicode=True, sort_keys=False)
        _log.info("go2rtc.yaml escrito con %d cámara(s)", len(streams))

    def _lanzar_go2rtc(self) -> None:
        binario = self.cfg.go2rtc.binario
        self._proc = subprocess.Popen(
            [binario, "-config", self._ruta_yaml],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            bufsize=1,
            text=True,
        )
        _log.info("go2rtc lanzado (pid=%s)", self._proc.pid)
        threading.Thread(
            target=self._volcar_salida, args=(self._proc,),
            name="volcado-go2rtc", daemon=True,
        ).start()

    def _volcar_salida(self, proc: subprocess.Popen) -> None:
        """Vuelca stdout/err de go2rtc a logging (nunca print)."""
        try:
            if proc.stdout is None:
                return
            for linea in proc.stdout:
                _log.debug("[go2rtc] %s", linea.rstrip())
        except Exception:
            pass

    def _bucle_supervisor(self) -> None:
        """Reinicia go2rtc con backoff si muere mientras corremos."""
        backoff = _BACKOFF_MIN
        while self._corriendo:
            proc = self._proc
            if proc is None:
                self._dormir(1.0)
                continue
            ret = proc.poll()
            if ret is None:
                backoff = _BACKOFF_MIN
                self._dormir(1.0)
                continue
            if not self._corriendo:
                return
            _log.warning("go2rtc murió (código=%s); reinicio en %.0fs", ret, backoff)
            self._dormir(backoff)
            backoff = min(_BACKOFF_MAX, backoff * 2)
            if not self._corriendo:
                return
            try:
                self._lanzar_go2rtc()
            except Exception as e:
                _log.error("no se pudo relanzar go2rtc: %s", e)

    # === arranque / parada ================================================
    def arrancar(self) -> None:
        """Escribe el yaml, lanza go2rtc y arranca lectores + inferencia + watchdog."""
        self._corriendo = True
        self.generar_go2rtc_yaml()
        try:
            self._lanzar_go2rtc()
        except FileNotFoundError:
            _log.error("no se encontró el binario go2rtc en '%s' (¿instalar.sh?)",
                       self.cfg.go2rtc.binario)
        except Exception as e:
            _log.error("no se pudo lanzar go2rtc: %s", e)

        self._agenda = self._construir_agenda()

        # supervisor de go2rtc
        self._arrancar_hilo(self._bucle_supervisor, "supervisor-go2rtc")
        # un lector por cámara
        for cid in self._estados:
            self._arrancar_hilo(self._bucle_lector, f"lector-{cid}", args=(cid,))
        # un único hilo de inferencia
        self._arrancar_hilo(self._bucle_inferencia, "inferencia")
        # watchdog
        self._arrancar_hilo(self._bucle_watchdog, "watchdog-camaras")
        _log.info("GestorCamaras arrancado: %d lector(es), 1 inferencia, 1 watchdog",
                  len(self._estados))

    def _construir_agenda(self) -> list[str]:
        """Lista ponderada: cada cámara aparece 'prioridad' veces (planificador 3:1)."""
        agenda: list[str] = []
        for cid, st in self._estados.items():
            agenda.extend([cid] * max(1, st.prioridad))
        return agenda

    def _arrancar_hilo(self, fn, nombre: str, args: tuple = ()) -> None:
        h = threading.Thread(target=fn, args=args, name=nombre, daemon=True)
        h.start()
        self._hilos.append(h)

    def _dormir(self, seg: float) -> None:
        """Sleep troceado para responder rápido a parar()."""
        fin = time.monotonic() + seg
        while self._corriendo:
            resto = fin - time.monotonic()
            if resto <= 0:
                return
            time.sleep(min(0.2, resto))

    def parar(self) -> None:
        """Señala a los hilos y termina go2rtc."""
        _log.info("parando GestorCamaras…")
        self._corriendo = False
        proc = self._proc
        if proc is not None:
            try:
                proc.terminate()
                try:
                    proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    proc.kill()
            except Exception as e:
                _log.warning("al terminar go2rtc: %s", e)
        for h in self._hilos:
            h.join(timeout=3)
        _log.info("GestorCamaras parado")

    # === hilo lector (por cámara) =========================================
    def _bucle_lector(self, cid: str) -> None:
        st = self._estados[cid]
        # MODO PRUEBA sin go2rtc (decisión del integrador, ver pruebas/camara_falsa.sh):
        # si el campo rtsp de la cámara es un ARCHIVO local existente, se lee
        # directamente en bucle con la cadencia del propio vídeo.
        camcfg = self.cfg.camara(cid)
        es_archivo = bool(camcfg and camcfg.rtsp and os.path.isfile(camcfg.rtsp))
        url = camcfg.rtsp if es_archivo else \
            f"rtsp://127.0.0.1:{self.cfg.go2rtc.puerto_rtsp}/{cid}"
        if es_archivo:
            _log.info("cam %s: MODO ARCHIVO (prueba) — %s", cid, url)
        backoff = _BACKOFF_MIN
        while self._corriendo:
            cap = cv2.VideoCapture(url) if es_archivo else cv2.VideoCapture(url, cv2.CAP_FFMPEG)
            paso_archivo = 0.1
            if es_archivo:
                try:
                    fps_arch = cap.get(cv2.CAP_PROP_FPS) or 10
                    paso_archivo = 1.0 / max(1.0, min(30.0, fps_arch))
                except Exception:
                    pass
            try:
                cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)  # menos latencia
            except Exception:
                pass
            if not cap.isOpened():
                try:
                    cap.release()
                except Exception:
                    pass
                _log.warning("cam %s: no abre restream, reintento en %.0fs", cid, backoff)
                self._dormir(backoff)
                backoff = min(_BACKOFF_MAX, backoff * 2)
                continue
            _log.info("cam %s: leyendo restream de go2rtc", cid)
            backoff = _BACKOFF_MIN
            fallos = 0
            while self._corriendo:
                ok, frame = cap.read()
                if not ok or frame is None:
                    if es_archivo:  # fin del archivo ⇒ rebobinar (bucle)
                        break
                    fallos += 1
                    if fallos > 30:  # ~1.5 s de fallos seguidos ⇒ reconectar
                        break
                    time.sleep(0.05)
                    continue
                fallos = 0
                if es_archivo:
                    time.sleep(paso_archivo)  # cadencia real del vídeo
                ts = int(time.time() * 1000)

                # 1) evidencia SIEMPRE (buffer circular para clips)
                try:
                    self._evidencia.alimentar(cid, frame, ts)
                except Exception as e:
                    _log.warning("cam %s: evidencia.alimentar falló: %s", cid, e)

                # 2) hueco fresco para la inferencia (descarta el anterior)
                st.ofrecer(frame, ts)

                # 3) JPEG de último frame (throttle 500 ms)
                st.quizas_jpeg(frame, ts)

                # 4) vida / recuperación
                if st.marcar_frame(time.monotonic()):
                    self._notificar_recuperada(cid)
            try:
                cap.release()
            except Exception:
                pass
            if self._corriendo:
                _log.warning("cam %s: flujo interrumpido, reconecto en %.0fs", cid, backoff)
                self._dormir(backoff)
                backoff = min(_BACKOFF_MAX, backoff * 2)

    def _notificar_recuperada(self, cid: str) -> None:
        st = self._estados[cid]
        _log.info("cam %s: señal recuperada", cid)
        try:
            self._al_evento(cid, [{
                "tipo": "camara_recuperada",
                "nivel_sugerido": "info",
                "texto": f"Cámara {st.nombre} recuperada",
            }], None)
        except Exception as e:
            _log.warning("cam %s: al_evento(recuperada) falló: %s", cid, e)
        bus.publicar("camara.estado", {"camara_id": cid, "conectada": True, "fps": st.fps_real()})

    # === hilo watchdog =====================================================
    def _bucle_watchdog(self) -> None:
        while self._corriendo:
            ahora = time.monotonic()
            for cid, st in self._estados.items():
                with st.lock:
                    caido = (not st.caida_notificada
                             and (ahora - st.ultimo_frame_mono) > _WATCHDOG_SEG)
                    if caido:
                        st.caida_notificada = True
                        st.conectada = False
                if caido:
                    _log.warning("cam %s: sin señal >%.0fs ⇒ cámara caída", cid, _WATCHDOG_SEG)
                    try:
                        self._al_evento(cid, [{
                            "tipo": "camara_caida",
                            "nivel_sugerido": "critico",
                            "texto": f"Cámara {st.nombre} sin señal",
                        }], None)
                    except Exception as e:
                        _log.warning("cam %s: al_evento(caida) falló: %s", cid, e)
                    bus.publicar("camara.estado", {"camara_id": cid, "conectada": False, "fps": 0.0})
            self._dormir(1.0)

    # === hilo de inferencia (único) =======================================
    def _bucle_inferencia(self) -> None:
        """Planificador ponderado con tope de fps por cámara; medición + auto-detección."""
        inicio = time.monotonic()
        idx = 0
        saltos = 0
        agenda = self._agenda
        while self._corriendo:
            if not agenda:
                self._dormir(0.5)
                continue

            # auto-detección de hardware tras la ventana inicial
            if not self._auto_hecha and (time.monotonic() - inicio) > _AUTO_SEG:
                self._auto_detectar_hardware()

            cid = agenda[idx % len(agenda)]
            idx += 1
            st = self._estados[cid]
            ahora = time.monotonic()

            # tope por fps_efectivo: no inferir más rápido de lo pedido
            intervalo = 1.0 / max(0.1, st.fps_efectivo)
            if (ahora - st.ultima_inferencia_mono) < intervalo:
                saltos += 1
                if saltos >= len(agenda):  # nada listo en toda la vuelta
                    saltos = 0
                    self._dormir(0.01)
                continue

            par = st.tomar_fresco()
            if par is None:  # sin frame nuevo aún
                saltos += 1
                if saltos >= len(agenda):
                    saltos = 0
                    self._dormir(0.01)
                continue
            saltos = 0
            frame, ts = par
            self._inferir(cid, st, frame, ts)

    def _inferir(self, cid: str, st: _EstadoCam, frame, ts: int) -> None:
        t0 = time.perf_counter()
        eventos: list = []
        try:
            tracks = self._detector.procesar(cid, frame, ts)
        except Exception as e:
            _log.warning("cam %s: detector.procesar falló: %s", cid, e)
            return

        analitica = self._analiticas.get(cid)
        if analitica is not None:
            try:
                eventos = analitica.evaluar(tracks, ts, frame.shape)
            except Exception as e:
                _log.warning("cam %s: analitica.evaluar falló: %s", cid, e)
                eventos = []

        # gestos: solo prioridad 3 y si hay personas
        if self._gestos is not None and st.prioridad == 3:
            tracks_persona = [t for t in tracks if getattr(t, "clase", None) == "person"]
            if tracks_persona:
                try:
                    extra = self._gestos.procesar(cid, frame, tracks_persona, ts)
                    if extra:
                        eventos = list(eventos) + list(extra)
                except Exception as e:
                    _log.warning("cam %s: gestos.procesar falló: %s", cid, e)

        # medición
        dt_ms = (time.perf_counter() - t0) * 1000.0
        self._ms_infer = dt_ms if self._ms_infer == 0.0 else (0.9 * self._ms_infer + 0.1 * dt_ms)
        st.registrar_inferencia(time.monotonic())

        # entrega a quien procese (alertas)
        contexto = _contexto_para_alertas(cid, analitica, tracks, ts)
        try:
            self._al_evento(cid, eventos, contexto)
        except Exception as e:
            _log.warning("cam %s: al_evento(inferencia) falló: %s", cid, e)

        n_tracks = len(tracks) if tracks is not None else 0
        bus.publicar("deteccion.frame", {"camara_id": cid, "ts": ts, "n_tracks": n_tracks})

    def _auto_detectar_hardware(self) -> None:
        """Fija fps efectivos sostenibles según los ms/inferencia medidos."""
        self._auto_hecha = True
        ms = self._ms_infer
        if ms <= 0.0:
            _log.info("auto-detección: sin medidas aún, no se ajusta")
            return
        sostenible = 1000.0 / ms  # inferencias/s que aguanta la CPU
        suma_objetivo = sum(st.fps_objetivo for st in self._estados.values())
        if suma_objetivo <= sostenible or suma_objetivo <= 0:
            self._factor_hw = 1.0
            _log.info("Hardware sostiene ~%.1f inferencias/s; suma pedida %.1f fps: sin recorte",
                      sostenible, suma_objetivo)
            return
        self._factor_hw = sostenible / suma_objetivo
        _log.warning("Hardware sostiene ~%.1f inferencias/s; recorto fps efectivos (factor %.2f)",
                     sostenible, self._factor_hw)
        for st in self._estados.values():
            st.fps_efectivo = max(0.2, st.fps_objetivo * self._factor_hw)
            _log.info("Hardware sostiene ~%.1f inferencias/s; cámara %s a %.2f fps efectivos",
                      sostenible, st.id, st.fps_efectivo)

    # === API pública para la capa superior ================================
    def resumen(self) -> list[dict]:
        """Resumen por cámara para GET /estado."""
        salida: list[dict] = []
        for cid, st in self._estados.items():
            if self._estado is not None:
                try:
                    armada = self._estado.armado_camara(cid)
                except Exception:
                    armada = True
            else:
                cam = self.cfg.camara(cid)
                armada = cam.armada if cam is not None else True
            with st.lock:
                conectada = st.conectada
                ultimo_ts = st.ultimo_frame_ts
            salida.append({
                "id": cid,
                "nombre": st.nombre,
                "modo": st.modo,
                "prioridad": st.prioridad,
                "conectada": conectada,
                "armada": armada,
                "fps_real": st.fps_real(),
                "fps_objetivo": st.fps_objetivo,
                "ultimo_frame_ts": ultimo_ts,
                "ignorar_mascotas": st.ignorar_mascotas,
            })
        return salida

    def ultimo_frame_jpeg(self, camara_id: str) -> bytes | None:
        st = self._estados.get(camara_id)
        if st is None:
            return None
        with st.lock:
            return st.ultimo_jpeg

    def dimensiones(self, camara_id: str) -> tuple | None:
        st = self._estados.get(camara_id)
        if st is None:
            return None
        with st.lock:
            return st.dimensiones

    def aplicar_config(self, cambios: dict) -> None:
        """Aplica en caliente fps_objetivo / ignorar_mascotas por cámara."""
        for cam in (cambios or {}).get("camaras", []) or []:
            cid = cam.get("id")
            st = self._estados.get(cid)
            if st is None:
                continue
            cfg_cam = self.cfg.camara(cid)
            if "fps_objetivo" in cam:
                try:
                    nuevo = max(0.5, min(15.0, float(cam["fps_objetivo"])))
                    st.fps_objetivo = nuevo
                    st.fps_efectivo = max(0.2, nuevo * self._factor_hw)
                    if cfg_cam is not None:
                        cfg_cam.fps_objetivo = nuevo
                    _log.info("cam %s: fps_objetivo=%.2f (efectivo %.2f)", cid, nuevo, st.fps_efectivo)
                except (TypeError, ValueError):
                    _log.warning("cam %s: fps_objetivo inválido: %r", cid, cam.get("fps_objetivo"))
            if "ignorar_mascotas" in cam:
                val = bool(cam["ignorar_mascotas"])
                st.ignorar_mascotas = val
                if cfg_cam is not None:
                    cfg_cam.ignorar_mascotas = val
                _log.info("cam %s: ignorar_mascotas=%s", cid, val)

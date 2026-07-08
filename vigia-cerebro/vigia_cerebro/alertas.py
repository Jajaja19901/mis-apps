"""Decide si un evento parcial de la analítica se convierte en alerta real.

Responsabilidades (CONTRATOS-API.md §8 · 5):
  - Eventos "silenciosos" (`cruce`, `plaza_cambio`): no son alertas, solo alimentan los
    agregados por hora/cámara (visitantes, entradas, salidas, veh_*...).
  - Filtro de mascotas: `animal` con `ignorar_mascotas` activo en la cámara se guarda en
    BD como silenciado, sin ruido de ningún tipo (ni sonido, ni Telegram, ni WS).
  - Armado: cualquier persona detectada con el sistema armado genera, ADEMÁS del resto,
    una alerta sintética `armado_intrusion` (crítica), con su propio cooldown de 60 s.
  - Cooldown general de 30 s por (cámara, tipo, track) para no repetir la misma alerta.
  - Si la alerta procede: registro (forma REGISTRO §6), miniatura a disco, guardado en
    almacén, publicación en el bus, contador de nivel, petición de clip y cola de Telegram
    (solo sospecha/crítico).

Nota de integración: `almacen` y `evidencia` los escriben otros agentes en paralelo y no
existen todavía en el árbol al escribir este módulo, así que se tratan como colaboradores
"duck-typed" (sin import directo) con el interfaz descrito en el contrato:
  - almacen.guardar_evento(registro: dict) -> None
  - almacen.incrementar(dia: str, hora: int, camara_id: str, clave: str, n: int) -> None
  - almacen.sumar_calor(dia: str, camara_id: str, celdas: dict[int, int]) -> None
  - almacen.actualizar_clip(evento_id: str, ruta: str | None) -> None
  - almacen.kv_get(clave: str) -> str | None / almacen.kv_set(clave: str, valor: str) -> None
  - evidencia.miniatura_de_frame_actual(camara_id: str) -> bytes | None
  - evidencia.grabar_evento(evento_id: str, camara_id: str) -> None
El `registro` que se guarda/publica lleva TODAS las claves que pueden necesitar los
consumidores (forma REGISTRO §6 para el bus/WS + `miniatura_ruta`/`clip_ruta`/`silenciada`
para la fila de la tabla `eventos`); claves de más no deberían romper a nadie.
"""
from __future__ import annotations

import logging
import time
from datetime import datetime
from pathlib import Path
from threading import RLock
from typing import Any

from .bus import bus
from .configuracion import CamaraCfg, Config
from .estado import Estado

_log = logging.getLogger("vigia.alertas")

_COOLDOWN_GENERAL_SEG = 30.0
_COOLDOWN_ARMADO_SEG = 60.0
_THROTTLE_CALOR_SEG = 60.0
_MAX_ENTRADAS_COOLDOWN = 5000  # poda oportunista para no crecer sin límite

_TIPOS_VEHICULO = {"car", "truck", "bus", "motorcycle", "bicycle"}

# Tipos "silenciosos": no son alertas, solo agregados.
_TIPOS_AGREGADO = {"cruce", "plaza_cambio"}


class Alertas:
    """Recibe eventos parciales de la analítica y decide si se convierten en alerta."""

    def __init__(self, cfg: Config, estado: Estado, almacen: Any, evidencia: Any, telegram: Any) -> None:
        self._cfg = cfg
        self._estado = estado
        self._almacen = almacen
        self._evidencia = evidencia
        self._telegram = telegram

        self._lock = RLock()
        self._cooldowns: dict[tuple[str, str, int | None], float] = {}
        self._cooldown_armado: dict[str, float] = {}
        self._calor_ultimo: dict[str, float] = {}

        bus.suscribir("evento.clip_listo", self._on_clip_listo)

    # ------------------------------------------------------------------ API
    def procesar(self, camara_id: str, eventos_parciales: list[dict], contexto: dict | None = None) -> None:
        """Procesa los eventos parciales de UN frame de UNA cámara.

        `contexto` (opcional, puede llegar vacío) lo arma `camaras.py`/`analitica.py` con:
          - "ts": epoch ms del frame (si falta, se usa la hora actual).
          - "tracks": lista de tracks (dict u objeto con atributo/clave "clase") vivos en
            el frame; se usa solo para detectar presencia de personas (armado).
          - "celdas_calor": dict {celda:int -> incremento:int} pendiente de volcar al
            mapa de calor de esta cámara (rejilla 48x27, celda = fila*48+col).
        """
        contexto = contexto or {}
        camara_cfg = self._cfg.camara(camara_id)
        camara_nombre = camara_cfg.nombre if camara_cfg else camara_id
        ts = self._ts_de(contexto)

        for evento in eventos_parciales or []:
            try:
                self._procesar_uno(camara_id, camara_nombre, camara_cfg, evento, ts)
            except Exception:  # noqa: BLE001 — una cámara nunca debe tumbar el cerebro
                _log.exception("fallo procesando evento parcial de %s: %r", camara_id, evento)

        try:
            if self._hay_persona(contexto) and self._estado.esta_armada_ahora(camara_id):
                self._generar_armado_intrusion(camara_id, camara_nombre, ts)
        except Exception:
            _log.exception("fallo evaluando armado_intrusion en %s", camara_id)

        try:
            self._persistir_calor(camara_id, contexto, ts)
        except Exception:
            _log.exception("fallo persistiendo mapa de calor de %s", camara_id)

    # ------------------------------------------------------------ internos
    def _procesar_uno(
        self,
        camara_id: str,
        camara_nombre: str,
        camara_cfg: CamaraCfg | None,
        evento: dict,
        ts: int,
    ) -> None:
        tipo = str(evento.get("tipo", ""))

        if tipo in _TIPOS_AGREGADO:
            self._agregar_cruce(camara_id, evento, ts)
            return

        if tipo == "animal" and camara_cfg is not None and camara_cfg.ignorar_mascotas:
            self._guardar_silenciado(camara_id, camara_nombre, evento, ts)
            return

        track_id = evento.get("track_id")
        clave_cd = (camara_id, tipo, track_id)
        ahora = time.monotonic()
        with self._lock:
            self._podar_cooldowns(ahora)
            ultimo = self._cooldowns.get(clave_cd, 0.0)
            if ahora - ultimo < _COOLDOWN_GENERAL_SEG:
                _log.debug("evento '%s' de %s en cooldown (track=%s)", tipo, camara_id, track_id)
                return
            self._cooldowns[clave_cd] = ahora

        self._generar_alerta(camara_id, camara_nombre, evento, ts)

    def _podar_cooldowns(self, ahora: float) -> None:
        """Evita que el diccionario de cooldowns crezca sin límite en sesiones largas."""
        if len(self._cooldowns) <= _MAX_ENTRADAS_COOLDOWN:
            return
        limite = ahora - (10 * _COOLDOWN_GENERAL_SEG)
        for clave, ultimo in list(self._cooldowns.items()):
            if ultimo < limite:
                del self._cooldowns[clave]

    def _agregar_cruce(self, camara_id: str, evento: dict, ts: int) -> None:
        """Eventos silenciosos (cruce/plaza_cambio): solo alimentan agregados por hora."""
        dia, hora = self._dia_hora(ts)
        clave = self._clave_agregado(evento)
        if not clave:
            _log.debug(
                "cruce sin clave de agregado reconocible en %s (clase=%s, sentido=%s)",
                camara_id, evento.get("clase"), evento.get("sentido"),
            )
            return
        self._almacen.incrementar(dia, hora, camara_id, clave, 1)

    @staticmethod
    def _clave_agregado(evento: dict) -> str | None:
        """Deduce la clave de `agregados` (§8.3) según la clase y el sentido del cruce."""
        clase = str(evento.get("clase", "person"))
        sentido = str(evento.get("sentido", ""))
        if clase == "person":
            if sentido == "entrada":
                return "entradas"
            if sentido == "salida":
                return "salidas"
            return "peatones"
        if clase in _TIPOS_VEHICULO:
            return f"veh_{clase}"
        return None

    def _guardar_silenciado(self, camara_id: str, camara_nombre: str, evento: dict, ts: int) -> None:
        """`animal` con `ignorar_mascotas`: se guarda en BD pero no genera ruido alguno."""
        evento_id = self._siguiente_id()
        registro = self._construir_registro(evento_id, camara_id, camara_nombre, evento, ts, nivel="info")
        registro["silenciada"] = 1
        self._almacen.guardar_evento(registro)
        _log.info("evento 'animal' silenciado por ignorar_mascotas en %s (%s)", camara_id, evento_id)
        # Deliberado: NADA de bus.publicar, contadores de alerta, clip ni Telegram.

    def _generar_alerta(self, camara_id: str, camara_nombre: str, evento: dict, ts: int) -> None:
        evento_id = self._siguiente_id()
        nivel = str(evento.get("nivel_sugerido", "info"))
        registro = self._construir_registro(evento_id, camara_id, camara_nombre, evento, ts, nivel=nivel)

        ruta_miniatura = self._guardar_miniatura(camara_id, evento_id, ts)
        registro["miniatura"] = bool(ruta_miniatura)
        registro["miniatura_ruta"] = ruta_miniatura

        self._almacen.guardar_evento(registro)
        bus.publicar("evento.nuevo", {"registro": registro})

        dia, hora = self._dia_hora(ts)
        self._almacen.incrementar(dia, hora, camara_id, f"alerta_{nivel}", 1)

        if nivel in ("sospecha", "critico"):
            try:
                self._evidencia.grabar_evento(evento_id, camara_id)
            except Exception:
                _log.exception("fallo pidiendo clip para %s", evento_id)
            try:
                self._telegram.encolar_alerta(registro)
            except Exception:
                _log.exception("fallo encolando alerta de Telegram para %s", evento_id)

    def _generar_armado_intrusion(self, camara_id: str, camara_nombre: str, ts: int) -> None:
        ahora = time.monotonic()
        with self._lock:
            ultimo = self._cooldown_armado.get(camara_id, 0.0)
            if ahora - ultimo < _COOLDOWN_ARMADO_SEG:
                return
            self._cooldown_armado[camara_id] = ahora

        evento = {
            "tipo": "armado_intrusion",
            "nivel_sugerido": "critico",
            "texto": f"Persona detectada con el sistema ARMADO ({camara_nombre})",
            "track_id": None,
        }
        self._generar_alerta(camara_id, camara_nombre, evento, ts)

    def _guardar_miniatura(self, camara_id: str, evento_id: str, ts: int) -> str | None:
        try:
            datos_jpg = self._evidencia.miniatura_de_frame_actual(camara_id)
        except Exception:
            _log.exception("fallo obteniendo miniatura de %s", camara_id)
            return None
        if not datos_jpg:
            return None
        fecha = self._dia_hora(ts)[0]
        carpeta = Path(self._cfg.evidencia.carpeta) / fecha
        try:
            carpeta.mkdir(parents=True, exist_ok=True)
            ruta = carpeta / f"{evento_id}.jpg"
            ruta.write_bytes(datos_jpg)
            return str(ruta)
        except OSError:
            _log.exception("fallo guardando miniatura de %s en disco", evento_id)
            return None

    def _persistir_calor(self, camara_id: str, contexto: dict, ts: int) -> None:
        celdas = contexto.get("celdas_calor")
        if not celdas:
            return
        ahora = time.monotonic()
        with self._lock:
            ultimo = self._calor_ultimo.get(camara_id, 0.0)
            if ahora - ultimo < _THROTTLE_CALOR_SEG:
                return
            self._calor_ultimo[camara_id] = ahora
        dia = self._dia_hora(ts)[0]
        self._almacen.sumar_calor(dia, camara_id, celdas)

    def _on_clip_listo(self, datos: dict) -> None:
        """Suscripción a bus 'evento.clip_listo' {evento_id, ruta}."""
        evento_id = datos.get("evento_id")
        ruta = datos.get("ruta")
        if not evento_id:
            _log.warning("evento.clip_listo sin evento_id: %r", datos)
            return
        try:
            self._almacen.actualizar_clip(evento_id, ruta)
        except Exception:
            _log.exception("fallo actualizando clip_ruta de %s", evento_id)
        try:
            self._telegram.encolar_clip(evento_id, ruta)
        except Exception:
            _log.exception("fallo encolando clip de Telegram para %s", evento_id)

    # ------------------------------------------------------------- ayudas
    def _siguiente_id(self) -> str:
        """Contador monotónico de eventos persistido en kv, protegido por lock propio."""
        with self._lock:
            actual = self._almacen.kv_get("contador_eventos")
            try:
                n = int(actual) if actual else 0
            except (TypeError, ValueError):
                n = 0
            n += 1
            self._almacen.kv_set("contador_eventos", str(n))
            return f"e{n}"

    @staticmethod
    def _construir_registro(
        evento_id: str, camara_id: str, camara_nombre: str, evento: dict, ts: int, nivel: str,
    ) -> dict:
        return {
            "id": evento_id,
            "ts": ts,
            "camara_id": camara_id,
            "camara_nombre": camara_nombre,
            "tipo": str(evento.get("tipo", "")),
            "nivel": nivel,
            "texto": str(evento.get("texto", "")),
            "track_id": evento.get("track_id"),
            "miniatura": False,
            "clip": False,
            "miniatura_ruta": None,
            "clip_ruta": None,
            "silenciada": 0,
        }

    @staticmethod
    def _hay_persona(contexto: dict) -> bool:
        for track in contexto.get("tracks") or []:
            clase = track.get("clase") if isinstance(track, dict) else getattr(track, "clase", None)
            if clase == "person":
                return True
        return False

    @staticmethod
    def _ts_de(contexto: dict) -> int:
        ts = contexto.get("ts")
        if isinstance(ts, (int, float)) and ts > 0:
            return int(ts)
        return int(time.time() * 1000)

    @staticmethod
    def _dia_hora(ts_ms: int) -> tuple[str, int]:
        d = datetime.fromtimestamp(ts_ms / 1000)
        return d.strftime("%Y-%m-%d"), d.hour

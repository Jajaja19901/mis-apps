"""Rotación de disco de la evidencia: borra los clips más antiguos al superar el límite.

Hilo daemon que cada 10 minutos comprueba el tamaño de `evidencia.carpeta`; si supera
`limite_gb`, borra los clips (.mp4) más antiguos por fecha de modificación —y su .jpg
hermano— hasta bajar al 90% del límite, y avisa al almacén para que deje de ofrecer
la descarga de esos clips ya borrados.
"""
from __future__ import annotations

import logging
import threading
from pathlib import Path
from typing import Any

from .configuracion import Config

_log = logging.getLogger("vigia.retencion")

_INTERVALO_SEG = 10 * 60  # 10 minutos
_OBJETIVO_FRACCION = 0.9  # baja al 90% del límite al rotar


class Retencion:
    """Vigila `datos/clips` y borra lo más viejo cuando se pasa del límite configurado."""

    def __init__(self, cfg: Config, almacen: Any) -> None:
        self._cfg = cfg
        self._almacen = almacen
        self._carpeta = Path(cfg.evidencia.carpeta).resolve()
        self._limite_bytes = float(cfg.evidencia.limite_gb) * (1024 ** 3)
        self._objetivo_bytes = self._limite_bytes * _OBJETIVO_FRACCION

        self._parar_evt = threading.Event()
        self._hilo: threading.Thread | None = None

    # ------------------------------------------------------------------ API
    def arrancar(self) -> None:
        """Lanza el hilo daemon de retención (no hace nada si ya estaba arrancado)."""
        if self._hilo is not None and self._hilo.is_alive():
            return
        self._parar_evt.clear()
        self._hilo = threading.Thread(target=self._bucle, name="vigia-retencion", daemon=True)
        self._hilo.start()
        _log.info(
            "retención de evidencia arrancada (límite %.1f GB, carpeta %s)",
            self._cfg.evidencia.limite_gb, self._carpeta,
        )

    def parar(self) -> None:
        """Detiene el hilo de forma ordenada (espera hasta 5 s a que termine el ciclo actual)."""
        self._parar_evt.set()
        if self._hilo is not None:
            self._hilo.join(timeout=5)

    # ------------------------------------------------------------ internos
    def _bucle(self) -> None:
        while not self._parar_evt.is_set():
            try:
                self._revisar()
            except Exception:
                _log.exception("fallo revisando la retención de evidencia")
            self._parar_evt.wait(_INTERVALO_SEG)

    def _revisar(self) -> None:
        if not self._carpeta.is_dir():
            _log.debug("carpeta de evidencia %s no existe todavía, nada que rotar", self._carpeta)
            return

        total = self._tamano_total()
        if total <= self._limite_bytes:
            return

        clips = sorted(self._carpeta.rglob("*.mp4"), key=lambda p: self._mtime_seguro(p))
        liberados = 0
        borrados = 0

        for clip in clips:
            if total - liberados <= self._objetivo_bytes:
                break
            resultado = self._borrar_clip(clip)
            if resultado is None:
                continue
            liberados += resultado
            borrados += 1

        if borrados:
            _log.info(
                "retención: borrados %d clips antiguos, liberados %.1f MB (carpeta %.1f/%.1f GB)",
                borrados, liberados / (1024 ** 2),
                (total - liberados) / (1024 ** 3), self._limite_bytes / (1024 ** 3),
            )

    def _borrar_clip(self, clip: Path) -> int | None:
        """Borra un .mp4 y su .jpg hermano si están dentro de la carpeta configurada.

        Devuelve los bytes liberados, o None si no se pudo/debía borrar.
        """
        try:
            resuelto = clip.resolve()
        except OSError:
            return None

        if self._carpeta not in resuelto.parents:
            _log.warning("se omite archivo fuera de la carpeta de evidencia: %s", resuelto)
            return None

        evento_id = resuelto.stem
        miniatura = resuelto.with_suffix(".jpg")

        try:
            liberado = resuelto.stat().st_size
        except OSError:
            return None

        try:
            resuelto.unlink(missing_ok=True)
        except OSError:
            _log.exception("no se pudo borrar el clip %s", resuelto)
            return None

        if miniatura.is_file():
            try:
                liberado += miniatura.stat().st_size
                miniatura.unlink(missing_ok=True)
            except OSError:
                _log.exception("no se pudo borrar la miniatura de %s", evento_id)

        try:
            self._almacen.actualizar_clip(evento_id, None)
        except Exception:
            _log.exception("no se pudo poner clip_ruta a NULL para %s tras rotarlo", evento_id)

        return liberado

    def _tamano_total(self) -> int:
        total = 0
        for p in self._carpeta.rglob("*"):
            if p.is_file():
                try:
                    total += p.stat().st_size
                except OSError:
                    continue
        return total

    @staticmethod
    def _mtime_seguro(p: Path) -> float:
        try:
            return p.stat().st_mtime
        except OSError:
            return 0.0

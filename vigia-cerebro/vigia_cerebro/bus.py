"""Bus de eventos interno, thread-safe (escrito por el arquitecto — no tocar, solo usar).

Temas del contrato (§8):
  deteccion.frame   {camara_id, ts, tracks}
  evento.nuevo      {registro}   (dict con la forma REGISTRO del §6)
  evento.clip_listo {evento_id, ruta}
  camara.estado     {camara_id, conectada, fps}
  sistema.parar     {}

Los callbacks corren en el hilo del publicador: NO bloquear (si tardas >50 ms, encola).
Un callback roto no tumba a los demás.
"""
from __future__ import annotations

import logging
import threading
from collections import defaultdict
from typing import Any, Callable

_log = logging.getLogger("vigia.bus")


class _Bus:
    def __init__(self) -> None:
        self._oyentes: dict[str, list[Callable[[dict], Any]]] = defaultdict(list)
        self._lock = threading.Lock()

    def suscribir(self, tema: str, fn: Callable[[dict], Any]) -> None:
        with self._lock:
            self._oyentes[tema].append(fn)

    def desuscribir(self, tema: str, fn: Callable[[dict], Any]) -> None:
        with self._lock:
            if fn in self._oyentes.get(tema, []):
                self._oyentes[tema].remove(fn)

    def publicar(self, tema: str, datos: dict | None = None) -> None:
        with self._lock:
            oyentes = list(self._oyentes.get(tema, []))
        for fn in oyentes:
            try:
                fn(datos or {})
            except Exception as e:  # noqa: BLE001 — un oyente roto no tumba el bus
                _log.warning("oyente de '%s' falló: %s", tema, e)


bus = _Bus()

"""Estado compartido del cerebro: armado, horario, salud (arquitecto — no tocar, solo usar).

Persistencia: datos/estado.json — si el cerebro se reinicia, recuerda si estaba armado.
"""
from __future__ import annotations

import json
import threading
import time
from datetime import datetime
from pathlib import Path

from .configuracion import Config, HorarioCfg

_RUTA_ESTADO = Path("datos/estado.json")


class Estado:
    """Singleton thread-safe con el estado vivo del sistema."""

    def __init__(self, cfg: Config) -> None:
        self._cfg = cfg
        self._lock = threading.Lock()
        self.arrancado_en = time.time()
        self.armado_global: bool = cfg.armado.global_
        self.horario: HorarioCfg = cfg.armado.horario
        self._armado_camaras: dict[str, bool] = {c.id: c.armada for c in cfg.camaras}
        self._cargar()

    # --- persistencia -------------------------------------------------------
    def _cargar(self) -> None:
        try:
            if _RUTA_ESTADO.exists():
                d = json.loads(_RUTA_ESTADO.read_text(encoding="utf-8"))
                self.armado_global = bool(d.get("armado_global", self.armado_global))
                self.horario = HorarioCfg(
                    activo=bool(d.get("horario", {}).get("activo", self.horario.activo)),
                    inicio=str(d.get("horario", {}).get("inicio", self.horario.inicio)),
                    fin=str(d.get("horario", {}).get("fin", self.horario.fin)),
                )
                for cid, v in (d.get("camaras") or {}).items():
                    if cid in self._armado_camaras:
                        self._armado_camaras[cid] = bool(v)
        except Exception:
            pass  # estado corrupto → se parte de la config

    def _guardar(self) -> None:
        try:
            _RUTA_ESTADO.parent.mkdir(exist_ok=True)
            _RUTA_ESTADO.write_text(json.dumps({
                "armado_global": self.armado_global,
                "horario": {"activo": self.horario.activo, "inicio": self.horario.inicio,
                             "fin": self.horario.fin},
                "camaras": self._armado_camaras,
            }, ensure_ascii=False), encoding="utf-8")
        except Exception:
            pass

    # --- armado --------------------------------------------------------------
    def armar(self, camara_id: str | None = None) -> None:
        with self._lock:
            if camara_id is None:
                self.armado_global = True
            elif camara_id in self._armado_camaras:
                self._armado_camaras[camara_id] = True
            self._guardar()

    def desarmar(self, camara_id: str | None = None) -> None:
        with self._lock:
            if camara_id is None:
                self.armado_global = False
            elif camara_id in self._armado_camaras:
                self._armado_camaras[camara_id] = False
            self._guardar()

    def fijar_horario(self, activo: bool, inicio: str, fin: str) -> None:
        with self._lock:
            self.horario = HorarioCfg(activo=activo, inicio=inicio, fin=fin)
            self._guardar()

    def armado_camara(self, camara_id: str) -> bool:
        return self._armado_camaras.get(camara_id, False)

    def _en_franja(self, ahora: datetime | None = None) -> bool:
        if not self.horario.activo:
            return True  # sin programación: armado = armado
        d = ahora or datetime.now()
        m = d.hour * 60 + d.minute
        pi, pf = self.horario.inicio.split(":"), self.horario.fin.split(":")
        mi, mf = int(pi[0]) * 60 + int(pi[1]), int(pf[0]) * 60 + int(pf[1])
        return (mi <= m < mf) if mi <= mf else (m >= mi or m < mf)

    def esta_armada_ahora(self, camara_id: str) -> bool:
        """Verdad efectiva: global Y cámara Y franja horaria (si está activa)."""
        return self.armado_global and self.armado_camara(camara_id) and self._en_franja()

    # --- resumen para /estado y WS --------------------------------------------
    def resumen_armado(self) -> dict:
        return {
            "global": self.armado_global,
            "horario": {"activo": self.horario.activo, "inicio": self.horario.inicio,
                         "fin": self.horario.fin},
            "camaras": dict(self._armado_camaras),
        }

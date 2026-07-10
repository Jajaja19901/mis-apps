"""Carga y validación de config.yaml (escrito por el arquitecto — no tocar, solo usar)."""
from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from pathlib import Path

import yaml


@dataclass
class Go2rtcCfg:
    binario: str = "./bin/go2rtc"
    puerto_api: int = 1984
    puerto_rtsp: int = 8554


@dataclass
class EvidenciaCfg:
    carpeta: str = "./datos/clips"
    limite_gb: float = 5.0
    pre_seg: int = 10
    post_seg: int = 20


@dataclass
class TelegramCfg:
    token: str = ""
    chat_id: str = ""


@dataclass
class HorarioCfg:
    activo: bool = False
    inicio: str = "22:00"
    fin: str = "08:00"


@dataclass
class ArmadoCfg:
    global_: bool = True
    horario: HorarioCfg = field(default_factory=HorarioCfg)


@dataclass
class DeteccionCfg:
    imgsz: int = 416
    confianza: float = 0.35
    dispositivo: str = "cpu"


@dataclass
class CamaraCfg:
    id: str = "cam1"
    nombre: str = "Cámara"
    rtsp: str = ""
    modo: str = "comercio"          # comercio | casa | parking
    prioridad: int = 2              # 1-3
    armada: bool = True
    ignorar_mascotas: bool = False
    fps_objetivo: float = 5.0
    px_por_metro: float | None = None   # calibración de velocidad (~aprox.); None = sin velocidad


@dataclass
class Config:
    token: str = ""
    puerto_api: int = 8420
    go2rtc: Go2rtcCfg = field(default_factory=Go2rtcCfg)
    evidencia: EvidenciaCfg = field(default_factory=EvidenciaCfg)
    telegram: TelegramCfg = field(default_factory=TelegramCfg)
    armado: ArmadoCfg = field(default_factory=ArmadoCfg)
    deteccion: DeteccionCfg = field(default_factory=DeteccionCfg)
    camaras: list[CamaraCfg] = field(default_factory=list)
    ruta: str = "config.yaml"       # de dónde se cargó (para guardar)

    def camara(self, camara_id: str) -> CamaraCfg | None:
        for c in self.camaras:
            if c.id == camara_id:
                return c
        return None


_RE_ID = re.compile(r"^[a-z0-9_]{1,32}$")
_RE_HORA = re.compile(r"^([01]?\d|2[0-3]):[0-5]\d$")


def _err(msg: str) -> None:
    raise ValueError(f"config.yaml inválido: {msg}")


def cargar_config(ruta: str = "config.yaml") -> Config:
    """Carga config.yaml, valida, crea carpetas de datos y devuelve Config tipada."""
    p = Path(ruta)
    if not p.exists():
        _err(f"no existe {ruta} (copia config.ejemplo.yaml y ejecuta instalar.sh)")
    with open(p, "r", encoding="utf-8") as f:
        crudo = yaml.safe_load(f) or {}

    cfg = Config(ruta=str(p))
    cfg.token = str(crudo.get("token", "")).strip()
    if len(cfg.token) < 16 or cfg.token.startswith("PON_AQUI"):
        _err("falta un token válido (mínimo 16 caracteres; lo genera instalar.sh)")
    cfg.puerto_api = int(crudo.get("puerto_api", 8420))

    g = crudo.get("go2rtc", {}) or {}
    cfg.go2rtc = Go2rtcCfg(
        binario=str(g.get("binario", "./bin/go2rtc")),
        puerto_api=int(g.get("puerto_api", 1984)),
        puerto_rtsp=int(g.get("puerto_rtsp", 8554)),
    )

    e = crudo.get("evidencia", {}) or {}
    cfg.evidencia = EvidenciaCfg(
        carpeta=str(e.get("carpeta", "./datos/clips")),
        limite_gb=float(e.get("limite_gb", 5)),
        pre_seg=int(e.get("pre_seg", 10)),
        post_seg=int(e.get("post_seg", 20)),
    )

    t = crudo.get("telegram", {}) or {}
    cfg.telegram = TelegramCfg(token=str(t.get("token", "") or ""), chat_id=str(t.get("chat_id", "") or ""))

    a = crudo.get("armado", {}) or {}
    h = a.get("horario", {}) or {}
    if h.get("inicio") and not _RE_HORA.match(str(h.get("inicio"))):
        _err("armado.horario.inicio debe ser HH:MM")
    if h.get("fin") and not _RE_HORA.match(str(h.get("fin"))):
        _err("armado.horario.fin debe ser HH:MM")
    cfg.armado = ArmadoCfg(
        global_=bool(a.get("global", True)),
        horario=HorarioCfg(
            activo=bool(h.get("activo", False)),
            inicio=str(h.get("inicio", "22:00")),
            fin=str(h.get("fin", "08:00")),
        ),
    )

    d = crudo.get("deteccion", {}) or {}
    cfg.deteccion = DeteccionCfg(
        imgsz=int(d.get("imgsz", 416)),
        confianza=float(d.get("confianza", 0.35)),
        dispositivo=str(d.get("dispositivo", "cpu")),
    )

    cams = crudo.get("camaras", []) or []
    if not cams:
        _err("define al menos una cámara en 'camaras:'")
    vistos: set[str] = set()
    for c in cams:
        cid = str(c.get("id", "")).strip()
        if not _RE_ID.match(cid):
            _err(f"id de cámara inválido: '{cid}' (solo a-z, 0-9 y _)")
        if cid in vistos:
            _err(f"id de cámara duplicado: '{cid}'")
        vistos.add(cid)
        modo = str(c.get("modo", "comercio"))
        if modo not in ("comercio", "casa", "parking"):
            _err(f"modo inválido en '{cid}': {modo}")
        if not str(c.get("rtsp", "")).strip():
            _err(f"la cámara '{cid}' no tiene URL rtsp")
        ppm = c.get("px_por_metro")
        try:
            ppm = float(ppm) if ppm else None
        except (TypeError, ValueError):
            ppm = None
        cfg.camaras.append(CamaraCfg(
            id=cid,
            nombre=str(c.get("nombre", cid)),
            rtsp=str(c.get("rtsp", "")).strip(),
            modo=modo,
            prioridad=max(1, min(3, int(c.get("prioridad", 2)))),
            armada=bool(c.get("armada", True)),
            ignorar_mascotas=bool(c.get("ignorar_mascotas", False)),
            fps_objetivo=max(0.5, min(15.0, float(c.get("fps_objetivo", 5)))),
            px_por_metro=ppm,
        ))

    # Carpetas de datos
    Path(cfg.evidencia.carpeta).mkdir(parents=True, exist_ok=True)
    Path("datos").mkdir(exist_ok=True)
    return cfg


def guardar_config(cfg: Config) -> None:
    """Persiste la Config actual en su config.yaml (tras POST /config)."""
    datos = {
        "token": cfg.token,
        "puerto_api": cfg.puerto_api,
        "go2rtc": {"binario": cfg.go2rtc.binario, "puerto_api": cfg.go2rtc.puerto_api,
                   "puerto_rtsp": cfg.go2rtc.puerto_rtsp},
        "evidencia": {"carpeta": cfg.evidencia.carpeta, "limite_gb": cfg.evidencia.limite_gb,
                      "pre_seg": cfg.evidencia.pre_seg, "post_seg": cfg.evidencia.post_seg},
        "telegram": {"token": cfg.telegram.token, "chat_id": cfg.telegram.chat_id},
        "armado": {"global": cfg.armado.global_,
                   "horario": {"activo": cfg.armado.horario.activo,
                                "inicio": cfg.armado.horario.inicio,
                                "fin": cfg.armado.horario.fin}},
        "deteccion": {"imgsz": cfg.deteccion.imgsz, "confianza": cfg.deteccion.confianza,
                       "dispositivo": cfg.deteccion.dispositivo},
        "camaras": [{"id": c.id, "nombre": c.nombre, "rtsp": c.rtsp, "modo": c.modo,
                     "prioridad": c.prioridad, "armada": c.armada,
                     "ignorar_mascotas": c.ignorar_mascotas, "fps_objetivo": c.fps_objetivo,
                     "px_por_metro": c.px_por_metro}
                    for c in cfg.camaras],
    }
    tmp = cfg.ruta + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        yaml.safe_dump(datos, f, allow_unicode=True, sort_keys=False)
    os.replace(tmp, cfg.ruta)

"""Punto de entrada del cerebro: python -m vigia_cerebro.principal [config.yaml]

Orden de arranque: config → almacén → estado → evidencia → telegram → alertas →
detector/analíticas/gestos → gestor de cámaras (go2rtc + hilos) → retención → API.
"""
from __future__ import annotations

import logging
import logging.handlers
import signal
import sys
import time
from pathlib import Path


def _configurar_logs() -> None:
    Path("datos").mkdir(exist_ok=True)
    fmt = logging.Formatter("%(asctime)s %(levelname).1s %(name)s: %(message)s", "%d/%m %H:%M:%S")
    raiz = logging.getLogger()
    raiz.setLevel(logging.INFO)
    consola = logging.StreamHandler()
    consola.setFormatter(fmt)
    archivo = logging.handlers.RotatingFileHandler(
        "datos/cerebro.log", maxBytes=5 * 1024 * 1024, backupCount=3, encoding="utf-8")
    archivo.setFormatter(fmt)
    raiz.addHandler(consola)
    raiz.addHandler(archivo)


def main() -> int:
    _configurar_logs()
    log = logging.getLogger("vigia.principal")
    ruta_cfg = sys.argv[1] if len(sys.argv) > 1 else "config.yaml"

    from . import VERSION
    from .configuracion import cargar_config
    try:
        cfg = cargar_config(ruta_cfg)
    except ValueError as e:
        log.error("%s", e)
        return 2

    log.info("VIGÍA CEREBRO v%s — %d cámara(s), API en :%d", VERSION, len(cfg.camaras), cfg.puerto_api)

    from .almacen import Almacen
    from .estado import Estado
    from .evidencia import Evidencia
    from .telegram import Telegram
    from .alertas import Alertas
    from .detector import Detector
    from .analitica import Analitica
    from .gestos import Gestos
    from .camaras import GestorCamaras
    from .retencion import Retencion
    from .api import crear_app
    from .bus import bus

    almacen = Almacen()
    estado = Estado(cfg)
    evidencia = Evidencia(cfg)
    telegram = Telegram(cfg)
    alertas = Alertas(cfg, estado, almacen, evidencia, telegram)

    detector = Detector(cfg)
    gestos = Gestos()
    analiticas = {c.id: Analitica(c, cfg.deteccion) for c in cfg.camaras}
    # Reponer zonas guardadas (persistidas por POST /zonas en el almacén kv)
    for c in cfg.camaras:
        guardado = almacen.kv_get("zonas_" + c.id)
        if guardado:
            try:
                analiticas[c.id].cargar_zonas(guardado.get("zonas", []), guardado.get("lineas", []))
            except Exception as e:  # noqa: BLE001
                log.warning("zonas guardadas de %s no se pudieron cargar: %s", c.id, e)

    gestor = GestorCamaras(cfg, detector, analiticas, gestos, evidencia, alertas.procesar)
    retencion = Retencion(cfg, almacen)

    def _aplicar_zonas(camara_id: str, zonas: list, lineas: list) -> None:
        if camara_id in analiticas:
            analiticas[camara_id].cargar_zonas(zonas, lineas)
        almacen.kv_set("zonas_" + camara_id, {"zonas": zonas, "lineas": lineas})

    def _aforo_actual(camara_id: str | None = None) -> int:
        if camara_id and camara_id in analiticas:
            return analiticas[camara_id].aforo_actual()
        return sum(a.aforo_actual() for a in analiticas.values())

    def _aplicar_config(parcial: dict) -> None:
        gestor.aplicar_config(parcial)
        det = parcial.get("deteccion") or {}
        if "confianza" in det:
            cfg.deteccion.confianza = float(det["confianza"])
        if "imgsz" in det:
            cfg.deteccion.imgsz = int(det["imgsz"])
        for cam in (parcial.get("camaras") or []):
            c = cfg.camara(str(cam.get("id", "")))
            if not c:
                continue
            if "fps_objetivo" in cam:
                c.fps_objetivo = max(0.5, min(15.0, float(cam["fps_objetivo"])))
            if "ignorar_mascotas" in cam:
                c.ignorar_mascotas = bool(cam["ignorar_mascotas"])

    ctx = {"aforo_actual": _aforo_actual, "aplicar_zonas": _aplicar_zonas,
           "aplicar_config": _aplicar_config}

    gestor.arrancar()
    retencion.arrancar()
    bus.publicar("evento.nuevo", {"registro": {
        "id": "arranque_" + str(int(time.time())), "ts": int(time.time() * 1000),
        "camara_id": "", "camara_nombre": "Sistema", "tipo": "cerebro_arrancado",
        "nivel": "info", "texto": "Vigía Cerebro arrancado", "track_id": None,
        "miniatura": False, "clip": False,
    }})

    app = crear_app(cfg, estado, almacen, gestor, ctx)

    def _parar(*_a) -> None:
        log.info("parando…")
        try:
            bus.publicar("sistema.parar", {})
            retencion.parar()
            gestor.parar()
            almacen.cerrar()
        finally:
            sys.exit(0)

    signal.signal(signal.SIGINT, _parar)
    signal.signal(signal.SIGTERM, _parar)

    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=cfg.puerto_api, log_level="warning")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

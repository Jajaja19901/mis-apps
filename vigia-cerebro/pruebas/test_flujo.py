"""PRUEBA DE FLUJO COMPLETO de VIGÍA CEREBRO — sin hardware.

Demuestra la cadena entera con una cámara falsa (archivo de vídeo, MODO ARCHIVO
del lector) y un detector SIMULADO inyectado (en este entorno no se pueden
descargar los pesos YOLO; en la máquina real los descarga instalar.sh):

  cámara (mp4 en bucle) → GestorCamaras (hilos reales) → detector simulado
  → Analitica REAL (supervision: PolygonZone/LineZone) → Alertas REAL
  → evento en SQLite REAL → alerta por WebSocket REAL (FastAPI/uvicorn)
  → clip MP4 REAL en disco con timestamp → Telegram sin token (log claro)

Uso:  cd vigia-cerebro && ./venv/bin/python pruebas/test_flujo.py
Sale con código 0 si TODAS las comprobaciones pasan.
"""
from __future__ import annotations

import asyncio
import json
import shutil
import sys
import tempfile
import threading
import time
from collections import deque
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))

RESULTADOS: list[tuple[bool, str]] = []


def comprobar(ok: bool, texto: str) -> None:
    RESULTADOS.append((bool(ok), texto))
    print(("  ✓ " if ok else "  ✗ ") + texto)


def main() -> int:  # noqa: PLR0915 - guion de prueba, lineal a propósito
    print("== VIGÍA CEREBRO · prueba de flujo completo (cámara falsa + detector simulado) ==")
    tmp = Path(tempfile.mkdtemp(prefix="vigia_flujo_"))
    import os
    os.chdir(tmp)  # los módulos usan rutas relativas (datos/…)

    # ---- vídeo de la cámara falsa ------------------------------------------
    sys.path.insert(0, str(RAIZ / "pruebas"))
    from genera_video import generar
    video = generar(str(tmp / "video_prueba.mp4"), segundos=12, fps=10)

    # ---- config de prueba ---------------------------------------------------
    token = "prueba" + "0" * 26
    (tmp / "config.yaml").write_text(f"""
token: "{token}"
puerto_api: 8421
evidencia: {{ carpeta: "./datos/clips", limite_gb: 1, pre_seg: 2, post_seg: 2 }}
armado: {{ global: true, horario: {{ activo: false }} }}
deteccion: {{ imgsz: 416, confianza: 0.35 }}
camaras:
  - id: "demo"
    nombre: "Cámara demo"
    rtsp: "{video}"
    modo: "comercio"
    prioridad: 3
    armada: true
    fps_objetivo: 8
""", encoding="utf-8")

    from vigia_cerebro.configuracion import cargar_config
    from vigia_cerebro.estado import Estado
    from vigia_cerebro.almacen import Almacen
    from vigia_cerebro.evidencia import Evidencia
    from vigia_cerebro.telegram import Telegram
    from vigia_cerebro.alertas import Alertas
    from vigia_cerebro.analitica import Analitica
    from vigia_cerebro.detector import Track
    from vigia_cerebro.camaras import GestorCamaras
    from vigia_cerebro.api import crear_app
    from vigia_cerebro.bus import bus

    import logging
    logging.basicConfig(level=logging.INFO, format="%(levelname).1s %(name)s: %(message)s")

    cfg = cargar_config(str(tmp / "config.yaml"))
    comprobar(cfg.token == token and cfg.camaras[0].id == "demo", "config de prueba carga y valida")

    estado = Estado(cfg)
    almacen = Almacen()
    evidencia = Evidencia(cfg)
    telegram = Telegram(cfg)          # sin token → debe degradar con log claro
    alertas = Alertas(cfg, estado, almacen, evidencia, telegram)

    # ---- detector SIMULADO (guion: persona cruza la línea y entra en zona) --
    class DetectorSimulado:
        """Persona que camina de izquierda a derecha (0.2→0.8 del ancho)."""

        def __init__(self) -> None:
            self.n = 0

        def procesar(self, camara_id, frame_bgr, ts_ms):
            self.n += 1
            h, w = frame_bgr.shape[:2]
            # avanza un 1.5% del ancho por frame; unos 40 frames para cruzar
            frac = min(0.82, 0.20 + self.n * 0.015)
            cx = frac * w
            x1, x2 = cx - 20, cx + 20
            y1, y2 = 0.35 * h, 0.80 * h
            t = Track(id=1, clase="person", conf=0.9, caja=(x1, y1, x2, y2),
                      cx=cx, cy=(y1 + y2) / 2, pie_x=cx, pie_y=y2,
                      historial=deque(), vel_px_s=0.03 * w)
            return [t]

    detector = DetectorSimulado()
    analitica = Analitica(cfg.camaras[0], cfg.deteccion)
    # línea vertical en el centro + zona prohibida = mitad derecha
    analitica.cargar_zonas(
        zonas=[{"id": "z1", "tipo": "prohibida", "nombre": "Almacén",
                "puntos": [{"x": 0.55, "y": 0.05}, {"x": 0.98, "y": 0.05},
                            {"x": 0.98, "y": 0.98}, {"x": 0.55, "y": 0.98}]}],
        lineas=[{"id": "l1", "nombre": "Entrada",
                 "a": {"x": 0.5, "y": 0.02}, "b": {"x": 0.5, "y": 0.98}}],
    )

    from vigia_cerebro.gestos import Gestos
    gestos = Gestos()  # sin mediapipe instalado también debe degradar sin romper

    gestor = GestorCamaras(cfg, detector, {"demo": analitica}, gestos, evidencia,
                           alertas.procesar, estado)

    # ---- API + WS reales -----------------------------------------------------
    ctx = {
        "aforo_actual": lambda cam=None: analitica.aforo_actual(),
        "aplicar_zonas": lambda cid, z, l: analitica.cargar_zonas(z, l),
        "aplicar_config": lambda parcial: gestor.aplicar_config(parcial),
    }
    app = crear_app(cfg, estado, almacen, gestor, ctx)

    import uvicorn
    servidor = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=8421, log_level="warning"))
    hilo_api = threading.Thread(target=servidor.run, daemon=True, name="api")
    hilo_api.start()

    # ---- cliente WebSocket que recoge alertas -------------------------------
    ws_alertas: list[dict] = []
    ws_hola: list[dict] = []
    ws_listo = threading.Event()

    def cliente_ws() -> None:
        async def correr() -> None:
            import websockets
            uri = f"ws://127.0.0.1:8421/api/v1/eventos?token={token}"
            async with websockets.connect(uri, max_size=None) as ws:
                ws_listo.set()
                try:
                    while True:
                        m = json.loads(await asyncio.wait_for(ws.recv(), timeout=40))
                        if m.get("tipo") == "hola":
                            ws_hola.append(m)
                        elif m.get("tipo") == "alerta":
                            ws_alertas.append(m["registro"])
                except (TimeoutError, asyncio.TimeoutError):
                    pass
        try:
            asyncio.run(correr())
        except Exception as e:  # noqa: BLE001
            print("  [ws] terminó:", e)

    hilo_ws = threading.Thread(target=cliente_ws, daemon=True, name="ws-cliente")

    time.sleep(1.5)  # que la API esté escuchando
    hilo_ws.start()
    ws_listo.wait(10)
    comprobar(ws_listo.is_set(), "WebSocket /api/v1/eventos conecta con token")

    # ---- arranca la tubería de cámaras (MODO ARCHIVO, sin go2rtc) -----------
    gestor.arrancar()

    # espera a que el guion produzca la alerta de zona prohibida y el clip
    fin = time.time() + 45
    evento_zona = None
    while time.time() < fin:
        evs = almacen.eventos(limite=50)
        evento_zona = next((e for e in evs if e["tipo"] == "zona_prohibida"), None)
        if evento_zona and any(r.get("tipo") == "zona_prohibida" for r in ws_alertas):
            clips = list(Path("datos/clips").rglob("*.mp4"))
            if clips:
                break
        time.sleep(1)

    evs = almacen.eventos(limite=100)
    tipos = {e["tipo"] for e in evs}
    comprobar(evento_zona is not None, f"evento 'zona_prohibida' en SQLite (tipos vistos: {sorted(tipos)})")
    comprobar(evento_zona is not None and evento_zona["nivel"] == "critico", "la zona prohibida es nivel crítico")
    comprobar(any(e["tipo"] == "armado_intrusion" for e in evs), "intrusión con sistema armado detectada")
    comprobar(any(r.get("tipo") == "zona_prohibida" for r in ws_alertas),
              f"alerta empujada por WebSocket en tiempo real ({len(ws_alertas)} alertas recibidas)")
    comprobar(bool(ws_hola) and "armado" in (ws_hola[0] if ws_hola else {}), "mensaje 'hola' del WS con estado de armado")

    clips = list(Path("datos/clips").rglob("*.mp4"))
    comprobar(bool(clips), f"clip de evidencia MP4 guardado en disco ({[c.name for c in clips][:3]})")
    minis = list(Path("datos/clips").rglob("*.jpg"))
    comprobar(bool(minis), "miniatura JPEG del evento guardada")

    # agregados y stats
    time.sleep(1)
    dia = time.strftime("%Y-%m-%d")
    stats = almacen.stats_dia(dia, None)
    comprobar(stats["entradas"] >= 1, f"agregado de entradas por línea ({stats['entradas']})")
    comprobar(sum(stats["por_hora"]) >= 1, "visitantes por hora alimentan el gráfico")
    comprobar(stats["alertas"]["critico"] >= 1, "contador de alertas críticas")

    # ---- API HTTP ------------------------------------------------------------
    import httpx
    with httpx.Client(base_url="http://127.0.0.1:8421", trust_env=False, timeout=10) as c:
        comprobar(c.get("/salud").json().get("ok") is True, "GET /salud (sin token)")
        comprobar(c.get("/api/v1/estado").status_code == 401, "sin token → 401 (nada responde)")
        r = c.get("/api/v1/estado", headers={"X-Vigia-Token": token})
        comprobar(r.status_code == 200 and r.json()["camaras"][0]["conectada"] is True,
                  "GET /estado con token: cámara conectada y salud")
        r = c.get("/api/v1/camaras", headers={"X-Vigia-Token": token})
        comprobar(r.status_code == 200 and r.json()[0]["id"] == "demo", "GET /camaras")
        r = c.get("/api/v1/frame/demo", headers={"X-Vigia-Token": token})
        comprobar(r.status_code == 200 and r.headers.get("content-type", "").startswith("image/jpeg"),
                  "GET /frame/demo devuelve JPEG del último frame")
        r = c.get("/api/v1/eventos", headers={"X-Vigia-Token": token})
        comprobar(r.status_code == 200 and len(r.json().get("eventos", [])) >= 1, "GET /eventos historial")
        if evento_zona:
            r = c.get(f"/api/v1/miniatura/{evento_zona['id']}", headers={"X-Vigia-Token": token})
            comprobar(r.status_code == 200, "GET /miniatura/{id}")
            # espera a que ALGÚN evento tenga su clip cerrado y descárgalo (200 exigido)
            id_con_clip = None
            fin_clip = time.time() + 30
            while time.time() < fin_clip and not id_con_clip:
                evs_c = c.get("/api/v1/eventos", headers={"X-Vigia-Token": token}).json()["eventos"]
                id_con_clip = next((e["id"] for e in evs_c if e.get("clip")), None)
                if not id_con_clip:
                    time.sleep(1)
            comprobar(id_con_clip is not None, "algún evento queda ligado a su clip (clip:true)")
            if id_con_clip:
                r = c.get(f"/api/v1/clip/{id_con_clip}", headers={"X-Vigia-Token": token})
                comprobar(r.status_code == 200 and "attachment" in r.headers.get("content-disposition", ""),
                          "GET /clip/{id} descarga el MP4 (200 + attachment)")
        r = c.post("/api/v1/desarmar", json={}, headers={"X-Vigia-Token": token})
        comprobar(r.status_code == 200 and r.json()["armado"]["global"] is False, "POST /desarmar global")
        r = c.post("/api/v1/armar", json={}, headers={"X-Vigia-Token": token})
        comprobar(r.status_code == 200 and r.json()["armado"]["global"] is True, "POST /armar global")
        # IDA Y VUELTA de zonas (regresión: la persistencia se machacaba con un repr)
        zonas_env = [{"id": "zz", "tipo": "caja", "nombre": "Caja 1",
                       "puntos": [{"x": 0.1, "y": 0.1}, {"x": 0.3, "y": 0.1}, {"x": 0.3, "y": 0.4}]}]
        r = c.post("/api/v1/zonas", json={"camara_id": "demo", "zonas": zonas_env, "lineas": []},
                   headers={"X-Vigia-Token": token})
        comprobar(r.status_code == 200, "POST /zonas (aplica en caliente)")
        # el almacén escribe en lotes (hasta 2 s): reintenta la lectura
        vuelta = {}
        for _ in range(10):
            r = c.get("/api/v1/zonas?camara=demo", headers={"X-Vigia-Token": token})
            vuelta = r.json() if r.status_code == 200 else {}
            if vuelta.get("zonas"):
                break
            time.sleep(0.5)
        comprobar(vuelta.get("zonas") == zonas_env,
                  f"GET /zonas devuelve EXACTAMENTE lo guardado (persistencia JSON sana) {vuelta if vuelta.get('zonas') != zonas_env else ''}")
        # velocidad de vehículos: calibración px_por_metro por POST /config
        r = c.post("/api/v1/config", json={"camaras": [{"id": "demo", "px_por_metro": 40}]},
                   headers={"X-Vigia-Token": token})
        comprobar(r.status_code == 200, "POST /config acepta px_por_metro")
        r = c.get("/api/v1/estado", headers={"X-Vigia-Token": token})
        cam0 = (r.json().get("camaras") or [{}])[0]
        comprobar(cam0.get("px_por_metro") == 40, "px_por_metro aplicado y visible en /estado")
        comprobar(getattr(cfg.camaras[0], "px_por_metro", None) == 40,
                  "la analítica ve la calibración en vivo (misma instancia de config)")
        r = c.get("/api/v1/stats", headers={"X-Vigia-Token": token})
        comprobar(r.status_code == 200 and "mapa_calor" in r.json(), "GET /stats con mapa de calor")

    # telegram sin configurar: no debe haber reventado nada
    ok_tg, msg_tg = telegram.probar()
    comprobar(ok_tg is False, f"Telegram sin token degrada limpio ({msg_tg[:60]}…)")

    # ---- anti-sabotaje (unidad, en tiempo real: ~7 s) -------------------------
    import numpy as np
    from vigia_cerebro.camaras import Sabotaje
    sab = Sabotaje("Cámara demo")
    claro = np.full((180, 320, 3), 150, np.uint8)
    negro = np.zeros((180, 320, 3), np.uint8)
    ev_sab = None
    t0 = time.time()
    while time.time() - t0 < 4.0:          # calibración con escena clara
        sab.alimentar(claro, int(time.time() * 1000))
        time.sleep(0.55)
    t0 = time.time()
    while time.time() - t0 < 3.5 and not ev_sab:   # cámara "tapada"
        ev_sab = sab.alimentar(negro, int(time.time() * 1000))
        time.sleep(0.55)
    comprobar(ev_sab is not None and ev_sab.get("tipo") == "sabotaje"
              and ev_sab.get("nivel_sugerido") == "critico",
              f"anti-sabotaje detecta cámara tapada → alerta crítica ({(ev_sab or {}).get('subtipo')})")

    # ---- limpieza ------------------------------------------------------------
    servidor.should_exit = True
    gestor.parar()
    almacen.cerrar()
    os.chdir("/")
    shutil.rmtree(tmp, ignore_errors=True)

    fallos = [t for ok, t in RESULTADOS if not ok]
    print("\n== RESULTADO: %d/%d comprobaciones en verde ==" % (len(RESULTADOS) - len(fallos), len(RESULTADOS)))
    if fallos:
        print("FALLAN:", *("  · " + f for f in fallos), sep="\n")
        return 1
    print("✅ FLUJO COMPLETO DEMOSTRADO (con detector simulado; YOLO real y go2rtc se validan en la máquina destino)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

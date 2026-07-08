"""API HTTP + WebSocket de eventos + proxy go2rtc del cerebro (agente 3).

La app (FastAPI) se CREA en `crear_app(...)`; nada corre en import. `principal.py`
(integrador) la arranca con uvicorn.

Puente bus(hilos) → WS(asyncio)
-------------------------------
El `bus` publica en el hilo del publicador (detector/alertas). El WebSocket vive en
el bucle asyncio de uvicorn. Para cruzar de un mundo al otro sin condiciones de
carrera: cada cliente WS tiene su propia `asyncio.Queue`; el callback del bus (que
corre en un hilo cualquiera) usa `loop.call_soon_threadsafe(...)` para depositar el
mensaje en las colas de los clientes. TODOS los envíos por un mismo WebSocket salen
por UNA sola corrutina consumidora (los envíos concurrentes sobre un WS corromperían
la trama), así que las tareas periódicas y las alertas del bus solo ENCOLAN.

Proxy go2rtc
------------
HTTP `/go2rtc/{resto}`: httpx en streaming hacia el go2rtc local (quita `token` del
query). WebSocket `/go2rtc/api/ws`: puente bidireccional con la librería `websockets`;
dos tareas asyncio reenvían texto y BINARIO (el vídeo MSE viaja en frames binarios) en
cada sentido; si un lado cae, se cierran ambos.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import secrets
import time
from datetime import datetime

import httpx
import psutil
import websockets
from fastapi import FastAPI, Request, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse
from starlette.background import BackgroundTask
from starlette.exceptions import HTTPException as StarletteHTTPException

from . import VERSION
from .almacen import Almacen
from .configuracion import Config, guardar_config
from .estado import Estado

_log = logging.getLogger("vigia.api")

# Cabeceras hop-by-hop que NO se reenvían en el proxy.
_HOP = {"connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
        "te", "trailers", "transfer-encoding", "upgrade", "content-encoding",
        "content-length", "host"}


class _GestorWS:
    """Gestiona los clientes del WS /eventos y el puente hilo→asyncio."""

    def __init__(self) -> None:
        self.clientes: set[asyncio.Queue] = set()
        self.loop: asyncio.AbstractEventLoop | None = None

    def registrar(self, cola: asyncio.Queue) -> None:
        self.clientes.add(cola)

    def quitar(self, cola: asyncio.Queue) -> None:
        self.clientes.discard(cola)

    def emitir_desde_hilo(self, mensaje: dict) -> None:
        """Llamado desde un hilo del bus: reparte el mensaje de forma segura al loop."""
        loop = self.loop
        if loop is None:
            return
        try:
            loop.call_soon_threadsafe(self._repartir, mensaje)
        except RuntimeError:
            pass  # el loop ya no está corriendo (apagado)

    def _repartir(self, mensaje: dict) -> None:
        """Deposita el mensaje en la cola de cada cliente (descarta si está llena)."""
        for cola in list(self.clientes):
            try:
                cola.put_nowait(mensaje)
            except asyncio.QueueFull:
                pass  # cliente lento: se descarta esta alerta para no bloquear


def crear_app(cfg: Config, estado: Estado, almacen: Almacen, gestor,
              ctx: dict) -> FastAPI:
    """Construye y devuelve la app FastAPI del cerebro (uvicorn la arranca aparte)."""
    app = FastAPI(title="VIGÍA CEREBRO", version=VERSION, docs_url=None, redoc_url=None)
    gws = _GestorWS()
    ctx = ctx or {}

    # Nombres de cámara para reconstruir REGISTRO al leer del histórico.
    try:
        almacen.nombres_camaras = {c.id: c.nombre for c in cfg.camaras}
    except Exception:  # noqa: BLE001
        pass

    # --- seguridad (§4) ------------------------------------------------------
    def token_valido(t: str | None) -> bool:
        """Compara el token en tiempo constante (secrets.compare_digest)."""
        if not t:
            return False
        return secrets.compare_digest(str(t), cfg.token)

    @app.middleware("http")
    async def mw_token(request: Request, call_next):
        """Exige X-Vigia-Token (o ?token=) en TODO menos /salud y preflight OPTIONS."""
        if request.method == "OPTIONS" or request.url.path == "/salud":
            return await call_next(request)
        t = request.headers.get("x-vigia-token") or request.query_params.get("token")
        if not token_valido(t):
            return JSONResponse({"error": "token inválido"}, status_code=401)
        return await call_next(request)

    # CORS abierto (la app vive en Cloudflare Pages, otra origin). Se añade DESPUÉS
    # para que quede como capa MÁS EXTERNA y atienda el preflight.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["Content-Disposition"],
    )

    # --- manejadores de error (nunca trazas al cliente) ----------------------
    @app.exception_handler(StarletteHTTPException)
    async def _err_http(request: Request, exc: StarletteHTTPException):
        return JSONResponse({"error": exc.detail}, status_code=exc.status_code)

    @app.exception_handler(Exception)
    async def _err_generico(request: Request, exc: Exception):
        _log.exception("error no controlado en %s", request.url.path)
        return JSONResponse({"error": "error interno del servidor"}, status_code=500)

    # --- ayudantes -----------------------------------------------------------
    def _camaras_estado() -> list[dict]:
        """Resumen de cámaras para /estado y el WS (usa gestor.resumen(); fallback)."""
        try:
            r = gestor.resumen()
            if isinstance(r, list):
                return r
        except Exception:  # noqa: BLE001
            _log.debug("gestor.resumen() no disponible, uso fallback")
        return [{
            "id": c.id, "nombre": c.nombre, "modo": c.modo, "prioridad": c.prioridad,
            "conectada": False, "armada": estado.armado_camara(c.id),
            "fps_real": 0.0, "fps_objetivo": c.fps_objetivo,
            "ultimo_frame_ts": 0, "ignorar_mascotas": c.ignorar_mascotas,
        } for c in cfg.camaras]

    def _dimensiones(camara_id: str) -> tuple[int, int]:
        """Ancho/alto de una cámara desde gestor.dimensiones (dict o callable)."""
        d = getattr(gestor, "dimensiones", None)
        val = None
        try:
            if callable(d):
                val = d(camara_id)
            elif isinstance(d, dict):
                val = d.get(camara_id)
        except Exception:  # noqa: BLE001
            val = None
        if isinstance(val, dict):
            return int(val.get("ancho", 0) or 0), int(val.get("alto", 0) or 0)
        if isinstance(val, (tuple, list)) and len(val) >= 2:
            return int(val[0] or 0), int(val[1] or 0)
        return 0, 0

    def _tam_clips_gb() -> float:
        """Tamaño total (GB) de la carpeta de clips."""
        total = 0
        try:
            for raiz, _dirs, ficheros in os.walk(cfg.evidencia.carpeta):
                for f in ficheros:
                    try:
                        total += os.path.getsize(os.path.join(raiz, f))
                    except OSError:
                        pass
        except Exception:  # noqa: BLE001
            pass
        return round(total / (1024 ** 3), 2)

    def _enriquecer_nombre(reg: dict) -> dict:
        """Rellena camara_nombre desde la config (fuente de verdad del nombre)."""
        for c in cfg.camaras:
            if c.id == reg.get("camara_id"):
                reg["camara_nombre"] = c.nombre
                break
        reg.setdefault("camara_nombre", reg.get("camara_id"))
        return reg

    # --- ENDPOINTS §5 --------------------------------------------------------
    @app.get("/salud")
    async def salud():
        """Único endpoint sin token: para watchdogs."""
        return {"ok": True}

    @app.get("/api/v1/estado")
    async def estado_sistema():
        """Estado global: armado, cámaras y salud del hardware."""
        salud_hw = {
            "cpu_pct": round(float(psutil.cpu_percent(interval=None)), 1),
            "ram_pct": round(float(psutil.virtual_memory().percent), 1),
            "disco_clips_gb": _tam_clips_gb(),
            "uptime_seg": int(time.time() - estado.arrancado_en),
            "version": VERSION,
        }
        return {
            "armado": estado.resumen_armado(),
            "camaras": _camaras_estado(),
            "salud": salud_hw,
        }

    @app.get("/api/v1/camaras")
    async def camaras():
        """Lista de cámaras con rutas RELATIVAS de streams (la app añade ?token=)."""
        salida = []
        for c in cfg.camaras:
            ancho, alto = _dimensiones(c.id)
            salida.append({
                "id": c.id,
                "nombre": c.nombre,
                "modo": c.modo,
                "ancho": ancho,
                "alto": alto,
                "stream_mse": f"/go2rtc/api/ws?src={c.id}",
                "stream_mp4": f"/go2rtc/api/stream.mp4?src={c.id}",
                "frame": f"/api/v1/frame/{c.id}",
            })
        return salida

    @app.get("/api/v1/frame/{camara_id}")
    async def frame(camara_id: str):
        """Último frame JPEG de una cámara (para dibujar zonas / mosaico de respaldo)."""
        datos = None
        try:
            datos = gestor.ultimo_frame_jpeg(camara_id)
        except Exception:  # noqa: BLE001
            datos = None
        if not datos:
            raise StarletteHTTPException(status_code=404, detail="no existe")
        return Response(content=bytes(datos), media_type="image/jpeg",
                        headers={"Cache-Control": "no-store"})

    @app.get("/api/v1/eventos")
    async def eventos(request: Request):
        """Histórico de eventos filtrado (orden descendente)."""
        qp = request.query_params

        def _int(nombre):
            v = qp.get(nombre)
            try:
                return int(v) if v not in (None, "") else None
            except ValueError:
                return None

        lista = almacen.eventos(
            desde=_int("desde"),
            hasta=_int("hasta"),
            camara=qp.get("camara") or None,
            nivel=qp.get("nivel") or None,
            limite=_int("limite") or 200,
        )
        return {"eventos": [_enriquecer_nombre(e) for e in lista]}

    @app.get("/api/v1/miniatura/{evento_id}")
    async def miniatura(evento_id: str):
        """Sirve la miniatura JPEG de un evento."""
        ev = almacen.evento(evento_id)
        ruta = ev.get("miniatura_ruta") if ev else None
        if not ruta or not os.path.exists(ruta):
            raise StarletteHTTPException(status_code=404, detail="no existe")
        return FileResponse(ruta, media_type="image/jpeg")

    @app.get("/api/v1/clip/{evento_id}")
    async def clip(evento_id: str):
        """Sirve el clip MP4 de un evento como descarga (attachment)."""
        ev = almacen.evento(evento_id)
        ruta = ev.get("clip_ruta") if ev else None
        if not ruta or not os.path.exists(ruta):
            raise StarletteHTTPException(status_code=404, detail="no existe")
        nombre = os.path.basename(ruta) or f"{evento_id}.mp4"
        return FileResponse(
            ruta, media_type="video/mp4", filename=nombre,
            headers={"Content-Disposition": f'attachment; filename="{nombre}"'})

    async def _cuerpo_json(request: Request) -> dict:
        try:
            d = await request.json()
            return d if isinstance(d, dict) else {}
        except Exception:  # noqa: BLE001 — cuerpo vacío o no-JSON
            return {}

    async def _difundir_estado() -> None:
        """Empuja un mensaje 'estado' a todos los clientes WS (cambios de armado)."""
        gws._repartir({
            "tipo": "estado",
            "camaras": _camaras_estado(),
            "armado": estado.resumen_armado(),
        })

    @app.post("/api/v1/armar")
    async def armar(request: Request):
        """Arma el sistema (global si no se da camara_id)."""
        body = await _cuerpo_json(request)
        estado.armar(body.get("camara_id") or None)
        await _difundir_estado()
        return {"ok": True, "armado": estado.resumen_armado()}

    @app.post("/api/v1/desarmar")
    async def desarmar(request: Request):
        """Desarma el sistema (global si no se da camara_id)."""
        body = await _cuerpo_json(request)
        estado.desarmar(body.get("camara_id") or None)
        await _difundir_estado()
        return {"ok": True, "armado": estado.resumen_armado()}

    @app.post("/api/v1/horario")
    async def horario(request: Request):
        """Fija la franja horaria de armado (valida HH:MM)."""
        body = await _cuerpo_json(request)
        activo = bool(body.get("activo", False))
        inicio = str(body.get("inicio", "22:00"))
        fin = str(body.get("fin", "08:00"))
        if not _es_hora(inicio) or not _es_hora(fin):
            raise StarletteHTTPException(status_code=422, detail="hora inválida (usa HH:MM)")
        estado.fijar_horario(activo, inicio, fin)
        await _difundir_estado()
        return {"ok": True}

    @app.get("/api/v1/zonas")
    async def obtener_zonas(request: Request):
        """Devuelve zonas y líneas guardadas de una cámara."""
        camara = request.query_params.get("camara") or ""
        crudo = almacen.kv_get(f"zonas_{camara}")
        if not crudo:
            return {"zonas": [], "lineas": []}
        try:
            d = json.loads(crudo)
        except (ValueError, TypeError):
            d = {}
        return {"zonas": d.get("zonas", []), "lineas": d.get("lineas", [])}

    @app.post("/api/v1/zonas")
    async def guardar_zonas(request: Request):
        """Persiste zonas/líneas de una cámara y las reconstruye en caliente."""
        body = await _cuerpo_json(request)
        camara_id = str(body.get("camara_id") or "")
        if not camara_id:
            raise StarletteHTTPException(status_code=422, detail="falta camara_id")
        try:
            zonas = _validar_zonas(body.get("zonas") or [])
            lineas = _validar_lineas(body.get("lineas") or [])
        except ValueError as e:
            raise StarletteHTTPException(status_code=422, detail=str(e))
        almacen.kv_set(f"zonas_{camara_id}", json.dumps({"zonas": zonas, "lineas": lineas}))
        aplicar = ctx.get("aplicar_zonas")
        if callable(aplicar):
            try:
                aplicar(camara_id, zonas, lineas)
            except Exception:  # noqa: BLE001
                _log.exception("aplicar_zonas falló para %s", camara_id)
        return {"ok": True}

    @app.post("/api/v1/config")
    async def config_parcial(request: Request):
        """Aplica una config parcial en caliente y la persiste en config.yaml."""
        body = await _cuerpo_json(request)
        aplicar = ctx.get("aplicar_config")
        if callable(aplicar):
            try:
                aplicar(body)
            except Exception:  # noqa: BLE001
                _log.exception("aplicar_config falló")
                raise StarletteHTTPException(status_code=422, detail="config no aplicable")
        try:
            guardar_config(cfg)
        except Exception:  # noqa: BLE001
            _log.exception("no se pudo guardar config.yaml")
        return {"ok": True}

    @app.get("/api/v1/stats")
    async def stats(request: Request):
        """Estadísticas del día (§5) con el aforo_actual inyectado desde ctx."""
        qp = request.query_params
        dia = qp.get("dia") or datetime.now().strftime("%Y-%m-%d")
        camara = qp.get("camara") or None
        datos = almacen.stats_dia(dia, camara)
        f_aforo = ctx.get("aforo_actual")
        if callable(f_aforo):
            try:
                datos["aforo_actual"] = int(f_aforo(camara) or 0)
            except Exception:  # noqa: BLE001
                datos["aforo_actual"] = 0
        return datos

    # --- WS /api/v1/eventos (§6) ---------------------------------------------
    # Suscripción ÚNICA al bus (puente hilo→asyncio). El bus corre en hilos; aquí
    # solo hacemos call_soon_threadsafe hacia el loop del WS.
    def _on_evento_nuevo(datos: dict) -> None:
        reg = datos.get("registro", datos)
        if isinstance(reg, dict):
            gws.emitir_desde_hilo({"tipo": "alerta", "registro": _enriquecer_nombre(dict(reg))})

    def _on_clip_listo(datos: dict) -> None:
        evento_id = datos.get("evento_id")
        if not evento_id:
            return
        ev = almacen.evento(evento_id)
        if ev is None:
            return
        # Re-emite la MISMA alerta ya con clip:true (llega un 2º mensaje, §6).
        reg = {k: ev[k] for k in (
            "id", "ts", "camara_id", "camara_nombre", "tipo", "nivel", "texto",
            "track_id", "miniatura") if k in ev}
        reg["clip"] = True
        gws.emitir_desde_hilo({"tipo": "alerta", "registro": _enriquecer_nombre(reg)})

    from .bus import bus as _bus
    _bus.suscribir("evento.nuevo", _on_evento_nuevo)
    _bus.suscribir("evento.clip_listo", _on_clip_listo)

    @app.websocket("/api/v1/eventos")
    async def ws_eventos(ws: WebSocket):
        """Canal de alertas en tiempo real. Valida token ANTES de aceptar (§4/§6)."""
        if not token_valido(ws.query_params.get("token")):
            await ws.close(code=1008)
            return
        await ws.accept()
        gws.loop = asyncio.get_running_loop()
        cola: asyncio.Queue = asyncio.Queue(maxsize=200)
        gws.registrar(cola)

        # Saludo inicial.
        await ws.send_json({
            "tipo": "hola", "version": VERSION,
            "armado": estado.resumen_armado(), "camaras": _camaras_estado(),
        })

        async def consumidor():
            # ÚNICO emisor por este WS (evita envíos concurrentes que corromperían la trama).
            while True:
                msg = await cola.get()
                await ws.send_json(msg)

        async def receptor():
            # Lee del cliente (pong/keepalive) y detecta la desconexión.
            while True:
                await ws.receive()

        async def periodico():
            # 'estado' cada 10 s; 'ping' cada 20 s.
            n = 0
            while True:
                await asyncio.sleep(10)
                await cola.put({
                    "tipo": "estado", "camaras": _camaras_estado(),
                    "armado": estado.resumen_armado(),
                })
                n += 1
                if n % 2 == 0:
                    await cola.put({"tipo": "ping", "ts": int(time.time() * 1000)})

        tareas = [asyncio.create_task(t()) for t in (consumidor, receptor, periodico)]
        try:
            await asyncio.wait(tareas, return_when=asyncio.FIRST_COMPLETED)
        except Exception:  # noqa: BLE001
            pass
        finally:
            for t in tareas:
                t.cancel()
            gws.quitar(cola)

    # --- PROXY go2rtc: HTTP en streaming -------------------------------------
    @app.api_route("/go2rtc/{resto:path}", methods=["GET", "HEAD"])
    async def proxy_go2rtc(resto: str, request: Request):
        """Proxy autenticado hacia el go2rtc local (streaming, quita el token)."""
        destino = f"http://127.0.0.1:{cfg.go2rtc.puerto_api}/{resto}"
        params = [(k, v) for k, v in request.query_params.multi_items() if k != "token"]
        headers = {k: v for k, v in request.headers.items()
                   if k.lower() not in _HOP and k.lower() != "x-vigia-token"}
        # trust_env=False: no enrutar 127.0.0.1 por ningún proxy del entorno.
        cliente = httpx.AsyncClient(timeout=None, trust_env=False)
        try:
            req = cliente.build_request(
                request.method, destino, params=params, headers=headers)
            resp = await cliente.send(req, stream=True)
        except Exception:  # noqa: BLE001
            await cliente.aclose()
            raise StarletteHTTPException(status_code=502, detail="go2rtc no responde")
        cabeceras = {k: v for k, v in resp.headers.items() if k.lower() not in _HOP}

        async def _cerrar():
            await resp.aclose()
            await cliente.aclose()

        return StreamingResponse(
            resp.aiter_raw(), status_code=resp.status_code,
            headers=cabeceras, media_type=resp.headers.get("content-type"),
            background=BackgroundTask(_cerrar))

    # --- PROXY go2rtc: WebSocket bidireccional (texto + BINARIO) --------------
    @app.websocket("/go2rtc/api/ws")
    async def proxy_go2rtc_ws(ws: WebSocket):
        """Puente WS↔WS hacia go2rtc (MSE: los segmentos fMP4 viajan como binario)."""
        if not token_valido(ws.query_params.get("token")):
            await ws.close(code=1008)
            return
        await ws.accept()
        cadena = "&".join(f"{k}={v}" for k, v in ws.query_params.multi_items()
                          if k != "token")
        url = f"ws://127.0.0.1:{cfg.go2rtc.puerto_api}/api/ws"
        if cadena:
            url += f"?{cadena}"
        try:
            arriba = await websockets.connect(url, max_size=None, open_timeout=10)
        except Exception:  # noqa: BLE001
            _log.warning("no se pudo conectar al WS de go2rtc")
            await ws.close(code=1011)
            return

        async def cliente_a_arriba():
            while True:
                msg = await ws.receive()
                if msg.get("type") == "websocket.disconnect":
                    break
                if msg.get("text") is not None:
                    await arriba.send(msg["text"])
                elif msg.get("bytes") is not None:
                    await arriba.send(msg["bytes"])

        async def arriba_a_cliente():
            async for trama in arriba:
                if isinstance(trama, (bytes, bytearray)):
                    await ws.send_bytes(bytes(trama))
                else:
                    await ws.send_text(trama)

        tareas = [asyncio.create_task(cliente_a_arriba()),
                  asyncio.create_task(arriba_a_cliente())]
        try:
            await asyncio.wait(tareas, return_when=asyncio.FIRST_COMPLETED)
        except Exception:  # noqa: BLE001
            pass
        finally:
            for t in tareas:
                t.cancel()
            try:
                await arriba.close()
            except Exception:  # noqa: BLE001
                pass
            try:
                await ws.close()
            except Exception:  # noqa: BLE001
                pass

    _log.info("API VIGÍA creada (versión %s)", VERSION)
    return app


# --- validadores (fuera de la app: sin efectos en import) --------------------
def _es_hora(s: str) -> bool:
    """Valida formato HH:MM (00:00–23:59)."""
    try:
        h, m = str(s).split(":")
        return 0 <= int(h) <= 23 and 0 <= int(m) <= 59 and len(m) == 2
    except (ValueError, AttributeError):
        return False


def _norm_punto(p: dict) -> dict:
    """Valida un punto {x,y} normalizado 0..1."""
    x, y = float(p["x"]), float(p["y"])
    if not (0.0 <= x <= 1.0 and 0.0 <= y <= 1.0):
        raise ValueError("puntos fuera de rango 0..1")
    return {"x": x, "y": y}


def _validar_zonas(zonas: list) -> list[dict]:
    """Valida y normaliza la lista de zonas (forma §5)."""
    salida = []
    for z in zonas:
        if not isinstance(z, dict):
            raise ValueError("zona inválida")
        puntos = z.get("puntos") or []
        if not isinstance(puntos, list) or len(puntos) < 3:
            raise ValueError("una zona necesita al menos 3 puntos")
        salida.append({
            "id": str(z.get("id", "")),
            "tipo": str(z.get("tipo", "")),
            "nombre": str(z.get("nombre", "")),
            "puntos": [_norm_punto(p) for p in puntos],
        })
    return salida


def _validar_lineas(lineas: list) -> list[dict]:
    """Valida y normaliza la lista de líneas (forma §5)."""
    salida = []
    for ln in lineas:
        if not isinstance(ln, dict) or "a" not in ln or "b" not in ln:
            raise ValueError("línea inválida (faltan extremos a/b)")
        salida.append({
            "id": str(ln.get("id", "")),
            "nombre": str(ln.get("nombre", "")),
            "a": _norm_punto(ln["a"]),
            "b": _norm_punto(ln["b"]),
        })
    return salida

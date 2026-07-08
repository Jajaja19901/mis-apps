"""Almacén SQLite del cerebro: eventos, agregados, mapa de calor y kv (agente 3).

Diseño de concurrencia (para no pelear el GIL ni los locks de SQLite):
  · UN SOLO HILO ESCRITOR. Todos los métodos de escritura ENCOLAN una operación
    (SQL + parámetros) en una `queue.Queue` y regresan al instante. El hilo escritor
    consume la cola con su propia conexión y hace `commit` por lotes (cada 50
    operaciones o cada 2 s, lo que ocurra antes).
  · Las LECTURAS abren su PROPIA conexión de solo lectura por llamada. El modo WAL
    permite leer mientras el escritor escribe sin bloquearse.

Esquema EXACTO del contrato §8.3.
"""
from __future__ import annotations

import logging
import os
import queue
import sqlite3
import threading
import time
from datetime import datetime, timedelta

_log = logging.getLogger("vigia.almacen")

# Rejilla del mapa de calor (contrato §5): 48 columnas × 27 filas.
CALOR_COLS = 48
CALOR_FILAS = 27
_CALOR_TOTAL = CALOR_COLS * CALOR_FILAS

# --- SQL de escritura (parametrizado; nunca se interpola valor de usuario) --------
_SQL_EVENTO = (
    "INSERT OR REPLACE INTO eventos"
    "(id, ts, camara_id, tipo, nivel, texto, track_id, miniatura_ruta, clip_ruta, silenciada)"
    " VALUES(?,?,?,?,?,?,?,?,?,?)"
)
_SQL_CLIP = "UPDATE eventos SET clip_ruta=? WHERE id=?"
_SQL_AGREGADO = (
    "INSERT INTO agregados(dia, hora, camara_id, clave, valor) VALUES(?,?,?,?,?)"
    " ON CONFLICT(dia, hora, camara_id, clave) DO UPDATE SET valor = valor + excluded.valor"
)
_SQL_CALOR = (
    "INSERT INTO calor(dia, camara_id, celda, valor) VALUES(?,?,?,?)"
    " ON CONFLICT(dia, camara_id, celda) DO UPDATE SET valor = valor + excluded.valor"
)
_SQL_KV = (
    "INSERT INTO kv(clave, valor) VALUES(?,?)"
    " ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor"
)

# Claves de agregados que la app espera para pintar las estadísticas (§8.3).
_CLAVES_VEHICULOS = ("car", "truck", "bus", "motorcycle", "bicycle")

_PARAR = object()  # centinela para detener el hilo escritor


class Almacen:
    """Persistencia del cerebro en SQLite (`datos/vigia.db`, journal WAL)."""

    def __init__(self, ruta_db: str = "datos/vigia.db",
                 nombres_camaras: dict[str, str] | None = None) -> None:
        self._ruta = ruta_db
        # Mapa id→nombre para reconstruir el REGISTRO §6 al leer del histórico.
        self.nombres_camaras: dict[str, str] = dict(nombres_camaras or {})
        os.makedirs(os.path.dirname(os.path.abspath(ruta_db)) or ".", exist_ok=True)

        # Crea el esquema de forma SÍNCRONA para que exista antes de cualquier lectura.
        conn = sqlite3.connect(self._ruta, timeout=10.0)
        try:
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA synchronous=NORMAL")
            self._crear_esquema(conn)
            conn.commit()
        finally:
            conn.close()

        self._cola: "queue.Queue" = queue.Queue()
        self._cerrado = threading.Event()
        self._hilo = threading.Thread(
            target=self._bucle_escritor, name="almacen-escritor", daemon=True)
        self._hilo.start()
        _log.info("almacén listo en %s (WAL)", self._ruta)

    # --- esquema -----------------------------------------------------------------
    def _crear_esquema(self, conn: sqlite3.Connection) -> None:
        """Crea tablas e índices (contrato §8.3) si no existen."""
        conn.execute(
            "CREATE TABLE IF NOT EXISTS eventos("
            "id TEXT PRIMARY KEY, ts INTEGER, camara_id TEXT, tipo TEXT, nivel TEXT,"
            " texto TEXT, track_id INTEGER, miniatura_ruta TEXT, clip_ruta TEXT,"
            " silenciada INTEGER DEFAULT 0)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_eventos_ts ON eventos(ts)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_eventos_cam_ts ON eventos(camara_id, ts)")
        conn.execute(
            "CREATE TABLE IF NOT EXISTS agregados("
            "dia TEXT, hora INTEGER, camara_id TEXT, clave TEXT, valor INTEGER,"
            " PRIMARY KEY(dia, hora, camara_id, clave))")
        conn.execute(
            "CREATE TABLE IF NOT EXISTS calor("
            "dia TEXT, camara_id TEXT, celda INTEGER, valor INTEGER,"
            " PRIMARY KEY(dia, camara_id, celda))")
        conn.execute("CREATE TABLE IF NOT EXISTS kv(clave TEXT PRIMARY KEY, valor TEXT)")

    # --- hilo escritor -----------------------------------------------------------
    def _bucle_escritor(self) -> None:
        """Único hilo que escribe: aplica lotes y confirma cada 50 ops o 2 s."""
        conn = sqlite3.connect(self._ruta, check_same_thread=False, timeout=30.0)
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
        pendientes = 0
        ultimo_commit = time.monotonic()
        parar = False
        try:
            while not parar:
                try:
                    item = self._cola.get(timeout=1.0)
                except queue.Empty:
                    item = None
                if item is _PARAR:
                    parar = True
                elif item is not None:
                    sql, params = item
                    try:
                        conn.execute(sql, params)
                        pendientes += 1
                    except Exception as e:  # noqa: BLE001 — una op rota no tumba el hilo
                        _log.warning("operación de escritura falló: %s", e)
                ahora = time.monotonic()
                if pendientes and (parar or pendientes >= 50 or ahora - ultimo_commit >= 2.0):
                    try:
                        conn.commit()
                    except Exception as e:  # noqa: BLE001
                        _log.warning("commit falló: %s", e)
                    pendientes = 0
                    ultimo_commit = ahora
        finally:
            try:
                conn.commit()
            except Exception:  # noqa: BLE001
                pass
            conn.close()
            _log.info("hilo escritor del almacén detenido")

    def _encolar(self, sql: str, params: tuple) -> None:
        """Encola una operación de escritura (no bloquea al llamante)."""
        if self._cerrado.is_set():
            return
        self._cola.put((sql, params))

    def _leer(self) -> sqlite3.Connection:
        """Abre una conexión de SOLO LECTURA nueva (WAL permite lecturas concurrentes)."""
        conn = sqlite3.connect(self._ruta, check_same_thread=False, timeout=10.0)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA query_only=1")
        return conn

    # --- escrituras --------------------------------------------------------------
    def guardar_evento(self, registro: dict) -> None:
        """Guarda un evento (forma REGISTRO §6 + miniatura_ruta/clip_ruta/silenciada)."""
        track = registro.get("track_id")
        self._encolar(_SQL_EVENTO, (
            str(registro.get("id")),
            int(registro.get("ts", 0)),
            str(registro.get("camara_id", "")),
            str(registro.get("tipo", "")),
            str(registro.get("nivel", "")),
            str(registro.get("texto", "")),
            int(track) if track is not None else None,
            registro.get("miniatura_ruta") or None,
            registro.get("clip_ruta") or None,
            1 if registro.get("silenciada") else 0,
        ))

    def actualizar_clip(self, evento_id: str, clip_ruta: str | None) -> None:
        """Fija (o borra con None) la ruta del clip de un evento ya guardado."""
        self._encolar(_SQL_CLIP, (clip_ruta or None, str(evento_id)))

    def incrementar(self, dia: str, hora: int, camara_id: str, clave: str, n: int = 1) -> None:
        """Suma `n` al agregado (dia, hora, camara_id, clave)."""
        self._encolar(_SQL_AGREGADO, (str(dia), int(hora), str(camara_id), str(clave), int(n)))

    def sumar_calor(self, dia: str, camara_id: str, celdas: dict[int, int]) -> None:
        """Suma ocupaciones al mapa de calor: {celda: n} (celda = fila*48 + col)."""
        for celda, n in celdas.items():
            self._encolar(_SQL_CALOR, (str(dia), str(camara_id), int(celda), int(n)))

    def kv_set(self, clave: str, valor: str) -> None:
        """Guarda un valor de texto en la tabla kv (p. ej. 'zonas_cam1' con JSON)."""
        self._encolar(_SQL_KV, (str(clave), str(valor)))

    # --- lecturas ----------------------------------------------------------------
    def _fila_a_registro(self, fila: sqlite3.Row) -> dict:
        """Convierte una fila de `eventos` en un REGISTRO §6 (miniatura/clip como bool)."""
        cid = fila["camara_id"]
        return {
            "id": fila["id"],
            "ts": fila["ts"],
            "camara_id": cid,
            "camara_nombre": self.nombres_camaras.get(cid, cid),
            "tipo": fila["tipo"],
            "nivel": fila["nivel"],
            "texto": fila["texto"],
            "track_id": fila["track_id"],
            "miniatura": bool(fila["miniatura_ruta"]),
            "clip": bool(fila["clip_ruta"]),
        }

    def eventos(self, desde: int | None = None, hasta: int | None = None,
                camara: str | None = None, nivel: str | None = None,
                limite: int = 200) -> list[dict]:
        """Devuelve eventos (REGISTRO §6) filtrados, orden descendente por ts."""
        clausulas: list[str] = []
        params: list = []
        if desde is not None:
            clausulas.append("ts >= ?")
            params.append(int(desde))
        if hasta is not None:
            clausulas.append("ts <= ?")
            params.append(int(hasta))
        if camara:
            clausulas.append("camara_id = ?")
            params.append(str(camara))
        if nivel:
            clausulas.append("nivel = ?")
            params.append(str(nivel))
        where = (" WHERE " + " AND ".join(clausulas)) if clausulas else ""
        lim = max(1, min(2000, int(limite)))
        sql = f"SELECT * FROM eventos{where} ORDER BY ts DESC LIMIT ?"
        params.append(lim)
        conn = self._leer()
        try:
            filas = conn.execute(sql, tuple(params)).fetchall()
        finally:
            conn.close()
        return [self._fila_a_registro(f) for f in filas]

    def evento(self, evento_id: str) -> dict | None:
        """Devuelve un evento con las RUTAS REALES (para servir miniatura/clip) o None."""
        conn = self._leer()
        try:
            fila = conn.execute(
                "SELECT * FROM eventos WHERE id = ?", (str(evento_id),)).fetchone()
        finally:
            conn.close()
        if fila is None:
            return None
        d = self._fila_a_registro(fila)
        d["miniatura_ruta"] = fila["miniatura_ruta"]
        d["clip_ruta"] = fila["clip_ruta"]
        d["silenciada"] = bool(fila["silenciada"])
        return d

    def kv_get(self, clave: str, defecto=None):
        """Lee un valor de la tabla kv (o `defecto` si no existe)."""
        conn = self._leer()
        try:
            fila = conn.execute(
                "SELECT valor FROM kv WHERE clave = ?", (str(clave),)).fetchone()
        finally:
            conn.close()
        return fila["valor"] if fila is not None else defecto

    def _agregados_dia(self, conn: sqlite3.Connection, dia: str,
                       camara: str | None) -> dict[tuple[int, str], int]:
        """Lee todos los agregados de un día como {(hora, clave): valor sumado}."""
        if camara:
            filas = conn.execute(
                "SELECT hora, clave, SUM(valor) AS v FROM agregados"
                " WHERE dia = ? AND camara_id = ? GROUP BY hora, clave",
                (dia, camara)).fetchall()
        else:
            filas = conn.execute(
                "SELECT hora, clave, SUM(valor) AS v FROM agregados"
                " WHERE dia = ? GROUP BY hora, clave", (dia,)).fetchall()
        return {(int(f["hora"]), f["clave"]): int(f["v"] or 0) for f in filas}

    def stats_dia(self, dia: str, camara: str | None = None) -> dict:
        """Estadísticas de un día con la forma EXACTA de GET /stats (§5).

        Agrega todas las cámaras si `camara` es None. `aforo_actual` se deja a 0:
        lo inyecta la API con ctx["aforo_actual"]. `pico_aforo` se estima como el
        máximo de visitantes por hora (no se guarda aforo concurrente en el esquema).
        """
        try:
            d = datetime.strptime(dia, "%Y-%m-%d")
            ayer = (d - timedelta(days=1)).strftime("%Y-%m-%d")
        except ValueError:
            ayer = ""

        conn = self._leer()
        try:
            hoy = self._agregados_dia(conn, dia, camara)
            ag_ayer = self._agregados_dia(conn, ayer, camara) if ayer else {}

            por_hora = [hoy.get((h, "visitantes"), 0) for h in range(24)]
            por_hora_ayer = [ag_ayer.get((h, "visitantes"), 0) for h in range(24)]

            def _suma(datos: dict, clave: str) -> int:
                return sum(v for (h, k), v in datos.items() if k == clave)

            entradas = _suma(hoy, "entradas")
            salidas = _suma(hoy, "salidas")
            a_info = _suma(hoy, "alerta_info")
            a_sosp = _suma(hoy, "alerta_sospecha")
            a_crit = _suma(hoy, "alerta_critico")
            vehiculos = {v: _suma(hoy, f"veh_{v}") for v in _CLAVES_VEHICULOS}

            # Mapa de calor: {celda: valor} → array denso de 48*27.
            if camara:
                filas = conn.execute(
                    "SELECT celda, SUM(valor) AS v FROM calor"
                    " WHERE dia = ? AND camara_id = ? GROUP BY celda",
                    (dia, camara)).fetchall()
            else:
                filas = conn.execute(
                    "SELECT celda, SUM(valor) AS v FROM calor"
                    " WHERE dia = ? GROUP BY celda", (dia,)).fetchall()
        finally:
            conn.close()

        celdas = [0] * _CALOR_TOTAL
        for f in filas:
            c = int(f["celda"])
            if 0 <= c < _CALOR_TOTAL:
                celdas[c] = int(f["v"] or 0)

        return {
            "dia": dia,
            "por_hora": por_hora,
            "por_hora_ayer": por_hora_ayer,
            "entradas": entradas,
            "salidas": salidas,
            "alertas": {
                "info": a_info,
                "sospecha": a_sosp,
                "critico": a_crit,
                "total": a_info + a_sosp + a_crit,
            },
            "vehiculos": vehiculos,
            "pico_aforo": max(por_hora) if por_hora else 0,
            "aforo_actual": 0,  # lo inyecta la API
            "mapa_calor": {"cols": CALOR_COLS, "filas": CALOR_FILAS, "celdas": celdas},
        }

    # --- cierre ------------------------------------------------------------------
    def cerrar(self) -> None:
        """Vacía la cola pendiente, detiene el hilo escritor y cierra."""
        if self._cerrado.is_set():
            return
        self._cerrado.set()
        self._cola.put(_PARAR)
        self._hilo.join(timeout=10.0)

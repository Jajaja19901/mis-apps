"""Analítica espacial y de comportamiento por cámara (misma semántica que la v1).

Traduce a Python la lógica de `modulos/03-zonas.js` (zonas, líneas, merodeo, cola,
plazas, cruces, objeto abandonado) y las de comportamiento de `modulos/02-gestos.js`
que no necesitan pose (caída y carrera), más las nuevas del contrato v2
(vehículo detenido, aforo, mapa de calor).

Usa PIEZAS NATIVAS de `supervision`:
- `sv.PolygonZone` por zona. Anclaje BOTTOM_CENTER (punto de pie) para las pruebas
  sobre personas; anclaje CENTER para vehículos en plazas y zonas de detención
  (igual que la v1, que usaba el pie para personas y el centro para vehículos).
- `sv.LineZone(minimum_crossing_threshold=2)` por línea (anti-jitter nativo).

`evaluar()` devuelve EVENTOS PARCIALES `{tipo, nivel_sugerido, texto, track_id, …}`.
Quién decide si se alerta (armado, cooldowns, mascotas) es `alertas.py`; aquí solo se
describe lo que se ve. Los umbrales son CONSTANTES DE CLASE (los ajustará /config).

Reglas del contrato §0: nada corre en el import (supervision/numpy se importan de
forma perezosa); español en textos; nada de acusaciones (los textos piden "revisar").
"""
from __future__ import annotations

import logging
from typing import Any

_log = logging.getLogger("vigia.analitica")

# --- Grupos de clase COCO (mismos que la v1) ----------------------------------
_PERSONA = frozenset({"person"})
_VEHICULOS = frozenset({"car", "truck", "bus", "motorcycle", "bicycle"})
_BOLSAS = frozenset({"backpack", "handbag", "suitcase"})
_ANIMALES = frozenset({"dog", "cat", "bird"})

_ANIMAL_ES = {"dog": "perro", "cat": "gato", "bird": "pájaro"}


class Analitica:
    """Evalúa una cámara: zonas, líneas y comportamientos → eventos parciales.

    Instancia UNA por cámara. `cargar_zonas()` (en caliente desde POST /zonas) fija
    las formas en 0-1; se convierten a píxeles la primera vez que se conoce el tamaño
    real del fotograma y se reconstruyen si el tamaño cambia.
    """

    # --- Umbrales (constantes de clase; los toca /config en el futuro) --------
    MERODEO_SEG = 30.0            # permanencia en zona para "merodeo"
    MERODEO_COOLDOWN_SEG = 60.0
    COLA_N = 4                    # personas en zona 'caja' para "cola"
    COLA_SEG = 45.0
    COLA_COOLDOWN_SEG = 120.0
    PLAZA_ANTIPARPADEO_SEG = 2.0  # anti-parpadeo ocupar/liberar una plaza
    CONBOLSA_DIST_REL = 0.10      # bolsa "cerca" si su centro < 10% del ancho
    CARRERA_VEL_REL = 0.22        # vel > 0.22·ancho ⇒ carrera
    CARRERA_SOSTENIDA_SEG = 0.6
    CARRERA_COOLDOWN_SEG = 15.0
    CAIDA_VERTICAL_RATIO = 1.2    # al/an > 1.2 ⇒ de pie
    CAIDA_HORIZONTAL_RATIO = 1.3  # an/al > 1.3 ⇒ tumbado
    CAIDA_SEG = 3.0
    ABANDONO_SEG = 30.0
    ABANDONO_DIST_REL = 0.18      # persona más cercana a > 18% del ancho
    DETENIDO_DESPLAZ_REL = 0.02   # desplazamiento < 2% del ancho ⇒ quieto
    DETENIDO_VENTANA_SEG = 2.0    # ventana para medir el desplazamiento
    DETENIDO_ACUM_SEG = 60.0      # tiempo quieto acumulado para avisar
    DETENIDO_COOLDOWN_SEG = 120.0
    AFORO_COOLDOWN_SEG = 60.0
    CALOR_COLS = 48               # rejilla del mapa de calor (48×27)
    CALOR_FILAS = 27
    OLVIDO_MS = 10000             # se olvida el estado de un track no visto > 10 s

    def __init__(self, camara_cfg: Any, deteccion_cfg: Any) -> None:
        self._cam = camara_cfg
        self._det_cfg = deteccion_cfg
        self._np = None
        self._sv = None

        # Formas crudas (0-1) y sus versiones compiladas a supervision.
        self._zonas_raw: list[dict] = []
        self._lineas_raw: list[dict] = []
        self._zonas: list[dict] = []   # {ref, pz_pie, pz_centro?}
        self._lineas: list[dict] = []  # {ref, lz}
        self._w = 0
        self._h = 0

        # Estado temporal (por track / por track×zona), como en la v1.
        self._presencia: dict[str, dict] = {}   # 'tid|zonaId' -> {dentro, desde, merodeo}
        self._cola: dict[str, dict] = {}        # zonaId -> {desde, aviso}
        self._plaza: dict[str, dict] = {}       # zonaId -> {ocupada, cand, desde}
        self._detenido: dict[str, dict] = {}    # 'tid|zonaId' -> estado de detención
        self._bolsa: dict[int, dict] = {}       # tid -> {desde, alertado}
        self._carrera: dict[int, dict] = {}     # tid -> {rapido_desde, ultima}
        self._caida: dict[int, dict] = {}       # tid -> {vertical, horiz_desde, disparada}
        self._animales_vistos: dict[int, int] = {}  # tid -> ts
        self._ultima_vez: dict[int, int] = {}   # tid -> ts
        self._aforo_ultima: int = 0             # ts del último aviso de aforo
        self._plazas_ult: tuple | None = None   # último (libres, total) emitido

        # Contadores públicos (los lee camaras.py para el almacén / stats).
        self.entradas: int = 0
        self.salidas: int = 0
        self.cruces_vehiculos: dict[str, dict] = {}  # clase -> {'entrada':n,'salida':n}
        self.calor_pendiente: dict[int, int] = {}    # celda -> conteo (camaras.py vacía)
        self.aforo_max: int = 50                     # ajustable vía POST /config
        self._personas_visibles: int = 0

    # --- Configuración -------------------------------------------------------
    def _asegurar_libs(self) -> None:
        """Import perezoso de numpy/supervision con mensaje claro si faltan."""
        if self._sv is not None:
            return
        try:
            import numpy as np  # type: ignore
            import supervision as sv  # type: ignore
        except ImportError as e:  # pragma: no cover - depende del entorno
            raise ImportError(
                "Falta 'supervision' (y numpy) para la analítica. "
                "Instala con: pip install -r requirements.txt"
            ) from e
        self._np = np
        self._sv = sv

    def cargar_zonas(self, zonas: list[dict], lineas: list[dict]) -> None:
        """Fija zonas y líneas (formas del §5, coordenadas 0-1). Reconstruye en caliente.

        Guarda las formas crudas; los objetos de supervision se (re)construyen cuando
        se conoce el tamaño del fotograma (en `evaluar`) o si éste cambia.
        """
        self._zonas_raw = [dict(z) for z in (zonas or [])]
        self._lineas_raw = [dict(l) for l in (lineas or [])]
        # Fuerza la reconstrucción en el próximo evaluar.
        self._w = 0
        self._h = 0
        self._zonas = []
        self._lineas = []
        # Reinicia el estado espacial dependiente de las formas anteriores.
        self._presencia.clear()
        self._cola.clear()
        self._plaza.clear()
        self._detenido.clear()
        _log.info("[%s] zonas=%d lineas=%d cargadas",
                  getattr(self._cam, "id", "?"), len(self._zonas_raw), len(self._lineas_raw))

    def fijar_aforo_max(self, valor: int) -> None:
        """Setter del aforo máximo (lo llama /config)."""
        try:
            self.aforo_max = max(1, int(valor))
        except (TypeError, ValueError):
            pass

    def _reconstruir(self, w: int, h: int) -> None:
        """Compila las formas 0-1 a `PolygonZone`/`LineZone` en píxeles (w×h)."""
        self._asegurar_libs()
        np, sv = self._np, self._sv
        self._w, self._h = w, h
        pos = sv.Position

        self._zonas = []
        for z in self._zonas_raw:
            puntos = z.get("puntos") or []
            if len(puntos) < 3:
                continue
            poligono = np.array([[p["x"] * w, p["y"] * h] for p in puntos], dtype=np.int32)
            entrada = {
                "ref": z,
                # Personas: punto de pie (BOTTOM_CENTER) para entrada/merodeo/cola.
                "pz_pie": sv.PolygonZone(polygon=poligono,
                                         triggering_anchors=(pos.BOTTOM_CENTER,)),
                "pz_centro": None,
            }
            # Vehículos por CENTRO en plazas y zonas de detención (igual que la v1).
            if z.get("tipo") in ("plaza", "detencion"):
                entrada["pz_centro"] = sv.PolygonZone(
                    polygon=poligono, triggering_anchors=(pos.CENTER,))
            self._zonas.append(entrada)

        self._lineas = []
        for l in self._lineas_raw:
            a, b = l.get("a"), l.get("b")
            if not a or not b:
                continue
            lz = sv.LineZone(
                start=sv.Point(a["x"] * w, a["y"] * h),
                end=sv.Point(b["x"] * w, b["y"] * h),
                triggering_anchors=(pos.BOTTOM_CENTER,),
                minimum_crossing_threshold=2,
            )
            self._lineas.append({"ref": l, "lz": lz})

    # --- Evaluación por fotograma -------------------------------------------
    def evaluar(self, tracks: list[Any], ts_ms: int, frame_shape: tuple) -> list[dict]:
        """Evalúa un fotograma y devuelve la lista de eventos parciales.

        `frame_shape` es (alto, ancho[, canales]) del fotograma de ESTA cámara; si el
        tamaño cambia respecto al conocido, reconstruye las zonas/líneas en píxeles.
        """
        self._asegurar_libs()
        h = int(frame_shape[0])
        w = int(frame_shape[1])
        if w <= 0 or h <= 0:
            return []
        if w != self._w or h != self._h:
            self._reconstruir(w, h)

        eventos: list[dict] = []
        tracks = tracks or []

        personas = [t for t in tracks if t.clase in _PERSONA]
        vehiculos = [t for t in tracks if t.clase in _VEHICULOS]
        bolsas = [t for t in tracks if t.clase in _BOLSAS]

        for t in tracks:
            self._ultima_vez[int(t.id)] = ts_ms
        self._personas_visibles = len(personas)

        # Mapa de calor: pies de personas sobre la rejilla 48×27.
        self._acumular_calor(personas, w, h)

        # Detecciones de supervision reutilizables (alineadas a las listas anteriores).
        det_personas = self._detecciones(personas)
        det_vehiculos = self._detecciones(vehiculos)

        self._eval_zonas(personas, vehiculos, bolsas, det_personas, det_vehiculos, w, ts_ms, eventos)
        self._eval_lineas(personas, vehiculos, ts_ms, eventos)
        self._eval_carrera(personas, w, ts_ms, eventos)
        self._eval_caida(personas, ts_ms, eventos)
        self._eval_abandono(bolsas, personas, w, ts_ms, eventos)
        self._eval_animales(tracks, ts_ms, eventos)
        self._eval_aforo(ts_ms, eventos)

        self._prune(ts_ms)
        return eventos

    # --- Aforo ---------------------------------------------------------------
    def aforo_actual(self) -> int:
        """Aforo estimado: entradas − salidas si hay línea; si no, personas visibles."""
        if self._lineas_raw:
            return max(0, self.entradas - self.salidas)
        return self._personas_visibles

    def _eval_aforo(self, ts_ms: int, eventos: list[dict]) -> None:
        n = self.aforo_actual()
        if n > self.aforo_max and (ts_ms - self._aforo_ultima) >= self.AFORO_COOLDOWN_SEG * 1000:
            self._aforo_ultima = ts_ms
            eventos.append(self._ev("aforo", "sospecha",
                                    f"Aforo por encima del máximo (~{n} personas)"))

    # --- Zonas: entrada/merodeo, cola, plazas, detención ---------------------
    def _eval_zonas(self, personas, vehiculos, bolsas, det_personas, det_vehiculos,
                    w: int, ts_ms: int, eventos: list[dict]) -> None:
        np = self._np
        for zc in self._zonas:
            zona = zc["ref"]
            zid = str(zona.get("id", ""))
            tipo = zona.get("tipo")
            nombre = zona.get("nombre", "zona")

            # Personas dentro (por punto de pie), vía PolygonZone nativa.
            if personas:
                dentro = zc["pz_pie"].trigger(det_personas)
            else:
                dentro = np.zeros(0, dtype=bool)

            # ENTRADA / SALIDA + MERODEO por persona.
            for i, t in enumerate(personas):
                key = f"{t.id}|{zid}"
                esta = bool(dentro[i]) if i < len(dentro) else False
                reg = self._presencia.get(key)
                if esta:
                    if reg is None or not reg["dentro"]:
                        con_bolsa = self._con_bolsa(t, bolsas, w)
                        self._presencia[key] = {"dentro": True, "desde": ts_ms, "merodeo": 0}
                        reg = self._presencia[key]
                        ev = self._evento_entrada(tipo, nombre, t, con_bolsa)
                        if ev:
                            eventos.append(ev)
                    seg = (ts_ms - reg["desde"]) / 1000.0
                    if seg >= self.MERODEO_SEG and (
                            not reg["merodeo"] or (ts_ms - reg["merodeo"]) >= self.MERODEO_COOLDOWN_SEG * 1000):
                        reg["merodeo"] = ts_ms
                        eventos.append(self._ev(
                            "merodeo", "sospecha",
                            f"Permanencia prolongada en {nombre} (~{int(seg)} s)", t.id))
                elif reg and reg["dentro"]:
                    reg["dentro"] = False

            # COLA en zonas 'caja' (nº de personas sostenido).
            if tipo == "caja":
                n = int(dentro.sum()) if len(dentro) else 0
                c = self._cola.get(zid) or {"desde": None, "aviso": 0}
                if n >= self.COLA_N:
                    if not c["desde"]:
                        c["desde"] = ts_ms
                    seg = (ts_ms - c["desde"]) / 1000.0
                    if seg >= self.COLA_SEG and (
                            not c["aviso"] or (ts_ms - c["aviso"]) >= self.COLA_COOLDOWN_SEG * 1000):
                        c["aviso"] = ts_ms
                        eventos.append(self._ev(
                            "cola", "info", f"Cola en {nombre}: {n} personas (~{int(seg)} s)"))
                else:
                    c["desde"] = None
                self._cola[zid] = c

            # PLAZAS: ocupada si un vehículo tiene el CENTRO dentro (anti-parpadeo).
            if tipo == "plaza" and zc["pz_centro"] is not None:
                ocupada_ahora = False
                if vehiculos:
                    ocupada_ahora = bool(zc["pz_centro"].trigger(det_vehiculos).any())
                self._actualizar_plaza(zid, ocupada_ahora, ts_ms)

            # VEHÍCULO DETENIDO en zona 'detencion'.
            if tipo == "detencion" and zc["pz_centro"] is not None and vehiculos:
                dentro_v = zc["pz_centro"].trigger(det_vehiculos)
                for i, t in enumerate(vehiculos):
                    if i < len(dentro_v) and bool(dentro_v[i]):
                        self._eval_detenido(t, zid, nombre, w, ts_ms, eventos)
                    else:
                        self._detenido.pop(f"{t.id}|{zid}", None)

        # Emite el estado de plazas (evento info silencioso) si cambió el recuento.
        self._emitir_plazas(eventos)

    def _evento_entrada(self, tipo, nombre, t, con_bolsa) -> dict | None:
        """Evento al ENTRAR en una zona: prohibida→crítico; sensible+bolsa→sospecha."""
        if tipo == "prohibida":
            return self._ev("zona_prohibida", "critico",
                            f"Persona en zona prohibida ({nombre})", t.id)
        if tipo == "sensible" and con_bolsa:
            return self._ev("zona_sensible", "sospecha",
                            f"Objeto/bolsa en zona sensible ({nombre}) — revisar", t.id)
        return None

    def _actualizar_plaza(self, zid: str, ocupada_ahora: bool, ts_ms: int) -> None:
        """Anti-parpadeo de una plaza (confirma el cambio tras ~2 s estables)."""
        p = self._plaza.get(zid)
        if p is None:
            p = {"ocupada": False, "cand": None, "desde": 0}
            self._plaza[zid] = p
        if ocupada_ahora == p["ocupada"]:
            p["cand"] = None
        elif p["cand"] == ocupada_ahora:
            if (ts_ms - p["desde"]) >= self.PLAZA_ANTIPARPADEO_SEG * 1000:
                p["ocupada"] = ocupada_ahora
                p["cand"] = None
        else:
            p["cand"] = ocupada_ahora
            p["desde"] = ts_ms

    def _emitir_plazas(self, eventos: list[dict]) -> None:
        """Evento silencioso con el recuento de plazas libres, si hay plazas."""
        total = libres = 0
        for zc in self._zonas:
            if zc["ref"].get("tipo") != "plaza":
                continue
            total += 1
            p = self._plaza.get(str(zc["ref"].get("id", "")))
            if not p or not p["ocupada"]:
                libres += 1
        if total <= 0:
            return
        clave = (libres, total)
        if getattr(self, "_plazas_ult", None) != clave:
            self._plazas_ult = clave
            eventos.append({
                "tipo": "plaza_cambio", "nivel_sugerido": "info", "silencioso": True,
                "texto": f"{libres}/{total} plazas libres", "track_id": None,
                "libres": libres, "total": total,
            })

    def _eval_detenido(self, t, zid, nombre, w, ts_ms, eventos) -> None:
        """Vehículo quieto (< 2% del ancho en 2 s) acumulado ≥ 60 s ⇒ sospecha."""
        key = f"{t.id}|{zid}"
        st = self._detenido.get(key)
        if st is None:
            st = {"ref": (t.cx, t.cy), "ref_ts": ts_ms, "quieto_desde": None,
                  "disparada": False, "cooldown": 0}
            self._detenido[key] = st
            return
        if (ts_ms - st["ref_ts"]) >= self.DETENIDO_VENTANA_SEG * 1000:
            despl = ((t.cx - st["ref"][0]) ** 2 + (t.cy - st["ref"][1]) ** 2) ** 0.5
            if despl < self.DETENIDO_DESPLAZ_REL * w:
                if st["quieto_desde"] is None:
                    st["quieto_desde"] = st["ref_ts"]
            else:
                st["quieto_desde"] = None
            st["ref"] = (t.cx, t.cy)
            st["ref_ts"] = ts_ms
        if st["quieto_desde"] is not None:
            acum = (ts_ms - st["quieto_desde"]) / 1000.0
            if acum >= self.DETENIDO_ACUM_SEG and not st["disparada"] and (
                    ts_ms - st["cooldown"]) >= self.DETENIDO_COOLDOWN_SEG * 1000:
                st["disparada"] = True
                st["cooldown"] = ts_ms
                eventos.append(self._ev(
                    "vehiculo_detenido", "sospecha",
                    f"Vehículo detenido en {nombre} (~{int(acum)} s)", t.id))
            elif st["quieto_desde"] is not None and acum < self.DETENIDO_ACUM_SEG:
                st["disparada"] = False

    # --- Líneas: cruces → entradas/salidas y por clase de vehículo -----------
    def _eval_lineas(self, personas, vehiculos, ts_ms, eventos) -> None:
        cruzables = personas + vehiculos
        if not self._lineas or not cruzables:
            return
        det = self._detecciones(cruzables)
        for lc in self._lineas:
            try:
                dentro, fuera = lc["lz"].trigger(det)
            except Exception as e:  # noqa: BLE001 - un cruce raro no tumba la analítica
                _log.debug("LineZone.trigger falló: %s", e)
                continue
            for i, t in enumerate(cruzables):
                entro = bool(dentro[i]) if i < len(dentro) else False
                salio = bool(fuera[i]) if i < len(fuera) else False
                if not (entro or salio):
                    continue
                sentido = "entrada" if entro else "salida"
                if t.clase in _PERSONA:
                    if entro:
                        self.entradas += 1
                    else:
                        self.salidas += 1
                elif t.clase in _VEHICULOS:
                    d = self.cruces_vehiculos.setdefault(t.clase, {"entrada": 0, "salida": 0})
                    d[sentido] += 1
                # Velocidad de vehículos (~aprox.): solo si la cámara está
                # calibrada (px_por_metro en config, ajustable por POST /config).
                # NUNCA como medición legal — es orientativa.
                kmh = None
                ppm = getattr(self._cam, "px_por_metro", None)
                if ppm and t.clase in _VEHICULOS and t.vel_px_s > 0:
                    try:
                        kmh = int(round(t.vel_px_s / float(ppm) * 3.6))
                    except (TypeError, ValueError, ZeroDivisionError):
                        kmh = None
                texto = f"Cruce de línea ({sentido})"
                if kmh is not None:
                    texto += f", ~{kmh} km/h aprox."
                eventos.append({
                    "tipo": "cruce", "nivel_sugerido": "info", "silencioso": True,
                    "texto": texto, "track_id": t.id,
                    "sentido": sentido, "clase": t.clase, "velocidad_kmh": kmh,
                })

    # --- Carrera (velocidad de centroides sostenida) -------------------------
    def _eval_carrera(self, personas, w, ts_ms, eventos) -> None:
        umbral = self.CARRERA_VEL_REL * w
        for t in personas:
            st = self._carrera.get(t.id)
            if st is None:
                st = {"rapido_desde": None, "ultima": 0}
                self._carrera[t.id] = st
            if t.vel_px_s > umbral > 0:
                if st["rapido_desde"] is None:
                    st["rapido_desde"] = ts_ms
                if (ts_ms - st["rapido_desde"]) >= self.CARRERA_SOSTENIDA_SEG * 1000 and (
                        ts_ms - st["ultima"]) >= self.CARRERA_COOLDOWN_SEG * 1000:
                    st["ultima"] = ts_ms
                    eventos.append(self._ev(
                        "carrera", "sospecha",
                        f"Movimiento muy rápido (~{int(t.vel_px_s)} px/s aprox.)", t.id))
            else:
                st["rapido_desde"] = None

    # --- Caída (caja de persona pasa de vertical a horizontal sostenida) -----
    def _eval_caida(self, personas, ts_ms, eventos) -> None:
        for t in personas:
            x1, y1, x2, y2 = t.caja
            an, al = x2 - x1, y2 - y1
            if an <= 0 or al <= 0:
                continue
            st = self._caida.get(t.id)
            if st is None:
                st = {"vertical": False, "horiz_desde": None, "disparada": False}
                self._caida[t.id] = st
            es_vertical = (al / an) > self.CAIDA_VERTICAL_RATIO
            es_horizontal = (an / al) > self.CAIDA_HORIZONTAL_RATIO
            if es_vertical:
                st["vertical"] = True
                st["horiz_desde"] = None
                st["disparada"] = False
            elif es_horizontal:
                if st["horiz_desde"] is None:
                    st["horiz_desde"] = ts_ms
                seg = (ts_ms - st["horiz_desde"]) / 1000.0
                if not st["disparada"] and st["vertical"] and seg >= self.CAIDA_SEG:
                    st["disparada"] = True
                    st["vertical"] = False
                    eventos.append(self._ev(
                        "caida", "critico",
                        "Posible caída de una persona — revisar", t.id))
            else:
                st["horiz_desde"] = None

    # --- Objeto abandonado (bolsa lejos de cualquier persona ≥ 30 s) ---------
    def _eval_abandono(self, bolsas, personas, w, ts_ms, eventos) -> None:
        umbral = self.ABANDONO_DIST_REL * w
        for t in bolsas:
            dist_min = float("inf")
            for p in personas:
                d = ((t.cx - p.cx) ** 2 + (t.cy - p.cy) ** 2) ** 0.5
                if d < dist_min:
                    dist_min = d
            st = self._bolsa.get(t.id)
            if dist_min > umbral:
                if st is None:
                    st = {"desde": ts_ms, "alertado": False}
                    self._bolsa[t.id] = st
                seg = (ts_ms - st["desde"]) / 1000.0
                if not st["alertado"] and seg >= self.ABANDONO_SEG:
                    st["alertado"] = True
                    eventos.append(self._ev(
                        "objeto_abandonado", "sospecha",
                        f"Objeto sin vigilancia (~{int(seg)} s) — revisar", t.id))
            elif st is None:
                self._bolsa[t.id] = {"desde": ts_ms, "alertado": False}
            else:
                st["desde"] = ts_ms  # dueño cerca: reinicia el reloj (conserva 'alertado')

    # --- Animales nuevos ------------------------------------------------------
    def _eval_animales(self, tracks, ts_ms, eventos) -> None:
        for t in tracks:
            if t.clase not in _ANIMALES:
                continue
            if int(t.id) not in self._animales_vistos:
                self._animales_vistos[int(t.id)] = ts_ms
                nombre = _ANIMAL_ES.get(t.clase, "animal")
                eventos.append(self._ev("animal", "info", f"Animal detectado ({nombre})", t.id))
            else:
                self._animales_vistos[int(t.id)] = ts_ms

    # --- Utilidades ----------------------------------------------------------
    def _detecciones(self, tracks: list[Any]) -> Any:
        """Construye un `sv.Detections` (xyxy + tracker_id) a partir de una lista de Track."""
        np, sv = self._np, self._sv
        if not tracks:
            return sv.Detections.empty()
        xyxy = np.array([t.caja for t in tracks], dtype=float).reshape(-1, 4)
        tracker_id = np.array([int(t.id) for t in tracks], dtype=int)
        class_id = np.zeros(len(tracks), dtype=int)
        return sv.Detections(xyxy=xyxy, tracker_id=tracker_id, class_id=class_id)

    def _con_bolsa(self, persona: Any, bolsas: list[Any], w: int) -> bool:
        """¿La persona lleva bolsa? (caja solapa o centro de bolsa < 10% del ancho)."""
        px1, py1, px2, py2 = persona.caja
        for b in bolsas:
            bx1, by1, bx2, by2 = b.caja
            # Solape de cajas (IoU > 0 ⇔ intersección no vacía).
            if bx1 < px2 and bx2 > px1 and by1 < py2 and by2 > py1:
                return True
            d = ((persona.cx - b.cx) ** 2 + (persona.cy - b.cy) ** 2) ** 0.5
            if d < self.CONBOLSA_DIST_REL * w:
                return True
        return False

    def _acumular_calor(self, personas: list[Any], w: int, h: int) -> None:
        """Suma los pies de las personas al mapa de calor (rejilla 48×27)."""
        if w <= 0 or h <= 0:
            return
        for t in personas:
            col = int(t.pie_x / w * self.CALOR_COLS)
            fila = int(t.pie_y / h * self.CALOR_FILAS)
            col = min(max(col, 0), self.CALOR_COLS - 1)
            fila = min(max(fila, 0), self.CALOR_FILAS - 1)
            celda = fila * self.CALOR_COLS + col
            self.calor_pendiente[celda] = self.calor_pendiente.get(celda, 0) + 1

    @staticmethod
    def _ev(tipo: str, nivel: str, texto: str, track_id: int | None = None) -> dict:
        """Construye un evento parcial con la forma del contrato §7."""
        return {"tipo": tipo, "nivel_sugerido": nivel, "texto": texto, "track_id": track_id}

    def _prune(self, ts_ms: int) -> None:
        """Olvida el estado de los tracks no vistos en > 10 s (evita fugas)."""
        muertos = {tid for tid, t in self._ultima_vez.items() if ts_ms - t > self.OLVIDO_MS}
        if not muertos:
            return
        for tid in muertos:
            self._ultima_vez.pop(tid, None)
            self._bolsa.pop(tid, None)
            self._carrera.pop(tid, None)
            self._caida.pop(tid, None)
            self._animales_vistos.pop(tid, None)
        pref = tuple(f"{tid}|" for tid in muertos)
        for k in [k for k in self._presencia if k.startswith(pref)]:
            self._presencia.pop(k, None)
        for k in [k for k in self._detenido if k.startswith(pref)]:
            self._detenido.pop(k, None)

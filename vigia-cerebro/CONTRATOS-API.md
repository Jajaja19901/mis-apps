# CONTRATOS-API.md — VIGÍA v2 · CEREBRO + PUESTO DE MANDO

**Este documento es la FRONTERA entre los dos mundos.** El cerebro (Python) y la app
(HTML v1 ampliada) se construyen en paralelo y solo se ven a través de lo que aquí está
escrito. Si algo no está aquí, no existe. Léelo ENTERO antes de escribir una línea.

---

## 0. Visión y reglas globales

- **OJOS**: cámaras IP domésticas por RTSP (Tapo, Ezviz, Reolink, Imou…).
- **CEREBRO**: proceso Python 24/7 en un mini PC / Raspberry Pi 4-5 / Android+Termux
  (proot debian). Analiza con YOLO11n + `supervision`, guarda evidencia, expone API.
- **MANDO**: la app VIGÍA v1 (`apps/vigia-ia.html`) ampliada con un "modo mando".
  En ese modo el móvil NO analiza nada: solo muestra y manda.

Reglas para TODOS los agentes:
1. Español en textos de usuario, comentarios y logs. Código Python: `snake_case`,
   módulos del paquete `vigia_cerebro/`. Código de la app: prefijos por módulo como
   en la v1 (`mando_`, `mdash_`).
2. **NO reescribir la v1**: la app se amplía con módulos nuevos en `modulos/` que se
   ensamblan igual que los demás. Los ÚNICOS retoques a archivos v1 existentes son los
   del §8.5 (los hace el integrador, ya están hechos — no toques otros).
3. Honestidad: NUNCA "robo/ladrón" — "sospecha para revisión humana". Nada de
   reconocimiento facial ni matrículas. Velocidades siempre "~aprox.".
4. Seguridad: nada responde sin token (§4). Cero keys embebidas: el token se genera
   en la instalación; config del usuario en SU aparato (`config.yaml`, gitignoreado).
5. Python: type hints, docstrings breves en español, sin dependencias fuera de
   `requirements.txt`. Todo error de cámara/red se registra y degrada: el cerebro
   NUNCA muere por una cámara caída.
6. App: mismas reglas que `modulos/CONTRATOS.md` §0 de la v1 (sin console.error, sin
   diálogos nativos bloqueantes, funciones seguras sin conexión, localStorage solo vía
   `nuc_guardar/nuc_cargar`).

## 1. Topología y puertos (en el aparato del cerebro)

```
cámara RTSP ──► go2rtc (:1984 api/ws, :8554 rtsp) ──► frames a Python (RTSP re-servido)
                     ▲                                        │
                     │ proxy autenticado /go2rtc/*            ▼
app móvil ◄── Cloudflare Tunnel ◄── FastAPI (:8420) ◄── detector/analítica/eventos
```

- go2rtc conecta los RTSP de las cámaras y los re-sirve. Python lee frames vía
  OpenCV desde `rtsp://127.0.0.1:8554/{camara_id}` (restream de go2rtc, un solo
  consumo de la cámara real).
- La app SOLO habla con la URL pública del túnel (una sola origin). FastAPI hace de
  **proxy autenticado** hacia go2rtc bajo `/go2rtc/*` (HTTP y WebSocket).
- **Transporte de vídeo en vivo: MSE por WebSocket de go2rtc** (`/go2rtc/api/ws?src={id}`)
  con fallback a **MP4 progresivo** (`/go2rtc/api/stream.mp4?src={id}`).
  ⚠ Decisión de arquitectura: el prompt menciona WebRTC, pero WebRTC necesita
  UDP/ICE que NO atraviesa Cloudflare Tunnel de forma fiable sin TURN. go2rtc sirve
  MSE (H.264 en fMP4 por WS, latencia ~0.5-1 s) que atraviesa el túnel perfectamente.
  Se documenta como decisión honesta en el README. En LAN (URL local) go2rtc sigue
  ofreciendo WebRTC si el navegador quiere, pero el contrato de la app es MSE+MP4.

## 2. Estructura de archivos

```
vigia-cerebro/
├── CONTRATOS-API.md            ← este documento
├── requirements.txt            ← YA escrito por el arquitecto (no añadir deps sin motivo)
├── config.ejemplo.yaml         ← plantilla comentada (la real config.yaml NO se commitea)
├── instalar.sh                 ← [agente 6] instalador asistido para no-técnicos
├── README.md                   ← [agente 6] español simple, 3 hardware con límites honestos
├── systemd/vigia-cerebro.service      [agente 6]
├── termux/instalar-termux.sh          [agente 6]
├── pruebas/
│   ├── camara_falsa.sh         ← [integrador] archivo de vídeo → RTSP vía go2rtc/ffmpeg
│   └── test_flujo.py           ← [integrador] flujo completo end-to-end
└── vigia_cerebro/
    ├── __init__.py             (versión)
    ├── principal.py            ← [integrador] arranque: config → go2rtc → cámaras → API
    ├── configuracion.py        ← YA escrito por el arquitecto: carga config.yaml + token
    ├── estado.py               ← YA escrito: estado compartido + persistencia armado
    ├── bus.py                  ← YA escrito: pub/sub de eventos entre módulos (thread-safe)
    ├── detector.py             ← [1·Opus] YOLO11n + supervision: detección + ByteTrack
    ├── analitica.py            ← [1·Opus] zonas/líneas/dwell/caída/carrera/abandono/…
    ├── gestos.py               ← [1·Opus] MediaPipe Pose, puntuación ocultación 0-100
    ├── camaras.py              ← [2·Opus] gestor multicámara + go2rtc + watchdog + planificador
    ├── evidencia.py            ← [2·Opus] buffer circular, clips 10+20s con timestamp, miniaturas
    ├── api.py                  ← [3·Opus] FastAPI + WS /eventos + proxy go2rtc + seguridad
    ├── almacen.py              ← [3·Opus] SQLite: eventos, agregados, mapa de calor, kv
    ├── alertas.py              ← [5·Sonnet] niveles, armado/horario, filtro mascotas, cooldowns
    ├── telegram.py             ← [5·Sonnet] mensaje+foto+CLIP con cola de reintentos persistente
    └── retencion.py            ← [5·Sonnet] rotación de disco (borra lo más viejo al llegar al límite)
```

App (v1): módulos nuevos `modulos/11-mando.js` + `11-mando.html` [4·Opus] y
`modulos/12-mandodash.js` + `12-mandodash.html` [7·Sonnet]. Slots ya añadidos (§8.5).

## 3. `config.yaml` (esquema; el ejemplo comentado ya existe)

```yaml
token: "..."                 # generado por instalar.sh (32 hex). NUNCA en git.
puerto_api: 8420
go2rtc:
  binario: "./bin/go2rtc"    # lo descarga instalar.sh
  puerto_api: 1984
  puerto_rtsp: 8554
evidencia:
  carpeta: "./datos/clips"
  limite_gb: 5               # rotación: borrar lo más viejo al superarlo
  pre_seg: 10
  post_seg: 20
telegram:
  token: ""                  # opcional
  chat_id: ""
armado:                      # persistido también en runtime (estado.py)
  global: true
  horario: { activo: false, inicio: "22:00", fin: "08:00" }   # armado solo en franja
deteccion:
  imgsz: 416                 # configurable
  confianza: 0.35
  dispositivo: "cpu"
camaras:
  - id: "cam1"               # [a-z0-9_], único
    nombre: "Entrada"
    rtsp: "rtsp://usuario:clave@192.168.1.60:554/stream1"
    modo: "comercio"         # comercio | casa | parking
    prioridad: 3             # 1-3; 3 = alta (recibe más ciclos y análisis de gestos)
    armada: true
    ignorar_mascotas: false
    fps_objetivo: 5          # el planificador baja esto si el hardware no llega
```

## 4. Seguridad (idéntica en TODOS los transportes)

- Token de 32 hex generado en la instalación (`secrets.token_hex(16)`).
- HTTP: cabecera `X-Vigia-Token: <token>` obligatoria en TODO endpoint (incluido el
  proxy `/go2rtc/*`). Sin token o token mal → `401 {"error":"token inválido"}` y NADA más.
- WebSocket (`/eventos` y `/go2rtc/api/ws`): el navegador no puede poner cabeceras →
  se acepta ADEMÁS `?token=<token>` en la query. Validar ANTES del upgrade/accept.
- Comparación con `secrets.compare_digest`. HTTPS lo aporta el túnel.
- `GET /salud` es el ÚNICO endpoint sin token: responde `{"ok":true}` (para watchdogs).

## 5. API HTTP (prefijo `/api/v1`, JSON UTF-8, claves en español)

| Método y ruta | Petición | Respuesta 200 |
|---|---|---|
| `GET /api/v1/estado` | — | `{"armado":{"global":true,"horario":{...}},"camaras":[{"id","nombre","modo","prioridad","conectada":true,"armada":true,"fps_real":4.8,"fps_objetivo":5,"ultimo_frame_ts":1730000000000,"ignorar_mascotas":false}],"salud":{"cpu_pct":41.2,"ram_pct":38.0,"disco_clips_gb":1.2,"uptime_seg":86400,"version":"2.0"}}` |
| `GET /api/v1/camaras` | — | `[{"id":"cam1","nombre":"Entrada","modo":"comercio","ancho":1280,"alto":720,"stream_mse":"/go2rtc/api/ws?src=cam1","stream_mp4":"/go2rtc/api/stream.mp4?src=cam1","frame":"/api/v1/frame/cam1"}]` (rutas RELATIVAS a la base; la app añade `?token=`/cabecera) |
| `GET /api/v1/frame/{camara_id}` | — | `image/jpeg` último frame (para dibujar zonas y mosaico de respaldo). 404 si no hay frame aún |
| `GET /api/v1/eventos?desde=&hasta=&camara=&nivel=&limite=` | epoch ms; límite defecto 200 | `{"eventos":[REGISTRO,…]}` orden descendente |
| `GET /api/v1/miniatura/{evento_id}` | — | `image/jpeg` |
| `GET /api/v1/clip/{evento_id}` | — | `video/mp4` descargable (`Content-Disposition: attachment`). 404 si no tiene clip |
| `POST /api/v1/armar` | `{"camara_id":"cam1"}` o `{}` = global | `{"ok":true,"armado":{…como /estado…}}` |
| `POST /api/v1/desarmar` | ídem | ídem |
| `POST /api/v1/horario` | `{"activo":true,"inicio":"22:00","fin":"08:00"}` | `{"ok":true}` |
| `GET /api/v1/zonas?camara=cam1` | — | `{"zonas":[…],"lineas":[…]}` MISMAS formas que la v1 §abajo |
| `POST /api/v1/zonas` | `{"camara_id":"cam1","zonas":[{"id","tipo","nombre","puntos":[{"x":0..1,"y":0..1}]}],"lineas":[{"id","nombre","a":{"x","y"},"b":{"x","y"}}]}` | `{"ok":true}` — reconstruye PolygonZone/LineZone en caliente |
| `POST /api/v1/config` | parcial: `{"camaras":[{"id":"cam1","ignorar_mascotas":true,"fps_objetivo":3}],"deteccion":{"confianza":0.4}}` | `{"ok":true}` aplica en caliente lo aplicable; persiste en config.yaml |
| `GET /api/v1/stats?dia=YYYY-MM-DD&camara=` | defecto hoy, todas | `{"dia":"…","por_hora":[24 enteros],"por_hora_ayer":[24],"entradas":n,"salidas":n,"alertas":{"info":n,"sospecha":n,"critico":n,"total":n},"vehiculos":{"car":n,"truck":n,"bus":n,"motorcycle":n,"bicycle":n},"pico_aforo":n,"aforo_actual":n,"mapa_calor":{"cols":48,"filas":27,"celdas":[…48*27 enteros…]}}` (mismo vocabulario que la v1 para que la app pinte igual) |
| `GET /salud` | — | `{"ok":true}` **sin token** |

Errores: `401` token · `404 {"error":"no existe"}` · `422 {"error":"…"}` validación ·
`500 {"error":"…"}` con log. Nunca trazas de Python al cliente.

## 6. WebSocket `WS /api/v1/eventos?token=…`

Mensajes JSON, campo `tipo` discrimina. Servidor → app:

```jsonc
{"tipo":"hola","version":"2.0","armado":{…},"camaras":[…]}        // al conectar
{"tipo":"alerta","registro":REGISTRO}                              // en tiempo real
{"tipo":"estado","camaras":[…resumen /estado…],"armado":{…}}       // cada 10 s y en cambios
{"tipo":"ping","ts":…}                                             // cada 20 s
```
App → servidor: `{"tipo":"pong","ts":…}` (opcional). Reconexión: responsabilidad de la app.

**REGISTRO** (evento/alerta — misma alma que la v1):
```jsonc
{"id":"e123","ts":1730000000000,"camara_id":"cam1","camara_nombre":"Entrada",
 "tipo":"zona_prohibida",      // vocabulario §7
 "nivel":"critico",            // info | sospecha | critico
 "texto":"Persona en zona prohibida (Almacén)",
 "track_id":7,
 "miniatura":true,             // ⇒ GET /api/v1/miniatura/e123
 "clip":true}                  // ⇒ GET /api/v1/clip/e123 (true cuando el clip TERMINA;
                               //   llega un 2º mensaje alerta con el mismo id actualizado)
```

## 7. Vocabulario de eventos (idéntico a v1 + nuevos)

`aforo, zona_prohibida, zona_sensible, merodeo, cola, carrera, caida, objeto_abandonado,
ocultacion, fuera_horario→(v2: se llama `armado_intrusion`: persona con sistema armado),
animal, sabotaje, vehiculo_detenido` + nuevos v2: `camara_caida` (watchdog, critico),
`camara_recuperada` (info), `cerebro_arrancado` (info).
Niveles por defecto: como v1; `armado_intrusion`=critico; filtro mascotas: si
`ignorar_mascotas` y la cámara está armada, `animal` NO genera alerta (solo evento en BD
con nivel info y `silenciada:true`).

## 8. Contratos por módulo

### YA escritos por el arquitecto (NO tocar, solo usar)
`configuracion.py` — `cargar_config(ruta) -> Config` (dataclasses tipadas del §3, valida,
crea carpetas), `guardar_config(cfg)`, `Config.token`.
`estado.py` — `Estado` singleton thread-safe: `armado_global`, `armado_camara(id)`,
`armar(camara_id|None)`, `desarmar(...)`, `horario`, `esta_armada_ahora(camara_id) -> bool`
(combina global+cámara+franja), persistencia en `datos/estado.json` al cambiar.
`bus.py` — `bus.publicar(tema, datos)`, `bus.suscribir(tema, fn)`; temas:
`deteccion.frame` {camara_id, ts, tracks}, `evento.nuevo` {registro_dict},
`evento.clip_listo` {evento_id, ruta}, `camara.estado` {camara_id, conectada, fps},
`sistema.parar`. Los callbacks corren en el hilo del publicador: NO bloquear (>50 ms → encolar tú).

### 1 · DETECTOR + ANALÍTICA + GESTOS (Opus) — `detector.py`, `analitica.py`, `gestos.py`
- `detector.py`: clase `Detector(cfg)`: carga YOLO11n una vez (`ultralytics`),
  `procesar(camara_id, frame_bgr, ts) -> list[Track]` usando `model(frame, imgsz=cfg.imgsz,
  conf=cfg.confianza, verbose=False)` + `sv.Detections.from_ultralytics` + **un
  `sv.ByteTrack` POR cámara**. `Track` = dataclass {id, clase (nombre COCO en), conf,
  caja_xyxy, cx, cy, pie_x, pie_y, historial deque[(cx,cy,pie,ts)] ~2 s}. Clases de
  interés: person, car, truck, bus, motorcycle, bicycle, backpack, handbag, suitcase,
  dog, cat, bird (filtra el resto).
- `analitica.py`: clase `Analitica(camara_cfg)` con `evaluar(tracks, ts) -> list[dict_evento_parcial]`
  (tipo, texto, track_id, nivel_sugerido). Usa **piezas nativas de supervision**:
  `sv.PolygonZone` por zona, `sv.LineZone(minimum_crossing_threshold=2)` por línea
  (anti-jitter nativo). Implementa con la MISMA semántica v1: entrada/salida de zona
  (punto pie), conBolsa, merodeo (dwell por track×zona ≥ merodeo_seg), cola, plazas,
  cruces→entradas/salidas y por tipo de vehículo, carrera (velocidad centroides,
  umbral relativo al ancho), caída (ratio caja vertical→horizontal ≥3 s), objeto
  abandonado (bolsa sin persona cerca ≥30 s), animal, vehículo detenido (zona
  'detencion', <2% desplazamiento ≥ detencion_seg). `cargar_zonas(zonas, lineas)`
  en caliente (desde POST /zonas; coordenadas 0-1 → píxeles del frame de SU cámara).
  Aforo por cámara: entradas−salidas de su primera línea, o personas visibles.
- `gestos.py`: `Gestos()` con MediaPipe Pose (import perezoso; si no está instalable
  —ARM/Termux— degrada con log claro y `disponible=False`). `procesar(camara_id, frame,
  tracks_persona, ts)` SOLO se llama para cámaras `prioridad==3`. Misma máquina de
  estados v1 (alcanzar→esconder→permanecer, +30/ciclo, decae 2/s, umbral 60 →
  evento `ocultacion` sospecha, cooldown 30 s/track). Corre sobre CROPS de personas
  (no frame entero), máx. 3 personas por frame, y solo 1 de cada 2 frames si tarda >80 ms.
- Todos devuelven eventos PARCIALES; quién decide si se alerta es `alertas.py` (armado,
  cooldowns, mascotas). Publicad en `bus`: `deteccion.frame` y nada más.

### 2 · CÁMARAS + GO2RTC + EVIDENCIA (Opus) — `camaras.py`, `evidencia.py`
- `camaras.py`: `GestorCamaras(cfg, detector, analiticas, gestos)`:
  genera `go2rtc.yaml` desde config (streams: `{id}: [rtsp de la cámara]`) y lanza/
  supervisa el binario go2rtc (subprocess, reinicio si muere, log). Un HILO por cámara
  leyendo `rtsp://127.0.0.1:{puerto_rtsp}/{id}` con OpenCV (`cv2.VideoCapture`,
  reconexión con backoff 2→30 s). **Planificador ponderado**: si la suma de FPS
  objetivo no se sostiene (medir tiempo real de inferencia), reparte ciclos por
  prioridad (3 recibe ~3× los de 1) y reduce fps_objetivo efectivo; reporta
  `fps_real` por cámara. **Watchdog**: sin frame >15 s → evento `camara_caida`
  (critico, una vez) y `camara_recuperada` al volver. Auto-detección al arrancar:
  mide 10 s y fija fps sostenibles; log claro del resultado.
- `evidencia.py`: `Evidencia(cfg)` — buffer circular POR cámara de frames JPEG
  (deque limitada a pre_seg×fps, en RAM, resolución tope 960 px de ancho).
  `alimentar(camara_id, frame, ts)` desde el hilo de cámara.
  `grabar_evento(evento_id, camara_id) -> None` (async en hilo propio): congela el
  buffer + sigue capturando post_seg → escribe **MP4 (H.264 via OpenCV/ffmpeg,
  fallback mp4v)** con **timestamp incrustado** (cv2.putText por frame, esquina
  inferior, mismo formato v1 dd/mm/yyyy HH:MM:SS) en `datos/clips/{fecha}/{evento_id}.mp4`
  + miniatura JPEG `{evento_id}.jpg`. Al terminar publica `evento.clip_listo`.
  Si ya hay grabación en curso para esa cámara, extiende el fin.
- Cero pérdida por GIL: los hilos de cámara solo leen frame + alimentar buffer +
  encolar para inferencia; la inferencia corre en UN hilo dedicado (cola con el
  planificador). Documentad los tamaños de cola y qué se descarta si se llena (lo más viejo).

### 3 · API + ALMACÉN (Opus) — `api.py`, `almacen.py`
- `almacen.py`: SQLite (`datos/vigia.db`, WAL). Tablas:
  `eventos(id TEXT PK, ts INTEGER, camara_id TEXT, tipo TEXT, nivel TEXT, texto TEXT,
  track_id INTEGER, miniatura_ruta TEXT, clip_ruta TEXT, silenciada INTEGER DEFAULT 0)`;
  `agregados(dia TEXT, hora INTEGER, camara_id TEXT, clave TEXT, valor INTEGER,
  PRIMARY KEY(dia,hora,camara_id,clave))` (claves: visitantes, entradas, salidas,
  alerta_info/sospecha/critico, veh_car/truck/bus/motorcycle/bicycle, peatones);
  `calor(dia TEXT, camara_id TEXT, celda INTEGER, valor INTEGER, PRIMARY KEY(dia,camara_id,celda))`
  (rejilla 48×27, celda = fila*48+col); `kv(clave TEXT PK, valor TEXT)`.
  API: `guardar_evento`, `actualizar_clip`, `eventos(filtros)`, `incrementar(dia,hora,cam,clave,n)`,
  `sumar_calor(dia,cam,celdas)`, `stats_dia(dia,camara)` → forma EXACTA del §5,
  `kv_get/kv_set`. Un solo hilo escritor (cola interna) para no pelear el GIL/locks.
- `api.py`: FastAPI con TODOS los endpoints §5 tal cual + WS §6 + **proxy go2rtc**
  (`/go2rtc/{resto}` HTTP con httpx stream; `/go2rtc/api/ws` puente WS↔WS con
  websockets/httpx-ws) validando token en ambos. Middleware de token (§4).
  CORS: `*` (la app vive en otra origin de Pages) con cabecera del token permitida.
  El WS de eventos se alimenta suscrito a `bus 'evento.nuevo'` y `'evento.clip_listo'`
  (re-emite la alerta con `clip:true`). `GET /api/v1/frame/{id}` sirve el último JPEG
  del buffer de evidencia. Arranque de uvicorn lo hace `principal.py` (integrador).

### 4 · APP MODO MANDO (Opus) — `modulos/11-mando.js` + `11-mando.html`
Prefijo `mando_`. Namespace `estado.mando`. Sigue TODAS las reglas de la v1
(`modulos/CONTRATOS.md` §0) y lee este documento entero.
- **Conexión**: pantalla/sección (en SLOT:MANDO) para URL base + token; "escanear QR"
  = input de texto pegable (el QR del instalador codifica `vigia://URL#TOKEN`; parsear
  también URL pegada a mano). Guardar con `nuc_guardar('mando', {url, token})`.
  Selector de modo en el header (el integrador dejó `#ui-btnModoMando` — botón que
  llama `mando_alternar()`): modo local (v1 intacta) ↔ modo mando. En modo mando:
  oculta `#ui-secVideo` y muestra `#ui-secMando`; al volver, al revés. NADA del modo
  local se toca.
- **Mosaico**: rejilla 1-4 cámaras (de `GET /camaras`), reproducción **MSE**:
  WebSocket a `stream_mse` + `MediaSource` (go2rtc envía init+segmentos fMP4;
  implementar el cliente MSE mínimo: primer mensaje JSON `{"type":"mse","value":codecs}`
  → addSourceBuffer, resto binario → appendBuffer). Fallback si MSE falla: `<video src=stream_mp4>`.
  Fallback final: `<img>` refrescando `frame` cada 2 s con nota "modo foto". Toca una
  cámara → pantalla completa; otra vez → rejilla.
- **Alertas en vivo**: WS `/api/v1/eventos?token=`; cada `{"tipo":"alerta"}` →
  reutilizar la v1: `alerta_disparar(registro.tipo, registro.nivel, '['+camara_nombre+'] '+texto,
  {trackId, remoto:true})` — así suenan/vibran/flashean igual; añadir al feed la
  miniatura remota (`/api/v1/miniatura/id?token=`) y enlace de descarga del clip cuando
  `clip:true`. **Reconexión** automática (backoff 1→30 s) + indicador visual fijo
  "🧠 conectado / sin conexión" (`#mando-estadoCerebro`).
- **ARMAR/DESARMAR**: botón GRANDE global (rojo/verde) + por cámara en el mosaico,
  protegido con el PIN v1 (`cfg_pinPedir('armar/desarmar')`), POST /armar|/desarmar.
  Programación horaria (POST /horario) con los mismos inputs time.
- **Zonas remotas**: botón "Dibujar zonas" por cámara → carga `frame` JPEG en el canvas
  del editor v1 — REUTILIZA `zona_*` así: `mando_editarZonas(camaraId)` mete el frame
  como fondo, deja dibujar con la toolbar v1, y al cerrar hace POST /zonas con
  `estado.zonas/estado.lineas` (ya normalizadas 0-1 en v1 🎯) y restaura las zonas
  locales previas (guárdalas antes y repónlas SIEMPRE, incluso con error).
- Todas las llamadas: `mando_fetch(ruta, opciones)` central (base+token+timeout 10 s+
  errores → `ui_error`/toast, nunca throw sin capturar).

### 5 · ALERTAS + TELEGRAM + RETENCIÓN (Sonnet) — `alertas.py`, `telegram.py`, `retencion.py`
- `alertas.py`: suscrita a eventos parciales de la analítica (la llama camaras.py tras
  evaluar): decide nivel final y si procede según: armado (`estado.esta_armada_ahora`),
  tipo (`armado_intrusion` si persona+armada), filtro mascotas, cooldown por
  (camara,tipo,track) 30 s. Si procede: registro → `almacen.guardar_evento` +
  `bus 'evento.nuevo'` + pide clip a `evidencia.grabar_evento` (sospecha/critico) +
  encola Telegram (sospecha/critico).
- `telegram.py`: cola persistente (tabla kv o archivo json): sendMessage/sendPhoto y
  **sendVideo con el CLIP** cuando `evento.clip_listo` (la evidencia queda fuera de la
  casa aunque roben los aparatos). Reintentos 5s→15s→60s→5min, máx 8; si no hay
  token configurado: log claro "[telegram] sin configurar, se omite" y NADA falla.
- `retencion.py`: hilo cada 10 min: si `datos/clips` supera `limite_gb`, borra clips
  más antiguos (y sus miniaturas + actualiza clip_ruta=NULL en BD) hasta el 90%.
  Log de lo borrado.

### 6 · INSTALADOR + DOCS (Sonnet) — `instalar.sh`, `README.md`, `systemd/`, `termux/`
- `instalar.sh` (bash, español, colores sobrios): comprueba python3.11+/ffmpeg
  (apt/pkg install con permiso), crea venv, `pip install -r requirements.txt`
  (torch CPU: `--extra-index-url https://download.pytorch.org/whl/cpu`), descarga
  go2rtc y cloudflared del release oficial según arquitectura (amd64/arm64), asistente:
  nº de cámaras → por cámara IP/usuario/clave/ruta RTSP (con plantillas por marca:
  Tapo `stream1`, Ezviz…, "probar" con ffprobe/opencv), modo y prioridad; genera
  `config.yaml` + token; lanza `cloudflared tunnel --url http://localhost:8420`
  (túnel rápido gratuito), captura la URL pública, y muestra: URL + token + **QR
  ASCII** (python -c con `qrcode` o algoritmo propio simple; contenido
  `vigia://URL#TOKEN`) + instala systemd si Linux. Idempotente (re-ejecutable).
- `systemd/vigia-cerebro.service`: Restart=always, RestartSec=5, WorkingDirectory,
  ExecStart venv, journal. `termux/instalar-termux.sh`: proot-distro debian + límites
  honestos (máx 2 cámaras, sin gestos, sin systemd → script con bucle de reinicio).
- `README.md`: qué es, 3 hardware con limitaciones HONESTAS, instalación en 5 pasos,
  cómo conectar la app (URL+token/QR), preguntas frecuentes (RTSP por marca, "no veo
  vídeo fuera de casa" → túnel, legalidad: cartel y 1 mes). Sin humo comercial.

### 7 · APP DASHBOARD REMOTO + AJUSTES (Sonnet) — `modulos/12-mandodash.js` + `12-mandodash.html`
Prefijo `mdash_`. En modo mando: pestaña/sección (SLOT:MANDODASH dentro de la sección
mando) con: gráfico por hora hoy/ayer (reutiliza el LIENZO y estilo de stats v1 pero
pintando datos de `GET /stats` — función propia `mdash_grafico(datos)`, NO tocar
stats_*), totales, aforo actual, mapa de calor remoto (matriz de /stats pintada en un
canvas con la misma gama de colores v1), selector de cámara y de día, historial de
eventos paginado (GET /eventos + miniaturas) con filtros por nivel, y descarga de
clips. Sección de ajustes remotos (dentro del panel v1 de ajustes — SLOT:MANDOAJUSTES):
por cámara: fps_objetivo, ignorar_mascotas, armada (POST /config y /armar|desarmar);
franja horaria; estado de salud del cerebro (cpu/ram/disco/uptime de /estado).
Todo vía `mando_fetch` (typeof-check). Refresco al abrir y cada 60 s si visible.

## 8.5 Retoques YA HECHOS por el integrador en la v1 (referencia, NO repetir)

1. `modulos/05-ui.html`: añadido `<section id="ui-secMando" class="sec oculto"><!-- SLOT:MANDO --></section>`
   tras `#ui-secCarretera`, botón `<button id="ui-btnModoMando" class="btn btn-mini btn-fantasma">🧠 Mando</button>`
   en el header, y `<!-- SLOT:MANDOAJUSTES -->` al final del drawer de ajustes.
2. `modulos/ensamblar.mjs`: añadidos los archivos 11/12 al orden JS y los 2 slots nuevos.
3. `11-mando.html` debe contener un `<div id="mando-panel">…` con TODO lo suyo y
   `<!-- SLOT:MANDODASH -->` donde va el dashboard del agente 7.

## 9. Definición de "hecho" por agente

- Python: `python -m py_compile` pasa en tus archivos; imports solo de requirements.txt;
  cero credenciales de ejemplo reales; funciones críticas con docstring; el módulo se
  importa sin efectos secundarios (nada corre en import; todo arranca desde clases/funciones).
- App: `node --check` pasa; reglas v1; el modo local queda INTACTO (no tocar módulos 00-10).
- Devuelves resumen: qué implementaste, decisiones, qué requiere hardware real.

## 10. Flujo de integración (integrador, referencia)

`pruebas/camara_falsa.sh`: go2rtc con stream `demo: ffmpeg:archivo.mp4#video=h264`
(bucle) → config.yaml de prueba apuntando a esa "cámara" → `principal.py` arranca →
`pruebas/test_flujo.py`: espera detecciones, comprueba evento en SQLite, WS recibe
alerta, clip aparece en disco, Telegram simulado (sin token → log). La app se abre
apuntando a `http://localhost:8420` con el token de prueba.

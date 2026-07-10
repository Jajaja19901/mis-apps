# CONTRATOS.md — VIGÍA IA v2.0 (arquitectura y contratos de módulos)

**LEE ESTE DOCUMENTO ENTERO ANTES DE ESCRIBIR UNA LÍNEA.** Ningún módulo escribe en el HTML
final: cada agente entrega SOLO sus archivos en `modulos/` y un integrador ensambla después.
Si tu módulo necesita algo de otro módulo, se comunica por las funciones y eventos de ESTE
documento. Nada más.

---

## 0. Reglas globales (obligatorias para TODOS los módulos)

1. **Idioma**: todo el texto visible en español. Código y comentarios en español.
2. **Prefijos**: TODO identificador top-level de tu archivo (funciones, constantes) empieza
   por tu prefijo (`trk_`, `gesto_`, `zona_`, `vid_`, `ui_`, `alerta_`, `stats_`, `car_`,
   `cfg_`, `pwa_`). Constantes en mayúsculas: `TRK_IOU_MIN`, `GESTO_...`. Cero variables
   globales sin prefijo. El estado interno mutable de tu módulo vive en `estado.<tuPrefijo>`
   (p.ej. `estado.zona = {...}` lo creas tú en tu `*_init()`).
3. **Sin librerías** aparte de las 2 CDN ya definidas (TF.js+COCO-SSD) y MediaPipe
   tasks-vision (solo módulo GESTOS, por `import()` dinámico). Sin frameworks, sin charts.
4. **Persistencia SOLO con `nuc_guardar`/`nuc_cargar`** (localStorage con prefijo `vigia_`).
   PROHIBIDO `window.storage`. PROHIBIDO tocar `localStorage` directamente.
5. **Nunca `console.error`** en flujos normales o degradados: usa `console.warn` + banner
   visible (`ui_error(msg)` o evento `error:*`). El verificador automático trata cualquier
   error de consola como FALLO. Todo `async` lleva `catch`. Ninguna promesa sin capturar.
6. **Toda función pública debe poder llamarse sin vídeo activo y sin modelos cargados**:
   guarda-clauses y avisos, nunca excepciones. El verificador pulsa TODOS los botones con la
   app recién abierta (sin cámara, en headless).
7. **Honestidad**: PROHIBIDO "robo detectado", "ladrón", "hurto" en la UI. Siempre
   "gesto de ocultación — revisar", "sospecha para revisión humana". La velocidad de
   vehículos SIEMPRE con "~" y "aprox.". Nada de reconocimiento facial ni matrículas.
8. **CSS**: usa los tokens y clases públicas del módulo UI (§8). Tus clases/ids propios
   llevan tu prefijo (`.zona-toolbar`, `#cfg-panel`). No redefinas estilos de otro módulo.
9. **HTML**: tu fragmento NO lleva `<html>/<head>/<body>`. Se inyecta en tu SLOT (§7).
10. **Nada de TODOs ni placeholders de código**: código real y completo. Lo simple que
    funcione; sin refactors decorativos ni funciones no pedidas.
11. **Coordenadas**: el "espacio de frame" es el tamaño nativo de la fuente de vídeo
    (`vid_dimensiones()` → `{w,h}`). Detecciones, tracks y pintado usan px de ese espacio.
    Las ZONAS y LÍNEAS se guardan en coordenadas RELATIVAS 0..1 y se convierten al pintar
    y evaluar (así sobreviven a cambios de resolución).
12. **Entregables**: escribe SOLO tus archivos (`modulos/NN-nombre.js` y, si te tocan,
    `modulos/NN-nombre.html` / `modulos/NN-nombre.css`). No toques `apps/`, ni otros
    módulos, ni ejecutes npm. Comprueba tu sintaxis con `node --check modulos/NN-nombre.js`.
13. El archivo JS de cada módulo se concatena tal cual dentro de UN `<script>` único, en
    orden 00→10→99. No uses `import`/`export`/`require` (excepción: `import()` dinámico de
    MediaPipe dentro de `gesto_init`). No uses top-level `await`.

---

## 1. Archivos y ensamblado

```
modulos/00-nucleo.js      ← YA ESCRITO por el arquitecto. Léelo: estado, bus, utilidades.
modulos/01-tracker.js     (trk_)    Opus
modulos/02-gestos.js      (gesto_)  Opus
modulos/03-zonas.js       (zona_)   Opus      + 03-zonas.html (toolbar)
modulos/04-video.js       (vid_)    Opus      + 04-video.html (video/canvas/REC)
modulos/05-ui.js          (ui_)     Sonnet    + 05-ui.html (ESQUELETO con slots) + 05-ui.css
modulos/06-alertas.js     (alerta_) Sonnet    + 06-alertas.html (overlay de alerta)
modulos/07-stats.js       (stats_)  Sonnet    + 07-stats.html (sección estadísticas)
modulos/08-carretera.js   (car_)    Sonnet    + 08-carretera.html (panel carretera)
modulos/09-ajustes.js     (cfg_)    Sonnet    + 09-ajustes.html (panel ajustes+legal)
modulos/10-pwa.js         (pwa_)    Haiku
modulos/99-app.js         ← lo escribe el INTEGRADOR (bucle principal, arranque)
```

El integrador monta: `<head>` (metas + CSS 05 + CSS de módulos) → `<body>` = `05-ui.html`
con cada `<!-- SLOT:XXX -->` sustituido por el fragmento correspondiente → 2 `<script src>`
CDN → un `<script>` con 00..10 + 99 concatenados → bloque `#acceptance-tests`.

CDN (exactas, las pone el integrador; NO las cargues tú):
```html
<script src="https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js"></script>
```
MediaPipe (SOLO módulo gestos, dentro de `gesto_init`, con catch):
```js
const mp = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs');
// FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm')
// modelo: https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task
```

---

## 2. El estado central (creado en 00-nucleo.js — NO lo re-declares)

```js
estado = {
  arrancado: false,
  cfg: { ...CFG_DEFECTOS },          // §3. Único lugar de configuración.
  video:   { tipo:null, listo:false, w:640, h:480, grabando:false, msInferencia:0, fpsReal:0 },
  modelos: { coco:null, cocoListo:false, poseListo:false, error:'' },
  detecciones: [],                    // último frame: [{clase, score, caja:{x,y,an,al}}]
  tracks: [],                         // tracks VISIBLES este frame (Track §4)
  zonas: [],                          // [{id, tipo, nombre, puntos:[{x,y}rel]}]
  lineas: [],                         // [{id, nombre, a:{x,y}rel, b:{x,y}rel}]
  alertas: { criticoTracks: [] },     // trackIds en alerta crítica (para privacidad/pintado)
  ui: { vista:'monitor', dibujando:null, aforoPublico:false, pinOk:false },
  // cada módulo añade su namespace en su init: estado.trk, estado.zona, estado.gesto,
  // estado.vid, estado.alerta, estado.stats, estado.car, estado.cfgUI, estado.pwa
};
```

Claves de persistencia (via `nuc_guardar(clave, valor)`): `cfg`, `zonas`, `lineas`,
`log` (alertas), `stats_YYYY-MM-DD`, `onboarding`, `pin`. No inventes otras sin prefijo claro.

---

## 3. CFG_DEFECTOS (ya en 00-nucleo.js) — valores sensatos, la app funciona sin tocar nada

| clave | defecto | usa | significado |
|---|---|---|---|
| `modo` | `'super'` | todos | `'super'` \| `'carretera'` |
| `fps` | `8` | app/pwa | FPS de inferencia (3–10) |
| `scoreMin` | `0.5` | nucleo | confianza mínima COCO |
| `fuente` | `'camara'` | vid | `'camara'`\|`'ip'`\|`'archivo'` |
| `camara` | `'environment'` | vid | `'user'`\|`'environment'` |
| `resolucion` | `'720'` | vid | `'480'`\|`'720'` |
| `urlIP` | `''` | vid | base de IP Webcam, ej. `http://192.168.1.50:8080` |
| `aforoMax` | `50` | stats/alerta | alarma de aforo |
| `merodeoSeg` | `30` | zona | dwell → alerta |
| `colaN` | `4` | zona | personas en zona caja |
| `colaSeg` | `45` | zona | sostenido → "abrir otra caja" |
| `carreraVel` | `2.2` | gesto | umbral carrera, en ANCHOS DE FRAME/seg relativos… ver §Gestos: px/s = carreraVel*w/10. Usa `gesto_` doc |
| `caidaSeg` | `3` | gesto | caja horizontal sostenida |
| `abandonoSeg` | `30` | zona | bolsa sin dueño |
| `abandonoDistRel` | `0.18` | zona | distancia relativa (fracción del ancho de frame) |
| `ocultacionUmbral` | `60` | gesto | 0-100 → alerta ámbar |
| `fueraHorarioOn` | `false` | alerta | vigilancia fuera de horario |
| `fueraHorarioIni` | `'22:00'` | alerta | inicio franja |
| `fueraHorarioFin` | `'07:00'` | alerta | fin franja (cruza medianoche OK) |
| `ruidoOn` | `false` | alerta | micrófono nivel |
| `ruidoNivel` | `80` | alerta | 0-100 umbral |
| `sabotajeSens` | `60` | vid | 0-100 sensibilidad |
| `privacidad` | `false` | vid | pixelar caras SOLO en vivo |
| `clipSospecha` | `true` | vid | grabar clip también en nivel sospecha |
| `alertaCooldownSeg` | `30` | alerta | anti-spam por (tipo+track) |
| `telegramToken` | `''` | alerta | bot token |
| `telegramChat` | `''` | alerta | chat id |
| `detencionSeg` | `60` | car | vehículo parado en zona |
| `calor` | `false` | stats | overlay mapa de calor |
| `timelapseMin` | `5` | stats | minutos entre frames |
| `debugPose` | `false` | gesto | pintar esqueleto |
| `sonidoOn` | `true` | alerta | alarma sonora |
| `legalResponsable` | `''` | cfg | para cartel/informe |
| `legalContacto` | `''` | cfg | para cartel |

`cfg_` construye el panel de TODOS los campos (los demás módulos NO crean UI de ajustes).
Al cambiar un valor: `estado.cfg.X = v; nuc_guardar('cfg', estado.cfg); bus.emit('cfg:cambio',{clave:'X'})`.

---

## 4. Formas de datos

**Track** (lo crea/mantiene `trk_`):
```js
{ id: 7,                      // entero incremental, persistente entre frames
  clase: 'person',            // clase COCO en inglés (traducir SOLO al pintar con NUC_CLASES_ES)
  score: 0.87,
  caja: {x, y, an, al},       // px espacio de frame
  cx, cy,                     // centroide px
  pieX, pieY,                 // punto de apoyo: centro-abajo de la caja (para zonas)
  historial: [{cx, cy, pieX, pieY, ts}],  // últimos ~2s (recorta tú)
  vel: 0,                     // px/s suavizada (media móvil ~0.7s)
  creadoEn: ts, ultimaVez: ts,
  framesPerdidos: 0 }
```
Grupos de clase (en nucleo): `NUC_PERSONA=['person']`,
`NUC_VEHICULOS=['car','truck','bus','motorcycle','bicycle']`,
`NUC_BOLSAS=['backpack','handbag','suitcase']`, `NUC_ANIMALES=['dog','cat','bird']`.

**Zona**: `{id:'z1', tipo:'prohibida'|'sensible'|'caja'|'plaza'|'detencion', nombre:'Zona 1',
puntos:[{x:0..1, y:0..1}, ...≥3]}` — **Línea**: `{id:'l1', nombre:'Entrada',
a:{x,y}, b:{x,y}}` (relativas; sentido A→B = "entrada" por convención; la PRIMERA línea
creada es la línea de entrada del local).

**Registro de alerta** (lo crea `alerta_disparar`):
```js
{ id, ts, tipo, nivel:'info'|'sospecha'|'critico', texto, trackId|null, foto:dataURL|null }
```

---

## 5. Bus de eventos (en 00-nucleo.js: `bus.on(evt,fn)`, `bus.emit(evt,datos)`)

Los manejadores van envueltos en try/catch por el bus: un módulo roto no tumba el bucle.

| evento | datos | emite | escuchan |
|---|---|---|---|
| `modelos:listos` | `{}` | nucleo | ui, app |
| `modelos:error` | `{msg}` | nucleo | ui |
| `pose:listo` / `pose:error` | `{msg?}` | gesto | ui |
| `video:listo` | `{tipo,w,h}` | vid | ui, app, pwa |
| `video:error` | `{msg}` | vid | ui |
| `video:fin` | `{}` (demo terminó) | vid | ui |
| `frame` | `{ts}` (tras cada frame inferido) | app | stats, ui |
| `track:nuevo` / `track:perdido` | `{track}` | trk | stats, zona, gesto |
| `zona:entrada` | `{zona, track, conBolsa:bool}` | zona | alerta |
| `zona:salida` | `{zona, track}` | zona | — |
| `zona:merodeo` | `{zona, track, seg}` | zona | alerta |
| `zona:cola` | `{zona, n, seg}` | zona | alerta |
| `linea:cruce` | `{linea, track, sentido:'AB'\|'BA'}` | zona | stats, car, alerta |
| `plaza:cambio` | `{libres, total}` | zona | car, ui |
| `objeto:abandonado` | `{track, seg}` | zona | alerta |
| `gesto:ocultacion` | `{trackId, puntuacion}` | gesto | alerta |
| `gesto:caida` | `{trackId, seg}` | gesto | alerta |
| `gesto:carrera` | `{trackId, velPxS}` | gesto | alerta |
| `car:detenido` | `{track, zona, seg}` | car | alerta |
| `sabotaje` | `{tipo:'oscuro'\|'cambio'}` | vid | alerta |
| `ruido` | `{nivel}` | alerta(interno) | alerta |
| `aforo:cambio` | `{dentro, max}` | stats | ui, alerta |
| `fuera_horario:persona` | `{track}` | alerta(interno) | vid(graba) |
| `animal` | `{track}` | trk | alerta |
| `alerta` | `{registro}` | alerta | ui, stats, vid |
| `alerta:critica` | `{registro}` | alerta | vid, ui |
| `grabacion:lista` | `{url, nombre, ts, motivo}` | vid | ui |
| `almacen:aviso` | `{usoMB, limiteMB}` | nucleo | ui |
| `cfg:cambio` | `{clave}` | cfg | todos los interesados |
| `telegram:ok` / `telegram:error` | `{msg?}` | alerta | ui |
| `rendimiento:fpsBajado` | `{fps}` | pwa | ui |
| `error:general` | `{msg}` | cualquiera | ui (banner) |

Mapa evento→alerta (lo implementa `alerta_init` escuchando; niveles por defecto):
`zona:entrada` tipo 'prohibida'→**critico** · tipo 'sensible' y `conBolsa`→**sospecha** ·
`zona:merodeo`→sospecha · `zona:cola`→info ("Cola en caja: abrir otra caja") ·
`gesto:carrera`→sospecha · `gesto:caida`→**critico** · `objeto:abandonado`→sospecha ·
`gesto:ocultacion`→sospecha ("Gesto de ocultación — revisar. Nunca acuses basándote solo en esta alerta.") ·
`aforo:cambio` si dentro>max→sospecha · `animal`→info · `sabotaje`→**critico** ·
`car:detenido`→sospecha · persona en franja fuera de horario→**critico** · `ruido` fuera de
horario→critico, dentro→sospecha. Cooldown `cfg.alertaCooldownSeg` por (tipo+trackId).

---

## 6. Bucle principal (lo escribe el integrador en 99-app.js — para que sepas el orden)

```js
async function app_ciclo(ts) {
  vid_componer();                                  // SIEMPRE (frame + pintores + fecha/hora)
  if (toca inferir según cfg.fps && !app_ocupado && estado.modelos.cocoListo && estado.video.listo) {
    app_ocupado = true; const t0 = performance.now();
    estado.detecciones = await nuc_detectar(vid_fuente());
    trk_actualizar(estado.detecciones, ts);
    zona_evaluar(estado.tracks, ts);
    if (estado.cfg.modo === 'super') gesto_procesar(vid_fuente(), ts);
    if (estado.cfg.modo === 'carretera') car_evaluar(estado.tracks, ts);
    stats_acumular(estado.tracks, ts);
    estado.video.msInferencia = performance.now() - t0;
    bus.emit('frame', {ts}); app_ocupado = false;
  }
  vid_vigilarSabotaje(ts);
  ui_render();                                      // internamente limitado a ~2/s
  requestAnimationFrame(app_ciclo);
}
```
Pintores sobre el canvas compuesto, registrados con `vid_registrarPintor(nombre, fn, orden)`:
orden 10 `zona_pintar`, 20 `trk_pintar`, 30 `gesto_pintar` (si debugPose), 40 `stats_calorPintar`
(si cfg.calor), 50 `car_pintar`. La privacidad (pixelado) y la marca de fecha/hora las aplica
`vid_componer` por su cuenta (privacidad ANTES de los pintores, fecha/hora y REC después).

---

## 7. SLOTS del esqueleto (05-ui.html los declara como comentarios EXACTOS)

```
<!-- SLOT:VIDEO -->      ← 04-video.html   (video oculto, img MJPEG, canvas compuesto, REC)
<!-- SLOT:ZONAS -->      ← 03-zonas.html   (toolbar de dibujo, bajo el vídeo)
<!-- SLOT:ALERTAS -->    ← 06-alertas.html (overlay flash pantalla completa; feed va en UI)
<!-- SLOT:STATS -->      ← 07-stats.html   (sección estadísticas/dashboard)
<!-- SLOT:CARRETERA -->  ← 08-carretera.html (panel modo carretera)
<!-- SLOT:AJUSTES -->    ← 09-ajustes.html (contenido del panel de ajustes + legal)
```

Contenedores garantizados por UI (ids estables): `#ui-app` (raíz), `#ui-secVideo` (sticky),
`#ui-contadores`, `#ui-feedAlertas` (lista de alertas recientes), `#ui-secStats`,
`#ui-secCarretera` (oculta en modo super), `#ui-panelAjustes` (drawer/overlay, con el slot
dentro), `#ui-aforo` (pantalla pública, oculta), `#ui-onboarding`, `#ui-banners` (errores),
`#ui-modales` (contenedor genérico para modales de cualquier módulo).

---

## 8. Sistema de diseño (05-ui.css lo define; el resto lo CONSUME)

Tokens (variables CSS en `:root`):
```css
--fondo:#0b0f14; --panel:#131a22; --panel2:#1a232e; --borde:#233140;
--texto:#cfdae4; --texto2:#7d8fa0; --verde:#2ee584; --ambar:#ffb224;
--rojo:#ff4155; --azul:#3fa9ff; --mono:'SFMono-Regular',ui-monospace,'Cascadia Mono',Consolas,monospace;
--radio:10px; --sombra:0 4px 16px rgba(0,0,0,.45);
```
Clases públicas que UI garantiza (úsalas en tus fragmentos):
`.btn` `.btn-primario` `.btn-peligro` `.btn-fantasma` `.btn-mini` · `.tarjeta` · `.fila`
(flex gap) · `.campo` (label+control en columna) · `.dato-grande` (cifra mono grande) ·
`.etiqueta` (texto pequeño --texto2 mayúsculas) · `.insignia-info` `.insignia-sospecha`
`.insignia-critico` · `.oculto` (`display:none!important`) · `.sec` (sección con padding) ·
`.sec-titulo` (h2 de sección). Estética: sala de control, fondo oscuro, datos en `--mono`,
esquinas de visor en el vídeo, indicador REC parpadeante (eso lo trae 04-video.html + su CSS
inline… NO: el CSS de REC/visor lo define 05-ui.css bajo las clases `.vid-visor`, `.vid-rec`).

---

## 9. Contratos por módulo (funciones públicas EXACTAS)

### 00 NÚCLEO (ya escrito — léelo antes de empezar)
`estado`, `bus`, `CONFIG`, `CFG_DEFECTOS`, `NUC_CLASES_ES`, grupos de clase,
`nuc_init()`, `nuc_guardar(clave,val)`, `nuc_cargar(clave,def)`, `nuc_borrar(clave)`,
`nuc_usoAlmacenMB()`, `nuc_iou(a,b)`, `nuc_dist(x1,y1,x2,y2)`, `nuc_clamp(v,a,b)`,
`nuc_fechaHora(ts)`, `nuc_horaCorta(ts)`, `nuc_diaClave(ts)`, `nuc_hashTexto(txt)→Promise`,
`nuc_cargarModelos()→Promise`, `nuc_detectar(fuente)→Promise<detecciones>`,
`nuc_descargar(nombre, contenido, mime)`, `nuc_uid(pref)`, `nuc_esEnFranja(ts, ini, fin)`.

### 01 TRACKER — `modulos/01-tracker.js` (Opus)
Estilo ByteTrack simplificado: matching voraz por IoU (umbral `TRK_IOU_MIN=0.25`) por grupo
de clase; los no emparejados, por distancia de centroides (< `TRK_DIST_MAX_REL=0.1`*w);
tolerancia a oclusión: mantener track "perdido" hasta `TRK_MAX_PERDIDOS=15` frames de
inferencia (predicción lineal simple del centroide mientras tanto, sin pintar caja).
- `trk_init()`
- `trk_reiniciar()` — vacía tracks (cambio de fuente).
- `trk_actualizar(detecciones, ts)` → rellena `estado.tracks` (solo los visibles este frame),
  emite `track:nuevo`/`track:perdido`, y `animal` cuando un track nuevo es de NUC_ANIMALES
  y `estado.cfg.modo==='super'` (una vez por track).
- `trk_velocidad(track)` → px/s suavizada.
- `trk_pintar(ctx)` — cajas con id+clase (español)+vel; verde normal, ámbar si
  `estado.gesto.puntuaciones[id]>=40`, rojo si id ∈ `estado.alertas.criticoTracks`.
- `trk_tracksDe(grupo)` → tracks visibles cuya clase ∈ grupo.

### 02 GESTOS — `modulos/02-gestos.js` (Opus)
- `gesto_init()→Promise` — import() dinámico MediaPipe, PoseLandmarker (lite, VIDEO,
  numPoses:3, GPU con fallback CPU). Nunca rechaza: catch interno → `pose:error` + banner.
  La app FUNCIONA sin pose (caída y carrera van por tracker; ocultación queda desactivada
  con aviso honesto en ajustes).
- `gesto_procesar(fuente, ts)` — SOLO si `estado.cfg.modo==='super'`. Si pose lista:
  detectForVideo sobre el frame completo, asocia cada pose al track persona con mayor
  solape de caja. Secuencia de ocultación: muñeca se aleja del torso (extensión hacia
  estante) → vuelve y PERMANECE ≥0.7s cerca de cadera/cintura/pecho → puntúa; repetición
  acumula. `estado.gesto.puntuaciones[trackId] ∈ 0..100` con decaimiento (~2/s). Al cruzar
  `cfg.ocultacionUmbral` → `gesto:ocultacion` (cooldown 30s/track).
  SIEMPRE (con o sin pose): caída = caja de persona pasa de vertical (al/an>1.2) a
  horizontal (an/al>1.3) y se mantiene ≥`cfg.caidaSeg`s → `gesto:caida` (una vez/track hasta
  que se levante). Carrera = `trk_velocidad` > `cfg.carreraVel * estado.video.w / 10` px/s
  sostenida ≥0.6s → `gesto:carrera` (cooldown 15s/track).
- `gesto_pintar(ctx)` — esqueleto simple si `cfg.debugPose`.
- `gesto_puntuacion(trackId)` → 0..100.

### 03 ZONAS — `modulos/03-zonas.js` + `03-zonas.html` (Opus)
Dibujo táctil sobre el canvas compuesto (`#vid-canvas`): en modo dibujo, cada tap añade
vértice (coordenadas → relativas); botón "Cerrar zona" termina (≥3 puntos); línea = 2 taps.
`estado.ui.dibujando = null|'zona'|'linea'`. Persiste con `nuc_guardar('zonas'/'lineas')`.
- `zona_init()` — carga guardado, registra pintor, listeners táctiles (pointerdown).
- `zona_iniciarDibujo(tipo)` / `zona_iniciarLinea()` / `zona_terminarDibujo()` /
  `zona_cancelarDibujo()` / `zona_borrar(id)` / `zona_borrarTodo()`
- `zona_evaluar(tracks, ts)` —
  · entrada/salida por punto de pie (pieX,pieY) con `zona_puntoEnPoligono` → eventos
    `zona:entrada` (calcula `conBolsa`: bolsa detectada solapando o a <0.1*w del track)
    / `zona:salida`;
  · merodeo: pie dentro ≥`cfg.merodeoSeg` → `zona:merodeo` (cooldown 60s/track/zona);
  · cola: ≥`cfg.colaN` personas en zona 'caja' sostenido `cfg.colaSeg` → `zona:cola`
    (cooldown 120s);
  · plazas: zona 'plaza' ocupada si un vehículo (o persona en modo super… NO: solo
    NUC_VEHICULOS) tiene su CENTRO dentro ≥2s → al cambiar el total emite `plaza:cambio`;
  · cruces de línea: lado del punto de pie respecto a la línea; cruce confirmado cuando
    mantiene el lado nuevo ≥2 frames → `linea:cruce` con sentido;
  · objeto abandonado: track de NUC_BOLSAS visible ≥`cfg.abandonoSeg` con la persona más
    cercana a >`cfg.abandonoDistRel*w` px durante todo ese tiempo → `objeto:abandonado`
    (una vez por track).
- `zona_pintar(ctx)` — polígonos semitransparentes por tipo (prohibida roja, sensible ámbar,
  caja azul, plaza verde/rojo según ocupación, detención ámbar), líneas con flecha A→B y
  contadores, y el trazado en curso.
- `zona_puntoEnPoligono(px, py, puntosPx)` → bool (ray casting).
- `zona_plazas()` → `{libres, total}`.
- HTML (SLOT:ZONAS): toolbar `#zona-toolbar` con: selector/botones "＋Zona prohibida",
  "＋Z. sensible", "＋Z. caja", "＋Plaza", "＋Z. detención" (estas 2 últimas visibles solo
  en modo carretera vía clase), "＋Línea", "Cerrar", "Cancelar", "🗑 Borrar todo". Botones
  `.btn .btn-mini`. Durante el dibujo muestra ayuda ("toca el vídeo para añadir puntos").

### 04 VÍDEO — `modulos/04-video.js` + `04-video.html` (Opus)
- HTML (SLOT:VIDEO): `<div class="vid-visor" id="vid-visor">` con `<video id="vid-video"
  playsinline muted class="oculto">`, `<img id="vid-mjpeg" class="oculto">`, `<canvas
  id="vid-canvas"></canvas>`, indicador `<div id="vid-rec" class="vid-rec oculto">● REC</div>`,
  overlay de estado `#vid-estado` ("Sin fuente de vídeo — elige en Ajustes o Demo").
- `vid_init()` — refs, escucha `alerta`/`alerta:critica` para grabar clip (critico siempre;
  sospecha si `cfg.clipSospecha`), escucha `fuera_horario:persona` → graba.
- `vid_usarCamara()→Promise<bool>` — getUserMedia según cfg (facing, res). Errores →
  `video:error` con mensaje claro (denegada / no disponible / no https).
- `vid_usarIP(url)→Promise<bool>` — deriva snapshot `url/shot.jpg` (IP Webcam), sondeo de
  `<img crossOrigin=anonymous>` con cache-buster a ~10fps. Si el canvas se contamina
  (prueba toDataURL en try/catch) → `video:error` honesto ("la cámara IP no envía CORS…").
- `vid_usarArchivo(file)→Promise<bool>` — MODO DEMO: `<video loop muted playsinline>` con
  URL.createObjectURL. Emite `video:listo`.
- `vid_detener()`
- `vid_fuente()` → elemento listo para `nuc_detectar` (video o img) o `null`.
- `vid_dimensiones()` → `{w,h}` del espacio de frame.
- `vid_registrarPintor(nombre, fn, orden)`
- `vid_componer()` — dibuja frame en `#vid-canvas` (tamaño = dimensiones fuente, tope 1280
  de ancho), aplica privacidad si `cfg.privacidad` (pixela el 25% superior de la caja de
  cada track persona, EXCEPTO ids en `estado.alertas.criticoTracks`), ejecuta pintores por
  orden, estampa fecha/hora `nuc_fechaHora` (esquina inferior izq., fondo negro semitransp.,
  fuente mono) y gestiona la clase del REC. Si no hay fuente: pantalla "SIN SEÑAL" con reloj.
- `vid_capturaJPEG(anchoMax=320)` → dataURL o `null` (canvas contaminado / sin fuente).
- `vid_grabarEvento(motivo)` — buffer circular SIEMPRE activo con fuente viva
  (MediaRecorder sobre `canvas.captureStream(10)`, timeslice 1s, guarda últimos
  ~10 trozos); al llamar: retiene el buffer + sigue 20s → Blob webm → `grabacion:lista`
  (URL de objeto; NO a localStorage). Las grabaciones NUNCA se difuminan: el pixelado de
  privacidad NO se aplica al frame antes de… — ATENCIÓN: el buffer graba el canvas
  compuesto; por tanto, cuando `cfg.privacidad` esté activo, `vid_componer` dibuja el
  pixelado en una CAPA visual separada (canvas de presentación) y el canvas compuesto/
  grabado queda SIN difuminar. Implementación: 2 canvas — `#vid-canvas` (compuesto íntegro,
  fuente para grabación y capturas) visible por defecto; si privacidad ON, se muestra
  encima `#vid-canvasPriv` (copia + pixelado) y `#vid-canvas` se mantiene como fuente.
- `vid_vigilarSabotaje(ts)` — cada ~500ms compara miniatura en gris (32×18) contra
  referencia rodante: oscuridad global súbita o diferencia media > umbral (según
  `cfg.sabotajeSens`) sostenida ~1.5s → `sabotaje` (cooldown 30s). Se calibra ~3s tras
  `video:listo`.

### 05 UI — `modulos/05-ui.js` + `05-ui.html` + `05-ui.css` (Sonnet)
- HTML: ESQUELETO COMPLETO con los 6 slots (§7) y contenedores garantizados. Header con
  nombre (CONFIG.NOMBRE_APP), punto de estado (verde=todo listo), botones: "Aforo" (pantalla
  pública), "Ajustes" (engranaje). Sección vídeo sticky arriba. Contadores `.dato-grande`:
  personas en escena / aforo (dentro/max) / entradas hoy / salidas hoy / alertas hoy — y en
  modo carretera: vehículos hoy. Feed de alertas `#ui-feedAlertas` (hora, insignia nivel,
  texto, miniatura foto, enlace de clip si lo hay). Onboarding 3 pasos (`#ui-onboarding`):
  1 elegir modo (super/carretera) → 2 fuente (botón "Usar cámara" → `vid_usarCamara()`,
  "Cámara IP" → abre ajustes, "Vídeo de prueba (demo)" → dispara el input file de ajustes,
  "Saltar") → 3 explicación de dibujo con botón "Dibujar línea de entrada" →
  `zona_iniciarLinea()` y "Terminar". Al acabar: `nuc_guardar('onboarding', true)`.
  Pantalla aforo `#ui-aforo`: número gigante `dentro/max` + "PASE" verde / "ESPERE" rojo
  (fondo entero), reloj, "toca para salir". Footer: firma
  `Diseñado por Incuba tu Negocio · por Jaime M. M.` (enlace CONFIG.STUDIO_URL) + enlace
  "Aviso legal y privacidad" que abre la sección legal de ajustes.
- `ui_init()` — refs cacheadas, listeners de botones y de bus (`alerta`, `grabacion:lista`,
  `video:error`, `modelos:error`, `pose:error`, `almacen:aviso`, `telegram:*`,
  `rendimiento:fpsBajado`, `aforo:cambio`, `error:general`).
- `ui_render()` — throttle interno 500ms; actualiza contadores (usa `stats_aforoActual()`,
  `stats_datosHoy()`), estado del header, panel aforo si activo. Barato: nada de rebuilds.
- `ui_toast(msg, nivel='info')` — aviso flotante 4s.
- `ui_error(msg)` — banner persistente cerrable en `#ui-banners` (máx 3, sin duplicados).
- `ui_onboarding()` — muestra el asistente (si `!nuc_cargar('onboarding',false)`).
- `ui_aforoPublico(on)` — entra/sale de pantalla aforo (+fullscreen si se puede, catch).
- `ui_abrirAjustes()` — `cfg_pinPedir('ajustes')` y si OK muestra `#ui-panelAjustes`.
- `ui_cerrarAjustes()`, `ui_modal(tituloHTML, cuerpoNodo|HTML, botones)` → para uso general.
- CSS: TODO el sistema de diseño (§8) + responsive mobile-first + `.vid-visor` (esquinas
  de visor con pseudo-elementos), `.vid-rec` (parpadeo), animaciones sobrias.

### 06 ALERTAS — `modulos/06-alertas.js` + `06-alertas.html` (Sonnet)
- HTML (SLOT:ALERTAS): overlay `#alerta-flash` pantalla completa (oculto): borde/velo del
  color del nivel + texto grande + botón "Silenciar 5 min" + "Cerrar".
- `alerta_init()` — suscripciones del mapa §5, log desde `nuc_cargar('log',[])`, cola
  Telegram desde almacenamiento, procesador de cola (reintentos 5s→15s→60s, máx 5; si no
  hay internet espera `online`).
- `alerta_disparar(tipo, nivel, texto, datos={trackId})` — cooldown por tipo+track; crea
  registro (foto = `vid_capturaJPEG()`), añade a log con ROTACIÓN (recorta al superar
  ~4MB; `almacen:aviso` al pasar 3.5MB), `nuc_guardar('log')`, sonido por nivel (Web Audio:
  info=bip 660Hz, sospecha=triple 880Hz, critico=sirena 2 tonos ~3s; respeta `cfg.sonidoOn`
  y silencio temporal), `navigator.vibrate` por nivel (catch), flash overlay (critico se
  mantiene hasta cerrar; sospecha 4s; info solo feed), Telegram si nivel≥sospecha y
  configurado (sendPhoto con FormData si hay foto, si no sendMessage), si critico → añade
  trackId a `estado.alertas.criticoTracks` (lo retira a los 60s), emite `alerta` y
  `alerta:critica`. Vigila franja fuera de horario: en cada `frame`, si `cfg.fueraHorarioOn`
  y `nuc_esEnFranja(ts,…)` y hay track persona → dispara tipo 'fuera_horario' critico +
  emite `fuera_horario:persona` (cooldown 60s).
- `alerta_silenciar(min)` / `alerta_probar(nivel)` / `alerta_log()` / `alerta_borrarLog()`
- `alerta_ruidoInit()→Promise<bool>` (getUserMedia audio + AnalyserNode, SOLO nivel RMS
  0-100, sin grabar; umbral `cfg.ruidoNivel` sostenido 300ms → evento interno y alerta
  'ruido') / `alerta_ruidoParar()`
- `alerta_telegramProbar()→Promise` — mensaje de prueba, `telegram:ok/error`.

### 07 STATS — `modulos/07-stats.js` + `07-stats.html` (Sonnet)
- HTML (SLOT:STATS): sección con: gráfico canvas `#stats-grafico` (afluencia por hora,
  barras, hoy vs ayer en dos tonos), tarjetas de totales (visitantes, entradas, salidas,
  alertas por nivel, vehículos por tipo en modo carretera), controles de mapa de calor
  (toggle usa cfg.calor, "Reiniciar", "Exportar PNG"), time-lapse ("N capturas · Exportar
  vídeo", "Borrar"), botones "Informe HTML" y "CSV" (llaman a `cfg_exportarInforme()` /
  `cfg_exportarCSV()`).
- `stats_init()` — carga día actual (`stats_YYYY-MM-DD`) y ayer; rollover a medianoche;
  escucha `linea:cruce` (línea 1ª = entrada: AB entrada, BA salida; personas → visitantes
  por hora; vehículos → conteo por tipo y hora y por sentido), `track:nuevo` (si NO hay
  línea de entrada: visitantes por hora = tracks persona nuevos), `alerta` (conteo por
  tipo/nivel), arranca temporizador de time-lapse (`cfg.timelapseMin`, captura
  `vid_capturaJPEG(480)`, guarda EN MEMORIA `estado.stats.timelapse` máx 400 con aviso).
- `stats_acumular(tracks, ts)` — mapa de calor: suma pie de tracks persona en rejilla
  48×27 relativa (en memoria + `nuc_guardar('calor')` cada 60s); pico de ocupación.
- `stats_aforoActual()` → nº dentro: si hay línea de entrada → max(0, entradas−salidas) del
  día; si no → personas visibles ahora. Emite `aforo:cambio` cuando cambia.
- `stats_datosHoy()` → `{visitantes, entradas, salidas, alertas:{info,sospecha,critico,total},
  vehiculos:{car:…}, porHora:[24], porHoraAyer:[24], picoAforo}`.
- `stats_grafico()` / `stats_calorPintar(ctx)` / `stats_calorReset()` /
  `stats_calorExportar()` / `stats_timelapseExportar()` (webm reproduciendo frames en un
  canvas con MediaRecorder, ~6fps) / `stats_datosCSV()` → string (cabecera
  `hora;visitantes;entradas;salidas;alertas;coches;camiones;buses;motos;bicis;peatones`).
- `stats_render()` — repinta su sección (throttle; llamado por ui_render o listener frame).

### 08 CARRETERA — `modulos/08-carretera.js` + `08-carretera.html` (Sonnet)
- HTML (SLOT:CARRETERA): panel (visible solo en modo carretera): totales del día por tipo
  (usa `stats_datosHoy().vehiculos`), conteo direccional por línea (A→B / B→A), tarjeta
  plazas `#car-plazas` ("12/20 libres", verde/rojo), calibración: botón "Calibrar velocidad"
  → instrucciones (2 taps en el vídeo + metros reales) + estado "Calibrado: N px/m", y
  aviso fijo "Velocidad orientativa (~), no válida como medición legal".
- `car_init()` — carga calibración (`nuc_cargar('calibracion')`), escucha `plaza:cambio`,
  `linea:cruce` (para su tabla direccional), `cfg:cambio` (modo).
- `car_evaluar(tracks, ts)` — vehículos con desplazamiento < 2% de w durante
  `cfg.detencionSeg` s con centro en zona 'detencion' → `car:detenido` (cooldown 120s/track).
- `car_calibrarIniciar()` — modo 2 taps sobre el canvas (reusa pointerdown propio),
  pide metros con `ui_modal`, guarda px/m.
- `car_velocidadKmh(track)` → nº o `null` si no calibrado (vel px/s ÷ px/m × 3.6).
- `car_pintar(ctx)` — "~NN km/h" sobre vehículos si calibrado y vel>2km/h.
- `car_render()` — actualiza su panel (throttle).

### 09 AJUSTES/LEGAL — `modulos/09-ajustes.js` + `09-ajustes.html` (Sonnet)
- HTML (SLOT:AJUSTES): panel completo por secciones plegables: **Fuente de vídeo** (radio
  camara/ip/archivo, selector frontal/trasera, 480/720, campo URL IP + "Conectar", input
  file demo `#cfg-archivoDemo` + "Cargar vídeo", botón "Detener fuente") · **Detección**
  (fps 3-10, sensibilidad scoreMin, modo super/carretera) · **Aforo y zonas** (aforoMax,
  merodeoSeg, colaN, colaSeg, abandonoSeg) · **Gestos** (ocultacionUmbral, carreraVel,
  caidaSeg, debugPose, y el TEXTO FIJO: "Este sistema señala comportamientos para revisión.
  Nunca acuses a nadie basándote solo en una alerta.") · **Fuera de horario** (on, ini,
  fin) · **Ruido** (on → `alerta_ruidoInit()`, nivel) · **Privacidad en vivo** (toggle
  privacidad + explicación: las grabaciones van SIEMPRE íntegras) · **Alertas** (sonidoOn,
  cooldown, probar niveles) · **Telegram** (token, chat id, "Probar", mini-guía plegable:
  crear bot con @BotFather en 2 min, obtener chat id con @userinfobot) · **Sistema**
  (sabotajeSens, calor, timelapseMin, uso de almacenamiento MB + "Borrar log", "Borrar
  zonas", "Restaurar valores de fábrica", cambiar PIN) · **Legal** (texto LOPDGDD art.22:
  cartel obligatorio, prohibición de reconocimiento facial biométrico en comercios,
  conservación máx. 1 mes salvo denuncia, registro de actividades; campos responsable y
  contacto; botón "Generar cartel ZONA VIDEOVIGILADA") · **Exportar** (Informe HTML, CSV).
- `cfg_init()` — construye bindings de TODOS los campos ↔ `estado.cfg` (input→guardar→
  `cfg:cambio`), botones conectados a los módulos (vid_usarCamara/IP/Archivo,
  alerta_probar, alerta_telegramProbar, stats_*, zona_borrarTodo…).
- `cfg_pinPedir(motivo)→Promise<bool>` — modal PIN 4 dígitos; si no hay PIN guardado,
  flujo de creación (2 veces); compara con hash (`nuc_hashTexto`); guarda `nuc_guardar('pin',
  hash)`. `estado.ui.pinOk=true` durante la sesión (no re-pedir). La vista monitor NUNCA
  pide PIN.
- `cfg_pinCambiar()` / `cfg_generarCartel()` (modal con datos → descarga HTML imprimible
  A4 con pictograma cámara SVG, texto art.22 LOPDGDD, responsable, dónde ejercer derechos)
  / `cfg_exportarInforme()` (HTML autocontenido: fecha, totales, gráfico como dataURL
  `#stats-grafico`.toDataURL, tabla por hora, lista de alertas con miniaturas, firma) /
  `cfg_exportarCSV()` (usa `stats_datosCSV`, BOM UTF-8, `;`) / `cfg_restaurar()` /
  `cfg_legalHTML()` → string (texto legal reutilizable).

### 10 PWA — `modulos/10-pwa.js` (Haiku)
- `pwa_init()` — 1) manifest: objeto JSON (nombre CONFIG.NOMBRE_APP, display standalone,
  tema #0b0f14, icono: PNG generado en canvas 512 y 192 con el emblema SVG de CONFIG →
  dataURL) inyectado como `<link rel=manifest href=data:application/manifest+json,...>`
  (encodeURIComponent). 2) Service worker: intenta `navigator.serviceWorker.register` de un
  Blob URL con caché cache-first de CDNs/modelos; envuelto en try/catch — si el navegador lo
  rechaza (blob no permitido) → `console.warn` y nota en ajustes vía
  `estado.pwa.swEstado='no disponible'` (SIN romper nada). 3) Botón "Instalar app" discreto
  (aparece con `beforeinstallprompt`; en iOS muestra instrucciones "Compartir → Añadir a
  pantalla de inicio"). 4) Wake Lock: pedir en `video:listo`, re-adquirir en
  `visibilitychange`, fallback → aviso una vez ("desactiva el apagado automático de
  pantalla"). 5) Degradación de FPS: cada 5s mira `estado.video.msInferencia` (media);
  si > 0.66×(1000/cfg.fps) y cfg.fps>3 → baja 1 fps, `rendimiento:fpsBajado` + aviso
  discreto; si sobra margen amplio y fps<el configurado por el usuario, recupera.
- `pwa_wakeLock(on)→Promise`.

### 99 APP (integrador — Fase 2; Fable)
Arranque, bucle §6, `#acceptance-tests`, validaciones del checklist §10, informe honesto.

---

## 10. Definición de "hecho" por módulo

- `node --check` pasa sobre tu JS.
- Cero `console.error`; errores → banner/evento. Cero TODOs.
- Tus funciones públicas del §9 existen con ESOS nombres exactos y son seguras sin
  vídeo/modelos.
- Solo escribiste tus archivos.
- Devuelves al director un resumen: funciones implementadas, decisiones tomadas,
  y qué NO se puede probar sin cámara real.

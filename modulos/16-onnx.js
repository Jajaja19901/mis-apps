/* ============================================================================
 * 16-ONNX — VIGÍA IA · SUPERCEREBRO: YOLO11 real con ONNX Runtime Web.
 * Prefijo: sc_ / SC_. Estado interno en estado.sc.
 *
 * Motor de detección de máxima precisión para el navegador:
 *   · onnxruntime-web con backend WebGPU (S22 y similares) y reserva WASM.
 *   · Tres modelos YOLO11 (n rápido / s equilibrado / m máxima precisión),
 *     descarga bajo demanda con progreso y CACHÉ (Cache API, persiste).
 *   · Benchmark de 20 inferencias por modelo → recomienda el mejor que
 *     aguante ≥4 FPS en TU dispositivo. Guardado en localStorage.
 *   · Gestión térmica: si la inferencia se degrada sostenidamente (móvil
 *     caliente), baja de modelo (m→s→n) avisando; vuelve a subir al enfriar.
 *   · CEREBRO ADAPTATIVO en Copiloto: por velocidad GPS cambia entre el
 *     modelo PRECISIÓN y el RÁPIDO (precargados ambos, histéresis 30 s).
 *
 * Entrega las detecciones EXACTAMENTE en el formato del resto de motores:
 * [{clase (nombre COCO en inglés), score, caja:{x,y,an,al}}] en px del frame.
 * Si algo falla (sin WebGPU, sin red, URL caída) → cae al motor anterior con
 * aviso "usando motor básico", sin romper nada.
 *
 * HONESTIDAD: los FPS y el % de detección reales solo existen en el
 * dispositivo del dueño; el benchmark y el test de detección integrados
 * son la herramienta para medirlos ahí. Nada de números inventados.
 * ==========================================================================*/

/* --- CDN de onnxruntime-web (todos los backends) ---------------------------*/
const SC_ORT_URL = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/ort.all.min.js';
const SC_ORT_WASM_BASE = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/';

/* --- Modelos YOLO11 en ONNX (exportaciones públicas de onnx-community) -----
 * Los tamaños son aproximados y se muestran ANTES de descargar. Las URLs son
 * editables en Ajustes por si cambian o el dueño aloja las suyas. */
const SC_MODELOS = {
  n: { nombre: 'Rápido (YOLO11n)',    mb: 10, escala: 1 },
  s: { nombre: 'Equilibrado (YOLO11s)', mb: 36, escala: 2.6 },
  m: { nombre: 'Máx. precisión (YOLO11m)', mb: 77, escala: 5.2 },
};
const SC_ENTRADA = 640;          // lado de entrada (letterbox 640, modo PRECISIÓN)
const SC_MAX_DETS = 100;         // hasta 100 detecciones por frame (multitudes)
const SC_NMS_IOU = 0.5;          // supresión de duplicados
const SC_CACHE = 'vigia-modelos-onnx';

/* Las 80 clases COCO en el orden estándar de YOLO (índice = id de clase). */
const SC_COCO = ['person','bicycle','car','motorcycle','airplane','bus','train','truck','boat','traffic light','fire hydrant','stop sign','parking meter','bench','bird','cat','dog','horse','sheep','cow','elephant','bear','zebra','giraffe','backpack','umbrella','handbag','tie','suitcase','frisbee','skis','snowboard','sports ball','kite','baseball bat','baseball glove','skateboard','surfboard','tennis racket','bottle','wine glass','cup','fork','knife','spoon','bowl','banana','apple','sandwich','orange','broccoli','carrot','hot dog','pizza','donut','cake','chair','couch','potted plant','bed','dining table','toilet','tv','laptop','mouse','remote','keyboard','cell phone','microwave','oven','toaster','sink','refrigerator','book','clock','vase','scissors','teddy bear','hair drier','toothbrush'];

/* ---------------------------------------------------------------------------
 * ESTADO Y ARRANQUE
 * -------------------------------------------------------------------------*/
function sc_estado() {
  if (!estado.sc) {
    estado.sc = {
      ortListo: false, cargandoOrt: false,
      backend: '',                 // 'webgpu' | 'wasm' | '' (el activo de verdad)
      sesiones: {},                // 'n'|'s'|'m' -> InferenceSession
      cargando: {},                // clave -> true mientras descarga/carga
      activo: '',                  // clave del modelo en uso ('' = ninguno)
      msMedia: 0,                  // media móvil del tiempo de inferencia
      msBase: 0,                   // referencia del benchmark (para la térmica)
      termicaBajadas: 0, ultCambioTermica: 0,
      // adaptativo copiloto
      adaptActual: '',             // 'preciso' | 'rapido' | ''
      adaptLentoDesde: 0,          // desde cuándo vamos por debajo del umbral
      cnv: null, avisoBasico: false,
    };
  }
  return estado.sc;
}

function sc_init() {
  const s = sc_estado();
  if (s.inited) return;
  s.inited = true;
  // Indicador del cerebro adaptativo sobre el HUD del copiloto (orden 75).
  if (typeof vid_registrarPintor === 'function') {
    vid_registrarPintor('supercerebro', sc_pintarChip, 75);
  }
  // Gestión térmica + adaptativo: vigilancia cada 5 s (barata).
  setInterval(sc_vigilar, 5000);
}

/* ¿Está el supercerebro elegido y con un modelo listo? (lo consulta nuc_detectar) */
function sc_activo() {
  const s = estado.sc;
  return estado.cfg.motor === 'onnx' && !!(s && s.activo && s.sesiones[s.activo]);
}

/* ---------------------------------------------------------------------------
 * CARGA DE ONNX RUNTIME (script CDN) Y DE MODELOS (con caché y progreso)
 * -------------------------------------------------------------------------*/
function sc_cargarOrt() {
  const s = sc_estado();
  return new Promise((resolve) => {
    if (s.ortListo && typeof ort !== 'undefined') { resolve(true); return; }
    if (s.cargandoOrt) { // ya en marcha: espera educadamente
      const t = setInterval(() => {
        if (s.ortListo) { clearInterval(t); resolve(true); }
      }, 300);
      setTimeout(() => { clearInterval(t); resolve(s.ortListo); }, 30000);
      return;
    }
    s.cargandoOrt = true;
    const tag = document.createElement('script');
    tag.src = SC_ORT_URL;
    tag.onload = () => {
      try {
        ort.env.wasm.wasmPaths = SC_ORT_WASM_BASE;
        ort.env.wasm.numThreads = 1;   // sin COOP/COEP no hay multihilo; 1 es lo seguro
      } catch (e) { /* valores por defecto */ }
      s.ortListo = true; s.cargandoOrt = false; resolve(true);
    };
    tag.onerror = () => {
      s.cargandoOrt = false;
      sc_fallo('No se pudo descargar onnxruntime (¿sin internet?).');
      resolve(false);
    };
    document.head.appendChild(tag);
  });
}

/* URL del modelo (editable en Ajustes). Por defecto se descarga de la MISMA web
 * donde está la app (carpeta modelos/ en GitHub Pages): misma procedencia, sin
 * CORS y sin depender de Hugging Face (que empezó a devolver 401). Si la app se
 * abre como archivo suelto (file://) no habrá modelos ahí; entonces se cae al
 * espejo de Hugging Face por si acaso. El dueño puede sobrescribir la URL. */
function sc_urlModelo(clave) {
  const k = 'scUrl' + clave.toUpperCase();
  const propia = (estado.cfg[k] || '').trim();
  if (propia) return propia;
  const esArchivo = (typeof location !== 'undefined' && location.protocol === 'file:');
  if (esArchivo) {
    return 'https://huggingface.co/onnx-community/yolo11' + clave + '/resolve/main/onnx/model.onnx';
  }
  return 'modelos/yolo11' + clave + '.onnx';   // relativo a la web (GitHub Pages)
}

/* Descarga el .onnx con PROGRESO y lo guarda en Cache API (persistente).
 * Devuelve ArrayBuffer o null. alProgreso(pct|null, mbBajados) opcional. */
async function sc_descargarModelo(clave, alProgreso) {
  const url = sc_urlModelo(clave);
  try {
    // 1) ¿ya está en caché?
    if (typeof caches !== 'undefined') {
      try {
        const cache = await caches.open(SC_CACHE);
        const hit = await cache.match(url);
        if (hit) return await hit.arrayBuffer();
      } catch (e) { /* sin Cache API (file://): descarga directa */ }
    }
    // 2) descarga con progreso
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const total = parseInt(resp.headers.get('content-length') || '0', 10);
    let bajado = 0;
    const trozos = [];
    const reader = resp.body && resp.body.getReader ? resp.body.getReader() : null;
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        trozos.push(value); bajado += value.byteLength;
        if (alProgreso) alProgreso(total ? Math.round(bajado * 100 / total) : null, bajado / 1048576);
      }
    }
    const blob = reader ? new Blob(trozos) : await resp.blob();
    const buf = await blob.arrayBuffer();
    // 3) a la caché para la próxima vez
    if (typeof caches !== 'undefined') {
      try {
        const cache = await caches.open(SC_CACHE);
        await cache.put(url, new Response(blob, { headers: { 'Content-Type': 'application/octet-stream' } }));
      } catch (e) { /* si no cabe, seguimos sin caché */ }
    }
    return buf;
  } catch (e) {
    console.warn('[supercerebro] descarga de ' + clave + ' falló:', e && e.message);
    sc_fallo('No se pudo descargar el modelo ' + clave.toUpperCase() + ' (' +
      ((e && e.message) || 'red') + '). Comprueba internet o la URL en Ajustes.');
    return null;
  }
}

/* Crea (o recupera) la sesión de un modelo. WebGPU → WASM con aviso. */
async function sc_cargarModelo(clave, alProgreso) {
  const s = sc_estado();
  if (s.sesiones[clave]) return s.sesiones[clave];
  if (s.cargando[clave]) return null;
  s.cargando[clave] = true;
  try {
    if (!(await sc_cargarOrt())) return null;
    const buf = await sc_descargarModelo(clave, alProgreso);
    if (!buf) return null;
    let sesion = null;
    // Primero WebGPU (S22 ✓); si no, WASM con aviso de backend. Guardamos los
    // errores reales de cada intento para diagnóstico (antes se ocultaban).
    let errGpu = '', errWasm = '';
    try {
      sesion = await ort.InferenceSession.create(buf, { executionProviders: ['webgpu'] });
      s.backend = 'webgpu';
    } catch (e1) {
      errGpu = (e1 && e1.message) || String(e1);
      try {
        sesion = await ort.InferenceSession.create(buf, { executionProviders: ['wasm'] });
        s.backend = 'wasm';
        sc_toast('WebGPU no disponible: el supercerebro usa WASM (más lento).', 'info');
      } catch (e2) {
        errWasm = (e2 && e2.message) || String(e2);
        const detalle = ('GPU: ' + errGpu + ' · WASM: ' + errWasm).slice(0, 240);
        throw new Error(detalle);
      }
    }
    s.sesiones[clave] = sesion;
    sc_avisarBackend();
    return sesion;
  } catch (e) {
    console.warn('[supercerebro] no se pudo crear la sesión ' + clave + ':', e && e.message);
    sc_fallo('El modelo ' + clave.toUpperCase() + ' no se pudo cargar. Detalle → ' + ((e && e.message) || '?'));
    return null;
  } finally {
    s.cargando[clave] = false;
  }
}

/* Refresca el indicador de backend (WebGPU/WASM) en Ajustes y avisa a la UI.
 * Nunca lanza: si el nodo o el bus no están, no pasa nada. */
function sc_avisarBackend() {
  const s = sc_estado();
  try {
    const el = document.getElementById('cfg-scBackend');
    if (el) el.textContent = (s.backend || '—').toUpperCase();
  } catch (e) { /* sin panel de ajustes montado */ }
  try {
    if (typeof bus !== 'undefined' && bus.emit) bus.emit('cfg:cambio', { clave: 'scBackend' });
  } catch (e) { /* el bus siempre existe, pero por si acaso */ }
}

/* Activa un modelo como el de trabajo (descargando si hace falta). */
async function sc_activar(clave, alProgreso) {
  const s = sc_estado();
  if (!SC_MODELOS[clave]) return false;
  const sesion = await sc_cargarModelo(clave, alProgreso);
  if (!sesion) return false;
  s.activo = clave;
  estado.cfg.scModelo = clave;
  nuc_guardar('cfg', estado.cfg);
  bus.emit('cfg:cambio', { clave: 'scModelo' });
  sc_toast('Supercerebro activo: ' + SC_MODELOS[clave].nombre + ' · ' + s.backend.toUpperCase(), 'info');
  return true;
}

/* ---------------------------------------------------------------------------
 * PRE/POST-PROCESADO (funciones puras y testeables)
 * -------------------------------------------------------------------------*/

/* Letterbox: parámetros de escalado de (w,h) del frame a la entrada cuadrada.
 * Devuelve {k (escala), dx, dy (relleno), lado}. PURA (testeable). */
function sc_letterbox(w, h, lado) {
  const k = Math.min(lado / w, lado / h);
  const nw = Math.round(w * k), nh = Math.round(h * k);
  return { k: k, dx: Math.floor((lado - nw) / 2), dy: Math.floor((lado - nh) / 2), nw: nw, nh: nh, lado: lado };
}

/* Tabla i/255 precalculada: evita 1.2 millones de divisiones por inferencia. */
const SC_LUT255 = (function () {
  const t = new Float32Array(256);
  for (let i = 0; i < 256; i++) t[i] = i / 255;
  return t;
})();

/* Frame → tensor float32 [1,3,lado,lado] RGB/255 con letterbox gris.
 * El Float32Array se REUTILIZA entre inferencias (app_ocupado las serializa):
 * crear 4.9 MB de tensor nuevo por frame a 5-8 inf/s eran 25-40 MB/s de
 * basura → pausas del recolector = microtirones. */
function sc_preprocesar(fuente, w, h) {
  const s = sc_estado();
  const lado = SC_ENTRADA;
  const lb = sc_letterbox(w, h, lado);
  let cnv = s.cnv;
  if (!cnv) { cnv = s.cnv = document.createElement('canvas'); }
  if (cnv.width !== lado || cnv.height !== lado) { cnv.width = lado; cnv.height = lado; }
  const ctx = cnv.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#727272';                       // gris de relleno estándar YOLO
  ctx.fillRect(0, 0, lado, lado);
  ctx.drawImage(fuente, 0, 0, w, h, lb.dx, lb.dy, lb.nw, lb.nh);
  const img = ctx.getImageData(0, 0, lado, lado).data;
  const n = lado * lado;
  if (!s.tensorDatos || s.tensorDatos.length !== 3 * n) s.tensorDatos = new Float32Array(3 * n);
  const datos = s.tensorDatos;
  for (let i = 0; i < n; i++) {                    // HWC uint8 → CHW float
    datos[i] = SC_LUT255[img[i * 4]];              // R
    datos[n + i] = SC_LUT255[img[i * 4 + 1]];      // G
    datos[2 * n + i] = SC_LUT255[img[i * 4 + 2]];  // B
  }
  return { datos: datos, lb: lb };
}

/* IoU de dos cajas {x,y,an,al}. PURA. */
function sc_iou(a, b) {
  const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.an, b.x + b.an), y2 = Math.min(a.y + a.al, b.y + b.al);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const uni = a.an * a.al + b.an * b.al - inter;
  return uni <= 0 ? 0 : inter / uni;
}

/* NMS POR CLASE (no fusiona personas con coches, y dentro de una clase deja
 * pasar cuerpos solapados por debajo del IoU 0.5). PURA. */
function sc_nms(dets, iouMax, maxSalida) {
  dets.sort((a, b) => b.score - a.score);
  const fuera = [];
  for (let i = 0; i < dets.length && fuera.length < maxSalida; i++) {
    const d = dets[i];
    let pisa = false;
    for (let j = 0; j < fuera.length; j++) {
      if (fuera[j].clase === d.clase && sc_iou(fuera[j].caja, d.caja) > iouMax) { pisa = true; break; }
    }
    if (!pisa) fuera.push(d);
  }
  return fuera;
}

/* Decodifica la salida cruda de YOLO11 a detecciones en px del FRAME.
 * Soporta las dos formas habituales de exportación:
 *   [1, 84, 8400]  → 4 caja (cx,cy,w,h en escala de entrada) + 80 clases.
 *   [1, N, 6]      → export "end2end" (x1,y1,x2,y2,score,clase), NMS incluido.
 * PURA (recibe todo por parámetros; testeable con datos sintéticos). */
function sc_decodificar(datos, dims, lb, umbral, w, h) {
  const dets = [];
  const desLetterbox = (x, y) => ({
    x: Math.max(0, Math.min(w, (x - lb.dx) / lb.k)),
    y: Math.max(0, Math.min(h, (y - lb.dy) / lb.k)),
  });

  if (dims.length === 3 && dims[1] >= 84 && dims[2] > dims[1]) {
    // ---- [1, 84, 8400]: transpuesta por canales -------------------------
    const nc = dims[1] - 4, na = dims[2];
    for (let i = 0; i < na; i++) {
      let mejor = 0, mejorC = -1;
      for (let c = 0; c < nc; c++) {
        const v = datos[(4 + c) * na + i];
        if (v > mejor) { mejor = v; mejorC = c; }
      }
      if (mejor < umbral || mejorC < 0) continue;
      const cx = datos[i], cy = datos[na + i], an = datos[2 * na + i], al = datos[3 * na + i];
      const p1 = desLetterbox(cx - an / 2, cy - al / 2);
      const p2 = desLetterbox(cx + an / 2, cy + al / 2);
      const caja = { x: p1.x, y: p1.y, an: p2.x - p1.x, al: p2.y - p1.y };
      if (caja.an < 2 || caja.al < 2) continue;
      dets.push({ clase: SC_COCO[mejorC] || ('clase' + mejorC), score: mejor, caja: caja });
    }
    return sc_nms(dets, SC_NMS_IOU, SC_MAX_DETS);
  }

  if (dims.length === 3 && dims[2] === 6) {
    // ---- [1, N, 6]: ya viene con NMS ------------------------------------
    const n = dims[1];
    for (let i = 0; i < n; i++) {
      const off = i * 6;
      const score = datos[off + 4];
      if (score < umbral) continue;
      const p1 = desLetterbox(datos[off], datos[off + 1]);
      const p2 = desLetterbox(datos[off + 2], datos[off + 3]);
      const caja = { x: p1.x, y: p1.y, an: p2.x - p1.x, al: p2.y - p1.y };
      if (caja.an < 2 || caja.al < 2) continue;
      const idc = Math.round(datos[off + 5]);
      dets.push({ clase: SC_COCO[idc] || ('clase' + idc), score: score, caja: caja });
      if (dets.length >= SC_MAX_DETS) break;
    }
    return dets;
  }

  console.warn('[supercerebro] forma de salida desconocida:', dims.join('x'));
  return [];
}

/* ---------------------------------------------------------------------------
 * DETECCIÓN (la llama nuc_detectar cuando cfg.motor === 'onnx')
 * -------------------------------------------------------------------------*/
async function sc_detectar(fuente) {
  const s = estado.sc;
  if (!fuente || !s || !s.activo) return [];
  // El adaptativo del copiloto puede pedir otro modelo que el "activo" nominal.
  const clave = sc_claveEfectiva();
  const sesion = s.sesiones[clave] || s.sesiones[s.activo];
  if (!sesion) return [];
  try {
    const w = estado.video.w || 640, h = estado.video.h || 480;
    const t0 = performance.now();
    const pre = sc_preprocesar(fuente, w, h);
    const tensor = new ort.Tensor('float32', pre.datos, [1, 3, SC_ENTRADA, SC_ENTRADA]);
    const nombreEntrada = sesion.inputNames && sesion.inputNames[0] ? sesion.inputNames[0] : 'images';
    const alim = {}; alim[nombreEntrada] = tensor;
    const salida = await sesion.run(alim);
    const primera = salida[sesion.outputNames && sesion.outputNames[0]] || salida[Object.keys(salida)[0]];
    if (!primera) return [];
    const umbral = Math.max(0.15, Math.min(0.8,
      (typeof nuc_scoreMin === 'function' ? nuc_scoreMin() : estado.cfg.scoreMin) || 0.30));
    const dets = sc_decodificar(primera.data, primera.dims, pre.lb, umbral, w, h);
    const ms = performance.now() - t0;
    s.msMedia = s.msMedia ? (s.msMedia * 0.85 + ms * 0.15) : ms;
    // Tiempo medio POR MODELO (media móvil): el guardarraíl en vivo lo usa
    // para bajar de modelo si ESTE móvil no puede con el elegido.
    if (!s.msPor) { s.msPor = {}; s.msPorN = {}; }
    s.msPor[clave] = s.msPor[clave] ? (s.msPor[clave] * 0.8 + ms * 0.2) : ms;
    s.msPorN[clave] = (s.msPorN[clave] || 0) + 1;
    return dets;
  } catch (e) {
    console.warn('[supercerebro] fallo en inferencia:', e && e.message);
    return [];
  }
}

/* Clave del modelo a usar AHORA (aplica el cerebro adaptativo del copiloto). */
function sc_claveEfectiva() {
  const s = estado.sc;
  if (!s) return 'n';
  if (estado.cfg.copActivo && estado.cfg.copCerebroAuto && !estado.cfg.copForzarGrande
      && s.adaptActual === 'rapido' && s.sesiones.n) return 'n';
  let clave = s.activo || 'n';
  // PRECISIÓN a la medida de ESTE móvil: en copiloto, el modo precisión no usa
  // un modelo mayor que el que el benchmark del dispositivo aguanta (≥4 FPS).
  // Sin benchmark hecho o con «forzar grande», no cambia nada.
  if (estado.cfg.copActivo && !estado.cfg.copForzarGrande) {
    try {
      const bench = nuc_cargar('sc_bench', null);
      const orden = ['n', 's', 'm'];
      if (bench && bench.recomendado && orden.indexOf(clave) > orden.indexOf(bench.recomendado)) {
        if (s.sesiones[bench.recomendado]) clave = bench.recomendado;
        else if (s.sesiones.n) clave = 'n';
      }
    } catch (e) { /* sin benchmark: se queda como estaba */ }
    clave = sc_guardarrailVivo(clave);
  }
  return clave;
}

/* GUARDARRAÍL EN VIVO (sin benchmark manual): si el modelo elegido va MEDIDO
 * a >300 ms por análisis (~<3 FPS) en ESTE móvil tras ≥8 inferencias reales,
 * baja solo al hermano menor (m→s→n). La propia conducción es el benchmark.
 * Si el menor no está cargado aún, se descarga en segundo plano y se cambia
 * en cuanto está. Con «forzar grande», no actúa (decisión del dueño). */
const SC_GUARDA_MS = 300;      // >300 ms medios = ese modelo NO vale para conducir
const SC_GUARDA_MUESTRAS = 8;  // mínimo de inferencias reales antes de juzgar
function sc_guardarrailVivo(clave) {
  const s = estado.sc;
  if (!s || !s.msPor) return clave;
  const orden = ['n', 's', 'm'];
  let idx = orden.indexOf(clave);
  while (idx > 0
         && (s.msPorN[orden[idx]] || 0) >= SC_GUARDA_MUESTRAS
         && s.msPor[orden[idx]] > SC_GUARDA_MS) {
    const menor = orden[idx - 1];
    if (s.sesiones[menor]) {
      clave = menor; idx--;
      if (s.avisoGuarda !== menor) {
        s.avisoGuarda = menor;
        if (typeof ui_toast === 'function') {
          try {
            ui_toast('⚡ Este móvil no puede con el modelo grande (iba a ' +
              Math.round(1000 / s.msPor[orden[idx + 1]]) + ' FPS). Cambiado solo a «' +
              (SC_MODELOS[menor] ? SC_MODELOS[menor].nombre : menor) + '» para que el copiloto reaccione a tiempo.', 'info');
          } catch (e) {}
        }
      }
    } else {
      // El menor no está cargado: descargarlo en segundo plano y, mientras,
      // seguir con el actual (mejor lento que ciego).
      if (!s.cargandoGuarda) {
        s.cargandoGuarda = true;
        Promise.resolve(sc_cargarModelo(menor)).catch(function () {})
          .finally(function () { s.cargandoGuarda = false; });
      }
      break;
    }
  }
  return clave;
}

/* ---------------------------------------------------------------------------
 * BENCHMARK — 20 inferencias por modelo DESCARGADO → FPS medidos en ESTE
 * dispositivo y recomendación honesta (el mayor que aguante ≥4 FPS).
 * -------------------------------------------------------------------------*/
async function sc_benchmark(alTexto) {
  const s = sc_estado();
  const decir = (t) => { if (alTexto) alTexto(t); };
  if (!(await sc_cargarOrt())) return null;

  // frame sintético para las pruebas (no hace falta cámara)
  const cnv = document.createElement('canvas');
  cnv.width = 640; cnv.height = 480;
  const cctx = cnv.getContext('2d');
  cctx.fillStyle = '#334'; cctx.fillRect(0, 0, 640, 480);
  cctx.fillStyle = '#a86'; cctx.fillRect(200, 120, 90, 240);

  const resultados = {};
  const claves = ['n', 's', 'm'];
  for (const clave of claves) {
    if (!s.sesiones[clave]) {
      // Solo probamos lo ya descargado: bajar 120 MB sin permiso no es de recibo.
      const url = sc_urlModelo(clave);
      let enCache = false;
      try { const c = await caches.open(SC_CACHE); enCache = !!(await c.match(url)); } catch (e) {}
      if (!enCache) { resultados[clave] = { sinDescargar: true }; continue; }
      decir('Cargando ' + SC_MODELOS[clave].nombre + ' desde la caché…');
      await sc_cargarModelo(clave);
      if (!s.sesiones[clave]) { resultados[clave] = { error: true }; continue; }
    }
    decir('Midiendo ' + SC_MODELOS[clave].nombre + ' (20 inferencias)…');
    const sesion = s.sesiones[clave];
    const tiempos = [];
    try {
      for (let i = 0; i < 22; i++) {
        const pre = sc_preprocesar(cnv, 640, 480);
        const tensor = new ort.Tensor('float32', pre.datos, [1, 3, SC_ENTRADA, SC_ENTRADA]);
        const alim = {}; alim[sesion.inputNames[0]] = tensor;
        const t0 = performance.now();
        await sesion.run(alim);
        const ms = performance.now() - t0;
        if (i >= 2) tiempos.push(ms);              // las 2 primeras calientan, fuera
      }
      tiempos.sort((a, b) => a - b);
      const mediana = tiempos[Math.floor(tiempos.length / 2)];
      resultados[clave] = { ms: Math.round(mediana), fps: Math.round(10000 / mediana) / 10 };
    } catch (e) {
      resultados[clave] = { error: true };
    }
  }

  // memoria (si el navegador la expone — Chrome sí)
  let memoriaMB = null;
  try { if (performance.memory) memoriaMB = Math.round(performance.memory.usedJSHeapSize / 1048576); } catch (e) {}

  // recomendación: el mayor con fps >= 4
  let recomendado = null;
  for (const k of ['m', 's', 'n']) {
    if (resultados[k] && resultados[k].fps >= 4) { recomendado = k; break; }
  }
  const informe = { fecha: Date.now(), backend: s.backend, resultados: resultados,
                    recomendado: recomendado, memoriaMB: memoriaMB };
  nuc_guardar('sc_bench', informe);
  if (recomendado && resultados[recomendado]) {
    s.msBase = resultados[recomendado].ms;         // referencia para la térmica
    // Además de recomendar, APLICA: deja puesto el modelo que este móvil
    // aguanta (antes solo lo decía y había que cambiarlo a mano).
    if (s.sesiones[recomendado] && s.activo !== recomendado) {
      s.activo = recomendado;
      estado.cfg.scModelo = recomendado;
      nuc_guardar('cfg', estado.cfg);
      try {
        const sel = document.getElementById('cfg-scModelo');
        if (sel) sel.value = recomendado;
        bus.emit('cfg:cambio', { clave: 'scModelo' });
      } catch (e) { /* sin panel montado */ }
      decir('Aplicado: ' + SC_MODELOS[recomendado].nombre + ' (el que tu móvil mueve con soltura).');
      sc_toast('Benchmark aplicado: supercerebro en ' + SC_MODELOS[recomendado].nombre + '.', 'info');
    }
  }
  return informe;
}

/* ---------------------------------------------------------------------------
 * VIGILANCIA cada 5 s: GESTIÓN TÉRMICA + CEREBRO ADAPTATIVO DEL COPILOTO
 * -------------------------------------------------------------------------*/
function sc_vigilar() {
  const s = estado.sc;
  if (!s || estado.cfg.motor !== 'onnx' || !s.activo) return;
  const ahora = Date.now();

  /* --- Térmica: la inferencia se degrada sostenidamente → bajar modelo ----*/
  try {
    const base = s.msBase || 0;
    const orden = ['n', 's', 'm'];
    const idx = orden.indexOf(s.activo);
    // En copiloto la latencia manda: por encima de ~500 ms sostenidos ya se
    // arrastra (a 747 ms el límite viejo de 900 no saltaba y todo iba a 2 fps).
    const limiteMs = estado.cfg.copActivo ? 500 : 900;
    const degradado = (base > 0 && s.msMedia > base * 1.7) || (s.msMedia > limiteMs);
    if (degradado && idx > 0 && ahora - s.ultCambioTermica > 20000) {
      // Baja al modelo CARGADO más cercano por debajo. (Antes exigía justo el
      // inmediato: con 'm' activo y 's' sin descargar no podía bajar y el
      // móvil se quedaba clavado a 2 fps para siempre.)
      for (let j = idx - 1; j >= 0; j--) {
        const nuevo = orden[j];
        if (!s.sesiones[nuevo]) continue;
        s.activo = nuevo; s.termicaBajadas++; s.ultCambioTermica = ahora; s.msMedia = 0;
        sc_toast('El móvil va justo (¿calor?): supercerebro baja a ' + SC_MODELOS[nuevo].nombre + '.', 'info');
        break;
      }
    } else if (!degradado && s.termicaBajadas > 0 && idx < orden.indexOf(estado.cfg.scModelo || 'n')
               && ahora - s.ultCambioTermica > 120000) {
      const objetivo = orden[idx + 1];
      if (s.sesiones[objetivo] && base > 0 && s.msMedia < base * 0.9) {
        s.activo = objetivo; s.termicaBajadas--; s.ultCambioTermica = ahora; s.msMedia = 0;
        sc_toast('Recuperado: supercerebro vuelve a ' + SC_MODELOS[objetivo].nombre + '.', 'info');
      }
    }
  } catch (e) { /* la vigilancia nunca rompe */ }

  /* --- Adaptativo copiloto: por velocidad GPS -----------------------------*/
  try {
    if (!estado.cfg.copActivo || !estado.cfg.copCerebroAuto || estado.cfg.copForzarGrande) {
      s.adaptActual = ''; return;
    }
    // Precarga del cerebro rápido al entrar en copiloto (cambio fluido, sin
    // descargar/cargar en marcha) — una sola vez por sesión.
    if (!s.sesiones.n && !s.cargando.n && !s.precargaPedida && s.activo !== 'n') {
      s.precargaPedida = true;
      sc_precargarCopiloto();
    }
    const vel = (estado.cop && estado.cop.velActual) || 0;
    const umbral = estado.cfg.copUmbralVel || 30;
    if (vel > umbral) {
      s.adaptActual = 'rapido'; s.adaptLentoDesde = 0;     // rápido YA (la latencia manda)
    } else {
      if (!s.adaptLentoDesde) s.adaptLentoDesde = ahora;
      if (ahora - s.adaptLentoDesde >= 30000) s.adaptActual = 'preciso';  // histéresis 30 s
    }
  } catch (e) { /* ídem */ }
}

/* Precarga del modelo rápido al entrar en Copiloto (para el cambio fluido). */
async function sc_precargarCopiloto() {
  const s = sc_estado();
  if (estado.cfg.motor !== 'onnx') return;
  if (!s.sesiones.n) {
    sc_toast('Precargando el cerebro rápido para el copiloto…', 'info');
    await sc_cargarModelo('n');
  }
}

/* Chip "CEREBRO: PRECISIÓN/RÁPIDO" sobre el HUD del copiloto (pintor 75). */
function sc_pintarChip(ctx) {
  if (!ctx || estado.cfg.motor !== 'onnx' || !estado.cfg.copActivo) return;
  const s = estado.sc; if (!s || !s.activo) return;
  try {
    const w = estado.video.w || 640;
    const clave = sc_claveEfectiva();
    const modo = (clave === 'n' && s.adaptActual === 'rapido') ? 'RÁPIDO' : 'PRECISIÓN';
    const txt = 'CEREBRO: ' + modo;
    ctx.save();
    ctx.font = "bold 11px ui-monospace,Consolas,monospace";
    const an = ctx.measureText(txt).width + 14;
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ctx.fillRect(w - an - 10, 74, an, 20);
    ctx.fillStyle = (modo === 'RÁPIDO') ? '#3fa9ff' : '#2ee584';
    ctx.textAlign = 'left';
    ctx.fillText(txt, w - an - 3, 88);
    ctx.restore();
  } catch (e) { /* pintado nunca rompe */ }
}

/* ---------------------------------------------------------------------------
 * AUXILIARES
 * -------------------------------------------------------------------------*/
function sc_fallo(msg) {
  const s = sc_estado();
  // Cae al motor básico con aviso (una sola vez), sin dejar la app ciega.
  if (estado.cfg.motor === 'onnx') {
    estado.cfg.motor = 'coco';
    nuc_guardar('cfg', estado.cfg);
    bus.emit('cfg:cambio', { clave: 'motor' });
    if (!s.avisoBasico) {
      s.avisoBasico = true;
      bus.emit('video:error', { msg: 'Supercerebro: ' + msg + ' Se sigue con el motor básico.' });
    }
  } else {
    bus.emit('error:general', { msg: 'Supercerebro: ' + msg });
  }
}
function sc_toast(msg, nivel) {
  if (typeof ui_toast === 'function') { try { ui_toast(msg, nivel || 'info'); } catch (e) {} }
}

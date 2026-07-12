/* ============================================================================
 * 13-YOLO — VIGÍA IA · motor de detección POTENTE en el navegador (prefijo yolo_).
 * Corre un modelo de detección de verdad (YOLOS/DETR) sobre el propio móvil con
 * Transformers.js (ONNX por WebGPU/WASM). Mucho más certero que COCO-SSD para
 * gente parcial, de lado o entre estanterías — a cambio de ir más lento.
 *
 * ⚙️ ARQUITECTURA (anti-tirones): la inferencia corre en un WEB WORKER (hilo
 * aparte) siempre que el navegador lo permita — así el modelo puede tardar lo
 * que quiera SIN congelar la interfaz. Si el worker no puede arrancar, se cae
 * al hilo principal (funciona, pero con tirones y se avisa), y si tampoco, a
 * COCO con aviso honesto. Devuelve el MISMO formato que nuc_detectar.
 * ==========================================================================*/

/* CDN de Transformers.js (única excepción a "sin imports": import() dinámico). */
const YOLO_TJS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2';
/* Modelo por defecto: YOLOS-tiny (ligero, corre en móvil). Alternativa más
 * precisa y más lenta: 'Xenova/detr-resnet-50'. Configurable en Ajustes. */
const YOLO_MODELO_DEF = 'Xenova/yolos-tiny';
const YOLO_ANCHO_INFER_DEF = 512;   // ancho de análisis por defecto (configurable en Ajustes)
const YOLO_INIT_TIMEOUT_MS = 120000; // margen para descargar el modelo la 1ª vez
const YOLO_INFER_TIMEOUT_MS = 15000; // una inferencia colgada no bloquea la app
const YOLO_LENTO_MS = 1200;          // mediana por encima → sugerir modelo más ligero
const YOLO_AHOGO_MS = 2500;          // mediana por encima → AUTO-REBAJA al ligero

function yolo_estado() {
  if (!estado.yolo) {
    estado.yolo = { detector: null, RawImage: null, listo: false, cargando: false,
                    error: '', modelo: '', cnv: null, avisado: false,
                    worker: null, workerListo: false, pendientes: {}, sigId: 1,
                    tiempos: [], avisoLento: false, autoRebajado: false, avisoGpu: false };
  }
  return estado.yolo;
}

/* ============================================================================
 * WORKER: código fuente del hilo aparte. Carga Transformers.js y atiende
 * mensajes {init} y {detectar}. Vive como Blob para no romper el archivo único.
 * ==========================================================================*/
function yolo_codigoWorker() {
  return [
    'let detector = null, RawImage = null;',
    'self.onmessage = async (ev) => {',
    '  const m = ev.data || {};',
    '  if (m.tipo === "init") {',
    '    try {',
    '      const tjs = await import(m.url);',
    '      try { tjs.env.allowLocalModels = false; } catch (e) {}',
    '      try { tjs.env.backends.onnx.wasm.numThreads = 2; } catch (e) {}',
    '      let opciones = {};',
    '      try { if (self.navigator && self.navigator.gpu) opciones = { device: "webgpu" }; } catch (e) {}',
    '      detector = await tjs.pipeline("object-detection", m.modelo, opciones);',
    '      RawImage = tjs.RawImage;',
    '      self.postMessage({ tipo: "listo" });',
    '    } catch (e) {',
    '      self.postMessage({ tipo: "fallo", msg: (e && e.message) || "no se pudo cargar" });',
    '    }',
    '  } else if (m.tipo === "detectar") {',
    '    if (!detector) { self.postMessage({ tipo: "dets", id: m.id, dets: [] }); return; }',
    '    try {',
    '      const img = new RawImage(new Uint8ClampedArray(m.buffer), m.w, m.h, 4);',
    '      const salida = await detector(img, { threshold: m.umbral, percentage: false });',
    '      const dets = salida.map((d) => ({ label: d.label, score: d.score, box: d.box }));',
    '      self.postMessage({ tipo: "dets", id: m.id, dets: dets });',
    '    } catch (e) {',
    '      self.postMessage({ tipo: "dets", id: m.id, dets: [] });',
    '    }',
    '  }',
    '};',
  ].join('\n');
}

/* Arranca el worker y carga el modelo dentro. Devuelve true si quedó listo. */
function yolo_initWorker(modelo) {
  const y = yolo_estado();
  if (typeof Worker === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined') {
    return Promise.resolve(false);
  }
  return new Promise((resolver) => {
    let w = null;
    try {
      const blob = new Blob([yolo_codigoWorker()], { type: 'text/javascript' });
      const urlBlob = URL.createObjectURL(blob);
      w = new Worker(urlBlob, { type: 'module' });
      URL.revokeObjectURL(urlBlob);
    } catch (e) { resolver(false); return; }

    const temporizador = setTimeout(() => {
      try { w.terminate(); } catch (e) {}
      resolver(false);
    }, YOLO_INIT_TIMEOUT_MS);

    w.onerror = () => {
      clearTimeout(temporizador);
      try { w.terminate(); } catch (e) {}
      resolver(false);
    };
    w.onmessage = (ev) => {
      const m = ev.data || {};
      if (m.tipo === 'listo') {
        clearTimeout(temporizador);
        y.worker = w; y.workerListo = true;
        w.onmessage = yolo_alMensaje;   // a partir de aquí, solo detecciones
        resolver(true);
      } else if (m.tipo === 'fallo') {
        clearTimeout(temporizador);
        try { w.terminate(); } catch (e) {}
        resolver(false);
      }
    };
    try { w.postMessage({ tipo: 'init', url: YOLO_TJS_URL, modelo: modelo }); }
    catch (e) { clearTimeout(temporizador); resolver(false); }
  });
}

/* Respuestas del worker: casa cada detección con su promesa pendiente. */
function yolo_alMensaje(ev) {
  const m = ev.data || {};
  if (m.tipo !== 'dets') return;
  const y = estado.yolo; if (!y) return;
  const p = y.pendientes[m.id];
  if (p) {
    delete y.pendientes[m.id];
    clearTimeout(p.temporizador);
    p.resolver(m.dets || []);
  }
}

/* Manda un frame al worker; si el worker calla (colgado), devuelve [] y sigue. */
function yolo_detectarEnWorker(datos, dw, dh, umbral) {
  const y = estado.yolo;
  return new Promise((resolver) => {
    const id = y.sigId++;
    const temporizador = setTimeout(() => {
      delete y.pendientes[id];
      resolver([]);
    }, YOLO_INFER_TIMEOUT_MS);
    y.pendientes[id] = { resolver: resolver, temporizador: temporizador };
    try {
      // El buffer se TRANSFIERE (no se copia): coste ~0 aunque el frame sea grande.
      y.worker.postMessage({ tipo: 'detectar', id: id, buffer: datos.data.buffer, w: dw, h: dh, umbral: umbral },
        [datos.data.buffer]);
    } catch (e) {
      clearTimeout(temporizador);
      delete y.pendientes[id];
      resolver([]);
    }
  });
}

/* ============================================================================
 * CARGA DEL MOTOR. Orden: worker (fluido) → hilo principal (tirones, avisa)
 * → COCO (aviso honesto). Nunca lanza.
 * ==========================================================================*/
async function yolo_init() {
  const y = yolo_estado();
  const modelo = estado.cfg.yoloModelo || YOLO_MODELO_DEF;
  if (y.listo && y.modelo === modelo) return true;
  if (y.cargando) return false;
  y.cargando = true; y.error = '';

  // Cambio de modelo: el worker anterior se jubila.
  if (y.worker) { try { y.worker.terminate(); } catch (e) {} }
  y.worker = null; y.workerListo = false; y.detector = null; y.listo = false;
  y.tiempos = []; y.avisoLento = false;

  try {
    if (typeof ui_toast === 'function') ui_toast('Cargando el motor potente (YOLO)… puede tardar la primera vez.', 'info');

    // 1º) WORKER: la inferencia en un hilo aparte — la interfaz no se traba.
    if (await yolo_initWorker(modelo)) {
      y.modelo = modelo; y.listo = true;
      estado.modelos.error = '';
      bus.emit('modelos:listos', { motor: 'yolo', modelo: modelo });
      if (typeof ui_toast === 'function') ui_toast('Motor potente (YOLO) listo — corre en un hilo aparte, sin trabar la app.', 'info');
      return true;
    }

    // 2º) HILO PRINCIPAL: funciona, pero puede dar tirones (se avisa).
    const tjs = await import(/* @vite-ignore */ YOLO_TJS_URL);
    try { tjs.env.allowLocalModels = false; } catch (e) {}
    try { tjs.env.backends.onnx.wasm.numThreads = 2; } catch (e) {}
    let opciones = {};
    try { if (navigator.gpu) opciones = { device: 'webgpu' }; } catch (e) {}
    y.detector = await tjs.pipeline('object-detection', modelo, opciones);
    y.RawImage = tjs.RawImage;
    y.modelo = modelo; y.listo = true;
    estado.modelos.error = '';
    bus.emit('modelos:listos', { motor: 'yolo', modelo: modelo });
    if (typeof ui_toast === 'function') {
      ui_toast('Motor potente listo, pero este navegador no deja usar un hilo aparte: puede dar tirones. Si molesta, usa el modelo «Rápido».', 'sospecha');
    }
    return true;
  } catch (e) {
    y.error = (e && e.message) || 'error';
    y.listo = false;
    console.warn('[yolo] no se pudo cargar el motor potente:', y.error);
    // Caemos al detector rápido para no dejar la app ciega.
    estado.cfg.motor = 'coco';
    nuc_guardar('cfg', estado.cfg);
    bus.emit('cfg:cambio', { clave: 'motor' });
    bus.emit('video:error', { msg: 'No se pudo cargar el motor potente (YOLO): ' + y.error +
      '. Se sigue con el detector rápido. Necesita buena conexión la primera vez y un móvil con cierta potencia.' });
    return false;
  } finally {
    y.cargando = false;
  }
}

/* Convierte la salida del modelo (espacio dw×dh) al espacio de frame W×H. */
function yolo_mapearCajas(salida, sx, sy) {
  const res = [];
  for (let i = 0; i < (salida || []).length; i++) {
    const d = salida[i];
    const b = d.box || {};
    const x = (b.xmin || 0) * sx, yy = (b.ymin || 0) * sy;
    const an = ((b.xmax || 0) - (b.xmin || 0)) * sx;
    const al = ((b.ymax || 0) - (b.ymin || 0)) * sy;
    if (an <= 1 || al <= 1) continue;
    res.push({ clase: d.label, score: d.score, caja: { x: x, y: yy, an: an, al: al } });
  }
  return res;
}

/* Vigila la velocidad real. Mediana >2.5s → AUTO-REBAJA al modelo ligero (el
 * pesado estaba ahogando el móvil). Mediana >1.2s → consejo una sola vez. */
function yolo_vigilarLentitud(ms) {
  const y = estado.yolo;
  y.tiempos.push(ms);
  if (y.tiempos.length > 10) y.tiempos.shift();
  if (y.tiempos.length < 5) return;
  const orden = y.tiempos.slice().sort((a, b) => a - b);
  const mediana = orden[Math.floor(orden.length / 2)];

  // Ahogo GRAVE (>4 s) con GPU disponible: el motor Potente va por CPU y aquí
  // es inviable. Se sugiere UNA vez cambiar al Supercerebro (usa la GPU/WebGPU,
  // ~50× más rápido). No cambia solo (hay que descargar el modelo), pero avisa
  // muy claro para sacar al dueño de la trampa.
  let hayGpu = false;
  try { hayGpu = !!(navigator.gpu); } catch (e) {}
  if (mediana > 2000 && hayGpu && !y.avisoGpu) {
    y.avisoGpu = true;
    if (typeof ui_toast === 'function') {
      try { ui_toast('⚠ El motor «Potente» va MUY lento aquí (~' + Math.round(mediana / 1000) +
        's/análisis) porque usa el procesador. Tu móvil tiene GPU: cambia a 🧠 Supercerebro en ' +
        'Ajustes → Detección → Motor. Va ~50 veces más rápido y no se traba.', 'sospecha'); } catch (e) {}
    }
  }

  // Ahogo real: cambio automático al ligero (una sola vez por sesión).
  if (mediana > YOLO_AHOGO_MS && !y.autoRebajado &&
      (y.modelo !== YOLO_MODELO_DEF || (estado.cfg.yoloRes && estado.cfg.yoloRes !== '512'))) {
    y.autoRebajado = true;
    estado.cfg.yoloModelo = YOLO_MODELO_DEF;
    estado.cfg.yoloRes = '512';
    nuc_guardar('cfg', estado.cfg);
    if (typeof ui_toast === 'function') {
      try { ui_toast('⚠ El modelo potente ahogaba este móvil (~' + Math.round(mediana / 100) / 10 +
        's por análisis). He cambiado solo al ligero (yolos-tiny · 512) para que no se trabe.', 'sospecha'); } catch (e) {}
    }
    yolo_init().catch(function () {});   // recarga con el ligero
    return;
  }

  if (y.avisoLento) return;
  if (mediana > YOLO_LENTO_MS) {
    y.avisoLento = true;
    if (typeof ui_toast === 'function') {
      try {
        ui_toast('El modelo potente va lento en este móvil (~' + Math.round(mediana / 100) / 10 +
          's por análisis). Consejo: en Ajustes → Detección baja a «Rápido (yolos-tiny)» y detalle «Normal (512)». Con este ritmo la app espera entre análisis para no calentar el móvil.', 'info');
      } catch (e) {}
    }
  }
}

/* Detección con YOLO sobre un <video>/<img>/<canvas>. Devuelve [{clase,score,caja}]
 * en el ESPACIO DE FRAME (px de estado.video.w/h), igual que nuc_detectar. */
async function yolo_detectar(fuente) {
  const y = estado.yolo;
  if (!fuente || !y || !y.listo) return [];
  if (!y.workerListo && !y.detector) return [];
  try {
    const W = estado.video.w || 640, H = estado.video.h || 480;
    // Ancho de análisis configurable: más alto = pilla gente más pequeña/lejana
    // (a costa de velocidad). Luego reescalamos las cajas al espacio de frame.
    const anchoInfer = Math.max(320, Math.min(768, Number(estado.cfg.yoloRes) || YOLO_ANCHO_INFER_DEF));
    const dw = Math.min(anchoInfer, W);
    const dh = Math.max(1, Math.round(H * dw / W));
    let cnv = y.cnv;
    if (!cnv) { cnv = y.cnv = document.createElement('canvas'); }
    if (cnv.width !== dw || cnv.height !== dh) { cnv.width = dw; cnv.height = dh; }
    const ctx = cnv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(fuente, 0, 0, dw, dh);
    let datos;
    try { datos = ctx.getImageData(0, 0, dw, dh); }
    catch (e) { return []; }   // canvas contaminado (cámara IP sin CORS)

    // yolos-tiny es RUIDOSO: a 0.35 etiqueta media tienda como "banco",
    // "snowboard", "paraguas", "maleta"… (falsos de baja confianza). Le exigimos
    // MÁS certeza (piso 0.5) para que solo salga lo seguro y no ese desastre de
    // cajas. El Supercerebro (YOLO11) es preciso y no necesita este colchón.
    const umbral = Math.max(0.5, Math.min(0.8,
      (typeof nuc_scoreMin === 'function' ? nuc_scoreMin() : estado.cfg.scoreMin) || 0.35));
    const sx = W / dw, sy = H / dh;
    const t0 = performance.now();

    // Camino bueno: el worker piensa y la interfaz sigue a lo suyo.
    if (y.workerListo && y.worker) {
      const salida = await yolo_detectarEnWorker(datos, dw, dh, umbral);
      yolo_vigilarLentitud(performance.now() - t0);
      return yolo_mapearCajas(salida, sx, sy);
    }

    // Camino de respaldo: hilo principal (puede dar tirones).
    const img = new y.RawImage(datos.data, dw, dh, 4);
    const salida = await y.detector(img, { threshold: umbral, percentage: false });
    yolo_vigilarLentitud(performance.now() - t0);
    return yolo_mapearCajas(salida, sx, sy);
  } catch (e) {
    console.warn('[yolo] fallo en la detección:', e && e.message);
    return [];
  }
}

/* ¿Está el motor potente activo y listo? (lo usa nuc_detectar y el bucle) */
function yolo_activo() {
  return estado.cfg.motor === 'yolo' && !!(estado.yolo && estado.yolo.listo);
}

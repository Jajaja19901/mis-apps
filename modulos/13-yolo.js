/* ============================================================================
 * 13-YOLO — VIGÍA IA · motor de detección POTENTE en el navegador (prefijo yolo_).
 * Corre un modelo de detección de verdad (YOLOS/DETR) sobre el propio móvil con
 * Transformers.js (ONNX por WebGPU/WASM). Mucho más certero que COCO-SSD para
 * gente parcial, de lado o entre estanterías — a cambio de ir más lento.
 * Se elige en Ajustes → Detección → Motor. Si no carga, se cae al rápido (COCO)
 * con aviso honesto. Devuelve el MISMO formato que nuc_detectar: [{clase,score,caja}].
 * ==========================================================================*/

/* CDN de Transformers.js (única excepción a "sin imports": import() dinámico). */
const YOLO_TJS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2';
/* Modelo por defecto: YOLOS-tiny (ligero, corre en móvil). Alternativa más
 * precisa y más lenta: 'Xenova/detr-resnet-50'. Configurable en Ajustes. */
const YOLO_MODELO_DEF = 'Xenova/yolos-tiny';
const YOLO_ANCHO_INFER = 512;   // ancho al que reducimos el frame para inferir (velocidad)

function yolo_estado() {
  if (!estado.yolo) {
    estado.yolo = { detector: null, RawImage: null, listo: false, cargando: false,
                    error: '', modelo: '', cnv: null, avisado: false };
  }
  return estado.yolo;
}

/* Carga Transformers.js y el modelo. Nunca lanza: si falla, cae a COCO. */
async function yolo_init() {
  const y = yolo_estado();
  if (y.listo && y.modelo === (estado.cfg.yoloModelo || YOLO_MODELO_DEF)) return true;
  if (y.cargando) return false;
  y.cargando = true; y.error = '';
  const modelo = estado.cfg.yoloModelo || YOLO_MODELO_DEF;
  try {
    if (typeof ui_toast === 'function') ui_toast('Cargando el motor potente (YOLO)… puede tardar la primera vez.', 'info');
    const tjs = await import(/* @vite-ignore */ YOLO_TJS_URL);
    try { tjs.env.allowLocalModels = false; } catch (e) {}
    // WebGPU si el móvil lo soporta (mucho más rápido); si no, WASM.
    let opciones = {};
    try { if (navigator.gpu) opciones = { device: 'webgpu' }; } catch (e) {}
    y.detector = await tjs.pipeline('object-detection', modelo, opciones);
    y.RawImage = tjs.RawImage;
    y.modelo = modelo; y.listo = true;
    estado.modelos.error = '';
    bus.emit('modelos:listos', { motor: 'yolo', modelo: modelo });
    if (typeof ui_toast === 'function') ui_toast('Motor potente (YOLO) listo.', 'info');
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

/* Detección con YOLO sobre un <video>/<img>/<canvas>. Devuelve [{clase,score,caja}]
 * en el ESPACIO DE FRAME (px de estado.video.w/h), igual que nuc_detectar. */
async function yolo_detectar(fuente) {
  const y = estado.yolo;
  if (!fuente || !y || !y.listo || !y.detector) return [];
  try {
    const W = estado.video.w || 640, H = estado.video.h || 480;
    // Reducimos el frame para inferir más rápido; luego reescalamos las cajas.
    const dw = Math.min(YOLO_ANCHO_INFER, W);
    const dh = Math.max(1, Math.round(H * dw / W));
    let cnv = y.cnv;
    if (!cnv) { cnv = y.cnv = document.createElement('canvas'); }
    if (cnv.width !== dw || cnv.height !== dh) { cnv.width = dw; cnv.height = dh; }
    const ctx = cnv.getContext('2d');
    ctx.drawImage(fuente, 0, 0, dw, dh);
    let datos;
    try { datos = ctx.getImageData(0, 0, dw, dh); }
    catch (e) { return []; }   // canvas contaminado (cámara IP sin CORS)

    const img = new y.RawImage(datos.data, dw, dh, 4);
    const umbral = Math.max(0.15, Math.min(0.8, estado.cfg.scoreMin || 0.35));
    const salida = await y.detector(img, { threshold: umbral, percentage: false });

    const sx = W / dw, sy = H / dh;
    const res = [];
    for (let i = 0; i < salida.length; i++) {
      const d = salida[i];
      const b = d.box || {};
      const x = (b.xmin || 0) * sx, yy = (b.ymin || 0) * sy;
      const an = ((b.xmax || 0) - (b.xmin || 0)) * sx;
      const al = ((b.ymax || 0) - (b.ymin || 0)) * sy;
      if (an <= 1 || al <= 1) continue;
      res.push({ clase: d.label, score: d.score, caja: { x: x, y: yy, an: an, al: al } });
    }
    return res;
  } catch (e) {
    console.warn('[yolo] fallo en la detección:', e && e.message);
    return [];
  }
}

/* ¿Está el motor potente activo y listo? (lo usa nuc_detectar y el bucle) */
function yolo_activo() {
  return estado.cfg.motor === 'yolo' && !!(estado.yolo && estado.yolo.listo);
}

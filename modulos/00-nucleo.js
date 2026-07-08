/* ============================================================================
 * 00-NÚCLEO — VIGÍA IA · estado central, bus de eventos y utilidades comunes.
 * Escrito por el arquitecto. Los módulos NO redeclaran nada de aquí.
 * ==========================================================================*/

/* --- CONFIG del dueño: cambia estos valores en 1 minuto --------------------
 * (El briefing no da nombre de negocio: placeholders neutros, ver CLAUDE.md) */
const CONFIG = {
  NOMBRE_APP: 'Vigía IA',
  NOMBRE_NEGOCIO: 'Tu Negocio',          // ← ponlo aquí (aparece en informes y cartel)
  STUDIO_BRAND: 'Incuba tu Negocio',
  STUDIO_AUTHOR: 'Jaime M. M.',
  STUDIO_URL: 'https://incubatunegocio.example',
  VERSION: '2.0',
};

/* --- Valores por defecto de configuración (la app funciona sin tocar nada) */
const CFG_DEFECTOS = {
  modo: 'super',            // 'super' | 'carretera'
  fps: 8,                   // FPS de inferencia (3-20; a partir de 10 exige móvil potente)
  posesMax: 3,              // personas analizadas A LA VEZ por el modelo de postura (1-6)
  scoreMin: 0.35,           // confianza mínima (bajo = detecta más personas)
  motor: 'coco',            // 'coco' básico | 'yolo' potente (Transformers.js) | 'onnx' SUPERCEREBRO (YOLO11)
  yoloModelo: 'Xenova/yolos-tiny',  // modelo del motor potente (yolos-tiny|yolos-small|detr-resnet-50)
  yoloRes: 512,             // ancho de análisis del motor potente (más alto = ve más lejos, más lento)
  // Supercerebro (ONNX Runtime + YOLO11, módulo 16)
  scModelo: 'n',            // 'n' rápido | 's' equilibrado | 'm' máxima precisión
  scUrlN: '', scUrlS: '', scUrlM: '',   // URLs personalizadas de los .onnx ('' = por defecto)
  // Cerebro adaptativo del copiloto
  copCerebroAuto: true,     // cambiar de modelo según la velocidad GPS
  copUmbralVel: 30,         // km/h: por encima, cerebro rápido (la latencia manda)
  copForzarGrande: false,   // forzar PRECISIÓN siempre (con aviso honesto)
  fuente: 'camara',         // 'camara' | 'ip' | 'archivo' | 'dashcam'
  urlDashcam: 'http://localhost:1984/api/stream.mjpeg?src=dashcam',  // MJPEG de go2rtc
  // Detalle / recorrido (módulo 14)
  detalleRecorrido: false,  // dibujar la estela/trayectoria de cada objeto
  detalleVelocidad: false,  // mostrar velocidad (km/h) también de peatones
  detalleModo: false,       // overlay de detalle (dirección, tiempo parado…)
  // Copiloto / coche (módulo 15)
  copActivo: false,         // panel copiloto visible
  copColisionAviso: true,   // aviso de colisión frontal (vehículo que se acerca rápido)
  copParkingOn: false,      // vigilancia de coche aparcado (acelerómetro + alertas)
  copSensibilidadG: 2.2,    // umbral de golpe (g) para la caja negra / aparcado
  camara: 'environment',    // 'user' | 'environment' (lado, si no hay lente concreta)
  camaraId: '',             // deviceId de la lente EXACTA elegida ('' = automática por lado)
  resolucion: '720',        // '480' | '720' | '1080'
  modeloPreciso: false,     // true = modelo más certero (ve más, va algo más lento)
  urlIP: '',
  aforoMax: 50,
  merodeoSeg: 30,
  colaN: 4,
  colaSeg: 45,
  carreraVel: 2.2,          // umbral relativo: px/s = carreraVel * anchoFrame / 10
  caidaSeg: 3,
  abandonoSeg: 30,
  abandonoDistRel: 0.18,
  ocultacionUmbral: 60,
  fueraHorarioOn: false,
  fueraHorarioIni: '22:00',
  fueraHorarioFin: '07:00',
  ruidoOn: false,
  ruidoNivel: 80,
  sabotajeSens: 60,
  privacidad: false,
  clipSospecha: true,
  alertaCooldownSeg: 30,
  telegramToken: '',
  telegramChat: '',
  detencionSeg: 60,
  calor: false,
  timelapseMin: 5,
  debugPose: false,
  sonidoOn: true,
  legalResponsable: '',
  legalContacto: '',
};

/* --- Estado central único (los módulos añaden estado.<prefijo> en su init) */
const estado = {
  arrancado: false,
  cfg: Object.assign({}, CFG_DEFECTOS),
  video:   { tipo: null, listo: false, w: 640, h: 480, grabando: false, msInferencia: 0, fpsReal: 0 },
  modelos: { coco: null, cocoListo: false, poseListo: false, error: '' },
  detecciones: [],
  tracks: [],
  zonas: [],
  lineas: [],
  alertas: { criticoTracks: [] },
  ui: { vista: 'monitor', dibujando: null, aforoPublico: false, pinOk: false },
};

/* --- Bus de eventos (un módulo roto no tumba el bucle) ---------------------*/
const bus = (() => {
  const oyentes = {};
  return {
    on(evt, fn) { (oyentes[evt] = oyentes[evt] || []).push(fn); },
    off(evt, fn) { if (oyentes[evt]) oyentes[evt] = oyentes[evt].filter((f) => f !== fn); },
    emit(evt, datos) {
      (oyentes[evt] || []).forEach((fn) => {
        try { fn(datos); } catch (e) { console.warn('[bus] fallo en oyente de "' + evt + '":', e && e.message); }
      });
    },
  };
})();

/* --- Grupos de clases COCO y traducciones ---------------------------------*/
const NUC_PERSONA  = ['person'];
const NUC_VEHICULOS = ['car', 'truck', 'bus', 'motorcycle', 'bicycle'];
const NUC_BOLSAS   = ['backpack', 'handbag', 'suitcase'];
const NUC_ANIMALES = ['dog', 'cat', 'bird'];
const NUC_CLASES_ES = {
  person: 'persona', car: 'coche', truck: 'camión', bus: 'bus', motorcycle: 'moto',
  bicycle: 'bici', backpack: 'mochila', handbag: 'bolso', suitcase: 'maleta',
  dog: 'perro', cat: 'gato', bird: 'pájaro', umbrella: 'paraguas', 'cell phone': 'móvil',
  bottle: 'botella', chair: 'silla', 'potted plant': 'planta', tv: 'pantalla',
};
function nuc_claseES(clase) { return NUC_CLASES_ES[clase] || clase; }

/* --- Persistencia (localStorage con prefijo; PROHIBIDO usarlo directo) -----*/
const NUC_PREFIJO = 'vigia_';
function nuc_guardar(clave, valor) {
  try {
    localStorage.setItem(NUC_PREFIJO + clave, JSON.stringify(valor));
    const uso = nuc_usoAlmacenMB();
    if (uso > 3.5) bus.emit('almacen:aviso', { usoMB: uso, limiteMB: 5 });
    return true;
  } catch (e) {
    console.warn('[almacén] no se pudo guardar "' + clave + '":', e && e.message);
    bus.emit('almacen:aviso', { usoMB: nuc_usoAlmacenMB(), limiteMB: 5 });
    return false;
  }
}
function nuc_cargar(clave, defecto) {
  try {
    const v = localStorage.getItem(NUC_PREFIJO + clave);
    return v === null ? defecto : JSON.parse(v);
  } catch (e) { return defecto; }
}
function nuc_borrar(clave) { try { localStorage.removeItem(NUC_PREFIJO + clave); } catch (e) {} }
function nuc_usoAlmacenMB() {
  try {
    let n = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.indexOf(NUC_PREFIJO) === 0) n += (localStorage.getItem(k) || '').length;
    }
    return Math.round((n * 2 / 1048576) * 100) / 100; // UTF-16 ≈ 2 bytes/carácter
  } catch (e) { return 0; }
}

/* --- Geometría y varios -----------------------------------------------------*/
function nuc_clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function nuc_dist(x1, y1, x2, y2) { const dx = x2 - x1, dy = y2 - y1; return Math.sqrt(dx * dx + dy * dy); }
function nuc_iou(a, b) {
  const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.an, b.x + b.an), y2 = Math.min(a.y + a.al, b.y + b.al);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const uni = a.an * a.al + b.an * b.al - inter;
  return uni <= 0 ? 0 : inter / uni;
}
let nuc_uidContador = nuc_cargar('uid', 1);
function nuc_uid(pref) {
  nuc_uidContador++; nuc_guardar('uid', nuc_uidContador);
  return (pref || 'id') + nuc_uidContador;
}
function nuc_pad2(n) { return (n < 10 ? '0' : '') + n; }
function nuc_fechaHora(ts) {
  const d = new Date(ts || Date.now());
  return nuc_pad2(d.getDate()) + '/' + nuc_pad2(d.getMonth() + 1) + '/' + d.getFullYear() +
    ' ' + nuc_pad2(d.getHours()) + ':' + nuc_pad2(d.getMinutes()) + ':' + nuc_pad2(d.getSeconds());
}
function nuc_horaCorta(ts) {
  const d = new Date(ts || Date.now());
  return nuc_pad2(d.getHours()) + ':' + nuc_pad2(d.getMinutes());
}
function nuc_diaClave(ts) {
  const d = new Date(ts || Date.now());
  return d.getFullYear() + '-' + nuc_pad2(d.getMonth() + 1) + '-' + nuc_pad2(d.getDate());
}
/* ¿ts cae dentro de la franja ini–fin (formato 'HH:MM')? Soporta cruzar medianoche. */
function nuc_esEnFranja(ts, ini, fin) {
  try {
    const d = new Date(ts || Date.now());
    const m = d.getHours() * 60 + d.getMinutes();
    const pi = ini.split(':'), pf = fin.split(':');
    const mi = (+pi[0]) * 60 + (+pi[1]), mf = (+pf[0]) * 60 + (+pf[1]);
    return mi <= mf ? (m >= mi && m < mf) : (m >= mi || m < mf);
  } catch (e) { return false; }
}
function nuc_esMovil() { return /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent); }

/* --- Hash (PIN) -------------------------------------------------------------*/
async function nuc_hashTexto(txt) {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('vigia|' + txt));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch (e) {
    // file:// sin crypto.subtle: hash débil de respaldo (solo disuasorio, se avisa)
    let h = 5381;
    for (let i = 0; i < txt.length; i++) h = ((h << 5) + h + txt.charCodeAt(i)) >>> 0;
    return 'dbj2_' + h.toString(16);
  }
}

/* --- Descargas --------------------------------------------------------------*/
function nuc_descargar(nombre, contenido, mime) {
  try {
    const blob = contenido instanceof Blob ? contenido : new Blob([contenido], { type: mime || 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 20000);
    return true;
  } catch (e) { console.warn('[descarga] falló:', e && e.message); return false; }
}

/* --- Modelos de IA ----------------------------------------------------------*/
async function nuc_cargarModelos() {
  try {
    if (typeof cocoSsd === 'undefined' || typeof tf === 'undefined') {
      throw new Error('Las librerías de IA no han cargado (¿sin internet en la primera visita?)');
    }
    try { await tf.setBackend('webgl'); } catch (e) { /* cae a cpu/wasm solo */ }
    await tf.ready();
    // Modo preciso: modelo mayor (mobilenet_v2) — ve más objetos y más pequeños,
    // a cambio de algo menos de FPS. Modo ligero (lite): rápido, para equipos flojos.
    const base = estado.cfg.modeloPreciso ? 'mobilenet_v2' : 'lite_mobilenet_v2';
    estado.modelos.cocoListo = false;
    estado.modelos.coco = await cocoSsd.load({ base: base });
    estado.modelos.cocoListo = true;
    estado.modelos.base = base;
    bus.emit('modelos:listos', { base: base });
    return true;
  } catch (e) {
    estado.modelos.error = (e && e.message) || 'error desconocido';
    console.warn('[modelos] no se pudo cargar COCO-SSD:', estado.modelos.error);
    bus.emit('modelos:error', { msg: 'No se pudo cargar el modelo de detección. Comprueba la conexión a internet (solo hace falta la primera vez) y recarga.' });
    return false;
  }
}
/* ¿Hay algún motor de detección listo? (básico, potente o supercerebro) */
function nuc_modeloListo() {
  return estado.modelos.cocoListo
    || (typeof yolo_activo === 'function' && yolo_activo())
    || (typeof sc_activo === 'function' && sc_activo());
}

/* Detecta sobre un <video>/<img>/<canvas> listo. Devuelve [] si algo falla.
 * Enruta según el motor elegido: SUPERCEREBRO (ONNX-YOLO11) → POTENTE
 * (Transformers.js) → básico (COCO-SSD, siempre de respaldo). */
async function nuc_detectar(fuente) {
  if (!fuente) return [];
  if (typeof sc_activo === 'function' && sc_activo()) {
    return sc_detectar(fuente);
  }
  if (typeof yolo_activo === 'function' && yolo_activo()) {
    return yolo_detectar(fuente);
  }
  if (!estado.modelos.cocoListo) return [];
  try {
    const res = await estado.modelos.coco.detect(fuente, 40, estado.cfg.scoreMin);
    return res.map((d) => ({
      clase: d.class, score: d.score,
      caja: { x: d.bbox[0], y: d.bbox[1], an: d.bbox[2], al: d.bbox[3] },
    }));
  } catch (e) {
    console.warn('[detección] fallo:', e && e.message);
    return [];
  }
}

/* --- Arranque del núcleo -----------------------------------------------------*/
function nuc_init() {
  const guardada = nuc_cargar('cfg', null);
  if (guardada && typeof guardada === 'object') {
    estado.cfg = Object.assign({}, CFG_DEFECTOS, guardada);
  }
  estado.zonas = nuc_cargar('zonas', []);
  estado.lineas = nuc_cargar('lineas', []);
}

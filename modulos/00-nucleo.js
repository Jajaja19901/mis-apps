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
  VERSION: '3.66',   // súbela con cada entrega: se ve en Ajustes → Sistema
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
  copPeaton: true,          // aviso de PEATÓN delante (FRENA)
  copStopAviso: true,       // aviso de señal de STOP delante
  copDistSeg: false,        // aviso de distancia de seguridad (muy pegado sostenido, >30 km/h)
  copAutoTrayecto: true,    // iniciar trayecto solo al pasar de 15 km/h
  copFatiga: true,          // aviso de descanso cada 2 h de trayecto
  copVelOtros: false,       // estimar y mostrar la velocidad del coche de delante (orientativa)
  copSonido: true,          // pitido + vibración con los avisos FRENA/PEATÓN
  matAuto: true,            // leer la matrícula sola tras un golpe (caja negra)
  matContinuo: true,        // leer matrículas SOLA en continuo (del vehículo de delante) mientras el copiloto está activo
  matRetencionMin: 15,      // borrar las matrículas guardadas pasados X minutos (RGPD)
  ahorroEnergia: true,      // sin movimiento 3s → baja a 2 fps (vuelve solo al instante)
  monitorRend: true,        // monitor de rendimiento en vivo sobre el vídeo (visible por defecto: FPS, ms IA y motor)
  modoNoche: 'auto',        // 🌙 realce de imagen oscura antes de detectar: 'off'|'auto'|'on'
  camara: 'environment',    // 'user' | 'environment' (lado, si no hay lente concreta)
  camaraId: '',             // deviceId de la lente EXACTA elegida ('' = automática por lado)
  resolucion: '1080',       // '480' | '720' | '1080' | '1440' (nitidez; por defecto 1080p)
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
  ocultacionUnGesto: false, // true = avisa al PRIMER gesto claro coger→bolsillo (más avisos, más falsos)
  ocultacionSoloEstanteria: false, // true = el "coger" solo cuenta si la mano tocó una zona SENSIBLE dibujada (estantería)
  // Acciones avanzadas (módulo 17)
  accMochila: true,         // coger → mano en mochila/bolso detectado
  accSecuenciaSalida: true, // ocultación reciente + salida/carrera → aviso reforzado
  accAgachado: false,       // persona agachada junto al estante (actívalo si aplica)
  accContrasentido: false,  // entrar por la línea de SALIDA (la 2ª línea dibujada)
  accAglomeracion: false,   // grupo con movimiento brusco (posible incidente)
  accColarse: false,        // dos entradas casi pegadas (tailgating)
  ocultacionPermanencia: 0.7, // seg que la mano debe quedarse en bolsillo/cintura (bajar pilla metidas rápidas)
  manosConfirmar: true,     // 🖐 confirmar la ocultación mirando la MANO (abierta=inocente; cerrada/oculta=cuenta)
  fueraHorarioOn: false,
  fueraHorarioIni: '22:00',
  fueraHorarioFin: '07:00',
  ruidoOn: false,
  ruidoNivel: 80,
  sabotajeSens: 60,
  sabotajeModo: 'oscuro',   // 'oscuro' (solo cámara tapada — por defecto: el aviso de encuadre era un falso constante con cámaras móviles) | 'completo' | 'off'
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
  // 🏠 Modo Casa (módulo 19) — capa sobre el modo super
  casaActivo: false,            // panel/lógica de casa activos
  casaEstado: 'desarmado',      // 'desarmado' | 'encasa' | 'total' | 'noche'
  casaRetardoSalida: 60,        // seg de cuenta atrás al armar (para salir)
  casaRetardoEntrada: 30,       // seg para desarmar al entrar antes de que salte
  casaAutoArmar: false,         // armado automático por horario
  casaAutoArmarHora: '23:00',   // hora de armado automático
  casaAutoDesarmarHora: '07:00',// hora de desarmado automático
  casaAutoArmarEstado: 'total', // estado al que se arma solo
  casaNocheIni: '23:00',        // franja del MODO NOCHE (perímetro + zonas noche)
  casaNocheFin: '07:00',
  casaSirena: true,             // sirena potente en alerta crítica estando armado
  casaLinterna: true,           // linterna/estrobo disuasorio
  casaVoz: true,                // aviso por voz (speechSynthesis)
  casaVozTexto: 'Atención: propiedad videovigilada. Sus imágenes están siendo grabadas y transmitidas.',
  casaBateria: true,            // vigilar corte de corriente (Battery API)
  casaPaqueteria: true,         // avisos de paquete entregado/retirado
  casaVacaciones: false,        // sensibilidad máxima + resumen diario por Telegram
  casaResumenHora: '21:00',     // hora del resumen diario de vacaciones
  casaPiscinaSeg: 10,           // persona sola en zona piscina → alerta crítica
  casaMerodeoPuertaSeg: 30,     // en puerta sin entrar → sospecha de merodeo
  peligroAviso: true,           // ⚠️ avisar de posible objeto peligroso (cuchillo/palo). NO detecta armas de fuego
  // 👁 CENTINELA — DMS del conductor (módulo 20, carga perezosa)
  centinelaActivo: false,       // el modelo facial NO se carga hasta activarlo
  dmsFps: 3,                    // análisis por segundo (2-4; párpados no piden más)
  dmsPerclosUmbral: 25,         // % de ojos cerrados en 60 s → fatiga
  dmsMicrosuenoMs: 1500,        // ojos cerrados seguidos → crítica inmediata
  dmsBostezoMs: 2000,           // jawOpen sostenido = bostezo
  dmsDistraccionMs: 2500,       // cabeza girada fuera del frente → "ojos a la carretera"
  dmsCaraPerdidaMs: 5000,       // sin cara en marcha → aviso
  dmsGpsGate: true,             // activar solo con velocidad GPS > umbral (como los DMS reales)
  dmsVelMin: 18,                // km/h por debajo de los cuales el Centinela está en pausa
  dmsVoz: true,                 // avisos por voz (nivel 2 y 3)
  dmsGuardarCriticos: false,    // guardar captura en críticos (apagado de fábrica: sin fotos del conductor)
  dmsConduccionMaxH: 2,         // horas de conducción continua → sugerir descanso
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
/* Objetos peligrosos que el modelo general SÍ conoce (COCO). NO incluye armas
 * de fuego: el modelo general no las detecta. El aviso es orientativo. */
const NUC_PELIGRO  = ['knife', 'baseball bat'];
const NUC_CLASES_ES = {
  person: 'persona', car: 'coche', truck: 'camión', bus: 'bus', motorcycle: 'moto',
  bicycle: 'bici', backpack: 'mochila', handbag: 'bolso', suitcase: 'maleta',
  dog: 'perro', cat: 'gato', bird: 'pájaro', umbrella: 'paraguas', 'cell phone': 'móvil',
  bottle: 'botella', chair: 'silla', 'potted plant': 'planta', tv: 'pantalla',
  knife: 'cuchillo', 'baseball bat': 'palo/bate', scissors: 'tijeras',
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

/* --- Auto-actualización: fetch INMEDIATO al abrir (no espera 5 min) --------*/
function nuc_detectorVersiones() {
  try {
    const verLocal = nuc_cargar('version_cargada', '');
    const verActual = CONFIG.VERSION || '?';

    // Guarda la versión actual
    if (verLocal !== verActual) {
      console.info('[versión] local: ' + verLocal + ' → actual: ' + verActual);
      nuc_guardar('version_cargada', verActual);
    }

    // Fetch INMEDIATO al abrir (no esperar 5 minutos)
    nuc_checkVersionRemota(true);  // true = fetch AHORA
  } catch (e) { console.warn('[versión] error:', e && e.message); }
}

function nuc_checkVersionRemota(fetchAhora) {
  try {
    const ahora = Date.now();
    const ultCheck = nuc_cargar('version_check_ts', 0);

    // Fetch INMEDIATO si es la primera carga, después cada 5 minutos
    const debeChequear = fetchAhora || (ahora - ultCheck > 300000);
    if (!debeChequear) return;

    nuc_guardar('version_check_ts', ahora);
    const urlActual = window.location.href.split('#')[0].split('?')[0];

    // Headers agresivos anti-caché
    const opcionesFetch = {
      cache: 'no-store',
      method: 'GET',
      headers: {
        'pragma': 'no-cache',
        'cache-control': 'no-cache, no-store, must-revalidate',
      }
    };

    fetch(urlActual + '?_nocache=' + ahora, opcionesFetch)
      .then(resp => {
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        return resp.text();
      })
      .then(html => {
        if (!html || html.length < 100) return;  // contenido muy pequeño: timeout/error
        const m = html.match(/VERSION:\s*['"]([^'"]+)['"]/);
        const verRemota = m ? m[1] : null;
        if (verRemota && verRemota !== CONFIG.VERSION) {
          console.warn('[versión] remota: ' + verRemota + ' · local: ' + CONFIG.VERSION + ' → RECARGANDO');
          // Recarga YA (no espera 500ms)
          window.location.reload(true);
        } else if (verRemota) {
          console.info('[versión] está al día: ' + verRemota);
        }
      })
      .catch(e => {
        console.debug('[versión] check falló (sin internet/timeout):', e && e.message);
      });
  } catch (e) { /* error fatal: no rompe */ }
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

/* --- Recarga LIMPIA: borra toda la caché (app, librerías y modelos IA) y el
 * Service Worker, y recarga desde cero. NO toca los ajustes ni las zonas
 * (viven en localStorage, que no se toca). Es la salida cuando la app se queda
 * atascada en una versión vieja o un modelo cacheado da error. */
async function nuc_recargaLimpia() {
  try {
    // 1) Borra TODAS las cachés (Cache API): app, CDNs y modelos ONNX.
    if (typeof caches !== 'undefined' && caches.keys) {
      const claves = await caches.keys();
      await Promise.all(claves.map((k) => caches.delete(k)));
    }
  } catch (e) { console.warn('[recarga] cachés:', e && e.message); }
  try {
    // 2) Da de baja los Service Workers (para que no re-sirvan lo viejo).
    if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch (e) { console.warn('[recarga] sw:', e && e.message); }
  try {
    // 3) Marca de versión a cero para que el detector recargue seguro.
    nuc_borrar('version_cargada');
    nuc_borrar('version_check_ts');
  } catch (e) {}
  // 4) Recarga sin caché.
  try { location.reload(true); } catch (e) { location.reload(); }
}

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

/* Umbral de confianza EFECTIVO: en modo carretera o con el copiloto activo se
 * baja un poco (los coches lejanos puntúan más bajo que las personas y se
 * perdían). El resto del tiempo manda el ajuste del dueño tal cual. */
function nuc_scoreMin() {
  const base = estado.cfg.scoreMin || 0.35;
  const enCoche = estado.cfg.modo === 'carretera' || estado.cfg.copActivo;
  return enCoche ? Math.max(0.2, base - 0.1) : base;
}

/* --- Eficiencia: COCO analiza una COPIA REDUCIDA del frame -------------------
 * YOLO y el Supercerebro ya reducen dentro (dibujan a 640/768px y devuelven
 * las cajas en espacio del frame completo). COCO en cambio trabaja el frame a
 * tamaño nativo: a 1280px quema batería en copiar píxeles que el modelo ni
 * aprovecha. Aquí se le da una copia a 640px y las cajas se devuelven al
 * espacio real. Lo que se ve y se graba sigue a resolución completa. */
const NUC_ANALISIS_MAX = 640;   // ancho máximo del frame que ve COCO
let nuc_cnvAnalisis = null;

/* Devuelve { fuente, escala }: la fuente que debe ver la IA y el factor para
 * devolver las cajas al espacio del frame completo. Ante cualquier fallo
 * (canvas contaminado, dims raras) devuelve la fuente original tal cual. */
function nuc_frameAnalisis(fuente) {
  try {
    const w = estado.video.w || 0, h = estado.video.h || 0;
    if (!w || !h || w <= NUC_ANALISIS_MAX) return { fuente: fuente, escala: 1 };
    const factor = NUC_ANALISIS_MAX / w;
    const cw = Math.round(w * factor), ch = Math.round(h * factor);
    if (!nuc_cnvAnalisis) nuc_cnvAnalisis = document.createElement('canvas');
    const cnv = nuc_cnvAnalisis;
    if (cnv.width !== cw || cnv.height !== ch) { cnv.width = cw; cnv.height = ch; }
    cnv.getContext('2d').drawImage(fuente, 0, 0, cw, ch);
    return { fuente: cnv, escala: 1 / factor };
  } catch (e) {
    return { fuente: fuente, escala: 1 };
  }
}

/* --- 🌙 MODO NOCHE: realce de imagen oscura ANTES de detectar ----------------
 * Con poca luz los modelos detectan fatal (una persona en penumbra puntúa muy
 * bajo). Aquí, si la escena está oscura, se hace UNA copia con más brillo y
 * contraste y esa copia es la que ven TODOS los motores — así detectan mucho
 * más de noche. Lo que se ve y se graba NO se toca (la evidencia va tal cual).
 * Geometría segura: todos los motores escalan las cajas con estado.video.w/h y
 * drawImage estira, así que da igual el tamaño de esta copia. */
const NUC_NOCHE_UMBRAL = 95;    // luz media (0-255) por debajo → realza (modo auto)
let nuc_cnvLuz = null, nuc_luzVal = 140, nuc_luzTs = 0;
let nuc_cnvNoche = null;

/* Luz media de la escena (muestra minúscula 16×12, coste ~0). */
function nuc_luzMedia(fuente) {
  try {
    if (!nuc_cnvLuz) { nuc_cnvLuz = document.createElement('canvas'); nuc_cnvLuz.width = 16; nuc_cnvLuz.height = 12; }
    const ctx = nuc_cnvLuz.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(fuente, 0, 0, 16, 12);
    const px = ctx.getImageData(0, 0, 16, 12).data;
    let s = 0; for (let i = 0; i < px.length; i += 4) s += (px[i] + px[i + 1] + px[i + 2]) / 3;
    nuc_luzVal = s / (16 * 12);
    return nuc_luzVal;
  } catch (e) { return 140; }   // canvas contaminado → asumimos con luz (no realza)
}

/* Devuelve una copia realzada si toca, o null (usar la fuente original).
 * Usa corrección GAMMA (levanta las sombras) + ganancia, con tabla de consulta.
 * Es determinista y va en cualquier móvil (no depende de ctx.filter). */
function nuc_fuenteNoche(fuente) {
  const modo = estado.cfg.modoNoche || 'auto';   // 'off' | 'auto' | 'on'
  if (modo === 'off') { estado.video.realceNoche = false; return null; }
  let gamma, ganancia;
  if (modo === 'on') {
    gamma = 2.2; ganancia = 1.15;
  } else {
    // La luz media apenas cambia entre frames: la remuestreamos como mucho cada
    // 200 ms (evita un getImageData por cada frame de detección; ~5 veces/s basta).
    const ahoraLuz = Date.now();
    let luz;
    if (ahoraLuz - nuc_luzTs > 200) { luz = nuc_luzMedia(fuente); nuc_luzTs = ahoraLuz; }
    else { luz = nuc_luzVal; }
    if (luz >= NUC_NOCHE_UMBRAL) { estado.video.realceNoche = false; return null; }  // hay luz: no gastes
    const t = Math.max(0, Math.min(1, (NUC_NOCHE_UMBRAL - luz) / NUC_NOCHE_UMBRAL)); // 0..1 oscuridad
    gamma = 1.6 + t * 1.2;        // 1.60 .. 2.80 (más oscuro → sube más las sombras)
    ganancia = 1.0 + t * 0.3;     // 1.00 .. 1.30
  }
  try {
    const w = estado.video.w || 640, h = estado.video.h || 480;
    const cw = Math.min(w, 640), ch = Math.max(1, Math.round(h * cw / w));
    if (!nuc_cnvNoche) nuc_cnvNoche = document.createElement('canvas');
    const cnv = nuc_cnvNoche;
    if (cnv.width !== cw || cnv.height !== ch) { cnv.width = cw; cnv.height = ch; }
    const ctx = cnv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(fuente, 0, 0, cw, ch);
    const img = ctx.getImageData(0, 0, cw, ch);
    const px = img.data;
    // Tabla de consulta gamma+ganancia (256 valores; se calcula una vez por frame).
    const lut = new Uint8ClampedArray(256);
    const invG = 1 / gamma;
    for (let i = 0; i < 256; i++) {
      let v = 255 * Math.pow(i / 255, invG) * ganancia;
      lut[i] = v < 0 ? 0 : (v > 255 ? 255 : v);
    }
    for (let i = 0; i < px.length; i += 4) {
      px[i] = lut[px[i]]; px[i + 1] = lut[px[i + 1]]; px[i + 2] = lut[px[i + 2]];
    }
    ctx.putImageData(img, 0, 0);
    estado.video.realceNoche = true;
    return cnv;
  } catch (e) { estado.video.realceNoche = false; return null; }
}

/* Detecta sobre un <video>/<img>/<canvas> listo. Devuelve [] si algo falla.
 * Enruta según el motor elegido: SUPERCEREBRO (ONNX-YOLO11) → POTENTE
 * (Transformers.js) → básico (COCO-SSD, siempre de respaldo). */
async function nuc_detectar(fuente) {
  if (!fuente) return [];
  // 🌙 Realce nocturno (una vez, para todos los motores).
  const fx = (typeof nuc_fuenteNoche === 'function' && nuc_fuenteNoche(fuente)) || fuente;
  if (typeof sc_activo === 'function' && sc_activo()) {
    return sc_detectar(fx);            // reduce dentro (letterbox 640)
  }
  if (typeof yolo_activo === 'function' && yolo_activo()) {
    return yolo_detectar(fx);          // reduce dentro (yoloRes 512-768)
  }
  if (!estado.modelos.cocoListo) return [];
  try {
    const prep = nuc_frameAnalisis(fx);
    const res = await estado.modelos.coco.detect(prep.fuente, 100, nuc_scoreMin());
    return res.map((d) => ({
      clase: d.class, score: d.score,
      caja: {
        x: d.bbox[0] * prep.escala, y: d.bbox[1] * prep.escala,
        an: d.bbox[2] * prep.escala, al: d.bbox[3] * prep.escala,
      },
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
  // Migración única: el aviso de «encuadre cambiado» era un falso constante
  // con cámaras que se mueven → pasa a 'oscuro' (solo cámara tapada) también
  // en configuraciones ya guardadas. Cámara fija: se reactiva en Ajustes.
  if (!nuc_cargar('migr_sabotaje_v2', false)) {
    nuc_guardar('migr_sabotaje_v2', true);
    if (estado.cfg.sabotajeModo === 'completo') {
      estado.cfg.sabotajeModo = 'oscuro';
      if (guardada) nuc_guardar('cfg', estado.cfg);
    }
  }
  // Migración única: los modelos potentes pesados (detr-50 / detalle 768)
  // ahogaban el móvil entero. Vuelta al ligero; el pesado se puede re-elegir.
  if (!nuc_cargar('migr_yolo_ligero', false)) {
    nuc_guardar('migr_yolo_ligero', true);
    if (estado.cfg.yoloModelo === 'Xenova/detr-resnet-50' || estado.cfg.yoloRes === '768') {
      estado.cfg.yoloModelo = 'Xenova/yolos-tiny';
      estado.cfg.yoloRes = '512';
      if (guardada) nuc_guardar('cfg', estado.cfg);
    }
  }
  // Migración única: la lectura de matrículas pasa a ser AUTOMÁTICA (el usuario
  // no debería tener que pulsar un botón). Se activa en continuo también en las
  // configuraciones ya guardadas. Se puede apagar a mano en el panel Copiloto.
  if (!nuc_cargar('migr_mat_continuo', false)) {
    nuc_guardar('migr_mat_continuo', true);
    if (estado.cfg.matContinuo !== true) {
      estado.cfg.matContinuo = true;
      if (guardada) nuc_guardar('cfg', estado.cfg);
    }
  }
  estado.zonas = nuc_cargar('zonas', []);
  estado.lineas = nuc_cargar('lineas', []);
  // Detecta si hay nueva versión y se actualiza sola
  nuc_detectorVersiones();
}

/* ============================================================================
 * 07-STATS — VIGÍA IA · estadísticas del día, mapa de calor y time-lapse.
 * Prefijo stats_/STATS_. Estado interno en estado.stats. Ver CONTRATOS.md §9.07.
 * ==========================================================================*/

/* --- Constantes del módulo -------------------------------------------------*/
const STATS_CALOR_COLS = 48;
const STATS_CALOR_ROWS = 27;
const STATS_TIMELAPSE_MAX = 400;
const STATS_GUARDADO_THROTTLE_MS = 10000;
const STATS_RENDER_THROTTLE_MS = 2000;
const STATS_CALOR_GUARDADO_MS = 60000;

/* --- Referencias DOM y temporizadores internos (no persistidos) ------------*/
let stats_refs = {};
let stats_resizeTimer = null;

/* ============================================================================
 * Utilidades de datos
 * ==========================================================================*/
function stats_ceros24() { return new Array(24).fill(0); }

function stats_plantillaDia() {
  return {
    porHora: stats_ceros24(),
    entradas: 0,
    salidas: 0,
    alertas: { info: 0, sospecha: 0, critico: 0, total: 0 },
    vehiculos: { car: 0, truck: 0, bus: 0, motorcycle: 0, bicycle: 0 },
    vehiculosHora: stats_ceros24(),
    peatonesHora: stats_ceros24(),
    direccional: { AB: 0, BA: 0 },
    picoAforo: 0,
  };
}

/* Repara/normaliza un día cargado de localStorage por si viene de una versión
 * anterior o incompleta (nunca debe lanzar excepción ni dejar campos undefined). */
function stats_saneaDia(d) {
  const base = stats_plantillaDia();
  if (!d || typeof d !== 'object') return base;
  const horas = (arr) => (Array.isArray(arr) && arr.length === 24)
    ? arr.map((n) => (typeof n === 'number' && isFinite(n)) ? n : 0)
    : base.porHora.slice();
  return {
    porHora: horas(d.porHora),
    entradas: typeof d.entradas === 'number' ? d.entradas : 0,
    salidas: typeof d.salidas === 'number' ? d.salidas : 0,
    alertas: Object.assign({ info: 0, sospecha: 0, critico: 0, total: 0 },
      (d.alertas && typeof d.alertas === 'object') ? d.alertas : {}),
    vehiculos: Object.assign({ car: 0, truck: 0, bus: 0, motorcycle: 0, bicycle: 0 },
      (d.vehiculos && typeof d.vehiculos === 'object') ? d.vehiculos : {}),
    vehiculosHora: horas(d.vehiculosHora),
    peatonesHora: horas(d.peatonesHora),
    direccional: Object.assign({ AB: 0, BA: 0 }, (d.direccional && typeof d.direccional === 'object') ? d.direccional : {}),
    picoAforo: typeof d.picoAforo === 'number' ? d.picoAforo : 0,
  };
}

function stats_suma(arr) {
  if (!Array.isArray(arr)) return 0;
  let s = 0;
  for (let i = 0; i < arr.length; i++) s += (typeof arr[i] === 'number' ? arr[i] : 0);
  return s;
}

function stats_claveAyer(ts) { return nuc_diaClave((ts || Date.now()) - 86400000); }

/* Guardado del día actual con throttle (máx 1 vez/10s, con disparo diferido). */
function stats_guardarThrottle() {
  if (!estado.stats) return;
  const ahora = Date.now();
  if (ahora - estado.stats.ultimoGuardado >= STATS_GUARDADO_THROTTLE_MS) {
    nuc_guardar('stats_' + estado.stats.dia, estado.stats.hoy);
    estado.stats.ultimoGuardado = ahora;
    return;
  }
  if (!estado.stats._temporizadorGuardado) {
    const espera = STATS_GUARDADO_THROTTLE_MS - (ahora - estado.stats.ultimoGuardado);
    estado.stats._temporizadorGuardado = setTimeout(() => {
      estado.stats._temporizadorGuardado = null;
      nuc_guardar('stats_' + estado.stats.dia, estado.stats.hoy);
      estado.stats.ultimoGuardado = Date.now();
    }, Math.max(200, espera));
  }
}

/* ============================================================================
 * Rollover de día (medianoche)
 * ==========================================================================*/
function stats_comprobarRollover() {
  try {
    if (!estado.stats) return;
    const clave = nuc_diaClave();
    if (clave === estado.stats.dia) return;
    nuc_guardar('stats_' + estado.stats.dia, estado.stats.hoy); // guarda el día que termina
    estado.stats.ayer = estado.stats.hoy;                        // pasa a "ayer"
    estado.stats.hoy = stats_plantillaDia();                     // "hoy" limpio
    estado.stats.dia = clave;
    estado.stats.aforoCache = -1;
    estado.stats.ultimoGuardado = Date.now();
    nuc_guardar('stats_' + clave, estado.stats.hoy);
  } catch (e) {
    console.warn('[stats] fallo en el cambio de día:', e && e.message);
  }
}

/* ============================================================================
 * Suscripciones al bus
 * ==========================================================================*/
function stats_alCruzarLinea(d) {
  try {
    if (!estado.stats || !d || !d.track) return;
    const track = d.track, sentido = d.sentido, linea = d.linea;
    const h = new Date().getHours();
    const esEntrada = Array.isArray(estado.lineas) && estado.lineas.length > 0 &&
      linea && estado.lineas[0] && linea.id === estado.lineas[0].id;
    if (track.clase === 'person') {
      if (esEntrada) {
        if (sentido === 'AB') {
          estado.stats.hoy.entradas++;
          estado.stats.hoy.porHora[h] = (estado.stats.hoy.porHora[h] || 0) + 1;
        } else if (sentido === 'BA') {
          estado.stats.hoy.salidas++;
        }
      } else {
        estado.stats.hoy.peatonesHora[h] = (estado.stats.hoy.peatonesHora[h] || 0) + 1;
      }
    } else if (NUC_VEHICULOS.indexOf(track.clase) !== -1) {
      if (!(track.clase in estado.stats.hoy.vehiculos)) estado.stats.hoy.vehiculos[track.clase] = 0;
      estado.stats.hoy.vehiculos[track.clase]++;
      estado.stats.hoy.vehiculosHora[h] = (estado.stats.hoy.vehiculosHora[h] || 0) + 1;
      if (sentido === 'AB' || sentido === 'BA') {
        estado.stats.hoy.direccional[sentido] = (estado.stats.hoy.direccional[sentido] || 0) + 1;
      }
    }
    stats_guardarThrottle();
  } catch (e) {
    console.warn('[stats] fallo procesando cruce de línea:', e && e.message);
  }
}

function stats_alTrackNuevo(d) {
  try {
    if (!estado.stats || !d || !d.track) return;
    if (Array.isArray(estado.lineas) && estado.lineas.length > 0) return; // solo sin líneas
    if (d.track.clase === 'person') {
      const h = new Date().getHours();
      estado.stats.hoy.porHora[h] = (estado.stats.hoy.porHora[h] || 0) + 1;
      stats_guardarThrottle();
    }
  } catch (e) {
    console.warn('[stats] fallo procesando track nuevo:', e && e.message);
  }
}

function stats_alAlerta(d) {
  try {
    if (!estado.stats || !d || !d.registro) return;
    const nivel = d.registro.nivel;
    if (nivel && estado.stats.hoy.alertas[nivel] !== undefined) estado.stats.hoy.alertas[nivel]++;
    estado.stats.hoy.alertas.total = (estado.stats.hoy.alertas.total || 0) + 1;
    stats_guardarThrottle();
  } catch (e) {
    console.warn('[stats] fallo contando alerta:', e && e.message);
  }
}

/* ============================================================================
 * Time-lapse
 * ==========================================================================*/
function stats_capturarTimelapse() {
  try {
    if (!estado.stats) return;
    if (typeof vid_fuente !== 'function' || !vid_fuente()) return; // sin fuente, no captura
    if (typeof vid_capturaJPEG !== 'function') return;
    if (estado.stats.timelapse.length >= STATS_TIMELAPSE_MAX) {
      if (!estado.stats.timelapseAvisoLleno) {
        estado.stats.timelapseAvisoLleno = true;
        bus.emit('error:general', { msg: 'Time-lapse lleno (400 capturas). Expórtalo o bórralo para seguir capturando.' });
      }
      return;
    }
    const foto = vid_capturaJPEG(480);
    if (!foto) return;
    estado.stats.timelapse.push({ ts: Date.now(), foto: foto });
    stats_actualizarInfoTimelapse();
  } catch (e) {
    console.warn('[stats] fallo capturando time-lapse:', e && e.message);
  }
}

function stats_programarTimelapse() {
  if (!estado.stats) return;
  if (estado.stats.timelapseTimer) clearTimeout(estado.stats.timelapseTimer);
  const min = (estado.cfg && estado.cfg.timelapseMin > 0) ? estado.cfg.timelapseMin : 5;
  estado.stats.timelapseTimer = setTimeout(() => {
    stats_capturarTimelapse();
    stats_programarTimelapse(); // re-lee cfg.timelapseMin por si cambió
  }, min * 60000);
}

function stats_actualizarInfoTimelapse() {
  if (!stats_refs.tlInfo || !estado.stats) return;
  const n = estado.stats.timelapse.length;
  const min = (estado.cfg && estado.cfg.timelapseMin) || 5;
  stats_refs.tlInfo.textContent = n + (n === 1 ? ' captura' : ' capturas') + ' · cada ' + min + ' min';
}

/* Reproduce las capturas del time-lapse en un canvas offscreen a ~6fps y las
 * graba con MediaRecorder → webm → nuc_descargar. Todo con try/catch. */
function stats_timelapseExportar() {
  try {
    if (!estado.stats || !Array.isArray(estado.stats.timelapse) || estado.stats.timelapse.length < 2) {
      bus.emit('error:general', { msg: 'Aún no hay suficientes capturas de time-lapse' });
      return;
    }
    if (typeof MediaRecorder === 'undefined') {
      bus.emit('error:general', { msg: 'Este navegador no permite grabar vídeo.' });
      return;
    }
    const capturas = estado.stats.timelapse.slice();
    const off = document.createElement('canvas');
    off.width = 480; off.height = 270;
    const ctx = off.getContext('2d');
    if (!ctx) { bus.emit('error:general', { msg: 'No se pudo preparar el lienzo del time-lapse.' }); return; }
    ctx.fillStyle = '#0b0f14'; ctx.fillRect(0, 0, off.width, off.height);

    let stream;
    try { stream = off.captureStream(6); } catch (e) {
      bus.emit('error:general', { msg: 'Este navegador no permite grabar el time-lapse.' });
      return;
    }
    let mimeType = 'video/webm';
    try {
      if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) mimeType = 'video/webm;codecs=vp9';
      else if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported('video/webm;codecs=vp8')) mimeType = 'video/webm;codecs=vp8';
    } catch (e) { /* usa el mime por defecto */ }

    let grabadora;
    const trozos = [];
    try {
      grabadora = new MediaRecorder(stream, { mimeType: mimeType });
    } catch (e) {
      bus.emit('error:general', { msg: 'No se pudo iniciar la grabación del time-lapse.' });
      return;
    }
    grabadora.ondataavailable = (e) => { if (e.data && e.data.size > 0) trozos.push(e.data); };
    grabadora.onstop = () => {
      try {
        const blob = new Blob(trozos, { type: 'video/webm' });
        nuc_descargar('timelapse_' + nuc_diaClave() + '.webm', blob);
      } catch (e) {
        console.warn('[stats] fallo guardando vídeo time-lapse:', e && e.message);
        bus.emit('error:general', { msg: 'No se pudo finalizar el vídeo del time-lapse.' });
      }
    };
    grabadora.onerror = (e) => {
      console.warn('[stats] fallo en grabadora time-lapse:', e && e.error && e.error.message);
    };

    grabadora.start();
    let i = 0;
    const paso = () => {
      if (i >= capturas.length) {
        setTimeout(() => { try { grabadora.stop(); } catch (e) { /* ya parada */ } }, 250);
        return;
      }
      const im = new Image();
      im.onload = () => {
        try {
          ctx.fillStyle = '#0b0f14'; ctx.fillRect(0, 0, off.width, off.height);
          ctx.drawImage(im, 0, 0, off.width, off.height);
        } catch (e) { /* frame corrupto, se ignora */ }
        i++; setTimeout(paso, 167);
      };
      im.onerror = () => { i++; setTimeout(paso, 167); };
      im.src = capturas[i].foto;
    };
    paso();
  } catch (e) {
    console.warn('[stats] fallo exportando time-lapse:', e && e.message);
    bus.emit('error:general', { msg: 'No se pudo exportar el time-lapse.' });
  }
}

/* ============================================================================
 * Mapa de calor
 * ==========================================================================*/
function stats_colorCalor(ratio) {
  const r = nuc_clamp(ratio, 0, 1);
  const paradas = [
    { p: 0, c: [63, 169, 255] },   // azul
    { p: 0.4, c: [46, 229, 132] }, // verde
    { p: 0.7, c: [255, 178, 36] }, // ámbar
    { p: 1, c: [255, 65, 85] },    // rojo
  ];
  let a = paradas[0], b = paradas[paradas.length - 1];
  for (let i = 0; i < paradas.length - 1; i++) {
    if (r >= paradas[i].p && r <= paradas[i + 1].p) { a = paradas[i]; b = paradas[i + 1]; break; }
  }
  const span = (b.p - a.p) || 1;
  const t = (r - a.p) / span;
  const mezcla = (i) => Math.round(a.c[i] + (b.c[i] - a.c[i]) * t);
  return 'rgb(' + mezcla(0) + ',' + mezcla(1) + ',' + mezcla(2) + ')';
}

/* Dibuja el overlay SIN mirar el toggle (lo usa también la exportación PNG). */
function stats_calorDibujar(ctx) {
  try {
    if (!estado.stats || !ctx || !ctx.canvas) return;
    const grid = estado.stats.calor;
    if (!Array.isArray(grid) || grid.length !== STATS_CALOR_COLS * STATS_CALOR_ROWS) return;
    let max = 0;
    for (let i = 0; i < grid.length; i++) if (grid[i] > max) max = grid[i];
    if (max <= 0) return;
    const cw = ctx.canvas.width / STATS_CALOR_COLS;
    const ch = ctx.canvas.height / STATS_CALOR_ROWS;
    const alphaPrevio = ctx.globalAlpha;
    for (let r = 0; r < STATS_CALOR_ROWS; r++) {
      for (let c = 0; c < STATS_CALOR_COLS; c++) {
        const v = grid[r * STATS_CALOR_COLS + c];
        if (!v) continue;
        const ratio = v / max;
        ctx.fillStyle = stats_colorCalor(ratio);
        ctx.globalAlpha = Math.min(0.45, 0.06 + ratio * 0.39);
        ctx.fillRect(c * cw, r * ch, cw + 1, ch + 1);
      }
    }
    ctx.globalAlpha = alphaPrevio;
  } catch (e) {
    console.warn('[stats] fallo pintando mapa de calor:', e && e.message);
  }
}

/* Pintor registrado en vid_registrarPintor('calor', ...): respeta cfg.calor. */
function stats_calorPintar(ctx) {
  if (!estado.cfg || !estado.cfg.calor) return;
  stats_calorDibujar(ctx);
}

function stats_calorReset() {
  if (!estado.stats) return;
  estado.stats.calor = new Array(STATS_CALOR_COLS * STATS_CALOR_ROWS).fill(0);
  nuc_guardar('calor', estado.stats.calor);
  estado.stats.calorCambiado = false;
  estado.stats.ultimoCalorGuardado = Date.now();
}

/* PNG: frame actual (#vid-canvas si existe) + overlay de calor + leyenda + fecha.
 * Si no hay vídeo, exporta solo el mapa sobre fondo oscuro — nunca falla. */
function stats_calorExportar() {
  try {
    const w = (estado.video && estado.video.w > 0) ? estado.video.w : 640;
    const h = (estado.video && estado.video.h > 0) ? estado.video.h : 480;
    const off = document.createElement('canvas');
    off.width = w; off.height = h;
    const ctx = off.getContext('2d');
    if (!ctx) { bus.emit('error:general', { msg: 'No se pudo generar la imagen del mapa de calor.' }); return; }

    let dibujadoFrame = false;
    const fuenteCanvas = document.getElementById('vid-canvas');
    if (fuenteCanvas && fuenteCanvas.width > 0 && fuenteCanvas.height > 0) {
      try { ctx.drawImage(fuenteCanvas, 0, 0, w, h); dibujadoFrame = true; } catch (e) { dibujadoFrame = false; }
    }
    if (!dibujadoFrame) {
      ctx.fillStyle = '#0b0f14';
      ctx.fillRect(0, 0, w, h);
    }
    stats_calorDibujar(ctx);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, h - 30, w, 30);
    ctx.fillStyle = '#cfdae4';
    ctx.font = '12px monospace';
    ctx.fillText('Mapa de calor · ' + nuc_fechaHora(), 8, h - 10);

    try {
      off.toBlob((blob) => {
        if (!blob) { bus.emit('error:general', { msg: 'No se pudo generar la imagen del mapa de calor.' }); return; }
        nuc_descargar('mapa-calor_' + nuc_diaClave() + '.png', blob);
      }, 'image/png');
    } catch (e) {
      console.warn('[stats] fallo exportando mapa de calor:', e && e.message);
      bus.emit('error:general', { msg: 'No se pudo exportar el mapa de calor.' });
    }
  } catch (e) {
    console.warn('[stats] fallo exportando mapa de calor:', e && e.message);
    bus.emit('error:general', { msg: 'No se pudo exportar el mapa de calor.' });
  }
}

/* ============================================================================
 * Acumulación por frame / aforo
 * ==========================================================================*/
function stats_acumular(tracks, ts) {
  if (!estado.stats) return;
  try {
    const w = estado.video.w, h = estado.video.h;
    if (w > 0 && h > 0 && Array.isArray(tracks)) {
      for (let i = 0; i < tracks.length; i++) {
        const t = tracks[i];
        if (!t || t.clase !== 'person') continue;
        const col = nuc_clamp(Math.floor((t.pieX / w) * STATS_CALOR_COLS), 0, STATS_CALOR_COLS - 1);
        const fila = nuc_clamp(Math.floor((t.pieY / h) * STATS_CALOR_ROWS), 0, STATS_CALOR_ROWS - 1);
        const idx = fila * STATS_CALOR_COLS + col;
        estado.stats.calor[idx] = (estado.stats.calor[idx] || 0) + 1;
        estado.stats.calorCambiado = true;
      }
    }
  } catch (e) {
    console.warn('[stats] fallo acumulando mapa de calor:', e && e.message);
  }

  stats_aforoActual();

  const ahora = ts || Date.now();
  if (ahora - estado.stats.ultimoCalorGuardado >= STATS_CALOR_GUARDADO_MS) {
    if (estado.stats.calorCambiado) {
      nuc_guardar('calor', estado.stats.calor);
      estado.stats.calorCambiado = false;
    }
    estado.stats.ultimoCalorGuardado = ahora;
  }
}

function stats_aforoActual() {
  if (!estado.stats) return 0;
  let dentro;
  if (Array.isArray(estado.lineas) && estado.lineas.length > 0) {
    dentro = Math.max(0, estado.stats.hoy.entradas - estado.stats.hoy.salidas);
  } else {
    dentro = estado.tracks.filter((t) => t.clase === 'person').length;
  }
  if (dentro > estado.stats.hoy.picoAforo) estado.stats.hoy.picoAforo = dentro;
  if (dentro !== estado.stats.aforoCache) {
    estado.stats.aforoCache = dentro;
    bus.emit('aforo:cambio', { dentro: dentro, max: estado.cfg.aforoMax });
  }
  return dentro;
}

/* ============================================================================
 * Lectura de datos para UI / exportaciones
 * ==========================================================================*/
function stats_datosHoy() {
  const h = (estado.stats && estado.stats.hoy) ? estado.stats.hoy : stats_plantillaDia();
  const a = (estado.stats && estado.stats.ayer) ? estado.stats.ayer : stats_plantillaDia();
  return {
    visitantes: stats_suma(h.porHora),
    entradas: h.entradas,
    salidas: h.salidas,
    alertas: Object.assign({ info: 0, sospecha: 0, critico: 0, total: 0 }, h.alertas),
    vehiculos: Object.assign({ car: 0, truck: 0, bus: 0, motorcycle: 0, bicycle: 0 }, h.vehiculos),
    porHora: h.porHora.slice(),
    porHoraAyer: a.porHora.slice(),
    picoAforo: h.picoAforo,
    direccional: Object.assign({ AB: 0, BA: 0 }, h.direccional),
  };
}

/* CSV con BOM UTF-8, separador ';', 24 filas (00-23).
 * - "visitantes" y "peatones": valor REAL por hora (sí se llevan por hora).
 * - "entradas_dia/salidas_dia/alertas_dia" y el desglose de vehículos por tipo
 *   (coches/camiones/buses/motos/bicis) son TOTALES DEL DÍA: solo se escriben
 *   en la fila de las 00h para no repetir el mismo número 24 veces (el resto
 *   de esas columnas queda vacío) — así se abre limpio en Excel y el total se
 *   ve de un vistazo sin sumar columnas. */
function stats_datosCSV() {
  const datos = stats_datosHoy();
  const horaHoy = (estado.stats && estado.stats.hoy) ? estado.stats.hoy : stats_plantillaDia();
  const peatonesHora = Array.isArray(horaHoy.peatonesHora) ? horaHoy.peatonesHora : stats_ceros24();
  const v = datos.vehiculos;

  const filas = [];
  filas.push(['hora', 'visitantes', 'entradas_dia', 'salidas_dia', 'alertas_dia',
    'coches', 'camiones', 'buses', 'motos', 'bicis', 'peatones'].join(';'));
  for (let hh = 0; hh < 24; hh++) {
    filas.push([
      String(hh).padStart(2, '0'),
      String(datos.porHora[hh] || 0),
      hh === 0 ? String(datos.entradas) : '',
      hh === 0 ? String(datos.salidas) : '',
      hh === 0 ? String(datos.alertas.total || 0) : '',
      hh === 0 ? String(v.car || 0) : '',
      hh === 0 ? String(v.truck || 0) : '',
      hh === 0 ? String(v.bus || 0) : '',
      hh === 0 ? String(v.motorcycle || 0) : '',
      hh === 0 ? String(v.bicycle || 0) : '',
      String(peatonesHora[hh] || 0),
    ].join(';'));
  }
  return '\uFEFF' + filas.join('\r\n') + '\r\n';
}

/* ============================================================================
 * Gráfico de afluencia
 * ==========================================================================*/
function stats_grafico() {
  try {
    if (!stats_refs.grafico) return;
    const canvas = stats_refs.grafico;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const anchoCss = canvas.clientWidth || 300;
    const altoCss = 160;
    const dpr = window.devicePixelRatio || 1;
    const anchoPx = Math.max(1, Math.round(anchoCss * dpr));
    const altoPx = Math.max(1, Math.round(altoCss * dpr));
    if (canvas.width !== anchoPx || canvas.height !== altoPx) {
      canvas.width = anchoPx; canvas.height = altoPx;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, anchoCss, altoCss);

    const esCarretera = estado.cfg && estado.cfg.modo === 'carretera';
    const h = (estado.stats && estado.stats.hoy) ? estado.stats.hoy : stats_plantillaDia();
    const a = (estado.stats && estado.stats.ayer) ? estado.stats.ayer : stats_plantillaDia();
    const hoy = esCarretera ? (h.vehiculosHora || stats_ceros24()) : h.porHora;
    const ayer = esCarretera ? (a.vehiculosHora || stats_ceros24()) : a.porHora;

    const margenInf = 16, margenSup = 14;
    const altoBarras = altoCss - margenInf - margenSup;
    let maximo = 1;
    for (let i = 0; i < 24; i++) {
      if ((hoy[i] || 0) > maximo) maximo = hoy[i];
      if ((ayer[i] || 0) > maximo) maximo = ayer[i];
    }
    const anchoCol = anchoCss / 24;

    ctx.textBaseline = 'alphabetic';
    ctx.font = "10px SFMono-Regular, ui-monospace, 'Cascadia Mono', Consolas, monospace";
    for (let hora = 0; hora < 24; hora++) {
      const x = hora * anchoCol;
      const vAyer = ayer[hora] || 0;
      const vHoy = hoy[hora] || 0;
      const altAyer = (vAyer / maximo) * altoBarras;
      const altHoy = (vHoy / maximo) * altoBarras;
      ctx.fillStyle = '#445565';
      ctx.fillRect(x + anchoCol * 0.12, altoCss - margenInf - altAyer, anchoCol * 0.34, altAyer);
      ctx.fillStyle = '#2ee584';
      ctx.fillRect(x + anchoCol * 0.52, altoCss - margenInf - altHoy, anchoCol * 0.34, altHoy);
      if (hora % 3 === 0) {
        ctx.fillStyle = '#7d8fa0';
        ctx.fillText(String(hora).padStart(2, '0'), x + 2, altoCss - 4);
      }
    }
    ctx.fillStyle = '#7d8fa0';
    ctx.fillText('máx ' + maximo, 4, 11);
  } catch (e) {
    console.warn('[stats] fallo pintando gráfico:', e && e.message);
  }
}

function stats_alRedimensionar() {
  if (stats_resizeTimer) return;
  stats_resizeTimer = setTimeout(() => {
    stats_resizeTimer = null;
    stats_grafico();
  }, 200);
}

/* ============================================================================
 * Visibilidad de la tarjeta de vehículos (solo modo carretera)
 * ==========================================================================*/
function stats_actualizarVisibilidadCarretera() {
  if (!stats_refs.vehiculosTarjeta) return;
  const esCarretera = estado.cfg && estado.cfg.modo === 'carretera';
  stats_refs.vehiculosTarjeta.classList.toggle('oculto', !esCarretera);
}

/* ============================================================================
 * Render de la sección (throttle 2s)
 * ==========================================================================*/
function stats_render() {
  if (!estado.stats) return;
  const ahora = Date.now();
  if (ahora - (estado.stats.ultimoRender || 0) < STATS_RENDER_THROTTLE_MS) return;
  estado.stats.ultimoRender = ahora;

  const datos = stats_datosHoy();
  if (stats_refs.visitantes) stats_refs.visitantes.textContent = String(datos.visitantes);
  if (stats_refs.entradas) stats_refs.entradas.textContent = String(datos.entradas);
  if (stats_refs.salidas) stats_refs.salidas.textContent = String(datos.salidas);
  if (stats_refs.alertas) stats_refs.alertas.textContent = String(datos.alertas.total || 0);
  if (stats_refs.picoAforo) stats_refs.picoAforo.textContent = String(datos.picoAforo);
  if (stats_refs.vehiculos) {
    const v = datos.vehiculos;
    stats_refs.vehiculos.textContent = '🚗' + (v.car || 0) + ' 🚚' + (v.truck || 0) +
      ' 🚌' + (v.bus || 0) + ' 🏍' + (v.motorcycle || 0) + ' 🚲' + (v.bicycle || 0);
  }
  stats_actualizarVisibilidadCarretera();
  stats_actualizarInfoTimelapse();
  stats_grafico();
}

/* ============================================================================
 * Inicialización
 * ==========================================================================*/
function stats_init() {
  const diaClave = nuc_diaClave();

  estado.stats = {
    dia: diaClave,
    hoy: stats_saneaDia(nuc_cargar('stats_' + diaClave, null)),
    ayer: stats_saneaDia(nuc_cargar('stats_' + stats_claveAyer(), null)),
    calor: nuc_cargar('calor', null),
    calorCambiado: false,
    timelapse: [],
    timelapseAvisoLleno: false,
    timelapseTimer: null,
    aforoCache: -1,
    ultimoGuardado: 0,
    _temporizadorGuardado: null,
    ultimoCalorGuardado: Date.now(),
    ultimoRender: 0,
    _temporizadorRollover: null,
  };
  if (!Array.isArray(estado.stats.calor) || estado.stats.calor.length !== STATS_CALOR_COLS * STATS_CALOR_ROWS) {
    estado.stats.calor = new Array(STATS_CALOR_COLS * STATS_CALOR_ROWS).fill(0);
  }

  stats_refs = {
    grafico: document.getElementById('stats-grafico'),
    visitantes: document.getElementById('stats-visitantes'),
    entradas: document.getElementById('stats-entradas'),
    salidas: document.getElementById('stats-salidas'),
    alertas: document.getElementById('stats-alertas'),
    picoAforo: document.getElementById('stats-picoAforo'),
    vehiculos: document.getElementById('stats-vehiculos'),
    vehiculosTarjeta: document.getElementById('stats-vehiculosTarjeta'),
    calorToggle: document.getElementById('stats-calorToggle'),
    calorReset: document.getElementById('stats-calorReset'),
    calorPng: document.getElementById('stats-calorPng'),
    tlInfo: document.getElementById('stats-tlInfo'),
    tlExportar: document.getElementById('stats-tlExportar'),
    tlBorrar: document.getElementById('stats-tlBorrar'),
    exportarInforme: document.getElementById('stats-exportarInforme'),
    exportarCSV: document.getElementById('stats-exportarCSV'),
  };

  if (stats_refs.calorToggle) {
    stats_refs.calorToggle.checked = !!estado.cfg.calor;
    stats_refs.calorToggle.addEventListener('change', () => {
      estado.cfg.calor = !!stats_refs.calorToggle.checked;
      nuc_guardar('cfg', estado.cfg);
      bus.emit('cfg:cambio', { clave: 'calor' });
    });
  }
  if (stats_refs.calorReset) stats_refs.calorReset.addEventListener('click', stats_calorReset);
  if (stats_refs.calorPng) stats_refs.calorPng.addEventListener('click', stats_calorExportar);
  if (stats_refs.tlExportar) stats_refs.tlExportar.addEventListener('click', stats_timelapseExportar);
  if (stats_refs.tlBorrar) stats_refs.tlBorrar.addEventListener('click', () => {
    if (!estado.stats) return;
    estado.stats.timelapse = [];
    estado.stats.timelapseAvisoLleno = false;
    stats_actualizarInfoTimelapse();
  });
  if (stats_refs.exportarInforme) stats_refs.exportarInforme.addEventListener('click', () => {
    if (typeof cfg_exportarInforme === 'function') cfg_exportarInforme();
    else bus.emit('error:general', { msg: 'El informe todavía no está disponible.' });
  });
  if (stats_refs.exportarCSV) stats_refs.exportarCSV.addEventListener('click', () => {
    if (typeof cfg_exportarCSV === 'function') cfg_exportarCSV();
    else bus.emit('error:general', { msg: 'La exportación CSV todavía no está disponible.' });
  });

  bus.on('linea:cruce', stats_alCruzarLinea);
  bus.on('track:nuevo', stats_alTrackNuevo);
  bus.on('alerta', stats_alAlerta);
  bus.on('alerta', stats_render);
  bus.on('frame', stats_render);
  bus.on('cfg:cambio', (d) => {
    if (d && d.clave === 'modo') stats_actualizarVisibilidadCarretera();
  });

  if (typeof vid_registrarPintor === 'function') {
    try { vid_registrarPintor('calor', stats_calorPintar, 40); } catch (e) { /* no bloquea el arranque */ }
  }

  if (!estado.stats._temporizadorRollover) {
    estado.stats._temporizadorRollover = setInterval(stats_comprobarRollover, 60000);
  }
  stats_programarTimelapse();

  window.addEventListener('resize', stats_alRedimensionar);

  stats_actualizarVisibilidadCarretera();
  stats_actualizarInfoTimelapse();
  stats_grafico();
  stats_render();
}

/* ============================================================================
 * 14-DETALLE — VIGÍA IA · overlay de recorrido, velocidad y detalle por objeto.
 * Prefijo: det_ / DET_. Estado interno en estado.det (creado en det_init).
 *
 * Tres capas independientes, activables cada una desde la barra de chips
 * (SLOT:DETALLE), que leen/escriben estado.cfg.detalleRecorrido /
 * .detalleVelocidad / .detalleModo:
 *   - RECORRIDO: estela de los últimos ~2s de estado.tracks[].historial (el
 *     propio tracker ya guarda esa ventana; este módulo NO la duplica).
 *   - VELOCIDAD: sobre cada objeto, en km/h si estado.car.pxPorMetro está
 *     calibrado (car_velocidadKmh no vale porque solo cubre vehículos; aquí
 *     se necesita también para personas, así que se recalcula igual que
 *     08-carretera pero para CUALQUIER clase), o en px/s si no hay calibrar.
 *   - DETALLE: id + clase (ES) + dirección (flecha) + tiempo parado. La
 *     dirección y el "parado Ns" SÍ necesitan memoria propia entre frames
 *     (el historial del tracker solo cubre ~2s, insuficiente para "parado
 *     30s"), por eso estado.det.rastros guarda, por track, desde cuándo
 *     lleva quieto y su última flecha de dirección.
 *
 * Se pinta como pintor registrado en vid_registrarPintor('detalle', det_pintar,
 * 60): se ejecuta en cada frame compuesto (bucle rAF), no solo en los frames
 * de inferencia. Usa Date.now() — el MISMO reloj con el que el bucle sella el
 * historial del tracker (ver det_ahora).
 * ==========================================================================*/

/* --- Parámetros del módulo --------------------------------------------------*/
const DET_MAX_RASTROS = 60;          // tope duro de tracks recordados en estado.det.rastros
const DET_RASTRO_MAX_EDAD_MS = 30000; // poda por antigüedad si no se actualiza en 30s
const DET_VENTANA_MOV_MS = 1200;      // ventana reciente para decidir dirección / "quieto"
const DET_QUIETO_REL = 0.03;          // desplazamiento < 3% del ancho de frame = "quieto"
const DET_QUIETO_MIN_SEG = 2;         // no se muestra "parado" hasta llevar al menos 2s así

/* --- Estética (tokens del sistema de diseño §8) -----------------------------*/
const DET_FUENTE = "ui-monospace,SFMono-Regular,'Cascadia Mono',Consolas,monospace";
const DET_COLOR_PERSONA = '#2ee584';
const DET_COLOR_VEHICULO = '#3fa9ff';
const DET_COLOR_OTRO = '#7d8fa0';
const DET_COLOR_VELOCIDAD = '#ffb224';
const DET_COLOR_TEXTO = '#e9f0f7';

/* Refs de DOM cacheadas (no son "estado de negocio": son punteros a los chips) */
let det_refs = {};

/* ---------------------------------------------------------------------------
 * INIT
 * -------------------------------------------------------------------------*/

/* Arranca el módulo: estado, cablea los 3 chips de la barra y los pintores.
 * Idempotente y seguro de llamar siempre (con o sin vídeo/DOM montado). */
function det_init() {
  if (estado.det && estado.det.inicializado) return;
  estado.det = {
    inicializado: true,
    rastros: {}, // trackId -> { quietoDesde: ts|null, flecha: str|null, ultimaVez: ts }
  };

  det_refs = {
    recorrido: document.getElementById('det-btnRecorrido'),
    velocidad: document.getElementById('det-btnVelocidad'),
    modo: document.getElementById('det-btnModo'),
  };

  det_cablearBoton(det_refs.recorrido, 'detalleRecorrido');
  det_cablearBoton(det_refs.velocidad, 'detalleVelocidad');
  det_cablearBoton(det_refs.modo, 'detalleModo');
  det_sincronizarBotones();

  bus.on('cfg:cambio', (datos) => {
    if (!datos || datos.clave === 'detalleRecorrido' || datos.clave === 'detalleVelocidad' || datos.clave === 'detalleModo') {
      det_sincronizarBotones();
    }
  });

  bus.on('track:perdido', (datos) => {
    if (estado.det && estado.det.rastros && datos && datos.track) delete estado.det.rastros[datos.track.id];
  });

  if (typeof vid_registrarPintor === 'function') vid_registrarPintor('detalle', det_pintar, 60);
}

/* Cablea un chip: click → invierte el booleano en cfg, guarda y avisa al bus. */
function det_cablearBoton(btn, clave) {
  if (!btn) return;
  btn.addEventListener('click', () => {
    if (!estado.cfg) return;
    estado.cfg[clave] = !estado.cfg[clave];
    nuc_guardar('cfg', estado.cfg);
    bus.emit('cfg:cambio', { clave: clave });
    det_sincronizarBotones();
  });
}

/* Refleja estado.cfg.detalle* en la clase/aria-pressed de los 3 chips. */
function det_sincronizarBotones() {
  if (!estado.cfg) return;
  det_marcarBoton(det_refs.recorrido, !!estado.cfg.detalleRecorrido);
  det_marcarBoton(det_refs.velocidad, !!estado.cfg.detalleVelocidad);
  det_marcarBoton(det_refs.modo, !!estado.cfg.detalleModo);
}
function det_marcarBoton(btn, activo) {
  if (!btn) return;
  btn.classList.toggle('det-activo', activo);
  btn.setAttribute('aria-pressed', activo ? 'true' : 'false');
}

/* ---------------------------------------------------------------------------
 * UTILIDADES INTERNAS
 * -------------------------------------------------------------------------*/

/* Reloj coherente con el ts que el tracker sella en su historial: el bucle
 * (app_ciclo) usa Date.now() y se lo pasa a trk_actualizar, así que el historial
 * está en epoch Date.now(). Hay que usar el MISMO reloj o las comparaciones de
 * tiempo ("parado Ns", ventana de dirección) darían valores absurdos. */
function det_ahora() {
  return Date.now();
}

/* Color de la estela/acento según el grupo de clase del track. */
function det_colorClase(clase) {
  if (typeof NUC_PERSONA !== 'undefined' && NUC_PERSONA.indexOf(clase) >= 0) return DET_COLOR_PERSONA;
  if (typeof NUC_VEHICULOS !== 'undefined' && NUC_VEHICULOS.indexOf(clase) >= 0) return DET_COLOR_VEHICULO;
  return DET_COLOR_OTRO;
}

/* '#rrggbb' + alpha → 'rgba(r,g,b,a)'. Sin dependencias externas. */
function det_hexRgba(hex, alpha) {
  const h = (hex || '#7d8fa0').replace('#', '');
  const r = parseInt(h.substring(0, 2), 16) || 0;
  const g = parseInt(h.substring(2, 4), 16) || 0;
  const b = parseInt(h.substring(4, 6), 16) || 0;
  return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
}

/* Flecha de dirección (8 rumbos) a partir de un desplazamiento en px de
 * pantalla (dy positivo = hacia abajo). null si el desplazamiento es nulo. */
function det_flecha(dx, dy) {
  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return null;
  const flechas = ['→', '↗', '↑', '↖', '←', '↙', '↓', '↘'];
  const deg = (Math.atan2(-dy, dx) * 180 / Math.PI + 360) % 360;
  const idx = Math.round(deg / 45) % 8;
  return flechas[idx];
}

/* Actualiza (o crea) el registro de estado.det.rastros para este track:
 * decide si está "quieto" (desplazamiento reciente < 3% del ancho de frame)
 * y, si no lo está, su flecha de dirección. quietoDesde se mantiene mientras
 * siga quieto (así "parado Ns" puede superar la ventana de historial ~2s del
 * tracker) y se limpia en cuanto vuelve a moverse. */
function det_actualizarRastro(track, ahora, w) {
  if (!estado.det || !estado.det.rastros || !track) return null;
  let reg = estado.det.rastros[track.id];
  if (!reg) { reg = { quietoDesde: null, flecha: null, ultimaVez: ahora }; estado.det.rastros[track.id] = reg; }
  reg.ultimaVez = ahora;

  const hist = Array.isArray(track.historial) ? track.historial : [];
  let dx = 0, dy = 0;
  if (hist.length >= 2) {
    const limite = ahora - DET_VENTANA_MOV_MS;
    let primero = hist[0];
    for (let i = 0; i < hist.length; i++) {
      if (hist[i] && hist[i].ts >= limite) { primero = hist[i]; break; }
    }
    const ultimo = hist[hist.length - 1];
    if (primero && ultimo) { dx = ultimo.pieX - primero.pieX; dy = ultimo.pieY - primero.pieY; }
  }

  const dist = Math.sqrt(dx * dx + dy * dy);
  const umbral = DET_QUIETO_REL * (w || 640);

  if (dist < umbral) {
    if (!reg.quietoDesde) reg.quietoDesde = ahora;
    reg.flecha = null;
  } else {
    reg.quietoDesde = null;
    reg.flecha = det_flecha(dx, dy);
  }
  return reg;
}

/* Poda estado.det.rastros: primero por antigüedad (sin actualizarse hace
 * demasiado, p.ej. si se perdió el track:perdido por algún motivo), luego
 * por tope duro de tracks recordados (los más viejos primero). */
function det_podarRastros(ahora) {
  if (!estado.det || !estado.det.rastros) return;
  const rastros = estado.det.rastros;
  const ids = Object.keys(rastros);
  for (let i = 0; i < ids.length; i++) {
    const r = rastros[ids[i]];
    if (!r || (ahora - (r.ultimaVez || 0)) > DET_RASTRO_MAX_EDAD_MS) delete rastros[ids[i]];
  }
  const restantes = Object.keys(rastros);
  if (restantes.length > DET_MAX_RASTROS) {
    restantes.sort((a, b) => (rastros[a].ultimaVez || 0) - (rastros[b].ultimaVez || 0));
    const sobran = restantes.length - DET_MAX_RASTROS;
    for (let i = 0; i < sobran; i++) delete rastros[restantes[i]];
  }
}

/* ---------------------------------------------------------------------------
 * VELOCIDAD (helper reutilizable + capa VELOCIDAD)
 * -------------------------------------------------------------------------*/

/* Texto de velocidad de un track: "~NN km/h" (+ "(X.X m/s)" si es persona a
 * paso humano <12km/h) cuando estado.car.pxPorMetro está calibrado; si no,
 * "NN px/s" — NUNCA se inventa un km/h sin calibración. '' si no hay nada
 * que mostrar (velocidad ~0 o track inválido). */
function det_velocidadTexto(track) {
  if (!track) return '';
  const pxs = (typeof trk_velocidad === 'function') ? trk_velocidad(track) : 0;
  if (typeof pxs !== 'number' || !isFinite(pxs)) return '';

  const calibrado = !!(estado.car && typeof estado.car.pxPorMetro === 'number' && estado.car.pxPorMetro > 0);
  if (calibrado) {
    const kmh = Math.round((pxs / estado.car.pxPorMetro) * 3.6);
    if (kmh <= 0) return '';
    if (track.clase === 'person' && kmh < 12) {
      const ms = Math.round((pxs / estado.car.pxPorMetro) * 10) / 10;
      return '~' + kmh + ' km/h (' + ms + ' m/s)';
    }
    return '~' + kmh + ' km/h';
  }

  const redondeada = Math.round(pxs);
  if (redondeada <= 0) return '';
  return redondeada + ' px/s';
}

/* Pinta la banda de velocidad (esquina superior derecha de cada caja). */
function det_pintarVelocidades(ctx, tracks) {
  if (!ctx || !Array.isArray(tracks) || !tracks.length) return;
  const cw = ctx.canvas.width || (estado.video && estado.video.w) || 640;
  const ch = ctx.canvas.height || (estado.video && estado.video.h) || 480;
  const fuentePx = nuc_clamp(Math.round(ch / 46), 10, 15);
  const padX = 4, padY = 2;
  const alto = fuentePx + padY * 2;

  ctx.save();
  ctx.font = fuentePx + 'px ' + DET_FUENTE;
  ctx.textBaseline = 'top';

  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i];
    if (!t || !t.caja) continue;
    const texto = det_velocidadTexto(t);
    if (!texto) continue;

    const c = t.caja;
    const anTxt = ctx.measureText(texto).width;
    const ancho = anTxt + padX * 2;
    let ex = c.x + c.an - ancho;
    let ey = c.y - alto - 2;
    if (ey < 0) ey = c.y + 2;
    if (ex < 0) ex = 0;
    if (ex + ancho > cw) ex = cw - ancho;

    ctx.fillStyle = 'rgba(11,15,20,0.72)';
    ctx.fillRect(ex, ey, ancho, alto);
    ctx.fillStyle = DET_COLOR_VELOCIDAD;
    ctx.fillText(texto, ex + padX, ey + padY);
  }
  ctx.restore();
}

/* ---------------------------------------------------------------------------
 * RECORRIDO (estela)
 * -------------------------------------------------------------------------*/

/* Dibuja la estela de cada track (línea que une su historial de puntos de
 * pie, del más viejo al actual) con opacidad creciente hacia el presente, y
 * un punto en la posición actual. Usa DIRECTAMENTE track.historial: el
 * tracker ya mantiene esa ventana de ~2s, no hace falta duplicarla aquí. */
function det_pintarEstelas(ctx, tracks) {
  if (!ctx || !Array.isArray(tracks) || !tracks.length) return;
  const cw = ctx.canvas.width || (estado.video && estado.video.w) || 640;
  const grosor = nuc_clamp((cw / 640) * 1.6, 1.5, 2);

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i];
    if (!t || !Array.isArray(t.historial) || t.historial.length < 2) continue;
    const color = det_colorClase(t.clase);
    const h = t.historial;
    const n = h.length;

    for (let j = 1; j < n; j++) {
      const p0 = h[j - 1], p1 = h[j];
      if (!p0 || !p1) continue;
      const alpha = 0.08 + 0.55 * (j / (n - 1)); // más transparente lo antiguo, opaco lo reciente
      ctx.strokeStyle = det_hexRgba(color, alpha);
      ctx.lineWidth = grosor;
      ctx.beginPath();
      ctx.moveTo(p0.pieX, p0.pieY);
      ctx.lineTo(p1.pieX, p1.pieY);
      ctx.stroke();
    }

    const ultimo = h[n - 1];
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(ultimo.pieX, ultimo.pieY, Math.max(2, grosor + 1), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/* ---------------------------------------------------------------------------
 * MODO DETALLE (id + clase + dirección + tiempo parado)
 * -------------------------------------------------------------------------*/

/* Pinta, bajo cada caja, "#id clase [· flecha | · parado Ns]". La flecha sale
 * de estado.det.rastros[id].flecha; "parado Ns" de quietoDesde, y solo se
 * muestra a partir de DET_QUIETO_MIN_SEG (evita ruido de un instante quieto). */
function det_pintarDetalle(ctx, tracks, ahora) {
  if (!ctx || !Array.isArray(tracks) || !tracks.length || !estado.det || !estado.det.rastros) return;
  const cw = ctx.canvas.width || (estado.video && estado.video.w) || 640;
  const ch = ctx.canvas.height || (estado.video && estado.video.h) || 480;
  const fuentePx = nuc_clamp(Math.round(ch / 52), 9, 13);
  const padX = 4, padY = 2;
  const alto = fuentePx + padY * 2;

  ctx.save();
  ctx.font = fuentePx + 'px ' + DET_FUENTE;
  ctx.textBaseline = 'top';

  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i];
    if (!t || !t.caja) continue;
    const reg = estado.det.rastros[t.id];

    let extra = '';
    if (reg && reg.quietoDesde) {
      const seg = Math.round((ahora - reg.quietoDesde) / 1000);
      if (seg >= DET_QUIETO_MIN_SEG) extra = 'parado ' + seg + 's';
    } else if (reg && reg.flecha) {
      extra = reg.flecha;
    }

    let texto = '#' + t.id + ' ' + nuc_claseES(t.clase);
    if (extra) texto += ' · ' + extra;

    const c = t.caja;
    const anTxt = ctx.measureText(texto).width;
    const ancho = anTxt + padX * 2;
    let ex = c.x;
    let ey = c.y + c.al + 2;
    if (ey + alto > ch) ey = c.y + c.al - alto - 2;
    if (ex < 0) ex = 0;
    if (ex + ancho > cw) ex = cw - ancho;

    ctx.fillStyle = 'rgba(11,15,20,0.72)';
    ctx.fillRect(ex, ey, ancho, alto);
    ctx.fillStyle = DET_COLOR_TEXTO;
    ctx.fillText(texto, ex + padX, ey + padY);
  }
  ctx.restore();
}

/* ---------------------------------------------------------------------------
 * PINTOR PRINCIPAL — registrado en vid_registrarPintor('detalle', ..., 60)
 * -------------------------------------------------------------------------*/

/* Se ejecuta en cada frame compuesto. Guarda-clausulas totales: sin ctx, sin
 * tracks o sin estado.video.w no pinta nada y no rompe. */
function det_pintar(ctx) {
  if (!ctx || !ctx.canvas) return;
  if (!estado.det || !estado.det.rastros) return;
  const tracks = Array.isArray(estado.tracks) ? estado.tracks : [];
  const w = (estado.video && estado.video.w) || 0;
  const ahora = det_ahora();

  if (!tracks.length || !w) { det_podarRastros(ahora); return; }

  const cfg = estado.cfg || {};
  for (let i = 0; i < tracks.length; i++) det_actualizarRastro(tracks[i], ahora, w);

  try {
    if (cfg.detalleRecorrido) det_pintarEstelas(ctx, tracks);
    if (cfg.detalleVelocidad) det_pintarVelocidades(ctx, tracks);
    if (cfg.detalleModo) det_pintarDetalle(ctx, tracks, ahora);
  } catch (e) {
    console.warn('[detalle] fallo pintando overlay:', e && e.message);
  }

  det_podarRastros(ahora);
}

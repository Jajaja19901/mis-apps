/* ============================================================================
 * 01-TRACKER — VIGÍA IA · seguimiento multi-objeto (estilo ByteTrack simplificado).
 * Prefijo: trk_ / TRK_.  Estado interno en estado.trk (creado en trk_init).
 *
 * Base de todo el sistema: asigna un trackId estable a cada detección entre
 * frames. De estos ids dependen dwell time, cruces de línea, velocidad y gestos.
 *
 * Emparejamiento (por grupo de clase — persona/vehículo/bolsa/animal):
 *   1) IoU voraz (mejor IoU primero, umbral TRK_IOU_MIN).
 *   2) Los sobrantes, por distancia de centroides (< TRK_DIST_MAX_REL * ancho).
 * Tolerancia a oclusiones: un track sin detección sobrevive hasta
 * TRK_MAX_PERDIDOS frames de inferencia, con predicción lineal del centroide
 * (para re-emparejar), sin aparecer en estado.tracks mientras esté perdido.
 *
 * No re-declara nada del núcleo (estado, bus, nuc_*, grupos NUC_*). Se concatena
 * dentro de un único <script>. Sin import/export, sin top-level await.
 * ==========================================================================*/

/* --- Parámetros del emparejamiento y del track ----------------------------*/
const TRK_IOU_MIN = 0.25;        // solape mínimo para casar detección↔track por IoU
const TRK_DIST_MAX_REL = 0.1;    // distancia máx. de centroides = TRK_DIST_MAX_REL * ancho de frame
const TRK_MAX_PERDIDOS = 15;     // frames de inferencia que un track vive "perdido" antes de morir
const TRK_MIN_HITS = 2;          // detecciones seguidas para CONFIRMAR un track (mata fantasmas de 1 frame)
const TRK_HIST_MS = 2000;        // ventana de historial (~2 s)
const TRK_HIST_MAX = 80;         // tope defensivo de muestras de historial (evita crecimiento patológico)
const TRK_VEL_MS = 700;          // ventana de la media móvil de velocidad (~0.7 s)

/* --- Estética de pintado (tokens del sistema de diseño §8) -----------------*/
const TRK_COLOR_VERDE = '#2ee584';
const TRK_COLOR_AMBAR = '#ffb224';
const TRK_COLOR_ROJO = '#ff4155';
const TRK_COLOR_TEXTO = '#e9f0f7';
const TRK_FUENTE = "ui-monospace,SFMono-Regular,'Cascadia Mono',Consolas,monospace";
const TRK_UMBRAL_PUNT_AMBAR = 40;   // puntuación de gesto a partir de la cual la caja se pinta ámbar
const TRK_VEL_MOSTRAR_REL = 0.02;   // muestra la velocidad en la etiqueta si vel > 2% del ancho/seg

/* ---------------------------------------------------------------------------
 * INIT / REINICIO
 * -------------------------------------------------------------------------*/

/* Crea el estado interno del tracker. Idempotente y seguro de llamar siempre. */
function trk_init() {
  if (!estado.trk || typeof estado.trk !== 'object') {
    estado.trk = {
      pistas: [],        // TODOS los tracks (visibles + perdidos); interno
      siguienteId: 1,    // contador entero incremental y persistente entre frames
    };
  }
  if (!Array.isArray(estado.trk.pistas)) estado.trk.pistas = [];
  if (typeof estado.trk.siguienteId !== 'number') estado.trk.siguienteId = 1;
  if (!Array.isArray(estado.tracks)) estado.tracks = [];
}

/* Vacía los tracks (p.ej. al cambiar de fuente de vídeo). No reinicia el
 * contador de ids: así ningún módulo que guarde un id viejo lo confunde con uno
 * nuevo. Avisa a los oyentes para que purguen su estado por track. */
function trk_reiniciar() {
  if (!estado.trk) { trk_init(); return; }
  const previos = Array.isArray(estado.trk.pistas) ? estado.trk.pistas : [];
  for (let i = 0; i < previos.length; i++) {
    if (previos[i] && previos[i].emitidoNuevo) bus.emit('track:perdido', { track: previos[i] });
  }
  estado.trk.pistas = [];
  estado.tracks = [];
}

/* ---------------------------------------------------------------------------
 * UTILIDADES INTERNAS
 * -------------------------------------------------------------------------*/

/* Grupo de clase COCO al que pertenece `clase`, o null si está fuera de todos
 * (esas clases se trackean por clase EXACTA). */
function trk_grupoDe(clase) {
  if (NUC_PERSONA.indexOf(clase) >= 0) return NUC_PERSONA;
  if (NUC_VEHICULOS.indexOf(clase) >= 0) return NUC_VEHICULOS;
  if (NUC_BOLSAS.indexOf(clase) >= 0) return NUC_BOLSAS;
  if (NUC_ANIMALES.indexOf(clase) >= 0) return NUC_ANIMALES;
  return null;
}

/* ¿Pueden emparejarse dos objetos de estas clases? Misma clase exacta siempre;
 * si no, deben compartir grupo. Los grupos son disjuntos → relación simétrica. */
function trk_mismoGrupo(claseA, claseB) {
  if (claseA === claseB) return true;
  const g = trk_grupoDe(claseA);
  if (!g) return false;               // fuera de grupo → solo casa por clase exacta
  return g.indexOf(claseB) >= 0;
}

/* Desplazamiento estimado por frame de inferencia (px), a partir de las dos
 * últimas muestras del historial. Es la base de la predicción lineal. */
function trk_velFrame(t) {
  const h = t.historial;
  if (!h || h.length < 2) return { vx: 0, vy: 0 };
  const a = h[h.length - 2], b = h[h.length - 1];
  return { vx: b.cx - a.cx, vy: b.cy - a.cy };
}

/* Caja "predicha" de un track para este frame: la última conocida si está
 * visible; extrapolada linealmente por su velocidad si está perdido. */
function trk_cajaPredicha(t) {
  if (t.framesPerdidos > 0) {
    const v = trk_velFrame(t);
    return {
      x: t.caja.x + v.vx * t.framesPerdidos,
      y: t.caja.y + v.vy * t.framesPerdidos,
      an: t.caja.an,
      al: t.caja.al,
    };
  }
  return t.caja;
}

/* Recorta el historial a la ventana de ~2 s (y a un tope de muestras),
 * conservando siempre al menos 2 para poder estimar velocidad/predicción. */
function trk_recortarHistorial(t, ts) {
  const h = t.historial;
  const limite = ts - TRK_HIST_MS;
  while (h.length > 2 && h[0].ts < limite) h.shift();
  while (h.length > TRK_HIST_MAX) h.shift();
}

/* Velocidad px/s suavizada como media móvil sobre la ventana ~0.7 s:
 * desplazamiento entre la muestra de hace ~0.7 s y la actual, dividido por el
 * tiempo transcurrido. Robusto y estable frente al ruido de un solo frame. */
function trk_calcularVel(t, ts) {
  const h = t.historial;
  if (!h || h.length < 2) return 0;
  const objetivo = ts - TRK_VEL_MS;
  let ref = h[0];
  for (let i = 0; i < h.length - 1; i++) {
    if (h[i].ts <= objetivo) ref = h[i];
    else break;
  }
  const dt = (ts - ref.ts) / 1000;
  if (dt <= 0) return t.vel || 0;
  const d = nuc_dist(ref.cx, ref.cy, t.cx, t.cy);
  const v = d / dt;
  return isFinite(v) ? v : 0;
}

/* Crea un track nuevo a partir de una detección envuelta. */
function trk_crear(D, ts, S) {
  const id = S.siguienteId++;
  return {
    id: id,
    clase: D.clase,
    score: D.score,
    caja: { x: D.caja.x, y: D.caja.y, an: D.caja.an, al: D.caja.al },
    cx: D.cx, cy: D.cy,
    pieX: D.pieX, pieY: D.pieY,
    historial: [{ cx: D.cx, cy: D.cy, pieX: D.pieX, pieY: D.pieY, ts: ts }],
    vel: 0,
    creadoEn: ts, ultimaVez: ts,
    framesPerdidos: 0,
    hits: 1,                 // veces vista (confirma al llegar a TRK_MIN_HITS)
    confirmado: false,       // ¿ya es fiable? (deja de ser candidato-fantasma)
    emitidoNuevo: false,     // ¿ya se avisó 'track:nuevo'? (se emite al confirmar)
  };
}

/* Aplica una detección casada a un track existente (lo "revive" si estaba perdido). */
function trk_aplicarDeteccion(t, D, ts) {
  t.clase = D.clase;                 // dentro del grupo la clase puede afinarse (coche↔camión…)
  t.score = D.score;
  t.caja = { x: D.caja.x, y: D.caja.y, an: D.caja.an, al: D.caja.al };
  t.cx = D.cx; t.cy = D.cy;
  t.pieX = D.pieX; t.pieY = D.pieY;
  t.historial.push({ cx: D.cx, cy: D.cy, pieX: D.pieX, pieY: D.pieY, ts: ts });
  trk_recortarHistorial(t, ts);
  t.vel = trk_calcularVel(t, ts);
  t.ultimaVez = ts;
  t.framesPerdidos = 0;
  t.hits = (t.hits || 1) + 1;
}

/* ---------------------------------------------------------------------------
 * ACTUALIZACIÓN POR FRAME (el corazón del tracker)
 * -------------------------------------------------------------------------*/

/* Empareja las detecciones del frame con los tracks vivos, crea/mata tracks y
 * deja en estado.tracks SOLO los visibles. Seguro sin vídeo ni modelos. */
function trk_actualizar(detecciones, ts) {
  if (!estado.trk) trk_init();
  const S = estado.trk;
  const ahora = (typeof ts === 'number' && isFinite(ts)) ? ts : Date.now();
  const w = (estado.video && estado.video.w) ? estado.video.w : 640;
  const distMax = TRK_DIST_MAX_REL * w;

  // --- Normalizar detecciones y precalcular centroides / punto de apoyo ---
  const dets = Array.isArray(detecciones) ? detecciones : [];
  const D = [];
  for (let i = 0; i < dets.length; i++) {
    const d = dets[i];
    if (!d || !d.caja) continue;
    const c = d.caja;
    if (!isFinite(c.x) || !isFinite(c.y) || !isFinite(c.an) || !isFinite(c.al) || c.an <= 0 || c.al <= 0) continue;
    D.push({
      clase: d.clase,
      score: (typeof d.score === 'number') ? d.score : 0,
      caja: c,
      cx: c.x + c.an / 2,
      cy: c.y + c.al / 2,
      pieX: c.x + c.an / 2,   // centro-abajo de la caja (punto de apoyo, para zonas)
      pieY: c.y + c.al,
    });
  }

  const T = S.pistas;
  const nT = T.length, nD = D.length;

  // Cajas y centroides predichos de cada track para este frame
  const cajaPred = new Array(nT);
  const cxPred = new Array(nT);
  for (let i = 0; i < nT; i++) {
    const cp = trk_cajaPredicha(T[i]);
    cajaPred[i] = cp;
    cxPred[i] = { cx: cp.x + cp.an / 2, cy: cp.y + cp.al / 2 };
  }

  const trkAsig = new Array(nT).fill(-1);  // track i → índice de detección asignada
  const detAsig = new Array(nD).fill(-1);  // detección j → índice de track asignado

  // --- Ronda 1: IoU voraz (mejor solape primero), restringido por grupo ---
  const paresIoU = [];
  for (let i = 0; i < nT; i++) {
    for (let j = 0; j < nD; j++) {
      if (!trk_mismoGrupo(T[i].clase, D[j].clase)) continue;
      const iou = nuc_iou(cajaPred[i], D[j].caja);
      if (iou >= TRK_IOU_MIN) paresIoU.push({ i: i, j: j, v: iou });
    }
  }
  paresIoU.sort((a, b) => b.v - a.v);
  for (let k = 0; k < paresIoU.length; k++) {
    const p = paresIoU[k];
    if (trkAsig[p.i] !== -1 || detAsig[p.j] !== -1) continue;
    trkAsig[p.i] = p.j; detAsig[p.j] = p.i;
  }

  // --- Ronda 2: distancia de centroides para los que quedaron sueltos ---
  const paresDist = [];
  for (let i = 0; i < nT; i++) {
    if (trkAsig[i] !== -1) continue;
    for (let j = 0; j < nD; j++) {
      if (detAsig[j] !== -1) continue;
      if (!trk_mismoGrupo(T[i].clase, D[j].clase)) continue;
      const dd = nuc_dist(cxPred[i].cx, cxPred[i].cy, D[j].cx, D[j].cy);
      if (dd < distMax) paresDist.push({ i: i, j: j, v: dd });
    }
  }
  paresDist.sort((a, b) => a.v - b.v);
  for (let k = 0; k < paresDist.length; k++) {
    const p = paresDist[k];
    if (trkAsig[p.i] !== -1 || detAsig[p.j] !== -1) continue;
    trkAsig[p.i] = p.j; detAsig[p.j] = p.i;
  }

  // --- Aplicar detecciones a los tracks casados ---
  for (let i = 0; i < nT; i++) {
    const j = trkAsig[i];
    if (j !== -1) trk_aplicarDeteccion(T[i], D[j], ahora);
  }

  // --- Crear tracks para las detecciones sin dueño ---
  const nuevos = [];
  for (let j = 0; j < nD; j++) {
    if (detAsig[j] === -1) nuevos.push(trk_crear(D[j], ahora, S));
  }

  // --- Envejecer los tracks sin detección; matar los que superan el límite ---
  const vivos = [];
  const perdidos = [];
  for (let i = 0; i < nT; i++) {
    const t = T[i];
    if (trkAsig[i] !== -1) { vivos.push(t); continue; }
    t.framesPerdidos++;
    if (t.framesPerdidos > TRK_MAX_PERDIDOS) perdidos.push(t);
    else vivos.push(t);
  }
  S.pistas = vivos.concat(nuevos);

  // --- Confirmación: un track se vuelve fiable al acumular TRK_MIN_HITS ---
  //     detecciones. Antes de eso es un CANDIDATO (posible fantasma de COCO):
  //     no aparece en estado.tracks ni dispara eventos. Así se puede detectar
  //     con umbral bajo (más gente real) sin sufrir cajas basura de un frame.
  const enSuper = !!(estado.cfg && estado.cfg.modo === 'super');
  const reciénConfirmados = [];
  for (let i = 0; i < S.pistas.length; i++) {
    const t = S.pistas[i];
    if (!t.confirmado && (t.hits || 1) >= TRK_MIN_HITS) {
      t.confirmado = true;
      if (!t.emitidoNuevo) { t.emitidoNuevo = true; reciénConfirmados.push(t); }
    }
  }

  // --- estado.tracks = SOLO los confirmados y visibles este frame ---
  const visibles = [];
  for (let i = 0; i < S.pistas.length; i++) {
    const t = S.pistas[i];
    if (t.confirmado && t.framesPerdidos === 0) visibles.push(t);
  }
  estado.tracks = visibles;

  // --- Eventos (el bus envuelve cada oyente en try/catch) ---
  for (let i = 0; i < perdidos.length; i++) {
    if (perdidos[i].emitidoNuevo) bus.emit('track:perdido', { track: perdidos[i] });
  }
  for (let i = 0; i < reciénConfirmados.length; i++) {
    const t = reciénConfirmados[i];
    bus.emit('track:nuevo', { track: t });
    if (enSuper && NUC_ANIMALES.indexOf(t.clase) >= 0) bus.emit('animal', { track: t });
  }
}

/* ---------------------------------------------------------------------------
 * CONSULTAS Y PINTADO
 * -------------------------------------------------------------------------*/

/* Velocidad px/s suavizada del track (media móvil ~0.7 s, ya calculada). */
function trk_velocidad(track) {
  if (!track || typeof track.vel !== 'number' || !isFinite(track.vel)) return 0;
  return track.vel < 0 ? 0 : track.vel;
}

/* Tracks visibles cuya clase pertenece al grupo dado (array de clases). */
function trk_tracksDe(grupo) {
  const res = [];
  if (!Array.isArray(grupo)) return res;
  const tracks = Array.isArray(estado.tracks) ? estado.tracks : [];
  for (let i = 0; i < tracks.length; i++) {
    if (tracks[i] && grupo.indexOf(tracks[i].clase) >= 0) res.push(tracks[i]);
  }
  return res;
}

/* Pinta las cajas de los tracks visibles con estética de sala de control:
 * trazo fino, etiqueta mono con fondo semitransparente e id + clase (ES) + vel.
 * Verde normal · ámbar si hay puntuación de gesto ≥40 · rojo si está en alerta
 * crítica. Seguro aunque no haya tracks ni contexto. */
function trk_pintar(ctx) {
  if (!ctx || !ctx.canvas) return;
  const tracks = Array.isArray(estado.tracks) ? estado.tracks : [];
  if (!tracks.length) return;

  const cw = ctx.canvas.width || (estado.video && estado.video.w) || 640;
  const ch = ctx.canvas.height || (estado.video && estado.video.h) || 480;
  const criticos = (estado.alertas && Array.isArray(estado.alertas.criticoTracks)) ? estado.alertas.criticoTracks : [];
  const punts = (estado.gesto && estado.gesto.puntuaciones && typeof estado.gesto.puntuaciones === 'object') ? estado.gesto.puntuaciones : null;
  const anchoFrame = (estado.video && estado.video.w) ? estado.video.w : cw;
  const umbralVel = TRK_VEL_MOSTRAR_REL * anchoFrame;

  const fuentePx = nuc_clamp(Math.round(ch / 44), 11, 22);
  const grosor = Math.max(1.5, Math.round(cw / 640));
  const padX = 4, padY = 3;
  const altoEtq = fuentePx + padY * 2;

  ctx.save();
  ctx.font = fuentePx + 'px ' + TRK_FUENTE;
  ctx.textBaseline = 'top';
  ctx.lineJoin = 'round';

  for (let k = 0; k < tracks.length; k++) {
    const t = tracks[k];
    if (!t || !t.caja) continue;

    // Color según estado (rojo manda sobre ámbar sobre verde)
    let color = TRK_COLOR_VERDE;
    if (punts && typeof punts[t.id] === 'number' && punts[t.id] >= TRK_UMBRAL_PUNT_AMBAR) color = TRK_COLOR_AMBAR;
    if (criticos.indexOf(t.id) >= 0) color = TRK_COLOR_ROJO;

    const c = t.caja;
    ctx.lineWidth = grosor;
    ctx.strokeStyle = color;
    ctx.strokeRect(c.x, c.y, c.an, c.al);

    // Etiqueta: "#id clase[ · NN px/s]"
    let txt = '#' + t.id + ' ' + nuc_claseES(t.clase);
    const vel = trk_velocidad(t);
    if (vel >= umbralVel) txt += ' · ' + Math.round(vel) + ' px/s';

    const anTxt = ctx.measureText(txt).width;
    const anEtq = anTxt + padX * 2 + grosor;
    let ex = c.x;
    let ey = c.y - altoEtq;
    if (ey < 0) ey = c.y;                          // si no cabe arriba, dentro de la caja
    if (ex + anEtq > cw) ex = cw - anEtq;          // no rebasar el borde derecho
    if (ex < 0) ex = 0;

    ctx.fillStyle = 'rgba(11,15,20,0.72)';         // fondo oscuro semitransparente
    ctx.fillRect(ex, ey, anEtq, altoEtq);
    ctx.fillStyle = color;                         // acento fino del color de estado
    ctx.fillRect(ex, ey, grosor, altoEtq);
    ctx.fillStyle = TRK_COLOR_TEXTO;
    ctx.fillText(txt, ex + grosor + padX, ey + padY);
  }
  ctx.restore();
}

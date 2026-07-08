/* ============================================================================
 * 02-GESTOS — VIGÍA IA · análisis de pose y comportamiento (prefijo gesto_).
 * MediaPipe Pose Landmarker (33 puntos) + lógica sobre los tracks del tracker.
 * Detecta: gesto de ocultación (con pose), caída y carrera (con o sin pose).
 * HONESTIDAD: este módulo SOLO emite eventos; los textos y acusaciones NO.
 * La app funciona sin pose: caída y carrera van por el tracker; la ocultación
 * queda desactivada honestamente si el modelo de postura no carga.
 * ==========================================================================*/

/* --- Índices de los 33 landmarks de MediaPipe Pose que usamos --------------*/
const GESTO_LM = {
  NARIZ: 0,
  HOMBRO_I: 11, HOMBRO_D: 12,
  CODO_I: 13, CODO_D: 14,
  MUNECA_I: 15, MUNECA_D: 16,
  CADERA_I: 23, CADERA_D: 24,
  RODILLA_I: 25, RODILLA_D: 26,
  TOBILLO_I: 27, TOBILLO_D: 28,
};

/* Huesos del esqueleto simple (para gesto_pintar): pares de landmarks --------*/
const GESTO_HUESOS = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], // hombros + brazos
  [11, 23], [12, 24], [23, 24],                     // torso
  [23, 25], [25, 27], [24, 26], [26, 28],           // piernas
];
const GESTO_PUNTOS_CLAVE = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];

/* Umbrales de la máquina de ocultación (relativos a la anchura de hombros) ---*/
const GESTO_EXT_ALCANCE = 1.1;   // muñeca-torso > 1.1× anchoHombros → "alcanzar estante"
const GESTO_CERCA_CUERPO = 0.5;  // muñeca-cadera/pecho < 0.5× anchoHombros → "esconder"
const GESTO_DWELL_MS = 700;      // permanencia mínima cerca del cuerpo (≥0.7 s)
const GESTO_DWELL_LARGO_MS = 1500; // permanencia larga → bonus
const GESTO_VENTANA_ALCANCE_MS = 3000; // tiempo máx. entre alcanzar y volver
const GESTO_PTS_CICLO = 30;      // puntos por ciclo alcanzar→esconder completo
const GESTO_PTS_BONUS = 10;      // puntos extra si permanece mucho escondiendo
const GESTO_DECAIMIENTO_SPS = 2; // decaimiento de la sospecha (puntos/segundo)
const GESTO_COOLDOWN_OCULT_MS = 30000; // anti-spam ocultación (30 s/track)
const GESTO_COOLDOWN_CARRERA_MS = 15000; // anti-spam carrera (15 s/track)
const GESTO_CARRERA_SOSTENIDA_MS = 600;  // carrera mantenida ≥0.6 s
const GESTO_VIS_MIN = 0.3;       // visibilidad mínima de un landmark para fiarnos
const GESTO_MS_LIMITE = 80;      // si detectForVideo tarda > esta media → 1 de cada 2 frames

/* URLs de MediaPipe (única excepción a "sin imports": import() dinámico) -----*/
const GESTO_MP_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs';
const GESTO_WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const GESTO_MODELO_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

/* --- Estado interno del módulo (vive en estado.gesto) ----------------------*/
function gesto_estado() {
  if (!estado.gesto) {
    estado.gesto = {
      puntuaciones: {},      // trackId -> 0..100 (sospecha acumulada de ocultación)
      landmarker: null,      // instancia PoseLandmarker (o null)
      poses: [],             // último frame: [{trackId, puntos:[{x,y,v}], caja}]
      maquinas: {},          // trackId -> máquina de estados de ocultación
      caida: {},             // trackId -> {vertical, horizontalDesde, disparada}
      carrera: {},           // trackId -> {rapidoDesde, ultima}
      ocultacionUltima: {},  // trackId -> ts de la última alerta de ocultación
      ultimoTs: 0,           // último ts visto (para el decaimiento)
      ultimoTsPose: 0,       // último timestamp entregado a detectForVideo (monótono)
      msMedia: 0,            // media móvil del coste de detectForVideo (ms)
      saltarContador: 0,     // para procesar 1 de cada 2 frames si va lento
      poseListo: false,
      suscrito: false,
    };
  }
  return estado.gesto;
}

/* --- 1) Arranque: carga MediaPipe. NUNCA rechaza (catch interno) -----------*/
async function gesto_init() {
  const g = gesto_estado();
  if (!g.suscrito) { bus.on('track:perdido', gesto_alPerderTrack); g.suscrito = true; }
  try {
    const mp = await import(GESTO_MP_URL);
    const fileset = await mp.FilesetResolver.forVisionTasks(GESTO_WASM_URL);
    const opciones = (delegado) => ({
      baseOptions: { modelAssetPath: GESTO_MODELO_URL, delegate: delegado },
      runningMode: 'VIDEO',
      numPoses: 3,
    });
    let lm = null;
    try {
      lm = await mp.PoseLandmarker.createFromOptions(fileset, opciones('GPU'));
    } catch (eGpu) {
      console.warn('[gesto] GPU no disponible para pose, probando CPU:', eGpu && eGpu.message);
      lm = await mp.PoseLandmarker.createFromOptions(fileset, opciones('CPU'));
    }
    g.landmarker = lm;
    g.poseListo = true;
    estado.modelos.poseListo = true;
    bus.emit('pose:listo', {});
    return true;
  } catch (e) {
    g.landmarker = null;
    g.poseListo = false;
    estado.modelos.poseListo = false;
    console.warn('[gesto] no se pudo iniciar el análisis de postura:', e && e.message);
    bus.emit('pose:error', {
      msg: 'No se pudo cargar el análisis de postura (MediaPipe). La caída y la carrera siguen ' +
           'funcionando; la detección de gestos de ocultación queda desactivada.',
    });
    return false;
  }
}

/* --- 2) Procesado por frame (SOLO en modo super, lo llama el bucle) --------*/
function gesto_procesar(fuente, ts) {
  if (estado.cfg.modo !== 'super') return;
  const g = gesto_estado();
  const t = (typeof ts === 'number' && isFinite(ts)) ? ts : Date.now();
  const tracks = estado.tracks || [];
  gesto_decaer(t);                         // el decaimiento corre siempre
  if (!tracks.length) { g.poses = []; return; }
  if (g.poseListo && g.landmarker && fuente && estado.video.w > 0 && estado.video.h > 0) {
    gesto_analizarPose(fuente, t, tracks);
  }
  gesto_detectarCaida(tracks, t);          // caída y carrera van SIEMPRE (con o sin pose)
  gesto_detectarCarrera(tracks, t);
}

/* Ejecuta la inferencia de pose, la asocia a tracks y evalúa la ocultación. */
function gesto_analizarPose(fuente, ts, tracks) {
  const g = estado.gesto;
  // Limitación de coste: si va lento (> media 80 ms), inferimos 1 de cada 2 frames.
  if (g.msMedia > GESTO_MS_LIMITE) {
    g.saltarContador = (g.saltarContador + 1) % 2;
    if (g.saltarContador === 0) return;   // este frame se salta (conserva poses previas)
  }
  // MediaPipe exige timestamps de vídeo estrictamente crecientes.
  let tsPose = Math.round(ts);
  if (tsPose <= g.ultimoTsPose) tsPose = g.ultimoTsPose + 1;
  g.ultimoTsPose = tsPose;

  const t0 = gesto_ahora();
  let resultado = null;
  try {
    resultado = g.landmarker.detectForVideo(fuente, tsPose);
  } catch (e) {
    console.warn('[gesto] detectForVideo falló:', e && e.message);
    return;
  }
  const dt = gesto_ahora() - t0;
  g.msMedia = g.msMedia ? (g.msMedia * 0.8 + dt * 0.2) : dt;

  const w = estado.video.w, h = estado.video.h;
  const listas = (resultado && resultado.landmarks) || [];
  const poses = [];
  for (let i = 0; i < listas.length; i++) {
    const lms = listas[i];
    if (!lms || !lms.length) continue;
    const puntos = new Array(lms.length);
    for (let j = 0; j < lms.length; j++) {
      const p = lms[j];
      puntos[j] = { x: p.x * w, y: p.y * h, v: (p.visibility == null ? 1 : p.visibility) };
    }
    const caja = gesto_cajaDePuntos(puntos);
    const trk = gesto_trackParaPose(caja, tracks);
    poses.push({ trackId: trk ? trk.id : null, puntos: puntos, caja: caja });
    if (trk) gesto_evaluarOcultacion(trk, puntos, ts);
  }
  g.poses = poses;
}

/* --- Gesto de ocultación: máquina de estados por track --------------------
 * Secuencia buscada (la del contrato):
 *   (a) ALCANZAR: una muñeca se aleja del torso (dist > 1.1× anchoHombros).
 *   (b) ESCONDER: esa muñeca vuelve cerca de cadera/cintura/pecho
 *       (dist < 0.5× anchoHombros) y PERMANECE ≥0.7 s.
 *   (c) REPETICIÓN: cada ciclo completo suma; permanecer mucho da un bonus.
 * Puntuación 0..100 en estado.gesto.puntuaciones[id] con decaimiento (~2/s).
 * Fases: 'reposo' → 'alcanzado' → 'ocultando' → (ciclo) → 'reposo'/'alcanzado'.
 */
function gesto_evaluarOcultacion(trk, puntos, ts) {
  const g = estado.gesto;
  const id = trk.id;
  const hi = puntos[GESTO_LM.HOMBRO_I], hd = puntos[GESTO_LM.HOMBRO_D];
  const ci = puntos[GESTO_LM.CADERA_I], cd = puntos[GESTO_LM.CADERA_D];
  const mi = puntos[GESTO_LM.MUNECA_I], md = puntos[GESTO_LM.MUNECA_D];
  // Torso poco fiable → no evaluamos (honestidad: mejor no puntuar que inventar).
  if (!gesto_visible(hi) || !gesto_visible(hd) || !gesto_visible(ci) || !gesto_visible(cd)) return;

  const anchoHombros = nuc_dist(hi.x, hi.y, hd.x, hd.y);
  if (anchoHombros < 1) return;
  const hombrosC = { x: (hi.x + hd.x) / 2, y: (hi.y + hd.y) / 2 };
  const caderasC = { x: (ci.x + cd.x) / 2, y: (ci.y + cd.y) / 2 };
  const torsoC = { x: (hombrosC.x + caderasC.x) / 2, y: (hombrosC.y + caderasC.y) / 2 };
  const pechoC = {
    x: hombrosC.x + (caderasC.x - hombrosC.x) * 0.35,
    y: hombrosC.y + (caderasC.y - hombrosC.y) * 0.35,
  };

  let extendida = false, cerca = false;
  const munecas = [mi, md];
  for (let k = 0; k < munecas.length; k++) {
    const muneca = munecas[k];
    if (!gesto_visible(muneca)) continue;
    const dT = nuc_dist(muneca.x, muneca.y, torsoC.x, torsoC.y);
    if (dT > GESTO_EXT_ALCANCE * anchoHombros) extendida = true;
    const dCadera = Math.min(
      nuc_dist(muneca.x, muneca.y, ci.x, ci.y),
      nuc_dist(muneca.x, muneca.y, cd.x, cd.y),
      nuc_dist(muneca.x, muneca.y, caderasC.x, caderasC.y)
    );
    const dPecho = nuc_dist(muneca.x, muneca.y, pechoC.x, pechoC.y);
    if (dCadera < GESTO_CERCA_CUERPO * anchoHombros || dPecho < GESTO_CERCA_CUERPO * anchoHombros) cerca = true;
  }

  let m = g.maquinas[id];
  if (!m) m = g.maquinas[id] = { fase: 'reposo', tAlcance: 0, tCerca: 0, completado: false, bonus: false };

  switch (m.fase) {
    case 'alcanzado':
      if (cerca && !extendida) {
        m.fase = 'ocultando'; m.tCerca = ts; m.completado = false; m.bonus = false;
      } else if (extendida) {
        m.tAlcance = ts;                          // sigue alcanzando: refresca la ventana
      } else if (ts - m.tAlcance > GESTO_VENTANA_ALCANCE_MS) {
        m.fase = 'reposo';                        // abandonó sin volver: no cuenta
      }
      break;
    case 'ocultando':
      if (cerca) {
        const dwell = ts - m.tCerca;
        if (dwell >= GESTO_DWELL_MS && !m.completado) {
          m.completado = true;
          gesto_sumarSospecha(id, GESTO_PTS_CICLO, ts);   // ciclo alcanzar→esconder completo
        }
        if (dwell >= GESTO_DWELL_LARGO_MS && !m.bonus) {
          m.bonus = true;
          gesto_sumarSospecha(id, GESTO_PTS_BONUS, ts);   // permanece mucho: bonus
        }
      } else if (extendida) {
        m.fase = 'alcanzado'; m.tAlcance = ts; m.completado = false; // repetición del patrón
      } else {
        m.fase = 'reposo'; m.completado = false;
      }
      break;
    default: // 'reposo'
      if (extendida) { m.fase = 'alcanzado'; m.tAlcance = ts; }
  }
}

/* Suma sospecha (clamp 0..100) y, al cruzar el umbral, emite con cooldown. */
function gesto_sumarSospecha(id, delta, ts) {
  const g = estado.gesto;
  const nueva = nuc_clamp((g.puntuaciones[id] || 0) + delta, 0, 100);
  g.puntuaciones[id] = nueva;
  if (nueva >= estado.cfg.ocultacionUmbral) {
    const ult = g.ocultacionUltima[id] || 0;
    if (ts - ult >= GESTO_COOLDOWN_OCULT_MS) {
      g.ocultacionUltima[id] = ts;
      bus.emit('gesto:ocultacion', { trackId: id, puntuacion: Math.round(nueva) });
    }
  }
}

/* Decaimiento de la sospecha (~2 puntos/s), acotado a saltos razonables. */
function gesto_decaer(ts) {
  const g = estado.gesto;
  const prev = g.ultimoTs || ts;
  let dt = ts - prev;
  g.ultimoTs = ts;
  if (dt <= 0) return;
  if (dt > 2000) dt = 2000;
  const dec = (GESTO_DECAIMIENTO_SPS / 1000) * dt;
  const p = g.puntuaciones;
  for (const id in p) {
    if (p[id] > 0) { p[id] = Math.max(0, p[id] - dec); }
  }
}

/* --- 3a) Caída: caja de persona pasa de vertical a horizontal sostenida ----*/
function gesto_detectarCaida(tracks, ts) {
  const g = estado.gesto;
  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i];
    if (NUC_PERSONA.indexOf(t.clase) < 0) continue;
    const an = t.caja.an, al = t.caja.al;
    if (an <= 0 || al <= 0) continue;
    let c = g.caida[t.id];
    if (!c) c = g.caida[t.id] = { vertical: false, horizontalDesde: null, disparada: false };
    const esVertical = (al / an) > 1.2;
    const esHorizontal = (an / al) > 1.3;
    if (esVertical) {
      c.vertical = true;           // le hemos visto de pie
      c.horizontalDesde = null;
      c.disparada = false;         // se levantó: rearmamos
    } else if (esHorizontal) {
      if (c.horizontalDesde == null) c.horizontalDesde = ts;
      const seg = (ts - c.horizontalDesde) / 1000;
      if (!c.disparada && c.vertical && seg >= estado.cfg.caidaSeg) {
        c.disparada = true;
        c.vertical = false;        // no repetir hasta que vuelva a estar vertical
        bus.emit('gesto:caida', { trackId: t.id, seg: Math.round(seg * 10) / 10 });
      }
    } else {
      c.horizontalDesde = null;    // relación intermedia: reinicia el cronómetro
    }
  }
}

/* --- 3b) Carrera: velocidad del track sostenida por encima del umbral ------*/
function gesto_detectarCarrera(tracks, ts) {
  const g = estado.gesto;
  const umbral = estado.cfg.carreraVel * estado.video.w / 10; // px/s
  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i];
    if (NUC_PERSONA.indexOf(t.clase) < 0) continue;
    let c = g.carrera[t.id];
    if (!c) c = g.carrera[t.id] = { rapidoDesde: null, ultima: 0 };
    const vel = gesto_velocidad(t);
    if (vel > umbral && umbral > 0) {
      if (c.rapidoDesde == null) c.rapidoDesde = ts;
      if ((ts - c.rapidoDesde) >= GESTO_CARRERA_SOSTENIDA_MS && (ts - c.ultima) >= GESTO_COOLDOWN_CARRERA_MS) {
        c.ultima = ts;
        bus.emit('gesto:carrera', { trackId: t.id, velPxS: Math.round(vel) });
      }
    } else {
      c.rapidoDesde = null;
    }
  }
}

/* --- 4) Pintado del esqueleto (solo si cfg.debugPose y hay poses) ----------*/
function gesto_pintar(ctx) {
  if (!ctx || !estado.cfg.debugPose) return;
  const g = estado.gesto;
  if (!g || !g.poses || !g.poses.length) return;
  ctx.save();
  ctx.strokeStyle = '#3fa9ff';
  ctx.fillStyle = '#3fa9ff';
  ctx.lineWidth = 2;
  for (let i = 0; i < g.poses.length; i++) {
    const p = g.poses[i].puntos;
    if (!p || !p.length) continue;
    for (let h = 0; h < GESTO_HUESOS.length; h++) {
      const a = p[GESTO_HUESOS[h][0]], b = p[GESTO_HUESOS[h][1]];
      if (!a || !b) continue;
      if (!gesto_visible(a) || !gesto_visible(b)) continue;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    for (let k = 0; k < GESTO_PUNTOS_CLAVE.length; k++) {
      const pt = p[GESTO_PUNTOS_CLAVE[k]];
      if (!pt || !gesto_visible(pt)) continue;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/* --- 5) Puntuación de sospecha de un track (0..100) ------------------------*/
function gesto_puntuacion(trackId) {
  const g = gesto_estado();
  const v = g.puntuaciones[trackId];
  return (typeof v === 'number' && isFinite(v)) ? Math.round(v) : 0;
}

/* --- Limpieza al perderse un track ----------------------------------------*/
function gesto_alPerderTrack(datos) {
  const g = estado.gesto;
  if (!g || !datos || !datos.track) return;
  const id = datos.track.id;
  delete g.puntuaciones[id];
  delete g.maquinas[id];
  delete g.caida[id];
  delete g.carrera[id];
  delete g.ocultacionUltima[id];
}

/* --- Utilidades internas ---------------------------------------------------*/
function gesto_ahora() {
  return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
}
function gesto_visible(p) { return !!p && (p.v == null || p.v >= GESTO_VIS_MIN); }

function gesto_velocidad(t) {
  if (typeof trk_velocidad === 'function') {
    const v = trk_velocidad(t);
    if (typeof v === 'number' && isFinite(v)) return v;
  }
  return (typeof t.vel === 'number' && isFinite(t.vel)) ? t.vel : 0;
}

/* Caja envolvente de los landmarks visibles (px). null si no hay suficientes. */
function gesto_cajaDePuntos(puntos) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < puntos.length; i++) {
    const p = puntos[i];
    if (!gesto_visible(p)) continue;
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  if (!isFinite(minX)) return null;
  return { x: minX, y: minY, an: Math.max(1, maxX - minX), al: Math.max(1, maxY - minY) };
}

/* Asocia una caja de pose al track persona con mayor solape (IoU). */
function gesto_trackParaPose(caja, tracks) {
  if (!caja) return null;
  let mejor = null, mejorIoU = 0;
  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i];
    if (NUC_PERSONA.indexOf(t.clase) < 0) continue;
    const iou = nuc_iou(caja, t.caja);
    if (iou > mejorIoU) { mejorIoU = iou; mejor = t; }
  }
  return mejorIoU >= 0.1 ? mejor : null;
}

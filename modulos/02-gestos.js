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
const GESTO_MANOS_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
/* Confirmación por MANOS (21 puntos: dedos y palma). La muñeca sola no sabe si
 * la mano va abierta y relajada (inocente) o cerrada/oculta (agarrando algo).
 * El modelo de manos se carga PEREZOSO (la 1ª vez que hace falta) y solo se
 * consulta en el instante decisivo del gesto, sobre el recorte ya hecho. */
const GESTO_MANO_RADIO = 1.2;        // radio de emparejamiento mano↔muñeca (×anchoHombros)
const GESTO_MANO_ABIERTA = 1.45;     // apertura media (punta/nudillo) ≥ esto = mano abierta
/* QUÉ objeto coge: clases del detector que caben en una mano. Si al alcanzar
 * el estante hay uno junto a la muñeca, se memoriza y el aviso lo nombra
 * («posible botella»). Honesto: el modelo solo conoce 80 clases — muchos
 * productos pequeños no los sabrá nombrar (el gesto se avisa igual). */
const GESTO_OBJETOS_MANO = ['bottle', 'cup', 'wine glass', 'cell phone', 'book', 'remote',
  'scissors', 'banana', 'apple', 'orange', 'sandwich', 'donut', 'mouse', 'toothbrush'];
const GESTO_OBJETO_RADIO = 1.0;      // objeto a <1×anchoHombros de la muñeca = «en la mano»
const GESTO_OBJETO_CADUCA_MS = 8000; // el objeto memorizado caduca a los 8 s

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
  if (!g.suscrito) {
    bus.on('track:perdido', gesto_alPerderTrack);
    // Si el dueño cambia "personas analizadas a la vez", se recrea el landmarker.
    bus.on('cfg:cambio', (d) => {
      if (d && d.clave === 'posesMax' && g.poseListo && g.numPosesActual !== gesto_posesMax()) {
        gesto_init();
      }
    });
    g.suscrito = true;
  }
  try {
    const nPoses = gesto_posesMax();
    const mp = await import(GESTO_MP_URL);
    const fileset = await mp.FilesetResolver.forVisionTasks(GESTO_WASM_URL);
    // Guardados para cargas perezosas posteriores (modelo de manos).
    g.mp = mp; g.fileset = fileset;
    // Modo IMAGE + numPoses:1: la pose se calcula sobre el RECORTE de cada
    // persona (no sobre el fotograma entero). Con personas pequeñas o
    // parciales —cámara de tienda— es la diferencia entre ver el esqueleto
    // o no ver nada. posesMax limita cuántos recortes por fotograma.
    const opciones = (delegado) => ({
      baseOptions: { modelAssetPath: GESTO_MODELO_URL, delegate: delegado },
      runningMode: 'IMAGE',
      numPoses: 1,
    });
    let lm = null;
    try {
      lm = await mp.PoseLandmarker.createFromOptions(fileset, opciones('GPU'));
    } catch (eGpu) {
      console.warn('[gesto] GPU no disponible para pose, probando CPU:', eGpu && eGpu.message);
      lm = await mp.PoseLandmarker.createFromOptions(fileset, opciones('CPU'));
    }
    // Cierra el landmarker anterior si esto era una recreación (cambio de posesMax)
    if (g.landmarker && g.landmarker !== lm) { try { g.landmarker.close(); } catch (e) {} }
    g.landmarker = lm;
    g.numPosesActual = nPoses;
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

/* Personas analizadas a la vez por el modelo de postura (configurable). */
function gesto_posesMax() {
  const v = parseInt((estado.cfg && estado.cfg.posesMax) || 3, 10);
  return nuc_clamp(isNaN(v) ? 3 : v, 1, 6);
}

/* --- 2) Procesado por frame (SOLO en modo super, lo llama el bucle) --------*/
function gesto_procesar(fuente, ts) {
  if (estado.cfg.modo !== 'super') return;
  const g = gesto_estado();
  const t = (typeof ts === 'number' && isFinite(ts)) ? ts : Date.now();
  const tracks = estado.tracks || [];
  gesto_decaer(t);                         // el decaimiento corre siempre
  if (!tracks.length) { g.poses = []; return; }
  // En el coche (copiloto activo) el modelo de POSTURA no aporta (ocultación/
  // gestos son de tienda) y es de lo más caro del frame: se salta. Caída y
  // carrera (baratos, por tracks) se mantienen — sirven también aparcado.
  if (g.poseListo && g.landmarker && fuente && !estado.cfg.copActivo &&
      estado.video.w > 0 && estado.video.h > 0) {
    gesto_analizarPose(fuente, t, tracks);
  }
  gesto_detectarCaida(tracks, t);          // caída y carrera van SIEMPRE (con o sin pose)
  gesto_detectarCarrera(tracks, t);
}

/* Ejecuta la pose SOBRE EL RECORTE de cada persona (hasta posesMax, las más
 * grandes primero) y evalúa la ocultación. Sin asociación pose↔track: cada
 * recorte YA es de un track concreto. Deja diagnóstico en g.sinPose. */
function gesto_analizarPose(fuente, ts, tracks) {
  const g = estado.gesto;
  // Limitación de coste: si va lento (> media 80 ms) se analiza 1 de cada 2
  // frames (como la versión que iba fina). NO se salta más que eso: seguir los
  // brazos de cerca es lo que pilla la mano al bolsillo; skip agresivo los perdía.
  if (g.msMedia > GESTO_MS_LIMITE) {
    g.saltarContador = (g.saltarContador + 1) % 2;
    if (g.saltarContador === 0) return;   // este frame se salta (conserva poses previas)
  }

  const w = estado.video.w, h = estado.video.h;
  const personas = tracks
    .filter((t) => t && t.clase === 'person' && t.caja && t.caja.an > 8 && t.caja.al > 12)
    .sort((a, b) => (b.caja.an * b.caja.al) - (a.caja.an * a.caja.al))
    .slice(0, gesto_posesMax());
  if (!personas.length) { g.poses = []; return; }

  let cnv = g.cnvRecorte;
  if (!cnv) { cnv = g.cnvRecorte = document.createElement('canvas'); }
  if (!g.sinPose) g.sinPose = {};

  const t0 = gesto_ahora();
  const poses = [];
  for (let i = 0; i < personas.length; i++) {
    const trk = personas[i];
    try {
      // Recorte con margen del 15%, acotado al fotograma, reescalado a 256 px de alto.
      const m = 0.15;
      const rx = nuc_clamp(trk.caja.x - trk.caja.an * m, 0, w);
      const ry = nuc_clamp(trk.caja.y - trk.caja.al * m, 0, h);
      const rw = nuc_clamp(trk.caja.an * (1 + 2 * m), 8, w - rx);
      const rh = nuc_clamp(trk.caja.al * (1 + 2 * m), 12, h - ry);
      const escala = 256 / rh;
      const cw = Math.max(32, Math.round(rw * escala)), ch = 256;
      if (cnv.width !== cw || cnv.height !== ch) { cnv.width = cw; cnv.height = ch; }
      const cctx = cnv.getContext('2d', { willReadFrequently: true });
      cctx.drawImage(fuente, rx, ry, rw, rh, 0, 0, cw, ch);

      const resultado = g.landmarker.detect(cnv);
      const lms = resultado && resultado.landmarks && resultado.landmarks[0];
      if (!lms || !lms.length) { g.sinPose[trk.id] = ts; continue; }
      delete g.sinPose[trk.id];
      // Recorte vigente de ESTA persona: lo usa la confirmación por manos.
      g.recorteActual = { cnv: cnv, rx: rx, ry: ry, rw: rw, rh: rh };

      // Del recorte (normalizado 0..1) al espacio de frame (px).
      const puntos = new Array(lms.length);
      for (let j = 0; j < lms.length; j++) {
        const p = lms[j];
        puntos[j] = { x: rx + p.x * rw, y: ry + p.y * rh, v: (p.visibility == null ? 1 : p.visibility) };
      }
      poses.push({ trackId: trk.id, puntos: puntos, caja: gesto_cajaDePuntos(puntos) });
      gesto_evaluarOcultacion(trk, puntos, ts);
    } catch (e) {
      console.warn('[gesto] pose sobre recorte falló:', e && e.message);
    }
  }
  const dt = gesto_ahora() - t0;
  g.msMedia = g.msMedia ? (g.msMedia * 0.8 + dt * 0.2) : dt;
  g.poses = poses;
}

/* --- Confirmación por MANOS (carga perezosa) -------------------------------*/
async function gesto_manosInit() {
  const g = estado.gesto;
  if (g.manos || g.manosCargando || !g.mp || !g.fileset) return;
  g.manosCargando = true;
  try {
    const opciones = function (delegado) {
      return {
        baseOptions: { modelAssetPath: GESTO_MANOS_URL, delegate: delegado },
        runningMode: 'IMAGE',
        numHands: 2,
      };
    };
    let hl = null;
    try { hl = await g.mp.HandLandmarker.createFromOptions(g.fileset, opciones('GPU')); }
    catch (eGpu) { hl = await g.mp.HandLandmarker.createFromOptions(g.fileset, opciones('CPU')); }
    g.manos = hl;
  } catch (e) {
    console.warn('[gesto] modelo de manos no disponible (la ocultación sigue sin él):', e && e.message);
    g.manosFallo = true;   // no reintentar en bucle
  }
  g.manosCargando = false;
}

/* ¿La mano que está en el bolsillo CONFIRMA el gesto? Devuelve true si el
 * ciclo debe contar. Reglas:
 *  · Sin modelo de manos (aún cargando / falló / apagado) → true (como antes).
 *  · Mano NO visible junto a la muñeca → true (metida en el bolsillo/bajo la
 *    ropa: coherente con esconder algo).
 *  · Mano visible y CLARAMENTE ABIERTA (dedos extendidos) → false (mano
 *    relajada apoyada en la cintura: inocente, el ciclo no cuenta).
 *  · Mano visible cerrada/curvada (agarrando) → true. */
function gesto_manoConfirma(munecaFramePx, anchoHombros) {
  const g = estado.gesto;
  if (!estado.cfg.manosConfirmar) return true;
  if (!g.manos) {
    if (!g.manosFallo && !g.manosCargando) { try { gesto_manosInit(); } catch (e) {} }
    return true;   // sin modelo listo: comportamiento clásico
  }
  const rec = g.recorteActual;
  if (!rec || !rec.cnv || !rec.rw || !rec.rh) return true;
  try {
    const res = g.manos.detect(rec.cnv);
    const manos = (res && res.landmarks) || [];
    if (!manos.length) return true;   // ninguna mano visible → posible mano oculta
    let mejor = null, mejorD = Infinity;
    for (let i = 0; i < manos.length; i++) {
      const lm = manos[i];
      if (!lm || !lm[0]) continue;
      // Muñeca de la mano (landmark 0), del recorte normalizado → px de frame.
      const wx = rec.rx + lm[0].x * rec.rw, wy = rec.ry + lm[0].y * rec.rh;
      const d = nuc_dist(wx, wy, munecaFramePx.x, munecaFramePx.y);
      if (d < mejorD) { mejorD = d; mejor = lm; }
    }
    if (!mejor || mejorD > GESTO_MANO_RADIO * anchoHombros) return true; // mano lejana/oculta
    // Apertura: distancia punta/nudillo respecto a la muñeca, media de 4 dedos.
    // Mano abierta ≈ 1.6-1.9 · puño/agarre ≈ 0.7-1.1.
    const pares = [[8, 5], [12, 9], [16, 13], [20, 17]];
    let suma = 0, n = 0;
    for (let k = 0; k < pares.length; k++) {
      const punta = mejor[pares[k][0]], nudillo = mejor[pares[k][1]];
      if (!punta || !nudillo) continue;
      const dPunta = nuc_dist(punta.x, punta.y, mejor[0].x, mejor[0].y);
      const dNudillo = nuc_dist(nudillo.x, nudillo.y, mejor[0].x, mejor[0].y);
      if (dNudillo > 0.0001) { suma += dPunta / dNudillo; n++; }
    }
    if (!n) return true;
    const apertura = suma / n;
    return apertura < GESTO_MANO_ABIERTA;   // abierta y extendida → NO confirma
  } catch (e) { return true; }
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
  // (Sin filtro de postura: la versión que iba fina esta tarde NO descartaba a
  // nadie por estar sentado/agachado. Un ladrón sentado o agachado junto al
  // estante también esconde; que cuente. Los falsos se controlan con la
  // Sensibilidad y la confirmación por manos si el dueño la activa.)
  const hi = puntos[GESTO_LM.HOMBRO_I], hd = puntos[GESTO_LM.HOMBRO_D];
  const ci = puntos[GESTO_LM.CADERA_I], cd = puntos[GESTO_LM.CADERA_D];
  const mi = puntos[GESTO_LM.MUNECA_I], md = puntos[GESTO_LM.MUNECA_D];
  // Necesitamos SIEMPRE los hombros (son la escala y la referencia de arriba).
  if (!gesto_visible(hi) || !gesto_visible(hd)) return;

  const anchoHombros = nuc_dist(hi.x, hi.y, hd.x, hd.y);
  if (anchoHombros < 1) return;
  const hombrosC = { x: (hi.x + hd.x) / 2, y: (hi.y + hd.y) / 2 };

  // Caderas/cintura: si se ven, usamos las reales; si están TAPADAS (persona
  // tras el mostrador, encuadre de medio cuerpo) las ESTIMAMOS bajo los hombros
  // usando la anchura de hombros como escala. Así el gesto se detecta también
  // con solo el torso a la vista — que es la vista típica de una tienda.
  const caderasVisibles = gesto_visible(ci) && gesto_visible(cd);
  let caderasC;
  const refsBolsillo = [];
  // Radio de "mano en el bolsillo": estricto con caderas reales; más tolerante
  // cuando el bolsillo es ESTIMADO (la estimación tiene error inherente).
  let radioCerca = GESTO_CERCA_CUERPO * anchoHombros;
  if (caderasVisibles) {
    caderasC = { x: (ci.x + cd.x) / 2, y: (ci.y + cd.y) / 2 };
    refsBolsillo.push(ci, cd, caderasC);
  } else {
    // torso ≈ 1.5× la anchura de hombros hacia abajo (en el plano de imagen)
    caderasC = { x: hombrosC.x, y: hombrosC.y + anchoHombros * 1.5 };
    refsBolsillo.push(caderasC,
      { x: hi.x, y: hi.y + anchoHombros * 1.5 },   // bolsillo izq. estimado
      { x: hd.x, y: hd.y + anchoHombros * 1.5 });  // bolsillo der. estimado
    radioCerca = 0.75 * anchoHombros;
  }
  const torsoC = { x: (hombrosC.x + caderasC.x) / 2, y: (hombrosC.y + caderasC.y) / 2 };
  const pechoC = {
    x: hombrosC.x + (caderasC.x - hombrosC.x) * 0.35,
    y: hombrosC.y + (caderasC.y - hombrosC.y) * 0.35,
  };

  let extendida = false, cerca = false, munecaCerca = null;
  const munecas = [mi, md];
  for (let k = 0; k < munecas.length; k++) {
    const muneca = munecas[k];
    if (!gesto_visible(muneca)) continue;
    // 📦 ¿Hay un objeto conocido EN esa mano? Se memoriza para nombrarlo en el aviso.
    gesto_objetoEnMano(id, muneca, anchoHombros, ts);
    const dT = nuc_dist(muneca.x, muneca.y, torsoC.x, torsoC.y);
    if (dT > GESTO_EXT_ALCANCE * anchoHombros) extendida = true;
    let dCadera = Infinity;
    for (let r = 0; r < refsBolsillo.length; r++) {
      const d = nuc_dist(muneca.x, muneca.y, refsBolsillo[r].x, refsBolsillo[r].y);
      if (d < dCadera) dCadera = d;
    }
    const dPecho = nuc_dist(muneca.x, muneca.y, pechoC.x, pechoC.y);
    if (dCadera < radioCerca || dPecho < GESTO_CERCA_CUERPO * anchoHombros) { cerca = true; munecaCerca = muneca; }
  }
  // Si una mano está en la zona del bolsillo/pecho, NO cuenta como "alcanzando":
  // el bolsillo gana (clave cuando el torso es estimado y queda corto).
  if (cerca) extendida = false;

  // Discriminador de ESTANTERÍA: si el dueño lo activa y hay zonas sensibles
  // dibujadas, el "coger" solo cuenta cuando la muñeca extendida TOCA una de
  // ellas. Así, señalar o estirarse no arma la secuencia — solo coger del
  // estante vigilado. (Sin zonas sensibles dibujadas, no se exige.)
  if (extendida && estado.cfg.ocultacionSoloEstanteria) {
    const sensibles = (estado.zonas || []).filter((z) => z && z.tipo === 'sensible' && z.puntos && z.puntos.length >= 3);
    if (sensibles.length && typeof zona_puntoEnPoligono === 'function') {
      const w = estado.video.w || 640, hFr = estado.video.h || 480;
      let toca = false;
      for (let k = 0; k < munecas.length && !toca; k++) {
        const mu = munecas[k];
        if (!gesto_visible(mu)) continue;
        for (let zi = 0; zi < sensibles.length && !toca; zi++) {
          const pts = sensibles[zi].puntos.map((p) => ({ x: p.x * w, y: p.y * hFr }));
          if (zona_puntoEnPoligono(mu.x, mu.y, pts)) toca = true;
        }
      }
      if (!toca) extendida = false;
    }
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
        const permanenciaMs = nuc_clamp((estado.cfg.ocultacionPermanencia || 0.7) * 1000, 200, 2000);
        if (dwell >= permanenciaMs && !m.completado) {
          // 🖐 CONFIRMACIÓN POR MANOS en el instante decisivo: si la mano del
          // bolsillo se ve ABIERTA y extendida (apoyada, relajada), el ciclo NO
          // cuenta y NO se latcha —así, si luego CIERRA el puño para guardar, se
          // reevalúa (antes se daba por cerrado y se perdía esa pillada). El
          // veredicto de manos se cachea ~300 ms para no reejecutar el modelo
          // cada frame. Cerrada/agarrando u oculta bajo la ropa → sí cuenta.
          let manoOk = true;
          if (munecaCerca) {
            if (ts - (m.tMano || 0) > 300) { m.manoOk = gesto_manoConfirma(munecaCerca, anchoHombros); m.tMano = ts; }
            manoOk = m.manoOk;
          }
          if (manoOk) {
            m.completado = true;
            // Modo "primer gesto claro": UN ciclo coger→bolsillo completo basta
            // para avisar (empuja la puntuación hasta el umbral directamente).
            const puntos_ciclo = estado.cfg.ocultacionUnGesto
              ? Math.max(GESTO_PTS_CICLO, estado.cfg.ocultacionUmbral || 60)
              : GESTO_PTS_CICLO;
            gesto_sumarSospecha(id, puntos_ciclo, ts, true);   // ciclo alcanzar→esconder COMPLETO
          }
        }
        // El bonus por permanencia SOLO si el ciclo ya contó (mano confirmada):
        // una mano abierta apoyada en la cintura ya no acumula sospecha sola.
        if (m.completado && dwell >= GESTO_DWELL_LARGO_MS && !m.bonus) {
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
/* Memoriza el objeto conocido más cercano a la muñeca (si cabe en una mano). */
function gesto_objetoEnMano(id, muneca, anchoHombros, ts) {
  try {
    const g = estado.gesto;
    if (!g.objetoEnMano) g.objetoEnMano = {};
    const dets = estado.detecciones || [];
    if (!dets.length) return;
    const radio = GESTO_OBJETO_RADIO * anchoHombros;
    const areaFrame = (estado.video.w || 640) * (estado.video.h || 480);
    let mejor = null, mejorD = Infinity;
    for (let i = 0; i < dets.length; i++) {
      const d = dets[i];
      if (!d || !d.caja || GESTO_OBJETOS_MANO.indexOf(d.clase) < 0) continue;
      if (d.caja.an * d.caja.al > areaFrame * 0.06) continue;   // demasiado grande para una mano
      const cx = d.caja.x + d.caja.an / 2, cy = d.caja.y + d.caja.al / 2;
      const dist = nuc_dist(cx, cy, muneca.x, muneca.y);
      if (dist < radio && dist < mejorD) { mejorD = dist; mejor = d.clase; }
    }
    if (mejor) g.objetoEnMano[id] = { clase: mejor, ts: ts };
  } catch (e) { /* nombrar el objeto es un extra: nunca rompe el gesto */ }
}

/* cicloCompleto=true cuando la suma viene de un ciclo coger→bolsillo ENTERO.
 * REGLA CLAVE: el anti-spam de 30 s NO se traga los ciclos repetidos — repetir
 * el gesto es MÁS sospechoso, no menos. Un ciclo completo dentro del silencio
 * ESCALA (repetida:true → alerta crítica que se salta los cooldowns). Antes,
 * la 3ª metida de mano —la del robo real— moría silenciada por el anti-spam. */
function gesto_sumarSospecha(id, delta, ts, cicloCompleto) {
  const g = estado.gesto;
  const nueva = nuc_clamp((g.puntuaciones[id] || 0) + delta, 0, 100);
  g.puntuaciones[id] = nueva;
  if (nueva >= estado.cfg.ocultacionUmbral) {
    const ult = g.ocultacionUltima[id] || 0;
    const enSilencio = ts - ult < GESTO_COOLDOWN_OCULT_MS;
    // Respiro mínimo de 6 s entre avisos del mismo track (un ciclo real tarda más).
    if (ts - ult < 6000) return;
    if (!enSilencio || cicloCompleto) {
      g.ocultacionUltima[id] = ts;
      // Si hace poco se vio un objeto conocido en esa mano, se nombra en el aviso.
      let objeto = null;
      const om = g.objetoEnMano && g.objetoEnMano[id];
      if (om && ts - om.ts <= GESTO_OBJETO_CADUCA_MS) objeto = om.clase;
      bus.emit('gesto:ocultacion', {
        trackId: id, puntuacion: Math.round(nueva), objeto: objeto,
        repetida: enSilencio && !!cicloCompleto,
      });
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
    // Anti-falsas: solo personas FIABLES (confianza decente) y con el track ya
    // MADURO. Un trípode/objeto confundido con «persona» un instante puntúa bajo
    // y aparece de golpe: así no dispara una «caída» crítica falsa.
    if (t.score != null && t.score < 0.5) continue;
    if ((ts - (t.creadoEn || ts)) < 1200) continue;
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

/* Desplazamiento NETO del centroide en los últimos `ms` (no la suma de saltos).
 * Un detector fantasma salta en el sitio: mucha velocidad instantánea pero
 * desplazamiento neto casi cero. Un corredor real recorre distancia de verdad. */
function gesto_desplazamientoNeto(t, ms, ts) {
  const h = t.historial;
  if (!h || h.length < 2) return 0;
  let viejo = h[0];
  for (let i = h.length - 1; i >= 0; i--) { if (ts - h[i].ts >= ms) { viejo = h[i]; break; } }
  return nuc_dist(viejo.cx, viejo.cy, t.cx, t.cy);
}

/* --- 3b) Carrera: velocidad del track sostenida, con guardas anti-fantasma --*/
const GESTO_CARRERA_EDAD_MIN_MS = 1200;   // el track debe llevar ≥1,2 s vivo
const GESTO_CARRERA_SCORE_MIN = 0.45;     // confianza decente (no caja basura)
const GESTO_CARRERA_DESP_REL = 0.12;      // desplazamiento neto ≥12% del ancho
function gesto_detectarCarrera(tracks, ts) {
  const g = estado.gesto;
  const umbral = estado.cfg.carreraVel * estado.video.w / 10; // px/s
  const despMin = GESTO_CARRERA_DESP_REL * (estado.video.w || 1);
  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i];
    if (NUC_PERSONA.indexOf(t.clase) < 0) continue;
    let c = g.carrera[t.id];
    if (!c) c = g.carrera[t.id] = { rapidoDesde: null, ultima: 0 };
    const vel = gesto_velocidad(t);
    // Guardas: track maduro + confianza decente + NO tumbado. Quien corre va
    // erguido; se descarta solo la caja claramente plana (tumbado/medio cuerpo
    // raro que «vuela» = salto del detector). Se afina menos que antes para no
    // comerse carreras de gente medio agachada.
    const fiable = (ts - (t.creadoEn || ts)) >= GESTO_CARRERA_EDAD_MIN_MS
      && (t.score == null || t.score >= GESTO_CARRERA_SCORE_MIN)
      && (!t.caja || t.caja.al > t.caja.an * 0.85);
    if (fiable && vel > umbral && umbral > 0) {
      if (c.rapidoDesde == null) c.rapidoDesde = ts;
      // Además del tiempo sostenido, exige desplazamiento NETO real (mata fantasmas).
      const despNeto = gesto_desplazamientoNeto(t, GESTO_CARRERA_SOSTENIDA_MS, ts);
      if ((ts - c.rapidoDesde) >= GESTO_CARRERA_SOSTENIDA_MS
          && despNeto >= despMin
          && (ts - c.ultima) >= GESTO_COOLDOWN_CARRERA_MS) {
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
  if (!g) return;
  // Diagnóstico: personas cuyo RECORTE no dio esqueleto → "sin postura".
  // Así se ve al instante por qué un gesto no puntúa (persona demasiado
  // pequeña/tapada, o el modelo de pose no cargó).
  try {
    const sinPose = g.sinPose || {};
    const tracks = estado.tracks || [];
    ctx.save();
    ctx.font = 'bold 12px ui-monospace,Consolas,monospace';
    for (let i = 0; i < tracks.length; i++) {
      const t = tracks[i];
      if (!t || t.clase !== 'person' || !sinPose[t.id]) continue;
      const txt = '⌐ sin postura';
      const anx = ctx.measureText(txt).width + 10;
      ctx.fillStyle = 'rgba(11,15,20,.75)';
      ctx.fillRect(t.caja.x, Math.max(0, t.caja.y - 34), anx, 18);
      ctx.fillStyle = '#ffb224';
      ctx.fillText(txt, t.caja.x + 5, Math.max(13, t.caja.y - 21));
    }
    ctx.restore();
  } catch (e) { /* diagnóstico jamás rompe el pintado */ }
  if (!g.poses || !g.poses.length) return;
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

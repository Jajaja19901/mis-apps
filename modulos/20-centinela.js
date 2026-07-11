/* ============================================================================
 * 20-CENTINELA — VIGÍA IA · DMS del conductor (fatiga y distracción).
 * Prefijo: dms_ / DMS_. Estado interno en estado.dms.
 *
 * QUÉ ES: análisis del ESTADO de la cara del conductor (párpados, bostezos,
 * postura de la cabeza) con MediaPipe FaceLandmarker sobre la CÁMARA FRONTAL.
 * NO identifica personas, NO reconocimiento facial: solo mide señales de sueño
 * y distracción, como los DMS de los coches modernos.
 *
 * CARGA PEREZOSA REAL: ni el código del modelo ni sus pesos se descargan hasta
 * pulsar «Activar Centinela». Al apagarlo se cierra el modelo y se para la
 * cámara frontal → CERO consumo en off.
 *
 * HONESTIDAD (pantalla del módulo): los coches usan cámaras infrarrojas (ven de
 * noche y con gafas de sol); la frontal del móvil NO. De noche necesita algo de
 * luz y con gafas oscuras la detección ocular falla (se apoya en cabeza y
 * bostezos). Sistema INFORMATIVO: el conductor es siempre el responsable. No
 * sustituye descansar antes de conducir. No es un sistema certificado.
 *
 * SEGURIDAD: todo aguanta sin cámara, sin modelo, sin GPS y sin red
 * (guarda-clauses + try/catch). Con el módulo OFF no se importa ni un byte del
 * modelo. El verificador headless pulsa el botón sin que nada reviente.
 * ==========================================================================*/

/* --- URLs de MediaPipe (import() dinámico, igual que el módulo de gestos) ---*/
const DMS_MP_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs';
const DMS_WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const DMS_MODELO_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

/* --- Constantes ------------------------------------------------------------*/
const DMS_PERCLOS_VENTANA_MS = 60000;   // ventana móvil de PERCLOS
const DMS_CALIBRA_MS = 20000;           // calibración inicial con ojos abiertos
const DMS_OJO_UMBRAL_DEF = 0.45;        // blendshape de parpadeo: >esto = ojo cerrado
const DMS_BOSTEZO_UMBRAL = 0.5;         // jawOpen por encima = boca muy abierta
const DMS_YAW_UMBRAL = 0.16;            // giro de cabeza (proporción) = mirando a un lado
const DMS_CABEZADA_VEL = 0.06;          // caída brusca de la cabeza (Δ nariz.y por tick)
const DMS_COOLDOWN_MS = 6000;           // anti-spam por tipo de aviso
const DMS_BOSTEZO_VENTANA_MS = 600000;  // 10 min para contar bostezos
const DMS_NIVEL2_PERCLOS = 40;          // PERCLOS alto → sube a nivel 2

/* ============================================================================
 * ARRANQUE (idempotente): estado, botón de header, controles del panel,
 * pintor del HUD. NO carga el modelo ni abre la cámara (eso solo al activar).
 * ==========================================================================*/
function dms_init() {
  if (estado.dms && estado.dms.inited) return;

  estado.dms = {
    inited: false,
    activo: false,
    modelo: null,          // instancia FaceLandmarker (null si no cargado)
    cargando: false,
    stream: null,          // stream de la cámara frontal
    video: null,           // <video> frontal propio
    bucle: 0,              // id del setInterval del análisis
    ts: 0,                 // timestamp monótono para detectForVideo
    modoCamara: '',        // 'ideal' | 'dual' | 'solo' | 'no_disponible'
    // Métricas
    umbralOjo: DMS_OJO_UMBRAL_DEF,
    perclosMuestras: [],   // [{ts, cerrado:bool}]
    perclos: 0,
    ojoCerradoDesde: 0,    // ts en que se cerraron los ojos (microsueño)
    bostezoDesde: 0, bostezos: [],   // [ts]
    distraccionDesde: 0,
    caraDesde: 0, sinCaraDesde: 0,
    narizY: null, narizYprev: null,
    nivel: 0,              // 0 ok · 1 café · 2 voz · 3 alarma
    ultAviso: {},          // tipo -> ts (cooldown)
    // Calibración
    calibrando: false, calibraHasta: 0, calibraSuma: 0, calibraN: 0,
    // Conducción continua
    conduceDesde: 0, ultDescanso: 0,
    _ultRender: 0,
  };

  // El botón del header solo MUESTRA/OCULTA el panel (no carga nada): el modelo
  // y la cámara se descargan al pulsar «Activar Centinela» dentro del panel.
  const btn = document.getElementById('ui-btnCentinela');
  if (btn) btn.addEventListener('click', function () { dms_panelAlternar(); });

  dms_cablearControles();
  dms_sincronizarControles();

  // HUD del Centinela sobre el compuesto (orden 80, encima de todo).
  if (typeof vid_registrarPintor === 'function') {
    vid_registrarPintor('centinela', dms_pintarHUD, 80);
  }

  estado.dms.inited = true;
  // NOTA: aunque quedara centinelaActivo=true de una sesión anterior, NO se
  // reactiva solo — activar enciende cámara y descarga modelo, y eso debe ser
  // una decisión explícita del conductor. Se deja el botón listo.
  if (estado.cfg.centinelaActivo) { estado.cfg.centinelaActivo = false; nuc_guardar('cfg', estado.cfg); }
}

function dms_toast(msg, nivel) {
  if (typeof ui_toast === 'function') { try { ui_toast(msg, nivel || 'info'); return; } catch (e) {} }
  console.warn('[centinela] ' + msg);
}

function dms_activo() { return !!(estado.dms && estado.dms.activo); }

/* Lleva a la vista del Centinela (la visibilidad la gobierna el selector de modos). */
function dms_panelAlternar() {
  if (typeof modos_ir === 'function') modos_ir('centinela');
  dms_sincronizarControles();
}

/* ============================================================================
 * ACTIVAR / DESACTIVAR — la única puerta que descarga el modelo y la cámara.
 * ==========================================================================*/
function dms_alternar(forzar) {
  const destino = (typeof forzar === 'boolean') ? forzar : !dms_activo();
  if (destino) dms_activar(); else dms_desactivar();
}

async function dms_activar() {
  const d = estado.dms; if (!d || d.activo || d.cargando) return;
  d.cargando = true;
  dms_sincronizarControles();
  dms_toast('👁 Activando Centinela… (descargando el modelo la primera vez)', 'info');
  try {
    // 1) Cámara frontal propia (detecta la combinación disponible).
    const camOk = await dms_abrirCamaraFrontal();
    if (!camOk) {
      d.cargando = false; dms_sincronizarControles();
      dms_toast('No se pudo abrir la cámara frontal (¿ocupada por la trasera o permiso denegado?).', 'sospecha');
      return;
    }
    // 2) Modelo FaceLandmarker (bajo demanda; con fallback GPU→CPU).
    const modeloOk = await dms_cargarModelo();
    if (!modeloOk) {
      dms_cerrarCamara();
      d.cargando = false; dms_sincronizarControles();
      dms_toast('No se pudo cargar el modelo facial (¿sin internet la primera vez?).', 'sospecha');
      return;
    }
    // 3) Arranca calibración + bucle de análisis.
    d.activo = true; d.cargando = false;
    estado.cfg.centinelaActivo = true; nuc_guardar('cfg', estado.cfg);
    d.conduceDesde = Date.now(); d.ultDescanso = Date.now();
    dms_calibrarIniciar();
    const periodo = Math.round(1000 / nuc_clamp(estado.cfg.dmsFps || 3, 2, 4));
    d.bucle = setInterval(dms_tick, periodo);
    dms_sincronizarControles();
    dms_toast('👁 Centinela activo — ' + dms_modoTexto(), 'info');
    if (typeof bus !== 'undefined') bus.emit('centinela:estado', { activo: true, modo: d.modoCamara });
  } catch (e) {
    console.warn('[centinela] activar:', e && e.message);
    dms_cerrarCamara();
    d.cargando = false; d.activo = false;
    dms_sincronizarControles();
    dms_toast('No se pudo activar el Centinela.', 'sospecha');
  }
}

function dms_desactivar() {
  const d = estado.dms; if (!d) return;
  if (d.bucle) { clearInterval(d.bucle); d.bucle = 0; }
  // Cerrar el modelo LIBERA la memoria del cerebro facial (cero consumo en off).
  if (d.modelo) { try { d.modelo.close(); } catch (e) {} d.modelo = null; }
  dms_cerrarCamara();
  d.activo = false; d.cargando = false; d.nivel = 0;
  d.perclosMuestras = []; d.perclos = 0; d.ojoCerradoDesde = 0;
  estado.cfg.centinelaActivo = false; nuc_guardar('cfg', estado.cfg);
  dms_ocultarAlerta();
  dms_sincronizarControles();
  dms_toast('Centinela desactivado (modelo y cámara liberados)', 'info');
  if (typeof bus !== 'undefined') bus.emit('centinela:estado', { activo: false });
}

/* --- Cámara frontal + detección de la combinación disponible ---------------*/
function dms_modoTexto() {
  const m = estado.dms.modoCamara;
  if (m === 'ideal') return 'carretera por dashcam + frontal para el conductor';
  if (m === 'dual') return 'dos cámaras a la vez (trasera + frontal)';
  if (m === 'solo') return 'solo cámara frontal (Centinela)';
  return 'cámara frontal';
}

async function dms_abrirCamaraFrontal() {
  const d = estado.dms;
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return false;
    // ¿La fuente principal ocupa la cámara trasera del propio móvil?
    const traseraEnUso = (estado.cfg.fuente === 'camara' && estado.cfg.camara === 'environment' && estado.video.listo);
    const fuenteRemota = (estado.cfg.fuente === 'ip' || estado.cfg.fuente === 'dashcam' || estado.cfg.fuente === 'archivo');
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    });
    d.stream = stream;
    // Crea (o reutiliza) el <video> frontal oculto.
    let v = document.getElementById('dms-video');
    if (!v) { v = document.createElement('video'); v.id = 'dms-video'; v.muted = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.style.display = 'none'; document.body.appendChild(v); }
    v.srcObject = stream;
    d.video = v;
    await v.play().catch(function () {});
    // Determina el modo de convivencia para informar con honestidad.
    if (fuenteRemota) d.modoCamara = 'ideal';
    else if (traseraEnUso) d.modoCamara = 'dual';   // el navegador aceptó las dos
    else d.modoCamara = 'solo';
    return true;
  } catch (e) {
    // Fallo típico en móviles que no permiten 2 cámaras a la vez.
    d.modoCamara = 'no_disponible';
    console.warn('[centinela] cámara frontal:', e && e.message);
    return false;
  }
}

function dms_cerrarCamara() {
  const d = estado.dms;
  try { if (d.stream) { d.stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} }); } } catch (e) {}
  d.stream = null;
  if (d.video) { try { d.video.srcObject = null; } catch (e) {} }
}

/* --- Carga del modelo FaceLandmarker (bajo demanda, GPU→CPU) ----------------*/
async function dms_cargarModelo() {
  const d = estado.dms;
  if (d.modelo) return true;
  try {
    const mp = await import(DMS_MP_URL);
    const fileset = await mp.FilesetResolver.forVisionTasks(DMS_WASM_URL);
    const opciones = function (delegado) {
      return {
        baseOptions: { modelAssetPath: DMS_MODELO_URL, delegate: delegado },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: true,          // párpados y bostezo (ARKit-style)
        outputFacialTransformationMatrixes: false,
      };
    };
    let lm = null;
    try { lm = await mp.FaceLandmarker.createFromOptions(fileset, opciones('GPU')); }
    catch (eGpu) {
      console.warn('[centinela] GPU no disponible, probando CPU:', eGpu && eGpu.message);
      lm = await mp.FaceLandmarker.createFromOptions(fileset, opciones('CPU'));
    }
    d.modelo = lm;
    return true;
  } catch (e) {
    d.modelo = null;
    console.warn('[centinela] no se pudo cargar FaceLandmarker:', e && e.message);
    return false;
  }
}

/* ============================================================================
 * CALIBRACIÓN — 20 s con ojos abiertos para adaptar el umbral a esta cara.
 * ==========================================================================*/
function dms_calibrarIniciar() {
  const d = estado.dms; if (!d) return;
  d.calibrando = true; d.calibraHasta = Date.now() + DMS_CALIBRA_MS;
  d.calibraSuma = 0; d.calibraN = 0;
  dms_toast('Calibrando 20 s: mira al frente con los ojos abiertos.', 'info');
}
function dms_calibrarMuestra(cerrado) {
  const d = estado.dms;
  d.calibraSuma += cerrado; d.calibraN++;
  if (Date.now() >= d.calibraHasta) {
    d.calibrando = false;
    const media = d.calibraN ? d.calibraSuma / d.calibraN : 0;
    // Umbral = base de ojos abiertos + margen (nunca por debajo del defecto).
    d.umbralOjo = Math.max(DMS_OJO_UMBRAL_DEF, media + 0.3);
    dms_toast('Centinela calibrado. Vigilando la fatiga.', 'info');
  }
}

/* ============================================================================
 * BUCLE DE ANÁLISIS (2-4 fps). En pausa si la velocidad GPS < umbral.
 * ==========================================================================*/
function dms_tick() {
  const d = estado.dms;
  if (!d || !d.activo || !d.modelo || !d.video) return;
  try {
    // Puerta por velocidad GPS (si hay copiloto con GPS): parado = en pausa.
    if (estado.cfg.dmsGpsGate && estado.cop && typeof estado.cop.velActual === 'number' && estado.cop.gpsId) {
      if (estado.cop.velActual < (estado.cfg.dmsVelMin || 18)) { d.nivel = 0; return; }
    }
    const v = d.video;
    if (!v.videoWidth) return;   // aún sin frame
    d.ts += Math.max(1, Math.round(1000 / (estado.cfg.dmsFps || 3)));
    const res = d.modelo.detectForVideo(v, d.ts);
    dms_evaluar(res, Date.now());
  } catch (e) {
    console.warn('[centinela] tick:', e && e.message);
  }
}

/* Lee un blendshape por nombre (0..1). */
function dms_shape(bs, nombre) {
  if (!bs || !bs.categories) return 0;
  for (let i = 0; i < bs.categories.length; i++) {
    if (bs.categories[i].categoryName === nombre) return bs.categories[i].score;
  }
  return 0;
}

/* ============================================================================
 * EVALUACIÓN de un resultado: PERCLOS, microsueño, parpadeo lento, bostezo,
 * cabezada, distracción y cara perdida. Sube el nivel y avisa escalonadamente.
 * ==========================================================================*/
function dms_evaluar(res, ahora) {
  const d = estado.dms;
  const cara = res && res.faceLandmarks && res.faceLandmarks[0];
  const bs = res && res.faceBlendshapes && res.faceBlendshapes[0];

  // --- CARA PERDIDA ---
  if (!cara) {
    if (!d.sinCaraDesde) d.sinCaraDesde = ahora;
    if (ahora - d.sinCaraDesde >= (estado.cfg.dmsCaraPerdidaMs || 5000)) {
      dms_aviso('cara', 2, 'No veo tu cara — coloca bien el móvil o hay poca luz');
    }
    d.caraDesde = 0;
    dms_render();
    return;
  }
  d.sinCaraDesde = 0;
  if (!d.caraDesde) d.caraDesde = ahora;

  // --- OJOS (blendshapes) ---
  const cerrado = (dms_shape(bs, 'eyeBlinkLeft') + dms_shape(bs, 'eyeBlinkRight')) / 2;
  if (d.calibrando) { dms_calibrarMuestra(cerrado); dms_render(); return; }
  const ojoCerrado = cerrado >= d.umbralOjo;

  // PERCLOS: fracción de tiempo con ojos cerrados en 60 s.
  d.perclosMuestras.push({ ts: ahora, cerrado: ojoCerrado });
  d.perclosMuestras = d.perclosMuestras.filter(function (m) { return ahora - m.ts < DMS_PERCLOS_VENTANA_MS; });
  const nCerr = d.perclosMuestras.reduce(function (a, m) { return a + (m.cerrado ? 1 : 0); }, 0);
  d.perclos = d.perclosMuestras.length ? Math.round(nCerr / d.perclosMuestras.length * 100) : 0;

  // MICROSUEÑO: ojos cerrados seguidos > umbral → CRÍTICA inmediata.
  if (ojoCerrado) {
    if (!d.ojoCerradoDesde) d.ojoCerradoDesde = ahora;
    if (ahora - d.ojoCerradoDesde >= (estado.cfg.dmsMicrosuenoMs || 1500)) {
      dms_aviso('microsueno', 3, '¡DESPIERTA! Ojos cerrados');
    }
  } else {
    d.ojoCerradoDesde = 0;
  }

  // FATIGA por PERCLOS.
  if (d.perclos >= DMS_NIVEL2_PERCLOS) dms_aviso('perclos', 2, 'Signos de cansancio. Busca un área de descanso.');
  else if (d.perclos >= (estado.cfg.dmsPerclosUmbral || 25)) dms_aviso('perclos', 1, 'Cansancio leve — atención');

  // --- BOSTEZO (jawOpen) ---
  const jaw = dms_shape(bs, 'jawOpen');
  if (jaw >= DMS_BOSTEZO_UMBRAL) {
    if (!d.bostezoDesde) d.bostezoDesde = ahora;
    if (ahora - d.bostezoDesde >= (estado.cfg.dmsBostezoMs || 2000) && !d.bostezoContado) {
      d.bostezoContado = true;
      d.bostezos.push(ahora);
      d.bostezos = d.bostezos.filter(function (t) { return ahora - t < DMS_BOSTEZO_VENTANA_MS; });
      if (d.bostezos.length >= 3) dms_aviso('bostezo', 2, 'Varios bostezos: el cansancio se acumula. Descansa.');
    }
  } else { d.bostezoDesde = 0; d.bostezoContado = false; }

  // --- POSTURA DE LA CABEZA (aproximada por geometría de landmarks) ---
  // Yaw (giro izq/dcha): posición horizontal de la nariz entre las mejillas.
  const nariz = cara[1], mejIzq = cara[234], mejDcha = cara[454];
  if (nariz && mejIzq && mejDcha) {
    const ancho = (mejDcha.x - mejIzq.x) || 1;
    const yaw = (nariz.x - (mejIzq.x + mejDcha.x) / 2) / ancho;   // ~ -0.5..0.5
    if (Math.abs(yaw) >= DMS_YAW_UMBRAL) {
      if (!d.distraccionDesde) d.distraccionDesde = ahora;
      if (ahora - d.distraccionDesde >= (estado.cfg.dmsDistraccionMs || 2500)) {
        dms_aviso('distraccion', 2, 'Ojos a la carretera');
      }
    } else { d.distraccionDesde = 0; }
    // Cabezada: caída brusca de la nariz (Δy grande) y recuperación → crítica.
    d.narizYprev = d.narizY; d.narizY = nariz.y;
    if (d.narizYprev != null) {
      const dv = d.narizY - d.narizYprev;
      if (dv >= DMS_CABEZADA_VEL) dms_aviso('cabezada', 3, '¡Atención! Cabeza cayendo');
    }
  }

  // --- CONDUCCIÓN CONTINUA (independiente de la cara) ---
  dms_conduccionContinua(ahora);

  // Nivel general: decae si no hay avisos recientes.
  dms_decaerNivel(ahora);
  dms_render();
}

/* Temporizador de conducción continua: 2 h sin parada > 15 min → sugerir descanso. */
function dms_conduccionContinua(ahora) {
  const d = estado.dms; if (!d.conduceDesde) return;
  const maxMs = (estado.cfg.dmsConduccionMaxH || 2) * 3600000;
  if (ahora - d.conduceDesde >= maxMs && ahora - d.ultDescanso >= maxMs) {
    d.ultDescanso = ahora;
    dms_aviso('conduccion', 2, 'Llevas ' + (estado.cfg.dmsConduccionMaxH || 2) + ' h conduciendo. Para a descansar 15 min.');
  }
}

/* ============================================================================
 * AVISOS ESCALONADOS (Euro NCAP): 1 café+tono · 2 voz+vibración · 3 alarma máx.
 * Todo evento queda en la BITÁCORA (log) vía alerta_disparar. Sin foto del
 * conductor: alerta_disparar captura el compuesto (la carretera), no la cara.
 * ==========================================================================*/
function dms_aviso(tipo, nivel, texto) {
  const d = estado.dms;
  const ahora = Date.now();
  if (d.ultAviso[tipo] && ahora - d.ultAviso[tipo] < DMS_COOLDOWN_MS) { d.nivel = Math.max(d.nivel, nivel); return; }
  d.ultAviso[tipo] = ahora;
  d.nivel = Math.max(d.nivel, nivel);
  d.nivelDesde = ahora;

  // Bitácora + sonido/vibración base por nivel (reutiliza el motor de alertas).
  const nivelAlerta = nivel >= 3 ? 'critico' : (nivel >= 2 ? 'sospecha' : 'info');
  if (typeof alerta_disparar === 'function') {
    try { alerta_disparar('dms_' + tipo, nivelAlerta, '👁 ' + texto, {}); } catch (e) { dms_toast(texto, nivelAlerta); }
  } else { dms_toast(texto, nivelAlerta); }

  // Refuerzos específicos del conductor.
  if (nivel === 1) { dms_tono(880, 0.12); }
  if (nivel >= 2) { dms_tono(660, 0.18); if (estado.cfg.dmsVoz) dms_voz(texto); try { if (navigator.vibrate) navigator.vibrate(200); } catch (e) {} }
  if (nivel >= 3) {
    dms_alarmaMax();
    if (estado.cfg.dmsVoz) dms_voz('¡Despierta! Para el coche.');
    try { if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 400]); } catch (e) {}
    dms_mostrarAlerta(texto);
  }
}

function dms_decaerNivel(ahora) {
  const d = estado.dms;
  if (d.nivel > 0 && d.nivelDesde && ahora - d.nivelDesde > 8000) { d.nivel = 0; dms_ocultarAlerta(); }
}

/* --- Audio propio (independiente de las alertas) ---------------------------*/
let dms_audioCtx = null;
function dms_ctx() {
  try {
    if (!dms_audioCtx) dms_audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (dms_audioCtx.state === 'suspended') dms_audioCtx.resume().catch(function () {});
    return dms_audioCtx;
  } catch (e) { return null; }
}
function dms_tono(freq, vol) {
  const ctx = dms_ctx(); if (!ctx) return;
  try {
    const t0 = ctx.currentTime, osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = 'sine'; osc.frequency.value = freq || 800;
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol || 0.15, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35);
    osc.connect(g); g.connect(ctx.destination); osc.start(t0); osc.stop(t0 + 0.4);
  } catch (e) {}
}
function dms_alarmaMax() {
  const ctx = dms_ctx(); if (!ctx) return;
  try {
    const t0 = ctx.currentTime, osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = 'square';
    for (let i = 0; i < 6; i++) { osc.frequency.setValueAtTime(1200, t0 + i * 0.18); osc.frequency.setValueAtTime(700, t0 + i * 0.18 + 0.09); }
    g.gain.setValueAtTime(0.9, t0); g.gain.setValueAtTime(0.9, t0 + 1.0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.1);
    osc.connect(g); g.connect(ctx.destination); osc.start(t0); osc.stop(t0 + 1.15);
  } catch (e) {}
}
function dms_voz(texto) {
  try {
    if (!('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(texto);
    u.lang = 'es-ES'; u.rate = 1; u.volume = 1;
    window.speechSynthesis.cancel(); window.speechSynthesis.speak(u);
  } catch (e) {}
}

/* --- Overlay rojo de nivel 3 (aparte del canvas: no entra en la evidencia) --*/
function dms_mostrarAlerta(texto) {
  const ov = document.getElementById('dms-alerta');
  if (!ov) return;
  const t = document.getElementById('dms-alerta-texto');
  if (t) t.textContent = texto || '¡DESPIERTA!';
  ov.classList.remove('oculto');
}
function dms_ocultarAlerta() {
  const ov = document.getElementById('dms-alerta');
  if (ov) ov.classList.add('oculto');
}

/* ============================================================================
 * HUD sobre el vídeo principal: chip con el estado del Centinela.
 * ==========================================================================*/
function dms_pintarHUD(ctx) {
  if (!ctx || !dms_activo()) return;
  const w = (ctx.canvas && ctx.canvas.width) || estado.video.w || 640;
  const h = (ctx.canvas && ctx.canvas.height) || estado.video.h || 480;
  try {
    const d = estado.dms;
    let txt, color;
    if (d.calibrando) { txt = '👁 Calibrando…'; color = 'rgba(63,169,255,.85)'; }
    else if (d.nivel >= 3) { txt = '👁 ¡DESPIERTA!'; color = 'rgba(255,65,85,.92)'; }
    else if (d.nivel === 2) { txt = '👁 Cansancio'; color = 'rgba(255,178,36,.9)'; }
    else if (d.nivel === 1) { txt = '☕ Atención'; color = 'rgba(255,178,36,.8)'; }
    else { txt = '👁 Alerta · PERCLOS ' + (d.perclos || 0) + '%'; color = 'rgba(46,229,132,.82)'; }
    ctx.save();
    ctx.font = "600 " + Math.round(h * 0.026) + "px system-ui,-apple-system,'Segoe UI',sans-serif";
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    const pad = h * 0.012, tw = ctx.measureText(txt).width;
    const bx = w * 0.02, by = h * 0.09, bh = h * 0.05, bw = tw + pad * 2;
    ctx.fillStyle = color; ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = '#051019'; ctx.fillText(txt, bx + pad, by + bh / 2);
    ctx.restore();
  } catch (e) {}
}

/* ============================================================================
 * PANEL (controles). El HTML vive en 20-centinela.html (SLOT:CENTINELA).
 * ==========================================================================*/
function dms_cablearControles() {
  const btn = document.getElementById('centinela-btnActivar');
  if (btn) btn.addEventListener('click', function () { dms_alternar(); });
  const btnCal = document.getElementById('centinela-btnCalibrar');
  if (btnCal) btnCal.addEventListener('click', function () { if (dms_activo()) dms_calibrarIniciar(); else dms_toast('Activa primero el Centinela.', 'info'); });
  const toggles = [['centinela-voz', 'dmsVoz'], ['centinela-gpsgate', 'dmsGpsGate'], ['centinela-guardar', 'dmsGuardarCriticos']];
  toggles.forEach(function (par) {
    const el = document.getElementById(par[0]);
    if (el) el.addEventListener('change', function () { estado.cfg[par[1]] = !!el.checked; nuc_guardar('cfg', estado.cfg); });
  });
}

function dms_sincronizarControles() {
  const d = estado.dms || {};
  const btn = document.getElementById('centinela-btnActivar');
  if (btn) {
    btn.textContent = d.cargando ? '⏳ Activando…' : (d.activo ? '⏹ Desactivar Centinela' : '▶ Activar Centinela');
    btn.classList.toggle('btn-primario', !d.activo && !d.cargando);
    btn.disabled = !!d.cargando;
  }
  const hb = document.getElementById('ui-btnCentinela');
  if (hb) hb.classList.toggle('activo', !!d.activo);
  [['centinela-voz', 'dmsVoz'], ['centinela-gpsgate', 'dmsGpsGate'], ['centinela-guardar', 'dmsGuardarCriticos']].forEach(function (par) {
    const el = document.getElementById(par[0]); if (el) el.checked = !!estado.cfg[par[1]];
  });
}

/* Actualiza el pequeño panel de estado (throttle). */
function dms_render() {
  const d = estado.dms; if (!d) return;
  const ahora = Date.now();
  if (ahora - d._ultRender < 500) return;
  d._ultRender = ahora;
  const est = document.getElementById('centinela-estado');
  if (est) {
    if (!d.activo) est.textContent = 'Apagado (sin consumo).';
    else if (d.calibrando) est.textContent = 'Calibrando 20 s con ojos abiertos…';
    else est.textContent = 'Vigilando · PERCLOS ' + (d.perclos || 0) + '% · bostezos ' + (d.bostezos ? d.bostezos.length : 0) + '/10 min · ' + dms_modoTexto();
  }
}

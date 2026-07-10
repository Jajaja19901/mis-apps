/* ============================================================================
 * 15-COPILOTO — VIGÍA IA · MODO COPILOTO / COCHE (dashcam de conducción).
 * Convierte el móvil colocado en el coche en una dashcam con:
 *   · Caja negra por acelerómetro (frenazo/golpe → clip de evidencia + alerta).
 *   · Velocímetro por GPS (~aprox., nunca válido como medición legal).
 *   · HUD tipo salpicadero sobre el vídeo (velocidad, fuerza G, hora, REC).
 *   · Aviso de posible colisión frontal (vehículo delante que se acerca rápido).
 *   · Bitácora de trayectos (distancia, vMax, gMax, eventos) con export.
 *   · Modo "coche aparcado": golpe/movimiento del coche parado → alerta crítica.
 *
 * Prefijo público: cop_ / COP_. Estado propio en estado.cop.
 * Honestidad: la velocidad viene del GPS (~aprox.) y los avisos de colisión son
 * una AYUDA, no sustituyen la atención al volante. Nada de precisión de radar.
 *
 * Seguridad: TODAS las funciones son seguras sin vídeo y sin sensores. En
 * headless (Chromium sin acelerómetro ni GPS) no se dispara ningún evento y
 * ninguna función lanza excepciones (guarda-clauses + try/catch).
 * ==========================================================================*/

/* --- Constantes ------------------------------------------------------------*/
const COP_G = 9.81;                       // gravedad (m/s²) para pasar a "g"
const COP_COOLDOWN_IMPACTO_MS = 8000;     // caja negra por frenazo/golpe
const COP_COOLDOWN_APARCADO_MS = 8000;    // golpe con el coche aparcado
const COP_COOLDOWN_COLISION_MS = 5000;    // aviso de colisión frontal
const COP_SENSOR_TIMEOUT_MS = 4000;       // sin señal del acelerómetro → aviso
const COP_COLISION_MOSTRAR_MS = 1500;     // duración del cartel "⚠ FRENA"
const COP_VIAJES_MAX = 50;                // trayectos guardados (rotación)
const COP_DIST_MIN_M = 2;                 // mínimo para sumar distancia (anti-jitter GPS)
const COP_DIST_MAX_M = 200;               // máximo por salto (descarta teletransportes)
const COP_VEL_MAX_KMH = 300;              // tope defensivo de velocidad mostrada
/* Colisión frontal: umbrales sobre los tracks de vehículos (relativos al frame) */
const COP_COL_AREA_MIN = 0.05;            // el vehículo ocupa ≥5% del encuadre
const COP_COL_CENTRO_REL = 0.22;          // centrado: |cx - w/2| < 22% del ancho
const COP_COL_CRECE = 1.12;               // el área crece >12% entre inferencias
const COP_COL_FRAMES = 3;                 // crecimiento sostenido N inferencias
/* Peatón delante: umbrales propios (una persona es más estrecha que un coche) */
const COP_PEATON_AREA_MIN = 0.03;         // la persona ocupa ≥3% del encuadre
const COP_PEATON_CENTRO_REL = 0.25;
const COP_PEATON_FRAMES = 2;              // acercándose 2 inferencias seguidas
/* STOP / distancia de seguridad / auto-trayecto / fatiga */
const COP_STOP_AREA_MIN = 0.004;          // la señal ocupa ≥0.4% del encuadre
const COP_STOP_COOLDOWN_MS = 30000;
const COP_DIST_AREA = 0.08;               // vehículo delante ≥8% del encuadre…
const COP_DIST_MS = 3000;                 // …sostenido ≥3 s = vas muy pegado
const COP_DIST_COOLDOWN_MS = 60000;
const COP_DIST_VEL_MIN = 30;              // solo avisa a más de 30 km/h (pegado en ciudad es normal)
const COP_AUTO_KMH = 15;                  // auto-iniciar trayecto al superar esto
const COP_FATIGA_MS = 2 * 3600000;        // aviso de descanso a las 2 h…
const COP_FATIGA_REPETIR_MS = 30 * 60000; // …y recordatorio cada 30 min
const COP_RUTA_MIN_M = 20;                // punto de ruta cada ≥20 m (GPX)
const COP_RUTA_MAX_PTS = 4000;            // tope en memoria
const COP_RUTA_GUARDAR_PTS = 600;         // puntos guardados por trayecto (simplificado)
/* Estimación de la velocidad del coche de delante (ORIENTATIVA, no radar) */
const COP_VEL_ANCHO_COCHE_M = 1.8;        // ancho típico de un coche (m) para estimar distancia
const COP_VEL_FOV_FACTOR = 0.87;          // focal en px ≈ factor·anchoFrame (FOV ~65° del móvil)
const COP_VEL_ANCHO_MIN_REL = 0.06;       // el coche debe ocupar ≥6% de ancho (si no, muy lejos → poco fiable)
const COP_VEL_VENTANA_MS = 1200;          // ventana para medir el cambio de distancia
const COP_VEL_MIN_SPAN_MS = 500;          // mínimo de tiempo medido para dar un número
const COP_VEL_VIGENCIA_MS = 1500;         // el número se muestra si es más nuevo que esto

/* ============================================================================
 * ARRANQUE (idempotente): crea estado, cablea botón y controles, registra el
 * pintor del HUD. NO arranca los sensores (eso solo al activar el copiloto).
 * ==========================================================================*/
function cop_init() {
  if (estado.cop && estado.cop.inited) return;

  estado.cop = {
    inited: false,
    // Lecturas en vivo
    velActual: 0, velMax: 0,
    gActual: 0, gMax: 0, gMedia: 0,
    // Filtro de gravedad (para restarla cuando solo hay accelIncludingGravity)
    grav: { x: 0, y: 0, z: COP_G }, gravInit: false,
    // GPS
    gpsId: 0, ultPos: null,
    // Sensores
    sensoresOn: false, motionRecibido: false, motionTimer: 0,
    sinAcelAvisado: false, gpsErrAvisado: false, permisoAvisado: false,
    // Cooldowns
    ultImpacto: 0, ultAparcado: 0, ultColision: 0,
    ultStop: 0, ultDistSeg: 0, ultFatiga: 0,
    // Colisión frontal / peatón / distancia
    colisionHasta: 0, colisionTexto: '⚠ FRENA', veh: {}, peat: {}, distDesde: 0,
    // Velocidad estimada del coche de delante
    velDelante: null, velHist: null,
    // Bitácora
    viaje: null,
    // Render
    _ultRender: 0,
  };

  // Botón del header (typeof-check implícito: solo si existe el nodo).
  const btn = document.getElementById('ui-btnCopiloto');
  if (btn) btn.addEventListener('click', function () { cop_alternar(); });

  // Controles del panel (interruptores, sensibilidad y trayecto).
  cop_cablearControles();
  cop_sincronizarControles();

  // Pintor del HUD sobre el compuesto (orden 70, encima de tracks/zonas).
  if (typeof vid_registrarPintor === 'function') {
    vid_registrarPintor('copiloto', cop_pintarHUD, 70);
  }

  // Análisis de colisión frontal: una vez por inferencia (evento 'frame').
  if (typeof bus !== 'undefined' && bus.on) {
    bus.on('frame', cop_analizarColision);
    // Velocidad estimada del coche de delante (independiente del aviso de colisión).
    bus.on('frame', function () { try { cop_estimarVelDelante(); } catch (e) {} });
  }

  estado.cop.inited = true;

  // Restaura el estado activo si el dueño lo dejó encendido (arranca sensores).
  if (estado.cfg && estado.cfg.copActivo) cop_aplicar(true);
}

/* Enlaza los controles del panel con guarda-clause en cada uno. */
function cop_cablearControles() {
  const colision = document.getElementById('cop-colision');
  if (colision) colision.addEventListener('change', function () {
    estado.cfg.copColisionAviso = !!colision.checked;
    nuc_guardar('cfg', estado.cfg);
    bus.emit('cfg:cambio', { clave: 'copColisionAviso' });
  });

  const parking = document.getElementById('cop-parking');
  if (parking) parking.addEventListener('change', function () {
    estado.cfg.copParkingOn = !!parking.checked;
    nuc_guardar('cfg', estado.cfg);
    bus.emit('cfg:cambio', { clave: 'copParkingOn' });
    if (typeof ui_toast === 'function') {
      try {
        ui_toast(estado.cfg.copParkingOn
          ? 'Vigilancia de coche aparcado activada. Deja el móvil fijo y enchufado.'
          : 'Vigilancia de coche aparcado desactivada.', 'info');
      } catch (e) { /* sin toast no pasa nada */ }
    }
  });

  // Interruptores nuevos (peatón / stop / distancia / auto-trayecto / fatiga)
  const cop_chk = (id, clave) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', function () {
      estado.cfg[clave] = !!el.checked;
      nuc_guardar('cfg', estado.cfg);
    });
  };
  cop_chk('cop-peaton', 'copPeaton');
  cop_chk('cop-stop', 'copStopAviso');
  cop_chk('cop-distSeg', 'copDistSeg');
  cop_chk('cop-autoTrayecto', 'copAutoTrayecto');
  cop_chk('cop-fatiga', 'copFatiga');
  cop_chk('cop-sonido', 'copSonido');
  cop_chk('cop-velOtros', 'copVelOtros');
  const bGpx = document.getElementById('cop-btnGpx');
  if (bGpx) bGpx.addEventListener('click', cop_exportarGPX);

  const sens = document.getElementById('cop-sensibilidad');
  if (sens) sens.addEventListener('input', function () {
    const v = parseFloat(sens.value);
    if (!isNaN(v)) {
      estado.cfg.copSensibilidadG = nuc_clamp(v, 1.5, 4);
      nuc_guardar('cfg', estado.cfg);
      cop_pintarSensibilidad();
    }
  });

  const bIni = document.getElementById('cop-btnIniciar');
  if (bIni) bIni.addEventListener('click', cop_iniciarViaje);
  const bFin = document.getElementById('cop-btnTerminar');
  if (bFin) bFin.addEventListener('click', cop_terminarViaje);
  const bExp = document.getElementById('cop-btnExportar');
  if (bExp) bExp.addEventListener('click', cop_exportarBitacora);
}

/* Coloca en los controles los valores guardados en cfg. */
function cop_sincronizarControles() {
  const colision = document.getElementById('cop-colision');
  if (colision) colision.checked = !!estado.cfg.copColisionAviso;
  const parking = document.getElementById('cop-parking');
  if (parking) parking.checked = !!estado.cfg.copParkingOn;
  const pares = [['cop-peaton', 'copPeaton'], ['cop-stop', 'copStopAviso'], ['cop-distSeg', 'copDistSeg'],
                 ['cop-autoTrayecto', 'copAutoTrayecto'], ['cop-fatiga', 'copFatiga'],
                 ['cop-sonido', 'copSonido'], ['cop-velOtros', 'copVelOtros']];
  for (let i = 0; i < pares.length; i++) {
    const el = document.getElementById(pares[i][0]);
    if (el) el.checked = !!estado.cfg[pares[i][1]];
  }
  const sens = document.getElementById('cop-sensibilidad');
  if (sens) sens.value = String(estado.cfg.copSensibilidadG || 2.2);
  cop_pintarSensibilidad();
  cop_actualizarBotonesViaje();
}

/* 🔊 Pitido de emergencia (dos tonos agudos) + vibración. Acompaña al cartel
 * FRENA/PEATÓN para que el aviso llegue aunque no mires la pantalla. Se apaga
 * con el interruptor copSonido. Nunca lanza: sin audio, sigue en silencio. */
function cop_pitar() {
  if (!estado.cfg.copSonido) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) {
      if (!estado.cop._audio) estado.cop._audio = new AC();
      const actx = estado.cop._audio;
      if (actx.state === 'suspended') { actx.resume().catch(function () {}); }
      for (let i = 0; i < 2; i++) {
        const t = actx.currentTime + i * 0.22;
        const osc = actx.createOscillator(), gan = actx.createGain();
        osc.type = 'square'; osc.frequency.value = 880;
        gan.gain.setValueAtTime(0.0001, t);
        gan.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
        gan.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
        osc.connect(gan); gan.connect(actx.destination);
        osc.start(t); osc.stop(t + 0.2);
      }
    }
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  } catch (e) { /* sin audio/vibración no pasa nada */ }
}

/* ============================================================================
 * ACTIVAR / DESACTIVAR EL MODO COPILOTO
 * ==========================================================================*/
function cop_alternar(forzar) {
  if (!estado.cop) { cop_init(); if (!estado.cop) return; }
  const destino = (typeof forzar === 'boolean') ? forzar : !estado.cfg.copActivo;
  cop_aplicar(destino);
}

/* Aplica el estado activo/inactivo: sección, botón, persistencia y sensores. */
function cop_aplicar(activo) {
  estado.cfg.copActivo = !!activo;
  nuc_guardar('cfg', estado.cfg);

  const sec = document.getElementById('ui-secCopiloto');
  if (sec) sec.classList.toggle('oculto', !activo);
  const btn = document.getElementById('ui-btnCopiloto');
  if (btn) {
    btn.setAttribute('aria-pressed', activo ? 'true' : 'false');
    btn.textContent = activo ? '🚗 Copiloto ✓' : '🚗 Copiloto';
  }

  if (activo) {
    cop_arrancarSensores();
    // Consejo una sola vez: con el motor básico los coches lejanos se pierden.
    if (estado.cfg.motor === 'coco' && !nuc_cargar('cop_avisoMotor', false)) {
      nuc_guardar('cop_avisoMotor', true);
      cop_toast('Consejo: para detectar mejor los coches, cambia el motor a «Potente» en Ajustes → Detección.', 'info');
    }
    // Aviso una sola vez: la lectura de matrículas es automática (no hay que pulsar).
    if (estado.cfg.matContinuo && !nuc_cargar('cop_avisoMatricula', false)) {
      nuc_guardar('cop_avisoMatricula', true);
      cop_toast('La matrícula se lee SOLA: apunta la cámara al coche de delante y la irá leyendo (verás «🔎 Leyendo matrícula…»).', 'info');
    }
  } else {
    cop_pararSensores();
  }

  cop_render(true);
}

/* ============================================================================
 * SENSORES: acelerómetro (caja negra) + GPS (velocidad). Solo con el copiloto
 * activo. En iOS, DeviceMotion necesita permiso dentro del gesto del usuario.
 * ==========================================================================*/
function cop_arrancarSensores() {
  if (!estado.cop || estado.cop.sensoresOn) return;
  estado.cop.sensoresOn = true;
  cop_pedirPermisoMovimiento().then(function (ok) {
    if (!estado.cop || !estado.cop.sensoresOn) return; // se desactivó mientras tanto
    if (ok) cop_engancharMovimiento();
    else if (!estado.cop.permisoAvisado) {
      estado.cop.permisoAvisado = true;
      cop_toast('Permiso de sensores denegado: la caja negra por golpes no funcionará.', 'sospecha');
    }
  }).catch(function () { /* nunca rompe: sin acelerómetro se sigue */ });
  cop_arrancarGPS();
}

function cop_pararSensores() {
  if (!estado.cop) return;
  estado.cop.sensoresOn = false;
  try { window.removeEventListener('devicemotion', cop_alMovimiento); } catch (e) {}
  if (estado.cop.motionTimer) { try { clearTimeout(estado.cop.motionTimer); } catch (e) {} estado.cop.motionTimer = 0; }
  cop_pararGPS();
}

/* Pide permiso de DeviceMotion (iOS 13+). En Android/otros no hace falta. */
function cop_pedirPermisoMovimiento() {
  return new Promise(function (resolve) {
    try {
      if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        DeviceMotionEvent.requestPermission()
          .then(function (res) { resolve(res === 'granted'); })
          .catch(function () { resolve(false); });
      } else {
        resolve(true); // no requiere permiso explícito
      }
    } catch (e) { resolve(true); }
  });
}

function cop_engancharMovimiento() {
  if (!estado.cop) return;
  // ¿Este dispositivo expone el evento? Si no, aviso honesto una sola vez.
  const hayEvento = (typeof DeviceMotionEvent !== 'undefined') || ('ondevicemotion' in window);
  if (!hayEvento) { cop_avisarSinAcelerometro(); return; }
  try {
    window.addEventListener('devicemotion', cop_alMovimiento);
  } catch (e) { cop_avisarSinAcelerometro(); return; }
  estado.cop.motionRecibido = false;
  // Si en unos segundos no llega ninguna lectura, es que no hay acelerómetro.
  estado.cop.motionTimer = setTimeout(function () {
    if (estado.cop && estado.cop.sensoresOn && !estado.cop.motionRecibido) cop_avisarSinAcelerometro();
  }, COP_SENSOR_TIMEOUT_MS);
}

function cop_avisarSinAcelerometro() {
  if (!estado.cop || estado.cop.sinAcelAvisado) return;
  estado.cop.sinAcelAvisado = true;
  cop_toast('Este dispositivo no expone acelerómetro: la caja negra por golpes no estará disponible. El resto del copiloto sigue funcionando.', 'sospecha');
}

/* Lectura del acelerómetro: fuerza G dinámica (gravedad restada) y picos. */
function cop_alMovimiento(e) {
  const c = estado.cop;
  if (!c || !c.sensoresOn) return;
  try {
    c.motionRecibido = true;
    if (c.motionTimer) { clearTimeout(c.motionTimer); c.motionTimer = 0; }

    let dx = 0, dy = 0, dz = 0;
    const a = e && e.acceleration;
    if (a && a.x != null && a.y != null && a.z != null && (a.x !== 0 || a.y !== 0 || a.z !== 0)) {
      // Aceleración lineal (ya sin gravedad): ideal.
      dx = a.x; dy = a.y; dz = a.z;
    } else {
      const g = e && e.accelerationIncludingGravity;
      if (!g || g.x == null || g.y == null || g.z == null) return; // lectura vacía
      // Filtro paso-bajo para estimar la gravedad y restarla → parte dinámica.
      if (!c.gravInit) { c.grav.x = g.x; c.grav.y = g.y; c.grav.z = g.z; c.gravInit = true; }
      const alfa = 0.8;
      c.grav.x = c.grav.x * alfa + g.x * (1 - alfa);
      c.grav.y = c.grav.y * alfa + g.y * (1 - alfa);
      c.grav.z = c.grav.z * alfa + g.z * (1 - alfa);
      dx = g.x - c.grav.x; dy = g.y - c.grav.y; dz = g.z - c.grav.z;
    }

    const mag = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const gForce = mag / COP_G; // fuerza G dinámica (~0 en reposo)

    // Suavizado para el HUD y medias/picos.
    c.gActual = c.gActual * 0.6 + gForce * 0.4;
    c.gMedia = c.gMedia * 0.98 + gForce * 0.02;
    if (gForce > c.gMax) c.gMax = gForce;
    if (c.viaje && gForce > c.viaje.gMax) c.viaje.gMax = gForce;

    const umbral = nuc_clamp(estado.cfg.copSensibilidadG || 2.2, 1.5, 4);
    if (gForce >= umbral) cop_dispararGolpe(gForce);

    cop_render(false);
  } catch (err) { /* una lectura mala no rompe la app */ }
}

/* Un pico por encima del umbral: caja negra + alerta. Enruta según si el coche
 * está en modo "aparcado" (crítico) o en marcha (frenazo/golpe → sospecha). */
function cop_dispararGolpe(gForce) {
  const c = estado.cop;
  const ahora = Date.now();
  const gTxt = gForce.toFixed(1);

  if (estado.cfg.copParkingOn) {
    if (ahora - c.ultAparcado < COP_COOLDOWN_APARCADO_MS) return;
    c.ultAparcado = ahora;
    cop_grabarCajaNegra('aparcado');
    const texto = 'Golpe/movimiento en el coche aparcado (' + gTxt + ' g)';
    if (typeof alerta_disparar === 'function') {
      try { alerta_disparar('aparcado_golpe', 'critico', texto); } catch (e) {}
    }
    cop_anotarEvento('aparcado', texto);
  } else {
    if (ahora - c.ultImpacto < COP_COOLDOWN_IMPACTO_MS) return;
    c.ultImpacto = ahora;
    cop_grabarCajaNegra('copiloto_impacto');
    const texto = 'Frenazo/golpe brusco detectado (' + gTxt + ' g)';
    if (typeof alerta_disparar === 'function') {
      try { alerta_disparar('impacto', 'sospecha', texto); } catch (e) {}
    }
    cop_anotarEvento('impacto', texto);
  }
}

/* Graba un clip de evidencia (buffer 10s antes + 20s después), con typeof-check. */
function cop_grabarCajaNegra(motivo) {
  if (typeof vid_grabarEvento !== 'function') return;
  try { vid_grabarEvento(motivo); } catch (e) { /* sin vídeo no graba, no rompe */ }
}

/* ============================================================================
 * GPS: velocidad (~aprox.) y distancia del trayecto.
 * ==========================================================================*/
function cop_arrancarGPS() {
  const c = estado.cop; if (!c) return;
  try {
    if (!navigator.geolocation || typeof navigator.geolocation.watchPosition !== 'function') {
      cop_avisarSinGPS();
      return;
    }
    c.ultPos = null;
    c.gpsId = navigator.geolocation.watchPosition(
      cop_alPosicion, cop_gpsError,
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 }
    );
  } catch (e) { cop_avisarSinGPS(); }
}

function cop_pararGPS() {
  const c = estado.cop; if (!c) return;
  try { if (c.gpsId && navigator.geolocation) navigator.geolocation.clearWatch(c.gpsId); } catch (e) {}
  c.gpsId = 0; c.ultPos = null;
}

function cop_alPosicion(pos) {
  const c = estado.cop;
  if (!c || !c.sensoresOn || !pos || !pos.coords) return;
  try {
    const co = pos.coords;
    const ahora = (typeof pos.timestamp === 'number') ? pos.timestamp : Date.now();

    // Velocidad: preferimos coords.speed (m/s). Si no la da, la derivamos.
    let kmh = null;
    if (co.speed != null && !isNaN(co.speed) && co.speed >= 0) {
      kmh = co.speed * 3.6;
    }

    if (c.ultPos) {
      const d = cop_haversine(c.ultPos.lat, c.ultPos.lon, co.latitude, co.longitude); // metros
      const dt = (ahora - c.ultPos.ts) / 1000; // segundos
      if (kmh == null && dt > 0 && d >= COP_DIST_MIN_M && d <= COP_DIST_MAX_M) {
        kmh = (d / dt) * 3.6;
      }
      // Distancia del trayecto (filtrando saltos absurdos del GPS).
      if (d >= COP_DIST_MIN_M && d <= COP_DIST_MAX_M && c.viaje) {
        c.viaje.distancia += d;
      }
    }

    if (kmh != null) {
      kmh = nuc_clamp(kmh, 0, COP_VEL_MAX_KMH);
      c.velActual = kmh;
      if (kmh > c.velMax) c.velMax = kmh;
      if (c.viaje && kmh > c.viaje.vMax) c.viaje.vMax = kmh;
      // ▶ Auto-iniciar trayecto al superar el umbral (si el dueño lo quiere)
      if (estado.cfg.copAutoTrayecto && !c.viaje && kmh > COP_AUTO_KMH) {
        cop_iniciarViaje();
        cop_anotarEvento('auto_inicio', 'Trayecto iniciado automáticamente (' + Math.round(kmh) + ' km/h)');
      }
    }

    // 🗺 Ruta del trayecto (para el GPX): un punto cada ≥20 m
    if (c.viaje) {
      if (!c.viaje.ruta) c.viaje.ruta = [];
      const ult = c.viaje.ruta[c.viaje.ruta.length - 1];
      const lejos = !ult || cop_haversine(ult.lat, ult.lon, co.latitude, co.longitude) >= COP_RUTA_MIN_M;
      if (lejos && c.viaje.ruta.length < COP_RUTA_MAX_PTS) {
        c.viaje.ruta.push({ lat: co.latitude, lon: co.longitude, ts: ahora });
      }
      // 😴 Fatiga: a las 2 h de trayecto, y recordatorio cada 30 min
      if (estado.cfg.copFatiga) {
        const conduciendo = ahora - c.viaje.inicio;
        if (conduciendo >= COP_FATIGA_MS &&
            ahora - (c.ultFatiga || 0) >= COP_FATIGA_REPETIR_MS) {
          c.ultFatiga = ahora;
          const horas = Math.round(conduciendo / 360000) / 10;
          const texto = 'Llevas ' + horas + ' h de trayecto: para y descansa un poco.';
          if (typeof alerta_disparar === 'function') {
            try { alerta_disparar('fatiga', 'info', texto); } catch (e) {}
          }
          cop_anotarEvento('fatiga', texto);
        }
      }
    }

    c.ultPos = { lat: co.latitude, lon: co.longitude, ts: ahora };
    cop_render(false);
  } catch (e) { /* una posición mala se ignora */ }
}

function cop_gpsError(err) {
  // Permiso denegado o sin señal: aviso honesto una sola vez, sin bloquear.
  cop_avisarSinGPS(err && err.code === 1);
}

function cop_avisarSinGPS(denegado) {
  const c = estado.cop; if (!c || c.gpsErrAvisado) return;
  c.gpsErrAvisado = true;
  cop_toast(denegado
    ? 'Permiso de ubicación denegado: no se mostrará la velocidad (GPS).'
    : 'Sin señal de GPS: la velocidad no está disponible ahora mismo.', 'info');
}

/* Distancia entre dos coordenadas (fórmula del haversine), en metros. */
function cop_haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000; // radio terrestre (m)
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ============================================================================
 * AVISO DE COLISIÓN FRONTAL — vehículo delante, grande y centrado, cuya caja
 * CRECE rápido entre inferencias (se nos acerca). Corre una vez por 'frame'.
 * Es una AYUDA, no un radar: por eso se acompaña siempre del aviso honesto.
 * ==========================================================================*/
function cop_analizarColision() {
  const c = estado.cop;
  if (!c || !estado.cfg.copActivo || !estado.cfg.copColisionAviso) return;
  if (estado.cfg.copParkingOn) return;              // aparcado: no aplica
  if (!estado.video || !estado.video.listo) return;

  const w = estado.video.w || 0, h = estado.video.h || 0;
  if (w <= 0 || h <= 0) return;
  const areaFrame = w * h;

  const tracks = estado.tracks || [];
  const vistos = {};
  let alarma = false;

  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i];
    if (!t || !t.caja) continue;
    if (t.clase !== 'car' && t.clase !== 'truck' && t.clase !== 'bus' && t.clase !== 'motorcycle') continue;

    const area = t.caja.an * t.caja.al;
    const cx = (t.cx != null) ? t.cx : (t.caja.x + t.caja.an / 2);
    const centrado = Math.abs(cx - w / 2) < w * COP_COL_CENTRO_REL;
    const grande = area > areaFrame * COP_COL_AREA_MIN;

    const prev = c.veh[t.id];
    let crecidas = 0;
    if (prev && prev.area > 0) {
      crecidas = (area > prev.area * COP_COL_CRECE) ? (prev.crecidas + 1) : 0;
    }
    c.veh[t.id] = { area: area, crecidas: crecidas };
    vistos[t.id] = true;

    if (grande && centrado && crecidas >= COP_COL_FRAMES) alarma = true;
  }

  // Limpia vehículos que ya no se ven (evita fugas de memoria).
  for (const id in c.veh) {
    if (Object.prototype.hasOwnProperty.call(c.veh, id) && !vistos[id]) delete c.veh[id];
  }

  if (alarma) {
    const ahora = Date.now();
    c.colisionHasta = ahora + COP_COLISION_MOSTRAR_MS;
    c.colisionTexto = '⚠ FRENA';
    if (ahora - c.ultColision >= COP_COOLDOWN_COLISION_MS) {
      c.ultColision = ahora;
      cop_pitar();
      const texto = 'Posible colisión: vehículo delante acercándose';
      if (typeof alerta_disparar === 'function') {
        try { alerta_disparar('colision_frontal', 'critico', texto); } catch (e) {}
      }
      cop_anotarEvento('colision_frontal', texto);
    }
  }

  cop_analizarPeaton(tracks, w, areaFrame);
  cop_analizarStop(tracks, areaFrame);
  cop_analizarDistancia(tracks, w, areaFrame);
}

/* 🚶 PEATÓN delante: persona grande, centrada y acercándose → "FRENA · PEATÓN". */
function cop_analizarPeaton(tracks, w, areaFrame) {
  const c = estado.cop;
  if (!estado.cfg.copPeaton) return;
  const vistos = {};
  let alarma = false;
  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i];
    if (!t || !t.caja || t.clase !== 'person') continue;
    const area = t.caja.an * t.caja.al;
    const cx = (t.cx != null) ? t.cx : (t.caja.x + t.caja.an / 2);
    const centrado = Math.abs(cx - w / 2) < w * COP_PEATON_CENTRO_REL;
    const grande = area > areaFrame * COP_PEATON_AREA_MIN;
    const prev = c.peat[t.id];
    let crecidas = 0;
    if (prev && prev.area > 0) crecidas = (area > prev.area * COP_COL_CRECE) ? (prev.crecidas + 1) : 0;
    c.peat[t.id] = { area: area, crecidas: crecidas };
    vistos[t.id] = true;
    if (grande && centrado && crecidas >= COP_PEATON_FRAMES) alarma = true;
  }
  for (const id in c.peat) {
    if (Object.prototype.hasOwnProperty.call(c.peat, id) && !vistos[id]) delete c.peat[id];
  }
  if (alarma) {
    const ahora = Date.now();
    c.colisionHasta = ahora + COP_COLISION_MOSTRAR_MS;
    c.colisionTexto = '⚠ PEATÓN';
    if (ahora - c.ultColision >= COP_COOLDOWN_COLISION_MS) {
      c.ultColision = ahora;
      cop_pitar();
      const texto = 'PEATÓN delante acercándose — frena';
      if (typeof alerta_disparar === 'function') {
        try { alerta_disparar('peaton_delante', 'critico', texto); } catch (e) {}
      }
      cop_anotarEvento('peaton_delante', texto);
    }
  }
}

/* 🚗💨 Velocidad ESTIMADA del coche de delante (orientativa, NO radar).
 * Método honesto: se estima la distancia por el ancho aparente del coche
 * (ancho real ~1.8 m + FOV del móvil), se mide cómo cambia esa distancia en
 * ~1 s (velocidad de acercamiento) y se combina con TU velocidad GPS:
 *     velocidad_del_otro ≈ tu_velocidad − velocidad_de_acercamiento
 * La distancia estimada tiene bastante error (±30-40%), así que el número es
 * ORIENTATIVO. Lo válido de verdad para denunciar es tu vídeo con hora + tu GPS.
 * Guarda el resultado en estado.cop.velDelante = { kmh, ts, dist }. */
function cop_estimarVelDelante() {
  const c = estado.cop;
  if (!c || !estado.cfg.copActivo || !estado.cfg.copVelOtros) { if (c) c.velDelante = null; return; }
  if (!estado.video || !estado.video.listo) { c.velDelante = null; return; }
  const w = estado.video.w || 0, h = estado.video.h || 0;
  if (w <= 0) { c.velDelante = null; return; }
  const ahora = Date.now();

  // Coche de delante = vehículo centrado más grande.
  const tracks = estado.tracks || [];
  let mejor = null, mejorArea = 0;
  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i];
    if (!t || !t.caja) continue;
    if (t.clase !== 'car' && t.clase !== 'truck' && t.clase !== 'bus') continue;
    const cx = (t.cx != null) ? t.cx : (t.caja.x + t.caja.an / 2);
    if (Math.abs(cx - w / 2) > w * COP_COL_CENTRO_REL) continue;   // solo el de mi carril
    const area = t.caja.an * t.caja.al;
    if (area > mejorArea) { mejorArea = area; mejor = t; }
  }
  if (!mejor || mejor.caja.an < w * COP_VEL_ANCHO_MIN_REL) {        // ninguno, o muy lejos
    c.velDelante = null; c.velHist = null; return;
  }

  // Distancia estimada (m) por el ancho aparente. focalPx ≈ FOV_FACTOR·anchoFrame.
  const focalPx = COP_VEL_FOV_FACTOR * w;
  const dist = (COP_VEL_ANCHO_COCHE_M * focalPx) / mejor.caja.an;

  // Historial de distancia del MISMO coche (si cambia de id, se reinicia).
  if (!c.velHist || c.velHist.id !== mejor.id) c.velHist = { id: mejor.id, pts: [] };
  const pts = c.velHist.pts;
  pts.push({ d: dist, ts: ahora });
  while (pts.length > 1 && ahora - pts[0].ts > COP_VEL_VENTANA_MS) pts.shift();

  const span = ahora - pts[0].ts;
  if (pts.length < 2 || span < COP_VEL_MIN_SPAN_MS) { return; }     // aún midiendo

  // Velocidad de acercamiento (m/s): + = se acerca, − = se aleja.
  const acercM_s = (pts[0].d - dist) / (span / 1000);
  const tuKmh = c.velActual || 0;
  const otroKmh = nuc_clamp(tuKmh - acercM_s * 3.6, 0, COP_VEL_MAX_KMH);
  c.velDelante = { kmh: otroKmh, ts: ahora, dist: dist,
                   rel: acercM_s > 0.5 ? 'acerca' : (acercM_s < -0.5 ? 'aleja' : 'igual') };
}

/* 🛑 Señal de STOP delante (el detector ya reconoce 'stop sign'). */
function cop_analizarStop(tracks, areaFrame) {
  const c = estado.cop;
  if (!estado.cfg.copStopAviso) return;
  const ahora = Date.now();
  if (ahora - c.ultStop < COP_STOP_COOLDOWN_MS) return;
  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i];
    if (!t || !t.caja || t.clase !== 'stop sign') continue;
    if (t.caja.an * t.caja.al > areaFrame * COP_STOP_AREA_MIN) {
      c.ultStop = ahora;
      const texto = 'Señal de STOP delante';
      if (typeof alerta_disparar === 'function') {
        try { alerta_disparar('stop_delante', 'sospecha', texto); } catch (e) {}
      }
      cop_anotarEvento('stop', texto);
      return;
    }
  }
}

/* ↔ Distancia de seguridad: vehículo delante MUY grande sostenido ≥3 s yendo
 * a más de 30 km/h → "vas muy pegado" (orientativo, por tamaño de caja). */
function cop_analizarDistancia(tracks, w, areaFrame) {
  const c = estado.cop;
  if (!estado.cfg.copDistSeg) { c.distDesde = 0; return; }
  if ((c.velActual || 0) < COP_DIST_VEL_MIN) { c.distDesde = 0; return; }
  const ahora = Date.now();
  let pegado = false;
  for (let i = 0; i < tracks.length && !pegado; i++) {
    const t = tracks[i];
    if (!t || !t.caja) continue;
    if (t.clase !== 'car' && t.clase !== 'truck' && t.clase !== 'bus') continue;
    const cx = (t.cx != null) ? t.cx : (t.caja.x + t.caja.an / 2);
    if (Math.abs(cx - w / 2) > w * COP_COL_CENTRO_REL) continue;
    if (t.caja.an * t.caja.al > areaFrame * COP_DIST_AREA) pegado = true;
  }
  if (pegado) {
    if (!c.distDesde) c.distDesde = ahora;
    else if (ahora - c.distDesde >= COP_DIST_MS && ahora - c.ultDistSeg >= COP_DIST_COOLDOWN_MS) {
      c.ultDistSeg = ahora; c.distDesde = 0;
      const texto = 'Vas muy pegado al vehículo de delante (orientativo)';
      if (typeof alerta_disparar === 'function') {
        try { alerta_disparar('muy_pegado', 'sospecha', texto); } catch (e) {}
      }
      cop_anotarEvento('muy_pegado', texto);
    }
  } else {
    c.distDesde = 0;
  }
}

/* ============================================================================
 * HUD (pintor de orden 70). Esquinas tipo salpicadero sobre el compuesto.
 * Guarda-clauses: sin ctx, sin copiloto activo o sin vídeo → no pinta.
 * ==========================================================================*/
function cop_pintarHUD(ctx) {
  if (!ctx || !estado.cop || !estado.cfg.copActivo) return;
  if (!estado.video || !estado.video.listo) return;
  const w = estado.video.w || 0, h = estado.video.h || 0;
  if (w <= 0 || h <= 0) return;

  try {
    ctx.save();
    ctx.textBaseline = 'alphabetic';

    // --- Velocidad (arriba izquierda) ------------------------------------
    const kmh = Math.round(estado.cop.velActual || 0);
    cop_panel(ctx, 10, 10, 150, 58);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.font = "bold 34px 'SFMono-Regular',ui-monospace,Consolas,monospace";
    ctx.fillText(String(kmh), 20, 46);
    ctx.fillStyle = '#7d8fa0';
    ctx.font = "12px 'SFMono-Regular',ui-monospace,Consolas,monospace";
    ctx.fillText('km/h ~aprox.', 74, 46);

    // --- Fuerza G (arriba derecha) ---------------------------------------
    const g = estado.cop.gActual || 0;
    const umbral = nuc_clamp(estado.cfg.copSensibilidadG || 2.2, 1.5, 4);
    let colG = '#2ee584';
    if (g >= umbral) colG = '#ff4155';
    else if (g >= umbral * 0.6) colG = '#ffb224';
    cop_panel(ctx, w - 160, 10, 150, 58);
    ctx.textAlign = 'right';
    ctx.fillStyle = colG;
    ctx.font = "bold 30px 'SFMono-Regular',ui-monospace,Consolas,monospace";
    ctx.fillText(g.toFixed(1) + ' g', w - 20, 42);
    ctx.fillStyle = '#7d8fa0';
    ctx.font = "11px 'SFMono-Regular',ui-monospace,Consolas,monospace";
    ctx.fillText('máx ' + (estado.cop.gMax || 0).toFixed(1) + ' g', w - 20, 58);

    // --- Hora (centro superior) ------------------------------------------
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,.5)';
    const hora = nuc_horaCorta(Date.now());
    ctx.font = "13px 'SFMono-Regular',ui-monospace,Consolas,monospace";
    const anchoH = ctx.measureText(hora).width + 14;
    ctx.fillRect(w / 2 - anchoH / 2, 10, anchoH, 22);
    ctx.fillStyle = '#cfdae4';
    ctx.fillText(hora, w / 2, 26);

    // --- Indicador de caja negra grabando --------------------------------
    if (estado.video.grabando) {
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,.55)';
      ctx.font = "bold 13px 'SFMono-Regular',ui-monospace,Consolas,monospace";
      const t = '● CAJA NEGRA';
      const aw = ctx.measureText(t).width + 16;
      ctx.fillRect(w / 2 - aw / 2, 36, aw, 22);
      ctx.fillStyle = '#ff4155';
      ctx.fillText(t, w / 2, 52);
    }

    // --- Velocidad ESTIMADA del coche de delante (centro superior, bajo hora) --
    const vd = estado.cop.velDelante;
    if (estado.cfg.copVelOtros && vd && Date.now() - vd.ts < COP_VEL_VIGENCIA_MS) {
      ctx.textAlign = 'center';
      const flecha = vd.rel === 'acerca' ? '↓' : (vd.rel === 'aleja' ? '↑' : '·');
      const txt = 'Coche delante ~' + Math.round(vd.kmh) + ' km/h ' + flecha;
      ctx.font = "bold 15px 'SFMono-Regular',ui-monospace,Consolas,monospace";
      const aw = ctx.measureText(txt).width + 18;
      const yTop = estado.video.grabando ? 62 : 36;
      ctx.fillStyle = 'rgba(0,0,0,.55)';
      cop_rectRedondo(ctx, w / 2 - aw / 2, yTop, aw, 24, 8); ctx.fill();
      ctx.fillStyle = '#7dd3fc';
      ctx.fillText(txt, w / 2, yTop + 17);
      ctx.fillStyle = '#7d8fa0';
      ctx.font = "10px 'SFMono-Regular',ui-monospace,Consolas,monospace";
      ctx.fillText('estimado · no válido como radar', w / 2, yTop + 36);
    }

    // --- Aviso de colisión frontal ("⚠ FRENA") ---------------------------
    if (Date.now() < (estado.cop.colisionHasta || 0)) {
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,65,85,.85)';
      const bw = Math.min(w * 0.8, 420), bh = 80;
      cop_rectRedondo(ctx, w / 2 - bw / 2, h / 2 - bh / 2, bw, bh, 14);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = "bold 46px 'SFMono-Regular',ui-monospace,Consolas,monospace";
      ctx.fillText(estado.cop.colisionTexto || '⚠ FRENA', w / 2, h / 2 + 14);
    }

    ctx.restore();
  } catch (e) { /* un fallo de pintado no rompe el compuesto */ }
}

/* Panelito de fondo semitransparente con esquinas redondeadas. */
function cop_panel(ctx, x, y, an, al) {
  ctx.fillStyle = 'rgba(0,0,0,.55)';
  cop_rectRedondo(ctx, x, y, an, al, 10);
  ctx.fill();
}

function cop_rectRedondo(ctx, x, y, an, al, r) {
  const rr = Math.min(r, an / 2, al / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + an, y, x + an, y + al, rr);
  ctx.arcTo(x + an, y + al, x, y + al, rr);
  ctx.arcTo(x, y + al, x, y, rr);
  ctx.arcTo(x, y, x + an, y, rr);
  ctx.closePath();
}

/* ============================================================================
 * BITÁCORA DE TRAYECTOS
 * ==========================================================================*/
function cop_iniciarViaje() {
  if (!estado.cop) return;
  if (estado.cop.viaje) { cop_toast('Ya hay un trayecto en marcha.', 'info'); return; }
  estado.cop.viaje = { inicio: Date.now(), fin: 0, distancia: 0, vMax: 0, gMax: 0, eventos: [] };
  estado.cop.velMax = 0; estado.cop.gMax = 0;
  cop_actualizarBotonesViaje();
  cop_render(true);
  cop_toast('Trayecto iniciado. Conduce con atención; el copiloto es solo una ayuda.', 'info');
}

function cop_terminarViaje() {
  const c = estado.cop;
  if (!c || !c.viaje) { cop_toast('No hay ningún trayecto en marcha.', 'info'); return; }
  c.viaje.fin = Date.now();
  cop_persistirViaje(c.viaje);
  const km = (c.viaje.distancia / 1000).toFixed(2);
  c.viaje = null;
  cop_actualizarBotonesViaje();
  cop_render(true);
  cop_toast('Trayecto terminado (' + km + ' km). Guardado en la bitácora.', 'info');
}

/* Guarda el trayecto en localStorage (vía núcleo) con rotación de máx 50. */
function cop_persistirViaje(viaje) {
  try {
    let viajes = nuc_cargar('copiloto_viajes', []);
    if (!Array.isArray(viajes)) viajes = [];
    // Ruta simplificada (máx COP_RUTA_GUARDAR_PTS puntos) para el GPX
    let ruta = viaje.ruta || [];
    if (ruta.length > COP_RUTA_GUARDAR_PTS) {
      const paso = Math.ceil(ruta.length / COP_RUTA_GUARDAR_PTS);
      const compacta = [];
      for (let i = 0; i < ruta.length; i += paso) compacta.push(ruta[i]);
      compacta.push(ruta[ruta.length - 1]);
      ruta = compacta;
    }
    viajes.push({
      inicio: viaje.inicio, fin: viaje.fin,
      distancia: Math.round(viaje.distancia),
      vMax: Math.round(viaje.vMax), gMax: Math.round(viaje.gMax * 10) / 10,
      eventos: (viaje.eventos || []).slice(0, 200),
      ruta: ruta,
    });
    while (viajes.length > COP_VIAJES_MAX) viajes.shift();
    nuc_guardar('copiloto_viajes', viajes);
  } catch (e) { /* si no cabe, el núcleo ya avisa por almacen:aviso */ }
}

/* Anota un evento en el trayecto en curso (si lo hay). */
function cop_anotarEvento(tipo, texto) {
  const c = estado.cop;
  if (!c || !c.viaje) return;
  try {
    c.viaje.eventos.push({ ts: Date.now(), tipo: tipo, texto: texto });
    if (c.viaje.eventos.length > 200) c.viaje.eventos.shift();
  } catch (e) {}
}

function cop_actualizarBotonesViaje() {
  const activo = !!(estado.cop && estado.cop.viaje);
  const bIni = document.getElementById('cop-btnIniciar');
  const bFin = document.getElementById('cop-btnTerminar');
  if (bIni) bIni.disabled = activo;
  if (bFin) bFin.disabled = !activo;
}

/* Exporta la bitácora (trayectos guardados + el actual) como HTML descargable. */
function cop_exportarBitacora() {
  try {
    let viajes = nuc_cargar('copiloto_viajes', []);
    if (!Array.isArray(viajes)) viajes = [];
    const lista = viajes.slice();
    if (estado.cop && estado.cop.viaje) {
      const v = estado.cop.viaje;
      lista.push({ inicio: v.inicio, fin: 0, distancia: Math.round(v.distancia), vMax: Math.round(v.vMax), gMax: Math.round(v.gMax * 10) / 10, eventos: v.eventos, actual: true });
    }
    if (!lista.length) { cop_toast('Aún no hay trayectos que exportar.', 'info'); return; }

    const html = cop_bitacoraHTML(lista);
    const nombre = 'bitacora-copiloto_' + cop_fechaArchivo(Date.now()) + '.html';
    if (typeof nuc_descargar === 'function') nuc_descargar(nombre, html, 'text/html');
    cop_toast('Bitácora exportada (' + lista.length + ' trayectos).', 'info');
  } catch (e) {
    cop_toast('No se pudo exportar la bitácora.', 'sospecha');
  }
}

/* 🗺 Exporta la ruta del último trayecto (o el actual) como GPX estándar. */
function cop_exportarGPX() {
  try {
    let viajes = nuc_cargar('copiloto_viajes', []);
    if (!Array.isArray(viajes)) viajes = [];
    let viaje = null;
    if (estado.cop && estado.cop.viaje && (estado.cop.viaje.ruta || []).length >= 2) {
      viaje = estado.cop.viaje;               // el trayecto en curso
    } else {
      for (let i = viajes.length - 1; i >= 0 && !viaje; i--) {
        if ((viajes[i].ruta || []).length >= 2) viaje = viajes[i];
      }
    }
    if (!viaje) { cop_toast('Aún no hay ruta GPS que exportar (inicia un trayecto y muévete).', 'info'); return; }
    const gpx = cop_gpxDe(viaje);
    const nombre = 'ruta-copiloto_' + cop_fechaArchivo(viaje.inicio) + '.gpx';
    if (typeof nuc_descargar === 'function') nuc_descargar(nombre, gpx, 'application/gpx+xml');
    cop_toast('Ruta GPX exportada (' + (viaje.ruta || []).length + ' puntos). Ábrela en Google Earth o una app de rutas.', 'info');
  } catch (e) {
    cop_toast('No se pudo exportar la ruta.', 'sospecha');
  }
}

/* GPX 1.1 mínimo y válido a partir de un viaje con ruta [{lat,lon,ts}]. */
function cop_gpxDe(viaje) {
  const pts = (viaje.ruta || []).map((p) =>
    '      <trkpt lat="' + Number(p.lat).toFixed(6) + '" lon="' + Number(p.lon).toFixed(6) + '">' +
    '<time>' + new Date(p.ts || viaje.inicio).toISOString() + '</time></trkpt>'
  ).join('\n');
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<gpx version="1.1" creator="Vigía IA" xmlns="http://www.topografix.com/GPX/1/1">\n' +
    '  <trk>\n' +
    '    <name>Trayecto ' + cop_esc(nuc_fechaHora(viaje.inicio)) + '</name>\n' +
    '    <trkseg>\n' + pts + '\n    </trkseg>\n' +
    '  </trk>\n' +
    '</gpx>\n';
}

/* Construye el HTML de la bitácora (autocontenido, sin dependencias). */
function cop_bitacoraHTML(lista) {
  const marca = (typeof CONFIG !== 'undefined') ? CONFIG : { NOMBRE_APP: 'Vigía IA', STUDIO_BRAND: '', STUDIO_AUTHOR: '' };
  let filas = '';
  for (let i = lista.length - 1; i >= 0; i--) {
    const v = lista[i];
    const km = ((v.distancia || 0) / 1000).toFixed(2);
    const dur = cop_duracion(v.inicio, v.fin);
    let eventos = '';
    (v.eventos || []).forEach(function (ev) {
      eventos += '<li><b>' + cop_esc(nuc_fechaHora(ev.ts)) + '</b> — ' + cop_esc(ev.texto || ev.tipo || '') + '</li>';
    });
    if (!eventos) eventos = '<li class="vacio">Sin incidencias registradas.</li>';
    filas += '<article>' +
      '<h2>' + cop_esc(nuc_fechaHora(v.inicio)) + (v.actual ? ' <span class="chip">en curso</span>' : '') + '</h2>' +
      '<p class="datos">Distancia: <b>' + km + ' km</b> · Duración: <b>' + cop_esc(dur) + '</b> · ' +
      'Vel. máx: <b>~' + (v.vMax || 0) + ' km/h</b> · Fuerza G máx: <b>' + (v.gMax || 0).toFixed(1) + ' g</b></p>' +
      '<ul>' + eventos + '</ul>' +
      '</article>';
  }
  const firma = (marca.STUDIO_BRAND ? ('Diseñado por ' + cop_esc(marca.STUDIO_BRAND) + ' · por ' + cop_esc(marca.STUDIO_AUTHOR || '')) : '');
  return '<!doctype html><html lang="es"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>Bitácora de conducción — ' + cop_esc(marca.NOMBRE_APP || 'Vigía IA') + '</title>' +
    '<style>body{font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;background:#0b0f14;color:#cfdae4;margin:0;padding:24px;}' +
    'h1{color:#3fa9ff;font-size:1.4rem;} article{background:#131a22;border:1px solid #233140;border-radius:10px;padding:14px 16px;margin:14px 0;}' +
    'h2{font-size:1.05rem;margin:0 0 6px;} .datos{color:#7d8fa0;font-size:.9rem;margin:0 0 8px;} ' +
    'ul{margin:0;padding-left:18px;} li{margin:3px 0;font-size:.9rem;} .vacio{color:#7d8fa0;list-style:none;margin-left:-18px;} ' +
    '.chip{background:#2ee584;color:#0b0f14;font-size:.7rem;padding:1px 6px;border-radius:6px;vertical-align:middle;} ' +
    'footer{color:#7d8fa0;font-size:.8rem;margin-top:24px;} .aviso{color:#ffb224;font-size:.82rem;}</style></head><body>' +
    '<h1>Bitácora de conducción — ' + cop_esc(marca.NOMBRE_APP || 'Vigía IA') + '</h1>' +
    '<p class="aviso">Velocidades orientativas (~aprox., GPS del móvil). No válidas como medición legal. ' +
    'Los avisos de colisión son una ayuda y no sustituyen la atención al volante.</p>' +
    filas +
    '<footer>Generado el ' + cop_esc(nuc_fechaHora(Date.now())) + '. ' + firma + '</footer>' +
    '</body></html>';
}

/* ============================================================================
 * RENDER DEL PANEL (tarjetas de velocidad / fuerza G / distancia). Throttle.
 * ==========================================================================*/
function cop_render(forzar) {
  const c = estado.cop; if (!c) return;
  const ahora = Date.now();
  if (!forzar && ahora - (c._ultRender || 0) < 250) return;
  c._ultRender = ahora;

  const elV = document.getElementById('cop-velocidad');
  if (elV) elV.textContent = Math.round(c.velActual || 0) + ' km/h';
  const elG = document.getElementById('cop-fuerzaG');
  if (elG) elG.textContent = (c.gActual || 0).toFixed(1) + ' g';
  const elD = document.getElementById('cop-distancia');
  if (elD) elD.textContent = cop_fmtDist(c.viaje ? c.viaje.distancia : 0);
}

function cop_pintarSensibilidad() {
  const out = document.getElementById('cop-sensibilidadVal');
  if (out) out.textContent = (estado.cfg.copSensibilidadG || 2.2).toFixed(1) + ' g';
}

/* ============================================================================
 * AUXILIARES
 * ==========================================================================*/
function cop_fmtDist(m) {
  m = m || 0;
  return (m < 1000) ? (Math.round(m) + ' m') : ((m / 1000).toFixed(2) + ' km');
}

function cop_duracion(ini, fin) {
  if (!ini) return '—';
  const f = fin || Date.now();
  let s = Math.max(0, Math.round((f - ini) / 1000));
  const hh = Math.floor(s / 3600); s -= hh * 3600;
  const mm = Math.floor(s / 60); s -= mm * 60;
  const p = function (n) { return (n < 10 ? '0' : '') + n; };
  return (hh ? (hh + 'h ') : '') + p(mm) + 'm ' + p(s) + 's';
}

function cop_fechaArchivo(ts) {
  const d = new Date(ts || Date.now());
  const p = function (n) { return (n < 10 ? '0' : '') + n; };
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '_' + p(d.getHours()) + p(d.getMinutes());
}

function cop_esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* Aviso al usuario sin romper nada (usa ui_toast si está disponible). */
function cop_toast(msg, nivel) {
  if (typeof ui_toast === 'function') { try { ui_toast(msg, nivel || 'info'); } catch (e) {} }
}

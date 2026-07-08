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
    // Colisión frontal
    colisionHasta: 0, veh: {},
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
  const sens = document.getElementById('cop-sensibilidad');
  if (sens) sens.value = String(estado.cfg.copSensibilidadG || 2.2);
  cop_pintarSensibilidad();
  cop_actualizarBotonesViaje();
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

  if (activo) cop_arrancarSensores();
  else cop_pararSensores();

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
    if (ahora - c.ultColision >= COP_COOLDOWN_COLISION_MS) {
      c.ultColision = ahora;
      const texto = 'Posible colisión: vehículo delante acercándose';
      if (typeof alerta_disparar === 'function') {
        try { alerta_disparar('colision_frontal', 'critico', texto); } catch (e) {}
      }
      cop_anotarEvento('colision_frontal', texto);
    }
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

    // --- Aviso de colisión frontal ("⚠ FRENA") ---------------------------
    if (Date.now() < (estado.cop.colisionHasta || 0)) {
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,65,85,.85)';
      const bw = Math.min(w * 0.8, 420), bh = 80;
      cop_rectRedondo(ctx, w / 2 - bw / 2, h / 2 - bh / 2, bw, bh, 14);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = "bold 46px 'SFMono-Regular',ui-monospace,Consolas,monospace";
      ctx.fillText('⚠ FRENA', w / 2, h / 2 + 14);
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
    viajes.push({
      inicio: viaje.inicio, fin: viaje.fin,
      distancia: Math.round(viaje.distancia),
      vMax: Math.round(viaje.vMax), gMax: Math.round(viaje.gMax * 10) / 10,
      eventos: (viaje.eventos || []).slice(0, 200),
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

/* ============================================================================
 * 08-CARRETERA — VIGÍA IA · modo carretera/parking: conteo por tipo, conteo
 * direccional, plazas libres y velocidad orientativa (con calibración manual).
 * Prefijo: car_ / CAR_. Estado interno en estado.car. Español, sin console.error.
 * ==========================================================================*/

/* --- Constantes del módulo --------------------------------------------------*/
const CAR_VEL_MIN_KMH = 2;                 // no se pinta velocidad por debajo de esto
const CAR_COOLDOWN_DETENIDO_MS = 120000;   // 120s por track para 'car:detenido'
const CAR_DESPLAZAMIENTO_REL = 0.02;       // <2% del ancho de frame = "quieto"
const CAR_HISTORIAL_VENTANA_MS = 2000;     // ventana de ~2s para medir desplazamiento
const CAR_CLAVE_CALIBRACION = 'calibracion';
const CAR_RENDER_THROTTLE_MS = 2000;
const CAR_MONO = "12px 'SFMono-Regular',ui-monospace,'Cascadia Mono',Consolas,monospace";

/* --- Refs de DOM cacheadas y varios de módulo (no son parte de estado.car
 * porque no es "estado de negocio": son punteros al panel y a un listener) --*/
let car_refs = {};
let car_calibManejador = null;
let car_ultimoRender = 0;

/* ----------------------------------------------------------------------------
 * car_init() — arranque del módulo: estado, refs del panel, suscripciones.
 * ------------------------------------------------------------------------- */
function car_init() {
  estado.car = {
    pxPorMetro: nuc_cargar(CAR_CLAVE_CALIBRACION, null),
    calibrando: false,
    puntos: [],
    detenidos: {},
    // DECISIÓN: el contrato deja elegir entre leer stats_datosHoy().direccional
    // (que 07-stats no define en su forma de datos) o llevar un contador propio
    // en vivo. Elegimos llevar contador propio (no persistido: se reinicia al
    // recargar la página, es solo "en vivo de esta sesión"), porque es el dato
    // que sí tenemos garantizado vía el evento 'linea:cruce' y coincide con la
    // forma de estado.car que pide este contrato.
    dir: { AB: 0, BA: 0 },
  };

  car_refs = {
    coches: document.getElementById('car-coches'),
    camiones: document.getElementById('car-camiones'),
    buses: document.getElementById('car-buses'),
    motos: document.getElementById('car-motos'),
    bicis: document.getElementById('car-bicis'),
    peatones: document.getElementById('car-peatones'),
    dirAB: document.getElementById('car-dirAB'),
    dirBA: document.getElementById('car-dirBA'),
    plazas: document.getElementById('car-plazas'),
    calibEstado: document.getElementById('car-calibEstado'),
    calibBtn: document.getElementById('car-calibBtn'),
  };

  car_actualizarEstadoCalib();

  if (car_refs.calibBtn) {
    car_refs.calibBtn.addEventListener('click', () => {
      if (estado.car.calibrando) car_calibrarCancelar();
      else car_calibrarIniciar();
    });
  }

  bus.on('plaza:cambio', (datos) => {
    if (!datos || typeof datos !== 'object') return;
    car_pintarPlazas(datos.libres, datos.total);
  });

  bus.on('linea:cruce', (datos) => {
    try {
      if (!estado.car || !datos || !datos.track) return;
      if (NUC_VEHICULOS.indexOf(datos.track.clase) === -1) return;
      if (datos.sentido === 'AB') estado.car.dir.AB++;
      else if (datos.sentido === 'BA') estado.car.dir.BA++;
    } catch (e) { console.warn('[carretera] fallo procesando cruce de línea:', e && e.message); }
  });

  // La visibilidad del panel (modo super/carretera) la gestiona el módulo UI;
  // aquí solo refrescamos los datos por si el modo o cualquier otro ajuste cambió.
  bus.on('cfg:cambio', () => { car_render(); });

  bus.on('track:perdido', (datos) => {
    if (estado.car && estado.car.detenidos && datos && datos.track) {
      delete estado.car.detenidos[datos.track.id];
    }
  });

  // 📸 Radar: interruptor + umbral (el panel no está en Ajustes → cableado a mano).
  const chkRadar = document.getElementById('car-radarGuardar');
  if (chkRadar) {
    chkRadar.checked = !!estado.cfg.carRadarGuardar;
    chkRadar.addEventListener('change', function () {
      estado.cfg.carRadarGuardar = chkRadar.checked;
      nuc_guardar('cfg', estado.cfg);
      if (typeof ui_toast === 'function') {
        ui_toast(chkRadar.checked
          ? '📸 Radar activo (escala automática, sin calibrar): deja el móvil FIJO y guardará foto + km/h de cada coche que pase.'
          : 'Radar desactivado.', 'info');
      }
    });
  }
  // 📵 Guardián de móvil quieto: el acelerómetro congela el radar 1,5 s tras
  // cada movimiento del teléfono (mover la cámara hacía que los coches PARADOS
  // dieran velocidad y foto falsas). Pasivo y barato; sin sensor, no molesta.
  try {
    if (typeof window !== 'undefined' && 'ondevicemotion' in window) {
      window.addEventListener('devicemotion', function (ev) {
        try {
          const a = ev.acceleration;   // sin gravedad
          if (!a) return;
          const mag = Math.sqrt((a.x || 0) * (a.x || 0) + (a.y || 0) * (a.y || 0) + (a.z || 0) * (a.z || 0));
          if (mag > 1.2 && estado.car) estado.car.movilHasta = Date.now() + 1500;
        } catch (e) {}
      }, { passive: true });
    }
  } catch (e) {}

  // 📸 Ver la galería desde el propio panel Parking (antes solo estaba en
  // Copiloto: el radar guardaba y el dueño no tenía DÓNDE verlo → "no pasa nada").
  const btnRadarVer = document.getElementById('car-radarVer');
  if (btnRadarVer) btnRadarVer.addEventListener('click', function () {
    if (typeof mat_mostrarLista === 'function') mat_mostrarLista();
  });

  const inRadarMin = document.getElementById('car-radarVelMin');
  if (inRadarMin) {
    inRadarMin.value = String(estado.cfg.carRadarVelMin || 0);
    inRadarMin.addEventListener('change', function () {
      const v = parseInt(inRadarMin.value, 10);
      estado.cfg.carRadarVelMin = (isNaN(v) || v < 0) ? 0 : Math.min(250, v);
      inRadarMin.value = String(estado.cfg.carRadarVelMin);
      nuc_guardar('cfg', estado.cfg);
    });
  }

  bus.on('frame', () => { car_render(); car_radarBarrido(); });

  if (typeof vid_registrarPintor === 'function') vid_registrarPintor('car', car_pintar, 50);

  car_render();
}

/* Refresca el texto de estado de calibración según estado.car.pxPorMetro. */
function car_actualizarEstadoCalib() {
  if (!car_refs.calibEstado || !estado.car) return;
  car_refs.calibEstado.textContent = estado.car.pxPorMetro
    ? 'Calibrado: ' + Math.round(estado.car.pxPorMetro) + ' px/m'
    : 'Sin calibrar';
}

/* ----------------------------------------------------------------------------
 * car_evaluar(tracks, ts) — SOLO se llama desde el bucle en modo carretera.
 * Detecta vehículos parados dentro de una zona 'detencion'.
 * ------------------------------------------------------------------------- */
function car_evaluar(tracks, ts) {
  if (!estado.car || !Array.isArray(tracks) || !tracks.length) return;
  if (typeof zona_puntoEnPoligono !== 'function') return;
  if (!Array.isArray(estado.zonas) || !estado.zonas.length) return;

  const w = (estado.video && estado.video.w) || 640;
  const h = (estado.video && estado.video.h) || 480;
  const umbralDesplazamiento = w * CAR_DESPLAZAMIENTO_REL;
  const ahora = ts || Date.now();

  const zonasDetencion = estado.zonas.filter(
    (z) => z && z.tipo === 'detencion' && Array.isArray(z.puntos) && z.puntos.length >= 3
  );
  if (!zonasDetencion.length) return;

  tracks.forEach((track) => {
    try {
      if (!track || NUC_VEHICULOS.indexOf(track.clase) === -1) return;

      let zonaEncontrada = null;
      for (let i = 0; i < zonasDetencion.length; i++) {
        const z = zonasDetencion[i];
        const puntosPx = z.puntos.map((p) => ({ x: p.x * w, y: p.y * h }));
        if (zona_puntoEnPoligono(track.cx, track.cy, puntosPx)) { zonaEncontrada = z; break; }
      }

      if (!zonaEncontrada) {
        if (estado.car.detenidos[track.id]) delete estado.car.detenidos[track.id];
        return;
      }

      // Desplazamiento total en los últimos ~2s del historial del track.
      const hist = Array.isArray(track.historial) ? track.historial : [];
      const recientes = hist.filter((p) => p && (ahora - p.ts) <= CAR_HISTORIAL_VENTANA_MS);
      let desplazamiento = 0;
      if (recientes.length >= 2) {
        const primero = recientes[0], ultimo = recientes[recientes.length - 1];
        desplazamiento = nuc_dist(primero.cx, primero.cy, ultimo.cx, ultimo.cy);
      }

      if (desplazamiento >= umbralDesplazamiento) {
        if (estado.car.detenidos[track.id]) delete estado.car.detenidos[track.id];
        return;
      }

      let reg = estado.car.detenidos[track.id];
      if (!reg) {
        estado.car.detenidos[track.id] = { desdeTs: ahora, zonaId: zonaEncontrada.id, avisadoEn: 0 };
        return;
      }

      const segQuieto = (ahora - reg.desdeTs) / 1000;
      const umbralSeg = (estado.cfg && estado.cfg.detencionSeg) || 60;
      const cooldownOk = !reg.avisadoEn || (ahora - reg.avisadoEn) >= CAR_COOLDOWN_DETENIDO_MS;

      if (segQuieto >= umbralSeg && cooldownOk) {
        reg.avisadoEn = ahora;
        bus.emit('car:detenido', { track, zona: zonaEncontrada, seg: Math.round(segQuieto) });
      }
    } catch (e) { console.warn('[carretera] fallo evaluando vehículo detenido:', e && e.message); }
  });
}

/* ----------------------------------------------------------------------------
 * car_calibrarIniciar() — pide 2 taps sobre el vídeo + metros reales.
 * ------------------------------------------------------------------------- */
function car_calibrarIniciar() {
  if (!estado.car) return;
  if (!estado.video || !estado.video.listo) {
    bus.emit('error:general', { msg: 'Activa una fuente de vídeo antes de calibrar' });
    return;
  }
  const canvas = document.getElementById('vid-canvas');
  if (!canvas) {
    bus.emit('error:general', { msg: 'Activa una fuente de vídeo antes de calibrar' });
    return;
  }

  estado.car.calibrando = true;
  estado.car.puntos = [];
  if (car_refs.calibBtn) car_refs.calibBtn.textContent = '✕ Cancelar calibración';
  if (car_refs.calibEstado) car_refs.calibEstado.textContent = 'Calibrando: toca 2 puntos en el vídeo…';

  const manejador = (ev) => {
    try {
      if (!estado.car || !estado.car.calibrando) return;
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const escalaX = canvas.width / rect.width;
      const escalaY = canvas.height / rect.height;
      const px = (ev.clientX - rect.left) * escalaX;
      const py = (ev.clientY - rect.top) * escalaY;
      estado.car.puntos.push({ x: px, y: py });

      if (estado.car.puntos.length >= 2) {
        canvas.removeEventListener('pointerdown', manejador);
        car_calibManejador = null;
        car_calibrarPedirMetros(estado.car.puntos.slice(0, 2));
      }
    } catch (e) { console.warn('[carretera] fallo capturando punto de calibración:', e && e.message); }
  };

  car_calibManejador = manejador;
  canvas.addEventListener('pointerdown', manejador);
}

/* Cancela el modo calibración (segundo click en el botón, o error interno). */
function car_calibrarCancelar() {
  if (!estado.car) return;
  estado.car.calibrando = false;
  estado.car.puntos = [];
  const canvas = document.getElementById('vid-canvas');
  if (canvas && car_calibManejador) canvas.removeEventListener('pointerdown', car_calibManejador);
  car_calibManejador = null;
  if (car_refs.calibBtn) car_refs.calibBtn.textContent = '📏 Calibrar velocidad';
  car_actualizarEstadoCalib();
}

/* Con los 2 puntos ya marcados, pide los metros reales y calcula px/metro.
 * NOTA de integración: ui_modal (05-ui.js) recibe botones como {texto, clase, fn};
 * si fn devuelve false el modal no se cierra. Ajustado por el integrador. */
function car_calibrarPedirMetros(puntos) {
  if (!estado.car) return;
  const p1 = puntos[0], p2 = puntos[1];
  const distPx = nuc_dist(p1.x, p1.y, p2.x, p2.y);

  const confirmar = (valor) => {
    const metros = parseFloat(valor);
    if (!metros || metros <= 0 || !isFinite(metros)) {
      car_calibrarCancelar();
      return;
    }
    estado.car.pxPorMetro = distPx / metros;
    nuc_guardar(CAR_CLAVE_CALIBRACION, estado.car.pxPorMetro);
    estado.car.calibrando = false;
    estado.car.puntos = [];
    if (car_refs.calibBtn) car_refs.calibBtn.textContent = '📏 Calibrar velocidad';
    car_actualizarEstadoCalib();
  };

  if (typeof ui_modal === 'function') {
    try {
      const cuerpo = document.createElement('div');
      cuerpo.className = 'campo';
      const etiqueta = document.createElement('label');
      etiqueta.className = 'etiqueta';
      etiqueta.textContent = '¿Cuántos metros reales hay entre los dos puntos?';
      etiqueta.setAttribute('for', 'car-inputMetros');
      const input = document.createElement('input');
      input.type = 'number'; input.min = '0.1'; input.step = '0.1'; input.id = 'car-inputMetros';
      cuerpo.appendChild(etiqueta);
      cuerpo.appendChild(input);

      ui_modal('Calibrar velocidad', cuerpo, [
        { texto: 'Cancelar', clase: 'btn-fantasma', fn: () => { car_calibrarCancelar(); } },
        { texto: 'Guardar', clase: 'btn-primario', fn: () => { confirmar(input.value); } },
      ]);
    } catch (e) {
      console.warn('[carretera] fallo abriendo el modal de calibración:', e && e.message);
      car_calibrarCancelar();
    }
  } else {
    // Sin módulo UI disponible (p.ej. verificación de este módulo en aislado):
    // no se puede pedir el dato, se cancela con aviso honesto.
    bus.emit('error:general', { msg: 'No se pudo abrir el diálogo de calibración' });
    car_calibrarCancelar();
  }
}

/* ----------------------------------------------------------------------------
 * car_velocidadKmh(track) → nº redondeado o null si no hay calibración.
 * ------------------------------------------------------------------------- */
/* ============================================================================
 * 📸 RADAR DE PARKING — cámara FIJA + calibrada: por cada coche que pasa guarda
 * una FOTO con su velocidad sellada (y su matrícula si se lee). Reutiliza la
 * galería de matrículas. Se enciende en el panel Parking → "Guardar foto+vel".
 * Requiere estar CALIBRADO (sin px/metro no hay km/h que sellar).
 * ==========================================================================*/
function car_radarBarrido() {
  try {
    if (!estado.cfg.carRadarGuardar) return;
    if (estado.cfg.modo !== 'carretera') return;
    if (!estado.car) return;
    // 📵 MÓVIL EN MOVIMIENTO: si la cámara se mueve, TODO "se mueve" en la
    // imagen y los coches parados dan velocidad falsa. El acelerómetro congela
    // el radar 1,5 s tras cada meneo (ver listener en car_init).
    const ts = Date.now();
    if (estado.car.movilHasta && ts < estado.car.movilHasta) return;
    if (typeof mat_recorteZona !== 'function' || typeof mat_fotoGuardar !== 'function') return;
    const tracks = estado.tracks || [];
    if (!estado.car.radarUlt) estado.car.radarUlt = {};
    for (let i = 0; i < tracks.length; i++) {
      const t = tracks[i];
      if (!t || !t.caja || NUC_VEHICULOS.indexOf(t.clase) === -1) continue;
      const kmh = car_velocidadKmh(t);
      if (kmh == null || kmh <= CAR_VEL_MIN_KMH) continue;
      // Mínimo efectivo de 8 km/h: el temblor del recuadro en coches PARADOS da
      // 2-6 km/h falsos; ningún coche "pasando" va a menos de 8.
      if (kmh < Math.max(8, estado.cfg.carRadarVelMin || 0)) continue;
      // 🎯 Medida MADURA: al menos 4 muestras de velocidad (mediana estable).
      // Sin esto, la primera lectura (la más ruidosa) mandaba en la foto.
      const medQ = estado.car.medidas && estado.car.medidas[t.id];
      if (!medQ || medQ.ks.length < 4) continue;
      // Una foto por coche; se REEMPLAZA si luego pasa MÁS rápido (queda su pico).
      const prev = estado.car.radarUlt[t.id];
      if (prev && kmh <= prev.kmh) continue;
      if (prev && (ts - prev.ts) < 700) continue;                // no re-disparar en ráfaga
      estado.car.radarUlt[t.id] = { ts: ts, kmh: kmh, fotoId: prev ? prev.fotoId : null };
      car_radarCapturar(t, kmh, ts, estado.car.radarUlt[t.id]);
    }
    for (const id in estado.car.radarUlt) {
      if (ts - (estado.car.radarUlt[id].ts || 0) > 30000) {
        delete estado.car.radarUlt[id];
        if (estado.car.medidas) delete estado.car.medidas[id];
      }
    }
  } catch (e) { /* el radar nunca rompe el frame */ }
}

/* Recorta el coche entero, sella "~XX km/h" abajo, lo guarda en la galería con
 * su velocidad y lo manda al lector de matrículas para que la anote si la lee. */
function car_radarCapturar(track, kmh, ts, reg) {
  const c = track.caja;
  const m = 0.08;
  const cnv = mat_recorteZona(c.x - c.an * m, c.y - c.al * m, c.an * (1 + 2 * m), c.al * (1 + 2 * m));
  if (!cnv) return;
  try {
    const ctx = cnv.getContext('2d');
    const bh = Math.max(22, Math.round(cnv.height * 0.16));
    ctx.fillStyle = 'rgba(255,178,36,.93)';
    ctx.fillRect(0, cnv.height - bh, cnv.width, bh);
    ctx.fillStyle = '#111';
    ctx.font = 'bold ' + Math.round(bh * 0.66) + "px system-ui,-apple-system,sans-serif";
    ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    ctx.fillText('~' + kmh + ' km/h', cnv.width / 2, cnv.height - bh / 2);
  } catch (e) {}
  // Guarda (o reemplaza) la foto con su velocidad.
  const fotoId = mat_fotoGuardar(cnv, ts, { clase: track.clase || 'car', velocidad: kmh, fotoId: reg.fotoId });
  reg.fotoId = fotoId;
  // Aviso VISIBLE al capturar (antes guardaba en silencio y parecía que "no
  // pasaba nada") + contador de capturas de la sesión.
  if (fotoId) {
    estado.car.radarN = (estado.car.radarN || 0) + 1;
    if (typeof ui_toast === 'function' && ts - (estado.car.radarUltToast || 0) > 2500) {
      estado.car.radarUltToast = ts;
      try { ui_toast('📸 Radar: ~' + kmh + ' km/h guardado (' + estado.car.radarN + ' fotos)', 'info'); } catch (e) {}
    }
  }
  // Lectura de matrícula sobre ESE recorte, anotada en la MISMA foto (best-effort).
  if (fotoId && estado.mat && Array.isArray(estado.mat.cola)) {
    estado.mat.cola.push({ cnv: cnv, ts: ts, zona: 'radar', fotoId: fotoId, clase: track.clase || 'car', trackId: track.id });
    while (estado.mat.cola.length > 16) estado.mat.cola.shift();
    try { if (typeof mat_procesarCola === 'function') mat_procesarCola(); } catch (e) {}
  }
}

/* Medidas reales medias por clase (m): largo (visto de LADO) y ancho (de
 * FRENTE/ATRÁS). Con ellas, el PROPIO vehículo da la escala px/metro a SU
 * distancia exacta → sin calibrar y SIN el error de perspectiva (calibrar en
 * un plano y medir coches en otro daba 5-6 km/h donde había 30-40). */
const CAR_LARGO_M = { car: 4.3, truck: 8.5, bus: 11, motorcycle: 2.1, bicycle: 1.8 };
const CAR_ANCHO_M = { car: 1.8, truck: 2.5, bus: 2.55, motorcycle: 0.8, bicycle: 0.6 };

/* Dirección dominante del movimiento del track en su historial (~2 s). */
function car_dirTrack(track) {
  try {
    const h = track.historial;
    if (!Array.isArray(h) || h.length < 2) return null;
    const a = h[0], b = h[h.length - 1];
    return { dx: Math.abs(b.cx - a.cx), dy: Math.abs(b.cy - a.cy) };
  } catch (e) { return null; }
}

/* Memoria de MEDIDAS por track (anchos de caja y velocidades) para promediar:
 * el instante engaña (caja que tiembla, pico de ruido); la MEDIANA no. */
function car_medidas(id) {
  if (!estado.car.medidas) estado.car.medidas = {};
  let m = estado.car.medidas[id];
  if (!m) m = estado.car.medidas[id] = { ws: [], ks: [] };
  return m;
}
function car_mediana(arr) {
  if (!arr || !arr.length) return null;
  const s = arr.slice().sort((a, b) => a - b);
  return s[(s.length - 1) >> 1];
}

function car_velocidadKmh(track) {
  if (!track || !track.caja || typeof trk_velocidad !== 'function') return null;
  try {
    // 🎯 PRECISIÓN 1: si la caja TOCA el borde del encuadre, el coche está
    // entrando/saliendo y su caja sale RECORTADA → escala falsa → velocidad
    // disparatada. No se mide (mejor sin dato que con dato malo).
    const W = (estado.video && estado.video.w) || 640;
    const H = (estado.video && estado.video.h) || 480;
    const c = track.caja, mg = Math.max(3, W * 0.01);
    if (c.x <= mg || c.y <= mg || (c.x + c.an) >= W - mg || (c.y + c.al) >= H - mg) return null;

    const pxS = trk_velocidad(track);
    if (typeof pxS !== 'number' || !isFinite(pxS)) return null;
    let pxPorMetro = null;
    let med = null;
    if (NUC_VEHICULOS.indexOf(track.clase) >= 0 && c.an > 8) {
      // ⚙️ ESCALA AUTOMÁTICA por vehículo: si va de LADO, el ancho de su caja
      // es su LARGO real; de frente/atrás, es su ANCHO real.
      // 🎯 PRECISIÓN 2: la caja tiembla ±10% entre frames → se usa la MEDIANA
      // del ancho de las últimas muestras, no el instante.
      med = car_medidas(track.id);
      med.ws.push(c.an); if (med.ws.length > 12) med.ws.shift();
      const anMed = car_mediana(med.ws);
      const dir = car_dirTrack(track);
      const lateral = !dir || dir.dx >= dir.dy;   // cruza la pantalla → de lado
      const metros = lateral ? (CAR_LARGO_M[track.clase] || 4.3) : (CAR_ANCHO_M[track.clase] || 1.8);
      pxPorMetro = anMed / metros;
    } else if (estado.car && estado.car.pxPorMetro) {
      pxPorMetro = estado.car.pxPorMetro;         // peatones/otros: calibración manual
    }
    if (!pxPorMetro || pxPorMetro <= 0) return null;
    const kmh = (pxS / pxPorMetro) * 3.6;
    if (!isFinite(kmh)) return null;
    // 🎯 PRECISIÓN 3: se devuelve la MEDIANA de las últimas velocidades del
    // track (los picos de un frame son ruido del detector, no aceleraciones).
    const kR = Math.max(0, Math.min(220, kmh));
    if (med) {
      med.ks.push(kR); if (med.ks.length > 12) med.ks.shift();
      return Math.round(car_mediana(med.ks));
    }
    return Math.round(kR);
  } catch (e) {
    console.warn('[carretera] fallo calculando velocidad:', e && e.message);
    return null;
  }
}

/* ----------------------------------------------------------------------------
 * car_pintar(ctx) — pintor registrado en vid_registrarPintor('car', ..., 50).
 * Solo dibuja en modo carretera. Velocidades si hay calibración; puntos de
 * calibración mientras se está calibrando (con o sin calibración previa).
 * ------------------------------------------------------------------------- */
function car_pintar(ctx) {
  if (!ctx || !estado.car) return;
  if (!estado.cfg || estado.cfg.modo !== 'carretera') return;

  try {
    // Velocidades: escala AUTOMÁTICA por vehículo (no exige calibrar). Con el
    // móvil moviéndose no se pintan (serían falsas: "se mueve" todo el encuadre).
    const movilQuieto = !(estado.car.movilHasta && Date.now() < estado.car.movilHasta);
    if (movilQuieto && Array.isArray(estado.tracks) && estado.tracks.length) {
      ctx.save();
      ctx.font = CAR_MONO;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      estado.tracks.forEach((track) => {
        if (!track || NUC_VEHICULOS.indexOf(track.clase) === -1) return;
        const kmh = car_velocidadKmh(track);
        if (kmh === null || kmh < 5) return;   // el temblor de un coche parado da 2-4 falsos
        const texto = '~' + kmh + ' km/h';
        const x = (typeof track.cx === 'number') ? track.cx : (track.caja.x + track.caja.an / 2);
        const yBase = track.caja ? track.caja.y : track.cy;
        const y = yBase - 12;
        const anchoTexto = ctx.measureText(texto).width;
        ctx.fillStyle = 'rgba(11,15,20,0.72)';
        ctx.fillRect(x - anchoTexto / 2 - 4, y - 9, anchoTexto + 8, 18);
        ctx.fillStyle = '#ffb224';
        ctx.fillText(texto, x, y);
      });
      ctx.restore();
    }

    if (estado.car.calibrando) {
      const puntos = Array.isArray(estado.car.puntos) ? estado.car.puntos : [];
      ctx.save();
      // Franja de instrucción GRANDE arriba (para no confundir con «＋ Línea»).
      const W = ctx.canvas.width, H = ctx.canvas.height;
      const bh = Math.max(30, Math.round(H * 0.09));
      ctx.fillStyle = 'rgba(255,178,36,.94)';
      ctx.fillRect(0, 0, W, bh);
      ctx.fillStyle = '#111';
      ctx.font = 'bold ' + Math.round(bh * 0.42) + "px system-ui,-apple-system,sans-serif";
      ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
      const msg = puntos.length === 0 ? '📏 CALIBRAR: toca el PUNTO 1 de una distancia que conozcas'
        : (puntos.length === 1 ? '📏 Ahora toca el PUNTO 2 (te pediré los metros)' : '📏 Escribe los metros…');
      ctx.fillText(msg, W / 2, bh / 2);
      // Puntos y línea.
      ctx.fillStyle = '#ffb224'; ctx.strokeStyle = '#ffb224'; ctx.lineWidth = 3;
      puntos.forEach((p) => { ctx.beginPath(); ctx.arc(p.x, p.y, 8, 0, Math.PI * 2); ctx.fill(); });
      if (puntos.length === 2) {
        ctx.beginPath(); ctx.moveTo(puntos[0].x, puntos[0].y); ctx.lineTo(puntos[1].x, puntos[1].y); ctx.stroke();
      }
      ctx.restore();
    }
  } catch (e) { console.warn('[carretera] fallo pintando overlay:', e && e.message); }
}

/* Actualiza la tarjeta de plazas (texto + clase verde/rojo). */
function car_pintarPlazas(libres, total) {
  if (!car_refs.plazas) return;
  if (typeof libres !== 'number' || typeof total !== 'number' || total <= 0) {
    car_refs.plazas.textContent = '— / — plazas libres';
    car_refs.plazas.classList.remove('car-plazasOk', 'car-plazasLleno');
    return;
  }
  car_refs.plazas.textContent = libres + ' / ' + total + ' plazas libres';
  car_refs.plazas.classList.toggle('car-plazasOk', libres > 0);
  car_refs.plazas.classList.toggle('car-plazasLleno', libres <= 0);
}

/* ----------------------------------------------------------------------------
 * car_render() — repinta el panel (throttle ~2s). Escucha 'frame' (en car_init).
 * ------------------------------------------------------------------------- */
function car_render() {
  const ahora = Date.now();
  if (ahora - car_ultimoRender < CAR_RENDER_THROTTLE_MS) return;
  car_ultimoRender = ahora;

  if (!estado.car || !car_refs.coches) return; // panel no montado todavía

  // 🩺 Estado del radar EN VIVO: cada eslabón de la cadena, para que la propia
  // pantalla diga qué falta (interruptor, calibración, coches seguidos, vel).
  try {
    const el = document.getElementById('car-radarEstado');
    if (el) {
      if (!estado.cfg.carRadarGuardar) {
        el.textContent = 'Radar: APAGADO (marca la casilla de arriba)';
      } else if (estado.car.movilHasta && ahora < estado.car.movilHasta) {
        el.textContent = 'Radar: EN PAUSA — el móvil se está moviendo (déjalo fijo)';
      } else {
        const veh = (estado.tracks || []).filter((t) => t && NUC_VEHICULOS.indexOf(t.clase) >= 0);
        let velMax = 0;
        veh.forEach((t) => { const k = car_velocidadKmh(t); if (k != null && k > velMax) velMax = k; });
        // Estado del LECTOR de placas (tesseract): nunca confirmado en el móvil
        // del dueño (todas sus fotos salían "léela en la foto"). Ahora se ve.
        let lector = '—';
        if (estado.mat) {
          if (estado.mat.worker) lector = '✔';
          else if (estado.mat.ocrFalloAvisado) lector = '✖ no cargó';
          else if (estado.mat.cargando) lector = 'cargando…';
        }
        el.textContent = 'Radar ✔ (escala auto) · coches a la vista: ' + veh.length +
          (velMax ? ' · vel: ~' + velMax + ' km/h' : '') +
          ' · fotos: ' + (estado.car.radarN || 0) +
          ' · lector placas: ' + lector;
      }
    }
  } catch (e) {}

  let vehiculos = {};
  let peatones = 0;
  if (typeof stats_datosHoy === 'function') {
    try {
      const datos = stats_datosHoy();
      if (datos && typeof datos === 'object') {
        vehiculos = (datos.vehiculos && typeof datos.vehiculos === 'object') ? datos.vehiculos : {};
        // 07-stats no garantiza un campo "peatones" explícito en su contrato;
        // si lo trae, lo usamos, si no, caemos a "visitantes" (personas que
        // cruzan la línea de conteo, que en modo carretera son peatones).
        if (typeof datos.peatones === 'number') peatones = datos.peatones;
        else if (typeof datos.visitantes === 'number') peatones = datos.visitantes;
      }
    } catch (e) { console.warn('[carretera] fallo leyendo estadísticas del día:', e && e.message); }
  }

  car_refs.coches.textContent = vehiculos.car || 0;
  if (car_refs.camiones) car_refs.camiones.textContent = vehiculos.truck || 0;
  if (car_refs.buses) car_refs.buses.textContent = vehiculos.bus || 0;
  if (car_refs.motos) car_refs.motos.textContent = vehiculos.motorcycle || 0;
  if (car_refs.bicis) car_refs.bicis.textContent = vehiculos.bicycle || 0;
  if (car_refs.peatones) car_refs.peatones.textContent = peatones;

  if (car_refs.dirAB) car_refs.dirAB.textContent = estado.car.dir.AB;
  if (car_refs.dirBA) car_refs.dirBA.textContent = estado.car.dir.BA;

  if (typeof zona_plazas === 'function') {
    try {
      const p = zona_plazas();
      if (p && typeof p === 'object') car_pintarPlazas(p.libres, p.total);
    } catch (e) { console.warn('[carretera] fallo leyendo plazas:', e && e.message); }
  }
}

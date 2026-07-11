/* ============================================================================
 * 19-CASA — VIGÍA IA · MODO CASA PREMIUM. Prefijo: casa_ / CASA_.
 * Estado interno en estado.casa. Se activa como CAPA sobre el modo super
 * (reutiliza personas/bolsas/vehículos/caídas ya detectados); NO es un modo
 * exclusivo. NO reescribe nada: se comunica por el bus y las funciones
 * públicas existentes (alerta_disparar, vid_grabarEvento, vid_capturaJPEG,
 * zona_*, cfg_pinPedir, el log como bitácora).
 *
 * QUÉ APORTA:
 *   1. Estados de alarma (DESARMADO / EN CASA / TOTAL / NOCHE) con PIN, retardo
 *      de salida y de entrada, y armado automático por horario.
 *   2. Roles de zona (Puerta, Entrada de vehículos, Piscina, Perímetro) con
 *      lógica propia sobre los eventos de zona que ya existen.
 *   3. Paquetería: aviso de paquete entregado / retirado por otro.
 *   4. Disuasión activa: sirena, linterna/estrobo y voz.
 *   5. Supervisión del sistema: corte de corriente (Battery API) + salud.
 *   6. Máscaras de privacidad (zonas de exclusión: negro antes de analizar y
 *      grabar) — limita el ALCANCE de captación (obligación legal), no difumina
 *      la evidencia.
 *   7. Vida diaria: línea de tiempo del día, modo vacaciones (resumen diario),
 *      filtro de mascotas (ya existe) y detección de caídas en interior.
 *
 * HONESTIDAD (obligatoria): sin reconocimiento facial de familiares; sin visión
 * nocturna real (el móvil no lleva infrarrojos). Es una capa extra que JAMÁS
 * sustituye la supervisión de menores en la piscina.
 *
 * SEGURIDAD: todas las funciones aguantan sin vídeo, sin modelos, sin sensores
 * y sin red (guarda-clauses + try/catch). El verificador headless pulsa todos
 * los botones con la app recién abierta: nada debe lanzar excepción.
 * ==========================================================================*/

/* --- Constantes ------------------------------------------------------------*/
const CASA_ESTADOS = ['desarmado', 'encasa', 'total', 'noche'];
const CASA_ESTADO_ES = { desarmado: 'Desarmado', encasa: 'Armado en casa', total: 'Armado total', noche: 'Modo noche' };
const CASA_ROLES = ['puerta', 'entrada_veh', 'piscina', 'perimetro'];
const CASA_ROL_ES = { puerta: 'Puerta principal', entrada_veh: 'Entrada de vehículos', piscina: 'Piscina', perimetro: 'Perímetro / jardín' };
const CASA_VISITAS_MAX = 60;            // registro de visitas del día (rotación)
const CASA_TIMELINE_MAX = 120;          // miniaturas de la línea de tiempo
const CASA_BEEP_MS = 1000;              // cadencia de la cuenta atrás sonora
const CASA_PAQUETE_QUIETO_MS = 8000;    // una caja/bolsa quieta ≥8 s junto a la puerta = posible entrega
const CASA_PAQUETE_MOVER_REL = 0.06;    // desplazamiento < 6% del ancho = "quieta"
const CASA_ESTROBO_MS = 6000;           // duración del estrobo/linterna disuasoria
const CASA_COOLDOWN_ROL_MS = 20000;     // anti-spam por (rol + zona + track)
const CASA_BATERIA_AVISOS = [50, 20];   // % en los que avisa además del corte

/* ============================================================================
 * ARRANQUE (idempotente): estado, botón de header, controles del panel,
 * pintor de máscara de exclusión (negro) y del panel de salud, suscripciones.
 * NO enciende sensores caros (Battery API se pide solo si casaActivo).
 * ==========================================================================*/
function casa_init() {
  if (estado.casa && estado.casa.inited) return;

  estado.casa = {
    inited: false,
    roles: nuc_cargar('casa_roles', {}),     // { zonaId: 'puerta'|'entrada_veh'|... }
    visitas: nuc_cargar('casa_visitas_' + nuc_diaClave(), []),  // [{ts, foto, texto}]
    timeline: [],                            // [{ts, foto, texto, nivel}] (en memoria)
    // Máquina de estados de alarma
    retardoSalidaHasta: 0,                   // ts fin de la cuenta atrás de salida
    retardoEntradaHasta: 0,                  // ts límite para desarmar al entrar
    entrandoDesde: 0,                        // ts en que empezó el retardo de entrada
    ultBeep: 0,
    // Roles / paquetería
    rolCooldown: {},                         // clave (rol|zona|track) -> ts
    puertaDwell: {},                         // trackId -> {zonaId, desde} (merodeo en puerta)
    cajas: {},                               // trackId de bolsa -> {x,y,desde,zonaId,avisada}
    // Disuasión
    estroboHasta: 0, estroboOn: false,
    // Batería / salud
    bateria: null, bateriaCargando: true, bateriaNivel: 1, bateriaAvisados: {},
    inactivoDesde: 0,                        // "vigilancia inactiva desde HH:MM"
    // Vacaciones
    ultResumen: nuc_cargar('casa_resumen_dia', ''),
    diaVisitas: nuc_diaClave(),
    _ultRender: 0,
  };

  // Marca de cierre inesperado: si la sesión anterior no cerró limpio, avisa.
  const marca = nuc_cargar('casa_vigilando_desde', 0);
  if (marca) estado.casa.inactivoDesde = marca;
  nuc_borrar('casa_vigilando_desde');

  // Botón del header (solo si el nodo existe).
  const btn = document.getElementById('ui-btnCasa');
  if (btn) btn.addEventListener('click', function () { casa_alternar(); });

  casa_cablearControles();
  casa_sincronizarControles();

  // Pintores sobre el compuesto: exclusión (negro, orden 5 — ANTES que zonas,
  // así también entra en los clips grabados) y HUD de estado (orden 75).
  if (typeof vid_registrarPintor === 'function') {
    vid_registrarPintor('casa_exclusion', casa_pintarExclusion, 5);
    vid_registrarPintor('casa_hud', casa_pintarHUD, 75);
  }

  // Eventos que ya emiten otros módulos: aplicamos la lógica de casa encima.
  if (typeof bus !== 'undefined' && bus.on) {
    bus.on('zona:entrada', casa_alEntrarZona);
    bus.on('zona:merodeo', casa_alMerodeo);
    bus.on('gesto:caida', casa_alCaida);
    bus.on('frame', casa_alFrame);
    bus.on('cfg:cambio', casa_alCambioCfg);
  }

  // Si quedó activo de una sesión anterior, re-engancha lo que consume recursos.
  if (estado.cfg.casaActivo) casa_aplicar(true);

  estado.casa.inited = true;
}

/* --- Toast/log seguros -----------------------------------------------------*/
function casa_toast(msg, nivel) {
  if (typeof ui_toast === 'function') { try { ui_toast(msg, nivel || 'info'); return; } catch (e) {} }
  console.warn('[casa] ' + msg);
}

/* ============================================================================
 * ACTIVAR / DESACTIVAR la capa Casa (botón del header o ajustes).
 * ==========================================================================*/
function casa_alternar(forzar) {
  const destino = (typeof forzar === 'boolean') ? forzar : !estado.cfg.casaActivo;
  estado.cfg.casaActivo = destino;
  nuc_guardar('cfg', estado.cfg);
  casa_aplicar(destino);
  casa_sincronizarControles();
  casa_toast(destino ? '🏠 Modo Casa activado' : 'Modo Casa desactivado', 'info');
  if (typeof bus !== 'undefined') bus.emit('cfg:cambio', { clave: 'casaActivo' });
}

/* Enciende/apaga lo que consume recursos según el estado de la capa. */
function casa_aplicar(activo) {
  const panel = document.getElementById('casa-panel');
  if (panel) panel.classList.toggle('oculto', !activo);
  const btn = document.getElementById('ui-btnCasa');
  if (btn) btn.classList.toggle('activo', !!activo);

  if (activo) {
    // Marca de "estoy vigilando" para detectar cierres inesparados la próxima vez.
    nuc_guardar('casa_vigilando_desde', Date.now());
    if (estado.cfg.casaBateria) casa_vigilarBateria();
  } else {
    nuc_borrar('casa_vigilando_desde');
    casa_estroboParar();
  }
}

/* ============================================================================
 * 1) ESTADOS DE ALARMA (con PIN, retardos y armado automático)
 * ==========================================================================*/

/* Cambia de estado. Armar pide PIN (reutiliza cfg_pinPedir). Al armar TOTAL/
 * NOCHE/EN CASA arranca el retardo de salida con cuenta atrás sonora.
 * Desarmar también pide PIN (para que un intruso no lo apague). */
function casa_cambiarEstado(destino) {
  if (CASA_ESTADOS.indexOf(destino) < 0) return;
  const c = estado.casa; if (!c) return;

  const aplicar = function () {
    estado.cfg.casaEstado = destino;
    nuc_guardar('cfg', estado.cfg);
    c.retardoEntradaHasta = 0; c.entrandoDesde = 0;
    if (destino === 'desarmado') {
      c.retardoSalidaHasta = 0;
      casa_estroboParar();
      casa_toast('Alarma desarmada', 'info');
    } else {
      // Retardo de salida (para que salgas sin autodispararte).
      const seg = nuc_clamp(estado.cfg.casaRetardoSalida || 60, 0, 300);
      c.retardoSalidaHasta = seg > 0 ? Date.now() + seg * 1000 : 0;
      casa_toast('🔒 ' + CASA_ESTADO_ES[destino] + (seg > 0 ? ' — tienes ' + seg + ' s para salir' : ''), 'info');
    }
    casa_sincronizarControles();
    if (typeof bus !== 'undefined') bus.emit('casa:estado', { estado: destino });
  };

  // Pedir PIN salvo que no haya sistema de PIN disponible.
  if (typeof cfg_pinPedir === 'function') {
    cfg_pinPedir('casa').then(function (ok) { if (ok) aplicar(); }).catch(function () {});
  } else {
    aplicar();
  }
}

/* ¿La zona (por su rol) está vigilada en el estado actual?
 * - EN CASA: solo el perímetro exterior (jardín, entrada, puerta). Dentro se vive.
 * - TOTAL: todo.
 * - NOCHE: perímetro + zonas dentro de la franja horaria.
 * - DESARMADO: nada. */
function casa_zonaVigilada(rol, ts) {
  const e = estado.cfg.casaEstado;
  if (e === 'desarmado') return false;
  if (e === 'total') return true;
  const exterior = (rol === 'perimetro' || rol === 'puerta' || rol === 'entrada_veh' || rol === 'piscina');
  if (e === 'encasa') return exterior;
  if (e === 'noche') {
    if (exterior) return true;
    return nuc_esEnFranja(ts || Date.now(), estado.cfg.casaNocheIni || '23:00', estado.cfg.casaNocheFin || '07:00');
  }
  return false;
}

/* Cuenta atrás sonora de salida y de entrada + armado automático por horario.
 * Se llama en cada 'frame' (barato: solo mira relojes). */
function casa_alFrame(d) {
  const c = estado.casa; if (!c || !estado.cfg.casaActivo) return;
  const ahora = (d && d.ts) || Date.now();

  // Cuenta atrás de salida: pitido cada segundo hasta armarse del todo.
  if (c.retardoSalidaHasta && ahora < c.retardoSalidaHasta) {
    if (ahora - c.ultBeep >= CASA_BEEP_MS) { c.ultBeep = ahora; casa_beep(660, 0.08); }
  } else if (c.retardoSalidaHasta && ahora >= c.retardoSalidaHasta) {
    c.retardoSalidaHasta = 0; casa_beep(880, 0.18);
    casa_toast('🔒 Alarma armada del todo', 'info');
  }

  // Cuenta atrás de entrada: pitidos crecientes; si vence, salta la alarma.
  if (c.retardoEntradaHasta) {
    if (ahora >= c.retardoEntradaHasta) {
      c.retardoEntradaHasta = 0; c.entrandoDesde = 0;
      casa_disparar('intrusion', 'Entrada sin desarmar a tiempo — revisar', null);
    } else if (ahora - c.ultBeep >= 600) {
      c.ultBeep = ahora; casa_beep(990, 0.09);
    }
  }

  // Armado automático por horario (una comprobación por minuto es suficiente).
  casa_autoArmar(ahora);

  // Resumen diario de vacaciones.
  casa_resumenVacaciones(ahora);

  // Rollover del registro de visitas a medianoche.
  const dia = nuc_diaClave(ahora);
  if (c.diaVisitas !== dia) { c.diaVisitas = dia; c.visitas = []; }
}

let casa_ultAutoCheck = 0;
function casa_autoArmar(ahora) {
  if (!estado.cfg.casaAutoArmar) return;
  if (ahora - casa_ultAutoCheck < 30000) return;   // como mucho cada 30 s
  casa_ultAutoCheck = ahora;
  const d = new Date(ahora);
  const hhmm = nuc_pad2(d.getHours()) + ':' + nuc_pad2(d.getMinutes());
  const est = estado.cfg.casaEstado;
  if (hhmm === (estado.cfg.casaAutoArmarHora || '23:00') && est === 'desarmado') {
    const destino = estado.cfg.casaAutoArmarEstado || 'total';
    estado.cfg.casaEstado = destino; nuc_guardar('cfg', estado.cfg);
    casa_sincronizarControles();
    casa_toast('⏰ Armado automático: ' + CASA_ESTADO_ES[destino], 'info');
  }
  if (hhmm === (estado.cfg.casaAutoDesarmarHora || '07:00') && est !== 'desarmado') {
    estado.cfg.casaEstado = 'desarmado'; nuc_guardar('cfg', estado.cfg);
    casa_sincronizarControles();
    casa_toast('⏰ Desarmado automático', 'info');
  }
}

/* ============================================================================
 * 2) ROLES DE ZONA — lógica propia sobre los eventos de zona existentes.
 * ==========================================================================*/
function casa_rolDe(zonaId) { return (estado.casa && estado.casa.roles && estado.casa.roles[zonaId]) || null; }

function casa_cooldownRol(clave, ms) {
  const c = estado.casa; if (!c) return false;
  const ahora = Date.now();
  if (c.rolCooldown[clave] && ahora - c.rolCooldown[clave] < (ms || CASA_COOLDOWN_ROL_MS)) return true;
  c.rolCooldown[clave] = ahora;
  return false;
}

/* Persona/vehículo entra en una zona con rol de casa. */
function casa_alEntrarZona(ev) {
  if (!estado.cfg.casaActivo || !ev || !ev.zona) return;
  const rol = casa_rolDe(ev.zona.id); if (!rol) return;
  const track = ev.track || {};
  const clave = rol + '|' + ev.zona.id + '|' + (track.id || '?');

  if (rol === 'puerta') {
    // Timbre visual/sonoro + snapshot al registro de visitas (siempre, armado o no).
    if (!casa_cooldownRol(clave)) {
      casa_beep(880, 0.12); casa_beep(660, 0.12, 140);
      casa_registrarVisita('Alguien en la puerta principal');
      casa_disparar('visita', 'Timbre: persona en la puerta principal', track, casa_zonaVigilada(rol) ? 'sospecha' : 'info');
    }
    // Empieza a contar merodeo (permanece sin entrar).
    if (track.id != null) estado.casa.puertaDwell[track.id] = { zonaId: ev.zona.id, desde: Date.now() };
  } else if (rol === 'entrada_veh') {
    const esVeh = track.clase && NUC_VEHICULOS.indexOf(track.clase) >= 0;
    if (esVeh && !casa_cooldownRol(clave)) {
      casa_disparar('vehiculo', 'Vehículo entrando en la parcela', track, casa_zonaVigilada(rol) ? 'sospecha' : 'info');
    }
  } else if (rol === 'perimetro') {
    if (casa_zonaVigilada(rol) && !casa_cooldownRol(clave)) {
      casa_disparar('perimetro', 'Presencia en el perímetro', track, 'sospecha');
    }
  }
  // La piscina se evalúa por permanencia en casa_alFrame (necesita "solo/acompañado").
}

function casa_alMerodeo(ev) {
  if (!estado.cfg.casaActivo || !ev || !ev.zona) return;
  const rol = casa_rolDe(ev.zona.id); if (!rol) return;
  if (rol === 'perimetro' || rol === 'puerta') {
    const clave = 'merodeo|' + ev.zona.id + '|' + ((ev.track && ev.track.id) || '?');
    if (!casa_cooldownRol(clave, 60000)) {
      casa_disparar('merodeo', 'Merodeo en ' + (CASA_ROL_ES[rol] || 'zona'), ev.track, 'sospecha');
    }
  }
}

/* PISCINA: una persona en la zona piscina SIN otra persona presente durante
 * más de casaPiscinaSeg → alerta CRÍTICA. Capa extra: NO sustituye la
 * supervisión de menores (se avisa en la pantalla legal del módulo). */
function casa_evaluarPiscina(tracks, ts) {
  const c = estado.casa; if (!c || !estado.cfg.casaActivo) return;
  const zonasPiscina = (estado.zonas || []).filter(function (z) { return casa_rolDe(z.id) === 'piscina' && z.puntos && z.puntos.length >= 3; });
  if (!zonasPiscina.length) return;
  const w = estado.video.w || 640, h = estado.video.h || 480;
  const personas = (tracks || []).filter(function (t) { return t && NUC_PERSONA.indexOf(t.clase) >= 0; });
  const totalPersonas = personas.length;

  zonasPiscina.forEach(function (z) {
    const poli = z.puntos.map(function (p) { return { x: p.x * w, y: p.y * h }; });
    const dentro = personas.filter(function (t) {
      return typeof zona_puntoEnPoligono === 'function' && zona_puntoEnPoligono(t.pieX || t.cx, t.pieY || t.cy, poli);
    });
    c.piscina = c.piscina || {};
    const est = c.piscina[z.id] || { desde: 0, avisada: false };
    // "Solo": hay al menos una persona en la piscina y NO hay más personas fuera vigilando.
    const solo = dentro.length >= 1 && totalPersonas <= dentro.length;
    if (solo) {
      if (!est.desde) est.desde = ts;
      const seg = (ts - est.desde) / 1000;
      if (seg >= (estado.cfg.casaPiscinaSeg || 10) && !est.avisada) {
        est.avisada = true;
        casa_disparar('piscina', 'Persona sola en la piscina — vigila (capa extra, no sustituye la supervisión de menores)', dentro[0], 'critico');
      }
    } else {
      est.desde = 0; est.avisada = false;
    }
    c.piscina[z.id] = est;
  });
}

/* ============================================================================
 * 3) PAQUETERÍA — entrega y retirada por otro (sobre tracks de bolsas/cajas).
 * ==========================================================================*/
function casa_evaluarPaqueteria(tracks, ts) {
  const c = estado.casa; if (!c || !estado.cfg.casaActivo || !estado.cfg.casaPaqueteria) return;
  const zonasPuerta = (estado.zonas || []).filter(function (z) { return casa_rolDe(z.id) === 'puerta' && z.puntos && z.puntos.length >= 3; });
  if (!zonasPuerta.length) return;   // la paquetería se ancla a la zona Puerta
  const w = estado.video.w || 640, h = estado.video.h || 480;
  const polis = zonasPuerta.map(function (z) { return z.puntos.map(function (p) { return { x: p.x * w, y: p.y * h }; }); });
  const enPuerta = function (x, y) { for (let i = 0; i < polis.length; i++) if (zona_puntoEnPoligono(x, y, polis[i])) return true; return false; };

  const bolsas = (tracks || []).filter(function (t) { return t && NUC_BOLSAS.indexOf(t.clase) >= 0; });
  const personas = (tracks || []).filter(function (t) { return t && NUC_PERSONA.indexOf(t.clase) >= 0; });
  const vistos = {};

  bolsas.forEach(function (b) {
    if (b.id == null) return;
    vistos[b.id] = true;
    const cx = b.cx, cy = b.cy;
    if (!enPuerta(cx, cy)) { delete c.cajas[b.id]; return; }
    const reg = c.cajas[b.id] || { x: cx, y: cy, desde: ts, avisada: false, dueno: null };
    const movRel = nuc_dist(cx, cy, reg.x, cy) / w;
    if (movRel < CASA_PAQUETE_MOVER_REL) {
      // quieta: mantenemos ancla
    } else { reg.x = cx; reg.y = cy; reg.desde = ts; }
    // ¿quién está más cerca? (para saber si "se la lleva otro")
    let cerca = null, dm = 1e9;
    personas.forEach(function (p) { const dd = nuc_dist(cx, cy, p.cx, p.cy); if (dd < dm) { dm = dd; cerca = p; } });
    reg.cercaId = cerca ? cerca.id : null;
    // Entrega: quieta ≥ X s y la persona que la dejó ya no está pegada.
    if (!reg.avisada && ts - reg.desde >= CASA_PAQUETE_QUIETO_MS && dm > 0.18 * w) {
      reg.avisada = true; reg.dueno = reg.cercaId;
      casa_disparar('paquete', 'Posible paquete entregado en la puerta', b, 'info');
      casa_registrarVisita('Posible paquete entregado');
    }
    c.cajas[b.id] = reg;
  });

  // Retirada: una caja avisada que desaparece mientras un track DISTINTO está cerca.
  Object.keys(c.cajas).forEach(function (id) {
    const reg = c.cajas[id];
    if (vistos[id]) return;                 // sigue ahí
    if (reg.avisada && reg.cercaId != null && reg.cercaId !== reg.dueno) {
      casa_disparar('paquete_robo', 'Un paquete de la puerta ha desaparecido — revisar', null, 'sospecha');
    }
    delete c.cajas[id];
  });
}

/* ============================================================================
 * 4) DISUASIÓN ACTIVA — sirena (Web Audio), linterna/estrobo y voz.
 * Se dispara SOLO en alerta crítica estando armado, según ajustes.
 * ==========================================================================*/
let casa_audioCtx = null;
function casa_ctx() {
  try {
    if (!casa_audioCtx) casa_audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (casa_audioCtx.state === 'suspended') casa_audioCtx.resume().catch(function () {});
    return casa_audioCtx;
  } catch (e) { return null; }
}
function casa_beep(freq, vol, retraso) {
  const ctx = casa_ctx(); if (!ctx) return;
  try {
    const t0 = ctx.currentTime + (retraso ? retraso / 1000 : 0);
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = 'square'; osc.frequency.value = freq || 660;
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol || 0.1, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
    osc.connect(g); g.connect(ctx.destination); osc.start(t0); osc.stop(t0 + 0.2);
  } catch (e) {}
}
/* Sirena real: dos tonos alternos, potente, ~4 s. */
function casa_sirena() {
  const ctx = casa_ctx(); if (!ctx) return;
  try {
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = 'sawtooth';
    const t0 = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.9, t0 + 0.05);
    // Barrido de sirena: sube y baja repetidamente.
    for (let i = 0; i < 8; i++) {
      osc.frequency.setValueAtTime(700, t0 + i * 0.5);
      osc.frequency.linearRampToValueAtTime(1500, t0 + i * 0.5 + 0.25);
      osc.frequency.linearRampToValueAtTime(700, t0 + i * 0.5 + 0.5);
    }
    g.gain.setValueAtTime(0.9, t0 + 3.9);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 4.1);
    osc.connect(g); g.connect(ctx.destination); osc.start(t0); osc.stop(t0 + 4.2);
  } catch (e) {}
}
/* Voz disuasoria por speechSynthesis (español). */
function casa_voz(texto) {
  try {
    if (!('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(texto || estado.cfg.casaVozTexto);
    u.lang = 'es-ES'; u.rate = 0.95; u.volume = 1; u.pitch = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch (e) {}
}
/* Linterna por torch (si la lente lo soporta) o estrobo de pantalla como fallback. */
function casa_linterna(on) {
  let torchOk = false;
  try {
    const v = document.getElementById('vid-video');
    const stream = v && v.stream ? v.stream : null;
    const track = stream && stream.getVideoTracks && stream.getVideoTracks()[0];
    if (track && track.getCapabilities && track.getCapabilities().torch) {
      track.applyConstraints({ advanced: [{ torch: !!on }] }).catch(function () {});
      torchOk = true;
    }
  } catch (e) {}
  return torchOk;
}
function casa_estroboArrancar() {
  const c = estado.casa; if (!c) return;
  const torch = casa_linterna(true);
  c.estroboHasta = Date.now() + CASA_ESTROBO_MS;
  // Sin torch: estrobo de PANTALLA en un overlay aparte (NUNCA sobre el canvas
  // grabado: los destellos no deben entrar en la evidencia).
  if (!torch) {
    c.estroboOn = true;
    const ov = document.getElementById('casa-estrobo');
    if (ov) ov.classList.remove('oculto');
  }
  setTimeout(casa_estroboParar, CASA_ESTROBO_MS + 50);
}
function casa_estroboParar() {
  const c = estado.casa; if (!c) return;
  c.estroboOn = false; c.estroboHasta = 0;
  casa_linterna(false);
  const ov = document.getElementById('casa-estrobo');
  if (ov) ov.classList.add('oculto');
}
/* Lanza la disuasión completa según ajustes (solo en crítico + armado). */
function casa_disuadir() {
  if (estado.cfg.casaSirena) casa_sirena();
  if (estado.cfg.casaVoz) casa_voz(estado.cfg.casaVozTexto);
  if (estado.cfg.casaLinterna) casa_estroboArrancar();
}

/* ============================================================================
 * 5) SUPERVISIÓN DEL SISTEMA — corte de corriente (Battery API) + salud.
 * ==========================================================================*/
function casa_vigilarBateria() {
  const c = estado.casa; if (!c) return;
  if (c.bateriaEnganchada) return;       // no re-enganchar listeners al reactivar
  try {
    if (!navigator.getBattery) return;   // navegador sin Battery API (iOS): se avisa en el panel
    c.bateriaEnganchada = true;
    navigator.getBattery().then(function (bat) {
      c.bateria = bat; c.bateriaCargando = bat.charging; c.bateriaNivel = bat.level;
      bat.addEventListener('chargingchange', function () {
        const antes = c.bateriaCargando; c.bateriaCargando = bat.charging;
        // Estaba cargando y deja de cargar con la casa armada → posible corte de luz.
        if (antes && !bat.charging && estado.cfg.casaActivo && estado.cfg.casaEstado !== 'desarmado') {
          casa_disparar('corriente', 'Alimentación perdida — posible corte de corriente (batería ' + Math.round(bat.level * 100) + '%)', null, 'critico');
        }
      });
      bat.addEventListener('levelchange', function () {
        c.bateriaNivel = bat.level;
        const pct = Math.round(bat.level * 100);
        CASA_BATERIA_AVISOS.forEach(function (umbral) {
          if (pct <= umbral && !c.bateriaAvisados[umbral] && !bat.charging) {
            c.bateriaAvisados[umbral] = true;
            casa_disparar('bateria', 'Batería del vigía al ' + pct + '%', null, umbral <= 20 ? 'sospecha' : 'info');
          }
          if (pct > umbral + 5) c.bateriaAvisados[umbral] = false;  // rearma al recargar
        });
      });
    }).catch(function () {});
  } catch (e) {}
}

/* ============================================================================
 * 6) MÁSCARAS DE PRIVACIDAD (zonas de exclusión: negro antes de analizar/grabar)
 * Limita el ALCANCE de captación (obligación legal). NO difumina la evidencia:
 * lo que queda dentro del encuadre propio se graba íntegro; solo la vía pública
 * / parcela ajena se tapa en NEGRO, y por eso ni se analiza ni aparece en clips.
 * ==========================================================================*/
function casa_zonasExclusion() {
  return (estado.zonas || []).filter(function (z) { return z && z.tipo === 'exclusion' && z.puntos && z.puntos.length >= 3; });
}
function casa_hayExclusion() { return casa_zonasExclusion().length > 0; }

/* Descarta las detecciones cuyo pie cae dentro de una zona de exclusión.
 * Lo llama el bucle (99-app) justo tras la máscara de análisis. */
function casa_filtrarExclusion(dets) {
  if (!Array.isArray(dets) || !dets.length) return dets || [];
  const zonas = casa_zonasExclusion();
  if (!zonas.length) return dets;
  const w = estado.video.w || 640, h = estado.video.h || 480;
  const polis = zonas.map(function (z) { return z.puntos.map(function (p) { return { x: p.x * w, y: p.y * h }; }); });
  return dets.filter(function (d) {
    const cc = d && d.caja; if (!cc) return true;
    const px = cc.x + cc.an / 2, py = cc.y + cc.al * 0.92;
    for (let i = 0; i < polis.length; i++) if (zona_puntoEnPoligono(px, py, polis[i])) return false;
    return true;
  });
}

/* Pintor orden 5: rellena de NEGRO las zonas de exclusión sobre el compuesto,
 * así también quedan negras en el vídeo grabado y en las capturas. */
function casa_pintarExclusion(ctx) {
  if (!ctx) return;
  const zonas = casa_zonasExclusion(); if (!zonas.length) return;
  const w = (ctx.canvas && ctx.canvas.width) || estado.video.w || 640;
  const h = (ctx.canvas && ctx.canvas.height) || estado.video.h || 480;
  try {
    ctx.save();
    ctx.fillStyle = '#000';
    zonas.forEach(function (z) {
      ctx.beginPath();
      z.puntos.forEach(function (p, i) { const x = p.x * w, y = p.y * h; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
      ctx.closePath(); ctx.fill();
    });
    ctx.restore();
  } catch (e) {}
}

/* ============================================================================
 * 7) VIDA DIARIA — línea de tiempo, visitas, vacaciones (resumen diario).
 * ==========================================================================*/
function casa_registrarVisita(texto) {
  const c = estado.casa; if (!c) return;
  const foto = (typeof vid_capturaJPEG === 'function') ? vid_capturaJPEG(240) : null;
  const reg = { ts: Date.now(), foto: foto || null, texto: texto || 'Visita' };
  c.visitas.unshift(reg);
  if (c.visitas.length > CASA_VISITAS_MAX) c.visitas.length = CASA_VISITAS_MAX;
  nuc_guardar('casa_visitas_' + nuc_diaClave(), c.visitas);
  casa_agregarTimeline(reg.ts, foto, texto, 'info');
}
function casa_agregarTimeline(ts, foto, texto, nivel) {
  const c = estado.casa; if (!c) return;
  c.timeline.unshift({ ts: ts || Date.now(), foto: foto || null, texto: texto || '', nivel: nivel || 'info' });
  if (c.timeline.length > CASA_TIMELINE_MAX) c.timeline.length = CASA_TIMELINE_MAX;
  casa_render();
}

/* Detección de caídas en interior (personas mayores): reusa gesto:caida. */
function casa_alCaida(ev) {
  if (!estado.cfg.casaActivo) return;
  casa_disparar('caida', 'Posible caída detectada — revisar', ev && ev.track, 'critico');
}

/* Resumen diario de vacaciones por Telegram a la hora fijada. */
function casa_resumenVacaciones(ahora) {
  if (!estado.cfg.casaVacaciones) return;
  const c = estado.casa; if (!c) return;
  const d = new Date(ahora);
  const hhmm = nuc_pad2(d.getHours()) + ':' + nuc_pad2(d.getMinutes());
  const dia = nuc_diaClave(ahora);
  if (hhmm !== (estado.cfg.casaResumenHora || '21:00')) return;
  if (c.ultResumen === dia) return;
  c.ultResumen = dia; nuc_guardar('casa_resumen_dia', dia);
  let visitas = 0, alertas = 0;
  try {
    const log = nuc_cargar('log', []);
    log.forEach(function (r) { if (nuc_diaClave(r.ts) === dia) { alertas++; if (r.tipo === 'visita' || r.tipo === 'paquete') visitas++; } });
  } catch (e) {}
  const texto = 'Resumen del día ' + dia + ': ' +
    (alertas === 0 ? 'Día tranquilo, 0 alertas.' : visitas + ' visitas, ' + alertas + ' alertas.');
  // Reutiliza el canal de Telegram vía una alerta informativa (nivel info no molesta).
  casa_disparar('resumen', texto, null, 'info');
}

/* ============================================================================
 * DISPARO CENTRAL — reutiliza alerta_disparar (sonido, vibración, flash,
 * Telegram, grabación y bitácora). Añade la DISUASIÓN si es crítico y armado.
 * ==========================================================================*/
function casa_disparar(tipo, texto, track, nivelForzado) {
  const armado = estado.cfg.casaEstado && estado.cfg.casaEstado !== 'desarmado';
  let nivel = nivelForzado || (armado ? 'critico' : 'info');
  const datos = { trackId: track && track.id != null ? track.id : null };
  if (typeof alerta_disparar === 'function') {
    try { alerta_disparar('casa_' + tipo, nivel, texto, datos); } catch (e) { casa_toast(texto, nivel); }
  } else {
    casa_toast(texto, nivel);
  }
  casa_agregarTimeline(Date.now(), null, texto, nivel);
  // Disuasión activa: solo crítico y con la alarma armada.
  if (nivel === 'critico' && armado) casa_disuadir();
}

/* ============================================================================
 * EVALUACIÓN POR FRAME (la llama 99-app cuando la capa Casa está activa).
 * ==========================================================================*/
function casa_evaluar(tracks, ts) {
  if (!estado.casa || !estado.cfg.casaActivo) return;
  ts = ts || Date.now();
  try {
    casa_evaluarPiscina(tracks, ts);
    casa_evaluarPaqueteria(tracks, ts);
    // Merodeo en puerta: alguien que entró en la puerta y sigue sin marcharse.
    const c = estado.casa;
    const idsVistos = {};
    (tracks || []).forEach(function (t) { if (t && t.id != null) idsVistos[t.id] = true; });
    Object.keys(c.puertaDwell).forEach(function (id) {
      const reg = c.puertaDwell[id];
      if (!idsVistos[id]) { delete c.puertaDwell[id]; return; }
      const seg = (ts - reg.desde) / 1000;
      if (seg >= (estado.cfg.casaMerodeoPuertaSeg || 30)) {
        delete c.puertaDwell[id];
        casa_disparar('merodeo_puerta', 'Alguien lleva rato en la puerta sin entrar — revisar', { id: +id }, 'sospecha');
      }
    });
  } catch (e) { console.warn('[casa] evaluar:', e && e.message); }
}

/* ============================================================================
 * PINTORES: HUD de estado + estrobo de pantalla (fallback de linterna).
 * ==========================================================================*/
function casa_pintarHUD(ctx) {
  if (!ctx || !estado.casa || !estado.cfg.casaActivo) return;
  const w = (ctx.canvas && ctx.canvas.width) || estado.video.w || 640;
  const h = (ctx.canvas && ctx.canvas.height) || estado.video.h || 480;
  try {
    // Chip de estado de alarma (arriba-derecha). El estrobo va en un overlay
    // aparte (#casa-estrobo), NUNCA sobre este canvas: no debe entrar en los clips.
    const est = estado.cfg.casaEstado || 'desarmado';
    const txt = (est === 'desarmado' ? '🏠 ' : '🔒 ') + CASA_ESTADO_ES[est];
    ctx.save();
    ctx.font = "600 " + Math.round(h * 0.026) + "px system-ui,-apple-system,'Segoe UI',sans-serif";
    ctx.textBaseline = 'middle'; ctx.textAlign = 'right';
    const pad = h * 0.012;
    const tw = ctx.measureText(txt).width;
    const bx = w - tw - pad * 3, by = h * 0.02, bh = h * 0.05, bw = tw + pad * 2;
    ctx.fillStyle = est === 'desarmado' ? 'rgba(10,14,20,.7)' : 'rgba(255,65,85,.82)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = '#fff';
    ctx.fillText(txt, bx + bw - pad, by + bh / 2);
    ctx.restore();
  } catch (e) {}
}

/* ============================================================================
 * PANEL (controles). El HTML del panel vive en 19-casa.html (SLOT:CASA).
 * ==========================================================================*/
function casa_cablearControles() {
  // Botones de estado de alarma.
  CASA_ESTADOS.forEach(function (est) {
    const b = document.getElementById('casa-estado-' + est);
    if (b) b.addEventListener('click', function () {
      if (est === 'desarmado') casa_cambiarEstado('desarmado');
      else casa_cambiarEstado(est);
    });
  });
  // Interruptores simples ligados a cfg.
  const toggles = [
    ['casa-sirena', 'casaSirena'], ['casa-linterna', 'casaLinterna'], ['casa-voz', 'casaVoz'],
    ['casa-bateria', 'casaBateria'], ['casa-paqueteria', 'casaPaqueteria'], ['casa-vacaciones', 'casaVacaciones'],
    ['casa-autoarmar', 'casaAutoArmar'],
  ];
  toggles.forEach(function (par) {
    const el = document.getElementById(par[0]);
    if (el) el.addEventListener('change', function () {
      estado.cfg[par[1]] = !!el.checked; nuc_guardar('cfg', estado.cfg);
      if (par[1] === 'casaBateria' && el.checked && estado.cfg.casaActivo) casa_vigilarBateria();
      if (typeof bus !== 'undefined') bus.emit('cfg:cambio', { clave: par[1] });
    });
  });
  // Asignación de roles a zonas.
  const btnRoles = document.getElementById('casa-btnRoles');
  if (btnRoles) btnRoles.addEventListener('click', function () { casa_modalRoles(); });
  // Dibujar una zona de exclusión (privacidad): reutiliza el dibujo de zonas.
  const btnExcl = document.getElementById('casa-btnExclusion');
  if (btnExcl) btnExcl.addEventListener('click', function () {
    if (typeof zona_iniciarDibujo === 'function') { zona_iniciarDibujo('exclusion'); casa_toast('Toca el vídeo para marcar la zona a tapar y pulsa «Cerrar zona».', 'info'); }
  });
  // Ver visitas de hoy.
  const btnVis = document.getElementById('casa-btnVisitas');
  if (btnVis) btnVis.addEventListener('click', function () { casa_modalVisitas(); });
  // Probar disuasión.
  const btnDis = document.getElementById('casa-btnProbar');
  if (btnDis) btnDis.addEventListener('click', function () { casa_disuadir(); casa_toast('Probando disuasión (sirena, voz y luz)', 'info'); });
}

function casa_sincronizarControles() {
  CASA_ESTADOS.forEach(function (est) {
    const b = document.getElementById('casa-estado-' + est);
    if (b) b.classList.toggle('activo', estado.cfg.casaEstado === est);
  });
  [['casa-sirena', 'casaSirena'], ['casa-linterna', 'casaLinterna'], ['casa-voz', 'casaVoz'],
   ['casa-bateria', 'casaBateria'], ['casa-paqueteria', 'casaPaqueteria'], ['casa-vacaciones', 'casaVacaciones'],
   ['casa-autoarmar', 'casaAutoArmar']].forEach(function (par) {
    const el = document.getElementById(par[0]);
    if (el) el.checked = !!estado.cfg[par[1]];
  });
  const panel = document.getElementById('casa-panel');
  if (panel) panel.classList.toggle('oculto', !estado.cfg.casaActivo);
}

/* Modal para asignar un rol de casa a cada zona dibujada. */
function casa_modalRoles() {
  if (typeof ui_modal !== 'function') { casa_toast('Dibuja zonas y asígnales un rol desde aquí.', 'info'); return; }
  const zonas = (estado.zonas || []).filter(function (z) { return z && z.puntos && z.puntos.length >= 3; });
  const cont = document.createElement('div');
  if (!zonas.length) {
    cont.innerHTML = '<p>Primero dibuja zonas en el vídeo (toolbar bajo la cámara). Luego vuelve aquí para darles un rol de casa.</p>';
  } else {
    zonas.forEach(function (z) {
      const fila = document.createElement('div');
      fila.className = 'campo';
      const rolActual = casa_rolDe(z.id) || '';
      let opts = '<option value="">— sin rol de casa —</option>';
      CASA_ROLES.forEach(function (r) { opts += '<option value="' + r + '"' + (rolActual === r ? ' selected' : '') + '>' + CASA_ROL_ES[r] + '</option>'; });
      fila.innerHTML = '<label>' + (z.nombre || z.id) + ' <span class="etiqueta">(' + (z.tipo || 'zona') + ')</span></label>' +
        '<select data-zona="' + z.id + '">' + opts + '</select>';
      cont.appendChild(fila);
    });
    cont.addEventListener('change', function (ev) {
      const sel = ev.target;
      if (sel && sel.dataset && sel.dataset.zona) {
        const c = estado.casa;
        if (sel.value) c.roles[sel.dataset.zona] = sel.value; else delete c.roles[sel.dataset.zona];
        nuc_guardar('casa_roles', c.roles);
      }
    });
  }
  ui_modal('Roles de las zonas', cont, [{ texto: 'Hecho', clase: 'btn-primario', cerrar: true }]);
}

function casa_modalVisitas() {
  if (typeof ui_modal !== 'function') return;
  const c = estado.casa;
  const cont = document.createElement('div');
  if (!c.visitas.length) { cont.innerHTML = '<p>Aún no hay visitas registradas hoy.</p>'; }
  else {
    c.visitas.forEach(function (v) {
      const fila = document.createElement('div');
      fila.className = 'fila'; fila.style.marginBottom = '8px';
      const img = v.foto ? '<img src="' + v.foto + '" alt="" style="width:64px;height:48px;object-fit:cover;border-radius:6px">' : '';
      fila.innerHTML = img + '<span>' + nuc_horaCorta(v.ts) + ' · ' + (v.texto || 'Visita') + '</span>';
      cont.appendChild(fila);
    });
  }
  ui_modal('Visitas de hoy (' + c.visitas.length + ')', cont, [{ texto: 'Cerrar', clase: 'btn-fantasma', cerrar: true }]);
}

function casa_alCambioCfg(d) {
  if (!d) return;
  if (d.clave === 'casaActivo') casa_sincronizarControles();
}

/* Repinta la línea de tiempo del panel (throttle). */
function casa_render() {
  const c = estado.casa; if (!c) return;
  const ahora = Date.now();
  if (ahora - c._ultRender < 500) return;
  c._ultRender = ahora;
  const cont = document.getElementById('casa-timeline');
  if (!cont) return;
  if (!c.timeline.length) { cont.innerHTML = '<span class="etiqueta">Sin eventos todavía hoy.</span>'; return; }
  let html = '';
  c.timeline.slice(0, 24).forEach(function (t) {
    const img = t.foto ? '<img src="' + t.foto + '" alt="" style="width:100%;height:44px;object-fit:cover;border-radius:6px">' : '<div style="height:44px;border-radius:6px;background:var(--panel2)"></div>';
    html += '<div class="casa-tl-item insignia-' + (t.nivel || 'info') + '" title="' + (t.texto || '') + '">' +
      img + '<span class="casa-tl-hora">' + nuc_horaCorta(t.ts) + '</span></div>';
  });
  cont.innerHTML = html;
}

/* Devuelve un pequeño resumen de salud del sistema (para el panel/UI). */
function casa_salud() {
  const c = estado.casa || {};
  return {
    estado: estado.cfg.casaEstado || 'desarmado',
    bateria: c.bateriaNivel != null ? Math.round(c.bateriaNivel * 100) : null,
    cargando: !!c.bateriaCargando,
    inactivoDesde: c.inactivoDesde || 0,
    exclusion: casa_hayExclusion(),
  };
}

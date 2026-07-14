/* ============================================================================
 * 06-ALERTAS — VIGÍA IA · motor de alertas: dispara, suena, vibra, muestra el
 * flash, registra el log (con rotación) y encola/reintenta el aviso a Telegram.
 * Escucha el mapa evento→alerta descrito en CONTRATOS.md §5. Prefijo: alerta_.
 * Estado propio en estado.alerta (NO confundir con estado.alertas del núcleo,
 * que ya trae { criticoTracks: [] } y se reutiliza tal cual).
 * ==========================================================================*/

/* --- Constantes del módulo ---------------------------------------------- */
const ALERTA_LOG_LIMITE_BYTES = 4 * 1024 * 1024;        // ~4MB (aprox. por length)
const ALERTA_COOLDOWN_AFORO_MS = 120000;                 // 120s, aforo:cambio
const ALERTA_COOLDOWN_FUERA_HORARIO_MS = 60000;          // 60s global
const ALERTA_COOLDOWN_RUIDO_MS = 30000;                  // 30s
const ALERTA_TG_ESPERAS = [5000, 15000, 60000, 60000];   // 5s→15s→60s→60s
const ALERTA_TG_MAX_INTENTOS = 5;
const ALERTA_ICONOS = { info: 'ℹ️', sospecha: '⚠️', critico: '🚨' };
const ALERTA_VIBRA = {
  info: [80],
  sospecha: [80, 60, 80, 60, 80],
  critico: [200, 100, 200, 100, 200, 100, 400],
};

/* ============================================================================
 * INICIALIZACIÓN Y SUSCRIPCIONES DEL MAPA EVENTO→ALERTA (CONTRATOS.md §5)
 * ==========================================================================*/
function alerta_init() {
  estado.alerta = {
    log: nuc_cargar('log', []),
    telegramCola: nuc_cargar('telegramCola', []),
    telegramProcesando: false,
    telegramEsperandoOnline: false,
    telegramFalloAvisado: false,
    silenciadoHasta: 0,
    cooldowns: {},
    audioCtx: null,
    osciladores: [],
    flashTimer: null,
    ultAforo: 0,
    ultFueraHorario: 0,
    ultRuido: 0,
    ruido: null,
  };

  // Botones del overlay (deben funcionar aunque la UI no haya cargado).
  const btnSilenciar = document.getElementById('alerta-btnSilenciar');
  if (btnSilenciar) btnSilenciar.addEventListener('click', () => alerta_silenciar(5));
  const btnCerrar = document.getElementById('alerta-btnCerrar');
  if (btnCerrar) btnCerrar.addEventListener('click', alerta_flashCerrar);

  // zona:entrada → prohibida = crítico, sensible+bolsa = sospecha
  bus.on('zona:entrada', (d) => {
    if (!d || !d.zona || !d.track) return;
    const trackId = d.track.id;
    if (d.zona.tipo === 'prohibida') {
      alerta_disparar('zona_prohibida', 'critico', 'Persona en zona prohibida (' + d.zona.nombre + ')', { trackId });
    } else if (d.zona.tipo === 'sensible' && d.conBolsa) {
      alerta_disparar('zona_sensible', 'sospecha', 'Persona con mochila/bolso en zona sensible (' + d.zona.nombre + ') — revisar', { trackId });
    }
  });

  // zona:merodeo → sospecha
  bus.on('zona:merodeo', (d) => {
    if (!d || !d.zona || !d.track) return;
    alerta_disparar('merodeo', 'sospecha', 'Merodeo: persona más de ' + Math.round(d.seg || 0) + 's en ' + d.zona.nombre, { trackId: d.track.id });
  });

  // zona:cola → info
  bus.on('zona:cola', (d) => {
    if (!d) return;
    alerta_disparar('cola', 'info', 'Cola en caja (' + d.n + ' personas): valorar abrir otra caja', {});
  });

  // gesto:carrera → sospecha
  bus.on('gesto:carrera', (d) => {
    if (!d) return;
    alerta_disparar('carrera', 'sospecha', 'Persona corriendo', { trackId: d.trackId });
  });

  // gesto:caida → crítico
  bus.on('gesto:caida', (d) => {
    if (!d) return;
    alerta_disparar('caida', 'critico', 'Posible caída de persona — atención inmediata', { trackId: d.trackId });
  });

  // objeto:abandonado → sospecha
  bus.on('objeto:abandonado', (d) => {
    if (!d || !d.track) return;
    alerta_disparar('objeto_abandonado', 'sospecha', 'Objeto sin dueño desde hace ' + Math.round(d.seg || 0) + 's (mochila/bolso/maleta) — revisar', { trackId: d.track.id });
  });

  // gesto:ocultacion → sospecha (JAMÁS "robo"/"ladrón"). Si se vio QUÉ objeto
  // tenía en la mano al coger, se nombra («posible botella») para la revisión.
  // REPETIDA (otro ciclo completo dentro del silencio anti-spam) → CRÍTICA y
  // saltándose el cooldown: repetir el gesto es más sospechoso, no menos.
  bus.on('gesto:ocultacion', (d) => {
    if (!d) return;
    const que = d.objeto ? ' (posible ' + nuc_claseES(d.objeto) + ' en la mano)' : '';
    if (d.repetida) {
      alerta_disparar('ocultacion_repetida', 'critico',
        'Gesto de ocultación REPETIDO' + que + ' — revisar ya. Nunca acuses a nadie basándote solo en esta alerta.',
        { trackId: d.trackId }, true);
      return;
    }
    alerta_disparar('ocultacion', 'sospecha', 'Gesto de ocultación' + que + ' — revisar. Nunca acuses a nadie basándote solo en esta alerta.', { trackId: d.trackId });
  });

  // aforo:cambio → sospecha si supera el máximo (cooldown propio 120s)
  bus.on('aforo:cambio', (d) => {
    if (!d) return;
    const max = estado.cfg.aforoMax;
    if (!(d.dentro > max)) return;
    const ahora = Date.now();
    if (ahora - estado.alerta.ultAforo < ALERTA_COOLDOWN_AFORO_MS) return;
    const reg = alerta_disparar('aforo', 'sospecha', 'Aforo superado: ' + d.dentro + '/' + max, {});
    if (reg) estado.alerta.ultAforo = ahora;
  });

  // animal → info
  bus.on('animal', (d) => {
    if (!d || !d.track) return;
    alerta_disparar('animal', 'info', 'Animal detectado en el local (' + nuc_claseES(d.track.clase) + ')', { trackId: d.track.id });
  });

  // sabotaje → crítico
  bus.on('sabotaje', (d) => {
    const texto = (d && d.tipo === 'cambio')
      ? 'El encuadre de la cámara ha cambiado bruscamente — posible sabotaje'
      : 'Cámara tapada o a oscuras — posible sabotaje';
    alerta_disparar('sabotaje', 'critico', texto, {});
  });

  // car:detenido → sospecha
  bus.on('car:detenido', (d) => {
    if (!d || !d.track || !d.zona) return;
    alerta_disparar('vehiculo_detenido', 'sospecha', 'Vehículo detenido en zona no permitida (' + d.zona.nombre + ')', { trackId: d.track.id });
  });

  // frame → vigilancia fuera de horario (cooldown 60s GLOBAL, no por track)
  bus.on('frame', (d) => {
    if (!estado.cfg.fueraHorarioOn) return;
    const ts = (d && d.ts) || Date.now();
    if (!nuc_esEnFranja(ts, estado.cfg.fueraHorarioIni, estado.cfg.fueraHorarioFin)) return;
    if (ts - estado.alerta.ultFueraHorario < ALERTA_COOLDOWN_FUERA_HORARIO_MS) return;
    const personas = (estado.tracks || []).filter((t) => NUC_PERSONA.indexOf(t.clase) !== -1);
    if (!personas.length) return;
    const track = personas[0];
    const reg = alerta_disparar('fuera_horario', 'critico', 'Persona detectada FUERA DE HORARIO', { trackId: track.id });
    if (reg) {
      estado.alerta.ultFueraHorario = ts;
      bus.emit('fuera_horario:persona', { track });
    }
  });

  // ruido (evento interno: lo emite alerta_ruidoInit y lo escucha este mismo módulo)
  bus.on('ruido', () => {
    const ahora = Date.now();
    if (ahora - estado.alerta.ultRuido < ALERTA_COOLDOWN_RUIDO_MS) return;
    const nivel = nuc_esEnFranja(ahora, estado.cfg.fueraHorarioIni, estado.cfg.fueraHorarioFin) ? 'critico' : 'sospecha';
    const reg = alerta_disparar('ruido', nivel, 'Ruido fuerte detectado (posible golpe o cristal roto) — revisar la cámara.', {});
    if (reg) estado.alerta.ultRuido = ahora;
  });

  // Reanuda envíos a Telegram si cambia la configuración (token/chat) o hay cola pendiente.
  bus.on('cfg:cambio', (d) => {
    if (d && (d.clave === 'telegramToken' || d.clave === 'telegramChat')) alerta_telegramProcesarCola();
  });

  if (estado.alerta.telegramCola.length) alerta_telegramProcesarCola();

  // El log ya está cargado: reconstruye el feed para que las alertas (con su
  // foto del momento) se vean al abrir la app, no solo las ocurridas en vivo.
  if (typeof ui_reconstruirFeed === 'function') ui_reconstruirFeed();
}

/* ============================================================================
 * NÚCLEO: alerta_disparar
 * ==========================================================================*/
/* ============================================================================
 * 🚧 MATRIZ DE MODOS — LA GARANTÍA CENTRAL DE NO-MEZCLA.
 * TODAS las alertas pasan por alerta_disparar: aquí se define, tipo a tipo, en
 * QUÉ vistas puede sonar cada una. Una alerta de tienda en la vista Casa (el
 * «gesto de ocultación» en el salón) es IMPOSIBLE por diseño, no por promesa.
 * Tipo desconocido → se permite (y se anota en consola): no mata tipos futuros.
 * ==========================================================================*/
const ALERTA_VISTAS = {
  // — SOLO TIENDA (vista Comercio) —
  ocultacion: ['comercio'], ocultacion_repetida: ['comercio'],
  ocultacion_bolsa: ['comercio'], ocultacion_salida: ['comercio'],
  agachado: ['comercio'], aglomeracion: ['comercio'],
  contrasentido: ['comercio'], colarse: ['comercio'],
  aforo: ['comercio'], cola: ['comercio'], merodeo: ['comercio'],
  // — ESCENA VIGILADA (tienda o casa) —
  caida: ['comercio', 'casa'], carrera: ['comercio', 'casa'],
  peligro: ['comercio', 'casa'], animal: ['comercio', 'casa'],
  zona_prohibida: ['comercio', 'casa'], zona_sensible: ['comercio', 'casa'],
  objeto_abandonado: ['comercio', 'casa'],
  fuera_horario: ['comercio', 'casa'], ruido: ['comercio', 'casa'],
  sabotaje: ['comercio', 'casa', 'carretera'],
  // — CARRETERA / PARKING (cámara fija) —
  vehiculo_detenido: ['carretera'],
  // — COCHE (Copiloto y Centinela conviven: pareja de coche) —
  colision_frontal: ['copiloto', 'centinela'], peaton_delante: ['copiloto', 'centinela'],
  stop_delante: ['copiloto', 'centinela'], muy_pegado: ['copiloto', 'centinela'],
  fatiga: ['copiloto', 'centinela'], impacto: ['copiloto', 'centinela'],
  aparcado_golpe: ['copiloto', 'centinela'],
  // — la alerta de PRUEBA del botón suena en cualquier vista —
  prueba: null,
};
/* ¿Puede sonar este tipo en la vista actual? (prefijos casa_/dms_ incluidos) */
function alerta_permitidaEnVista(tipo) {
  try {
    const vista = (estado.modos && estado.modos.vista) || 'comercio';
    if (tipo.indexOf('casa_') === 0) return vista === 'casa';
    if (tipo.indexOf('dms_') === 0) return vista === 'centinela' || vista === 'copiloto';
    const permitidas = ALERTA_VISTAS[tipo];
    if (permitidas === null) return true;                        // 'prueba': siempre
    if (!permitidas) {
      console.info('[alertas] tipo sin vista asignada (se permite): ' + tipo);
      return true;                                               // tipo futuro: no se mata
    }
    return permitidas.indexOf(vista) >= 0;
  } catch (e) { return true; }
}

function alerta_disparar(tipo, nivel, texto, datos, forzar) {
  if (!estado.alerta) return null;
  if (!tipo || !nivel || !texto) return null;
  // 🚧 Puerta central anti-mezcla: si el tipo no pertenece a la vista actual,
  // NO suena, NO se registra, NO se graba y NO va a Telegram. Punto.
  if (!alerta_permitidaEnVista(tipo)) return null;
  // 🎯 SOLO ROBOS: si el dueño lo activó, se silencia TODO menos la familia de
  // ocultación (robo), el sabotaje de cámara y la alerta de prueba. Así se
  // acaban los avisos de correr, agacharse, caídas, merodeo, colas, etc.
  if (estado.cfg.soloRobos && tipo.indexOf('ocultacion') !== 0 && tipo !== 'sabotaje' && tipo !== 'prueba') return null;
  datos = datos || {};
  const trackId = datos.trackId != null ? datos.trackId : null;
  const clave = tipo + '|' + (trackId != null ? trackId : '');
  const ahora = Date.now();

  // 1) cooldown por tipo+track
  if (!forzar) {
    const ultimo = estado.alerta.cooldowns[clave] || 0;
    const espera = (estado.cfg.alertaCooldownSeg || 30) * 1000;
    if (ahora - ultimo < espera) return null;
  }
  estado.alerta.cooldowns[clave] = ahora;

  // 2) registro. Dos capturas del MISMO instante: miniatura (historial, almacén
  //    limitado) y HD 1280 (solo para Telegram: evidencia nítida, no se guarda).
  let foto = null, fotoHD = null;
  try {
    if (typeof vid_capturaJPEG === 'function') {
      fotoHD = vid_capturaJPEG(1280, 0.82);
      foto = vid_capturaJPEG();
    }
  } catch (e) { foto = null; fotoHD = null; }
  const registro = { id: nuc_uid('a'), ts: ahora, tipo, nivel, texto, trackId, foto };

  // 3) log + rotación + persistencia
  estado.alerta.log.push(registro);
  alerta_recortarLog();
  nuc_guardar('log', estado.alerta.log);

  // 4-6) sonido + vibración + flash a pantalla completa.
  // 🔕 MODO DISCRETO (cfg.alertaDiscreto): solo suena/salta con robo CONFIRMADO.
  //   · Si la IA va a confirmar esta alerta → NO suena aún; lo hará ia_mostrar
  //     cuando el veredicto sea ≥65% (robo seguro). El resto queda mudo en el feed.
  //   · Si NO hay IA que confirme → al menos suena/salta en crítico (no mudo del todo).
  // Sin modo discreto: comportamiento normal (crítico y sospecha suenan y saltan).
  const iaConfirmara = estado.cfg.alertaDiscreto && nivel !== 'info' && fotoHD &&
    typeof ia_confirmarAlerta === 'function' && typeof ia_activa === 'function' && ia_activa();
  if (!estado.cfg.alertaDiscreto) {
    alerta_sonido(nivel);
    alerta_vibrar(nivel);
    if (nivel === 'critico' || nivel === 'sospecha') alerta_flashMostrar(registro);
  } else if (!iaConfirmara && nivel === 'critico') {
    alerta_sonido('critico');
    alerta_vibrar('critico');
    alerta_flashMostrar(registro);
  }

  // 7) criticoTracks (para privacidad/pintado) — usa estado.alertas (del núcleo)
  if (nivel === 'critico' && trackId != null) {
    if (estado.alertas.criticoTracks.indexOf(trackId) === -1) estado.alertas.criticoTracks.push(trackId);
    setTimeout(() => {
      const idx = estado.alertas.criticoTracks.indexOf(trackId);
      if (idx !== -1) estado.alertas.criticoTracks.splice(idx, 1);
    }, 60000);
  }

  // 8) Telegram (solo sospecha/crítico y si está configurado) — con la foto HD
  if (nivel !== 'info' && estado.cfg.telegramToken && estado.cfg.telegramChat) {
    alerta_telegramEncolar(registro, fotoHD);
  }

  // 8b) 🧠 IA de visión CONFIRMA la alerta si el dueño la activó con su clave.
  //     No bloquea: cuando responde, el veredicto se PEGA a esta alerta en el
  //     feed (visible y persistente) y también va a Telegram. Se le pasa el id
  //     del registro para poder marcar ESA tarjeta.
  if (nivel !== 'info' && fotoHD && typeof ia_confirmarAlerta === 'function' && typeof ia_activa === 'function' && ia_activa()) {
    try { ia_confirmarAlerta(fotoHD, tipo, texto, registro.id); } catch (e) {}
  }

  // 9) bus
  bus.emit('alerta', { registro });
  if (nivel === 'critico') bus.emit('alerta:critica', { registro });

  return registro;
}

/* --- Rotación del log (recorta fotos antiguas primero, luego entradas) ---- */
function alerta_recortarLog() {
  const log = estado.alerta.log;
  let total = 0;
  try { total = JSON.stringify(log).length; } catch (e) { return; }
  if (total <= ALERTA_LOG_LIMITE_BYTES) return;
  let i = 0;
  while (total > ALERTA_LOG_LIMITE_BYTES && i < log.length) {
    const r = log[i];
    if (r.foto) { total -= r.foto.length; r.foto = null; }
    i++;
  }
  while (total > ALERTA_LOG_LIMITE_BYTES && log.length > 1) {
    const quitado = log.shift();
    let quitadoLen = 0;
    try { quitadoLen = JSON.stringify(quitado).length; } catch (e) { quitadoLen = 0; }
    total -= quitadoLen;
  }
}

/* ============================================================================
 * SONIDO (Web Audio, sin archivos) y VIBRACIÓN
 * ==========================================================================*/
function alerta_audioCtx() {
  if (estado.alerta.audioCtx) return estado.alerta.audioCtx;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    estado.alerta.audioCtx = new AC();
    return estado.alerta.audioCtx;
  } catch (e) { return null; }
}

function alerta_bip(ctx, frecuencia, inicio, duracion, volumen) {
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = frecuencia;
    const t0 = ctx.currentTime + inicio;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(volumen, t0 + 0.015);
    gain.gain.setValueAtTime(volumen, t0 + Math.max(0, duracion - 0.03));
    gain.gain.linearRampToValueAtTime(0, t0 + duracion);
    osc.connect(gain); gain.connect(ctx.destination);
    estado.alerta.osciladores.push(osc);
    osc.onended = () => {
      const idx = estado.alerta.osciladores.indexOf(osc);
      if (idx !== -1) estado.alerta.osciladores.splice(idx, 1);
    };
    osc.start(t0);
    osc.stop(t0 + duracion + 0.02);
  } catch (e) { /* sin sonido puntual, no rompe la app */ }
}

function alerta_sonido(nivel) {
  if (!estado.cfg.sonidoOn) return;
  if (Date.now() < estado.alerta.silenciadoHasta) return;
  const ctx = alerta_audioCtx();
  if (!ctx) return;
  try { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); } catch (e) { /* autoplay bloqueado, no pasa nada */ }
  if (nivel === 'info') {
    alerta_bip(ctx, 660, 0, 0.15, 0.2);
  } else if (nivel === 'sospecha') {
    alerta_bip(ctx, 880, 0, 0.14, 0.22);
    alerta_bip(ctx, 880, 0.22, 0.14, 0.22);
    alerta_bip(ctx, 880, 0.44, 0.14, 0.22);
  } else if (nivel === 'critico') {
    const pasos = Math.round(3 / 0.3);
    for (let i = 0; i < pasos; i++) {
      alerta_bip(ctx, (i % 2 === 0) ? 600 : 900, i * 0.3, 0.26, 0.25);
    }
  }
}

function alerta_vibrar(nivel) {
  try {
    if (!navigator.vibrate) return;
    navigator.vibrate(ALERTA_VIBRA[nivel] || ALERTA_VIBRA.info);
  } catch (e) { /* no soportado en este dispositivo */ }
}

/* ============================================================================
 * FLASH VISUAL (#alerta-flash del SLOT:ALERTAS)
 * ==========================================================================*/
function alerta_flashMostrar(registro) {
  const el = document.getElementById('alerta-flash');
  if (!el) return;
  if (estado.alerta.flashTimer) { clearTimeout(estado.alerta.flashTimer); estado.alerta.flashTimer = null; }
  el.classList.remove('alerta-nivel-info', 'alerta-nivel-sospecha', 'alerta-nivel-critico');
  el.classList.add('alerta-nivel-' + registro.nivel);
  const txt = document.getElementById('alerta-flashTxt');
  if (txt) txt.textContent = registro.texto;
  const hora = document.getElementById('alerta-flashHora');
  if (hora) hora.textContent = nuc_horaCorta(registro.ts);
  const icono = document.getElementById('alerta-flashIcono');
  if (icono) icono.textContent = ALERTA_ICONOS[registro.nivel] || ALERTA_ICONOS.info;
  el.classList.remove('oculto');
  if (registro.nivel === 'sospecha') {
    estado.alerta.flashTimer = setTimeout(alerta_flashCerrar, 4000);
  }
  // 'critico' se queda visible hasta que el usuario pulse "Cerrar".
}

function alerta_flashCerrar() {
  const el = document.getElementById('alerta-flash');
  if (el) el.classList.add('oculto');
  if (estado.alerta && estado.alerta.flashTimer) {
    clearTimeout(estado.alerta.flashTimer);
    estado.alerta.flashTimer = null;
  }
}

/* ============================================================================
 * SILENCIAR / PROBAR / LOG
 * ==========================================================================*/
function alerta_silenciar(min) {
  if (!estado.alerta) return;
  const minutos = (typeof min === 'number' && min > 0) ? min : 5;
  estado.alerta.silenciadoHasta = Date.now() + minutos * 60000;
  (estado.alerta.osciladores || []).forEach((osc) => { try { osc.stop(0); } catch (e) {} });
  estado.alerta.osciladores = [];
  alerta_flashCerrar();
  if (typeof ui_toast === 'function') {
    try { ui_toast('Alertas silenciadas ' + minutos + ' min', 'info'); } catch (e) {}
  }
}

function alerta_probar(nivel) {
  const n = (nivel === 'critico' || nivel === 'sospecha' || nivel === 'info') ? nivel : 'info';
  return alerta_disparar('prueba', n, 'Alerta de prueba (nivel ' + n + ')', {}, true);
}

function alerta_log() {
  return (estado.alerta && estado.alerta.log) || [];
}

function alerta_borrarLog() {
  if (!estado.alerta) return;
  estado.alerta.log = [];
  nuc_guardar('log', []);
  // Vacía también el feed en pantalla (la UI escucha este evento).
  try { if (typeof bus !== 'undefined' && bus.emit) bus.emit('alerta:borradas', {}); } catch (e) {}
}

/* ============================================================================
 * TELEGRAM — cola con reintentos (5s→15s→60s→60s, máx. 5 intentos)
 * ==========================================================================*/
function alerta_telegramEncolar(registro, fotoHD) {
  if (!estado.alerta) return;
  // La HD viaja SOLO en memoria; al persistir la cola se guarda la miniatura
  // (fotoMini) para no agotar el almacén si hay que reintentar tras recargar.
  const item = {
    id: registro.id, ts: registro.ts, texto: registro.texto,
    foto: fotoHD || registro.foto || null,
    fotoMini: registro.foto || null,
    intentos: 0,
  };
  estado.alerta.telegramCola.push(item);
  alerta_telegramPersistirCola();
  alerta_telegramProcesarCola();
}

/* Guarda la cola SIN las fotos HD (solo miniaturas): el almacén es limitado. */
function alerta_telegramPersistirCola() {
  if (!estado.alerta) return;
  try {
    const ligera = estado.alerta.telegramCola.map(function (i) {
      return { id: i.id, ts: i.ts, texto: i.texto, foto: i.fotoMini || i.foto || null, intentos: i.intentos };
    });
    nuc_guardar('telegramCola', ligera);
  } catch (e) { /* si no cabe, la cola sigue en memoria */ }
}

function alerta_telegramProcesarCola() {
  if (!estado.alerta) return;
  if (estado.alerta.telegramProcesando) return; // ya hay un envío o una espera en curso
  if (!estado.alerta.telegramCola.length) return;
  if (!estado.cfg.telegramToken || !estado.cfg.telegramChat) return;

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    if (!estado.alerta.telegramEsperandoOnline) {
      estado.alerta.telegramEsperandoOnline = true;
      window.addEventListener('online', () => {
        estado.alerta.telegramEsperandoOnline = false;
        alerta_telegramProcesarCola();
      }, { once: true });
    }
    return;
  }

  estado.alerta.telegramProcesando = true; // ocupa todo el ciclo (envío + posible espera)
  const item = estado.alerta.telegramCola[0];
  alerta_telegramEnviar(item)
    .then((ok) => alerta_telegramTrasIntento(item, ok))
    .catch(() => alerta_telegramTrasIntento(item, false));
}

function alerta_telegramTrasIntento(item, ok) {
  if (!estado.alerta) return;
  if (ok) {
    estado.alerta.telegramCola.shift();
    alerta_telegramPersistirCola();
    estado.alerta.telegramProcesando = false;
    if (estado.alerta.telegramFalloAvisado) {
      estado.alerta.telegramFalloAvisado = false;
      bus.emit('telegram:ok', {});
    }
    if (estado.alerta.telegramCola.length) alerta_telegramProcesarCola();
    return;
  }

  item.intentos = (item.intentos || 0) + 1;
  if (item.intentos >= ALERTA_TG_MAX_INTENTOS) {
    estado.alerta.telegramCola.shift();
    alerta_telegramPersistirCola();
    console.warn('[telegram] mensaje descartado tras ' + item.intentos + ' intentos');
    estado.alerta.telegramProcesando = false;
    if (!estado.alerta.telegramFalloAvisado) {
      estado.alerta.telegramFalloAvisado = true;
      bus.emit('telegram:error', { msg: 'No se pudo enviar la alerta a Telegram tras varios intentos.' });
    }
    if (estado.alerta.telegramCola.length) alerta_telegramProcesarCola();
    return;
  }

  alerta_telegramPersistirCola();
  const espera = ALERTA_TG_ESPERAS[Math.min(item.intentos - 1, ALERTA_TG_ESPERAS.length - 1)];
  setTimeout(() => {
    estado.alerta.telegramProcesando = false;
    alerta_telegramProcesarCola();
  }, espera);
}

/* Envía UN mensaje (con o sin foto). Nunca rechaza: resuelve true/false. */
function alerta_telegramEnviar(item) {
  return new Promise((resolve) => {
    try {
      const base = 'https://api.telegram.org/bot' + estado.cfg.telegramToken;
      const caption = item.texto + ' — ' + nuc_fechaHora(item.ts);
      if (item.foto) {
        fetch(item.foto)
          .then((r) => r.blob())
          .then((blob) => {
            const fd = new FormData();
            fd.append('chat_id', estado.cfg.telegramChat);
            fd.append('caption', caption);
            fd.append('photo', blob, 'alerta.jpg');
            return fetch(base + '/sendPhoto', { method: 'POST', body: fd });
          })
          .then((res) => resolve(!!(res && res.ok)))
          .catch(() => resolve(false));
      } else {
        const fd = new FormData();
        fd.append('chat_id', estado.cfg.telegramChat);
        fd.append('text', caption);
        fetch(base + '/sendMessage', { method: 'POST', body: fd })
          .then((res) => resolve(!!(res && res.ok)))
          .catch(() => resolve(false));
      }
    } catch (e) { resolve(false); }
  });
}

/* Prueba directa de conexión (sin cola). Resuelve true/false. */
function alerta_telegramProbar() {
  return new Promise((resolve) => {
    try {
      if (!estado.cfg.telegramToken || !estado.cfg.telegramChat) {
        bus.emit('telegram:error', { msg: 'Configura el token y el chat id de Telegram antes de probar.' });
        resolve(false);
        return;
      }
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        bus.emit('telegram:error', { msg: 'Sin conexión a internet.' });
        resolve(false);
        return;
      }
      const base = 'https://api.telegram.org/bot' + estado.cfg.telegramToken;
      const fd = new FormData();
      fd.append('chat_id', estado.cfg.telegramChat);
      fd.append('text', '✅ Vigía IA conectado');
      fetch(base + '/sendMessage', { method: 'POST', body: fd })
        .then((res) => {
          if (res && res.ok) {
            bus.emit('telegram:ok', {});
            resolve(true);
            return;
          }
          Promise.resolve(res ? res.json().catch(() => null) : null).then((cuerpo) => {
            const motivo = (cuerpo && cuerpo.description)
              ? cuerpo.description
              : ('el token o el chat id no son correctos (HTTP ' + (res ? res.status : '?') + ')');
            bus.emit('telegram:error', { msg: 'No se pudo conectar con Telegram: ' + motivo });
            resolve(false);
          });
        })
        .catch(() => {
          bus.emit('telegram:error', { msg: 'No se pudo conectar con Telegram (revisa tu red).' });
          resolve(false);
        });
    } catch (e) {
      bus.emit('telegram:error', { msg: 'No se pudo probar Telegram.' });
      resolve(false);
    }
  });
}

/* ============================================================================
 * RUIDO — SOLO nivel RMS 0-100, JAMÁS graba ni guarda audio.
 * ==========================================================================*/
function alerta_ruidoInit() {
  return new Promise((resolve) => {
    if (!estado.alerta) { resolve(false); return; }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      bus.emit('error:general', { msg: 'No se pudo activar el micrófono: este navegador no lo permite.' });
      resolve(false);
      return;
    }
    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        const ctx = new AC();
        const fuente = ctx.createMediaStreamSource(stream);
        const analizador = ctx.createAnalyser();
        analizador.fftSize = 512;
        fuente.connect(analizador);
        const muestras = new Uint8Array(analizador.fftSize);

        const r = { stream, ctx, analizador, sobreDesde: 0, intervalo: null };
        estado.alerta.ruido = r;

        r.intervalo = setInterval(() => {
          try {
            analizador.getByteTimeDomainData(muestras);
            let suma = 0;
            for (let i = 0; i < muestras.length; i++) {
              const v = (muestras[i] - 128) / 128;
              suma += v * v;
            }
            const rms = Math.sqrt(suma / muestras.length);
            const nivel = nuc_clamp(Math.round(rms * 100), 0, 100);
            const ahora = Date.now();
            if (nivel > estado.cfg.ruidoNivel) {
              if (!r.sobreDesde) r.sobreDesde = ahora;
              if (ahora - r.sobreDesde >= 300) bus.emit('ruido', { nivel });
            } else {
              r.sobreDesde = 0;
            }
          } catch (e) { /* medición puntual fallida, se ignora */ }
        }, 100);

        resolve(true);
      } catch (e) {
        bus.emit('error:general', { msg: 'No se pudo activar el micrófono: fallo al analizar el audio.' });
        try { stream.getTracks().forEach((t) => t.stop()); } catch (e2) {}
        resolve(false);
      }
    }).catch(() => {
      bus.emit('error:general', { msg: 'No se pudo activar el micrófono: permiso denegado o no disponible.' });
      resolve(false);
    });
  });
}

function alerta_ruidoParar() {
  if (!estado.alerta || !estado.alerta.ruido) return;
  const r = estado.alerta.ruido;
  try { if (r.intervalo) clearInterval(r.intervalo); } catch (e) {}
  try { if (r.stream) r.stream.getTracks().forEach((t) => t.stop()); } catch (e) {}
  try { if (r.ctx && r.ctx.state !== 'closed') r.ctx.close().catch(() => {}); } catch (e) {}
  estado.alerta.ruido = null;
}

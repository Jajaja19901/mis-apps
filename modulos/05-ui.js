/* ============================================================================
 * 05-UI — VIGÍA IA · lógica de la interfaz (ui_)
 * Cachea referencias en estado.uiRefs; estado propio adicional en estado.ui.
 * Todas las llamadas a otros módulos van con typeof-check: la UI debe
 * funcionar sin vídeo, sin modelos y sin el resto de módulos cargados.
 * ==========================================================================*/

/* --- Etiquetas de nivel para insignias del feed de alertas ----------------*/
const UI_NIVEL_ETIQUETA = { info: 'Info', sospecha: 'Sospecha', critico: 'Crítico' };
const UI_FEED_MAX = 30;
const UI_TOAST_MAX = 3;
const UI_TOAST_MS = 4000;
const UI_BANNER_MAX = 3;

/* ==========================================================================
 * ARRANQUE
 * ========================================================================*/
function ui_init() {
  const $ = (id) => document.getElementById(id);

  const refs = estado.uiRefs = {
    app: $('ui-app'),
    nombreApp: $('ui-nombreApp'),
    estadoPunto: $('ui-estadoPunto'),
    estadoTxt: $('ui-estadoTxt'),
    btnAforo: $('ui-btnAforo'),
    btnAjustes: $('ui-btnAjustes'),
    banners: $('ui-banners'),
    datoPersonas: $('ui-datoPersonas'),
    datoAforo: $('ui-datoAforo'),
    datoEntradas: $('ui-datoEntradas'),
    datoSalidas: $('ui-datoSalidas'),
    datoAlertas: $('ui-datoAlertas'),
    cardVehiculos: $('ui-cardVehiculos'),
    datoVehiculos: $('ui-datoVehiculos'),
    feedAlertas: $('ui-feedAlertas'),
    feedVacio: $('ui-feedVacio'),
    secStats: $('ui-secStats'),
    secCarretera: $('ui-secCarretera'),
    panelAjustes: $('ui-panelAjustes'),
    drawerFondo: $('ui-drawerFondo'),
    btnCerrarAjustes: $('ui-btnCerrarAjustes'),
    aforo: $('ui-aforo'),
    aforoNumero: $('ui-aforoNumero'),
    aforoPalabra: $('ui-aforoPalabra'),
    aforoReloj: $('ui-aforoReloj'),
    onboarding: $('ui-onboarding'),
    modales: $('ui-modales'),
    toasts: $('ui-toasts'),
    firmaEstudio: $('ui-firmaEstudio'),
    enlaceLegal: $('ui-enlaceLegal'),
    _ultimoRender: 0,
  };

  /* Marca y firma desde CONFIG (00-nucleo, siempre disponible) */
  if (refs.nombreApp && typeof CONFIG !== 'undefined') refs.nombreApp.textContent = CONFIG.NOMBRE_APP;
  if (refs.firmaEstudio && typeof CONFIG !== 'undefined') {
    refs.firmaEstudio.href = CONFIG.STUDIO_URL;
    refs.firmaEstudio.textContent = 'Diseñado por ' + CONFIG.STUDIO_BRAND + ' · por ' + CONFIG.STUDIO_AUTHOR;
  }

  /* Cabecera */
  if (refs.btnAforo) refs.btnAforo.addEventListener('click', () => ui_aforoPublico(true));
  if (refs.btnAjustes) refs.btnAjustes.addEventListener('click', () => { ui_abrirAjustes().catch(() => {}); });

  /* Aforo: tocar la pantalla para salir */
  if (refs.aforo) refs.aforo.addEventListener('click', () => ui_aforoPublico(false));

  /* Ajustes: cerrar (botón y fondo) */
  if (refs.btnCerrarAjustes) refs.btnCerrarAjustes.addEventListener('click', ui_cerrarAjustes);
  if (refs.drawerFondo) refs.drawerFondo.addEventListener('click', ui_cerrarAjustes);

  /* Pie: aviso legal abre ajustes en su sección legal (mejor esfuerzo) */
  if (refs.enlaceLegal) {
    refs.enlaceLegal.addEventListener('click', () => {
      ui_abrirAjustes().then((abierto) => {
        if (!abierto) return;
        try {
          const destino = document.getElementById('cfg-secLegal') || document.getElementById('cfg-legal') || document.querySelector('[data-cfg-seccion="legal"]');
          if (destino && destino.tagName === 'DETAILS') destino.open = true;
          if (destino && destino.scrollIntoView) destino.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch (e) { /* mejor esfuerzo, sin romper nada */ }
      }).catch(() => {});
    });
  }

  /* Escape cierra el overlay superior visible (aforo > modal > ajustes) */
  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    if (refs.aforo && !refs.aforo.classList.contains('oculto')) { ui_aforoPublico(false); return; }
    if (refs.modales && refs.modales.lastElementChild) {
      const btnCerrar = refs.modales.lastElementChild.querySelector('.ui-modal-cerrar');
      if (btnCerrar) { btnCerrar.click(); return; }
    }
    if (refs.panelAjustes && !refs.panelAjustes.classList.contains('oculto')) ui_cerrarAjustes();
  });

  ui_initOnboarding();
  ui_aplicarModo();

  /* Bus de eventos */
  bus.on('alerta', ui_alRecibirAlerta);
  bus.on('ia:estado', ui_alEstadoIA);
  bus.on('alerta:borradas', ui_vaciarFeed);
  bus.on('grabacion:lista', ui_alRecibirGrabacion);

  /* 🗑 Borrar avisos del feed (con confirmación). */
  const btnBorrarFeed = $('ui-btnBorrarFeed');
  if (btnBorrarFeed) btnBorrarFeed.addEventListener('click', function () {
    if (typeof ui_modal !== 'function') { if (typeof alerta_borrarLog === 'function') alerta_borrarLog(); return; }
    ui_modal('Borrar avisos', '<p>¿Borrar todos los avisos del listado? No se puede deshacer.</p>', [
      { texto: 'Cancelar', clase: 'btn-fantasma' },
      { texto: '🗑 Borrar', clase: 'btn-peligro', fn: function () { if (typeof alerta_borrarLog === 'function') alerta_borrarLog(); } },
    ]);
  });
  bus.on('video:error', ui_alVideoError);
  bus.on('modelos:error', ui_alModelosError);
  bus.on('pose:error', ui_alPoseError);
  bus.on('almacen:aviso', ui_alAvisoAlmacen);
  bus.on('telegram:ok', ui_alTelegramOk);
  bus.on('telegram:error', ui_alTelegramError);
  bus.on('rendimiento:fpsBajado', ui_alFpsBajado);
  bus.on('error:general', ui_alErrorGeneral);
  bus.on('aforo:cambio', ui_alAforoCambio);
  bus.on('cfg:cambio', ui_alCfgCambio);

  /* Primer render y asistente de bienvenida si procede. El feed se reconstruye
   * desde el log al final de alerta_init (que corre DESPUÉS y carga el log). */
  ui_actualizarContadores();
  ui_actualizarEstadoHeader();
  ui_onboarding();
}

/* ==========================================================================
 * RENDER (throttle ~2/s, solo textContent — nada de rebuilds de DOM)
 * ========================================================================*/
function ui_render() {
  const ahora = Date.now();
  if (!estado.uiRefs) return;
  if (ahora - (estado.uiRefs._ultimoRender || 0) < 500) return;
  estado.uiRefs._ultimoRender = ahora;

  ui_actualizarContadores();
  ui_actualizarEstadoHeader();
  ui_actualizarMonitor();
  if (estado.ui && estado.ui.aforoPublico) ui_actualizarAforoPantalla();
}

/* Monitor de rendimiento en vivo: fluidez del hilo (tirones), ms por análisis
 * de IA, motor activo y fps de vídeo. Se enciende en Ajustes → Sistema. */
function ui_actualizarMonitor() {
  const mon = document.getElementById('vid-monitor');
  if (!mon) return;
  const on = !!(estado.cfg && estado.cfg.monitorRend);
  mon.classList.toggle('oculto', !on);
  if (!on) return;

  const v = estado.video || {};
  const clase = (val, buena, media) => val <= buena ? 'buena' : (val <= media ? 'media' : 'mala');
  const set = (id, txt, cls) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = txt;
    el.className = cls || '';
  };

  // Fluidez: ms por frame de animación. ≤22 fluido, ≤45 aceptable, más = tirones.
  const msUI = Math.round(v.msFrameUI || 0);
  const fUI = msUI > 0 ? Math.min(60, Math.round(1000 / msUI)) : 0;
  set('vid-mon-fluidez', msUI ? (fUI + ' fps' + (msUI > 45 ? ' ⚠' : '')) : '—',
    msUI ? clase(msUI, 22, 45) : '');

  // Análisis IA: ms de la última inferencia.
  const msIA = Math.round(v.msInferencia || 0);
  set('vid-mon-ia', msIA ? (msIA + ' ms') : '—', msIA ? clase(msIA, 200, 900) : '');

  // Motor activo (+ ⧉ si corre en hilo aparte, + 🌙 si realza de noche).
  let motor = (typeof nuc_cocoWorkerListo !== 'undefined' && nuc_cocoWorkerListo) ? 'Básico ⧉' : 'Básico';
  if (estado.cfg.motor === 'yolo') motor = (estado.yolo && estado.yolo.workerListo) ? 'Potente ⧉' : 'Potente';
  else if (estado.cfg.motor === 'onnx') motor = (estado.sc && estado.sc.enWorker) ? 'Supercerebro ⧉' : 'Supercerebro';
  if (estado.video.realceNoche) motor += ' 🌙';
  set('vid-mon-motor', motor, '');

  // FPS de vídeo real (analizado).
  set('vid-mon-fps', (v.fpsReal ? v.fpsReal : 0) + ' fps IA', '');

  // Barra de carga: proporción del segundo consumida por un análisis de IA.
  const barra = document.getElementById('vid-mon-carga');
  if (barra) {
    const carga = Math.max(0, Math.min(1, msIA / 1000));
    barra.style.width = Math.round(carga * 100) + '%';
    barra.style.background = carga < 0.4 ? '#2ee584' : (carga < 0.75 ? '#ffb224' : '#ff5470');
  }
}

/* Actualiza las tarjetas de datos en directo (personas, aforo, entradas...) */
function ui_actualizarContadores() {
  const refs = estado.uiRefs;
  if (!refs || !refs.datoPersonas) return;

  const personas = (estado.tracks || []).filter((t) => t && NUC_PERSONA.indexOf(t.clase) !== -1).length;
  refs.datoPersonas.textContent = String(personas);

  const max = (estado.cfg && estado.cfg.aforoMax) || 0;
  let dentro = personas;
  if (typeof stats_aforoActual === 'function') {
    try { dentro = stats_aforoActual(); } catch (e) { dentro = personas; }
  }
  if (refs.datoAforo) refs.datoAforo.textContent = dentro + '/' + max;

  let datosHoy = null;
  if (typeof stats_datosHoy === 'function') {
    try { datosHoy = stats_datosHoy(); } catch (e) { datosHoy = null; }
  }
  if (datosHoy) {
    if (refs.datoEntradas) refs.datoEntradas.textContent = String(datosHoy.entradas || 0);
    if (refs.datoSalidas) refs.datoSalidas.textContent = String(datosHoy.salidas || 0);
    if (refs.datoAlertas) refs.datoAlertas.textContent = String((datosHoy.alertas && datosHoy.alertas.total) || 0);
    if (refs.datoVehiculos && datosHoy.vehiculos) {
      let totalVeh = 0;
      for (const k in datosHoy.vehiculos) { if (Object.prototype.hasOwnProperty.call(datosHoy.vehiculos, k)) totalVeh += (datosHoy.vehiculos[k] || 0); }
      refs.datoVehiculos.textContent = String(totalVeh);
    }
  }
}

/* Actualiza el punto y el texto de estado de la cabecera */
/* Estado del MOTOR de detección para enseñarlo SIEMPRE en la cabecera, para que
 * el dueño nunca esté a ciegas sobre por qué detecta mejor o peor. Devuelve
 * { etiqueta, nivel } con nivel 'ok' | 'cargando' | 'fallo'. Los motores pesados
 * (Potente/Supercerebro) caen solos al Básico si no cargan: aquí se ve el aviso. */
function ui_motorEstado() {
  const cfg = estado.cfg || {};
  const y = estado.yolo, s = estado.sc;
  if (cfg.motor === 'onnx') {
    if (typeof sc_activo === 'function' && sc_activo()) {
      return { etiqueta: (s && s.enWorker) ? '🧠 Supercerebro ⧉' : '🧠 Supercerebro', nivel: 'ok' };
    }
    return { etiqueta: '🧠 Cargando Supercerebro…', nivel: 'cargando' };
  }
  if (cfg.motor === 'yolo') {
    if (y && y.listo) return { etiqueta: '⚡ Potente', nivel: 'ok' };
    return { etiqueta: '⚡ Cargando Potente… (11 MB, 1ª vez)', nivel: 'cargando' };
  }
  // Motor básico activo: ¿elección propia, o CAÍDA desde un motor pesado que falló?
  if (y && y.error) return { etiqueta: '⚠ El Potente falló → va en Básico', nivel: 'fallo' };
  if (s && s.avisoBasico) return { etiqueta: '⚠ El Supercerebro falló → va en Básico', nivel: 'fallo' };
  const enW = (typeof nuc_cocoWorkerListo !== 'undefined' && nuc_cocoWorkerListo);
  return { etiqueta: enW ? '🟢 Básico ⧉' : '🟢 Básico', nivel: 'ok' };
}

function ui_actualizarEstadoHeader() {
  const refs = estado.uiRefs;
  if (!refs || !refs.estadoPunto || !refs.estadoTxt) return;
  const m = estado.modelos || {};
  const v = estado.video || {};

  refs.estadoPunto.classList.remove('ui-punto-verde', 'ui-punto-ambar', 'ui-punto-rojo');

  if (m.error) {
    refs.estadoPunto.classList.add('ui-punto-rojo');
    refs.estadoTxt.textContent = 'Error al cargar modelos de IA';
  } else if (!m.cocoListo) {
    refs.estadoPunto.classList.add('ui-punto-ambar');
    refs.estadoTxt.textContent = 'Cargando modelos de IA…';
  } else if (!v.listo) {
    refs.estadoPunto.classList.add('ui-punto-ambar');
    refs.estadoTxt.textContent = 'Esperando fuente de vídeo…';
  } else {
    // Vídeo en vivo: enseña QUÉ motor está detectando y si está cargando o cayó.
    const me = ui_motorEstado();
    if (me.nivel === 'cargando') {
      refs.estadoPunto.classList.add('ui-punto-ambar');
      refs.estadoTxt.textContent = me.etiqueta;
    } else if (me.nivel === 'fallo') {
      refs.estadoPunto.classList.add('ui-punto-ambar');
      refs.estadoTxt.textContent = me.etiqueta;
    } else {
      refs.estadoPunto.classList.add('ui-punto-verde');
      refs.estadoTxt.textContent = 'En vivo · ' + me.etiqueta;
    }
  }
}

/* Actualiza número, palabra y reloj de la pantalla pública de aforo */
function ui_actualizarAforoPantalla() {
  const refs = estado.uiRefs;
  if (!refs || !refs.aforoNumero) return;
  const max = (estado.cfg && estado.cfg.aforoMax) || 0;
  let dentro = 0;
  if (typeof stats_aforoActual === 'function') {
    try { dentro = stats_aforoActual(); } catch (e) { dentro = 0; }
  } else {
    dentro = (estado.tracks || []).filter((t) => t && NUC_PERSONA.indexOf(t.clase) !== -1).length;
  }
  refs.aforoNumero.textContent = dentro + '/' + max;
  const libre = dentro < max;
  if (refs.aforo) {
    refs.aforo.classList.toggle('ui-aforo-pase', libre);
    refs.aforo.classList.toggle('ui-aforo-espera', !libre);
  }
  if (refs.aforoPalabra) refs.aforoPalabra.textContent = libre ? 'PASE' : 'ESPERE';
  if (refs.aforoReloj) {
    try { refs.aforoReloj.textContent = new Date().toLocaleTimeString('es-ES'); }
    catch (e) { refs.aforoReloj.textContent = nuc_horaCorta(Date.now()); }
  }
}

/* Muestra/oculta la sección de carretera y la tarjeta de vehículos según el modo.
 * Respeta el selector de vistas (módulo 21): fuera de la vista carretera, el
 * panel de carretera no se re-muestra aunque cfg.modo sea 'carretera'. */
function ui_aplicarModo() {
  const refs = estado.uiRefs;
  if (!refs) return;
  const esCarretera = !!(estado.cfg && estado.cfg.modo === 'carretera');
  const enVistaCarretera = (typeof modos_vista !== 'function') || modos_vista() === 'carretera';
  if (refs.secCarretera) refs.secCarretera.classList.toggle('oculto', !(esCarretera && enVistaCarretera));
  if (refs.cardVehiculos) refs.cardVehiculos.classList.toggle('oculto', !esCarretera);
}

/* ==========================================================================
 * AVISOS: toasts y banners
 * ========================================================================*/
function ui_toast(msg, nivel) {
  nivel = nivel || 'info';
  const refs = estado.uiRefs;
  if (!refs || !refs.toasts || !msg) return;
  while (refs.toasts.children.length >= UI_TOAST_MAX) refs.toasts.removeChild(refs.toasts.firstChild);
  const el = document.createElement('div');
  el.className = 'ui-toast ui-toast-' + nivel;
  el.setAttribute('role', 'status');
  el.textContent = msg;
  refs.toasts.appendChild(el);
  setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, UI_TOAST_MS);
}

function ui_error(msg) {
  const refs = estado.uiRefs;
  if (!refs || !refs.banners || !msg) return;
  const existentes = refs.banners.querySelectorAll('.ui-banner-texto');
  for (let i = 0; i < existentes.length; i++) { if (existentes[i].textContent === msg) return; }

  while (refs.banners.children.length >= UI_BANNER_MAX) refs.banners.removeChild(refs.banners.firstChild);

  const el = document.createElement('div');
  el.className = 'ui-banner';
  el.setAttribute('role', 'alert');

  const texto = document.createElement('span');
  texto.className = 'ui-banner-texto';
  texto.textContent = msg;

  const cerrar = document.createElement('button');
  cerrar.type = 'button';
  cerrar.className = 'btn btn-mini btn-fantasma';
  cerrar.setAttribute('aria-label', 'Cerrar aviso');
  cerrar.textContent = '✕';
  cerrar.addEventListener('click', () => { if (el.parentNode) el.parentNode.removeChild(el); });

  el.appendChild(texto);
  el.appendChild(cerrar);
  refs.banners.appendChild(el);
}

/* ==========================================================================
 * FEED DE ALERTAS
 * ========================================================================*/
function ui_feedAgregar(nodo) {
  const refs = estado.uiRefs;
  if (!refs || !refs.feedAlertas) return;
  if (refs.feedVacio && refs.feedVacio.parentNode) refs.feedVacio.parentNode.removeChild(refs.feedVacio);
  refs.feedAlertas.insertBefore(nodo, refs.feedAlertas.firstChild);
  const items = refs.feedAlertas.querySelectorAll('.ui-feed-item');
  for (let i = UI_FEED_MAX; i < items.length; i++) {
    if (items[i].parentNode) items[i].parentNode.removeChild(items[i]);
  }
}

/* Construye el <li> de una alerta (insignia + hora + texto + miniatura + IA). */
function ui_feedItemNodo(registro) {
  const li = document.createElement('li');
  li.className = 'ui-feed-item';
  if (registro.id) li.setAttribute('data-alerta-id', registro.id);

  const insignia = document.createElement('span');
  const nivel = registro.nivel || 'info';
  insignia.className = 'insignia-' + nivel;
  insignia.textContent = UI_NIVEL_ETIQUETA[nivel] || 'Info';

  const hora = document.createElement('span');
  hora.className = 'ui-feed-hora';
  hora.textContent = nuc_horaCorta(registro.ts);

  const texto = document.createElement('span');
  texto.className = 'ui-feed-texto';
  texto.textContent = registro.texto || '';

  li.appendChild(insignia);
  li.appendChild(hora);
  li.appendChild(texto);

  if (registro.foto) {
    const img = document.createElement('img');
    img.className = 'ui-feed-foto';
    img.src = registro.foto;
    img.alt = 'Miniatura de la alerta';
    li.appendChild(img);
  }
  // 🧠 Veredicto de la IA pegado a la alerta (visible y persistente).
  if (registro.iaTexto) {
    const ia = document.createElement('span');
    ia.className = 'ui-feed-ia';
    ia.textContent = registro.iaTexto;
    li.appendChild(ia);
  }
  return li;
}

/* Actualiza (o crea) la línea 🧠 IA dentro de la tarjeta de una alerta, en vivo:
 * "Consultando…" → veredicto o error. Así el dueño VE que la IA trabaja. */
function ui_alEstadoIA(datos) {
  if (!datos || !datos.registroId) return;
  const refs = estado.uiRefs;
  if (!refs || !refs.feedAlertas) return;
  const li = refs.feedAlertas.querySelector('[data-alerta-id="' + datos.registroId + '"]');
  if (!li) return;
  let ia = li.querySelector('.ui-feed-ia');
  if (!ia) {
    ia = document.createElement('span');
    ia.className = 'ui-feed-ia';
    li.appendChild(ia);
  }
  ia.textContent = datos.texto || '';
  ia.classList.toggle('ui-feed-ia-alerta', datos.tono === 'critico' || datos.tono === 'sospecha');
}

function ui_alRecibirAlerta(datos) {
  const registro = datos && datos.registro;
  if (!registro) return;
  ui_feedAgregar(ui_feedItemNodo(registro));
}

/* Vacía el feed en pantalla y restaura el estado "sin alertas". */
function ui_vaciarFeed() {
  const refs = estado.uiRefs;
  if (!refs || !refs.feedAlertas) return;
  refs.feedAlertas.innerHTML = '';
  const vacio = document.createElement('li');
  vacio.className = 'ui-feed-vacio';
  vacio.id = 'ui-feedVacio';
  vacio.textContent = 'Sin alertas — todo en orden';
  refs.feedAlertas.appendChild(vacio);
  refs.feedVacio = vacio;
}

/* Reconstruye el feed desde el log guardado: tras recargar o volver de una
 * vista de cámara, las alertas (con su miniatura del momento) siguen ahí, no
 * solo en Telegram. Sin esto el feed solo mostraba lo ocurrido EN VIVO. */
function ui_reconstruirFeed() {
  try {
    const log = (estado.alerta && estado.alerta.log) || [];
    if (!log.length) return;
    // Los más recientes primero: insertamos del más viejo al más nuevo del
    // tramo visible para que ui_feedAgregar (inserta arriba) los deje en orden.
    const inicio = Math.max(0, log.length - UI_FEED_MAX);
    for (let i = inicio; i < log.length; i++) {
      ui_feedAgregar(ui_feedItemNodo(log[i]));
    }
  } catch (e) { /* el feed en vivo sigue funcionando aunque esto falle */ }
}

function ui_alRecibirGrabacion(datos) {
  if (!datos || !datos.url) return;
  const li = document.createElement('li');
  li.className = 'ui-feed-item';

  const hora = document.createElement('span');
  hora.className = 'ui-feed-hora';
  hora.textContent = nuc_horaCorta(datos.ts);

  const texto = document.createElement('span');
  texto.className = 'ui-feed-texto';
  texto.textContent = 'Grabación disponible' + (datos.motivo ? ' — ' + datos.motivo : '');

  // ▶ VER: reproduce el clip aquí mismo, en un modal (sin salir de la app).
  const ver = document.createElement('button');
  ver.type = 'button';
  ver.className = 'btn btn-mini btn-primario';
  ver.textContent = '▶ Ver';
  ver.addEventListener('click', function () {
    try {
      const cuerpo = document.createElement('div');
      const vid = document.createElement('video');
      vid.src = datos.url; vid.controls = true; vid.autoplay = true;
      vid.muted = true;   // sin esto el WebView bloquea el autoplay y el visor sale negro
      vid.playsInline = true; vid.setAttribute('playsinline', '');
      vid.style.cssText = 'width:100%;max-height:60vh;border-radius:12px;background:#000';
      const nota = document.createElement('p');
      nota.className = 'etiqueta';
      nota.style.marginTop = '6px';
      nota.textContent = 'Las grabaciones viven en la memoria de la app: si la cierras o se recarga, se pierden. Descarga las importantes.';
      cuerpo.appendChild(vid); cuerpo.appendChild(nota);
      ui_modal('🎬 ' + ('Grabación — ' + (datos.motivo || nuc_horaCorta(datos.ts))), cuerpo,
        [{ texto: 'Cerrar', clase: 'btn-fantasma', cerrar: true }]);
    } catch (e) { ui_toast('No se pudo abrir el clip.', 'sospecha'); }
  });

  const enlace = document.createElement('a');
  enlace.className = 'btn btn-mini btn-fantasma';
  enlace.href = datos.url;
  enlace.download = datos.nombre || 'grabacion.webm';
  enlace.textContent = '⬇ Descargar';
  // En el APK (WebView) los enlaces blob: no descargan NADA: se usa el puente
  // VigiaAndroid.guardarArchivo → escribe el clip en la carpeta Descargas.
  enlace.addEventListener('click', function (e) {
    try {
      if (!(window.VigiaAndroid && window.VigiaAndroid.guardarArchivo)) {
        // APK ANTIGUO (WebView sin puente): el enlace blob: no descarga NADA y
        // fallaba en silencio. Ahora se avisa con la solución.
        if (/; wv\)/.test(navigator.userAgent || '')) {
          e.preventDefault();
          ui_toast('⬇ Tu APK es antiguo y no puede guardar clips. Instala el APK nuevo (v3.78+) del enlace de siempre: se instala ENCIMA, sin perder nada.', 'sospecha');
        }
        return;  // navegador normal: enlace de descarga estándar
      }
      e.preventDefault();
      ui_toast('Guardando el vídeo en Descargas…', 'info');
      fetch(datos.url).then(function (r) { return r.blob(); }).then(function (blob) {
        const fr = new FileReader();
        fr.onload = function () {
          const b64 = String(fr.result || '').split(',')[1] || '';
          if (!b64) { ui_toast('No se pudo leer el clip.', 'sospecha'); return; }
          window.VigiaAndroid.guardarArchivo(b64, datos.nombre || 'grabacion.webm', blob.type || 'video/webm');
        };
        fr.onerror = function () { ui_toast('No se pudo leer el clip.', 'sospecha'); };
        fr.readAsDataURL(blob);
      }).catch(function () { ui_toast('No se pudo leer el clip para guardarlo.', 'sospecha'); });
    } catch (err) { /* enlace normal como respaldo */ }
  });

  li.appendChild(hora);
  li.appendChild(texto);
  li.appendChild(ver);
  li.appendChild(enlace);

  ui_feedAgregar(li);
}

/* ==========================================================================
 * MANEJADORES DEL BUS
 * ========================================================================*/
function ui_alVideoError(datos) { ui_error((datos && datos.msg) || 'No se pudo iniciar el vídeo.'); }
function ui_alModelosError(datos) { ui_error((datos && datos.msg) || 'No se pudieron cargar los modelos de IA.'); }
function ui_alPoseError(datos) { ui_error((datos && datos.msg) || 'La detección de gestos no está disponible en este dispositivo. El resto de la vigilancia sigue funcionando.'); }

function ui_alAvisoAlmacen() {
  if (!estado.ui) return;
  if (estado.ui._avisoAlmacenMostrado) return;
  estado.ui._avisoAlmacenMostrado = true;
  ui_error('Almacenamiento casi lleno — borra alertas o grabaciones antiguas en Ajustes › Sistema.');
}

function ui_alTelegramOk() { ui_toast('Telegram funciona ✓'); }
function ui_alTelegramError(datos) { ui_toast((datos && datos.msg) || 'No se pudo conectar con Telegram.', 'critico'); }

function ui_alFpsBajado(datos) {
  const fps = datos && datos.fps;
  ui_toast(fps ? ('Bajando a ' + fps + ' fps para mantener la fluidez.') : 'Ajustando la velocidad de análisis para mantener la fluidez.');
}

function ui_alErrorGeneral(datos) { ui_error((datos && datos.msg) || 'Ha ocurrido un error inesperado.'); }

function ui_alAforoCambio() {
  ui_actualizarContadores();
  if (estado.ui && estado.ui.aforoPublico) ui_actualizarAforoPantalla();
}

function ui_alCfgCambio() {
  ui_aplicarModo();
  ui_actualizarContadores();
}

/* ==========================================================================
 * ONBOARDING (asistente de 3 pasos)
 * ========================================================================*/
function ui_initOnboarding() {
  const modoSuper = document.getElementById('ui-modoSuper');
  const modoCarretera = document.getElementById('ui-modoCarretera');
  const fuenteCamara = document.getElementById('ui-fuenteCamara');
  const fuenteIP = document.getElementById('ui-fuenteIP');
  const fuenteDemo = document.getElementById('ui-fuenteDemo');
  const fuenteSaltar = document.getElementById('ui-fuenteSaltar');
  const dibujarLinea = document.getElementById('ui-dibujarLinea');
  const terminar = document.getElementById('ui-onboardingTerminar');

  const elegirModo = (modo) => {
    estado.cfg.modo = modo;
    nuc_guardar('cfg', estado.cfg);
    bus.emit('cfg:cambio', { clave: 'modo' });
    ui_onboardingPaso(2);
  };
  if (modoSuper) modoSuper.addEventListener('click', () => elegirModo('super'));
  if (modoCarretera) modoCarretera.addEventListener('click', () => elegirModo('carretera'));

  if (fuenteCamara) fuenteCamara.addEventListener('click', () => {
    if (typeof vid_usarCamara === 'function') {
      vid_usarCamara().catch(() => {}).then(() => ui_onboardingPaso(3));
    } else {
      ui_onboardingPaso(3);
    }
  });

  if (fuenteIP) fuenteIP.addEventListener('click', () => {
    ui_onboardingCerrar();
    ui_abrirAjustes().catch(() => {});
  });

  if (fuenteDemo) fuenteDemo.addEventListener('click', () => {
    // Única puerta de vídeo demo: el selector del visor (vid-inputDemo).
    const input = document.getElementById('vid-inputDemo');
    if (input) input.click();
    ui_onboardingPaso(3);
  });

  if (fuenteSaltar) fuenteSaltar.addEventListener('click', () => { ui_onboardingPaso(3); });

  if (dibujarLinea) dibujarLinea.addEventListener('click', () => {
    if (typeof zona_iniciarLinea === 'function') zona_iniciarLinea();
    ui_onboardingCerrar();
  });

  if (terminar) terminar.addEventListener('click', ui_onboardingCerrar);
}

function ui_onboardingPaso(n) {
  const pasos = document.querySelectorAll('#ui-onboarding .ui-onboarding-paso');
  pasos.forEach((p) => { p.classList.toggle('oculto', Number(p.getAttribute('data-paso')) !== n); });
}

function ui_onboardingCerrar() {
  nuc_guardar('onboarding', true);
  const refs = estado.uiRefs;
  if (refs && refs.onboarding) refs.onboarding.classList.add('oculto');
}

/* Muestra el asistente si el usuario no lo completó todavía */
function ui_onboarding() {
  const refs = estado.uiRefs;
  if (!refs || !refs.onboarding) return;
  if (nuc_cargar('onboarding', false)) { refs.onboarding.classList.add('oculto'); return; }
  ui_onboardingPaso(1);
  refs.onboarding.classList.remove('oculto');
}

/* ==========================================================================
 * PANTALLA PÚBLICA DE AFORO
 * ========================================================================*/
function ui_aforoPublico(on) {
  const refs = estado.uiRefs;
  if (!refs || !refs.aforo) return;
  if (!estado.ui) estado.ui = {};
  estado.ui.aforoPublico = !!on;
  refs.aforo.classList.toggle('oculto', !on);

  if (on) {
    ui_actualizarAforoPantalla();
    try {
      if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
    } catch (e) { /* file:// o navegador sin soporte: pantalla completa no crítica */ }
  } else {
    try {
      if (document.exitFullscreen && document.fullscreenElement) document.exitFullscreen().catch(() => {});
    } catch (e) { /* ignorar */ }
  }
}

/* ==========================================================================
 * PANEL DE AJUSTES
 * ========================================================================*/
async function ui_abrirAjustes() {
  const refs = estado.uiRefs;
  if (!refs || !refs.panelAjustes) return false;
  let ok = true;
  if (typeof cfg_pinPedir === 'function') {
    try { ok = await cfg_pinPedir('ajustes'); } catch (e) { ok = false; }
  }
  if (!ok) return false;
  refs.panelAjustes.classList.remove('oculto');
  if (refs.drawerFondo) refs.drawerFondo.classList.remove('oculto');
  return true;
}

function ui_cerrarAjustes() {
  const refs = estado.uiRefs;
  if (!refs || !refs.panelAjustes) return;
  refs.panelAjustes.classList.add('oculto');
  if (refs.drawerFondo) refs.drawerFondo.classList.add('oculto');
}

/* ==========================================================================
 * MODAL GENÉRICO (usado por otros módulos: PIN, calibración, confirmaciones…)
 * ========================================================================*/
function ui_modal(titulo, cuerpo, botones) {
  const refs = estado.uiRefs;
  const cont = (refs && refs.modales) || document.getElementById('ui-modales');
  if (!cont) return { cerrar() {} };

  const fondo = document.createElement('div');
  fondo.className = 'ui-modal-fondo';

  const caja = document.createElement('div');
  caja.className = 'ui-modal tarjeta';
  caja.setAttribute('role', 'dialog');
  caja.setAttribute('aria-modal', 'true');
  if (titulo) caja.setAttribute('aria-label', String(titulo));

  const cabecera = document.createElement('div');
  cabecera.className = 'ui-modal-cabecera';
  const h = document.createElement('h3');
  h.className = 'sec-titulo';
  h.textContent = titulo || '';
  const btnX = document.createElement('button');
  btnX.type = 'button';
  btnX.className = 'btn btn-mini btn-fantasma ui-modal-cerrar';
  btnX.setAttribute('aria-label', 'Cerrar');
  btnX.textContent = '✕';
  cabecera.appendChild(h);
  cabecera.appendChild(btnX);

  const cuerpoEl = document.createElement('div');
  cuerpoEl.className = 'ui-modal-cuerpo';
  if (cuerpo instanceof Node) {
    cuerpoEl.appendChild(cuerpo);
  } else if (typeof cuerpo === 'string') {
    cuerpoEl.innerHTML = cuerpo;
  }

  caja.appendChild(cabecera);
  caja.appendChild(cuerpoEl);

  if (botones && botones.length) {
    const pie = document.createElement('div');
    pie.className = 'fila ui-modal-pie';
    botones.forEach((b) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn ' + (b && b.clase ? b.clase : 'btn-fantasma');
      btn.textContent = (b && b.texto) || '';
      btn.addEventListener('click', () => {
        let seguir = true;
        if (b && typeof b.fn === 'function') seguir = b.fn();
        if (seguir !== false) cerrar();
      });
      pie.appendChild(btn);
    });
    caja.appendChild(pie);
  }

  fondo.appendChild(caja);
  cont.appendChild(fondo);

  function cerrar() { if (fondo.parentNode) fondo.parentNode.removeChild(fondo); }
  btnX.addEventListener('click', cerrar);
  fondo.addEventListener('click', (ev) => { if (ev.target === fondo) cerrar(); });

  return { cerrar };
}

/* Confirmación asíncrona con el modal propio (NUNCA confirm() nativo: bloquea
 * el hilo y congela la app en la verificación automática). */
function ui_confirmar(msg, textoOk) {
  return new Promise((resolve) => {
    let decidido = false;
    const decidir = (v) => { if (!decidido) { decidido = true; resolve(v); } };
    const m = ui_modal('Confirmar', '<p>' + String(msg || '¿Seguro?') + '</p>', [
      { texto: 'Cancelar', clase: 'btn-fantasma', fn: () => { decidir(false); } },
      { texto: textoOk || 'Sí, continuar', clase: 'btn-peligro', fn: () => { decidir(true); } },
    ]);
    if (!m || !m.cerrar) { decidir(false); return; }
    // Si el usuario cierra con la X o tocando el fondo, cuenta como "cancelar"
    const contM = document.getElementById('ui-modales');
    if (contM) {
      const obs = new MutationObserver(() => {
        if (!contM.children.length) { decidir(false); obs.disconnect(); }
      });
      obs.observe(contM, { childList: true });
      setTimeout(() => { obs.disconnect(); decidir(false); }, 120000);
    }
  });
}

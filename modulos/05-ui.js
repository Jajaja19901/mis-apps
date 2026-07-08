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
  bus.on('grabacion:lista', ui_alRecibirGrabacion);
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

  /* Primer render y asistente de bienvenida si procede */
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
  if (estado.ui && estado.ui.aforoPublico) ui_actualizarAforoPantalla();
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
    refs.estadoPunto.classList.add('ui-punto-verde');
    refs.estadoTxt.textContent = 'En vivo';
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

/* Muestra/oculta la sección de carretera y la tarjeta de vehículos según el modo */
function ui_aplicarModo() {
  const refs = estado.uiRefs;
  if (!refs) return;
  const esCarretera = !!(estado.cfg && estado.cfg.modo === 'carretera');
  if (refs.secCarretera) refs.secCarretera.classList.toggle('oculto', !esCarretera);
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

function ui_alRecibirAlerta(datos) {
  const registro = datos && datos.registro;
  if (!registro) return;
  const li = document.createElement('li');
  li.className = 'ui-feed-item';

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

  ui_feedAgregar(li);
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

  const enlace = document.createElement('a');
  enlace.className = 'btn btn-mini btn-fantasma';
  enlace.href = datos.url;
  enlace.download = datos.nombre || 'grabacion.webm';
  enlace.textContent = 'Descargar clip';

  li.appendChild(hora);
  li.appendChild(texto);
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
    const input = document.getElementById('cfg-archivoDemo');
    if (input) input.click();
    ui_onboardingPaso(3);
  });

  if (fuenteSaltar) fuenteSaltar.addEventListener('click', ui_onboardingCerrar);

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

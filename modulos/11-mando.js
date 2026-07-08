/* ============================================================================
 * 11-MANDO — VIGÍA IA · PUESTO DE MANDO REMOTO (prefijo mando_ / MANDO_).
 * Amplía la app v1 con un "modo mando": el móvil deja de analizar y pasa a ser
 * el mando a distancia del CEREBRO (proceso Python). Muestra el vídeo en vivo
 * (MSE por WebSocket con fallback a MP4 progresivo y, en último caso, a foto),
 * recibe alertas en tiempo real (reutilizando el motor de alertas v1), arma y
 * desarma, y edita las zonas de cada cámara sobre su fotograma real.
 * Estado propio en estado.mando. Todas las llamadas de red pasan por mando_fetch.
 * Contratos: modulos/CONTRATOS.md (§0, §8, §9) y vigia-cerebro/CONTRATOS-API.md.
 * ==========================================================================*/

/* --- Constantes -------------------------------------------------------------*/
const MANDO_TIMEOUT_MS = 10000;         // corte de peticiones HTTP
const MANDO_BACKOFF_INI = 1000;         // reconexión WS: 1 s inicial
const MANDO_BACKOFF_MAX = 30000;        // reconexión WS: 30 s máximo
const MANDO_FOTO_MS = 2000;             // refresco del fallback "modo foto"
const MANDO_MSE_MAX_FALLOS = 2;         // fallos de MSE antes de pasar a MP4
const MANDO_MSE_BUFFER_SEG = 10;        // segundos a conservar al recortar buffer
const MANDO_MOSAICO_MAX = 4;            // celdas visibles a la vez
const MANDO_ERROR_ANTISPAM_MS = 15000;  // no repetir el mismo aviso de error
/* Códecs candidatos a anunciar a go2rtc para negociar MSE. */
const MANDO_CODECS = ['avc1.640029', 'avc1.4d002a', 'avc1.42e01e', 'hvc1.1.6.L153.B0', 'mp4a.40.2', 'opus'];

/* ============================================================================
 * ARRANQUE
 * ==========================================================================*/
function mando_init() {
  if (estado.mando && estado.mando.inited) return;
  estado.mando = Object.assign({
    inited: false,
    activo: false,        // ¿modo mando encendido? (la v1 local queda intacta)
    url: '',
    token: '',
    conectado: false,     // ¿WS de eventos vivo?
    ws: null,
    wsBackoff: MANDO_BACKOFF_INI,
    wsTimer: 0,
    wsCerradoAdrede: false,
    camaras: [],          // catálogo de GET /camaras
    visibles: [],         // ids de cámaras mostradas en el mosaico
    celdas: {},           // id → {nodo, media, video, img, ws, ms, sb, cola, ...}
    camarasEstado: {},    // id → {conectada, armada, fps}
    armadoGlobal: false,
    horario: null,
    errores: {},          // msg → ts (antispam de avisos)
    editandoZonas: false,
    zonasBackup: null,
    zonasRAF: 0,
    zonasImg: null,
  }, estado.mando || {});

  mando_wire();

  // Reconexión al arrancar si había una sesión de mando guardada y activa.
  const guardado = nuc_cargar('mando', null);
  if (guardado && typeof guardado === 'object') {
    estado.mando.url = mando_normalizarUrl(guardado.url || '');
    estado.mando.token = (guardado.token || '').trim();
    mando_rellenarCampos({ url: estado.mando.url, token: estado.mando.token });
    if (guardado.activo && estado.mando.url && estado.mando.token) {
      mando_alternar(true);
    }
  }

  estado.mando.inited = true;
}

/* Enlaza todos los listeners de la interfaz (cada uno con guarda-clause). */
function mando_wire() {
  mando_alBoton('ui-btnModoMando', mando_alternar);
  mando_alBoton('mando-btnConectar', mando_conectar);
  mando_alBoton('mando-btnPegarQR', mando_pegarQR);
  mando_alBoton('mando-btnDesconectar', mando_desconectar);
  mando_alBoton('mando-btnArmado', mando_alternarArmadoGlobal);
  mando_alBoton('mando-btnHorario', mando_guardarHorario);
  mando_alBoton('mando-btnRefrescar', function () { mando_cargarCamaras(); mando_cargarEstado(); });

  // Si pegan un vigia://… directamente en el campo URL, lo parseamos al salir.
  const url = document.getElementById('mando-url');
  if (url) url.addEventListener('change', function () {
    const c = mando_parseConexion(url.value);
    if (c) mando_rellenarCampos(c);
  });
}

function mando_alBoton(id, fn) {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', fn);
}

/* ============================================================================
 * ALTERNAR MODO LOCAL ↔ MANDO
 * ==========================================================================*/
function mando_alternar(forzar) {
  if (!estado.mando) mando_init();
  const destino = (typeof forzar === 'boolean') ? forzar : !estado.mando.activo;
  estado.mando.activo = destino;

  const secVideo = document.getElementById('ui-secVideo');
  const secMando = document.getElementById('ui-secMando');
  const boton = document.getElementById('ui-btnModoMando');

  if (destino) {
    if (secVideo) secVideo.classList.add('oculto');
    if (secMando) secMando.classList.remove('oculto');
    if (boton) boton.textContent = '📷 Local';
    // Al entrar: si ya hay credenciales, conecta; si no, muestra el formulario.
    if (estado.mando.url && estado.mando.token) mando_conectar();
    else mando_actualizarUIConexion(false);
  } else {
    if (secMando) secMando.classList.add('oculto');
    if (secVideo) secVideo.classList.remove('oculto');
    if (boton) boton.textContent = '🧠 Mando';
    mando_pararTodo();
  }
  mando_guardarConfig();
}

/* Cierra WS, streams y editor de zonas. NO toca nada del modo local. */
function mando_pararTodo() {
  if (estado.mando.editandoZonas) mando_cerrarZonas();
  mando_wsCerrar();
  mando_destruirMosaico();
  estado.mando.conectado = false;
  mando_pintarEstadoCerebro(false);
}

/* ============================================================================
 * CONEXIÓN
 * ==========================================================================*/
function mando_conectar() {
  const campoUrl = document.getElementById('mando-url');
  const campoToken = document.getElementById('mando-token');
  let url = campoUrl ? campoUrl.value : estado.mando.url;
  let token = campoToken ? campoToken.value : estado.mando.token;

  // Si en el campo URL viene un vigia://… o "url#token", tiene prioridad.
  const parsed = mando_parseConexion(url);
  if (parsed) {
    url = parsed.url;
    if (parsed.token) token = parsed.token;
  } else {
    url = mando_normalizarUrl(url);
  }
  token = (token || '').trim();

  if (!url) { mando_avisar('Escribe la dirección del cerebro (o pega su código QR).'); return; }
  if (!token) { mando_avisar('Falta el token de acceso del cerebro.'); return; }

  estado.mando.url = url;
  estado.mando.token = token;
  estado.mando.activo = true;
  mando_rellenarCampos({ url: url, token: token });
  mando_guardarConfig();

  mando_actualizarUIConexion(true);
  mando_wsConectar();
  mando_cargarCamaras();
  mando_cargarEstado();
  if (typeof ui_toast === 'function') { try { ui_toast('Conectando con el cerebro…'); } catch (e) {} }
}

function mando_desconectar() {
  mando_pararTodo();
  mando_actualizarUIConexion(false);
  if (typeof ui_toast === 'function') { try { ui_toast('Desconectado del cerebro.'); } catch (e) {} }
}

/* Muestra el formulario de conexión o el panel operativo. */
function mando_actualizarUIConexion(conectado) {
  const conexion = document.getElementById('mando-conexion');
  const panel = document.getElementById('mando-panelConectado');
  const btnDesc = document.getElementById('mando-btnDesconectar');
  if (conexion) conexion.classList.toggle('oculto', !!conectado);
  if (panel) panel.classList.toggle('oculto', !conectado);
  if (btnDesc) btnDesc.classList.toggle('oculto', !conectado);
}

function mando_guardarConfig() {
  nuc_guardar('mando', { url: estado.mando.url, token: estado.mando.token, activo: estado.mando.activo });
}

function mando_rellenarCampos(c) {
  const url = document.getElementById('mando-url');
  const token = document.getElementById('mando-token');
  if (url && c.url != null) url.value = c.url;
  if (token && c.token != null && c.token !== '') token.value = c.token;
}

/* Lee el portapapeles (o el propio campo) y extrae url+token del vigia://… */
function mando_pegarQR() {
  const intentar = function (txt) {
    const c = mando_parseConexion(txt);
    if (c) {
      mando_rellenarCampos(c);
      if (typeof ui_toast === 'function') { try { ui_toast('Código leído. Pulsa "Conectar".'); } catch (e) {} }
    } else {
      mando_avisar('No reconozco ese código. Debe empezar por vigia://');
    }
  };
  try {
    if (navigator.clipboard && navigator.clipboard.readText) {
      navigator.clipboard.readText()
        .then(intentar)
        .catch(function () { const u = document.getElementById('mando-url'); intentar(u ? u.value : ''); });
      return;
    }
  } catch (e) { /* sin portapapeles: caemos al campo */ }
  const u = document.getElementById('mando-url');
  intentar(u ? u.value : '');
}

/* Parsea `vigia://URL#TOKEN` (o "URL#TOKEN"). Devuelve {url, token} o null. */
function mando_parseConexion(texto) {
  if (!texto) return null;
  let t = String(texto).trim();
  if (t.indexOf('vigia://') === 0) t = t.slice('vigia://'.length);
  else if (t.indexOf('#') < 0) return null;   // texto normal sin token embebido
  const h = t.indexOf('#');
  const urlPart = h >= 0 ? t.slice(0, h) : t;
  const token = h >= 0 ? t.slice(h + 1) : '';
  const url = mando_normalizarUrl(urlPart);
  if (!url) return null;
  return { url: url, token: token.trim() };
}

/* Normaliza una URL: recorta, añade https:// si falta y quita la barra final. */
function mando_normalizarUrl(u) {
  let s = String(u || '').trim();
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  s = s.replace(/\/+$/, '');
  return s;
}

/* ============================================================================
 * PETICIÓN CENTRAL — mando_fetch (base + token + timeout + errores sin spam)
 * opciones: {metodo, cuerpo(objeto→JSON), headers, tipo:'json'|'texto'}
 * NUNCA lanza: ante cualquier fallo avisa una vez y devuelve null.
 * ==========================================================================*/
function mando_fetch(ruta, opciones) {
  opciones = opciones || {};
  return new Promise(function (resolve) {
    if (!estado.mando || !estado.mando.url) { resolve(null); return; }
    let controlador, temporizador;
    try { controlador = new AbortController(); } catch (e) { controlador = null; }
    if (controlador) temporizador = setTimeout(function () { try { controlador.abort(); } catch (e) {} }, MANDO_TIMEOUT_MS);

    const destino = (ruta.indexOf('http') === 0) ? ruta : (estado.mando.url + (ruta.charAt(0) === '/' ? ruta : '/' + ruta));
    const cabeceras = Object.assign({ 'X-Vigia-Token': estado.mando.token || '' }, opciones.headers || {});
    const init = { headers: cabeceras };
    if (controlador) init.signal = controlador.signal;
    if (opciones.metodo) init.method = opciones.metodo;
    if (opciones.cuerpo !== undefined) {
      init.method = opciones.metodo || 'POST';
      init.body = (typeof opciones.cuerpo === 'string') ? opciones.cuerpo : JSON.stringify(opciones.cuerpo);
      cabeceras['Content-Type'] = 'application/json';
    }

    const limpiar = function () { if (temporizador) clearTimeout(temporizador); };

    fetch(destino, init).then(function (resp) {
      limpiar();
      if (!resp.ok) {
        mando_avisar(mando_msgHttp(resp.status));
        resolve(null);
        return;
      }
      const ct = (resp.headers && resp.headers.get('content-type')) || '';
      if (opciones.tipo === 'texto') { resp.text().then(resolve).catch(function () { resolve(null); }); return; }
      if (ct.indexOf('application/json') >= 0) { resp.json().then(resolve).catch(function () { resolve(null); }); return; }
      resp.text().then(resolve).catch(function () { resolve(null); });
    }).catch(function (e) {
      limpiar();
      const abortado = e && (e.name === 'AbortError');
      mando_avisar(abortado
        ? 'El cerebro tardó demasiado en responder. Revisa tu conexión.'
        : 'No se pudo conectar con el cerebro. Comprueba la dirección y tu conexión.');
      resolve(null);
    });
  });
}

/* Añade ?token=/&token= a una ruta para <img>/<video>/descargas y streams. */
function mando_urlConToken(ruta) {
  if (!estado.mando) return ruta;
  const base = estado.mando.url || '';
  let r = ruta || '';
  if (r.indexOf('http') !== 0 && r.indexOf('ws') !== 0) r = base + (r.charAt(0) === '/' ? r : '/' + r);
  const sep = r.indexOf('?') >= 0 ? '&' : '?';
  return r + sep + 'token=' + encodeURIComponent(estado.mando.token || '');
}

/* Convierte una URL http(s) en ws(s) para los WebSocket. */
function mando_aWs(url) { return String(url).replace(/^http/i, 'ws'); }

function mando_msgHttp(status) {
  if (status === 401) return 'El token no es válido: revísalo y vuelve a conectar.';
  if (status === 404) return 'El cerebro no encontró ese recurso.';
  if (status === 422) return 'El cerebro rechazó los datos enviados.';
  return 'El cerebro respondió con un error (' + status + ').';
}

/* Aviso al usuario sin spam: el mismo mensaje no se repite en 15 s. */
function mando_avisar(msg) {
  if (!msg) return;
  const ahora = Date.now();
  const prev = estado.mando && estado.mando.errores ? (estado.mando.errores[msg] || 0) : 0;
  if (ahora - prev < MANDO_ERROR_ANTISPAM_MS) return;
  if (estado.mando && estado.mando.errores) estado.mando.errores[msg] = ahora;
  if (typeof ui_error === 'function') { try { ui_error(msg); return; } catch (e) {} }
  if (typeof ui_toast === 'function') { try { ui_toast(msg, 'critico'); } catch (e) {} }
}

/* ============================================================================
 * ESTADO (armado / cámaras) desde /estado y del WS
 * ==========================================================================*/
function mando_cargarEstado() {
  mando_fetch('/api/v1/estado').then(function (d) {
    if (!d) return;
    if (d.armado) mando_aplicarArmado(d.armado);
    if (Array.isArray(d.camaras)) mando_aplicarCamarasEstado(d.camaras);
  });
}

function mando_aplicarArmado(armado) {
  if (!armado) return;
  estado.mando.armadoGlobal = !!armado.global;
  estado.mando.horario = armado.horario || estado.mando.horario;
  mando_pintarArmadoGlobal();
  mando_pintarHorario();
}

function mando_aplicarCamarasEstado(lista) {
  (lista || []).forEach(function (c) {
    if (!c || !c.id) return;
    estado.mando.camarasEstado[c.id] = {
      conectada: !!c.conectada,
      armada: !!c.armada,
      fps: (c.fps_real != null) ? c.fps_real : (c.fps || 0),
      nombre: c.nombre || (estado.mando.camarasEstado[c.id] && estado.mando.camarasEstado[c.id].nombre) || c.id,
    };
  });
  mando_actualizarCeldasEstado();
}

function mando_pintarArmadoGlobal() {
  const b = document.getElementById('mando-btnArmado');
  if (!b) return;
  if (estado.mando.armadoGlobal) {
    b.textContent = '🔴 ARMADO — tocar para desarmar';
    b.classList.add('mando-armado-on'); b.classList.remove('mando-armado-off');
  } else {
    b.textContent = '🟢 DESARMADO — tocar para armar';
    b.classList.add('mando-armado-off'); b.classList.remove('mando-armado-on');
  }
}

function mando_pintarHorario() {
  const h = estado.mando.horario;
  if (!h) return;
  const on = document.getElementById('mando-horarioOn');
  const ini = document.getElementById('mando-horaIni');
  const fin = document.getElementById('mando-horaFin');
  if (on) on.checked = !!h.activo;
  if (ini && h.inicio) ini.value = h.inicio;
  if (fin && h.fin) fin.value = h.fin;
}

/* ============================================================================
 * ARMAR / DESARMAR (protegido con el PIN de la v1)
 * ==========================================================================*/
function mando_alternarArmadoGlobal() {
  mando_pedirPinYArmar(!estado.mando.armadoGlobal, {});
}

function mando_pedirPinYArmar(armar, cuerpo) {
  const hacer = function () { mando_enviarArmado(armar, cuerpo); };
  if (typeof cfg_pinPedir === 'function') {
    try { cfg_pinPedir('armar/desarmar').then(function (ok) { if (ok) hacer(); }).catch(function () {}); return; }
    catch (e) { /* si el PIN falla, seguimos sin bloquear */ }
  }
  hacer();
}

function mando_enviarArmado(armar, cuerpo) {
  const ruta = armar ? '/api/v1/armar' : '/api/v1/desarmar';
  mando_fetch(ruta, { metodo: 'POST', cuerpo: cuerpo || {} }).then(function (r) {
    if (r && r.armado) mando_aplicarArmado(r.armado);
    if (r && Array.isArray(r.armado && r.armado.camaras)) mando_aplicarCamarasEstado(r.armado.camaras);
    // Un /estado fresco deja cámaras y global perfectamente sincronizados.
    mando_cargarEstado();
  });
}

function mando_guardarHorario() {
  const on = document.getElementById('mando-horarioOn');
  const ini = document.getElementById('mando-horaIni');
  const fin = document.getElementById('mando-horaFin');
  const cuerpo = {
    activo: !!(on && on.checked),
    inicio: (ini && ini.value) || '22:00',
    fin: (fin && fin.value) || '08:00',
  };
  mando_fetch('/api/v1/horario', { metodo: 'POST', cuerpo: cuerpo }).then(function (r) {
    if (r && r.ok) {
      estado.mando.horario = cuerpo;
      if (typeof ui_toast === 'function') { try { ui_toast('Horario guardado en el cerebro ✓'); } catch (e) {} }
    }
  });
}

/* ============================================================================
 * MOSAICO DE CÁMARAS
 * ==========================================================================*/
function mando_cargarCamaras() {
  mando_fetch('/api/v1/camaras').then(function (lista) {
    if (!Array.isArray(lista)) return;
    estado.mando.camaras = lista;
    // Guarda el nombre en el mapa de estado por si aún no llegó por WS.
    lista.forEach(function (c) {
      if (!c || !c.id) return;
      estado.mando.camarasEstado[c.id] = estado.mando.camarasEstado[c.id] || { conectada: false, armada: false, fps: 0 };
      estado.mando.camarasEstado[c.id].nombre = c.nombre || c.id;
    });
    // Por defecto, las primeras hasta 4.
    if (!estado.mando.visibles.length || !mando_visiblesValidas()) {
      estado.mando.visibles = lista.slice(0, MANDO_MOSAICO_MAX).map(function (c) { return c.id; });
    }
    mando_construirChips();
    mando_construirMosaico();
  });
}

/* ¿Las cámaras marcadas como visibles siguen existiendo en el catálogo? */
function mando_visiblesValidas() {
  const ids = estado.mando.camaras.map(function (c) { return c.id; });
  return estado.mando.visibles.every(function (id) { return ids.indexOf(id) >= 0; });
}

/* Selector de cámaras (chips) solo cuando hay más de 4. */
function mando_construirChips() {
  const cont = document.getElementById('mando-chips');
  if (!cont) return;
  cont.innerHTML = '';
  if (estado.mando.camaras.length <= MANDO_MOSAICO_MAX) { cont.classList.add('oculto'); return; }
  cont.classList.remove('oculto');
  estado.mando.camaras.forEach(function (c) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'mando-chip';
    chip.textContent = c.nombre || c.id;
    const activo = estado.mando.visibles.indexOf(c.id) >= 0;
    chip.setAttribute('aria-pressed', activo ? 'true' : 'false');
    chip.addEventListener('click', function () { mando_alternarVisible(c.id); });
    cont.appendChild(chip);
  });
}

function mando_alternarVisible(id) {
  const i = estado.mando.visibles.indexOf(id);
  if (i >= 0) {
    if (estado.mando.visibles.length <= 1) return;   // deja siempre al menos una
    estado.mando.visibles.splice(i, 1);
  } else {
    if (estado.mando.visibles.length >= MANDO_MOSAICO_MAX) {
      if (typeof ui_toast === 'function') { try { ui_toast('Máximo ' + MANDO_MOSAICO_MAX + ' cámaras a la vez.'); } catch (e) {} }
      return;
    }
    estado.mando.visibles.push(id);
  }
  mando_construirChips();
  mando_construirMosaico();
}

function mando_construirMosaico() {
  const mosaico = document.getElementById('mando-mosaico');
  if (!mosaico) return;
  mando_destruirMosaico();
  const n = estado.mando.visibles.length;
  mosaico.style.gridTemplateColumns = (n <= 1) ? '1fr' : '1fr 1fr';

  estado.mando.visibles.forEach(function (id) {
    const cam = estado.mando.camaras.filter(function (c) { return c.id === id; })[0];
    if (!cam) return;
    mando_crearCelda(cam);
  });
  mando_actualizarCeldasEstado();
}

function mando_destruirMosaico() {
  const mosaico = document.getElementById('mando-mosaico');
  const celdas = estado.mando.celdas || {};
  Object.keys(celdas).forEach(function (id) { mando_cerrarCelda(celdas[id]); });
  estado.mando.celdas = {};
  if (mosaico) mosaico.innerHTML = '';
}

/* Crea el nodo de una celda con su cabecera, pie de controles y arranca el MSE. */
function mando_crearCelda(cam) {
  const mosaico = document.getElementById('mando-mosaico');
  if (!mosaico) return;

  const nodo = document.createElement('div');
  nodo.className = 'mando-celda';

  const media = document.createElement('div');
  media.className = 'mando-media';
  const cargando = document.createElement('span');
  cargando.className = 'mando-celda-cargando';
  cargando.textContent = 'Conectando…';
  media.appendChild(cargando);

  const cab = document.createElement('div');
  cab.className = 'mando-celda-cab';
  const punto = document.createElement('span');
  punto.className = 'mando-punto';
  const nombre = document.createElement('span');
  nombre.textContent = cam.nombre || cam.id;
  cab.appendChild(punto);
  cab.appendChild(nombre);

  const pie = document.createElement('div');
  pie.className = 'mando-celda-pie';
  const btnArmar = document.createElement('button');
  btnArmar.type = 'button';
  btnArmar.className = 'btn btn-mini';
  btnArmar.textContent = 'Armar';
  btnArmar.addEventListener('click', function (ev) {
    ev.stopPropagation();
    const est = estado.mando.camarasEstado[cam.id] || {};
    mando_pedirPinYArmar(!est.armada, { camara_id: cam.id });
  });
  const btnZonas = document.createElement('button');
  btnZonas.type = 'button';
  btnZonas.className = 'btn btn-mini btn-fantasma';
  btnZonas.textContent = '✏ Zonas';
  btnZonas.addEventListener('click', function (ev) { ev.stopPropagation(); mando_editarZonas(cam.id); });
  pie.appendChild(btnArmar);
  pie.appendChild(btnZonas);

  // Tocar la celda (fuera de los botones) → pantalla completa y de vuelta.
  media.addEventListener('click', function () { nodo.classList.toggle('mando-celda-full'); });

  nodo.appendChild(media);
  nodo.appendChild(cab);
  nodo.appendChild(pie);
  mosaico.appendChild(nodo);

  const ce = {
    cam: cam, nodo: nodo, media: media, punto: punto, btnArmar: btnArmar,
    ws: null, ms: null, sb: null, cola: [], fallos: 0, cerrado: false,
    video: null, img: null, imgTimer: 0, modo: '',
  };
  estado.mando.celdas[cam.id] = ce;
  mando_conectarMSE(ce);
}

/* Refleja conexión y armado de cada cámara en su celda. */
function mando_actualizarCeldasEstado() {
  const celdas = estado.mando.celdas || {};
  Object.keys(celdas).forEach(function (id) {
    const ce = celdas[id];
    const est = estado.mando.camarasEstado[id] || {};
    if (ce.punto) {
      ce.punto.classList.toggle('mando-on', !!est.conectada);
      ce.punto.classList.toggle('mando-off', !est.conectada);
    }
    if (ce.btnArmar) {
      ce.btnArmar.textContent = est.armada ? 'Desarmar' : 'Armar';
      ce.btnArmar.classList.toggle('btn-peligro', !!est.armada);
    }
  });
}

/* ============================================================================
 * REPRODUCCIÓN MSE (WebSocket de go2rtc) + fallbacks MP4 y foto
 * ==========================================================================*/
function mando_conectarMSE(ce) {
  if (!ce || ce.cerrado) return;
  ce.modo = 'mse';
  if (typeof MediaSource === 'undefined' || !window.MediaSource) { mando_fallbackMp4(ce); return; }

  const video = mando_ponerVideo(ce);
  let ws;
  try {
    ws = new WebSocket(mando_aWs(mando_urlConToken(ce.cam.stream_mse)));
    ws.binaryType = 'arraybuffer';
  } catch (e) { mando_fallbackMp4(ce); return; }
  ce.ws = ws;
  ce.cola = [];
  ce.sb = null;
  ce.ms = null;

  ws.onopen = function () {
    // Anunciamos a go2rtc los códecs que este navegador puede reproducir.
    try {
      const soportados = MANDO_CODECS.filter(function (c) {
        try { return MediaSource.isTypeSupported('video/mp4; codecs="' + c + '"'); } catch (e) { return false; }
      }).join(',');
      ws.send(JSON.stringify({ type: 'mse', value: soportados }));
    } catch (e) { /* si no admite send, esperamos el JSON del servidor igualmente */ }
  };

  ws.onmessage = function (ev) {
    if (typeof ev.data === 'string') {
      let msg = null;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (msg && msg.type === 'mse' && msg.value) mando_iniciarSourceBuffer(ce, msg.value, video);
      else if (msg && msg.type === 'error') mando_falloMSE(ce);
      return;
    }
    // Binario = segmento fMP4.
    if (ce.sb && ce.ms && ce.ms.readyState === 'open') {
      ce.cola.push(new Uint8Array(ev.data));
      mando_bombearCola(ce);
    }
  };
  ws.onerror = function () { mando_falloMSE(ce); };
  ws.onclose = function () { if (!ce.cerrado && ce.modo === 'mse') mando_falloMSE(ce); };
}

function mando_iniciarSourceBuffer(ce, codecs, video) {
  try {
    const ms = new MediaSource();
    ce.ms = ms;
    video.src = URL.createObjectURL(ms);
    ms.addEventListener('sourceopen', function () {
      try { URL.revokeObjectURL(video.src); } catch (e) {}
      try {
        const mime = 'video/mp4; codecs="' + codecs + '"';
        if (!MediaSource.isTypeSupported(mime)) { mando_falloMSE(ce); return; }
        const sb = ms.addSourceBuffer(mime);
        try { sb.mode = 'segments'; } catch (e) {}
        sb.addEventListener('updateend', function () { mando_bombearCola(ce); });
        sb.addEventListener('error', function () { mando_falloMSE(ce); });
        ce.sb = sb;
        try { video.play().catch(function () {}); } catch (e) {}
        mando_bombearCola(ce);
      } catch (e) { mando_falloMSE(ce); }
    });
  } catch (e) { mando_falloMSE(ce); }
}

/* Vuelca la cola en el SourceBuffer de una en una, esperando cada updateend.
 * Ante QuotaExceededError recorta el buffer viejo y reintenta. */
function mando_bombearCola(ce) {
  const sb = ce.sb, ms = ce.ms;
  if (!sb || !ms || ms.readyState !== 'open') return;
  if (sb.updating) return;
  if (!ce.cola.length) return;
  const trozo = ce.cola.shift();
  try {
    sb.appendBuffer(trozo);
  } catch (err) {
    if (err && (err.name === 'QuotaExceededError' || err.code === 22)) {
      try {
        if (sb.buffered && sb.buffered.length) {
          const ini = sb.buffered.start(0);
          const fin = sb.buffered.end(sb.buffered.length - 1);
          const objetivo = fin - MANDO_MSE_BUFFER_SEG;
          if (objetivo > ini) { sb.remove(ini, objetivo); ce.cola.unshift(trozo); return; }
        }
        // No se pudo liberar: descartamos el trozo para no atascar la cola.
      } catch (e) { /* seguimos, el siguiente updateend reintenta */ }
    } else {
      mando_falloMSE(ce);
    }
  }
}

function mando_falloMSE(ce) {
  if (!ce || ce.cerrado) return;
  ce.fallos = (ce.fallos || 0) + 1;
  mando_cerrarStream(ce);
  if (ce.fallos >= MANDO_MSE_MAX_FALLOS) { mando_fallbackMp4(ce); return; }
  setTimeout(function () { if (!ce.cerrado && ce.modo === 'mse') mando_conectarMSE(ce); }, 1500);
}

/* Fallback 1: MP4 progresivo. Si también falla → foto. */
function mando_fallbackMp4(ce) {
  if (!ce || ce.cerrado) return;
  ce.modo = 'mp4';
  mando_cerrarStream(ce);
  const video = mando_ponerVideo(ce);
  video.src = mando_urlConToken(ce.cam.stream_mp4);
  video.addEventListener('error', function () { mando_fallbackFoto(ce); }, { once: true });
  try { video.play().catch(function () {}); } catch (e) {}
}

/* Fallback final: foto refrescada cada 2 s con nota "modo foto". */
function mando_fallbackFoto(ce) {
  if (!ce || ce.cerrado) return;
  ce.modo = 'foto';
  mando_cerrarStream(ce);
  ce.media.innerHTML = '';
  const img = document.createElement('img');
  img.alt = 'Fotograma de ' + (ce.cam.nombre || ce.cam.id);
  ce.img = img;
  ce.media.appendChild(img);
  const nota = document.createElement('span');
  nota.className = 'mando-nota-foto';
  nota.textContent = 'modo foto';
  ce.nodo.appendChild(nota);
  const refrescar = function () {
    if (ce.cerrado || ce.modo !== 'foto') return;
    img.src = mando_urlConToken(ce.cam.frame) + '&_=' + Date.now();
  };
  refrescar();
  ce.imgTimer = setInterval(refrescar, MANDO_FOTO_MS);
}

/* Prepara (o reutiliza) el <video> de la celda. */
function mando_ponerVideo(ce) {
  if (ce.video && ce.video.parentNode) return ce.video;
  ce.media.innerHTML = '';
  const video = document.createElement('video');
  video.muted = true;
  video.setAttribute('playsinline', '');
  video.setAttribute('autoplay', '');
  ce.video = video;
  ce.media.appendChild(video);
  return video;
}

/* Cierra solo los recursos de streaming de una celda (conserva el nodo). */
function mando_cerrarStream(ce) {
  if (!ce) return;
  try { if (ce.imgTimer) { clearInterval(ce.imgTimer); ce.imgTimer = 0; } } catch (e) {}
  try { if (ce.ws) { ce.ws.onopen = ce.ws.onmessage = ce.ws.onerror = ce.ws.onclose = null; ce.ws.close(); } } catch (e) {}
  ce.ws = null;
  try { if (ce.ms && ce.ms.readyState === 'open') ce.ms.endOfStream(); } catch (e) {}
  ce.ms = null; ce.sb = null; ce.cola = [];
  try { if (ce.video) { ce.video.pause(); ce.video.removeAttribute('src'); ce.video.load(); } } catch (e) {}
}

/* Cierra por completo una celda (streaming + nodo). */
function mando_cerrarCelda(ce) {
  if (!ce) return;
  ce.cerrado = true;
  mando_cerrarStream(ce);
  ce.video = null; ce.img = null;
  if (ce.nodo && ce.nodo.parentNode) ce.nodo.parentNode.removeChild(ce.nodo);
}

/* ============================================================================
 * WEBSOCKET DE EVENTOS (alertas + estado) con reconexión backoff 1→30 s
 * ==========================================================================*/
function mando_wsConectar() {
  mando_wsCerrar();
  if (!estado.mando.url || !estado.mando.token) return;
  let ws;
  try {
    ws = new WebSocket(mando_aWs(mando_urlConToken('/api/v1/eventos')));
  } catch (e) { mando_wsReintentar(); return; }
  estado.mando.ws = ws;
  estado.mando.wsCerradoAdrede = false;

  ws.onopen = function () {
    estado.mando.wsBackoff = MANDO_BACKOFF_INI;
    estado.mando.conectado = true;
    mando_pintarEstadoCerebro(true);
  };
  ws.onmessage = function (ev) { mando_wsMensaje(ev.data); };
  ws.onerror = function () { try { ws.close(); } catch (e) {} };
  ws.onclose = function () {
    estado.mando.conectado = false;
    mando_pintarEstadoCerebro(false);
    if (!estado.mando.wsCerradoAdrede) mando_wsReintentar();
  };
}

function mando_wsCerrar() {
  estado.mando.wsCerradoAdrede = true;
  if (estado.mando.wsTimer) { clearTimeout(estado.mando.wsTimer); estado.mando.wsTimer = 0; }
  const ws = estado.mando.ws;
  if (ws) {
    try { ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null; ws.close(); } catch (e) {}
  }
  estado.mando.ws = null;
}

function mando_wsReintentar() {
  if (!estado.mando.activo) return;                 // no reconectar en modo local
  if (estado.mando.wsTimer) return;                 // ya hay un reintento en cola
  const espera = estado.mando.wsBackoff || MANDO_BACKOFF_INI;
  estado.mando.wsTimer = setTimeout(function () {
    estado.mando.wsTimer = 0;
    estado.mando.wsBackoff = Math.min((estado.mando.wsBackoff || MANDO_BACKOFF_INI) * 2, MANDO_BACKOFF_MAX);
    mando_wsConectar();
  }, espera);
}

function mando_wsMensaje(data) {
  let msg = null;
  try { msg = JSON.parse(data); } catch (e) { return; }
  if (!msg || !msg.tipo) return;
  if (msg.tipo === 'hola' || msg.tipo === 'estado') {
    if (msg.armado) mando_aplicarArmado(msg.armado);
    if (Array.isArray(msg.camaras)) mando_aplicarCamarasEstado(msg.camaras);
  } else if (msg.tipo === 'alerta') {
    mando_alertaEntrante(msg.registro);
  } else if (msg.tipo === 'ping') {
    try { if (estado.mando.ws && estado.mando.ws.readyState === 1) estado.mando.ws.send(JSON.stringify({ tipo: 'pong', ts: Date.now() })); } catch (e) {}
  }
}

function mando_pintarEstadoCerebro(ok) {
  const el = document.getElementById('mando-estadoCerebro');
  if (!el) return;
  if (ok) {
    el.textContent = '🧠 Conectado';
    el.classList.add('mando-cerebro-ok'); el.classList.remove('mando-cerebro-no');
  } else {
    el.textContent = '🧠 Sin conexión — reintentando';
    el.classList.add('mando-cerebro-no'); el.classList.remove('mando-cerebro-ok');
  }
}

/* ============================================================================
 * ALERTAS REMOTAS — reutilizan el motor v1 (suena/vibra/flashea) + feed
 * ==========================================================================*/
function mando_alertaEntrante(reg) {
  if (!reg) return;
  estado.mando.feedRemoto = estado.mando.feedRemoto || {};

  let reg2 = null;
  if (typeof alerta_disparar === 'function') {
    try {
      reg2 = alerta_disparar(reg.tipo, reg.nivel, '[' + (reg.camara_nombre || 'Cámara') + '] ' + (reg.texto || ''),
        { trackId: reg.track_id, remoto: true });
    } catch (e) { reg2 = null; }
  }

  // Localiza el <li> del feed que la UI acaba de insertar para enriquecerlo con
  // la miniatura remota y (cuando exista) el enlace de descarga del clip.
  let li = estado.mando.feedRemoto[reg.id];
  if (!li && reg2) {
    const feed = document.getElementById('ui-feedAlertas');
    if (feed) {
      const primero = feed.querySelector('.ui-feed-item');
      if (primero && !primero.dataset.mandoId) {
        primero.dataset.mandoId = reg.id;
        li = primero;
        estado.mando.feedRemoto[reg.id] = li;
      }
    }
  }
  if (li) mando_enriquecerFeed(li, reg);
}

function mando_enriquecerFeed(li, reg) {
  if (reg.miniatura && !li.dataset.mandoMini) {
    li.dataset.mandoMini = '1';
    const img = document.createElement('img');
    img.className = 'ui-feed-foto';
    img.alt = 'Miniatura de la alerta';
    img.src = mando_urlConToken('/api/v1/miniatura/' + reg.id);
    li.appendChild(img);
  }
  if (reg.clip && !li.dataset.mandoClip) {
    li.dataset.mandoClip = '1';
    const a = document.createElement('a');
    a.className = 'btn btn-mini btn-fantasma';
    a.href = mando_urlConToken('/api/v1/clip/' + reg.id);
    a.setAttribute('download', 'clip-' + reg.id + '.mp4');
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener noreferrer');
    a.textContent = 'Descargar clip';
    li.appendChild(a);
  }
}

/* ============================================================================
 * ZONAS REMOTAS — editor a pantalla completa sobre el fotograma real.
 * Decisión (documentada en el resumen): reutilizo el ESTADO y las funciones
 * públicas de 03-zonas.js (zona_iniciarDibujo/Linea/terminarDibujo/cancelar/
 * pintar) sobre un lienzo PROPIO #mando-canvasZonas en un modal, con un
 * pointerdown propio que replica zona_alTocar (fijado a #vid-canvas). NO se
 * modifica 03-zonas.js. Guardo y restauro SIEMPRE las zonas locales (try/finally
 * lógico: toda vía de cierre pasa por mando_restaurarZonas).
 * ==========================================================================*/
function mando_editarZonas(camaraId) {
  if (!estado.mando) return;
  if (estado.mando.editandoZonas) return;
  const cam = (estado.mando.camaras || []).filter(function (c) { return c.id === camaraId; })[0];
  const nombre = cam ? (cam.nombre || cam.id) : camaraId;

  // 1) Copia de seguridad del trabajo local (zonas, líneas, modo y dibujo).
  estado.mando.zonasBackup = {
    zonas: JSON.parse(JSON.stringify(estado.zonas || [])),
    lineas: JSON.parse(JSON.stringify(estado.lineas || [])),
    modo: estado.cfg.modo,
    dibujando: estado.ui.dibujando,
  };
  estado.mando.editandoZonas = true;

  try {
    if (typeof zona_init === 'function' && !estado.zona) zona_init();
    if (estado.zona) { estado.zona.trazado = []; estado.zona.trazadoTipo = null; }
    estado.ui.dibujando = null;

    const modal = mando_construirModalZonas(camaraId, nombre);
    document.body.appendChild(modal);

    const canvas = document.getElementById('mando-canvasZonas');
    const img = new Image();
    try { img.crossOrigin = 'anonymous'; } catch (e) {}
    estado.mando.zonasImg = img;
    img.onload = function () {
      if (canvas && img.naturalWidth) { canvas.width = img.naturalWidth; canvas.height = img.naturalHeight; }
    };
    img.onerror = function () {
      if (canvas) { canvas.width = (estado.video && estado.video.w) || 1280; canvas.height = (estado.video && estado.video.h) || 720; }
    };
    if (canvas) { canvas.width = (estado.video && estado.video.w) || 1280; canvas.height = (estado.video && estado.video.h) || 720; }
    img.src = mando_urlConToken(cam && cam.frame ? cam.frame : ('/api/v1/frame/' + camaraId)) + '&_=' + Date.now();

    // 2) Carga las zonas remotas actuales en estado.zonas/lineas.
    mando_fetch('/api/v1/zonas?camara=' + encodeURIComponent(camaraId)).then(function (datos) {
      if (!estado.mando.editandoZonas) return;
      estado.zonas = (datos && Array.isArray(datos.zonas)) ? datos.zonas : [];
      estado.lineas = (datos && Array.isArray(datos.lineas)) ? datos.lineas : [];
    });

    // 3) Bucle de pintado: fondo (frame) + zona_pintar sobre nuestro lienzo.
    mando_bucleZonas();
  } catch (e) {
    mando_restaurarZonas();
    mando_avisar('No se pudo abrir el editor de zonas.');
  }
}

function mando_construirModalZonas(camaraId, nombre) {
  const modal = document.createElement('div');
  modal.className = 'mando-zonas-modal';
  modal.id = 'mando-zonasModal';

  const cab = document.createElement('div');
  cab.className = 'mando-zonas-cab';
  const titulo = document.createElement('h2');
  titulo.className = 'sec-titulo';
  titulo.textContent = 'Zonas de ' + nombre;
  const cerrar = document.createElement('button');
  cerrar.type = 'button';
  cerrar.className = 'btn btn-mini btn-fantasma';
  cerrar.setAttribute('aria-label', 'Cerrar editor de zonas');
  cerrar.textContent = '✕';
  cerrar.addEventListener('click', mando_cerrarZonas);
  cab.appendChild(titulo);
  cab.appendChild(cerrar);

  const toolbar = document.createElement('div');
  toolbar.className = 'mando-zonas-toolbar';
  const botones = [
    ['＋ Prohibida', function () { mando_zonaBoton('prohibida'); }, 'btn'],
    ['＋ Sensible', function () { mando_zonaBoton('sensible'); }, 'btn'],
    ['＋ Caja', function () { mando_zonaBoton('caja'); }, 'btn'],
    ['＋ Plaza', function () { mando_zonaBoton('plaza'); }, 'btn'],
    ['＋ Detención', function () { mando_zonaBoton('detencion'); }, 'btn'],
    ['＋ Línea', function () { if (typeof zona_iniciarLinea === 'function') zona_iniciarLinea(); }, 'btn'],
    ['Cerrar zona', function () { if (typeof zona_terminarDibujo === 'function') zona_terminarDibujo(); }, 'btn'],
    ['Cancelar', function () { if (typeof zona_cancelarDibujo === 'function') zona_cancelarDibujo(); }, 'btn btn-fantasma'],
    ['🗑 Borrar todo', mando_zonasBorrarTodo, 'btn btn-peligro'],
  ];
  botones.forEach(function (b) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = b[2] + ' btn-mini';
    btn.textContent = b[0];
    btn.addEventListener('click', b[1]);
    toolbar.appendChild(btn);
  });
  const ayuda = document.createElement('span');
  ayuda.className = 'mando-zonas-ayuda etiqueta';
  ayuda.textContent = 'Toca el fotograma para dibujar; las zonas se guardan en el cerebro.';
  toolbar.appendChild(ayuda);

  const lienzo = document.createElement('div');
  lienzo.className = 'mando-zonas-lienzo';
  const canvas = document.createElement('canvas');
  canvas.id = 'mando-canvasZonas';
  canvas.addEventListener('pointerdown', mando_zonasTocar);
  lienzo.appendChild(canvas);

  const pie = document.createElement('div');
  pie.className = 'mando-zonas-pie';
  const guardar = document.createElement('button');
  guardar.type = 'button';
  guardar.className = 'btn btn-primario';
  guardar.textContent = 'Guardar en el cerebro';
  guardar.addEventListener('click', function () { mando_guardarZonasRemotas(camaraId); });
  const salir = document.createElement('button');
  salir.type = 'button';
  salir.className = 'btn btn-fantasma';
  salir.textContent = 'Cerrar sin guardar';
  salir.addEventListener('click', mando_cerrarZonas);
  pie.appendChild(guardar);
  pie.appendChild(salir);

  modal.appendChild(cab);
  modal.appendChild(toolbar);
  modal.appendChild(lienzo);
  modal.appendChild(pie);
  return modal;
}

/* Inicia el dibujo de una zona reutilizando la lógica v1 (todos los tipos). */
function mando_zonaBoton(tipo) {
  if (typeof zona_iniciarDibujo === 'function') zona_iniciarDibujo(tipo);
}

/* Borra todo SOLO en la sesión de edición remota (no toca lo local: ya está
 * respaldado y se restaura al cerrar). Sin confirm() nativo. */
function mando_zonasBorrarTodo() {
  estado.zonas = [];
  estado.lineas = [];
  if (estado.zona) { estado.zona.trazado = []; estado.zona.trazadoTipo = null; }
  estado.ui.dibujando = null;
  if (typeof ui_toast === 'function') { try { ui_toast('Zonas vaciadas. Pulsa "Guardar en el cerebro" para aplicarlo.'); } catch (e) {} }
}

/* pointerdown propio: replica zona_alTocar contra #mando-canvasZonas. */
function mando_zonasTocar(ev) {
  if (!estado.ui.dibujando || !estado.zona) return;
  const canvas = document.getElementById('mando-canvasZonas');
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;
  if (ev.cancelable) ev.preventDefault();
  const rx = nuc_clamp((ev.clientX - rect.left) / rect.width, 0, 1);
  const ry = nuc_clamp((ev.clientY - rect.top) / rect.height, 0, 1);
  estado.zona.trazado.push({ x: rx, y: ry });
  if (estado.ui.dibujando === 'linea' && estado.zona.trazado.length >= 2) {
    if (typeof zona_terminarDibujo === 'function') zona_terminarDibujo();
  }
}

function mando_bucleZonas() {
  if (!estado.mando.editandoZonas) return;
  const canvas = document.getElementById('mando-canvasZonas');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const img = estado.mando.zonasImg;
      if (img && img.complete && img.naturalWidth) {
        try { ctx.drawImage(img, 0, 0, canvas.width, canvas.height); } catch (e) { mando_zonasFondoVacio(ctx, canvas); }
      } else {
        mando_zonasFondoVacio(ctx, canvas);
      }
      if (typeof zona_pintar === 'function') { try { zona_pintar(ctx); } catch (e) {} }
    }
  }
  estado.mando.zonasRAF = requestAnimationFrame(mando_bucleZonas);
}

function mando_zonasFondoVacio(ctx, canvas) {
  ctx.fillStyle = '#05080c';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#7d8fa0';
  ctx.font = "14px 'SFMono-Regular',ui-monospace,'Cascadia Mono',Consolas,monospace";
  ctx.fillText('Sin fotograma de la cámara todavía', 14, 26);
}

function mando_guardarZonasRemotas(camaraId) {
  const cuerpo = { camara_id: camaraId, zonas: estado.zonas, lineas: estado.lineas };
  mando_fetch('/api/v1/zonas', { metodo: 'POST', cuerpo: cuerpo }).then(function (r) {
    if (r && r.ok) {
      if (typeof ui_toast === 'function') { try { ui_toast('Zonas guardadas en el cerebro ✓'); } catch (e) {} }
      mando_cerrarZonas();
    } else {
      mando_avisar('No se pudieron guardar las zonas en el cerebro.');
    }
  });
}

function mando_cerrarZonas() {
  const modal = document.getElementById('mando-zonasModal');
  if (modal && modal.parentNode) modal.parentNode.removeChild(modal);
  mando_restaurarZonas();
}

/* Restaura SIEMPRE el trabajo local de zonas (aunque haya error o se cancele). */
function mando_restaurarZonas() {
  if (estado.mando.zonasRAF) { try { cancelAnimationFrame(estado.mando.zonasRAF); } catch (e) {} estado.mando.zonasRAF = 0; }
  const b = estado.mando.zonasBackup;
  if (b) {
    estado.zonas = b.zonas;
    estado.lineas = b.lineas;
    estado.cfg.modo = b.modo;
    estado.ui.dibujando = b.dibujando || null;
    nuc_guardar('zonas', estado.zonas);
    nuc_guardar('lineas', estado.lineas);
    if (estado.zona) { estado.zona.trazado = []; estado.zona.trazadoTipo = null; }
  }
  estado.mando.zonasBackup = null;
  estado.mando.zonasImg = null;
  estado.mando.editandoZonas = false;
}

/* ============================================================================
 * AUTO-ARRANQUE (fallback): si el integrador no llama a mando_init desde
 * 99-app.js, lo hacemos tras el arranque de la app. Idempotente.
 * ==========================================================================*/
(function mando_autoArranque() {
  const arranca = function () { try { mando_init(); } catch (e) {} };
  if (typeof document === 'undefined') return;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(arranca, 0); });
  } else {
    setTimeout(arranca, 0);
  }
})();

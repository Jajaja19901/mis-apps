/* ============================================================================
 * 12-MANDODASH — VIGÍA IA v2 · Dashboard remoto del cerebro + ajustes remotos.
 * Prefijo mdash_/MDASH_. Estado propio en estado.mdash. Ver
 * vigia-cerebro/CONTRATOS-API.md §5 (formas EXACTAS de /stats, /eventos,
 * /estado, /config, /armar, /horario), §6, §8 "7 · APP DASHBOARD REMOTO +
 * AJUSTES" y §8.5. Sigue también modulos/CONTRATOS.md §0 (reglas v1).
 *
 * NOTA DE ENSAMBLADO (IMPORTANTE, léela antes de tocar nada):
 * `modulos/ensamblar.mjs` inyecta 12-mandodash.html ENTERO en el marcador
 * <!-- SLOT:MANDODASH --> que vive dentro de #mando-panel (11-mando.html).
 * El drawer de ajustes v1 (05-ui.html) tiene un segundo marcador,
 * <!-- SLOT:MANDOAJUSTES -->, pero el ensamblador NO lo sustituye por ningún
 * archivo (solo mapea SLOT:VIDEO/ZONAS/ALERTAS/STATS/CARRETERA/AJUSTES/MANDO/
 * MANDODASH — mira su HTML_SLOTS). Por eso NO podemos entregar un segundo
 * archivo de ajustes: todo nuestro HTML tiene que viajar en un único
 * fragmento (12-mandodash.html), tal y como pide el encargo. La solución:
 * ese fragmento incluye, además de la sección visible del dashboard, un
 * <template id="mdash-tplAjustes"> con la sección "🧠 Cerebro (remoto)". En
 * tiempo de EJECUCIÓN (no de ensamblado), mdash_init() clona ese <template>
 * y lo añade al final de `#ui-panelAjustes .ui-drawer-cuerpo` (justo donde
 * apuntaba el marcador SLOT:MANDOAJUSTES). Así el HTML llega en un solo
 * archivo y la UI de ajustes remotos aparece igualmente en el drawer v1.
 * ==========================================================================*/

/* --- Constantes del módulo -------------------------------------------------*/
const MDASH_CALOR_ALPHA_MAX = 0.45;
const MDASH_REFRESCO_MS = 60000;
const MDASH_EVENTOS_LIMITE = 20;
const MDASH_NIVEL_ETIQUETA = { info: 'Info', sospecha: 'Sospecha', critico: 'Crítico' };

/* --- Referencias DOM y temporizadores internos (no persistidos) ------------*/
let mdash_refs = {};
let mdash_intervalo = null;
let mdash_observador = null;
let mdash_imgCalor = null;      // referencia viva a la <img> del frame del mapa de calor
let mdash_resizeTimer = null;

/* ============================================================================
 * Red segura: SIEMPRE typeof-check sobre las funciones de 11-mando.js, que
 * puede no existir todavía (se escribe en paralelo). Nunca lanzan.
 * ==========================================================================*/
function mdash_fetch(ruta, opciones) {
  if (typeof mando_fetch !== 'function') return Promise.resolve(null);
  try {
    const p = mando_fetch(ruta, opciones);
    return (p && typeof p.then === 'function') ? p.catch(() => null) : Promise.resolve(null);
  } catch (e) {
    return Promise.resolve(null);
  }
}
function mdash_url(ruta) {
  try {
    if (typeof mando_urlConToken === 'function') return mando_urlConToken(ruta);
  } catch (e) { /* degrada a la ruta cruda */ }
  return ruta;
}
function mdash_toast(msg, nivel) {
  try { if (typeof ui_toast === 'function') ui_toast(msg, nivel || 'info'); } catch (e) { /* silencioso */ }
}

/* ============================================================================
 * Mensajes de "sin conexión" (dashboard y ajustes tienen el suyo propio)
 * ==========================================================================*/
function mdash_mostrarMensaje(msg) {
  if (mdash_refs.msg) { mdash_refs.msg.textContent = msg; mdash_refs.msg.classList.remove('oculto'); }
}
function mdash_ocultarMensaje() {
  if (mdash_refs.msg) mdash_refs.msg.classList.add('oculto');
}
function mdash_limpiarDatos() {
  const claves = ['visitantes', 'entradas', 'salidas', 'alertasTotal', 'alertaInfo',
    'alertaSospecha', 'alertaCritico', 'aforoActual', 'picoAforo'];
  claves.forEach((k) => { if (mdash_refs[k]) mdash_refs[k].textContent = '—'; });
  if (mdash_refs.tarjetaVehiculos) mdash_refs.tarjetaVehiculos.classList.add('oculto');
}

/* ============================================================================
 * Gráfico por hora (hoy vs ayer) — función PÚBLICA del contrato.
 * MISMO estilo visual que 07-stats.js (stats_grafico): barras verdes #2ee584
 * hoy, grises #445565 ayer detrás, ejes/texto #7d8fa0 mono 10px, responsive
 * con clientWidth. Lee datos.por_hora / datos.por_hora_ayer de GET /stats.
 * Segura sin datos (pinta un gráfico vacío) y sin conexión.
 * ==========================================================================*/
function mdash_grafico(datos) {
  try {
    if (!mdash_refs.grafico) return;
    const canvas = mdash_refs.grafico;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const anchoCss = canvas.clientWidth || 300;
    const altoCss = 160;
    const dpr = window.devicePixelRatio || 1;
    const anchoPx = Math.max(1, Math.round(anchoCss * dpr));
    const altoPx = Math.max(1, Math.round(altoCss * dpr));
    if (canvas.width !== anchoPx || canvas.height !== altoPx) {
      canvas.width = anchoPx; canvas.height = altoPx;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, anchoCss, altoCss);

    const hoy = (datos && Array.isArray(datos.por_hora) && datos.por_hora.length === 24)
      ? datos.por_hora : new Array(24).fill(0);
    const ayer = (datos && Array.isArray(datos.por_hora_ayer) && datos.por_hora_ayer.length === 24)
      ? datos.por_hora_ayer : new Array(24).fill(0);

    const margenInf = 16, margenSup = 14;
    const altoBarras = altoCss - margenInf - margenSup;
    let maximo = 1;
    for (let i = 0; i < 24; i++) {
      if ((hoy[i] || 0) > maximo) maximo = hoy[i];
      if ((ayer[i] || 0) > maximo) maximo = ayer[i];
    }
    const anchoCol = anchoCss / 24;

    ctx.textBaseline = 'alphabetic';
    ctx.font = "10px SFMono-Regular, ui-monospace, 'Cascadia Mono', Consolas, monospace";
    for (let hora = 0; hora < 24; hora++) {
      const x = hora * anchoCol;
      const vAyer = ayer[hora] || 0;
      const vHoy = hoy[hora] || 0;
      const altAyer = (vAyer / maximo) * altoBarras;
      const altHoy = (vHoy / maximo) * altoBarras;
      ctx.fillStyle = '#445565';
      ctx.fillRect(x + anchoCol * 0.12, altoCss - margenInf - altAyer, anchoCol * 0.34, altAyer);
      ctx.fillStyle = '#2ee584';
      ctx.fillRect(x + anchoCol * 0.52, altoCss - margenInf - altHoy, anchoCol * 0.34, altHoy);
      if (hora % 3 === 0) {
        ctx.fillStyle = '#7d8fa0';
        ctx.fillText(String(hora).padStart(2, '0'), x + 2, altoCss - 4);
      }
    }
    ctx.fillStyle = '#7d8fa0';
    ctx.fillText('máx ' + maximo, 4, 11);
  } catch (e) {
    console.warn('[mdash] fallo pintando gráfico:', e && e.message);
  }
}

function mdash_alRedimensionar() {
  if (mdash_resizeTimer) return;
  mdash_resizeTimer = setTimeout(() => {
    mdash_resizeTimer = null;
    const datos = estado.mdash ? estado.mdash.ultimosDatos : null;
    mdash_grafico(datos);
    mdash_pintarCalor(datos);
  }, 200);
}

/* ============================================================================
 * Tarjetas de totales
 * ==========================================================================*/
function mdash_pintarTotales(datos) {
  if (!datos) { mdash_limpiarDatos(); return; }
  const porHora = Array.isArray(datos.por_hora) ? datos.por_hora : [];
  let visitantes = 0;
  for (let i = 0; i < porHora.length; i++) visitantes += (typeof porHora[i] === 'number' ? porHora[i] : 0);

  if (mdash_refs.visitantes) mdash_refs.visitantes.textContent = String(visitantes);
  if (mdash_refs.entradas) mdash_refs.entradas.textContent = String(datos.entradas || 0);
  if (mdash_refs.salidas) mdash_refs.salidas.textContent = String(datos.salidas || 0);

  const alertas = datos.alertas || {};
  if (mdash_refs.alertasTotal) mdash_refs.alertasTotal.textContent = String(alertas.total || 0);
  if (mdash_refs.alertaInfo) mdash_refs.alertaInfo.textContent = String(alertas.info || 0);
  if (mdash_refs.alertaSospecha) mdash_refs.alertaSospecha.textContent = String(alertas.sospecha || 0);
  if (mdash_refs.alertaCritico) mdash_refs.alertaCritico.textContent = String(alertas.critico || 0);

  if (mdash_refs.aforoActual) mdash_refs.aforoActual.textContent = String(datos.aforo_actual != null ? datos.aforo_actual : 0);
  if (mdash_refs.picoAforo) mdash_refs.picoAforo.textContent = String(datos.pico_aforo != null ? datos.pico_aforo : 0);

  const v = datos.vehiculos || {};
  const totalVeh = (v.car || 0) + (v.truck || 0) + (v.bus || 0) + (v.motorcycle || 0) + (v.bicycle || 0);
  if (mdash_refs.tarjetaVehiculos) mdash_refs.tarjetaVehiculos.classList.toggle('oculto', totalVeh <= 0);
  if (mdash_refs.vehiculos) {
    mdash_refs.vehiculos.textContent = '🚗' + (v.car || 0) + ' 🚚' + (v.truck || 0) +
      ' 🚌' + (v.bus || 0) + ' 🏍' + (v.motorcycle || 0) + ' 🚲' + (v.bicycle || 0);
  }
}

/* ============================================================================
 * Mapa de calor remoto (mismo esquema de color que 07-stats.js: azul→verde→
 * ámbar→rojo, alpha ≤ 0.45), pintado sobre el frame de la cámara elegida.
 * ==========================================================================*/
function mdash_colorCalor(ratio) {
  const r = nuc_clamp(ratio, 0, 1);
  const paradas = [
    { p: 0, c: [63, 169, 255] },   // azul
    { p: 0.4, c: [46, 229, 132] }, // verde
    { p: 0.7, c: [255, 178, 36] }, // ámbar
    { p: 1, c: [255, 65, 85] },    // rojo
  ];
  let a = paradas[0], b = paradas[paradas.length - 1];
  for (let i = 0; i < paradas.length - 1; i++) {
    if (r >= paradas[i].p && r <= paradas[i + 1].p) { a = paradas[i]; b = paradas[i + 1]; break; }
  }
  const span = (b.p - a.p) || 1;
  const t = (r - a.p) / span;
  const mezcla = (i) => Math.round(a.c[i] + (b.c[i] - a.c[i]) * t);
  return 'rgb(' + mezcla(0) + ',' + mezcla(1) + ',' + mezcla(2) + ')';
}

function mdash_dibujarCeldas(ctx, anchoCss, altoCss, mapa) {
  try {
    if (!mapa || !Array.isArray(mapa.celdas) || !mapa.cols || !mapa.filas) return;
    const cols = mapa.cols, filas = mapa.filas;
    if (mapa.celdas.length !== cols * filas) return;
    let max = 0;
    for (let i = 0; i < mapa.celdas.length; i++) if (mapa.celdas[i] > max) max = mapa.celdas[i];
    if (max <= 0) return;
    const cw = anchoCss / cols, ch = altoCss / filas;
    const alphaPrevio = ctx.globalAlpha;
    for (let r = 0; r < filas; r++) {
      for (let c = 0; c < cols; c++) {
        const v = mapa.celdas[r * cols + c];
        if (!v) continue;
        const ratio = v / max;
        ctx.fillStyle = mdash_colorCalor(ratio);
        ctx.globalAlpha = Math.min(MDASH_CALOR_ALPHA_MAX, 0.06 + ratio * 0.39);
        ctx.fillRect(c * cw, r * ch, cw + 1, ch + 1);
      }
    }
    ctx.globalAlpha = alphaPrevio;
  } catch (e) {
    console.warn('[mdash] fallo pintando celdas del mapa de calor:', e && e.message);
  }
}

/* Pinta fondo (frame remoto si hay cámara elegida, si no/falla fondo oscuro)
 * + overlay de calor. Segura sin datos, sin cámara y sin conexión. */
function mdash_pintarCalor(datos) {
  try {
    if (!mdash_refs.calor) return;
    const canvas = mdash_refs.calor;
    const anchoCss = canvas.clientWidth || 300;
    const altoCss = Math.max(1, Math.round(anchoCss * 9 / 16));
    const dpr = window.devicePixelRatio || 1;
    const anchoPx = Math.max(1, Math.round(anchoCss * dpr));
    const altoPx = Math.max(1, Math.round(altoCss * dpr));
    if (canvas.width !== anchoPx || canvas.height !== altoPx) {
      canvas.width = anchoPx; canvas.height = altoPx;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0b0f14';
    ctx.fillRect(0, 0, anchoCss, altoCss);

    const mapa = datos && datos.mapa_calor;
    const camaras = (estado.mdash && Array.isArray(estado.mdash.camaras)) ? estado.mdash.camaras : [];
    const camId = (estado.mdash && estado.mdash.camaraSel) || (camaras[0] && camaras[0].id) || '';

    if (!camId) { mdash_dibujarCeldas(ctx, anchoCss, altoCss, mapa); return; }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        ctx.fillStyle = '#0b0f14';
        ctx.fillRect(0, 0, anchoCss, altoCss);
        ctx.drawImage(img, 0, 0, anchoCss, altoCss);
      } catch (e) {
        ctx.fillStyle = '#0b0f14';
        ctx.fillRect(0, 0, anchoCss, altoCss);
      }
      mdash_dibujarCeldas(ctx, anchoCss, altoCss, mapa);
    };
    img.onerror = () => { mdash_dibujarCeldas(ctx, anchoCss, altoCss, mapa); };
    img.src = mdash_url('/api/v1/frame/' + camId);
    mdash_imgCalor = img; // mantiene viva la referencia hasta que cargue/falle
  } catch (e) {
    console.warn('[mdash] fallo pintando mapa de calor:', e && e.message);
  }
}

/* ============================================================================
 * Cámaras (selector del dashboard) y estadísticas del día
 * ==========================================================================*/
function mdash_cargarCamaras() {
  mdash_fetch('/api/v1/camaras').then((lista) => {
    if (!Array.isArray(lista) || !mdash_refs.selCamara) return; // sin conexión: deja el selector como estaba
    estado.mdash.camaras = lista;
    const actual = estado.mdash.camaraSel;
    mdash_refs.selCamara.innerHTML = '';
    const optTodas = document.createElement('option');
    optTodas.value = ''; optTodas.textContent = 'Todas las cámaras';
    mdash_refs.selCamara.appendChild(optTodas);
    lista.forEach((cam) => {
      if (!cam || !cam.id) return;
      const opt = document.createElement('option');
      opt.value = cam.id; opt.textContent = cam.nombre || cam.id;
      mdash_refs.selCamara.appendChild(opt);
    });
    const sigueValida = lista.some((c) => c && c.id === actual);
    mdash_refs.selCamara.value = sigueValida ? actual : '';
    estado.mdash.camaraSel = mdash_refs.selCamara.value;
  });
}

function mdash_cargarStats() {
  if (!estado.mdash) return;
  const dia = estado.mdash.diaSel || nuc_diaClave();
  let ruta = '/api/v1/stats?dia=' + encodeURIComponent(dia);
  if (estado.mdash.camaraSel) ruta += '&camara=' + encodeURIComponent(estado.mdash.camaraSel);
  mdash_fetch(ruta).then((datos) => {
    if (!datos) {
      mdash_mostrarMensaje('🧠 Cerebro sin conexión — sin datos que mostrar.');
      mdash_limpiarDatos();
      mdash_grafico(null);
      mdash_pintarCalor(null);
      return;
    }
    mdash_ocultarMensaje();
    estado.mdash.ultimosDatos = datos;
    mdash_grafico(datos);
    mdash_pintarTotales(datos);
    mdash_pintarCalor(datos);
  });
}

/* ============================================================================
 * Historial de eventos: paginado, filtros por nivel y cámara.
 * ==========================================================================*/
function mdash_pintarEventos(nuevos) {
  if (!mdash_refs.lista) return;
  if (mdash_refs.vacio) mdash_refs.vacio.classList.toggle('oculto', estado.mdash.eventos.length > 0);
  nuevos.forEach((ev) => {
    if (!ev) return;
    const li = document.createElement('li');
    li.className = 'mdash-eventoItem';

    const insignia = document.createElement('span');
    const nivel = ev.nivel || 'info';
    insignia.className = 'insignia-' + nivel;
    insignia.textContent = MDASH_NIVEL_ETIQUETA[nivel] || 'Info';
    li.appendChild(insignia);

    const hora = document.createElement('span');
    hora.className = 'etiqueta mdash-eventoHora';
    hora.textContent = nuc_horaCorta(ev.ts) + ' · ' + (ev.camara_nombre || ev.camara_id || '');
    li.appendChild(hora);

    if (ev.miniatura && ev.id) {
      const img = document.createElement('img');
      img.className = 'mdash-eventoMini';
      img.loading = 'lazy';
      img.alt = '';
      img.src = mdash_url('/api/v1/miniatura/' + ev.id);
      img.addEventListener('error', () => { img.classList.add('oculto'); }, { once: true });
      li.appendChild(img);
    }

    const texto = document.createElement('span');
    texto.className = 'mdash-eventoTexto';
    texto.textContent = ev.texto || '';
    li.appendChild(texto);

    if (ev.clip && ev.id) {
      const a = document.createElement('a');
      a.className = 'btn btn-mini';
      a.href = mdash_url('/api/v1/clip/' + ev.id);
      a.download = ev.id + '.mp4';
      a.textContent = '⬇ Clip';
      li.appendChild(a);
    }

    mdash_refs.lista.appendChild(li);
  });
  if (mdash_refs.cargarMas) mdash_refs.cargarMas.classList.toggle('oculto', !!estado.mdash.eventosFin);
}

function mdash_cargarEventos(reset) {
  if (!estado.mdash) return;
  if (estado.mdash.cargandoEventos) return;
  if (reset) {
    estado.mdash.eventos = [];
    estado.mdash.eventosHasta = null;
    estado.mdash.eventosFin = false;
    if (mdash_refs.lista) mdash_refs.lista.innerHTML = '';
    if (mdash_refs.vacio) mdash_refs.vacio.classList.add('oculto');
  }
  if (estado.mdash.eventosFin) return;

  estado.mdash.cargandoEventos = true;
  if (mdash_refs.cargarMas) mdash_refs.cargarMas.disabled = true;

  const dia = estado.mdash.diaSel || nuc_diaClave();
  let inicioDia = Date.now() - 86400000;
  try { inicioDia = new Date(dia + 'T00:00:00').getTime(); } catch (e) { /* usa el valor por defecto */ }
  if (!isFinite(inicioDia)) inicioDia = Date.now() - 86400000;
  const finDia = inicioDia + 86400000;
  const hasta = (estado.mdash.eventosHasta != null) ? estado.mdash.eventosHasta : Math.min(Date.now(), finDia);

  const params = ['limite=' + MDASH_EVENTOS_LIMITE, 'desde=' + inicioDia, 'hasta=' + hasta];
  if (estado.mdash.camaraSel) params.push('camara=' + encodeURIComponent(estado.mdash.camaraSel));
  if (estado.mdash.filtroNivel) params.push('nivel=' + encodeURIComponent(estado.mdash.filtroNivel));

  mdash_fetch('/api/v1/eventos?' + params.join('&')).then((res) => {
    estado.mdash.cargandoEventos = false;
    if (mdash_refs.cargarMas) mdash_refs.cargarMas.disabled = false;
    if (!res || !Array.isArray(res.eventos)) {
      mdash_mostrarMensaje('🧠 Cerebro sin conexión — sin historial disponible.');
      if (mdash_refs.vacio && !estado.mdash.eventos.length) mdash_refs.vacio.classList.remove('oculto');
      return;
    }
    mdash_ocultarMensaje();
    const nuevos = res.eventos;
    if (!nuevos.length) {
      estado.mdash.eventosFin = true;
      if (mdash_refs.vacio && !estado.mdash.eventos.length) mdash_refs.vacio.classList.remove('oculto');
      if (mdash_refs.cargarMas) mdash_refs.cargarMas.classList.add('oculto');
      return;
    }
    estado.mdash.eventos = estado.mdash.eventos.concat(nuevos);
    estado.mdash.eventosHasta = nuevos[nuevos.length - 1].ts - 1;
    if (nuevos.length < MDASH_EVENTOS_LIMITE) estado.mdash.eventosFin = true;
    mdash_pintarEventos(nuevos);
  });
}

function mdash_recargarTodo() {
  mdash_cargarStats();
  mdash_cargarEventos(true);
}

/* ============================================================================
 * Refresco general del dashboard (expuesto: mdash_refrescar)
 * ==========================================================================*/
function mdash_refrescar() {
  if (!estado.mdash) return;
  mdash_cargarCamaras();
  mdash_cargarStats();
  mdash_cargarEventos(true);
}

/* ============================================================================
 * AJUSTES REMOTOS (clonados desde <template id="mdash-tplAjustes">, ver nota
 * de ensamblado arriba). Salud del cerebro, cámaras (fps/mascotas/armada),
 * franja horaria de armado.
 * ==========================================================================*/
function mdash_uptimeLegible(seg) {
  seg = Math.max(0, Math.floor((typeof seg === 'number' && isFinite(seg)) ? seg : 0));
  const d = Math.floor(seg / 86400); seg -= d * 86400;
  const h = Math.floor(seg / 3600); seg -= h * 3600;
  const m = Math.floor(seg / 60);
  const partes = [];
  if (d) partes.push(d + 'd');
  if (d || h) partes.push(h + 'h');
  partes.push(m + 'm');
  return partes.join(' ');
}

function mdash_alternarArmada(camaraId, armar, checkbox) {
  const ruta = '/api/v1/' + (armar ? 'armar' : 'desarmar');
  mdash_fetch(ruta, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ camara_id: camaraId }),
  }).then((res) => {
    if (checkbox) checkbox.disabled = false;
    if (!res || res.ok !== true) {
      mdash_toast('No se pudo cambiar el armado (sin conexión con el cerebro).', 'critico');
      if (checkbox) checkbox.checked = !armar;
      return;
    }
    mdash_toast(armar ? 'Cámara armada.' : 'Cámara desarmada.', 'info');
  });
}

function mdash_pintarCamarasCfg(camaras) {
  if (!mdash_refs.listaCamarasCfg) return;
  mdash_refs.listaCamarasCfg.innerHTML = '';
  if (!Array.isArray(camaras) || !camaras.length) {
    const p = document.createElement('p');
    p.className = 'etiqueta';
    p.textContent = 'Sin cámaras del cerebro todavía.';
    mdash_refs.listaCamarasCfg.appendChild(p);
    return;
  }
  camaras.forEach((cam) => {
    if (!cam || !cam.id) return;
    const fila = document.createElement('div');
    fila.className = 'tarjeta mdash-filaCamCfg';
    fila.setAttribute('data-cam-id', cam.id);

    const nombre = document.createElement('div');
    nombre.className = 'etiqueta';
    nombre.textContent = (cam.nombre || cam.id) + (cam.conectada ? ' · conectada' : ' · sin señal');
    fila.appendChild(nombre);

    const filaControles = document.createElement('div');
    filaControles.className = 'fila';

    const campoFps = document.createElement('div');
    campoFps.className = 'campo';
    const idFps = 'mdash-fps-' + cam.id;
    const labelFps = document.createElement('label');
    labelFps.setAttribute('for', idFps);
    labelFps.textContent = 'FPS objetivo';
    const inputFps = document.createElement('input');
    inputFps.type = 'number'; inputFps.id = idFps;
    inputFps.min = '1'; inputFps.max = '15'; inputFps.step = '1';
    inputFps.className = 'mdash-inputFps';
    inputFps.value = String((typeof cam.fps_objetivo === 'number') ? cam.fps_objetivo : 5);
    campoFps.appendChild(labelFps); campoFps.appendChild(inputFps);
    filaControles.appendChild(campoFps);

    const labelMasc = document.createElement('label');
    labelMasc.className = 'fila';
    const chkMasc = document.createElement('input');
    chkMasc.type = 'checkbox'; chkMasc.className = 'mdash-chkMascota';
    chkMasc.checked = !!cam.ignorar_mascotas;
    labelMasc.appendChild(chkMasc);
    labelMasc.appendChild(document.createTextNode(' Ignorar mascotas'));
    filaControles.appendChild(labelMasc);

    const labelArmada = document.createElement('label');
    labelArmada.className = 'fila';
    const chkArmada = document.createElement('input');
    chkArmada.type = 'checkbox'; chkArmada.className = 'mdash-chkArmada';
    chkArmada.checked = !!cam.armada;
    chkArmada.addEventListener('change', () => {
      const nuevoEstado = chkArmada.checked;
      chkArmada.disabled = true;
      mdash_alternarArmada(cam.id, nuevoEstado, chkArmada);
    });
    labelArmada.appendChild(chkArmada);
    labelArmada.appendChild(document.createTextNode(' Armada'));
    filaControles.appendChild(labelArmada);

    fila.appendChild(filaControles);
    mdash_refs.listaCamarasCfg.appendChild(fila);
  });
}

function mdash_cargarEstadoRemoto() {
  mdash_fetch('/api/v1/estado').then((datos) => {
    if (!datos) {
      if (mdash_refs.msgAjustes) {
        mdash_refs.msgAjustes.textContent = '🧠 Cerebro sin conexión.';
        mdash_refs.msgAjustes.classList.remove('oculto');
      }
      return;
    }
    if (mdash_refs.msgAjustes) mdash_refs.msgAjustes.classList.add('oculto');

    const salud = datos.salud || {};
    if (mdash_refs.saludCpu) mdash_refs.saludCpu.textContent = (typeof salud.cpu_pct === 'number' ? Math.round(salud.cpu_pct) : '—') + ' %';
    if (mdash_refs.saludRam) mdash_refs.saludRam.textContent = (typeof salud.ram_pct === 'number' ? Math.round(salud.ram_pct) : '—') + ' %';
    if (mdash_refs.saludDisco) mdash_refs.saludDisco.textContent = (typeof salud.disco_clips_gb === 'number' ? salud.disco_clips_gb.toFixed(1) : '—') + ' GB';
    if (mdash_refs.saludUptime) mdash_refs.saludUptime.textContent = mdash_uptimeLegible(salud.uptime_seg);
    if (mdash_refs.saludVersion) mdash_refs.saludVersion.textContent = salud.version || '—';

    const horario = (datos.armado && datos.armado.horario) || {};
    if (mdash_refs.horarioActivo) mdash_refs.horarioActivo.checked = !!horario.activo;
    if (mdash_refs.horarioIni) mdash_refs.horarioIni.value = horario.inicio || '22:00';
    if (mdash_refs.horarioFin) mdash_refs.horarioFin.value = horario.fin || '08:00';

    mdash_pintarCamarasCfg(Array.isArray(datos.camaras) ? datos.camaras : []);
    estado.mdash.saludCargada = true;
  });
}

function mdash_guardarConfigCamaras() {
  try {
    if (!mdash_refs.listaCamarasCfg) return;
    const filas = mdash_refs.listaCamarasCfg.querySelectorAll('.mdash-filaCamCfg');
    if (!filas.length) return;
    const camaras = [];
    filas.forEach((fila) => {
      const id = fila.getAttribute('data-cam-id');
      if (!id) return;
      const inputFps = fila.querySelector('.mdash-inputFps');
      const chkMasc = fila.querySelector('.mdash-chkMascota');
      const fps = inputFps ? nuc_clamp(parseInt(inputFps.value, 10) || 5, 1, 15) : 5;
      camaras.push({ id: id, fps_objetivo: fps, ignorar_mascotas: !!(chkMasc && chkMasc.checked) });
    });
    mdash_fetch('/api/v1/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ camaras: camaras }),
    }).then((res) => {
      if (!res || res.ok !== true) { mdash_toast('No se pudieron guardar los cambios (sin conexión con el cerebro).', 'critico'); return; }
      mdash_toast('Cambios guardados.', 'info');
    });
  } catch (e) {
    console.warn('[mdash] fallo guardando configuración de cámaras:', e && e.message);
  }
}

function mdash_guardarHorario() {
  try {
    const activo = !!(mdash_refs.horarioActivo && mdash_refs.horarioActivo.checked);
    const inicio = (mdash_refs.horarioIni && mdash_refs.horarioIni.value) || '22:00';
    const fin = (mdash_refs.horarioFin && mdash_refs.horarioFin.value) || '08:00';
    mdash_fetch('/api/v1/horario', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activo: activo, inicio: inicio, fin: fin }),
    }).then((res) => {
      if (!res || res.ok !== true) { mdash_toast('No se pudo guardar la franja horaria.', 'critico'); return; }
      mdash_toast('Franja horaria guardada.', 'info');
    });
  } catch (e) {
    console.warn('[mdash] fallo guardando la franja horaria:', e && e.message);
  }
}

/* Clona <template id="mdash-tplAjustes"> dentro del drawer de ajustes v1
 * (#ui-panelAjustes .ui-drawer-cuerpo) — ver la nota de ensamblado arriba. */
function mdash_montarAjustes() {
  try {
    if (document.getElementById('mdash-secCerebro')) { mdash_cachearRefsAjustes(); return; } // ya montado
    const tpl = document.getElementById('mdash-tplAjustes');
    const cuerpo = document.querySelector('#ui-panelAjustes .ui-drawer-cuerpo');
    if (!tpl || !tpl.content || !cuerpo) return;
    cuerpo.appendChild(tpl.content.cloneNode(true));
    mdash_cachearRefsAjustes();
    mdash_bindAjustes();
  } catch (e) {
    console.warn('[mdash] no se pudo montar la sección de ajustes remotos:', e && e.message);
  }
}

function mdash_cachearRefsAjustes() {
  mdash_refs.secCerebro = document.getElementById('mdash-secCerebro');
  mdash_refs.msgAjustes = document.getElementById('mdash-msgAjustes');
  mdash_refs.saludCpu = document.getElementById('mdash-saludCpu');
  mdash_refs.saludRam = document.getElementById('mdash-saludRam');
  mdash_refs.saludDisco = document.getElementById('mdash-saludDisco');
  mdash_refs.saludUptime = document.getElementById('mdash-saludUptime');
  mdash_refs.saludVersion = document.getElementById('mdash-saludVersion');
  mdash_refs.listaCamarasCfg = document.getElementById('mdash-listaCamarasCfg');
  mdash_refs.guardarConfig = document.getElementById('mdash-guardarConfig');
  mdash_refs.horarioActivo = document.getElementById('mdash-horarioActivo');
  mdash_refs.horarioIni = document.getElementById('mdash-horarioIni');
  mdash_refs.horarioFin = document.getElementById('mdash-horarioFin');
  mdash_refs.guardarHorario = document.getElementById('mdash-guardarHorario');
}

function mdash_bindAjustes() {
  if (mdash_refs.secCerebro) {
    mdash_refs.secCerebro.addEventListener('toggle', () => {
      if (mdash_refs.secCerebro.open) mdash_cargarEstadoRemoto();
    });
  }
  if (mdash_refs.guardarConfig) mdash_refs.guardarConfig.addEventListener('click', mdash_guardarConfigCamaras);
  if (mdash_refs.guardarHorario) mdash_refs.guardarHorario.addEventListener('click', mdash_guardarHorario);
}

/* ============================================================================
 * Inicialización — función PÚBLICA del contrato. Segura sin conexión, sin
 * módulo 11-mando cargado y sin vídeo/modelos (no depende de ninguno).
 * ==========================================================================*/
function mdash_init() {
  estado.mdash = {
    camaras: [],
    camaraSel: '',
    diaSel: nuc_diaClave(),
    filtroNivel: '',
    eventos: [],
    eventosHasta: null,
    eventosFin: false,
    cargandoEventos: false,
    ultimosDatos: null,
    saludCargada: false,
  };

  mdash_refs = {
    sec: document.getElementById('mdash-sec'),
    msg: document.getElementById('mdash-msg'),
    selCamara: document.getElementById('mdash-selCamara'),
    selDia: document.getElementById('mdash-selDia'),
    grafico: document.getElementById('mdash-grafico'),
    calor: document.getElementById('mdash-calor'),
    visitantes: document.getElementById('mdash-visitantes'),
    entradas: document.getElementById('mdash-entradas'),
    salidas: document.getElementById('mdash-salidas'),
    alertasTotal: document.getElementById('mdash-alertasTotal'),
    alertaInfo: document.getElementById('mdash-alertaInfo'),
    alertaSospecha: document.getElementById('mdash-alertaSospecha'),
    alertaCritico: document.getElementById('mdash-alertaCritico'),
    aforoActual: document.getElementById('mdash-aforoActual'),
    picoAforo: document.getElementById('mdash-picoAforo'),
    tarjetaVehiculos: document.getElementById('mdash-tarjetaVehiculos'),
    vehiculos: document.getElementById('mdash-vehiculos'),
    chips: document.getElementById('mdash-chips'),
    lista: document.getElementById('mdash-listaEventos'),
    vacio: document.getElementById('mdash-eventosVacio'),
    cargarMas: document.getElementById('mdash-cargarMas'),
  };

  if (mdash_refs.selDia) mdash_refs.selDia.value = estado.mdash.diaSel;

  if (mdash_refs.selCamara) {
    mdash_refs.selCamara.addEventListener('change', () => {
      estado.mdash.camaraSel = mdash_refs.selCamara.value;
      mdash_recargarTodo();
    });
  }
  if (mdash_refs.selDia) {
    mdash_refs.selDia.addEventListener('change', () => {
      estado.mdash.diaSel = mdash_refs.selDia.value || nuc_diaClave();
      mdash_recargarTodo();
    });
  }
  if (mdash_refs.chips) {
    const botones = mdash_refs.chips.querySelectorAll('.mdash-chip');
    botones.forEach((chip) => {
      chip.setAttribute('aria-pressed', 'false');
      chip.addEventListener('click', () => {
        const nivel = chip.getAttribute('data-nivel') || '';
        estado.mdash.filtroNivel = (estado.mdash.filtroNivel === nivel) ? '' : nivel;
        botones.forEach((c) => {
          const activo = c === chip && estado.mdash.filtroNivel === nivel;
          c.classList.toggle('mdash-chip-activo', activo);
          c.setAttribute('aria-pressed', activo ? 'true' : 'false');
        });
        mdash_cargarEventos(true);
      });
    });
  }
  if (mdash_refs.cargarMas) mdash_refs.cargarMas.addEventListener('click', () => mdash_cargarEventos(false));

  window.addEventListener('resize', mdash_alRedimensionar);

  // Ajustes remotos: clona el <template> en el drawer v1 (ver nota arriba).
  mdash_montarAjustes();

  // Refresco cuando la sección de mando se muestre (comprueba cada vez que
  // cambia la clase del contenedor; además, botón de modo como refuerzo).
  const secMando = document.getElementById('ui-secMando');
  if (secMando && typeof MutationObserver === 'function') {
    try {
      mdash_observador = new MutationObserver(() => {
        if (!secMando.classList.contains('oculto')) mdash_refrescar();
      });
      mdash_observador.observe(secMando, { attributes: true, attributeFilter: ['class'] });
    } catch (e) { /* degrada sin observador: queda el intervalo de 60s */ }
  }
  const btnModo = document.getElementById('ui-btnModoMando');
  if (btnModo) btnModo.addEventListener('click', () => setTimeout(mdash_refrescar, 150));

  if (!mdash_intervalo) {
    mdash_intervalo = setInterval(() => {
      if (document.hidden) return;
      if (!mdash_refs.sec || !mdash_refs.sec.offsetParent) return;
      mdash_refrescar();
    }, MDASH_REFRESCO_MS);
  }

  if (secMando && !secMando.classList.contains('oculto')) mdash_refrescar();
}

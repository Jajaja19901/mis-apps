/* ============================================================================
 * 09-AJUSTES/LEGAL — VIGÍA IA · panel de configuración, PIN, cartel LOPDGDD,
 * informe/CSV de exportación. Prefijo cfg_. Estado interno en estado.cfgUI.
 * No toca localStorage directo: todo vía nuc_guardar/nuc_cargar.
 * ==========================================================================*/

/* --- Constantes propias (evitamos chocar con CFG_DEFECTOS) -----------------*/
const CFGA_UNIDADES = {
  fps: ' fps',
  scoreMin: '',
  ocultacionUmbral: ' / 100',
  carreraVel: '',
  ruidoNivel: ' / 100',
  sabotajeSens: ' / 100',
};
const CFGA_PIN_MAX_FALLOS = 5;
const CFGA_PIN_BLOQUEO_MS = 30000;

/* --- Utilidades internas ----------------------------------------------------*/
function cfg_avisar(msg, nivel) {
  if (typeof ui_toast === 'function') {
    try { ui_toast(msg, nivel || 'info'); return; } catch (e) { /* seguimos al aviso de consola */ }
  }
  console.warn('[ajustes] ' + msg);
}
function cfg_escapar(s) {
  return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function cfg_intentar(fn, valorDefecto) {
  try {
    const r = fn();
    return r === undefined ? valorDefecto : r;
  } catch (e) { return valorDefecto; }
}

/* ============================================================================
 * BINDING DECLARATIVO: recorre [data-cfg] dentro del panel de ajustes.
 * ==========================================================================*/
function cfg_bindings() {
  const raiz = document.getElementById('ui-panelAjustes') || document;
  const controles = raiz.querySelectorAll('[data-cfg]');
  controles.forEach(function (el) {
    const clave = el.getAttribute('data-cfg');
    if (!(clave in estado.cfg)) return;
    cfg_sincronizarControl(el, clave);

    if (clave === 'ruidoOn' && el.type === 'checkbox') {
      el.addEventListener('change', function () { cfg_manejarRuidoOn(el); });
      return;
    }

    const evento = (el.type === 'checkbox' || el.tagName === 'SELECT' || el.type === 'radio' || el.type === 'time') ? 'change' : 'input';
    el.addEventListener(evento, function () {
      cfg_actualizarDesdeControl(el, clave);
      if (el.type === 'range') cfg_actualizarSalida(el);
      if (clave === 'fuente') cfg_actualizarVisibilidadFuente();
    });
    if (el.type === 'range') {
      el.addEventListener('input', function () { cfg_actualizarSalida(el); });
    }
  });
}

function cfg_sincronizarControl(el, clave) {
  const v = estado.cfg[clave];
  if (el.type === 'checkbox') { el.checked = !!v; return; }
  if (el.type === 'radio') { el.checked = (String(v) === el.value); return; }
  el.value = (v === undefined || v === null) ? '' : v;
  if (el.type === 'range') cfg_actualizarSalida(el);
}

function cfg_castValor(el) {
  if (el.type === 'checkbox') return el.checked;
  if (el.type === 'number' || el.type === 'range') {
    const n = Number(el.value);
    return isNaN(n) ? 0 : n;
  }
  return el.value;
}

function cfg_actualizarDesdeControl(el, clave) {
  const v = cfg_castValor(el);
  estado.cfg[clave] = v;
  nuc_guardar('cfg', estado.cfg);
  bus.emit('cfg:cambio', { clave: clave });
}

function cfg_actualizarSalida(el) {
  const salida = document.getElementById(el.id + '-out');
  if (!salida) return;
  const clave = el.getAttribute('data-cfg');
  const unidad = CFGA_UNIDADES[clave] || '';
  salida.textContent = el.value + unidad;
}

function cfg_resincronizarTodos() {
  const raiz = document.getElementById('ui-panelAjustes') || document;
  const controles = raiz.querySelectorAll('[data-cfg]');
  controles.forEach(function (el) {
    const clave = el.getAttribute('data-cfg');
    if (clave in estado.cfg) cfg_sincronizarControl(el, clave);
  });
  cfg_actualizarVisibilidadFuente();
  cfg_actualizarNotaGestos();
}

/* --- Sección Ruido: activar/desactivar medición real ------------------------*/
async function cfg_manejarRuidoOn(checkbox) {
  const activar = checkbox.checked;
  estado.cfg.ruidoOn = activar;
  nuc_guardar('cfg', estado.cfg);
  bus.emit('cfg:cambio', { clave: 'ruidoOn' });

  if (!activar) {
    if (typeof alerta_ruidoParar === 'function') {
      try { alerta_ruidoParar(); } catch (e) { console.warn('[ajustes] alerta_ruidoParar:', e && e.message); }
    }
    return;
  }

  if (typeof alerta_ruidoInit !== 'function') {
    checkbox.checked = false;
    estado.cfg.ruidoOn = false;
    nuc_guardar('cfg', estado.cfg);
    bus.emit('cfg:cambio', { clave: 'ruidoOn' });
    cfg_avisar('El módulo de alertas no está disponible.', 'sospecha');
    return;
  }
  let ok = false;
  try { ok = await alerta_ruidoInit(); } catch (e) { ok = false; }
  if (!ok) {
    checkbox.checked = false;
    estado.cfg.ruidoOn = false;
    nuc_guardar('cfg', estado.cfg);
    bus.emit('cfg:cambio', { clave: 'ruidoOn' });
    cfg_avisar('No se pudo activar el micrófono para medir el ruido.', 'sospecha');
  }
}

/* --- Visibilidad condicional de la sección Fuente de vídeo ------------------*/
function cfg_actualizarVisibilidadFuente() {
  const actual = estado.cfg.fuente;
  const gCam = document.getElementById('cfg-grupoCamara');
  const gIP = document.getElementById('cfg-grupoIP');
  const gArc = document.getElementById('cfg-grupoArchivo');
  if (gCam) gCam.classList.toggle('oculto', actual !== 'camara');
  if (gIP) gIP.classList.toggle('oculto', actual !== 'ip');
  if (gArc) gArc.classList.toggle('oculto', actual !== 'archivo');
}

/* --- Nota honesta si el modelo de pose no cargó -----------------------------*/
function cfg_actualizarNotaGestos() {
  const nota = document.getElementById('cfg-notaGestos');
  if (!nota) return;
  const listo = !!(estado.modelos && estado.modelos.poseListo);
  nota.classList.toggle('oculto', listo);
}

/* --- Uso de almacenamiento ---------------------------------------------------*/
function cfg_refrescarUso() {
  const span = document.getElementById('cfg-usoMB');
  if (!span) return;
  const mb = (typeof nuc_usoAlmacenMB === 'function') ? cfg_intentar(nuc_usoAlmacenMB, 0) : 0;
  span.textContent = mb;
}

/* ============================================================================
 * MODAL MÍNIMO PROPIO (independiente de ui_modal). Motivo: el PIN es una
 * puerta de seguridad crítica que debe funcionar SIEMPRE aunque 05-ui no esté
 * cargado, y la API real de ui_modal cierra el modal salvo que el callback
 * devuelva `false` explícitamente — un contrato distinto al que necesitamos
 * aquí (poder mostrar un error de validación sin cerrar y sin dejar la
 * Promise de cfg_pinPedir colgada). Reutilizamos igualmente las clases
 * PÚBLICAS de 05-ui.css (regla §0.8) para que se vea y comporte como el resto
 * de modales de la app: `.ui-modal-fondo` `.ui-modal` `.ui-modal-cabecera`
 * `.ui-modal-cuerpo` `.ui-modal-pie`. Se monta en #ui-modales. Cada botón
 * recibe (cerrar) y decide si cierra o no (para validaciones sin cerrar).
 * ==========================================================================*/
function cfg_modal(tituloHTML, cuerpoNodo, botones) {
  const cont = document.getElementById('ui-modales');
  if (!cont) { cfg_avisar('No se pudo abrir el diálogo.', 'sospecha'); return null; }

  const velo = document.createElement('div');
  velo.className = 'ui-modal-fondo';

  const caja = document.createElement('div');
  caja.className = 'ui-modal tarjeta';

  const cabecera = document.createElement('div');
  cabecera.className = 'ui-modal-cabecera';
  const tit = document.createElement('h3');
  tit.className = 'sec-titulo';
  tit.innerHTML = tituloHTML;
  cabecera.appendChild(tit);
  caja.appendChild(cabecera);

  const cuerpo = document.createElement('div');
  cuerpo.className = 'ui-modal-cuerpo';
  if (typeof cuerpoNodo === 'string') cuerpo.innerHTML = cuerpoNodo;
  else if (cuerpoNodo) cuerpo.appendChild(cuerpoNodo);
  caja.appendChild(cuerpo);

  const filaBotones = document.createElement('div');
  filaBotones.className = 'fila ui-modal-pie';
  (botones || []).forEach(function (b) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn ' + (b.clase || 'btn-fantasma');
    btn.textContent = b.texto;
    btn.addEventListener('click', function () {
      try {
        const r = (typeof b.accion === 'function') ? b.accion(function () { cfg_cerrarModal(velo); }) : undefined;
        if (r && typeof r.then === 'function') {
          r.catch(function (e) { console.warn('[ajustes] fallo en acción del modal:', e && e.message); });
        }
      } catch (e) { console.warn('[ajustes] fallo en acción del modal:', e && e.message); }
    });
    filaBotones.appendChild(btn);
  });
  caja.appendChild(filaBotones);

  velo.appendChild(caja);
  cont.appendChild(velo);
  return velo;
}
function cfg_cerrarModal(velo) {
  if (velo && velo.parentNode) velo.parentNode.removeChild(velo);
}

/* ============================================================================
 * PIN de 4 dígitos — protege ajustes y el registro de alertas.
 * La vista monitor NUNCA lo pide.
 * ==========================================================================*/
function cfg_pinPedir(motivo) {
  return new Promise(function (resolve) {
    if (estado.ui.pinOk) { resolve(true); return; }
    const hash = nuc_cargar('pin', null);
    if (hash === null) cfg_pinFlujoCrear(motivo, resolve);
    else cfg_pinFlujoComprobar(motivo, hash, resolve);
  });
}

function cfg_pinFlujoCrear(motivo, resolve) {
  const cuerpo = document.createElement('div');
  cuerpo.innerHTML =
    '<p class="etiqueta">' + (motivo ? 'Crea un PIN de 4 dígitos para proteger ' + cfg_escapar(motivo) + '.' : 'Crea un PIN de 4 dígitos para proteger los ajustes.') + '</p>' +
    '<div class="campo"><label for="cfg-pinNuevo1">PIN (4 dígitos)</label>' +
    '<input type="password" inputmode="numeric" maxlength="4" id="cfg-pinNuevo1" autocomplete="off"></div>' +
    '<div class="campo"><label for="cfg-pinNuevo2">Repite el PIN</label>' +
    '<input type="password" inputmode="numeric" maxlength="4" id="cfg-pinNuevo2" autocomplete="off"></div>' +
    '<p id="cfg-pinError" class="etiqueta oculto"></p>';

  cfg_modal('Crear PIN de acceso', cuerpo, [
    { texto: 'Cancelar', clase: 'btn-fantasma', accion: function (cerrar) { cerrar(); resolve(false); } },
    {
      texto: 'Crear PIN', clase: 'btn-primario', accion: async function (cerrar) {
        const p1 = document.getElementById('cfg-pinNuevo1');
        const p2 = document.getElementById('cfg-pinNuevo2');
        const err = document.getElementById('cfg-pinError');
        const v1 = p1 ? p1.value.trim() : '';
        const v2 = p2 ? p2.value.trim() : '';
        if (!/^\d{4}$/.test(v1) || v1 !== v2) {
          if (err) { err.textContent = 'Introduce el mismo PIN de 4 dígitos en ambos campos.'; err.classList.remove('oculto'); }
          return;
        }
        const hash = await nuc_hashTexto(v1);
        nuc_guardar('pin', hash);
        estado.ui.pinOk = true;
        cerrar();
        resolve(true);
      },
    },
  ]);
}

function cfg_pinFlujoComprobar(motivo, hashGuardado, resolve) {
  const cuerpo = document.createElement('div');
  cuerpo.innerHTML =
    '<p class="etiqueta">' + (motivo ? 'Introduce el PIN para ' + cfg_escapar(motivo) + '.' : 'Introduce el PIN.') + '</p>' +
    '<div class="campo"><label for="cfg-pinIntento">PIN</label>' +
    '<input type="password" inputmode="numeric" maxlength="4" id="cfg-pinIntento" autocomplete="off"></div>' +
    '<p id="cfg-pinError" class="etiqueta oculto"></p>';

  cfg_modal('PIN de acceso', cuerpo, [
    { texto: 'Cancelar', clase: 'btn-fantasma', accion: function (cerrar) { cerrar(); resolve(false); } },
    {
      texto: 'Entrar', clase: 'btn-primario', accion: async function (cerrar) {
        const err = document.getElementById('cfg-pinError');
        const ahora = Date.now();
        if (estado.cfgUI.pinBloqueadoHasta && ahora < estado.cfgUI.pinBloqueadoHasta) {
          const seg = Math.ceil((estado.cfgUI.pinBloqueadoHasta - ahora) / 1000);
          if (err) { err.textContent = 'Demasiados intentos. Espera ' + seg + ' s.'; err.classList.remove('oculto'); }
          return;
        }
        const input = document.getElementById('cfg-pinIntento');
        const v = input ? input.value.trim() : '';
        const hash = await nuc_hashTexto(v);
        if (hash === hashGuardado) {
          estado.cfgUI.pinFallos = 0;
          estado.ui.pinOk = true;
          cerrar();
          resolve(true);
        } else {
          estado.cfgUI.pinFallos = (estado.cfgUI.pinFallos || 0) + 1;
          if (estado.cfgUI.pinFallos >= CFGA_PIN_MAX_FALLOS) {
            estado.cfgUI.pinBloqueadoHasta = Date.now() + CFGA_PIN_BLOQUEO_MS;
            estado.cfgUI.pinFallos = 0;
            if (err) { err.textContent = 'PIN incorrecto 5 veces. Bloqueado 30 s.'; err.classList.remove('oculto'); }
          } else if (err) {
            err.textContent = 'PIN incorrecto.'; err.classList.remove('oculto');
          }
          if (input) input.value = '';
        }
      },
    },
  ]);
}

function cfg_pinCambiar() {
  const hashActual = nuc_cargar('pin', null);
  if (hashActual === null) {
    cfg_pinFlujoCrear('el PIN de acceso', function () {});
    return;
  }
  cfg_pinFlujoComprobar('confirmar el PIN actual', hashActual, function (ok) {
    if (ok) {
      cfg_pinFlujoCrear('el nuevo PIN', function (creado) {
        if (creado) cfg_avisar('PIN actualizado.', 'info');
      });
    }
  });
}

/* ============================================================================
 * CARTEL "ZONA VIDEOVIGILADA" (art. 22 LOPDGDD)
 * ==========================================================================*/
function cfg_generarCartel() {
  const cuerpo = document.createElement('div');
  cuerpo.innerHTML =
    '<div class="campo"><label for="cfg-cartelResp">Responsable del tratamiento</label>' +
    '<input type="text" id="cfg-cartelResp" placeholder="Nombre o razón social" value="' + cfg_escapar(estado.cfg.legalResponsable || '') + '"></div>' +
    '<div class="campo"><label for="cfg-cartelContacto">Contacto para ejercer derechos</label>' +
    '<input type="text" id="cfg-cartelContacto" placeholder="email o dirección postal" value="' + cfg_escapar(estado.cfg.legalContacto || '') + '"></div>';

  cfg_modal('Generar cartel "Zona videovigilada"', cuerpo, [
    { texto: 'Cancelar', clase: 'btn-fantasma', accion: function (cerrar) { cerrar(); } },
    {
      texto: 'Generar', clase: 'btn-primario', accion: function (cerrar) {
        const campoResp = document.getElementById('cfg-cartelResp');
        const campoCont = document.getElementById('cfg-cartelContacto');
        const resp = campoResp ? campoResp.value : '';
        const cont = campoCont ? campoCont.value : '';
        estado.cfg.legalResponsable = resp;
        estado.cfg.legalContacto = cont;
        nuc_guardar('cfg', estado.cfg);
        bus.emit('cfg:cambio', { clave: 'legalResponsable' });
        cfg_resincronizarTodos();

        const html = cfg_cartelHTML(resp, cont);
        nuc_descargar('cartel-zona-videovigilada.html', html, 'text/html');
        cfg_imprimirHTML(html);
        cerrar();
      },
    },
  ]);
}

function cfg_pictogramaCamaraSVG() {
  return '<svg width="120" height="120" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<rect x="10" y="40" width="70" height="46" rx="8" fill="#111"/>' +
    '<polygon points="80,50 110,35 110,90 80,76" fill="#111"/>' +
    '<circle cx="45" cy="63" r="18" fill="#fff"/>' +
    '<circle cx="45" cy="63" r="11" fill="#111"/>' +
    '<circle cx="45" cy="63" r="4" fill="#fff"/>' +
    '<rect x="20" y="28" width="26" height="14" rx="3" fill="#111"/>' +
    '</svg>';
}

function cfg_cartelHTML(resp, cont) {
  const responsable = resp && resp.trim() ? resp.trim() : '(pendiente de indicar)';
  const contacto = cont && cont.trim() ? cont.trim() : '(pendiente de indicar)';
  return (
    '<!doctype html><html lang="es"><head><meta charset="utf-8">' +
    '<title>Zona videovigilada</title>' +
    '<style>' +
    '@page{size:A4;margin:12mm}' +
    'body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:0;padding:0;display:flex;align-items:center;justify-content:center;min-height:100vh}' +
    '.cartel{border:6px solid #111;border-radius:12px;padding:28px 32px;max-width:640px;text-align:center}' +
    '.cartel h1{font-size:2rem;letter-spacing:.05em;margin:.6rem 0 1rem}' +
    '.cartel p{font-size:1rem;line-height:1.5;text-align:left;margin:.4rem 0}' +
    '.cartel footer{margin-top:1.4rem;font-size:.75rem;color:#555}' +
    '</style></head><body>' +
    '<div class="cartel">' +
    cfg_pictogramaCamaraSVG() +
    '<h1>ZONA VIDEOVIGILADA</h1>' +
    '<p>Este establecimiento dispone de un sistema de videovigilancia con fines de seguridad, conforme al art. 22 de la Ley Orgánica 3/2018 (LOPDGDD).</p>' +
    '<p><strong>Responsable:</strong> ' + cfg_escapar(responsable) + '.</p>' +
    '<p>Puede ejercer sus derechos de acceso y supresión ante: <strong>' + cfg_escapar(contacto) + '</strong>.</p>' +
    '<p>Más información: <strong>www.aepd.es</strong>. Las imágenes se conservan un máximo de 1 mes.</p>' +
    '<footer>' + cfg_escapar(CONFIG.STUDIO_BRAND) + '</footer>' +
    '</div>' +
    '</body></html>'
  );
}

function cfg_imprimirHTML(html) {
  try {
    const w = window.open('', '_blank');
    if (!w) {
      cfg_avisar('El navegador bloqueó la ventana de impresión; se ha descargado el archivo para imprimirlo manualmente.', 'sospecha');
      return;
    }
    w.document.write(html);
    w.document.close();
    setTimeout(function () {
      try { w.print(); } catch (e) { console.warn('[ajustes] print():', e && e.message); }
    }, 300);
  } catch (e) {
    cfg_avisar('No se pudo abrir la vista de impresión; usa el archivo descargado.', 'sospecha');
  }
}

/* ============================================================================
 * TEXTO LEGAL reutilizable (panel §11 y pie de informes)
 * ==========================================================================*/
function cfg_legalHTML() {
  return (
    '<p>Este sistema utiliza cámaras para detectar aforo, comportamientos y vehículos con fines de seguridad. ' +
    'En España, el uso de videovigilancia en un negocio debe cumplir el art. 22 de la LOPDGDD y la guía de la AEPD:</p>' +
    '<ul>' +
    '<li><strong>Cartel informativo obligatorio</strong>: hay que colocar en un lugar visible, antes de entrar en la zona grabada, ' +
    'un cartel que informe de la videovigilancia y de dónde ejercer los derechos.</li>' +
    '<li><strong>Prohibido el reconocimiento facial biométrico</strong> en comercios sin consentimiento expreso e informado. ' +
    'Este sistema NO hace reconocimiento facial ni identifica personas: solo detecta personas, objetos y comportamientos genéricos.</li>' +
    '<li><strong>Conservación máxima de 1 mes</strong>, salvo denuncia, investigación o procedimiento judicial en curso.</li>' +
    '<li><strong>Registro de actividades de tratamiento</strong> a cargo del titular del negocio.</li>' +
    '<li><strong>Derecho de acceso</strong> de los interesados ante el responsable indicado en el cartel.</li>' +
    '</ul>' +
    '<p>Este software es una herramienta de apoyo; el responsable del tratamiento es el titular del negocio.</p>'
  );
}

/* ============================================================================
 * EXPORTACIÓN: informe HTML del día y CSV por hora
 * ==========================================================================*/
function cfg_exportarInforme() {
  const datos = (typeof stats_datosHoy === 'function') ? cfg_intentar(stats_datosHoy, null) : null;

  let grafico = '';
  try {
    const cv = document.getElementById('stats-grafico');
    if (cv && typeof cv.toDataURL === 'function') grafico = cv.toDataURL('image/png');
  } catch (e) { grafico = ''; }

  let alertasHoy = [];
  if (typeof alerta_log === 'function') {
    try {
      const hoy = nuc_diaClave();
      alertasHoy = (alerta_log() || []).filter(function (r) { return nuc_diaClave(r.ts) === hoy; });
    } catch (e) { alertasHoy = []; }
  }

  const filasHora = [];
  for (let h = 0; h < 24; h++) {
    const v = (datos && datos.porHora) ? (datos.porHora[h] || 0) : 0;
    filasHora.push('<tr><td>' + (h < 10 ? '0' : '') + h + ':00</td><td>' + v + '</td></tr>');
  }

  const filasAlertas = alertasHoy.map(function (r) {
    const foto = r.foto ? '<img src="' + r.foto + '" alt="" style="width:64px;height:auto;border-radius:4px">' : '—';
    return '<tr><td>' + cfg_escapar(nuc_horaCorta(r.ts)) + '</td><td>' + cfg_escapar(r.nivel) + '</td>' +
      '<td>' + cfg_escapar(r.texto) + '</td><td>' + foto + '</td></tr>';
  }).join('');

  const nombreNegocio = cfg_escapar((typeof CONFIG !== 'undefined' && CONFIG.NOMBRE_NEGOCIO) || 'Tu Negocio');
  const html = (
    '<!doctype html><html lang="es"><head><meta charset="utf-8">' +
    '<title>Informe ' + cfg_escapar(nuc_diaClave()) + ' — ' + nombreNegocio + '</title>' +
    '<style>' +
    'body{font-family:system-ui,Arial,sans-serif;color:#1a232e;max-width:900px;margin:2rem auto;padding:0 1rem}' +
    'h1{margin-bottom:.2rem}h2{margin-top:2rem;border-bottom:1px solid #ccc;padding-bottom:.3rem}' +
    'table{width:100%;border-collapse:collapse;margin-top:.5rem}' +
    'td,th{padding:.4rem .6rem;border-bottom:1px solid #eee;text-align:left;font-size:.9rem}' +
    '.totales{display:flex;gap:1.5rem;flex-wrap:wrap;margin:1rem 0}' +
    '.totales div{background:#f4f6f8;border-radius:8px;padding:.8rem 1.2rem}' +
    '.cifra{font-size:1.6rem;font-weight:700}' +
    'footer{margin-top:2rem;font-size:.8rem;color:#7d8fa0}' +
    '</style></head><body>' +
    '<h1>Informe del día — ' + nombreNegocio + '</h1>' +
    '<p>' + cfg_escapar(nuc_fechaHora()) + '</p>' +
    '<div class="totales">' +
    '<div><div class="cifra">' + (datos ? datos.visitantes : '—') + '</div><div>Visitantes</div></div>' +
    '<div><div class="cifra">' + (datos ? datos.entradas : '—') + '</div><div>Entradas</div></div>' +
    '<div><div class="cifra">' + (datos ? datos.salidas : '—') + '</div><div>Salidas</div></div>' +
    '<div><div class="cifra">' + (datos && datos.alertas ? datos.alertas.total : '—') + '</div><div>Alertas</div></div>' +
    '<div><div class="cifra">' + (datos ? datos.picoAforo : '—') + '</div><div>Pico de aforo</div></div>' +
    '</div>' +
    (grafico ? '<h2>Afluencia por hora</h2><img src="' + grafico + '" alt="Gráfico de afluencia" style="max-width:100%">' : '') +
    '<h2>Datos por hora</h2><table><thead><tr><th>Hora</th><th>Visitantes</th></tr></thead><tbody>' + filasHora.join('') + '</tbody></table>' +
    '<h2>Alertas del día</h2>' +
    (filasAlertas ? '<table><thead><tr><th>Hora</th><th>Nivel</th><th>Detalle</th><th>Foto</th></tr></thead><tbody>' + filasAlertas + '</tbody></table>' : '<p>Sin alertas registradas hoy.</p>') +
    '<footer>Generado por ' + cfg_escapar((typeof CONFIG !== 'undefined' && CONFIG.NOMBRE_APP) || 'Vigía IA') +
    ' · Diseñado por ' + cfg_escapar((typeof CONFIG !== 'undefined' && CONFIG.STUDIO_BRAND) || 'Incuba tu Negocio') +
    ' · por ' + cfg_escapar((typeof CONFIG !== 'undefined' && CONFIG.STUDIO_AUTHOR) || 'Jaime M. M.') + '</footer>' +
    '</body></html>'
  );
  nuc_descargar('informe_' + nuc_diaClave() + '.html', html, 'text/html');
}

function cfg_exportarCSV() {
  let csv = '';
  if (typeof stats_datosCSV === 'function') {
    csv = cfg_intentar(stats_datosCSV, '');
  }
  if (!csv) {
    cfg_avisar('No hay datos de estadísticas disponibles todavía.', 'sospecha');
    return;
  }
  // stats_datosCSV() ya antepone el BOM UTF-8; no lo dupliquemos aquí.
  const conBOM = csv.charCodeAt(0) === 0xFEFF ? csv : '﻿' + csv;
  nuc_descargar('vigia_' + nuc_diaClave() + '.csv', conBOM, 'text/csv;charset=utf-8');
}

/* ============================================================================
 * RESTAURAR VALORES DE FÁBRICA
 * ==========================================================================*/
function cfg_restaurar() {
  cfg_confirmar('¿Restaurar todos los ajustes a los valores de fábrica? Se perderán los cambios de configuración (no se borran zonas, PIN ni el registro de alertas).', 'Sí, restaurar', function () {
    estado.cfg = Object.assign({}, CFG_DEFECTOS);
    nuc_guardar('cfg', estado.cfg);
    bus.emit('cfg:cambio', { clave: '*' });
    cfg_resincronizarTodos();
    cfg_avisar('Ajustes restaurados a los valores de fábrica.', 'info');
  });
}

/* Confirmación asíncrona (nada de confirm() nativo: bloquea el hilo y congela
 * la app bajo el verificador automático). */
function cfg_confirmar(msg, textoOk, alConfirmar) {
  if (typeof ui_confirmar === 'function') {
    ui_confirmar(msg, textoOk).then(function (si) { if (si) alConfirmar(); }).catch(function () {});
  } else {
    cfg_avisar('No se pudo abrir la confirmación.', 'sospecha');
  }
}

/* ============================================================================
 * CONEXIÓN DE BOTONES (siempre con typeof-check de funciones de otros módulos)
 * ==========================================================================*/
function cfg_conectarBotones() {
  const $ = function (id) { return document.getElementById(id); };

  const btnCam = $('cfg-btnActivarCamara');
  if (btnCam) btnCam.addEventListener('click', function () {
    if (typeof vid_usarCamara !== 'function') { cfg_avisar('El módulo de vídeo aún no está disponible.', 'sospecha'); return; }
    try {
      Promise.resolve(vid_usarCamara()).catch(function (e) { console.warn('[ajustes] vid_usarCamara:', e && e.message); });
    } catch (e) { console.warn('[ajustes] vid_usarCamara:', e && e.message); }
  });

  const btnIP = $('cfg-btnConectarIP');
  if (btnIP) btnIP.addEventListener('click', function () {
    const campo = $('cfg-urlIP');
    const url = campo ? campo.value.trim() : '';
    if (!url) { cfg_avisar('Escribe la URL de la cámara IP.', 'sospecha'); return; }
    if (typeof vid_usarIP !== 'function') { cfg_avisar('El módulo de vídeo aún no está disponible.', 'sospecha'); return; }
    try {
      Promise.resolve(vid_usarIP(url)).catch(function (e) { console.warn('[ajustes] vid_usarIP:', e && e.message); });
    } catch (e) { console.warn('[ajustes] vid_usarIP:', e && e.message); }
  });

  const btnDemo = $('cfg-btnCargarDemo');
  if (btnDemo) btnDemo.addEventListener('click', function () {
    const input = $('cfg-archivoDemo');
    const file = input && input.files && input.files[0];
    if (!file) { cfg_avisar('Elige antes un archivo de vídeo.', 'sospecha'); return; }
    if (typeof vid_usarArchivo !== 'function') { cfg_avisar('El módulo de vídeo aún no está disponible.', 'sospecha'); return; }
    try {
      Promise.resolve(vid_usarArchivo(file)).catch(function (e) { console.warn('[ajustes] vid_usarArchivo:', e && e.message); });
    } catch (e) { console.warn('[ajustes] vid_usarArchivo:', e && e.message); }
  });

  const btnStop = $('cfg-btnDetenerFuente');
  if (btnStop) btnStop.addEventListener('click', function () {
    if (typeof vid_detener === 'function') {
      try { vid_detener(); } catch (e) { console.warn('[ajustes] vid_detener:', e && e.message); }
    } else { cfg_avisar('El módulo de vídeo aún no está disponible.', 'sospecha'); }
  });

  ['info', 'sospecha', 'critico'].forEach(function (nivel) {
    const btn = $('cfg-btnProbar-' + nivel);
    if (btn) btn.addEventListener('click', function () {
      if (typeof alerta_probar === 'function') {
        try { alerta_probar(nivel); } catch (e) { console.warn('[ajustes] alerta_probar:', e && e.message); }
      } else { cfg_avisar('El módulo de alertas aún no está disponible.', 'sospecha'); }
    });
  });

  const btnTG = $('cfg-btnTelegramProbar');
  if (btnTG) btnTG.addEventListener('click', function () {
    if (typeof alerta_telegramProbar !== 'function') { cfg_avisar('El módulo de alertas aún no está disponible.', 'sospecha'); return; }
    try {
      Promise.resolve(alerta_telegramProbar()).catch(function (e) { console.warn('[ajustes] alerta_telegramProbar:', e && e.message); });
    } catch (e) { console.warn('[ajustes] alerta_telegramProbar:', e && e.message); }
  });

  const btnBorrarLog = $('cfg-btnBorrarLog');
  if (btnBorrarLog) btnBorrarLog.addEventListener('click', function () {
    cfg_confirmar('¿Borrar todo el registro de alertas? No se puede deshacer.', 'Sí, borrar', function () {
      if (typeof alerta_borrarLog === 'function') {
        try { alerta_borrarLog(); cfg_avisar('Registro de alertas borrado.', 'info'); } catch (e) { console.warn('[ajustes] alerta_borrarLog:', e && e.message); }
      } else { cfg_avisar('El módulo de alertas aún no está disponible.', 'sospecha'); }
    });
  });

  const btnBorrarZonas = $('cfg-btnBorrarZonas');
  if (btnBorrarZonas) btnBorrarZonas.addEventListener('click', function () {
    cfg_confirmar('¿Borrar todas las zonas y líneas dibujadas? No se puede deshacer.', 'Sí, borrar', function () {
      if (typeof zona_borrarTodo === 'function') {
        try { zona_borrarTodo(); cfg_avisar('Zonas y líneas borradas.', 'info'); } catch (e) { console.warn('[ajustes] zona_borrarTodo:', e && e.message); }
      } else { cfg_avisar('El módulo de zonas aún no está disponible.', 'sospecha'); }
    });
  });

  const btnRestaurar = $('cfg-btnRestaurar');
  if (btnRestaurar) btnRestaurar.addEventListener('click', cfg_restaurar);

  const btnPin = $('cfg-btnCambiarPin');
  if (btnPin) btnPin.addEventListener('click', cfg_pinCambiar);

  const btnCartel = $('cfg-btnCartel');
  if (btnCartel) btnCartel.addEventListener('click', cfg_generarCartel);

  const btnInforme = $('cfg-btnInforme');
  if (btnInforme) btnInforme.addEventListener('click', cfg_exportarInforme);

  const btnCSV = $('cfg-btnCSV');
  if (btnCSV) btnCSV.addEventListener('click', cfg_exportarCSV);
}

/* ============================================================================
 * INICIO DEL MÓDULO
 * ==========================================================================*/
function cfg_init() {
  estado.cfgUI = { pinFallos: 0, pinBloqueadoHasta: 0 };

  cfg_bindings();
  cfg_actualizarVisibilidadFuente();
  cfg_actualizarNotaGestos();
  cfg_refrescarUso();
  cfg_conectarBotones();

  bus.on('pose:error', function () { cfg_actualizarNotaGestos(); });
  bus.on('pose:listo', function () { cfg_actualizarNotaGestos(); });

  const secSistema = document.getElementById('cfg-secSistema');
  if (secSistema) {
    secSistema.addEventListener('toggle', function () {
      if (secSistema.open) cfg_refrescarUso();
    });
  }
}

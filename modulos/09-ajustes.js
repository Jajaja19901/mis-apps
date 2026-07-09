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

/* Navega a un acordeón y lo abre. */
function cfg_ir(idAcordeon) {
  const el = document.getElementById(idAcordeon);
  if (el) {
    el.setAttribute('open', '');
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
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
  const gDash = document.getElementById('cfg-grupoDashcam');
  const gArc = document.getElementById('cfg-grupoArchivo');
  if (gCam) gCam.classList.toggle('oculto', actual !== 'camara');
  if (gIP) gIP.classList.toggle('oculto', actual !== 'ip');
  if (gDash) gDash.classList.toggle('oculto', actual !== 'dashcam');
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
  cfg_avisar('Informe del día descargado.', 'info');
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
  cfg_avisar('CSV del día descargado.', 'info');
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

/* Copia texto al portapapeles (con reserva si no hay API). */
function cfg_copiar(texto, boton) {
  const ok = function () { if (boton) { const t = boton.textContent; boton.textContent = '✓ Copiado'; setTimeout(function () { boton.textContent = t; }, 1500); } };
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(texto).then(ok).catch(function () { cfg_copiarReserva(texto, ok); });
    } else { cfg_copiarReserva(texto, ok); }
  } catch (e) { cfg_copiarReserva(texto, ok); }
}
function cfg_copiarReserva(texto, ok) {
  try {
    const ta = document.createElement('textarea');
    ta.value = texto; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); ta.remove(); if (ok) ok();
  } catch (e) { /* sin portapapeles: el usuario copia a mano */ }
}

/* GUÍA "Conectar mi dashcam": asistente paso a paso con botones de copiar. */
function cfg_guiaDashcam() {
  const urlRtsp = 'rtsp://192.168.1.254/liveRTSP/av4';
  const cmdInstalar =
    'pkg update -y && pkg install wget -y\n' +
    'mkdir -p ~/vigia && cd ~/vigia\n' +
    'wget -O go2rtc https://github.com/AlexxIT/go2rtc/releases/latest/download/go2rtc_linux_arm64\n' +
    'chmod +x go2rtc';
  const cmdYaml =
    "cat > ~/vigia/go2rtc.yaml <<'EOF'\n" +
    'api:\n' +
    '  listen: ":1984"\n' +
    '  origin: "*"\n' +          // CORS: sin esto el navegador no puede analizar el vídeo
    'streams:\n' +
    '  dashcam: ' + urlRtsp + '\n' +
    'EOF';
  const cmdArrancar = 'cd ~/vigia && ./go2rtc';
  const cmdScript =
    "cat > ~/vigia/arrancar-dashcam.sh <<'EOF'\n" +
    '#!/data/data/com.termux/files/usr/bin/bash\n' +
    'cd ~/vigia && ./go2rtc\n' +
    'EOF\n' +
    'chmod +x ~/vigia/arrancar-dashcam.sh';

  const cont = document.createElement('div');
  cont.className = 'cfg-guia';
  cont.innerHTML =
    '<p><b>Paso 1.</b> Conecta el móvil al <b>WiFi de tu dashcam</b> (el mismo que usas con su app, TiCam). <b>NO</b> quites los datos móviles: hacen falta para las alertas de Telegram.</p>' +
    '<p><b>Paso 2.</b> Comprueba el vídeo con <b>VLC</b> → «Abrir ubicación de red» y prueba estas direcciones; apunta la que funcione:</p>' +
    '<div class="cfg-cmd"><code>rtsp://192.168.1.254/liveRTSP/av4</code></div>' +
    '<div class="cfg-cmd"><code>rtsp://192.168.1.254/xxx.mov</code></div>' +
    '<p><b>Paso 3.</b> Instala <b>Termux</b> (desde F-Droid) y pega estos bloques uno a uno. Si tu URL RTSP del paso 2 es distinta, cámbiala en el segundo bloque.</p>' +
    '<p class="etiqueta">a) Descargar go2rtc:</p>' + cfg_bloqueCmd(cmdInstalar, 'g1') +
    '<p class="etiqueta">b) Crear la configuración (con la cámara y CORS activado):</p>' + cfg_bloqueCmd(cmdYaml, 'g2') +
    '<p class="etiqueta">c) Arrancarlo:</p>' + cfg_bloqueCmd(cmdArrancar, 'g3') +
    '<p class="etiqueta">d) (Opcional) Script para arrancarlo de un toque las próximas veces:</p>' + cfg_bloqueCmd(cmdScript, 'g4') +
    '<p><b>Paso 4.</b> Vuelve a VIGÍA, deja la fuente en <b>Dashcam</b> y pulsa <b>«Probar conexión»</b>. Si va, pulsa <b>«Conectar dashcam»</b>.</p>' +
    '<p class="cfg-aviso">⚠ Avisos honestos:<br>' +
    '• En algunos firmwares, la app de la dashcam (TiCam) y VIGÍA <b>no pueden</b> usar el stream a la vez: <b>cierra TiCam</b> primero.<br>' +
    '• La calidad del stream por WiFi suele ser <b>menor</b> que la grabación en la tarjeta SD. La SD sigue siendo la grabación buena; VIGÍA es el <b>análisis y los avisos</b>.<br>' +
    '• Si el vídeo se ve pero «no se puede analizar», es que falta el <code>origin: "*"</code> del bloque b).</p>';

  if (typeof ui_modal === 'function') {
    ui_modal('Conectar mi dashcam', cont, [{ texto: 'Cerrar', clase: 'btn-primario', fn: function () {} }]);
    // conectar los botones de copiar (tras insertarse en el DOM)
    setTimeout(function () {
      [['cfg-copiar-g1', cmdInstalar], ['cfg-copiar-g2', cmdYaml], ['cfg-copiar-g3', cmdArrancar], ['cfg-copiar-g4', cmdScript]]
        .forEach(function (par) {
          const b = document.getElementById(par[0]);
          if (b) b.addEventListener('click', function () { cfg_copiar(par[1], b); });
        });
    }, 30);
  } else {
    cfg_avisar('Abre Ajustes para ver la guía.', 'info');
  }
}
function cfg_bloqueCmd(texto, id) {
  const estiloPre = 'style="background:#0b0f14;border:1px solid #233140;border-radius:8px;padding:10px;margin:4px 0;overflow-x:auto;white-space:pre;font-family:ui-monospace,monospace;font-size:.8rem;color:#cfdae4;"';
  return '<div class="cfg-cmd">' +
    '<pre ' + estiloPre + '>' + cfg_escapar(texto) + '</pre>' +
    '<button type="button" class="btn btn-mini" id="cfg-copiar-' + id + '">Copiar</button></div>';
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

  // Inicio rápido: atajos de un toque a las secciones más usadas.
  const cfg_atajo = function (idBtn, fn) {
    const b = $(idBtn); if (b) b.addEventListener('click', fn);
  };
  const cfg_marcarFuente = function (idRadio) {
    const r = $(idRadio);
    if (r && !r.checked) { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); }
    cfg_ir('cfg-secFuente');
  };
  cfg_atajo('cfg-irCamara', function () { cfg_marcarFuente('cfg-fuente-camara'); });
  cfg_atajo('cfg-irDashcam', function () { cfg_marcarFuente('cfg-fuente-dashcam'); });
  cfg_atajo('cfg-irMotor', function () { cfg_ir('cfg-secDeteccion'); });
  cfg_atajo('cfg-irCopiloto', function () {
    if (typeof ui_cerrarAjustes === 'function') { try { ui_cerrarAjustes(); } catch (e) {} }
    if (typeof cop_alternar === 'function') { try { cop_alternar(true); } catch (e) {} }
  });

  const btnCam = $('cfg-btnActivarCamara');
  if (btnCam) btnCam.addEventListener('click', function () {
    if (typeof vid_usarCamara !== 'function') { cfg_avisar('El módulo de vídeo aún no está disponible.', 'sospecha'); return; }
    try {
      Promise.resolve(vid_usarCamara()).catch(function (e) { console.warn('[ajustes] vid_usarCamara:', e && e.message); });
    } catch (e) { console.warn('[ajustes] vid_usarCamara:', e && e.message); }
  });

  // Buscar las cámaras/lentes reales y rellenar el selector
  const selLente = $('cfg-camaraDispositivo');
  const btnBuscar = $('cfg-btnBuscarCamaras');
  if (btnBuscar && selLente) btnBuscar.addEventListener('click', function () {
    if (typeof vid_listarCamaras !== 'function') { cfg_avisar('El módulo de vídeo aún no está disponible.', 'sospecha'); return; }
    btnBuscar.disabled = true;
    Promise.resolve(vid_listarCamaras()).then(function (camaras) {
      const elegida = estado.cfg.camaraId || '';
      selLente.innerHTML = '<option value="">Automática (por lado)</option>';
      (camaras || []).forEach(function (c) {
        const op = document.createElement('option');
        op.value = c.id; op.textContent = c.etiqueta;
        if (c.id === elegida) op.selected = true;
        selLente.appendChild(op);
      });
      if (!camaras || !camaras.length) cfg_avisar('No se encontraron cámaras (¿permiso denegado o sin HTTPS?).', 'sospecha');
      else cfg_avisar('Encontradas ' + camaras.length + ' cámara(s). Elige la principal y pulsa «Activar cámara».', 'info');
    }).catch(function (e) { console.warn('[ajustes] listar cámaras:', e && e.message); })
      .then(function () { btnBuscar.disabled = false; });
  });
  // Al elegir una lente concreta: guardar deviceId y reactivar la cámara
  if (selLente) selLente.addEventListener('change', function () {
    estado.cfg.camaraId = selLente.value || '';
    nuc_guardar('cfg', estado.cfg);
    bus.emit('cfg:cambio', { clave: 'camaraId' });
    if (estado.cfg.fuente === 'camara' && typeof vid_usarCamara === 'function') {
      Promise.resolve(vid_usarCamara()).catch(function () {});
    }
  });

  // Motor de detección: Básico / Potente (Transformers.js) / Supercerebro (ONNX).
  const selMotor = $('cfg-motor');
  const grupoYolo = $('cfg-grupoYolo');
  const grupoOnnx = $('cfg-grupoOnnx');
  const cfg_mostrarMotor = function () {
    if (grupoYolo) grupoYolo.classList.toggle('oculto', estado.cfg.motor !== 'yolo');
    if (grupoOnnx) grupoOnnx.classList.toggle('oculto', estado.cfg.motor !== 'onnx');
    const b = $('cfg-scBackend');
    if (b) b.textContent = (estado.sc && estado.sc.backend) ? estado.sc.backend.toUpperCase() : '—';
    // Chivato del motor potente: ¿corre en hilo aparte (fluido) o no?
    const est = $('cfg-yoloEstado');
    if (est) {
      const y = estado.yolo;
      if (!y || !y.listo) est.textContent = y && y.cargando ? '⏳ Cargando el motor potente…' : '';
      else est.textContent = y.workerListo
        ? '✅ Corre en un hilo aparte: NO traba la aplicación.'
        : '⚠ Corre en el hilo principal: puede dar tirones (este navegador no permite el hilo aparte).';
    }
  };
  cfg_mostrarMotor();
  if (typeof bus !== 'undefined' && bus.on) bus.on('modelos:listos', function () { cfg_mostrarMotor(); });
  const verApp = $('cfg-version');
  if (verApp && typeof CONFIG !== 'undefined') verApp.textContent = 'v' + (CONFIG.VERSION || '?');
  if (selMotor) selMotor.addEventListener('change', function () {
    cfg_mostrarMotor();
    if (selMotor.value === 'yolo') {
      if (typeof yolo_init === 'function') {
        Promise.resolve(yolo_init()).catch(function (e) { console.warn('[ajustes] yolo_init:', e && e.message); });
      } else { cfg_avisar('El motor potente no está disponible.', 'sospecha'); }
    } else if (selMotor.value === 'onnx') {
      cfg_avisar('Elige un modelo y pulsa «Descargar y activar».', 'info');
    } else {
      cfg_avisar('Detector básico activo.', 'info');
    }
  });

  // --- Supercerebro (ONNX-YOLO11) ---
  const selSc = $('cfg-scModelo');
  if (selSc) selSc.value = estado.cfg.scModelo || 'n';
  const progSc = $('cfg-scProgreso');
  const resSc = $('cfg-scResultados');
  const btnScActivar = $('cfg-btnScActivar');
  if (btnScActivar) btnScActivar.addEventListener('click', function () {
    if (typeof sc_activar !== 'function') { cfg_avisar('El supercerebro no está disponible.', 'sospecha'); return; }
    const clave = selSc ? selSc.value : 'n';
    btnScActivar.disabled = true;
    if (progSc) progSc.textContent = 'Descargando…';
    Promise.resolve(sc_activar(clave, function (pct, mb) {
      if (progSc) progSc.textContent = 'Descargando ' + (pct != null ? pct + '%' : Math.round(mb) + ' MB…');
    })).then(function (ok) {
      if (progSc) progSc.textContent = ok
        ? '✅ Activo (' + ((estado.sc && estado.sc.backend) || '?').toUpperCase() + ')'
        : '❌ No se pudo activar (mira el aviso).';
      cfg_mostrarMotor();
    }).catch(function () { if (progSc) progSc.textContent = '❌ Error.'; })
      .then(function () { btnScActivar.disabled = false; });
  });
  const btnScBench = $('cfg-btnScBench');
  if (btnScBench) btnScBench.addEventListener('click', function () {
    if (typeof sc_benchmark !== 'function') return;
    btnScBench.disabled = true;
    if (resSc) resSc.textContent = 'Midiendo…';
    Promise.resolve(sc_benchmark(function (t) { if (resSc) resSc.textContent = t; })).then(function (inf) {
      if (!resSc) return;
      if (!inf) { resSc.textContent = 'No se pudo medir.'; return; }
      let html = '<b>Backend:</b> ' + cfg_escapar((inf.backend || '?').toUpperCase());
      if (inf.memoriaMB) html += ' · <b>Memoria JS:</b> ' + inf.memoriaMB + ' MB';
      html += '<br>';
      ['n', 's', 'm'].forEach(function (k) {
        const r = inf.resultados[k] || {};
        const nombre = { n: 'YOLO11n', s: 'YOLO11s', m: 'YOLO11m' }[k];
        if (r.fps != null) html += nombre + ': <b>' + r.fps + ' FPS</b> (' + r.ms + ' ms)<br>';
        else if (r.sinDescargar) html += nombre + ': sin descargar (actívalo antes para medirlo)<br>';
        else html += nombre + ': error<br>';
      });
      html += inf.recomendado
        ? '👉 <b>Recomendado en este móvil: YOLO11' + inf.recomendado + '</b> (≥4 FPS)'
        : '⚠ Ninguno llega a 4 FPS aquí: usa el motor Potente o Básico.';
      resSc.innerHTML = html;
    }).catch(function () { if (resSc) resSc.textContent = 'Error midiendo.'; })
      .then(function () { btnScBench.disabled = false; });
  });
  // Test de aceptación de detección: 5 fotogramas espaciados, personas contadas
  // por la máquina — el dueño las compara con su conteo a mano (números reales).
  const btnScTest = $('cfg-btnScTest');
  if (btnScTest) btnScTest.addEventListener('click', function () {
    if (!estado.video.listo) { cfg_avisar('Pon primero un vídeo (demo o cámara) con gente.', 'sospecha'); return; }
    if (typeof nuc_detectar !== 'function') return;
    btnScTest.disabled = true;
    if (resSc) resSc.textContent = 'Analizando 5 fotogramas (uno por segundo)…';
    const cuentas = [];
    const paso = function () {
      Promise.resolve(nuc_detectar(typeof vid_fuente === 'function' ? vid_fuente() : null)).then(function (dets) {
        cuentas.push((dets || []).filter(function (d) { return d.clase === 'person'; }).length);
        if (cuentas.length < 5) { setTimeout(paso, 1000); return; }
        if (resSc) resSc.innerHTML = '<b>Personas detectadas por fotograma:</b> ' + cuentas.join(' · ') +
          '<br>Cuenta tú a mano cuántas personas se VEN en el vídeo y compara: el objetivo del modo precisión es detectar al menos el 80%. Si sale menos, prueba el modelo M o baja la sensibilidad.';
        btnScTest.disabled = false;
      }).catch(function () { btnScTest.disabled = false; });
    };
    paso();
  });
  // Cambiar el modelo potente: recargarlo (el detalle/res se aplica en caliente).
  const selYoloModelo = $('cfg-yoloModelo');
  if (selYoloModelo) selYoloModelo.addEventListener('change', function () {
    if (estado.cfg.motor === 'yolo' && typeof yolo_init === 'function') {
      if (estado.yolo) estado.yolo.listo = false;   // fuerza recarga del nuevo modelo
      Promise.resolve(yolo_init()).catch(function (e) { console.warn('[ajustes] recarga yolo:', e && e.message); });
    }
  });

  // Modo preciso: recargar el modelo en caliente (ve más, algo más lento)
  const chkPreciso = $('cfg-modeloPreciso');
  if (chkPreciso) chkPreciso.addEventListener('change', function () {
    if (typeof nuc_cargarModelos !== 'function') return;
    cfg_avisar(chkPreciso.checked ? 'Cargando el modelo preciso…' : 'Volviendo al modelo ligero…', 'info');
    Promise.resolve(nuc_cargarModelos()).then(function (ok) {
      if (ok) cfg_avisar('Modelo ' + (chkPreciso.checked ? 'preciso' : 'ligero') + ' listo.', 'info');
    }).catch(function (e) { console.warn('[ajustes] recarga de modelo:', e && e.message); });
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

  // --- Dashcam / cámara RTSP vía go2rtc ---
  const btnDash = $('cfg-btnConectarDashcam');
  if (btnDash) btnDash.addEventListener('click', function () {
    const campo = $('cfg-urlDashcam');
    const url = campo ? campo.value.trim() : '';
    if (typeof vid_usarDashcam !== 'function') { cfg_avisar('El módulo de vídeo aún no está disponible.', 'sospecha'); return; }
    try { Promise.resolve(vid_usarDashcam(url)).catch(function (e) { console.warn('[ajustes] vid_usarDashcam:', e && e.message); }); }
    catch (e) { console.warn('[ajustes] vid_usarDashcam:', e && e.message); }
  });
  const btnProbarDash = $('cfg-btnProbarDashcam');
  if (btnProbarDash) btnProbarDash.addEventListener('click', function () {
    const campo = $('cfg-urlDashcam');
    const url = campo ? campo.value.trim() : '';
    const res = $('cfg-dashcamResultado');
    if (typeof vid_probarDashcam !== 'function') { if (res) res.textContent = 'El módulo de vídeo no está disponible.'; return; }
    if (res) res.textContent = 'Probando…';
    btnProbarDash.disabled = true;
    Promise.resolve(vid_probarDashcam(url)).then(function (r) {
      if (res) res.textContent = (r && r.msg) || (r && r.ok ? 'Conectado' : 'Sin conexión');
    }).catch(function () { if (res) res.textContent = 'No se pudo probar.'; })
      .then(function () { btnProbarDash.disabled = false; });
  });
  const btnGuiaDash = $('cfg-btnGuiaDashcam');
  if (btnGuiaDash) btnGuiaDash.addEventListener('click', cfg_guiaDashcam);

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

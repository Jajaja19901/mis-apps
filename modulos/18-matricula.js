/* ============================================================================
 * 18-MATRICULA — VIGÍA IA · lectura PUNTUAL de la matrícula del vehículo de
 * delante (modo copiloto). Prefijo: mat_. Estado interno en estado.mat.
 *
 * QUÉ ES: un botón «Leer matrícula» + lectura automática tras un golpe de la
 * caja negra. Recorta el coche de delante, amplía la zona de la placa, la
 * enseña a tamaño grande (para que el humano la lea SIEMPRE, falle o no el
 * OCR) e intenta reconocer el texto con Tesseract.js (se carga bajo demanda).
 *
 * QUÉ NO ES (y por qué): NO es un radar ni un escáner continuo. La matrícula
 * es un dato personal (RGPD/LOPDGDD): leerla de forma puntual como evidencia
 * de un incidente propio (parte, denuncia, fuga) es interés legítimo; hacer
 * base de datos de matrículas de terceros no lo es. Por eso la lectura es
 * manual o disparada por un golpe, nunca en bucle.
 *
 * Seguridad: todas las funciones aguantan sin vídeo, sin red y sin OCR
 * (guarda-clauses + try/catch). El OCR viene de CDN: la primera vez necesita
 * internet; desde file:// puede no estar disponible y se avisa con honestidad.
 * ==========================================================================*/

/* --- Constantes ------------------------------------------------------------*/
const MAT_CDN = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
const MAT_GUARDADAS_MAX = 20;          // últimas lecturas guardadas
const MAT_ALTO_OCR = 320;              // alto (px) al que se amplía el recorte
/* Matrícula española nueva (0000 BBB, sin vocales ni Ñ/Q) y formato viejo. */
const MAT_RE_NUEVA = /\d{4}\s?-?[BCDFGHJKLMNPRSTVWXYZ]{3}/;
const MAT_RE_VIEJA = /[A-Z]{1,2}\s?-?\d{4}\s?-?[A-Z]{1,2}/;

function mat_toast(msg, nivel) {
  if (typeof ui_toast === 'function') { try { ui_toast(msg, nivel || 'info'); return; } catch (e) {} }
  console.warn('[matricula] ' + msg);
}

/* ============================================================================
 * ARRANQUE (idempotente): botón, interruptor de auto-lectura y enganche al
 * evento de golpe de la caja negra.
 * ==========================================================================*/
function mat_init() {
  if (estado.mat && estado.mat.inited) return;
  estado.mat = { inited: true, cargando: null, worker: null, leyendo: false };

  const btn = document.getElementById('cop-btnMatricula');
  if (btn) btn.addEventListener('click', function () { mat_leer(true); });

  const chk = document.getElementById('cop-matAuto');
  if (chk) {
    chk.checked = !!estado.cfg.matAuto;
    chk.addEventListener('change', function () {
      estado.cfg.matAuto = !!chk.checked;
      nuc_guardar('cfg', estado.cfg);
    });
  }

  // Tras un golpe (conduciendo o aparcado), intenta leer la placa ella sola.
  if (typeof bus !== 'undefined' && bus.on) {
    bus.on('alerta', function (d) {
      const tipo = d && d.registro && d.registro.tipo;
      if (!estado.cfg.matAuto) return;
      if (tipo === 'impacto' || tipo === 'aparcado_golpe' || tipo === 'colision_frontal') {
        try { mat_leer(false); } catch (e) { /* nunca rompe el flujo de alertas */ }
      }
    });
  }
}

/* ============================================================================
 * RECORTES: localiza el vehículo de delante (track centrado más grande) y
 * prepara VARIOS recortes ampliados, del más ceñido a la placa al más ancho.
 * El OCR prueba todos y se queda con el primero que dé matrícula válida: el
 * ceñido tiene las letras más grandes (acierta más), el ancho no falla nunca
 * como imagen para el ojo humano. Sin track (coche pegado al morro), banda
 * central del frame.
 * ==========================================================================*/
function mat_vehiculoDelante() {
  const w = estado.video.w || 0;
  let mejor = null, mejorArea = 0;
  const tracks = estado.tracks || [];
  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i];
    if (!t || !t.caja) continue;
    if (t.clase !== 'car' && t.clase !== 'truck' && t.clase !== 'bus' && t.clase !== 'motorcycle') continue;
    const cx = t.caja.x + t.caja.an / 2;
    if (Math.abs(cx - w / 2) > w * 0.35) continue;   // solo el carril propio
    const area = t.caja.an * t.caja.al;
    if (area > mejorArea) { mejorArea = area; mejor = t; }
  }
  return mejor;
}

/* Amplía un rectángulo del frame a un canvas en gris con contraste estirado. */
function mat_recorteZona(rx, ry, rw, rh) {
  const fuente = (typeof vid_fuente === 'function') ? vid_fuente() : null;
  if (!fuente || !estado.video || !estado.video.listo) return null;
  const w = estado.video.w || 0, h = estado.video.h || 0;
  if (w <= 0 || h <= 0) return null;
  rx = Math.max(0, Math.min(w - 8, rx)); ry = Math.max(0, Math.min(h - 8, ry));
  rw = Math.max(8, Math.min(w - rx, rw)); rh = Math.max(8, Math.min(h - ry, rh));
  try {
    const escala = Math.max(1.5, Math.min(8, MAT_ALTO_OCR / rh));
    const cnv = document.createElement('canvas');
    cnv.width = Math.round(rw * escala); cnv.height = Math.round(rh * escala);
    const ctx = cnv.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(fuente, rx, ry, rw, rh, 0, 0, cnv.width, cnv.height);

    // Escala de grises + estirado de contraste: ayuda mucho al OCR nocturno.
    const img = ctx.getImageData(0, 0, cnv.width, cnv.height);
    const px = img.data;
    let min = 255, max = 0;
    for (let i = 0; i < px.length; i += 4) {
      const g = 0.3 * px[i] + 0.59 * px[i + 1] + 0.11 * px[i + 2];
      if (g < min) min = g; if (g > max) max = g;
      px[i] = px[i + 1] = px[i + 2] = g;
    }
    const rango = Math.max(1, max - min);
    for (let i = 0; i < px.length; i += 4) {
      const v = Math.max(0, Math.min(255, ((px[i] - min) / rango) * 255));
      px[i] = px[i + 1] = px[i + 2] = v;
    }
    ctx.putImageData(img, 0, 0);
    return cnv;
  } catch (e) {
    return null;   // canvas «tainted» (CORS) u otro fallo: sin recorte
  }
}

/* Lista de recortes a probar, del más ceñido al más ancho. */
function mat_recortes() {
  const w = estado.video.w || 0, h = estado.video.h || 0;
  if (!w || !h) return [];
  const mejor = mat_vehiculoDelante();
  const lista = [];
  if (mejor) {
    const c = mejor.caja;
    // 1) Ceñido a la zona típica de la placa (centro-abajo del vehículo)
    const ce = mat_recorteZona(c.x + c.an * 0.22, c.y + c.al * 0.60, c.an * 0.56, c.al * 0.32);
    if (ce) lista.push({ cnv: ce, conVehiculo: true, zona: 'placa' });
    // 2) Mitad inferior completa (por si la placa no está centrada)
    const an = mat_recorteZona(c.x + c.an * 0.10, c.y + c.al * 0.50, c.an * 0.80, c.al * 0.50);
    if (an) lista.push({ cnv: an, conVehiculo: true, zona: 'coche' });
  } else {
    // Sin track (coche pegado): banda central del frame
    const ba = mat_recorteZona(w * 0.25, h * 0.45, w * 0.50, h * 0.40);
    if (ba) lista.push({ cnv: ba, conVehiculo: false, zona: 'centro' });
  }
  return lista;
}

/* Compatibilidad: el recorte «bueno para el ojo humano» (el más ancho). */
function mat_recorte() {
  const lista = mat_recortes();
  return lista.length ? lista[lista.length - 1] : null;
}

/* Saca una matrícula del texto del OCR, tolerando confusiones típicas
 * (O↔0, I↔1, S↔5, B↔8, Z↔2…). Devuelve '' si no hay nada creíble. */
function mat_candidata(crudo) {
  const limpio = String(crudo || '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const n = limpio.match(MAT_RE_NUEVA);
  const v = limpio.match(MAT_RE_VIEJA);
  const directa = ((n && n[0]) || (v && v[0]) || '').replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
  if (directa) return directa;
  // Rescate: ventana de 7 caracteres corrigiendo confusiones del OCR
  const compacto = limpio.replace(/ /g, '');
  const aDigito = { O: '0', Q: '0', D: '0', I: '1', L: '1', S: '5', B: '8', Z: '2', G: '6', T: '7' };
  const aLetra = { 0: 'D', 8: 'B', 5: 'S', 2: 'Z', 6: 'G', 7: 'T', 1: 'L' };
  for (let i = 0; i + 7 <= compacto.length; i++) {
    let dig = '', let3 = '', vale = true;
    for (let k = 0; k < 4 && vale; k++) {
      const ch = compacto[i + k];
      if (ch >= '0' && ch <= '9') dig += ch;
      else if (aDigito[ch]) dig += aDigito[ch];
      else vale = false;
    }
    for (let k = 4; k < 7 && vale; k++) {
      let ch = compacto[i + k];
      if (ch >= '0' && ch <= '9') ch = aLetra[ch] || '';
      if (ch && 'BCDFGHJKLMNPRSTVWXYZ'.indexOf(ch) >= 0) let3 += ch;
      else vale = false;
    }
    if (vale) return dig + ' ' + let3;
  }
  return '';
}

/* Carga Tesseract.js bajo demanda (una sola vez). Devuelve el global o null. */
function mat_cargarOCR() {
  if (typeof Tesseract !== 'undefined') return Promise.resolve(Tesseract);
  const m = estado.mat;
  if (m.cargando) return m.cargando;
  m.cargando = new Promise(function (resolver) {
    try {
      const s = document.createElement('script');
      s.src = MAT_CDN;
      s.onload = function () { resolver(typeof Tesseract !== 'undefined' ? Tesseract : null); };
      s.onerror = function () { m.cargando = null; resolver(null); };
      document.head.appendChild(s);
      setTimeout(function () { resolver(typeof Tesseract !== 'undefined' ? Tesseract : null); }, 20000);
    } catch (e) { resolver(null); }
  });
  return m.cargando;
}

/* ============================================================================
 * LECTURA. manual=true → siempre enseña el resultado en un modal (con la
 * imagen ampliada, para que el humano la lea aunque el OCR falle).
 * manual=false (tras golpe) → sin modal: guarda y avisa solo si hay placa.
 * ==========================================================================*/
async function mat_leer(manual) {
  const m = estado.mat;
  if (!m || m.leyendo) return;
  if (!estado.video || !estado.video.listo) {
    if (manual) mat_toast('Activa primero la cámara o la dashcam para poder leer la matrícula.', 'info');
    return;
  }
  m.leyendo = true;
  const btn = document.getElementById('cop-btnMatricula');
  if (btn) { btn.disabled = true; btn.textContent = '📋 Leyendo…'; }
  try {
    const recortes = mat_recortes();
    if (!recortes.length) {
      if (manual) mat_toast('No se pudo capturar la imagen (¿la fuente de vídeo permite capturas?).', 'sospecha');
      return;
    }

    let matricula = '', crudo = '', sinOCR = false;
    let recBueno = recortes[recortes.length - 1];   // el ancho: para el ojo humano
    const T = await mat_cargarOCR();
    if (T) {
      try {
        if (!m.worker) {
          m.worker = await T.createWorker('eng');
          await m.worker.setParameters({
            tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ- ',
            tessedit_pageseg_mode: '6',   // bloque uniforme: mejor para placas
          });
        }
        // Prueba del recorte más ceñido al más ancho: primero que acierte, gana.
        for (let i = 0; i < recortes.length && !matricula; i++) {
          const r = await m.worker.recognize(recortes[i].cnv);
          const texto = String((r && r.data && r.data.text) || '').toUpperCase().replace(/\s+/g, ' ').trim();
          if (!crudo) crudo = texto;
          const cand = mat_candidata(texto);
          if (cand) { matricula = cand; recBueno = recortes[i]; crudo = texto; }
        }
      } catch (e) { crudo = ''; }
    } else {
      sinOCR = true;
    }

    if (matricula) mat_guardarLectura(matricula, !!manual);

    if (manual) {
      mat_mostrar(recBueno, matricula, crudo, sinOCR);
    } else if (matricula) {
      mat_toast('📋 Matrícula leída tras el golpe: ' + matricula + ' (guardada en la bitácora).', 'info');
    }
  } catch (e) {
    if (manual) mat_toast('No se pudo leer la matrícula: ' + (e && e.message), 'sospecha');
  } finally {
    m.leyendo = false;
    if (btn) { btn.disabled = false; btn.textContent = '📋 Leer matrícula'; }
  }
}

/* Guarda la lectura: en el trayecto en curso (bitácora) y en el histórico. */
function mat_guardarLectura(matricula, manual) {
  try {
    if (typeof cop_anotarEvento === 'function') {
      cop_anotarEvento('matricula', 'Matrícula leída' + (manual ? '' : ' tras el golpe') + ': ' + matricula);
    }
    let lista = nuc_cargar('mat_lecturas', []);
    if (!Array.isArray(lista)) lista = [];
    lista.push({ ts: Date.now(), matricula: matricula });
    while (lista.length > MAT_GUARDADAS_MAX) lista.shift();
    nuc_guardar('mat_lecturas', lista);
  } catch (e) { /* si no cabe, seguimos */ }
}

/* Modal con la imagen ampliada + el texto leído + copiar. Todo con DOM API
 * (nada de HTML con datos del OCR: el texto va por textContent). */
function mat_mostrar(rec, matricula, crudo, sinOCR) {
  if (typeof ui_modal !== 'function') {
    mat_toast(matricula ? ('Matrícula: ' + matricula) : 'No se reconoció ninguna matrícula.', 'info');
    return;
  }
  const cuerpo = document.createElement('div');

  const img = document.createElement('img');
  try { img.src = rec.cnv.toDataURL('image/jpeg', 0.9); } catch (e) {}
  img.alt = 'Zona de la matrícula ampliada';
  img.style.cssText = 'width:100%;border-radius:8px;border:1px solid #233140;';
  cuerpo.appendChild(img);

  const res = document.createElement('p');
  res.style.cssText = 'font-size:1.4rem;font-weight:700;text-align:center;margin:10px 0 4px;letter-spacing:2px;';
  res.textContent = matricula || '— sin lectura clara —';
  cuerpo.appendChild(res);

  const detalle = document.createElement('p');
  detalle.className = 'etiqueta';
  detalle.style.cssText = 'text-align:center;margin:0 0 8px;';
  const esArchivo = (typeof location !== 'undefined' && location.protocol === 'file:');
  detalle.textContent = sinOCR
    ? (esArchivo
      ? 'El lector OCR no funciona abriendo la app como archivo suelto: súbela a tu web (los 5 archivos) y sí leerá. Mientras, lee la placa en la imagen de arriba.'
      : 'El lector OCR no está disponible (necesita internet la primera vez). Lee la placa en la imagen de arriba.')
    : (matricula
      ? (rec.conVehiculo ? 'Leída del vehículo de delante.' : 'Leída de la zona central de la imagen.')
      : (crudo ? ('El OCR vio: «' + crudo.slice(0, 40) + '». Lee la placa en la imagen.') : 'Acércate (que la placa ocupe buena parte de la imagen), evita contraluz y vuelve a probar.'));
  cuerpo.appendChild(detalle);

  const legal = document.createElement('p');
  legal.className = 'etiqueta';
  legal.style.cssText = 'font-size:.78rem;opacity:.8;margin:0;';
  legal.textContent = 'La matrícula es un dato personal: úsala solo como evidencia de TU incidente (parte, denuncia). No para vigilar a terceros.';
  cuerpo.appendChild(legal);

  const botones = [];
  if (matricula) {
    botones.push({
      texto: '📄 Copiar', clase: 'btn-primario',
      fn: function () {
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(matricula).catch(function () {});
            mat_toast('Matrícula copiada: ' + matricula, 'info');
          } else { mat_toast('No se pudo copiar automáticamente. Apúntala: ' + matricula, 'info'); }
        } catch (e) { /* portapapeles bloqueado: ya está en pantalla */ }
        return true;
      },
    });
  }
  botones.push({ texto: 'Cerrar', clase: 'btn-fantasma' });
  ui_modal('📋 Matrícula del vehículo de delante', cuerpo, botones);
}

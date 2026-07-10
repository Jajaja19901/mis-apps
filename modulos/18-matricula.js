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
const MAT_GUARDADAS_MAX = 60;          // últimas lecturas guardadas (tope duro)
/* FOTO ≠ LECTURA: un coche de frente se ve ~1 segundo. Hacer la FOTO de su
 * placa cuesta milésimas (se hace al instante, cada 600 ms); LEERLA cuesta
 * ~1 s de OCR (se hace después, en cola, sin ahogar al detector). Así aunque
 * el coche ya no esté, sus fotos siguen en memoria y la matrícula sale igual. */
const MAT_FOTO_MS = 600;               // cada cuánto se fotografía el vehículo visible
const MAT_COLA_MAX = 12;               // fotos pendientes de leer (se cae la más vieja)
const MAT_OCR_HUECO_MS = 250;          // respiro entre lecturas de la cola (no ahogar la CPU)
const MAT_FOTO_CADUCA_MS = 45000;      // una foto sin leer en 45 s ya no aporta (fuera)
const MAT_DEDUPE_MS = 60000;           // no repetir la MISMA matrícula en 1 min
const MAT_PURGA_MS = 30000;            // cada cuánto se revisa el borrado automático
const MAT_AREA_MIN_CONTINUO = 0.02;    // el vehículo debe ocupar ≥2% (si no, placa ilegible)
const MAT_ALTO_OCR = 320;              // alto (px) al que se amplía el recorte
/* Matrícula española nueva (0000 BBB, sin vocales ni Ñ/Q) y formato viejo. */
const MAT_RE_NUEVA = /\d{4}\s?-?[BCDFGHJKLMNPRSTVWXYZ]{3}/;
const MAT_RE_VIEJA = /[A-Z]{1,2}\s?-?\d{4}\s?-?[A-Z]{1,2}/;

function mat_toast(msg, nivel) {
  if (typeof ui_toast === 'function') { try { ui_toast(msg, nivel || 'info'); return; } catch (e) {} }
  console.warn('[matricula] ' + msg);
}

/* VOTACIÓN: el OCR falla en lecturas sueltas (lee «D 9915 JU» en vez de
 * «9915 JMN»). Si se lee la MISMA matrícula muchas veces, la correcta gana por
 * mayoría. Guarda cada lectura en una ventana de 40 s y devuelve la más votada
 * y cuántas veces. Así, leyendo en continuo, converge a la matrícula real. */
const MAT_VOTOS_MS = 40000;
const MAT_VOTOS_CONFIRMAR = 2;   // en continuo: BUENA con ≥2 lecturas IGUALES (que un error
                                 // de OCR se repita idéntico en 7 caracteres es rarísimo;
                                 // con 3 tardaba la vida en confirmar)
function mat_votar(m) {
  const M = estado.mat;
  const ahora = Date.now();
  if (!M.votos) M.votos = [];
  M.votos.push({ m: m, ts: ahora });
  M.votos = M.votos.filter(function (v) { return ahora - v.ts < MAT_VOTOS_MS; });
  const cuenta = {};
  let mejor = m, mejorN = 0;
  for (let i = 0; i < M.votos.length; i++) {
    const k = M.votos[i].m;
    cuenta[k] = (cuenta[k] || 0) + 1;
    if (cuenta[k] > mejorN) { mejorN = cuenta[k]; mejor = k; }
  }
  return { plate: mejor, votos: mejorN, total: M.votos.length };
}

/* Pinta la última matrícula leída ENCIMA del vídeo (abajo-centro), unos
 * segundos, para que se vea al instante sin buscar botones ni listas. */
const MAT_MOSTRAR_MS = 6000;
function mat_pintar(ctx) {
  if (!ctx || !estado.mat) return;
  if (!estado.video || !estado.video.listo) return;
  const w = estado.video.w || 0, h = estado.video.h || 0;
  if (w <= 0 || h <= 0) return;
  const u = estado.mat.ultima;
  const hayReciente = u && u.matricula && Date.now() - u.ts <= MAT_MOSTRAR_MS;
  // Sin lectura reciente: si está leyendo sola, avisa con un chip discreto para
  // que se VEA que la app está buscando la matrícula (no está parada).
  if (!hayReciente) { mat_pintarBuscando(ctx, w, h); return; }
  try {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Confirmada (≥3 lecturas iguales) → verde con ✓. Mientras comprueba → ámbar.
    const conf = !!u.buena;
    const txt = (conf ? '✅ ' : '📋 ') + u.matricula + (u.votos > 1 ? '  ×' + u.votos : '') +
                (conf ? '' : ' …');
    ctx.font = "bold " + Math.round(h * 0.045) + "px 'SFMono-Regular',ui-monospace,Consolas,monospace";
    const anchoTxt = ctx.measureText(txt).width;
    const pad = h * 0.02;
    const bw = anchoTxt + pad * 2, bh = h * 0.075;
    const bx = w / 2 - bw / 2, by = h - bh - h * 0.03;
    ctx.fillStyle = 'rgba(10,14,20,.82)';
    ctx.beginPath();
    const r = bh * 0.28;
    ctx.moveTo(bx + r, by);
    ctx.arcTo(bx + bw, by, bx + bw, by + bh, r);
    ctx.arcTo(bx + bw, by + bh, bx, by + bh, r);
    ctx.arcTo(bx, by + bh, bx, by, r);
    ctx.arcTo(bx, by, bx + bw, by, r);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = conf ? '#2ee584' : '#facc15'; ctx.lineWidth = Math.max(2, h * 0.004); ctx.stroke();
    ctx.fillStyle = conf ? '#8affc4' : '#fde68a';
    ctx.fillText(txt, w / 2, by + bh / 2 + 1);
    ctx.restore();
  } catch (e) { /* un fallo de pintado no rompe el compuesto */ }
}

/* Chip discreto «leyendo matrícula…» cuando la lectura automática está en marcha
 * y aún no hay una matrícula. Da señal de vida: el usuario ve que la app SÍ está
 * buscando sola (sin tener que pulsar nada). */
function mat_pintarBuscando(ctx, w, h) {
  if (!estado.mat || !estado.mat.buscando) return;
  if (!estado.cfg.copActivo || !estado.cfg.matContinuo) return;
  try {
    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const txt = '🔎 Leyendo matrícula…';
    ctx.font = "600 " + Math.round(h * 0.028) + "px system-ui,-apple-system,'Segoe UI',sans-serif";
    const anchoTxt = ctx.measureText(txt).width;
    const pad = h * 0.014;
    const bw = anchoTxt + pad * 2, bh = h * 0.05;
    const bx = w * 0.02, by = h - bh - h * 0.02;
    ctx.fillStyle = 'rgba(10,14,20,.7)';
    ctx.beginPath();
    const r = bh * 0.3;
    ctx.moveTo(bx + r, by);
    ctx.arcTo(bx + bw, by, bx + bw, by + bh, r);
    ctx.arcTo(bx + bw, by + bh, bx, by + bh, r);
    ctx.arcTo(bx, by + bh, bx, by, r);
    ctx.arcTo(bx, by, bx + bw, by, r);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fde68a';
    ctx.fillText(txt, bx + pad, by + bh / 2 + 1);
    ctx.restore();
  } catch (e) { /* nunca rompe el compuesto */ }
}

/* ============================================================================
 * ARRANQUE (idempotente): botón, interruptor de auto-lectura y enganche al
 * evento de golpe de la caja negra.
 * ==========================================================================*/
function mat_init() {
  if (estado.mat && estado.mat.inited) return;
  estado.mat = { inited: true, cargando: null, worker: null, leyendo: false,
                 ultFoto: 0, ultOcr: 0, ultPurga: 0, ultima: null, votos: [], cola: [] };

  // Muestra la última matrícula leída ENCIMA del vídeo (orden 66, sobre tracks).
  if (typeof vid_registrarPintor === 'function') {
    try { vid_registrarPintor('matricula', mat_pintar, 66); } catch (e) {}
  }

  const btn = document.getElementById('cop-btnMatricula');
  if (btn) btn.addEventListener('click', function () { mat_leer(true); });

  // Botón FLOTANTE sobre el vídeo (visible en modo copiloto): lo más fácil de ver.
  const flo = document.getElementById('mat-flotante');
  if (flo) flo.addEventListener('click', function () { mat_leer(true); });
  // Mostrar/ocultar el flotante según esté el copiloto activo (throttle en 'frame').
  if (typeof bus !== 'undefined' && bus.on) {
    bus.on('frame', function () {
      const f = document.getElementById('mat-flotante');
      if (f) f.classList.toggle('oculto', !estado.cfg.copActivo);
    });
  }

  const chk = document.getElementById('cop-matAuto');
  if (chk) {
    chk.checked = !!estado.cfg.matAuto;
    chk.addEventListener('change', function () {
      estado.cfg.matAuto = !!chk.checked;
      nuc_guardar('cfg', estado.cfg);
    });
  }

  // Lectura CONTINUA (del vehículo de delante) — interruptor.
  const chkC = document.getElementById('cop-matContinuo');
  if (chkC) {
    chkC.checked = !!estado.cfg.matContinuo;
    chkC.addEventListener('change', function () {
      estado.cfg.matContinuo = !!chkC.checked;
      nuc_guardar('cfg', estado.cfg);
      mat_toast(estado.cfg.matContinuo
        ? 'Lectura continua de matrículas activada. Se borran solas a los ' + (estado.cfg.matRetencionMin || 15) + ' min.'
        : 'Lectura continua desactivada.', 'info');
    });
  }
  // Minutos de retención (borrado automático).
  const inpR = document.getElementById('cop-matRetencion');
  if (inpR) {
    inpR.value = String(estado.cfg.matRetencionMin || 15);
    inpR.addEventListener('change', function () {
      const v = nuc_clamp(parseInt(inpR.value, 10) || 15, 1, 240);
      estado.cfg.matRetencionMin = v; inpR.value = String(v);
      nuc_guardar('cfg', estado.cfg);
    });
  }
  // Botón "ver matrículas guardadas".
  const btnL = document.getElementById('cop-btnMatriculas');
  if (btnL) btnL.addEventListener('click', mat_mostrarLista);

  // Purga al arrancar (borra las que ya caducaron desde la última vez).
  mat_purgar();

  // Bucle por frame: purga periódica + lectura continua (ambas con throttle).
  if (typeof bus !== 'undefined' && bus.on) {
    bus.on('frame', mat_alFrame);
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

/* Por frame: borra las matrículas caducadas (cada 30 s) y, si la lectura
 * continua está activa y hay un vehículo cerca, lee su placa (cada 6 s). */
function mat_alFrame() {
  const m = estado.mat; if (!m) return;
  const ahora = Date.now();
  if (ahora - (m.ultPurga || 0) >= MAT_PURGA_MS) { m.ultPurga = ahora; mat_purgar(); }

  // La lectura automática solo tiene sentido conduciendo: exige el copiloto
  // activo (así no gasta CPU ni lee nada cuando la app vigila un local, etc.).
  m.buscando = false;
  if (!estado.cfg.copActivo || !estado.cfg.matContinuo) return;
  if (!m.cola) m.cola = [];

  // 1) FOTOS al instante (baratas, milésimas): cada 600 ms si hay vehículo a
  //    tiro. Un coche de frente visible 1 s deja 2-4 fotos en la cola. Se
  //    fotografía TAMBIÉN con el OCR ocupado: justo entonces es cuando un
  //    coche fugaz se perdería.
  if (ahora - (m.ultFoto || 0) >= MAT_FOTO_MS) {
    const veh = mat_vehiculoDelante();
    if (veh && veh.caja) {
      const areaFrame = (estado.video.w || 1) * (estado.video.h || 1);
      if (veh.caja.an * veh.caja.al >= areaFrame * MAT_AREA_MIN_CONTINUO) {
        m.ultFoto = ahora;
        try { mat_fotografiar(veh, ahora); } catch (e) { /* nunca rompe el frame */ }
      }
    }
  }

  // 2) LECTURA en segundo plano: procesa la cola foto a foto, con respiro.
  if (m.cola.length || m.leyendo) m.buscando = true;
  try { mat_procesarCola(); } catch (e) { /* ídem */ }
}

/* Fotografía la zona de la placa del vehículo (trasera + delantera) y la mete
 * en la cola de lectura. Capturar es instantáneo: solo recorta y amplía. */
function mat_fotografiar(veh, ahora) {
  const m = estado.mat;
  const c = veh.caja;
  // UNA foto que cubre la placa trasera Y la delantera (mitad baja ancha del
  // vehículo): el buscador de banda (mat_bandaPlaca) localiza la placa dentro,
  // así que no hacen falta dos fotos por disparo — el OCR trabaja la mitad.
  const cnv = mat_recorteZona(c.x + c.an * 0.15, c.y + c.al * 0.40, c.an * 0.70, c.al * 0.55);
  if (cnv) m.cola.push({ cnv: cnv, ts: ahora, zona: 'vehiculo' });
  while (m.cola.length > MAT_COLA_MAX) m.cola.shift();   // se cae la más vieja
}

/* Lee UNA foto de la cola por llamada (la más reciente primero: el coche más
 * cercano y nítido). El OCR va a su ritmo, con hueco entre lecturas, para no
 * pelearse con el detector: cada uno come de su plato. */
async function mat_procesarCola() {
  const m = estado.mat;
  if (!m || m.leyendo || !m.cola || !m.cola.length) return;
  const ahora = Date.now();
  // Respiro ADAPTATIVO: si el detector va justo (inferencia lenta), el lector
  // cede el paso y espera más entre fotos. Las fotos no caducan (45 s de
  // margen), así que no se pierde nada: solo se lee más despacio.
  const hueco = Math.max(MAT_OCR_HUECO_MS, (estado.video.msInferencia || 0) * 1.5);
  if (ahora - (m.ultOcr || 0) < hueco) return;
  m.leyendo = true;
  try {
    // Fuera fotos caducadas (coche que pasó hace mucho: ya hay o no hay placa).
    m.cola = m.cola.filter(function (f) { return ahora - f.ts < MAT_FOTO_CADUCA_MS; });
    const foto = m.cola.pop();
    if (!foto) return;
    const T = await mat_cargarOCR();
    if (!T) { m.cola.length = 0; return; }              // sin OCR no hay cola que valga
    if (!m.worker) {
      m.worker = await T.createWorker('eng');
      await m.worker.setParameters({
        tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ- ',
        tessedit_pageseg_mode: '6',
      });
    }
    const texto = await mat_ocrSobre(foto.cnv);
    const cand = mat_candidata(texto);
    if (cand) {
      const v = mat_votar(cand);
      const buena = v.votos >= MAT_VOTOS_CONFIRMAR;     // "la que pillas es la buena"
      estado.mat.ultima = { matricula: v.plate, votos: v.votos, buena: buena, ts: Date.now() };
      if (buena && mat_guardarLectura(v.plate, false)) {
        mat_toast('✅ Matrícula CONFIRMADA (leída ×' + v.votos + '): ' + v.plate + ' — se borra sola en ' +
          nuc_clamp(estado.cfg.matRetencionMin || 15, 1, 240) + ' min.', 'info');
      }
    }
  } catch (e) { /* una foto fallida no rompe la cola */ }
  finally { m.ultOcr = Date.now(); m.leyendo = false; }
}

/* OCR sobre un recorte: primero busca la BANDA de la placa (imagen pequeña y
 * de una sola línea → modo PSM 7, el más certero para placas); si no hay
 * banda clara, recorte completo en modo bloque (PSM 6). */
async function mat_ocrSobre(cnv) {
  const m = estado.mat;
  const banda = mat_bandaPlaca(cnv);
  try { await m.worker.setParameters({ tessedit_pageseg_mode: banda ? '7' : '6' }); } catch (e) {}
  const r = await m.worker.recognize(banda || cnv);
  return String((r && r.data && r.data.text) || '').toUpperCase().replace(/\s+/g, ' ').trim();
}

/* Borra del histórico las matrículas más viejas que la retención configurada. */
function mat_purgar() {
  try {
    const retMs = nuc_clamp(estado.cfg.matRetencionMin || 15, 1, 240) * 60000;
    const ahora = Date.now();
    let lista = nuc_cargar('mat_lecturas', []);
    if (!Array.isArray(lista)) return;
    const limpia = lista.filter(function (r) { return r && r.ts && (ahora - r.ts) < retMs; });
    if (limpia.length !== lista.length) nuc_guardar('mat_lecturas', limpia);
  } catch (e) { /* si falla, no pasa nada */ }
}

/* Muestra la lista de matrículas leídas recientemente (con su hora). */
function mat_mostrarLista() {
  mat_purgar();
  let lista = nuc_cargar('mat_lecturas', []);
  if (!Array.isArray(lista)) lista = [];
  const ret = nuc_clamp(estado.cfg.matRetencionMin || 15, 1, 240);
  const cont = document.createElement('div');
  if (!lista.length) {
    const p = document.createElement('p');
    p.textContent = 'Aún no hay matrículas guardadas. Se guardan al leer una (manual, continua o tras un golpe) y se borran solas a los ' + ret + ' min.';
    cont.appendChild(p);
  } else {
    const intro = document.createElement('p');
    intro.className = 'etiqueta';
    intro.textContent = lista.length + ' matrícula(s) · se borran solas ' + ret + ' min después de leerlas.';
    cont.appendChild(intro);
    const ul = document.createElement('ul');
    ul.style.cssText = 'list-style:none;padding:0;margin:8px 0;';
    for (let i = lista.length - 1; i >= 0; i--) {
      const r = lista[i];
      const li = document.createElement('li');
      li.style.cssText = 'display:flex;justify-content:space-between;gap:12px;padding:6px 0;border-bottom:1px solid #233140;';
      const b = document.createElement('b'); b.style.letterSpacing = '1px'; b.textContent = r.matricula || '—';
      const t = document.createElement('span'); t.className = 'etiqueta';
      t.textContent = (typeof nuc_fechaHora === 'function') ? nuc_fechaHora(r.ts) : '';
      li.appendChild(b); li.appendChild(t); ul.appendChild(li);
    }
    cont.appendChild(ul);
  }
  const legal = document.createElement('p');
  legal.className = 'etiqueta';
  legal.style.cssText = 'font-size:.78rem;opacity:.8;';
  legal.textContent = 'Las matrículas son datos personales: guardado breve (se borran solas) y solo como evidencia de un incidente propio.';
  cont.appendChild(legal);
  const botones = [];
  if (lista.length) {
    botones.push({ texto: '🗑 Borrar todas ya', clase: 'btn-peligro', fn: function () {
      nuc_guardar('mat_lecturas', []); mat_toast('Matrículas borradas.', 'info'); return true;
    } });
  }
  botones.push({ texto: 'Cerrar', clase: 'btn-fantasma' });
  if (typeof ui_modal === 'function') ui_modal('📋 Matrículas guardadas', cont, botones);
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
    if (Math.abs(cx - w / 2) > w * 0.45) continue;   // amplio: carril propio + coche de frente / parado al que apuntas
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
    // 1) Ceñido a la zona típica de la placa TRASERA (centro-abajo del vehículo)
    const ce = mat_recorteZona(c.x + c.an * 0.22, c.y + c.al * 0.60, c.an * 0.56, c.al * 0.32);
    if (ce) lista.push({ cnv: ce, conVehiculo: true, zona: 'placa' });
    // 2) Placa DELANTERA del coche que viene de frente: suele quedar más CENTRADA
    //    (en el paragolpes, hacia la mitad-baja), no abajo del todo. Banda central.
    const fr = mat_recorteZona(c.x + c.an * 0.18, c.y + c.al * 0.42, c.an * 0.64, c.al * 0.34);
    if (fr) lista.push({ cnv: fr, conVehiculo: true, zona: 'frontal' });
    // 3) Mitad inferior completa (por si la placa no está centrada)
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

/* ============================================================================
 * BUSCADOR DE PLACA: dentro del recorte (gris, contraste estirado), localiza
 * la BANDA HORIZONTAL donde está la matrícula. Una placa son caracteres
 * oscuros sobre fondo claro → sus filas tienen MUCHOS cambios claro↔oscuro
 * seguidos (≥10 transiciones: 7 caracteres × 2 bordes). El parachoques, el
 * asfalto o la carrocería no. Recortar SOLO esa banda y dársela al OCR en vez
 * del coche entero dispara el acierto y baja el tiempo (imagen mucho menor).
 * Si no encuentra banda clara devuelve null y se usa el recorte completo.
 * ==========================================================================*/
function mat_bandaPlaca(cnv) {
  try {
    if (!cnv || cnv.width < 24 || cnv.height < 16) return null;
    const w = cnv.width, h = cnv.height;
    const ctx = cnv.getContext('2d', { willReadFrequently: true });
    const px = ctx.getImageData(0, 0, w, h).data;   // ya viene en gris (r=g=b)
    // Transiciones claro↔oscuro por fila (umbral 140 sobre contraste estirado).
    const trans = new Array(h);
    for (let y = 0; y < h; y++) {
      let c = 0, prev = px[y * w * 4] > 140;
      for (let x = 1; x < w; x++) {
        const v = px[(y * w + x) * 4] > 140;
        if (v !== prev) { c++; prev = v; }
      }
      trans[y] = c;
    }
    let max = 0;
    for (let y = 0; y < h; y++) if (trans[y] > max) max = trans[y];
    if (max < 10) return null;                       // no hay nada tipo texto
    const lim = Math.max(9, max * 0.45);
    // La banda contigua más ALTA de filas con muchas transiciones.
    let mejorIni = 0, mejorFin = 0, ini = 0, dentro = false;
    for (let y = 0; y <= h; y++) {
      const ok = y < h && trans[y] >= lim;
      if (ok && !dentro) { dentro = true; ini = y; }
      if (!ok && dentro) { dentro = false; if (y - ini > mejorFin - mejorIni) { mejorIni = ini; mejorFin = y; } }
    }
    const alto = mejorFin - mejorIni;
    if (alto < 6 || alto > h * 0.8) return null;     // ruido o «todo es banda»
    const margen = alto * 0.4;
    const y0 = Math.max(0, Math.floor(mejorIni - margen));
    const y1 = Math.min(h, Math.ceil(mejorFin + margen));
    // Banda a ~120 px de alto: tamaño ideal para el OCR (nítido y pequeño).
    const esc = Math.max(0.5, Math.min(4, 120 / (y1 - y0)));
    const out = document.createElement('canvas');
    out.width = Math.max(24, Math.round(w * esc));
    out.height = Math.max(16, Math.round((y1 - y0) * esc));
    const octx = out.getContext('2d');
    octx.imageSmoothingEnabled = true; octx.imageSmoothingQuality = 'high';
    octx.drawImage(cnv, 0, y0, w, y1 - y0, 0, 0, out.width, out.height);
    return out;
  } catch (e) { return null; }
}

/* Saca la matrícula del texto del OCR. Matrícula española nueva = 4 NÚMEROS +
 * 3 LETRAS (consonantes). Nos ANCLAMOS en los 4 números reales e ignoramos todo
 * lo que haya a su izquierda (la banda azul europea con la «E», que el OCR suele
 * leer como D/E/etc — no es parte de la matrícula). Las 3 letras siguientes se
 * corrigen de confusiones típicas (0→D, 8→B, 5→S…). Si no salen 4 números + 3
 * letras limpias, devuelve '' (mejor no dar nada que dar algo mal: con la
 * lectura en continuo y la votación, la correcta acaba saliendo). */
function mat_candidata(crudo) {
  const s = String(crudo || '').toUpperCase().replace(/[^A-Z0-9]/g, '');   // fuera espacios y la banda
  const aLetra = { '0': 'D', '8': 'B', '5': 'S', '2': 'Z', '6': 'G', '7': 'T', '1': 'L', '4': 'A' };
  const esConsonante = function (c) { return c && 'BCDFGHJKLMNPRSTVWXYZ'.indexOf(c) >= 0; };
  for (let i = 0; i + 7 <= s.length; i++) {
    // 4 NÚMEROS reales seguidos (los dígitos el OCR los lee bien; la banda no cuenta)
    const dig = s.slice(i, i + 4);
    if (!/^[0-9]{4}$/.test(dig)) continue;
    // 3 LETRAS a la derecha (consonantes; corrige dígito→letra si se coló)
    let let3 = '', vale = true;
    for (let k = 4; k < 7 && vale; k++) {
      let ch = s[i + k];
      if (ch >= '0' && ch <= '9') ch = aLetra[ch] || '';
      if (esConsonante(ch)) let3 += ch; else vale = false;
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
 * LECTURA PUNTUAL (botón «Leer ahora» o tras un golpe). La lectura CONTINUA
 * va por la cola de fotos (mat_fotografiar + mat_procesarCola), no por aquí.
 * manual=true → siempre enseña el resultado en un modal (con la imagen
 * ampliada, para que el humano la lea aunque el OCR falle).
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
  if (btn && manual) { btn.disabled = true; btn.textContent = '📋 Leyendo…'; }
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
        // (mat_ocrSobre localiza la banda de la placa dentro de cada recorte.)
        for (let i = 0; i < recortes.length && !matricula; i++) {
          const texto = await mat_ocrSobre(recortes[i].cnv);
          if (!crudo) crudo = texto;
          const cand = mat_candidata(texto);
          if (cand) { matricula = cand; recBueno = recortes[i]; crudo = texto; }
        }
      } catch (e) { crudo = ''; }
    } else {
      sinOCR = true;
    }

    let confirmada = matricula, votos = 0;
    if (matricula) {
      // Votación: la matrícula leída IGUAL varias veces gana (corrige el OCR).
      // Manual/golpe son acciones intencionales → se aceptan a la primera.
      const v = mat_votar(matricula);
      confirmada = v.plate; votos = v.votos;
      estado.mat.ultima = { matricula: confirmada, votos: votos, buena: true, ts: Date.now() };
      mat_guardarLectura(confirmada, !!manual);
    }

    if (manual) {
      mat_mostrar(recBueno, confirmada, crudo, sinOCR);
    } else if (confirmada) {
      mat_toast('📋 Matrícula leída tras el golpe: ' + confirmada + ' (guardada).', 'info');
    }
  } catch (e) {
    if (manual) mat_toast('No se pudo leer la matrícula: ' + (e && e.message), 'sospecha');
  } finally {
    m.leyendo = false;
    if (btn && manual) { btn.disabled = false; btn.textContent = '📋 Leer ahora'; }
  }
}

/* Guarda la lectura en el histórico con borrado por tiempo y sin repetir la
 * misma matrícula en 1 min. Devuelve true si es una matrícula NUEVA. */
function mat_guardarLectura(matricula, manual) {
  try {
    const retMs = nuc_clamp(estado.cfg.matRetencionMin || 15, 1, 240) * 60000;
    const ahora = Date.now();
    let lista = nuc_cargar('mat_lecturas', []);
    if (!Array.isArray(lista)) lista = [];
    // 1) borra las caducadas
    lista = lista.filter(function (r) { return r && r.ts && (ahora - r.ts) < retMs; });
    // 2) ¿la misma matrícula leída hace muy poco? no la dupliques
    const reciente = lista.some(function (r) { return r.matricula === matricula && (ahora - r.ts) < MAT_DEDUPE_MS; });
    if (reciente) { nuc_guardar('mat_lecturas', lista); return false; }
    // 3) nueva
    if (typeof cop_anotarEvento === 'function') {
      cop_anotarEvento('matricula', 'Matrícula' + (manual ? '' : ' auto') + ': ' + matricula);
    }
    lista.push({ ts: ahora, matricula: matricula });
    while (lista.length > MAT_GUARDADAS_MAX) lista.shift();
    nuc_guardar('mat_lecturas', lista);
    return true;
  } catch (e) { return false; }
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

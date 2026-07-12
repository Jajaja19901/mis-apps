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
const MAT_FOTO_MS = 500;               // cada cuánto se barren los vehículos visibles
const MAT_COLA_MAX = 16;               // fotos pendientes de leer (se cae la más vieja)
const MAT_OCR_HUECO_MS = 250;          // respiro entre lecturas de la cola (no ahogar la CPU)
const MAT_FOTO_CADUCA_MS = 45000;      // una foto sin leer en 45 s ya no aporta (fuera)
const MAT_DEDUPE_MS = 60000;           // no repetir la MISMA matrícula en 1 min
const MAT_PURGA_MS = 30000;            // cada cuánto se revisa el borrado automático
const MAT_AREA_MIN_CONTINUO = 0.03;    // el vehículo debe ocupar ≥3% del frame: por debajo la placa mide <60 px y es ILEGIBLE físicamente — fotografiarlo solo genera fotos basura sin matrícula
const MAT_ALTO_OCR = 480;              // alto (px) al que se amplía el recorte (era 320: muy pequeño)
/* GALERÍA DE FOTOS: la app fotografía SOLA a TODOS los vehículos que ve
 * (capturar cuesta milésimas). La foto queda guardada aunque el OCR falle:
 * la matrícula siempre se puede leer a ojo en la galería. El OCR trabaja en
 * segundo plano, sin prisa, y va anotando la placa en cada foto que lee. */
const MAT_FOTOS_MAX = 40;              // tope de fotos guardadas (las viejas se caen)
const MAT_FOTO_TRACK_MS = 900;         // re-intento por coche cada 0,9 s MIENTRAS no esté leída (un coche cruzando se ve ~1-2 s: con 2 s solo había 1 intento). Al confirmar, trackListo lo para en seco
const MAT_FOTO_ANCHO_JPG = 480;        // ancho máx del JPEG guardado (peso contenido)
const MAT_FOTOS_GUARDAR_MS = 3000;     // persistir la galería como mucho cada 3 s

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
    // Confirmada (≥2 lecturas iguales) → verde con ✓. Mientras comprueba → ámbar.
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
                 ultFoto: 0, ultOcr: 0, ultPurga: 0, ultima: null, votos: [], cola: [],
                 trackFotos: {}, trackListo: {}, fotos: null, fotosSucias: false, ultGuardaFotos: 0 };

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

  // 1) FOTOS al instante (baratas, milésimas): cada 500 ms se barren TODOS los
  //    vehículos visibles y se fotografía a cada uno (máx. 1 foto/2 s por coche).
  //    Se fotografía TAMBIÉN con el OCR ocupado: justo entonces es cuando un
  //    coche fugaz se perdería. La foto SIEMPRE queda en la galería.
  if (ahora - (m.ultFoto || 0) >= MAT_FOTO_MS) {
    m.ultFoto = ahora;
    try { mat_capturarTodas(ahora); } catch (e) { /* nunca rompe el frame */ }
  }

  // 2) LECTURA en segundo plano: procesa la cola foto a foto, con respiro.
  if (m.cola.length || m.leyendo) m.buscando = true;
  try { mat_procesarCola(); } catch (e) { /* ídem */ }

  // 3) Persistencia de la galería (throttle: como mucho cada 3 s).
  if (m.fotosSucias && ahora - (m.ultGuardaFotos || 0) >= MAT_FOTOS_GUARDAR_MS) {
    mat_fotosGuardar(ahora);
  }
}

/* Barre TODOS los vehículos en pantalla y fotografía a cada uno que ocupe
 * tamaño suficiente y no haya sido fotografiado hace <2 s. Así ningún coche
 * pasa sin foto: delante, en el otro carril, aparcado… todos. */
function mat_capturarTodas(ahora) {
  const m = estado.mat;
  const w = estado.video.w || 0, h = estado.video.h || 0;
  if (!w || !h) return;
  const areaFrame = w * h;
  const tracks = estado.tracks || [];
  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i];
    if (!t || !t.caja) continue;
    if (t.clase !== 'car' && t.clase !== 'truck' && t.clase !== 'bus' && t.clase !== 'motorcycle') continue;
    if (t.caja.an * t.caja.al < areaFrame * MAT_AREA_MIN_CONTINUO) continue;   // muy lejos: placa ilegible
    // ✅ COCHE YA LEÍDO: su matrícula está CONFIRMADA → ni una foto más de este
    // track mientras siga a la vista (se refresca la marca para que no caduque).
    // Esto corta las "200 fotos del coche de delante": las justas hasta leerla.
    if (m.trackListo[t.id]) { m.trackListo[t.id] = ahora; continue; }
    const ya = m.trackFotos[t.id] || 0;
    if (ahora - ya < MAT_FOTO_TRACK_MS) continue;                              // ya tiene foto reciente
    m.trackFotos[t.id] = ahora;
    try { mat_fotografiar(t, ahora); } catch (e) { /* un coche fallido no para el barrido */ }
  }
  // Limpieza de mapas de throttle (tracks que ya no existen).
  for (const id in m.trackFotos) {
    if (ahora - m.trackFotos[id] > 30000) delete m.trackFotos[id];
  }
  for (const id in m.trackListo) {
    if (ahora - m.trackListo[id] > 60000) delete m.trackListo[id];
  }
}

/* Fotografía la zona de la placa del vehículo (trasera + delantera), GUARDA la
 * foto en la galería (queda aunque el OCR falle) y la mete en la cola de
 * lectura. Capturar es instantáneo: solo recorta y amplía. */
function mat_fotografiar(veh, ahora) {
  const m = estado.mat;
  const c = veh.caja;
  // Zona amplia que cubre TANTO placa trasera (abajo) como delantera (centro-bajo):
  // coche de frente → placa en parachoques (45-75% desde arriba)
  // coche de perfil → placa trasera (60-85% desde arriba)
  // Solución: capturar toda la mitad baja (35-100% altura) para no perder nada.
  // El buscador de banda (mat_bandaPlaca) localiza la placa real dentro.
  const cnv = mat_recorteZona(c.x + c.an * 0.10, c.y + c.al * 0.35, c.an * 0.80, c.al * 0.70);
  if (!cnv) return;
  // NO se guarda la foto todavía: primero el OCR intenta leer la placa. Solo si
  // lee una matrícula PLAUSIBLE se guarda (así no se guardan ruedas ni laterales
  // de coches de perfil sin placa). Se conserva la clase para la galería.
  m.cola.push({ cnv: cnv, ts: ahora, zona: 'vehiculo', fotoId: null, clase: (veh && veh.clase) || 'car', trackId: veh.id });
  while (m.cola.length > MAT_COLA_MAX) m.cola.shift();   // se cae la más vieja
}

/* ============================================================================
 * GALERÍA DE FOTOS (mat_fotos en localStorage): cada vehículo visto deja su
 * foto de la zona de la placa. El OCR de fondo va anotando la matrícula en la
 * foto cuando la lee; si no la lee, la foto sigue ahí para leerla a ojo.
 * RGPD: mismo borrado automático por tiempo que las matrículas.
 * ==========================================================================*/
function mat_fotosLista() {
  const m = estado.mat;
  if (!m.fotos) {
    const l = nuc_cargar('mat_fotos', []);
    m.fotos = Array.isArray(l) ? l : [];
  }
  return m.fotos;
}

/* Guarda el recorte como JPEG pequeño en la galería. Devuelve el id. */
function mat_fotoGuardar(cnv, ahora, veh) {
  try {
    const m = estado.mat;
    // Reducir a ≤480 px de ancho: peso ~15-30 KB por foto (40 fotos ≈ 1 MB).
    let esc = Math.min(1, MAT_FOTO_ANCHO_JPG / (cnv.width || 1));
    const mini = document.createElement('canvas');
    mini.width = Math.max(24, Math.round(cnv.width * esc));
    mini.height = Math.max(16, Math.round(cnv.height * esc));
    mini.getContext('2d').drawImage(cnv, 0, 0, mini.width, mini.height);
    const jpg = mini.toDataURL('image/jpeg', 0.6);
    const id = (typeof nuc_uid === 'function') ? nuc_uid('f') : ('f' + ahora + Math.floor(Math.random() * 1e6));
    const lista = mat_fotosLista();
    lista.push({ id: id, ts: ahora, img: jpg, matricula: '', buena: false,
                 clase: (veh && veh.clase) || 'car' });
    while (lista.length > MAT_FOTOS_MAX) lista.shift();
    m.fotosSucias = true;
    return id;
  } catch (e) { return null; }
}

/* Anota la matrícula leída por el OCR en su foto de la galería. */
function mat_fotoAnotar(fotoId, matricula, buena) {
  if (!fotoId || !matricula) return;
  try {
    const lista = mat_fotosLista();
    for (let i = lista.length - 1; i >= 0; i--) {
      if (lista[i].id === fotoId) {
        lista[i].matricula = matricula;
        lista[i].buena = !!buena || lista[i].buena;
        estado.mat.fotosSucias = true;
        return;
      }
    }
  } catch (e) { /* sin drama */ }
}

/* Persiste la galería (throttled). Si localStorage se queda sin sitio, tira
 * las fotos más viejas y reintenta: las nuevas siempre caben. */
function mat_fotosGuardar(ahora) {
  const m = estado.mat;
  m.ultGuardaFotos = ahora || Date.now();
  m.fotosSucias = false;
  let lista = mat_fotosLista();
  for (let intento = 0; intento < 4; intento++) {
    try { localStorage.setItem('vigia_mat_fotos', JSON.stringify(lista)); return; }
    catch (e) {
      if (lista.length <= 4) break;                      // no hay más que tirar
      lista.splice(0, Math.ceil(lista.length / 3));      // fuera el tercio más viejo
      m.fotos = lista;
    }
  }
}

/* Borra de la galería las fotos más viejas que la retención configurada. */
function mat_fotosPurgar() {
  try {
    const retMs = nuc_clamp(estado.cfg.matRetencionMin || 15, 1, 240) * 60000;
    const ahora = Date.now();
    const lista = mat_fotosLista();
    const limpia = lista.filter(function (f) { return f && f.ts && (ahora - f.ts) < retMs; });
    if (limpia.length !== lista.length) {
      estado.mat.fotos = limpia;
      estado.mat.fotosSucias = true;
    }
  } catch (e) { /* si falla, no pasa nada */ }
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
  // PERO: si el OCR no está listo aún, acelera la cola (no esperes a que Tesseract
  // se inicialice): las fotos siguen llegando y se leen todas cuando esté listo.
  const hueco = m.worker ? Math.max(MAT_OCR_HUECO_MS, (estado.video.msInferencia || 0) * 1.5) : 100;
  if (ahora - (m.ultOcr || 0) < hueco) return;
  m.leyendo = true;
  try {
    // Fuera fotos caducadas (coche que pasó hace mucho: ya hay o no hay placa).
    m.cola = m.cola.filter(function (f) { return ahora - f.ts < MAT_FOTO_CADUCA_MS; });
    const foto = m.cola.pop();
    if (!foto) return;

    // 📸 LA FOTO SE GUARDA SIEMPRE (una por coche), LEA O NO LEA el lector.
    // Antes el guardado dependía del OCR y si el lector no cargaba/no leía en
    // este móvil, la galería se quedaba a CERO. Ahora: foto garantizada con la
    // banda de la placa ampliada debajo; si el OCR luego lee, la anota encima.
    if (!m.fotoDeTrack) m.fotoDeTrack = {};
    let fotoId = (foto.trackId != null) ? (m.fotoDeTrack[foto.trackId] || null) : null;
    if (!fotoId) {
      let imgCnv = foto.cnv;
      try {
        const banda = mat_bandaPlaca(foto.cnv);
        if (banda && banda.width > 0 && banda.height > 0) {
          const comp = document.createElement('canvas');
          const bw = foto.cnv.width;
          const bandaH = Math.max(40, Math.round(banda.height * (bw / banda.width)));
          comp.width = bw; comp.height = foto.cnv.height + bandaH;
          const cctx = comp.getContext('2d');
          cctx.drawImage(foto.cnv, 0, 0);
          cctx.imageSmoothingEnabled = true; cctx.imageSmoothingQuality = 'high';
          cctx.drawImage(banda, 0, foto.cnv.height, bw, bandaH);
          imgCnv = comp;
        }
      } catch (e) {}
      fotoId = mat_fotoGuardar(imgCnv, foto.ts, { clase: foto.clase || 'car' });
      if (foto.trackId != null && fotoId) m.fotoDeTrack[foto.trackId] = fotoId;
      if (Object.keys(m.fotoDeTrack).length > 200) m.fotoDeTrack = {};   // no crecer sin fin
    }

    const T = await mat_cargarOCR();
    if (!T) {
      // Sin lector: las fotos YA están guardadas. Se avisa UNA vez, claro.
      if (!m.ocrFalloAvisado) {
        m.ocrFalloAvisado = true;
        mat_toast('⚠ El LECTOR de matrículas no pudo cargar (¿sin internet la primera vez?). Las fotos se guardan igual: lee la placa en la imagen de la galería.', 'sospecha');
      }
      m.cola.length = 0; return;
    }
    if (!m.worker) {
      m.worker = await T.createWorker('eng');
      await m.worker.setParameters({
        tessedit_char_whitelist: '0123456789BCDFGHJKLMNPRSTVWXYZ- ',
        tessedit_do_invert: '0',
        tessedit_pageseg_mode: '8',
        tessedit_write_output_file: '0',
        tessedit_create_pdf: '0',
        tessedit_create_hocr: '0',
      });
    }
    const texto = await mat_ocrSobre(foto.cnv);
    const cand = mat_candidata(texto);
    if (cand) {
      const v = mat_votar(cand);
      const buena = v.votos >= MAT_VOTOS_CONFIRMAR;     // "la que pillas es la buena"
      estado.mat.ultima = { matricula: v.plate, votos: v.votos, buena: buena, ts: Date.now() };
      // ✅ Confirmada → este coche queda LISTO: se deja de fotografiar y se vacían
      // de la cola sus fotos pendientes (ya no aportan nada, solo gastan OCR).
      if (buena && foto.trackId != null) {
        m.trackListo[foto.trackId] = Date.now();
        m.cola = m.cola.filter(function (f) { return f.trackId !== foto.trackId; });
      }
      // La foto ya está guardada arriba (garantizada): aquí solo se ANOTA la
      // matrícula leída sobre ella (✅ si está confirmada con 2 lecturas).
      mat_fotoAnotar(fotoId, v.plate, buena);
      if (buena && mat_guardarLectura(v.plate, false)) {
        mat_toast('✅ Matrícula CONFIRMADA (leída ×' + v.votos + '): ' + v.plate + ' — se borra sola en ' +
          nuc_clamp(estado.cfg.matRetencionMin || 15, 1, 240) + ' min.', 'info');
      }
    }
  } catch (e) { /* una foto fallida no rompe la cola */ }
  finally { m.ultOcr = Date.now(); m.leyendo = false; }
}

/* OCR robusto: intenta varias estrategias hasta conseguir una matrícula válida.
 * Banda (PSM 8) → recorte completo (PSM 11) → raw line (PSM 13). */
async function mat_ocrSobre(cnv) {
  const m = estado.mat;
  const banda = mat_bandaPlaca(cnv);

  // ESTRATEGIA 1: banda de placa detectada, PSM 8 (single line, el más preciso)
  if (banda) {
    try {
      await m.worker.setParameters({ tessedit_pageseg_mode: '8' });
      const r = await m.worker.recognize(banda);
      const texto = String((r && r.data && r.data.text) || '').toUpperCase().replace(/\s+/g, ' ').trim();
      if (mat_candidata(texto)) return texto;
    } catch (e) { /* fallback */ }
  }

  // ESTRATEGIA 2: recorte completo, PSM 11 (sparse text para cuando falla la banda)
  try {
    await m.worker.setParameters({ tessedit_pageseg_mode: '11' });
    const r = await m.worker.recognize(cnv);
    const texto = String((r && r.data && r.data.text) || '').toUpperCase().replace(/\s+/g, ' ').trim();
    if (mat_candidata(texto)) return texto;
  } catch (e) { /* fallback */ }

  // ESTRATEGIA 3: PSM 13 (raw line, a veces funciona en fotos de noche)
  try {
    await m.worker.setParameters({ tessedit_pageseg_mode: '13' });
    const r = await m.worker.recognize(cnv);
    const texto = String((r && r.data && r.data.text) || '').toUpperCase().replace(/\s+/g, ' ').trim();
    if (mat_candidata(texto)) return texto;
  } catch (e) { /* fallback */ }

  // FALLBACK: si nada funcionó, devolver lo que sea (mejor algo que nada)
  try {
    await m.worker.setParameters({ tessedit_pageseg_mode: '11' });
    const r = await m.worker.recognize(cnv);
    return String((r && r.data && r.data.text) || '').toUpperCase().replace(/\s+/g, ' ').trim();
  } catch (e) { return ''; }
}

/* Borra del histórico las matrículas más viejas que la retención configurada. */
function mat_purgar() {
  try {
    const retMs = nuc_clamp(estado.cfg.matRetencionMin || 15, 1, 240) * 60000;
    const ahora = Date.now();
    let lista = nuc_cargar('mat_lecturas', []);
    if (Array.isArray(lista)) {
      const limpia = lista.filter(function (r) { return r && r.ts && (ahora - r.ts) < retMs; });
      if (limpia.length !== lista.length) nuc_guardar('mat_lecturas', limpia);
    }
    mat_fotosPurgar();   // la galería de fotos sigue la misma retención (RGPD)
  } catch (e) { /* si falla, no pasa nada */ }
}

/* Muestra la GALERÍA: cada vehículo visto con su FOTO de la placa y, si el OCR
 * la leyó, la matrícula anotada (✅ confirmada / 📋 provisional). La foto está
 * SIEMPRE aunque el OCR fallara: se lee a ojo. Debajo, las matrículas sueltas. */
function mat_mostrarLista() {
  mat_purgar();
  const fotos = mat_fotosLista().slice();
  let lecturas = nuc_cargar('mat_lecturas', []);
  if (!Array.isArray(lecturas)) lecturas = [];
  const ret = nuc_clamp(estado.cfg.matRetencionMin || 15, 1, 240);
  const cont = document.createElement('div');

  if (!fotos.length && !lecturas.length) {
    const p = document.createElement('p');
    p.textContent = 'Aún no hay fotos ni matrículas. Con el copiloto activo, la app fotografía SOLA a cada vehículo que ve y lee su placa en segundo plano. Todo se borra solo a los ' + ret + ' min.';
    cont.appendChild(p);
  }

  if (fotos.length) {
    const intro = document.createElement('p');
    intro.className = 'etiqueta';
    intro.textContent = '📸 ' + fotos.length + ' foto(s) automáticas · se borran solas a los ' + ret + ' min.';
    cont.appendChild(intro);
    for (let i = fotos.length - 1; i >= 0; i--) {
      const f = fotos[i];
      const caja = document.createElement('div');
      caja.style.cssText = 'margin:0 0 12px;padding:8px;border:1px solid #233140;border-radius:10px;background:rgba(255,255,255,.02);';
      const img = document.createElement('img');
      img.src = f.img; img.alt = 'Foto de la matrícula';
      img.loading = 'lazy';
      img.style.cssText = 'width:100%;border-radius:6px;display:block;';
      caja.appendChild(img);
      const fila = document.createElement('div');
      fila.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:6px;';
      const b = document.createElement('b');
      b.style.cssText = 'letter-spacing:2px;font-size:1.05rem;';
      b.textContent = f.matricula ? ((f.buena ? '✅ ' : '📋 ') + f.matricula) : '👁 léela en la foto';
      if (!f.matricula) b.style.opacity = '.6';
      const t = document.createElement('span'); t.className = 'etiqueta';
      t.textContent = (typeof nuc_fechaHora === 'function') ? nuc_fechaHora(f.ts) : '';
      fila.appendChild(b); fila.appendChild(t);
      caja.appendChild(fila);
      cont.appendChild(caja);
    }
  }

  if (lecturas.length) {
    const intro2 = document.createElement('p');
    intro2.className = 'etiqueta';
    intro2.textContent = '📋 Matrículas confirmadas por el lector:';
    cont.appendChild(intro2);
    const ul = document.createElement('ul');
    ul.style.cssText = 'list-style:none;padding:0;margin:8px 0;';
    for (let i = lecturas.length - 1; i >= 0; i--) {
      const r = lecturas[i];
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
  legal.textContent = 'Las matrículas y sus fotos son datos personales: guardado breve (se borran solas) y solo como evidencia de un incidente propio.';
  cont.appendChild(legal);
  const botones = [];
  if (fotos.length || lecturas.length) {
    botones.push({ texto: '🗑 Borrar todo ya', clase: 'btn-peligro', fn: function () {
      nuc_guardar('mat_lecturas', []);
      estado.mat.fotos = [];
      mat_fotosGuardar(Date.now());
      mat_toast('Fotos y matrículas borradas.', 'info'); return true;
    } });
  }
  botones.push({ texto: 'Cerrar', clase: 'btn-fantasma' });
  if (typeof ui_modal === 'function') ui_modal('📸 Fotos y matrículas', cont, botones);
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
    // NO inflar: un coche cercano ya trae la placa a buen tamaño; ampliarlo
    // ×1.5 creaba lienzos de ~1 Mpx que se recorren píxel a píxel en el hilo
    // principal cada 600 ms (el tirón rítmico del copiloto). Se reduce si es
    // gigante, se amplía solo si es pequeño, y el ancho va capado.
    let escala = Math.max(0.4, Math.min(8, MAT_ALTO_OCR / rh));
    if (rw * escala > 960) escala = 960 / rw;
    const cnv = document.createElement('canvas');
    cnv.width = Math.max(24, Math.round(rw * escala));
    cnv.height = Math.max(16, Math.round(rh * escala));
    const ctx = cnv.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(fuente, rx, ry, rw, rh, 0, 0, cnv.width, cnv.height);

    // Escala de grises + estirado de contraste por PERCENTILES 2-98%: el
    // min/max absoluto lo anulaba un solo píxel especular de un faro (min≈0,
    // max≈255 → estirado nulo). Con percentiles, los reflejos no mandan.
    const img = ctx.getImageData(0, 0, cnv.width, cnv.height);
    const px = img.data;
    const hist = new Uint32Array(256);
    for (let i = 0; i < px.length; i += 4) {
      const g = (0.3 * px[i] + 0.59 * px[i + 1] + 0.11 * px[i + 2]) | 0;
      px[i] = g;                                   // guarda el gris en R
      hist[g]++;
    }
    const total = px.length / 4;
    let acum = 0, p2 = 0, p98 = 255;
    for (let v = 0; v < 256; v++) { acum += hist[v]; if (acum >= total * 0.02) { p2 = v; break; } }
    acum = 0;
    for (let v = 255; v >= 0; v--) { acum += hist[v]; if (acum >= total * 0.02) { p98 = v; break; } }
    const rango = Math.max(1, p98 - p2);
    for (let i = 0; i < px.length; i += 4) {
      const v = Math.max(0, Math.min(255, ((px[i] - p2) / rango) * 255));
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
/* Umbral de Otsu sobre un histograma de 256 niveles: separa "claro" y
 * "oscuro" DONDE DE VERDAD se separan en ESTA imagen. Un umbral fijo (140)
 * fallaba de noche: caracteres y fondo caían al mismo lado → cero
 * transiciones → banda nunca encontrada. PURA (testeable). */
function mat_otsu(hist, total) {
  let suma = 0;
  for (let i = 0; i < 256; i++) suma += i * hist[i];
  let sumaB = 0, pesoB = 0, mejorVar = 0, umbral = 127;
  for (let i = 0; i < 256; i++) {
    pesoB += hist[i];
    if (!pesoB) continue;
    const pesoF = total - pesoB;
    if (!pesoF) break;
    sumaB += i * hist[i];
    const mB = sumaB / pesoB, mF = (suma - sumaB) / pesoF;
    const v = pesoB * pesoF * (mB - mF) * (mB - mF);
    if (v > mejorVar) { mejorVar = v; umbral = i; }
  }
  return umbral;
}

function mat_bandaPlaca(cnv) {
  try {
    if (!cnv || cnv.width < 24 || cnv.height < 16) return null;
    const w = cnv.width, h = cnv.height;
    const ctx = cnv.getContext('2d', { willReadFrequently: true });
    const px = ctx.getImageData(0, 0, w, h).data;   // ya viene en gris (r=g=b)
    // Umbral de Otsu de ESTA imagen + banda muerta ±10 (histéresis): el ruido
    // que baila alrededor del umbral no cuenta como transición.
    const hist = new Uint32Array(256);
    for (let i = 0; i < px.length; i += 4) hist[px[i]]++;
    const umbral = mat_otsu(hist, px.length / 4);
    const subida = Math.min(255, umbral + 10), bajada = Math.max(0, umbral - 10);
    // Transiciones por fila Y sus posiciones x (para acotar la placa también
    // en horizontal: antes solo se cogía la franja entera y una RUEDA con
    // radios ganaba por contraste — el error de "foto de la rueda").
    const transFila = new Array(h);
    const transX = new Array(h);
    for (let y = 0; y < h; y++) {
      const xs = [];
      let claro = px[y * w * 4] > umbral;
      for (let x = 1; x < w; x++) {
        const v = px[(y * w + x) * 4];
        if (claro && v < bajada) { claro = false; xs.push(x); }
        else if (!claro && v > subida) { claro = true; xs.push(x); }
      }
      transFila[y] = Math.min(xs.length, 60);
      transX[y] = xs;
    }
    let max = 0;
    for (let y = 0; y < h; y++) if (transFila[y] > max) max = transFila[y];
    if (max < 4) return null;
    const lim = Math.max(3, max * 0.25);
    // TODAS las franjas candidatas (no solo la más alta): cada una se valida
    // como "¿parece una MATRÍCULA?" y gana la de mejor puntuación.
    const franjas = [];
    let ini = 0, dentro = false;
    for (let y = 0; y <= h; y++) {
      const ok = y < h && transFila[y] >= lim;
      if (ok && !dentro) { dentro = true; ini = y; }
      if (!ok && dentro) { dentro = false; franjas.push([ini, y]); }
    }
    let mejor = null, mejorPunt = 0;
    for (let f = 0; f < franjas.length; f++) {
      const y0 = franjas[f][0], y1 = franjas[f][1], alto = y1 - y0;
      if (alto < 5 || alto > h * 0.5) continue;      // ni ruido ni media foto (una rueda es ALTA)
      // Acotar en X: ventana mínima que concentra el 85% de las transiciones.
      const hx = new Float64Array(w + 1);
      let total = 0;
      for (let y = y0; y < y1; y++) { const xs = transX[y]; for (let k = 0; k < xs.length; k++) { hx[xs[k] + 1]++; total++; } }
      if (total < 8) continue;
      for (let x = 0; x < w; x++) hx[x + 1] += hx[x];   // prefijos
      const objetivo = total * 0.85;
      let bx = 0, bw2 = w;
      let a = 0;
      for (let b = 1; b <= w; b++) {
        while (hx[b] - hx[a + 1] >= objetivo && a < b - 2) a++;
        if (hx[b] - hx[a] >= objetivo && (b - a) < bw2) { bw2 = b - a; bx = a; }
      }
      if (bw2 < 16 || bw2 >= w) continue;
      // ── VALIDACIÓN "es una placa" ──────────────────────────────────────
      // 1) Proporción APAISADA (placa española ≈ 4.7:1; margen 1.8–9).
      const ratio = bw2 / alto;
      if (ratio < 1.8 || ratio > 9) continue;        // una rueda es ~1:1 → fuera
      // 2) FONDO CLARO: la placa es blanca/reflectante; una rueda es oscura.
      let suma = 0, n = 0;
      const pasoY = Math.max(1, Math.floor(alto / 8)), pasoX = Math.max(1, Math.floor(bw2 / 24));
      for (let y = y0; y < y1; y += pasoY) for (let x = bx; x < bx + bw2; x += pasoX) { suma += px[(y * w + x) * 4]; n++; }
      const brillo = n ? suma / n : 0;
      if (brillo < umbral) continue;                 // más oscura que la media → no es placa
      // 3) Puntuación: densidad de texto × centrado (la placa suele ir centrada).
      const centro = 1 - Math.abs((bx + bw2 / 2) - w / 2) / (w / 2) * 0.5;
      const punt = total * centro * (brillo / 255);
      if (punt > mejorPunt) { mejorPunt = punt; mejor = { x: bx, y: y0, an: bw2, al: alto }; }
    }
    if (!mejor) return null;                         // sin nada con pinta de placa: NO se engaña con ruedas
    // Recorte con margen y reescalado a ~120 px de alto (tamaño ideal de OCR).
    const mgY = mejor.al * 0.6, mgX = mejor.an * 0.08;
    const ry0 = Math.max(0, Math.floor(mejor.y - mgY)), ry1 = Math.min(h, Math.ceil(mejor.y + mejor.al + mgY));
    const rx0 = Math.max(0, Math.floor(mejor.x - mgX)), rx1 = Math.min(w, Math.ceil(mejor.x + mejor.an + mgX));
    const esc = Math.max(0.5, Math.min(4, 120 / (ry1 - ry0)));
    const out = document.createElement('canvas');
    out.width = Math.max(24, Math.round((rx1 - rx0) * esc));
    out.height = Math.max(16, Math.round((ry1 - ry0) * esc));
    const octx = out.getContext('2d');
    octx.imageSmoothingEnabled = true; octx.imageSmoothingQuality = 'high';
    octx.drawImage(cnv, rx0, ry0, rx1 - rx0, ry1 - ry0, 0, 0, out.width, out.height);
    return out;
  } catch (e) { return null; }
}

/* Saca la matrícula del texto del OCR. Matrícula española nueva = 4 NÚMEROS +
 * 3 LETRAS (consonantes). Primero intenta encontrar la forma PERFECTA (4+3).
 * Si falla, es más permiso: acepta 3+2 como fallback (mejor algo razonable que
 * nada cuando Tesseract falla un carácter). Con lectura en continuo, la votación
 * converge a la correcta de todas formas. */
function mat_candidata(crudo) {
  const s = String(crudo || '').toUpperCase()
    .replace(/[OQ]/g, '0').replace(/I/g, '1')
    .replace(/[^A-Z0-9]/g, '');
  const aLetra = { '0': 'D', '8': 'B', '5': 'S', '2': 'Z', '6': 'G', '7': 'T', '1': 'L', '4': 'A', '3': 'E', '9': 'g' };
  const esConsonante = function (c) { return c && 'BCDFGHJKLMNPRSTVWXYZ'.indexOf(c) >= 0; };

  // INTENTO 1: 4 DÍGITOS + 3 CONSONANTES perfectas
  for (let i = 0; i + 7 <= s.length; i++) {
    const dig = s.slice(i, i + 4);
    if (!/^[0-9]{4}$/.test(dig)) continue;
    let let3 = '', vale = true;
    for (let k = 4; k < 7 && vale; k++) {
      let ch = s[i + k];
      if (ch >= '0' && ch <= '9') ch = aLetra[ch] || '';
      if (esConsonante(ch)) let3 += ch; else vale = false;
    }
    if (vale && let3.length === 3) return dig + ' ' + let3;
  }

  // INTENTO 2 (fallback): 3+ DÍGITOS + 2+ CONSONANTES (más tolerante)
  for (let i = 0; i < s.length; i++) {
    let dig = '', letras = '';
    let j = i;
    while (j < s.length && s[j] >= '0' && s[j] <= '9') { dig += s[j]; j++; }
    if (dig.length < 3) continue;  // al menos 3 dígitos
    while (j < s.length && j - i - dig.length < 3) {  // hasta 3 caracteres siguientes
      let ch = s[j];
      if (ch >= '0' && ch <= '9') ch = aLetra[ch] || '';
      if (esConsonante(ch)) letras += ch;
      j++;
    }
    if (dig.length >= 3 && letras.length >= 2) {
      // Rellenar con 0 si faltan dígitos, padear letras si faltan
      dig = (dig + '0000').slice(0, 4);
      letras = (letras + 'XXX').slice(0, 3);
      return dig + ' ' + letras;
    }
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

/* PRE-INICIA Tesseract.js y su worker ANTES de que lleguen fotos de la cola.
 * Sin esto, la primera foto espera 2-3 s a que Tesseract se descargue e
 * inicialice el worker: un retraso inaceptable en conducción. Con esto,
 * cuando llega la primera foto el OCR está LISTO. */
async function mat_iniciarOCR() {
  if (!estado.mat) return;
  if (estado.mat.worker) return;                        // ya está listo
  try {
    const T = await mat_cargarOCR();
    if (!T || !T.createWorker) return;                  // sin Tesseract no hay nada que hacer
    const m = estado.mat;
    m.worker = await T.createWorker('eng');
    await m.worker.setParameters({
      tessedit_char_whitelist: '0123456789BCDFGHJKLMNPRSTVWXYZ- ',
      tessedit_do_invert: '0',
      tessedit_pageseg_mode: '8',
      tessedit_write_output_file: '0',
      tessedit_create_pdf: '0',
      tessedit_create_hocr: '0',
    });
  } catch (e) { /* sin OCR, la lectura se hace a mano o no se hace */ }
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
            tessedit_char_whitelist: '0123456789BCDFGHJKLMNPRSTVWXYZ- ',
            tessedit_do_invert: '0',
            tessedit_pageseg_mode: '8',
            tessedit_write_output_file: '0',
            tessedit_create_pdf: '0',
            tessedit_create_hocr: '0',
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

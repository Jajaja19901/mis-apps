/* ============================================================================
 * 04-VÍDEO — VIGÍA IA · capa de vídeo: fuentes, canvas compuesto, grabación de
 * evidencia con buffer previo y anti-sabotaje. Prefijo público: vid_ / VID_.
 *
 * Filosofía de este módulo:
 *  - #vid-canvas es el COMPUESTO ÍNTEGRO: fuente única para detección, capturas
 *    y grabación. NUNCA se difumina — la evidencia siempre va limpia.
 *  - #vid-canvasPriv es una CAPA de presentación: copia del compuesto con las
 *    cabezas pixeladas (solo cuando cfg.privacidad). Se muestra encima en vivo.
 *  - Toda función es segura sin fuente y sin modelos: guarda-clausulas y avisos,
 *    jamás excepciones (el verificador pulsa todos los botones sin cámara).
 * ==========================================================================*/

/* --- Constantes -----------------------------------------------------------*/
const VID_ANCHO_TOPE = 1920;          // tope de ancho del espacio de frame (1080p real)
const VID_BUFFER_TROZOS = 10;         // trozos de ~1s conservados como pre-evidencia
const VID_EVENTO_MS = 20000;          // se sigue grabando 20s tras el disparo
const VID_EVENTO_MAX_TROZOS = 90;     // tope duro del buffer durante un evento (~90s)

/* --- Referencias al DOM (cacheadas en vid_init) ---------------------------*/
const vid_el = {
  visor: null, video: null, mjpeg: null, canvas: null, canvasPriv: null,
  rec: null, estado: null, expandir: null,
};

/* --- Arranque -------------------------------------------------------------*/
function vid_init() {
  if (estado.vid && estado.vid.inicializado) return;

  vid_el.visor      = document.getElementById('vid-visor');
  vid_el.video      = document.getElementById('vid-video');
  vid_el.mjpeg      = document.getElementById('vid-mjpeg');
  vid_el.canvas     = document.getElementById('vid-canvas');
  vid_el.canvasPriv = document.getElementById('vid-canvasPriv');
  vid_el.rec        = document.getElementById('vid-rec');
  vid_el.estado     = document.getElementById('vid-estado');
  vid_el.expandir   = document.getElementById('vid-expandir');
  vid_el.plegar     = document.getElementById('vid-plegar');

  // ▼ Reducir / ▲ Agrandar: pliega la cámara a un tamaño compacto para dejar
  //   sitio al menú de abajo. Recuerda la preferencia del dueño.
  if (vid_el.plegar) {
    const compactoGuardado = nuc_cargar('vid_compacto', false);
    if (compactoGuardado && vid_el.visor) vid_el.visor.classList.add('vid-compacto');
    vid_el.plegar.textContent = compactoGuardado ? '▲ Agrandar' : '▼ Reducir';
    vid_el.plegar.addEventListener('click', function () {
      if (!vid_el.visor) return;
      const compacto = vid_el.visor.classList.toggle('vid-compacto');
      vid_el.plegar.textContent = compacto ? '▲ Agrandar' : '▼ Reducir';
      vid_el.plegar.setAttribute('aria-label', compacto ? 'Agrandar la cámara' : 'Reducir la cámara para ver el menú');
      nuc_guardar('vid_compacto', compacto);
    });
  }

  // 📷 Encender cámara con un toque desde el propio visor (sin ir a Ajustes).
  const btnCam = document.getElementById('vid-btnCamara');
  if (btnCam) {
    btnCam.addEventListener('click', function () {
      btnCam.disabled = true; btnCam.textContent = '📷 Encendiendo…';
      Promise.resolve(vid_encenderFuente()).finally(function () {
        setTimeout(function () { btnCam.disabled = false; btnCam.textContent = '📷 Encender cámara'; }, 1500);
      });
    });
  }

  // 🎬 Probar con un vídeo de la galería (p. ej. un robo real de internet):
  //    un toque abre el selector y el vídeo elegido entra como fuente de la IA.
  const btnDemo = document.getElementById('vid-btnDemo');
  const inputDemo = document.getElementById('vid-inputDemo');
  if (btnDemo && inputDemo) {
    btnDemo.addEventListener('click', function () { try { inputDemo.click(); } catch (e) {} });
    inputDemo.addEventListener('change', function () {
      const f = inputDemo.files && inputDemo.files[0];
      if (!f) return;
      btnDemo.disabled = true; btnDemo.textContent = '🎬 Cargando…';
      Promise.resolve(vid_usarArchivo(f)).finally(function () {
        setTimeout(function () { btnDemo.disabled = false; btnDemo.textContent = '🎬 Probar con un vídeo'; }, 1200);
        inputDemo.value = '';   // permite re-elegir el mismo archivo
      });
    });
  }

  // ⛶ Pantalla completa: el vídeo va capado a 68vh para que el scroll funcione;
  // este botón lo pone a tamaño completo (y vuelta) sin perder nitidez.
  if (vid_el.expandir) {
    vid_el.expandir.addEventListener('click', vid_alternarPantallaCompleta);
    document.addEventListener('fullscreenchange', function () {
      const dentro = document.fullscreenElement === vid_el.visor;
      vid_el.expandir.textContent = dentro ? '🗗' : '⛶';
      vid_el.expandir.setAttribute('aria-label', dentro ? 'Salir de pantalla completa' : 'Ver el vídeo a pantalla completa');
    });
  }

  /* Estado interno del módulo (único sitio mutable, contrato §0.2) */
  estado.vid = {
    inicializado: true,
    tipoFuente: null,          // 'camara' | 'ip' | 'archivo'
    fuenteEl: null,            // elemento de entrada para la IA (video o img)
    stream: null,              // MediaStream de la cámara
    objectURL: null,           // URL de objeto del vídeo demo
    escalando: false,          // ¿la fuente supera VID_ANCHO_TOPE?
    natW: 0, natH: 0,          // tamaño nativo de la fuente
    pintores: [],              // [{nombre, fn, orden}] sobre el compuesto
    listoTs: 0,                // performance.now() del último 'video:listo'
    // sondeo de cámara IP
    ipShotUrl: '', ipActivo: false, ipErrores: 0, ipPrimerFrame: false,
    ipTaint: false, ipTimer: 0, ipResolver: null,
    // grabación de evento
    bufferRec: null, bufferChunks: [], grabStream: null,
    eventoActivo: false, eventoFin: 0, eventoMotivo: '', eventoTimer: 0,
    grabAvisado: false,
    // anti-sabotaje
    sabUltimo: 0, sabRef: null, sabRefLum: 0, sabCambioDesde: 0,
    sabCooldown: 0, sabRecalibHasta: 0,
    // lienzos de trabajo (offscreen, creados a demanda)
    cnvFuente: null, sabCnv: null, tmpPix: null, tmpCap: null, tmpCors: null,
  };

  vid_mostrarEstado();

  /* Escuchas de bus: alertas y fuera de horario disparan grabación de evidencia */
  bus.on('alerta:critica', (d) => {
    const r = d && d.registro;
    vid_grabarEvento((r && r.tipo) || 'critico');
  });
  bus.on('alerta', (d) => {
    const r = d && d.registro;
    if (r && r.nivel === 'sospecha' && estado.cfg.clipSospecha) vid_grabarEvento(r.tipo || 'sospecha');
  });
  bus.on('fuera_horario:persona', () => vid_grabarEvento('fuera_horario'));

  /* Cada nueva fuente reinicia el buffer y (re)calibra el anti-sabotaje */
  bus.on('video:listo', () => {
    estado.vid.listoTs = performance.now();
    estado.vid.sabRef = null;
    estado.vid.sabRecalibHasta = 0;
    vid_reiniciarBufferGrabacion();
  });
}

/* Enciende la fuente de vídeo que esté configurada (cámara por defecto), sin
 * pasar por Ajustes. La usan el botón «📷 Encender cámara» del visor y el
 * arranque de un toque del copiloto. Nunca lanza: los errores ya los avisa
 * cada fuente con su propio mensaje. */
function vid_encenderFuente() {
  try {
    const f = estado.cfg.fuente || 'camara';
    if (f === 'dashcam') return vid_usarDashcam(estado.cfg.urlDashcam).catch(function () {});
    if (f === 'ip' && estado.cfg.urlIP) return vid_usarIP(estado.cfg.urlIP).catch(function () {});
    return vid_usarCamara().catch(function () {});
  } catch (e) { /* nada: el visor sigue mostrando SIN SEÑAL con su botón */ }
}

/* Alterna pantalla completa del visor. Si el navegador no la permite (iOS
 * antiguos, webviews capadas), alterna el modo GRANDE (94vh) como respaldo. */
function vid_alternarPantallaCompleta() {
  const visor = vid_el.visor; if (!visor) return;
  try {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(function () {});
      return;
    }
    if (visor.requestFullscreen) {
      visor.requestFullscreen().catch(function () { visor.classList.toggle('vid-grande'); });
    } else {
      visor.classList.toggle('vid-grande');
    }
  } catch (e) {
    try { visor.classList.toggle('vid-grande'); } catch (e2) {}
  }
}

/* ==========================================================================
 * FUENTES DE VÍDEO
 * ========================================================================*/

/* Cámara del dispositivo (getUserMedia). Devuelve Promise<bool>. */
async function vid_usarCamara() {
  const v = estado.vid; if (!v) return false;
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const insegura = location.protocol === 'file:' || !window.isSecureContext;
      bus.emit('video:error', { msg: insegura
        ? 'La cámara requiere HTTPS (Cloudflare Pages); en local usa el vídeo demo'
        : 'Este navegador no permite acceder a la cámara.' });
      return false;
    }
    vid_detener(); // detiene la fuente anterior
    const res = estado.cfg.resolucion === '480' ? { w: 640, h: 480 }
      : estado.cfg.resolucion === '1080' ? { w: 1920, h: 1080 }
      : estado.cfg.resolucion === '1440' ? { w: 2560, h: 1440 }
      : { w: 1280, h: 720 };
    // Pedimos la MEJOR calidad que dé la lente:
    //  · ideal = lo que queremos; min = no aceptes algo cutre por debajo.
    //  · resizeMode 'none' = que el navegador NO reduzca la imagen (clave para
    //    que se vea nítida; por defecto muchos navegadores la encogen).
    //  · frameRate ideal 30 para un visor fluido.
    const minW = res.w >= 1920 ? 1280 : (res.w >= 1280 ? 960 : 480);
    const vconstr = {
      width: { ideal: res.w, min: minW },
      height: { ideal: res.h },
      frameRate: { ideal: 30 },
      resizeMode: 'none',
    };
    // Si el dueño eligió una LENTE concreta (deviceId), la pedimos exacta —
    // así se evita que el navegador coja la gran angular (mala para detectar).
    // Si no, caemos al lado (frontal/trasera) genérico.
    if (estado.cfg.camaraId) vconstr.deviceId = { exact: estado.cfg.camaraId };
    else vconstr.facingMode = { ideal: estado.cfg.camara };
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: vconstr, audio: false });
    } catch (e1) {
      // Reintento tolerante: sin min ni resizeMode (algún navegador los rechaza).
      const suave = { width: { ideal: res.w }, height: { ideal: res.h }, frameRate: { ideal: 30 } };
      if (estado.cfg.camaraId) suave.deviceId = { exact: estado.cfg.camaraId };
      else suave.facingMode = estado.cfg.camara;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: suave, audio: false });
      } catch (e2) {
        if (estado.cfg.camaraId) {           // la lente exacta ya no existe: por lado
          delete suave.deviceId; suave.facingMode = estado.cfg.camara;
          stream = await navigator.mediaDevices.getUserMedia({ video: suave, audio: false });
        } else { throw e2; }
      }
    }
    v.stream = stream;
    const video = vid_el.video;
    if (!video) { stream.getTracks().forEach((t) => { try { t.stop(); } catch (e) {} }); return false; }
    // Enfoque y exposición CONTINUOS si la lente los soporta (mucho más nítido
    // que el enfoque fijo por defecto). Nunca rompe: si no se puede, se ignora.
    vid_afinarLente(stream);
    video.srcObject = stream;
    video.muted = true; video.playsInline = true;
    await video.play().catch(() => {});
    await vid_esperarMetadatos(video);

    v.tipoFuente = 'camara'; v.fuenteEl = video;
    const dims = vid_dimensiones(); // espacio de frame (nativo con tope 1920)
    estado.video.tipo = 'camara'; estado.video.listo = true;
    estado.video.w = dims.w; estado.video.h = dims.h; estado.video.grabando = false;
    vid_ocultarEstado();
    // Aviso honesto si la lente entregó poca resolución pese a pedir más.
    const real = (video.videoWidth || 0);
    if (real && real < 1000 && (estado.cfg.resolucion === '1080' || estado.cfg.resolucion === '1440')) {
      if (typeof ui_toast === 'function') {
        try { ui_toast('Tu cámara entregó solo ' + real + 'px de ancho. Prueba «Buscar» y elige la lente principal, o baja a 720p.', 'sospecha'); } catch (e) {}
      }
    }
    bus.emit('video:listo', { tipo: 'camara', w: dims.w, h: dims.h });
    return true;
  } catch (e) {
    bus.emit('video:error', { msg: vid_mensajeCamara(e) });
    return false;
  }
}

/* Enfoque / exposición / balance de blancos CONTINUOS si la lente los soporta.
 * Por defecto muchas cámaras web arrancan con enfoque fijo y se ven borrosas;
 * esto las pone a enfocar solas, como la app de cámara nativa. Nunca rompe. */
function vid_afinarLente(stream) {
  try {
    const track = stream.getVideoTracks && stream.getVideoTracks()[0];
    if (!track || !track.getCapabilities || !track.applyConstraints) return;
    const cap = track.getCapabilities();
    const adv = [];
    if (cap.focusMode && cap.focusMode.indexOf('continuous') >= 0) adv.push({ focusMode: 'continuous' });
    if (cap.exposureMode && cap.exposureMode.indexOf('continuous') >= 0) adv.push({ exposureMode: 'continuous' });
    if (cap.whiteBalanceMode && cap.whiteBalanceMode.indexOf('continuous') >= 0) adv.push({ whiteBalanceMode: 'continuous' });
    if (adv.length) track.applyConstraints({ advanced: adv }).catch(function () {});
  } catch (e) { /* la lente no deja afinar: se queda como estaba */ }
}

/* Lista las cámaras REALES del dispositivo (para elegir la lente buena).
 * Devuelve Promise<[{id, etiqueta}]>. Las etiquetas solo aparecen tras haber
 * dado permiso una vez; por eso pedimos un permiso efímero si hace falta. */
async function vid_listarCamaras() {
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return [];
    let dispositivos = await navigator.mediaDevices.enumerateDevices();
    let camaras = dispositivos.filter((d) => d.kind === 'videoinput');
    // Sin etiquetas = aún sin permiso: pedimos uno breve y volvemos a enumerar.
    if (camaras.length && !camaras[0].label) {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: true });
        s.getTracks().forEach((t) => { try { t.stop(); } catch (e) {} });
        dispositivos = await navigator.mediaDevices.enumerateDevices();
        camaras = dispositivos.filter((d) => d.kind === 'videoinput');
      } catch (e) { /* si deniega, devolvemos lo que haya (sin etiquetas) */ }
    }
    return camaras.map((d, i) => ({
      id: d.deviceId,
      etiqueta: d.label || ('Cámara ' + (i + 1)),
    }));
  } catch (e) {
    console.warn('[vídeo] no se pudieron listar las cámaras:', e && e.message);
    return [];
  }
}

/* Traduce el error de getUserMedia a un mensaje claro para el dueño. */
function vid_mensajeCamara(e) {
  if (location.protocol === 'file:' || !window.isSecureContext) {
    return 'La cámara requiere HTTPS (Cloudflare Pages); en local usa el vídeo demo';
  }
  const n = e && e.name;
  if (n === 'NotAllowedError' || n === 'SecurityError' || n === 'PermissionDeniedError') {
    return 'Permiso de cámara denegado. Actívalo en el candado del navegador y recarga la página.';
  }
  if (n === 'NotFoundError' || n === 'DevicesNotFoundError' || n === 'OverconstrainedError' || n === 'NotReadableError') {
    return 'No hay cámara disponible (o está en uso por otra app / no cumple la resolución pedida).';
  }
  return 'No se pudo abrir la cámara: ' + ((e && e.message) || 'error desconocido');
}

/* Cámara IP (app "IP Webcam" de Android) por sondeo de snapshots CORS-limpios. */
async function vid_usarIP(url) {
  const v = estado.vid; if (!v) return false;
  try {
    let base = (url != null ? url : (estado.cfg.urlIP || '')).toString().trim();
    if (!base) {
      bus.emit('video:error', { msg: 'Introduce la URL de la cámara IP (por ejemplo http://192.168.1.50:8080).' });
      return false;
    }
    vid_detener();
    base = base.replace(/\/+$/, '');
    let shot;
    if (/\.(jpe?g|png|mjpe?g)$/i.test(base) || /\/shot\.jpg$/i.test(base)) shot = base;
    else shot = base + '/shot.jpg';

    v.ipShotUrl = shot; v.ipActivo = true; v.ipErrores = 0;
    v.ipPrimerFrame = false; v.ipTaint = false;

    const img = vid_el.mjpeg;
    if (!img) { bus.emit('video:error', { msg: 'No se encontró el visor para la cámara IP.' }); return false; }
    img.crossOrigin = 'anonymous';

    return await new Promise((resolve) => {
      let cerrado = false;
      const acabar = (r) => { if (cerrado) return; cerrado = true; clearTimeout(guardaT); resolve(r); };
      v.ipResolver = acabar;
      const guardaT = setTimeout(() => {
        if (!v.ipPrimerFrame) {
          v.ipActivo = false;
          bus.emit('video:error', { msg: 'No se llega a la cámara IP — comprueba IP, puerto y que estáis en la misma red' });
          acabar(false);
        }
      }, 12000);
      vid_sondearIP();
    });
  } catch (e) {
    bus.emit('video:error', { msg: 'No se pudo iniciar la cámara IP.' });
    return false;
  }
}

/* Bucle de sondeo del snapshot: cada frame es una <img> nueva con cache-buster,
 * encadenada por onload/onerror a ~8-10 fps (imágenes CORS-limpias → canvas sano). */
function vid_sondearIP() {
  const v = estado.vid;
  if (!v || !v.ipActivo) return;
  const img = vid_el.mjpeg;
  if (!img) return;

  img.onload = () => {
    if (!v.ipActivo) return;
    v.ipErrores = 0;
    if (!v.ipPrimerFrame) {
      v.ipPrimerFrame = true;
      /* Prueba de contaminación: si el canvas se ensucia, se puede ver pero no analizar/grabar */
      let contaminado = false;
      try {
        const t = v.tmpCors || (v.tmpCors = document.createElement('canvas'));
        t.width = 8; t.height = 8;
        const tc = t.getContext('2d');
        tc.drawImage(img, 0, 0, 8, 8);
        t.toDataURL('image/jpeg'); // lanza SecurityError si está contaminado
      } catch (err) { contaminado = true; }
      v.ipTaint = contaminado;

      v.tipoFuente = 'ip'; v.fuenteEl = img;
      const dims = vid_dimensiones();
      estado.video.tipo = 'ip'; estado.video.listo = true;
      estado.video.w = dims.w; estado.video.h = dims.h; estado.video.grabando = false;
      vid_ocultarEstado();

      if (contaminado) {
        bus.emit('video:error', { msg: 'La cámara IP no envía cabeceras CORS: la vista funciona pero no se puede analizar ni grabar. En IP Webcam, usa la URL http://IP:8080' });
      }
      bus.emit('video:listo', { tipo: 'ip', w: dims.w, h: dims.h });
      if (v.ipResolver) { v.ipResolver(true); v.ipResolver = null; }
    }
    v.ipTimer = setTimeout(vid_sondearIP, 110); // ~9 fps
  };

  img.onerror = () => {
    if (!v.ipActivo) return;
    v.ipErrores = (v.ipErrores || 0) + 1;
    if (v.ipErrores > 10) {
      v.ipActivo = false;
      estado.video.listo = false;
      bus.emit('video:error', { msg: 'No se llega a la cámara IP — comprueba IP, puerto y que estáis en la misma red' });
      if (v.ipResolver) { v.ipResolver(false); v.ipResolver = null; }
      return;
    }
    v.ipTimer = setTimeout(vid_sondearIP, 350);
  };

  const sep = v.ipShotUrl.indexOf('?') >= 0 ? '&' : '?';
  img.src = v.ipShotUrl + sep + '_t=' + Date.now();
}

/* Vídeo demo desde archivo local (para demos a clientes y calibrar umbrales). */
async function vid_usarArchivo(file) {
  const v = estado.vid; if (!v) return false;
  try {
    if (!file) { bus.emit('video:error', { msg: 'Elige un archivo de vídeo para la demo.' }); return false; }
    vid_detener();
    const video = vid_el.video;
    if (!video) { bus.emit('video:error', { msg: 'No se encontró el elemento de vídeo.' }); return false; }
    const url = URL.createObjectURL(file);
    v.objectURL = url;
    video.srcObject = null;
    video.src = url;
    video.loop = true; video.muted = true; video.playsInline = true;

    return await new Promise((resolve) => {
      let hecho = false;
      const listo = () => {
        if (hecho) return; hecho = true;
        clearTimeout(guardaT);
        video.removeEventListener('loadedmetadata', listo);
        v.tipoFuente = 'archivo'; v.fuenteEl = video;
        const dims = vid_dimensiones();
        estado.video.tipo = 'archivo'; estado.video.listo = true;
        estado.video.w = dims.w; estado.video.h = dims.h; estado.video.grabando = false;
        vid_ocultarEstado();
        video.play().catch(() => {});
        bus.emit('video:listo', { tipo: 'archivo', w: dims.w, h: dims.h });
        resolve(true);
      };
      const guardaT = setTimeout(() => {
        if (!hecho) {
          bus.emit('video:error', { msg: 'No se pudo leer el vídeo de demo (¿formato no soportado?). Prueba con un .mp4 o .webm.' });
          resolve(false);
        }
      }, 8000);
      video.addEventListener('loadedmetadata', listo);
      video.addEventListener('ended', () => { if (!video.loop) bus.emit('video:fin', {}); });
      if (video.readyState >= 1 && video.videoWidth) listo();
      video.play().catch(() => {});
    });
  } catch (e) {
    bus.emit('video:error', { msg: 'No se pudo abrir el vídeo de demo.' });
    return false;
  }
}

/* ===========================================================================
 * DASHCAM / CÁMARA RTSP (vía go2rtc → stream MJPEG pintado en el mismo canvas).
 * go2rtc corre en Termux en el propio móvil y traduce el RTSP de la dashcam a
 * MJPEG en http://localhost:1984. TODO el pipeline (detección, tracker, alertas,
 * grabación) consume el canvas/vid_fuente(), así que funciona sin más cambios.
 * ========================================================================= */
/* Deriva una URL de FOTOGRAMA suelto (más robusto que el MJPEG multipart, que
 * no siempre dispara onload). go2rtc: /api/stream.mjpeg → /api/frame.jpeg. */
function vid_dashcamFrameUrl(u) {
  if (/stream\.mjpe?g/i.test(u)) return u.replace(/stream\.mjpe?g/i, 'frame.jpeg');
  if (/\.(jpe?g|png)(\?|$)/i.test(u)) return u;       // ya apunta a un fotograma
  return u; // se usa tal cual (se sondea igualmente)
}

async function vid_usarDashcam(url) {
  const v = estado.vid; if (!v) return false;
  try {
    let u = (url != null ? url : (estado.cfg.urlDashcam || '')).toString().trim();
    if (!u) { bus.emit('video:error', { msg: 'Escribe la URL del stream de la dashcam (go2rtc).' }); return false; }
    vid_detener();
    const img = vid_el.mjpeg;
    if (!img) { bus.emit('video:error', { msg: 'No se encontró el visor de vídeo.' }); return false; }
    v.dcUrl = u;
    v.dcFrameUrl = vid_dashcamFrameUrl(u);              // sondeamos fotogramas sueltos
    v.dcActivo = true; v.dcCaidaDesde = 0; v.dcAvisado = false; v.dcTaint = false;
    v.dcPrimero = false; v.dcErrores = 0; v.dcResolver = null;
    try { img.crossOrigin = 'anonymous'; } catch (e) {}   // necesario para poder analizar

    return await new Promise((resolve) => {
      v.dcResolver = resolve;
      v.dcGuardaT = setTimeout(() => {
        if (!v.dcPrimero && v.dcResolver) {
          v.dcActivo = false;
          bus.emit('video:error', { msg: 'No se conecta con la dashcam. ¿Arrancaste go2rtc en Termux y estás en el WiFi de la cámara? (Guía en Ajustes → Conectar mi dashcam)' });
          const r = v.dcResolver; v.dcResolver = null; r(false);
        }
      }, 6000);
      vid_dashcamSondear();
    });
  } catch (e) {
    bus.emit('video:error', { msg: 'No se pudo abrir la dashcam.' });
    return false;
  }
}

/* Bucle de sondeo: pide un fotograma JPEG, lo pinta y encadena el siguiente
 * a ~10 fps. Cada fotograma nuevo confirma señal viva (y recuperación). */
function vid_dashcamSondear() {
  const v = estado.vid;
  if (!v || !v.dcActivo) return;
  const img = vid_el.mjpeg; if (!img) return;

  img.onload = () => {
    if (!v.dcActivo) return;
    v.dcErrores = 0; v.dcCaidaDesde = 0; v.dcAvisado = false;
    if (!v.dcPrimero) {
      v.dcPrimero = true;
      clearTimeout(v.dcGuardaT);
      let cont = false;
      try {
        const t = document.createElement('canvas'); t.width = 8; t.height = 8;
        t.getContext('2d').drawImage(img, 0, 0, 8, 8); t.toDataURL('image/jpeg');
      } catch (e) { cont = true; }
      v.dcTaint = cont;
      v.tipoFuente = 'dashcam'; v.fuenteEl = img;
      const dims = vid_dimensiones();
      estado.video.tipo = 'dashcam'; estado.video.listo = true;
      estado.video.w = dims.w; estado.video.h = dims.h; estado.video.grabando = false;
      vid_ocultarEstado();
      if (cont) bus.emit('video:error', { msg: 'La dashcam se ve, pero go2rtc no envía cabeceras CORS: no se puede analizar ni grabar. Añade "cors" a la config de go2rtc (la guía lo explica).' });
      bus.emit('video:listo', { tipo: 'dashcam', w: dims.w, h: dims.h });
      if (v.dcResolver) { const r = v.dcResolver; v.dcResolver = null; r(true); }
    } else if (!estado.video.listo) {
      estado.video.listo = true; vid_ocultarEstado();   // recuperada tras caída
    }
    v.dcTimer = setTimeout(vid_dashcamSondear, 100);     // ~10 fps
  };
  img.onerror = () => {
    if (!v.dcActivo) return;
    v.dcErrores = (v.dcErrores || 0) + 1;
    vid_dashcamReconectar();
  };
  const sep = v.dcFrameUrl.indexOf('?') >= 0 ? '&' : '?';
  img.src = v.dcFrameUrl + sep + '_t=' + Date.now();
}

/* Reconexión automática del stream de la dashcam (WiFi de cámara inestable). */
function vid_dashcamReconectar() {
  const v = estado.vid; if (!v || !v.dcActivo) return;
  if (!v.dcCaidaDesde) v.dcCaidaDesde = Date.now();
  if (v.dcPrimero) { estado.video.listo = false; }     // pausa el análisis mientras no hay señal
  if (vid_el.estado) { vid_el.estado.textContent = 'Reconectando con dashcam…'; }
  if (v.dcPrimero) vid_mostrarEstado();
  const caidoMs = Date.now() - v.dcCaidaDesde;
  if (caidoMs > 30000 && !v.dcAvisado) {
    v.dcAvisado = true;
    bus.emit('video:error', { msg: 'La dashcam lleva más de 30 s sin señal. Comprueba el WiFi de la cámara y que go2rtc siga arrancado.' });
  }
  clearTimeout(v.dcTimer);
  v.dcTimer = setTimeout(vid_dashcamSondear, 3000);      // reintento cada 3 s
}

/* Prueba de conexión de la dashcam: intenta cargar el stream ~5 s y devuelve
 * Promise<{ok, msg, w, h}> con resultado claro (para el botón "Probar conexión"). */
function vid_probarDashcam(url) {
  return new Promise((resolve) => {
    let u = (url != null ? url : (estado.cfg.urlDashcam || '')).toString().trim();
    if (!u) { resolve({ ok: false, msg: 'Escribe primero la URL del stream.' }); return; }
    u = vid_dashcamFrameUrl(u);   // probamos un fotograma suelto (robusto)
    const img = new Image();
    try { img.crossOrigin = 'anonymous'; } catch (e) {}
    let hecho = false;
    const t = setTimeout(() => {
      if (hecho) return; hecho = true; img.src = '';
      resolve({ ok: false, msg: 'No responde en 5 s. Causas típicas: go2rtc no está arrancado en Termux, la URL está mal, o el móvil no está en el WiFi de la dashcam.' });
    }, 5000);
    img.onload = () => {
      if (hecho) return; hecho = true; clearTimeout(t);
      let cors = true;
      try { const c = document.createElement('canvas'); c.width = 8; c.height = 8;
        c.getContext('2d').drawImage(img, 0, 0, 8, 8); c.toDataURL('image/jpeg'); }
      catch (e) { cors = false; }
      resolve({ ok: true, w: img.naturalWidth, h: img.naturalHeight, cors: cors,
        msg: 'Conectado ✅ (' + img.naturalWidth + '×' + img.naturalHeight + ')' +
          (cors ? '' : ' — OJO: go2rtc no envía CORS, se verá pero no se podrá analizar.') });
    };
    img.onerror = () => {
      if (hecho) return; hecho = true; clearTimeout(t);
      resolve({ ok: false, msg: 'Error de conexión. ¿go2rtc arrancado? ¿URL correcta? ¿WiFi de la cámara conectado (sin quitar los datos móviles)?' });
    };
    const sep = u.indexOf('?') >= 0 ? '&' : '?';
    img.src = u + sep + '_t=' + Date.now();
  });
}

/* Espera a tener dimensiones de vídeo (con tope de tiempo, sin colgarse). */
function vid_esperarMetadatos(video) {
  return new Promise((resolve) => {
    if (video.videoWidth) return resolve();
    let hecho = false;
    const done = () => { if (hecho) return; hecho = true; video.removeEventListener('loadedmetadata', done); resolve(); };
    video.addEventListener('loadedmetadata', done);
    setTimeout(done, 4000);
  });
}

/* Detiene cualquier fuente y deja el visor en "sin señal". */
function vid_detener() {
  const v = estado.vid; if (!v) return;
  try {
    v.ipActivo = false;
    clearTimeout(v.ipTimer);
    v.ipPrimerFrame = false; v.ipErrores = 0; v.ipTaint = false;
    if (v.ipResolver) { try { v.ipResolver(false); } catch (e) {} v.ipResolver = null; }

    if (v.stream) { v.stream.getTracks().forEach((t) => { try { t.stop(); } catch (e) {} }); v.stream = null; }

    const video = vid_el.video;
    if (video) {
      try { video.pause(); } catch (e) {}
      video.srcObject = null;
      if (video.getAttribute('src')) { video.removeAttribute('src'); try { video.load(); } catch (e) {} }
    }
    if (v.objectURL) { try { URL.revokeObjectURL(v.objectURL); } catch (e) {} v.objectURL = null; }

    v.dcActivo = false; clearTimeout(v.dcTimer); clearTimeout(v.dcGuardaT);
    v.dcCaidaDesde = 0; v.dcAvisado = false; v.dcTaint = false; v.dcPrimero = false;
    if (v.dcResolver) { try { v.dcResolver(false); } catch (e) {} v.dcResolver = null; }

    const img = vid_el.mjpeg;
    if (img) { img.onload = null; img.onerror = null; img.removeAttribute('src'); }

    vid_pararBufferGrabacion();

    estado.video.listo = false; estado.video.tipo = null; estado.video.grabando = false;
    v.tipoFuente = null; v.fuenteEl = null; v.listoTs = 0;
    v.sabRef = null; v.sabRecalibHasta = 0; v.sabCambioDesde = 0;

    if (vid_el.canvasPriv) vid_el.canvasPriv.classList.add('oculto');
    if (vid_el.rec) vid_el.rec.classList.add('oculto');
    if (vid_el.expandir) vid_el.expandir.classList.add('oculto');
    if (vid_el.plegar) vid_el.plegar.classList.add('oculto');
    const vbc = document.getElementById('vid-btnCamara');
    if (vbc) vbc.classList.remove('oculto');
    const vbd = document.getElementById('vid-btnDemo');
    if (vbd) vbd.classList.remove('oculto');
    vid_mostrarEstado();
  } catch (e) {
    console.warn('[vid] al detener:', e && e.message);
  }
}

/* Elemento listo para nuc_detectar (video o img). Con escalado, el CANVAS de
 * fuente escalada (evita recursión con el compuesto). null si no hay fuente. */
function vid_fuente() {
  const v = estado.vid;
  if (!v || !estado.video.listo || !v.fuenteEl) return null;
  if (v.escalando && v.cnvFuente) return v.cnvFuente;
  return v.fuenteEl;
}

/* Dimensiones del espacio de frame: nativo de la fuente con tope de ancho 1280. */
function vid_dimensiones() {
  const v = estado.vid;
  const el = v && v.fuenteEl;
  let nw = 0, nh = 0;
  if (el) {
    if (el.tagName === 'VIDEO') { nw = el.videoWidth; nh = el.videoHeight; }
    else if (el.tagName === 'IMG') { nw = el.naturalWidth; nh = el.naturalHeight; }
  }
  if (!nw || !nh) return { w: estado.video.w || 640, h: estado.video.h || 480 };
  let w = nw, h = nh, esc = false;
  if (nw > VID_ANCHO_TOPE) { const k = VID_ANCHO_TOPE / nw; w = VID_ANCHO_TOPE; h = Math.round(nh * k); esc = true; }
  if (v) { v.escalando = esc; v.natW = nw; v.natH = nh; }
  return { w, h };
}

/* ==========================================================================
 * COMPOSICIÓN DEL CANVAS
 * ========================================================================*/

/* Registro ordenado de pintores que dibujan sobre el compuesto. */
function vid_registrarPintor(nombre, fn, orden) {
  const v = estado.vid;
  if (!v || typeof fn !== 'function' || !nombre) return;
  v.pintores = (v.pintores || []).filter((p) => p.nombre !== nombre);
  v.pintores.push({ nombre, fn, orden: typeof orden === 'number' ? orden : 50 });
  v.pintores.sort((a, b) => a.orden - b.orden);
}

/* ============================================================================
 * AHORRO DE ENERGÍA — detector de movimiento barato (miniatura 32×24).
 * Compara el frame actual con el anterior en una miniatura minúscula (768 px):
 * cuesta ~0 y permite bajar la IA a 2 fps cuando la escena está quieta.
 * En cuanto ≥2% de la miniatura cambia, estado.video.ultMovimiento se refresca
 * y el bucle vuelve a los fps del dueño EN EL ACTO (latencia ≤200 ms).
 * ==========================================================================*/
const VID_MOV_ANCHO = 32;        // miniatura de comparación
const VID_MOV_ALTO = 24;
const VID_MOV_CADA_MS = 400;     // medir como mucho ~2-3 veces por segundo (un getImageData menos por frame)
const VID_MOV_UMBRAL_PX = 26;    // diferencia de gris que cuenta como cambio
const VID_MOV_FRACCION = 0.02;   // ≥2% de píxeles cambiados = hay movimiento
const VID_CALMA_MS = 3000;       // 3 s sin cambios = escena en calma

function vid_medirMovimiento(ahora) {
  const v = estado.vid;
  if (!v || !estado.video.listo || !v.fuenteEl) { estado.video.enCalma = false; return; }
  if (ahora - (v.movUltMedida || 0) < VID_MOV_CADA_MS) return;
  v.movUltMedida = ahora;
  try {
    let cnv = v.cnvMov;
    if (!cnv) {
      cnv = document.createElement('canvas');
      cnv.width = VID_MOV_ANCHO; cnv.height = VID_MOV_ALTO;
      v.cnvMov = cnv;
      v.ctxMov = cnv.getContext('2d', { willReadFrequently: true });
    }
    v.ctxMov.drawImage(v.fuenteEl, 0, 0, VID_MOV_ANCHO, VID_MOV_ALTO);
    const px = v.ctxMov.getImageData(0, 0, VID_MOV_ANCHO, VID_MOV_ALTO).data;
    const prev = v.movPrev;
    if (prev && prev.length === px.length) {
      let cambiados = 0;
      for (let i = 0; i < px.length; i += 4) {
        const g = (px[i] + px[i + 1] + px[i + 2]) / 3;
        const gp = (prev[i] + prev[i + 1] + prev[i + 2]) / 3;
        if (Math.abs(g - gp) > VID_MOV_UMBRAL_PX) cambiados++;
      }
      if (cambiados / (VID_MOV_ANCHO * VID_MOV_ALTO) >= VID_MOV_FRACCION) {
        estado.video.ultMovimiento = ahora;
      }
    } else {
      estado.video.ultMovimiento = ahora;   // primera medida: despierto
    }
    v.movPrev = px;
    estado.video.enCalma = (ahora - (estado.video.ultMovimiento || 0)) > VID_CALMA_MS;
  } catch (e) {
    estado.video.enCalma = false;           // canvas contaminado u otro fallo: sin ahorro
  }
}

/* Dibuja el frame actual + pintores + fecha/hora; gestiona REC y la capa de
 * privacidad. #vid-canvas queda SIEMPRE íntegro (fuente de grabación/capturas). */
function vid_componer() {
  const v = estado.vid; if (!v) return;
  const cnv = vid_el.canvas; if (!cnv) return;
  const ctx = cnv.getContext('2d'); if (!ctx) return;

  if (!estado.video.listo || !v.fuenteEl) { vid_sinSenal(ctx, cnv); return; }

  const dims = vid_dimensiones();
  estado.video.w = dims.w; estado.video.h = dims.h;
  if (cnv.width !== dims.w || cnv.height !== dims.h) { cnv.width = dims.w; cnv.height = dims.h; }
  // El visor adopta la forma real del vídeo (evita recortar arriba/abajo).
  if (vid_el.visor) vid_el.visor.classList.add('vid-activo');
  if (vid_el.expandir) vid_el.expandir.classList.remove('oculto');
  if (vid_el.plegar) vid_el.plegar.classList.remove('oculto');
  const vbc = document.getElementById('vid-btnCamara');
  if (vbc && !vbc.classList.contains('oculto')) vbc.classList.add('oculto');
  const vbd = document.getElementById('vid-btnDemo');
  if (vbd && !vbd.classList.contains('oculto')) vbd.classList.add('oculto');

  const el = v.fuenteEl;
  try {
    if (v.escalando) {
      let cf = v.cnvFuente;
      if (!cf) { cf = document.createElement('canvas'); cf.id = 'vid-fuenteEscalada'; v.cnvFuente = cf; }
      if (cf.width !== dims.w || cf.height !== dims.h) { cf.width = dims.w; cf.height = dims.h; }
      const cctx = cf.getContext('2d');
      cctx.imageSmoothingEnabled = true; cctx.imageSmoothingQuality = 'high';
      cctx.drawImage(el, 0, 0, dims.w, dims.h);
      ctx.drawImage(cf, 0, 0);
    } else {
      ctx.drawImage(el, 0, 0, dims.w, dims.h);
    }
  } catch (e) { /* frame incompleto o contaminado: se ignora este ciclo */ }

  const pintores = v.pintores || [];
  for (let i = 0; i < pintores.length; i++) {
    try { pintores[i].fn(ctx); } catch (e) { /* un pintor roto no rompe el compuesto */ }
  }

  vid_estampaFecha(ctx, cnv);
  if (vid_el.rec) vid_el.rec.classList.toggle('oculto', !estado.video.grabando);

  vid_componerPrivacidad(ctx, cnv, dims);
}

/* Capa de privacidad: copia del compuesto íntegro con las cabezas pixeladas.
 * NUNCA toca #vid-canvas → la evidencia grabada/capturada va siempre limpia. */
function vid_componerPrivacidad(ctx, cnv, dims) {
  const v = estado.vid;
  const priv = vid_el.canvasPriv;
  if (!priv) return;
  if (!estado.cfg.privacidad) { priv.classList.add('oculto'); return; }

  if (priv.width !== cnv.width || priv.height !== cnv.height) { priv.width = cnv.width; priv.height = cnv.height; }
  const pctx = priv.getContext('2d');
  if (!pctx) return;
  try { pctx.drawImage(cnv, 0, 0); } catch (e) { priv.classList.add('oculto'); return; }

  const criticos = (estado.alertas && estado.alertas.criticoTracks) || [];
  const tracks = estado.tracks || [];
  const tmp = v.tmpPix || (v.tmpPix = document.createElement('canvas'));
  const tctx = tmp.getContext('2d');

  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i];
    if (!t || t.clase !== 'person' || !t.caja) continue;
    if (criticos.indexOf(t.id) >= 0) continue; // en alerta crítica: no se pixela (evidencia visible)
    const c = t.caja;
    let hx = nuc_clamp(c.x, 0, cnv.width);
    let hy = nuc_clamp(c.y, 0, cnv.height);
    let hw = Math.min(c.an, cnv.width - hx);
    let hh = Math.min(c.al * 0.25, cnv.height - hy);   // 25% superior de la caja (la cabeza)
    if (hw < 2 || hh < 2) continue;
    const sw = Math.max(1, Math.round(hw / 8));         // 1/8 y re-ampliado sin suavizado = pixelado
    const sh = Math.max(1, Math.round(hh / 8));
    tmp.width = sw; tmp.height = sh;
    tctx.imageSmoothingEnabled = false;
    pctx.imageSmoothingEnabled = false;
    try {
      tctx.drawImage(priv, hx, hy, hw, hh, 0, 0, sw, sh);
      pctx.drawImage(tmp, 0, 0, sw, sh, hx, hy, hw, hh);
    } catch (e) { /* región fuera de rango: se omite */ }
  }
  priv.classList.remove('oculto');
}

/* Marca de fecha/hora (esquina inferior izquierda) — prueba en las grabaciones. */
function vid_estampaFecha(ctx, cnv) {
  try {
    const txt = nuc_fechaHora() + '  ' + (CONFIG.NOMBRE_APP || '');
    ctx.save();
    ctx.font = "14px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    const anchoTxt = ctx.measureText(txt).width;
    const banda = 22, y = cnv.height;
    ctx.fillStyle = 'rgba(0,0,0,.65)';
    ctx.fillRect(0, y - banda, anchoTxt + 12, banda);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(txt, 6, y - 6);
    ctx.restore();
  } catch (e) { /* ignorar */ }
}

/* Pantalla "SIN SEÑAL" + reloj cuando no hay fuente. */
function vid_sinSenal(ctx, cnv) {
  try {
    // Sin fuente: vuelve al marco 16:9 de reposo (quita la forma del vídeo).
    if (vid_el.visor) vid_el.visor.classList.remove('vid-activo');
    if (cnv.width < 320 || cnv.height < 180) { cnv.width = 640; cnv.height = 360; }
    ctx.fillStyle = '#0b0f14';
    ctx.fillRect(0, 0, cnv.width, cnv.height);
    // Esquina superior izquierda, pequeño: el centro lo ocupan los botones
    // («Encender cámara» / «Probar con un vídeo») y el texto de ayuda va arriba
    // centrado (#vid-estado). Así nada se solapa.
    ctx.fillStyle = '#7d8fa0';
    ctx.textAlign = 'left';
    ctx.font = "bold 13px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.fillText('SIN SEÑAL', 10, 20);
    ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.fillText(nuc_fechaHora(), 10, 36);
    if (vid_el.canvasPriv) vid_el.canvasPriv.classList.add('oculto');
    if (vid_el.rec) vid_el.rec.classList.add('oculto');
    if (vid_el.expandir) vid_el.expandir.classList.add('oculto');
    if (vid_el.plegar) vid_el.plegar.classList.add('oculto');
    const vbc = document.getElementById('vid-btnCamara');
    if (vbc) vbc.classList.remove('oculto');
    const vbd = document.getElementById('vid-btnDemo');
    if (vbd) vbd.classList.remove('oculto');
  } catch (e) { /* ignorar */ }
}

/* Captura JPEG del compuesto ÍNTEGRO, reducida a anchoMax. null si falla.
 * calidad opcional (0..1, por defecto 0.6): las fotos que van a Telegram se
 * piden más grandes y con más calidad (evidencia nítida); las miniaturas del
 * historial se quedan pequeñas (el almacén del móvil es limitado). */
function vid_capturaJPEG(anchoMax, calidad) {
  anchoMax = anchoMax || 320;
  const v = estado.vid; if (!v) return null;
  try {
    const cnv = vid_el.canvas;
    if (!cnv || !estado.video.listo || !cnv.width || !cnv.height) return null;
    const k = Math.min(1, anchoMax / cnv.width);
    const w = Math.max(1, Math.round(cnv.width * k)), h = Math.max(1, Math.round(cnv.height * k));
    const tmp = v.tmpCap || (v.tmpCap = document.createElement('canvas'));
    tmp.width = w; tmp.height = h;
    tmp.getContext('2d').drawImage(cnv, 0, 0, w, h);
    return tmp.toDataURL('image/jpeg', calidad || 0.6); // lanza si el canvas está contaminado → catch
  } catch (e) { return null; }
}

/* ==========================================================================
 * GRABACIÓN DE EVIDENCIA (buffer circular + 20s posteriores)
 * ========================================================================*/

/* Elige el mejor mimeType webm disponible (vp9 → vp8 → webm). */
function vid_mimeGrab() {
  const cands = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  try {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported) {
      for (let i = 0; i < cands.length; i++) if (MediaRecorder.isTypeSupported(cands[i])) return cands[i];
    }
  } catch (e) {}
  return '';
}

/* (Re)arranca el MediaRecorder de buffer sobre el compuesto íntegro. */
function vid_reiniciarBufferGrabacion() {
  const v = estado.vid; if (!v) return;
  vid_pararBufferGrabacion();
  if (typeof MediaRecorder === 'undefined') { vid_avisoGrabError(new Error('MediaRecorder no disponible')); return; }
  const cnv = vid_el.canvas;
  if (!cnv || typeof cnv.captureStream !== 'function') return;
  if (v.ipTaint) return; // fuente contaminada: no se puede grabar (ya se avisó)
  try {
    const stream = cnv.captureStream(10);
    v.grabStream = stream;
    const mime = vid_mimeGrab();
    // Bitrate ADAPTATIVO: sin fijarlo, Android graba con calidad de saldo y el
    // clip del delito "se ve mal". Pero OJO: este codificador corre TODO el
    // rato (búfer de evidencia), así que a 4 Mbps fijos calentaba el móvil y lo
    // arrastraba. A ≤720p, 2,5 Mbps ya es nítido; 4 Mbps solo con imagen grande.
    const bps = ((cnv && cnv.width) || 1280) >= 1600 ? 4000000 : 2500000;
    const opciones = { videoBitsPerSecond: bps };
    if (mime) opciones.mimeType = mime;
    const rec = new MediaRecorder(stream, opciones);
    v.bufferChunks = [];
    rec.ondataavailable = (e) => {
      if (!e.data || !e.data.size) return;
      const est = estado.vid; if (!est) return;
      est.bufferChunks.push(e.data);
      // ⚠️ NUNCA tirar trozos del MEDIO (el viejo splice(1,1) dejaba cabecera +
      // trozos salteados → webm con saltos internos → el reproductor no podía
      // abrirlo: "▶ Ver no muestra nada"). Estrategia por SEGMENTOS: el archivo
      // siempre es contiguo desde su cabecera.
      if (!est.eventoActivo && est.bufferChunks.length > VID_BUFFER_TROZOS + 1) {
        // Sin evento: el búfer se renueva REINICIANDO el grabador (cabecera
        // nueva, memoria acotada, archivo siempre válido).
        setTimeout(() => { try { if (estado.vid && !estado.vid.eventoActivo) vid_reiniciarBufferGrabacion(); } catch (e2) {} }, 0);
      } else if (est.eventoActivo && est.bufferChunks.length > VID_EVENTO_MAX_TROZOS) {
        // Evento larguísimo: se cierra ya (clip completo y válido) en vez de
        // agujerear el archivo.
        setTimeout(() => { try { vid_finalizarEvento(); } catch (e2) {} }, 0);
      }
    };
    rec.onerror = () => { /* errores de grabación no deben romper el bucle */ };
    rec.start(1000);
    v.bufferRec = rec;
  } catch (e) {
    vid_avisoGrabError(e);
  }
}

/* Para el recorder de buffer y limpia su estado. */
function vid_pararBufferGrabacion() {
  const v = estado.vid; if (!v) return;
  try {
    clearTimeout(v.eventoTimer);
    if (v.bufferRec && v.bufferRec.state !== 'inactive') { try { v.bufferRec.stop(); } catch (e) {} }
  } catch (e) {}
  v.bufferRec = null;
  if (v.grabStream) { try { v.grabStream.getTracks().forEach((t) => t.stop()); } catch (e) {} v.grabStream = null; }
  v.bufferChunks = [];
  v.eventoActivo = false;
  estado.video.grabando = false;
}

/* Graba un clip de evento: pre-evidencia del buffer + 20s más. Si ya hay uno en
 * curso, EXTIENDE su fin 20s (sin solapar recorders). Seguro sin fuente. */
function vid_grabarEvento(motivo) {
  const v = estado.vid; if (!v) return;
  try {
    if (typeof MediaRecorder === 'undefined') { vid_avisoGrabError(new Error('MediaRecorder no disponible')); return; }
    if (!estado.video.listo) return;      // sin fuente: no-op seguro
    if (!v.bufferRec) vid_reiniciarBufferGrabacion();
    if (!v.bufferRec) return;             // no se pudo (contaminado / sin captureStream)

    if (v.eventoActivo) { v.eventoFin = Date.now() + VID_EVENTO_MS; return; } // extiende

    v.eventoActivo = true;
    v.eventoMotivo = (motivo || 'evento').toString().replace(/[^\w\-]+/g, '_').slice(0, 40) || 'evento';
    v.eventoFin = Date.now() + VID_EVENTO_MS;
    estado.video.grabando = true;
    vid_tickEvento();
  } catch (e) {
    vid_avisoGrabError(e);
  }
}

/* Comprueba periódicamente si el evento debe cerrarse (respeta extensiones). */
function vid_tickEvento() {
  const v = estado.vid; if (!v || !v.eventoActivo) return;
  clearTimeout(v.eventoTimer);
  const restante = v.eventoFin - Date.now();
  if (restante > 0) { v.eventoTimer = setTimeout(vid_tickEvento, Math.min(restante, 4000)); return; }
  vid_finalizarEvento();
}

/* Cierra el evento: une todos los trozos en un webm y emite 'grabacion:lista'. */
function vid_finalizarEvento() {
  const v = estado.vid; if (!v) return;
  const chunks = (v.bufferChunks || []).slice();
  const motivo = v.eventoMotivo || 'evento';
  v.eventoActivo = false;
  estado.video.grabando = false;
  // Tras cerrar el clip, búfer NUEVO desde cero (cabecera fresca, sin agujeros).
  try { setTimeout(() => { try { vid_reiniciarBufferGrabacion(); } catch (e2) {} }, 0); } catch (e) {}
  if (!chunks.length) return;
  try {
    const mime = vid_mimeGrab() || 'video/webm';
    const blob = new Blob(chunks, { type: mime });
    if (!blob.size) return;
    const url = URL.createObjectURL(blob);      // NO va a localStorage: solo en memoria
    const ts = Date.now();
    const nombre = 'vigia_' + vid_fechaISO(ts) + '_' + motivo + '.webm';
    bus.emit('grabacion:lista', { url, nombre, ts, motivo });
  } catch (e) {
    vid_avisoGrabError(e);
  }
}

/* Marca de tiempo compacta y segura para nombres de archivo. */
function vid_fechaISO(ts) {
  const d = new Date(ts || Date.now());
  const p = (n) => (n < 10 ? '0' : '') + n;
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
    'T' + p(d.getHours()) + '-' + p(d.getMinutes()) + '-' + p(d.getSeconds());
}

/* Aviso único si la grabación no está disponible (no rompe la vigilancia). */
function vid_avisoGrabError(e) {
  const v = estado.vid; if (!v || v.grabAvisado) return;
  v.grabAvisado = true;
  console.warn('[vid] grabación no disponible:', e && e.message);
  bus.emit('error:general', { msg: 'La grabación de evidencias no está disponible en este navegador (se seguirá vigilando y alertando).' });
}

/* ==========================================================================
 * ANTI-SABOTAJE (cámara tapada / negra / encuadre movido)
 * ========================================================================*/

/* Miniatura 32×18 en gris de la fuente actual, como Float32Array. null si no se puede. */
function vid_miniGris() {
  const v = estado.vid;
  const src = (v.escalando && v.cnvFuente) ? v.cnvFuente : v.fuenteEl;
  if (!src) return null;
  let mini = v.sabCnv;
  if (!mini) { mini = document.createElement('canvas'); mini.width = 32; mini.height = 18; v.sabCnv = mini; }
  try {
    const mctx = mini.getContext('2d');
    mctx.drawImage(src, 0, 0, 32, 18);
    const d = mctx.getImageData(0, 0, 32, 18).data; // lanza si está contaminado → sabotaje desactivado
    const out = new Float32Array(32 * 18);
    for (let i = 0, j = 0; i < d.length; i += 4, j++) out[j] = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
    return out;
  } catch (e) { return null; }
}

/* Vigila sabotaje comparando una miniatura en gris contra una referencia rodante. */
function vid_vigilarSabotaje(ts) {
  const v = estado.vid; if (!v) return;
  const ahora = typeof ts === 'number' ? ts : performance.now();

  if (v.sabUltimo && ahora - v.sabUltimo < 500) return;   // throttle ~500ms
  v.sabUltimo = ahora;

  // Modo del anti-sabotaje: 'off' = nada; 'oscuro' = SOLO cámara tapada/negra
  // (para cámaras PTZ o de patrulla, cuyo encuadre cambia por diseño y haría
  // saltar el aviso de "encuadre cambiado" sin razón). 'completo' = todo.
  let sabModo = estado.cfg.sabotajeModo || 'oscuro';
  // En el coche la cámara SIEMPRE se mueve: el aviso de encuadre queda
  // imposible en copiloto/carretera aunque el modo guardado sea 'completo'.
  if (sabModo === 'completo' && (estado.cfg.copActivo || estado.cfg.modo === 'carretera')) {
    sabModo = 'oscuro';
  }
  if (sabModo === 'off') { v.sabRef = null; return; }

  if (!estado.video.listo || !v.fuenteEl) { v.sabRef = null; return; }
  if (!v.listoTs || ahora - v.listoTs < 3000) return;      // calibración inicial ~3s
  if (v.sabCooldown && ahora - v.sabCooldown < 30000) return; // cooldown 30s tras disparar
  if (v.sabRecalibHasta && ahora < v.sabRecalibHasta) return; // re-calibración 5s tras disparar

  const mini = vid_miniGris();
  if (!mini) return; // fuente no legible (p.ej. IP contaminada): sabotaje desactivado en silencio

  let suma = 0;
  for (let i = 0; i < mini.length; i++) suma += mini[i];
  const media = suma / mini.length;

  if (!v.sabRef) { v.sabRef = mini.slice(0); v.sabRefLum = media; v.sabCambioDesde = 0; return; }

  /* Oscuridad global súbita: la escena era clara y de golpe cae por debajo de ~18 */
  if (media < 18 && v.sabRefLum >= 30) { vid_dispararSabotaje('oscuro', ahora); return; }

  /* Cámara móvil (PTZ): solo vigilamos "tapada"; el encuadre cambia por diseño.
   * La referencia se adapta rápido para que la luminancia siga a la escena. */
  if (sabModo === 'oscuro') {
    const alfaRapida = 0.2;
    for (let i = 0; i < mini.length; i++) v.sabRef[i] = v.sabRef[i] * (1 - alfaRapida) + mini[i] * alfaRapida;
    v.sabRefLum = v.sabRefLum * (1 - alfaRapida) + media * alfaRapida;
    v.sabCambioDesde = 0;
    return;
  }

  /* Diferencia media absoluta contra la referencia */
  let dif = 0;
  for (let i = 0; i < mini.length; i++) dif += Math.abs(mini[i] - v.sabRef[i]);
  dif = dif / mini.length;

  const sens = nuc_clamp(estado.cfg.sabotajeSens || 60, 0, 100);
  const umbral = 8 + (100 - sens) * 0.6; // sens 100 → ~8 (muy sensible); sens 0 → ~68 (poco)

  if (dif > umbral) {
    if (!v.sabCambioDesde) v.sabCambioDesde = ahora;
    else if (ahora - v.sabCambioDesde >= 1500) { vid_dispararSabotaje('cambio', ahora); return; } // sostenido ~1.5s
  } else {
    v.sabCambioDesde = 0;
    /* Adapta la referencia lentamente (media exponencial): cambios graduales de luz no disparan */
    const alpha = 0.05;
    for (let i = 0; i < mini.length; i++) v.sabRef[i] = v.sabRef[i] * (1 - alpha) + mini[i] * alpha;
    v.sabRefLum = v.sabRefLum * (1 - alpha) + media * alpha;
  }
}

/* Dispara el evento de sabotaje y programa re-calibración de la referencia en 5s. */
function vid_dispararSabotaje(tipo, ahora) {
  const v = estado.vid;
  v.sabCooldown = ahora;
  v.sabCambioDesde = 0;
  v.sabRef = null;
  v.sabRecalibHasta = ahora + 5000;
  bus.emit('sabotaje', { tipo });
}

/* ==========================================================================
 * Auxiliares de UI del visor
 * ========================================================================*/
function vid_ocultarEstado() {
  if (vid_el.estado) vid_el.estado.classList.add('oculto');
  if (vid_el.canvas) vid_el.canvas.classList.remove('oculto');
}
function vid_mostrarEstado() {
  if (vid_el.estado) vid_el.estado.classList.remove('oculto');
}

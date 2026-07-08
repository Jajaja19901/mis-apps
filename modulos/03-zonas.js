/* ============================================================================
 * 03-ZONAS — VIGÍA IA · zonas y líneas dibujables con el dedo + lógica espacial
 * Prefijo: zona_ / ZONA_ . Estado interno en estado.zona (creado en zona_init).
 * Dibujo táctil sobre #vid-canvas; evaluación de entrada/salida, merodeo, cola,
 * plazas, cruces de línea (anti-jitter) y objeto abandonado. JS puro, sin libs.
 * ==========================================================================*/

/* --- Constantes --------------------------------------------------------------*/
const ZONA_TIPOS = ['prohibida', 'sensible', 'caja', 'plaza', 'detencion'];
const ZONA_COLORES = {
  prohibida: '#ff4155', sensible: '#ffb224', caja: '#3fa9ff',
  detencion: '#ffb224', plaza: '#2ee584',
};
const ZONA_ETIQUETAS = {
  prohibida: 'Zona prohibida', sensible: 'Zona sensible', caja: 'Caja',
  plaza: 'Plaza', detencion: 'Zona detención',
};
const ZONA_FUENTE_MONO = "11px 'SFMono-Regular',ui-monospace,'Cascadia Mono',Consolas,monospace";
const ZONA_PLAZA_MS = 2000;          // anti-parpadeo de plazas (ocupar/liberar)
const ZONA_MERODEO_COOLDOWN_MS = 60000;
const ZONA_COLA_COOLDOWN_MS = 120000;
const ZONA_CRUCE_FRAMES = 2;         // frames consecutivos para confirmar cruce
const ZONA_EPS = 0.0001;             // margen para el lado de la línea

let zona_conectado = false;          // idempotencia de listeners

/* --- Arranque ---------------------------------------------------------------*/
function zona_init() {
  if (!estado.zona) {
    estado.zona = {
      trazado: [],        // vértices en curso {x,y} relativos 0..1
      trazadoTipo: null,  // tipo de la zona que se está dibujando
      presencia: {},      // 'trackId|zonaId' → {dentro, desde, merodeo}
      cola: {},           // zonaId → {desde, aviso}
      plaza: {},          // zonaId → {ocupada, cand, desde}
      linea: {},          // 'trackId|lineaId' → {lado, pend, cuenta}
      cruces: {},         // lineaId → {AB, BA} (contadores del día)
      cruceDia: '',       // clave de día de los contadores
      bolsa: {},          // trackId → {desde, alertado}
      plazasLibres: 0,
      plazasTotal: 0,
    };
  }
  if (!zona_conectado) {
    if (typeof vid_registrarPintor === 'function') {
      try { vid_registrarPintor('zonas', zona_pintar, 10); }
      catch (e) { console.warn('[zona] no se pudo registrar el pintor:', e && e.message); }
    }
    zona_conectarCanvas();
    zona_conectarToolbar();
    bus.on('track:perdido', function (d) { if (d && d.track) zona_olvidarTrack(d.track.id); });
    bus.on('cfg:cambio', function (d) { if (!d || d.clave == null || d.clave === 'modo') zona_aplicarModo(); });
    zona_conectado = true;
  }
  zona_aplicarModo();
  zona_actualizarToolbar();
}

/* --- Conexión de la interfaz -----------------------------------------------*/
function zona_conectarCanvas() {
  const canvas = document.getElementById('vid-canvas');
  if (!canvas) return;                       // guarda-clause: aún sin vídeo
  if (canvas.dataset && canvas.dataset.zonaConectado === '1') return;
  canvas.addEventListener('pointerdown', zona_alTocar);
  if (canvas.dataset) canvas.dataset.zonaConectado = '1';
}
function zona_conectarToolbar() {
  zona_boton('zona-prohibida', function () { zona_iniciarDibujo('prohibida'); });
  zona_boton('zona-sensible', function () { zona_iniciarDibujo('sensible'); });
  zona_boton('zona-caja', function () { zona_iniciarDibujo('caja'); });
  zona_boton('zona-plaza', function () { zona_iniciarDibujo('plaza'); });
  zona_boton('zona-detencion', function () { zona_iniciarDibujo('detencion'); });
  zona_boton('zona-linea', function () { zona_iniciarLinea(); });
  zona_boton('zona-cerrar', function () { zona_terminarDibujo(); });
  zona_boton('zona-cancelar', function () { zona_cancelarDibujo(); });
  zona_boton('zona-borrarTodo', function () {
    // Nada de confirm() nativo: bloquea el hilo y congela la app bajo el verificador.
    if (typeof ui_confirmar === 'function') {
      ui_confirmar('¿Borrar TODAS las zonas y líneas? Esta acción no se puede deshacer.', 'Sí, borrar todo')
        .then(function (si) { if (si) zona_borrarTodo(); })
        .catch(function () {});
    } else { zona_aviso('No se pudo abrir la confirmación.'); }
  });
}
function zona_boton(id, fn) {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', fn);
}

/* Muestra/oculta botones según el modo (super / carretera). */
function zona_aplicarModo() {
  const carretera = estado.cfg.modo === 'carretera';
  const sup = document.querySelectorAll('.zona-soloSuper');
  for (let i = 0; i < sup.length; i++) sup[i].classList.toggle('oculto', carretera);
  const car = document.querySelectorAll('.zona-soloCarretera');
  for (let j = 0; j < car.length; j++) car[j].classList.toggle('oculto', !carretera);
}

/* Muestra "Cerrar/Cancelar" y la ayuda solo mientras se dibuja. */
function zona_actualizarToolbar() {
  const dibujando = !!estado.ui.dibujando;
  const cerrar = document.getElementById('zona-cerrar');
  const cancelar = document.getElementById('zona-cancelar');
  const ayuda = document.getElementById('zona-ayuda');
  if (cerrar) cerrar.classList.toggle('oculto', !dibujando);
  if (cancelar) cancelar.classList.toggle('oculto', !dibujando);
  if (ayuda) ayuda.classList.toggle('oculto', !dibujando);
}

/* Aviso al usuario: prioriza ui_toast; si no existe, banner por evento. */
function zona_aviso(msg) {
  if (typeof ui_toast === 'function') { try { ui_toast(msg, 'info'); return; } catch (e) {} }
  bus.emit('error:general', { msg: msg });
}

/* --- Dibujo táctil ----------------------------------------------------------*/
/* Convierte el tap a coordenadas RELATIVAS 0..1 del canvas (independiente de la
 * escala CSS↔px porque dividimos por el rect mostrado). */
function zona_alTocar(ev) {
  if (!estado.ui.dibujando) return;
  const canvas = document.getElementById('vid-canvas');
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) { zona_aviso('El vídeo aún no está listo para dibujar.'); return; }
  if (ev.cancelable) ev.preventDefault();
  const rx = nuc_clamp((ev.clientX - rect.left) / rect.width, 0, 1);
  const ry = nuc_clamp((ev.clientY - rect.top) / rect.height, 0, 1);
  estado.zona.trazado.push({ x: rx, y: ry });
  if (estado.ui.dibujando === 'linea' && estado.zona.trazado.length >= 2) {
    zona_terminarDibujo();   // la línea se cierra sola con 2 taps
  }
}

function zona_iniciarDibujo(tipo) {
  if (!estado.zona) zona_init();
  if (ZONA_TIPOS.indexOf(tipo) < 0) { zona_aviso('Tipo de zona no válido.'); return; }
  estado.ui.dibujando = 'zona';
  estado.zona.trazado = [];
  estado.zona.trazadoTipo = tipo;
  zona_actualizarToolbar();
  zona_aviso('Toca el vídeo para añadir puntos y pulsa "Cerrar zona" al terminar.');
}

function zona_iniciarLinea() {
  if (!estado.zona) zona_init();
  estado.ui.dibujando = 'linea';
  estado.zona.trazado = [];
  estado.zona.trazadoTipo = null;
  zona_actualizarToolbar();
  zona_aviso('Toca 2 puntos en el vídeo: inicio (A) y final (B) de la línea.');
}

function zona_terminarDibujo() {
  const modo = estado.ui.dibujando;
  if (!modo || !estado.zona) return;
  if (modo === 'linea') {
    if (estado.zona.trazado.length < 2) { zona_aviso('Una línea necesita 2 puntos: toca el inicio y el final.'); return; }
    const a = estado.zona.trazado[0], b = estado.zona.trazado[1];
    const primera = estado.lineas.length === 0;
    const linea = {
      id: nuc_uid('l'),
      nombre: primera ? 'Entrada' : ('Línea ' + (estado.lineas.length + 1)),
      a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y },
    };
    estado.lineas.push(linea);
    nuc_guardar('lineas', estado.lineas);
    zona_finDibujo();
    zona_aviso('Línea "' + linea.nombre + '" creada (sentido A→B = entrada).');
    return;
  }
  // zona (polígono)
  if (estado.zona.trazado.length < 3) { zona_aviso('Una zona necesita al menos 3 puntos. Toca más puntos en el vídeo.'); return; }
  const tipo = estado.zona.trazadoTipo || 'prohibida';
  const zona = {
    id: nuc_uid('z'),
    tipo: tipo,
    nombre: zona_nombrePorDefecto(tipo),
    puntos: estado.zona.trazado.map(function (p) { return { x: p.x, y: p.y }; }),
  };
  estado.zonas.push(zona);
  nuc_guardar('zonas', estado.zonas);
  zona_finDibujo();
  zona_aviso('Zona "' + zona.nombre + '" creada.');
}

function zona_cancelarDibujo() { zona_finDibujo(); }

function zona_finDibujo() {
  estado.ui.dibujando = null;
  if (estado.zona) { estado.zona.trazado = []; estado.zona.trazadoTipo = null; }
  zona_actualizarToolbar();
}

function zona_nombrePorDefecto(tipo) {
  const base = ZONA_ETIQUETAS[tipo] || 'Zona';
  let n = 0;
  for (let i = 0; i < estado.zonas.length; i++) if (estado.zonas[i].tipo === tipo) n++;
  return base + ' ' + (n + 1);
}

/* --- Borrado ----------------------------------------------------------------*/
function zona_borrar(id) {
  const nz = estado.zonas.length, nl = estado.lineas.length;
  estado.zonas = estado.zonas.filter(function (z) { return z.id !== id; });
  estado.lineas = estado.lineas.filter(function (l) { return l.id !== id; });
  if (estado.zonas.length !== nz) nuc_guardar('zonas', estado.zonas);
  if (estado.lineas.length !== nl) nuc_guardar('lineas', estado.lineas);
  if (estado.zona) {
    delete estado.zona.cola[id];
    delete estado.zona.plaza[id];
    delete estado.zona.cruces[id];
    zona_borrarClaves(estado.zona.presencia, id);
    zona_borrarClaves(estado.zona.linea, id);
  }
}
/* Elimina de un mapa las claves 'trackId|objetoId' cuyo objetoId coincide. */
function zona_borrarClaves(mapa, objetoId) {
  Object.keys(mapa).forEach(function (k) {
    const partes = k.split('|');
    if (partes[1] === objetoId) delete mapa[k];
  });
}

function zona_borrarTodo() {
  estado.zonas = [];
  estado.lineas = [];
  nuc_guardar('zonas', estado.zonas);
  nuc_guardar('lineas', estado.lineas);
  if (estado.zona) {
    estado.zona.presencia = {}; estado.zona.cola = {}; estado.zona.plaza = {};
    estado.zona.linea = {}; estado.zona.cruces = {}; estado.zona.bolsa = {};
    estado.zona.plazasLibres = 0; estado.zona.plazasTotal = 0;
    estado.zona.trazado = []; estado.zona.trazadoTipo = null;
  }
  estado.ui.dibujando = null;
  zona_actualizarToolbar();
  zona_aviso('Zonas y líneas borradas.');
}

/* Al perder un track: limpia sus temporizadores y cierra sus presencias. */
function zona_olvidarTrack(id) {
  if (!estado.zona) return;
  const z = estado.zona;
  const pref = id + '|';
  Object.keys(z.presencia).forEach(function (k) {
    if (k.indexOf(pref) !== 0) return;
    const reg = z.presencia[k];
    if (reg && reg.dentro) {
      const zonaId = k.slice(pref.length);
      const zona = estado.zonas.filter(function (zz) { return zz.id === zonaId; })[0];
      if (zona) bus.emit('zona:salida', { zona: zona, track: { id: id } });
    }
    delete z.presencia[k];
  });
  Object.keys(z.linea).forEach(function (k) { if (k.indexOf(pref) === 0) delete z.linea[k]; });
  if (z.bolsa[id]) delete z.bolsa[id];
}

/* --- Geometría --------------------------------------------------------------*/
/* Ray casting: ¿el punto (px,py) está dentro del polígono (px del espacio)? */
function zona_puntoEnPoligono(px, py, puntosPx) {
  if (!puntosPx || puntosPx.length < 3) return false;
  let dentro = false;
  for (let i = 0, j = puntosPx.length - 1; i < puntosPx.length; j = i++) {
    const xi = puntosPx[i].x, yi = puntosPx[i].y;
    const xj = puntosPx[j].x, yj = puntosPx[j].y;
    const cruza = ((yi > py) !== (yj > py)) &&
      (px < (xj - xi) * (py - yi) / ((yj - yi) || ZONA_EPS) + xi);
    if (cruza) dentro = !dentro;
  }
  return dentro;
}
/* Lado del punto respecto a la recta A→B por el signo del producto cruzado.
 * +1 = lado positivo, -1 = lado negativo, 0 = sobre la línea. */
function zona_lado(px, py, a, b) {
  const cr = (b.x - a.x) * (py - a.y) - (b.y - a.y) * (px - a.x);
  return cr > ZONA_EPS ? 1 : (cr < -ZONA_EPS ? -1 : 0);
}
/* ¿La persona lleva bolsa? (bolsa solapa su caja o su centroide < 0.1*w). */
function zona_hayBolsaCon(persona, bolsas, w) {
  for (let i = 0; i < bolsas.length; i++) {
    const b = bolsas[i];
    if (nuc_iou(persona.caja, b.caja) > 0) return true;
    if (nuc_dist(persona.cx, persona.cy, b.cx, b.cy) < 0.1 * w) return true;
  }
  return false;
}

/* --- Evaluación por frame (el corazón) -------------------------------------*/
function zona_evaluar(tracks, ts) {
  if (!estado.zona) return;
  ts = ts || Date.now();
  const z = estado.zona;
  const w = estado.video.w || 640, h = estado.video.h || 480;

  // reinicio de contadores diarios de cruces a medianoche
  const dia = nuc_diaClave(ts);
  if (z.cruceDia !== dia) { z.cruces = {}; z.cruceDia = dia; }

  tracks = Array.isArray(tracks) ? tracks : [];
  const personas = tracks.filter(function (t) { return t && NUC_PERSONA.indexOf(t.clase) >= 0; });
  const bolsas = tracks.filter(function (t) { return t && NUC_BOLSAS.indexOf(t.clase) >= 0; });
  const vehiculos = tracks.filter(function (t) { return t && NUC_VEHICULOS.indexOf(t.clase) >= 0; });

  // polígonos de zona en px del espacio de frame
  const zonasPx = estado.zonas.map(function (zona) {
    return { ref: zona, puntos: zona.puntos.map(function (p) { return { x: p.x * w, y: p.y * h }; }) };
  });

  // ENTRADA / SALIDA + MERODEO (por punto de pie de cada persona)
  personas.forEach(function (t) {
    zonasPx.forEach(function (zp) {
      const zona = zp.ref;
      const key = t.id + '|' + zona.id;
      const dentro = zona_puntoEnPoligono(t.pieX, t.pieY, zp.puntos);
      let reg = z.presencia[key];
      if (dentro) {
        if (!reg || !reg.dentro) {
          const conBolsa = zona_hayBolsaCon(t, bolsas, w);
          z.presencia[key] = { dentro: true, desde: ts, merodeo: 0 };
          reg = z.presencia[key];
          bus.emit('zona:entrada', { zona: zona, track: t, conBolsa: conBolsa });
        }
        const seg = (ts - reg.desde) / 1000;
        if (seg >= (estado.cfg.merodeoSeg || 30) && (!reg.merodeo || (ts - reg.merodeo) >= ZONA_MERODEO_COOLDOWN_MS)) {
          reg.merodeo = ts;
          bus.emit('zona:merodeo', { zona: zona, track: t, seg: Math.round(seg) });
        }
      } else if (reg && reg.dentro) {
        reg.dentro = false;
        bus.emit('zona:salida', { zona: zona, track: t });
      }
    });
  });

  // COLA en zonas 'caja'
  zonasPx.forEach(function (zp) {
    if (zp.ref.tipo !== 'caja') return;
    const zona = zp.ref;
    let n = 0;
    personas.forEach(function (t) { if (zona_puntoEnPoligono(t.pieX, t.pieY, zp.puntos)) n++; });
    let c = z.cola[zona.id] || { desde: null, aviso: 0 };
    if (n >= (estado.cfg.colaN || 4)) {
      if (!c.desde) c.desde = ts;
      const seg = (ts - c.desde) / 1000;
      if (seg >= (estado.cfg.colaSeg || 45) && (!c.aviso || (ts - c.aviso) >= ZONA_COLA_COOLDOWN_MS)) {
        c.aviso = ts;
        bus.emit('zona:cola', { zona: zona, n: n, seg: Math.round(seg) });
      }
    } else {
      c.desde = null;
    }
    z.cola[zona.id] = c;
  });

  // PLAZAS de parking (ocupada si un vehículo tiene su CENTRO dentro ≥2s)
  zonasPx.forEach(function (zp) {
    if (zp.ref.tipo !== 'plaza') return;
    const zona = zp.ref;
    let ocupadaAhora = false;
    for (let i = 0; i < vehiculos.length; i++) {
      if (zona_puntoEnPoligono(vehiculos[i].cx, vehiculos[i].cy, zp.puntos)) { ocupadaAhora = true; break; }
    }
    let p = z.plaza[zona.id];
    if (!p) { p = { ocupada: false, cand: null, desde: 0 }; z.plaza[zona.id] = p; }
    if (ocupadaAhora === p.ocupada) {
      p.cand = null;                                   // estado estable
    } else if (p.cand === ocupadaAhora) {
      if ((ts - p.desde) >= ZONA_PLAZA_MS) { p.ocupada = ocupadaAhora; p.cand = null; }
    } else {
      p.cand = ocupadaAhora; p.desde = ts;             // nuevo candidato, arranca el reloj
    }
  });
  const pl = zona_plazas();
  if (pl.libres !== z.plazasLibres || pl.total !== z.plazasTotal) {
    z.plazasLibres = pl.libres; z.plazasTotal = pl.total;
    bus.emit('plaza:cambio', { libres: pl.libres, total: pl.total });
  }

  // CRUCES DE LÍNEA con anti-jitter (personas + vehículos, por punto de pie)
  const lineasPx = estado.lineas.map(function (l) {
    return { ref: l, a: { x: l.a.x * w, y: l.a.y * h }, b: { x: l.b.x * w, y: l.b.y * h } };
  });
  const cruzables = personas.concat(vehiculos);
  cruzables.forEach(function (t) {
    lineasPx.forEach(function (lp) {
      const linea = lp.ref;
      const key = t.id + '|' + linea.id;
      const lado = zona_lado(t.pieX, t.pieY, lp.a, lp.b);
      let reg = z.linea[key];
      if (!reg) { z.linea[key] = { lado: lado, pend: 0, cuenta: 0 }; return; }
      if (lado === 0 || lado === reg.lado) {
        reg.pend = 0; reg.cuenta = 0;
        if (lado !== 0) reg.lado = lado;
        return;
      }
      // lado distinto al confirmado: exige mantenerlo ZONA_CRUCE_FRAMES frames
      if (reg.pend === lado) reg.cuenta++;
      else { reg.pend = lado; reg.cuenta = 1; }
      if (reg.cuenta >= ZONA_CRUCE_FRAMES) {
        const sentido = (lado > 0) ? 'AB' : 'BA';      // AB = cruce hacia el lado positivo de A→B
        reg.lado = lado; reg.pend = 0; reg.cuenta = 0;
        const c = z.cruces[linea.id] || { AB: 0, BA: 0 };
        c[sentido]++; z.cruces[linea.id] = c;
        bus.emit('linea:cruce', { linea: linea, track: t, sentido: sentido });
      }
    });
  });

  // OBJETO ABANDONADO (bolsa sin persona cerca durante todo el tiempo)
  const umbral = (estado.cfg.abandonoDistRel || 0.18) * w;
  bolsas.forEach(function (t) {
    let distMin = Infinity;
    personas.forEach(function (p) {
      const d = nuc_dist(t.cx, t.cy, p.cx, p.cy);
      if (d < distMin) distMin = d;
    });
    let b = z.bolsa[t.id];
    if (distMin > umbral) {
      if (!b) { b = { desde: ts, alertado: false }; z.bolsa[t.id] = b; }
      const seg = (ts - b.desde) / 1000;
      if (!b.alertado && seg >= (estado.cfg.abandonoSeg || 30)) {
        b.alertado = true;                             // una sola vez por track
        bus.emit('objeto:abandonado', { track: t, seg: Math.round(seg) });
      }
    } else if (!b) {
      z.bolsa[t.id] = { desde: ts, alertado: false };
    } else {
      b.desde = ts;                                    // dueño cerca: reinicia el reloj (conserva 'alertado')
    }
  });
}

/* Recuento de plazas de parking a partir del estado confirmado. */
function zona_plazas() {
  let total = 0, libres = 0;
  for (let i = 0; i < estado.zonas.length; i++) {
    const zona = estado.zonas[i];
    if (zona.tipo !== 'plaza') continue;
    total++;
    const p = estado.zona && estado.zona.plaza[zona.id];
    if (!p || !p.ocupada) libres++;
  }
  return { libres: libres, total: total };
}

/* --- Pintado sobre el canvas compuesto -------------------------------------*/
function zona_pintar(ctx) {
  if (!ctx || !ctx.canvas) return;
  const W = ctx.canvas.width, H = ctx.canvas.height;
  if (!W || !H) return;
  ctx.save();
  ctx.lineJoin = 'round';
  // zonas
  estado.zonas.forEach(function (zona) {
    const pts = zona.puntos.map(function (p) { return { x: p.x * W, y: p.y * H }; });
    if (pts.length < 2) return;
    const col = zona_colorZona(zona);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.fillStyle = zona_conAlfa(col, 0.18);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = col;
    ctx.stroke();
    zona_texto(ctx, zona.nombre, pts[0].x + 4, pts[0].y + 13, col);
  });
  // líneas
  estado.lineas.forEach(function (linea) {
    zona_pintarLinea(ctx, linea, { x: linea.a.x * W, y: linea.a.y * H }, { x: linea.b.x * W, y: linea.b.y * H });
  });
  // trazado en curso
  if (estado.ui.dibujando && estado.zona && estado.zona.trazado.length) zona_pintarTrazado(ctx, W, H);
  ctx.restore();
}

function zona_colorZona(zona) {
  if (zona.tipo === 'plaza') {
    const p = estado.zona && estado.zona.plaza[zona.id];
    return (p && p.ocupada) ? ZONA_COLORES.prohibida : ZONA_COLORES.plaza;
  }
  return ZONA_COLORES[zona.tipo] || ZONA_COLORES.caja;
}

function zona_pintarLinea(ctx, linea, a, b) {
  ctx.save();
  ctx.strokeStyle = ZONA_COLORES.caja;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  // flecha A→B en el extremo B
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  const fl = 11;
  ctx.beginPath();
  ctx.moveTo(b.x, b.y);
  ctx.lineTo(b.x - fl * Math.cos(ang - 0.4), b.y - fl * Math.sin(ang - 0.4));
  ctx.moveTo(b.x, b.y);
  ctx.lineTo(b.x - fl * Math.cos(ang + 0.4), b.y - fl * Math.sin(ang + 0.4));
  ctx.stroke();
  zona_texto(ctx, 'A', a.x - 12, a.y - 3, '#7d8fa0');
  zona_texto(ctx, 'B', b.x + 6, b.y - 3, '#7d8fa0');
  // contadores del día junto al centro de la línea
  const c = (estado.zona && estado.zona.cruces[linea.id]) || { AB: 0, BA: 0 };
  zona_texto(ctx, linea.nombre + '  AB ' + c.AB + ' · BA ' + c.BA, (a.x + b.x) / 2 + 6, (a.y + b.y) / 2 - 6, ZONA_COLORES.caja);
  ctx.restore();
}

function zona_pintarTrazado(ctx, W, H) {
  const pts = estado.zona.trazado.map(function (p) { return { x: p.x * W, y: p.y * H }; });
  ctx.save();
  ctx.setLineDash([6, 5]);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  if (pts.length > 1) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  pts.forEach(function (p, i) {
    ctx.beginPath();
    ctx.fillStyle = ZONA_COLORES.caja;
    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
    ctx.fill();
    zona_texto(ctx, String(i + 1), p.x + 7, p.y - 6, '#ffffff');
  });
  ctx.restore();
}

/* Texto pequeño en mono con fondo negro semitransparente para legibilidad. */
function zona_texto(ctx, txt, x, y, color) {
  ctx.font = ZONA_FUENTE_MONO;
  ctx.textBaseline = 'alphabetic';
  const an = ctx.measureText(txt).width;
  ctx.fillStyle = 'rgba(0,0,0,.55)';
  ctx.fillRect(x - 2, y - 11, an + 4, 14);
  ctx.fillStyle = color || '#cfdae4';
  ctx.fillText(txt, x, y);
}

/* Convierte '#rrggbb' + alfa a 'rgba(...)'. */
function zona_conAlfa(hex, a) {
  const h = String(hex).replace('#', '');
  const r = parseInt(h.substring(0, 2), 16) || 0;
  const g = parseInt(h.substring(2, 4), 16) || 0;
  const b = parseInt(h.substring(4, 6), 16) || 0;
  return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
}

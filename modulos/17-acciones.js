/* ============================================================================
 * 17-ACCIONES — VIGÍA IA · acciones/secuencias avanzadas de comportamiento.
 * Prefijo: acc_ / ACC_. Estado interno en estado.acc.
 *
 * Construye SOBRE lo que ya existe (tracks, poses, zonas, líneas, alertas):
 *   1. MOCHILA/BOLSO: coger del estante → mano hacia una mochila/bolso
 *      detectado → "gesto de ocultación en bolsa — revisar".
 *   2. SECUENCIA SALIDA: alguien con gesto de ocultación reciente cruza la
 *      línea hacia FUERA o echa a correr → "se dirige a la salida, revisar YA".
 *   3. AGACHARSE: la caja de una persona se encoge de golpe y se mantiene
 *      (típico de esconder a ras de suelo) → aviso.
 *   4. CONTRASENTIDO: entrar por la línea de SALIDA (la 2ª línea dibujada).
 *   5. AGLOMERACIÓN: ≥3 personas muy juntas con movimiento brusco → revisar.
 *   6. COLARSE (tailgating): dos personas cruzan la entrada casi pegadas.
 *   7. BOTÓN 👎 "FALSA": en cada alerta del feed; lleva estadística por tipo
 *      y SUGIERE el ajuste concreto cuando un tipo falla mucho.
 *
 * HONESTIDAD: todo son "señales para revisión humana". Nada de "robo", nada
 * de "pelea confirmada": la cámara sugiere, la persona decide.
 * ==========================================================================*/

/* --- Parámetros ------------------------------------------------------------*/
const ACC_BOLSA_MARGEN = 1.35;        // la caja de la bolsa se amplía ×1.35 para "mano en bolsa"
const ACC_BOLSA_COOLDOWN_MS = 30000;  // anti-spam por track
const ACC_SALIDA_VENTANA_MS = 180000; // ocultación válida 3 min para la secuencia de salida
const ACC_AGACHADO_FACTOR = 0.62;     // altura cae por debajo del 62% de su altura normal
const ACC_AGACHADO_MS = 1000;         // sostenido ≥1s
const ACC_AGACHADO_COOLDOWN_MS = 60000;
const ACC_AGLO_N = 3;                 // personas mínimas juntas
const ACC_AGLO_RADIO_REL = 0.15;      // radio de "muy juntas" (fracción del ancho)
const ACC_AGLO_VEL_REL = 0.08;        // movimiento brusco: vel > 8% del ancho/s
const ACC_AGLO_MS = 2000;             // sostenido ≥2s
const ACC_AGLO_COOLDOWN_MS = 120000;
const ACC_COLARSE_MS = 1200;          // 2 cruces de entrada en <1.2s = pegados

function acc_estado() {
  if (!estado.acc) {
    estado.acc = {
      inited: false,
      bolsaCooldown: {},      // trackId -> ts último aviso
      bolsaDesde: {},         // trackId -> ts en que la mano entró en la bolsa
      ocultadores: {},        // trackId -> ts de su última ocultación (p/ secuencia salida)
      salidaAvisada: {},      // trackId -> true (una vez)
      alturaRef: {},          // trackId -> altura mediana móvil de su caja
      agachadoDesde: {},      // trackId -> ts
      agachadoUltimo: {},     // trackId -> ts último aviso
      agloDesde: 0, agloUltimo: 0,
      ultimoCruceEntrada: 0,  // ts del último cruce AB de la línea 1 (colarse)
      falsas: nuc_cargar('acc_falsas', {}),   // tipo -> {total, falsas}
      sugerido: {},           // tipo -> true (sugerencia ya mostrada)
      observador: null,
    };
  }
  return estado.acc;
}

/* ---------------------------------------------------------------------------
 * INIT
 * -------------------------------------------------------------------------*/
function acc_init() {
  const a = acc_estado();
  if (a.inited) return;
  a.inited = true;

  bus.on('frame', acc_alFrame);
  bus.on('alerta', acc_alAlerta);
  bus.on('linea:cruce', acc_alCruce);
  bus.on('track:perdido', (d) => {
    if (!d || !d.track) return;
    const id = d.track.id;
    delete a.bolsaCooldown[id]; delete a.bolsaDesde[id];
    delete a.alturaRef[id]; delete a.agachadoDesde[id]; delete a.agachadoUltimo[id];
    // ocultadores NO se borra: la secuencia de salida puede necesitarlo un rato
  });

  acc_botonFalsaInit();
}

/* Disparo centralizado (typeof-check, como hace el copiloto). */
function acc_avisar(tipo, nivel, texto, datos) {
  if (typeof alerta_disparar === 'function') {
    try { return alerta_disparar(tipo, nivel, texto, datos || {}); } catch (e) {}
  }
  return null;
}

/* ---------------------------------------------------------------------------
 * POR FRAME: mochila/bolso, agacharse, aglomeración (solo modo super)
 * -------------------------------------------------------------------------*/
function acc_alFrame(datos) {
  const a = estado.acc;
  if (!a || estado.cfg.modo !== 'super') return;
  const ts = (datos && datos.ts) || Date.now();
  const tracks = estado.tracks || [];
  const w = estado.video.w || 640;
  try {
    if (estado.cfg.accMochila) acc_evalMochila(tracks, ts, w);
    if (estado.cfg.accAgachado) acc_evalAgachado(tracks, ts);
    if (estado.cfg.accAglomeracion) acc_evalAglomeracion(tracks, ts, w);
  } catch (e) { console.warn('[acciones] fallo evaluando:', e && e.message); }
}

/* 1) MOCHILA/BOLSO: persona en fase de alcance reciente cuya MUÑECA entra en
 * la caja (ampliada) de una mochila/bolso detectado y permanece un poco. */
function acc_evalMochila(tracks, ts, w) {
  const a = estado.acc;
  const g = estado.gesto;
  if (!g || !g.poses || !g.poses.length) return;
  const bolsas = tracks.filter((t) => t && NUC_BOLSAS.indexOf(t.clase) >= 0);
  if (!bolsas.length) return;
  const permanenciaMs = nuc_clamp((estado.cfg.ocultacionPermanencia || 0.7) * 1000, 200, 2000);

  for (let i = 0; i < g.poses.length; i++) {
    const pose = g.poses[i];
    if (!pose || pose.trackId == null) continue;
    const id = pose.trackId;
    if (ts - (a.bolsaCooldown[id] || 0) < ACC_BOLSA_COOLDOWN_MS) continue;

    // Debe venir de ALCANZAR (cogió algo hace poco): fase de la máquina de
    // ocultación en 'alcanzado' u 'ocultando' recientes.
    const m = g.maquinas && g.maquinas[id];
    const alcanzoHacePoco = m && (m.fase === 'alcanzado' || m.fase === 'ocultando')
      && (ts - (m.tAlcance || 0)) < 5000;
    if (!alcanzoHacePoco) { delete a.bolsaDesde[id]; continue; }

    const munecas = [pose.puntos[15], pose.puntos[16]].filter((p) => p && (p.v == null || p.v >= 0.3));
    if (!munecas.length) continue;

    let dentro = false;
    for (let b = 0; b < bolsas.length && !dentro; b++) {
      const c = bolsas[b].caja;
      const mx = c.an * (ACC_BOLSA_MARGEN - 1) / 2, my = c.al * (ACC_BOLSA_MARGEN - 1) / 2;
      for (let k = 0; k < munecas.length && !dentro; k++) {
        const p = munecas[k];
        if (p.x >= c.x - mx && p.x <= c.x + c.an + mx &&
            p.y >= c.y - my && p.y <= c.y + c.al + my) dentro = true;
      }
    }

    if (dentro) {
      if (!a.bolsaDesde[id]) a.bolsaDesde[id] = ts;
      else if (ts - a.bolsaDesde[id] >= permanenciaMs) {
        a.bolsaCooldown[id] = ts; a.bolsaDesde[id] = 0;
        a.ocultadores[id] = ts;                 // cuenta para la secuencia de salida
        acc_avisar('ocultacion_bolsa', 'sospecha',
          'Gesto de ocultación en mochila/bolso tras coger — revisar. Nunca acuses solo por esta alerta.',
          { trackId: id });
      }
    } else {
      a.bolsaDesde[id] = 0;
    }
  }
}

/* 3) AGACHARSE: la altura de la caja cae por debajo del 62% de su altura
 * habitual (mediana móvil) manteniendo o ganando anchura, sostenido ≥1s. */
function acc_evalAgachado(tracks, ts) {
  const a = estado.acc;
  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i];
    if (!t || t.clase !== 'person' || !t.caja) continue;
    const id = t.id, alt = t.caja.al;
    const ref = a.alturaRef[id];
    if (ref == null) { a.alturaRef[id] = alt; continue; }

    const agachado = alt < ref * ACC_AGACHADO_FACTOR && t.caja.an >= 0; // ancho no importa tanto
    if (agachado) {
      if (!a.agachadoDesde[id]) a.agachadoDesde[id] = ts;
      else if (ts - a.agachadoDesde[id] >= ACC_AGACHADO_MS &&
               ts - (a.agachadoUltimo[id] || 0) >= ACC_AGACHADO_COOLDOWN_MS) {
        a.agachadoUltimo[id] = ts; a.agachadoDesde[id] = 0;
        acc_avisar('agachado', 'sospecha', 'Persona agachada junto al estante — revisar', { trackId: id });
      }
      // OJO: mientras está agachado NO actualizamos la referencia (se sesgaría)
    } else {
      a.agachadoDesde[id] = 0;
      a.alturaRef[id] = ref * 0.9 + alt * 0.1;   // mediana móvil suave de su altura normal
    }
  }
}

/* 5) AGLOMERACIÓN: ≥3 personas dentro de un radio pequeño y al menos 2 con
 * movimiento brusco, sostenido ≥2s → "grupo con movimiento brusco". */
function acc_evalAglomeracion(tracks, ts, w) {
  const a = estado.acc;
  const personas = tracks.filter((t) => t && t.clase === 'person');
  if (personas.length < ACC_AGLO_N) { a.agloDesde = 0; return; }
  const radio = ACC_AGLO_RADIO_REL * w;
  const velMin = ACC_AGLO_VEL_REL * w;

  let grupo = null;
  for (let i = 0; i < personas.length && !grupo; i++) {
    const cerca = [personas[i]];
    for (let j = 0; j < personas.length; j++) {
      if (i === j) continue;
      if (nuc_dist(personas[i].cx, personas[i].cy, personas[j].cx, personas[j].cy) < radio) cerca.push(personas[j]);
    }
    if (cerca.length >= ACC_AGLO_N) {
      const bruscos = cerca.filter((t) => (t.vel || 0) > velMin).length;
      if (bruscos >= 2) grupo = cerca;
    }
  }

  if (grupo) {
    if (!a.agloDesde) a.agloDesde = ts;
    else if (ts - a.agloDesde >= ACC_AGLO_MS && ts - a.agloUltimo >= ACC_AGLO_COOLDOWN_MS) {
      a.agloUltimo = ts; a.agloDesde = 0;
      acc_avisar('aglomeracion', 'sospecha',
        'Grupo de personas con movimiento brusco — revisar (posible incidente)', {});
    }
  } else {
    a.agloDesde = 0;
  }
}

/* ---------------------------------------------------------------------------
 * EVENTOS: secuencia de salida, contrasentido, colarse
 * -------------------------------------------------------------------------*/

/* Memoriza a los "ocultadores" recientes (bolsillo o bolsa) para la secuencia. */
function acc_alAlerta(datos) {
  const a = estado.acc;
  if (!a || !datos || !datos.registro) return;
  const r = datos.registro;
  acc_contarAlerta(r.tipo);
  if ((r.tipo === 'ocultacion' || r.tipo === 'ocultacion_bolsa') && r.trackId != null) {
    a.ocultadores[r.trackId] = r.ts || Date.now();
    delete a.salidaAvisada[r.trackId];
  }
  // 2b) ocultación reciente + echar a correr → mismo aviso reforzado
  if (estado.cfg.accSecuenciaSalida && r.tipo === 'carrera' && r.trackId != null) {
    acc_secuenciaSalida(r.trackId, 'corre');
  }
}

function acc_alCruce(datos) {
  const a = estado.acc;
  if (!a || !datos || !datos.track || estado.cfg.modo !== 'super') return;
  const track = datos.track, sentido = datos.sentido;
  if (track.clase !== 'person') return;
  const lineas = estado.lineas || [];
  const esLinea1 = lineas.length && datos.linea && lineas[0] && datos.linea.id === lineas[0].id;
  const esLinea2 = lineas.length > 1 && datos.linea && lineas[1] && datos.linea.id === lineas[1].id;
  const ts = Date.now();

  // 2) SECUENCIA SALIDA: un ocultador reciente cruza hacia FUERA (BA en la entrada)
  if (estado.cfg.accSecuenciaSalida && esLinea1 && sentido === 'BA') {
    acc_secuenciaSalida(track.id, 'salida');
  }

  // 4) CONTRASENTIDO: entrar por la línea de SALIDA (la 2ª dibujada, sentido AB)
  if (estado.cfg.accContrasentido && esLinea2 && sentido === 'AB') {
    acc_avisar('contrasentido', 'sospecha',
      'Persona entrando por la SALIDA (sentido contrario)', { trackId: track.id });
  }

  // 6) COLARSE: dos entradas (AB por línea 1) casi pegadas
  if (estado.cfg.accColarse && esLinea1 && sentido === 'AB') {
    if (a.ultimoCruceEntrada && (ts - a.ultimoCruceEntrada) < ACC_COLARSE_MS) {
      acc_avisar('colarse', 'sospecha',
        'Dos personas han entrado casi pegadas (posible colado)', { trackId: track.id });
    }
    a.ultimoCruceEntrada = ts;
  }
}

/* Aviso reforzado de la secuencia completa (una vez por ocultador). */
function acc_secuenciaSalida(trackId, via) {
  const a = estado.acc;
  const ts = Date.now();
  const tOcul = a.ocultadores[trackId];
  if (!tOcul || ts - tOcul > ACC_SALIDA_VENTANA_MS) return;
  if (a.salidaAvisada[trackId]) return;
  a.salidaAvisada[trackId] = true;
  const detalle = via === 'corre' ? 'echa a CORRER' : 'se dirige a la SALIDA';
  acc_avisar('ocultacion_salida', 'critico',
    '⚠ Persona con gesto de ocultación reciente ' + detalle + ' — revisar YA', { trackId: trackId });
}

/* ---------------------------------------------------------------------------
 * 7) BOTÓN 👎 "FALSA" + estadística y sugerencias de ajuste
 * -------------------------------------------------------------------------*/
function acc_contarAlerta(tipo) {
  const a = estado.acc;
  if (!tipo || tipo === 'prueba') return;
  const f = a.falsas[tipo] || (a.falsas[tipo] = { total: 0, falsas: 0 });
  f.total++;
  nuc_guardar('acc_falsas', a.falsas);
}

function acc_marcarFalsa(tipo) {
  const a = estado.acc;
  if (!tipo) return;
  const f = a.falsas[tipo] || (a.falsas[tipo] = { total: 1, falsas: 0 });
  f.falsas++;
  nuc_guardar('acc_falsas', a.falsas);
  if (typeof ui_toast === 'function') { try { ui_toast('Anotada como falsa alarma. Gracias: esto afina el sistema.', 'info'); } catch (e) {} }
  acc_sugerir(tipo, f);
}

/* Con ≥5 alertas de un tipo y ≥70% falsas, sugiere el ajuste CONCRETO. */
const ACC_SUGERENCIAS = {
  carrera: 'Muchas falsas de "corriendo": sube el umbral de carrera en Ajustes → Gestos (p.ej. de 2,2 a 2,8).',
  ocultacion: 'Muchas falsas de ocultación: sube el umbral de gesto, sube la permanencia a 0,8-1s, o activa "solo estantería" y dibuja zonas sensibles.',
  ocultacion_bolsa: 'Muchas falsas de bolsa: sube la permanencia de la mano en Ajustes → Gestos.',
  merodeo: 'Muchas falsas de merodeo: sube los segundos de merodeo en Ajustes → Aforo y zonas.',
  agachado: 'Muchas falsas de agacharse: desactívalo en Ajustes → Acciones si en tu local es normal agacharse (estantes bajos).',
  aglomeracion: 'Muchas falsas de aglomeración: desactívala si tu local suele tener grupos (familias, colas).',
  sabotaje: 'Muchas falsas de sabotaje: baja la sensibilidad en Ajustes → Sistema, o elige "Cámara MÓVIL" si tu cámara se mueve.',
  colarse: 'Muchas falsas de colado: es normal en puertas anchas donde entra gente en grupo; desactívalo en Acciones.',
  caida: 'Muchas falsas de caída: sube los segundos de caída en Ajustes → Gestos.',
};
function acc_sugerir(tipo, f) {
  const a = estado.acc;
  if (a.sugerido[tipo]) return;
  if (f.total >= 5 && f.falsas / f.total >= 0.7 && ACC_SUGERENCIAS[tipo]) {
    a.sugerido[tipo] = true;
    if (typeof ui_error === 'function') { try { ui_error('💡 ' + ACC_SUGERENCIAS[tipo]); } catch (e) {} }
  }
}

/* Inyecta el botón 👎 en cada alerta nueva del feed (sin tocar el módulo UI:
 * un MutationObserver vigila #ui-feedAlertas y decora los <li> que aparecen). */
function acc_botonFalsaInit() {
  const a = estado.acc;
  const feed = document.getElementById('ui-feedAlertas');
  if (!feed || typeof MutationObserver === 'undefined') return;
  const decorar = (li) => {
    try {
      if (!li || li.nodeType !== 1 || li.dataset.accFalsa || li.id === 'ui-feedVacio') return;
      li.dataset.accFalsa = '1';
      const tipo = li.dataset.tipo || (li.getAttribute && li.getAttribute('data-tipo')) || '';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-mini btn-fantasma';
      btn.textContent = '👎 falsa';
      btn.title = 'Marcar como falsa alarma (afina las sugerencias de ajuste)';
      btn.style.cssText = 'margin-left:6px;font-size:.72rem;padding:2px 6px;';
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        acc_marcarFalsa(tipo || acc_tipoDesdeTexto(li.textContent || ''));
        btn.disabled = true; btn.textContent = '✓ anotada';
      });
      li.appendChild(btn);
    } catch (e) { /* decorar jamás rompe el feed */ }
  };
  a.observador = new MutationObserver((muts) => {
    for (let i = 0; i < muts.length; i++) {
      const añadidos = muts[i].addedNodes || [];
      for (let j = 0; j < añadidos.length; j++) decorar(añadidos[j]);
    }
  });
  a.observador.observe(feed, { childList: true });
}

/* Respaldo: deducir el tipo desde el texto del feed si el <li> no lo trae. */
function acc_tipoDesdeTexto(txt) {
  txt = (txt || '').toLowerCase();
  if (txt.indexOf('ocultación en mochila') >= 0 || txt.indexOf('bolso') >= 0) return 'ocultacion_bolsa';
  if (txt.indexOf('ocultación') >= 0) return 'ocultacion';
  if (txt.indexOf('corriendo') >= 0 || txt.indexOf('carrera') >= 0) return 'carrera';
  if (txt.indexOf('merodeo') >= 0) return 'merodeo';
  if (txt.indexOf('agachada') >= 0) return 'agachado';
  if (txt.indexOf('grupo') >= 0) return 'aglomeracion';
  if (txt.indexOf('sabotaje') >= 0 || txt.indexOf('tapada') >= 0) return 'sabotaje';
  if (txt.indexOf('pegadas') >= 0) return 'colarse';
  if (txt.indexOf('caída') >= 0 || txt.indexOf('caida') >= 0) return 'caida';
  return 'otro';
}

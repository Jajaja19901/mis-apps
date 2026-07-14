/* ============================================================================
 * 23-PELIGRO — VIGÍA IA · aviso de POSIBLE objeto peligroso (cuchillo, palo/bate)
 * con el modelo general que ya lleva la app. Prefijo: pel_. Estado en estado.pel.
 *
 * HONESTIDAD (obligatoria):
 *  · El modelo general NO detecta armas de fuego (pistolas): no están en lo que
 *    aprendió. Solo reconoce objetos como «cuchillo» y «bate/palo».
 *  · Da falsos positivos (confunde objetos alargados). Por eso el aviso dice
 *    «posible objeto peligroso — revisar», NUNCA «arma» ni acusa a nadie.
 *  · Es una capa extra para revisión humana, no un detector de armas certificado.
 *
 * SEGURIDAD: seguro sin vídeo ni modelos (guarda-clauses). Solo lee las
 * detecciones del frame; no toca la cámara ni graba por su cuenta (la grabación
 * la decide el módulo de alertas al dispararse la alerta).
 * ==========================================================================*/

const PEL_COOLDOWN_MS = 20000;   // no repetir el mismo tipo de objeto en 20 s
const PEL_SCORE_MIN = 0.62;      // confianza mínima ALTA a propósito: a 0.4 el detector llamaba "cuchillo" a botellas/objetos alargados y saltaba basura. Mejor perder un cuchillo dudoso que inventarlos. Un cuchillo claro supera 0.62.
const PEL_CERCA_REL = 0.35;      // objeto a <35% del ancho junto a una persona = más peligroso

function pel_init() {
  if (estado.pel && estado.pel.inited) return;
  estado.pel = { inited: false, ult: {} };
  if (typeof bus !== 'undefined' && bus.on) bus.on('frame', pel_vigilar);
  estado.pel.inited = true;
}

/* Revisa las detecciones del último frame en busca de objetos peligrosos. */
function pel_vigilar() {
  try {
    if (!estado.pel || !estado.cfg.peligroAviso) return;
    // Solo en vigilancia de escena (comercio/casa usan el perfil «super»);
    // en carretera/copiloto no tiene sentido (y evita falsos con el tráfico).
    if (estado.cfg.modo !== 'super') return;
    const dets = estado.detecciones || [];
    if (!dets.length) return;
    const w = estado.video.w || 640;
    const personas = dets.filter(function (d) { return d && d.caja && NUC_PERSONA.indexOf(d.clase) >= 0; });
    const ahora = Date.now();

    for (let i = 0; i < dets.length; i++) {
      const d = dets[i];
      if (!d || !d.caja || NUC_PELIGRO.indexOf(d.clase) < 0) continue;
      if ((d.score || 0) < PEL_SCORE_MIN) continue;
      if (estado.pel.ult[d.clase] && ahora - estado.pel.ult[d.clase] < PEL_COOLDOWN_MS) continue;
      estado.pel.ult[d.clase] = ahora;

      // ¿Está junto a una persona? (empuñado → más grave que un objeto suelto).
      const cx = d.caja.x + d.caja.an / 2, cy = d.caja.y + d.caja.al / 2;
      let cerca = false;
      for (let j = 0; j < personas.length; j++) {
        const p = personas[j].caja;
        const px = p.x + p.an / 2, py = p.y + p.al / 2;
        if (nuc_dist(cx, cy, px, py) < PEL_CERCA_REL * w) { cerca = true; break; }
      }
      const nombre = (typeof nuc_claseES === 'function') ? nuc_claseES(d.clase) : d.clase;
      const nivel = cerca ? 'critico' : 'sospecha';
      const texto = '⚠️ Posible objeto peligroso (' + nombre + ')' +
        (cerca ? ' junto a una persona' : '') +
        ' — revisar. Es orientativo: no acuses a nadie solo por esta alerta.';
      if (typeof alerta_disparar === 'function') {
        try { alerta_disparar('peligro', nivel, texto, {}); } catch (e) {}
      }
    }
  } catch (e) { console.warn('[peligro] ' + (e && e.message)); }
}

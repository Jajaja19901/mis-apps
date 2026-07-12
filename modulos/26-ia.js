/* ============================================================================
 * 26-IA — Confirmación de alertas con IA de VISIÓN (Claude · Anthropic).
 * Prefijo: ia_ / IA_.
 *
 * QUÉ HACE: cuando salta una alerta CON foto (robo, ocultación, peligro…), le
 * manda ESA foto a Claude y devuelve un veredicto que "entiende" la escena:
 * ¿es un incidente real o una falsa alarma? + una descripción en 1 frase. Lo
 * enseña en la app y lo manda a Telegram.
 *
 * QUÉ NO HACE: NO analiza el vídeo en vivo (eso lo hace YOLO en el móvil, que es
 * instantáneo y gratis). La IA de la nube tarda ~1 s y cuesta céntimos por foto,
 * así que se usa SOLO para CONFIRMAR alertas — que es donde de verdad ayuda.
 *
 * PRIVACIDAD (honesto): con esto ACTIVADO, la foto de cada alerta SALE a la API
 * de Anthropic para analizarla. Va apagado por defecto; solo funciona si el
 * dueño pega SU clave (cfg.iaApiKey) y enciende cfg.iaConfirmar.
 * ==========================================================================*/
const IA_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const IA_VERSION = '2023-06-01';
const IA_MODELO_DEF = 'claude-haiku-4-5-20251001';   // rápido y barato para confirmar; se puede subir a Sonnet
let ia_ocupada = false;

/* ¿Está la confirmación por IA lista para usarse? (encendida + con clave). */
function ia_activa() {
  return !!(estado.cfg && estado.cfg.iaConfirmar && estado.cfg.iaApiKey);
}

/* Manda la foto de una alerta a Claude y devuelve {real, descripcion, confianza}.
 * No lanza nunca: ante cualquier fallo devuelve null y avisa suave. */
async function ia_confirmarAlerta(fotoDataURL, tipo, texto) {
  if (!ia_activa() || !fotoDataURL || ia_ocupada) return null;
  const m = String(fotoDataURL).match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
  if (!m) return null;
  const mediaType = m[1], b64 = m[2];
  ia_ocupada = true;
  try {
    const prompt =
      'Eres un analista de una cámara de videovigilancia. La app ha lanzado una ' +
      'alerta automática de tipo "' + (tipo || '?') + '"' + (texto ? ' (' + texto + ')' : '') + '. ' +
      'Mira SOLO la imagen y responde ÚNICAMENTE con un JSON válido, sin texto extra:\n' +
      '{"real": true|false, "descripcion": "qué se ve, en una frase corta", "confianza": 0-100}\n' +
      '"real" = true si en la imagen se aprecia un incidente coherente con la alerta ' +
      '(robo, ocultar un objeto, forcejeo, objeto peligroso, persona donde no debe). ' +
      '"real" = false si parece una falsa alarma (nadie, gesto inocente, mascota, sombra). ' +
      'Nunca acuses a una persona concreta; describe conductas, no identidades.';
    const cuerpo = {
      model: estado.cfg.iaModelo || IA_MODELO_DEF,
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } },
          { type: 'text', text: prompt },
        ],
      }],
    };
    const r = await fetch(IA_ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': estado.cfg.iaApiKey,
        'anthropic-version': IA_VERSION,
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(cuerpo),
    });
    if (!r || !r.ok) {
      const cod = r ? r.status : 0;
      const msg = cod === 401 ? 'la clave de IA no es válida' :
        (cod === 429 ? 'IA saturada (límite de uso), reintenta luego' :
          (cod === 400 ? 'la IA rechazó la petición' : ('IA: error ' + cod)));
      ia_toast('🧠 ' + msg, 'sospecha');
      return null;
    }
    const data = await r.json();
    const txt = (data && data.content && data.content[0] && data.content[0].text) || '';
    let v = null;
    try {
      const trozo = txt.match(/\{[\s\S]*\}/);
      v = trozo ? JSON.parse(trozo[0]) : null;
    } catch (e) { v = null; }
    if (!v) v = { real: null, descripcion: String(txt).slice(0, 120), confianza: null };
    ia_mostrar(v);
    return v;
  } catch (e) {
    ia_toast('🧠 No se pudo consultar la IA (¿sin internet?)', 'sospecha');
    return null;
  } finally {
    ia_ocupada = false;
  }
}

/* Enseña el veredicto en la app y, si Telegram está puesto, también allí. */
function ia_mostrar(v) {
  if (!v) return;
  const etiqueta = v.real === true ? '✅ PARECE REAL' : (v.real === false ? '☁ posible falsa alarma' : '🧠 IA');
  const conf = (v.confianza != null && !isNaN(v.confianza)) ? ' (' + Math.round(v.confianza) + '%)' : '';
  const desc = v.descripcion ? ' — ' + String(v.descripcion).slice(0, 160) : '';
  const msg = etiqueta + conf + desc;
  ia_toast('🧠 ' + msg, v.real === true ? 'critico' : 'info');
  if (estado.cfg.telegramToken && estado.cfg.telegramChat) ia_telegram('🧠 IA sobre la última alerta: ' + msg);
}

/* Mensaje de texto a Telegram (best-effort, no bloquea ni rompe). */
function ia_telegram(texto) {
  try {
    const url = 'https://api.telegram.org/bot' + encodeURIComponent(estado.cfg.telegramToken) + '/sendMessage';
    fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: estado.cfg.telegramChat, text: texto }),
    }).catch(function () {});
  } catch (e) { /* silencioso */ }
}

function ia_toast(msg, nivel) {
  if (typeof ui_toast === 'function') { try { ui_toast(msg, nivel || 'info'); } catch (e) {} }
}

/* Prueba manual desde Ajustes: manda la última foto de alerta (o un frame) a la
 * IA para comprobar que la clave funciona. Devuelve true si respondió algo. */
async function ia_probar() {
  if (!estado.cfg.iaApiKey) { ia_toast('🧠 Pega primero tu clave de IA (Anthropic).', 'sospecha'); return false; }
  let foto = null;
  try { if (typeof vid_capturaJPEG === 'function') foto = vid_capturaJPEG(1280, 0.82); } catch (e) {}
  if (!foto) { ia_toast('🧠 Enciende la cámara o un vídeo para probar la IA.', 'sospecha'); return false; }
  ia_toast('🧠 Consultando a la IA…', 'info');
  const prev = estado.cfg.iaConfirmar;
  estado.cfg.iaConfirmar = true;                 // permite la llamada aunque el toggle esté off
  const v = await ia_confirmarAlerta(foto, 'prueba', 'prueba manual del dueño');
  estado.cfg.iaConfirmar = prev;
  if (v) ia_toast('🧠 ¡La IA respondió! La clave funciona.', 'info');
  return !!v;
}

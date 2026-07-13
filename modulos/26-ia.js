/* ============================================================================
 * 26-IA — Confirmación de alertas con IA de VISIÓN (MULTI-PROVEEDOR).
 * Prefijo: ia_ / IA_.
 *
 * QUÉ HACE: cuando salta una alerta CON foto (robo, ocultación, peligro…), le
 * manda ESA foto a la IA de visión que el dueño elija y devuelve un veredicto
 * que "entiende" la escena: ¿es un incidente real o una falsa alarma? + una
 * descripción en 1 frase. Lo enseña en la app y lo manda a Telegram.
 *
 * PROVEEDORES:
 *  · gemini    → Google. Tiene plan GRATIS con visión (recomendado).
 *  · anthropic → Claude (de pago, por uso).
 *  · openai    → GPT (de pago, por uso).
 *  · custom    → cualquier API compatible con OpenAI (endpoint + clave propios:
 *                OpenRouter, Groq, Together, un servidor propio…).
 *
 * QUÉ NO HACE: NO analiza el vídeo en vivo (eso lo hace YOLO en el móvil, que es
 * instantáneo y gratis). La IA de la nube tarda ~1 s, así que se usa SOLO para
 * CONFIRMAR alertas — que es donde de verdad ayuda.
 *
 * PRIVACIDAD (honesto): con esto ACTIVADO, la foto de cada alerta SALE a la API
 * elegida para analizarla. Va apagado por defecto; solo funciona si el dueño
 * pega SU clave (cfg.iaApiKey) y enciende cfg.iaConfirmar.
 * ==========================================================================*/
const IA_MODELO_DEF = {
  gemini: 'gemini-2.0-flash',
  anthropic: 'claude-haiku-4-5-20251001',
  openai: 'gpt-4o-mini',
  custom: 'gpt-4o-mini',
};
let ia_ocupada = false;

/* Proveedor efectivo (con respaldo a gemini si viniera algo raro). */
function ia_proveedor() {
  const p = estado.cfg && estado.cfg.iaProveedor;
  return (p === 'anthropic' || p === 'openai' || p === 'custom' || p === 'gemini') ? p : 'gemini';
}

/* Modelo efectivo (el elegido, o el por defecto del proveedor). */
function ia_modelo() {
  const m = estado.cfg && estado.cfg.iaModelo ? String(estado.cfg.iaModelo).trim() : '';
  return m || IA_MODELO_DEF[ia_proveedor()] || 'gemini-2.0-flash';
}

/* ¿Está la confirmación por IA lista para usarse? (encendida + con clave, y
 * con endpoint si es 'custom'). */
function ia_activa() {
  if (!(estado.cfg && estado.cfg.iaConfirmar && estado.cfg.iaApiKey)) return false;
  if (ia_proveedor() === 'custom' && !String(estado.cfg.iaEndpoint || '').trim()) return false;
  return true;
}

/* El texto del prompt (común a todos los proveedores). */
function ia_prompt(tipo, texto) {
  return 'Eres un analista de una cámara de videovigilancia. La app ha lanzado una ' +
    'alerta automática de tipo "' + (tipo || '?') + '"' + (texto ? ' (' + texto + ')' : '') + '. ' +
    'Mira SOLO la imagen y responde ÚNICAMENTE con un JSON válido, sin texto extra:\n' +
    '{"real": true|false, "descripcion": "qué se ve, en una frase corta", "confianza": 0-100}\n' +
    '"real" = true si en la imagen se aprecia un incidente coherente con la alerta ' +
    '(robo, ocultar un objeto, forcejeo, objeto peligroso, persona donde no debe). ' +
    '"real" = false si parece una falsa alarma (nadie, gesto inocente, mascota, sombra). ' +
    'Nunca acuses a una persona concreta; describe conductas, no identidades.';
}

/* Construye {url, headers, body} para cada proveedor. Devuelve null si el
 * proveedor no está soportado. `foto` = {dataURL, mediaType, b64}. */
function ia_construirPeticion(prov, foto, tipo, texto) {
  const modelo = ia_modelo();
  const clave = String(estado.cfg.iaApiKey || '').trim();
  const prompt = ia_prompt(tipo, texto);

  if (prov === 'anthropic') {
    return {
      url: 'https://api.anthropic.com/v1/messages',
      headers: {
        'content-type': 'application/json',
        'x-api-key': clave,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: {
        model: modelo,
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: foto.mediaType, data: foto.b64 } },
            { type: 'text', text: prompt },
          ],
        }],
      },
    };
  }

  if (prov === 'gemini') {
    // La clave viaja en la URL (?key=…), como pide la API de Google.
    return {
      url: 'https://generativelanguage.googleapis.com/v1beta/models/' +
        encodeURIComponent(modelo) + ':generateContent?key=' + encodeURIComponent(clave),
      headers: { 'content-type': 'application/json' },
      body: {
        contents: [{
          parts: [
            { inline_data: { mime_type: foto.mediaType, data: foto.b64 } },
            { text: prompt },
          ],
        }],
        generationConfig: { maxOutputTokens: 300 },
      },
    };
  }

  // openai y custom → formato OpenAI (chat/completions con imagen por data URL).
  if (prov === 'openai' || prov === 'custom') {
    let url = 'https://api.openai.com/v1/chat/completions';
    if (prov === 'custom') {
      let base = String(estado.cfg.iaEndpoint || '').trim().replace(/\/+$/, '');
      // Acepta tanto la base (…/v1) como el endpoint completo.
      url = /\/chat\/completions$/.test(base) ? base : (base + '/chat/completions');
    }
    return {
      url: url,
      headers: {
        'content-type': 'application/json',
        'authorization': 'Bearer ' + clave,
      },
      body: {
        model: modelo,
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: foto.dataURL } },
          ],
        }],
      },
    };
  }

  return null;
}

/* Saca el texto de respuesta según el proveedor (los formatos difieren). */
function ia_extraerTexto(prov, data) {
  try {
    if (prov === 'anthropic') {
      return (data && data.content && data.content[0] && data.content[0].text) || '';
    }
    if (prov === 'gemini') {
      const c = data && data.candidates && data.candidates[0];
      const parts = c && c.content && c.content.parts;
      if (parts && parts.length) return parts.map((p) => p.text || '').join('');
      return '';
    }
    // openai / custom
    const ch = data && data.choices && data.choices[0];
    return (ch && ch.message && ch.message.content) || '';
  } catch (e) { return ''; }
}

/* Nombre bonito del proveedor para los avisos. */
function ia_nombreProv(prov) {
  return prov === 'anthropic' ? 'Claude' : (prov === 'openai' ? 'OpenAI' :
    (prov === 'custom' ? 'tu IA' : 'Gemini'));
}

/* Manda la foto de una alerta a la IA elegida y devuelve {real, descripcion,
 * confianza}. No lanza nunca: ante cualquier fallo devuelve null y avisa suave. */
async function ia_confirmarAlerta(fotoDataURL, tipo, texto) {
  if (!ia_activa() || !fotoDataURL || ia_ocupada) return null;
  const m = String(fotoDataURL).match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
  if (!m) return null;
  const prov = ia_proveedor();
  const foto = { dataURL: fotoDataURL, mediaType: m[1], b64: m[2] };
  ia_ocupada = true;
  try {
    const pet = ia_construirPeticion(prov, foto, tipo, texto);
    if (!pet) { ia_toast('🧠 Proveedor de IA no soportado.', 'sospecha'); return null; }
    const r = await fetch(pet.url, {
      method: 'POST',
      headers: pet.headers,
      body: JSON.stringify(pet.body),
    });
    if (!r || !r.ok) {
      const cod = r ? r.status : 0;
      const msg = (cod === 401 || cod === 403) ? 'la clave de ' + ia_nombreProv(prov) + ' no es válida' :
        (cod === 429 ? ia_nombreProv(prov) + ' saturada (límite de uso), reintenta luego' :
          (cod === 400 ? ia_nombreProv(prov) + ' rechazó la petición (¿modelo mal escrito?)' :
            (cod === 404 ? ia_nombreProv(prov) + ': modelo o endpoint no encontrado' :
              ('IA: error ' + cod))));
      ia_toast('🧠 ' + msg, 'sospecha');
      return null;
    }
    const data = await r.json();
    const txt = ia_extraerTexto(prov, data);
    let v = null;
    try {
      const trozo = String(txt).match(/\{[\s\S]*\}/);
      v = trozo ? JSON.parse(trozo[0]) : null;
    } catch (e) { v = null; }
    if (!v) v = { real: null, descripcion: String(txt).slice(0, 120), confianza: null };
    ia_mostrar(v);
    return v;
  } catch (e) {
    ia_toast('🧠 No se pudo consultar la IA (¿sin internet o CORS?)', 'sospecha');
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

/* Prueba manual desde Ajustes: manda un frame a la IA para comprobar la clave.
 * Devuelve true si respondió algo. */
async function ia_probar() {
  if (!estado.cfg.iaApiKey) { ia_toast('🧠 Pega primero tu clave de IA.', 'sospecha'); return false; }
  if (ia_proveedor() === 'custom' && !String(estado.cfg.iaEndpoint || '').trim()) {
    ia_toast('🧠 Pega también el endpoint de tu IA (proveedor «Otra»).', 'sospecha'); return false;
  }
  let foto = null;
  try { if (typeof vid_capturaJPEG === 'function') foto = vid_capturaJPEG(1280, 0.82); } catch (e) {}
  if (!foto) { ia_toast('🧠 Enciende la cámara o un vídeo para probar la IA.', 'sospecha'); return false; }
  ia_toast('🧠 Consultando a ' + ia_nombreProv(ia_proveedor()) + '…', 'info');
  const prev = estado.cfg.iaConfirmar;
  estado.cfg.iaConfirmar = true;                 // permite la llamada aunque el toggle esté off
  const v = await ia_confirmarAlerta(foto, 'prueba', 'prueba manual del dueño');
  estado.cfg.iaConfirmar = prev;
  if (v) ia_toast('🧠 ¡' + ia_nombreProv(ia_proveedor()) + ' respondió! La clave funciona.', 'info');
  return !!v;
}

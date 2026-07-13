/* ============================================================================
 * 26-IA — Confirmación de alertas con IA de VISIÓN (MULTI-PROVEEDOR + SECUENCIA).
 * Prefijo: ia_ / IA_.
 *
 * QUÉ HACE: cuando salta una alerta CON foto (robo, ocultación, peligro…), le
 * manda a la IA de visión que el dueño elija NO una foto suelta, sino una
 * SECUENCIA de fotogramas seguidos (los ~segundos de ANTES + el instante de la
 * alarma). Así la IA ve el MOVIMIENTO (coger → esconder → irse), que es lo que
 * de verdad delata un robo: una sola foto congelada es ambigua (una mano en el
 * bolsillo puede ser el móvil o un hurto). Devuelve un veredicto: ¿incidente
 * real o falsa alarma? + descripción en 1 frase. Lo enseña en la app y Telegram.
 *
 * CÓMO CONSIGUE EL "ANTES": mientras la IA está activa, guarda un pequeño búfer
 * circular de fotogramas recientes (throttle ~350 ms, máx 4). Sin IA activa NO
 * captura nada → coste cero. La alarma salta DESPUÉS del gesto, así que sin este
 * búfer la IA solo vería al ladrón ya quieto.
 *
 * PROVEEDORES:
 *  · gemini    → Google. Plan GRATIS con visión (recomendado).
 *  · anthropic → Claude (de pago por uso).
 *  · openai    → GPT (de pago por uso).
 *  · custom    → cualquier API compatible con OpenAI (endpoint + clave propios).
 *
 * QUÉ NO HACE: NO analiza el vídeo en vivo (eso lo hace YOLO en el móvil, gratis
 * e instantáneo). La IA de la nube tarda ~1 s: se usa SOLO para CONFIRMAR.
 *
 * PRIVACIDAD (honesto): con esto ACTIVADO, los fotogramas de cada alerta SALEN a
 * la API elegida. Va apagado por defecto; solo funciona con la clave del dueño.
 * ==========================================================================*/
const IA_MODELO_DEF = {
  gemini: 'gemini-2.0-flash',
  anthropic: 'claude-haiku-4-5-20251001',
  openai: 'gpt-4o-mini',
  custom: 'gpt-4o-mini',
};
const IA_RING_MAX = 4;      // fotogramas de la secuencia (antes/durante + instante)
const IA_RING_MS = 350;     // separación mínima entre capturas del búfer
const IA_RING_ANCHO = 640;  // ancho de los fotogramas del búfer (ligeros)
let ia_ocupada = false;
let ia_ring = [];           // búfer circular de dataURLs recientes
let ia_ringUlt = 0;

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

/* ¿Está la confirmación por IA lista para usarse? (encendida + con clave, y con
 * endpoint si es 'custom'). */
function ia_activa() {
  if (!(estado.cfg && estado.cfg.iaConfirmar && estado.cfg.iaApiKey)) return false;
  if (ia_proveedor() === 'custom' && !String(estado.cfg.iaEndpoint || '').trim()) return false;
  return true;
}

/* Búfer circular de fotogramas recientes: alimenta el "antes" de la secuencia.
 * Solo captura mientras la IA está activa (si no, coste cero). */
function ia_init() {
  ia_ring = [];
  ia_ringUlt = 0;
  if (typeof bus === 'undefined' || !bus.on) return;
  bus.on('frame', function (d) {
    try {
      if (!ia_activa() || typeof vid_capturaJPEG !== 'function') return;
      const ahora = (d && d.ts) || Date.now();
      if (ahora - ia_ringUlt < IA_RING_MS) return;
      const f = vid_capturaJPEG(IA_RING_ANCHO, 0.7);
      if (!f) return;
      ia_ringUlt = ahora;
      ia_ring.push(f);
      while (ia_ring.length > IA_RING_MAX) ia_ring.shift();
    } catch (e) { /* nunca rompe el bucle de vídeo */ }
  });
}

/* Parte un dataURL en {dataURL, mediaType, b64}; null si no es imagen base64. */
function ia_parseFoto(dataURL) {
  const m = String(dataURL || '').match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
  if (!m) return null;
  return { dataURL: dataURL, mediaType: m[1], b64: m[2] };
}

/* El texto del prompt. Cambia según sea 1 imagen o una secuencia. */
function ia_prompt(tipo, texto, n) {
  const cab = n > 1
    ? 'Te paso ' + n + ' fotogramas SEGUIDOS del mismo momento, en orden (de antes al instante de la alarma). ' +
      'Fíjate en el MOVIMIENTO entre ellos (qué coge una persona, si lo esconde en ropa/bolsa/bolsillo, hacia dónde va), no en una sola imagen suelta. '
    : 'Mira la imagen. ';
  return 'Eres un analista de una cámara de videovigilancia. La app ha lanzado una ' +
    'alerta automática de tipo "' + (tipo || '?') + '"' + (texto ? ' (' + texto + ')' : '') + '. ' +
    cab +
    'Responde ÚNICAMENTE con un JSON válido, sin texto extra:\n' +
    '{"real": true|false, "descripcion": "qué se ve, en una frase corta", "confianza": 0-100}\n' +
    '"real" = true si se aprecia un incidente coherente con la alerta ' +
    '(robo, ocultar un objeto, forcejeo, objeto peligroso, persona donde no debe). ' +
    '"real" = false si parece una falsa alarma (nadie, gesto inocente, mascota, sombra). ' +
    'Nunca acuses a una persona concreta; describe conductas, no identidades.';
}

/* Construye {url, headers, body} para cada proveedor con una LISTA de fotos.
 * `fotos` = [{dataURL, mediaType, b64}, …]. Devuelve null si el proveedor no
 * está soportado. */
function ia_construirPeticion(prov, fotos, tipo, texto) {
  const modelo = ia_modelo();
  const clave = String(estado.cfg.iaApiKey || '').trim();
  const prompt = ia_prompt(tipo, texto, fotos.length);

  if (prov === 'anthropic') {
    const content = fotos.map(function (f) {
      return { type: 'image', source: { type: 'base64', media_type: f.mediaType, data: f.b64 } };
    });
    content.push({ type: 'text', text: prompt });
    return {
      url: 'https://api.anthropic.com/v1/messages',
      headers: {
        'content-type': 'application/json',
        'x-api-key': clave,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: { model: modelo, max_tokens: 300, messages: [{ role: 'user', content: content }] },
    };
  }

  if (prov === 'gemini') {
    const parts = fotos.map(function (f) {
      return { inline_data: { mime_type: f.mediaType, data: f.b64 } };
    });
    parts.push({ text: prompt });
    return {
      url: 'https://generativelanguage.googleapis.com/v1beta/models/' +
        encodeURIComponent(modelo) + ':generateContent?key=' + encodeURIComponent(clave),
      headers: { 'content-type': 'application/json' },
      body: { contents: [{ parts: parts }], generationConfig: { maxOutputTokens: 300 } },
    };
  }

  // openai y custom → formato OpenAI (chat/completions con imágenes por data URL).
  if (prov === 'openai' || prov === 'custom') {
    let url = 'https://api.openai.com/v1/chat/completions';
    if (prov === 'custom') {
      const base = String(estado.cfg.iaEndpoint || '').trim().replace(/\/+$/, '');
      url = /\/chat\/completions$/.test(base) ? base : (base + '/chat/completions');
    }
    const content = [{ type: 'text', text: prompt }];
    fotos.forEach(function (f) { content.push({ type: 'image_url', image_url: { url: f.dataURL } }); });
    return {
      url: url,
      headers: { 'content-type': 'application/json', 'authorization': 'Bearer ' + clave },
      body: { model: modelo, max_tokens: 300, messages: [{ role: 'user', content: content }] },
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
      if (parts && parts.length) return parts.map(function (p) { return p.text || ''; }).join('');
      return '';
    }
    const ch = data && data.choices && data.choices[0];
    return (ch && ch.message && ch.message.content) || '';
  } catch (e) { return ''; }
}

/* Nombre bonito del proveedor para los avisos. */
function ia_nombreProv(prov) {
  return prov === 'anthropic' ? 'Claude' : (prov === 'openai' ? 'OpenAI' :
    (prov === 'custom' ? 'tu IA' : 'Gemini'));
}

/* Marca el estado de la IA sobre una alerta: lo enseña en su tarjeta del feed
 * (visible y persistente), lo guarda en el registro y avisa por el bus. Así el
 * dueño VE que la IA trabaja, en vez de un aviso que se esfuma. */
function ia_marcar(registroId, texto, tono, verdicto) {
  try {
    if (registroId && estado.alerta && estado.alerta.log) {
      const reg = estado.alerta.log.filter(function (r) { return r && r.id === registroId; })[0];
      if (reg) {
        reg.iaTexto = texto;
        if (verdicto) reg.ia = verdicto;
        try { nuc_guardar('log', estado.alerta.log); } catch (e) {}
      }
    }
  } catch (e) {}
  try { if (typeof bus !== 'undefined' && bus.emit) bus.emit('ia:estado', { registroId: registroId, texto: texto, tono: tono || 'info' }); } catch (e) {}
}

/* Manda la SECUENCIA de una alerta a la IA elegida y devuelve {real,
 * descripcion, confianza}. `fotoDataURL` = el instante de la alarma; se le
 * añaden los fotogramas recientes del búfer (el "antes"). `registroId` = la
 * alerta a la que pegar el veredicto en el feed. No lanza nunca. */
async function ia_confirmarAlerta(fotoDataURL, tipo, texto, registroId) {
  if (!ia_activa() || !fotoDataURL || ia_ocupada) return null;
  ia_marcar(registroId, '🧠 Consultando a ' + ia_nombreProv(ia_proveedor()) + '…', 'info');
  // Secuencia = últimos del búfer (antes/durante) + el instante de la alarma.
  const crudas = ia_ring.slice(-(IA_RING_MAX - 1)).concat([fotoDataURL]);
  const fotos = [];
  let ultimo = null;
  for (let i = 0; i < crudas.length; i++) {
    if (crudas[i] === ultimo) continue;          // evita duplicados consecutivos
    const f = ia_parseFoto(crudas[i]);
    if (f) { fotos.push(f); ultimo = crudas[i]; }
  }
  if (!fotos.length) return null;
  const prov = ia_proveedor();
  ia_ocupada = true;
  try {
    const pet = ia_construirPeticion(prov, fotos, tipo, texto);
    if (!pet) { ia_toast('🧠 Proveedor de IA no soportado.', 'sospecha'); return null; }
    const r = await fetch(pet.url, { method: 'POST', headers: pet.headers, body: JSON.stringify(pet.body) });
    if (!r || !r.ok) {
      const cod = r ? r.status : 0;
      const msg = (cod === 401 || cod === 403) ? 'la clave de ' + ia_nombreProv(prov) + ' no es válida' :
        (cod === 429 ? ia_nombreProv(prov) + ' saturada (límite de uso), reintenta luego' :
          (cod === 400 ? ia_nombreProv(prov) + ' rechazó la petición (¿modelo mal escrito?)' :
            (cod === 404 ? ia_nombreProv(prov) + ': modelo o endpoint no encontrado' : ('IA: error ' + cod))));
      ia_toast('🧠 ' + msg, 'sospecha');
      ia_marcar(registroId, '🧠 ' + msg, 'sospecha');
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
    ia_mostrar(v, registroId);
    return v;
  } catch (e) {
    ia_toast('🧠 No se pudo consultar la IA (¿sin internet o CORS?)', 'sospecha');
    ia_marcar(registroId, '🧠 No se pudo consultar (¿sin internet o CORS?)', 'sospecha');
    return null;
  } finally {
    ia_ocupada = false;
  }
}

/* Enseña el veredicto: toast + lo PEGA a la tarjeta de la alerta (persistente)
 * + Telegram si está puesto. */
function ia_mostrar(v, registroId) {
  if (!v) return;
  const etiqueta = v.real === true ? '✅ PARECE REAL' : (v.real === false ? '☁ posible falsa alarma' : '🧠 IA');
  const conf = (v.confianza != null && !isNaN(v.confianza)) ? ' (' + Math.round(v.confianza) + '%)' : '';
  const desc = v.descripcion ? ' — ' + String(v.descripcion).slice(0, 160) : '';
  const msg = etiqueta + conf + desc;
  ia_toast('🧠 ' + msg, v.real === true ? 'critico' : 'info');
  ia_marcar(registroId, '🧠 ' + msg, v.real === true ? 'critico' : 'info', { real: v.real, descripcion: v.descripcion, confianza: v.confianza });
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

/* Prueba manual desde Ajustes: manda un frame (+ búfer si lo hay) a la IA para
 * comprobar la clave. Devuelve true si respondió algo. */
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

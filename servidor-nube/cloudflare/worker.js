// VIGÍA · conector para Cloudflare Workers AI (GRATIS, siempre encendido)
// Recibe la foto de la app, la pasa por el detector de objetos de Cloudflare
// (@cf/facebook/detr-resnet-50) y devuelve las cajas en el formato que la app
// ya entiende: { detecciones: [ {clase, score, x, y, an, al} ] } (0-1).
// Pega este código en un Worker de Cloudflare y añádele el binding "AI".

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Lee el ancho/alto de un JPEG a partir de sus bytes (para normalizar las cajas).
function tamanoJPEG(b) {
  let i = 2, n = b.length;
  while (i < n) {
    if (b[i] !== 0xFF) { i++; continue; }
    const m = b[i + 1];
    if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) {
      return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8] };
    }
    const len = (b[i + 2] << 8) | b[i + 3];
    i += 2 + len;
  }
  return { w: 0, h: 0 };
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (request.method === "GET") return Response.json({ ok: true }, { headers: CORS });
    try {
      const cuerpo = await request.json();
      let b64 = cuerpo.imagen || "";
      if (b64.startsWith("data:") && b64.includes(",")) b64 = b64.split(",")[1];
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

      const { w, h } = tamanoJPEG(bytes);
      const W = w || 1, H = h || 1;

      const salidaIA = await env.AI.run("@cf/facebook/detr-resnet-50", { image: Array.from(bytes) });
      const arr = Array.isArray(salidaIA) ? salidaIA : (salidaIA.result || salidaIA.response || []);

      const detecciones = [];
      for (const d of arr) {
        if (!d || !d.box) continue;
        const { xmin, ymin, xmax, ymax } = d.box;
        detecciones.push({
          clase: d.label || "objeto",
          score: Math.round((d.score || 0) * 1000) / 1000,
          x: xmin / W, y: ymin / H,
          an: (xmax - xmin) / W, al: (ymax - ymin) / H,
        });
      }
      return Response.json({ detecciones }, { headers: CORS });
    } catch (e) {
      return Response.json({ detecciones: [], error: String(e) }, { headers: CORS });
    }
  },
};

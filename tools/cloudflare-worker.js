/**
 * Puente CORS para el Centro de Captacion.
 * Subir como Cloudflare Worker (cuenta gratis: 100.000 peticiones/dia).
 *
 * Uso desde la app:  https://TU-WORKER.workers.dev/?url=https://...
 *
 * Hace fetch a la URL pedida con headers de navegador real (saltarse 403 basicos)
 * y devuelve el HTML con CORS abierto para que tu app movil pueda leerlo.
 *
 * Formato "Service Worker" (compatible con el subidor sin build) - no toques.
 */
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

addEventListener("fetch", function (event) {
  event.respondWith(handle(event.request));
});

async function handle(request) {
  const u = new URL(request.url);

  // CORS preflight (OPTIONS) - permitir desde cualquier origen
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  // Pagina raiz: instrucciones rapidas
  const target = u.searchParams.get("url");
  if (!target) {
    return new Response(
      "Cloudflare Worker - Puente CORS listo.\n\n" +
        "Uso: " + u.origin + "/?url=https://web-del-bar.com\n",
      { headers: { "content-type": "text/plain; charset=utf-8", "Access-Control-Allow-Origin": "*" } }
    );
  }

  // Validar que sea una URL http/https
  let tgt;
  try {
    tgt = new URL(target);
    if (!/^https?:$/.test(tgt.protocol)) throw 0;
  } catch (e) {
    return new Response("URL invalida", { status: 400, headers: { "Access-Control-Allow-Origin": "*" } });
  }

  // Pedir la pagina haciendome pasar por Chrome normal
  let upstream;
  try {
    upstream = await fetch(tgt.toString(), {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
      },
      cf: { cacheTtl: 300, cacheEverything: true },
    });
  } catch (e) {
    return new Response("Error al pedir la web: " + e.message, {
      status: 502,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }

  // Devolver el contenido con CORS abierto
  const ct = upstream.headers.get("content-type") || "text/html; charset=utf-8";
  const body = await upstream.arrayBuffer();
  return new Response(body, {
    status: upstream.status,
    headers: {
      "content-type": ct,
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Expose-Headers": "*",
      "X-Original-URL": tgt.toString(),
    },
  });
}

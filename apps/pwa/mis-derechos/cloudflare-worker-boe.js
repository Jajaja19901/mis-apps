// Worker proxy BOE para "Mis Derechos" (Cloudflare Workers)
// Qué hace: recibe ?ruta=/datosabiertos/api/legislacion-consolidada/... y devuelve
// el XML oficial del BOE con CORS abierto, para que la app pueda leerlo desde el navegador
// (el BOE no manda cabeceras CORS y por eso hace falta este intermediario).
// Solo permite la API de legislación consolidada: no es un proxy abierto.
//
// Despliegue: Cloudflare Dashboard → Workers & Pages → Create Worker → pegar esto → Deploy.
// Si la URL del worker cambia, actualiza WORKER_BOE_URL en index.html.

export default {
  async fetch(request) {
    const cors = { 'Access-Control-Allow-Origin': '*' };
    const url = new URL(request.url);
    const ruta = url.searchParams.get('ruta') || '';

    // Solo la API de legislación consolidada del BOE
    if (!ruta.startsWith('/datosabiertos/api/legislacion-consolidada/')) {
      return new Response('Ruta no permitida', { status: 400, headers: cors });
    }

    try {
      const resp = await fetch('https://www.boe.es' + ruta, {
        headers: { 'Accept': 'application/xml' },
        // Los artículos consolidados cambian poco: cachear 24h en el edge ahorra
        // cuota y responde en milisegundos a las preguntas repetidas.
        cf: { cacheTtl: 86400, cacheEverything: true }
      });
      const body = await resp.text();
      return new Response(body, {
        status: resp.status,
        headers: {
          ...cors,
          'Content-Type': resp.headers.get('Content-Type') || 'application/xml; charset=utf-8',
          'Cache-Control': 'public, max-age=86400'
        }
      });
    } catch (e) {
      return new Response('Error consultando BOE: ' + e.message, { status: 502, headers: cors });
    }
  }
};

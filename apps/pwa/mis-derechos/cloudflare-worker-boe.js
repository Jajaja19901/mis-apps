// Worker proxy para "Mis Derechos" (Cloudflare Workers) — v2 con búsqueda de actualidad
//
// Hace DOS cosas:
//   1. ?ruta=/datosabiertos/api/legislacion-consolidada/...  → texto oficial del BOE (como siempre)
//   2. ?buscar=texto de la consulta                          → resultados web actuales (Brave Search)
//
// Despliegue: Cloudflare Dashboard → Workers & Pages → tu worker → Edit code → pegar esto → Deploy.
// Para activar la búsqueda (opcional): consigue una key gratis en https://brave.com/search/api
// y añádela en el worker: Settings → Variables and Secrets → Add → tipo Secret,
// nombre BRAVE_KEY, valor tu key. SIN la key, la búsqueda devuelve 503 y la app
// sigue funcionando normal (fallback silencioso) — puedes desplegar esto hoy y poner la key otro día.

export default {
  async fetch(request, env) {
    const cors = { 'Access-Control-Allow-Origin': '*' };
    const url = new URL(request.url);

    // ── 2) BÚSQUEDA DE ACTUALIDAD (Brave Search) ──
    if (url.searchParams.has('buscar')) {
      const q = (url.searchParams.get('buscar') || '').slice(0, 200);
      if (!q) return new Response('[]', { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });
      if (!env.BRAVE_KEY) return new Response('busqueda no configurada (falta BRAVE_KEY)', { status: 503, headers: cors });
      try {
        const r = await fetch('https://api.search.brave.com/res/v1/web/search?count=5&country=es&search_lang=es&q=' + encodeURIComponent(q), {
          headers: { 'X-Subscription-Token': env.BRAVE_KEY, 'Accept': 'application/json' },
          cf: { cacheTtl: 3600, cacheEverything: true }
        });
        if (!r.ok) return new Response('error del buscador: ' + r.status, { status: 502, headers: cors });
        const data = await r.json();
        const items = ((data.web && data.web.results) || []).slice(0, 5)
          .map(x => ({ t: x.title || '', d: x.description || '', u: x.url || '' }));
        return new Response(JSON.stringify(items), {
          status: 200,
          headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' }
        });
      } catch (e) {
        return new Response('error buscando: ' + e.message, { status: 502, headers: cors });
      }
    }

    // ── 1) TEXTO OFICIAL DEL BOE (legislación consolidada) ──
    const ruta = url.searchParams.get('ruta') || '';
    if (!ruta.startsWith('/datosabiertos/api/legislacion-consolidada/')) {
      return new Response('Ruta no permitida', { status: 400, headers: cors });
    }
    try {
      const resp = await fetch('https://www.boe.es' + ruta, {
        headers: { 'Accept': 'application/xml' },
        // Los artículos consolidados cambian poco: 24h de caché = respuestas en milisegundos
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

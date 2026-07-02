// Worker proxy "Mis Derechos" — v5: BOE + novedades por Google News/Bing RSS
// SIN keys, SIN registros, SIN configuracion: pegar en Cloudflare y Deploy.
//   ?ruta=/datosabiertos/api/legislacion-consolidada/...  → texto oficial del BOE
//   ?buscar=texto                                          → noticias recientes (RSS publico)
// Cache 24h: cada busqueda repetida en el dia no vuelve a salir a internet.

addEventListener('fetch', event => {
  event.respondWith(manejar(event));
});

function limpiarTexto(s) {
  return (s || '')
    .replace(/<!\[CDATA\[|\]\]>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;[^&]*&gt;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function extraerItemsRSS(xml) {
  const items = [];
  const bloques = xml.split(/<item[\s>]/).slice(1);
  for (let i = 0; i < bloques.length && items.length < 5; i++) {
    const b = bloques[i];
    const t = (b.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '';
    const u = (b.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || '';
    const d = (b.match(/<description>([\s\S]*?)<\/description>/) || [])[1] || '';
    const titulo = limpiarTexto(t);
    if (!titulo) continue;
    items.push({ t: titulo, d: limpiarTexto(d).slice(0, 250), u: limpiarTexto(u) });
  }
  return items;
}

async function buscarNoticias(q) {
  // 1º Google News RSS (España, en español); 2º Bing News RSS de repuesto
  const fuentes = [
    'https://news.google.com/rss/search?q=' + encodeURIComponent(q) + '&hl=es&gl=ES&ceid=ES:es',
    'https://www.bing.com/news/search?q=' + encodeURIComponent(q) + '&format=RSS'
  ];
  for (let i = 0; i < fuentes.length; i++) {
    try {
      const r = await fetch(fuentes[i], { headers: { 'Accept': 'application/rss+xml, application/xml, text/xml' } });
      if (!r.ok) continue;
      const xml = await r.text();
      const items = extraerItemsRSS(xml);
      if (items.length > 0) return items;
    } catch (e) { /* probar la siguiente fuente */ }
  }
  return [];
}

async function manejar(event) {
  const request = event.request;
  const cors = { 'Access-Control-Allow-Origin': '*' };
  const url = new URL(request.url);

  // ── NOVEDADES (RSS publico, sin key) con cache de 24h ──
  if (url.searchParams.has('buscar')) {
    const q = (url.searchParams.get('buscar') || '').slice(0, 200)
      .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
    if (!q) return new Response('[]', { status: 200, headers: Object.assign({}, cors, { 'Content-Type': 'application/json' }) });

    const cache = caches.default;
    const claveCache = new Request('https://cache.local/buscar?q=' + encodeURIComponent(q));
    const guardada = await cache.match(claveCache);
    if (guardada) return guardada;

    const items = await buscarNoticias(q);
    const respuesta = new Response(JSON.stringify(items), {
      status: 200,
      headers: Object.assign({}, cors, { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=86400' })
    });
    if (items.length > 0) event.waitUntil(cache.put(claveCache, respuesta.clone()));
    return respuesta;
  }

  // ── TEXTO OFICIAL DEL BOE (legislacion consolidada) ──
  const ruta = url.searchParams.get('ruta') || '';
  if (ruta.indexOf('/datosabiertos/api/legislacion-consolidada/') !== 0) {
    return new Response('Ruta no permitida', { status: 400, headers: cors });
  }
  try {
    const resp = await fetch('https://www.boe.es' + ruta, {
      headers: { 'Accept': 'application/xml' },
      cf: { cacheTtl: 86400, cacheEverything: true }
    });
    const body = await resp.text();
    return new Response(body, {
      status: resp.status,
      headers: Object.assign({}, cors, {
        'Content-Type': resp.headers.get('Content-Type') || 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=86400'
      })
    });
  } catch (e) {
    return new Response('Error consultando BOE: ' + e.message, { status: 502, headers: cors });
  }
}

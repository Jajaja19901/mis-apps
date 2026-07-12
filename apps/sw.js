/* ============================================================================
 * Service Worker de VIGÍA IA — caché para funcionar rápido y sin internet
 * (tras la primera visita). Sube este archivo JUNTO a index.html.
 *
 * Estrategias:
 *  · La app (index.html): red primero, caché de respaldo → siempre la última
 *    versión si hay internet, y la app sigue abriendo sin conexión.
 *  · Modelos y librerías de IA (CDNs): caché primero → se descargan UNA vez.
 * ==========================================================================*/
const VERSION = 'vigia-3-76';  // Cambia este número con cada deployment
const CACHE_APP = VERSION + '-app';
const CACHE_IA = VERSION + '-ia';

/* CDNs de librerías y modelos de IA (caché-primero, inmutables en la práctica) */
const HOSTS_IA = [
  'cdn.jsdelivr.net',
  'storage.googleapis.com',
  'huggingface.co',
  'cdn-lfs.huggingface.co',
  'cdn-lfs-us-1.huggingface.co',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_APP).then((c) => c.addAll(['./']).catch(() => {})));
  self.skipWaiting();
});

/* El cliente puede pedir que un SW en espera tome el mando ya (auto-actualización). */
self.addEventListener('message', (e) => {
  if (e && e.data && e.data.tipo === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const claves = await caches.keys();
    // Borra caché viejo (versiones anteriores)
    await Promise.all(claves.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
    await self.clients.claim();
    // Notifica a todos los clientes que hay nueva versión
    const clientes = await self.clients.matchAll();
    clientes.forEach((c) => c.postMessage({ tipo: 'sw-activado-nuevo', version: VERSION }));
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  /* Librerías/modelos de IA (CDNs):
   *  · MODELOS grandes e inmutables (.onnx/.task/.bin/.data): CACHÉ PRIMERO.
   *  · LIBRERÍAS/scripts (.js/.mjs/.wasm/.css): RED PRIMERO con respaldo de
   *    caché → una copia rota se AUTORREPARA en cuanto hay internet. */
  if (HOSTS_IA.some((h) => url.hostname === h || url.hostname.endsWith('.' + h))) {
    const esModeloGrande = /\.(onnx|task|bin|data)(\?|$)/i.test(url.pathname);
    e.respondWith((async () => {
      const cache = await caches.open(CACHE_IA);
      if (esModeloGrande) {
        const hit = await cache.match(req);
        if (hit) return hit;
        try {
          const resp = await fetch(req);
          if (resp && resp.ok) cache.put(req, resp.clone());
          return resp;
        } catch (err) { return hit || Response.error(); }
      }
      try {
        const resp = await fetch(req);
        if (resp && resp.ok) cache.put(req, resp.clone());
        return resp;
      } catch (err) {
        const hit = await cache.match(req);
        return hit || Response.error();
      }
    })());
    return;
  }

  /* La propia app: red primero con respaldo de caché (funciona sin internet) */
  if (url.origin === self.location.origin) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE_APP);
      try {
        const resp = await fetch(req);
        if (resp && resp.ok) cache.put(req, resp.clone());
        return resp;
      } catch (err) {
        const hit = await cache.match(req, { ignoreSearch: true });
        return hit || cache.match('./') || Response.error();
      }
    })());
  }
});

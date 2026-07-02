// Service Worker · Mis Derechos
// v21 - NETWORK-FIRST: siempre intenta cargar la versión nueva de internet.
// Solo usa la copia guardada si no hay conexión. Así NUNCA se queda pegada una versión vieja.
const VERSION = 'derechos-v45';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(VERSION).then(c => c.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== VERSION).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = e.request.url;

  // NUNCA tocar llamadas a APIs de IA
  if (
    url.includes('workers.dev') ||
    url.includes('api.groq.com') ||
    url.includes('api.cerebras.ai') ||
    url.includes('api.x.ai')
  ) {
    return;
  }

  // NETWORK-FIRST: intenta red, guarda copia fresca, cae a caché solo si offline
  e.respondWith(
    fetch(e.request)
      .then(resp => {
        const copia = resp.clone();
        caches.open(VERSION).then(c => c.put(e.request, copia));
        return resp;
      })
      .catch(() =>
        caches.match(e.request).then(cached =>
          cached || (e.request.mode === 'navigate'
            ? caches.match('./index.html')
            : new Response('Recurso no disponible offline', { status: 503 }))
        )
      )
  );
});

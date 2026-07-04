/* Service worker de Fragua Móvil: cachea el "shell" de la app para que
   abra al instante y funcione aunque no haya cobertura (la interfaz; las
   llamadas a la IA obviamente necesitan internet). Estrategia:
   cache-first para los archivos propios, red para todo lo demás. */
'use strict';

const CACHE = 'fragua-movil-v1';
const SHELL = ['./', './index.html', './app.js', './manifest.webmanifest', './icon.svg', './icon-maskable.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Nunca cachear las llamadas a la IA ni recursos de otros dominios.
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req)
        .then((res) => {
          if (res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match('./index.html'));
    })
  );
});

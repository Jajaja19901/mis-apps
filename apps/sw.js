/* Service worker de MH Collective.
   Estrategia network-first del "shell" (la propia app y sus iconos): así la app se
   puede INSTALAR en el móvil y funciona sin datos (offline). La API (/api/...) NUNCA
   se cachea porque son datos en vivo que tienen que salir del servidor. */
var CACHE = 'mh-collective-v1';

self.addEventListener('install', function (e) { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  var u = new URL(e.request.url);
  if (u.pathname.indexOf('/api/') === 0) return; // datos en vivo: siempre del servidor
  e.respondWith(
    fetch(e.request).then(function (res) {
      try { var copia = res.clone(); caches.open(CACHE).then(function (c) { c.put(e.request, copia); }); } catch (err) {}
      return res;
    }).catch(function () {
      return caches.match(e.request).then(function (r) { return r || caches.match('./'); });
    })
  );
});

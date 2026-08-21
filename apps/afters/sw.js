// AFTERS Service Worker — Push notifications + install PWA
const CACHE_NAME = 'afters-v91';

self.addEventListener('install', function(e) { self.skipWaiting(); });
self.addEventListener('activate', function(e) { e.waitUntil(clients.claim()); });

// Recibir push del Cloudflare Worker
self.addEventListener('push', function(e) {
  var data = {};
  try { data = e.data ? e.data.json() : {}; } catch(ex) {}

  var title = data.title || 'AFTERS';
  var options = {
    body: data.body || 'Hay actividad en tu grupo',
    icon: data.icon || '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || 'afters',
    data: data,
    requireInteraction: data.requireInteraction || false
  };

  // Vibración específica por tipo
  if (data.tag === 'sos') {
    options.vibrate = [500, 200, 500, 200, 500, 200, 500];
    options.requireInteraction = true;  // SOS no desaparece sola
  } else if (data.tag === 'ola') {
    options.vibrate = [300, 100, 300, 100, 300];
  } else if (data.tag === 'toque') {
    options.vibrate = [200, 100, 200];
  } else if (data.tag === 'reagrupar') {
    options.vibrate = [400, 100, 400, 100, 400];
  } else {
    options.vibrate = [200];
  }

  e.waitUntil(self.registration.showNotification(title, options));
});

// Al tocar la notificación: abrir la app
self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(cls) {
      for (var i = 0; i < cls.length; i++) {
        if ('focus' in cls[i]) return cls[i].focus();
      }
      if (clients.openWindow) return clients.openWindow('/');
    })
  );
});

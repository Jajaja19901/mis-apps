/* Avisador de notificaciones (service worker) — Camarero Digital.
   Súbelo SIEMPRE junto al HTML del bar (mismo sitio, mismo nombre: sw.js).
   Recibe los avisos push del servidor y los muestra aunque el móvil esté bloqueado. */
self.addEventListener("install", function (e) { self.skipWaiting(); });
self.addEventListener("activate", function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener("push", function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) {}
  e.waitUntil(self.registration.showNotification(d.title || "🔔 Aviso del bar", {
    body: d.body || "",
    tag: d.tag || "comanda",
    renotify: true,
    vibrate: [220, 100, 220, 100, 220],
    data: { url: (d.url || "./") }
  }));
});

self.addEventListener("notificationclick", function (e) {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (ws) {
    for (var i = 0; i < ws.length; i++) { if ("focus" in ws[i]) return ws[i].focus(); }
    return clients.openWindow((e.notification.data && e.notification.data.url) || "./");
  }));
});

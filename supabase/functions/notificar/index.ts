// Cañón de avisos push — Camarero Digital.
// Se dispara solo (webhook de base de datos) cuando entra una comanda nueva,
// y manda la notificación a los móviles del personal de ESE bar, aunque estén bloqueados.
//
// Despliegue (una vez, ver GUIA-SERVIDOR-BARES.md):
//   supabase functions deploy notificar --no-verify-jwt
//   supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_EMAIL=tu@correo.com
//   + webhook en la tabla comandas (INSERT) apuntando a esta función.

import webpush from "npm:web-push@3.6.7";

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const rec = payload.record || {};
    const tipo = payload.type; // INSERT | UPDATE | DELETE

    if (!rec.bar_id) return new Response("ok");
    if (tipo !== "INSERT" || (rec.estado || "pendiente") !== "pendiente") return new Response("ok");

    webpush.setVapidDetails(
      "mailto:" + (Deno.env.get("VAPID_EMAIL") || "avisos@example.com"),
      Deno.env.get("VAPID_PUBLIC_KEY")!,
      Deno.env.get("VAPID_PRIVATE_KEY")!,
    );

    const url = Deno.env.get("SUPABASE_URL")!;
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Suscripciones del personal de este bar
    const r = await fetch(
      `${url}/rest/v1/push_subs?bar_id=eq.${encodeURIComponent(rec.bar_id)}&rol=eq.staff&select=endpoint,sub`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } },
    );
    const subs = await r.json();
    if (!Array.isArray(subs) || !subs.length) return new Response("ok");

    // ¿Es un aviso de mesa (cuenta/camarero) o una comanda normal?
    const items = Array.isArray(rec.items) ? rec.items : [];
    const esAviso = items.some((i: { nombre?: string }) => String(i?.nombre || "").includes("⚑"));
    const title = esAviso
      ? `🙋 Mesa ${rec.mesa} llama`
      : `🔔 Comanda nueva · Mesa ${rec.mesa}`;
    const body = esAviso
      ? String(items[0]?.nombre || "Aviso de mesa").replace("⚑", "").trim()
      : `${items.reduce((a: number, i: { qty?: number }) => a + (Number(i?.qty) || 1), 0)} artículos · ${Number(rec.total || 0).toFixed(2)} €`;
    const msg = JSON.stringify({ title, body, tag: "comanda", url: "./#/barra" });

    // Enviar a todos; si una suscripción ya no existe (404/410), se borra sola.
    await Promise.allSettled(subs.map((s: { endpoint: string; sub: object }) =>
      webpush.sendNotification(s.sub as never, msg).catch(async (err: { statusCode?: number }) => {
        if (err && (err.statusCode === 404 || err.statusCode === 410)) {
          await fetch(`${url}/rest/v1/push_subs?endpoint=eq.${encodeURIComponent(s.endpoint)}`, {
            method: "DELETE",
            headers: { apikey: key, Authorization: `Bearer ${key}` },
          });
        }
      })
    ));

    return new Response("ok");
  } catch (_e) {
    return new Response("ok");
  }
});

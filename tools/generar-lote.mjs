// GENERADOR MASIVO DE DEMOS — para prospección.
// Le das una lista de negocios (JSON) y te fabrica la app de cada uno + el kit de contacto.
//
// Uso:  node tools/generar-lote.mjs lista-negocios.json
//   lista-negocios.json = [ { "nombre":"Café X", "ciudad":"Las Palmas",
//                             "telefono":"928...", "whatsapp":"34...", "web":"...",
//                             "plan":"medio", "carta":[...]? }, ... ]
//
// Genera:  apps/bares/<id>.html   (una por negocio)
//          apps/bares/_contacto.csv  + _contacto.md   (mensajes listos para enviar)
//
// El telefono se usa solo para el kit de contacto. whatsapp (móvil) va dentro de la app.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { generarBar } from "./generar-bar.mjs";

const __dir = dirname(fileURLToPath(import.meta.url));
const root = join(__dir, "..");

// Carta de muestra NEUTRA (sin marca) para los que no traen carta propia:
const CARTA_DEMO = [
  { cat:"Cafés", zona:"barra", nombre:"Café solo", desc:"Espresso.", precio:1.2, emoji:"☕" },
  { cat:"Cafés", zona:"barra", nombre:"Café con leche", desc:"El de siempre.", precio:1.4, emoji:"☕", dest:true, al:["lactosa"] },
  { cat:"Cafés", zona:"barra", nombre:"Cortado", desc:"Con un toque de leche.", precio:1.3, emoji:"☕" },
  { cat:"Cafés", zona:"barra", nombre:"Caña / Cerveza", desc:"Bien fría.", precio:1.8, emoji:"🍺", al:["gluten"] },
  { cat:"Cafés", zona:"barra", nombre:"Refresco / Agua", desc:"Pregunta opciones.", precio:1.8, emoji:"🥤" },
  { cat:"Desayunos", zona:"cocina", nombre:"Tostada con tomate", desc:"Pan tostado, tomate y AOVE.", precio:1.8, emoji:"🍅", dest:true, al:["gluten"] },
  { cat:"Desayunos", zona:"cocina", nombre:"Croissant a la plancha", desc:"Con mantequilla.", precio:1.6, emoji:"🥐", al:["gluten","lactosa"] },
  { cat:"Bocadillos", zona:"cocina", nombre:"Bocadillo", desc:"En pan del día.", precio:3.5, emoji:"🥪", al:["gluten"], mods:{ elige:[{ t:"Relleno", o:["Jamón","Queso","Tortilla","Lomo","Mixto"] }] } },
  { cat:"Para picar", zona:"cocina", nombre:"Tapa del día", desc:"Pregunta al personal.", precio:3.0, emoji:"🍢", dest:true },
  { cat:"Postres", zona:"cocina", nombre:"Tarta casera", desc:"De la casa.", precio:3.5, emoji:"🍰", al:["gluten","lactosa","huevo"] },
];

function slug(s){ return String(s||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,40); }
function csvCell(v){ let s=String(v==null?"":v); if(/^[=+\-@\t\r]/.test(s)) s="'"+s; if(/[",;\n]/.test(s)) s='"'+s.replace(/"/g,'""')+'"'; return s; }
function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }

// Landing de VENTA personalizada (lo que envías): saluda al negocio y abre su demo.
const STUDIO_WA = process.env.STUDIO_WA || "";  // tu WhatsApp para que te contesten (34...)
function landingVenta(nombre, ciudad, rating, n, appHtml){
  const b64 = Buffer.from(appHtml, "utf8").toString("base64");
  const stars = rating ? ("★".repeat(Math.round(rating)) + " " + rating + (n?(" · "+n+" reseñas"):"")) : "";
  const waBtn = STUDIO_WA
    ? `<a class="wa" href="https://wa.me/${STUDIO_WA}?text=${encodeURIComponent("Hola, me interesa la app para "+nombre)}" target="_blank" rel="noopener">💬 Me interesa, hablamos</a>`
    : `<a class="wa" href="#" onclick="alert('Pon tu WhatsApp con STUDIO_WA al generar el lote');return false">💬 Me interesa, hablamos</a>`;
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(nombre)} · Tu app está lista</title>
<style>
:root{--brand:#e0871a;--brand-d:#b96a06;--ink:#23262c;--mut:#6f7480;--soft:#faf3e8}
*{box-sizing:border-box}body{margin:0;font:17px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:var(--ink);background:#fbf8f3}
.wrap{max-width:560px;margin:0 auto;padding:34px 20px 60px;text-align:center}
.kicker{color:var(--brand-d);font-weight:800;letter-spacing:.14em;text-transform:uppercase;font-size:12px}
h1{font-size:30px;line-height:1.15;margin:8px 0 6px}
h1 span{color:var(--brand-d)}
.stars{color:var(--brand-d);font-weight:700;margin:2px 0 16px}
.lead{color:var(--mut);font-size:17px;margin:0 auto 24px;max-width:460px}
.cta{display:inline-block;background:var(--brand);color:#fff;font-weight:800;font-size:18px;padding:16px 30px;border-radius:14px;border:0;cursor:pointer;text-decoration:none;box-shadow:0 12px 28px rgba(224,135,26,.35)}
.cta:hover{background:var(--brand-d)}
.feats{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:30px 0}
.feat{background:#fff;border:1px solid #ece8e0;border-radius:14px;padding:14px}
.feat .e{font-size:24px}.feat b{display:block;font-size:14.5px;margin-top:4px}.feat span{font-size:13px;color:var(--mut)}
.wa{display:inline-block;margin-top:8px;background:#25d366;color:#fff;font-weight:800;padding:13px 26px;border-radius:12px;text-decoration:none}
.foot{margin-top:34px;color:#9b978e;font-size:13px}
.foot a{color:var(--brand-d);font-weight:700;text-decoration:none}
.ov{position:fixed;inset:0;z-index:9999;background:#070b12;display:none;flex-direction:column}
.ov .bar{height:52px;flex:0 0 auto;display:flex;align-items:center;gap:12px;padding:0 14px;background:#0b1220;color:#eaf1fb}
.ov .bar button{background:var(--brand);color:#fff;border:0;border-radius:999px;padding:9px 18px;font-weight:800;cursor:pointer}
.ov iframe{flex:1;width:100%;border:0;background:#070b12}
@media(max-width:480px){.feats{grid-template-columns:1fr}h1{font-size:26px}}
</style></head>
<body>
<div class="wrap">
  <div class="kicker">Hecho para ti</div>
  <h1>${esc(nombre)}, <span>tu app ya está lista</span></h1>
  ${stars?`<div class="stars">${stars} en Google</div>`:""}
  <p class="lead">Hemos preparado <b>tu propia app de pedidos por QR</b>: tus clientes escanean en la mesa, piden desde el móvil y la comanda llega directa a la barra. Sin esperar al camarero. Échale un vistazo 👇</p>
  <button class="cta" id="ver">▶️ Ver mi app en marcha</button>
  <div class="feats">
    <div class="feat"><div class="e">🔔</div><b>Menos camareros</b><span>El cliente pide solo.</span></div>
    <div class="feat"><div class="e">⚡</div><b>Cero errores</b><span>La comanda llega escrita.</span></div>
    <div class="feat"><div class="e">💸</div><b>Se vende más</b><span>Carta con fotos y más pedidos.</span></div>
    <div class="feat"><div class="e">🧾</div><b>No toca tu caja</b><span>Cobras como siempre.</span></div>
  </div>
  ${waBtn}
  <div class="foot">Diseñado por <b>Incuba tu Negocio</b> · por Jaime M. M.</div>
</div>
<div class="ov" id="ov"><div class="bar"><button id="volver">← Volver</button><span style="opacity:.7;font-size:14px">Tu app · vista previa</span></div><iframe id="fr" title="Tu app"></iframe></div>
<script>
var APP="${b64}";
function dec(b){return new TextDecoder().decode(Uint8Array.from(atob(b),function(c){return c.charCodeAt(0)}))}
document.getElementById('ver').onclick=function(){var ov=document.getElementById('ov');ov.style.display='flex';document.getElementById('fr').srcdoc=dec(APP);};
document.getElementById('volver').onclick=function(){var ov=document.getElementById('ov');ov.style.display='none';document.getElementById('fr').removeAttribute('srcdoc');};
</script>
</body></html>`;
}

const listaPath = process.argv[2];
if(!listaPath){ console.error("Uso: node tools/generar-lote.mjs lista-negocios.json"); process.exit(1); }
const negocios = JSON.parse(readFileSync(listaPath,"utf8"));
if(!Array.isArray(negocios)||!negocios.length){ console.error("La lista está vacía o no es un array."); process.exit(1); }

const tpl = readFileSync(join(root,"apps","restaurante-qr-ejemplo.html"),"utf8");
const dir = join(root,"apps","bares"); mkdirSync(dir,{recursive:true});

const filas = [["Negocio","Ciudad","Telefono","Web","Plan","Archivo","Mensaje WhatsApp"]];
let md = "# Kit de contacto — demos generadas\n\n";
let n = 0;

for(const b of negocios){
  if(!b || !b.nombre){ console.log("⚠ negocio sin nombre, saltado"); continue; }
  const id = b.id ? slug(b.id) : (slug(b.nombre) + (b.ciudad?("-"+slug(b.ciudad)):""));
  const datos = {
    id,
    nombre: b.nombre,
    ciudad: b.ciudad || "[Tu ciudad]",
    whatsapp: b.whatsapp || "",
    email: b.email || "",
    password: b.password || (slug(b.nombre).replace(/-/g,"")+"2026").slice(0,16),
    plan: b.plan || "medio",
    mesas: b.mesas || 10,
    horario: b.horario || "",
    carta: Array.isArray(b.carta) && b.carta.length ? b.carta : CARTA_DEMO,
  };
  const html = generarBar(tpl, datos);
  writeFileSync(join(dir, id + ".html"), html);                       // la app real (para entregar al cerrar)
  writeFileSync(join(dir, id + "-venta.html"),                        // la landing de venta (lo que ENVÍAS)
    landingVenta(b.nombre, datos.ciudad, b.rating||"", b.n||"", html));
  n++;

  // Secuencia de seguimiento (3 toques)
  const m1 = `Hola ${b.nombre} 👋 Soy de Incuba tu Negocio. Os he preparado vuestra PROPIA app de pedidos por QR (el cliente escanea en la mesa y pide desde el móvil; la comanda llega directa a la barra). Ya está montada con vuestro nombre, miradla aquí 👇 [ENLACE]. ¿Os la enseño en 2 minutos, sin compromiso?`;
  const m2 = `Hola ${b.nombre}, ¿pudisteis ver la app que os preparé? 🙂 Es gratis probarla y os ahorra camareros en las horas punta. Aquí la tenéis otra vez 👇 [ENLACE]`;
  const m3 = `Hola ${b.nombre}, último toque y os dejo tranquilos 🙏 Si os interesa tener vuestra app de pedidos (alta + ${datos.plan}), decídmelo y os la activo esta semana. Si no, sin problema. ¡Gracias!`;
  filas.push([b.nombre, datos.ciudad, b.telefono||b.whatsapp||"", b.web||"", datos.plan, "apps/bares/"+id+"-venta.html", m1]);
  md += `## ${b.nombre} — ${datos.ciudad}\n`;
  md += `- 📞 ${b.telefono||b.whatsapp||"(sin teléfono)"}  ·  🌐 ${b.web||"-"}  ·  plan **${datos.plan}**  ·  ⭐ ${b.rating||"-"}\n`;
  md += `- 📤 Envía: \`apps/bares/${id}-venta.html\`  ·  Entrega al cerrar: \`apps/bares/${id}.html\`  ·  panel: \`${datos.password}\`\n`;
  md += `- **Toque 1:**\n\n> ${m1}\n\n- **Toque 2 (a los 3 días):**\n\n> ${m2}\n\n- **Toque 3 (a los 7 días):**\n\n> ${m3}\n\n---\n\n`;
}

writeFileSync(join(dir,"_contacto.csv"), "﻿"+filas.map(r=>r.map(csvCell).join(";")).join("\n"));
writeFileSync(join(dir,"_contacto.md"), md);

console.log(`\n✅ ${n} demo(s) generadas en apps/bares/`);
console.log("📇 Kit de contacto: apps/bares/_contacto.csv  y  _contacto.md");
console.log("   (sube cada .html a Netlify, pega el enlace en el mensaje y envía)");

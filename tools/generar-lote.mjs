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
  const file = join(dir, id + ".html");
  writeFileSync(file, html);
  n++;

  const msg = `Hola ${b.nombre} 👋 Soy de Incuba tu Negocio. Os he preparado vuestra propia app de pedidos por QR (el cliente escanea, pide desde su móvil y la comanda llega directa a la barra). Os la he montado YA con vuestro nombre, miradla aquí 👇 [pega aquí el enlace tras subirla]. Sin compromiso, ¿os la enseño en 2 minutos?`;
  filas.push([b.nombre, datos.ciudad, b.telefono||b.whatsapp||"", b.web||"", datos.plan, "apps/bares/"+id+".html", msg]);
  md += `## ${b.nombre} — ${datos.ciudad}\n`;
  md += `- 📞 ${b.telefono||b.whatsapp||"(sin teléfono)"}  ·  🌐 ${b.web||"-"}  ·  plan **${datos.plan}**\n`;
  md += `- App: \`apps/bares/${id}.html\`  ·  contraseña panel: \`${datos.password}\`\n`;
  md += `- WhatsApp:\n\n> ${msg}\n\n---\n\n`;
}

writeFileSync(join(dir,"_contacto.csv"), "﻿"+filas.map(r=>r.map(csvCell).join(";")).join("\n"));
writeFileSync(join(dir,"_contacto.md"), md);

console.log(`\n✅ ${n} demo(s) generadas en apps/bares/`);
console.log("📇 Kit de contacto: apps/bares/_contacto.csv  y  _contacto.md");
console.log("   (sube cada .html a Netlify, pega el enlace en el mensaje y envía)");

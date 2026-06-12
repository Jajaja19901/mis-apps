// Generador de altas de bares — motor.
// Toma la plantilla (apps/restaurante-qr-ejemplo.html) y los datos de un bar,
// y devuelve un HTML autocontenido listo para subir a internet.
//
// Uso CLI:  node tools/generar-bar.mjs datos-bar.json
//   donde datos-bar.json = { id, nombre, ciudad, whatsapp, email, password,
//                            mesas, horario, cloudUrl, cloudKey, carta:[...] }
// Sale en  apps/bares/<id>.html
//
// La MISMA función generarBar() se usa también dentro de tools/generador-bares.html
// (herramienta visual). Si tocas la lógica, mantén las dos iguales.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// — valor seguro dentro de una cadena JS entre comillas dobles —
function jsStr(s){ return String(s==null?"":s).replace(/\\/g,"\\\\").replace(/"/g,'\\"').replace(/\r?\n/g," ").trim(); }
// — nº entero seguro —
function intOr(v,def){ const n=parseInt(v,10); return Number.isFinite(n)&&n>0?n:def; }

export function generarBar(tpl, d){
  d=d||{};
  let out=tpl;
  const set=(re,val)=>{ out=out.replace(re, val); };
  // — CONFIG: identidad —
  if(d.nombre)   set(/BUSINESS_NAME:"[^"]*"/, 'BUSINESS_NAME:"'+jsStr(d.nombre)+'"');
  if(d.ciudad)   set(/CITY:"[^"]*"/,          'CITY:"'+jsStr(d.ciudad)+'"');
  if(d.whatsapp!=null) set(/WHATSAPP:"[^"]*"/, 'WHATSAPP:"'+jsStr(String(d.whatsapp).replace(/[^0-9]/g,""))+'"');
  if(d.email)    set(/EMAIL:"[^"]*"/,         'EMAIL:"'+jsStr(d.email)+'"');
  if(d.password) set(/ADMIN_PASSWORD:"[^"]*"/,'ADMIN_PASSWORD:"'+jsStr(d.password)+'"');
  if(d.mesas)    set(/MESAS:\d+/,             'MESAS:'+intOr(d.mesas,12));
  if(d.horario!=null) set(/HORARIO:"[^"]*"/,  'HORARIO:"'+jsStr(d.horario)+'"');
  // — CONFIG: modo nube —
  if(d.cloudUrl!=null) set(/CLOUD_URL:"[^"]*"/,'CLOUD_URL:"'+jsStr(d.cloudUrl)+'"');
  if(d.cloudKey!=null) set(/CLOUD_KEY:"[^"]*"/,'CLOUD_KEY:"'+jsStr(d.cloudKey)+'"');
  if(d.id)       set(/BAR_ID:"[^"]*"/,        'BAR_ID:"'+jsStr(d.id)+'"');
  // — Carta de fábrica (opcional) —
  if(Array.isArray(d.carta)&&d.carta.length){
    const limpia=d.carta.map(p=>({
      cat:String(p.cat||"Para picar"), nombre:String(p.nombre||"").slice(0,80),
      desc:String(p.desc||"").slice(0,200), precio:Number(p.precio)||0,
      emoji:String(p.emoji||"🍽️").slice(0,4),
      ...(p.dest?{dest:true}:{}),
      ...(Array.isArray(p.al)&&p.al.length?{al:p.al.map(String)}:{})
    })).filter(p=>p.nombre);
    set(/const PRESET_CARTA=null;/, "const PRESET_CARTA="+JSON.stringify(limpia)+";");
  }
  // — Quitar el arnés de QA: los tests de aceptación son nuestros, no del cliente —
  out=out.replace(/<script type="application\/json" id="acceptance-tests">[\s\S]*?<\/script>/, "");
  return out;
}

// — CLI —
const __dir=dirname(fileURLToPath(import.meta.url));
const root=join(__dir,"..");
const isMain = process.argv[1] && fileURLToPath(import.meta.url)===process.argv[1];
if(isMain){
  const cfgPath=process.argv[2];
  if(!cfgPath){ console.error("Uso: node tools/generar-bar.mjs datos-bar.json"); process.exit(1); }
  const datos=JSON.parse(readFileSync(cfgPath,"utf8"));
  if(!datos.id){ console.error("Falta 'id' (identificador único del bar)."); process.exit(1); }
  const tpl=readFileSync(join(root,"apps","restaurante-qr-ejemplo.html"),"utf8");
  const html=generarBar(tpl,datos);
  const dir=join(root,"apps","bares"); mkdirSync(dir,{recursive:true});
  const file=join(dir, datos.id.replace(/[^a-z0-9\-]/gi,"-").toLowerCase()+".html");
  writeFileSync(file,html);
  console.log("✅ App generada:", file.replace(root+"/",""));
}

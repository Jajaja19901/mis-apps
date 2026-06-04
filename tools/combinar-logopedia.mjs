// Combina las dos apps de logopedia (niños + adultos) en UN solo archivo HTML
// autocontenido, con una portada que deja elegir el público. Cada app se incrusta
// completa dentro de un <iframe srcdoc>, así no se pisan estilos ni lógica.
// El HTML de cada app se guarda en base64 para no romper el documento contenedor.
//   node tools/combinar-logopedia.mjs
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = f => fs.readFileSync(path.join(root, 'apps', f), 'utf8');
const b64 = f => Buffer.from(read(f), 'utf8').toString('base64');

const ninos = b64('logopedia-infantil.html');
const adultos = b64('logopedia-adultos.html');
const WA = '34611773150';

const shell = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Laura M M · Logopedia</title>
<meta name="description" content="Logopedia de Laura M M: apoyo para ninos (ensenar a hablar y leer) y para adultos (afasia, ELA, memoria). Elige el publico y practica en casa.">
<meta name="theme-color" content="#2563b8">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="Logopedia">
<link rel="apple-touch-icon" id="appleIcon">
<link rel="icon" id="favicon">
<style>
:root{--brand:#2563b8;--ink:#16202b;--soft:#54657a;--line:#dde6f0;--bg:#eef3fb;--surface:#fff;--teal:#0e7c86}
*{box-sizing:border-box}
body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:var(--ink);background:var(--bg)}
#chooser{min-height:100dvh;display:flex;flex-direction:column}
.ch-head{text-align:center;padding:42px 20px 8px}
.ch-mark{width:78px;height:78px;margin:0 auto 10px}
.ch-head h1{font-size:30px;font-weight:800;margin:.1em 0 .15em}
.ch-head p{color:var(--soft);max-width:520px;margin:0 auto;font-size:17px;line-height:1.5}
.ch-cards{flex:1;display:grid;gap:18px;grid-template-columns:1fr;align-content:center;max-width:760px;width:100%;margin:0 auto;padding:18px 18px 8px}
@media(min-width:640px){.ch-cards{grid-template-columns:1fr 1fr}}
.ch-card{background:var(--surface);border:1.5px solid var(--line);border-radius:24px;padding:30px 24px;cursor:pointer;font-family:inherit;text-align:center;box-shadow:0 6px 26px rgba(20,60,110,.08);transition:.15s}
.ch-card:hover{transform:translateY(-3px);box-shadow:0 12px 34px rgba(20,60,110,.16)}
.ch-card .ce{font-size:62px;line-height:1}
.ch-card.kids{border-top:6px solid #2563b8}
.ch-card.adults{border-top:6px solid #0e7c86}
.ch-card b{display:block;font-size:23px;margin:12px 0 4px}
.ch-card small{color:var(--soft);font-size:15.5px;line-height:1.45;display:block}
.ch-card .pill{display:inline-block;margin-top:14px;background:#eef4fc;color:#194f96;border-radius:999px;padding:8px 16px;font-weight:800;font-size:15px}
.ch-card.adults .pill{background:#dff0f1;color:#0a585f}
.ch-foot{text-align:center;padding:12px 16px 22px;color:var(--soft);font-size:13px}
.ch-foot a{color:var(--soft)} .ch-foot .inst{background:none;border:1px solid var(--line);border-radius:10px;padding:8px 12px;font-weight:700;color:var(--soft);cursor:pointer;font-family:inherit;margin-bottom:8px}
#stage{position:fixed;inset:0;flex-direction:column;background:#fff;display:flex}
#stage[hidden]{display:none}
.bar{height:52px;flex:0 0 auto;display:flex;align-items:center;gap:10px;padding:0 12px;border-bottom:1px solid var(--line);background:var(--surface)}
.bar button{border:1.5px solid var(--line);background:#fff;border-radius:12px;padding:9px 14px;font-size:15px;font-weight:800;cursor:pointer;font-family:inherit;color:var(--ink)}
.bar button:hover{border-color:var(--brand)}
.bar .ttl{font-weight:800;font-size:16px}
#frame{flex:1;width:100%;border:0;display:block}
:focus-visible{outline:3px solid var(--brand);outline-offset:2px}
.toast{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);background:#16202b;color:#fff;padding:11px 16px;border-radius:12px;font-weight:700;z-index:60;opacity:0;transition:.25s;pointer-events:none}
.toast.show{opacity:1}
</style>
</head>
<body>
<div id="app">
  <section id="chooser">
    <div class="ch-head">
      <div class="ch-mark" id="mark"></div>
      <h1>Laura M M &middot; Logopedia</h1>
      <p>Elige para quien es. Cada parte tiene sus propios ejercicios y se lee en voz alta.</p>
    </div>
    <div class="ch-cards">
      <button class="ch-card kids" data-action="go" data-m="ninos">
        <span class="ce" aria-hidden="true">&#129490;</span>
        <b>Para ninos</b>
        <small>Ensenar a hablar y a leer: articulacion, vocabulario, lectoescritura, comunicar y agenda visual (TEA).</small>
        <span class="pill">Entrar &rarr;</span>
      </button>
      <button class="ch-card adults" data-action="go" data-m="adultos">
        <span class="ce" aria-hidden="true">&#129489;</span>
        <b>Para adultos</b>
        <small>Rehabilitacion neurologica: comunicacion (afasia, ELA), lenguaje, memoria y orientacion, y praxias.</small>
        <span class="pill">Entrar &rarr;</span>
      </button>
    </div>
    <div class="ch-foot">
      <div><button class="inst" id="installBtn" data-action="install" style="display:none">&#128241; Instalar app</button></div>
      <a href="https://wa.me/${WA}" target="_blank" rel="noopener noreferrer">Contacto &middot; WhatsApp</a>
      <div style="margin-top:8px;color:#5b6b7b">Disenado por Incuba tu Negocio &middot; por Jaime M. M.</div>
    </div>
  </section>
  <section id="stage" hidden>
    <div class="bar"><button data-action="home" aria-label="Volver a elegir">&larr; Elegir</button><span class="ttl" id="stageTitle"></span></div>
    <iframe id="frame" title="Aplicacion de logopedia" allow="autoplay"></iframe>
  </section>
</div>

<script type="application/json" id="acceptance-tests">
[
  { "name": "La portada deja elegir ninos o adultos", "steps": [
    { "goto": "#" }, { "expectVisible": "#chooser" }, { "expect": "Para ninos" }, { "expect": "Para adultos" } ]},
  { "name": "Abrir la app de ninos", "steps": [
    { "goto": "#/ninos" }, { "expectVisible": "#frame" } ]},
  { "name": "Abrir la app de adultos", "steps": [
    { "goto": "#/adultos" }, { "expectVisible": "#frame" } ]},
  { "name": "Volver a la portada desde una app", "steps": [
    { "goto": "#/ninos" }, { "click": "[data-action=\\"home\\"]" }, { "expectVisible": "#chooser" } ]}
]
</script>

<script type="text/plain" id="src-ninos">${ninos}</script>
<script type="text/plain" id="src-adultos">${adultos}</script>

<script>
"use strict";
var MARK='<svg viewBox="0 0 48 48" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect width="48" height="48" rx="13" fill="#2563b8"/><path d="M12 15h17a3.4 3.4 0 0 1 3.4 3.4v7A3.4 3.4 0 0 1 29 28.8H20l-5 4.2v-4.2h-.6A2.4 2.4 0 0 1 12 26.4z" fill="#fff"/><circle cx="36" cy="30" r="9" fill="#0e7c86"/><path d="M32.5 30l2.4 2.4 4.6-4.8" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function iconURI(){ return "data:image/svg+xml,"+encodeURIComponent(MARK); }
var TITLES={ninos:"\\uD83E\\uDDD2 Para ninos",adultos:"\\uD83E\\uDDD1 Para adultos"};
var loaded=null;
function appHTML(id){ var b=(document.getElementById(id).textContent||"").trim(); var bin=atob(b); var u=new Uint8Array(bin.length); for(var i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i); return new TextDecoder("utf-8").decode(u); }
function show(mode){
  var ch=document.getElementById("chooser"), st=document.getElementById("stage"), fr=document.getElementById("frame");
  if(mode==="ninos"||mode==="adultos"){
    if(loaded!==mode){ try{ fr.srcdoc=appHTML("src-"+mode); }catch(e){} loaded=mode; }
    document.getElementById("stageTitle").textContent=TITLES[mode];
    ch.hidden=true; st.hidden=false;
  } else { st.hidden=true; ch.hidden=false; }
  try{ window.scrollTo(0,0); }catch(e){}
}
function route(){ var h=(location.hash||"").replace(/^#\\/?/,""); show(h==="ninos"||h==="adultos"?h:null); }
var toastT;
function toast(m){var t=document.getElementById("t");if(!t){t=document.createElement("div");t.id="t";t.className="toast";document.body.appendChild(t);}t.textContent=m;t.classList.add("show");clearTimeout(toastT);toastT=setTimeout(function(){t.classList.remove("show");},2200);}
var dp=null;
window.addEventListener("beforeinstallprompt",function(e){e.preventDefault();dp=e;var b=document.getElementById("installBtn");if(b)b.style.display="inline-block";});
function install(){ if(dp){dp.prompt();try{dp.userChoice.finally(function(){dp=null;});}catch(e){dp=null;}return;} var ios=/iphone|ipad|ipod/i.test(navigator.userAgent); toast(ios?"Pulsa Compartir y Anadir a inicio":"Menu del navegador y Instalar app"); }
document.addEventListener("click",function(e){
  var el=e.target.closest("[data-action]"); if(!el) return;
  var a=el.dataset.action;
  if(a==="go") location.hash="#/"+el.dataset.m;
  else if(a==="home") location.hash="#/";
  else if(a==="install") install();
});
(function pwa(){
  try{
    var ic=iconURI(); var f=document.getElementById("favicon"),ap=document.getElementById("appleIcon"); if(f)f.href=ic; if(ap)ap.href=ic;
    document.getElementById("mark").innerHTML=MARK;
    var man={name:"Laura M M - Logopedia",short_name:"Logopedia",start_url:".",display:"standalone",background_color:"#eef3fb",theme_color:"#2563b8",icons:[{src:ic,sizes:"any",type:"image/svg+xml"}]};
    var b=new Blob([JSON.stringify(man)],{type:"application/manifest+json"});var l=document.createElement("link");l.rel="manifest";l.href=URL.createObjectURL(b);document.head.appendChild(l);
  }catch(e){}
})();
window.addEventListener("hashchange",route);
route();
</script>
</body>
</html>
`;

fs.writeFileSync(path.join(root, 'apps', 'logopedia-laura.html'), shell);
console.log('OK apps/logopedia-laura.html (' + (shell.length / 1024).toFixed(0) + ' KB)');

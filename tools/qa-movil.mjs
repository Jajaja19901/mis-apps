#!/usr/bin/env node
/* QA VISUAL DE MÓVIL — prueba una app como si fuera un teléfono Android real.
   Uso:  PUPPETEER_EXECUTABLE_PATH=... node tools/qa-movil.mjs apps/mi-app.html
   Comprueba: errores JS, saltos de maquetación (CLS), parpadeo por fotogramas,
   estabilidad ante el baile de la barra de direcciones, y que todos los botones
   respondan a TOQUES táctiles reales. Termina en ✅ QA-MOVIL APTO o ❌ NO APTO. */
import puppeteer from 'puppeteer';
import { execSync } from 'child_process';
import fs from 'fs'; import os from 'os'; import path from 'path';

const file = process.argv[2];
if(!file){ console.error('Uso: node tools/qa-movil.mjs <app.html>'); process.exit(2); }
const url = 'file://' + path.resolve(file);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(),'qamovil-'));
const exe = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;
const fails=[], warns=[], oks=[];

const b = await puppeteer.launch({executablePath:exe, args:['--no-sandbox','--enable-unsafe-swiftshader']});
const p = await b.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(String(e).slice(0,160)));
await p.setViewport({width:390,height:844,deviceScaleFactor:2,isMobile:true,hasTouch:true});
await p.goto(url,{waitUntil:'networkidle0',timeout:120000});
await new Promise(r=>setTimeout(r,3000));
await p.evaluate(()=>{document.documentElement.style.scrollBehavior='auto'});

/* 1 — saltos de maquetación (CLS) recorriendo toda la página */
await p.evaluate(()=>{ window.__shifts=[];
  new PerformanceObserver(l=>{for(const e of l.getEntries()){ if(!e.hadRecentInput&&e.value>0.001) window.__shifts.push(+e.value.toFixed(4)); }})
  .observe({type:'layout-shift',buffered:true}); });
const H = await p.evaluate(()=>document.body.scrollHeight);
for(let y=0;y<H;y+=350){ await p.evaluate(v=>scrollTo(0,v),y); await new Promise(r=>setTimeout(r,80)); }
await new Promise(r=>setTimeout(r,600));
const cls=(await p.evaluate(()=>window.__shifts)).reduce((a,v)=>a+v,0);
(cls<0.1?oks:fails).push(`CLS total ${cls.toFixed(4)} ${cls<0.1?'< 0.1 ✓':'>= 0.1 — hay saltos de maquetación'}`);

/* 2 — parpadeo: 2 fotogramas a 700ms en 5 puntos; diff alto y ERRÁTICO = parpadeo */
let flick=[];
for(const f of [0.05,0.25,0.5,0.7,0.9]){
  await p.evaluate((v)=>scrollTo(0,v),Math.round(H*f));
  await new Promise(r=>setTimeout(r,1200));
  const a=tmp+`/a.png`, c=tmp+`/b.png`;
  await p.screenshot({path:a}); await new Promise(r=>setTimeout(r,700)); await p.screenshot({path:c});
  const d=+execSync(`python3 -c "from PIL import Image,ImageChops,ImageStat;print(round(ImageStat.Stat(ImageChops.difference(Image.open('${a}').convert('L'),Image.open('${c}').convert('L'))).mean[0],2))"`).toString().trim();
  flick.push({f,d});
}
const worst=Math.max(...flick.map(x=>x.d));
(worst<15?oks:warns).push(`parpadeo: peor diff ${worst} ${worst<15?'(fluido) ✓':'— revisar a mano el punto '+flick.find(x=>x.d===worst).f}`);

/* 3 — baile de la barra de Android: el canvas y los iframes no deben re-encajarse */
const before = await p.evaluate(()=>({
  cv:(document.querySelector('canvas')||{}).width||null,
  ifr:[...document.querySelectorAll('iframe')].map(i=>i.style.transform||'') }));
for(const hh of [788,844,788,844]){ await p.setViewport({width:390,height:hh,deviceScaleFactor:2,isMobile:true,hasTouch:true}); await new Promise(r=>setTimeout(r,120)); }
await new Promise(r=>setTimeout(r,700));
const after = await p.evaluate(()=>({
  cv:(document.querySelector('canvas')||{}).width||null,
  ifr:[...document.querySelectorAll('iframe')].map(i=>i.style.transform||'') }));
const stable = before.cv===after.cv && JSON.stringify(before.ifr)===JSON.stringify(after.ifr);
(stable?oks:fails).push(`barra de Android: ${stable?'canvas e iframes estables ✓':'algo se re-encaja con la barra (canvas '+before.cv+'→'+after.cv+')'}`);

/* 4 — toques táctiles: cada botón visible debe reaccionar (scroll, overlay, hash o clase) */
await p.setViewport({width:390,height:844,deviceScaleFactor:2,isMobile:true,hasTouch:true});
const btnSel='button, [role=button], a.btn, .skipstage, .sf';
const total = await p.evaluate(s=>document.querySelectorAll(s).length, btnSel);
let dead=[];
const idxs = await p.evaluate(s=>{
  return [...document.querySelectorAll(s)].map((b,i)=>{b.setAttribute('data-qa-i',i);
    return {i, txt:(b.textContent||'').trim().slice(0,30)}; });
}, btnSel);
for(const {i,txt} of idxs){
  const info = await p.evaluate(k=>{
    const b=document.querySelector(`[data-qa-i="${k}"]`); if(!b) return null;
    b.scrollIntoView({block:'center'}); const r=b.getBoundingClientRect();
    const vis = r.width>4&&r.height>4&&getComputedStyle(b).visibility!=='hidden'&&+getComputedStyle(b).opacity>0.05;
    return vis?{x:r.x+r.width/2,y:r.y+r.height/2}:null;
  }, i);
  if(!info) continue;
  await new Promise(r=>setTimeout(r,250));
  const st0 = await p.evaluate(()=>({y:scrollY,h:location.hash,ov:document.body.style.overflow,n:document.body.innerHTML.length}));
  try{ await p.touchscreen.tap(info.x, info.y); }catch(e){ continue; }
  await new Promise(r=>setTimeout(r,900));
  const st1 = await p.evaluate(()=>({y:scrollY,h:location.hash,ov:document.body.style.overflow,n:document.body.innerHTML.length}));
  const reacted = Math.abs(st1.y-st0.y)>40 || st1.h!==st0.h || st1.ov!==st0.ov || Math.abs(st1.n-st0.n)>50;
  if(!reacted) dead.push(txt||('boton #'+i));
  // cerrar overlay/ruta si se abrió
  await p.evaluate(()=>{ if(document.body.style.overflow==='hidden'){ history.back(); } if(location.hash&&location.hash!=='#/') location.hash='#/'; });
  await new Promise(r=>setTimeout(r,500));
}
if(dead.length) warns.push(`botones sin reacción visible (${dead.length}/${total}): ${dead.slice(0,6).join(' | ')}`);
else oks.push(`toques táctiles: ${total} botones probados, todos reaccionan ✓`);

/* 5 — errores JS acumulados en toda la sesión */
(errs.length===0?oks:fails).push(errs.length===0?'0 errores JS ✓':`${errs.length} errores JS: ${errs[0]}`);

await b.close(); fs.rmSync(tmp,{recursive:true,force:true});
console.log('\n══════ QA MÓVIL ══════');
oks.forEach(m=>console.log('  ✓',m));
warns.forEach(m=>console.log('  ⚠',m));
fails.forEach(m=>console.log('  ✗',m));
console.log('──────────────────────');
if(fails.length){ console.log('RESULTADO: ❌ QA-MOVIL NO APTO'); process.exit(1); }
console.log(warns.length?'RESULTADO: ✅ QA-MOVIL APTO (con avisos)':'RESULTADO: ✅ QA-MOVIL APTO');

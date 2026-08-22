// Renderiza las visuales MHcollective a un MP4 real (determinista, sin depender del reloj).
// Uso: node tools/render-video.mjs apps/mhcollective-visuals.html salida.mp4 <segundos> [fps] [ancho] [alto]
import puppeteer from 'puppeteer';
import { spawn } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';
import path from 'node:path';

const html = path.resolve(process.argv[2]);
const out  = path.resolve(process.argv[3]);
const secs = +(process.argv[4]||300);
const fps  = +(process.argv[5]||30);
const W    = +(process.argv[6]||1280);
const H    = +(process.argv[7]||720);
const total = Math.round(secs*fps);

console.log(`▶ Render: ${secs}s · ${fps}fps · ${W}x${H} · ${total} frames → ${path.basename(out)}`);

const ff = spawn(ffmpegPath, [
  '-y','-f','image2pipe','-framerate',String(fps),'-i','-',
  '-c:v','libx264','-pix_fmt','yuv420p','-crf','21','-preset','veryfast',
  '-movflags','+faststart', out
], { stdio:['pipe','ignore','ignore'] });

const browser = await puppeteer.launch({ headless:'new',
  args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=swiftshader',`--window-size=${W},${H}`] });
const page = await browser.newPage();
await page.setViewport({ width:W, height:H, deviceScaleFactor:1 });
const errs=[]; page.on('pageerror',e=>errs.push(e.message));
await page.goto(`file://${html}?render=1&fps=${fps}`, { waitUntil:'load' });
await page.evaluate(()=>window.__setup());

const t0=Date.now();
for(let n=0; n<total; n++){
  await page.evaluate(i=>window.__frame(i), n);
  const buf = await page.screenshot({ type:'jpeg', quality:92 });
  if(!ff.stdin.write(buf)) await new Promise(r=>ff.stdin.once('drain',r));
  if(n%300===0 || n===total-1){
    const done=(n+1)/total, el=(Date.now()-t0)/1000, eta=el/done-el;
    process.stdout.write(`\r  ${(done*100).toFixed(1)}%  frame ${n+1}/${total}  ${el.toFixed(0)}s  ETA ${eta.toFixed(0)}s   `);
  }
}
process.stdout.write('\n');
ff.stdin.end();
await new Promise(r=>ff.on('close',r));
await browser.close();
if(errs.length) console.log('⚠ errores de página:', errs.slice(0,4));
console.log('✓ Listo:', out);

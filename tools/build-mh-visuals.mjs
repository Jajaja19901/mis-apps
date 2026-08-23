// Reconstruye apps/mhcollective-visuals.html inyectando Butterchurn (self-contained).
// Requiere: npm i butterchurn butterchurn-presets   (node_modules está en .gitignore)
import fs from 'node:fs';
const bc=fs.readFileSync('node_modules/butterchurn/lib/butterchurn.min.js','utf8');
const pr=fs.readFileSync('node_modules/butterchurn-presets/lib/butterchurnPresetsMinimal.min.js','utf8');
let app=fs.readFileSync('tools/mh-visuals-template.html','utf8');
app=app.replace('/*__BUTTERCHURN__*/',()=>bc).replace('/*__PRESETS__*/',()=>pr);
fs.writeFileSync('apps/mhcollective-visuals.html',app);
console.log('OK', (app.length/1024|0)+'KB');

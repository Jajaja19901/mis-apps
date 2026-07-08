#!/usr/bin/env node
/**
 * ENSAMBLADOR + VALIDADOR — VIGÍA IA (Fase 2 del pipeline).
 * Monta apps/vigia-ia.html desde modulos/ y ejecuta el checklist §12:
 *   1. new Function() sobre TODO el JS (solo garantiza sintaxis, NO funcionamiento).
 *   2. Parser HTML: etiquetas sin cerrar, ids duplicados.
 *   3. Cada función pública de CONTRATOS.md existe y se referencia.
 *   4. Concatenaciones sospechosas ("+ +", NaN potenciales, console.error).
 * Uso: node modulos/ensamblar.mjs [--solo-validar]
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const M = (f) => path.join(RAIZ, "modulos", f);
const SALIDA = path.join(RAIZ, "apps", "vigia-ia.html");
const soloValidar = process.argv.includes("--solo-validar");

const errores = [];
const avisos = [];
const lee = (f) => {
  if (!existsSync(M(f))) { errores.push(`FALTA el archivo modulos/${f}`); return ""; }
  return readFileSync(M(f), "utf8");
};

/* ---------- 1. Reunir piezas ---------- */
const JS_ORDEN = [
  "00-nucleo.js", "01-tracker.js", "02-gestos.js", "03-zonas.js", "04-video.js",
  "05-ui.js", "06-alertas.js", "07-stats.js", "08-carretera.js", "09-ajustes.js",
  "10-pwa.js", "11-mando.js", "12-mandodash.js", "13-yolo.js",
  "14-detalle.js", "15-copiloto.js", "99-app.js",
];
// Los slots se sustituyen en orden: MANDO va antes que MANDODASH porque
// 11-mando.html contiene a su vez el marcador <!-- SLOT:MANDODASH -->.
const HTML_SLOTS = {
  "SLOT:VIDEO": "04-video.html",
  "SLOT:ZONAS": "03-zonas.html",
  "SLOT:ALERTAS": "06-alertas.html",
  "SLOT:STATS": "07-stats.html",
  "SLOT:CARRETERA": "08-carretera.html",
  "SLOT:AJUSTES": "09-ajustes.html",
  "SLOT:MANDO": "11-mando.html",
  "SLOT:MANDODASH": "12-mandodash.html",
  "SLOT:DETALLE": "14-detalle.html",
  "SLOT:COPILOTO": "15-copiloto.html",
};

const js = JS_ORDEN.map((f) => `/* ===== ${f} ===== */\n` + lee(f)).join("\n\n");
let cuerpo = lee("05-ui.html");
for (const [slot, archivo] of Object.entries(HTML_SLOTS)) {
  const marca = new RegExp(`<!--\\s*${slot}\\s*-->`);
  if (!marca.test(cuerpo)) { errores.push(`El esqueleto 05-ui.html no tiene el marcador <!-- ${slot} -->`); continue; }
  cuerpo = cuerpo.replace(marca, `\n<!-- ${slot} (inyectado desde ${archivo}) -->\n` + lee(archivo));
}
const css = lee("05-ui.css");
const tests = existsSync(M("acceptance-tests.json")) ? lee("acceptance-tests.json") : "[]";
try { JSON.parse(tests); } catch (e) { errores.push("acceptance-tests.json inválido: " + e.message); }

/* ---------- 2. Validar sintaxis JS ---------- */
try {
  new Function(js);
  console.log("✓ new Function() pasa sobre todo el JS (OJO: solo garantiza sintaxis, NO funcionamiento).");
} catch (e) {
  errores.push("Sintaxis JS: " + e.message);
  // localizar el módulo culpable
  for (const f of JS_ORDEN) {
    try { new Function(lee(f)); } catch (e2) { errores.push(`  ↳ probable culpable ${f}: ${e2.message}`); }
  }
}

/* ---------- 3. Validar HTML (etiquetas y'ids) ---------- */
// Para VALIDAR (no para la salida): fuera comentarios HTML y comentarios JS,
// que mencionan etiquetas y palabras prohibidas al documentarlas.
const cuerpoVal = cuerpo.replace(/<!--[\s\S]*?-->/g, "");
const jsVal = js
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n").map((l) => {
    const i = l.search(/(?<!["'`:\w])\/\/(?![^"']*["'`]\s*[,;)\]])/);
    return i >= 0 && !/https?:\/\//.test(l.slice(0, i + 2)) ? l.slice(0, i) : l;
  }).join("\n");
const VACIAS = new Set(["br","hr","img","input","meta","link","source","track","wbr","area","base","col","embed","param"]);
function validaHTML(html, origen) {
  const pila = [];
  const re = /<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^"'>])*)>/g;
  let m;
  while ((m = re.exec(html))) {
    const [tok, tag] = m; const t = tag.toLowerCase();
    if (VACIAS.has(t) || tok.endsWith("/>")) continue;
    if (tok[1] === "/") {
      let i = pila.length - 1;
      while (i >= 0 && pila[i].t !== t) i--;
      if (i < 0) errores.push(`${origen}: </${t}> sin apertura (pos ${m.index})`);
      else {
        if (i !== pila.length - 1) pila.slice(i + 1).forEach((p) => errores.push(`${origen}: <${p.t}> (pos ${p.pos}) quedó sin cerrar antes de </${t}>`));
        pila.length = i;
      }
    } else pila.push({ t, pos: m.index });
  }
  pila.forEach((p) => errores.push(`${origen}: <${p.t}> sin cerrar (pos ${p.pos})`));
}
validaHTML(cuerpoVal, "HTML ensamblado");
const ids = {};
for (const m2 of cuerpoVal.matchAll(/\sid\s*=\s*["']([^"']+)["']/g)) ids[m2[1]] = (ids[m2[1]] || 0) + 1;
Object.entries(ids).filter(([, n]) => n > 1).forEach(([id, n]) => errores.push(`id duplicado: "${id}" ×${n}`));
if (!errores.some((e) => e.includes("id duplicado") || e.includes("sin cerrar"))) console.log(`✓ HTML: ${Object.keys(ids).length} ids únicos, etiquetas balanceadas.`);

/* ---------- 4. Contratos: cada función pública existe y se usa ---------- */
const PUBLICAS = [
  "trk_init","trk_reiniciar","trk_actualizar","trk_velocidad","trk_pintar","trk_tracksDe",
  "gesto_init","gesto_procesar","gesto_pintar","gesto_puntuacion",
  "zona_init","zona_iniciarDibujo","zona_iniciarLinea","zona_terminarDibujo","zona_cancelarDibujo",
  "zona_borrar","zona_borrarTodo","zona_evaluar","zona_pintar","zona_puntoEnPoligono","zona_plazas",
  "vid_init","vid_usarCamara","vid_listarCamaras","vid_usarIP","vid_usarArchivo","vid_detener","vid_fuente",
  "vid_dimensiones","vid_registrarPintor","vid_componer","vid_capturaJPEG","vid_grabarEvento","vid_vigilarSabotaje",
  "ui_init","ui_render","ui_toast","ui_error","ui_onboarding","ui_aforoPublico","ui_abrirAjustes","ui_cerrarAjustes","ui_modal","ui_confirmar",
  "alerta_init","alerta_disparar","alerta_silenciar","alerta_probar","alerta_log","alerta_borrarLog",
  "alerta_ruidoInit","alerta_ruidoParar","alerta_telegramProbar",
  "stats_init","stats_acumular","stats_aforoActual","stats_datosHoy","stats_grafico",
  "stats_calorPintar","stats_calorReset","stats_calorExportar","stats_timelapseExportar","stats_datosCSV","stats_render",
  "car_init","car_evaluar","car_calibrarIniciar","car_velocidadKmh","car_pintar","car_render",
  "cfg_init","cfg_pinPedir","cfg_pinCambiar","cfg_generarCartel","cfg_exportarInforme","cfg_exportarCSV","cfg_restaurar","cfg_legalHTML",
  "pwa_init","pwa_wakeLock",
  "mando_init","mando_alternar","mando_fetch","mando_editarZonas",
  "mdash_init","mdash_grafico",
  "yolo_init","yolo_detectar","yolo_activo",
  "vid_usarDashcam","vid_probarDashcam",
  "det_init","det_pintar",
  "cop_init","cop_alternar",
];
for (const fn of PUBLICAS) {
  const def = new RegExp(`(?:function\\s+${fn}\\s*\\(|(?:const|let)\\s+${fn}\\s*=)`);
  if (!def.test(js)) { errores.push(`Contrato roto: no existe la función pública ${fn}()`); continue; }
  const usos = (js.match(new RegExp(`\\b${fn}\\b`, "g")) || []).length + (cuerpo.match(new RegExp(`\\b${fn}\\b`, "g")) || []).length;
  if (usos < 2) avisos.push(`La función ${fn}() existe pero nadie la llama (ni JS ni HTML).`);
}
if (!errores.some((e) => e.startsWith("Contrato roto"))) console.log(`✓ Contratos: las ${PUBLICAS.length} funciones públicas existen.`);

/* ---------- 5. Sospechosos ---------- */
if (/\+\s*\+(?!\+)/.test(jsVal.replace(/\+\+/g, ""))) avisos.push('Concatenación sospechosa "+ +" en el JS.');
for (const m3 of jsVal.matchAll(/console\.error\s*\(/g)) errores.push("console.error prohibido (el verificador lo trata como fallo). Usa console.warn + banner.");
if (/\bwindow\.storage\b/.test(jsVal)) errores.push("window.storage está PROHIBIDO.");
for (const m5 of jsVal.matchAll(/(?<![\w.$])(?:window\.)?(confirm|alert|prompt)\s*\(/g)) {
  errores.push(`Diálogo nativo bloqueante ${m5[1]}() prohibido (congela la app en headless): usa ui_confirmar/ui_modal/ui_toast.`);
}
if (/lorem ipsum/i.test(cuerpoVal + jsVal)) errores.push("Hay 'lorem ipsum' en el contenido.");
if (/\b(TODO|FIXME|PENDIENTE:)\b/.test(jsVal)) avisos.push("Quedan TODO/FIXME en el JS.");
for (const palabra of ["robo detectado", "ladr[oó]n", "hurto detect"]) {
  if (new RegExp(palabra, "i").test(cuerpoVal + jsVal)) errores.push(`Texto prohibido en la UI: "${palabra}" (usar "sospecha para revisión humana").`);
}
// onclick= de HTML que apunte a función inexistente
for (const m4 of cuerpoVal.matchAll(/onclick\s*=\s*["']\s*([a-zA-Z_$][\w$]*)\s*\(/g)) {
  if (!new RegExp(`function\\s+${m4[1]}\\s*\\(|(?:const|let)\\s+${m4[1]}\\s*=`).test(js)) {
    errores.push(`onclick apunta a función inexistente: ${m4[1]}()`);
  }
}

/* ---------- 6. Ensamblar ---------- */
const plantilla = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="Vigía IA — videovigilancia inteligente en el navegador: conteo de personas y vehículos, zonas, alertas y evidencia. Sin servidor, sin cuotas.">
<meta name="theme-color" content="#0b0f14">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<title>Vigía IA — Videovigilancia inteligente</title>
<style>
${css}
</style>
</head>
<body>
${cuerpo}
<script src="https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js"><\/script>
<script src="https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js"><\/script>
<script>
${js}
<\/script>
<script type="application/json" id="acceptance-tests">
${tests.trim()}
</script>
</body>
</html>
`;
// des-escapar los cierres de script de la plantilla (aquí eran literales)
const html = plantilla.replace(/<\\\/script>/g, "</script>");

/* ---------- Informe ---------- */
if (avisos.length) { console.log("\n⚠ AVISOS:"); avisos.forEach((a) => console.log("  · " + a)); }
if (errores.length) {
  console.log("\n✗ ERRORES:"); errores.forEach((e) => console.log("  · " + e));
  console.log("\nRESULTADO ENSAMBLADO: ❌ NO APTO");
  process.exit(1);
}
if (!soloValidar) {
  writeFileSync(SALIDA, html);
  console.log(`\n✓ Escrito ${path.relative(RAIZ, SALIDA)} (${Math.round(html.length / 1024)} KB)`);
}
console.log("RESULTADO ENSAMBLADO: ✅ OK\n");

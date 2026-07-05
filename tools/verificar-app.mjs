#!/usr/bin/env node
/**
 * VERIFICADOR DE APPS — la puerta automática de la fábrica.
 *
 * Abre una app desde file:// (como el cliente al hacer doble clic), en un
 * navegador real (Chromium headless, viewport móvil), y comprueba que está
 * VIVA: recorre cada ruta hash, pulsa cada botón/enlace, entra en los iframes
 * (overlays/demos) y caza errores de consola y "controles muertos" (cosas que
 * al pulsarlas no hacen absolutamente nada).
 *
 * Además, si la app trae embebidos sus TESTS DE ACEPTACIÓN en
 *   <script type="application/json" id="acceptance-tests">[{ "name":..., "steps":[...] }]</script>
 * los EJECUTA uno a uno (clic → resultado esperado) y falla si alguno no se cumple.
 * Pasos: goto, reload, wait, click, clickText, fill{sel,value}, check, submit,
 *        expect, expectHash, expectVisible, expectGone.
 *
 * Uso:
 *   npm i puppeteer            # una sola vez (Chromium queda en caché)
 *   node tools/verificar-app.mjs apps/mi-negocio.html [--shots] [--strict]
 *
 * Salida: imprime un informe y termina con código != 0 si hay ERRORES
 * (JS/consola o rutas rotas). Con --strict, los "controles muertos" también
 * hacen fallar el build. Pensado para que lo ejecuten el Agente 6, el Agente
 * 10 y el director antes de entregar.
 */
import path from "node:path";
import process from "node:process";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const SHOTS = args.includes("--shots");
const STRICT = args.includes("--strict");

if (!file) {
  console.error("Uso: node tools/verificar-app.mjs <ruta-al-.html> [--shots] [--strict]");
  process.exit(2);
}

let puppeteer;
try {
  puppeteer = (await import("puppeteer")).default;
} catch {
  console.error("Falta puppeteer. Instálalo con:  npm i puppeteer");
  process.exit(2);
}

const fileUrl = "file://" + path.resolve(file);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];
const warnings = [];
const ok = [];
let shotN = 0;

const browser = await puppeteer.launch({
  headless: "new",
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--allow-file-access-from-files"],
});
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
page.on("pageerror", (e) => errors.push("JS: " + e.message));
page.on("console", (m) => {
  if (m.type() === "error") {
    const t = m.text();
    // ignora ruido de recursos externos que no afectan a la lógica (fuentes, etc.)
    if (!/ERR_CERT|ERR_INTERNET|net::ERR|favicon/i.test(t)) errors.push("CONSOLA: " + t);
  }
});

async function shot(label) {
  if (!SHOTS) return;
  const p = `/tmp/verif_${String(++shotN).padStart(2, "0")}_${label}.png`;
  try { await page.screenshot({ path: p }); } catch {}
}

// Devuelve un "contexto" (la página o un frame) con helpers de inspección.
function ctxOf(frame) {
  return {
    frame,
    routes: () =>
      frame.evaluate(() =>
        [...new Set([...document.querySelectorAll('a[href^="#"]')].map((a) => a.getAttribute("href")))]
      ),
    controls: () =>
      frame.evaluate(() => {
        const sel = 'button, a[href], [role="button"], input[type="submit"], [onclick]';
        return [...document.querySelectorAll(sel)]
          .map((el, i) => {
            el.setAttribute("data-verif-idx", i);
            const r = el.getBoundingClientRect();
            const visible = r.width > 0 && r.height > 0 && el.offsetParent !== null;
            return { i, visible, label: (el.innerText || el.value || el.getAttribute("aria-label") || el.id || el.tagName).trim().slice(0, 40), href: el.getAttribute("href") || "" };
          })
          .filter((c) => c.visible);
      }),
    snapshot: () => frame.evaluate(() => document.body.innerHTML.length + "|" + location.hash + "|" + (document.querySelectorAll("*").length)),
    clickIdx: (i) =>
      frame.evaluate((idx) => {
        const el = document.querySelector(`[data-verif-idx="${idx}"]`);
        if (!el) return false;
        el.click();
        return true;
      }, i),
  };
}

async function load() {
  // OJO: no usamos "networkidle0". La app arranca la sincronización de Firebase,
  // que deja una conexión en vivo abierta; en un entorno con internet real (CI de
  // GitHub) la red nunca queda "en silencio" y el goto agotaría los 30 s. La app es
  // autocontenida (JS/CSS inline), así que con "domcontentloaded" ya está lista.
  await page.goto(fileUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
  await sleep(600);
  // Portada de entrada: en las pruebas se desbloquea sola (no es lo que se está probando aquí;
  // el flujo de la portada tiene su propia prueba dedicada).
  await page.evaluate(() => {
    try { if (typeof accesoClave === "function") localStorage.setItem("mh_acceso_ok", accesoClave()); } catch (e) {}
    if (typeof ocultarGate === "function") ocultarGate();
  }).catch(() => {});
}

// ===== Tests de aceptación por app (DSL embebido en <script type="application/json" id="acceptance-tests">) =====
// Pasos disponibles: goto, reload, wait, click, clickText, fill{sel,value}, check, submit,
//                    expect (texto que debe aparecer), expectHash, expectVisible, expectGone,
//                    copyText{sel,as}: guarda el texto de un elemento en una variable, y luego
//                    "$NOMBRE" se sustituye en cualquier paso (clave para códigos generados al azar).
function sustituirVars(valor, vars) {
  if (typeof valor !== "string") return valor;
  return valor.replace(/\$([A-Z][A-Z0-9_]*)/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));
}
async function runStep(step, vars = {}) {
  const k = Object.keys(step)[0];
  let v = step[k];
  if (typeof v === "string") v = sustituirVars(v, vars);
  else if (v && typeof v === "object") {
    v = { ...v };
    for (const key of Object.keys(v)) v[key] = sustituirVars(v[key], vars);
  }
  if (k === "copyText") {
    const txt = await page.evaluate((s) => { const e = document.querySelector(s); return e ? e.textContent.trim() : null; }, v.sel);
    if (txt === null) return { ok: false, msg: "no existe " + v.sel + " para copiar su texto" };
    vars[v.as] = txt;
    return { ok: true };
  }
  switch (k) {
    case "goto": await page.evaluate((h) => { location.hash = h; }, v); await sleep(280); return { ok: true };
    case "reload": await load(); return { ok: true };
    case "showGate": { await page.evaluate(() => { try { localStorage.removeItem("mh_acceso_ok"); } catch (e) {} try { duenoAutenticado = false; } catch (e) {} if (typeof chequearAcceso === "function") chequearAcceso(); else if (typeof mostrarGate === "function") mostrarGate(); }); await sleep(200); return { ok: true }; }
    case "wait": await sleep(Math.min(+v || 200, 3000)); return { ok: true };
    case "click": { const ok = await page.evaluate((s) => { const e = document.querySelector(s); if (!e) return false; e.click(); return true; }, v); await sleep(220); return { ok, msg: ok ? "" : "no existe el selector " + v }; }
    case "clickText": { const ok = await page.evaluate((t) => { const els = [...document.querySelectorAll('a,button,[role=button],input[type=submit],[data-action]')].filter((x) => x.offsetParent !== null && (x.innerText || x.value || "").includes(t)); if (!els.length) return false; els.sort((a, b) => (a.innerText || a.value || "").length - (b.innerText || b.value || "").length); els[0].click(); return true; }, v); await sleep(220); return { ok, msg: ok ? "" : 'no hay elemento visible con el texto "' + v + '"' }; }
    case "fill": { const ok = await page.evaluate((o) => { const e = document.querySelector(o.sel); if (!e) return false; e.value = o.value; e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); return true; }, v); return { ok, msg: ok ? "" : "no existe el campo " + (v && v.sel) }; }
    case "check": { const ok = await page.evaluate((s) => { const e = document.querySelector(s); if (!e) return false; e.checked = true; e.dispatchEvent(new Event("change", { bubbles: true })); return true; }, v); return { ok, msg: ok ? "" : "no existe el checkbox " + v }; }
    case "submit": { const ok = await page.evaluate((s) => { const e = document.querySelector(s); if (!e) return false; if (e.requestSubmit) e.requestSubmit(); else e.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true })); return true; }, v); await sleep(320); return { ok, msg: ok ? "" : "no existe el formulario " + v }; }
    case "expect": { const ok = await page.evaluate((t) => document.body.innerText.includes(t), v); return { ok, msg: ok ? "" : 'no aparece el texto "' + v + '"' }; }
    case "expectHash": { const cur = await page.evaluate(() => location.hash); return { ok: cur === v, msg: cur === v ? "" : 'el hash es "' + cur + '" y se esperaba "' + v + '"' }; }
    case "expectVisible": { const ok = await page.evaluate((s) => { const e = document.querySelector(s); return !!(e && e.offsetParent !== null); }, v); return { ok, msg: ok ? "" : "no está visible " + v }; }
    case "expectGone": { const ok = await page.evaluate((s) => { const e = document.querySelector(s); return !(e && e.offsetParent !== null); }, v); return { ok, msg: ok ? "" : "sigue visible " + v }; }
    default: return { ok: false, msg: "paso no reconocido: " + k };
  }
}
async function runAcceptanceTests() {
  let spec;
  try { spec = await page.evaluate(() => { const el = document.getElementById("acceptance-tests"); if (!el) return null; try { return JSON.parse(el.textContent); } catch (e) { return { __error: e.message }; } }); }
  catch (e) { spec = null; }
  if (spec === null) { ok.push("Tests de aceptación: la app no trae bloque #acceptance-tests (opcional pero recomendado)."); return; }
  if (spec && spec.__error) { errors.push("Bloque #acceptance-tests con JSON inválido: " + spec.__error); return; }
  const tests = Array.isArray(spec) ? spec : (spec.tests || []);
  if (!tests.length) { warnings.push("Bloque #acceptance-tests presente pero sin tests."); return; }
  let passed = 0;
  for (const t of tests) {
    await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
    await load();
    let fail = null;
    const steps = t.steps || [];
    const vars = {}; // variables del test (copyText/$NOMBRE), aisladas por test
    for (let i = 0; i < steps.length; i++) {
      const before = errors.length;
      let r;
      try { r = await runStep(steps[i], vars); } catch (e) { r = { ok: false, msg: e.message }; }
      if (errors.length > before) { fail = { i, msg: "error JS durante el paso" }; break; }
      if (!r.ok) { fail = { i, msg: r.msg || "falló" }; break; }
    }
    if (fail) errors.push(`Test "${t.name || "(sin nombre)"}" ❌ en el paso ${fail.i + 1}: ${fail.msg}`);
    else { passed++; ok.push(`Test de aceptación ✓ ${t.name || "(sin nombre)"}`); }
  }
  ok.push(`Tests de aceptación: ${passed}/${tests.length} en verde.`);
}

// 1) CARGA SIN ERRORES
await load();
await shot("carga");
const loadErrs = errors.splice(0);
if (loadErrs.length) loadErrs.forEach((e) => errors.push("[carga] " + e));
else ok.push("Carga inicial sin errores de consola.");

// 2) RECORRER CADA RUTA HASH (que renderice algo y no pete)
const main = ctxOf(page.mainFrame());
const routes = await main.routes();
for (const r of routes) {
  if (!r || r === "#") continue;
  const before = errors.length;
  try {
    await page.evaluate((h) => { location.hash = h; }, r);
    await sleep(250);
    const len = await page.evaluate(() => document.body.innerText.replace(/\s/g, "").length);
    if (len < 5) warnings.push(`Ruta ${r} renderiza casi vacía (¿pantalla en blanco?).`);
    else ok.push(`Ruta ${r} renderiza contenido.`);
  } catch (e) {
    errors.push(`Ruta ${r} lanzó: ${e.message}`);
  }
  if (errors.length > before) errors.push(`(↑ al navegar a ${r})`);
}
await page.evaluate(() => { location.hash = "#/"; }).catch(() => {});
await sleep(200);

// 3) PULSAR CADA CONTROL VISIBLE Y DETECTAR "MUERTOS" + ERRORES
//    (recarga antes para partir de un estado limpio)
async function scanControls(ctx, scope) {
  const controls = await ctx.controls();
  for (const c of controls) {
    const before = errors.length;
    const snapBefore = await ctx.snapshot();
    let clicked = false;
    try { clicked = await ctx.clickIdx(c.i); } catch {}
    await sleep(160);
    let snapAfter = "";
    try { snapAfter = await ctx.snapshot(); } catch {}
    const newErr = errors.length > before;
    if (newErr) errors.push(`(↑ al pulsar "${c.label}" en ${scope})`);
    const changed = snapAfter && snapAfter !== snapBefore;
    if (clicked && !changed && !newErr && !/^#/.test(c.href || "")) {
      warnings.push(`Control sin efecto visible: "${c.label}" en ${scope} (¿botón muerto?).`);
    } else if (clicked && (changed || newErr === false)) {
      // efecto detectado; nada que reportar
    }
  }
}

await load();
await scanControls(ctxOf(page.mainFrame()), "principal");

// 4) ENTRAR EN IFRAMES/OVERLAYS QUE SE HAYAN ABIERTO Y PROBAR DENTRO
await load();
// intenta abrir overlays pulsando enlaces que disparen iframes (demos, etc.)
const triggers = await page.$$('a[href$=".html"], .demo-card, [data-demo]');
for (const t of triggers) {
  try { await t.click(); await sleep(500); } catch {}
}
const frames = page.frames().filter((f) => f !== page.mainFrame());
if (frames.length) {
  for (const f of frames) {
    const fc = ctxOf(f);
    let froutes = [];
    try { froutes = await fc.routes(); } catch {}
    for (const r of froutes) {
      if (!r || r === "#") continue;
      const before = errors.length;
      try {
        await f.evaluate((h) => { const a = document.querySelector(`a[href="${h}"]`); if (a) a.click(); else location.hash = h; }, r);
        await sleep(250);
      } catch (e) { errors.push(`[iframe] ruta ${r}: ${e.message}`); }
      if (errors.length > before) errors.push(`(↑ dentro del iframe, ruta ${r})`);
    }
    try { await scanControls(fc, "iframe/demo"); } catch {}
  }
  ok.push(`Probados ${frames.length} iframe(s)/overlay(s) interno(s).`);
  await shot("iframe");
}

// 5) TESTS DE ACEPTACIÓN POR APP (cada criterio del cliente, probado clic a clic)
await runAcceptanceTests();

await browser.close();

// ===== INFORME =====
const line = "─".repeat(60);
console.log("\n" + line + "\nVERIFICACIÓN: " + file + "\n" + line);
ok.forEach((s) => console.log("  ✓ " + s));
if (warnings.length) {
  console.log("\n  ⚠ AVISOS (revisar):");
  warnings.forEach((s) => console.log("    · " + s));
}
if (errors.length) {
  console.log("\n  ✗ ERRORES (bloquean entrega):");
  errors.forEach((s) => console.log("    · " + s));
}
console.log(line);

const fail = errors.length > 0 || (STRICT && warnings.length > 0);
console.log(fail ? "RESULTADO: ❌ NO APTO\n" : "RESULTADO: ✅ APTO\n");
process.exit(fail ? 1 : 0);

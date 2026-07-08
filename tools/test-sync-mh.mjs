#!/usr/bin/env node
/**
 * TEST E2E — SINCRONIZACIÓN MULTI-DISPOSITIVO DE MH COLLECTIVE.
 *
 * Simula DOS móviles (dos pestañas/páginas de Puppeteer con almacenamiento
 * aislado) hablando con el mismo `apps/mh-collective-servidor.mjs`, y
 * comprueba de punta a punta que las ventas de barra viajan de un
 * dispositivo a otro por la API + SSE, y que dos cobros casi simultáneos
 * (condición de carrera del POST /api/state versionado) no se pierden.
 *
 * Arranca el servidor real (sin tocarlo) como proceso hijo, pero desde una
 * COPIA en un directorio temporal de /tmp: como `mh-collective-servidor.mjs`
 * calcula sus rutas de datos/app relativas a su propio directorio, ejecutar
 * la copia hace que `mh-collective-datos.json` se escriba en /tmp y jamás
 * en el repo. No se modifica ni se deja nada en `apps/`.
 *
 * Comprobaciones:
 *   1) Venta de Camarero 1 (Cerveza) visible en el panel del Dueño en OTRO
 *      dispositivo.
 *   2) Ese reflejo ocurre en vivo por SSE en ≤5s sin recargar manualmente
 *      (si no, se recarga y se avisa en vez de fallar duro).
 *   3) Concurrencia: Camarero 1 y Camarero 2 cobran casi a la vez
 *      (Promise.all) y la caja final refleja AMBAS ventas (el reintento
 *      del 409 optimista no pierde ninguna).
 *
 * Uso:
 *   node tools/test-sync-mh.mjs
 *
 * Salida: "✅ SYNC OK" (exit 0) o "❌ SYNC FALLA" (exit 1).
 * Si `apps/mh-collective-fiesta.html` todavía no existe, arranca igualmente
 * el servidor y abre el navegador (para probar que esa parte funciona),
 * detecta el 404 amable del servidor y termina con un mensaje claro pidiendo
 * ejecutar primero el constructor — no lo trata como un fallo de sync.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");
const REAL_SERVER_PATH = path.join(REPO_ROOT, "apps", "mh-collective-servidor.mjs");
const REAL_APP_PATH = path.join(REPO_ROOT, "apps", "mh-collective-fiesta.html");

const PIN_DUENO = "1234";
const SERVER_READY_TIMEOUT_MS = 8000;
const SSE_LIVE_TIMEOUT_MS = 5000;
const CHROMIUM_PATH = process.env.PUPPETEER_EXECUTABLE_PATH || "/opt/pw-browsers/chromium";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Estado global para poder limpiar SIEMPRE en el finally ----------
let tmpDir = null;
let serverChild = null;
let browser = null;
const serverOutLines = [];

function log(msg) {
  console.log(msg);
}

// ---------- Utilidades de arranque/parada ----------

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

/**
 * Copia el servidor real (sin tocarlo) a un directorio temporal en /tmp y,
 * si existe, también la app. Al ejecutar la copia, `__dirname` dentro del
 * servidor apunta a esa carpeta temporal, así que tanto el archivo de
 * datos (`mh-collective-datos.json`) como el HTML servido se leen/escriben
 * ahí — nunca en el repo.
 */
function prepararCopiaTemporal(appExiste) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mh-sync-test-"));
  const serverCopyPath = path.join(dir, "mh-collective-servidor.mjs");
  fs.copyFileSync(REAL_SERVER_PATH, serverCopyPath);
  if (appExiste) {
    fs.copyFileSync(REAL_APP_PATH, path.join(dir, "mh-collective-fiesta.html"));
  }
  return { dir, serverCopyPath };
}

function arrancarServidor(serverCopyPath, port) {
  const child = spawn(process.execPath, [serverCopyPath], {
    cwd: path.dirname(serverCopyPath),
    env: { ...process.env, PORT: String(port), MH_TOKEN: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (d) => serverOutLines.push("[stdout] " + d.toString()));
  child.stderr.on("data", (d) => serverOutLines.push("[stderr] " + d.toString()));
  return child;
}

async function esperarServidorListo(baseUrl, child, timeoutMs) {
  const start = Date.now();
  let exitedEarly = null;
  child.once("exit", (code, signal) => {
    exitedEarly = `el proceso del servidor terminó pronto (code=${code}, signal=${signal})`;
  });
  while (Date.now() - start < timeoutMs) {
    if (exitedEarly) throw new Error(exitedEarly + "\n" + serverOutLines.join(""));
    try {
      const res = await fetch(baseUrl + "/api/state", { method: "GET" });
      if (res.ok) return;
    } catch {
      // todavía no acepta conexiones; reintenta
    }
    await sleep(150);
  }
  throw new Error(
    `el servidor no respondió en ${timeoutMs}ms en ${baseUrl}/api/state\n` + serverOutLines.join(""),
  );
}

async function pararServidor(child) {
  if (!child || child.exitCode !== null || child.killed) return;
  await new Promise((resolve) => {
    const to = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        // ya no existe
      }
      resolve();
    }, 3000);
    child.once("exit", () => {
      clearTimeout(to);
      resolve();
    });
    try {
      child.kill("SIGTERM");
    } catch {
      clearTimeout(to);
      resolve();
    }
  });
}

// ---------- Helpers de interacción con la página (estilo tools/verificar-app.mjs) ----------

async function clickText(page, text) {
  return page.evaluate((t) => {
    const els = [...document.querySelectorAll('a,button,[role=button],input[type=submit],[data-action]')].filter(
      (x) => x.offsetParent !== null && (x.innerText || x.value || "").trim().includes(t),
    );
    if (!els.length) return false;
    els.sort((a, b) => (a.innerText || a.value || "").length - (b.innerText || b.value || "").length);
    els[0].click();
    return true;
  }, text);
}

async function clickSel(page, sel) {
  return page.evaluate((s) => {
    const e = document.querySelector(s);
    if (!e) return false;
    e.click();
    return true;
  }, sel);
}

async function fillSel(page, sel, value) {
  return page.evaluate(
    (o) => {
      const e = document.querySelector(o.sel);
      if (!e) return false;
      e.value = o.value;
      e.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    },
    { sel, value },
  );
}

async function submitSel(page, sel) {
  return page.evaluate((s) => {
    const e = document.querySelector(s);
    if (!e) return false;
    if (e.requestSubmit) e.requestSubmit();
    else e.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    return true;
  }, sel);
}

async function isVisible(page, sel) {
  return page.evaluate((s) => {
    const e = document.querySelector(s);
    return !!(e && e.offsetParent !== null);
  }, sel);
}

async function textOf(page, sel) {
  return page.evaluate((s) => {
    const e = document.querySelector(s);
    return e ? e.innerText || e.textContent || "" : null;
  }, sel);
}

async function bodyText(page) {
  return page.evaluate(() => document.body.innerText || "");
}

/** Primer número (admite coma decimal) que aparece en el texto, o NaN si no hay. */
function extractNumber(text) {
  if (!text) return NaN;
  const m = text.match(/\d+(?:[.,]\d+)?/);
  if (!m) return NaN;
  return parseFloat(m[0].replace(",", "."));
}

async function poll(fn, { timeoutMs, intervalMs = 200 }) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeoutMs) {
    last = await fn();
    if (last) return last;
    await sleep(intervalMs);
  }
  return last;
}

async function loginDueno(page) {
  await clickText(page, "Dueño");
  await sleep(200);
  if (await isVisible(page, "#pinForm")) {
    await fillSel(page, "#pin-dueno", PIN_DUENO);
    await submitSel(page, "#pinForm");
    await sleep(300);
  }
}

// ---------- Programa principal ----------

async function main() {
  const checks = []; // { name, status: 'ok'|'warn'|'fail', detail }
  const detalleFinal = [];

  const appExiste = fs.existsSync(REAL_APP_PATH);
  if (!fs.existsSync(REAL_SERVER_PATH)) {
    console.log(`❌ SYNC FALLA\n· No existe ${REAL_SERVER_PATH}. Nada que probar.`);
    process.exitCode = 1;
    return;
  }

  const puppeteer = (await import("puppeteer")).default;

  const prep = prepararCopiaTemporal(appExiste);
  tmpDir = prep.dir;

  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  log(`[test-sync-mh] arrancando servidor de prueba en ${baseUrl} (datos en ${tmpDir})...`);
  serverChild = arrancarServidor(prep.serverCopyPath, port);
  await esperarServidorListo(baseUrl, serverChild, SERVER_READY_TIMEOUT_MS);
  log("[test-sync-mh] servidor listo.");

  browser = await puppeteer.launch({
    headless: "new",
    executablePath: CHROMIUM_PATH,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  // Dos "móviles" con almacenamiento aislado (contextos de navegador distintos):
  // así la sincronización que veamos es SIEMPRE por la API+SSE, nunca por
  // localStorage compartido dentro del mismo navegador.
  const ctxA = await browser.createBrowserContext();
  const ctxB = await browser.createBrowserContext();
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();
  for (const p of [pageA, pageB]) {
    await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  }

  await pageA.goto(baseUrl + "/", { waitUntil: "domcontentloaded", timeout: 15000 });
  await pageB.goto(baseUrl + "/", { waitUntil: "domcontentloaded", timeout: 15000 });
  await sleep(200);

  if (!appExiste) {
    const txt = await bodyText(pageA);
    log("[test-sync-mh] apps/mh-collective-fiesta.html todavía no existe; el servidor sirvió su 404 amable.");
    console.log(
      [
        "❌ SYNC FALLA",
        "· Todavía no existe apps/mh-collective-fiesta.html — ejecuta primero el constructor (Agente 6, ingeniero-datos) y vuelve a lanzar este test.",
        `· El servidor y Puppeteer SÍ funcionan (se abrió ${baseUrl}/ y se recibió la página de aviso: "${txt.slice(0, 80).trim()}...").`,
      ].join("\n"),
    );
    process.exitCode = 1;
    return;
  }

  // ---------- 1) Página A: Camarero 1 vende una Cerveza ----------
  // ---------- (antes) Página B entra como Dueño y captura la línea base ----------
  // B se autentica ANTES de que A cobre, para que la comprobación de "en vivo
  // por SSE" sea real (observar un cambio), no solo una carga ya correcta.
  await loginDueno(pageB);
  if (!(await isVisible(pageB, '[data-testid="caja-barra"]'))) {
    throw new Error('Tras entrar como Dueño en la página B no aparece [data-testid="caja-barra"].');
  }
  const baseTxt = await textOf(pageB, '[data-testid="caja-barra"]');
  const baseVal = extractNumber(baseTxt);
  log(`[test-sync-mh] caja-barra inicial (Dueño, dispositivo B): "${baseTxt}" (${baseVal})`);

  await clickText(pageA, "Camarero 1");
  await sleep(250);
  const clickedProd = await clickSel(pageA, '[data-testid="prod-cerveza"]');
  if (!clickedProd) throw new Error('No se encontró [data-testid="prod-cerveza"] en la página A tras elegir Camarero 1.');
  await sleep(200);
  const clickedCobrar = await clickSel(pageA, '[data-testid="btn-cobrar"]');
  if (!clickedCobrar) throw new Error('No se encontró [data-testid="btn-cobrar"] en la página A.');
  log("[test-sync-mh] Camarero 1 (página A) cobró 1 Cerveza (5 €).");

  // ---------- 2) Página B: ¿se refleja en ≤5s por SSE, sin recargar? ----------
  const sawLive = await poll(
    async () => {
      const t = await textOf(pageB, '[data-testid="caja-barra"]');
      const v = extractNumber(t);
      return Number.isFinite(v) && Math.abs(v - baseVal - 5) < 0.01;
    },
    { timeoutMs: SSE_LIVE_TIMEOUT_MS, intervalMs: 250 },
  );

  let valAfterRound1;
  if (sawLive) {
    checks.push({ name: "Venta de barra visible en el panel del Dueño (otro dispositivo)", status: "ok" });
    checks.push({ name: "Refresco en vivo por SSE en ≤5s sin recargar", status: "ok" });
    valAfterRound1 = extractNumber(await textOf(pageB, '[data-testid="caja-barra"]'));
    log("[test-sync-mh] SSE en vivo: la caja de barra se actualizó sola en la página B. ✓");
  } else {
    log("[test-sync-mh] no se vio actualización en vivo en 5s; recargando página B para comprobar el dato...");
    await pageB.reload({ waitUntil: "domcontentloaded", timeout: 15000 });
    await sleep(300);
    // tras recargar puede pedir PIN otra vez si la sesión no persiste
    if (await isVisible(pageB, "#pinForm")) {
      await fillSel(pageB, "#pin-dueno", PIN_DUENO);
      await submitSel(pageB, "#pinForm");
      await sleep(300);
    } else if (!(await isVisible(pageB, '[data-testid="caja-barra"]'))) {
      await loginDueno(pageB);
    }
    const t2 = await textOf(pageB, '[data-testid="caja-barra"]');
    const v2 = extractNumber(t2);
    const correctoTrasRecargar = Number.isFinite(v2) && Math.abs(v2 - baseVal - 5) < 0.01;
    if (correctoTrasRecargar) {
      checks.push({ name: "Venta de barra visible en el panel del Dueño (otro dispositivo)", status: "ok" });
      checks.push({
        name: "Refresco en vivo por SSE en ≤5s sin recargar",
        status: "warn",
        detail: `no se actualizó solo en 5s (quedó en "${baseTxt}"); tras recargar sí mostró el valor correcto ("${t2}").`,
      });
      valAfterRound1 = v2;
      log("[test-sync-mh] AVISO: el refresco en vivo (SSE) no funcionó; recargar sí mostró el dato correcto.");
    } else {
      checks.push({
        name: "Venta de barra visible en el panel del Dueño (otro dispositivo)",
        status: "fail",
        detail: `esperaba caja-barra ≈ ${baseVal + 5}, tras recargar se leyó "${t2}" (${v2}).`,
      });
      checks.push({
        name: "Refresco en vivo por SSE en ≤5s sin recargar",
        status: "fail",
        detail: "tampoco se corrigió recargando; no es solo un problema de SSE.",
      });
      valAfterRound1 = Number.isFinite(v2) ? v2 : baseVal;
    }
  }

  // ---------- 3) Concurrencia: A y B cobran casi a la vez ----------
  log("[test-sync-mh] preparando prueba de concurrencia (Camarero 1 y Camarero 2 cobran casi a la vez)...");
  await clickText(pageB, "Camarero 2");
  await sleep(250);

  // A ya está en #/barra como Camarero 1 con el carrito vacío (se vació al cobrar); añade otra Cerveza (5€).
  const prodA = await clickSel(pageA, '[data-testid="prod-cerveza"]');
  // B, como Camarero 2, añade una Copa (10€).
  const prodB = await clickSel(pageB, '[data-testid="prod-copa"]');
  if (!prodA || !prodB) {
    throw new Error(
      `No se pudo preparar el carrito de la prueba de concurrencia (prod-cerveza en A: ${prodA}, prod-copa en B: ${prodB}).`,
    );
  }
  await sleep(200);

  const [cobroA, cobroB] = await Promise.all([
    clickSel(pageA, '[data-testid="btn-cobrar"]'),
    clickSel(pageB, '[data-testid="btn-cobrar"]'),
  ]);
  if (!cobroA || !cobroB) {
    checks.push({
      name: "Concurrencia: dos cobros casi simultáneos no se pierden",
      status: "fail",
      detail: `no se pudo pulsar "Cobrar" en ambos dispositivos a la vez (A: ${cobroA}, B: ${cobroB}).`,
    });
  } else {
    // deja tiempo para 1-2 reintentos del 409 optimista + difusión SSE
    await sleep(1500);
    await loginDueno(pageB); // por si el cambio de rol cerró la sesión de dueño
    await sleep(200);
    const tFinal = await textOf(pageB, '[data-testid="caja-barra"]');
    const vFinal = extractNumber(tFinal);
    const esperado = valAfterRound1 + 15; // +5 (Cerveza de A) +10 (Copa de B)
    const ok = Number.isFinite(vFinal) && Math.abs(vFinal - esperado) < 0.01;
    if (ok) {
      checks.push({ name: "Concurrencia: dos cobros casi simultáneos no se pierden", status: "ok" });
      log(`[test-sync-mh] concurrencia OK: caja-barra pasó de ${valAfterRound1} a ${vFinal} (+15, las dos ventas). ✓`);
    } else {
      checks.push({
        name: "Concurrencia: dos cobros casi simultáneos no se pierden",
        status: "fail",
        detail: `esperaba caja-barra ≈ ${esperado} (${valAfterRound1} + 15), se leyó "${tFinal}" (${vFinal}). Parece que el reintento del 409 perdió una venta.`,
      });
    }
  }

  // ---------- Informe ----------
  const line = "─".repeat(60);
  console.log("\n" + line + "\nSINCRONIZACIÓN MULTI-DISPOSITIVO — MH Collective\n" + line);
  for (const c of checks) {
    const icon = c.status === "ok" ? "✓" : c.status === "warn" ? "⚠" : "✗";
    console.log(`  ${icon} ${c.name}${c.detail ? " — " + c.detail : ""}`);
  }
  console.log(line);

  const hayFallo = checks.some((c) => c.status === "fail") || checks.length < 3;
  if (hayFallo) {
    console.log("❌ SYNC FALLA");
    process.exitCode = 1;
  } else {
    console.log("✅ SYNC OK");
    process.exitCode = 0;
  }
}

async function limpiar() {
  try {
    if (browser) await browser.close();
  } catch {
    // ya cerrado
  }
  try {
    await pararServidor(serverChild);
  } catch {
    // ya muerto
  }
  try {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // best-effort
  }
}

let limpiando = false;
async function salirLimpio(code) {
  if (limpiando) return;
  limpiando = true;
  await limpiar();
  process.exit(code);
}
process.on("SIGINT", () => salirLimpio(130));
process.on("SIGTERM", () => salirLimpio(143));

try {
  await main();
} catch (err) {
  console.log("❌ SYNC FALLA");
  console.log("· Error inesperado: " + (err && err.message ? err.message : String(err)));
  if (serverOutLines.length) {
    console.log("· Salida del servidor:\n" + serverOutLines.join("").trim());
  }
  process.exitCode = 1;
} finally {
  await limpiar();
}

#!/usr/bin/env node
/**
 * REGENERAR LA COMPLETA — re-incrusta las apps embebidas con su versión actual.
 *
 * La incubadora "todo-en-uno" (apps/incuba-tu-negocio-COMPLETA.html) lleva el
 * cuestionario y las demos embebidos en base64 dentro del objeto APPS. Cuando
 * editas el briefing.html o una demo, la COMPLETA se queda con la versión vieja.
 * Este script vuelve a meter la versión actual de cada archivo fuente.
 *
 * Uso:  node tools/regenerar-completa.mjs
 */
import fs from "node:fs";

const COMPLETA = "apps/incuba-tu-negocio-COMPLETA.html";
const SOURCES = {
  "briefing.html": "briefing.html",
  "peluqueria-aurora.html": "apps/peluqueria-aurora.html",
  "reformas-presupuestador.html": "apps/reformas-presupuestador.html",
};

if (!fs.existsSync(COMPLETA)) { console.error("No existe " + COMPLETA); process.exit(1); }
let comp = fs.readFileSync(COMPLETA, "utf8");
let n = 0;

for (const [key, src] of Object.entries(SOURCES)) {
  if (!fs.existsSync(src)) { console.log("⚠ falta el fuente: " + src); continue; }
  const b64 = Buffer.from(fs.readFileSync(src, "utf8"), "utf8").toString("base64");
  const re = new RegExp('("' + key.replace(/\./g, "\\.") + '":")[A-Za-z0-9+/=]+(")');
  if (!re.test(comp)) { console.log("⚠ clave no encontrada en APPS: " + key); continue; }
  comp = comp.replace(re, (m, p1, p2) => p1 + b64 + p2);
  n++;
  console.log("✓ re-embebido " + key + " (" + b64.length + " chars base64)");
}

fs.writeFileSync(COMPLETA, comp);
console.log("\nListo: " + n + " app(s) re-embebidas en " + COMPLETA);
console.log("Recuerda pasar el verificador:  node tools/verificar-app.mjs " + COMPLETA);

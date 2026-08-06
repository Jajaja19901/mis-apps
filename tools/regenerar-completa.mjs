#!/usr/bin/env node
/**
 * REGENERAR LA COMPLETA — re-incrusta las apps embebidas con su versión actual.
 *
 * La incubadora "todo-en-uno" (apps/incuba-tu-negocio-COMPLETA.html) lleva el
 * cuestionario y las demos embebidos en el objeto APPS como GZIP + BASE64
 * (el navegador los descomprime con DecompressionStream al abrir cada demo).
 * Este script vuelve a meter la versión actual de cada archivo fuente, en el
 * mismo formato comprimido, y SOLO toca el objeto APPS (nunca SECTORES/THUMBS).
 *
 * Uso:  node tools/regenerar-completa.mjs
 */
import fs from "node:fs";
import zlib from "node:zlib";

const COMPLETA = "apps/incuba-tu-negocio-COMPLETA.html";

// De la clave embebida a su archivo fuente en el repo.
function fuenteDe(key) {
  if (key === "briefing.html") return "briefing.html";
  if (key === "camarero-top.html") return "apps/camarero-digital.html"; // La Tasca (PLAN:"top")
  if (key === "afters.html") return "apps/afters-ejemplo.html"; // demo autocontenida (la app real usa Firebase/mapas y no va offline)
  if (key.endsWith("-web.html")) return "apps/webs-basicas/" + key;
  return "apps/" + key;
}

if (!fs.existsSync(COMPLETA)) { console.error("No existe " + COMPLETA); process.exit(1); }
let comp = fs.readFileSync(COMPLETA, "utf8");

// Delimitar el objeto APPS (para no tocar jamás SECTORES/THUMBS/DUO).
const i0 = comp.search(/const APPS\s*=\s*\{/);
const i1 = comp.indexOf("var APPS_RAW", i0);
if (i0 < 0 || i1 < 0) { console.error("No encuentro el objeto APPS o su decodificador (APPS_RAW)."); process.exit(1); }
let span = comp.slice(i0, i1);

const claves = [...span.matchAll(/"([a-z0-9.-]+\.html)":"[A-Za-z0-9+/=]{200,}"/g)].map((m) => m[1]);
console.log("Claves embebidas encontradas: " + claves.length);

let n = 0, iguales = 0;
for (const key of claves) {
  const src = fuenteDe(key);
  if (!fs.existsSync(src)) { console.log("⚠ falta el fuente: " + src + " (se conserva el blob actual)"); continue; }
  const raw = fs.readFileSync(src);
  if (key === "camarero-top.html" && !raw.includes('PLAN:"top"')) {
    console.log('⚠ ' + src + ' no contiene PLAN:"top" — el elector de niveles dejaría de funcionar. Se conserva el blob actual.');
    continue;
  }
  const b64 = zlib.gzipSync(raw, { level: 9 }).toString("base64");
  const re = new RegExp('("' + key.replace(/[.-]/g, "\\$&") + '":")[A-Za-z0-9+/=]{200,}(")');
  const m = span.match(re);
  if (!m) { console.log("⚠ clave no reemplazable: " + key); continue; }
  if (m[0] === m[1] + b64 + m[2]) { iguales++; continue; }
  span = span.replace(re, (mm, p1, p2) => p1 + b64 + p2);
  n++;
  console.log("✓ re-embebido " + key + " (" + Math.round(b64.length / 1024) + " KB gz+b64)");
}

comp = comp.slice(0, i0) + span + comp.slice(i1);
fs.writeFileSync(COMPLETA, comp);
console.log("\nListo: " + n + " actualizadas, " + iguales + " ya estaban al día. Tamaño: " + (comp.length / 1e6).toFixed(2) + " MB");
console.log("Recuerda pasar el verificador:  node tools/verificar-app.mjs " + COMPLETA);

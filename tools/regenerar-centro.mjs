// Re-embebe la plantilla del bar en el Centro de Captación (tools/centro-captacion.html),
// entre los marcadores /*TPL_INI*/ ... /*TPL_FIN*/, igual que regenerar-generador.mjs.
// Ejecutar cada vez que cambie la plantilla:  node tools/regenerar-centro.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dir = dirname(fileURLToPath(import.meta.url));
const root = join(__dir, "..");
const tpl = readFileSync(join(root, "apps", "restaurante-qr-ejemplo.html"), "utf8");
const b64 = Buffer.from(tpl, "utf8").toString("base64");

const path = join(root, "tools", "centro-captacion.html");
let s = readFileSync(path, "utf8");
const re = /\/\*TPL_INI\*\/[\s\S]*?\/\*TPL_FIN\*\//;
if (!re.test(s)) { console.error("No encuentro los marcadores TPL en centro-captacion.html"); process.exit(1); }
s = s.replace(re, '/*TPL_INI*/"' + b64 + '"/*TPL_FIN*/');
writeFileSync(path, s);
console.log("✓ Plantilla re-embebida en tools/centro-captacion.html (" + b64.length + " chars base64)");

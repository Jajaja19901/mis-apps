// Re-embebe la plantilla del bar (apps/restaurante-qr-ejemplo.html) dentro de la
// herramienta visual tools/generador-bares.html, como base64, entre los marcadores
//   /*TPL_INI*/  ...  /*TPL_FIN*/
// Ejecuta esto cada vez que cambies la plantilla del bar.
//   node tools/regenerar-generador.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dir=dirname(fileURLToPath(import.meta.url));
const root=join(__dir,"..");
const tpl=readFileSync(join(root,"apps","restaurante-qr-ejemplo.html"),"utf8");
const b64=Buffer.from(tpl,"utf8").toString("base64");

const genPath=join(root,"tools","generador-bares.html");
let gen=readFileSync(genPath,"utf8");
const re=/\/\*TPL_INI\*\/[\s\S]*?\/\*TPL_FIN\*\//;
if(!re.test(gen)){ console.error("No encuentro los marcadores /*TPL_INI*/.../*TPL_FIN*/ en generador-bares.html"); process.exit(1); }
gen=gen.replace(re, "/*TPL_INI*/\""+b64+"\"/*TPL_FIN*/");
writeFileSync(genPath,gen);
console.log("✓ Plantilla re-embebida en tools/generador-bares.html ("+b64.length+" chars base64)");

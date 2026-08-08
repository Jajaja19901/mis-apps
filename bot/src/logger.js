/* Registro. Dos reglas:
 *  1. Nunca sale un secreto por aquí, aunque venga dentro de un objeto de error de CCXT
 *     (que a veces incluye la petición entera, con la firma y la clave dentro).
 *  2. Todo queda en disco, porque las decisiones de un bot que opera solo hay que poder
 *     revisarlas al día siguiente.
 */
import fs from "node:fs";
import path from "node:path";

const SECRETOS = new Set();

/* Se registran al arrancar para poder taparlos allá donde asomen. */
export function registrarSecreto(valor) {
  if (typeof valor === "string" && valor.length >= 8) SECRETOS.add(valor);
}

export function tapar(texto) {
  let t = String(texto);
  for (const s of SECRETOS) t = t.split(s).join("«oculto»");
  // Por si aparece una firma o una clave que no habíamos registrado.
  t = t.replace(/signature=[A-Fa-f0-9]{16,}/g, "signature=«oculto»");
  // También en forma JSON y en base64 (claves Ed25519 llevan +/= y no encajan arriba).
  t = t.replace(/(["']?signature["']?\s*[:=]\s*["']?)[A-Za-z0-9+/=]{16,}/gi, "$1«oculto»");
  t = t.replace(/X-MBX-APIKEY['":\s]+[A-Za-z0-9]{16,}/gi, "X-MBX-APIKEY=«oculto»");
  return t;
}

let rutaLog = null;
export function iniciarLog(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    rutaLog = path.join(dir, "bot.log");
  } catch { rutaLog = null; }
}

function escribir(nivel, args) {
  const linea = `[${new Date().toISOString()}] ${nivel} ${args.map(a =>
    typeof a === "string" ? a : safeJson(a)).join(" ")}`;
  const limpia = tapar(linea);
  if (nivel === "ERROR") console.error(limpia); else console.log(limpia);
  if (rutaLog) { try { fs.appendFileSync(rutaLog, limpia + "\n"); } catch {} }
}

function safeJson(o) {
  try { return JSON.stringify(o); } catch { return String(o); }
}

export const log = {
  info:  (...a) => escribir("INFO ", a),
  aviso: (...a) => escribir("AVISO", a),
  error: (...a) => escribir("ERROR", a),
};

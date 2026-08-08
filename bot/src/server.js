/* Panel de control local.
 *
 * Escucha SOLO en 127.0.0.1. No lleva contraseña, y por eso no puede estar accesible
 * desde la red: quien llegue a este puerto puede desarmar el bot. Si algún día hace falta
 * verlo desde fuera, la respuesta es un túnel SSH, no cambiar esta línea.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { CONFIG } from "./config.js";
import { log } from "./logger.js";
import * as estado from "./state.js";
import * as riesgo from "./risk.js";
import { ultimoResumen } from "./strategy.js";
import { tapar } from "./logger.js";
import crypto from "node:crypto";
import { COBROS_POR_DIA } from "./funding.js";

const PUBLICO = path.join(CONFIG.raiz, "public");

/* Ficha de sesión. Se inyecta en el HTML y se exige en los POST. Al ser una cabecera
   propia obliga a preflight, y una web ajena ya no puede mandarla: sin esto, cualquier
   pestaña abierta podía llamar a /api/rearmar y deshacer una parada de emergencia. */
const FICHA = crypto.randomBytes(24).toString("hex");

function json(res, code, obj) {
  // Tapado en el borde: los mensajes de error de CCXT llevan la URL entera, y en las
  // llamadas firmadas eso incluye la firma. Iban a disco y salían por esta API.
  const cuerpo = tapar(JSON.stringify(obj));
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(cuerpo),
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "no-store",
  });
  res.end(cuerpo);
}

/* Solo se atiende a quien viene de este mismo servidor por el nombre esperado: cierra
   también el recableado de DNS, que permitía leer el estado desde fuera. */
function origenValido(req) {
  const host = String(req.headers.host || "").toLowerCase();
  const permitidos = [`127.0.0.1:${CONFIG.puerto}`, `localhost:${CONFIG.puerto}`];
  if (!permitidos.includes(host)) return false;
  const origen = req.headers.origin;
  if (origen && !permitidos.some(p => origen === `http://${p}`)) return false;
  const sitio = req.headers["sec-fetch-site"];
  if (sitio && sitio !== "same-origin" && sitio !== "none") return false;
  return true;
}

export function arrancarServidor() {
  const server = http.createServer((req, res) => {
   try {
    if (typeof req.url !== "string" || req.url.charAt(0) !== "/") { res.writeHead(400); return res.end(); }
    if (!origenValido(req)) { res.writeHead(403); return res.end("origen no permitido"); }
    if (req.method === "POST") req.resume();
    const url = new URL(req.url, "http://localhost");

    if (url.pathname === "/api/estado" && req.method === "GET") {
      const st = estado.get();
      return json(res, 200, {
        modo: CONFIG.modo,
        armado: CONFIG.armado,
        desarmadoPor: st.desarmadoPor,
        riesgo: CONFIG.riesgo,
        estrategia: {
          ...CONFIG.estrategia,
          cobrosPorDia: COBROS_POR_DIA,
        },
        posiciones: st.posiciones,
        cerradas: st.cerradas.slice(0, 30),
        decisiones: st.decisiones.slice(0, 60),
        nocionalTotal: estado.nocionalTotal(),
        resultadoDelDia: estado.resultadoDelDia(),
        ultimoCiclo: ultimoResumen(),
      });
    }

    if (req.method === "POST" && req.headers["x-ficha"] !== FICHA) {
      return json(res, 403, { ok: false, motivo: "falta la ficha de sesión" });
    }

    if (url.pathname === "/api/desarmar" && req.method === "POST") {
      riesgo.desarmar("parado a mano desde el panel");
      log.aviso("Desarmado a mano desde el panel");
      return json(res, 200, { ok: true });
    }

    if (url.pathname === "/api/rearmar" && req.method === "POST") {
      riesgo.rearmar();
      log.info("Rearmado a mano desde el panel");
      return json(res, 200, { ok: true });
    }

    // Estáticos: solo index.html, y sin construir rutas con lo que venga en la URL.
    if (url.pathname === "/" || url.pathname === "/index.html") {
      try {
        const html = fs.readFileSync(path.join(PUBLICO, "index.html"), "utf8")
          .replace("__FICHA__", FICHA);
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "no-referrer",
          "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'",
        });
        return res.end(html);
      } catch {
        res.writeHead(500); return res.end("Falta public/index.html");
      }
    }

    res.writeHead(404); res.end("No existe");
   } catch (e) {
    // Antes, un estado mal formado hacía que una simple petición matara el proceso,
    // dejando las posiciones abiertas y sin vigilancia.
    log.error("Fallo atendiendo una petición:", e && e.message);
    try { res.writeHead(500); res.end("error interno"); } catch {}
   }
  });

  server.listen(CONFIG.puerto, "127.0.0.1", () => {
    log.info(`Panel en http://127.0.0.1:${CONFIG.puerto} (solo local)`);
  });
  return server;
}

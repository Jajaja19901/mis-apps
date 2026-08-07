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
import { COBROS_POR_DIA } from "./funding.js";

const PUBLICO = path.join(CONFIG.raiz, "public");

function json(res, code, obj) {
  const cuerpo = JSON.stringify(obj);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(cuerpo),
    "X-Content-Type-Options": "nosniff",
  });
  res.end(cuerpo);
}

export function arrancarServidor() {
  const server = http.createServer((req, res) => {
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
        const html = fs.readFileSync(path.join(PUBLICO, "index.html"));
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        return res.end(html);
      } catch {
        res.writeHead(500); return res.end("Falta public/index.html");
      }
    }

    res.writeHead(404); res.end("No existe");
  });

  server.listen(CONFIG.puerto, "127.0.0.1", () => {
    log.info(`Panel en http://127.0.0.1:${CONFIG.puerto} (solo local, sin contraseña)`);
  });
  return server;
}

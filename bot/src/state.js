/* Estado en un JSON. Sin base de datos: son decenas de posiciones como mucho, y un
 * archivo que se puede abrir con un editor cuando algo va mal vale más que una dependencia.
 * Se escribe primero a un temporal y se renombra, para que un corte a mitad no deje el
 * archivo a medias. */
import fs from "node:fs";
import path from "node:path";
import { CONFIG } from "./config.js";
import { log } from "./logger.js";

const DIR = path.join(CONFIG.raiz, "data");
const RUTA = path.join(DIR, `estado.${CONFIG.modo}.json`);

function porDefecto() {
  return {
    modo: CONFIG.modo,
    creadoEn: new Date().toISOString(),
    posiciones: [],      // {id, simbolo, nocional, qty, precioEntrada, abiertaEn, fundingCobrado, cobrosRecibidos}
    cerradas: [],        // histórico
    decisiones: [],      // qué evaluó y por qué actuó o no (lo más útil para revisar)
    desarmadoPor: null,  // motivo si un cortafuegos lo apagó
  };
}

let estado = porDefecto();

export function cargar() {
  try {
    if (fs.existsSync(RUTA)) {
      const leido = JSON.parse(fs.readFileSync(RUTA, "utf8"));
      // Un estado de otro modo no se mezcla jamás: son dineros distintos.
      if (leido && leido.modo === CONFIG.modo) {
        estado = { ...porDefecto(), ...leido };
      } else if (leido) {
        log.aviso(`El estado guardado es del modo "${leido.modo}" y estamos en "${CONFIG.modo}". Se empieza de cero.`);
      }
    }
  } catch (e) {
    log.error("Estado ilegible, se empieza de cero:", e.message);
  }
  return estado;
}

export function guardar() {
  try {
    fs.mkdirSync(DIR, { recursive: true });
    const tmp = RUTA + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(estado, null, 2));
    fs.renameSync(tmp, RUTA);
  } catch (e) {
    log.error("No se pudo guardar el estado:", e.message);
  }
}

export function get() { return estado; }

export function anotarDecision(entrada) {
  estado.decisiones.unshift({ ts: new Date().toISOString(), ...entrada });
  if (estado.decisiones.length > 300) estado.decisiones.length = 300;
}

export function nocionalTotal() {
  return estado.posiciones.reduce((a, p) => a + (p.nocional || 0), 0);
}

export function resultadoDelDia() {
  const hoy = new Date().toISOString().slice(0, 10);
  const cerradasHoy = estado.cerradas
    .filter(c => String(c.cerradaEn).slice(0, 10) === hoy)
    .reduce((a, c) => a + (c.neto || 0), 0);
  const fundingHoy = estado.posiciones.reduce((a, p) => a + (p.fundingHoy || 0), 0);
  return cerradasHoy + fundingHoy;
}

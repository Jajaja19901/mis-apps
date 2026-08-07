/* Arranque. El orden importa: se valida, se comprueba a dónde apuntamos, y solo entonces
 * se empieza a mirar el mercado. */
import { CONFIG, validarOMorir } from "./config.js";
import { log, iniciarLog, registrarSecreto } from "./logger.js";
import * as estado from "./state.js";
import * as ex from "./exchange.js";
import { ciclo, actualizarFunding } from "./strategy.js";
import { arrancarServidor } from "./server.js";
import path from "node:path";

validarOMorir();

// Los secretos se registran para que el registro pueda taparlos si asoman en un error.
registrarSecreto(CONFIG.claves.spot.secret);
registrarSecreto(CONFIG.claves.perp.secret);
registrarSecreto(CONFIG.claves.spot.key);
registrarSecreto(CONFIG.claves.perp.key);
iniciarLog(path.join(CONFIG.raiz, "data"));

const banner = CONFIG.esTestnet
  ? "TESTNET — fondos de prueba, no vale dinero"
  : "*** DINERO REAL ***";
log.info(`Arrancando en modo ${CONFIG.modo}  [${banner}]`);
log.info(CONFIG.armado
  ? "ARMADO: va a mandar órdenes de verdad."
  : "SIN ARMAR: analiza y anota lo que haría, pero no manda ninguna orden.");

estado.cargar();

try {
  const destino = ex.verificarDestino();
  log.info("Destino comprobado:", destino.testnet ? "testnet" : "producción");
  await ex.cargarMercados();
  log.info(`Mercados cargados. Vigilando: ${CONFIG.estrategia.simbolos.join(", ")}`);
} catch (e) {
  log.error("No se puede continuar:", e.message);
  process.exit(1);
}

arrancarServidor();

let corriendo = false;
async function tick() {
  if (corriendo) { log.aviso("El ciclo anterior sigue en marcha, se salta este."); return; }
  corriendo = true;
  try {
    await actualizarFunding();
    const r = await ciclo();
    const aptos = r.evaluaciones.filter(e => e.apto).length;
    log.info(`Ciclo en ${r.duracionMs} ms · ${aptos}/${r.evaluaciones.length} símbolos aptos · ${estado.get().posiciones.length} posiciones abiertas`);
  } catch (e) {
    log.error("Fallo en el ciclo:", e.message);
  } finally {
    corriendo = false;
  }
}

await tick();
const temporizador = setInterval(tick, CONFIG.intervaloCicloMs);

function salir(senal) {
  log.info(`Recibido ${senal}, guardando y saliendo. Las posiciones abiertas NO se cierran solas.`);
  clearInterval(temporizador);
  estado.guardar();
  process.exit(0);
}
process.on("SIGINT", () => salir("SIGINT"));
process.on("SIGTERM", () => salir("SIGTERM"));
process.on("unhandledRejection", (e) => log.error("Promesa sin capturar:", e && e.message));

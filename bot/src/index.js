/* Arranque. El orden importa: se valida, se comprueba a dónde apuntamos, y solo entonces
 * se empieza a mirar el mercado. */
import { CONFIG, validarOMorir } from "./config.js";
import { log, iniciarLog, registrarSecreto } from "./logger.js";
import * as estado from "./state.js";
import { crearBroker } from "./broker.js";
import { ciclo, actualizarFunding, usarBroker, reconciliar } from "./strategy.js";
import { arrancarServidor } from "./server.js";
import path from "node:path";

validarOMorir();

// Los secretos se registran para que el registro pueda taparlos si asoman en un error.
registrarSecreto(CONFIG.claves.spot.secret);
registrarSecreto(CONFIG.claves.perp.secret);
registrarSecreto(CONFIG.claves.spot.key);
registrarSecreto(CONFIG.claves.perp.key);
iniciarLog(path.join(CONFIG.raiz, "data"));

const banner = CONFIG.esPapel
  ? "MODO PAPEL — precios reales, ejecución simulada, no se mueve dinero"
  : "*** DINERO REAL ***";
log.info(`Arrancando en modo ${CONFIG.modo}  [${banner}]`);
log.info(CONFIG.armado
  ? "ARMADO: va a mandar órdenes de verdad."
  : "SIN ARMAR: analiza y anota lo que haría, pero no manda ninguna orden.");

estado.cargar();

let broker;
try {
  broker = crearBroker(CONFIG);
  usarBroker(broker);
  await broker.cargarMercados();
  log.info(`Mercados cargados. Vigilando: ${CONFIG.estrategia.simbolos.join(", ")}`);
  const rec = await reconciliar();
  log.info("Reconciliación:", rec.ok ? (rec.nota || "correcta") : `FALLIDA — ${rec.motivo}`);
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
/* Antes, una excepción no capturada mataba el proceso dejando las posiciones abiertas y
   sin vigilancia — y bastaba un GET al panel con el estado mal formado para provocarla.
   Ahora se desarma y se guarda antes de caer. */
process.on("uncaughtException", (e) => {
  log.error("Excepción no capturada:", e && e.stack ? e.stack : String(e));
  try {
    const st = estado.get();
    st.desarmadoPor = "excepción no capturada: " + (e && e.message);
    estado.guardar();
    log.error("Desarmado y estado guardado. Las posiciones abiertas siguen abiertas: revísalas.");
  } catch (e2) {
    log.error("Tampoco se pudo guardar el estado:", e2 && e2.message);
  }
  process.exit(1);
});

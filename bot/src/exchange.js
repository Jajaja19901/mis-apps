/* Conexión con Binance vía CCXT. Dos clientes: contado y perpetuos, con claves distintas
 * (en Testnet son cuentas separadas de verdad).
 *
 * El modo sandbox se fija AQUÍ, una vez, a partir de CONFIG.esTestnet. No hay ninguna
 * ruta que permita cambiarlo después: si el bot arrancó en testnet, se queda en testnet
 * hasta que se reinicie con otra configuración.
 */
import ccxt from "ccxt";
import { CONFIG } from "./config.js";
import { log } from "./logger.js";
import { COMISIONES_POR_DEFECTO } from "./funding.js";

function crear(clase, claves) {
  const ex = new clase({
    apiKey: claves.key,
    secret: claves.secret,
    enableRateLimit: true,
    options: { adjustForTimeDifference: true },
  });
  if (CONFIG.esTestnet) ex.setSandboxMode(true);
  return ex;
}

export const spot = crear(ccxt.binance, CONFIG.claves.spot);
export const perp = crear(ccxt.binanceusdm, CONFIG.claves.perp);

/* Se comprueba al arrancar que los clientes apuntan donde creemos. Si la URL no es de
 * testnet estando en modo testnet, se para: es la comprobación que separa "dinero de
 * prueba" de "tu dinero". */
export function verificarDestino() {
  const urls = [spot, perp].map(ex => {
    const u = ex.urls.api;
    return typeof u === "string" ? u : (u.private || u.public || u.fapiPrivate || JSON.stringify(u));
  });
  const texto = urls.join(" ");
  const pareceTestnet = /testnet|vision/i.test(texto);
  if (CONFIG.esTestnet && !pareceTestnet) {
    throw new Error(
      "Modo testnet pero los clientes no apuntan a testnet. Se para por seguridad.\n" +
      "URLs: " + texto
    );
  }
  if (!CONFIG.esTestnet && pareceTestnet) {
    throw new Error("Modo live pero los clientes apuntan a testnet. Configuración incoherente.");
  }
  return { testnet: pareceTestnet, urls };
}

let mercadosCargados = false;
export async function cargarMercados() {
  if (mercadosCargados) return;
  await Promise.all([spot.loadMarkets(), perp.loadMarkets()]);
  mercadosCargados = true;
}

/* Comisiones reales de la cuenta si el exchange las declara; si no, las documentadas.
 * Importa: con una cuenta de nivel VIP o pagando en BNB, el coste de ida y vuelta baja
 * y cambia el cálculo de cuántos cobros hacen falta para cubrirlo. */
export async function comisionesReales(simbolo) {
  const c = { ...COMISIONES_POR_DEFECTO, fuente: "valores documentados de Binance" };
  try {
    const ms = spot.markets[simbolo];
    const mp = perp.markets[perpSimbolo(simbolo)];
    if (ms && Number.isFinite(ms.taker)) { c.spotTaker = ms.taker; c.fuente = "declaradas por el exchange"; }
    if (mp && Number.isFinite(mp.taker)) { c.perpTaker = mp.taker; c.fuente = "declaradas por el exchange"; }
  } catch (e) {
    log.aviso("No se pudieron leer las comisiones del mercado, se usan las documentadas:", e.message);
  }
  return c;
}

/* "BTC/USDT" en contado es "BTC/USDT:USDT" en perpetuos de Binance. */
export function perpSimbolo(simbolo) {
  return simbolo.includes(":") ? simbolo : `${simbolo}:USDT`;
}

/* Histórico de financiación. Es la materia prima de la decisión, así que se pide de
 * verdad en vez de suponer nada a partir de la lectura actual. */
export async function historicoFunding(simbolo, limite) {
  const sym = perpSimbolo(simbolo);
  try {
    const filas = await perp.fetchFundingRateHistory(sym, undefined, limite);
    return filas.map(f => f.fundingRate).filter(Number.isFinite);
  } catch (e) {
    log.aviso(`Sin histórico de financiación para ${sym}: ${e.message}`);
    return [];
  }
}

export async function fundingActual(simbolo) {
  try {
    const r = await perp.fetchFundingRate(perpSimbolo(simbolo));
    return { tasa: r.fundingRate, proximo: r.fundingTimestamp || r.nextFundingTimestamp || null };
  } catch { return { tasa: null, proximo: null }; }
}

export async function precio(simbolo) {
  const t = await spot.fetchTicker(simbolo);
  return t.last || t.close;
}

export async function saldos() {
  const [s, p] = await Promise.all([spot.fetchBalance(), perp.fetchBalance()]);
  return {
    spotUSDT: (s.free && s.free.USDT) || 0,
    perpUSDT: (p.free && p.free.USDT) || 0,
  };
}

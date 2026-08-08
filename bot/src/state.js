/* Estado y libro de movimientos.
 *
 * El cambio de fondo respecto a la primera versión: hay un LIBRO con fecha. Antes el
 * resultado del día se calculaba sumando el neto de las posiciones cerradas hoy más la
 * financiación de las abiertas, y eso tenía tres agujeros: contaba dos veces la
 * financiación de días anteriores al cerrar, no veía las comisiones de apertura, y un
 * cierre con beneficio antiguo tapaba una pérdida de hoy. Resultado: el stop diario no
 * podía saltar nunca.
 *
 * Ahora todo movimiento de dinero se apunta con su fecha, y el resultado del día es la
 * suma de los movimientos de hoy. Sin excepciones.
 */
import fs from "node:fs";
import path from "node:path";
import { CONFIG } from "./config.js";
import { log } from "./logger.js";

const DIR = path.join(CONFIG.raiz, "data");
const RUTA = path.join(DIR, `estado.${CONFIG.modo}.json`);

export function hoy() { return new Date().toISOString().slice(0, 10); }

function porDefecto() {
  return {
    modo: CONFIG.modo,
    creadoEn: new Date().toISOString(),
    posiciones: [],
    cerradas: [],
    decisiones: [],
    movimientos: [],     // {ts, fecha, tipo, simbolo, importe}  ← la contabilidad de verdad
    fallosPorSimbolo: {},// {simbolo: {intentos, hasta}}  ← cuarentena tras fallar
    pendiente: null,     // {simbolo, qty, fase} escrito ANTES de mandar la primera orden
    desarmadoPor: null,
  };
}

let estado = porDefecto();

/* Saneado estricto. Un estado manipulado a mano llegaba a desactivar los cortafuegos:
 * un `nocional` de texto hacía que la suma fuese una concatenación, y un NaN hacía que
 * toda comparación con el límite fuese falsa. */
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }

function saneaPosicion(p) {
  if (!p || typeof p !== "object") return null;
  const qty = num(p.qty), nocional = num(p.nocional), entrada = num(p.precioEntrada);
  if (typeof p.simbolo !== "string" || !p.simbolo) return null;
  if (qty === null || qty <= 0) return null;
  if (nocional === null || nocional <= 0 || nocional > 1e9) return null;
  if (entrada === null || entrada <= 0) return null;
  return {
    ...p, qty, nocional, precioEntrada: entrada,
    id: typeof p.id === "string" ? p.id : `${p.simbolo}-${Date.now()}`,
    fundingCobrado: num(p.fundingCobrado) ?? 0,
    cobrosRecibidos: num(p.cobrosRecibidos) ?? 0,
    costeAperturaReal: num(p.costeAperturaReal) ?? 0,
  };
}

function saneaMovimiento(m) {
  if (!m || typeof m !== "object") return null;
  const importe = num(m.importe);
  if (importe === null || Math.abs(importe) > 1e9) return null;
  if (typeof m.fecha !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(m.fecha)) return null;
  return { ts: String(m.ts || ""), fecha: m.fecha, tipo: String(m.tipo || "?"),
           simbolo: String(m.simbolo || ""), importe };
}

export function cargar() {
  estado = porDefecto();
  try {
    if (!fs.existsSync(RUTA)) return estado;
    const leido = JSON.parse(fs.readFileSync(RUTA, "utf8"));
    if (!leido || typeof leido !== "object") return estado;
    if (leido.modo !== CONFIG.modo) {
      log.aviso(`El estado guardado es del modo "${leido.modo}" y estamos en "${CONFIG.modo}". Se empieza de cero.`);
      return estado;
    }
    // Campo a campo y con forma comprobada. Nada de propagar el objeto leído tal cual.
    if (Array.isArray(leido.posiciones)) estado.posiciones = leido.posiciones.map(saneaPosicion).filter(Boolean).slice(0, 50);
    if (Array.isArray(leido.cerradas))   estado.cerradas   = leido.cerradas.filter(c => c && typeof c === "object").slice(0, 200);
    if (Array.isArray(leido.decisiones)) estado.decisiones = leido.decisiones.filter(d => d && typeof d === "object").slice(0, 300);
    if (Array.isArray(leido.movimientos))estado.movimientos= leido.movimientos.map(saneaMovimiento).filter(Boolean).slice(0, 5000);
    if (leido.fallosPorSimbolo && typeof leido.fallosPorSimbolo === "object") {
      for (const [k, v] of Object.entries(leido.fallosPorSimbolo)) {
        const intentos = num(v && v.intentos), hasta = num(v && v.hasta);
        if (typeof k === "string" && intentos !== null) {
          estado.fallosPorSimbolo[k] = { intentos, hasta: hasta ?? 0 };
        }
      }
    }
    if (leido.pendiente && typeof leido.pendiente === "object" && typeof leido.pendiente.simbolo === "string") {
      estado.pendiente = leido.pendiente;
    }
    // Solo null o texto no vacío: un "" o un 0 borraban el desarme de emergencia.
    estado.desarmadoPor = (typeof leido.desarmadoPor === "string" && leido.desarmadoPor.trim())
      ? leido.desarmadoPor : null;
    const descartadas = (Array.isArray(leido.posiciones) ? leido.posiciones.length : 0) - estado.posiciones.length;
    if (descartadas > 0) {
      log.error(`${descartadas} posición(es) del estado guardado no pasaron la validación. Se desarma por precaución.`);
      estado.desarmadoPor = "el estado guardado contenía posiciones mal formadas";
    }
  } catch (e) {
    log.error("Estado ilegible, se empieza de cero:", e.message);
    estado = porDefecto();
  }
  return estado;
}

export function guardar() {
  try {
    fs.mkdirSync(DIR, { recursive: true, mode: 0o700 });
    const tmp = RUTA + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(estado, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, RUTA);
    try { fs.chmodSync(RUTA, 0o600); } catch {}
  } catch (e) {
    log.error("No se pudo guardar el estado:", e.message);
  }
}

export function get() { return estado; }

/* Todo movimiento de dinero pasa por aquí. Es lo que hace que el stop diario funcione. */
export function apuntar(tipo, simbolo, importe) {
  const n = Number(importe);
  if (!Number.isFinite(n)) { log.error(`Movimiento con importe no numérico (${tipo}/${simbolo}), se ignora`); return; }
  estado.movimientos.unshift({ ts: new Date().toISOString(), fecha: hoy(), tipo, simbolo: simbolo || "", importe: n });
  if (estado.movimientos.length > 5000) estado.movimientos.length = 5000;
}

export function anotarDecision(entrada) {
  estado.decisiones.unshift({ ts: new Date().toISOString(), ...entrada });
  if (estado.decisiones.length > 300) estado.decisiones.length = 300;
}

export function nocionalTotal() {
  return estado.posiciones.reduce((a, p) => {
    const n = Number(p.nocional);
    return a + (Number.isFinite(n) ? n : 0);
  }, 0);
}

/* El resultado del día son los movimientos de hoy. Ni más ni menos. */
export function resultadoDelDia() {
  const d = hoy();
  const s = estado.movimientos.reduce((a, m) => a + (m.fecha === d && Number.isFinite(m.importe) ? m.importe : 0), 0);
  return Number.isFinite(s) ? s : 0;
}

export function comisionesDelDia() {
  const d = hoy();
  return estado.movimientos
    .filter(m => m.fecha === d && m.tipo === "comision")
    .reduce((a, m) => a + m.importe, 0);
}

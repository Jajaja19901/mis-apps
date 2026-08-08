/* Configuración. La regla es una: si falta algo que hace falta, se para.
 *
 * Nada de `process.env.X || "valor"` en nada que afecte a la seguridad. Un valor por
 * defecto ahí significa arrancar con una configuración que nadie eligió, y esa es la forma
 * en que estas cosas pierden dinero sin que nadie lo haya decidido.
 */
import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..");

/* Carga .env sin dependencias. Se anota de dónde sale cada variable: que el entorno pise
 * al archivo en silencio es desagradable cuando estás editando un .env que se ignora. */
const ORIGEN = {};
function cargarEnv() {
  const f = path.join(RAIZ, ".env");
  if (!fs.existsSync(f)) return;
  for (const linea of fs.readFileSync(f, "utf8").split("\n")) {
    const t = linea.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    // El borrado de comentarios no se aplica a los secretos: truncaba en silencio
    // cualquier clave que contuviera " #".
    if (!/(_KEY|_SECRET)$/.test(k)) v = v.replace(/\s+#.*$/, "");
    v = v.replace(/^["'](.*)["']$/, "$1");     // quitar comillas envolventes
    if (k in process.env) { ORIGEN[k] = "entorno (pisa al .env)"; continue; }
    process.env[k] = v;
    ORIGEN[k] = ".env";
  }
}
cargarEnv();
export function origenDe(nombre) { return ORIGEN[nombre] || (nombre in process.env ? "entorno" : "sin definir"); }

const errores = [];
const avisos = [];

function exigido(nombre) {
  const v = (process.env[nombre] || "").trim();
  if (!v) errores.push(`Falta ${nombre}`);
  return v;
}
function numero(nombre, min, max) {
  const bruto = (process.env[nombre] || "").trim();
  const v = Number(bruto);
  if (!bruto || !Number.isFinite(v)) { errores.push(`${nombre} debe ser un número`); return NaN; }
  if (v < min || v > max) { errores.push(`${nombre} debe estar entre ${min} y ${max} (es ${v})`); return NaN; }
  return v;
}
function booleano(nombre) {
  const v = (process.env[nombre] || "").trim().toLowerCase();
  if (v !== "true" && v !== "false") { errores.push(`${nombre} debe ser true o false`); return false; }
  return v === "true";
}

const modo = (process.env.TRADING_MODE || "").trim().toLowerCase();
if (modo !== "paper" && modo !== "live") {
  errores.push('TRADING_MODE debe ser "paper" (recomendado) o "live".\n' +
    '    "testnet" ya no existe: CCXT retiró el sandbox de futuros de Binance, así que la\n' +
    '    pata de perpetuos fallaba siempre. El modo "paper" lo sustituye: usa precios y\n' +
    '    tasas de financiación REALES y simula la ejecución, sin necesitar claves.');
}
const esPapel = modo === "paper";

export const CONFIG = {
  modo, esPapel,
  armado: booleano("ARMED"),

  // En papel no hacen falta claves: todo lo que se lee es público.
  claves: esPapel ? { spot: {}, perp: {} } : {
    spot: { key: exigido("BINANCE_SPOT_KEY"), secret: exigido("BINANCE_SPOT_SECRET") },
    perp: { key: exigido("BINANCE_PERP_KEY"), secret: exigido("BINANCE_PERP_SECRET") },
  },

  // Apalancamiento de la pata corta. 1x significa que el corto aguanta una subida del
  // 100 % sin liquidarse. Con el 20x que Binance pone por defecto, se liquida con +4,7 %.
  apalancamiento: esPapel ? 1 : numero("LEVERAGE", 1, 5),

  riesgo: {
    maxNocionalPorPosicion: numero("MAX_NOTIONAL_PER_POSITION", 10, 1e6),
    maxNocionalTotal:       numero("MAX_TOTAL_NOTIONAL", 10, 1e7),
    maxPosiciones:          numero("MAX_POSITIONS", 1, 20),
    stopPerdidaDiaria:      numero("DAILY_LOSS_STOP", 1, 1e6),
    maxAperturasFallidasDia:numero("MAX_APERTURAS_FALLIDAS_DIA", 1, 100),
  },

  estrategia: {
    maxPeriodosHastaCubrirCoste: numero("MAX_PERIODOS_HASTA_CUBRIR_COSTE", 1, 500),
    minFundingMedioPct:          numero("MIN_FUNDING_MEDIO_PCT", 0.0001, 1),
    ventanaHistorico:            numero("VENTANA_HISTORICO", 3, 500),
    cerrarSiFundingBajaDePct:    numero("CERRAR_SI_FUNDING_BAJA_DE_PCT", 0, 1),
    simbolos: (process.env.SYMBOLS || "").split(",").map(s => s.trim()).filter(Boolean),
  },

  intervaloCicloMs: numero("INTERVALO_CICLO_S", 10, 3600) * 1000,
  puerto:           numero("PORT", 1, 65535),
  raiz: RAIZ,
};

if (!CONFIG.estrategia.simbolos.length) errores.push("SYMBOLS no puede estar vacío");

/* El modo live mueve dinero real. Exige un gesto de ESTA ejecución, no una variable
 * heredada de una sesión anterior que podría estar exportada sin que nadie se acuerde. */
if (modo === "live") {
  const porArgv = process.argv.includes("--live-de-verdad");
  const porEnv = (process.env.YES_I_UNDERSTAND_THIS_IS_REAL_MONEY || "").trim() === "yes";
  if (!porEnv || !porArgv) {
    errores.push(
      'TRADING_MODE=live mueve DINERO REAL. Hacen falta las DOS cosas:\n' +
      '    · YES_I_UNDERSTAND_THIS_IS_REAL_MONEY=yes en el .env\n' +
      '    · y arrancar con:  npm start -- --live-de-verdad\n' +
      '  Lo segundo es a propósito: una variable exportada en otra sesión no debería bastar.'
    );
  }
  if (origenDe("TRADING_MODE") === "entorno (pisa al .env)") {
    avisos.push("TRADING_MODE viene del entorno y está pisando lo que dice tu .env");
  }
}

export function validarOMorir() {
  for (const a of avisos) console.error("  aviso: " + a);
  if (!errores.length) return;
  console.error("\n  No se puede arrancar. Arregla esto en tu .env:\n");
  for (const e of errores) console.error("   · " + e);
  console.error("\n  (Hay una plantilla en .env.example)\n");
  process.exit(1);
}

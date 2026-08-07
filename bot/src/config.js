/* Configuración. La regla es una: si falta algo que hace falta, se para.
 *
 * Nada de `process.env.X || "valor"`. Un valor por defecto en una variable de seguridad
 * significa que el bot arranca operando con una configuración que nadie eligió, y esa es
 * exactamente la forma en que estas cosas pierden dinero sin que nadie lo haya decidido.
 */
import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..");

/* Carga .env sin dependencias. Solo pares clave=valor, ignora comentarios. */
function cargarEnv() {
  const f = path.join(RAIZ, ".env");
  if (!fs.existsSync(f)) return;
  for (const linea of fs.readFileSync(f, "utf8").split("\n")) {
    const t = linea.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim().replace(/\s+#.*$/, "");
    if (!(k in process.env)) process.env[k] = v;
  }
}
cargarEnv();

const errores = [];

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
if (modo !== "testnet" && modo !== "live") {
  errores.push('TRADING_MODE debe ser exactamente "testnet" o "live"');
}

export const CONFIG = {
  modo,
  esTestnet: modo === "testnet",
  armado: booleano("ARMED"),

  claves: {
    spot: { key: exigido("BINANCE_SPOT_KEY"), secret: exigido("BINANCE_SPOT_SECRET") },
    perp: { key: exigido("BINANCE_PERP_KEY"), secret: exigido("BINANCE_PERP_SECRET") },
  },

  riesgo: {
    maxNocionalPorPosicion: numero("MAX_NOTIONAL_PER_POSITION", 10, 1e6),
    maxNocionalTotal:       numero("MAX_TOTAL_NOTIONAL", 10, 1e7),
    maxPosiciones:          numero("MAX_POSITIONS", 1, 20),
    stopPerdidaDiaria:      numero("DAILY_LOSS_STOP", 1, 1e6),
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

/* El modo "live" mueve dinero de verdad. Exige un gesto explícito e imposible de hacer
 * sin querer: no basta con que una variable ponga "live". */
if (modo === "live") {
  const confirmacion = (process.env.YES_I_UNDERSTAND_THIS_IS_REAL_MONEY || "").trim();
  if (confirmacion !== "yes") {
    errores.push(
      'TRADING_MODE=live mueve DINERO REAL. Para permitirlo hay que añadir además\n' +
      '    YES_I_UNDERSTAND_THIS_IS_REAL_MONEY=yes\n' +
      '  No lo hagas hasta llevar semanas de datos en testnet que digan que la estrategia gana.'
    );
  }
}

export function validarOMorir() {
  if (!errores.length) return;
  console.error("\n  No se puede arrancar. Arregla esto en tu .env:\n");
  for (const e of errores) console.error("   · " + e);
  console.error("\n  (Hay una plantilla en .env.example)\n");
  process.exit(1);
}

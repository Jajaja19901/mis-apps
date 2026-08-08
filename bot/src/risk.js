/* Cortafuegos. Se comprueban antes de cada apertura, en orden, y el primero que salta
 * manda.
 *
 * Regla nueva tras la auditoría: si un número que gobierna un límite no es finito, se
 * FALLA CERRADO. Antes, un NaN hacía que toda comparación fuese falsa y el límite dejaba
 * de existir en silencio — que es la peor forma de que falle un cortafuegos.
 */
import { CONFIG } from "./config.js";
import * as estado from "./state.js";

function finito(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }

export function comprobarAntesDeAbrir(nocionalPropuesto) {
  const st = estado.get();
  const r = CONFIG.riesgo;

  if (st.desarmadoPor) return { ok: false, motivo: `el bot está desarmado: ${st.desarmadoPor}` };
  if (st.pendiente) return { ok: false, motivo: `hay una operación a medias sin resolver (${st.pendiente.simbolo}): revísala antes de seguir` };

  const nocional = finito(nocionalPropuesto);
  if (nocional === null || nocional <= 0) return { ok: false, motivo: "el importe calculado no es un número válido" };
  if (nocional > r.maxNocionalPorPosicion) {
    return { ok: false, motivo: `${nocional.toFixed(2)} USDT supera el máximo por posición (${r.maxNocionalPorPosicion})` };
  }
  if (st.posiciones.length >= r.maxPosiciones) {
    return { ok: false, motivo: `ya hay ${st.posiciones.length} posiciones abiertas (máximo ${r.maxPosiciones})` };
  }

  const total = finito(estado.nocionalTotal());
  if (total === null) return { ok: false, motivo: "la exposición total no se puede calcular: el estado está corrupto" };
  if (total + nocional > r.maxNocionalTotal) {
    return { ok: false, motivo: `la exposición total llegaría a ${(total + nocional).toFixed(2)} USDT (máximo ${r.maxNocionalTotal})` };
  }

  const hoy = finito(estado.resultadoDelDia());
  if (hoy === null) return { ok: false, motivo: "el resultado del día no se puede calcular: el estado está corrupto" };
  if (hoy <= -Math.abs(r.stopPerdidaDiaria)) {
    return { ok: false, motivo: `el día acumula ${hoy.toFixed(2)} USDT y el tope de pérdida son ${r.stopPerdidaDiaria}` };
  }

  const fallosHoy = st.decisiones.filter(d =>
    d.tipo === "error-abrir" && String(d.ts).slice(0, 10) === estado.hoy()).length;
  if (fallosHoy >= r.maxAperturasFallidasDia) {
    return { ok: false, motivo: `${fallosHoy} aperturas fallidas hoy (máximo ${r.maxAperturasFallidasDia})` };
  }
  return { ok: true };
}

/* Cuarentena por símbolo. Sin esto, un símbolo que falla al abrir se reintentaba cada
 * ciclo indefinidamente: dos órdenes a mercado por minuto, y ningún límite lo veía porque
 * no llegaba a haber posición. */
export function enCuarentena(simbolo) {
  const f = estado.get().fallosPorSimbolo[simbolo];
  if (!f || !Number.isFinite(f.hasta)) return null;
  if (Date.now() >= f.hasta) return null;
  return { hasta: f.hasta, intentos: f.intentos, segundos: Math.ceil((f.hasta - Date.now()) / 1000) };
}

export function anotarFallo(simbolo) {
  const st = estado.get();
  const f = st.fallosPorSimbolo[simbolo] || { intentos: 0, hasta: 0 };
  f.intentos += 1;
  // 2 min, 4, 8… hasta 2 horas.
  const espera = Math.min(2 * 60 * 1000 * Math.pow(2, f.intentos - 1), 2 * 60 * 60 * 1000);
  f.hasta = Date.now() + espera;
  st.fallosPorSimbolo[simbolo] = f;
  estado.guardar();
  return f;
}

export function limpiarFallos(simbolo) {
  const st = estado.get();
  if (st.fallosPorSimbolo[simbolo]) { delete st.fallosPorSimbolo[simbolo]; estado.guardar(); }
}

/* Se llama en cada ciclo, haya o no candidatos: el stop diario tiene que poder saltar
 * aunque el bot no esté intentando abrir nada. */
export function comprobarStopDiario() {
  const st = estado.get();
  if (st.desarmadoPor) return { desarmar: false };
  const hoy = finito(estado.resultadoDelDia());
  if (hoy === null) return { desarmar: true, motivo: "el resultado del día no se puede calcular" };
  if (hoy <= -Math.abs(CONFIG.riesgo.stopPerdidaDiaria)) {
    return { desarmar: true, motivo: `pérdida diaria de ${hoy.toFixed(2)} USDT` };
  }
  return { desarmar: false };
}

export function desarmar(motivo) {
  const st = estado.get();
  st.desarmadoPor = motivo;
  estado.guardar();
}

export function rearmar() {
  const st = estado.get();
  st.desarmadoPor = null;
  estado.guardar();
}

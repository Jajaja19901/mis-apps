/* Cortafuegos. Se comprueban ANTES de cada apertura, en orden, y el primero que salta
 * manda. Ninguno depende de que el exchange responda algo concreto: todos se calculan
 * con lo que ya sabemos, para que una respuesta rara de la API no pueda desactivarlos.
 */
import { CONFIG } from "./config.js";
import * as estado from "./state.js";

export function comprobarAntesDeAbrir(nocionalPropuesto) {
  const st = estado.get();
  const r = CONFIG.riesgo;

  if (st.desarmadoPor) {
    return { ok: false, motivo: `el bot está desarmado: ${st.desarmadoPor}` };
  }
  if (!Number.isFinite(nocionalPropuesto) || nocionalPropuesto <= 0) {
    return { ok: false, motivo: "el importe calculado no es un número válido" };
  }
  if (nocionalPropuesto > r.maxNocionalPorPosicion) {
    return { ok: false, motivo: `${nocionalPropuesto.toFixed(2)} USDT supera el máximo por posición (${r.maxNocionalPorPosicion})` };
  }
  if (st.posiciones.length >= r.maxPosiciones) {
    return { ok: false, motivo: `ya hay ${st.posiciones.length} posiciones abiertas (máximo ${r.maxPosiciones})` };
  }
  const total = estado.nocionalTotal();
  if (total + nocionalPropuesto > r.maxNocionalTotal) {
    return { ok: false, motivo: `la exposición total llegaría a ${(total + nocionalPropuesto).toFixed(2)} USDT (máximo ${r.maxNocionalTotal})` };
  }
  const resultadoHoy = estado.resultadoDelDia();
  if (resultadoHoy <= -Math.abs(r.stopPerdidaDiaria)) {
    return { ok: false, motivo: `el día acumula ${resultadoHoy.toFixed(2)} USDT y el tope de pérdida son ${r.stopPerdidaDiaria}` };
  }
  return { ok: true };
}

/* Se llama en cada ciclo, haya o no candidatos: el stop diario tiene que poder saltar
 * aunque el bot no esté intentando abrir nada. */
export function comprobarStopDiario() {
  const st = estado.get();
  if (st.desarmadoPor) return { desarmar: false };
  const resultadoHoy = estado.resultadoDelDia();
  if (resultadoHoy <= -Math.abs(CONFIG.riesgo.stopPerdidaDiaria)) {
    return { desarmar: true, motivo: `pérdida diaria de ${resultadoHoy.toFixed(2)} USDT` };
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

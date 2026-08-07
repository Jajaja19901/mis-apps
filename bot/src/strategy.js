/* El ciclo. Mira el mercado, decide, y solo actúa si está armado.
 *
 * Con ARMED=false hace exactamente lo mismo salvo mandar las órdenes, y deja anotado en
 * las decisiones lo que HABRÍA hecho. Esa es la forma de comprobar si te fías de él antes
 * de darle permiso: leer una semana de decisiones que no costaron nada.
 */
import { CONFIG } from "./config.js";
import { log } from "./logger.js";
import * as estado from "./state.js";
import * as riesgo from "./risk.js";
import * as ex from "./exchange.js";
import { evaluar, ordenarCandidatos, resultadoPosicion, COBROS_POR_DIA } from "./funding.js";

let ultimoCiclo = null;
export function ultimoResumen() { return ultimoCiclo; }

export async function ciclo() {
  const st = estado.get();
  const inicio = Date.now();

  // 1) El stop diario se comprueba siempre, se vaya a abrir algo o no.
  const stop = riesgo.comprobarStopDiario();
  if (stop.desarmar) {
    riesgo.desarmar(stop.motivo);
    log.aviso("Desarmado automáticamente:", stop.motivo);
  }

  // 2) Evaluar todos los símbolos configurados.
  const evaluaciones = [];
  for (const simbolo of CONFIG.estrategia.simbolos) {
    try {
      const historico = await ex.historicoFunding(simbolo, CONFIG.estrategia.ventanaHistorico);
      const comisiones = await ex.comisionesReales(simbolo);
      const ev = evaluar(simbolo, historico, CONFIG.estrategia, comisiones);
      ev.comisiones = comisiones;
      evaluaciones.push(ev);
    } catch (e) {
      log.error(`Fallo evaluando ${simbolo}:`, e.message);
      evaluaciones.push({ simbolo, apto: false, motivos: ["error al consultar: " + e.message], muestras: 0 });
    }
  }

  // 3) ¿Alguna posición abierta debería cerrarse?
  const cierres = [];
  for (const pos of [...st.posiciones]) {
    const ev = evaluaciones.find(e => e.simbolo === pos.simbolo);
    if (!ev) continue;
    const res = resultadoPosicion(pos, ev.comisiones);
    // Se cierra si la financiación se ha secado Y ya hemos recuperado el coste. Cerrar
    // antes de cubrir el coste es realizar una pérdida por impaciencia: mientras la
    // financiación no sea negativa, esperar es gratis.
    const secada = ev.tasaMediaPct !== undefined && ev.tasaMediaPct < CONFIG.estrategia.cerrarSiFundingBajaDePct;
    const cubierto = res.netoSiCierraAhora > 0;
    if (secada && cubierto) {
      cierres.push({ pos, motivo: `financiación caída a ${ev.tasaMediaPct.toFixed(4)} % y el coste ya está cubierto (neto ${res.netoSiCierraAhora.toFixed(2)} USDT)` });
    } else if (secada && !cubierto) {
      estado.anotarDecision({
        tipo: "mantener", simbolo: pos.simbolo,
        detalle: `la financiación se ha secado pero cerrar ahora dejaría ${res.netoSiCierraAhora.toFixed(2)} USDT: se mantiene hasta cubrir el coste`,
      });
    }
  }
  for (const c of cierres) await cerrar(c.pos, c.motivo);

  // 4) ¿Abrir algo nuevo?
  const candidatos = ordenarCandidatos(evaluaciones);
  const descartados = evaluaciones.filter(e => !e.apto);

  let abierta = null;
  if (candidatos.length) {
    const mejor = candidatos[0];
    const yaAbierto = st.posiciones.some(p => p.simbolo === mejor.simbolo);
    if (yaAbierto) {
      estado.anotarDecision({ tipo: "saltar", simbolo: mejor.simbolo, detalle: "ya hay una posición abierta en este símbolo" });
    } else {
      const nocional = CONFIG.riesgo.maxNocionalPorPosicion;
      const permiso = riesgo.comprobarAntesDeAbrir(nocional);
      if (!permiso.ok) {
        estado.anotarDecision({ tipo: "bloqueado", simbolo: mejor.simbolo, detalle: permiso.motivo });
      } else {
        abierta = await abrir(mejor, nocional);
      }
    }
  } else {
    estado.anotarDecision({
      tipo: "sin-candidatos",
      detalle: descartados.length
        ? descartados.map(d => `${d.simbolo}: ${d.motivos[0]}`).join(" · ")
        : "ningún símbolo evaluado",
    });
  }

  estado.guardar();
  ultimoCiclo = {
    ts: new Date().toISOString(),
    duracionMs: Date.now() - inicio,
    evaluaciones,
    candidatos: candidatos.map(c => c.simbolo),
    abierta,
    cierres: cierres.length,
  };
  return ultimoCiclo;
}

async function abrir(ev, nocional) {
  const st = estado.get();
  const detalle = `financiación media ${ev.tasaMediaPct.toFixed(4)} % · cubre el coste en ${ev.periodosHastaCubrirCoste.toFixed(0)} cobros (${ev.diasHastaCubrirCoste.toFixed(1)} días) · APR ${ev.aprPct.toFixed(1)} %`;

  if (!CONFIG.armado) {
    estado.anotarDecision({ tipo: "simulado-abrir", simbolo: ev.simbolo, detalle: `HABRÍA abierto ${nocional} USDT — ${detalle}` });
    log.info(`[sin armar] habría abierto ${ev.simbolo} por ${nocional} USDT — ${detalle}`);
    return null;
  }

  try {
    const precio = await ex.precio(ev.simbolo);
    const qty = nocional / precio;
    // Contado: comprar. Perpetuo: vender el mismo importe. Las dos patas o ninguna.
    const ordenSpot = await ex.spot.createOrder(ev.simbolo, "market", "buy", qty);
    let ordenPerp;
    try {
      ordenPerp = await ex.perp.createOrder(ex.perpSimbolo(ev.simbolo), "market", "sell", qty);
    } catch (e) {
      // Si la segunda pata falla nos hemos quedado comprados y expuestos al precio:
      // se deshace inmediatamente lo que sí entró.
      log.error(`La pata de perpetuos falló en ${ev.simbolo}, se deshace la de contado:`, e.message);
      try { await ex.spot.createOrder(ev.simbolo, "market", "sell", qty); } catch (e2) {
        log.error("¡No se pudo deshacer la pata de contado! Revisar a mano:", e2.message);
        riesgo.desarmar("quedó una pata suelta sin poder deshacerse; hace falta revisión manual");
      }
      estado.anotarDecision({ tipo: "error-abrir", simbolo: ev.simbolo, detalle: "falló la pata de perpetuos: " + e.message });
      return null;
    }

    const pos = {
      id: `${ev.simbolo}-${Date.now()}`,
      simbolo: ev.simbolo,
      nocional,
      qty,
      precioEntrada: precio,
      abiertaEn: new Date().toISOString(),
      fundingCobrado: 0,
      fundingHoy: 0,
      cobrosRecibidos: 0,
      idSpot: ordenSpot.id,
      idPerp: ordenPerp.id,
      evaluacionAlAbrir: { tasaMediaPct: ev.tasaMediaPct, periodos: ev.periodosHastaCubrirCoste },
    };
    st.posiciones.push(pos);
    estado.anotarDecision({ tipo: "abrir", simbolo: ev.simbolo, detalle: `${nocional} USDT — ${detalle}` });
    log.info(`Abierta ${ev.simbolo} por ${nocional} USDT — ${detalle}`);
    return pos;
  } catch (e) {
    log.error(`No se pudo abrir ${ev.simbolo}:`, e.message);
    estado.anotarDecision({ tipo: "error-abrir", simbolo: ev.simbolo, detalle: e.message });
    return null;
  }
}

async function cerrar(pos, motivo) {
  const st = estado.get();
  if (!CONFIG.armado) {
    estado.anotarDecision({ tipo: "simulado-cerrar", simbolo: pos.simbolo, detalle: `HABRÍA cerrado — ${motivo}` });
    return;
  }
  try {
    await ex.spot.createOrder(pos.simbolo, "market", "sell", pos.qty);
    await ex.perp.createOrder(ex.perpSimbolo(pos.simbolo), "market", "buy", pos.qty);
    const res = resultadoPosicion(pos);
    st.posiciones = st.posiciones.filter(p => p.id !== pos.id);
    st.cerradas.unshift({ ...pos, cerradaEn: new Date().toISOString(), motivo, neto: res.netoSiCierraAhora });
    if (st.cerradas.length > 200) st.cerradas.length = 200;
    estado.anotarDecision({ tipo: "cerrar", simbolo: pos.simbolo, detalle: `${motivo} — neto ${res.netoSiCierraAhora.toFixed(2)} USDT` });
    log.info(`Cerrada ${pos.simbolo}: ${motivo}`);
  } catch (e) {
    log.error(`No se pudo cerrar ${pos.simbolo}:`, e.message);
    estado.anotarDecision({ tipo: "error-cerrar", simbolo: pos.simbolo, detalle: e.message });
  }
}

/* Los cobros de financiación se leen del exchange, no se estiman: es el ingreso real de
 * la estrategia y estimarlo sería inventarse el resultado. */
export async function actualizarFunding() {
  const st = estado.get();
  if (!st.posiciones.length) return;
  const hoy = new Date().toISOString().slice(0, 10);
  for (const pos of st.posiciones) {
    try {
      const pagos = await ex.perp.fetchFundingHistory(ex.perpSimbolo(pos.simbolo), new Date(pos.abiertaEn).getTime());
      const total = pagos.reduce((a, p) => a + (p.amount || 0), 0);
      pos.fundingCobrado = total;
      pos.cobrosRecibidos = pagos.length;
      pos.fundingHoy = pagos
        .filter(p => new Date(p.timestamp).toISOString().slice(0, 10) === hoy)
        .reduce((a, p) => a + (p.amount || 0), 0);
    } catch (e) {
      log.aviso(`No se pudo leer la financiación cobrada de ${pos.simbolo}: ${e.message}`);
    }
  }
  estado.guardar();
}

/* El ciclo: mira el mercado, decide, y actúa solo si está armado.
 *
 * Cambios de fondo tras la auditoría:
 *  · Se apunta lo que se va a hacer ANTES de mandar la primera orden, y al arrancar se
 *    reconcilia contra el exchange. Antes, morir entre las dos órdenes no dejaba rastro y
 *    al reiniciar se volvía a abrir sobre una posición que ya existía.
 *  · Todo coste se apunta en el libro con su fecha, incluidos los intentos fallidos. Sin
 *    eso el stop diario no podía saltar nunca.
 *  · Un símbolo que falla entra en cuarentena con espera creciente, en vez de reintentarse
 *    cada minuto para siempre.
 *  · Con financiación negativa se cierra, sin esperar a cubrir el coste. La regla anterior
 *    se autoalimentaba: cuanto más se pagaba, más lejos quedaba el "ya lo he cubierto".
 */
import { CONFIG } from "./config.js";
import { log } from "./logger.js";
import * as estado from "./state.js";
import * as riesgo from "./risk.js";
import { evaluar, ordenarCandidatos, resultadoPosicion, COBROS_POR_DIA } from "./funding.js";

let broker = null;
let ultimoCiclo = null;
export function usarBroker(b) { broker = b; }
export function ultimoResumen() { return ultimoCiclo; }

/* Al arrancar: ¿lo que creemos tener coincide con lo que hay en el exchange? */
export async function reconciliar() {
  const st = estado.get();
  if (st.pendiente) {
    const p = st.pendiente;
    riesgo.desarmar(`quedó una operación a medias en ${p.simbolo} (fase: ${p.fase}). Revísala en el exchange y borra "pendiente" del estado cuando esté resuelta.`);
    log.error(`Operación a medias detectada en ${p.simbolo}. Se arranca desarmado.`);
    return { ok: false, motivo: "operación a medias" };
  }
  const reales = await broker.posicionesReales();
  if (reales === null) return { ok: true, nota: "sin verificación (modo papel o no disponible)" };

  const mias = new Map(st.posiciones.map(p => [p.simbolo, p]));
  const suyas = new Map(reales.map(p => [p.simbolo.replace(":USDT", ""), p]));
  const huerfanas = reales.filter(r => !mias.has(r.simbolo.replace(":USDT", "")));
  const fantasmas = st.posiciones.filter(p => !suyas.has(p.simbolo));

  if (huerfanas.length || fantasmas.length) {
    const det = [
      huerfanas.length ? `${huerfanas.length} posición(es) en el exchange que el bot no conoce (${huerfanas.map(h => h.simbolo).join(", ")})` : "",
      fantasmas.length ? `${fantasmas.length} posición(es) que el bot cree tener y no existen (${fantasmas.map(f => f.simbolo).join(", ")})` : "",
    ].filter(Boolean).join(" · ");
    riesgo.desarmar(`el estado no cuadra con el exchange: ${det}`);
    log.error("Reconciliación fallida:", det);
    return { ok: false, motivo: det };
  }
  return { ok: true, nota: `${reales.length} posición(es), todo cuadra` };
}

export async function ciclo() {
  const st = estado.get();
  const inicio = Date.now();

  const stop = riesgo.comprobarStopDiario();
  if (stop.desarmar) { riesgo.desarmar(stop.motivo); log.aviso("Desarmado automáticamente:", stop.motivo); }

  // 1) Evaluar
  const evaluaciones = [];
  for (const simbolo of CONFIG.estrategia.simbolos) {
    try {
      const [historico, comisiones, mercado] = await Promise.all([
        broker.historicoFunding(simbolo, CONFIG.estrategia.ventanaHistorico),
        broker.comisiones(simbolo),
        broker.datosMercado(simbolo),
      ]);
      const ev = evaluar(simbolo, historico, CONFIG.estrategia, comisiones, mercado);
      ev.comisiones = comisiones; ev.mercado = mercado;
      const q = riesgo.enCuarentena(simbolo);
      if (q) { ev.apto = false; ev.motivos = [`en cuarentena ${q.segundos}s tras ${q.intentos} fallo(s)`, ...ev.motivos]; }
      evaluaciones.push(ev);
    } catch (e) {
      log.error(`Fallo evaluando ${simbolo}:`, e.message);
      evaluaciones.push({ simbolo, apto: false, motivos: ["error al consultar el mercado"], muestras: 0 });
    }
  }

  // 2) ¿Cerrar algo?
  let cerradas = 0;
  for (const pos of [...st.posiciones]) {
    const ev = evaluaciones.find(e => e.simbolo === pos.simbolo);
    if (!ev || !ev.mercado) continue;
    const res = resultadoPosicion(pos, ev.comisiones, ev.mercado.midSpot);
    const negativa = ev.tasaMediaPct < 0;
    const secada = ev.tasaMediaPct < CONFIG.estrategia.cerrarSiFundingBajaDePct;

    if (negativa) {
      // Sin condiciones. Seguir dentro con financiación negativa es pagar cada 8 horas.
      if (await cerrar(pos, ev, `financiación NEGATIVA (${ev.tasaMediaPct.toFixed(4)} %): seguir dentro cuesta dinero cada cobro`)) cerradas++;
    } else if (secada && res.netoSiCierraAhora > 0) {
      if (await cerrar(pos, ev, `financiación caída a ${ev.tasaMediaPct.toFixed(4)} % y el coste ya está cubierto (neto ${res.netoSiCierraAhora.toFixed(2)} USDT)`)) cerradas++;
    } else if (secada) {
      estado.anotarDecision({ tipo: "mantener", simbolo: pos.simbolo,
        detalle: `financiación floja pero cerrar dejaría ${res.netoSiCierraAhora.toFixed(2)} USDT: se espera a cubrir el coste` });
    }
  }

  // 3) ¿Abrir?
  const candidatos = ordenarCandidatos(evaluaciones);
  let abierta = null;
  if (!candidatos.length) {
    const desc = evaluaciones.filter(e => !e.apto);
    estado.anotarDecision({ tipo: "sin-candidatos",
      detalle: desc.length ? desc.map(d => `${d.simbolo}: ${d.motivos[0]}`).join(" · ") : "ningún símbolo evaluado" });
  } else {
    const mejor = candidatos[0];
    if (st.posiciones.some(p => p.simbolo === mejor.simbolo)) {
      estado.anotarDecision({ tipo: "saltar", simbolo: mejor.simbolo, detalle: "ya hay una posición abierta en este símbolo" });
    } else {
      const permiso = riesgo.comprobarAntesDeAbrir(CONFIG.riesgo.maxNocionalPorPosicion);
      if (!permiso.ok) estado.anotarDecision({ tipo: "bloqueado", simbolo: mejor.simbolo, detalle: permiso.motivo });
      else abierta = await abrir(mejor);
    }
  }

  estado.guardar();
  ultimoCiclo = { ts: new Date().toISOString(), duracionMs: Date.now() - inicio,
                  evaluaciones, candidatos: candidatos.map(c => c.simbolo), abierta, cerradas };
  return ultimoCiclo;
}

async function abrir(ev) {
  const st = estado.get();
  const nocional = CONFIG.riesgo.maxNocionalPorPosicion;
  const m = ev.mercado;
  const detalle = `financiación media ${ev.tasaMediaPct.toFixed(4)} % · cubre el coste (${ev.costeIdaVueltaPct.toFixed(3)} %) en ${ev.periodosHastaCubrirCoste.toFixed(0)} cobros (${ev.diasHastaCubrirCoste.toFixed(1)} días)`;

  // Precio y cantidad, validados. Con un ticker vacío se llegaban a mandar órdenes con
  // cantidad NaN y a registrar la posición como abierta.
  const precio = m.askSpot;
  if (!Number.isFinite(precio) || precio <= 0) {
    estado.anotarDecision({ tipo: "error-abrir", simbolo: ev.simbolo, detalle: "precio inválido" });
    return null;
  }
  const qty = broker.cantidadComun(ev.simbolo, nocional / precio);
  if (!Number.isFinite(qty) || qty <= 0) {
    estado.anotarDecision({ tipo: "error-abrir", simbolo: ev.simbolo, detalle: "no se pudo alinear la cantidad con el paso de lote de los dos mercados" });
    return null;
  }
  const min = broker.minimos(ev.simbolo);
  if (qty < min.minQty || qty * precio < min.minCost) {
    estado.anotarDecision({ tipo: "bloqueado", simbolo: ev.simbolo,
      detalle: `el importe (${(qty * precio).toFixed(2)} USDT) no llega al mínimo del par` });
    return null;
  }
  const nocionalReal = qty * precio;
  if (nocionalReal > CONFIG.riesgo.maxNocionalPorPosicion * 1.05) {
    estado.anotarDecision({ tipo: "bloqueado", simbolo: ev.simbolo, detalle: "el redondeo del lote se pasa del máximo por posición" });
    return null;
  }

  if (!CONFIG.armado) {
    estado.anotarDecision({ tipo: "simulado-abrir", simbolo: ev.simbolo, detalle: `HABRÍA abierto ${nocionalReal.toFixed(2)} USDT — ${detalle}` });
    return null;
  }

  const prep = await broker.prepararMercado(ev.simbolo);
  if (!prep.ok) {
    riesgo.anotarFallo(ev.simbolo);
    estado.anotarDecision({ tipo: "error-abrir", simbolo: ev.simbolo, detalle: prep.motivo });
    return null;
  }
  const saldo = await broker.saldos();
  const margenNecesario = nocionalReal / CONFIG.apalancamiento;
  if (saldo.spotUSDT < nocionalReal || saldo.perpUSDT < margenNecesario * 1.35) {
    estado.anotarDecision({ tipo: "bloqueado", simbolo: ev.simbolo,
      detalle: `saldo insuficiente: hacen falta ${nocionalReal.toFixed(0)} en contado y ${(margenNecesario * 1.35).toFixed(0)} de margen en futuros` });
    return null;
  }

  // Escritura anticipada: si el proceso muere ahora, al arrancar se detecta y se desarma.
  st.pendiente = { simbolo: ev.simbolo, qty, fase: "abriendo", ts: new Date().toISOString() };
  estado.guardar();

  const r = await broker.abrirPar(ev.simbolo, qty, m);

  if (!r.ok) {
    st.pendiente = null;
    const tarifa = ev.comisiones.spotTaker + ev.comisiones.perpTaker;
    // El intento fallido CUESTA dinero (compra + venta de deshacer). Se apunta, o el stop
    // diario nunca vería el sangrado de un bucle de intentos.
    estado.apuntar("comision", ev.simbolo, -(nocionalReal * ev.comisiones.spotTaker * 2));
    const f = riesgo.anotarFallo(ev.simbolo);
    estado.anotarDecision({ tipo: "error-abrir", simbolo: ev.simbolo, detalle: r.motivo });
    if (r.patasSueltas) {
      riesgo.desarmar(`posible pata suelta en ${ev.simbolo}: ${r.motivo}`);
      log.error("PATA SUELTA:", r.motivo);
    }
    log.aviso(`Apertura fallida en ${ev.simbolo} (intento ${f.intentos}): ${r.motivo}`);
    estado.guardar();
    return null;
  }

  const costeReal = (r.qtySpot * r.fillSpot * ev.comisiones.spotTaker) + (r.qtyPerp * r.fillPerp * ev.comisiones.perpTaker);
  const pos = {
    id: `${ev.simbolo}-${Date.now()}`, simbolo: ev.simbolo,
    qty: Math.min(r.qtySpot, r.qtyPerp), qtySpot: r.qtySpot, qtyPerp: r.qtyPerp,
    nocional: r.qtySpot * r.fillSpot, precioEntrada: r.fillSpot, precioEntradaPerp: r.fillPerp,
    abiertaEn: new Date().toISOString(), abiertaEnMs: Date.now(),
    fundingCobrado: 0, cobrosRecibidos: 0, costeAperturaReal: costeReal,
    simulado: !!r.simulado,
    evaluacionAlAbrir: { tasaMediaPct: ev.tasaMediaPct, periodos: ev.periodosHastaCubrirCoste, costePct: ev.costeIdaVueltaPct },
  };
  if (Math.abs(r.qtySpot - r.qtyPerp) / Math.max(r.qtySpot, r.qtyPerp) > 0.005) {
    pos.desajuste = Math.abs(r.qtySpot - r.qtyPerp);
    riesgo.desarmar(`las dos patas de ${ev.simbolo} no cuadran (${r.qtySpot} vs ${r.qtyPerp}): hay exposición direccional`);
  }
  st.posiciones.push(pos);
  st.pendiente = null;
  estado.apuntar("comision", ev.simbolo, -costeReal);
  riesgo.limpiarFallos(ev.simbolo);
  estado.anotarDecision({ tipo: "abrir", simbolo: ev.simbolo, detalle: `${pos.nocional.toFixed(2)} USDT — ${detalle}` });
  log.info(`Abierta ${ev.simbolo} por ${pos.nocional.toFixed(2)} USDT — ${detalle}`);
  estado.guardar();
  return pos;
}

/* Cerrar SÍ está permitido con el bot desarmado: desarmar impide abrir riesgo nuevo, no
 * deshacer el que ya hay. Quedarse dentro a la fuerza sería lo contrario de un botón de
 * pánico. */
async function cerrar(pos, ev, motivo) {
  const st = estado.get();
  if (!CONFIG.armado) {
    estado.anotarDecision({ tipo: "simulado-cerrar", simbolo: pos.simbolo, detalle: `HABRÍA cerrado — ${motivo}` });
    return false;
  }
  st.pendiente = { simbolo: pos.simbolo, qty: pos.qty, fase: "cerrando", ts: new Date().toISOString() };
  estado.guardar();

  const r = await broker.cerrarPar(pos, ev.mercado);
  if (!r.ok) {
    st.pendiente = r.patasSueltas ? st.pendiente : null;
    estado.anotarDecision({ tipo: "error-cerrar", simbolo: pos.simbolo, detalle: r.motivo });
    if (r.patasSueltas) {
      riesgo.desarmar(`cierre a medias en ${pos.simbolo}: ${r.motivo}`);
      log.error("CIERRE A MEDIAS:", r.motivo);
    }
    estado.guardar();
    return false;
  }

  const tarifa = ev.comisiones.spotTaker + ev.comisiones.perpTaker;
  const costeCierre = pos.qty * (r.fillSpot || ev.mercado.midSpot) * tarifa;
  const res = resultadoPosicion(pos, ev.comisiones, ev.mercado.midSpot);
  st.posiciones = st.posiciones.filter(p => p.id !== pos.id);
  st.cerradas.unshift({ ...pos, cerradaEn: new Date().toISOString(), motivo, neto: res.netoSiCierraAhora });
  if (st.cerradas.length > 200) st.cerradas.length = 200;
  st.pendiente = null;
  estado.apuntar("comision", pos.simbolo, -costeCierre);
  estado.anotarDecision({ tipo: "cerrar", simbolo: pos.simbolo, detalle: `${motivo} — neto ${res.netoSiCierraAhora.toFixed(2)} USDT` });
  log.info(`Cerrada ${pos.simbolo}: ${motivo}`);
  estado.guardar();
  return true;
}

/* La financiación cobrada se lee del exchange (o se calcula con las tasas reales en modo
 * papel) y se apunta al libro por su DIFERENCIA, no por el total: si no, el resultado del
 * día contaría cada día toda la financiación acumulada desde que se abrió. */
export async function actualizarFunding() {
  const st = estado.get();
  if (!st.posiciones.length) return;
  for (const pos of st.posiciones) {
    try {
      const r = await broker.fundingDesde(pos.simbolo, pos.abiertaEnMs || new Date(pos.abiertaEn).getTime(),
                                          pos.qty, pos.precioEntrada);
      const anterior = Number.isFinite(pos.fundingCobrado) ? pos.fundingCobrado : 0;
      const total = Number.isFinite(r.total) ? r.total : anterior;
      const delta = total - anterior;
      if (Math.abs(delta) > 1e-9) estado.apuntar("funding", pos.simbolo, delta);
      pos.fundingCobrado = total;
      pos.cobrosRecibidos = r.cobros;
    } catch (e) {
      log.aviso(`No se pudo actualizar la financiación de ${pos.simbolo}`);
    }
  }
  estado.guardar();
}

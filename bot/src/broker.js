/* El intermediario con el mercado. Dos implementaciones tras la misma interfaz, para que
 * la estrategia sea EXACTAMENTE el mismo código en los dos casos — lo que validas en papel
 * es lo que se ejecutaría de verdad.
 *
 *   papel : lee precios y financiación REALES de los endpoints públicos (sin claves) y
 *           simula la ejecución aplicando los costes medidos del libro. Es lo que
 *           sustituye al testnet, que ya no sirve: CCXT retiró el sandbox de futuros de
 *           Binance y toda llamada privada de futuros lanza NotSupported.
 *   real  : ejecuta de verdad. Exige claves.
 */
import ccxt from "ccxt";
import { log } from "./logger.js";
import { COMISIONES_POR_DEFECTO } from "./funding.js";

export function perpSimbolo(s) { return s.includes(":") ? s : `${s}:USDT`; }

function nuevoCliente(clase, claves) {
  return new clase({
    apiKey: claves ? claves.key : undefined,
    secret: claves ? claves.secret : undefined,
    enableRateLimit: true,
    options: { adjustForTimeDifference: true },
  });
}

/* ---------------------------------------------------------------------------
 * Lectura del mercado. Común a los dos modos: los precios son reales siempre.
 * --------------------------------------------------------------------------- */
class LectorMercado {
  constructor(spot, perp) { this.spot = spot; this.perp = perp; this.cargados = false; }

  async cargarMercados() {
    if (this.cargados) return;
    await Promise.all([this.spot.loadMarkets(), this.perp.loadMarkets()]);
    this.cargados = true;
  }

  /* Horquilla y base salen del libro real, no de una suposición: son la mitad del coste
     de ida y vuelta y varían muchísimo entre BTC y una alt. */
  async datosMercado(simbolo) {
    const ps = perpSimbolo(simbolo);
    const [ls, lp] = await Promise.all([
      this.spot.fetchOrderBook(simbolo, 5),
      this.perp.fetchOrderBook(ps, 5),
    ]);
    const bidS = ls.bids?.[0]?.[0], askS = ls.asks?.[0]?.[0];
    const bidP = lp.bids?.[0]?.[0], askP = lp.asks?.[0]?.[0];
    if (![bidS, askS, bidP, askP].every(v => Number.isFinite(v) && v > 0)) {
      throw new Error(`libro incompleto para ${simbolo}`);
    }
    const midS = (bidS + askS) / 2, midP = (bidP + askP) / 2;
    return {
      bidSpot: bidS, askSpot: askS, midSpot: midS,
      bidPerp: bidP, askPerp: askP, midPerp: midP,
      spreadSpot: (askS - bidS) / midS,
      spreadPerp: (askP - bidP) / midP,
      base: (midP - midS) / midS,
      profundidadSpot: (ls.asks || []).slice(0, 5).reduce((a, [p, q]) => a + p * q, 0),
      profundidadPerp: (lp.bids || []).slice(0, 5).reduce((a, [p, q]) => a + p * q, 0),
    };
  }

  async historicoFunding(simbolo, limite) {
    try {
      const filas = await this.perp.fetchFundingRateHistory(perpSimbolo(simbolo), undefined, limite);
      return filas.map(f => f.fundingRate).filter(Number.isFinite);
    } catch (e) {
      log.aviso(`Sin histórico de financiación para ${simbolo}: ${e.message}`);
      return [];
    }
  }

  async comisiones(simbolo) {
    const c = { ...COMISIONES_POR_DEFECTO, fuente: "tarifa pública" };
    try {
      const ms = this.spot.markets[simbolo], mp = this.perp.markets[perpSimbolo(simbolo)];
      if (ms && Number.isFinite(ms.taker)) c.spotTaker = ms.taker;
      if (mp && Number.isFinite(mp.taker)) c.perpTaker = mp.taker;
    } catch {}
    return c;
  }

  /* Cantidad válida en AMBOS mercados. Antes se mandaba la misma cifra a los dos y cada
     uno la truncaba con su propio paso de lote: con la configuración de ejemplo, SOL/USDT
     quedaba con una cuarta parte del importe sin cubrir, direccional. */
  cantidadComun(simbolo, qtyDeseada) {
    const ps = perpSimbolo(simbolo);
    const qs = Number(this.spot.amountToPrecision(simbolo, qtyDeseada));
    const qp = Number(this.perp.amountToPrecision(ps, qtyDeseada));
    if (!Number.isFinite(qs) || !Number.isFinite(qp)) return null;
    // El menor de los dos, redondeado otra vez en ambos: así los dos lo aceptan tal cual.
    let q = Math.min(qs, qp);
    q = Number(this.spot.amountToPrecision(simbolo, q));
    q = Number(this.perp.amountToPrecision(ps, q));
    if (!Number.isFinite(q) || q <= 0) return null;
    // Y tiene que seguir siendo idéntico tras pasar por los dos, o no está alineado.
    const vs = Number(this.spot.amountToPrecision(simbolo, q));
    const vp = Number(this.perp.amountToPrecision(ps, q));
    return (vs === q && vp === q) ? q : null;
  }

  minimos(simbolo) {
    const ms = this.spot.markets[simbolo] || {}, mp = this.perp.markets[perpSimbolo(simbolo)] || {};
    return {
      minQty: Math.max(ms.limits?.amount?.min || 0, mp.limits?.amount?.min || 0),
      minCost: Math.max(ms.limits?.cost?.min || 0, mp.limits?.cost?.min || 0),
    };
  }
}

/* ---------------------------------------------------------------------------
 * Modo papel: precios reales, ejecución simulada. No toca ninguna clave.
 * --------------------------------------------------------------------------- */
class BrokerPapel extends LectorMercado {
  constructor() {
    super(nuevoCliente(ccxt.binance, null), nuevoCliente(ccxt.binanceusdm, null));
    this.modo = "paper";
  }
  async prepararMercado() { return { ok: true, nota: "modo papel: no se toca la cuenta" }; }
  async saldos() { return { spotUSDT: Infinity, perpUSDT: Infinity, simulado: true }; }
  async posicionesReales() { return null; }   // en papel no hay nada que reconciliar

  /* Se llena cruzando la horquilla, como haría una orden a mercado. */
  async abrirPar(simbolo, qty, mercado) {
    const fillSpot = mercado.askSpot;    // compramos pagando el ask
    const fillPerp = mercado.bidPerp;    // vendemos cobrando el bid
    return { ok: true, qtySpot: qty, qtyPerp: qty, fillSpot, fillPerp, simulado: true };
  }
  async cerrarPar(pos, mercado) {
    return { ok: true, fillSpot: mercado.bidSpot, fillPerp: mercado.askPerp, simulado: true };
  }
  /* La financiación se acumula con las tasas REALES publicadas. */
  async fundingDesde(simbolo, desdeMs, qty, precio) {
    try {
      const filas = await this.perp.fetchFundingRateHistory(perpSimbolo(simbolo), desdeMs, 500);
      const nocional = qty * precio;
      const pagos = filas.filter(f => f.timestamp >= desdeMs);
      return { total: pagos.reduce((a, f) => a + f.fundingRate * nocional, 0), cobros: pagos.length, filas: pagos };
    } catch (e) {
      log.aviso(`No se pudo leer la financiación de ${simbolo}: ${e.message}`);
      return { total: 0, cobros: 0, filas: [] };
    }
  }
}

/* ---------------------------------------------------------------------------
 * Modo real: ejecuta. Aquí viven las correcciones de los caminos de fallo.
 * --------------------------------------------------------------------------- */
class BrokerReal extends LectorMercado {
  constructor(claves, apalancamiento) {
    super(nuevoCliente(ccxt.binance, claves.spot), nuevoCliente(ccxt.binanceusdm, claves.perp));
    this.modo = "live";
    this.apalancamiento = apalancamiento;
    this.preparados = new Set();
  }

  /* Sin esto la estrategia NO es delta neutral: Binance abre en cross y 20x por defecto,
     y con 20x el corto se liquida con una subida del 4,7 %. Con 1x aguanta el 100 %. */
  async prepararMercado(simbolo) {
    if (this.preparados.has(simbolo)) return { ok: true };
    const ps = perpSimbolo(simbolo);
    try { await this.perp.setMarginMode("isolated", ps); }
    catch (e) { if (!/no need to change|already/i.test(e.message)) log.aviso(`setMarginMode ${ps}: ${e.message}`); }
    try { await this.perp.setLeverage(this.apalancamiento, ps); }
    catch (e) { return { ok: false, motivo: `no se pudo fijar apalancamiento ${this.apalancamiento}x: ${e.message}` }; }
    this.preparados.add(simbolo);
    return { ok: true };
  }

  async saldos() {
    const [s, p] = await Promise.all([this.spot.fetchBalance(), this.perp.fetchBalance()]);
    return { spotUSDT: s.free?.USDT ?? 0, perpUSDT: p.free?.USDT ?? 0 };
  }

  /* Verdad del exchange, para reconciliar contra ella en vez de fiarnos del JSON. */
  async posicionesReales() {
    try {
      const pos = await this.perp.fetchPositions();
      return pos.filter(p => Math.abs(Number(p.contracts) || 0) > 0)
                .map(p => ({ simbolo: p.symbol, contratos: Number(p.contracts), lado: p.side,
                             precioLiquidacion: Number(p.liquidationPrice) || null }));
    } catch (e) {
      log.aviso("No se pudieron leer las posiciones del exchange:", e.message);
      return null;
    }
  }

  /* ¿Entró de verdad esa orden? Un tiempo de espera agotado NO significa que no entrara.
     Antes se asumía que sí y se "deshacía", dejando un corto desnudo sin registro. */
  async confirmarEjecucion(cliente, simbolo, desdeMs) {
    try {
      const ops = await cliente.fetchMyTrades(simbolo, desdeMs - 5000, 20);
      const recientes = ops.filter(o => o.timestamp >= desdeMs - 5000);
      if (!recientes.length) return { entro: false, qty: 0 };
      return { entro: true, qty: recientes.reduce((a, o) => a + (Number(o.amount) || 0), 0) };
    } catch (e) {
      return { entro: null, error: e.message };   // null = no se pudo saber
    }
  }

  async abrirPar(simbolo, qty, mercado) {
    const ps = perpSimbolo(simbolo);
    const t0 = Date.now();
    let ordenSpot;
    try {
      ordenSpot = await this.spot.createOrder(simbolo, "market", "buy", qty);
    } catch (e) {
      const c = await this.confirmarEjecucion(this.spot, simbolo, t0);
      if (c.entro === true) return { ok: false, patasSueltas: true, motivo: `la compra de contado falló pero SÍ se ejecutó (${c.qty}): revisar a mano` };
      if (c.entro === null) return { ok: false, patasSueltas: true, motivo: `la compra de contado falló y no se pudo confirmar si entró: ${e.message}` };
      return { ok: false, motivo: `no entró la compra de contado: ${e.message}` };
    }

    // La cantidad que manda es la REALMENTE llenada, no la pedida. Con un llenado parcial
    // ignorado quedaba medio nocional direccional y el bot se creía cubierto.
    let llenadoSpot = Number(ordenSpot.filled);
    if (!Number.isFinite(llenadoSpot) || llenadoSpot <= 0) {
      try { const o = await this.spot.fetchOrder(ordenSpot.id, simbolo); llenadoSpot = Number(o.filled); } catch {}
    }
    if (!Number.isFinite(llenadoSpot) || llenadoSpot <= 0) {
      return { ok: false, patasSueltas: true, motivo: "no se pudo determinar cuánto se llenó la compra de contado" };
    }
    const qtyPerp = this.cantidadComun(simbolo, llenadoSpot);
    if (!qtyPerp) {
      await this.deshacerSpot(simbolo, llenadoSpot);
      return { ok: false, motivo: "el llenado de contado no se puede alinear con el paso de lote del perpetuo" };
    }

    const t1 = Date.now();
    let ordenPerp;
    try {
      ordenPerp = await this.perp.createOrder(ps, "market", "sell", qtyPerp);
    } catch (e) {
      const c = await this.confirmarEjecucion(this.perp, ps, t1);
      if (c.entro === true) {
        return { ok: true, qtySpot: llenadoSpot, qtyPerp: c.qty,
                 fillSpot: Number(ordenSpot.average) || mercado.askSpot, fillPerp: mercado.bidPerp,
                 aviso: "la venta de perpetuo dio error pero sí se ejecutó" };
      }
      if (c.entro === null) {
        return { ok: false, patasSueltas: true,
                 motivo: `la venta de perpetuo falló y no se pudo confirmar si entró: ${e.message}. NO se deshace nada para no empeorarlo.` };
      }
      const des = await this.deshacerSpot(simbolo, llenadoSpot);
      return { ok: false, patasSueltas: !des.ok,
               motivo: `no entró la venta de perpetuo (${e.message})` + (des.ok ? ", se deshizo la compra" : `, y TAMPOCO se pudo deshacer la compra: ${des.motivo}`) };
    }

    return {
      ok: true, qtySpot: llenadoSpot, qtyPerp: Number(ordenPerp.filled) || qtyPerp,
      fillSpot: Number(ordenSpot.average) || mercado.askSpot,
      fillPerp: Number(ordenPerp.average) || mercado.bidPerp,
    };
  }

  async deshacerSpot(simbolo, qty) {
    try { await this.spot.createOrder(simbolo, "market", "sell", qty); return { ok: true }; }
    catch (e) { return { ok: false, motivo: e.message }; }
  }

  /* Cerrar es simétrico: si falla la segunda pata queda una suelta, y antes eso no se
     manejaba en absoluto — se reintentaba el cierre entero cada 60 s, vendiendo un contado
     que ya no se tenía. */
  async cerrarPar(pos, mercado) {
    const ps = perpSimbolo(pos.simbolo);
    let vendidoSpot = false;
    try {
      await this.spot.createOrder(pos.simbolo, "market", "sell", pos.qty);
      vendidoSpot = true;
    } catch (e) {
      return { ok: false, motivo: `no se pudo vender el contado: ${e.message}` };
    }
    try {
      await this.perp.createOrder(ps, "market", "buy", pos.qty);
    } catch (e) {
      return { ok: false, patasSueltas: true, patePendiente: "perp",
               motivo: `contado vendido pero el perpetuo sigue abierto: ${e.message}` };
    }
    return { ok: true, fillSpot: mercado.bidSpot, fillPerp: mercado.askPerp, vendidoSpot };
  }

  async fundingDesde(simbolo, desdeMs) {
    try {
      const ps = perpSimbolo(simbolo);
      let todo = [], desde = desdeMs;
      // Paginado: con el límite por defecto de 100, una posición de más de 33 días
      // infravaloraba sus ingresos y nunca alcanzaba el umbral de cierre.
      for (let i = 0; i < 10; i++) {
        const pagina = await this.perp.fetchFundingHistory(ps, desde, 100);
        if (!pagina.length) break;
        todo = todo.concat(pagina);
        if (pagina.length < 100) break;
        desde = pagina[pagina.length - 1].timestamp + 1;
      }
      return { total: todo.reduce((a, p) => a + (Number(p.amount) || 0), 0), cobros: todo.length, filas: todo };
    } catch (e) {
      log.aviso(`No se pudo leer la financiación cobrada de ${simbolo}: ${e.message}`);
      return { total: 0, cobros: 0, filas: [] };
    }
  }

  /* Comprueba que en modo real NINGÚN endpoint apunta a testnet, y viceversa. Recorre
     todos y exige un mínimo: si la estructura de CCXT cambiara y saliera una lista vacía,
     la comprobación pasaría sin haber comprobado nada. */
  verificarDestino(esperadoTestnet) {
    const recoge = (v, acc = []) => {
      if (typeof v === "string") acc.push(v);
      else if (v && typeof v === "object") for (const x of Object.values(v)) recoge(x, acc);
      return acc;
    };
    const todas = [...recoge(this.spot.urls.api), ...recoge(this.perp.urls.api)];
    if (todas.length < 5) throw new Error(`solo se encontraron ${todas.length} endpoints: no se puede verificar el destino`);
    const host = u => { try { return new URL(u).hostname.toLowerCase(); } catch { return ""; } };
    const TEST = new Set(["testnet.binance.vision", "testnet.binancefuture.com"]);
    // Por hostname exacto, no por substring: "api-vision.binance.com" es PRODUCCIÓN y
    // pasaba como testnet con la comprobación anterior.
    const enTestnet = todas.filter(u => TEST.has(host(u)));
    if (esperadoTestnet && enTestnet.length !== todas.length) {
      throw new Error("se esperaba testnet y hay endpoints de producción");
    }
    if (!esperadoTestnet && enTestnet.length) {
      throw new Error("se esperaba producción y hay endpoints de testnet");
    }
    return { total: todas.length, fapi: this.perp.urls.api?.fapiPrivate };
  }
}

export function crearBroker(cfg) {
  if (cfg.modo === "paper") return new BrokerPapel();
  const b = new BrokerReal(cfg.claves, cfg.apalancamiento);
  b.verificarDestino(false);
  return b;
}

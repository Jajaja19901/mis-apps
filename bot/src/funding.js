/* La aritmética de la estrategia.
 *
 * Qué es "funding rate arbitrage": compras el activo al contado y vendes el perpetuo del
 * mismo activo por el mismo importe. Como una pata sube cuando la otra baja, el precio te
 * da igual. Lo que te llevas es la tasa de financiación que los largos del perpetuo pagan
 * a los cortos cada 8 horas.
 *
 * Y lo que casi nadie cuenta: entrar y salir cuesta bastante más de lo que parece. Si el
 * bot no te dice cuántos cobros hacen falta solo para recuperar eso, te está escondiendo
 * lo único que decide si la operación tiene sentido.
 */

/* Comisiones documentadas de Binance, como respaldo. Se prefieren siempre las reales. */
export const COMISIONES_POR_DEFECTO = { spotTaker: 0.001, perpTaker: 0.0005 };

/* Cobros al día: Binance liquida cada 8 horas. */
export const COBROS_POR_DIA = 3;

/* Coste completo de montar la posición y deshacerla, en fracción del nocional.
 *
 * Tiene cuatro sumandos y durante un tiempo aquí solo estaba el primero, lo que hacía que
 * el coste pareciera menos de la mitad del real:
 *   1. Comisiones: cuatro operaciones (comprar contado + vender perp, y luego al revés).
 *   2. Cruce de la horquilla: cada una de esas cuatro patas se ejecuta a mercado, o sea
 *      cruzando media horquilla.
 *   3. Deslizamiento: barrer el libro mueve el precio en contra.
 *   4. Base: el perpetuo cotiza con prima sobre el contado justo cuando la financiación es
 *      positiva, que es precisamente cuando entramos. Se paga al abrir y al cerrar.
 *
 * `spreadSpot` y `spreadPerp` son horquillas en fracción (0.0002 = 0,02 %), medidas del
 * libro real cuando se tienen. `base` es la prima del perpetuo, también en fracción.
 */
export function costeIdaVuelta(comisiones = COMISIONES_POR_DEFECTO, mercado = {}) {
  const c = (comisiones.spotTaker + comisiones.perpTaker) * 2;
  const spreadSpot = Number.isFinite(mercado.spreadSpot) ? mercado.spreadSpot : 0.0002;
  const spreadPerp = Number.isFinite(mercado.spreadPerp) ? mercado.spreadPerp : 0.0002;
  const horquilla = (spreadSpot + spreadPerp);          // media horquilla × 4 patas
  const desliz = (Number.isFinite(mercado.deslizamiento) ? mercado.deslizamiento : 0.0005) * 4;
  const base = Math.abs(Number.isFinite(mercado.base) ? mercado.base : 0.0005) * 2;
  return c + horquilla + desliz + base;
}

/* Desglose, para poder enseñarlo y que nadie tenga que fiarse del número final. */
export function desgloseCoste(comisiones = COMISIONES_POR_DEFECTO, mercado = {}) {
  const spreadSpot = Number.isFinite(mercado.spreadSpot) ? mercado.spreadSpot : 0.0002;
  const spreadPerp = Number.isFinite(mercado.spreadPerp) ? mercado.spreadPerp : 0.0002;
  return {
    comisiones: (comisiones.spotTaker + comisiones.perpTaker) * 2,
    horquilla: spreadSpot + spreadPerp,
    deslizamiento: (Number.isFinite(mercado.deslizamiento) ? mercado.deslizamiento : 0.0005) * 4,
    base: Math.abs(Number.isFinite(mercado.base) ? mercado.base : 0.0005) * 2,
    total: costeIdaVuelta(comisiones, mercado),
  };
}

/* Rendimiento anualizado de una tasa por cobro. Es el número que se enseña en todas
 * partes y el que más engaña: supone que la tasa aguanta un año, cosa que no hace nunca. */
export function apr(tasaPorCobro) {
  return tasaPorCobro * COBROS_POR_DIA * 365;
}

/* Cuántos cobros hacen falta para que lo cobrado iguale lo que costó entrar y salir.
 * Infinity si la tasa no es positiva: no se cubre nunca. */
export function periodosHastaCubrirCoste(tasaMedia, comisiones = COMISIONES_POR_DEFECTO, mercado = {}) {
  if (!(tasaMedia > 0)) return Infinity;
  return costeIdaVuelta(comisiones, mercado) / tasaMedia;
}

export function tasaMedia(historico) {
  const v = historico.filter(Number.isFinite);
  if (!v.length) return 0;
  return v.reduce((a, b) => a + b, 0) / v.length;
}

/* Qué proporción de los cobros recientes fue positiva. Una media de 0,01 % hecha de
 * +0,05 % y −0,03 % alternos no es lo mismo que un 0,01 % estable, aunque coincida. */
export function consistencia(historico) {
  const v = historico.filter(Number.isFinite);
  if (!v.length) return 0;
  return v.filter(x => x > 0).length / v.length;
}

/* Evalúa un símbolo. Devuelve el porqué siempre: un bot que dice "no" sin explicarse es
 * un bot en el que no se puede confiar. */
export function evaluar(simbolo, historico, cfg, comisiones = COMISIONES_POR_DEFECTO, mercado = {}) {
  const media = tasaMedia(historico);
  const cons = consistencia(historico);
  const periodos = periodosHastaCubrirCoste(media, comisiones, mercado);
  const coste = costeIdaVuelta(comisiones, mercado);
  const mediaPct = media * 100;
  const minMuestras = Math.max(3, Math.floor((cfg.ventanaHistorico || 24) * 0.75));

  const motivos = [];
  // Antes bastaba UNA lectura para entrar, lo que contradecía de plano lo que promete el
  // README. Ahora se exige tener casi toda la ventana pedida.
  if (historico.length < minMuestras) {
    motivos.push(`solo ${historico.length} lecturas de financiación y hacen falta ${minMuestras}`);
  }
  if (mediaPct < cfg.minFundingMedioPct) {
    motivos.push(`financiación media ${mediaPct.toFixed(4)} % < mínimo ${cfg.minFundingMedioPct} %`);
  }
  if (periodos > cfg.maxPeriodosHastaCubrirCoste) {
    motivos.push(periodos === Infinity
      ? "financiación media negativa o nula: el coste no se cubre nunca"
      : `harían falta ${periodos.toFixed(0)} cobros (${(periodos / COBROS_POR_DIA).toFixed(1)} días) para cubrir el coste, y el tope son ${cfg.maxPeriodosHastaCubrirCoste}`);
  }
  if (cons < 0.6) {
    motivos.push(`solo ${(cons * 100).toFixed(0)} % de los cobros recientes fueron positivos`);
  }

  return {
    simbolo, muestras: historico.length, tasaMedia: media, tasaMediaPct: mediaPct,
    consistencia: cons, aprPct: apr(media) * 100,
    costeIdaVueltaPct: coste * 100, desglose: desgloseCoste(comisiones, mercado),
    periodosHastaCubrirCoste: periodos, diasHastaCubrirCoste: periodos / COBROS_POR_DIA,
    apto: motivos.length === 0, motivos,
  };
}

export function ordenarCandidatos(evaluaciones) {
  return evaluaciones.filter(e => e.apto)
    .sort((a, b) => a.periodosHastaCubrirCoste - b.periodosHastaCubrirCoste);
}

/* Resultado de una posición abierta.
 *
 * El coste de cierre se calcula con el precio ACTUAL, no con el de entrada. Con el de
 * entrada, una posición cuyo activo hubiera subido un 30 % se cerraba en pérdida real
 * creyendo que ganaba, porque el cierre cuesta más de lo presupuestado. */
export function resultadoPosicion(pos, comisiones = COMISIONES_POR_DEFECTO, precioActual = null) {
  const cobrado = Number.isFinite(pos.fundingCobrado) ? pos.fundingCobrado : 0;
  const nocionalBase = Number.isFinite(pos.nocional) ? pos.nocional : 0;
  const qty = Number.isFinite(pos.qty) ? pos.qty : 0;
  const px = Number.isFinite(precioActual) && precioActual > 0
    ? precioActual
    : (Number.isFinite(pos.precioEntrada) ? pos.precioEntrada : 0);
  // Si falta la cantidad o el precio —por ejemplo en una posición guardada por una versión
  // anterior— se cae al nocional de apertura en vez de producir un NaN, que aguas abajo
  // desactivaría las comparaciones que deciden si se cierra.
  const nocionalActual = (qty > 0 && px > 0) ? qty * px : nocionalBase;
  const tarifa = comisiones.spotTaker + comisiones.perpTaker;
  const costeApertura = Number.isFinite(pos.costeAperturaReal) && pos.costeAperturaReal > 0
    ? pos.costeAperturaReal
    : nocionalBase * tarifa;
  const costeCierre = nocionalActual * tarifa;
  return {
    cobrado, costeApertura, costeCierreEstimado: costeCierre,
    netoSiCierraAhora: cobrado - costeApertura - costeCierre,
    cobrosRecibidos: pos.cobrosRecibidos || 0,
  };
}

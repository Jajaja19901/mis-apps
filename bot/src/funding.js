/* La aritmética de la estrategia. Es la parte que decide si esto es un negocio o un
 * pasatiempo caro, así que va aparte y sin nada más mezclado.
 *
 * Qué es "funding rate arbitrage", en una frase: compras el activo al contado y vendes
 * el perpetuo del mismo activo por el mismo importe. Como una pata sube cuando la otra
 * baja, el precio te da igual — quedas neutral. Lo que te llevas es la tasa de
 * financiación que los largos del perpetuo pagan a los cortos cada 8 horas.
 *
 * Y aquí está lo que casi nadie cuenta: entrar y salir cuesta ~0,30% en comisiones. Con
 * una financiación típica de 0,01% por cobro, tardas TREINTA cobros —diez días— solo en
 * recuperar el coste de haber abierto. Si el bot no te dice eso antes de entrar, te está
 * escondiendo lo único que importa.
 */

/* Comisiones documentadas de Binance. Se usan como respaldo si el exchange no las
 * declara; se prefieren siempre las que devuelva la API para la cuenta concreta. */
export const COMISIONES_POR_DEFECTO = {
  spotTaker: 0.001,   // 0,10 %
  perpTaker: 0.0005,  // 0,05 %
};

/* Cobros al día: Binance liquida cada 8 horas. */
export const COBROS_POR_DIA = 3;

/* Coste de montar la posición y deshacerla: cuatro operaciones en total (comprar contado,
 * vender perpetuo; luego vender contado, comprar perpetuo). En fracción, no en %. */
export function costeIdaVuelta(comisiones = COMISIONES_POR_DEFECTO) {
  return (comisiones.spotTaker + comisiones.perpTaker) * 2;
}

/* Rendimiento anualizado de una tasa por cobro. Es la cifra que se enseña en todas
 * partes, y la que más engaña: supone que la tasa se mantiene un año entero, cosa que
 * no hace nunca. Se muestra por comparabilidad, no como promesa. */
export function apr(tasaPorCobro) {
  return tasaPorCobro * COBROS_POR_DIA * 365;
}

/* Cuántos cobros hacen falta para que lo cobrado iguale lo que costó entrar y salir.
 * Devuelve Infinity si la tasa no es positiva: no se cubre nunca. */
export function periodosHastaCubrirCoste(tasaMedia, comisiones = COMISIONES_POR_DEFECTO) {
  if (!(tasaMedia > 0)) return Infinity;
  return costeIdaVuelta(comisiones) / tasaMedia;
}

/* Media de las tasas pasadas. Actuar sobre la última lectura es actuar sobre ruido: la
 * financiación oscila y cambia de signo. Lo que predice algo es la tendencia. */
export function tasaMedia(historico) {
  const v = historico.filter(x => Number.isFinite(x));
  if (!v.length) return 0;
  return v.reduce((a, b) => a + b, 0) / v.length;
}

/* Qué proporción de los cobros recientes fue positiva. Una media de 0,01% compuesta de
 * mitad +0,05% y mitad -0,03% no es lo mismo que una media estable de 0,01%, aunque el
 * número salga igual. */
export function consistencia(historico) {
  const v = historico.filter(x => Number.isFinite(x));
  if (!v.length) return 0;
  return v.filter(x => x > 0).length / v.length;
}

/* Evalúa un símbolo y decide si merece la pena. Devuelve el porqué, siempre: un bot que
 * dice "no" sin explicar por qué es un bot en el que no se puede confiar. */
export function evaluar(simbolo, historico, cfg, comisiones = COMISIONES_POR_DEFECTO) {
  const media = tasaMedia(historico);
  const cons = consistencia(historico);
  const periodos = periodosHastaCubrirCoste(media, comisiones);
  const coste = costeIdaVuelta(comisiones);
  const mediaPct = media * 100;

  const motivos = [];
  if (!historico.length) motivos.push("sin histórico de financiación");
  if (mediaPct < cfg.minFundingMedioPct) {
    motivos.push(`financiación media ${mediaPct.toFixed(4)} % < mínimo ${cfg.minFundingMedioPct} %`);
  }
  if (periodos > cfg.maxPeriodosHastaCubrirCoste) {
    motivos.push(
      periodos === Infinity
        ? "financiación media negativa o nula: el coste no se cubre nunca"
        : `harían falta ${periodos.toFixed(0)} cobros (${(periodos / COBROS_POR_DIA).toFixed(1)} días) para cubrir el coste, y el tope son ${cfg.maxPeriodosHastaCubrirCoste}`
    );
  }
  if (cons < 0.6) {
    motivos.push(`solo ${(cons * 100).toFixed(0)} % de los cobros recientes fueron positivos`);
  }

  return {
    simbolo,
    muestras: historico.length,
    tasaMedia: media,
    tasaMediaPct: mediaPct,
    consistencia: cons,
    aprPct: apr(media) * 100,
    costeIdaVueltaPct: coste * 100,
    periodosHastaCubrirCoste: periodos,
    diasHastaCubrirCoste: periodos / COBROS_POR_DIA,
    apto: motivos.length === 0,
    motivos,
  };
}

/* Ordena candidatos: primero los que cubren antes su coste. No por APR, que es el número
 * bonito pero no es el que decide. */
export function ordenarCandidatos(evaluaciones) {
  return evaluaciones
    .filter(e => e.apto)
    .sort((a, b) => a.periodosHastaCubrirCoste - b.periodosHastaCubrirCoste);
}

/* Resultado acumulado de una posición abierta: lo cobrado menos lo que costó abrirla.
 * Mientras esto sea negativo, cerrar es perder. */
export function resultadoPosicion(pos, comisiones = COMISIONES_POR_DEFECTO) {
  const cobrado = pos.fundingCobrado || 0;
  const costeApertura = pos.nocional * (comisiones.spotTaker + comisiones.perpTaker);
  const costeCierre = pos.nocional * (comisiones.spotTaker + comisiones.perpTaker);
  return {
    cobrado,
    costeApertura,
    costeCierreEstimado: costeCierre,
    netoSiCierraAhora: cobrado - costeApertura - costeCierre,
    cobrosRecibidos: pos.cobrosRecibidos || 0,
  };
}

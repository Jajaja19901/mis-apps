// ============================================================================
//  REPARTO MENSUAL — "data dividend" 30% a los usuarios (cron del día 1)
//  --------------------------------------------------------------------------
//  Aquí se mueve DINERO REAL: CERO céntimos perdidos o inventados.
//
//  Dos piezas, separadas a propósito:
//    1) repartirPool(poolTotalCentimos, contribuciones)  -> función PURA.
//       Aplica el ALGORITMO DEL MAYOR RESTO (largest remainder) para que la
//       suma de lo asignado sea EXACTAMENTE el pool. Sin red, sin BD, sin floats
//       acumulados: el sobrante se calcula como diferencia de ENTEROS.
//    2) ejecutarRepartoMensual(periodo, deps)  -> ORQUESTADOR.
//       Lee el pool y las contribuciones de D1, llama a la función pura, escribe
//       en `repartos` (idempotente por UNIQUE(periodo, usuario_id)), lanza los
//       transfers de Stripe con reintentos/backoff y audita en `logs_auditoria`.
//
//  Todas las dependencias externas (BD D1, Stripe, reloj, espera) se INYECTAN
//  por `deps`, para poder probar el dinero SIN tocar la red (ver el .test.mjs).
//
//  Reglas de negocio (de plataforma-datos/docs/pagos-stripe.md):
//    - Pool del periodo = Σ pool_usuarios_centimos de transacciones 'pagada' del mes.
//    - Peso de cada usuario = sus contribuciones válidas / total de contribuciones.
//    - Umbral mínimo de transfer: 500 céntimos (5 €). Por debajo NO se transfiere;
//      el reparto se registra igualmente (queda 'pendiente') y se acumula al
//      mes siguiente vía saldo previo.
//    - Solo se paga a usuarios con payout_estado='verificado' y stripe_account_id.
//    - Idempotencia: si ya hay fila en `repartos` para (periodo, usuario_id) NO se
//      recalcula ni se vuelve a pagar (UNIQUE lo blinda también a nivel de BD).
//    - Idempotency-Key de Stripe = reparto.id (un reintento no duplica el transfer).
// ============================================================================

/** Umbral mínimo para emitir un transfer (5,00 €). Por debajo se acumula. */
export const UMBRAL_MINIMO_TRANSFER_CENTIMOS = 500;

/** Política de reintentos del transfer (backoff). Sobrescribible por deps en tests. */
export const BACKOFF_MS_POR_DEFECTO = [3600_000, 14_400_000, 86_400_000]; // 1 h, 4 h, 24 h

// ----------------------------------------------------------------------------
//  1) FUNCIÓN PURA DE CÁLCULO — ALGORITMO DEL MAYOR RESTO
// ----------------------------------------------------------------------------

/**
 * Reparte `poolTotalCentimos` (entero, céntimos) entre usuarios según su peso de
 * contribución, de forma que la SUMA de lo asignado sea EXACTAMENTE el pool.
 *
 * Algoritmo del mayor resto (largest remainder / Hare):
 *   1. A cada usuario le toca floor(pool * peso) céntimos (parte entera).
 *   2. El sobrante = pool - Σ partes_enteras  (siempre 0 <= sobrante < nº usuarios).
 *   3. Se reparte el sobrante de a un céntimo entre los usuarios con MAYOR resto
 *      fraccionario (desempate determinista por usuario_id para reproducibilidad).
 *
 * No se usa el peso como float para sumar: el sobrante sale de restar enteros, así
 * que no hay deriva de coma flotante. La invariante Σ = pool se verifica al final.
 *
 * @param {number} poolTotalCentimos  Céntimos a repartir (entero >= 0).
 * @param {Array<{usuario_id:string, contribuciones:number}>} contribuciones
 *        Lista de usuarios participantes y su nº de contribuciones (peso bruto).
 *        Los usuarios con contribuciones <= 0 se descartan (no entran al reparto).
 * @returns {{
 *   periodoVacio:boolean,
 *   pool:number,
 *   totalContribuciones:number,
 *   asignaciones:Array<{usuario_id:string, importe_centimos:number, peso:number}>
 * }}
 */
export function repartirPool(poolTotalCentimos, contribuciones) {
  const pool = Number(poolTotalCentimos);
  if (!Number.isInteger(pool) || pool < 0) {
    throw new Error(`pool inválido: ${poolTotalCentimos} (debe ser entero de céntimos >= 0)`);
  }

  // Solo participan usuarios con contribución estrictamente positiva.
  const participantes = (contribuciones || [])
    .map((c) => ({ usuario_id: String(c.usuario_id), contribuciones: Number(c.contribuciones) || 0 }))
    .filter((c) => c.contribuciones > 0);

  const totalContribuciones = participantes.reduce((acc, c) => acc + c.contribuciones, 0);

  // Sin pool o sin contribuciones -> no se reparte nada (no se inventan céntimos).
  if (pool === 0 || totalContribuciones === 0 || participantes.length === 0) {
    return { periodoVacio: true, pool, totalContribuciones, asignaciones: [] };
  }

  // Paso 1: parte entera (floor) y resto fraccionario por usuario.
  let asignadoBase = 0;
  const filas = participantes.map((c) => {
    const peso = c.contribuciones / totalContribuciones; // 0..1
    const exacto = pool * c.contribuciones / totalContribuciones; // céntimos exactos (float)
    const base = Math.floor(exacto);
    asignadoBase += base;
    return {
      usuario_id: c.usuario_id,
      contribuciones: c.contribuciones,
      peso,
      base,
      resto: exacto - base, // fracción 0..1
    };
  });

  // Paso 2: sobrante por truncar (diferencia de ENTEROS -> sin error de float).
  let sobrante = pool - asignadoBase; // 0 <= sobrante < nº participantes
  if (sobrante < 0) {
    // Imposible matemáticamente con floor; si pasara, abortamos antes de pagar de más.
    throw new Error(`DESCUADRE: sobrante negativo (${sobrante}); se aborta el reparto`);
  }

  // Paso 3: el sobrante va de a 1 céntimo a los de MAYOR resto.
  //   Desempate determinista: a igual resto, primero el usuario_id menor (orden
  //   estable y reproducible entre ejecuciones; clave para la idempotencia).
  const porResto = [...filas].sort((a, b) => {
    if (b.resto !== a.resto) return b.resto - a.resto;
    return a.usuario_id < b.usuario_id ? -1 : a.usuario_id > b.usuario_id ? 1 : 0;
  });
  for (let i = 0; i < sobrante; i++) porResto[i].base += 1;

  const asignaciones = filas.map((f) => ({
    usuario_id: f.usuario_id,
    importe_centimos: f.base,
    peso: f.peso,
  }));

  // Verificación OBLIGATORIA (última línea de defensa antes de tocar dinero).
  const suma = asignaciones.reduce((acc, a) => acc + a.importe_centimos, 0);
  if (suma !== pool) {
    throw new Error(`DESCUADRE: la suma del reparto (${suma}) != pool (${pool}); se aborta`);
  }

  return { periodoVacio: false, pool, totalContribuciones, asignaciones };
}

// ----------------------------------------------------------------------------
//  Utilidades internas del orquestador
// ----------------------------------------------------------------------------

/** Espera ms milisegundos. Inyectable por deps.dormir para tests sin tiempo real. */
function dormirPorDefecto(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** UUID v4 (crypto del runtime: Workers y Node 22 lo traen). */
function uuid(deps) {
  if (deps && typeof deps.uuid === 'function') return deps.uuid();
  return globalThis.crypto.randomUUID();
}

/**
 * Crea un transfer de Stripe con reintentos y backoff exponencial.
 * Usa idempotencyKey = reparto.id, así un reintento NUNCA duplica el pago.
 *
 * @returns {{ok:boolean, transfer?:object, error?:Error, intentos:number}}
 */
async function crearTransferConReintentos(stripe, args, { backoff, dormir, maxIntentos }) {
  let ultimoError;
  const intentosTotales = maxIntentos ?? backoff.length + 1;
  for (let intento = 0; intento < intentosTotales; intento++) {
    if (intento > 0) {
      // Espera antes de reintentar (1 h, 4 h, 24 h por defecto).
      const espera = backoff[Math.min(intento - 1, backoff.length - 1)];
      await dormir(espera);
    }
    try {
      const transfer = await stripe.transfers.create(
        {
          amount: args.amount,
          currency: 'eur',
          destination: args.destination,
          transfer_group: args.transfer_group,
          metadata: args.metadata,
        },
        { idempotencyKey: args.idempotencyKey } // reparto.id -> no duplica
      );
      return { ok: true, transfer, intentos: intento + 1 };
    } catch (err) {
      ultimoError = err;
      // Los errores de validación de Stripe (4xx que no sean rate-limit) no se
      // resuelven reintentando; se corta para no malgastar el backoff.
      if (err && err.stripeNoReintentable) break;
    }
  }
  return { ok: false, error: ultimoError, intentos: intentosTotales };
}

// ----------------------------------------------------------------------------
//  2) ORQUESTADOR — lee D1, calcula, escribe `repartos`, lanza transfers
// ----------------------------------------------------------------------------

/**
 * Ejecuta el reparto mensual de un periodo 'YYYY-MM'.
 *
 * Idempotencia total:
 *   - Antes de calcular nada, se leen los `repartos` que YA existen para el periodo;
 *     esos usuarios se saltan (no se recalculan ni se vuelven a pagar).
 *   - El INSERT en `repartos` usa INSERT OR IGNORE: si dos ejecuciones compiten,
 *     el UNIQUE(periodo, usuario_id) garantiza una sola fila.
 *   - El transfer usa idempotencyKey = reparto.id.
 *
 * @param {string} periodo  'YYYY-MM' (mes a repartir).
 * @param {Object} deps  Dependencias inyectadas (todo lo externo, para test sin red):
 *   @param {Object} deps.db      Cliente D1 (env.PLATAFORMA_DB) con .prepare().bind().all()/.run()/.first().
 *   @param {Object} deps.stripe  Cliente Stripe con stripe.transfers.create(params, {idempotencyKey}).
 *   @param {Object} [deps.opciones]
 *     @param {boolean} [deps.opciones.dryRun=false]  Calcula y registra repartos, pero NO crea transfers.
 *     @param {number}  [deps.opciones.umbral=500]    Umbral mínimo de transfer (céntimos).
 *     @param {number[]}[deps.opciones.backoff]       Backoff (ms) de reintentos de transfer.
 *     @param {number}  [deps.opciones.maxIntentos]   Máximo de intentos por transfer.
 *   @param {Function} [deps.dormir]  (ms)=>Promise, para no esperar de verdad en tests.
 *   @param {Function} [deps.uuid]    ()=>string, generador de id determinista en tests.
 *   @param {Function} [deps.ahora]   ()=>ISO string, reloj inyectable.
 * @returns {Promise<{
 *   periodo:string, pool_total_centimos:number, total_contribuciones:number,
 *   usuarios_con_reparto:number, creados:number, ya_existentes:number,
 *   pagados:number, pendientes_umbral:number, fallidos:number, dry_run:boolean,
 *   detalle:Array<object>
 * }>}
 */
export async function ejecutarRepartoMensual(periodo, deps) {
  if (!/^\d{4}-\d{2}$/.test(String(periodo || ''))) {
    throw new Error(`periodo inválido: ${periodo} (se espera 'YYYY-MM')`);
  }
  const { db, stripe } = deps;
  if (!db) throw new Error('falta deps.db (cliente D1)');
  const opciones = deps.opciones || {};
  const dryRun = !!opciones.dryRun;
  const umbral = Number.isInteger(opciones.umbral) ? opciones.umbral : UMBRAL_MINIMO_TRANSFER_CENTIMOS;
  const backoff = opciones.backoff || BACKOFF_MS_POR_DEFECTO;
  const dormir = deps.dormir || dormirPorDefecto;
  const ahora = deps.ahora || (() => new Date().toISOString());

  if (!dryRun && !stripe) throw new Error('falta deps.stripe (cliente Stripe) salvo en dry_run');

  // -- A) Pool del periodo: Σ pool_usuarios_centimos de transacciones 'pagada'. --
  const filaPool = await db
    .prepare(
      `SELECT COALESCE(SUM(pool_usuarios_centimos), 0) AS pool_total
         FROM transacciones
        WHERE estado = 'pagada'
          AND strftime('%Y-%m', creado_en) = ?1`
    )
    .bind(periodo)
    .first();
  const poolTotal = Number(filaPool?.pool_total || 0);

  // -- B) Contribuciones válidas del periodo (consentimiento activo), por usuario. --
  //    Solo usuarios pagables: payout_estado='verificado' y con cuenta Stripe.
  const filasContrib = await db
    .prepare(
      `SELECT c.usuario_id AS usuario_id, COUNT(*) AS n
         FROM contribuciones c
         JOIN consentimientos co ON co.id = c.consentimiento_id
         JOIN usuarios u         ON u.id  = c.usuario_id
        WHERE co.revocado_en IS NULL
          AND u.payout_estado = 'verificado'
          AND u.stripe_account_id IS NOT NULL
          AND strftime('%Y-%m', c.recogido_en) = ?1
        GROUP BY c.usuario_id`
    )
    .bind(periodo)
    .all();
  const contribuciones = (filasContrib?.results || []).map((r) => ({
    usuario_id: r.usuario_id,
    contribuciones: Number(r.n) || 0,
  }));

  // -- C) Cálculo PURO con mayor resto (suma exacta = pool). --
  const calculo = repartirPool(poolTotal, contribuciones);

  // -- D) Idempotencia: ¿qué usuarios ya tienen reparto en este periodo? --
  const filasExistentes = await db
    .prepare(`SELECT usuario_id, estado FROM repartos WHERE periodo = ?1`)
    .bind(periodo)
    .all();
  const yaExisten = new Map((filasExistentes?.results || []).map((r) => [r.usuario_id, r.estado]));

  const resultado = {
    periodo,
    pool_total_centimos: poolTotal,
    total_contribuciones: calculo.totalContribuciones,
    usuarios_con_reparto: calculo.asignaciones.length,
    creados: 0,
    ya_existentes: 0,
    pagados: 0,
    pendientes_umbral: 0,
    fallidos: 0,
    dry_run: dryRun,
    detalle: [],
  };

  // -- E) Por cada asignación: registrar en `repartos` y (si procede) transferir. --
  for (const asig of calculo.asignaciones) {
    if (yaExisten.has(asig.usuario_id)) {
      resultado.ya_existentes += 1;
      resultado.detalle.push({
        usuario_id: asig.usuario_id,
        importe_centimos: asig.importe_centimos,
        estado: yaExisten.get(asig.usuario_id),
        ya_existente: true,
      });
      continue;
    }

    const repartoId = uuid(deps);

    // En dry_run NO se escribe ni se paga: solo se devuelve el cálculo.
    if (dryRun) {
      resultado.creados += 1;
      resultado.detalle.push({
        reparto_id: repartoId,
        usuario_id: asig.usuario_id,
        importe_centimos: asig.importe_centimos,
        peso_contribucion: asig.peso,
        estado: 'simulado',
        dry_run: true,
      });
      continue;
    }

    // Insertar SIEMPRE como 'pendiente'. INSERT OR IGNORE -> si otra ejecución se
    // adelantó (carrera), el UNIQUE evita la fila duplicada y .changes será 0.
    const ins = await db
      .prepare(
        `INSERT OR IGNORE INTO repartos
           (id, periodo, usuario_id, importe_centimos, peso_contribucion, estado, creado_en)
         VALUES (?1, ?2, ?3, ?4, ?5, 'pendiente', ?6)`
      )
      .bind(repartoId, periodo, asig.usuario_id, asig.importe_centimos, asig.peso, ahora())
      .run();

    const inserto = (ins?.meta?.changes ?? ins?.changes ?? 0) > 0;
    if (!inserto) {
      // Otra ejecución concurrente ganó la carrera: lo tratamos como ya existente.
      resultado.ya_existentes += 1;
      resultado.detalle.push({
        usuario_id: asig.usuario_id,
        importe_centimos: asig.importe_centimos,
        estado: 'pendiente',
        ya_existente: true,
        nota: 'carrera resuelta por UNIQUE',
      });
      continue;
    }

    resultado.creados += 1;
    await auditar(db, ahora, {
      accion: 'reparto.creado',
      entidad_id: repartoId,
      detalles: { periodo, usuario_id: asig.usuario_id, importe_centimos: asig.importe_centimos },
    });

    // Umbral mínimo: por debajo de 5 € NO se transfiere; queda 'pendiente' y se
    // acumulará al mes siguiente (el saldo se arrastra a nivel de negocio).
    if (asig.importe_centimos < umbral) {
      resultado.pendientes_umbral += 1;
      resultado.detalle.push({
        reparto_id: repartoId,
        usuario_id: asig.usuario_id,
        importe_centimos: asig.importe_centimos,
        estado: 'pendiente',
        motivo: `por debajo del umbral de ${umbral} céntimos`,
      });
      await auditar(db, ahora, {
        accion: 'reparto.bajo_umbral',
        entidad_id: repartoId,
        detalles: { periodo, importe_centimos: asig.importe_centimos, umbral },
      });
      continue;
    }

    // Crear el transfer con reintentos/backoff. idempotencyKey = repartoId.
    const cuenta = await db
      .prepare(`SELECT stripe_account_id FROM usuarios WHERE id = ?1`)
      .bind(asig.usuario_id)
      .first();
    const destino = cuenta?.stripe_account_id;
    if (!destino) {
      // No debería pasar (el SELECT C ya filtra), pero por seguridad no pagamos a ciegas.
      resultado.fallidos += 1;
      await marcarFallido(db, ahora, repartoId, 'sin stripe_account_id en el momento del transfer');
      resultado.detalle.push({ reparto_id: repartoId, usuario_id: asig.usuario_id, estado: 'fallido', motivo: 'sin cuenta Stripe' });
      continue;
    }

    const res = await crearTransferConReintentos(
      stripe,
      {
        amount: asig.importe_centimos,
        destination: destino,
        transfer_group: `REPARTO_${periodo}`,
        metadata: { periodo, usuario_id: asig.usuario_id, reparto_id: repartoId },
        idempotencyKey: repartoId,
      },
      { backoff, dormir, maxIntentos: opciones.maxIntentos }
    );

    if (res.ok) {
      await db
        .prepare(`UPDATE repartos SET estado = 'pagado', stripe_transfer_id = ?2 WHERE id = ?1`)
        .bind(repartoId, res.transfer.id)
        .run();
      resultado.pagados += 1;
      resultado.detalle.push({
        reparto_id: repartoId,
        usuario_id: asig.usuario_id,
        importe_centimos: asig.importe_centimos,
        estado: 'pagado',
        stripe_transfer_id: res.transfer.id,
      });
      await auditar(db, ahora, {
        accion: 'reparto.pagado',
        entidad_id: repartoId,
        detalles: { periodo, importe_centimos: asig.importe_centimos, stripe_transfer_id: res.transfer.id, intentos: res.intentos },
      });
    } else {
      await marcarFallido(db, ahora, repartoId, res.error ? String(res.error.message || res.error) : 'transfer fallido');
      resultado.fallidos += 1;
      resultado.detalle.push({
        reparto_id: repartoId,
        usuario_id: asig.usuario_id,
        importe_centimos: asig.importe_centimos,
        estado: 'fallido',
        motivo: res.error ? String(res.error.message || res.error) : 'transfer fallido',
        intentos: res.intentos,
      });
    }
  }

  resultado.ya_existentes = resultado.ya_existentes; // (claridad)

  await auditar(db, ahora, {
    accion: dryRun ? 'reparto.simulado' : 'reparto.ejecutado',
    entidad_id: periodo,
    detalles: {
      periodo,
      pool_total_centimos: poolTotal,
      creados: resultado.creados,
      ya_existentes: resultado.ya_existentes,
      pagados: resultado.pagados,
      pendientes_umbral: resultado.pendientes_umbral,
      fallidos: resultado.fallidos,
    },
  });

  return resultado;
}

/** Marca un reparto como fallido (reintento manual posterior por admin). */
async function marcarFallido(db, ahora, repartoId, motivo) {
  await db.prepare(`UPDATE repartos SET estado = 'fallido' WHERE id = ?1`).bind(repartoId).run();
  await auditar(db, ahora, { accion: 'reparto.fallido', entidad_id: repartoId, detalles: { motivo } });
}

/** Inserta una línea append-only en logs_auditoria. Nunca lleva PII. */
async function auditar(db, ahora, { accion, entidad_id, detalles }) {
  try {
    await db
      .prepare(
        `INSERT INTO logs_auditoria (actor, accion, entidad, entidad_id, detalles, creado_en)
         VALUES ('sistema', ?1, 'repartos', ?2, ?3, ?4)`
      )
      .bind(accion, entidad_id, JSON.stringify(detalles || {}), ahora())
      .run();
  } catch (_) {
    // La auditoría no debe tumbar el reparto; si falla el log, se sigue (el pago manda).
  }
}

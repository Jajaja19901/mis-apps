// ============================================================================
//  WORKER DE PAGOS (w-pagos) — Cloudflare Worker
//  --------------------------------------------------------------------------
//  Cobro a las AGENCIAS por un reporte y disparo del REPARTO mensual 30/70.
//  Aquí se mueve DINERO REAL: validaciones estrictas, idempotencia y CHECK exacto.
//
//  Endpoints (ver plataforma-datos/docs/api-contrato.md, secciones F y G):
//    POST /v1/pagos/cobrar     Crea un PaymentIntent para cobrar a la agencia por
//                              un reporte. Inserta `transacciones` (estado pendiente)
//                              con el reparto 70/30 que CUADRA al céntimo (CHECK).
//    POST /webhooks/stripe     Verifica la firma de Stripe y mueve el estado de las
//                              transacciones: pendiente -> pagada / fallida / reembolsada.
//    (scheduled)               El cron mensual delega en src/reparto-mensual.mjs.
//
//  No usa el SDK de Node de Stripe (no encaja limpio en Workers): habla con la API
//  REST de Stripe por `fetch` con cuerpos x-www-form-urlencoded, controlando la
//  Idempotency-Key a mano. La firma del webhook se verifica con WebCrypto (HMAC).
//
//  Bindings esperados (wrangler.toml):
//    env.PLATAFORMA_DB        D1 (tablas = db/schema.sql)
//    env.RATE_LIMIT           KV (idempotencia de webhooks por event.id)
//  Secretos:
//    env.STRIPE_SECRET_KEY    sk_live_... / sk_test_...
//    env.STRIPE_WEBHOOK_SECRET whsec_...
// ============================================================================

import { ejecutarRepartoMensual } from './reparto-mensual.mjs';

const STRIPE_API = 'https://api.stripe.com/v1';

// Tolerancia de antigüedad de la firma del webhook (anti-replay). 5 minutos.
const TOLERANCIA_FIRMA_SEG = 300;

// TTL del registro de idempotencia de webhooks en KV (event.id ya procesado).
const TTL_IDEMPOTENCIA_WEBHOOK_SEG = 60 * 60 * 24 * 3; // 3 días (Stripe reintenta hasta ~3 días)

// ----------------------------------------------------------------------------
//  Cliente Stripe mínimo sobre fetch (compatible con Workers)
// ----------------------------------------------------------------------------

/** Serializa un objeto plano/anidado al formato form-encoded de Stripe (a[b]=c). */
function formEncode(obj, prefijo = '', acc = []) {
  for (const [clave, valor] of Object.entries(obj)) {
    if (valor === undefined || valor === null) continue;
    const k = prefijo ? `${prefijo}[${clave}]` : clave;
    if (typeof valor === 'object' && !Array.isArray(valor)) {
      formEncode(valor, k, acc);
    } else if (Array.isArray(valor)) {
      valor.forEach((v, i) => {
        if (typeof v === 'object') formEncode(v, `${k}[${i}]`, acc);
        else acc.push(`${encodeURIComponent(`${k}[${i}]`)}=${encodeURIComponent(String(v))}`);
      });
    } else {
      acc.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(valor))}`);
    }
  }
  return acc.join('&');
}

/** Error de Stripe con bandera de "no reintentable" para el backoff del reparto. */
class StripeError extends Error {
  constructor(mensaje, { tipo, codigo, status } = {}) {
    super(mensaje);
    this.name = 'StripeError';
    this.tipo = tipo;
    this.codigo = codigo;
    this.status = status;
    // 4xx (salvo rate-limit 429) = problema de datos: no se arregla reintentando.
    this.stripeNoReintentable = status >= 400 && status < 500 && status !== 429;
  }
}

/**
 * Crea un cliente Stripe REST sobre fetch. Cada método admite { idempotencyKey }.
 * Devuelve la misma forma de objeto que el SDK (id, status, ...).
 */
export function crearClienteStripe(secretKey, fetchImpl = fetch) {
  if (!secretKey) throw new Error('Falta STRIPE_SECRET_KEY');

  async function llamar(metodo, ruta, params, { idempotencyKey } = {}) {
    const headers = {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Stripe-Version': '2024-06-20',
    };
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

    const resp = await fetchImpl(`${STRIPE_API}${ruta}`, {
      method: metodo,
      headers,
      body: params ? formEncode(params) : undefined,
    });

    let cuerpo;
    try { cuerpo = await resp.json(); } catch { cuerpo = {}; }

    if (!resp.ok) {
      const e = cuerpo && cuerpo.error ? cuerpo.error : {};
      throw new StripeError(e.message || `Error Stripe ${resp.status}`, {
        tipo: e.type, codigo: e.code, status: resp.status,
      });
    }
    return cuerpo;
  }

  return {
    paymentIntents: {
      create: (params, opts) => llamar('POST', '/payment_intents', params, opts),
    },
    transfers: {
      create: (params, opts) => llamar('POST', '/transfers', params, opts),
    },
    refunds: {
      create: (params, opts) => llamar('POST', '/refunds', params, opts),
    },
  };
}

// ----------------------------------------------------------------------------
//  Verificación de la firma del webhook de Stripe (WebCrypto, sin SDK)
//  Equivale a stripe.webhooks.constructEvent: parsea Stripe-Signature (t=…,v1=…),
//  recomputa HMAC-SHA256(`${t}.${payload}`) con el whsec_ y compara en tiempo ~const.
// ----------------------------------------------------------------------------

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

/** Comparación en tiempo constante de dos Uint8Array (anti timing-attack). */
function igualesConstante(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/**
 * Verifica la firma y devuelve el evento parseado, o lanza si es inválida.
 * @param {string} payload  Cuerpo CRUDO (texto exacto recibido).
 * @param {string} firmaHeader  Cabecera 'Stripe-Signature'.
 * @param {string} secret  STRIPE_WEBHOOK_SECRET (whsec_...).
 * @param {object} [opts]  { toleranciaSeg, ahoraSeg } para test determinista.
 */
export async function verificarFirmaStripe(payload, firmaHeader, secret, opts = {}) {
  if (!secret) throw new Error('Falta STRIPE_WEBHOOK_SECRET');
  if (!firmaHeader) throw new Error('Falta cabecera Stripe-Signature');

  const partes = Object.fromEntries(
    firmaHeader.split(',').map((kv) => {
      const i = kv.indexOf('=');
      return [kv.slice(0, i).trim(), kv.slice(i + 1).trim()];
    })
  );
  const t = partes.t;
  const v1 = partes.v1;
  if (!t || !v1) throw new Error('Stripe-Signature mal formada');

  // Anti-replay: rechazar firmas demasiado viejas.
  const ahoraSeg = opts.ahoraSeg ?? Math.floor(Date.now() / 1000);
  const tolerancia = opts.toleranciaSeg ?? TOLERANCIA_FIRMA_SEG;
  if (Math.abs(ahoraSeg - Number(t)) > tolerancia) {
    throw new Error('Firma de webhook fuera de la ventana de tolerancia (posible replay)');
  }

  const enc = new TextEncoder();
  const clave = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const firmado = new Uint8Array(await crypto.subtle.sign('HMAC', clave, enc.encode(`${t}.${payload}`)));
  const esperado = hexToBytes(v1);

  if (!igualesConstante(firmado, esperado)) {
    throw new Error('Firma de webhook inválida');
  }
  return JSON.parse(payload);
}

// ----------------------------------------------------------------------------
//  Cálculo del reparto 70/30 que CUADRA al céntimo (garantiza el CHECK del esquema)
// ----------------------------------------------------------------------------

/**
 * Dado el importe bruto (céntimos), parte en 70% plataforma / 30% pool de modo que
 * comision_plataforma + pool == importe EXACTAMENTE (lo exige el CHECK de transacciones).
 *
 * Se calcula la comisión de plataforma redondeada y el pool como el RESTO exacto
 * (importe - comisión), tal como manda docs/pagos-stripe.md §4: nunca se suman dos
 * ROUND() independientes (podrían diferir del total en ±1 céntimo).
 *
 * @param {number} importeCentimos  entero > 0
 * @returns {{comision_plataforma_centimos:number, pool_usuarios_centimos:number}}
 */
export function calcularReparto7030(importeCentimos) {
  const importe = Number(importeCentimos);
  if (!Number.isInteger(importe) || importe <= 0) {
    throw new Error(`importe inválido: ${importeCentimos} (entero de céntimos > 0)`);
  }
  const comision = Math.round(importe * 0.70);     // 70% plataforma (redondeado)
  const pool = importe - comision;                  // 30% = resto EXACTO
  // Defensa: la suma debe ser idéntica al importe (es lo que validará la BD).
  if (comision + pool !== importe) {
    throw new Error(`DESCUADRE 70/30: ${comision}+${pool} != ${importe}`);
  }
  return { comision_plataforma_centimos: comision, pool_usuarios_centimos: pool };
}

// ----------------------------------------------------------------------------
//  Helpers HTTP
// ----------------------------------------------------------------------------

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders },
  });
}

function error(codigo, mensaje, status, requestId, detalles = {}) {
  return json({ error: { codigo, mensaje, request_id: requestId || null, detalles } }, status);
}

function uuid() { return crypto.randomUUID(); }

async function auditar(db, { actor = 'sistema', accion, entidad, entidad_id, detalles }) {
  try {
    await db
      .prepare(
        `INSERT INTO logs_auditoria (actor, accion, entidad, entidad_id, detalles, creado_en)
         VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))`
      )
      .bind(actor, accion, entidad || null, entidad_id || null, JSON.stringify(detalles || {}))
      .run();
  } catch (_) { /* la auditoría nunca tumba la operación de pago */ }
}

// ----------------------------------------------------------------------------
//  POST /v1/pagos/cobrar — cobrar a una agencia por un reporte
// ----------------------------------------------------------------------------
//  Cuerpo: { agencia_id, reporte_id?, importe_centimos, idempotency_key? }
//  - Valida que la agencia exista, KYC verificada, contrato firmado y tenga
//    stripe_customer_id.
//  - Crea un PaymentIntent (customer = agencia) con Idempotency-Key.
//  - Inserta la transacción (estado 'pendiente') con el reparto 70/30 exacto.
//  - El paso a 'pagada' lo hace el webhook payment_intent.succeeded.
// ----------------------------------------------------------------------------

async function cobrarAgencia(request, env, requestId) {
  const db = env.PLATAFORMA_DB;
  const stripe = crearClienteStripe(env.STRIPE_SECRET_KEY);

  let cuerpo;
  try { cuerpo = await request.json(); }
  catch { return error('peticion_invalida', 'JSON inválido en el cuerpo', 400, requestId); }

  const { agencia_id, reporte_id = null, importe_centimos } = cuerpo || {};
  // La Idempotency-Key viene por cabecera (estándar) o, si no, por cuerpo.
  const idemKey = request.headers.get('Idempotency-Key') || cuerpo.idempotency_key || uuid();

  if (!agencia_id || typeof agencia_id !== 'string') {
    return error('peticion_invalida', 'agencia_id obligatorio', 400, requestId);
  }
  if (!Number.isInteger(importe_centimos) || importe_centimos <= 0) {
    return error('peticion_invalida', 'importe_centimos debe ser un entero de céntimos > 0', 400, requestId);
  }

  // 1) Validar la agencia (barrera de negocio, independiente de Stripe).
  const agencia = await db
    .prepare(`SELECT id, kyc_estado, contrato_firmado_en, stripe_customer_id FROM agencias WHERE id = ?1`)
    .bind(agencia_id)
    .first();
  if (!agencia) return error('no_existe', 'La agencia no existe', 404, requestId);
  if (agencia.kyc_estado !== 'verificada') {
    return error('kyc_no_verificada', 'La agencia no tiene el KYC verificado', 403, requestId);
  }
  if (!agencia.contrato_firmado_en) {
    return error('kyc_no_verificada', 'La agencia no tiene contrato firmado', 403, requestId);
  }
  if (!agencia.stripe_customer_id) {
    return error('pago_requerido', 'La agencia no tiene método de pago (stripe_customer_id)', 422, requestId);
  }

  // 2) Idempotencia de aplicación: si ya creamos una transacción para este reporte
  //    con esta misma Idempotency-Key, devolvemos la existente (no doble cobro).
  if (reporte_id) {
    const previa = await db
      .prepare(`SELECT id, stripe_payment_intent, estado, importe_centimos FROM transacciones WHERE reporte_id = ?1 AND estado IN ('pendiente','pagada')`)
      .bind(reporte_id)
      .first();
    if (previa) {
      if (previa.importe_centimos !== importe_centimos) {
        return error('idempotencia_conflicto', 'Ya existe una transacción para este reporte con otro importe', 409, requestId);
      }
      return json({
        transaccion_id: previa.id,
        estado: previa.estado === 'pagada' ? 'pagado' : 'pendiente_pago',
        importe_centimos: previa.importe_centimos,
        stripe_payment_intent: previa.stripe_payment_intent,
        reutilizada: true,
      }, 200);
    }
  }

  // 3) Reparto 70/30 EXACTO (lo validará el CHECK al insertar).
  let reparto;
  try { reparto = calcularReparto7030(importe_centimos); }
  catch (e) { return error('peticion_invalida', e.message, 400, requestId); }

  // 4) Crear el PaymentIntent en Stripe (idempotente).
  let pi;
  try {
    pi = await stripe.paymentIntents.create(
      {
        amount: importe_centimos,
        currency: 'eur',
        customer: agencia.stripe_customer_id,
        // La plataforma RETIENE todo; los transfers a usuarios van por el cron.
        'automatic_payment_methods[enabled]': 'true',
        'metadata[reporte_id]': reporte_id || '',
        'metadata[agencia_id]': agencia_id,
      },
      { idempotencyKey: `cobro:${idemKey}` }
    );
  } catch (e) {
    if (e instanceof StripeError) {
      return error('pago_no_confirmado', `Stripe rechazó el cobro: ${e.message}`, 402, requestId, { tipo: e.tipo, codigo: e.codigo });
    }
    return error('error_interno', 'No se pudo crear el cobro', 500, requestId);
  }

  // 5) Insertar la transacción (estado 'pendiente'). El CHECK de la BD revalida la suma.
  const txId = uuid();
  try {
    await db
      .prepare(
        `INSERT INTO transacciones
           (id, agencia_id, reporte_id, importe_centimos,
            comision_plataforma_centimos, pool_usuarios_centimos,
            stripe_payment_intent, estado, creado_en)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'pendiente', datetime('now'))`
      )
      .bind(
        txId, agencia_id, reporte_id, importe_centimos,
        reparto.comision_plataforma_centimos, reparto.pool_usuarios_centimos,
        pi.id
      )
      .run();
  } catch (e) {
    // Si la BD rechaza (p.ej. CHECK), el dinero no se mueve aún (PI sin confirmar):
    // se registra y se pide reintento; NO se entrega nada.
    await auditar(db, { accion: 'transaccion.error_insert', entidad: 'transacciones', entidad_id: txId, detalles: { error: String(e.message || e), stripe_payment_intent: pi.id } });
    return error('error_interno', 'No se pudo registrar la transacción', 500, requestId, { detalle: String(e.message || e) });
  }

  await auditar(db, {
    accion: 'transaccion.creada',
    entidad: 'transacciones',
    entidad_id: txId,
    detalles: { agencia_id, reporte_id, importe_centimos, comision_plataforma_centimos: reparto.comision_plataforma_centimos, pool_usuarios_centimos: reparto.pool_usuarios_centimos, stripe_payment_intent: pi.id },
  });

  return json({
    transaccion_id: txId,
    estado: 'pendiente_pago',
    importe_centimos,
    comision_plataforma_centimos: reparto.comision_plataforma_centimos,
    pool_usuarios_centimos: reparto.pool_usuarios_centimos,
    stripe_payment_intent: pi.id,
    client_secret: pi.client_secret || null,
  }, 201);
}

// ----------------------------------------------------------------------------
//  POST /webhooks/stripe — verificar firma y actualizar estados
// ----------------------------------------------------------------------------

async function webhookStripe(request, env, requestId) {
  const db = env.PLATAFORMA_DB;
  const payload = await request.text(); // CRUDO: la firma se calcula sobre el texto exacto.
  const firma = request.headers.get('Stripe-Signature');

  let evento;
  try {
    evento = await verificarFirmaStripe(payload, firma, env.STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    // Firma inválida -> 400; Stripe reintentará. NO tocamos nada.
    return error('firma_webhook_invalida', e.message, 400, requestId);
  }

  // Idempotencia por event.id en KV: si ya se procesó, 200 sin reprocesar.
  if (env.RATE_LIMIT && evento.id) {
    const visto = await env.RATE_LIMIT.get(`evt:${evento.id}`);
    if (visto) {
      return json({ recibido: true, duplicado: true });
    }
  }

  try {
    await procesarEvento(db, evento);
  } catch (e) {
    // Error al aplicar el efecto: NO marcamos el evento como visto para que Stripe
    // reintente, y devolvemos 500 (Stripe reintentará con backoff).
    await auditar(db, { accion: 'webhook.error', entidad: 'transacciones', entidad_id: evento.id, detalles: { type: evento.type, error: String(e.message || e) } });
    return error('error_interno', 'Error procesando el evento; se reintentará', 500, requestId);
  }

  // Marcar como procesado (idempotencia) tras aplicarlo con éxito.
  if (env.RATE_LIMIT && evento.id) {
    await env.RATE_LIMIT.put(`evt:${evento.id}`, '1', { expirationTtl: TTL_IDEMPOTENCIA_WEBHOOK_SEG });
  }
  return json({ recibido: true });
}

/** Aplica el efecto de cada tipo de evento sobre las tablas. */
async function procesarEvento(db, evento) {
  const obj = evento.data && evento.data.object ? evento.data.object : {};
  switch (evento.type) {
    case 'payment_intent.succeeded': {
      await actualizarTxPorPaymentIntent(db, obj.id, 'pendiente', 'pagada', 'transaccion.pagada');
      // Entregar el reporte queda a cargo de w-reportes (fuera de este Worker).
      break;
    }
    case 'payment_intent.payment_failed': {
      await actualizarTxPorPaymentIntent(db, obj.id, 'pendiente', 'fallida', 'transaccion.fallida');
      break;
    }
    case 'charge.refunded': {
      // En charge, el PaymentIntent viene en obj.payment_intent.
      const piId = obj.payment_intent || (obj.charges && obj.charges.data && obj.charges.data[0] && obj.charges.data[0].payment_intent);
      await actualizarTxPorPaymentIntent(db, piId, 'pagada', 'reembolsada', 'transaccion.reembolsada');
      break;
    }
    case 'transfer.created':
    case 'transfer.paid': {
      // Confirmación del reparto a un usuario: pasar repartos.estado a 'pagado'.
      const repartoId = obj.metadata && obj.metadata.reparto_id;
      if (repartoId) {
        await db
          .prepare(`UPDATE repartos SET estado = 'pagado', stripe_transfer_id = ?2 WHERE id = ?1 AND estado <> 'pagado'`)
          .bind(repartoId, obj.id)
          .run();
        await auditar(db, { accion: 'reparto.transfer_confirmado', entidad: 'repartos', entidad_id: repartoId, detalles: { stripe_transfer_id: obj.id, type: evento.type } });
      }
      break;
    }
    case 'transfer.failed': {
      const repartoId = obj.metadata && obj.metadata.reparto_id;
      if (repartoId) {
        await db.prepare(`UPDATE repartos SET estado = 'fallido' WHERE id = ?1`).bind(repartoId).run();
        await auditar(db, { accion: 'reparto.transfer_fallido', entidad: 'repartos', entidad_id: repartoId, detalles: { stripe_transfer_id: obj.id } });
      }
      break;
    }
    case 'account.updated': {
      // Sincronizar payout_estado del usuario según su KYC de Stripe Connect.
      const cuentaId = obj.id;
      const detailsSubmitted = obj.details_submitted;
      const transfersActivos = obj.capabilities && obj.capabilities.transfers === 'active';
      const sinPendientes = !(obj.requirements && obj.requirements.currently_due && obj.requirements.currently_due.length > 0);
      const nuevoEstado = detailsSubmitted && transfersActivos && sinPendientes ? 'verificado' : 'restringido';
      await db
        .prepare(`UPDATE usuarios SET payout_estado = ?2 WHERE stripe_account_id = ?1`)
        .bind(cuentaId, nuevoEstado)
        .run();
      await auditar(db, { accion: 'usuario.payout_estado', entidad: 'usuarios', entidad_id: cuentaId, detalles: { payout_estado: nuevoEstado } });
      break;
    }
    default:
      // Eventos no manejados: se aceptan (200) sin efecto.
      break;
  }
}

/**
 * Transición de estado de una transacción identificada por su PaymentIntent.
 * Solo cambia si está en el estado de partida esperado (evita reabrir/regresar).
 */
async function actualizarTxPorPaymentIntent(db, piId, estadoDesde, estadoHacia, accionAudit) {
  if (!piId) return;
  const res = await db
    .prepare(`UPDATE transacciones SET estado = ?3 WHERE stripe_payment_intent = ?1 AND estado = ?2`)
    .bind(piId, estadoDesde, estadoHacia)
    .run();
  const cambios = res?.meta?.changes ?? res?.changes ?? 0;
  if (cambios > 0) {
    const tx = await db.prepare(`SELECT id FROM transacciones WHERE stripe_payment_intent = ?1`).bind(piId).first();
    await auditar(db, { accion: accionAudit, entidad: 'transacciones', entidad_id: tx?.id || piId, detalles: { stripe_payment_intent: piId, estado: estadoHacia } });
  }
}

// ----------------------------------------------------------------------------
//  Router + handlers del Worker
// ----------------------------------------------------------------------------

export default {
  async fetch(request, env) {
    const requestId = request.headers.get('X-Request-Id') || uuid();
    const url = new URL(request.url);
    const ruta = url.pathname;

    try {
      if (request.method === 'POST' && (ruta === '/v1/pagos/cobrar' || ruta === '/pagos/cobrar')) {
        return await cobrarAgencia(request, env, requestId);
      }
      if (request.method === 'POST' && (ruta === '/webhooks/stripe' || ruta === '/v1/webhooks/stripe')) {
        return await webhookStripe(request, env, requestId);
      }
      return error('no_existe', 'Ruta no encontrada', 404, requestId);
    } catch (e) {
      // Cualquier excepción no controlada: 500 con request_id, sin filtrar internals.
      try { await auditar(env.PLATAFORMA_DB, { accion: 'worker.error', detalles: { ruta, error: String(e && e.message || e) } }); } catch (_) {}
      return error('error_interno', 'Error interno', 500, requestId);
    }
  },

  // Cron mensual: reparte el periodo del MES ANTERIOR (el cron corre el día 1).
  async scheduled(event, env, ctx) {
    const periodo = periodoMesAnterior(new Date(event.scheduledTime || Date.now()));
    const stripe = crearClienteStripe(env.STRIPE_SECRET_KEY);
    const tarea = ejecutarRepartoMensual(periodo, { db: env.PLATAFORMA_DB, stripe });
    if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(tarea);
    else await tarea;
  },
};

/** Devuelve 'YYYY-MM' del mes anterior a la fecha dada (UTC). */
export function periodoMesAnterior(fecha) {
  const y = fecha.getUTCFullYear();
  const m = fecha.getUTCMonth(); // 0..11 del mes ACTUAL
  const anterior = new Date(Date.UTC(y, m - 1, 1));
  const yy = anterior.getUTCFullYear();
  const mm = String(anterior.getUTCMonth() + 1).padStart(2, '0');
  return `${yy}-${mm}`;
}

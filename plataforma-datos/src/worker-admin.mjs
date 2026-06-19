/**
 * worker-admin.mjs — Endpoints de Admin / Cumplimiento (DPO)
 * =============================================================================
 * Plataforma de Datos *consent-first* — Panel de cumplimiento interno.
 *
 * Acceso: cabecera  Authorization: Bearer <ADMIN_TOKEN>
 *         (+ allowlist IP configurable en KV «CONFIG» clave «ADMIN_IP_ALLOWLIST»)
 *
 * Toda acción sensible se registra en logs_auditoria con:
 *   actor = 'admin:<ip_hash>'
 *   ip_hash = SHA-256(ip || PEPPER_PII) — nunca la IP en claro
 *
 * Rutas expuestas (todas bajo /v1/admin/):
 *
 *   GET    /v1/admin/metricas                      — KPIs de cumplimiento
 *   GET    /v1/admin/auditoria                     — logs append-only (paginados)
 *   GET    /v1/admin/consentimientos/resumen        — activos vs revocados
 *   GET    /v1/admin/contribuciones/huerfanas       — contribuciones sin consent activo
 *   GET    /v1/admin/reportes/bloqueados            — reportes que no pasan k<50
 *   GET    /v1/admin/derechos/solicitudes           — solicitudes RGPD pendientes
 *   POST   /v1/admin/derechos/solicitudes/:id/resolver — marcar resuelta
 *   GET    /v1/admin/agencias                       — lista agencias (kyc y estado)
 *   POST   /v1/admin/agencias/:id/kyc               — verificar/rechazar KYC (I.1)
 *   POST   /v1/admin/reparto/:periodo/ejecutar      — disparar reparto (I.4)
 *   GET    /v1/admin/reparto/:periodo               — estado del reparto (I.5)
 *
 *   POST   /v1/admin/carga/validar                  — valida lote de datos a importar:
 *                                                     RECHAZA los sin consentimiento activo
 *                                                     NUNCA importa nada sin consentimiento.
 * =============================================================================
 */

import { ejecutarRepartoMensual } from './reparto-mensual.mjs';
import { crearClienteStripe } from './worker-pagos.mjs';

// ---------------------------------------------------------------------------
// CREDENCIAL ADMIN
// ---------------------------------------------------------------------------
// Este es un Worker de SERVIDOR: NO hay credenciales en el código. El token de
// admin se inyecta SIEMPRE por secreto (env.ADMIN_TOKEN, p.ej. `wrangler secret put
// ADMIN_TOKEN`). Si el secreto no está configurado, el Worker NO autentica a nadie
// y responde 500 'config_incompleta'. Nunca hay un fallback hardcodeado.

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Calcula SHA-256 de texto y devuelve hex. */
async function sha256hex(texto) {
  const buf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(texto)
  );
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Responde JSON. El panel de admin se sirve same-origin, así que NO se emiten
 * cabeceras CORS (nunca 'null', que habilitaría a cualquier origen opaco/sandbox).
 * Si en el futuro se necesitara CORS, usar una allowlist concreta por env
 * (env.ADMIN_CORS_ORIGIN) — jamás un comodín ni 'null'.
 */
function jsonResp(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

/** Error uniforme (mismo formato que el contrato). */
function errResp(codigo, mensaje, status) {
  return jsonResp(
    { error: { codigo, mensaje } },
    status
  );
}

/**
 * Registra en logs_auditoria.
 * detalles NO debe contener datos personales innecesarios.
 */
async function auditLog(db, actor, accion, entidad, entidadId, detalles, ipHash) {
  await db
    .prepare(
      `INSERT INTO logs_auditoria (actor, accion, entidad, entidad_id, detalles, ip_hash)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(
      actor,
      accion,
      entidad ?? null,
      entidadId ?? null,
      JSON.stringify(detalles ?? {}),
      ipHash ?? null
    )
    .run();
}

/**
 * Construye el hash de IP (PEPPER obligatorio; sin él no se hash-ea).
 * Nunca lanza: si falla devuelve null.
 */
async function hashIp(ip, pepper) {
  if (!ip || !pepper) return null;
  try {
    return await sha256hex(ip + pepper);
  } catch {
    return null;
  }
}

/**
 * Escapa los comodines de LIKE (% _ \) en un valor de usuario para que se traten
 * como literales. Debe combinarse con  ESCAPE '\'  en la consulta. Evita que un
 * filtro como "%" o "a_b" se interprete como patrón (LIKE-injection).
 */
function escaparLike(texto) {
  return String(texto).replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

// ---------------------------------------------------------------------------
// Autenticación admin
// ---------------------------------------------------------------------------

/**
 * Verifica el token admin contra env.ADMIN_TOKEN (secreto de Cloudflare).
 * NO existe fallback a ninguna constante del código: si el secreto no está
 * configurado, se devuelve { ok:false, configIncompleta:true } y el router
 * responde 500 'config_incompleta' SIN autenticar a nadie.
 * Devuelve { ok:true, actor } | { ok:false, mensaje } | { ok:false, configIncompleta:true }
 */
async function autenticarAdmin(request, env) {
  // Sin secreto de servidor configurado -> no se autentica a nadie (fail-closed).
  const tokenEsperado = env.ADMIN_TOKEN;
  if (!tokenEsperado || typeof tokenEsperado !== 'string') {
    return { ok: false, configIncompleta: true };
  }

  const authHeader = request.headers.get('Authorization') ?? '';
  const match = authHeader.match(/^Bearer (.+)$/i);
  if (!match) {
    return { ok: false, mensaje: 'Cabecera Authorization ausente o malformada.' };
  }
  const token = match[1].trim();

  // Comparación de tiempo constante (evita timing attacks).
  if (token.length !== tokenEsperado.length) {
    return { ok: false, mensaje: 'Token inválido.' };
  }
  let igual = true;
  for (let i = 0; i < token.length; i++) {
    if (token.charCodeAt(i) !== tokenEsperado.charCodeAt(i)) igual = false;
  }
  if (!igual) {
    return { ok: false, mensaje: 'Token inválido.' };
  }

  // Allowlist de IP (opcional; se lee de KV «CONFIG» clave «ADMIN_IP_ALLOWLIST»).
  if (env.CONFIG) {
    const allowlist = await env.CONFIG.get('ADMIN_IP_ALLOWLIST');
    if (allowlist) {
      const ips = allowlist.split(',').map(s => s.trim());
      const ipCliente = request.headers.get('CF-Connecting-IP') ?? '';
      if (!ips.includes(ipCliente)) {
        return { ok: false, mensaje: 'IP no autorizada.' };
      }
    }
  }

  return { ok: true, actor: 'admin' };
}

// ---------------------------------------------------------------------------
// Router principal
// ---------------------------------------------------------------------------

export default {
  async fetch(request, env, _ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Solo rutas /v1/admin/*
    if (!path.startsWith('/v1/admin/')) {
      return errResp('ruta_no_encontrada', 'Ruta no encontrada.', 404);
    }

    // Preflight: el panel es same-origin, así que NO se emiten cabeceras CORS.
    // Respondemos 204 sin Access-Control-* (jamás 'null'). Un origen cruzado no
    // recibirá permiso y el navegador bloqueará la petición, que es lo deseado.
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
      });
    }

    // Autenticación. Si falta el secreto de servidor -> 500, sin autenticar.
    const auth = await autenticarAdmin(request, env);
    if (auth.configIncompleta) {
      return errResp('config_incompleta', 'El servidor no tiene configurado ADMIN_TOKEN; acceso deshabilitado.', 500);
    }
    if (!auth.ok) {
      return errResp('auth_invalida', auth.mensaje, 401);
    }

    const db = env.PLATAFORMA_DB;
    const ip = request.headers.get('CF-Connecting-IP') ?? 'desconocida';
    const pepper = env.PEPPER_PII ?? '';
    const ipHash = await hashIp(ip, pepper);
    const actor = `admin:${ipHash ?? 'desconocida'}`;

    // Quitar prefijo /v1/admin/ para el sub-router
    const subpath = path.replace('/v1/admin', '');

    // -----------------------------------------------------------------------
    // GET /v1/admin/metricas  (I.3)
    // -----------------------------------------------------------------------
    if (subpath === '/metricas' && request.method === 'GET') {
      return handleMetricas(db, actor, ipHash);
    }

    // -----------------------------------------------------------------------
    // GET /v1/admin/auditoria  (I.2)
    // -----------------------------------------------------------------------
    if (subpath === '/auditoria' && request.method === 'GET') {
      return handleAuditoria(db, url, actor, ipHash);
    }

    // -----------------------------------------------------------------------
    // GET /v1/admin/consentimientos/resumen
    // -----------------------------------------------------------------------
    if (subpath === '/consentimientos/resumen' && request.method === 'GET') {
      return handleConsentimientosResumen(db, actor, ipHash);
    }

    // -----------------------------------------------------------------------
    // GET /v1/admin/contribuciones/huerfanas
    // -----------------------------------------------------------------------
    if (subpath === '/contribuciones/huerfanas' && request.method === 'GET') {
      return handleContribucionesHuerfanas(db, url, actor, ipHash);
    }

    // -----------------------------------------------------------------------
    // GET /v1/admin/reportes/bloqueados
    // -----------------------------------------------------------------------
    if (subpath === '/reportes/bloqueados' && request.method === 'GET') {
      return handleReportesBloqueados(db, actor, ipHash);
    }

    // -----------------------------------------------------------------------
    // GET /v1/admin/derechos/solicitudes
    // -----------------------------------------------------------------------
    if (subpath === '/derechos/solicitudes' && request.method === 'GET') {
      return handleDerechosSolicitudes(db, url, actor, ipHash);
    }

    // -----------------------------------------------------------------------
    // POST /v1/admin/derechos/solicitudes/:id/resolver
    // -----------------------------------------------------------------------
    const matchResolver = subpath.match(/^\/derechos\/solicitudes\/([^/]+)\/resolver$/);
    if (matchResolver && request.method === 'POST') {
      return handleResolverSolicitud(db, matchResolver[1], request, actor, ipHash);
    }

    // -----------------------------------------------------------------------
    // GET /v1/admin/agencias
    // -----------------------------------------------------------------------
    if (subpath === '/agencias' && request.method === 'GET') {
      return handleAgencias(db, url, actor, ipHash);
    }

    // -----------------------------------------------------------------------
    // POST /v1/admin/agencias/:id/kyc  (I.1)
    // -----------------------------------------------------------------------
    const matchKyc = subpath.match(/^\/agencias\/([^/]+)\/kyc$/);
    if (matchKyc && request.method === 'POST') {
      return handleKyc(db, matchKyc[1], request, actor, ipHash);
    }

    // -----------------------------------------------------------------------
    // POST /v1/admin/reparto/:periodo/ejecutar  (I.4)
    // -----------------------------------------------------------------------
    const matchRepartoEjecutar = subpath.match(/^\/reparto\/([^/]+)\/ejecutar$/);
    if (matchRepartoEjecutar && request.method === 'POST') {
      return handleRepartoEjecutar(db, matchRepartoEjecutar[1], request, env, actor, ipHash);
    }

    // -----------------------------------------------------------------------
    // GET /v1/admin/reparto/:periodo  (I.5)
    // -----------------------------------------------------------------------
    const matchRepartoEstado = subpath.match(/^\/reparto\/([^/]+)$/);
    if (matchRepartoEstado && request.method === 'GET') {
      return handleRepartoEstado(db, matchRepartoEstado[1], actor, ipHash);
    }

    // -----------------------------------------------------------------------
    // POST /v1/admin/carga/validar — PUERTA DE CONSENTIMIENTO
    // -----------------------------------------------------------------------
    if (subpath === '/carga/validar' && request.method === 'POST') {
      return handleCargaValidar(db, request, actor, ipHash);
    }

    return errResp('ruta_no_encontrada', 'Ruta admin no encontrada.', 404);
  },
};

// ---------------------------------------------------------------------------
// I.3 — Métricas de cumplimiento (KPIs sin PII)
// ---------------------------------------------------------------------------
async function handleMetricas(db, actor, ipHash) {
  const ahora = new Date();
  const mesActual = ahora.toISOString().slice(0, 7); // 'YYYY-MM'

  const [
    usuariosActivos,
    consentActivos,
    consentRevocadosMes,
    reportesEntregadosMes,
    ingresosMes,
    poolMes,
    contribucionesTotales,
    contribucionesHuerfanas,
  ] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS n FROM usuarios WHERE estado = 'activo'`).first(),
    db.prepare(`SELECT COUNT(*) AS n FROM consentimientos WHERE revocado_en IS NULL`).first(),
    db.prepare(
      `SELECT COUNT(*) AS n FROM consentimientos
       WHERE revocado_en IS NOT NULL
         AND strftime('%Y-%m', revocado_en) = ?`
    ).bind(mesActual).first(),
    db.prepare(
      `SELECT COUNT(*) AS n FROM reportes
       WHERE estado = 'entregado'
         AND strftime('%Y-%m', generado_en) = ?`
    ).bind(mesActual).first(),
    db.prepare(
      `SELECT COALESCE(SUM(importe_centimos), 0) AS total FROM transacciones
       WHERE estado = 'pagada'
         AND strftime('%Y-%m', creado_en) = ?`
    ).bind(mesActual).first(),
    db.prepare(
      `SELECT COALESCE(SUM(pool_usuarios_centimos), 0) AS total FROM transacciones
       WHERE estado = 'pagada'
         AND strftime('%Y-%m', creado_en) = ?`
    ).bind(mesActual).first(),
    db.prepare(`SELECT COUNT(*) AS n FROM contribuciones`).first(),
    // Contribuciones huérfanas = cuyo consentimiento_id no está activo
    db.prepare(
      `SELECT COUNT(*) AS n FROM contribuciones c
       WHERE NOT EXISTS (
         SELECT 1 FROM consentimientos cs
         WHERE cs.id = c.consentimiento_id
           AND cs.revocado_en IS NULL
       )`
    ).first(),
  ]);

  return jsonResp({
    periodo_actual: mesActual,
    usuarios_activos: usuariosActivos?.n ?? 0,
    consentimientos_activos: consentActivos?.n ?? 0,
    revocaciones_mes: consentRevocadosMes?.n ?? 0,
    reportes_entregados_mes: reportesEntregadosMes?.n ?? 0,
    ingresos_centimos_mes: ingresosMes?.total ?? 0,
    pool_usuarios_centimos_mes: poolMes?.total ?? 0,
    contribuciones_totales: contribucionesTotales?.n ?? 0,
    contribuciones_huerfanas: contribucionesHuerfanas?.n ?? 0,
    alerta_contribuciones_huerfanas: (contribucionesHuerfanas?.n ?? 0) > 0,
  });
}

// ---------------------------------------------------------------------------
// I.2 — Auditoría (append-only, paginada, solo lectura)
// ---------------------------------------------------------------------------
async function handleAuditoria(db, url, actor, ipHash) {
  const params = url.searchParams;
  const limit = Math.min(parseInt(params.get('limit') ?? '50', 10), 200);
  const cursor = parseInt(params.get('cursor') ?? '0', 10);
  const filtroActor = params.get('actor');
  const filtroAccion = params.get('accion');
  const filtroEntidad = params.get('entidad');
  const filtroEntidadId = params.get('entidad_id');
  const desde = params.get('desde');
  const hasta = params.get('hasta');

  // Construir consulta parametrizada de forma segura
  const condiciones = [];
  const binds = [];

  // LIKE con comodines escapados + ESCAPE '\' para tratar % _ \ como literales.
  if (filtroActor) { condiciones.push("actor LIKE ? ESCAPE '\\'"); binds.push(`%${escaparLike(filtroActor)}%`); }
  if (filtroAccion) { condiciones.push("accion LIKE ? ESCAPE '\\'"); binds.push(`%${escaparLike(filtroAccion)}%`); }
  if (filtroEntidad) { condiciones.push('entidad = ?'); binds.push(filtroEntidad); }
  if (filtroEntidadId) { condiciones.push('entidad_id = ?'); binds.push(filtroEntidadId); }
  if (desde) { condiciones.push('creado_en >= ?'); binds.push(desde); }
  if (hasta) { condiciones.push('creado_en <= ?'); binds.push(hasta); }
  if (cursor > 0) { condiciones.push('id < ?'); binds.push(cursor); }

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const sql = `SELECT id, actor, accion, entidad, entidad_id, detalles, ip_hash, creado_en
               FROM logs_auditoria
               ${where}
               ORDER BY id DESC
               LIMIT ?`;

  binds.push(limit + 1); // pedir uno más para saber si hay siguiente página

  const { results } = await db.prepare(sql).bind(...binds).all();
  const hayMas = results.length > limit;
  const items = hayMas ? results.slice(0, limit) : results;
  const siguienteCursor = hayMas ? items[items.length - 1].id : null;

  // Parsear detalles JSON si es string
  const itemsParseados = items.map(r => ({
    ...r,
    detalles: (() => {
      try { return JSON.parse(r.detalles); } catch { return r.detalles; }
    })(),
  }));

  return jsonResp({ items: itemsParseados, siguiente_cursor: siguienteCursor });
}

// ---------------------------------------------------------------------------
// Consentimientos — resumen activos vs revocados
// ---------------------------------------------------------------------------
async function handleConsentimientosResumen(db, actor, ipHash) {
  const [activos, revocados, porProposito] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS n FROM consentimientos WHERE revocado_en IS NULL`).first(),
    db.prepare(`SELECT COUNT(*) AS n FROM consentimientos WHERE revocado_en IS NOT NULL`).first(),
    db.prepare(
      `SELECT proposito,
              SUM(CASE WHEN revocado_en IS NULL THEN 1 ELSE 0 END) AS activos,
              SUM(CASE WHEN revocado_en IS NOT NULL THEN 1 ELSE 0 END) AS revocados
       FROM consentimientos
       GROUP BY proposito
       ORDER BY proposito`
    ).all(),
  ]);

  return jsonResp({
    total_activos: activos?.n ?? 0,
    total_revocados: revocados?.n ?? 0,
    por_proposito: porProposito.results ?? [],
  });
}

// ---------------------------------------------------------------------------
// Contribuciones huérfanas (sin consentimiento activo → deben rechazarse)
// ---------------------------------------------------------------------------
async function handleContribucionesHuerfanas(db, url, actor, ipHash) {
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '100', 10), 500);
  const offset = parseInt(url.searchParams.get('offset') ?? '0', 10);

  // PRIVACIDAD: el panel CUANTIFICA y MARCA la cuarentena; NO expone personas.
  // Por eso NO se devuelve usuario_id ni cuasi-identificadores (region, banda_edad,
  // genero, categoria) a nivel de fila —eso sería una fuga de PII—. Solo el id de
  // la contribución, su consentimiento_id y cuándo se recogió, para poder localizar
  // y purgar la fila; más un recuento agregado total.
  const { results } = await db.prepare(
    `SELECT c.id, c.consentimiento_id, c.recogido_en
     FROM contribuciones c
     WHERE NOT EXISTS (
       SELECT 1 FROM consentimientos cs
       WHERE cs.id = c.consentimiento_id
         AND cs.revocado_en IS NULL
     )
     ORDER BY c.recogido_en DESC
     LIMIT ? OFFSET ?`
  ).bind(limit, offset).all();

  const total = await db.prepare(
    `SELECT COUNT(*) AS n FROM contribuciones c
     WHERE NOT EXISTS (
       SELECT 1 FROM consentimientos cs
       WHERE cs.id = c.consentimiento_id
         AND cs.revocado_en IS NULL
     )`
  ).first();

  return jsonResp({
    nota: 'Estas contribuciones NO tienen consentimiento activo. Deben ser rechazadas o eliminadas. NUNCA se venden ni procesan. El panel solo las cuantifica/marca: no se expone usuario_id ni cuasi-identificadores (PII).',
    total_huerfanas: total?.n ?? 0,
    items: results ?? [],
    limit,
    offset,
  });
}

// ---------------------------------------------------------------------------
// Reportes bloqueados por k-anonimato < 50
// ---------------------------------------------------------------------------
async function handleReportesBloqueados(db, actor, ipHash) {
  // Los reportes en BD ya tienen CHECK n_usuarios >= 50, así que bloqueados
  // son los registros de transacciones sin reporte asociado (estado no_entregable)
  // o reportes pendientes que fallen la puerta.
  // Aquí listamos transacciones pagadas sin reporte entregado (indican segmentos rechazados).
  const { results } = await db.prepare(
    `SELECT t.id AS transaccion_id, t.agencia_id, t.reporte_id,
            t.importe_centimos, t.estado AS estado_transaccion,
            t.creado_en
     FROM transacciones t
     WHERE t.reporte_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM reportes r WHERE r.id = t.reporte_id AND r.estado = 'entregado'
       )
     ORDER BY t.creado_en DESC
     LIMIT 200`
  ).all();

  return jsonResp({
    nota: 'Transacciones cuyos reportes no se entregaron (segmento con n_usuarios < 50 = bloqueado por k-anonimato). Estas transacciones deberían estar reembolsadas.',
    items: results ?? [],
  });
}

// ---------------------------------------------------------------------------
// Derechos del interesado — solicitudes pendientes
// ---------------------------------------------------------------------------
async function handleDerechosSolicitudes(db, url, actor, ipHash) {
  // Estas solicitudes se almacenan como logs_auditoria con accion IN
  // ('derecho.acceso', 'derecho.supresion', 'derecho.portabilidad', 'derecho.rectificacion')
  // y detalles.estado = 'pendiente'
  const solo = url.searchParams.get('solo') ?? 'pendientes'; // 'pendientes' | 'todas'
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 200);

  const condEstado = solo === 'pendientes'
    ? `AND json_extract(detalles, '$.estado') = 'pendiente'`
    : '';

  const { results } = await db.prepare(
    `SELECT id, actor, accion, entidad, entidad_id, detalles, creado_en
     FROM logs_auditoria
     WHERE accion IN ('derecho.acceso','derecho.supresion','derecho.portabilidad','derecho.rectificacion','derecho.oposicion')
     ${condEstado}
     ORDER BY id DESC
     LIMIT ?`
  ).bind(limit).all();

  const itemsParseados = results.map(r => ({
    ...r,
    detalles: (() => { try { return JSON.parse(r.detalles); } catch { return r.detalles; } })(),
  }));

  const pendientes = itemsParseados.filter(
    r => (r.detalles?.estado ?? 'pendiente') === 'pendiente'
  ).length;

  return jsonResp({
    pendientes_urgentes: pendientes,
    plazo_legal_dias: 30,
    items: itemsParseados,
  });
}

// ---------------------------------------------------------------------------
// Resolver solicitud de derecho
// ---------------------------------------------------------------------------
async function handleResolverSolicitud(db, id, request, actor, ipHash) {
  let body;
  try { body = await request.json(); } catch { body = {}; }

  const resolucion = body.resolucion ?? 'resuelta';
  const nota = body.nota ?? '';

  if (!['resuelta', 'rechazada', 'en_tramite'].includes(resolucion)) {
    return errResp('valor_invalido', 'resolucion debe ser: resuelta, rechazada, en_tramite.', 422);
  }

  // El log es append-only: se añade un nuevo log con la resolución.
  await auditLog(
    db, actor, 'derecho.resolucion',
    'logs_auditoria', id,
    { resolucion, nota: nota.slice(0, 500) },
    ipHash
  );

  return jsonResp({ log_original_id: id, resolucion, nota, resuelto_en: new Date().toISOString() });
}

// ---------------------------------------------------------------------------
// Agencias — listado
// ---------------------------------------------------------------------------
async function handleAgencias(db, url, actor, ipHash) {
  const kyc = url.searchParams.get('kyc_estado');
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 200);

  const cond = kyc ? 'WHERE kyc_estado = ?' : '';
  const binds = kyc ? [kyc, limit] : [limit];

  const { results } = await db.prepare(
    `SELECT id, razon_social, cif, email, pais, kyc_estado, contrato_firmado_en, creado_en
     FROM agencias ${cond}
     ORDER BY creado_en DESC LIMIT ?`
  ).bind(...binds).all();

  return jsonResp({ items: results ?? [] });
}

// ---------------------------------------------------------------------------
// I.1 — KYC de agencia
// ---------------------------------------------------------------------------
async function handleKyc(db, agenciaId, request, actor, ipHash) {
  let body;
  try { body = await request.json(); } catch {
    return errResp('cuerpo_invalido', 'JSON inválido.', 400);
  }

  const { kyc_estado, contrato_firmado_en } = body ?? {};
  if (!['verificada', 'rechazada'].includes(kyc_estado)) {
    return errResp('valor_invalido', 'kyc_estado debe ser "verificada" o "rechazada".', 422);
  }

  const agencia = await db
    .prepare(`SELECT id, razon_social, kyc_estado FROM agencias WHERE id = ?`)
    .bind(agenciaId)
    .first();

  if (!agencia) {
    return errResp('agencia_no_encontrada', 'Agencia no encontrada.', 404);
  }

  const firmadoEn = kyc_estado === 'verificada'
    ? (contrato_firmado_en ?? new Date().toISOString())
    : null;

  await db
    .prepare(
      `UPDATE agencias SET kyc_estado = ?, contrato_firmado_en = ? WHERE id = ?`
    )
    .bind(kyc_estado, firmadoEn, agenciaId)
    .run();

  await auditLog(
    db, actor, 'agencia.kyc',
    'agencias', agenciaId,
    { kyc_estado, contrato_firmado_en: firmadoEn },
    ipHash
  );

  return jsonResp({ id: agenciaId, kyc_estado, contrato_firmado_en: firmadoEn });
}

// ---------------------------------------------------------------------------
// I.4 — Ejecutar reparto de un periodo
// ---------------------------------------------------------------------------
async function handleRepartoEjecutar(db, periodo, request, env, actor, ipHash) {
  if (!/^\d{4}-\d{2}$/.test(periodo)) {
    return errResp('formato_invalido', 'El periodo debe ser YYYY-MM.', 400);
  }

  let body;
  try { body = await request.json(); } catch { body = {}; }
  const dryRun = body.dry_run === true;

  // El reparto de DINERO REAL vive en un único sitio: ejecutarRepartoMensual().
  // Reparte con el algoritmo del MAYOR RESTO (cuadra al céntimo), solo paga a
  // usuarios con payout_estado='verificado' y stripe_account_id, crea los transfers
  // de Stripe con reintentos y es idempotente por UNIQUE(periodo, usuario_id).
  // Aquí NO se recalcula nada a mano: se delega y se devuelve su resultado.

  // Fuera de dry_run hace falta el cliente Stripe (mueve dinero). Si falta la clave,
  // no se ejecuta el pago real.
  let stripe = null;
  if (!dryRun) {
    if (!env || !env.STRIPE_SECRET_KEY) {
      return errResp('config_incompleta', 'Falta STRIPE_SECRET_KEY para ejecutar el reparto real. Usa dry_run para simular.', 500);
    }
    stripe = crearClienteStripe(env.STRIPE_SECRET_KEY);
  }

  // Traza de QUIÉN dispara el reparto (el orquestador audita como 'sistema'; aquí
  // dejamos constancia del admin que lo lanzó).
  await auditLog(
    db, actor, dryRun ? 'reparto.disparado_simulacion' : 'reparto.disparado',
    'repartos', periodo,
    { periodo, dry_run: dryRun },
    ipHash
  );

  let resultado;
  try {
    resultado = await ejecutarRepartoMensual(periodo, {
      db,
      stripe,
      opciones: { dryRun },
    });
  } catch (e) {
    return errResp('reparto_error', `No se pudo ejecutar el reparto: ${String(e?.message || e)}`, 500);
  }

  return jsonResp(resultado);
}

// ---------------------------------------------------------------------------
// I.5 — Estado del reparto de un periodo
// ---------------------------------------------------------------------------
async function handleRepartoEstado(db, periodo, actor, ipHash) {
  if (!/^\d{4}-\d{2}$/.test(periodo)) {
    return errResp('formato_invalido', 'El periodo debe ser YYYY-MM.', 400);
  }

  const { results } = await db
    .prepare(
      `SELECT id, usuario_id, importe_centimos, peso_contribucion, estado, stripe_transfer_id, creado_en
       FROM repartos
       WHERE periodo = ?
       ORDER BY creado_en DESC`
    )
    .bind(periodo)
    .all();

  const totales = (results ?? []).reduce(
    (acc, r) => {
      acc.total_centimos += r.importe_centimos;
      acc[`estado_${r.estado}`] = (acc[`estado_${r.estado}`] ?? 0) + 1;
      return acc;
    },
    { total_centimos: 0 }
  );

  // PRIVACIDAD: no se devuelve usuario_id en claro por fila. Se tokeniza con un
  // hash truncado (estable dentro del periodo) para poder distinguir/agrupar filas
  // sin exponer el identificador seudónimo del usuario en el panel.
  const items = [];
  for (const r of (results ?? [])) {
    const usuarioToken = r.usuario_id
      ? (await sha256hex(`${r.usuario_id}|${periodo}`)).slice(0, 16)
      : null;
    items.push({
      id: r.id,
      usuario_token: usuarioToken,
      importe_centimos: r.importe_centimos,
      peso_contribucion: r.peso_contribucion,
      estado: r.estado,
      stripe_transfer_id: r.stripe_transfer_id,
      creado_en: r.creado_en,
    });
  }

  // Se AUDITA el acceso, como el resto de endpoints sensibles.
  await auditLog(
    db, actor, 'reparto.estado_consultado',
    'repartos', periodo,
    { periodo, filas: items.length },
    ipHash
  );

  return jsonResp({
    periodo,
    filas: items.length,
    totales,
    items,
  });
}

// ---------------------------------------------------------------------------
// POST /v1/admin/carga/validar — PUERTA DE CONSENTIMIENTO PARA IMPORTACIONES
//
// PRINCIPIO FUNDAMENTAL: este endpoint RECHAZA cualquier fila sin consentimiento
// activo verificable. No existe opción de "importar sin consentimiento".
// Los rechazados van a cuarentena; JAMÁS se procesan, venden ni almacenan.
// ---------------------------------------------------------------------------
async function handleCargaValidar(db, request, actor, ipHash) {
  let body;
  try { body = await request.json(); } catch {
    return errResp('cuerpo_invalido', 'JSON inválido.', 400);
  }

  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0) {
    return errResp('carga_vacia', 'El campo "items" es un array vacío o no se proporcionó.', 400);
  }
  if (items.length > 1000) {
    return errResp('carga_excesiva', 'Máximo 1 000 ítems por validación.', 400);
  }

  const resultados = [];
  let aprobados = 0;
  let rechazados = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const usuarioId = item.usuario_id ?? null;
    const consentimientoId = item.consentimiento_id ?? null;

    // Validación 1: campos obligatorios presentes
    if (!usuarioId || !consentimientoId) {
      resultados.push({
        indice: i,
        usuario_id: usuarioId,
        estado: 'RECHAZADO',
        motivo: 'Faltan usuario_id o consentimiento_id: no se puede verificar el consentimiento.',
      });
      rechazados++;
      continue;
    }

    // Validación 2: consentimiento ACTIVO en BD (mismo usuario, propósito correcto, no revocado)
    const consentRow = await db
      .prepare(
        `SELECT id, proposito, politica_version, otorgado_en
         FROM consentimientos
         WHERE id = ?
           AND usuario_id = ?
           AND revocado_en IS NULL
           AND proposito = 'venta_datos_agregados'`
      )
      .bind(consentimientoId, usuarioId)
      .first();

    if (!consentRow) {
      resultados.push({
        indice: i,
        usuario_id: usuarioId,
        consentimiento_id: consentimientoId,
        estado: 'RECHAZADO',
        motivo: 'No existe consentimiento ACTIVO para este usuario con propósito "venta_datos_agregados". Dato RECHAZADO. No se importará ni procesará.',
      });
      rechazados++;
      continue;
    }

    // Validación 3: categoría en lista blanca (no especial)
    const categoria = item.categoria ?? null;
    if (categoria) {
      const catRow = await db
        .prepare(
          `SELECT categoria FROM categorias_permitidas WHERE categoria = ? AND es_especial = 0`
        )
        .bind(categoria)
        .first();

      if (!catRow) {
        resultados.push({
          indice: i,
          usuario_id: usuarioId,
          consentimiento_id: consentimientoId,
          estado: 'RECHAZADO',
          motivo: `Categoría "${categoria}" no está en la lista blanca o es categoría especial (art. 9 RGPD). Dato RECHAZADO.`,
        });
        rechazados++;
        continue;
      }
    }

    // Todo en orden: APROBADO
    resultados.push({
      indice: i,
      usuario_id: usuarioId,
      consentimiento_id: consentimientoId,
      estado: 'APROBADO',
      consentimiento: {
        proposito: consentRow.proposito,
        politica_version: consentRow.politica_version,
        otorgado_en: consentRow.otorgado_en,
      },
    });
    aprobados++;
  }

  await auditLog(
    db, actor, 'carga.validacion',
    'contribuciones', null,
    {
      total_enviados: items.length,
      aprobados,
      rechazados,
      nota: 'Los rechazados NO se importan. Sin consentimiento activo = rechazo automático.',
    },
    ipHash
  );

  return jsonResp({
    resumen: {
      total_enviados: items.length,
      aprobados,
      rechazados,
      tasa_rechazo_pct: items.length > 0
        ? Math.round((rechazados / items.length) * 100)
        : 0,
    },
    advertencia_rechazados: rechazados > 0
      ? `⚠ ${rechazados} filas RECHAZADAS por ausencia de consentimiento activo verificable. No se importarán ni procesarán bajo ningún concepto.`
      : null,
    declaracion_cumplimiento: 'NINGÚN dato sin consentimiento activo puede ser importado, procesado o vendido. Esta plataforma rechaza sistemáticamente los datos sin consentimiento verificable.',
    items: resultados,
  });
}

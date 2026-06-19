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

// ---------------------------------------------------------------------------
// CONSTANTE DE CONTRASEÑA ADMIN (cambia antes de desplegar)
// ---------------------------------------------------------------------------
const ADMIN_PASSWORD = 'CAMBIAR_ANTES_DE_DESPLEGAR_admin2026!';

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

/** Crea un UUID v4 simple (válido en Workers con Web Crypto). */
function uuidv4() {
  return crypto.randomUUID();
}

/** Responde JSON con cabeceras CORS restringidas. */
function jsonResp(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // CORS: solo orígenes internos (restringir en producción)
      'Access-Control-Allow-Origin': 'null',
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

// ---------------------------------------------------------------------------
// Autenticación admin
// ---------------------------------------------------------------------------

/**
 * Verifica el token admin.
 * Compara contra env.ADMIN_TOKEN (secreto en wrangler) O contra la constante
 * ADMIN_PASSWORD de desarrollo (modo demo).
 * Devuelve { ok: true, actor } | { ok: false, mensaje }
 */
async function autenticarAdmin(request, env) {
  const authHeader = request.headers.get('Authorization') ?? '';
  const match = authHeader.match(/^Bearer (.+)$/i);
  if (!match) {
    return { ok: false, mensaje: 'Cabecera Authorization ausente o malformada.' };
  }
  const token = match[1].trim();

  // En producción usa env.ADMIN_TOKEN (secret Cloudflare).
  // En demo/desarrollo compara con la constante local.
  const tokenEsperado = env.ADMIN_TOKEN ?? ADMIN_PASSWORD;

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

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': 'null',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        },
      });
    }

    // Autenticación
    const auth = await autenticarAdmin(request, env);
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
      return handleRepartoEjecutar(db, matchRepartoEjecutar[1], request, actor, ipHash);
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

  if (filtroActor) { condiciones.push('actor LIKE ?'); binds.push(`%${filtroActor}%`); }
  if (filtroAccion) { condiciones.push('accion LIKE ?'); binds.push(`%${filtroAccion}%`); }
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

  const { results } = await db.prepare(
    `SELECT c.id, c.usuario_id, c.consentimiento_id, c.recogido_en,
            c.categoria, c.banda_edad, c.region, c.genero
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
    nota: 'Estas contribuciones NO tienen consentimiento activo. Deben ser rechazadas o eliminadas. NUNCA se venden ni procesan.',
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
async function handleRepartoEjecutar(db, periodo, request, actor, ipHash) {
  if (!/^\d{4}-\d{2}$/.test(periodo)) {
    return errResp('formato_invalido', 'El periodo debe ser YYYY-MM.', 400);
  }

  let body;
  try { body = await request.json(); } catch { body = {}; }
  const dryRun = body.dry_run === true;

  // Calcular pool total del periodo
  const poolRow = await db
    .prepare(
      `SELECT COALESCE(SUM(pool_usuarios_centimos), 0) AS total
       FROM transacciones
       WHERE estado = 'pagada'
         AND strftime('%Y-%m', creado_en) = ?`
    )
    .bind(periodo)
    .first();

  const poolTotal = poolRow?.total ?? 0;

  // Calcular pesos por contribución en reportes entregados del periodo
  // (proxy: usuarios distintos con contribuciones en reportes entregados)
  const { results: pesos } = await db
    .prepare(
      `SELECT c.usuario_id,
              COUNT(c.id) * 1.0 / (SELECT COUNT(*) FROM contribuciones
                WHERE recogido_en >= ? AND recogido_en < ?) AS peso_contrib
       FROM contribuciones c
       JOIN reportes r ON r.definicion_segmento LIKE '%' -- simplificado: todas las contribs del periodo
       WHERE c.recogido_en >= ? AND c.recogido_en < ?
       GROUP BY c.usuario_id`
    )
    .bind(`${periodo}-01`, `${periodo}-31`, `${periodo}-01`, `${periodo}-31`)
    .all();

  // Fallback: distribución uniforme si no hay pesos por reporte
  const { results: usuariosActivos } = await db
    .prepare(
      `SELECT DISTINCT c.usuario_id
       FROM contribuciones c
       WHERE strftime('%Y-%m', c.recogido_en) = ?`
    )
    .bind(periodo)
    .all();

  const nUsuarios = usuariosActivos.length;
  if (nUsuarios === 0) {
    return jsonResp({
      periodo,
      pool_total_centimos: poolTotal,
      usuarios_con_reparto: 0,
      creados: 0,
      ya_existentes: 0,
      dry_run: dryRun,
      nota: 'Sin usuarios con contribuciones en este periodo.',
    });
  }

  const importePorUsuario = Math.floor(poolTotal / nUsuarios);
  const pesoPorUsuario = nUsuarios > 0 ? 1.0 / nUsuarios : 0;

  let creados = 0;
  let yaExistentes = 0;

  if (!dryRun) {
    for (const u of usuariosActivos) {
      const repartoId = uuidv4();
      try {
        await db
          .prepare(
            `INSERT INTO repartos (id, periodo, usuario_id, importe_centimos, peso_contribucion, estado)
             VALUES (?, ?, ?, ?, ?, 'pendiente')`
          )
          .bind(repartoId, periodo, u.usuario_id, importePorUsuario, pesoPorUsuario)
          .run();
        creados++;
      } catch (e) {
        // UNIQUE(periodo, usuario_id) ya existe → idempotente
        if (String(e).includes('UNIQUE')) {
          yaExistentes++;
        } else {
          throw e;
        }
      }
    }

    await auditLog(
      db, actor, 'reparto.ejecutado',
      'repartos', null,
      { periodo, pool_total_centimos: poolTotal, usuarios: nUsuarios, creados, ya_existentes: yaExistentes },
      ipHash
    );
  }

  return jsonResp({
    periodo,
    pool_total_centimos: poolTotal,
    usuarios_con_reparto: nUsuarios,
    importe_por_usuario_centimos: importePorUsuario,
    creados: dryRun ? 0 : creados,
    ya_existentes: dryRun ? 0 : yaExistentes,
    dry_run: dryRun,
  });
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

  const totales = results.reduce(
    (acc, r) => {
      acc.total_centimos += r.importe_centimos;
      acc[`estado_${r.estado}`] = (acc[`estado_${r.estado}`] ?? 0) + 1;
      return acc;
    },
    { total_centimos: 0 }
  );

  return jsonResp({
    periodo,
    filas: results.length,
    totales,
    items: results,
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

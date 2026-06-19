// ============================================================================
//  w-reportes — MOTOR DE REPORTES como Cloudflare Worker (consent-first, B2B)
//  --------------------------------------------------------------------------
//  Pieza LEGALMENTE CRÍTICA: un fallo aquí FILTRA DATOS PERSONALES.
//
//  Garantías que este Worker NUNCA puede romper:
//    - Solo entrega AGREGADOS con k-anonimato >= 50 (lo decide el MOTOR
//      `src/k-anonimato.mjs`; aquí NO se reimplementa la lógica de k-anon).
//    - Jamás devuelve filas individuales ni el campo `usuario_id`.
//    - Solo atiende a agencias con `kyc_estado='verificada'` y
//      `contrato_firmado_en` NO nulo (auth Bearer).
//    - SIEMPRE deja rastro en `logs_auditoria` (tanto la entrega como el
//      intento bloqueado), con `actor='agencia:<id>'`.
//    - SOLO consultas PARAMETRIZADAS de D1 (prepared statements). Nunca se
//      concatena SQL con datos de entrada.
//
//  Rutas (router por `/v1`):
//    GET  /v1/segmentos            -> segmentos disponibles (recuento solo si >=50)
//    POST /v1/segmentos/preview    -> ¿entregable? + n_usuarios, SIN datos
//    POST /v1/reportes            -> genera, persiste (reportes+R2), audita y entrega
//
//  Bindings esperados (wrangler.toml):
//    - env.PLATAFORMA_DB  (D1)   — tablas de db/schema.sql
//    - env.REPORTES       (R2)   — JSON del agregado entregado
//    - env.PRECIO_BASE_SEGMENTO_CENTIMOS (var, opcional; def. 49900)
//
//  Sin dependencias externas: runtime web estándar (fetch, Web Crypto).
// ============================================================================

import { generarReporteAgregado, K_MINIMO_LEGAL } from './k-anonimato.mjs';

// Precio por defecto si no llega de la config (céntimos). Es un PLACEHOLDER
// de negocio; en real lo fija KV «CONFIG» / wrangler.toml.
const PRECIO_BASE_DEFECTO_CENTIMOS = 49900;

// Dimensiones y categorías que se pueden usar para definir un segmento. Son
// EXACTAMENTE los cuasi-identificadores generalizados del esquema D1.
const DIMENSIONES_VALIDAS = ['region', 'banda_edad', 'genero'];

// ----------------------------------------------------------------------------
//  Utilidades de respuesta y error (formato uniforme del contrato)
// ----------------------------------------------------------------------------

/** Genera un UUID v4. Usa crypto.randomUUID si está; si no, derivación manual. */
function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  // Fallback determinista por entropía de Web Crypto (válido en Workers).
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0'));
  return `${h[0]}${h[1]}${h[2]}${h[3]}-${h[4]}${h[5]}-${h[6]}${h[7]}-${h[8]}${h[9]}-${h[10]}${h[11]}${h[12]}${h[13]}${h[14]}${h[15]}`;
}

/** Respuesta JSON con cabeceras seguras y, si se da, el X-Request-Id. */
function json(data, status = 200, requestId = null) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    // No cachear nunca respuestas con posibles agregados/recuentos.
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  };
  if (requestId) headers['X-Request-Id'] = requestId;
  return new Response(JSON.stringify(data), { status, headers });
}

/** Error con el formato uniforme del contrato (sección 0.2). */
function error(codigo, mensaje, status, requestId, detalles = {}) {
  return json({ error: { codigo, mensaje, request_id: requestId, detalles } }, status, requestId);
}

/**
 * Limitador de tasa por clave (anti-sondeo del catálogo/preview). Usa el KV
 * `env.RATE_LIMIT` si está disponible; si no hay binding, NO limita (no rompe
 * en local ni en tests). Ventana fija simple: suficiente para frenar el barrido.
 */
async function limitarTasa(env, clave, limite, ventanaSeg) {
  const kv = env && env.RATE_LIMIT;
  if (!kv || typeof kv.get !== 'function') return { ok: true };
  const k = `rl:${clave}`;
  const actual = Number(await kv.get(k)) || 0;
  if (actual >= limite) return { ok: false };
  await kv.put(k, String(actual + 1), { expirationTtl: ventanaSeg });
  return { ok: true };
}

/** SHA-256 en hex (Web Crypto). Se usa para resolver el token OPACO de agencia:
 *  el Bearer es un secreto y en BD solo vive su hash (jamás el token en claro). */
async function sha256Hex(mensaje) {
  const datos = new TextEncoder().encode(String(mensaje));
  const buf = await crypto.subtle.digest('SHA-256', datos);
  return [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** HMAC-SHA256 en hex (no repudio del resultado_hash). Si no hay secreto
 *  configurado, no firma (devuelve null): el motor ya aporta el FNV-1a. */
async function firmarHmac(secreto, mensaje) {
  if (!secreto) return null;
  const clave = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secreto),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const firma = await crypto.subtle.sign('HMAC', clave, new TextEncoder().encode(mensaje));
  return [...new Uint8Array(firma)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

// ----------------------------------------------------------------------------
//  Auditoría — SIEMPRE parametrizada. Nunca PII en `detalles`.
// ----------------------------------------------------------------------------

/**
 * Inserta una fila append-only en `logs_auditoria`.
 * @param {*} db  binding D1
 * @param {{actor,accion,entidad?,entidad_id?,detalles?,ip_hash?}} ev
 */
async function auditar(db, ev) {
  await db
    .prepare(
      `INSERT INTO logs_auditoria (actor, accion, entidad, entidad_id, detalles, ip_hash)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      ev.actor,
      ev.accion,
      ev.entidad ?? null,
      ev.entidad_id ?? null,
      ev.detalles != null ? JSON.stringify(ev.detalles) : null,
      ev.ip_hash ?? null,
    )
    .run();
}

// ----------------------------------------------------------------------------
//  Autenticación de agencia (Bearer) + verificación KYC/contrato
// ----------------------------------------------------------------------------

/** Extrae el token Bearer de la cabecera Authorization, o null. */
function leerBearer(request) {
  const cabecera = request.headers.get('Authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(cabecera.trim());
  return m ? m[1].trim() : null;
}

/**
 * Resuelve la agencia a partir del token OPACO y verifica que esté habilitada.
 *
 * Seguridad: el Bearer ya NO es el `agencia_id` (un identificador, no un secreto).
 * Es un SECRETO aleatorio del que en BD solo vive su hash. Aquí se calcula
 * `token_hash = sha256(bearer)` y se busca en `api_tokens` (revocado_en IS NULL);
 * de ahí sale el `agencia_id`. Después se sigue validando KYC + contrato igual
 * que antes, leyendo la agencia por su id. Así un identificador filtrado no abre
 * la puerta: hace falta el token secreto, que nunca se guarda en claro.
 *
 * Consultas SIEMPRE parametrizadas: ni el token ni su hash se concatenan al SQL.
 *
 * @returns {{ok:true, agencia}} | {ok:false, status, codigo, mensaje}
 */
async function autenticarAgencia(request, env) {
  const token = leerBearer(request);
  if (!token) {
    return { ok: false, status: 401, codigo: 'auth_invalida', mensaje: 'Falta cabecera Authorization: Bearer.' };
  }

  // El token es un secreto: lo resolvemos por su HASH, nunca por su texto.
  const tokenHash = await sha256Hex(token);
  const fila = await env.PLATAFORMA_DB.prepare(
    `SELECT id, agencia_id
       FROM api_tokens
      WHERE token_hash = ? AND revocado_en IS NULL`,
  )
    .bind(tokenHash)
    .first();

  if (!fila) {
    return { ok: false, status: 401, codigo: 'auth_invalida', mensaje: 'Credencial de agencia no válida.' };
  }

  // De aquí en adelante operamos con la agencia dueña del token.
  const agencia = await env.PLATAFORMA_DB.prepare(
    `SELECT id, razon_social, kyc_estado, contrato_firmado_en
       FROM agencias
      WHERE id = ?`,
  )
    .bind(fila.agencia_id)
    .first();

  if (!agencia) {
    return { ok: false, status: 401, codigo: 'auth_invalida', mensaje: 'Credencial de agencia no válida.' };
  }

  // Marca de último uso del token (telemetría/forense). Nunca tumba la petición.
  try {
    await env.PLATAFORMA_DB.prepare(
      `UPDATE api_tokens SET ultimo_uso_en = datetime('now') WHERE id = ?`,
    )
      .bind(fila.id)
      .run();
  } catch {
    /* el sello de último uso es best-effort */
  }

  // Puerta de autorización B2B: KYC verificada + contrato firmado (no nulo).
  if (agencia.kyc_estado !== 'verificada' || !agencia.contrato_firmado_en) {
    return {
      ok: false,
      status: 403,
      codigo: 'kyc_no_verificada',
      mensaje: 'La agencia debe tener KYC verificada y contrato firmado para operar.',
      agencia, // se devuelve para poder auditar el intento rechazado
    };
  }

  return { ok: true, agencia };
}

// ----------------------------------------------------------------------------
//  Validación de la definición de segmento (defensa en profundidad)
// ----------------------------------------------------------------------------

/**
 * Valida la forma de la `definicion` de segmento ANTES de tocar datos.
 * No reimplementa k-anon; solo evita campos prohibidos y formas inválidas.
 * @returns {{ok:true}} | {ok:false, codigo, mensaje, status}
 */
function validarDefinicion(def) {
  if (def == null || typeof def !== 'object' || Array.isArray(def)) {
    return { ok: false, status: 400, codigo: 'cuasi_identificador_invalido', mensaje: 'definicion debe ser un objeto.' };
  }

  const filtros = def.filtros ?? {};
  if (typeof filtros !== 'object' || Array.isArray(filtros)) {
    return { ok: false, status: 400, codigo: 'cuasi_identificador_invalido', mensaje: 'filtros debe ser un objeto.' };
  }

  // Campos admitidos en filtros: los cuasi-identificadores + categoria.
  const camposFiltroValidos = new Set([...DIMENSIONES_VALIDAS, 'categoria']);
  for (const campo of Object.keys(filtros)) {
    if (!camposFiltroValidos.has(campo)) {
      return {
        ok: false,
        status: 422,
        codigo: 'cuasi_identificador_invalido',
        mensaje: `Filtro no permitido: '${campo}'. Solo: ${[...camposFiltroValidos].join(', ')}.`,
      };
    }
  }

  // Dimensiones de desglose: solo cuasi-identificadores (no 'categoria', no PII).
  const dimensiones = def.dimensiones ?? [];
  if (!Array.isArray(dimensiones)) {
    return { ok: false, status: 400, codigo: 'cuasi_identificador_invalido', mensaje: 'dimensiones debe ser un array.' };
  }
  for (const d of dimensiones) {
    if (!DIMENSIONES_VALIDAS.includes(d)) {
      return {
        ok: false,
        status: 422,
        codigo: 'cuasi_identificador_invalido',
        mensaje: `Dimensión no permitida: '${d}'. Solo: ${DIMENSIONES_VALIDAS.join(', ')}.`,
      };
    }
  }

  // Métrica (opcional): solo 'valor' es numérica agregable en el esquema.
  if (def.metrica != null && def.metrica !== 'valor') {
    return {
      ok: false,
      status: 422,
      codigo: 'cuasi_identificador_invalido',
      mensaje: "La única métrica agregable es 'valor'.",
    };
  }

  return { ok: true };
}

/** Comprueba que la categoría del filtro (si la hay) está en la lista blanca. */
async function categoriaPermitida(db, filtros) {
  const cat = filtros?.categoria;
  if (cat == null) return { ok: true };
  const fila = await db.prepare(`SELECT 1 AS ok FROM categorias_permitidas WHERE categoria = ?`).bind(cat).first();
  if (!fila) {
    return {
      ok: false,
      status: 422,
      codigo: 'categoria_no_permitida',
      mensaje: `Categoría fuera de la lista blanca: '${cat}'.`,
    };
  }
  return { ok: true };
}

// ----------------------------------------------------------------------------
//  Acceso a datos — SIEMPRE prepared statements
// ----------------------------------------------------------------------------

/**
 * Carga las contribuciones SEUDÓNIMAS del segmento. Aplica los filtros en SQL
 * de forma PARAMETRIZADA (nunca concatenando). Devuelve solo los campos que el
 * motor necesita; el `usuario_id` se usa para CONTAR usuarios distintos y nunca
 * sale en la respuesta.
 */
async function cargarContribuciones(db, filtros) {
  const condiciones = [];
  const valores = [];
  // Solo permitimos filtrar por columnas conocidas (lista cerrada). El nombre
  // de columna nunca viene del usuario: se elige de este conjunto fijo.
  const columnas = { region: 'region', banda_edad: 'banda_edad', genero: 'genero', categoria: 'categoria' };
  for (const [campo, valor] of Object.entries(filtros || {})) {
    const col = columnas[campo];
    if (!col) continue; // ya validado antes; defensa extra
    if (Array.isArray(valor)) {
      if (valor.length === 0) continue;
      condiciones.push(`${col} IN (${valor.map(() => '?').join(', ')})`);
      valores.push(...valor);
    } else {
      condiciones.push(`${col} = ?`);
      valores.push(valor);
    }
  }
  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const sql = `SELECT usuario_id, region, banda_edad, genero, categoria, valor
                 FROM contribuciones ${where}`;
  const stmt = valores.length ? db.prepare(sql).bind(...valores) : db.prepare(sql);
  const res = await stmt.all();
  return res.results || [];
}

// ----------------------------------------------------------------------------
//  Handlers de cada ruta
// ----------------------------------------------------------------------------

/**
 * GET /v1/segmentos
 * Dimensiones y categorías para construir segmentos. Para cada categoría
 * devuelve su nº de usuarios SOLO si >= K_MINIMO_LEGAL; jamás expone una
 * categoría con < 50 usuarios (ni siquiera con su recuento).
 */
async function handlerCatalogo(request, env, requestId) {
  const auth = await autenticarAgencia(request, env);
  if (!auth.ok) {
    if (auth.agencia) {
      await auditar(env.PLATAFORMA_DB, {
        actor: `agencia:${auth.agencia.id}`,
        accion: 'catalogo.bloqueado',
        entidad: 'agencias',
        entidad_id: auth.agencia.id,
        detalles: { motivo: auth.codigo },
      });
    }
    return error(auth.codigo, auth.mensaje, auth.status, requestId);
  }

  // Anti-sondeo: limitamos también la frecuencia del catálogo por agencia.
  const rlCat = await limitarTasa(env, `catalogo:${auth.agencia.id}`, 120, 60);
  if (!rlCat.ok) return error('demasiadas_peticiones', 'Demasiadas peticiones; inténtalo más tarde.', 429, requestId);

  // Lista blanca de categorías (categoria + descripcion). es_especial nunca se expone.
  const cats = await env.PLATAFORMA_DB.prepare(
    `SELECT categoria, descripcion FROM categorias_permitidas ORDER BY categoria`,
  ).all();

  // Recuento de usuarios DISTINTOS por categoría (en SQL, sin traer filas).
  const recuentos = await env.PLATAFORMA_DB.prepare(
    `SELECT categoria, COUNT(DISTINCT usuario_id) AS n
       FROM contribuciones
      WHERE categoria IS NOT NULL
      GROUP BY categoria`,
  ).all();
  const mapaN = new Map((recuentos.results || []).map((r) => [r.categoria, Number(r.n)]));

  const categorias = (cats.results || []).map((c) => {
    const n = mapaN.get(c.categoria) || 0;
    const fila = { categoria: c.categoria, descripcion: c.descripcion };
    // SOLO se expone el recuento si alcanza el suelo legal. Si no, se marca
    // 'no_disponible' SIN número (no se filtra que hay, p.ej., 12).
    if (n >= K_MINIMO_LEGAL) {
      fila.n_usuarios = n;
      fila.disponible = true;
    } else {
      fila.disponible = false; // segmento con <50 -> jamás se muestra el conteo
    }
    return fila;
  });

  return json(
    {
      dimensiones: DIMENSIONES_VALIDAS,
      categorias,
      valores_ejemplo: {
        region: ['Madrid', 'Cataluña', 'Andalucía', 'Comunidad Valenciana', 'Galicia'],
        banda_edad: ['18-24', '25-34', '35-44', '45-54', '55-64', '65+'],
        genero: ['F', 'M', 'X'],
      },
      k_minimo_legal: K_MINIMO_LEGAL,
    },
    200,
    requestId,
  );
}

/**
 * POST /v1/segmentos/preview
 * Dice si el segmento sería ENTREGABLE (n >= 50) y el nº de usuarios, SIN
 * generar ni devolver dato agregado alguno. Réplica de la puerta dura del motor.
 */
async function handlerPreview(request, env, requestId) {
  const auth = await autenticarAgencia(request, env);
  if (!auth.ok) {
    if (auth.agencia) {
      await auditar(env.PLATAFORMA_DB, {
        actor: `agencia:${auth.agencia.id}`,
        accion: 'segmento.preview.bloqueado',
        entidad: 'agencias',
        entidad_id: auth.agencia.id,
        detalles: { motivo: auth.codigo },
      });
    }
    return error(auth.codigo, auth.mensaje, auth.status, requestId);
  }
  const agencia = auth.agencia;

  // Anti-sondeo: el preview es gratis y repetible -> limitamos su frecuencia.
  const rl = await limitarTasa(env, `preview:${agencia.id}`, 60, 60);
  if (!rl.ok) return error('demasiadas_peticiones', 'Límite de previsualizaciones alcanzado; inténtalo más tarde.', 429, requestId);

  let cuerpo;
  try {
    cuerpo = await request.json();
  } catch {
    return error('peticion_invalida', 'Cuerpo JSON inválido.', 400, requestId);
  }
  const definicion = cuerpo?.definicion ?? {};

  const v = validarDefinicion(definicion);
  if (!v.ok) return error(v.codigo, v.mensaje, v.status, requestId);

  const cat = await categoriaPermitida(env.PLATAFORMA_DB, definicion.filtros);
  if (!cat.ok) return error(cat.codigo, cat.mensaje, cat.status, requestId);

  const contribuciones = await cargarContribuciones(env.PLATAFORMA_DB, definicion.filtros);
  // El MOTOR es la autoridad: replicamos su puerta llamándolo. No contamos a mano.
  const r = generarReporteAgregado(contribuciones, definicion, { k: K_MINIMO_LEGAL });

  // Auditamos el preview (anti-sondeo). Sin datos de celdas en `detalles`.
  await auditar(env.PLATAFORMA_DB, {
    actor: `agencia:${agencia.id}`,
    accion: 'segmento.preview',
    entidad: 'agencias',
    entidad_id: agencia.id,
    detalles: { entregable: r.entregable, n_usuarios: r.auditoria.n_usuarios_segmento },
  });

  if (!r.entregable) {
    // PRIVACIDAD: solo el recuento del segmento TOTAL (lo usa la propia puerta),
    // nunca recuentos por celda.
    return json(
      { entregable: false, motivo: r.motivo, n_usuarios: r.auditoria.n_usuarios_segmento },
      200,
      requestId,
    );
  }

  // Entregable: estimaciones SIN valores (cuántas celdas saldrían/se suprimirían).
  // ANTI-SONDEO: el preview es gratis y repetible. Si devolviéramos el n EXACTO,
  // una agencia podría afinar filtros y deducir recuentos finos (incluso de celdas
  // suprimidas) por diferencias. Por eso el preview SOLO expone un tamaño BINADO:
  // n_usuarios_min = floor(n/50)*50 (múltiplo de 50, nunca el valor exacto) y una
  // etiqueta «≥N». El n EXACTO solo aparece en el reporte YA COMPRADO (F.2).
  const nExacto = r.reporte.n_usuarios;
  const nUsuariosMin = Math.floor(nExacto / 50) * 50;
  return json(
    {
      entregable: true,
      n_usuarios_min: nUsuariosMin,
      n_usuarios_etiqueta: `≥${nUsuariosMin}`,
      k_aplicado: r.reporte.k_aplicado,
      celdas_estimadas_entregables: r.reporte.celdas.length,
      celdas_estimadas_suprimidas: r.reporte.celdas_suprimidas,
      precio_estimado_centimos: precioSegmento(env),
    },
    200,
    requestId,
  );
}

/** Precio del segmento (céntimos). PLACEHOLDER de negocio. */
function precioSegmento(env) {
  const v = Number(env?.PRECIO_BASE_SEGMENTO_CENTIMOS);
  return Number.isFinite(v) && v >= 0 ? v : PRECIO_BASE_DEFECTO_CENTIMOS;
}

/**
 * Reparto 70/30 que CUADRA al céntimo (mismo criterio que w-pagos y el CHECK del
 * esquema): la comisión de plataforma se redondea y el pool es el RESTO exacto, de
 * modo que comision + pool == importe SIEMPRE. Se calcula aquí (sin importar
 * w-pagos) para NO crear un import circular: w-pagos importa a w-reportes, nunca al
 * revés.
 */
function reparto7030(importeCentimos) {
  const importe = Number(importeCentimos);
  const comision = Math.round(importe * 0.70);
  const pool = importe - comision; // resto exacto
  return { comision_plataforma_centimos: comision, pool_usuarios_centimos: pool };
}

/**
 * POST /v1/reportes  (contrato F.1) — INICIA la compra (no entrega dato alguno).
 *   1. Autentica la agencia (token opaco + KYC + contrato).
 *   2. Valida definición y categoría (lista blanca).
 *   3. Carga contribuciones de D1 y llama al MOTOR para REVALIDAR k>=50.
 *      Un segmento de < 50 se rechaza AQUÍ (422) y jamás llega a comprarse.
 *   4. Entregable -> fija n_usuarios (>=50) y k=50, inserta `reportes` en estado
 *      'pendiente_pago' (resultado_hash placeholder; se firma al materializar),
 *      registra la `transacciones` 70/30 en estado 'pendiente' y devuelve los
 *      datos de pago. NO se ejecuta el k-anon final ni se entrega nada todavía.
 *
 * La GENERACIÓN real (k-anon + persistencia del resultado + R2 + auditoría
 * 'reporte.generado') vive en materializarReporte(), que dispara el webhook de
 * pago una vez confirmado el cobro. NUNCA se entrega un reporte sin pago.
 */
async function handlerIniciarCompra(request, env, requestId) {
  const auth = await autenticarAgencia(request, env);
  if (!auth.ok) {
    // Si conocemos la agencia (existe pero sin KYC/contrato), auditamos el rechazo.
    if (auth.agencia) {
      await auditar(env.PLATAFORMA_DB, {
        actor: `agencia:${auth.agencia.id}`,
        accion: 'reporte.bloqueado',
        entidad: 'agencias',
        entidad_id: auth.agencia.id,
        detalles: { motivo: auth.codigo },
      });
    }
    return error(auth.codigo, auth.mensaje, auth.status, requestId);
  }
  const agencia = auth.agencia;

  let cuerpo;
  try {
    cuerpo = await request.json();
  } catch {
    return error('peticion_invalida', 'Cuerpo JSON inválido.', 400, requestId);
  }

  // Se acepta `definicion_segmento` (contrato F.1) o `definicion` (forma del motor).
  const definicion = cuerpo?.definicion_segmento ?? cuerpo?.definicion ?? {};

  const v = validarDefinicion(definicion);
  if (!v.ok) return error(v.codigo, v.mensaje, v.status, requestId);

  const cat = await categoriaPermitida(env.PLATAFORMA_DB, definicion.filtros);
  if (!cat.ok) return error(cat.codigo, cat.mensaje, cat.status, requestId);

  // 3) Cargar contribuciones seudónimas del segmento y REVALIDAR con el MOTOR.
  //    Aquí solo nos interesa la PUERTA DURA (n>=50): no se entrega ni un agregado.
  const contribuciones = await cargarContribuciones(env.PLATAFORMA_DB, definicion.filtros);
  const r = generarReporteAgregado(contribuciones, definicion, { k: K_MINIMO_LEGAL });

  // 3a) NO entregable -> 422 + auditoría del intento bloqueado. No se inicia compra.
  if (!r.entregable) {
    await auditar(env.PLATAFORMA_DB, {
      actor: `agencia:${agencia.id}`,
      accion: 'reporte.bloqueado',
      entidad: 'reportes',
      entidad_id: null,
      detalles: {
        motivo: r.motivo,
        n_usuarios: r.auditoria.n_usuarios_segmento,
        k_aplicado: r.auditoria.k_aplicado,
        resultado_hash: r.auditoria.resultado_hash,
      },
    });
    return error('segmento_no_entregable', r.motivo, 422, requestId, {
      n_usuarios: r.auditoria.n_usuarios_segmento,
    });
  }

  // 4) Entregable. Fijamos n (>=50) y k=50 AHORA (se persisten en la fila); el
  //    agregado real se genera tras el pago (materializarReporte).
  const reporteId = uuid();
  const nUsuarios = r.reporte.n_usuarios; // >= 50 garantizado por la puerta
  const kAplicado = r.reporte.k_aplicado; // = 50
  const precioCentimos = precioSegmento(env);
  const definicionJson = JSON.stringify(definicion);

  // INSERT del reporte en 'pendiente_pago'. resultado_hash es NOT NULL en el
  // esquema: usamos un placeholder ('pendiente') que se reemplaza al materializar.
  try {
    await env.PLATAFORMA_DB.prepare(
      `INSERT INTO reportes
         (id, agencia_id, definicion_segmento, k_aplicado, n_usuarios, resultado_hash, precio_centimos, estado)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pendiente_pago')`,
    )
      .bind(reporteId, agencia.id, definicionJson, kAplicado, nUsuarios, 'pendiente', precioCentimos)
      .run();
  } catch (e) {
    // P.ej. el CHECK de BD (n>=50/k>=50) vetó la fila (doble barrera). Auditar y 500.
    await auditar(env.PLATAFORMA_DB, {
      actor: `agencia:${agencia.id}`,
      accion: 'reporte.bloqueado',
      entidad: 'reportes',
      entidad_id: reporteId,
      detalles: { motivo: 'rechazo_persistencia', error: String(e && e.message ? e.message : e) },
    });
    return error('error_interno', 'No se pudo iniciar la compra del reporte.', 500, requestId);
  }

  // Registrar la transacción 70/30 en estado 'pendiente' (el cobro lo confirma el
  // webhook de Stripe; aquí solo se deja la referencia con el reparto que cuadra).
  const transaccionId = uuid();
  const { comision_plataforma_centimos, pool_usuarios_centimos } = reparto7030(precioCentimos);
  try {
    await env.PLATAFORMA_DB.prepare(
      `INSERT INTO transacciones
         (id, agencia_id, reporte_id, importe_centimos,
          comision_plataforma_centimos, pool_usuarios_centimos, estado)
       VALUES (?, ?, ?, ?, ?, ?, 'pendiente')`,
    )
      .bind(transaccionId, agencia.id, reporteId, precioCentimos, comision_plataforma_centimos, pool_usuarios_centimos)
      .run();
  } catch (e) {
    await auditar(env.PLATAFORMA_DB, {
      actor: `agencia:${agencia.id}`,
      accion: 'transaccion.error_insert',
      entidad: 'transacciones',
      entidad_id: transaccionId,
      detalles: { reporte_id: reporteId, error: String(e && e.message ? e.message : e) },
    });
    return error('error_interno', 'No se pudo registrar la transacción.', 500, requestId);
  }

  // Auditoría del inicio de compra (sin datos del agregado: aún no existe).
  await auditar(env.PLATAFORMA_DB, {
    actor: `agencia:${agencia.id}`,
    accion: 'reporte.compra_iniciada',
    entidad: 'reportes',
    entidad_id: reporteId,
    detalles: { n_usuarios: nUsuarios, k_aplicado: kAplicado, precio_centimos: precioCentimos, transaccion_id: transaccionId },
  });

  // 201 Creado: referencias de seguimiento + datos de pago. NINGÚN agregado.
  return json(
    {
      reporte_id: reporteId,
      estado: 'pendiente_pago',
      precio_centimos: precioCentimos,
      transaccion_id: transaccionId,
    },
    201,
    requestId,
  );
}

/**
 * materializarReporte(env, reporteId)  (contrato F.3 — interno, NO ruta pública)
 * --------------------------------------------------------------------------
 * Lo dispara el webhook de Stripe TRAS confirmar el cobro de la transacción. Aquí
 * es donde por fin se EJECUTA el motor y se ENTREGA el agregado:
 *   1. Carga el reporte 'pendiente_pago'/'pagado_generando' (idempotente: si ya
 *      está 'entregado', no rehace nada).
 *   2. Marca 'pagado_generando'.
 *   3. Carga contribuciones del segmento y llama al MOTOR (k-anon >= 50).
 *      Si dejó de ser entregable -> 'anulado' + auditoría (la transacción la
 *      reembolsa el flujo de pagos).
 *   4. Firma HMAC, persiste el resultado (resultado_hash real + estado 'entregado'),
 *      sube el JSON a R2 «REPORTES» y audita 'reporte.generado'.
 *
 * Garantía: el JSON entregado NUNCA contiene `usuario_id` ni filas individuales.
 *
 * @returns {Promise<{ok:true, estado:'entregado', reporte_id}>
 *                  | {ok:false, estado:'anulado'|'no_encontrado'|'ya_entregado'|'error', motivo?}>}
 */
export async function materializarReporte(env, reporteId) {
  const db = env.PLATAFORMA_DB;

  const rep = await db
    .prepare(
      `SELECT id, agencia_id, definicion_segmento, estado FROM reportes WHERE id = ?`,
    )
    .bind(reporteId)
    .first();

  if (!rep) {
    return { ok: false, estado: 'no_encontrado', reporte_id: reporteId };
  }
  // Idempotencia: si ya se entregó, no se vuelve a generar ni a tocar R2.
  if (rep.estado === 'entregado') {
    return { ok: true, estado: 'entregado', reporte_id: reporteId, idempotente: true };
  }
  if (rep.estado === 'anulado') {
    return { ok: false, estado: 'anulado', reporte_id: reporteId };
  }

  let definicion;
  try {
    definicion = JSON.parse(rep.definicion_segmento);
  } catch {
    definicion = {};
  }

  // Marcar 'pagado_generando' antes de calcular (estado visible en F.2).
  await db
    .prepare(`UPDATE reportes SET estado = 'pagado_generando' WHERE id = ? AND estado <> 'entregado'`)
    .bind(reporteId)
    .run();

  // Cargar contribuciones del segmento y ejecutar el MOTOR (autoridad de k-anon).
  const contribuciones = await cargarContribuciones(db, definicion.filtros);
  const r = generarReporteAgregado(contribuciones, definicion, { k: K_MINIMO_LEGAL });

  // Si dejó de ser entregable (el segmento cambió entre compra y pago) -> anular.
  if (!r.entregable) {
    await db.prepare(`UPDATE reportes SET estado = 'anulado' WHERE id = ?`).bind(reporteId).run();
    await auditar(db, {
      actor: `agencia:${rep.agencia_id}`,
      accion: 'reporte.no_entregable',
      entidad: 'reportes',
      entidad_id: reporteId,
      detalles: { motivo: r.motivo, n_usuarios: r.auditoria.n_usuarios_segmento },
    });
    return { ok: false, estado: 'anulado', reporte_id: reporteId, motivo: r.motivo };
  }

  // Firmar el resultado_hash del motor con HMAC del servidor (no repudio).
  const hmac = await firmarHmac(env.HMAC_REPORTE, `${reporteId}:${r.reporte.resultado_hash}`);
  const resultadoHash = hmac ? `${r.reporte.resultado_hash}.${hmac}` : r.reporte.resultado_hash;

  // Cuerpo entregado/guardado: SOLO agregados (espejo de la salida del motor).
  const resultado = {
    reporte_id: reporteId,
    agencia_id: rep.agencia_id,
    k_aplicado: r.reporte.k_aplicado,
    n_usuarios: r.reporte.n_usuarios,
    generado_en: r.auditoria.generado_en,
    resultado_hash: resultadoHash,
    definicion_segmento: definicion,
    resultado: {
      celdas: r.reporte.celdas, // cada celda: dims + n_usuarios (>=50) + media_<metrica>
      celdas_suprimidas: r.reporte.celdas_suprimidas,
    },
  };

  // BLINDAJE FINAL: jamás guardar/entregar nada que contenga 'usuario_id'.
  const serializado = JSON.stringify(resultado);
  if (serializado.includes('usuario_id')) {
    await auditar(db, {
      actor: `agencia:${rep.agencia_id}`,
      accion: 'reporte.abortado_fuga',
      entidad: 'reportes',
      entidad_id: reporteId,
      detalles: { motivo: 'salida contiene usuario_id' },
    });
    // No marcamos 'entregado': queda 'pagado_generando' (recuperable) y no se filtra nada.
    return { ok: false, estado: 'error', reporte_id: reporteId, motivo: 'fuga_usuario_id' };
  }

  // Persistir el resultado: hash real + estado 'entregado' (la BD ya validó n/k>=50
  // al insertar la fila). Subir el JSON a R2.
  await db
    .prepare(
      `UPDATE reportes SET resultado_hash = ?, estado = 'entregado', generado_en = datetime('now') WHERE id = ?`,
    )
    .bind(resultadoHash, reporteId)
    .run();

  if (env.REPORTES && typeof env.REPORTES.put === 'function') {
    await env.REPORTES.put(`reportes/${reporteId}.json`, serializado, {
      httpMetadata: { contentType: 'application/json; charset=utf-8' },
    });
  }

  // Auditoría OBLIGATORIA de la entrega (siempre, con resultado_hash).
  await auditar(db, {
    actor: `agencia:${rep.agencia_id}`,
    accion: 'reporte.generado',
    entidad: 'reportes',
    entidad_id: reporteId,
    detalles: {
      k_aplicado: r.reporte.k_aplicado,
      n_usuarios: r.reporte.n_usuarios,
      celdas_entregadas: r.reporte.celdas.length,
      celdas_suprimidas: r.reporte.celdas_suprimidas,
      resultado_hash: resultadoHash,
    },
  });

  return { ok: true, estado: 'entregado', reporte_id: reporteId };
}

/**
 * GET /v1/reportes/{id}  (contrato F.2) — estado + entrega del agregado.
 *   - Solo a la AGENCIA DUEÑA del reporte (si no, 404: ni se confirma su existencia).
 *   - 'entregado' -> devuelve el agregado (leído de R2) + metadatos.
 *   - otros estados -> solo el estado (pendiente_pago / pagado_generando / anulado).
 * NUNCA expone `usuario_id` ni filas individuales (el agregado ya viene del motor).
 */
async function handlerObtenerReporte(request, env, requestId, reporteId) {
  const auth = await autenticarAgencia(request, env);
  if (!auth.ok) {
    if (auth.agencia) {
      await auditar(env.PLATAFORMA_DB, {
        actor: `agencia:${auth.agencia.id}`,
        accion: 'reporte.consulta_bloqueada',
        entidad: 'agencias',
        entidad_id: auth.agencia.id,
        detalles: { motivo: auth.codigo },
      });
    }
    return error(auth.codigo, auth.mensaje, auth.status, requestId);
  }
  const agencia = auth.agencia;

  const rep = await env.PLATAFORMA_DB.prepare(
    `SELECT id, agencia_id, definicion_segmento, k_aplicado, n_usuarios,
            generado_en, resultado_hash, estado
       FROM reportes WHERE id = ?`,
  )
    .bind(reporteId)
    .first();

  // No existe o NO es de esta agencia -> 404 (no se distingue, evita enumeración).
  if (!rep || rep.agencia_id !== agencia.id) {
    return error('no_encontrado', 'Reporte no encontrado.', 404, requestId);
  }

  // Aún sin entregar: solo el estado (mapea pendiente_pago/pagado_generando/anulado).
  if (rep.estado !== 'entregado') {
    const estado = rep.estado === 'anulado' ? 'no_entregable' : rep.estado;
    const salida = { reporte_id: rep.id, estado };
    if (rep.estado === 'anulado') salida.motivo = 'segmento dejó de ser entregable (k<50)';
    return json(salida, 200, requestId);
  }

  // Entregado: el agregado vive en R2. El reporte YA COMPRADO sí muestra el n EXACTO.
  let cuerpoR2 = null;
  if (env.REPORTES && typeof env.REPORTES.get === 'function') {
    const obj = await env.REPORTES.get(`reportes/${rep.id}.json`);
    if (obj) {
      try {
        cuerpoR2 = JSON.parse(await obj.text());
      } catch {
        cuerpoR2 = null;
      }
    }
  }

  let definicion;
  try {
    definicion = JSON.parse(rep.definicion_segmento);
  } catch {
    definicion = {};
  }

  return json(
    {
      reporte_id: rep.id,
      estado: 'entregado',
      k_aplicado: rep.k_aplicado,
      n_usuarios: rep.n_usuarios,
      generado_en: rep.generado_en,
      resultado_hash: rep.resultado_hash,
      definicion_segmento: definicion,
      resultado: cuerpoR2 ? cuerpoR2.resultado : null,
    },
    200,
    requestId,
  );
}

// ----------------------------------------------------------------------------
//  Router /v1
// ----------------------------------------------------------------------------

/** Despacha la petición a su handler según método + ruta. */
async function enrutar(request, env, requestId) {
  const url = new URL(request.url);
  const ruta = url.pathname.replace(/\/+$/, '') || '/'; // sin barra final
  const metodo = request.method.toUpperCase();

  if (ruta === '/v1/segmentos' && metodo === 'GET') return handlerCatalogo(request, env, requestId);
  if (ruta === '/v1/segmentos/preview' && metodo === 'POST') return handlerPreview(request, env, requestId);
  if (ruta === '/v1/reportes' && metodo === 'POST') return handlerIniciarCompra(request, env, requestId);

  // GET /v1/reportes/{id} (F.2): estado + entrega del agregado a la agencia dueña.
  const mReporte = /^\/v1\/reportes\/([^/]+)$/.exec(ruta);
  if (mReporte) {
    if (metodo === 'GET') return handlerObtenerReporte(request, env, requestId, decodeURIComponent(mReporte[1]));
    return error('metodo_no_permitido', `Método ${metodo} no permitido en ${ruta}.`, 405, requestId);
  }

  // Ruta conocida pero método incorrecto -> 405; si no, 404.
  const rutasConocidas = {
    '/v1/segmentos': ['GET'],
    '/v1/segmentos/preview': ['POST'],
    '/v1/reportes': ['POST'],
  };
  if (rutasConocidas[ruta]) {
    return error('metodo_no_permitido', `Método ${metodo} no permitido en ${ruta}.`, 405, requestId);
  }
  return error('no_encontrado', 'Ruta no encontrada.', 404, requestId);
}

// ----------------------------------------------------------------------------
//  Entry point del Worker
// ----------------------------------------------------------------------------

export default {
  async fetch(request, env /*, ctx */) {
    // X-Request-Id de entrada o uno nuevo (trazabilidad de toda la petición).
    const requestId = request.headers.get('X-Request-Id') || uuid();
    try {
      return await enrutar(request, env, requestId);
    } catch (e) {
      // Nunca filtramos detalles internos al cliente. Intentamos auditar.
      try {
        await auditar(env.PLATAFORMA_DB, {
          actor: 'sistema',
          accion: 'error.no_controlado',
          detalles: { error: String(e && e.message ? e.message : e) },
        });
      } catch {
        /* si ni siquiera se puede auditar, no enmascaramos con otro fallo */
      }
      return error('error_interno', 'Error interno del servidor.', 500, requestId);
    }
  },
};

// Exportes nombrados para pruebas unitarias (no afectan al runtime del Worker).
// materializarReporte se exporta arriba (la usa el webhook de w-pagos tras el cobro).
export { enrutar, autenticarAgencia, validarDefinicion, cargarContribuciones, auditar, sha256Hex };

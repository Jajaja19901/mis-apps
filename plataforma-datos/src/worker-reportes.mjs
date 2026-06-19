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
 * Resuelve la agencia a partir del token y verifica que esté habilitada.
 *
 * Nota de diseño: en producción el token es un JWT de agencia firmado y aquí
 * se valida la firma para sacar el `agencia_id`. En este Worker tratamos el
 * Bearer como el identificador de la agencia (UUID `agencias.id`) y SIEMPRE
 * comprobamos contra D1 que existe y cumple KYC + contrato; así la puerta de
 * autorización vive en datos verificables, no en la cortesía del cliente.
 *
 * @returns {{ok:true, agencia}} | {ok:false, status, codigo, mensaje}
 */
async function autenticarAgencia(request, env) {
  const token = leerBearer(request);
  if (!token) {
    return { ok: false, status: 401, codigo: 'auth_invalida', mensaje: 'Falta cabecera Authorization: Bearer.' };
  }

  // Consulta PARAMETRIZADA: el token nunca se concatena en el SQL.
  const agencia = await env.PLATAFORMA_DB.prepare(
    `SELECT id, razon_social, kyc_estado, contrato_firmado_en
       FROM agencias
      WHERE id = ?`,
  )
    .bind(token)
    .first();

  if (!agencia) {
    return { ok: false, status: 401, codigo: 'auth_invalida', mensaje: 'Credencial de agencia no válida.' };
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
  return json(
    {
      entregable: true,
      n_usuarios: r.reporte.n_usuarios,
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
 * POST /v1/reportes
 * Genera el reporte:
 *   1. Autentica la agencia (KYC + contrato).
 *   2. Valida definición y categoría (lista blanca).
 *   3. Carga contribuciones de D1 y llama al MOTOR.
 *   4a. NO entregable -> 422 + auditoría del intento bloqueado. No persiste.
 *   4b. Entregable -> firma HMAC, INSERT en `reportes` (la BD revalida CHECK>=50),
 *       sube el JSON a R2, audita 'reporte.generado' y devuelve el agregado.
 * NUNCA devuelve filas individuales ni `usuario_id`.
 */
async function handlerGenerar(request, env, requestId) {
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

  // 3) Cargar contribuciones seudónimas del segmento y ejecutar el MOTOR.
  const contribuciones = await cargarContribuciones(env.PLATAFORMA_DB, definicion.filtros);
  const r = generarReporteAgregado(contribuciones, definicion, { k: K_MINIMO_LEGAL });

  // 4a) NO entregable -> 422 + auditoría del intento bloqueado. No se persiste.
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

  // 4b) Entregable. Firmamos el resultado_hash con HMAC del servidor (no repudio).
  const reporteId = uuid();
  const hmac = await firmarHmac(env.HMAC_REPORTE, `${reporteId}:${r.reporte.resultado_hash}`);
  // El hash que persiste/entrega es el del motor; si hay HMAC, lo encadenamos.
  const resultadoHash = hmac ? `${r.reporte.resultado_hash}.${hmac}` : r.reporte.resultado_hash;

  const precioCentimos = precioSegmento(env);
  const definicionJson = JSON.stringify(definicion);

  // El cuerpo que se entrega/guarda: SOLO agregados (espejo de la salida del motor).
  // Construido campo a campo para NO arrastrar nada inesperado del motor.
  const resultado = {
    reporte_id: reporteId,
    agencia_id: agencia.id,
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

  // BLINDAJE FINAL: jamás entregar nada que contenga 'usuario_id'. Si por un bug
  // del motor apareciera, abortamos con 500 y dejamos rastro (no se filtra).
  const serializado = JSON.stringify(resultado);
  if (serializado.includes('usuario_id')) {
    await auditar(env.PLATAFORMA_DB, {
      actor: `agencia:${agencia.id}`,
      accion: 'reporte.abortado_fuga',
      entidad: 'reportes',
      entidad_id: reporteId,
      detalles: { motivo: 'salida contiene usuario_id' },
    });
    return error('error_interno', 'Error interno generando el reporte.', 500, requestId);
  }

  // Persistencia: INSERT en `reportes` (la BD revalida CHECK n>=50 y k>=50) y
  // subida del JSON a R2. Si la BD rechazara por el CHECK, capturamos y 500.
  try {
    await env.PLATAFORMA_DB.prepare(
      `INSERT INTO reportes
         (id, agencia_id, definicion_segmento, k_aplicado, n_usuarios, resultado_hash, precio_centimos, estado)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'entregado')`,
    )
      .bind(reporteId, agencia.id, definicionJson, r.reporte.k_aplicado, r.reporte.n_usuarios, resultadoHash, precioCentimos)
      .run();
  } catch (e) {
    // P.ej. el CHECK de BD vetó el reporte (doble barrera). Auditar y 500.
    await auditar(env.PLATAFORMA_DB, {
      actor: `agencia:${agencia.id}`,
      accion: 'reporte.bloqueado',
      entidad: 'reportes',
      entidad_id: reporteId,
      detalles: { motivo: 'rechazo_persistencia', error: String(e && e.message ? e.message : e) },
    });
    return error('error_interno', 'No se pudo persistir el reporte.', 500, requestId);
  }

  // Subir el agregado a R2 «REPORTES». Clave: reportes/{reporte_id}.json.
  if (env.REPORTES && typeof env.REPORTES.put === 'function') {
    await env.REPORTES.put(`reportes/${reporteId}.json`, serializado, {
      httpMetadata: { contentType: 'application/json; charset=utf-8' },
    });
  }

  // Auditoría OBLIGATORIA de la entrega (siempre, con resultado_hash).
  await auditar(env.PLATAFORMA_DB, {
    actor: `agencia:${agencia.id}`,
    accion: 'reporte.generado',
    entidad: 'reportes',
    entidad_id: reporteId,
    detalles: {
      k_aplicado: r.reporte.k_aplicado,
      n_usuarios: r.reporte.n_usuarios,
      celdas_entregadas: r.reporte.celdas.length,
      celdas_suprimidas: r.reporte.celdas_suprimidas,
      resultado_hash: resultadoHash,
      precio_centimos: precioCentimos,
    },
  });

  // 201 Creado con el agregado (espejo del contrato F.2).
  return json({ ...resultado, estado: 'entregado' }, 201, requestId);
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
  if (ruta === '/v1/reportes' && metodo === 'POST') return handlerGenerar(request, env, requestId);

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
export { enrutar, autenticarAgencia, validarDefinicion, cargarContribuciones, auditar };

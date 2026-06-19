// ============================================================================
//  w-ingesta — WORKER DE INGESTA consent-first (Cloudflare Worker, router /v1)
//  --------------------------------------------------------------------------
//  Pieza LEGALMENTE CRÍTICA: aquí se HACE CUMPLIR el consentimiento. Es la
//  puerta de entrada de los datos del usuario y la ventanilla de sus derechos
//  (RGPD arts. 7, 15, 17, 20). Un fallo aquí mete datos SIN base legal o
//  bloquea un derecho del interesado.
//
//  Garantías que este Worker NUNCA puede romper:
//    - Una contribución SOLO se acepta si existe un consentimiento ACTIVO
//      (`proposito='venta_datos_agregados'`, `revocado_en IS NULL`) del PROPIO
//      usuario. Se valida en código Y la BD lo vuelve a exigir con el trigger
//      `trg_contrib_consent_valido` (última barrera). Si el INSERT aborta -> 422.
//    - NUNCA se almacena PII directa: ni fecha de nacimiento, ni dirección, ni
//      texto libre identificable. Solo cuasi-identificadores YA generalizados
//      (banda_edad, region, genero) + categoria de la LISTA BLANCA + valor.
//    - Las categorías especiales del art. 9 quedan fuera por diseño (lista
//      blanca `categorias_permitidas`, con CHECK es_especial = 0 en el esquema).
//    - La IP NUNCA se guarda en claro: se almacena `ip_hash = SHA-256(ip‖PEPPER)`.
//    - Revocar es tan fácil como otorgar (art. 7.3): un POST sin cuerpo basta.
//    - SIEMPRE deja rastro en `logs_auditoria`, SIN PII innecesaria en detalles.
//    - SOLO consultas PARAMETRIZADAS de D1 (.bind). Jamás se concatena SQL con
//      datos de entrada.
//
//  Rutas (router por `/v1`):
//    POST   /v1/consentimientos                  -> alta del consentimiento de venta
//    POST   /v1/consentimientos/{id}/confirmar   -> doble opt-in (simulado)
//    POST   /v1/consentimientos/{id}/revocar     -> revocación (art. 7.3)
//    POST   /v1/contribuciones                   -> alta de contribución seudónima
//    GET    /v1/yo                               -> acceso (art. 15)
//    POST   /v1/yo/portabilidad                  -> portabilidad (art. 20)
//    DELETE /v1/yo                               -> supresión (art. 17)
//
//  Autenticación (app de consumo):
//    Bearer = `usuarios.id` (seudónimo), validado SIEMPRE contra D1.
//    >>> EN PRODUCCIÓN el Bearer sería un TOKEN DE SESIÓN FIRMADO (JWT/PASETO)
//    >>> del que se extrae el `usuario_id` tras verificar la firma; además, los
//    >>> derechos arts. 15/17/20 exigirían REAUTENTICACIÓN (enlace firmado de un
//    >>> solo uso / doble opt-in), tal y como dice el contrato (sección C). Aquí
//    >>> tratamos el Bearer como el id seudónimo y comprobamos contra la BD que
//    >>> el usuario existe y está activo: la puerta vive en datos verificables,
//    >>> no en la cortesía del cliente.
//
//  Bindings esperados (wrangler.toml):
//    - env.PLATAFORMA_DB  (D1)   — tablas de db/schema.sql
//    - env.PEPPER_PII     (var/secret) — pimienta para el hash de IP (obligatoria
//                                  para hashear; sin ella NO se guarda ip_hash)
//    - env.RATE_LIMIT     (KV, opcional) — anti-abuso por token/IP
//
//  Sin dependencias externas: runtime web estándar (fetch, Web Crypto).
// ============================================================================

// Propósito ÚNICO que gobierna este Worker. Debe coincidir EXACTAMENTE con el
// que exige el trigger `trg_contrib_consent_valido` del esquema.
const PROPOSITO_VENTA = 'venta_datos_agregados';

// Cuasi-identificadores generalizados admitidos (idénticos al esquema D1).
// Cualquier OTRO campo en una contribución se considera intento de colar PII.
const CAMPOS_CONTRIB_PERMITIDOS = new Set([
  'usuario_id',
  'consentimiento_id',
  'banda_edad',
  'region',
  'genero',
  'categoria',
  'valor',
]);

// Campos PROHIBIDOS de forma explícita (lista negra de PII directa): si llegan,
// se rechaza de inmediato. La lista blanca de arriba ya los excluiría, pero
// nombrarlos da un error claro y deja constancia de la intención.
const CAMPOS_PII_PROHIBIDOS = [
  'fecha_nacimiento',
  'fecha_de_nacimiento',
  'nacimiento',
  'edad', // edad EXACTA (solo se admite banda_edad generalizada)
  'direccion',
  'dirección',
  'calle',
  'cp',
  'codigo_postal',
  'nombre',
  'apellidos',
  'apellido',
  'email',
  'correo',
  'telefono',
  'teléfono',
  'movil',
  'móvil',
  'dni',
  'nif',
  'pasaporte',
  'ip',
  'texto',
  'texto_libre',
  'comentario',
  'comentarios',
  'observaciones',
  'notas',
];

// Bandas de edad y géneros admitidos (formas GENERALIZADAS válidas). Se valida
// la FORMA para que no se cuele una edad exacta disfrazada de banda.
const BANDAS_EDAD_VALIDAS = new Set(['18-24', '25-34', '35-44', '45-54', '55-64', '65+']);
const GENEROS_VALIDOS = new Set(['F', 'M', 'X']);

// ----------------------------------------------------------------------------
//  Utilidades de respuesta y error (formato uniforme del contrato, sección 0.2)
// ----------------------------------------------------------------------------

/** Genera un UUID v4. Usa crypto.randomUUID si está; si no, derivación manual. */
function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
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
    // Nunca cachear: estas respuestas llevan datos personales del usuario.
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

/** Calcula SHA-256 de un texto y lo devuelve en hex. */
async function sha256hex(texto) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Hash de IP con pimienta (PEPPER) — evidencia del consentimiento sin guardar la
 * IP en claro. Sin `ip` o sin `pepper` devuelve null (NO se inventa un hash, y
 * jamás se almacena la IP cruda). Nunca lanza.
 */
async function hashIp(ip, pepper) {
  if (!ip || !pepper) return null;
  try {
    return await sha256hex(ip + pepper);
  } catch {
    return null;
  }
}

/** Extrae la IP de origen de las cabeceras habituales de Cloudflare. */
function ipDe(request) {
  return (
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Forwarded-For') ||
    null
  );
}

/**
 * Limitador de tasa por clave (anti-abuso). Usa el KV `env.RATE_LIMIT` si está;
 * si no hay binding, NO limita (no rompe en local ni en tests). Ventana fija.
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

// ----------------------------------------------------------------------------
//  Auditoría — SIEMPRE parametrizada. Nunca PII innecesaria en `detalles`.
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
//  Autenticación del usuario (Bearer = usuarios.id seudónimo) contra D1
// ----------------------------------------------------------------------------

/** Extrae el token Bearer de la cabecera Authorization, o null. */
function leerBearer(request) {
  const cabecera = request.headers.get('Authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(cabecera.trim());
  return m ? m[1].trim() : null;
}

/**
 * Resuelve al usuario a partir del token y comprueba que existe y está activo.
 *
 * >>> PRODUCCIÓN: el Bearer sería un token de SESIÓN FIRMADO; aquí se verificaría
 * >>> la firma y se extraería el `usuario_id`. En este Worker tratamos el Bearer
 * >>> como el id seudónimo (`usuarios.id`) y SIEMPRE comprobamos contra D1, de
 * >>> forma PARAMETRIZADA, que existe y `estado='activo'`. Así nadie opera por
 * >>> otro usuario, ni sobre una cuenta ya dada de baja.
 *
 * @returns {{ok:true, usuario}} | {ok:false, status, codigo, mensaje}
 */
async function autenticarUsuario(request, env) {
  const token = leerBearer(request);
  if (!token) {
    return { ok: false, status: 401, codigo: 'auth_invalida', mensaje: 'Falta cabecera Authorization: Bearer.' };
  }

  // Consulta PARAMETRIZADA: el token nunca se concatena en el SQL.
  const usuario = await env.PLATAFORMA_DB.prepare(
    `SELECT id, creado_en, estado, payout_estado
       FROM usuarios
      WHERE id = ?`,
  )
    .bind(token)
    .first();

  if (!usuario) {
    return { ok: false, status: 401, codigo: 'auth_invalida', mensaje: 'Credencial de usuario no válida.' };
  }
  if (usuario.estado !== 'activo') {
    // El usuario está de baja (art. 17 ya ejercido): no se opera sobre él.
    return { ok: false, status: 401, codigo: 'auth_invalida', mensaje: 'La cuenta no está activa.' };
  }

  return { ok: true, usuario };
}

// ----------------------------------------------------------------------------
//  Validaciones de contribución (defensa en profundidad ANTES de tocar la BD)
// ----------------------------------------------------------------------------

/** Comprueba que la categoría existe en la LISTA BLANCA `categorias_permitidas`. */
async function categoriaPermitida(db, categoria) {
  if (categoria == null || categoria === '') {
    return { ok: false, status: 422, codigo: 'categoria_no_permitida', mensaje: 'Falta la categoría.' };
  }
  const fila = await db
    .prepare(`SELECT 1 AS ok FROM categorias_permitidas WHERE categoria = ?`)
    .bind(categoria)
    .first();
  if (!fila) {
    return {
      ok: false,
      status: 422,
      codigo: 'categoria_no_permitida',
      mensaje: `Categoría fuera de la lista blanca: '${categoria}'.`,
    };
  }
  return { ok: true };
}

/**
 * Valida la FORMA de una contribución: rechaza cualquier campo PII directo y
 * exige que los cuasi-identificadores estén GENERALIZADOS (banda/región/género).
 * No toca la BD; es la primera barrera (la última es el trigger).
 * @returns {{ok:true}} | {ok:false, status, codigo, mensaje}
 */
function validarFormaContribucion(cuerpo) {
  if (cuerpo == null || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) {
    return { ok: false, status: 400, codigo: 'peticion_invalida', mensaje: 'El cuerpo debe ser un objeto JSON.' };
  }

  // 1) NINGÚN campo de PII directa, ni siquiera vacío. Bloqueo explícito.
  for (const prohibido of CAMPOS_PII_PROHIBIDOS) {
    if (prohibido in cuerpo) {
      return {
        ok: false,
        status: 422,
        codigo: 'cuasi_identificador_invalido',
        mensaje: `Campo no admitido (dato personal directo): '${prohibido}'. Solo se aceptan cuasi-identificadores generalizados.`,
      };
    }
  }

  // 2) Solo se admiten los campos de la LISTA BLANCA. Cualquier extra -> rechazo
  //    (evita colar PII con un nombre de campo arbitrario).
  for (const campo of Object.keys(cuerpo)) {
    if (!CAMPOS_CONTRIB_PERMITIDOS.has(campo)) {
      return {
        ok: false,
        status: 422,
        codigo: 'cuasi_identificador_invalido',
        mensaje: `Campo no permitido: '${campo}'. Campos válidos: ${[...CAMPOS_CONTRIB_PERMITIDOS].join(', ')}.`,
      };
    }
  }

  // 3) consentimiento_id obligatorio (la contribución DEBE ligarse a uno).
  if (!cuerpo.consentimiento_id || typeof cuerpo.consentimiento_id !== 'string') {
    return { ok: false, status: 400, codigo: 'peticion_invalida', mensaje: 'Falta consentimiento_id.' };
  }

  // 4) Cuasi-identificadores GENERALIZADOS (si vienen, deben tener forma válida).
  if (cuerpo.banda_edad != null && !BANDAS_EDAD_VALIDAS.has(cuerpo.banda_edad)) {
    return {
      ok: false,
      status: 422,
      codigo: 'cuasi_identificador_invalido',
      mensaje: `banda_edad no normalizada: '${cuerpo.banda_edad}'. Use una de: ${[...BANDAS_EDAD_VALIDAS].join(', ')}.`,
    };
  }
  if (cuerpo.genero != null && !GENEROS_VALIDOS.has(cuerpo.genero)) {
    return {
      ok: false,
      status: 422,
      codigo: 'cuasi_identificador_invalido',
      mensaje: `genero no normalizado: '${cuerpo.genero}'. Use uno de: ${[...GENEROS_VALIDOS].join(', ')}.`,
    };
  }
  // region: cadena corta (provincia/CCAA), nunca una dirección con números/comas.
  if (cuerpo.region != null) {
    if (typeof cuerpo.region !== 'string' || cuerpo.region.length > 60 || /[\d,#]/.test(cuerpo.region)) {
      return {
        ok: false,
        status: 422,
        codigo: 'cuasi_identificador_invalido',
        mensaje: 'region debe ser una provincia/CCAA generalizada (sin números ni señas de dirección).',
      };
    }
  }
  // valor: numérico finito (atributo agregable). No admite texto libre.
  if (cuerpo.valor != null && (typeof cuerpo.valor !== 'number' || !Number.isFinite(cuerpo.valor))) {
    return { ok: false, status: 422, codigo: 'cuasi_identificador_invalido', mensaje: 'valor debe ser numérico.' };
  }

  return { ok: true };
}

// ----------------------------------------------------------------------------
//  B.1 — POST /v1/consentimientos  (alta del consentimiento de venta)
// ----------------------------------------------------------------------------

/**
 * Da de alta el consentimiento de venta de datos agregados. Guarda como EVIDENCIA
 * `politica_version`, `texto_hash` (SHA-256 del texto EXACTO mostrado), `metodo`,
 * `ip_hash` (HASH, nunca IP en claro) y `user_agent`. El ledger es append-only.
 *
 * Doble opt-in: si el método lo requiere (o el cliente pide `doble_opt_in:true`),
 * el consentimiento nace `metodo='doble_opt_in'` y queda pendiente de confirmar
 * vía B.1bis. Modelamos "pendiente de confirmación" SIN una columna nueva (el
 * esquema es el contrato y NO se toca): mientras esté pendiente, `revocado_en`
 * NO es NULL —apunta a un centinela en el futuro— de modo que el trigger lo trata
 * como NO activo y NINGUNA contribución se admite hasta confirmar. Al confirmar
 * (B.1bis) se pone `revocado_en = NULL` y el consentimiento pasa a ACTIVO.
 *   >>> En producción esto sería una columna `estado` propia o el envío real del
 *   >>> correo de confirmación; aquí se SIMULA con el centinela y se comenta.
 */
async function handlerAltaConsentimiento(request, env, requestId) {
  const auth = await autenticarUsuario(request, env);
  if (!auth.ok) return error(auth.codigo, auth.mensaje, auth.status, requestId);
  const usuario = auth.usuario;

  let cuerpo;
  try {
    cuerpo = await request.json();
  } catch {
    return error('peticion_invalida', 'Cuerpo JSON inválido.', 400, requestId);
  }

  // Este Worker SOLO gestiona el propósito de venta de datos agregados.
  const proposito = cuerpo?.proposito ?? PROPOSITO_VENTA;
  if (proposito !== PROPOSITO_VENTA) {
    return error(
      'proposito_no_soportado',
      `Este endpoint solo gestiona el propósito '${PROPOSITO_VENTA}'.`,
      422,
      requestId,
    );
  }
  // El esquema exige CHECK (proposito <> '') — defensa redundante.
  if (proposito === '') {
    return error('peticion_invalida', 'proposito no puede estar vacío.', 400, requestId);
  }

  const politicaVersion = cuerpo?.politica_version;
  const textoMostrado = cuerpo?.texto_mostrado;
  if (!politicaVersion || typeof politicaVersion !== 'string') {
    return error('peticion_invalida', 'Falta politica_version.', 400, requestId);
  }
  if (!textoMostrado || typeof textoMostrado !== 'string') {
    return error('peticion_invalida', 'Falta texto_mostrado (para calcular el texto_hash de la evidencia).', 400, requestId);
  }

  // El SERVIDOR deriva el hash del texto exacto y el hash de la IP. El cliente
  // NUNCA envía hashes ni IP en claro al ledger.
  const textoHash = await sha256hex(textoMostrado);
  const ipHash = await hashIp(ipDe(request), env?.PEPPER_PII);
  const userAgent = request.headers.get('User-Agent') || null;

  // ¿Doble opt-in? Pendiente de confirmación si se pide explícitamente o el
  // método ya es 'doble_opt_in'.
  const metodoPedido = typeof cuerpo?.metodo === 'string' && cuerpo.metodo ? cuerpo.metodo : 'web_checkbox';
  const dobleOptIn = cuerpo?.doble_opt_in === true || metodoPedido === 'doble_opt_in';
  const metodo = dobleOptIn ? 'doble_opt_in' : metodoPedido;
  // Centinela de "pendiente": una fecha en el futuro (no NULL) hace que el
  // trigger lo trate como NO activo hasta confirmar. Ver comentario del handler.
  const SENTINELA_PENDIENTE = '9999-12-31T00:00:00Z';
  const revocadoEn = dobleOptIn ? SENTINELA_PENDIENTE : null;

  // Idempotencia simple del contrato (B.1): si ya hay un consentimiento ACTIVO
  // idéntico (mismo usuario+propósito+versión, no revocado), se devuelve el
  // vigente en vez de duplicar el ledger.
  const vigente = await env.PLATAFORMA_DB.prepare(
    `SELECT id, proposito, politica_version, otorgado_en, revocado_en
       FROM consentimientos
      WHERE usuario_id = ? AND proposito = ? AND politica_version = ? AND revocado_en IS NULL`,
  )
    .bind(usuario.id, proposito, politicaVersion)
    .first();
  if (vigente && !dobleOptIn) {
    return json(
      {
        id: vigente.id,
        usuario_id: usuario.id,
        proposito: vigente.proposito,
        politica_version: vigente.politica_version,
        otorgado_en: vigente.otorgado_en,
        revocado_en: vigente.revocado_en ?? null,
        ya_existia: true,
      },
      200,
      requestId,
    );
  }

  const id = uuid();
  // INSERT PARAMETRIZADO. otorgado_en lo pone la BD (DEFAULT datetime('now')).
  await env.PLATAFORMA_DB.prepare(
    `INSERT INTO consentimientos
       (id, usuario_id, proposito, politica_version, texto_hash, metodo, ip_hash, user_agent, revocado_en)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, usuario.id, proposito, politicaVersion, textoHash, metodo, ipHash, userAgent, revocadoEn)
    .run();

  // Auditoría: SIN PII (no guardamos el texto, solo su hash y la versión).
  await auditar(env.PLATAFORMA_DB, {
    actor: `usuario:${usuario.id}`,
    accion: 'consent.otorgado',
    entidad: 'consentimientos',
    entidad_id: id,
    detalles: {
      proposito,
      politica_version: politicaVersion,
      metodo,
      pendiente_confirmacion: dobleOptIn,
    },
    ip_hash: ipHash,
  });

  return json(
    {
      id,
      usuario_id: usuario.id,
      proposito,
      politica_version: politicaVersion,
      otorgado_en: new Date().toISOString(),
      // Mientras esté pendiente, el consentimiento NO está activo (revocado_en != NULL).
      revocado_en: revocadoEn,
      estado: dobleOptIn ? 'pendiente_confirmacion' : 'activo',
    },
    201,
    requestId,
  );
}

// ----------------------------------------------------------------------------
//  B.1bis — POST /v1/consentimientos/{id}/confirmar  (doble opt-in, SIMULADO)
// ----------------------------------------------------------------------------

/**
 * Confirma un consentimiento que nació 'pendiente_confirmacion' (doble opt-in).
 * SIMULADO: en producción el usuario llegaría aquí desde un enlace firmado de un
 * solo uso enviado por email (verificación real del segundo factor). Aquí basta
 * con autenticarse como el propio usuario. Al confirmar, ponemos `revocado_en =
 * NULL`: el consentimiento pasa a ACTIVO y el trigger ya admite contribuciones.
 */
async function handlerConfirmarConsentimiento(request, env, requestId, consentId) {
  const auth = await autenticarUsuario(request, env);
  if (!auth.ok) return error(auth.codigo, auth.mensaje, auth.status, requestId);
  const usuario = auth.usuario;

  const SENTINELA_PENDIENTE = '9999-12-31T00:00:00Z';

  const fila = await env.PLATAFORMA_DB.prepare(
    `SELECT id, usuario_id, revocado_en FROM consentimientos WHERE id = ? AND usuario_id = ?`,
  )
    .bind(consentId, usuario.id)
    .first();
  if (!fila) {
    return error('consentimiento_inexistente', 'El consentimiento no existe o no es del usuario.', 404, requestId);
  }
  // Solo se confirma lo que está PENDIENTE (centinela). Si ya está activo (NULL)
  // o revocado de verdad, no aplica.
  if (fila.revocado_en !== SENTINELA_PENDIENTE) {
    return error('estado_invalido', 'El consentimiento no está pendiente de confirmación.', 409, requestId);
  }

  await env.PLATAFORMA_DB.prepare(
    `UPDATE consentimientos SET revocado_en = NULL WHERE id = ? AND usuario_id = ? AND revocado_en = ?`,
  )
    .bind(consentId, usuario.id, SENTINELA_PENDIENTE)
    .run();

  await auditar(env.PLATAFORMA_DB, {
    actor: `usuario:${usuario.id}`,
    accion: 'consent.confirmado',
    entidad: 'consentimientos',
    entidad_id: consentId,
    detalles: { proposito: PROPOSITO_VENTA },
    ip_hash: await hashIp(ipDe(request), env?.PEPPER_PII),
  });

  return json({ id: consentId, estado: 'activo', revocado_en: null }, 200, requestId);
}

// ----------------------------------------------------------------------------
//  B.3 — POST /v1/consentimientos/{id}/revocar  (art. 7.3)
// ----------------------------------------------------------------------------

/**
 * Revoca el consentimiento: `revocado_en = now`. Revocar es TAN FÁCIL como
 * otorgar (art. 7.3): basta un POST sin cuerpo. Tras esto, el trigger
 * `trg_contrib_consent_valido` impide nuevas contribuciones con ese
 * consentimiento. NO borra las contribuciones ya agregadas (son anónimas).
 */
async function handlerRevocarConsentimiento(request, env, requestId, consentId) {
  const auth = await autenticarUsuario(request, env);
  if (!auth.ok) return error(auth.codigo, auth.mensaje, auth.status, requestId);
  const usuario = auth.usuario;

  const SENTINELA_PENDIENTE = '9999-12-31T00:00:00Z';

  // Debe existir y ser del PROPIO usuario (no se revoca lo ajeno).
  const fila = await env.PLATAFORMA_DB.prepare(
    `SELECT id, usuario_id, revocado_en FROM consentimientos WHERE id = ? AND usuario_id = ?`,
  )
    .bind(consentId, usuario.id)
    .first();
  if (!fila) {
    return error('consentimiento_inexistente', 'El consentimiento no existe o no es del usuario.', 404, requestId);
  }
  // Ya revocado de verdad (no el centinela de "pendiente") -> 409.
  if (fila.revocado_en != null && fila.revocado_en !== SENTINELA_PENDIENTE) {
    return error('consentimiento_ya_revocado', 'El consentimiento ya estaba revocado.', 409, requestId);
  }

  const ahora = new Date().toISOString();
  // UPDATE PARAMETRIZADO. Marca la fecha de revocación (ledger: no se borra).
  await env.PLATAFORMA_DB.prepare(
    `UPDATE consentimientos SET revocado_en = ? WHERE id = ? AND usuario_id = ?`,
  )
    .bind(ahora, consentId, usuario.id)
    .run();

  await auditar(env.PLATAFORMA_DB, {
    actor: `usuario:${usuario.id}`,
    accion: 'consent.revocado',
    entidad: 'consentimientos',
    entidad_id: consentId,
    detalles: { proposito: PROPOSITO_VENTA },
    ip_hash: await hashIp(ipDe(request), env?.PEPPER_PII),
  });

  return json({ id: consentId, revocado_en: ahora, estado: 'revocado' }, 200, requestId);
}

// ----------------------------------------------------------------------------
//  A.1 — POST /v1/contribuciones  (alta de contribución seudónima)
// ----------------------------------------------------------------------------

/**
 * Inserta una contribución SEUDÓNIMA con cuasi-identificadores YA generalizados.
 * Doble barrera de consentimiento:
 *   1) Validación en CÓDIGO: el consentimiento debe ser del propio usuario,
 *      ACTIVO (revocado_en IS NULL) y del propósito de venta.
 *   2) El trigger `trg_contrib_consent_valido` es la ÚLTIMA barrera: si el INSERT
 *      aborta (consentimiento revocado/ajeno/pendiente) -> respondemos 422.
 * Rechaza categorías fuera de la lista blanca y CUALQUIER campo de PII directa.
 */
async function handlerCrearContribucion(request, env, requestId) {
  const auth = await autenticarUsuario(request, env);
  if (!auth.ok) return error(auth.codigo, auth.mensaje, auth.status, requestId);
  const usuario = auth.usuario;

  let cuerpo;
  try {
    cuerpo = await request.json();
  } catch {
    return error('peticion_invalida', 'Cuerpo JSON inválido.', 400, requestId);
  }

  // 1) Forma: rechaza PII directa y exige cuasi-identificadores generalizados.
  const forma = validarFormaContribucion(cuerpo);
  if (!forma.ok) {
    // Auditamos el intento de colar un campo no permitido (sin volcar su valor).
    await auditar(env.PLATAFORMA_DB, {
      actor: `usuario:${usuario.id}`,
      accion: 'contribucion.rechazada',
      entidad: 'contribuciones',
      entidad_id: null,
      detalles: { motivo: forma.codigo },
    });
    return error(forma.codigo, forma.mensaje, forma.status, requestId);
  }

  // 2) Categoría en la LISTA BLANCA (nunca categorías especiales del art. 9).
  const cat = await categoriaPermitida(env.PLATAFORMA_DB, cuerpo.categoria);
  if (!cat.ok) {
    await auditar(env.PLATAFORMA_DB, {
      actor: `usuario:${usuario.id}`,
      accion: 'contribucion.rechazada',
      entidad: 'contribuciones',
      entidad_id: null,
      detalles: { motivo: cat.codigo },
    });
    return error(cat.codigo, cat.mensaje, cat.status, requestId);
  }

  // 3) Validación en CÓDIGO del consentimiento ACTIVO del PROPIO usuario.
  //    (El trigger lo revalidará; esto da un error claro y evita tocar la tabla
  //     si ya sabemos que no hay base legal.)
  const consentId = cuerpo.consentimiento_id;
  const consent = await env.PLATAFORMA_DB.prepare(
    `SELECT id FROM consentimientos
      WHERE id = ? AND usuario_id = ? AND revocado_en IS NULL AND proposito = ?`,
  )
    .bind(consentId, usuario.id, PROPOSITO_VENTA)
    .first();
  if (!consent) {
    await auditar(env.PLATAFORMA_DB, {
      actor: `usuario:${usuario.id}`,
      accion: 'contribucion.rechazada',
      entidad: 'contribuciones',
      entidad_id: null,
      detalles: { motivo: 'consentimiento_inexistente' },
    });
    return error(
      'consentimiento_inexistente',
      'No hay consentimiento ACTIVO de venta para este usuario, o no es suyo.',
      422,
      requestId,
    );
  }

  // 4) INSERT PARAMETRIZADO. El trigger es la ÚLTIMA barrera: si abortara (p.ej.
  //    una revocación entre el SELECT y el INSERT), capturamos y devolvemos 422.
  const id = uuid();
  try {
    await env.PLATAFORMA_DB.prepare(
      `INSERT INTO contribuciones
         (id, usuario_id, consentimiento_id, banda_edad, region, genero, categoria, valor)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        usuario.id,
        consentId,
        cuerpo.banda_edad ?? null,
        cuerpo.region ?? null,
        cuerpo.genero ?? null,
        cuerpo.categoria,
        cuerpo.valor ?? null,
      )
      .run();
  } catch (e) {
    // El trigger trg_contrib_consent_valido abortó (RAISE(ABORT, ...)). Es la
    // garantía a nivel de BD: respondemos 422 y dejamos rastro (sin PII).
    await auditar(env.PLATAFORMA_DB, {
      actor: `usuario:${usuario.id}`,
      accion: 'contribucion.rechazada',
      entidad: 'contribuciones',
      entidad_id: null,
      detalles: { motivo: 'trigger_consent', error: String(e && e.message ? e.message : e) },
    });
    return error(
      'consentimiento_inexistente',
      'La base de datos rechazó la contribución: no hay consentimiento ACTIVO del usuario.',
      422,
      requestId,
    );
  }

  // Auditoría de la contribución creada (sin volcar el `valor` ni señas).
  await auditar(env.PLATAFORMA_DB, {
    actor: `usuario:${usuario.id}`,
    accion: 'contribucion.creada',
    entidad: 'contribuciones',
    entidad_id: id,
    detalles: { categoria: cuerpo.categoria, consentimiento_id: consentId },
    ip_hash: await hashIp(ipDe(request), env?.PEPPER_PII),
  });

  return json({ id, recogido_en: new Date().toISOString(), categoria: cuerpo.categoria }, 201, requestId);
}

// ----------------------------------------------------------------------------
//  C.1 — GET /v1/yo  (acceso, art. 15)
// ----------------------------------------------------------------------------

/**
 * Devuelve los datos del PROPIO usuario: su ficha, sus consentimientos y un
 * RESUMEN de sus contribuciones (no se vuelcan filas de otros usuarios; aquí ni
 * siquiera hace falta volcar cada contribución, basta el resumen del contrato A.3
 * + el detalle propio). Solo lectura.
 */
async function handlerYoAcceso(request, env, requestId) {
  const auth = await autenticarUsuario(request, env);
  if (!auth.ok) return error(auth.codigo, auth.mensaje, auth.status, requestId);
  const usuario = auth.usuario;

  // Contacto (email_hash; nunca el email en claro). Puede no existir.
  const contacto = await env.PLATAFORMA_DB.prepare(
    `SELECT email_hash, email_cifrado FROM usuarios_contacto WHERE usuario_id = ?`,
  )
    .bind(usuario.id)
    .first();

  // Consentimientos del usuario (activos y revocados).
  const consents = await env.PLATAFORMA_DB.prepare(
    `SELECT id, proposito, politica_version, metodo, otorgado_en, revocado_en
       FROM consentimientos WHERE usuario_id = ? ORDER BY otorgado_en`,
  )
    .bind(usuario.id)
    .all();

  // Resumen agregado de SUS contribuciones (total y por categoría).
  const porCat = await env.PLATAFORMA_DB.prepare(
    `SELECT categoria, COUNT(*) AS n FROM contribuciones WHERE usuario_id = ? GROUP BY categoria`,
  )
    .bind(usuario.id)
    .all();
  const porCategoria = {};
  let total = 0;
  for (const r of porCat.results || []) {
    const n = Number(r.n) || 0;
    porCategoria[r.categoria ?? 'sin_categoria'] = n;
    total += n;
  }

  await auditar(env.PLATAFORMA_DB, {
    actor: `usuario:${usuario.id}`,
    accion: 'derecho.acceso',
    entidad: 'usuarios',
    entidad_id: usuario.id,
    detalles: { total_contribuciones: total },
    ip_hash: await hashIp(ipDe(request), env?.PEPPER_PII),
  });

  return json(
    {
      usuario: {
        id: usuario.id,
        creado_en: usuario.creado_en,
        estado: usuario.estado,
        payout_estado: usuario.payout_estado,
      },
      contacto: contacto
        ? { email_hash: contacto.email_hash ?? null, email_presente: contacto.email_cifrado != null }
        : { email_hash: null, email_presente: false },
      consentimientos: (consents.results || []).map((c) => ({
        id: c.id,
        proposito: c.proposito,
        politica_version: c.politica_version,
        metodo: c.metodo,
        otorgado_en: c.otorgado_en,
        revocado_en: c.revocado_en ?? null,
      })),
      contribuciones_resumen: { total, por_categoria: porCategoria },
    },
    200,
    requestId,
  );
}

// ----------------------------------------------------------------------------
//  C.2 — POST /v1/yo/portabilidad  (portabilidad, art. 20)
// ----------------------------------------------------------------------------

/**
 * Export ESTRUCTURADO y portable (JSON) de TODOS los datos del propio usuario.
 * El contrato (C.2) encola el proceso pesado a R2; aquí, como el volumen por
 * usuario es pequeño, devolvemos el JSON al instante (formato legible por
 * máquina, art. 20). Incluye el DETALLE de sus contribuciones (son suyas).
 */
async function handlerYoPortabilidad(request, env, requestId) {
  const auth = await autenticarUsuario(request, env);
  if (!auth.ok) return error(auth.codigo, auth.mensaje, auth.status, requestId);
  const usuario = auth.usuario;

  const contacto = await env.PLATAFORMA_DB.prepare(
    `SELECT email_hash, email_cifrado FROM usuarios_contacto WHERE usuario_id = ?`,
  )
    .bind(usuario.id)
    .first();

  const consents = await env.PLATAFORMA_DB.prepare(
    `SELECT id, proposito, politica_version, metodo, otorgado_en, revocado_en
       FROM consentimientos WHERE usuario_id = ? ORDER BY otorgado_en`,
  )
    .bind(usuario.id)
    .all();

  // En portabilidad SÍ se vuelca el detalle de las contribuciones (del usuario).
  const contribs = await env.PLATAFORMA_DB.prepare(
    `SELECT id, consentimiento_id, recogido_en, banda_edad, region, genero, categoria, valor
       FROM contribuciones WHERE usuario_id = ? ORDER BY recogido_en`,
  )
    .bind(usuario.id)
    .all();

  // Repartos del usuario (data dividend), si los hubiera.
  const repartos = await env.PLATAFORMA_DB.prepare(
    `SELECT periodo, importe_centimos, estado FROM repartos WHERE usuario_id = ? ORDER BY periodo`,
  )
    .bind(usuario.id)
    .all();

  await auditar(env.PLATAFORMA_DB, {
    actor: `usuario:${usuario.id}`,
    accion: 'derecho.portabilidad',
    entidad: 'usuarios',
    entidad_id: usuario.id,
    detalles: { contribuciones: (contribs.results || []).length },
    ip_hash: await hashIp(ipDe(request), env?.PEPPER_PII),
  });

  // Export portable y autoexplicativo.
  return json(
    {
      formato: 'rgpd_portabilidad_v1',
      generado_en: new Date().toISOString(),
      usuario: {
        id: usuario.id,
        creado_en: usuario.creado_en,
        estado: usuario.estado,
        payout_estado: usuario.payout_estado,
      },
      contacto: contacto
        ? { email_hash: contacto.email_hash ?? null, email_presente: contacto.email_cifrado != null }
        : { email_hash: null, email_presente: false },
      consentimientos: consents.results || [],
      contribuciones: contribs.results || [],
      repartos: repartos.results || [],
    },
    200,
    requestId,
  );
}

// ----------------------------------------------------------------------------
//  C.3 — DELETE /v1/yo  (supresión, art. 17 — "derecho al olvido")
// ----------------------------------------------------------------------------

/**
 * Suprime al usuario. Por `ON DELETE CASCADE` del esquema, borrar la fila de
 * `usuarios` arrastra `usuarios_contacto`, `consentimientos` y `contribuciones`.
 * Los REPORTES ya entregados son agregados anónimos (k>=50) y NO contienen al
 * usuario, así que se conservan (y no dependen de esta tabla). Se audita ANTES
 * de borrar para que quede el id del actor; el log es append-only y no se borra.
 *   >>> En producción este endpoint exigiría REAUTENTICACIÓN (art. 12.6) y podría
 *   >>> encolarse (202 + job_id). Aquí lo ejecutamos en línea y exigimos confirmar.
 */
async function handlerYoSupresion(request, env, requestId) {
  const auth = await autenticarUsuario(request, env);
  if (!auth.ok) return error(auth.codigo, auth.mensaje, auth.status, requestId);
  const usuario = auth.usuario;

  // El contrato (C.3) exige confirmar explícitamente el borrado.
  let cuerpo = {};
  try {
    const txt = await request.text();
    cuerpo = txt ? JSON.parse(txt) : {};
  } catch {
    cuerpo = {};
  }
  if (cuerpo?.confirmar !== true) {
    return error('confirmacion_requerida', 'Para suprimir la cuenta envía { "confirmar": true }.', 400, requestId);
  }

  // Contamos lo que se va a borrar (para el log, sin PII) ANTES de borrar.
  const cuenta = await env.PLATAFORMA_DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM consentimientos WHERE usuario_id = ?) AS n_consent,
       (SELECT COUNT(*) FROM contribuciones  WHERE usuario_id = ?) AS n_contrib`,
  )
    .bind(usuario.id, usuario.id)
    .first();

  // Auditamos ANTES del borrado (después, la cascada no toca logs_auditoria, que
  // es append-only y NO referencia a usuarios). Sin PII en `detalles`.
  await auditar(env.PLATAFORMA_DB, {
    actor: `usuario:${usuario.id}`,
    accion: 'derecho.supresion',
    entidad: 'usuarios',
    entidad_id: usuario.id,
    detalles: {
      consentimientos_borrados: Number(cuenta?.n_consent ?? 0),
      contribuciones_borradas: Number(cuenta?.n_contrib ?? 0),
      nota: 'Borrado en cascada; reportes agregados anónimos se conservan.',
    },
    ip_hash: await hashIp(ipDe(request), env?.PEPPER_PII),
  });

  // Borrado del usuario -> ON DELETE CASCADE limpia contacto, consentimientos y
  // contribuciones. PARAMETRIZADO.
  await env.PLATAFORMA_DB.prepare(`DELETE FROM usuarios WHERE id = ?`).bind(usuario.id).run();

  return json(
    {
      estado: 'suprimido',
      usuario_id: usuario.id,
      nota: 'Borrado en cascada; reportes agregados anónimos se conservan.',
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

  // --- Consentimientos
  if (ruta === '/v1/consentimientos' && metodo === 'POST') {
    return handlerAltaConsentimiento(request, env, requestId);
  }
  // /v1/consentimientos/{id}/confirmar  y  /v1/consentimientos/{id}/revocar
  const mConsent = /^\/v1\/consentimientos\/([^/]+)\/(confirmar|revocar)$/.exec(ruta);
  if (mConsent && metodo === 'POST') {
    const consentId = decodeURIComponent(mConsent[1]);
    if (mConsent[2] === 'confirmar') return handlerConfirmarConsentimiento(request, env, requestId, consentId);
    return handlerRevocarConsentimiento(request, env, requestId, consentId);
  }

  // --- Contribuciones
  if (ruta === '/v1/contribuciones' && metodo === 'POST') {
    return handlerCrearContribucion(request, env, requestId);
  }

  // --- Derechos del interesado (/v1/yo)
  if (ruta === '/v1/yo' && metodo === 'GET') return handlerYoAcceso(request, env, requestId);
  if (ruta === '/v1/yo' && metodo === 'DELETE') return handlerYoSupresion(request, env, requestId);
  if (ruta === '/v1/yo/portabilidad' && metodo === 'POST') return handlerYoPortabilidad(request, env, requestId);

  // Ruta conocida pero método incorrecto -> 405; si no, 404.
  const rutasConocidas = {
    '/v1/consentimientos': ['POST'],
    '/v1/contribuciones': ['POST'],
    '/v1/yo': ['GET', 'DELETE'],
    '/v1/yo/portabilidad': ['POST'],
  };
  if (rutasConocidas[ruta]) {
    return error('metodo_no_permitido', `Método ${metodo} no permitido en ${ruta}.`, 405, requestId);
  }
  // Rutas con id (confirmar/revocar) cuyo método no sea POST.
  if (mConsent) {
    return error('metodo_no_permitido', `Método ${metodo} no permitido en ${ruta}.`, 405, requestId);
  }
  return error('no_encontrado', 'Ruta no encontrada.', 404, requestId);
}

// ----------------------------------------------------------------------------
//  Entry point del Worker
// ----------------------------------------------------------------------------

export default {
  async fetch(request, env /*, ctx */) {
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
export {
  enrutar,
  autenticarUsuario,
  validarFormaContribucion,
  categoriaPermitida,
  auditar,
  sha256hex,
  hashIp,
};

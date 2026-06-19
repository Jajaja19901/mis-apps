// ============================================================================
//  Pruebas del Worker w-ingesta (consent-first, ingesta + derechos RGPD)
//  --------------------------------------------------------------------------
//  Ejecutar:  node plataforma-datos/src/worker-ingesta.test.mjs
//
//  Usa un STUB EN MEMORIA de D1 (sin red, sin Cloudflare) que entiende las
//  consultas parametrizadas que emite el Worker y que, sobre todo, RESPETA EL
//  TRIGGER `trg_contrib_consent_valido`: una contribución solo entra si existe
//  un consentimiento ACTIVO (revocado_en IS NULL, proposito='venta_datos_agregados')
//  del MISMO usuario; si no, el INSERT aborta como en la BD real.
//
//  Cubre (por contrato y por las reglas de oro de privacidad):
//    (a) alta de consentimiento (ledger con texto_hash + ip_hash, nunca IP clara)
//    (b) contribución con consentimiento OK -> 201
//    (c) contribución SIN consentimiento activo -> 422 (lo veta el trigger)
//    (d) revocación; y tras revocar, NO se admiten contribuciones -> 422
//    (e) acceso (art. 15) y portabilidad (art. 20) devuelven SOLO lo del usuario
//    (f) supresión (art. 17) borra en CASCADA y AUDITA
//    (g) categoría fuera de la lista blanca -> 422
//    (h) extra: PII directa rechazada; doble opt-in pendiente no contribuye.
//
//  Importante: las consultas usan SIEMPRE prepared statements (bind), nunca
//  concatenación de SQL; el stub solo reconoce esas consultas parametrizadas.
// ============================================================================

import assert from 'node:assert/strict';
import worker from './worker-ingesta.mjs';

let pasados = 0;
async function prueba(nombre, fn) {
  await fn();
  pasados++;
  console.log('  ✓', nombre);
}

const SENTINELA_PENDIENTE = '9999-12-31T00:00:00Z';

// ----------------------------------------------------------------------------
//  STUB de D1 — mini motor en memoria que reconoce las consultas del Worker y
//  HACE CUMPLIR el trigger trg_contrib_consent_valido y el ON DELETE CASCADE.
// ----------------------------------------------------------------------------

function crearD1(seed = {}) {
  const tablas = {
    usuarios: seed.usuarios ? seed.usuarios.map((u) => ({ ...u })) : [],
    usuarios_contacto: seed.usuarios_contacto ? seed.usuarios_contacto.map((c) => ({ ...c })) : [],
    consentimientos: seed.consentimientos ? seed.consentimientos.map((c) => ({ ...c })) : [],
    contribuciones: seed.contribuciones ? seed.contribuciones.map((c) => ({ ...c })) : [],
    categorias_permitidas: seed.categorias_permitidas
      ? [...seed.categorias_permitidas]
      : [
          { categoria: 'compras_online', descripcion: 'Frecuencia / interés de compra online (no especial)' },
          { categoria: 'preferencia_ocio', descripcion: 'Preferencias de ocio declaradas (no especial)' },
          { categoria: 'rango_gasto_mensual', descripcion: 'Banda de gasto mensual declarada (no especial)' },
        ],
    repartos: seed.repartos ? seed.repartos.map((r) => ({ ...r })) : [],
    logs_auditoria: [],
  };
  let autoId = 1;

  const norm = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase();

  // ---- Réplica del TRIGGER trg_contrib_consent_valido (garantía de BD) -------
  function consentimientoActivoExiste(usuarioId, consentId) {
    return tablas.consentimientos.some(
      (c) =>
        c.id === consentId &&
        c.usuario_id === usuarioId &&
        (c.revocado_en == null) &&
        c.proposito === 'venta_datos_agregados',
    );
  }

  function ejecutar(sql, args) {
    const q = norm(sql);

    // --- auth: SELECT ... FROM usuarios WHERE id = ?
    if (q.startsWith('select') && q.includes('from usuarios') && q.includes('where id = ?') && !q.includes('count(')) {
      const u = tablas.usuarios.find((x) => x.id === args[0]) || null;
      return { type: 'row', row: u ? { ...u } : null };
    }

    // --- categoría en lista blanca: SELECT 1 FROM categorias_permitidas WHERE categoria = ?
    if (q.includes('from categorias_permitidas') && q.includes('where categoria = ?')) {
      const hay = tablas.categorias_permitidas.some((c) => c.categoria === args[0]);
      return { type: 'row', row: hay ? { ok: 1 } : null };
    }

    // --- consentimiento vigente idéntico (idempotencia del alta)
    if (
      q.includes('from consentimientos') &&
      q.includes('politica_version = ?') &&
      q.includes('revocado_en is null')
    ) {
      const [usuarioId, proposito, politica] = args;
      const c = tablas.consentimientos.find(
        (x) => x.usuario_id === usuarioId && x.proposito === proposito && x.politica_version === politica && x.revocado_en == null,
      );
      return { type: 'row', row: c ? { ...c } : null };
    }

    // --- consentimiento por id+usuario (confirmar / revocar): incluye revocado_en
    if (
      q.includes('from consentimientos') &&
      q.includes('where id = ? and usuario_id = ?') &&
      q.startsWith('select')
    ) {
      const [id, usuarioId] = args;
      const c = tablas.consentimientos.find((x) => x.id === id && x.usuario_id === usuarioId);
      return { type: 'row', row: c ? { ...c } : null };
    }

    // --- validación en código del consentimiento activo (contribución)
    if (
      q.includes('from consentimientos') &&
      q.includes('revocado_en is null') &&
      q.includes('proposito = ?') &&
      q.includes('where id = ?')
    ) {
      const [id, usuarioId, proposito] = args;
      const c = tablas.consentimientos.find(
        (x) => x.id === id && x.usuario_id === usuarioId && x.revocado_en == null && x.proposito === proposito,
      );
      return { type: 'row', row: c ? { id: c.id } : null };
    }

    // --- listado de consentimientos del usuario (acceso/portabilidad)
    if (q.includes('from consentimientos') && q.includes('where usuario_id = ?') && q.includes('order by otorgado_en')) {
      const rows = tablas.consentimientos
        .filter((c) => c.usuario_id === args[0])
        .map((c) => ({
          id: c.id,
          proposito: c.proposito,
          politica_version: c.politica_version,
          metodo: c.metodo,
          otorgado_en: c.otorgado_en,
          revocado_en: c.revocado_en ?? null,
        }));
      return { type: 'rows', rows };
    }

    // --- contacto del usuario
    if (q.includes('from usuarios_contacto') && q.includes('where usuario_id = ?')) {
      const c = tablas.usuarios_contacto.find((x) => x.usuario_id === args[0]) || null;
      return { type: 'row', row: c ? { ...c } : null };
    }

    // --- resumen de contribuciones por categoría del usuario
    if (q.includes('from contribuciones') && q.includes('count(*)') && q.includes('group by categoria')) {
      const porCat = new Map();
      for (const c of tablas.contribuciones) {
        if (c.usuario_id !== args[0]) continue;
        porCat.set(c.categoria, (porCat.get(c.categoria) || 0) + 1);
      }
      return { type: 'rows', rows: [...porCat.entries()].map(([categoria, n]) => ({ categoria, n })) };
    }

    // --- detalle de contribuciones del usuario (portabilidad)
    if (q.includes('from contribuciones') && q.includes('where usuario_id = ?') && q.startsWith('select id')) {
      const rows = tablas.contribuciones
        .filter((c) => c.usuario_id === args[0])
        .map((c) => ({ ...c }));
      return { type: 'rows', rows };
    }

    // --- repartos del usuario (portabilidad)
    if (q.includes('from repartos') && q.includes('where usuario_id = ?')) {
      const rows = tablas.repartos.filter((r) => r.usuario_id === args[0]).map((r) => ({ ...r }));
      return { type: 'rows', rows };
    }

    // --- conteo previo a la supresión (sub-selects)
    if (q.includes('select') && q.includes('count(*) from consentimientos') && q.includes('count(*) from contribuciones')) {
      const [u1, u2] = args;
      const nC = tablas.consentimientos.filter((c) => c.usuario_id === u1).length;
      const nK = tablas.contribuciones.filter((c) => c.usuario_id === u2).length;
      return { type: 'row', row: { n_consent: nC, n_contrib: nK } };
    }

    // --- INSERT en consentimientos (ledger)
    if (q.startsWith('insert into consentimientos')) {
      const [id, usuario_id, proposito, politica_version, texto_hash, metodo, ip_hash, user_agent, revocado_en] = args;
      if (proposito === '' || proposito == null) throw new Error('CHECK constraint failed: proposito <> ""');
      // FK usuario debe existir.
      if (!tablas.usuarios.some((u) => u.id === usuario_id)) {
        throw new Error('FOREIGN KEY constraint failed (usuarios)');
      }
      tablas.consentimientos.push({
        id,
        usuario_id,
        proposito,
        politica_version,
        texto_hash,
        metodo,
        ip_hash: ip_hash ?? null,
        user_agent: user_agent ?? null,
        otorgado_en: new Date().toISOString(),
        revocado_en: revocado_en ?? null,
      });
      return { type: 'run' };
    }

    // --- UPDATE consentimientos: confirmar (revocado_en = NULL)
    if (q.startsWith('update consentimientos set revocado_en = null')) {
      const [id, usuarioId, sentinela] = args;
      const c = tablas.consentimientos.find(
        (x) => x.id === id && x.usuario_id === usuarioId && x.revocado_en === sentinela,
      );
      if (c) c.revocado_en = null;
      return { type: 'run' };
    }

    // --- UPDATE consentimientos: revocar (revocado_en = fecha)
    if (q.startsWith('update consentimientos set revocado_en = ?')) {
      const [fecha, id, usuarioId] = args;
      const c = tablas.consentimientos.find((x) => x.id === id && x.usuario_id === usuarioId);
      if (c) c.revocado_en = fecha;
      return { type: 'run' };
    }

    // --- INSERT en contribuciones (CON el TRIGGER como última barrera)
    if (q.startsWith('insert into contribuciones')) {
      const [id, usuario_id, consentimiento_id, banda_edad, region, genero, categoria, valor] = args;
      // >>> TRIGGER trg_contrib_consent_valido: aborta si NO hay consentimiento
      //     ACTIVO del mismo usuario para 'venta_datos_agregados'.
      if (!consentimientoActivoExiste(usuario_id, consentimiento_id)) {
        throw new Error('Contribución sin consentimiento activo del usuario');
      }
      // FK categoria (lista blanca).
      if (categoria != null && !tablas.categorias_permitidas.some((c) => c.categoria === categoria)) {
        throw new Error('FOREIGN KEY constraint failed (categorias_permitidas)');
      }
      tablas.contribuciones.push({
        id,
        usuario_id,
        consentimiento_id,
        recogido_en: new Date().toISOString(),
        banda_edad: banda_edad ?? null,
        region: region ?? null,
        genero: genero ?? null,
        categoria: categoria ?? null,
        valor: valor ?? null,
      });
      return { type: 'run' };
    }

    // --- DELETE usuarios -> ON DELETE CASCADE (contacto, consentimientos, contribuciones)
    if (q.startsWith('delete from usuarios')) {
      const id = args[0];
      tablas.usuarios = tablas.usuarios.filter((u) => u.id !== id);
      tablas.usuarios_contacto = tablas.usuarios_contacto.filter((c) => c.usuario_id !== id);
      tablas.consentimientos = tablas.consentimientos.filter((c) => c.usuario_id !== id);
      tablas.contribuciones = tablas.contribuciones.filter((c) => c.usuario_id !== id);
      // repartos NO está en CASCADE en el esquema (no se borra) — se deja igual.
      return { type: 'run' };
    }

    // --- INSERT en logs_auditoria (append-only autoincremental)
    if (q.startsWith('insert into logs_auditoria')) {
      const [actor, accion, entidad, entidad_id, detalles, ip_hash] = args;
      tablas.logs_auditoria.push({
        id: autoId++,
        actor,
        accion,
        entidad: entidad ?? null,
        entidad_id: entidad_id ?? null,
        detalles: detalles ?? null,
        ip_hash: ip_hash ?? null,
        creado_en: new Date().toISOString(),
      });
      return { type: 'run' };
    }

    throw new Error('STUB D1: consulta no reconocida -> ' + q);
  }

  function prepare(sql) {
    let bound = [];
    const stmt = {
      bind(...args) {
        bound = args;
        return stmt;
      },
      async first() {
        const r = ejecutar(sql, bound);
        if (r.type === 'row') return r.row;
        if (r.type === 'rows') return r.rows[0] ?? null;
        return null;
      },
      async all() {
        const r = ejecutar(sql, bound);
        if (r.type === 'rows') return { results: r.rows, success: true };
        if (r.type === 'row') return { results: r.row ? [r.row] : [], success: true };
        return { results: [], success: true };
      },
      async run() {
        ejecutar(sql, bound);
        return { success: true };
      },
    };
    return stmt;
  }

  return { prepare, _tablas: tablas };
}

// ----------------------------------------------------------------------------
//  Helpers de peticiones y datos
// ----------------------------------------------------------------------------

function pedir(metodo, ruta, { token, body, headers: extra } = {}) {
  const headers = { 'Content-Type': 'application/json', ...(extra || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return new Request('https://api.test' + ruta, {
    method: metodo,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

const USUARIO = { id: 'u-001', creado_en: '2026-06-01T00:00:00Z', estado: 'activo', payout_estado: 'pendiente' };
const OTRO = { id: 'u-otro-999', creado_en: '2026-06-01T00:00:00Z', estado: 'activo', payout_estado: 'pendiente' };
const PEPPER = 'pimienta-de-prueba';

// Da de alta un consentimiento ACTIVO directamente en el stub (atajo para tests).
function consentActivo(usuarioId, id = 'c-act-1') {
  return {
    id,
    usuario_id: usuarioId,
    proposito: 'venta_datos_agregados',
    politica_version: '2026-06-01',
    texto_hash: 'hash',
    metodo: 'web_checkbox',
    ip_hash: null,
    user_agent: null,
    otorgado_en: '2026-06-10T00:00:00Z',
    revocado_en: null,
  };
}

const CUERPO_CONTRIB = {
  banda_edad: '25-34',
  region: 'Madrid',
  genero: 'F',
  categoria: 'compras_online',
  valor: 3,
};

// ----------------------------------------------------------------------------
//  PRUEBAS
// ----------------------------------------------------------------------------

console.log('worker-ingesta:');

await prueba('(a) alta de consentimiento: 201, guarda texto_hash e ip_hash (nunca IP en claro) y audita', async () => {
  const db = crearD1({ usuarios: [USUARIO] });
  const env = { PLATAFORMA_DB: db, PEPPER_PII: PEPPER };

  const res = await worker.fetch(
    pedir('POST', '/v1/consentimientos', {
      token: USUARIO.id,
      headers: { 'CF-Connecting-IP': '203.0.113.7', 'User-Agent': 'pruebas/1.0' },
      body: {
        proposito: 'venta_datos_agregados',
        politica_version: '2026-06-01',
        texto_mostrado: 'Acepto que mis datos, agregados y anonimizados (k>=50), se vendan...',
        metodo: 'web_checkbox',
      },
    }),
    env,
  );

  assert.equal(res.status, 201);
  const cuerpo = await res.json();
  assert.equal(cuerpo.proposito, 'venta_datos_agregados');
  assert.equal(cuerpo.estado, 'activo');
  assert.equal(cuerpo.revocado_en, null, 'nace ACTIVO (revocado_en = null)');

  // Persistido en el ledger con HASHes (no texto ni IP en claro).
  assert.equal(db._tablas.consentimientos.length, 1);
  const fila = db._tablas.consentimientos[0];
  assert.ok(fila.texto_hash && fila.texto_hash.length === 64, 'texto_hash = SHA-256 hex (64 chars)');
  assert.ok(fila.ip_hash && fila.ip_hash.length === 64, 'ip_hash presente y hasheado');
  // La IP en claro NO aparece por ningún lado del ledger.
  const ledgerTexto = JSON.stringify(db._tablas.consentimientos);
  assert.equal(ledgerTexto.includes('203.0.113.7'), false, 'la IP en claro jamás se almacena');
  assert.equal(ledgerTexto.includes('se vendan'), false, 'el texto mostrado no se guarda, solo su hash');

  // Auditado consent.otorgado, sin PII.
  const log = db._tablas.logs_auditoria.find((l) => l.accion === 'consent.otorgado');
  assert.ok(log, 'debe auditar consent.otorgado');
  assert.equal(log.actor, `usuario:${USUARIO.id}`);
});

await prueba('(b) contribución con consentimiento OK -> 201 y queda ligada al consentimiento, auditada', async () => {
  const db = crearD1({ usuarios: [USUARIO], consentimientos: [consentActivo(USUARIO.id, 'c-ok')] });
  const env = { PLATAFORMA_DB: db, PEPPER_PII: PEPPER };

  const res = await worker.fetch(
    pedir('POST', '/v1/contribuciones', {
      token: USUARIO.id,
      body: { consentimiento_id: 'c-ok', ...CUERPO_CONTRIB },
    }),
    env,
  );

  assert.equal(res.status, 201);
  const cuerpo = await res.json();
  assert.equal(cuerpo.categoria, 'compras_online');
  assert.ok(cuerpo.id, 'devuelve el id de la contribución');

  assert.equal(db._tablas.contribuciones.length, 1, 'se persiste 1 contribución');
  assert.equal(db._tablas.contribuciones[0].consentimiento_id, 'c-ok', 'ligada al consentimiento');
  assert.equal(db._tablas.contribuciones[0].usuario_id, USUARIO.id);

  const log = db._tablas.logs_auditoria.find((l) => l.accion === 'contribucion.creada');
  assert.ok(log, 'auditada como contribucion.creada');
});

await prueba('(c) contribución SIN consentimiento activo -> 422 (lo veta el código y/o el trigger)', async () => {
  // Usuario SIN ningún consentimiento.
  const db = crearD1({ usuarios: [USUARIO] });
  const env = { PLATAFORMA_DB: db, PEPPER_PII: PEPPER };

  const res = await worker.fetch(
    pedir('POST', '/v1/contribuciones', {
      token: USUARIO.id,
      body: { consentimiento_id: 'c-inexistente', ...CUERPO_CONTRIB },
    }),
    env,
  );

  assert.equal(res.status, 422, 'sin consentimiento activo debe ser 422');
  assert.equal((await res.json()).error.codigo, 'consentimiento_inexistente');
  assert.equal(db._tablas.contribuciones.length, 0, 'no se persiste ninguna contribución');
});

await prueba('(c.2) el TRIGGER es la última barrera: aunque el id "exista" pero esté revocado -> INSERT aborta -> 422', async () => {
  // Forzamos el camino del trigger: el SELECT de validación pasaría si NO miráramos
  // revocado_en, pero el consentimiento está revocado -> el INSERT del stub aborta
  // igual que el trigger real. Aquí el consentimiento está revocado.
  const revocado = { ...consentActivo(USUARIO.id, 'c-rev'), revocado_en: '2026-06-15T00:00:00Z' };
  const db = crearD1({ usuarios: [USUARIO], consentimientos: [revocado] });
  const env = { PLATAFORMA_DB: db, PEPPER_PII: PEPPER };

  const res = await worker.fetch(
    pedir('POST', '/v1/contribuciones', {
      token: USUARIO.id,
      body: { consentimiento_id: 'c-rev', ...CUERPO_CONTRIB },
    }),
    env,
  );
  assert.equal(res.status, 422);
  assert.equal(db._tablas.contribuciones.length, 0);
});

await prueba('(c.3) condición de carrera (TOCTOU): consentimiento activo en el SELECT pero revocado antes del INSERT -> el TRIGGER aborta -> 422', async () => {
  // Prueba que el TRIGGER es de verdad la ÚLTIMA barrera: el chequeo en código
  // pasa (el consentimiento está activo cuando se valida), pero entre el SELECT
  // y el INSERT alguien revoca. El INSERT debe abortar y el Worker responder 422.
  const db = crearD1({ usuarios: [USUARIO], consentimientos: [consentActivo(USUARIO.id, 'c-carrera')] });
  const env = { PLATAFORMA_DB: db, PEPPER_PII: PEPPER };

  // Envolvemos prepare: en cuanto el Worker valide el consentimiento (su SELECT
  // por id+usuario+revocado_en IS NULL+proposito), lo revocamos "a su espalda".
  const prepareReal = db.prepare.bind(db);
  db.prepare = (sql) => {
    const stmt = prepareReal(sql);
    const firstReal = stmt.first.bind(stmt);
    stmt.first = async () => {
      const r = await firstReal();
      const q = sql.replace(/\s+/g, ' ').toLowerCase();
      if (q.includes('from consentimientos') && q.includes('revocado_en is null') && q.includes('proposito = ?')) {
        // Revoca DESPUÉS de que el código lo haya dado por válido.
        db._tablas.consentimientos[0].revocado_en = '2026-06-16T00:00:00Z';
      }
      return r;
    };
    return stmt;
  };

  const res = await worker.fetch(
    pedir('POST', '/v1/contribuciones', { token: USUARIO.id, body: { consentimiento_id: 'c-carrera', ...CUERPO_CONTRIB } }),
    env,
  );
  assert.equal(res.status, 422, 'el INSERT abortado por el trigger debe dar 422');
  assert.equal(db._tablas.contribuciones.length, 0, 'no se persiste la contribución');
  // Y queda auditado el rechazo por la barrera de BD.
  assert.ok(
    db._tablas.logs_auditoria.some((l) => l.accion === 'contribucion.rechazada' && JSON.parse(l.detalles).motivo === 'trigger_consent'),
    'se audita el rechazo del trigger',
  );
});

await prueba('(d) revocación: 200; y TRAS revocar NO se admiten contribuciones -> 422', async () => {
  const db = crearD1({ usuarios: [USUARIO], consentimientos: [consentActivo(USUARIO.id, 'c-vivo')] });
  const env = { PLATAFORMA_DB: db, PEPPER_PII: PEPPER };

  // Antes de revocar: una contribución entra (sanity check).
  const antes = await worker.fetch(
    pedir('POST', '/v1/contribuciones', { token: USUARIO.id, body: { consentimiento_id: 'c-vivo', ...CUERPO_CONTRIB } }),
    env,
  );
  assert.equal(antes.status, 201, 'antes de revocar sí se admite');

  // Revocar (art. 7.3): basta un POST.
  const rev = await worker.fetch(
    pedir('POST', '/v1/consentimientos/c-vivo/revocar', { token: USUARIO.id }),
    env,
  );
  assert.equal(rev.status, 200);
  const cRev = await rev.json();
  assert.equal(cRev.estado, 'revocado');
  assert.ok(cRev.revocado_en, 'pone revocado_en');
  assert.ok(db._tablas.consentimientos[0].revocado_en, 'el ledger refleja la revocación');

  // Auditoría de la revocación.
  assert.ok(db._tablas.logs_auditoria.some((l) => l.accion === 'consent.revocado'), 'audita consent.revocado');

  // Tras revocar: la misma contribución es RECHAZADA por la BD -> 422.
  const despues = await worker.fetch(
    pedir('POST', '/v1/contribuciones', { token: USUARIO.id, body: { consentimiento_id: 'c-vivo', ...CUERPO_CONTRIB } }),
    env,
  );
  assert.equal(despues.status, 422, 'tras revocar NO se admiten nuevas contribuciones');
  assert.equal(db._tablas.contribuciones.length, 1, 'solo quedó la contribución previa a la revocación');

  // Revocar de nuevo -> 409 (ya estaba revocado).
  const otra = await worker.fetch(pedir('POST', '/v1/consentimientos/c-vivo/revocar', { token: USUARIO.id }), env);
  assert.equal(otra.status, 409);
  assert.equal((await otra.json()).error.codigo, 'consentimiento_ya_revocado');
});

await prueba('(e) acceso (art.15) y portabilidad (art.20) devuelven SOLO lo del propio usuario', async () => {
  const db = crearD1({
    usuarios: [USUARIO, OTRO],
    usuarios_contacto: [{ usuario_id: USUARIO.id, email_hash: '9f86abc', email_cifrado: 'xx' }],
    consentimientos: [consentActivo(USUARIO.id, 'c-mio'), consentActivo(OTRO.id, 'c-suyo')],
    contribuciones: [
      { id: 'k1', usuario_id: USUARIO.id, consentimiento_id: 'c-mio', categoria: 'compras_online', banda_edad: '25-34', region: 'Madrid', genero: 'F', valor: 3, recogido_en: '2026-06-11T00:00:00Z' },
      { id: 'k2', usuario_id: USUARIO.id, consentimiento_id: 'c-mio', categoria: 'preferencia_ocio', banda_edad: '25-34', region: 'Madrid', genero: 'F', valor: 1, recogido_en: '2026-06-12T00:00:00Z' },
      { id: 'kX', usuario_id: OTRO.id, consentimiento_id: 'c-suyo', categoria: 'compras_online', banda_edad: '45-54', region: 'Galicia', genero: 'M', valor: 9, recogido_en: '2026-06-12T00:00:00Z' },
    ],
    repartos: [{ usuario_id: USUARIO.id, periodo: '2026-05', importe_centimos: 137, estado: 'pagado' }],
  });
  const env = { PLATAFORMA_DB: db, PEPPER_PII: PEPPER };

  // --- Acceso
  const acc = await worker.fetch(pedir('GET', '/v1/yo', { token: USUARIO.id }), env);
  assert.equal(acc.status, 200);
  const dAcc = await acc.json();
  assert.equal(dAcc.usuario.id, USUARIO.id);
  assert.equal(dAcc.contribuciones_resumen.total, 2, 'solo cuenta SUS 2 contribuciones');
  assert.equal(dAcc.contribuciones_resumen.por_categoria.compras_online, 1);
  assert.equal(dAcc.contribuciones_resumen.por_categoria.preferencia_ocio, 1);
  assert.equal(dAcc.consentimientos.length, 1, 'solo SUS consentimientos');
  assert.equal(dAcc.consentimientos[0].id, 'c-mio');
  // No filtra al otro usuario.
  const accTexto = JSON.stringify(dAcc);
  assert.equal(accTexto.includes(OTRO.id), false, 'jamás aparece el otro usuario');
  assert.equal(accTexto.includes('"kX"'), false, 'ni sus contribuciones');
  // Contacto: email_hash, nunca email en claro.
  assert.equal(dAcc.contacto.email_hash, '9f86abc');
  assert.equal(dAcc.contacto.email_presente, true);
  assert.ok(db._tablas.logs_auditoria.some((l) => l.accion === 'derecho.acceso'), 'audita derecho.acceso');

  // --- Portabilidad
  const port = await worker.fetch(pedir('POST', '/v1/yo/portabilidad', { token: USUARIO.id }), env);
  assert.equal(port.status, 200);
  const dPort = await port.json();
  assert.equal(dPort.formato, 'rgpd_portabilidad_v1');
  assert.equal(dPort.contribuciones.length, 2, 'export solo de SUS contribuciones');
  assert.ok(dPort.contribuciones.every((c) => c.usuario_id === USUARIO.id));
  assert.equal(dPort.repartos.length, 1);
  const portTexto = JSON.stringify(dPort);
  assert.equal(portTexto.includes('"kX"'), false, 'el export no incluye datos de otros');
  assert.ok(db._tablas.logs_auditoria.some((l) => l.accion === 'derecho.portabilidad'), 'audita derecho.portabilidad');
});

await prueba('(f) supresión (art.17) borra en CASCADA (usuario, consentimientos, contribuciones, contacto) y AUDITA', async () => {
  const db = crearD1({
    usuarios: [USUARIO, OTRO],
    usuarios_contacto: [{ usuario_id: USUARIO.id, email_hash: 'h', email_cifrado: null }],
    consentimientos: [consentActivo(USUARIO.id, 'c-del'), consentActivo(OTRO.id, 'c-otro')],
    contribuciones: [
      { id: 'd1', usuario_id: USUARIO.id, consentimiento_id: 'c-del', categoria: 'compras_online' },
      { id: 'd2', usuario_id: USUARIO.id, consentimiento_id: 'c-del', categoria: 'compras_online' },
      { id: 'dOtro', usuario_id: OTRO.id, consentimiento_id: 'c-otro', categoria: 'compras_online' },
    ],
  });
  const env = { PLATAFORMA_DB: db, PEPPER_PII: PEPPER };

  // Falta confirmar -> 400.
  const sinConfirmar = await worker.fetch(pedir('DELETE', '/v1/yo', { token: USUARIO.id, body: {} }), env);
  assert.equal(sinConfirmar.status, 400, 'sin confirmar no borra');

  // Con confirmación -> borra en cascada.
  const res = await worker.fetch(pedir('DELETE', '/v1/yo', { token: USUARIO.id, body: { confirmar: true } }), env);
  assert.equal(res.status, 200);
  const cuerpo = await res.json();
  assert.equal(cuerpo.estado, 'suprimido');

  // El usuario y TODO lo suyo desaparece; lo del OTRO permanece.
  assert.equal(db._tablas.usuarios.some((u) => u.id === USUARIO.id), false, 'usuario borrado');
  assert.equal(db._tablas.usuarios_contacto.some((c) => c.usuario_id === USUARIO.id), false, 'contacto borrado (cascada)');
  assert.equal(db._tablas.consentimientos.some((c) => c.usuario_id === USUARIO.id), false, 'consentimientos borrados (cascada)');
  assert.equal(db._tablas.contribuciones.some((c) => c.usuario_id === USUARIO.id), false, 'contribuciones borradas (cascada)');
  // El otro usuario sobrevive intacto.
  assert.ok(db._tablas.usuarios.some((u) => u.id === OTRO.id), 'el otro usuario no se toca');
  assert.ok(db._tablas.contribuciones.some((c) => c.id === 'dOtro'), 'sus contribuciones siguen');

  // Auditoría de la supresión (append-only: sobrevive al borrado en cascada).
  const log = db._tablas.logs_auditoria.find((l) => l.accion === 'derecho.supresion');
  assert.ok(log, 'audita derecho.supresion');
  assert.equal(log.actor, `usuario:${USUARIO.id}`);
  const det = JSON.parse(log.detalles);
  assert.equal(det.contribuciones_borradas, 2, 'el log refleja cuántas se borraron');
});

await prueba('(g) categoría fuera de la lista blanca -> 422 categoria_no_permitida (no se persiste)', async () => {
  const db = crearD1({ usuarios: [USUARIO], consentimientos: [consentActivo(USUARIO.id, 'c-ok')] });
  const env = { PLATAFORMA_DB: db, PEPPER_PII: PEPPER };

  const res = await worker.fetch(
    pedir('POST', '/v1/contribuciones', {
      token: USUARIO.id,
      body: { consentimiento_id: 'c-ok', banda_edad: '25-34', region: 'Madrid', genero: 'F', categoria: 'datos_salud', valor: 1 },
    }),
    env,
  );
  assert.equal(res.status, 422);
  assert.equal((await res.json()).error.codigo, 'categoria_no_permitida');
  assert.equal(db._tablas.contribuciones.length, 0, 'categoría especial/no permitida nunca entra');
});

// ----------------------------------------------------------------------------
//  PRUEBAS EXTRA — endurecen privacidad y consent-first
// ----------------------------------------------------------------------------

await prueba('(h) PII directa (fecha_nacimiento / direccion / edad exacta / texto) -> 422 y NO se persiste', async () => {
  const db = crearD1({ usuarios: [USUARIO], consentimientos: [consentActivo(USUARIO.id, 'c-ok')] });
  const env = { PLATAFORMA_DB: db, PEPPER_PII: PEPPER };

  for (const malo of [
    { consentimiento_id: 'c-ok', categoria: 'compras_online', fecha_nacimiento: '1990-01-01' },
    { consentimiento_id: 'c-ok', categoria: 'compras_online', direccion: 'Calle Mayor 3' },
    { consentimiento_id: 'c-ok', categoria: 'compras_online', edad: 34 },
    { consentimiento_id: 'c-ok', categoria: 'compras_online', texto: 'soy fulanito y vivo en...' },
    { consentimiento_id: 'c-ok', categoria: 'compras_online', region: 'Calle Mayor 3, 28013' }, // región con señas
    { consentimiento_id: 'c-ok', categoria: 'compras_online', banda_edad: '33' }, // edad exacta disfrazada de banda
  ]) {
    const res = await worker.fetch(pedir('POST', '/v1/contribuciones', { token: USUARIO.id, body: malo }), env);
    assert.equal(res.status, 422, `debe rechazar PII directa: ${JSON.stringify(malo)}`);
    assert.equal((await res.json()).error.codigo, 'cuasi_identificador_invalido');
  }
  assert.equal(db._tablas.contribuciones.length, 0, 'ningún dato directo se persiste');
});

await prueba('(i) doble opt-in: nace pendiente_confirmacion (no activo) y NO admite contribuciones hasta confirmar', async () => {
  const db = crearD1({ usuarios: [USUARIO] });
  const env = { PLATAFORMA_DB: db, PEPPER_PII: PEPPER };

  // Alta con doble opt-in.
  const alta = await worker.fetch(
    pedir('POST', '/v1/consentimientos', {
      token: USUARIO.id,
      body: {
        proposito: 'venta_datos_agregados',
        politica_version: '2026-06-01',
        texto_mostrado: 'Acepto...',
        metodo: 'doble_opt_in',
      },
    }),
    env,
  );
  assert.equal(alta.status, 201);
  const cAlta = await alta.json();
  assert.equal(cAlta.estado, 'pendiente_confirmacion');
  assert.equal(cAlta.revocado_en, SENTINELA_PENDIENTE, 'pendiente: revocado_en != null (centinela) -> no activo');
  const consentId = cAlta.id;

  // Contribución antes de confirmar -> 422 (el trigger lo trata como NO activo).
  const pre = await worker.fetch(
    pedir('POST', '/v1/contribuciones', { token: USUARIO.id, body: { consentimiento_id: consentId, ...CUERPO_CONTRIB } }),
    env,
  );
  assert.equal(pre.status, 422, 'pendiente de confirmar no admite contribuciones');

  // Confirmar (simulado) -> pasa a activo.
  const conf = await worker.fetch(pedir('POST', `/v1/consentimientos/${consentId}/confirmar`, { token: USUARIO.id }), env);
  assert.equal(conf.status, 200);
  assert.equal((await conf.json()).estado, 'activo');

  // Ahora SÍ admite la contribución.
  const post = await worker.fetch(
    pedir('POST', '/v1/contribuciones', { token: USUARIO.id, body: { consentimiento_id: consentId, ...CUERPO_CONTRIB } }),
    env,
  );
  assert.equal(post.status, 201, 'tras confirmar, ya se admite');
  assert.equal(db._tablas.contribuciones.length, 1);
});

await prueba('(j) auth: sin Bearer -> 401; usuario inexistente -> 401; usuario de baja -> 401', async () => {
  const baja = { ...USUARIO, id: 'u-baja', estado: 'baja' };
  const db = crearD1({ usuarios: [USUARIO, baja] });
  const env = { PLATAFORMA_DB: db, PEPPER_PII: PEPPER };

  const sin = await worker.fetch(pedir('GET', '/v1/yo', {}), env);
  assert.equal(sin.status, 401);
  assert.equal((await sin.json()).error.codigo, 'auth_invalida');

  const noExiste = await worker.fetch(pedir('GET', '/v1/yo', { token: 'fantasma' }), env);
  assert.equal(noExiste.status, 401);

  const deBaja = await worker.fetch(pedir('GET', '/v1/yo', { token: 'u-baja' }), env);
  assert.equal(deBaja.status, 401, 'una cuenta de baja no opera');
});

await prueba('(k) no se puede revocar el consentimiento de OTRO usuario -> 404', async () => {
  const db = crearD1({
    usuarios: [USUARIO, OTRO],
    consentimientos: [consentActivo(OTRO.id, 'c-ajeno')],
  });
  const env = { PLATAFORMA_DB: db, PEPPER_PII: PEPPER };

  const res = await worker.fetch(pedir('POST', '/v1/consentimientos/c-ajeno/revocar', { token: USUARIO.id }), env);
  assert.equal(res.status, 404, 'no se revoca lo ajeno');
  assert.equal((await res.json()).error.codigo, 'consentimiento_inexistente');
  // El consentimiento del otro sigue activo.
  assert.equal(db._tablas.consentimientos[0].revocado_en, null);
});

console.log(`\n${pasados} pruebas OK ✅`);

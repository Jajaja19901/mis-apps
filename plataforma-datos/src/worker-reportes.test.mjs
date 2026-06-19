// ============================================================================
//  Pruebas del Worker w-reportes (k-anon, consent-first, B2B)
//  --------------------------------------------------------------------------
//  Ejecutar:  node plataforma-datos/src/worker-reportes.test.mjs
//
//  Usa un STUB EN MEMORIA de D1 y R2 (sin red, sin Cloudflare) que entiende
//  exactamente las consultas parametrizadas que emite el Worker. Las pruebas
//  cubren, por contrato (flujo de COMPRA ASÍNCRONA F.1/F.2/F.3):
//    (a) segmento < 50  -> 422 segmento_no_entregable + fila de auditoría;
//        NUNCA llega a comprarse (no se inserta reporte ni transacción).
//    (b) iniciar compra de un segmento >= 50 -> 'pendiente_pago' SIN entregar
//        dato; y materializarReporte() genera, persiste, sube a R2 y audita.
//    (c) la salida entregada (respuesta y R2) NUNCA contiene 'usuario_id'.
//    (d) agencia sin KYC / sin contrato -> rechazada (403) y NO inicia compra.
//    (auth) el Bearer es un TOKEN OPACO: se resuelve por sha256(bearer) en
//        api_tokens; el agencia_id ya NO sirve como credencial.
//
//  Importante: las consultas usan SIEMPRE prepared statements (bind), nunca
//  concatenación de SQL; el stub falla si se intenta colar un valor por texto.
// ============================================================================

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import worker, { materializarReporte } from './worker-reportes.mjs';

/** SHA-256 hex idéntico al sha256Hex del Worker (verificado: createHash == subtle). */
function sha256Hex(s) {
  return createHash('sha256').update(String(s)).digest('hex');
}

let pasados = 0;
async function prueba(nombre, fn) {
  await fn();
  pasados++;
  console.log('  ✓', nombre);
}

// ----------------------------------------------------------------------------
//  STUB de D1 — mini motor en memoria que reconoce las consultas del Worker.
//  Soporta: prepare(sql).bind(...args).first() | .all() | .run()
//  Tablas modeladas: agencias, contribuciones, categorias_permitidas,
//  reportes (con CHECK n>=50 y k>=50), logs_auditoria (append-only autoinc).
// ----------------------------------------------------------------------------

function crearD1(seed = {}) {
  const tablas = {
    agencias: seed.agencias ? [...seed.agencias] : [],
    // Tokens OPACOS: cada fila es { id, agencia_id, token_hash, revocado_en, ultimo_uso_en }.
    api_tokens: seed.api_tokens ? [...seed.api_tokens] : [],
    contribuciones: seed.contribuciones ? [...seed.contribuciones] : [],
    categorias_permitidas: seed.categorias_permitidas
      ? [...seed.categorias_permitidas]
      : [
          { categoria: 'compras_online', descripcion: 'Frecuencia / interés de compra online (no especial)' },
          { categoria: 'preferencia_ocio', descripcion: 'Preferencias de ocio declaradas (no especial)' },
          { categoria: 'rango_gasto_mensual', descripcion: 'Banda de gasto mensual declarada (no especial)' },
        ],
    reportes: [],
    transacciones: [],
    logs_auditoria: [],
  };
  let autoId = 1;

  // Normaliza espacios para reconocer la consulta independientemente del formato.
  const norm = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase();

  function ejecutar(sql, args) {
    const q = norm(sql);

    // --- token opaco: SELECT id, agencia_id FROM api_tokens WHERE token_hash = ? AND revocado_en IS NULL
    if (q.includes('from api_tokens') && q.includes('where token_hash = ?')) {
      const hash = args[0];
      const t = tablas.api_tokens.find((x) => x.token_hash === hash && x.revocado_en == null) || null;
      return { type: 'row', row: t ? { id: t.id, agencia_id: t.agencia_id } : null };
    }

    // --- sello de último uso del token: UPDATE api_tokens SET ultimo_uso_en ... WHERE id = ?
    if (q.startsWith('update api_tokens') && q.includes('ultimo_uso_en')) {
      const id = args[0];
      const t = tablas.api_tokens.find((x) => x.id === id);
      if (t) t.ultimo_uso_en = new Date().toISOString();
      return { type: 'run' };
    }

    // --- autenticación: SELECT ... FROM agencias WHERE id = ?
    if (q.startsWith('select') && q.includes('from agencias') && q.includes('where id = ?')) {
      const id = args[0];
      const a = tablas.agencias.find((x) => x.id === id) || null;
      return { type: 'row', row: a };
    }

    // --- categoría en lista blanca: SELECT 1 ... FROM categorias_permitidas WHERE categoria = ?
    if (q.includes('from categorias_permitidas') && q.includes('where categoria = ?')) {
      const cat = args[0];
      const hay = tablas.categorias_permitidas.some((c) => c.categoria === cat);
      return { type: 'row', row: hay ? { ok: 1 } : null };
    }

    // --- catálogo: lista de categorías
    if (q.includes('select categoria, descripcion from categorias_permitidas')) {
      return { type: 'rows', rows: tablas.categorias_permitidas.map((c) => ({ ...c })) };
    }

    // --- catálogo: recuento DISTINCT por categoría
    if (q.includes('count(distinct usuario_id)') && q.includes('group by categoria')) {
      const porCat = new Map();
      for (const c of tablas.contribuciones) {
        if (c.categoria == null) continue;
        if (!porCat.has(c.categoria)) porCat.set(c.categoria, new Set());
        porCat.get(c.categoria).add(c.usuario_id);
      }
      const rows = [...porCat.entries()].map(([categoria, set]) => ({ categoria, n: set.size }));
      return { type: 'rows', rows };
    }

    // --- carga de contribuciones del segmento (filtros parametrizados)
    if (q.includes('from contribuciones') && q.startsWith('select usuario_id')) {
      const rows = filtrarContribuciones(q, args, tablas.contribuciones);
      return { type: 'rows', rows };
    }

    // --- INSERT en reportes (con CHECKs de BD simulados)
    if (q.startsWith('insert into reportes')) {
      // Orden de columnas del Worker (flujo asíncrono):
      // id, agencia_id, definicion_segmento, k_aplicado, n_usuarios, resultado_hash, precio_centimos, estado('pendiente_pago' literal)
      const [id, agencia_id, definicion_segmento, k_aplicado, n_usuarios, resultado_hash, precio_centimos] = args;
      // CHECKs del schema.sql -> el stub los hace cumplir como la BD real.
      if (!(Number(n_usuarios) >= 50)) throw new Error('CHECK constraint failed: n_usuarios >= 50');
      if (!(Number(k_aplicado) >= 50)) throw new Error('CHECK constraint failed: k_aplicado >= 50');
      if (!(Number(precio_centimos) >= 0)) throw new Error('CHECK constraint failed: precio_centimos >= 0');
      // El estado inicial es 'pendiente_pago' (la compra aún no está pagada).
      tablas.reportes.push({
        id,
        agencia_id,
        definicion_segmento,
        k_aplicado: Number(k_aplicado),
        n_usuarios: Number(n_usuarios),
        resultado_hash,
        precio_centimos: Number(precio_centimos),
        estado: 'pendiente_pago',
        generado_en: new Date().toISOString(),
      });
      return { type: 'run' };
    }

    // --- SELECT de un reporte por id (materializar / F.2)
    if (q.startsWith('select') && q.includes('from reportes') && q.includes('where id = ?')) {
      const id = args[0];
      const r = tablas.reportes.find((x) => x.id === id) || null;
      return { type: 'row', row: r };
    }

    // --- UPDATE de estado/hash del reporte (materializar)
    if (q.startsWith('update reportes')) {
      // El id es SIEMPRE el último '?': según la consulta, los args previos son hash, etc.
      const id = args[args.length - 1];
      const r = tablas.reportes.find((x) => x.id === id);
      if (r) {
        if (q.includes("estado = 'entregado'")) {
          r.resultado_hash = args[0];
          r.estado = 'entregado';
          r.generado_en = new Date().toISOString();
        } else if (q.includes("estado = 'pagado_generando'")) {
          if (r.estado !== 'entregado') r.estado = 'pagado_generando';
        } else if (q.includes("estado = 'anulado'")) {
          r.estado = 'anulado';
        }
      }
      return { type: 'run' };
    }

    // --- INSERT en transacciones (estado 'pendiente' literal; CHECK de suma exacta)
    if (q.startsWith('insert into transacciones')) {
      const [id, agencia_id, reporte_id, importe_centimos, comision, pool] = args;
      if (!(Number(importe_centimos) > 0)) throw new Error('CHECK constraint failed: importe_centimos > 0');
      if (Number(comision) + Number(pool) !== Number(importe_centimos)) {
        throw new Error('CHECK constraint failed: comision + pool = importe');
      }
      tablas.transacciones.push({
        id,
        agencia_id,
        reporte_id,
        importe_centimos: Number(importe_centimos),
        comision_plataforma_centimos: Number(comision),
        pool_usuarios_centimos: Number(pool),
        estado: 'pendiente',
      });
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

  // Aplica los filtros del WHERE (= o IN), leyendo los placeholders en orden.
  function filtrarContribuciones(q, args, filas) {
    // Reconstruye qué columnas se filtran a partir del SQL parametrizado.
    const condiciones = [];
    const re = /(region|banda_edad|genero|categoria)\s*(=|in)\s*(\([^)]*\)|\?)/g;
    let m;
    let ai = 0;
    while ((m = re.exec(q)) !== null) {
      const col = m[1];
      const op = m[2];
      if (op === '=') {
        condiciones.push({ col, valores: [args[ai++]] });
      } else {
        // IN (?, ?, ...) -> cuenta cuántos '?'
        const n = (m[3].match(/\?/g) || []).length;
        const valores = args.slice(ai, ai + n);
        ai += n;
        condiciones.push({ col, valores });
      }
    }
    return filas
      .filter((f) => condiciones.every((c) => c.valores.includes(f[c.col])))
      .map((f) => ({
        usuario_id: f.usuario_id,
        region: f.region ?? null,
        banda_edad: f.banda_edad ?? null,
        genero: f.genero ?? null,
        categoria: f.categoria ?? null,
        valor: f.valor ?? null,
      }));
  }

  // API tipo D1: prepare -> bind -> first/all/run.
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
//  STUB de R2 — almacén clave/valor en memoria.
// ----------------------------------------------------------------------------
function crearR2() {
  const objetos = new Map();
  return {
    async put(clave, valor /*, opts */) {
      objetos.set(clave, typeof valor === 'string' ? valor : String(valor));
      return { key: clave };
    },
    async get(clave) {
      if (!objetos.has(clave)) return null;
      const v = objetos.get(clave);
      return { async text() { return v; } };
    },
    _objetos: objetos,
  };
}

// ----------------------------------------------------------------------------
//  Helpers para construir peticiones y datos de prueba
// ----------------------------------------------------------------------------

function pedir(metodo, ruta, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return new Request('https://api.test' + ruta, {
    method: metodo,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// Agencia HABILITADA (KYC verificada + contrato firmado).
const AGENCIA_OK = {
  id: 'ag-verificada-001',
  razon_social: 'Agencia Demo S.L.',
  cif: 'B12345678',
  email: 'compras@demo.test',
  pais: 'ES',
  kyc_estado: 'verificada',
  contrato_firmado_en: '2026-06-01T09:00:00Z',
};

// TOKEN OPACO (secreto) de AGENCIA_OK. El Bearer es esto, NO el agencia_id.
// En BD solo vive su hash SHA-256; aquí lo derivamos igual que el Worker.
const TOKEN_OK = 'tok_secreto_demo_ABCDEF0123456789';
function tokenFila(agenciaId, token, { revocado_en = null } = {}) {
  return { id: `apitok-${agenciaId}`, agencia_id: agenciaId, token_hash: sha256Hex(token), revocado_en, ultimo_uso_en: null };
}
// Lista de api_tokens lista para sembrar el D1 con el token de AGENCIA_OK.
const TOKENS_OK = [tokenFila(AGENCIA_OK.id, TOKEN_OK)];

// Genera `n` contribuciones (usuarios distintos) en un segmento dado.
function contribs(n, { desde = 0, region = 'Madrid', banda_edad = '25-34', genero = 'F', categoria = 'compras_online', valor = 3 } = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({ usuario_id: `u${desde + i}`, region, banda_edad, genero, categoria, valor });
  }
  return out;
}

// ----------------------------------------------------------------------------
//  PRUEBAS
// ----------------------------------------------------------------------------

console.log('worker-reportes:');

await prueba('(a) segmento < 50 -> 422 segmento_no_entregable; NUNCA se compra (sin reporte ni transacción)', async () => {
  const db = crearD1({
    agencias: [AGENCIA_OK],
    api_tokens: TOKENS_OK,
    contribuciones: contribs(49, { region: 'Madrid', categoria: 'compras_online' }),
  });
  const env = { PLATAFORMA_DB: db, REPORTES: crearR2() };

  const res = await worker.fetch(
    pedir('POST', '/v1/reportes', {
      token: TOKEN_OK,
      body: { definicion_segmento: { filtros: { region: 'Madrid', categoria: 'compras_online' } } },
    }),
    env,
  );

  assert.equal(res.status, 422, 'segmento de 49 usuarios debe dar 422');
  const cuerpo = await res.json();
  assert.equal(cuerpo.error.codigo, 'segmento_no_entregable');

  // Un segmento < 50 jamás llega a comprarse: ni reporte ni transacción.
  assert.equal(db._tablas.reportes.length, 0, 'no debe iniciar compra de reportes < 50');
  assert.equal(db._tablas.transacciones.length, 0, 'no debe registrar transacción para < 50');
  // R2 no recibe nada.
  assert.equal(env.REPORTES._objetos.size, 0, 'no debe subir nada a R2');

  // SÍ debe quedar registrado el intento bloqueado en auditoría.
  const logs = db._tablas.logs_auditoria;
  const bloqueado = logs.find((l) => l.accion === 'reporte.bloqueado');
  assert.ok(bloqueado, 'debe existir un log reporte.bloqueado');
  assert.equal(bloqueado.actor, `agencia:${AGENCIA_OK.id}`, "actor debe ser 'agencia:<id>'");
});

await prueba('(b) iniciar compra (>=50) crea pendiente_pago SIN entregar dato; materializarReporte entrega/persiste/R2/audita', async () => {
  const db = crearD1({
    agencias: [AGENCIA_OK],
    api_tokens: TOKENS_OK,
    contribuciones: contribs(60, { region: 'Madrid', banda_edad: '25-34', categoria: 'compras_online', valor: 10 }),
  });
  const env = { PLATAFORMA_DB: db, REPORTES: crearR2(), PRECIO_BASE_SEGMENTO_CENTIMOS: 49900 };

  // --- F.1: iniciar la compra. NO se entrega ningún agregado todavía. ---
  const res = await worker.fetch(
    pedir('POST', '/v1/reportes', {
      token: TOKEN_OK,
      body: {
        definicion_segmento: { filtros: { region: 'Madrid', categoria: 'compras_online' }, metrica: 'valor' },
      },
    }),
    env,
  );

  assert.equal(res.status, 201, 'iniciar compra responde 201');
  const cuerpo = await res.json();
  assert.equal(cuerpo.estado, 'pendiente_pago', 'la compra arranca en pendiente_pago');
  assert.ok(cuerpo.reporte_id, 'devuelve reporte_id de seguimiento');
  assert.ok(cuerpo.transaccion_id, 'devuelve transaccion_id de seguimiento');
  assert.equal(cuerpo.precio_centimos, 49900);
  // PRIVACIDAD: iniciar compra NO entrega agregado ni n exacto ni hash.
  const textoIniciar = JSON.stringify(cuerpo);
  assert.equal('resultado' in cuerpo, false, 'iniciar compra no entrega celdas');
  assert.equal('n_usuarios' in cuerpo, false, 'iniciar compra no expone n exacto');
  assert.equal(textoIniciar.includes('usuario_id'), false, 'iniciar compra jamás contiene usuario_id');

  // Reporte en 'pendiente_pago' con n/k>=50; transacción en 'pendiente' con suma exacta.
  assert.equal(db._tablas.reportes.length, 1, 'debe existir 1 reporte iniciado');
  const filaRep = db._tablas.reportes[0];
  assert.equal(filaRep.estado, 'pendiente_pago');
  assert.ok(filaRep.n_usuarios >= 50 && filaRep.k_aplicado >= 50, 'CHECK k>=50 y n>=50');
  assert.equal(filaRep.agencia_id, AGENCIA_OK.id);
  assert.equal(db._tablas.transacciones.length, 1, 'debe registrar 1 transacción pendiente');
  const tx = db._tablas.transacciones[0];
  assert.equal(tx.estado, 'pendiente');
  assert.equal(tx.reporte_id, cuerpo.reporte_id);
  assert.equal(tx.comision_plataforma_centimos + tx.pool_usuarios_centimos, tx.importe_centimos, 'reparto 70/30 cuadra al céntimo');
  // Todavía NO se ha entregado nada: R2 vacío y sin log 'reporte.generado'.
  assert.equal(env.REPORTES._objetos.size, 0, 'sin pago no se sube nada a R2');
  assert.equal(db._tablas.logs_auditoria.some((l) => l.accion === 'reporte.generado'), false, 'aún no se generó el reporte');

  // --- F.3: el pago confirmado dispara la materialización (lo hace el webhook). ---
  const mat = await materializarReporte(env, cuerpo.reporte_id);
  assert.equal(mat.ok, true);
  assert.equal(mat.estado, 'entregado');

  // Ahora el reporte está 'entregado', con resultado_hash real (ya no el placeholder).
  assert.equal(filaRep.estado, 'entregado');
  assert.ok(filaRep.resultado_hash && filaRep.resultado_hash !== 'pendiente', 'hash real tras materializar');

  // Guardado en R2 bajo reportes/{id}.json, con el agregado correcto.
  const claveEsperada = `reportes/${cuerpo.reporte_id}.json`;
  assert.ok(env.REPORTES._objetos.has(claveEsperada), 'debe existir el objeto en R2');
  const guardado = JSON.parse(await (await env.REPORTES.get(claveEsperada)).text());
  assert.equal(guardado.n_usuarios, 60);
  assert.equal(guardado.resultado.celdas[0].n_usuarios, 60);
  assert.equal(guardado.resultado.celdas[0].media_valor, 10);

  // Auditado como 'reporte.generado' con resultado_hash y actor agencia:<id>.
  const gen = db._tablas.logs_auditoria.find((l) => l.accion === 'reporte.generado');
  assert.ok(gen, 'debe existir log reporte.generado');
  assert.equal(gen.actor, `agencia:${AGENCIA_OK.id}`);
  assert.equal(gen.entidad, 'reportes');
  assert.equal(gen.entidad_id, cuerpo.reporte_id);
  const det = JSON.parse(gen.detalles);
  assert.ok(det.resultado_hash, 'auditoría debe incluir resultado_hash');
  assert.equal(det.n_usuarios, 60);

  // --- F.2: GET /v1/reportes/{id} entrega el agregado a la agencia dueña (n exacto). ---
  const resGet = await worker.fetch(pedir('GET', `/v1/reportes/${cuerpo.reporte_id}`, { token: TOKEN_OK }), env);
  assert.equal(resGet.status, 200);
  const repGet = await resGet.json();
  assert.equal(repGet.estado, 'entregado');
  assert.equal(repGet.n_usuarios, 60, 'el reporte YA COMPRADO sí muestra el n exacto');
  assert.equal(repGet.resultado.celdas[0].media_valor, 10);
});

await prueba("(c) lo entregado tras pagar NUNCA contiene 'usuario_id' (ni en R2 ni en GET)", async () => {
  const db = crearD1({
    agencias: [AGENCIA_OK],
    api_tokens: TOKENS_OK,
    // Mezcla de bandas para forzar varias celdas y supresión.
    contribuciones: [
      ...contribs(80, { desde: 0, banda_edad: '25-34', categoria: 'compras_online', valor: 4 }),
      ...contribs(70, { desde: 80, banda_edad: '35-44', categoria: 'compras_online', valor: 5 }),
      ...contribs(20, { desde: 150, banda_edad: '65+', categoria: 'compras_online', valor: 6 }), // <50 -> suprimida
    ],
  });
  const env = { PLATAFORMA_DB: db, REPORTES: crearR2() };

  // Iniciar compra...
  const res = await worker.fetch(
    pedir('POST', '/v1/reportes', {
      token: TOKEN_OK,
      body: {
        definicion_segmento: {
          filtros: { categoria: 'compras_online' },
          dimensiones: ['banda_edad'],
          metrica: 'valor',
        },
      },
    }),
    env,
  );
  assert.equal(res.status, 201);
  const cuerpo = await res.json();
  // ...y materializar tras el "pago".
  const mat = await materializarReporte(env, cuerpo.reporte_id);
  assert.equal(mat.ok, true);

  // Lo que se guardó en R2 jamás contiene usuario_id ni un id concreto.
  const obj = await env.REPORTES.get(`reportes/${cuerpo.reporte_id}.json`);
  const textoR2 = await obj.text();
  assert.equal(textoR2.includes('usuario_id'), false, "el objeto R2 jamás contiene 'usuario_id'");
  assert.equal(textoR2.includes('"u0"'), false, 'no debe filtrar ids de usuario concretos');

  // El GET de entrega tampoco filtra nada y respeta k>=50 por celda.
  const resGet = await worker.fetch(pedir('GET', `/v1/reportes/${cuerpo.reporte_id}`, { token: TOKEN_OK }), env);
  const repGet = await resGet.json();
  assert.equal(JSON.stringify(repGet).includes('usuario_id'), false, "el GET jamás contiene 'usuario_id'");
  for (const celda of repGet.resultado.celdas) {
    assert.ok(celda.n_usuarios >= 50, 'cada celda entregada respeta k>=50');
  }
});

await prueba('(d) agencia SIN KYC verificada o SIN contrato -> 403 y NO inicia compra', async () => {
  const sinKyc = { ...AGENCIA_OK, id: 'ag-pendiente-002', kyc_estado: 'pendiente' };
  const sinContrato = { ...AGENCIA_OK, id: 'ag-sincontrato-003', kyc_estado: 'verificada', contrato_firmado_en: null };

  // Cada agencia tiene su propio token opaco (el token resuelve la agencia; luego falla el KYC).
  const TOK_SINKYC = 'tok_sinkyc_111';
  const TOK_SINCONTRATO = 'tok_sincontrato_222';
  const db = crearD1({
    agencias: [sinKyc, sinContrato],
    api_tokens: [tokenFila(sinKyc.id, TOK_SINKYC), tokenFila(sinContrato.id, TOK_SINCONTRATO)],
    contribuciones: contribs(200, { region: 'Madrid', categoria: 'compras_online' }), // de sobra para >=50
  });
  const env = { PLATAFORMA_DB: db, REPORTES: crearR2() };

  // (d.1) KYC pendiente
  const r1 = await worker.fetch(
    pedir('POST', '/v1/reportes', {
      token: TOK_SINKYC,
      body: { definicion_segmento: { filtros: { region: 'Madrid', categoria: 'compras_online' } } },
    }),
    env,
  );
  assert.equal(r1.status, 403, 'KYC pendiente -> 403');
  assert.equal((await r1.json()).error.codigo, 'kyc_no_verificada');

  // (d.2) Verificada pero sin contrato firmado
  const r2 = await worker.fetch(
    pedir('POST', '/v1/reportes', {
      token: TOK_SINCONTRATO,
      body: { definicion_segmento: { filtros: { region: 'Madrid', categoria: 'compras_online' } } },
    }),
    env,
  );
  assert.equal(r2.status, 403, 'sin contrato -> 403');
  assert.equal((await r2.json()).error.codigo, 'kyc_no_verificada');

  // No se inició ninguna compra pese a haber datos de sobra.
  assert.equal(db._tablas.reportes.length, 0, 'ninguna agencia no habilitada inicia compra');
  assert.equal(db._tablas.transacciones.length, 0, 'ninguna transacción para agencias no habilitadas');
  assert.equal(env.REPORTES._objetos.size, 0, 'R2 vacío');

  // Y el rechazo quedó auditado para ambas.
  const bloqueos = db._tablas.logs_auditoria.filter((l) => l.accion === 'reporte.bloqueado');
  assert.ok(bloqueos.length >= 2, 'ambos rechazos deben auditarse');
  assert.ok(bloqueos.some((l) => l.actor === `agencia:${sinKyc.id}`));
  assert.ok(bloqueos.some((l) => l.actor === `agencia:${sinContrato.id}`));
});

// ----------------------------------------------------------------------------
//  PRUEBAS EXTRA — endurecen el contrato (auth, catálogo, preview)
// ----------------------------------------------------------------------------

await prueba('(e) sin cabecera Bearer -> 401 auth_invalida', async () => {
  const db = crearD1({ agencias: [AGENCIA_OK], api_tokens: TOKENS_OK });
  const env = { PLATAFORMA_DB: db, REPORTES: crearR2() };
  const res = await worker.fetch(pedir('POST', '/v1/reportes', { body: { definicion_segmento: {} } }), env);
  assert.equal(res.status, 401);
  assert.equal((await res.json()).error.codigo, 'auth_invalida');
});

await prueba('(e2) el agencia_id YA NO sirve como credencial (token opaco); un token revocado tampoco', async () => {
  const db = crearD1({
    agencias: [AGENCIA_OK],
    // Token válido de AGENCIA_OK + un token REVOCADO de la misma agencia.
    api_tokens: [...TOKENS_OK, tokenFila(AGENCIA_OK.id, 'tok_revocado_999', { revocado_en: '2026-06-10T00:00:00Z' })],
    contribuciones: contribs(80, { region: 'Madrid', categoria: 'compras_online' }),
  });
  const env = { PLATAFORMA_DB: db, REPORTES: crearR2() };

  // (e2.1) Usar el agencia_id como Bearer -> 401 (ya no es un secreto válido).
  const rId = await worker.fetch(pedir('GET', '/v1/segmentos', { token: AGENCIA_OK.id }), env);
  assert.equal(rId.status, 401, 'el agencia_id no abre la puerta');
  assert.equal((await rId.json()).error.codigo, 'auth_invalida');

  // (e2.2) Usar un token REVOCADO -> 401.
  const rRev = await worker.fetch(pedir('GET', '/v1/segmentos', { token: 'tok_revocado_999' }), env);
  assert.equal(rRev.status, 401, 'un token revocado no autentica');

  // (e2.3) El token OPACO válido sí funciona y marca ultimo_uso_en.
  const rOk = await worker.fetch(pedir('GET', '/v1/segmentos', { token: TOKEN_OK }), env);
  assert.equal(rOk.status, 200, 'el token opaco válido autentica');
  const tokOk = db._tablas.api_tokens.find((t) => t.token_hash === sha256Hex(TOKEN_OK));
  assert.ok(tokOk.ultimo_uso_en, 'el uso del token sella ultimo_uso_en');
});

await prueba('(f) GET /v1/segmentos oculta categorías con < 50 usuarios (sin recuento)', async () => {
  const db = crearD1({
    agencias: [AGENCIA_OK],
    api_tokens: TOKENS_OK,
    contribuciones: [
      ...contribs(120, { desde: 0, categoria: 'compras_online' }), // >=50 -> visible con n
      ...contribs(12, { desde: 200, categoria: 'preferencia_ocio' }), // <50 -> oculto sin n
    ],
  });
  const env = { PLATAFORMA_DB: db, REPORTES: crearR2() };
  const res = await worker.fetch(pedir('GET', '/v1/segmentos', { token: TOKEN_OK }), env);
  assert.equal(res.status, 200);
  const cuerpo = await res.json();
  assert.equal(cuerpo.k_minimo_legal, 50);

  const compras = cuerpo.categorias.find((c) => c.categoria === 'compras_online');
  assert.equal(compras.disponible, true);
  assert.equal(compras.n_usuarios, 120, 'categoría >=50 muestra recuento');

  const ocio = cuerpo.categorias.find((c) => c.categoria === 'preferencia_ocio');
  assert.equal(ocio.disponible, false, 'categoría <50 NO disponible');
  assert.equal('n_usuarios' in ocio, false, 'categoría <50 NUNCA expone su recuento');
});

await prueba('(g) preview: NO entregable da recuento total; entregable da tamaño BINADO (sin n exacto ni celdas)', async () => {
  const db = crearD1({
    agencias: [AGENCIA_OK],
    api_tokens: TOKENS_OK,
    contribuciones: contribs(31, { region: 'Galicia', categoria: 'compras_online' }), // <50
  });
  const env = { PLATAFORMA_DB: db, REPORTES: crearR2() };

  // No entregable: solo recuento del total (la propia puerta del motor lo usa), ninguna celda.
  const r1 = await worker.fetch(
    pedir('POST', '/v1/segmentos/preview', {
      token: TOKEN_OK,
      body: { definicion: { filtros: { region: 'Galicia', categoria: 'compras_online' }, dimensiones: ['banda_edad'] } },
    }),
    env,
  );
  assert.equal(r1.status, 200);
  const c1 = await r1.json();
  assert.equal(c1.entregable, false);
  assert.equal(c1.n_usuarios, 31);
  assert.equal('celdas' in c1, false, 'preview no entregable jamás trae celdas');
  // No se persiste reporte por hacer preview.
  assert.equal(db._tablas.reportes.length, 0);

  // Entregable: tamaño APROXIMADO (binado a múltiplos de 50), NUNCA el n exacto.
  const db2 = crearD1({
    agencias: [AGENCIA_OK],
    api_tokens: TOKENS_OK,
    contribuciones: contribs(90, { region: 'Galicia', categoria: 'compras_online' }), // 90 -> bin 50
  });
  const env2 = { PLATAFORMA_DB: db2, REPORTES: crearR2() };
  const r2 = await worker.fetch(
    pedir('POST', '/v1/segmentos/preview', {
      token: TOKEN_OK,
      body: { definicion: { filtros: { region: 'Galicia', categoria: 'compras_online' } } },
    }),
    env2,
  );
  assert.equal(r2.status, 200);
  const c2 = await r2.json();
  assert.equal(c2.entregable, true);
  // ANTI-SONDEO: el preview NO expone el n exacto, solo el binado floor(n/50)*50.
  assert.equal('n_usuarios' in c2, false, 'el preview gratuito NO devuelve el n exacto');
  assert.equal(c2.n_usuarios_min, 50, 'n binado = floor(90/50)*50 = 50');
  assert.equal(c2.n_usuarios_etiqueta, '≥50');
  assert.equal(c2.k_aplicado, 50);
  assert.equal('celdas' in c2, false, 'preview entregable no trae celdas con valores');
});

await prueba('(h) categoría fuera de la lista blanca -> 422 categoria_no_permitida', async () => {
  const db = crearD1({
    agencias: [AGENCIA_OK],
    api_tokens: TOKENS_OK,
    contribuciones: contribs(80, { categoria: 'compras_online' }),
  });
  const env = { PLATAFORMA_DB: db, REPORTES: crearR2() };
  const res = await worker.fetch(
    pedir('POST', '/v1/reportes', {
      token: TOKEN_OK,
      body: { definicion_segmento: { filtros: { categoria: 'datos_salud' } } }, // no permitida
    }),
    env,
  );
  assert.equal(res.status, 422);
  assert.equal((await res.json()).error.codigo, 'categoria_no_permitida');
  assert.equal(db._tablas.reportes.length, 0);
  assert.equal(db._tablas.transacciones.length, 0, 'tampoco se registra transacción');
});

await prueba('(i) rate-limit: el preview se corta con 429 al superar el límite por agencia', async () => {
  const db = crearD1({
    agencias: [AGENCIA_OK],
    api_tokens: TOKENS_OK,
    contribuciones: contribs(80, { region: 'Madrid', categoria: 'compras_online' }),
  });
  // KV en memoria que cuenta (ignora expirationTtl en el test).
  const store = new Map();
  const RATE_LIMIT = {
    async get(k) { return store.has(k) ? store.get(k) : null; },
    async put(k, v) { store.set(k, v); },
  };
  const env = { PLATAFORMA_DB: db, REPORTES: crearR2(), RATE_LIMIT };
  const cuerpo = { definicion: { filtros: { region: 'Madrid', categoria: 'compras_online' } } };

  let ultimo;
  for (let i = 0; i < 61; i++) {
    ultimo = await worker.fetch(pedir('POST', '/v1/segmentos/preview', { token: TOKEN_OK, body: cuerpo }), env);
  }
  assert.equal(ultimo.status, 429, 'la petición 61 debe cortarse con 429');
  assert.equal((await ultimo.json()).error.codigo, 'demasiadas_peticiones');
});

await prueba('(j) GET /v1/reportes/{id}: pendiente_pago no entrega agregado; otra agencia recibe 404', async () => {
  const OTRA = { ...AGENCIA_OK, id: 'ag-otra-004' };
  const TOK_OTRA = 'tok_otra_agencia_777';
  const db = crearD1({
    agencias: [AGENCIA_OK, OTRA],
    api_tokens: [...TOKENS_OK, tokenFila(OTRA.id, TOK_OTRA)],
    contribuciones: contribs(80, { region: 'Madrid', categoria: 'compras_online', valor: 7 }),
  });
  const env = { PLATAFORMA_DB: db, REPORTES: crearR2() };

  // AGENCIA_OK inicia la compra (queda pendiente_pago, sin pagar).
  const ini = await worker.fetch(
    pedir('POST', '/v1/reportes', {
      token: TOKEN_OK,
      body: { definicion_segmento: { filtros: { region: 'Madrid', categoria: 'compras_online' }, metrica: 'valor' } },
    }),
    env,
  );
  const { reporte_id } = await ini.json();

  // F.2 sobre un reporte aún sin pagar: estado pendiente_pago, SIN agregado.
  const rPend = await worker.fetch(pedir('GET', `/v1/reportes/${reporte_id}`, { token: TOKEN_OK }), env);
  assert.equal(rPend.status, 200);
  const pend = await rPend.json();
  assert.equal(pend.estado, 'pendiente_pago');
  assert.equal('resultado' in pend, false, 'pendiente_pago no trae agregado');
  assert.equal(JSON.stringify(pend).includes('media_valor'), false, 'pendiente no filtra medias');

  // OTRA agencia (token válido propio) NO puede ver el reporte ajeno -> 404.
  const rAjeno = await worker.fetch(pedir('GET', `/v1/reportes/${reporte_id}`, { token: TOK_OTRA }), env);
  assert.equal(rAjeno.status, 404, 'un reporte ajeno responde 404 (sin confirmar su existencia)');
});

console.log(`\n${pasados} pruebas OK ✅`);

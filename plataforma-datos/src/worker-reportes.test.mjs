// ============================================================================
//  Pruebas del Worker w-reportes (k-anon, consent-first, B2B)
//  --------------------------------------------------------------------------
//  Ejecutar:  node plataforma-datos/src/worker-reportes.test.mjs
//
//  Usa un STUB EN MEMORIA de D1 y R2 (sin red, sin Cloudflare) que entiende
//  exactamente las consultas parametrizadas que emite el Worker. Las pruebas
//  cubren, por contrato:
//    (a) segmento < 50  -> 422 segmento_no_entregable + fila de auditoría.
//    (b) segmento >= 50 -> entregado, guardado en R2, persistido y auditado.
//    (c) la salida entregada NUNCA contiene 'usuario_id'.
//    (d) agencia sin KYC / sin contrato -> rechazada (403) y NO genera reporte.
//
//  Importante: las consultas usan SIEMPRE prepared statements (bind), nunca
//  concatenación de SQL; el stub falla si se intenta colar un valor por texto.
// ============================================================================

import assert from 'node:assert/strict';
import worker from './worker-reportes.mjs';

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
    contribuciones: seed.contribuciones ? [...seed.contribuciones] : [],
    categorias_permitidas: seed.categorias_permitidas
      ? [...seed.categorias_permitidas]
      : [
          { categoria: 'compras_online', descripcion: 'Frecuencia / interés de compra online (no especial)' },
          { categoria: 'preferencia_ocio', descripcion: 'Preferencias de ocio declaradas (no especial)' },
          { categoria: 'rango_gasto_mensual', descripcion: 'Banda de gasto mensual declarada (no especial)' },
        ],
    reportes: [],
    logs_auditoria: [],
  };
  let autoId = 1;

  // Normaliza espacios para reconocer la consulta independientemente del formato.
  const norm = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase();

  function ejecutar(sql, args) {
    const q = norm(sql);

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
      // Orden de columnas del Worker:
      // id, agencia_id, definicion_segmento, k_aplicado, n_usuarios, resultado_hash, precio_centimos, estado('entregado' literal)
      const [id, agencia_id, definicion_segmento, k_aplicado, n_usuarios, resultado_hash, precio_centimos] = args;
      // CHECKs del schema.sql -> el stub los hace cumplir como la BD real.
      if (!(Number(n_usuarios) >= 50)) throw new Error('CHECK constraint failed: n_usuarios >= 50');
      if (!(Number(k_aplicado) >= 50)) throw new Error('CHECK constraint failed: k_aplicado >= 50');
      if (!(Number(precio_centimos) >= 0)) throw new Error('CHECK constraint failed: precio_centimos >= 0');
      tablas.reportes.push({
        id,
        agencia_id,
        definicion_segmento,
        k_aplicado: Number(k_aplicado),
        n_usuarios: Number(n_usuarios),
        resultado_hash,
        precio_centimos: Number(precio_centimos),
        estado: 'entregado',
        generado_en: new Date().toISOString(),
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

await prueba('(a) segmento < 50 -> 422 segmento_no_entregable + auditoría del intento bloqueado', async () => {
  const db = crearD1({
    agencias: [AGENCIA_OK],
    contribuciones: contribs(49, { region: 'Madrid', categoria: 'compras_online' }),
  });
  const env = { PLATAFORMA_DB: db, REPORTES: crearR2() };

  const res = await worker.fetch(
    pedir('POST', '/v1/reportes', {
      token: AGENCIA_OK.id,
      body: { definicion_segmento: { filtros: { region: 'Madrid', categoria: 'compras_online' } } },
    }),
    env,
  );

  assert.equal(res.status, 422, 'segmento de 49 usuarios debe dar 422');
  const cuerpo = await res.json();
  assert.equal(cuerpo.error.codigo, 'segmento_no_entregable');

  // No se persiste ningún reporte.
  assert.equal(db._tablas.reportes.length, 0, 'no debe persistir reportes < 50');
  // R2 no recibe nada.
  assert.equal(env.REPORTES._objetos.size, 0, 'no debe subir nada a R2');

  // SÍ debe quedar registrado el intento bloqueado en auditoría.
  const logs = db._tablas.logs_auditoria;
  const bloqueado = logs.find((l) => l.accion === 'reporte.bloqueado');
  assert.ok(bloqueado, 'debe existir un log reporte.bloqueado');
  assert.equal(bloqueado.actor, `agencia:${AGENCIA_OK.id}`, "actor debe ser 'agencia:<id>'");
});

await prueba('(b) segmento >= 50 -> entregado (201), persistido en BD, guardado en R2 y auditado', async () => {
  const db = crearD1({
    agencias: [AGENCIA_OK],
    contribuciones: contribs(60, { region: 'Madrid', banda_edad: '25-34', categoria: 'compras_online', valor: 10 }),
  });
  const env = { PLATAFORMA_DB: db, REPORTES: crearR2(), PRECIO_BASE_SEGMENTO_CENTIMOS: 49900 };

  const res = await worker.fetch(
    pedir('POST', '/v1/reportes', {
      token: AGENCIA_OK.id,
      body: {
        definicion_segmento: { filtros: { region: 'Madrid', categoria: 'compras_online' }, metrica: 'valor' },
      },
    }),
    env,
  );

  assert.equal(res.status, 201, 'segmento de 60 usuarios debe entregarse (201)');
  const cuerpo = await res.json();
  assert.equal(cuerpo.estado, 'entregado');
  assert.equal(cuerpo.n_usuarios, 60);
  assert.equal(cuerpo.k_aplicado, 50);
  assert.ok(cuerpo.resultado_hash, 'debe traer resultado_hash');
  // El agregado trae la media de la métrica y n_usuarios por celda.
  assert.equal(cuerpo.resultado.celdas[0].n_usuarios, 60);
  assert.equal(cuerpo.resultado.celdas[0].media_valor, 10);

  // Persistido en `reportes` con k y n >= 50.
  assert.equal(db._tablas.reportes.length, 1, 'debe haber 1 reporte persistido');
  const fila = db._tablas.reportes[0];
  assert.ok(fila.n_usuarios >= 50 && fila.k_aplicado >= 50, 'CHECK k>=50 y n>=50');
  assert.equal(fila.estado, 'entregado');
  assert.equal(fila.agencia_id, AGENCIA_OK.id);

  // Guardado en R2 bajo reportes/{id}.json.
  const claveEsperada = `reportes/${cuerpo.reporte_id}.json`;
  assert.ok(env.REPORTES._objetos.has(claveEsperada), 'debe existir el objeto en R2');

  // Auditado como 'reporte.generado' con resultado_hash y actor agencia:<id>.
  const gen = db._tablas.logs_auditoria.find((l) => l.accion === 'reporte.generado');
  assert.ok(gen, 'debe existir log reporte.generado');
  assert.equal(gen.actor, `agencia:${AGENCIA_OK.id}`);
  assert.equal(gen.entidad, 'reportes');
  assert.equal(gen.entidad_id, cuerpo.reporte_id);
  const det = JSON.parse(gen.detalles);
  assert.ok(det.resultado_hash, 'auditoría debe incluir resultado_hash');
  assert.equal(det.n_usuarios, 60);
});

await prueba("(c) la salida entregada NUNCA contiene 'usuario_id' (ni en la respuesta ni en R2)", async () => {
  const db = crearD1({
    agencias: [AGENCIA_OK],
    // Mezcla de bandas para forzar varias celdas y supresión.
    contribuciones: [
      ...contribs(80, { desde: 0, banda_edad: '25-34', categoria: 'compras_online', valor: 4 }),
      ...contribs(70, { desde: 80, banda_edad: '35-44', categoria: 'compras_online', valor: 5 }),
      ...contribs(20, { desde: 150, banda_edad: '65+', categoria: 'compras_online', valor: 6 }), // <50 -> suprimida
    ],
  });
  const env = { PLATAFORMA_DB: db, REPORTES: crearR2() };

  const res = await worker.fetch(
    pedir('POST', '/v1/reportes', {
      token: AGENCIA_OK.id,
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
  const textoRespuesta = JSON.stringify(await res.clone().json());
  assert.equal(textoRespuesta.includes('usuario_id'), false, "la respuesta jamás contiene 'usuario_id'");
  assert.equal(textoRespuesta.includes('"u0"'), false, 'no debe filtrar ids de usuario concretos');

  const cuerpo = await res.json();
  // Lo que se guardó en R2 tampoco contiene usuario_id.
  const obj = await env.REPORTES.get(`reportes/${cuerpo.reporte_id}.json`);
  const textoR2 = await obj.text();
  assert.equal(textoR2.includes('usuario_id'), false, "el objeto R2 jamás contiene 'usuario_id'");

  // Coherencia k-anon: cada celda entregada tiene n_usuarios >= 50.
  for (const celda of cuerpo.resultado.celdas) {
    assert.ok(celda.n_usuarios >= 50, 'cada celda entregada respeta k>=50');
  }
});

await prueba('(d) agencia SIN KYC verificada o SIN contrato -> 403 y NO genera reporte', async () => {
  const sinKyc = { ...AGENCIA_OK, id: 'ag-pendiente-002', kyc_estado: 'pendiente' };
  const sinContrato = { ...AGENCIA_OK, id: 'ag-sincontrato-003', kyc_estado: 'verificada', contrato_firmado_en: null };

  const db = crearD1({
    agencias: [sinKyc, sinContrato],
    contribuciones: contribs(200, { region: 'Madrid', categoria: 'compras_online' }), // de sobra para >=50
  });
  const env = { PLATAFORMA_DB: db, REPORTES: crearR2() };

  // (d.1) KYC pendiente
  const r1 = await worker.fetch(
    pedir('POST', '/v1/reportes', {
      token: sinKyc.id,
      body: { definicion_segmento: { filtros: { region: 'Madrid', categoria: 'compras_online' } } },
    }),
    env,
  );
  assert.equal(r1.status, 403, 'KYC pendiente -> 403');
  assert.equal((await r1.json()).error.codigo, 'kyc_no_verificada');

  // (d.2) Verificada pero sin contrato firmado
  const r2 = await worker.fetch(
    pedir('POST', '/v1/reportes', {
      token: sinContrato.id,
      body: { definicion_segmento: { filtros: { region: 'Madrid', categoria: 'compras_online' } } },
    }),
    env,
  );
  assert.equal(r2.status, 403, 'sin contrato -> 403');
  assert.equal((await r2.json()).error.codigo, 'kyc_no_verificada');

  // No se generó ni persistió ningún reporte pese a haber datos de sobra.
  assert.equal(db._tablas.reportes.length, 0, 'ninguna agencia no habilitada genera reporte');
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
  const db = crearD1({ agencias: [AGENCIA_OK] });
  const env = { PLATAFORMA_DB: db, REPORTES: crearR2() };
  const res = await worker.fetch(pedir('POST', '/v1/reportes', { body: { definicion_segmento: {} } }), env);
  assert.equal(res.status, 401);
  assert.equal((await res.json()).error.codigo, 'auth_invalida');
});

await prueba('(f) GET /v1/segmentos oculta categorías con < 50 usuarios (sin recuento)', async () => {
  const db = crearD1({
    agencias: [AGENCIA_OK],
    contribuciones: [
      ...contribs(120, { desde: 0, categoria: 'compras_online' }), // >=50 -> visible con n
      ...contribs(12, { desde: 200, categoria: 'preferencia_ocio' }), // <50 -> oculto sin n
    ],
  });
  const env = { PLATAFORMA_DB: db, REPORTES: crearR2() };
  const res = await worker.fetch(pedir('GET', '/v1/segmentos', { token: AGENCIA_OK.id }), env);
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

await prueba('(g) POST /v1/segmentos/preview informa entregabilidad SIN datos de celdas', async () => {
  const db = crearD1({
    agencias: [AGENCIA_OK],
    contribuciones: contribs(31, { region: 'Galicia', categoria: 'compras_online' }), // <50
  });
  const env = { PLATAFORMA_DB: db, REPORTES: crearR2() };

  // No entregable: solo recuento del total, ninguna celda.
  const r1 = await worker.fetch(
    pedir('POST', '/v1/segmentos/preview', {
      token: AGENCIA_OK.id,
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

  // Entregable: estimaciones sin valores.
  const db2 = crearD1({
    agencias: [AGENCIA_OK],
    contribuciones: contribs(90, { region: 'Galicia', categoria: 'compras_online' }),
  });
  const env2 = { PLATAFORMA_DB: db2, REPORTES: crearR2() };
  const r2 = await worker.fetch(
    pedir('POST', '/v1/segmentos/preview', {
      token: AGENCIA_OK.id,
      body: { definicion: { filtros: { region: 'Galicia', categoria: 'compras_online' } } },
    }),
    env2,
  );
  assert.equal(r2.status, 200);
  const c2 = await r2.json();
  assert.equal(c2.entregable, true);
  assert.equal(c2.n_usuarios, 90);
  assert.equal(c2.k_aplicado, 50);
  assert.equal('celdas' in c2, false, 'preview entregable no trae celdas con valores');
});

await prueba('(h) categoría fuera de la lista blanca -> 422 categoria_no_permitida', async () => {
  const db = crearD1({
    agencias: [AGENCIA_OK],
    contribuciones: contribs(80, { categoria: 'compras_online' }),
  });
  const env = { PLATAFORMA_DB: db, REPORTES: crearR2() };
  const res = await worker.fetch(
    pedir('POST', '/v1/reportes', {
      token: AGENCIA_OK.id,
      body: { definicion_segmento: { filtros: { categoria: 'datos_salud' } } }, // no permitida
    }),
    env,
  );
  assert.equal(res.status, 422);
  assert.equal((await res.json()).error.codigo, 'categoria_no_permitida');
  assert.equal(db._tablas.reportes.length, 0);
});

await prueba('(i) rate-limit: el preview se corta con 429 al superar el límite por agencia', async () => {
  const db = crearD1({
    agencias: [AGENCIA_OK],
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
    ultimo = await worker.fetch(pedir('POST', '/v1/segmentos/preview', { token: AGENCIA_OK.id, body: cuerpo }), env);
  }
  assert.equal(ultimo.status, 429, 'la petición 61 debe cortarse con 429');
  assert.equal((await ultimo.json()).error.codigo, 'demasiadas_peticiones');
});

console.log(`\n${pasados} pruebas OK ✅`);

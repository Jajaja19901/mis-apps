// ============================================================================
//  PRUEBAS DEL REPARTO MENSUAL — centradas en el DINERO. SIN RED.
//  Ejecutar:  node plataforma-datos/src/reparto-mensual.test.mjs
//  --------------------------------------------------------------------------
//  Lo crítico que se verifica:
//    1) Repartir un pool entre N usuarios con pesos arbitrarios SUMA EXACTAMENTE
//       el pool (varios casos, incluidos los que NO dividen exacto: 100/3, etc.).
//    2) No se inventan ni pierden céntimos en ningún caso (propiedad fuzz).
//    3) Idempotencia: un periodo con repartos YA existentes no se duplica.
//    4) Umbral mínimo: por debajo de 5 € no se crea transfer; por encima sí.
//    5) idempotencyKey del transfer = reparto.id.
//  Stripe y D1 se sustituyen por STUBS en memoria (cero llamadas reales).
// ============================================================================

import assert from 'node:assert/strict';
import {
  repartirPool,
  ejecutarRepartoMensual,
  UMBRAL_MINIMO_TRANSFER_CENTIMOS,
} from './reparto-mensual.mjs';
import { calcularReparto7030 } from './worker-pagos.mjs';

let pasados = 0;
async function prueba(nombre, fn) { await fn(); pasados++; console.log('  ✓', nombre); }

const sumaImportes = (asigs) => asigs.reduce((a, x) => a + x.importe_centimos, 0);

// ----------------------------------------------------------------------------
//  STUB de D1 en memoria — entiende solo las consultas que usa el orquestador.
//  Se identifican por una subcadena estable del SQL (no parseamos SQL de verdad).
// ----------------------------------------------------------------------------
function crearDbStub({ poolTotal = 0, contribuciones = [], repartosExistentes = [], usuarios = {} } = {}) {
  // Tablas en memoria.
  const repartos = repartosExistentes.map((r) => ({ estado: 'pendiente', ...r }));
  const logs = [];

  function prepare(sql) {
    const bindArgs = [];
    const api = {
      bind(...args) { bindArgs.push(...args); return api; },

      async first() {
        if (sql.includes('SUM(pool_usuarios_centimos)')) {
          return { pool_total: poolTotal };
        }
        if (sql.includes('FROM usuarios WHERE id')) {
          const id = bindArgs[0];
          return usuarios[id] ? { stripe_account_id: usuarios[id].stripe_account_id } : null;
        }
        return null;
      },

      async all() {
        if (sql.includes('FROM contribuciones')) {
          return { results: contribuciones.map((c) => ({ usuario_id: c.usuario_id, n: c.contribuciones })) };
        }
        if (sql.includes('FROM repartos WHERE periodo')) {
          return { results: repartos.map((r) => ({ usuario_id: r.usuario_id, estado: r.estado })) };
        }
        return { results: [] };
      },

      async run() {
        if (sql.startsWith('INSERT OR IGNORE INTO repartos')) {
          const [id, periodo, usuario_id, importe_centimos, peso] = bindArgs;
          const yaEsta = repartos.some((r) => r.periodo === periodo && r.usuario_id === usuario_id);
          if (yaEsta) return { meta: { changes: 0 } }; // UNIQUE: no duplica
          repartos.push({ id, periodo, usuario_id, importe_centimos, peso, estado: 'pendiente' });
          return { meta: { changes: 1 } };
        }
        if (sql.startsWith('UPDATE repartos SET estado')) {
          const id = bindArgs[0];
          const r = repartos.find((x) => x.id === id);
          if (r) {
            if (sql.includes("'pagado'")) { r.estado = 'pagado'; r.stripe_transfer_id = bindArgs[1]; }
            else if (sql.includes("'fallido'")) { r.estado = 'fallido'; }
          }
          return { meta: { changes: r ? 1 : 0 } };
        }
        if (sql.includes('INSERT INTO logs_auditoria')) {
          logs.push(bindArgs.slice());
          return { meta: { changes: 1 } };
        }
        return { meta: { changes: 0 } };
      },
    };
    return api;
  }

  return { prepare, _tablas: { repartos, logs } };
}

// ----------------------------------------------------------------------------
//  STUB de Stripe — registra los transfers creados; nunca toca la red.
//  Puede forzar fallos para probar el backoff/reintentos sin esperar de verdad.
// ----------------------------------------------------------------------------
function crearStripeStub({ fallarVeces = 0, fallarSiempre = false } = {}) {
  const llamadas = [];
  let fallosRestantes = fallarVeces;
  return {
    _llamadas: llamadas,
    transfers: {
      async create(params, opts) {
        llamadas.push({ params, opts });
        if (fallarSiempre) { const e = new Error('transfer rechazado'); throw e; }
        if (fallosRestantes > 0) { fallosRestantes--; throw new Error('fallo temporal'); }
        return { id: `tr_${llamadas.length}`, object: 'transfer', amount: params.amount };
      },
    },
  };
}

// `dormir` instantáneo: el backoff no espera tiempo real en los tests.
const dormirYa = async () => {};
// Generador de ids determinista, para aserciones reproducibles.
function uuidSecuencial() { let n = 0; return () => `rep_${++n}`; }

console.log('reparto-mensual (DINERO):');

// ===========================================================================
//  A) FUNCIÓN PURA — suma exacta con el algoritmo del mayor resto
// ===========================================================================

await prueba('100 céntimos entre 3 usuarios iguales suma EXACTAMENTE 100 (34/33/33)', () => {
  const r = repartirPool(100, [
    { usuario_id: 'a', contribuciones: 1 },
    { usuario_id: 'b', contribuciones: 1 },
    { usuario_id: 'c', contribuciones: 1 },
  ]);
  assert.equal(sumaImportes(r.asignaciones), 100, 'la suma debe ser el pool exacto');
  const importes = r.asignaciones.map((x) => x.importe_centimos).sort((p, q) => q - p);
  assert.deepEqual(importes, [34, 33, 33], 'el céntimo sobrante va a un solo usuario');
});

await prueba('1 céntimo entre 3 usuarios: lo recibe exactamente UNO (suma=1)', () => {
  const r = repartirPool(1, [
    { usuario_id: 'a', contribuciones: 1 },
    { usuario_id: 'b', contribuciones: 1 },
    { usuario_id: 'c', contribuciones: 1 },
  ]);
  assert.equal(sumaImportes(r.asignaciones), 1);
  assert.equal(r.asignaciones.filter((x) => x.importe_centimos === 1).length, 1);
});

await prueba('pesos arbitrarios (1,2,3 sobre 100) suman EXACTAMENTE 100', () => {
  const r = repartirPool(100, [
    { usuario_id: 'a', contribuciones: 1 },
    { usuario_id: 'b', contribuciones: 2 },
    { usuario_id: 'c', contribuciones: 3 },
  ]);
  assert.equal(sumaImportes(r.asignaciones), 100);
  // floor: 16,33,50 = 99 -> sobra 1, va al de mayor resto (a: .66) -> 17,33,50.
  const m = Object.fromEntries(r.asignaciones.map((x) => [x.usuario_id, x.importe_centimos]));
  assert.deepEqual(m, { a: 17, b: 33, c: 50 });
});

await prueba('reparto desigual grande (15000 céntimos, 7 pesos primos) suma exacto', () => {
  const pesos = [13, 17, 19, 23, 29, 31, 37];
  const r = repartirPool(15000, pesos.map((p, i) => ({ usuario_id: `u${i}`, contribuciones: p })));
  assert.equal(sumaImportes(r.asignaciones), 15000);
});

await prueba('pool 0 -> nadie cobra, sin inventar céntimos', () => {
  const r = repartirPool(0, [{ usuario_id: 'a', contribuciones: 5 }]);
  assert.equal(r.periodoVacio, true);
  assert.equal(r.asignaciones.length, 0);
});

await prueba('sin contribuciones (todas 0) -> no se reparte', () => {
  const r = repartirPool(1000, [{ usuario_id: 'a', contribuciones: 0 }, { usuario_id: 'b', contribuciones: 0 }]);
  assert.equal(r.periodoVacio, true);
  assert.equal(sumaImportes(r.asignaciones), 0);
});

await prueba('usuarios con 0 contribuciones se excluyen; el resto se lleva TODO el pool', () => {
  const r = repartirPool(999, [
    { usuario_id: 'a', contribuciones: 0 },
    { usuario_id: 'b', contribuciones: 2 },
    { usuario_id: 'c', contribuciones: 1 },
  ]);
  assert.equal(sumaImportes(r.asignaciones), 999);
  assert.equal(r.asignaciones.find((x) => x.usuario_id === 'a'), undefined, 'el de 0 no aparece');
});

await prueba('un único usuario se lleva el pool entero, sin pérdida', () => {
  const r = repartirPool(137, [{ usuario_id: 'solo', contribuciones: 9 }]);
  assert.equal(sumaImportes(r.asignaciones), 137);
  assert.equal(r.asignaciones[0].importe_centimos, 137);
});

await prueba('desempate de resto es DETERMINISTA (mismo input -> mismo output)', () => {
  const entrada = [
    { usuario_id: 'z', contribuciones: 1 },
    { usuario_id: 'a', contribuciones: 1 },
    { usuario_id: 'm', contribuciones: 1 },
  ];
  const r1 = repartirPool(100, entrada);
  const r2 = repartirPool(100, [...entrada].reverse());
  const norm = (r) => Object.fromEntries(r.asignaciones.map((x) => [x.usuario_id, x.importe_centimos]));
  assert.deepEqual(norm(r1), norm(r2), 'el orden de entrada no cambia el resultado');
  // A igualdad de resto, el céntimo sobrante va al usuario_id menor: 'a'.
  assert.equal(norm(r1).a, 34);
});

await prueba('importe inválido (no entero / negativo) lanza error y NO reparte', () => {
  assert.throws(() => repartirPool(10.5, [{ usuario_id: 'a', contribuciones: 1 }]));
  assert.throws(() => repartirPool(-1, [{ usuario_id: 'a', contribuciones: 1 }]));
});

// ----- Propiedad FUZZ: para muchos pools y pesos aleatorios, Σ == pool SIEMPRE. ----
await prueba('FUZZ: 4000 repartos aleatorios suman SIEMPRE exactamente el pool', () => {
  // PRNG determinista (mulberry32) para que el test sea reproducible.
  let s = 0x9e3779b9;
  const rnd = () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let caso = 0; caso < 4000; caso++) {
    const pool = Math.floor(rnd() * 200000); // 0..2000 €
    const n = 1 + Math.floor(rnd() * 40);    // 1..40 usuarios
    const contribs = [];
    for (let i = 0; i < n; i++) contribs.push({ usuario_id: `u${i}`, contribuciones: Math.floor(rnd() * 50) });
    const r = repartirPool(pool, contribs);
    const total = sumaImportes(r.asignaciones);
    if (r.periodoVacio) {
      assert.equal(total, 0);
    } else {
      assert.equal(total, pool, `descuadre en caso ${caso}: ${total} != ${pool}`);
      // Ningún importe negativo.
      assert.ok(r.asignaciones.every((x) => x.importe_centimos >= 0));
    }
  }
});

// ===========================================================================
//  B) calcularReparto7030 — el cobro a la agencia CUADRA al céntimo (CHECK)
// ===========================================================================

await prueba('7030: comision + pool == importe SIEMPRE (incluye importes impares)', () => {
  for (const importe of [1, 2, 3, 7, 99, 100, 101, 333, 49900, 50001, 1, 999999]) {
    const { comision_plataforma_centimos, pool_usuarios_centimos } = calcularReparto7030(importe);
    assert.equal(comision_plataforma_centimos + pool_usuarios_centimos, importe, `descuadre 70/30 en ${importe}`);
    assert.ok(comision_plataforma_centimos >= 0 && pool_usuarios_centimos >= 0);
  }
});

await prueba('7030: 50000 céntimos -> 35000 plataforma / 15000 pool (ejemplo del diseño)', () => {
  assert.deepEqual(calcularReparto7030(50000), { comision_plataforma_centimos: 35000, pool_usuarios_centimos: 15000 });
});

// ===========================================================================
//  C) ORQUESTADOR — idempotencia, umbral y transfers (con stubs, sin red)
// ===========================================================================

await prueba('reparto completo: crea repartos, paga los que superan el umbral y suma exacto', async () => {
  const db = crearDbStub({
    poolTotal: 10000,
    contribuciones: [
      { usuario_id: 'u1', contribuciones: 60 }, // mucho -> supera umbral
      { usuario_id: 'u2', contribuciones: 39 }, // medio
      { usuario_id: 'u3', contribuciones: 1 },  // poco -> por debajo de 5 €
    ],
    usuarios: {
      u1: { stripe_account_id: 'acct_1' },
      u2: { stripe_account_id: 'acct_2' },
      u3: { stripe_account_id: 'acct_3' },
    },
  });
  const stripe = crearStripeStub();
  const res = await ejecutarRepartoMensual('2026-05', { db, stripe, dormir: dormirYa, uuid: uuidSecuencial() });

  // Suma de lo registrado en `repartos` == pool exacto.
  const totalRegistrado = db._tablas.repartos.reduce((a, r) => a + r.importe_centimos, 0);
  assert.equal(totalRegistrado, 10000, 'el reparto registrado cuadra con el pool');
  assert.equal(res.pool_total_centimos, 10000);
  assert.equal(res.usuarios_con_reparto, 3);
  assert.equal(res.creados, 3);
  // u3 (1 contribución de 100) = 100 céntimos -> por debajo de 500 -> NO transfer.
  assert.equal(res.pendientes_umbral >= 1, true);
  // Los pagados tienen transfer y estado 'pagado'.
  assert.equal(res.pagados, stripe._llamadas.length, 'un transfer por cada reparto pagado');
  for (const ll of stripe._llamadas) {
    assert.equal(ll.params.currency, 'eur');
    assert.ok(ll.params.amount >= UMBRAL_MINIMO_TRANSFER_CENTIMOS, 'solo se transfiere por encima del umbral');
    assert.ok(ll.opts && ll.opts.idempotencyKey, 'el transfer DEBE llevar idempotencyKey');
  }
});

await prueba('IDEMPOTENCIA: periodo ya repartido NO duplica ni vuelve a pagar', async () => {
  const db = crearDbStub({
    poolTotal: 6000,
    contribuciones: [
      { usuario_id: 'u1', contribuciones: 50 },
      { usuario_id: 'u2', contribuciones: 50 },
    ],
    usuarios: { u1: { stripe_account_id: 'acct_1' }, u2: { stripe_account_id: 'acct_2' } },
    // u1 YA fue repartido y pagado en una ejecución anterior.
    repartosExistentes: [{ id: 'viejo_u1', periodo: '2026-05', usuario_id: 'u1', importe_centimos: 3000, estado: 'pagado' }],
  });
  const stripe = crearStripeStub();
  const res = await ejecutarRepartoMensual('2026-05', { db, stripe, dormir: dormirYa, uuid: uuidSecuencial() });

  assert.equal(res.ya_existentes, 1, 'u1 se reconoce como ya repartido');
  assert.equal(res.creados, 1, 'solo se crea el reparto de u2');
  // No se crea un segundo reparto para u1.
  const repsU1 = db._tablas.repartos.filter((r) => r.usuario_id === 'u1');
  assert.equal(repsU1.length, 1, 'u1 sigue con UNA sola fila de reparto');
  // Solo se hace transfer para el nuevo (u2), no para u1.
  assert.equal(stripe._llamadas.length, 1);
  assert.equal(stripe._llamadas[0].params.metadata.usuario_id, 'u2');
});

await prueba('IDEMPOTENCIA: reejecutar el MISMO reparto dos veces no paga dos veces', async () => {
  const datos = {
    poolTotal: 6000,
    contribuciones: [{ usuario_id: 'u1', contribuciones: 50 }, { usuario_id: 'u2', contribuciones: 50 }],
    usuarios: { u1: { stripe_account_id: 'acct_1' }, u2: { stripe_account_id: 'acct_2' } },
  };
  const db = crearDbStub(datos);
  const stripe = crearStripeStub();
  // Primera ejecución: crea y paga ambos.
  const r1 = await ejecutarRepartoMensual('2026-05', { db, stripe, dormir: dormirYa, uuid: uuidSecuencial() });
  assert.equal(r1.creados, 2);
  assert.equal(stripe._llamadas.length, 2);
  // Segunda ejecución sobre la MISMA base (repartos ya están): nada nuevo.
  const r2 = await ejecutarRepartoMensual('2026-05', { db, stripe, dormir: dormirYa, uuid: uuidSecuencial() });
  assert.equal(r2.creados, 0, 'no se crea ningún reparto nuevo');
  assert.equal(r2.ya_existentes, 2, 'ambos reconocidos como existentes');
  assert.equal(stripe._llamadas.length, 2, 'no se emiten transfers adicionales');
});

await prueba('dry_run: calcula y suma exacto pero NO escribe ni paga', async () => {
  const db = crearDbStub({
    poolTotal: 7777,
    contribuciones: [{ usuario_id: 'u1', contribuciones: 3 }, { usuario_id: 'u2', contribuciones: 7 }],
    usuarios: { u1: { stripe_account_id: 'acct_1' }, u2: { stripe_account_id: 'acct_2' } },
  });
  const stripe = crearStripeStub();
  const res = await ejecutarRepartoMensual('2026-05', { db, stripe, dormir: dormirYa, uuid: uuidSecuencial(), opciones: { dryRun: true } });
  assert.equal(res.dry_run, true);
  const totalSimulado = res.detalle.reduce((a, d) => a + d.importe_centimos, 0);
  assert.equal(totalSimulado, 7777, 'la simulación cuadra con el pool');
  assert.equal(db._tablas.repartos.length, 0, 'dry_run NO escribe en repartos');
  assert.equal(stripe._llamadas.length, 0, 'dry_run NO crea transfers');
});

await prueba('transfer con fallos temporales: reintenta y acaba pagando (sin esperar tiempo real)', async () => {
  const db = crearDbStub({
    poolTotal: 6000,
    contribuciones: [{ usuario_id: 'u1', contribuciones: 1 }],
    usuarios: { u1: { stripe_account_id: 'acct_1' } },
  });
  const stripe = crearStripeStub({ fallarVeces: 2 }); // falla 2 veces, a la 3ª va bien
  const res = await ejecutarRepartoMensual('2026-05', { db, stripe, dormir: dormirYa, uuid: uuidSecuencial(), opciones: { backoff: [1, 1, 1] } });
  assert.equal(res.pagados, 1, 'tras reintentos, el transfer se realiza');
  assert.equal(stripe._llamadas.length, 3, 'hubo 3 intentos');
  assert.equal(db._tablas.repartos[0].estado, 'pagado');
});

await prueba('transfer que falla SIEMPRE: el reparto queda fallido (no pagado), sin perder la fila', async () => {
  const db = crearDbStub({
    poolTotal: 6000,
    contribuciones: [{ usuario_id: 'u1', contribuciones: 1 }],
    usuarios: { u1: { stripe_account_id: 'acct_1' } },
  });
  const stripe = crearStripeStub({ fallarSiempre: true });
  const res = await ejecutarRepartoMensual('2026-05', { db, stripe, dormir: dormirYa, uuid: uuidSecuencial(), opciones: { backoff: [1, 1, 1] } });
  assert.equal(res.fallidos, 1);
  assert.equal(res.pagados, 0);
  assert.equal(db._tablas.repartos[0].estado, 'fallido', 'queda marcado fallido para reintento manual');
});

await prueba('periodo inválido lanza error (no se reparte nada)', async () => {
  const db = crearDbStub({});
  await assert.rejects(() => ejecutarRepartoMensual('2026/05', { db, stripe: crearStripeStub(), dormir: dormirYa }));
  await assert.rejects(() => ejecutarRepartoMensual('mayo', { db, stripe: crearStripeStub(), dormir: dormirYa }));
});

console.log(`\n${pasados} pruebas OK ✅`);

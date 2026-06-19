// Pruebas del motor de k-anonimato.  Ejecutar:  node plataforma-datos/src/k-anonimato.test.mjs
import assert from 'node:assert/strict';
import { generarReporteAgregado, K_MINIMO_LEGAL } from './k-anonimato.mjs';

let pasados = 0;
function prueba(nombre, fn) { fn(); pasados++; console.log('  ✓', nombre); }

// Genera contribuciones sintéticas a partir de una especificación compacta.
function hacer(spec) {
  const out = [];
  let uid = 0;
  for (const s of spec) {
    for (let i = 0; i < s.usuarios; i++) {
      out.push({ usuario_id: `u${uid++}`, region: s.region, banda_edad: s.banda_edad, valor: s.valor ?? 1 });
    }
  }
  return out;
}

console.log('k-anonimato:');

prueba('segmento con < 50 usuarios NO se entrega', () => {
  const r = generarReporteAgregado(hacer([{ usuarios: 49, region: 'Madrid' }]), { filtros: { region: 'Madrid' } });
  assert.equal(r.entregable, false);
  assert.equal(r.reporte, null);
  assert.ok(r.auditoria.resultado_hash, 'debe registrar auditoría aunque no se entregue');
});

prueba('segmento con >= 50 usuarios se entrega como agregado (con media)', () => {
  const r = generarReporteAgregado(hacer([{ usuarios: 50, region: 'Madrid', valor: 10 }]),
    { filtros: { region: 'Madrid' }, metrica: 'valor' });
  assert.equal(r.entregable, true);
  assert.equal(r.reporte.n_usuarios, 50);
  assert.equal(r.reporte.celdas[0].media_valor, 10);
  assert.equal(JSON.stringify(r.reporte).includes('usuario_id'), false, 'jamás identificadores individuales');
});

prueba('cuenta usuarios DISTINTOS, no filas (50 personas x 3 filas = 50)', () => {
  const datos = [];
  for (let u = 0; u < 50; u++) for (let f = 0; f < 3; f++) datos.push({ usuario_id: `u${u}`, region: 'Cadiz' });
  const r = generarReporteAgregado(datos, { filtros: { region: 'Cadiz' } });
  assert.equal(r.entregable, true);
  assert.equal(r.reporte.n_usuarios, 50);
});

prueba('celdas con < k se suprimen (las >= k se mantienen)', () => {
  const r = generarReporteAgregado(hacer([
    { usuarios: 80, region: 'Madrid', banda_edad: '25-34' },
    { usuarios: 30, region: 'Madrid', banda_edad: '65+'  },  // < 50 -> fuera
    { usuarios: 20, region: 'Madrid', banda_edad: '55-64' }, // < 50 -> fuera
    { usuarios: 70, region: 'Madrid', banda_edad: '35-44' },
  ]), { filtros: { region: 'Madrid' }, dimensiones: ['banda_edad'] });
  const bandas = r.reporte.celdas.map((c) => c.banda_edad);
  assert.deepEqual(new Set(bandas), new Set(['25-34', '35-44']));
  assert.equal(r.reporte.celdas_suprimidas, 2);
});

prueba('una sola celda suprimida -> se suprime una segunda (anti divulgación complementaria)', () => {
  const r = generarReporteAgregado(hacer([
    { usuarios: 80, region: 'Madrid', banda_edad: '25-34' },
    { usuarios: 70, region: 'Madrid', banda_edad: '35-44' },
    { usuarios: 30, region: 'Madrid', banda_edad: '65+'  },  // única < 50
  ]), { filtros: { region: 'Madrid' }, dimensiones: ['banda_edad'] });
  assert.equal(r.reporte.celdas_suprimidas, 2);
  assert.equal(r.reporte.celdas.length, 1);
});

prueba('k no puede bajar de 50 aunque se pida k=5', () => {
  const r = generarReporteAgregado(hacer([{ usuarios: 49, region: 'Madrid' }]), { filtros: { region: 'Madrid' } }, { k: 5 });
  assert.equal(r.entregable, false);
  assert.equal(r.auditoria.k_aplicado, K_MINIMO_LEGAL);
});

console.log(`\n${pasados} pruebas OK ✅`);

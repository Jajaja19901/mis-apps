// ============================================================================
//  MOTOR DE AGREGACIÓN CON k-ANONIMATO ESTRICTO (k >= 50)
//  --------------------------------------------------------------------------
//  Pieza LEGALMENTE CRÍTICA. Garantiza que ningún reporte permita reidentificar
//  a una persona. Reglas que aplica:
//    - Solo devuelve AGREGADOS (conteos / medias). Nunca filas individuales.
//    - Cuenta usuarios DISTINTOS (no filas): un usuario con varias
//      contribuciones cuenta como 1.
//    - Si el segmento total tiene < k usuarios distintos  -> NO entrega nada.
//    - Toda celda de salida con < k usuarios se SUPRIME.
//    - Anti "divulgación complementaria": si solo queda 1 celda suprimida, se
//      suprime también la celda entregable más pequeña (para que no se despeje
//      por resta respecto al total).
//    - k NUNCA puede bajar de K_MINIMO_LEGAL aunque se pida por parámetro.
//    - Devuelve SIEMPRE un registro de auditoría obligatorio.
//
//  Sin dependencias -> portable a Cloudflare Workers tal cual.
//  Las contribuciones llegan ya seudonimizadas y con cuasi-identificadores
//  generalizados (banda de edad, región...), como las guarda el esquema D1.
//
//  Nota: para máxima protección, en producción conviene complementar con ruido
//  (privacidad diferencial) y no publicar totales exactos. Aquí implementamos la
//  garantía dura de k>=50 + supresión, que es el requisito legal mínimo.
// ============================================================================

export const K_MINIMO_LEGAL = 50;

/** Hash determinista (FNV-1a, 32 bits) para integridad/no repudio del resultado.
 *  No es criptográfico: en producción firma el reporte con HMAC del servidor. */
function hashFNV1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return ('00000000' + h.toString(16)).slice(-8);
}

/** ¿La contribución cumple los filtros del segmento? (igualdad o pertenencia a lista) */
function coincideFiltro(contrib, filtros) {
  if (!filtros) return true;
  return Object.entries(filtros).every(([campo, valor]) =>
    Array.isArray(valor) ? valor.includes(contrib[campo]) : contrib[campo] === valor
  );
}

/** Clave de celda a partir de las dimensiones pedidas. */
function claveCelda(contrib, dimensiones) {
  return dimensiones.map((d) => `${d}=${contrib[d] ?? '∅'}`).join('|');
}

/**
 * Genera un reporte agregado respetando k-anonimato >= 50.
 *
 * @param {Array<Object>} contribuciones  Filas seudonimizadas. Cada una con
 *        `usuario_id` y los cuasi-identificadores (region, banda_edad, ...).
 * @param {Object} definicion
 * @param {Object} [definicion.filtros]      p.ej. { region:'Madrid', categoria:'compras_online' }
 * @param {string[]} [definicion.dimensiones] p.ej. ['banda_edad'] (desglose de salida)
 * @param {string} [definicion.metrica]       campo numérico a promediar (opcional)
 * @param {Object} [opciones]
 * @param {number} [opciones.k]   k solicitado (se eleva a 50 si es menor)
 * @param {string} [opciones.ahora] ISO timestamp (para tests deterministas)
 * @returns {{entregable:boolean, motivo:?string, reporte:?Object, auditoria:Object}}
 */
export function generarReporteAgregado(contribuciones, definicion = {}, opciones = {}) {
  const k = Math.max(Number(opciones.k) || K_MINIMO_LEGAL, K_MINIMO_LEGAL);
  const ahora = opciones.ahora || new Date().toISOString();
  const filtros = definicion.filtros || {};
  const dimensiones = definicion.dimensiones || [];
  const metrica = definicion.metrica || null;

  // 1) Filtrar por el segmento solicitado
  const enSegmento = contribuciones.filter((c) => coincideFiltro(c, filtros));

  // 2) Usuarios DISTINTOS del segmento total
  const nTotal = new Set(enSegmento.map((c) => c.usuario_id)).size;

  const auditoriaBase = {
    accion: 'reporte.generado',
    generado_en: ahora,
    k_aplicado: k,
    definicion,
    n_usuarios_segmento: nTotal,
  };

  // 3) PUERTA DURA: si el segmento total no llega a k -> no se entrega NADA
  if (nTotal < k) {
    const motivo = `segmento con ${nTotal} usuarios (< k=${k})`;
    return {
      entregable: false,
      motivo,
      reporte: null,
      auditoria: { ...auditoriaBase, entregable: false, motivo, resultado_hash: hashFNV1a('SUPRIMIDO:' + nTotal) },
    };
  }

  // 4) Agregar por celdas (sin dimensiones -> una sola celda = el total)
  const celdas = new Map(); // clave -> { dims, usuarios:Set, suma, conteo }
  for (const c of enSegmento) {
    const clave = dimensiones.length ? claveCelda(c, dimensiones) : '∑total';
    if (!celdas.has(clave)) {
      const dims = {};
      for (const d of dimensiones) dims[d] = c[d] ?? null;
      celdas.set(clave, { dims, usuarios: new Set(), suma: 0, conteo: 0 });
    }
    const cel = celdas.get(clave);
    cel.usuarios.add(c.usuario_id);
    if (metrica && typeof c[metrica] === 'number') { cel.suma += c[metrica]; cel.conteo += 1; }
  }

  // 5) Clasificar celdas en entregables (>= k) y suprimidas (< k)
  const entregadas = [];
  const suprimidas = [];
  for (const [clave, cel] of celdas) {
    const registro = { clave, dims: cel.dims, n_usuarios: cel.usuarios.size, suma: cel.suma, conteo: cel.conteo };
    (registro.n_usuarios >= k ? entregadas : suprimidas).push(registro);
  }

  // 6) Anti divulgación complementaria: si solo se suprimió 1 celda, suprimir
  //    también la entregable más pequeña (evita despejarla por resta del total).
  if (suprimidas.length === 1 && entregadas.length > 0) {
    entregadas.sort((a, b) => a.n_usuarios - b.n_usuarios);
    suprimidas.push(entregadas.shift());
  }

  // 7) Salida: SOLO agregados, ordenados, sin ningún identificador
  const celdasSalida = entregadas
    .sort((a, b) => b.n_usuarios - a.n_usuarios)
    .map((r) => {
      const fila = { ...r.dims, n_usuarios: r.n_usuarios };
      if (metrica) fila[`media_${metrica}`] = r.conteo ? +(r.suma / r.conteo).toFixed(4) : null;
      return fila;
    });

  const reporte = {
    segmento: definicion,
    k_aplicado: k,
    n_usuarios: nTotal,
    celdas: celdasSalida,
    celdas_suprimidas: suprimidas.length,
  };
  reporte.resultado_hash = hashFNV1a(JSON.stringify(reporte));

  return {
    entregable: true,
    motivo: null,
    reporte,
    auditoria: {
      ...auditoriaBase,
      entregable: true,
      celdas_entregadas: celdasSalida.length,
      celdas_suprimidas: suprimidas.length,
      resultado_hash: reporte.resultado_hash,
    },
  };
}

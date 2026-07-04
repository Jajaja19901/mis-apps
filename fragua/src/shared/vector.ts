// Almacén vectorial en memoria con persistencia JSON (los vectores se
// guardan cuantizados a int8 para dividir por 4 el tamaño en disco) y
// búsqueda por coseno con fuerza bruta. Para el tamaño objetivo
// (decenas de miles de fragmentos) la fuerza bruta en typed arrays es
// más rápida y simple que un ANN, y no añade dependencias nativas.

export interface VectorHit {
  id: string;
  score: number;
}

export interface VectorSnapshot {
  version: 1;
  dim: number;
  ids: string[];
  /** vectores normalizados, cuantizados a int8 en [-127,127], base64 */
  data: string;
}

function base64FromBytes(bytes: Uint8Array): string {
  // btoa no existe en Node y Buffer no existe en el navegador: hacerlo a mano.
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = i + 1 < bytes.length ? bytes[i + 1]! : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2]! : 0;
    out += alphabet[a >> 2]! + alphabet[((a & 3) << 4) | (b >> 4)]!;
    out += i + 1 < bytes.length ? alphabet[((b & 15) << 2) | (c >> 6)]! : '=';
    out += i + 2 < bytes.length ? alphabet[c & 63]! : '=';
  }
  return out;
}

function bytesFromBase64(b64: string): Uint8Array {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = new Int16Array(128).fill(-1);
  for (let i = 0; i < alphabet.length; i++) lookup[alphabet.charCodeAt(i)] = i;
  const clean = b64.replace(/=+$/, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i + 1 < clean.length; i += 4) {
    const a = lookup[clean.charCodeAt(i)]!;
    const b = lookup[clean.charCodeAt(i + 1)]!;
    const c = i + 2 < clean.length ? lookup[clean.charCodeAt(i + 2)]! : 0;
    const d = i + 3 < clean.length ? lookup[clean.charCodeAt(i + 3)]! : 0;
    out[o++] = (a << 2) | (b >> 4);
    if (i + 2 < clean.length) out[o++] = ((b & 15) << 4) | (c >> 2);
    if (i + 3 < clean.length) out[o++] = ((c & 3) << 6) | d;
  }
  return out;
}

export function normalizeVector(v: number[]): Float32Array {
  const out = new Float32Array(v.length);
  let norm = 0;
  for (let i = 0; i < v.length; i++) norm += v[i]! * v[i]!;
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < v.length; i++) out[i] = v[i]! / norm;
  return out;
}

export class VectorStore {
  private ids: string[] = [];
  private vectors: Int8Array[] = [];
  private index = new Map<string, number>();
  private dim = 0;

  get size(): number {
    return this.ids.length;
  }

  get dimension(): number {
    return this.dim;
  }

  has(id: string): boolean {
    return this.index.has(id);
  }

  /** Añade un vector (se normaliza y cuantiza). Reemplaza si el id existe. */
  add(id: string, vector: number[]): void {
    if (this.dim === 0) this.dim = vector.length;
    if (vector.length !== this.dim) {
      throw new Error(`Dimensión inconsistente: esperaba ${this.dim}, llegó ${vector.length}`);
    }
    const normalized = normalizeVector(vector);
    const quantized = new Int8Array(this.dim);
    for (let i = 0; i < this.dim; i++) {
      quantized[i] = Math.max(-127, Math.min(127, Math.round(normalized[i]! * 127)));
    }
    const existing = this.index.get(id);
    if (existing !== undefined) {
      this.vectors[existing] = quantized;
      return;
    }
    this.index.set(id, this.ids.length);
    this.ids.push(id);
    this.vectors.push(quantized);
  }

  remove(id: string): void {
    const pos = this.index.get(id);
    if (pos === undefined) return;
    const lastPos = this.ids.length - 1;
    const lastId = this.ids[lastPos]!;
    // swap-remove para no desplazar todo el array
    this.ids[pos] = lastId;
    this.vectors[pos] = this.vectors[lastPos]!;
    this.index.set(lastId, pos);
    this.ids.pop();
    this.vectors.pop();
    this.index.delete(id);
  }

  search(query: number[], limit: number): VectorHit[] {
    if (this.ids.length === 0 || query.length !== this.dim) return [];
    const q = normalizeVector(query);
    const hits: VectorHit[] = [];
    for (let i = 0; i < this.vectors.length; i++) {
      const v = this.vectors[i]!;
      let dot = 0;
      for (let j = 0; j < this.dim; j++) dot += q[j]! * v[j]!;
      hits.push({ id: this.ids[i]!, score: dot / 127 });
    }
    hits.sort((a, b) => b.score - a.score);
    return hits.slice(0, limit);
  }

  toSnapshot(): VectorSnapshot {
    const bytes = new Uint8Array(this.ids.length * this.dim);
    for (let i = 0; i < this.vectors.length; i++) {
      const v = this.vectors[i]!;
      for (let j = 0; j < this.dim; j++) bytes[i * this.dim + j] = v[j]! & 0xff;
    }
    return { version: 1, dim: this.dim, ids: [...this.ids], data: base64FromBytes(bytes) };
  }

  static fromSnapshot(snap: VectorSnapshot): VectorStore {
    const store = new VectorStore();
    store.dim = snap.dim;
    const bytes = bytesFromBase64(snap.data);
    for (let i = 0; i < snap.ids.length; i++) {
      const v = new Int8Array(snap.dim);
      for (let j = 0; j < snap.dim; j++) {
        const raw = bytes[i * snap.dim + j]!;
        v[j] = raw > 127 ? raw - 256 : raw;
      }
      const id = snap.ids[i]!;
      store.index.set(id, store.ids.length);
      store.ids.push(id);
      store.vectors.push(v);
    }
    return store;
  }
}

/**
 * Fusión de rankings por Reciprocal Rank Fusion: combina resultados
 * léxicos y semánticos sin tener que calibrar escalas de puntuación.
 */
export function reciprocalRankFusion(
  rankings: { id: string; score: number }[][],
  limit: number,
  k = 60
): { id: string; score: number }[] {
  const fused = new Map<string, number>();
  for (const ranking of rankings) {
    for (let rank = 0; rank < ranking.length; rank++) {
      const id = ranking[rank]!.id;
      fused.set(id, (fused.get(id) ?? 0) + 1 / (k + rank + 1));
    }
  }
  return [...fused.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

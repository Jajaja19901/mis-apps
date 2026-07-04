// Índice léxico BM25 propio, serializable a JSON. Es el motor de búsqueda
// base de Fragua: funciona siempre, sin modelo de embeddings, escala a
// decenas de miles de fragmentos y se actualiza de forma incremental
// (añadir/quitar documentos sin reconstruir).

import { tokenizeCode } from './textUtils';

const K1 = 1.4;
const B = 0.75;
/** peso extra de los símbolos extraídos (nombres de función/clase) */
const SYMBOL_BOOST = 2;

export interface Bm25Doc {
  id: string;
  text: string;
  symbols: string[];
}

interface Posting {
  /** docId -> frecuencia del término en el documento */
  [docId: string]: number;
}

export interface Bm25Snapshot {
  version: 1;
  docLengths: Record<string, number>;
  postings: Record<string, Posting>;
  totalLength: number;
}

export class Bm25Index {
  private postings = new Map<string, Map<string, number>>();
  private docLengths = new Map<string, number>();
  private totalLength = 0;

  get size(): number {
    return this.docLengths.size;
  }

  has(docId: string): boolean {
    return this.docLengths.has(docId);
  }

  add(doc: Bm25Doc): void {
    if (this.docLengths.has(doc.id)) this.remove(doc.id);
    const terms = tokenizeCode(doc.text);
    for (const sym of doc.symbols) {
      const symTokens = tokenizeCode(sym);
      for (let i = 0; i < SYMBOL_BOOST; i++) terms.push(...symTokens);
    }
    if (terms.length === 0) return;
    const freq = new Map<string, number>();
    for (const t of terms) freq.set(t, (freq.get(t) ?? 0) + 1);
    for (const [term, f] of freq) {
      let posting = this.postings.get(term);
      if (!posting) {
        posting = new Map();
        this.postings.set(term, posting);
      }
      posting.set(doc.id, f);
    }
    this.docLengths.set(doc.id, terms.length);
    this.totalLength += terms.length;
  }

  remove(docId: string): void {
    const len = this.docLengths.get(docId);
    if (len === undefined) return;
    this.docLengths.delete(docId);
    this.totalLength -= len;
    for (const [term, posting] of this.postings) {
      if (posting.delete(docId) && posting.size === 0) this.postings.delete(term);
    }
  }

  search(query: string, limit: number): { id: string; score: number }[] {
    const n = this.docLengths.size;
    if (n === 0) return [];
    const avgLen = this.totalLength / n;
    const queryTerms = tokenizeCode(query);
    if (queryTerms.length === 0) return [];
    const scores = new Map<string, number>();
    const seen = new Set<string>();
    for (const term of queryTerms) {
      if (seen.has(term)) continue;
      seen.add(term);
      const posting = this.postings.get(term);
      if (!posting) continue;
      const df = posting.size;
      const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
      for (const [docId, tf] of posting) {
        const docLen = this.docLengths.get(docId) ?? avgLen;
        const norm = (tf * (K1 + 1)) / (tf + K1 * (1 - B + (B * docLen) / avgLen));
        scores.set(docId, (scores.get(docId) ?? 0) + idf * norm);
      }
    }
    return [...scores.entries()]
      .map(([id, score]) => ({ id, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  toSnapshot(): Bm25Snapshot {
    const postings: Record<string, Posting> = {};
    for (const [term, posting] of this.postings) {
      const obj: Posting = {};
      for (const [docId, f] of posting) obj[docId] = f;
      postings[term] = obj;
    }
    const docLengths: Record<string, number> = {};
    for (const [id, len] of this.docLengths) docLengths[id] = len;
    return { version: 1, docLengths, postings, totalLength: this.totalLength };
  }

  static fromSnapshot(snap: Bm25Snapshot): Bm25Index {
    const index = new Bm25Index();
    for (const [id, len] of Object.entries(snap.docLengths)) {
      index.docLengths.set(id, len);
    }
    for (const [term, posting] of Object.entries(snap.postings)) {
      const map = new Map<string, number>();
      for (const [docId, f] of Object.entries(posting)) map.set(docId, f);
      index.postings.set(term, map);
    }
    index.totalLength = snap.totalLength;
    return index;
  }
}

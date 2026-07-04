import { describe, expect, it } from 'vitest';
import { Bm25Index } from '../src/shared/bm25';

function build(): Bm25Index {
  const index = new Bm25Index();
  index.add({ id: 'a', text: 'function loginUser(email, password) { validate credentials }', symbols: ['loginUser'] });
  index.add({ id: 'b', text: 'function renderChart(data) { draw bars on canvas }', symbols: ['renderChart'] });
  index.add({ id: 'c', text: 'const session = createSession(user); logout clears session', symbols: ['createSession'] });
  return index;
}

describe('Bm25Index', () => {
  it('encuentra el documento más relevante', () => {
    const index = build();
    const hits = index.search('login password', 10);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.id).toBe('a');
  });

  it('separa camelCase en la consulta y el documento', () => {
    const index = build();
    const hits = index.search('render chart', 10);
    expect(hits[0]!.id).toBe('b');
  });

  it('elimina documentos', () => {
    const index = build();
    index.remove('a');
    const hits = index.search('login password', 10);
    expect(hits.find((h) => h.id === 'a')).toBeUndefined();
    expect(index.size).toBe(2);
  });

  it('reemplaza documentos con el mismo id', () => {
    const index = build();
    index.add({ id: 'a', text: 'totally different topic about gardening tulips', symbols: [] });
    const hits = index.search('gardening tulips', 10);
    expect(hits[0]!.id).toBe('a');
    expect(index.size).toBe(3);
  });

  it('sobrevive a un ciclo de serialización', () => {
    const index = build();
    const restored = Bm25Index.fromSnapshot(JSON.parse(JSON.stringify(index.toSnapshot())));
    const hits = restored.search('login password', 10);
    expect(hits[0]!.id).toBe('a');
    expect(restored.size).toBe(3);
  });

  it('devuelve vacío sin documentos o sin términos', () => {
    const empty = new Bm25Index();
    expect(empty.search('algo', 5)).toEqual([]);
    const index = build();
    expect(index.search('!!!', 5)).toEqual([]);
  });
});

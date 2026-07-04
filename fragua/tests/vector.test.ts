import { describe, expect, it } from 'vitest';
import { VectorStore, reciprocalRankFusion } from '../src/shared/vector';

describe('VectorStore', () => {
  it('devuelve el vecino más cercano por coseno', () => {
    const store = new VectorStore();
    store.add('x', [1, 0, 0]);
    store.add('y', [0, 1, 0]);
    store.add('xy', [0.7, 0.7, 0]);
    const hits = store.search([0.9, 0.1, 0], 2);
    expect(hits[0]!.id).toBe('x');
    expect(hits[1]!.id).toBe('xy');
  });

  it('reemplaza y elimina con swap-remove', () => {
    const store = new VectorStore();
    store.add('a', [1, 0]);
    store.add('b', [0, 1]);
    store.add('c', [1, 1]);
    store.remove('a');
    expect(store.size).toBe(2);
    expect(store.has('a')).toBe(false);
    const hits = store.search([0, 1], 3);
    expect(hits.map((h) => h.id)).toContain('b');
    expect(hits.map((h) => h.id)).toContain('c');
  });

  it('sobrevive a serialización con cuantización int8', () => {
    const store = new VectorStore();
    store.add('a', [0.5, -0.5, 0.7]);
    store.add('b', [-0.2, 0.9, 0.1]);
    const restored = VectorStore.fromSnapshot(JSON.parse(JSON.stringify(store.toSnapshot())));
    expect(restored.size).toBe(2);
    const hits = restored.search([0.5, -0.5, 0.7], 1);
    expect(hits[0]!.id).toBe('a');
    expect(hits[0]!.score).toBeGreaterThan(0.95);
  });

  it('rechaza dimensiones inconsistentes', () => {
    const store = new VectorStore();
    store.add('a', [1, 0]);
    expect(() => store.add('b', [1, 0, 0])).toThrow();
  });
});

describe('reciprocalRankFusion', () => {
  it('prioriza documentos presentes en varios rankings', () => {
    const fused = reciprocalRankFusion(
      [
        [
          { id: 'a', score: 10 },
          { id: 'b', score: 5 }
        ],
        [
          { id: 'b', score: 0.9 },
          { id: 'c', score: 0.8 }
        ]
      ],
      10
    );
    expect(fused[0]!.id).toBe('b');
  });
});

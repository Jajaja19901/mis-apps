import { describe, expect, it } from 'vitest';
import {
  assembleChatRequest,
  buildSummarizationPrompt,
  splitForCompaction
} from '../src/shared/promptBuilder';
import type { ChatMessage, MemoryEntry, SearchResult } from '../src/shared/types';

function msg(role: 'user' | 'assistant', content: string, i: number): ChatMessage {
  return { id: `m${i}`, role, content, createdAt: i };
}

describe('assembleChatRequest', () => {
  it('incluye system + mensajes recientes', () => {
    const out = assembleChatRequest({
      messages: [msg('user', 'hola', 1), msg('assistant', 'buenas', 2), msg('user', '¿qué es un mutex?', 3)],
      summary: '',
      memory: [],
      retrieved: [],
      attachmentsContent: [],
      budget: { maxContextTokens: 8000, reservedForAnswer: 1000 }
    });
    expect(out[0]!.role).toBe('system');
    expect(out[out.length - 1]!.content).toBe('¿qué es un mutex?');
    expect(out).toHaveLength(4);
  });

  it('inyecta memoria y contexto recuperado en el system', () => {
    const memory: MemoryEntry[] = [
      { id: '1', scope: 'global', projectId: null, content: 'El usuario prefiere TypeScript', createdAt: 0, updatedAt: 0 }
    ];
    const retrieved: SearchResult[] = [
      {
        origin: 'lexical',
        score: 1,
        chunk: { id: 'c1', filePath: 'src/db.ts', startLine: 1, endLine: 5, content: 'export function query() {}', symbols: [] }
      }
    ];
    const out = assembleChatRequest({
      messages: [msg('user', 'explica db', 1)],
      summary: 'Antes hablamos de la API.',
      memory,
      retrieved,
      attachmentsContent: [{ path: 'notas.md', content: 'apunte' }],
      budget: { maxContextTokens: 8000, reservedForAnswer: 1000 }
    });
    const system = out[0]!.content;
    expect(system).toContain('prefiere TypeScript');
    expect(system).toContain('src/db.ts');
    expect(system).toContain('Antes hablamos de la API.');
    expect(system).toContain('notas.md');
  });

  it('recorta mensajes antiguos cuando no caben en presupuesto', () => {
    const big = 'x'.repeat(4000);
    const messages = Array.from({ length: 20 }, (_v, i) => msg(i % 2 === 0 ? 'user' : 'assistant', big, i));
    const out = assembleChatRequest({
      messages,
      summary: '',
      memory: [],
      retrieved: [],
      attachmentsContent: [],
      budget: { maxContextTokens: 6000, reservedForAnswer: 1000 }
    });
    // system + una cola pequeña; nunca los 20
    expect(out.length).toBeLessThan(10);
    expect(out[out.length - 1]!.content).toBe(messages[19]!.content);
  });
});

describe('splitForCompaction', () => {
  it('no compacta conversaciones cortas', () => {
    const messages = [msg('user', 'a', 1)];
    const { toSummarize, toKeep } = splitForCompaction(messages);
    expect(toSummarize).toHaveLength(0);
    expect(toKeep).toHaveLength(1);
  });

  it('separa correctamente conversaciones largas', () => {
    const messages = Array.from({ length: 20 }, (_v, i) => msg('user', `m${i}`, i));
    const { toSummarize, toKeep } = splitForCompaction(messages, 8);
    expect(toSummarize).toHaveLength(12);
    expect(toKeep).toHaveLength(8);
    expect(toKeep[0]!.content).toBe('m12');
  });
});

describe('buildSummarizationPrompt', () => {
  it('integra el resumen previo', () => {
    const prompt = buildSummarizationPrompt('resumen viejo', [msg('user', 'nuevo dato', 1)]);
    expect(prompt[1]!.content).toContain('resumen viejo');
    expect(prompt[1]!.content).toContain('nuevo dato');
  });
});

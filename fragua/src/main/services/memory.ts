// Memoria persistente del asistente: hechos que el usuario quiere que el
// modelo recuerde siempre (globales o por proyecto). Se inyectan en el
// system prompt en cada petición.

import path from 'node:path';
import type { MemoryEntry, Result } from '../../shared/types';
import { err, ok } from '../../shared/types';
import { newId } from '../../shared/textUtils';
import { readJson, writeJsonAtomic } from '../storage';

const MAX_ENTRIES = 200;
const MAX_CONTENT_LENGTH = 2000;

export class MemoryService {
  private file: string;
  private entries: MemoryEntry[];

  constructor(baseDir: string) {
    this.file = path.join(baseDir, 'memory.json');
    this.entries = readJson<MemoryEntry[]>(this.file, []).filter(
      (e) => typeof e === 'object' && e !== null && typeof e.content === 'string'
    );
  }

  private persist(): void {
    writeJsonAtomic(this.file, this.entries);
  }

  list(projectId: string | null): MemoryEntry[] {
    return this.entries
      .filter((e) => e.scope === 'global' || e.projectId === projectId)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /** Entradas relevantes para una petición de chat. */
  forChat(projectId: string | null): MemoryEntry[] {
    return this.list(projectId).slice(0, 30);
  }

  save(input: { id?: string; scope: 'global' | 'project'; projectId: string | null; content: string }): MemoryEntry {
    const content = input.content.trim().slice(0, MAX_CONTENT_LENGTH);
    const now = Date.now();
    if (input.id) {
      const existing = this.entries.find((e) => e.id === input.id);
      if (existing) {
        existing.content = content;
        existing.scope = input.scope;
        existing.projectId = input.scope === 'project' ? input.projectId : null;
        existing.updatedAt = now;
        this.persist();
        return existing;
      }
    }
    const entry: MemoryEntry = {
      id: newId('mem'),
      scope: input.scope,
      projectId: input.scope === 'project' ? input.projectId : null,
      content,
      createdAt: now,
      updatedAt: now
    };
    this.entries.unshift(entry);
    if (this.entries.length > MAX_ENTRIES) this.entries.length = MAX_ENTRIES;
    this.persist();
    return entry;
  }

  delete(id: string): Result<null> {
    const before = this.entries.length;
    this.entries = this.entries.filter((e) => e.id !== id);
    if (this.entries.length === before) return err('Entrada de memoria no encontrada');
    this.persist();
    return ok(null);
  }

  importEntries(entries: MemoryEntry[]): number {
    let count = 0;
    for (const e of entries) {
      if (typeof e.content !== 'string' || !e.content.trim()) continue;
      this.save({ scope: e.scope === 'project' ? 'project' : 'global', projectId: e.projectId ?? null, content: e.content });
      count++;
    }
    return count;
  }

  all(): MemoryEntry[] {
    return [...this.entries];
  }
}

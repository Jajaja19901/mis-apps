// Conversaciones: una carpeta con un JSON por conversación. El listado
// mantiene una caché de metadatos en memoria para que abrir el panel de
// historial sea instantáneo aunque haya cientos de conversaciones.

import path from 'node:path';
import type { ChatMessage, Conversation, ConversationMeta, Result } from '../../shared/types';
import { err, ok } from '../../shared/types';
import { estimateTokens, newId } from '../../shared/textUtils';
import { ensureDir, listJsonFiles, readJson, removeFile, writeJsonAtomic } from '../storage';

export class ConversationService {
  private dir: string;
  private metas = new Map<string, ConversationMeta>();
  private loaded = false;

  constructor(baseDir: string) {
    this.dir = path.join(baseDir, 'conversations');
    ensureDir(this.dir);
  }

  private file(id: string): string {
    return path.join(this.dir, `${id}.json`);
  }

  private loadMetas(): void {
    if (this.loaded) return;
    for (const f of listJsonFiles(this.dir)) {
      const conv = readJson<Conversation | null>(f, null);
      if (conv && typeof conv.id === 'string') this.metas.set(conv.id, this.toMeta(conv));
    }
    this.loaded = true;
  }

  private toMeta(conv: Conversation): ConversationMeta {
    return {
      id: conv.id,
      title: conv.title,
      projectId: conv.projectId,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
      messageCount: conv.messages.length
    };
  }

  list(): ConversationMeta[] {
    this.loadMetas();
    return [...this.metas.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  get(id: string): Result<Conversation> {
    const conv = readJson<Conversation | null>(this.file(id), null);
    return conv ? ok(conv) : err('Conversación no encontrada');
  }

  create(projectId: string | null, title?: string): Conversation {
    this.loadMetas();
    const now = Date.now();
    const conv: Conversation = {
      id: newId('conv'),
      title: title?.trim() || 'Nueva conversación',
      projectId,
      createdAt: now,
      updatedAt: now,
      summary: '',
      messages: []
    };
    this.save(conv);
    return conv;
  }

  save(conv: Conversation): void {
    conv.updatedAt = Date.now();
    writeJsonAtomic(this.file(conv.id), conv);
    this.metas.set(conv.id, this.toMeta(conv));
  }

  appendMessage(
    id: string,
    role: 'user' | 'assistant',
    content: string,
    attachments?: string[]
  ): Result<Conversation> {
    const got = this.get(id);
    if (!got.ok) return got;
    const conv = got.value;
    const msg: ChatMessage = {
      id: newId('msg'),
      role,
      content,
      createdAt: Date.now(),
      tokens: estimateTokens(content)
    };
    if (attachments && attachments.length > 0) msg.attachments = attachments;
    conv.messages.push(msg);
    this.save(conv);
    return ok(conv);
  }

  rename(id: string, title: string): Result<null> {
    const got = this.get(id);
    if (!got.ok) return err(got.error);
    got.value.title = title.trim() || got.value.title;
    this.save(got.value);
    return ok(null);
  }

  delete(id: string): Result<null> {
    this.loadMetas();
    if (!this.metas.has(id)) return err('Conversación no encontrada');
    removeFile(this.file(id));
    this.metas.delete(id);
    return ok(null);
  }

  /** Sustituye mensajes antiguos por un resumen ya calculado. */
  applyCompaction(id: string, summary: string, keptMessages: ChatMessage[]): Result<Conversation> {
    const got = this.get(id);
    if (!got.ok) return got;
    const conv = got.value;
    conv.summary = summary;
    conv.messages = keptMessages;
    this.save(conv);
    return ok(conv);
  }

  importConversation(conv: Conversation): void {
    this.loadMetas();
    // regenerar id si colisiona para no machacar datos existentes
    if (this.metas.has(conv.id)) conv.id = newId('conv');
    this.save(conv);
  }
}

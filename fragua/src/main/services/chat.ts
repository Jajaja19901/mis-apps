// Orquestador de chat. Para cada petición:
//   1. Carga la conversación y su proyecto.
//   2. Recupera contexto del índice (consulta = último mensaje del usuario).
//   3. Inyecta memoria persistente y archivos adjuntos.
//   4. Ensambla los mensajes dentro del presupuesto de tokens del modelo.
//   5. Streamea la respuesta al renderer y la persiste al terminar.
//   6. Autotitula la conversación y la compacta cuando crece demasiado.

import type { Result, Settings, StreamChunk } from '../../shared/types';
import { err, ok } from '../../shared/types';
import {
  assembleChatRequest,
  buildSummarizationPrompt,
  buildTitlePrompt,
  splitForCompaction
} from '../../shared/promptBuilder';
import type { AiProvider } from './ai/providers';
import type { ConversationService } from './conversations';
import type { FileService } from './files';
import type { IndexerService } from './indexer';
import type { MemoryService } from './memory';

const COMPACT_THRESHOLD = 24;

export class ChatService {
  private active = new Map<string, AbortController>();

  constructor(
    private conversations: ConversationService,
    private memory: MemoryService,
    private indexer: IndexerService,
    private files: FileService,
    private getProvider: () => AiProvider,
    private getSettings: () => Settings,
    private emitStream: (chunk: StreamChunk) => void
  ) {}

  cancel(requestId: string): Result<null> {
    const controller = this.active.get(requestId);
    if (!controller) return err('No hay ninguna petición activa con ese id');
    controller.abort(new Error('cancelado por el usuario'));
    return ok(null);
  }

  async start(requestId: string, conversationId: string, useProjectContext: boolean): Promise<Result<null>> {
    if (this.active.has(requestId)) return err('requestId duplicado');
    const got = this.conversations.get(conversationId);
    if (!got.ok) return err(got.error);
    const conv = got.value;
    const lastUser = [...conv.messages].reverse().find((m) => m.role === 'user');
    if (!lastUser) return err('La conversación no tiene ningún mensaje de usuario');

    const settings = this.getSettings();
    const provider = this.getProvider();
    const controller = new AbortController();
    this.active.set(requestId, controller);

    // Contexto del proyecto: fragmentos recuperados + adjuntos del último mensaje
    const retrieved =
      useProjectContext && conv.projectId
        ? await this.indexer.retrieve(conv.projectId, lastUser.content, settings.chat.maxSnippets)
        : [];
    const attachmentsContent: { path: string; content: string }[] = [];
    if (conv.projectId && lastUser.attachments) {
      for (const rel of lastUser.attachments.slice(0, 6)) {
        const read = this.files.read(conv.projectId, rel);
        if (read.ok) attachmentsContent.push({ path: rel, content: read.value });
        else attachmentsContent.push({ path: rel, content: `[No se pudo leer: ${read.error}]` });
      }
    }

    const budgetTokens = Math.min(settings.chat.maxContextTokens, provider.profile.contextWindow);
    const messages = assembleChatRequest({
      messages: conv.messages,
      summary: conv.summary,
      memory: this.memory.forChat(conv.projectId),
      retrieved,
      attachmentsContent,
      budget: { maxContextTokens: budgetTokens, reservedForAnswer: provider.profile.maxOutputTokens }
    });

    // Lanzar en segundo plano: la respuesta viaja por eventos ai:stream.
    void this.run(requestId, conversationId, provider, messages, controller);
    return ok(null);
  }

  private async run(
    requestId: string,
    conversationId: string,
    provider: AiProvider,
    messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
    controller: AbortController
  ): Promise<void> {
    try {
      const full = await provider.chat(messages, {
        temperature: provider.profile.temperature,
        maxOutputTokens: provider.profile.maxOutputTokens,
        signal: controller.signal,
        onDelta: (delta) => this.emitStream({ requestId, delta, done: false })
      });
      const appended = this.conversations.appendMessage(conversationId, 'assistant', full);
      this.emitStream({ requestId, delta: '', done: true });
      if (appended.ok) {
        await this.postProcess(appended.value.id, provider);
      }
    } catch (e) {
      this.emitStream({ requestId, delta: '', done: true, error: (e as Error).message });
    } finally {
      this.active.delete(requestId);
    }
  }

  /** Autotítulo y compactación; ambos son best-effort y nunca rompen el chat. */
  private async postProcess(conversationId: string, provider: AiProvider): Promise<void> {
    const got = this.conversations.get(conversationId);
    if (!got.ok) return;
    const conv = got.value;
    if (conv.title === 'Nueva conversación') {
      const firstUser = conv.messages.find((m) => m.role === 'user');
      if (firstUser) {
        try {
          let title = '';
          title = await provider.chat(buildTitlePrompt(firstUser.content), {
            temperature: 0.1,
            maxOutputTokens: 30,
            signal: AbortSignal.timeout(30000),
            onDelta: () => undefined
          });
          title = title.replace(/["\n]/g, ' ').trim().slice(0, 60);
          if (title) this.conversations.rename(conversationId, title);
        } catch {
          // sin título automático: se queda el genérico
        }
      }
    }
    if (conv.messages.length >= COMPACT_THRESHOLD) {
      try {
        await this.compact(conversationId, provider);
      } catch {
        // la compactación fallida se reintenta en el siguiente turno
      }
    }
  }

  async compact(conversationId: string, providerOverride?: AiProvider): Promise<Result<import('../../shared/types').Conversation>> {
    const got = this.conversations.get(conversationId);
    if (!got.ok) return got;
    const conv = got.value;
    const { toSummarize, toKeep } = splitForCompaction(conv.messages);
    if (toSummarize.length === 0) return ok(conv);
    const provider = providerOverride ?? this.getProvider();
    const summary = await provider.chat(buildSummarizationPrompt(conv.summary, toSummarize), {
      temperature: 0.1,
      maxOutputTokens: 800,
      signal: AbortSignal.timeout(120000),
      onDelta: () => undefined
    });
    return this.conversations.applyCompaction(conversationId, summary.trim(), toKeep);
  }
}

// Panel de chat: conversación con streaming, markdown seguro, adjuntar
// el fichero activo como contexto, y revisión/aplicación de los planes
// de edición que propone el modelo (con vista previa en diff).

import { api } from '../api';
import { clear, h, openModal, toast } from '../dom';
import { activeProject, bus, setActiveConversation, setConversations, state } from '../state';
import { renderMarkdown } from '../../shared/markdown';
import { applyUnifiedDiff } from '../../shared/editProtocol';
import { newId } from '../../shared/textUtils';
import type { Conversation, EditPlan } from '../../shared/types';
import { languageForPath, type EditorArea } from './editor';

export class ChatPanel {
  readonly element: HTMLElement;
  private titleEl: HTMLElement;
  private messagesEl: HTMLElement;
  private inputEl: HTMLTextAreaElement;
  private sendBtn: HTMLButtonElement;
  private cancelBtn: HTMLButtonElement;
  private contextToggle: HTMLInputElement;
  private attachChip: HTMLElement;
  private conversation: Conversation | null = null;
  private streamingEl: HTMLElement | null = null;
  private streamingText = '';
  private activeRequestId: string | null = null;
  private attachedPath: string | null = null;

  constructor(private editor: EditorArea) {
    this.titleEl = h('div', { className: 'title', text: 'Sin conversación' });
    this.messagesEl = h('div', { className: 'chat-messages', role: 'log', ariaLabel: 'Mensajes' });
    this.inputEl = h('textarea', {
      placeholder: 'Pregunta al modelo… (Ctrl+Enter para enviar)',
      ariaLabel: 'Mensaje para el asistente',
      onKeyDown: (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          e.preventDefault();
          void this.send();
        }
      }
    });
    this.sendBtn = h('button', { className: 'primary', text: 'Enviar', onClick: () => void this.send() });
    this.cancelBtn = h('button', {
      className: 'danger',
      text: 'Detener',
      style: { display: 'none' },
      onClick: () => void this.cancelStream()
    });
    this.contextToggle = h('input', { type: 'checkbox', checked: true });
    this.attachChip = h('span');

    this.element = h(
      'div',
      { className: 'chat-panel' },
      h(
        'div',
        { className: 'chat-head' },
        this.titleEl,
        h('button', { text: '＋', title: 'Nueva conversación', ariaLabel: 'Nueva conversación', onClick: () => void this.newConversation() })
      ),
      this.messagesEl,
      h(
        'div',
        { className: 'chat-compose' },
        this.inputEl,
        h(
          'div',
          { className: 'row' },
          h('label', { className: 'toggle' }, this.contextToggle, 'Usar contexto del proyecto'),
          h('button', {
            text: '📎 Fichero activo',
            title: 'Adjuntar el fichero abierto en el editor',
            onClick: () => this.attachActive()
          }),
          this.attachChip,
          h('div', { className: 'grow' }),
          this.cancelBtn,
          this.sendBtn
        ),
        h('div', { className: 'hint', text: 'El modelo corre en tu máquina: nada sale de tu equipo.' })
      )
    );

    bus.on('active-conversation-changed', (id) => void this.load(id));
    bus.on('chat-start-request', ({ conversationId, useProjectContext }) => {
      void (async () => {
        await this.load(conversationId);
        await this.startStreaming(conversationId, useProjectContext);
      })();
    });
    api.on('ai:stream', (chunk) => this.onStream(chunk.requestId, chunk.delta, chunk.done, chunk.error));
  }

  private attachActive(): void {
    const file = this.editor.activeFile();
    if (!file) {
      toast('No hay ningún fichero abierto en el editor', 'info');
      return;
    }
    this.attachedPath = file.path;
    clear(this.attachChip);
    this.attachChip.append(
      h(
        'span',
        { className: 'chip' },
        `📎 ${file.path.split('/').pop()}`,
        h('button', {
          text: '✕',
          ariaLabel: 'Quitar adjunto',
          onClick: () => {
            this.attachedPath = null;
            clear(this.attachChip);
          }
        })
      )
    );
  }

  async newConversation(): Promise<void> {
    const conv = await api.invoke('conv:create', { projectId: state.activeProjectId });
    setConversations(await api.invoke('conv:list', undefined));
    setActiveConversation(conv.id);
  }

  private async load(id: string | null): Promise<void> {
    // en pleno streaming no se recarga: la respuesta llegará al terminar
    if (this.activeRequestId && this.conversation && id === this.conversation.id) return;
    if (!id) {
      this.conversation = null;
      this.titleEl.textContent = 'Sin conversación';
      clear(this.messagesEl);
      return;
    }
    const got = await api.invoke('conv:get', { id });
    if (!got.ok) {
      toast(got.error, 'error');
      return;
    }
    this.conversation = got.value;
    this.titleEl.textContent = got.value.title;
    this.render();
  }

  private render(): void {
    clear(this.messagesEl);
    if (!this.conversation) return;
    if (this.conversation.summary) {
      this.messagesEl.append(
        h('div', { className: 'note', text: `🧠 Conversación compactada: ${this.conversation.summary.slice(0, 240)}…` })
      );
    }
    for (const msg of this.conversation.messages) {
      this.messagesEl.append(this.renderMessage(msg.role, msg.content, msg.attachments));
    }
    this.scrollToEnd();
  }

  private renderMessage(role: string, content: string, attachments?: string[]): HTMLElement {
    const bubble = h('div', { className: 'bubble' });
    const { html } = renderMarkdown(content);
    // renderMarkdown escapa todo el HTML de origen: inserción segura
    bubble.innerHTML = html;
    const wrapper = h(
      'div',
      { className: `msg ${role}` },
      h('div', { className: 'who', text: role === 'user' ? 'Tú' : 'Fragua' }),
      bubble
    );
    if (attachments && attachments.length > 0) {
      wrapper.append(h('div', { className: 'note', text: `📎 ${attachments.join(', ')}` }));
    }
    if (role === 'assistant' && content.trim()) {
      const actions = h('div', { className: 'msg-actions' });
      actions.append(
        h('button', {
          text: 'Copiar',
          onClick: () => {
            void navigator.clipboard.writeText(content);
            toast('Copiado al portapapeles', 'ok', 1500);
          }
        }),
        h('button', { text: 'Revisar cambios propuestos', onClick: () => void this.reviewEdits(content) })
      );
      wrapper.append(actions);
    }
    return wrapper;
  }

  private scrollToEnd(): void {
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  async send(): Promise<void> {
    const text = this.inputEl.value.trim();
    if (!text || this.activeRequestId) return;
    if (!this.conversation) {
      // crear la conversación en línea (sin pasar por el bus) para evitar
      // que una recarga concurrente pise el mensaje que estamos a punto de añadir
      const conv = await api.invoke('conv:create', { projectId: state.activeProjectId });
      this.conversation = conv;
      this.titleEl.textContent = conv.title;
      state.activeConversationId = conv.id;
      setConversations(await api.invoke('conv:list', undefined));
    }
    const attachments = this.attachedPath ? [this.attachedPath] : undefined;
    const appended = await api.invoke('conv:appendMessage', {
      id: this.conversation.id,
      role: 'user',
      content: text,
      attachments
    });
    if (!appended.ok) {
      toast(appended.error, 'error');
      return;
    }
    this.conversation = appended.value;
    this.inputEl.value = '';
    this.attachedPath = null;
    clear(this.attachChip);
    this.render();
    await this.startStreaming(this.conversation.id, this.contextToggle.checked && !!state.activeProjectId);
  }

  private async startStreaming(conversationId: string, useProjectContext: boolean): Promise<void> {
    if (this.activeRequestId) return;
    const requestId = newId('req');
    this.activeRequestId = requestId;
    this.sendBtn.disabled = true;
    this.cancelBtn.style.display = '';
    this.streamingText = '';
    this.streamingEl = this.renderMessage('assistant', '');
    this.streamingEl.querySelector('.who')!.textContent = 'Fragua ⏳';
    this.messagesEl.append(this.streamingEl);
    this.scrollToEnd();

    const started = await api.invoke('ai:chatStart', { requestId, conversationId, useProjectContext });
    if (!started.ok) {
      this.finishStream();
      this.streamingEl?.remove();
      toast(started.error, 'error');
    }
  }

  private onStream(requestId: string, delta: string, done: boolean, error?: string): void {
    if (requestId !== this.activeRequestId || !this.streamingEl) return;
    if (delta) {
      this.streamingText += delta;
      const bubble = this.streamingEl.querySelector('.bubble');
      if (bubble) bubble.innerHTML = renderMarkdown(this.streamingText).html;
      this.scrollToEnd();
    }
    if (done) {
      this.finishStream();
      if (error) {
        const bubble = this.streamingEl.querySelector('.bubble');
        if (bubble) {
          bubble.append(h('p', { className: 'note error', text: `⚠ ${error}` }));
        }
        toast(error, 'error');
      }
      // recargar desde disco: el main ya persistió la respuesta y el título
      void this.reloadAndRefreshList();
    }
  }

  private async reloadAndRefreshList(): Promise<void> {
    if (this.conversation) await this.load(this.conversation.id);
    setConversations(await api.invoke('conv:list', undefined));
  }

  private finishStream(): void {
    this.activeRequestId = null;
    this.sendBtn.disabled = false;
    this.cancelBtn.style.display = 'none';
  }

  private async cancelStream(): Promise<void> {
    if (!this.activeRequestId) return;
    await api.invoke('ai:chatCancel', { requestId: this.activeRequestId });
  }

  /** Muestra el plan de edición del mensaje y permite aplicarlo. */
  private async reviewEdits(content: string): Promise<void> {
    const project = activeProject();
    const plan = await api.invoke('ai:parseEdits', { text: content });
    if (plan.ops.length === 0) {
      toast('Este mensaje no contiene operaciones de fichero (bloques fragua:write / fragua:patch)', 'info');
      return;
    }
    if (!project) {
      toast('Abre un proyecto para poder aplicar los cambios', 'error');
      return;
    }
    const body = h('div', {});
    const kindLabel = { write: 'escribir fichero completo', patch: 'aplicar parche', delete: 'borrar' } as const;
    for (const op of plan.ops) {
      const row = h(
        'div',
        { className: 'edit-op' },
        h('div', { className: 'path', text: op.path }),
        h('div', { className: 'kind', text: kindLabel[op.kind] })
      );
      if (op.kind !== 'delete') {
        row.append(
          h('button', {
            text: 'Ver diff',
            style: { marginTop: '5px' },
            onClick: async () => {
              const current = await api.invoke('fs:read', { projectId: project.id, path: op.path });
              const original = current.ok ? current.value : '';
              let modified: string;
              if (op.kind === 'write') {
                modified = op.content;
              } else {
                // previsualización del parche calculada en local (código compartido)
                const patched = applyUnifiedDiff(original, op.diff);
                modified = patched.ok ? patched.content : `${original}\n\n/* ⚠ El parche no aplica: ${patched.error} */`;
              }
              bus.emit('open-diff', {
                title: `Propuesta — ${op.path}`,
                original,
                modified,
                language: languageForPath(op.path)
              });
            }
          })
        );
      }
      body.append(row);
    }
    const resultNote = h('div', { className: 'note' });
    body.append(resultNote);
    const foot = h('div', { style: { display: 'flex', gap: '8px' } });
    const close = openModal(`Cambios propuestos (${plan.ops.length})`, body, foot);
    foot.append(
      h('button', { text: 'Cancelar', onClick: () => close() }),
      h('button', {
        className: 'primary',
        text: 'Aplicar todo',
        onClick: async () => {
          const results = await api.invoke('ai:applyEdits', { projectId: project.id, plan: plan as EditPlan });
          const okCount = results.filter((r) => r.ok).length;
          clear(resultNote);
          resultNote.append(
            h('span', {
              className: okCount === results.length ? 'note ok' : 'note error',
              text: results.map((r) => `${r.ok ? '✅' : '❌'} ${r.path}: ${r.detail}`).join(' · ')
            })
          );
          toast(`${okCount}/${results.length} operaciones aplicadas`, okCount === results.length ? 'ok' : 'error');
          bus.emit('file-saved', { projectId: project.id, path: '' });
        }
      })
    );
  }
}

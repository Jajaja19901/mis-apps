// Panel de historial de conversaciones: listar, crear, renombrar,
// borrar y compactar (resumir mensajes antiguos con el modelo).

import { api } from '../api';
import { clear, confirmModal, h, promptModal, toast } from '../dom';
import { bus, setActiveConversation, setConversations, state } from '../state';

export class ConversationsPanel {
  readonly element: HTMLElement;
  private listEl: HTMLElement;

  constructor() {
    this.listEl = h('div', { className: 'panel-list' });
    this.element = h(
      'div',
      { style: { display: 'flex', flexDirection: 'column', height: '100%' } },
      h(
        'div',
        { className: 'sidebar-head' },
        'Conversaciones',
        h(
          'div',
          { className: 'actions' },
          h('button', {
            text: '＋',
            title: 'Nueva conversación',
            ariaLabel: 'Nueva conversación',
            onClick: async () => {
              const conv = await api.invoke('conv:create', { projectId: state.activeProjectId });
              setConversations(await api.invoke('conv:list', undefined));
              setActiveConversation(conv.id);
            }
          })
        )
      ),
      h('div', { className: 'sidebar-body' }, this.listEl)
    );
    bus.on('conversations-changed', () => this.render());
    bus.on('active-conversation-changed', () => this.render());
    void this.load();
  }

  private async load(): Promise<void> {
    setConversations(await api.invoke('conv:list', undefined));
  }

  private render(): void {
    clear(this.listEl);
    if (state.conversations.length === 0) {
      this.listEl.append(h('div', { className: 'note', text: 'No hay conversaciones todavía.' }));
      return;
    }
    for (const meta of state.conversations) {
      const projectName = state.projects.find((p) => p.id === meta.projectId)?.name;
      this.listEl.append(
        h(
          'div',
          {
            className: `panel-item ${meta.id === state.activeConversationId ? 'active' : ''}`,
            onClick: () => setActiveConversation(meta.id)
          },
          h('div', { className: 'title', text: meta.title }),
          h('div', {
            className: 'sub',
            text: `${meta.messageCount} mensajes · ${new Date(meta.updatedAt).toLocaleString('es')}${projectName ? ` · ${projectName}` : ''}`
          }),
          h(
            'div',
            { className: 'row-actions' },
            h('button', {
              text: 'Renombrar',
              onClick: async (e) => {
                e.stopPropagation();
                const title = await promptModal('Renombrar conversación', 'Título', meta.title);
                if (!title) return;
                await api.invoke('conv:rename', { id: meta.id, title });
                await this.load();
              }
            }),
            h('button', {
              text: 'Compactar',
              title: 'Resume los mensajes antiguos con el modelo para liberar contexto',
              onClick: async (e) => {
                e.stopPropagation();
                const result = await api.invoke('conv:compact', { id: meta.id });
                if (!result.ok) toast(result.error, 'error');
                else {
                  toast('Conversación compactada', 'ok');
                  await this.load();
                  if (state.activeConversationId === meta.id) setActiveConversation(meta.id);
                }
              }
            }),
            h('button', {
              className: 'danger',
              text: 'Borrar',
              onClick: (e) => {
                e.stopPropagation();
                confirmModal('Borrar conversación', `¿Borrar "${meta.title}"?`, async () => {
                  await api.invoke('conv:delete', { id: meta.id });
                  if (state.activeConversationId === meta.id) setActiveConversation(null);
                  await this.load();
                });
              }
            })
          )
        )
      );
    }
  }
}

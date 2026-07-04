// Panel de memoria persistente: hechos que se inyectan en cada petición
// al modelo, con ámbito global o de proyecto.

import { api } from '../api';
import { clear, confirmModal, h, toast } from '../dom';
import { activeProject, bus, state } from '../state';

export class MemoryPanel {
  readonly element: HTMLElement;
  private listEl: HTMLElement;
  private inputEl: HTMLTextAreaElement;
  private scopeEl: HTMLSelectElement;

  constructor() {
    this.listEl = h('div', { className: 'panel-list' });
    this.inputEl = h('textarea', { placeholder: 'Ej.: "Usamos siempre TypeScript estricto y tests con vitest"…' });
    this.scopeEl = h(
      'select',
      { ariaLabel: 'Ámbito de la memoria' },
      h('option', { value: 'global', text: 'Global (todas las conversaciones)' }),
      h('option', { value: 'project', text: 'Solo el proyecto activo' })
    );
    this.element = h(
      'div',
      { style: { display: 'flex', flexDirection: 'column', height: '100%' } },
      h('div', { className: 'sidebar-head' }, 'Memoria del asistente'),
      h(
        'div',
        { className: 'panel-section' },
        this.inputEl,
        this.scopeEl,
        h('button', { className: 'primary', text: 'Guardar en memoria', onClick: () => void this.save() }),
        h('div', { className: 'note', text: 'Estas notas se añaden al system prompt de cada petición.' })
      ),
      h('div', { className: 'sidebar-body' }, this.listEl)
    );
    bus.on('active-project-changed', () => void this.refresh());
    void this.refresh();
  }

  private async save(): Promise<void> {
    const content = this.inputEl.value.trim();
    if (!content) return;
    const scope = this.scopeEl.value as 'global' | 'project';
    if (scope === 'project' && !state.activeProjectId) {
      toast('No hay proyecto activo para memoria de proyecto', 'error');
      return;
    }
    await api.invoke('memory:save', { scope, projectId: state.activeProjectId, content });
    this.inputEl.value = '';
    await this.refresh();
    toast('Guardado en memoria', 'ok', 1500);
  }

  private async refresh(): Promise<void> {
    clear(this.listEl);
    const entries = await api.invoke('memory:list', { projectId: state.activeProjectId });
    if (entries.length === 0) {
      this.listEl.append(h('div', { className: 'note', text: 'La memoria está vacía.' }));
      return;
    }
    const project = activeProject();
    for (const entry of entries) {
      this.listEl.append(
        h(
          'div',
          { className: 'panel-item' },
          h('div', { className: 'title', text: entry.content.slice(0, 120) }),
          h('div', {
            className: 'sub',
            text: entry.scope === 'global' ? '🌍 global' : `📁 ${project?.name ?? 'proyecto'}`
          }),
          h(
            'div',
            { className: 'row-actions' },
            h('button', {
              className: 'danger',
              text: 'Olvidar',
              onClick: () => {
                confirmModal('Olvidar', '¿Eliminar esta entrada de la memoria?', async () => {
                  await api.invoke('memory:delete', { id: entry.id });
                  await this.refresh();
                });
              }
            })
          )
        )
      );
    }
  }
}

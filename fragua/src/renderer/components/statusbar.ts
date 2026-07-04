// Barra de estado: proyecto activo, estado del índice, salud del modelo
// (comprobada periódicamente) y versión del runtime.

import { api } from '../api';
import { h } from '../dom';
import { activeProject, bus, state } from '../state';

export class StatusBar {
  readonly element: HTMLElement;
  private projectEl: HTMLElement;
  private indexEl: HTMLElement;
  private modelDot: HTMLElement;
  private modelEl: HTMLElement;
  private healthTimer: number | null = null;

  constructor() {
    this.projectEl = h('span', { text: 'Sin proyecto' });
    this.indexEl = h('span', { text: '' });
    this.modelDot = h('span', { className: 'dot' });
    this.modelEl = h('span', { text: 'modelo sin comprobar' });
    this.element = h(
      'div',
      { className: 'statusbar', role: 'status' },
      h('div', { className: 'item' }, h('span', { text: '📁' }), this.projectEl),
      h('div', { className: 'item' }, h('span', { text: '🔎' }), this.indexEl),
      h('div', { className: 'grow' }),
      h('div', { className: 'item' }, this.modelDot, this.modelEl),
      h('div', { className: 'item', text: '100% offline' })
    );

    bus.on('active-project-changed', (project) => {
      this.projectEl.textContent = project ? project.name : 'Sin proyecto';
    });
    bus.on('index-status', (status) => {
      if (status.projectId !== state.activeProjectId) return;
      this.indexEl.textContent =
        status.state === 'ready'
          ? `${status.chunks} fragmentos indexados`
          : status.state === 'indexing'
            ? 'indexando…'
            : status.state === 'error'
              ? 'error de índice'
              : 'sin indexar';
    });
    bus.on('settings-changed', () => void this.checkHealth());
    void this.checkHealth();
    this.healthTimer = window.setInterval(() => void this.checkHealth(), 30000);
  }

  dispose(): void {
    if (this.healthTimer !== null) window.clearInterval(this.healthTimer);
  }

  private async checkHealth(): Promise<void> {
    const profileLabel =
      state.settings?.modelProfiles.find((p) => p.id === state.settings?.activeModelProfileId)?.label ?? 'modelo';
    try {
      const health = await api.invoke('ai:health', undefined);
      this.modelDot.className = `dot ${health.ok ? 'ok' : 'error'}`;
      this.modelEl.textContent = `${profileLabel}: ${health.ok ? 'conectado' : 'sin conexión'}`;
      this.modelEl.title = health.detail;
    } catch {
      this.modelDot.className = 'dot error';
      this.modelEl.textContent = `${profileLabel}: error`;
    }
    void activeProject();
  }
}

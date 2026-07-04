// Panel de búsqueda: indexación del proyecto y búsqueda léxica /
// semántica / híbrida sobre el índice. Los resultados abren el fichero
// en la línea exacta.

import { api } from '../api';
import { clear, h, toast } from '../dom';
import { activeProject, bus } from '../state';
import type { IndexStatus } from '../../shared/types';

export class SearchPanel {
  readonly element: HTMLElement;
  private statusEl: HTMLElement;
  private resultsEl: HTMLElement;
  private queryEl: HTMLInputElement;
  private modeEl: HTMLSelectElement;
  private indexBtn: HTMLButtonElement;

  constructor() {
    this.statusEl = h('div', { className: 'note', text: 'Sin indexar' });
    this.resultsEl = h('div', { className: 'panel-list' });
    this.queryEl = h('input', {
      type: 'search',
      placeholder: 'Buscar en el código…',
      ariaLabel: 'Consulta de búsqueda',
      onKeyDown: (e) => {
        if (e.key === 'Enter') void this.search();
      }
    });
    this.modeEl = h(
      'select',
      { ariaLabel: 'Modo de búsqueda' },
      h('option', { value: 'hybrid', text: 'Híbrida (BM25 + embeddings)' }),
      h('option', { value: 'lexical', text: 'Léxica (BM25)' }),
      h('option', { value: 'semantic', text: 'Semántica (embeddings)' })
    );
    this.indexBtn = h('button', { text: 'Indexar proyecto', onClick: () => void this.buildIndex() });

    this.element = h(
      'div',
      { style: { display: 'flex', flexDirection: 'column', height: '100%' } },
      h('div', { className: 'sidebar-head' }, 'Búsqueda en el proyecto'),
      h(
        'div',
        { className: 'panel-section' },
        this.queryEl,
        this.modeEl,
        h('div', { className: 'inline' }, h('button', { className: 'primary', text: 'Buscar', onClick: () => void this.search() }), this.indexBtn),
        this.statusEl
      ),
      h('div', { className: 'sidebar-body' }, this.resultsEl)
    );

    api.on('index:progress', (status) => this.showStatus(status));
    bus.on('active-project-changed', () => void this.refreshStatus());
    void this.refreshStatus();
  }

  private async refreshStatus(): Promise<void> {
    const project = activeProject();
    if (!project) {
      this.statusEl.textContent = 'Abre un proyecto para indexarlo.';
      return;
    }
    this.showStatus(await api.invoke('index:status', { projectId: project.id }));
  }

  private showStatus(status: IndexStatus): void {
    const project = activeProject();
    if (!project || status.projectId !== project.id) return;
    const labels: Record<IndexStatus['state'], string> = {
      idle: 'Sin indexar',
      indexing: `Indexando… ${status.files} ficheros, ${status.chunks} fragmentos`,
      ready: `Índice listo: ${status.files} ficheros, ${status.chunks} fragmentos${status.vectors > 0 ? `, ${status.vectors} vectores` : ''}`,
      error: `Error: ${status.error ?? 'desconocido'}`
    };
    this.statusEl.textContent = labels[status.state];
    this.statusEl.className = `note ${status.state === 'error' ? 'error' : status.state === 'ready' ? 'ok' : ''}`.trim();
    this.indexBtn.disabled = status.state === 'indexing';
    bus.emit('index-status', status);
  }

  private async buildIndex(): Promise<void> {
    const project = activeProject();
    if (!project) {
      toast('Abre un proyecto primero', 'info');
      return;
    }
    this.indexBtn.disabled = true;
    const result = await api.invoke('index:build', { projectId: project.id });
    this.indexBtn.disabled = false;
    if (!result.ok) toast(result.error, 'error');
  }

  private async search(): Promise<void> {
    const project = activeProject();
    const query = this.queryEl.value.trim();
    if (!project || !query) return;
    clear(this.resultsEl);
    this.resultsEl.append(h('div', { className: 'note', text: 'Buscando…' }));
    const mode = this.modeEl.value as 'lexical' | 'semantic' | 'hybrid';
    const result = await api.invoke('index:search', { projectId: project.id, query, limit: 20, mode });
    clear(this.resultsEl);
    if (!result.ok) {
      this.resultsEl.append(h('div', { className: 'note error', text: result.error }));
      return;
    }
    if (result.value.length === 0) {
      this.resultsEl.append(h('div', { className: 'note', text: 'Sin resultados.' }));
      return;
    }
    for (const hit of result.value) {
      this.resultsEl.append(
        h(
          'div',
          {
            className: 'panel-item search-result',
            onClick: () => bus.emit('open-file', { projectId: project.id, path: hit.chunk.filePath, line: hit.chunk.startLine })
          },
          h('div', { className: 'title', text: `${hit.chunk.filePath}:${hit.chunk.startLine}` }),
          h('div', { className: 'sub', text: `${hit.origin} · score ${hit.score.toFixed(3)}${hit.chunk.symbols.length ? ` · ${hit.chunk.symbols.slice(0, 4).join(', ')}` : ''}` }),
          h('pre', { text: hit.chunk.content.slice(0, 400) })
        )
      );
    }
  }
}

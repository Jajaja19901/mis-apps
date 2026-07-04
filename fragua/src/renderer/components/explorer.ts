// Explorador de proyectos: selector de proyecto activo, árbol de ficheros
// con carpetas plegables y operaciones (crear, renombrar, borrar) vía
// menú contextual.

import { api } from '../api';
import { clear, confirmModal, h, openModal, promptModal, toast } from '../dom';
import { activeProject, bus, setActiveProject, setProjects, state } from '../state';
import type { FileNode } from '../../shared/types';

export class ExplorerPanel {
  readonly element: HTMLElement;
  private body: HTMLElement;
  private expanded = new Set<string>();
  private selectedPath: string | null = null;
  private refreshTimer: number | null = null;

  constructor() {
    this.body = h('div', { className: 'sidebar-body' });
    this.element = h(
      'div',
      { style: { display: 'flex', flexDirection: 'column', height: '100%' } },
      h(
        'div',
        { className: 'sidebar-head' },
        'Explorador',
        h(
          'div',
          { className: 'actions' },
          h('button', { text: '＋', title: 'Abrir proyecto', ariaLabel: 'Abrir proyecto', onClick: () => void this.openProject() }),
          h('button', { text: '↻', title: 'Refrescar árbol', ariaLabel: 'Refrescar', onClick: () => void this.refresh() })
        )
      ),
      this.body
    );
    bus.on('active-project-changed', () => void this.refresh());
    bus.on('projects-changed', () => void this.refresh());
    bus.on('fs-external-change', ({ projectId }) => {
      if (projectId === state.activeProjectId) this.scheduleRefresh();
    });
    bus.on('file-saved', () => this.scheduleRefresh());
    void this.refresh();
  }

  private scheduleRefresh(): void {
    if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => void this.refresh(), 700);
  }

  async openProject(): Promise<void> {
    const result = await api.invoke('project:openDialog', undefined);
    if (!result.ok) {
      if (result.error !== 'Selección cancelada') toast(result.error, 'error');
      return;
    }
    const projects = await api.invoke('project:list', undefined);
    setProjects(projects);
    setActiveProject(result.value.id);
  }

  private async refresh(): Promise<void> {
    clear(this.body);
    const projects = state.projects;
    // Selector de proyecto (gestión de múltiples proyectos abiertos)
    if (projects.length > 0) {
      const select = h('select', {
        ariaLabel: 'Proyecto activo',
        style: { width: '100%', marginBottom: '6px' },
        onChange: () => setActiveProject(select.value)
      });
      for (const p of projects) {
        select.append(h('option', { value: p.id, text: p.name, selected: p.id === state.activeProjectId }));
      }
      const closeBtn = h('button', {
        text: 'Cerrar proyecto',
        style: { width: '100%', marginBottom: '8px' },
        onClick: () => {
          const project = activeProject();
          if (!project) return;
          confirmModal('Cerrar proyecto', `¿Cerrar "${project.name}"? (no borra nada del disco)`, async () => {
            await api.invoke('project:close', { projectId: project.id });
            const list = await api.invoke('project:list', undefined);
            setProjects(list);
            setActiveProject(list[0]?.id ?? null);
          });
        }
      });
      this.body.append(select, closeBtn);
    }
    const project = activeProject();
    if (!project) {
      const recent = await api.invoke('project:recent', undefined);
      this.body.append(h('div', { className: 'tree-empty', text: 'Ningún proyecto abierto.' }));
      if (recent.length > 0) {
        this.body.append(h('div', { className: 'sidebar-head', text: 'Recientes' }));
        const list = h('div', { className: 'panel-list' });
        for (const r of recent.slice(0, 8)) {
          list.append(
            h(
              'div',
              {
                className: 'panel-item',
                onClick: async () => {
                  const opened = await api.invoke('project:open', { path: r.path });
                  if (!opened.ok) {
                    toast(opened.error, 'error');
                    return;
                  }
                  setProjects(await api.invoke('project:list', undefined));
                  setActiveProject(opened.value.id);
                }
              },
              h('div', { className: 'title', text: r.name }),
              h('div', { className: 'sub', text: r.path })
            )
          );
        }
        this.body.append(list);
      }
      return;
    }
    const tree = await api.invoke('project:tree', { projectId: project.id });
    if (!tree.ok) {
      this.body.append(h('div', { className: 'tree-empty', text: tree.error }));
      return;
    }
    const rootList = h('ul', { className: 'tree', role: 'tree' });
    for (const child of tree.value.children ?? []) rootList.append(this.renderNode(project.id, child));
    if ((tree.value.children ?? []).length === 0) {
      this.body.append(h('div', { className: 'tree-empty', text: 'Carpeta vacía' }));
    }
    this.body.append(rootList);
  }

  private renderNode(projectId: string, node: FileNode): HTMLElement {
    const li = h('li', { role: 'treeitem' });
    const isExpanded = this.expanded.has(node.path);
    const row = h(
      'div',
      {
        className: `row ${this.selectedPath === node.path ? 'selected' : ''}`,
        title: node.path,
        onClick: () => {
          this.selectedPath = node.path;
          if (node.kind === 'dir') {
            if (isExpanded) this.expanded.delete(node.path);
            else this.expanded.add(node.path);
            void this.refresh();
          } else {
            bus.emit('open-file', { projectId, path: node.path });
            void this.refresh();
          }
        },
        onContextMenu: (e) => {
          e.preventDefault();
          this.contextMenu(projectId, node);
        }
      },
      h('span', { className: 'twisty', text: node.kind === 'dir' ? (isExpanded ? '▾' : '▸') : '' }),
      h('span', { className: 'icon', text: node.kind === 'dir' ? '📁' : '📄' }),
      h('span', { text: node.name })
    );
    li.append(row);
    if (node.kind === 'dir' && isExpanded && node.children) {
      const ul = h('ul', {});
      for (const child of node.children) ul.append(this.renderNode(projectId, child));
      li.append(ul);
    }
    return li;
  }

  private contextMenu(projectId: string, node: FileNode): void {
    // Menú contextual como modal ligero (evita menús nativos por canal IPC extra)
    const actions: { label: string; run: () => void }[] = [];
    if (node.kind === 'dir') {
      actions.push(
        {
          label: 'Nuevo fichero aquí…',
          run: async () => {
            const name = await promptModal('Nuevo fichero', `Ruta dentro de "${node.path}"`, `${node.path}/nuevo.txt`);
            if (!name) return;
            const result = await api.invoke('fs:create', { projectId, path: name, kind: 'file' });
            if (!result.ok) toast(result.error, 'error');
            else {
              this.expanded.add(node.path);
              await this.refresh();
              bus.emit('open-file', { projectId, path: name });
            }
          }
        },
        {
          label: 'Nueva carpeta aquí…',
          run: async () => {
            const name = await promptModal('Nueva carpeta', `Ruta dentro de "${node.path}"`, `${node.path}/nueva-carpeta`);
            if (!name) return;
            const result = await api.invoke('fs:create', { projectId, path: name, kind: 'dir' });
            if (!result.ok) toast(result.error, 'error');
            else {
              this.expanded.add(node.path);
              await this.refresh();
            }
          }
        }
      );
    }
    actions.push(
      {
        label: 'Renombrar…',
        run: async () => {
          const to = await promptModal('Renombrar', 'Nueva ruta', node.path);
          if (!to || to === node.path) return;
          const result = await api.invoke('fs:rename', { projectId, from: node.path, to });
          if (!result.ok) toast(result.error, 'error');
          else await this.refresh();
        }
      },
      {
        label: node.kind === 'dir' ? 'Borrar carpeta' : 'Borrar fichero',
        run: () => {
          confirmModal('Borrar', `¿Borrar "${node.path}"?${node.kind === 'file' ? ' (queda copia en el historial local)' : ''}`, async () => {
            const result = await api.invoke('fs:delete', { projectId, path: node.path });
            if (!result.ok) toast(result.error, 'error');
            else await this.refresh();
          });
        }
      }
    );
    const body = h('div', { className: 'panel-list' });
    const closeMenu = openModal(node.path, body);
    for (const action of actions) {
      body.append(
        h(
          'div',
          {
            className: 'panel-item',
            onClick: () => {
              closeMenu();
              action.run();
            }
          },
          h('div', { className: 'title', text: action.label })
        )
      );
    }
  }
}

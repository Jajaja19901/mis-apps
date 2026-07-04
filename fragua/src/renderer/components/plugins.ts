// Panel de plugins: listado con estado, activar/desactivar, recargar y
// ejecutar comandos con argumento opcional; la salida se muestra en un
// modal (texto plano, sin interpretar).

import { api } from '../api';
import { clear, h, openModal, promptModal } from '../dom';
import { state } from '../state';

export class PluginsPanel {
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
        'Plugins',
        h(
          'div',
          { className: 'actions' },
          h('button', { text: '↻', title: 'Recargar plugins', ariaLabel: 'Recargar plugins', onClick: () => void this.refresh(true) })
        )
      ),
      h('div', { className: 'panel-section' }, h('div', { className: 'note', text: 'Los plugins viven en la carpeta plugins/ de los datos de Fragua. Cada uno: plugin.json + main.js. Consulta docs/PLUGINS.md.' })),
      h('div', { className: 'sidebar-body' }, this.listEl)
    );
    void this.refresh(false);
  }

  private async refresh(reload: boolean): Promise<void> {
    clear(this.listEl);
    const plugins = reload ? await api.invoke('plugins:reload', undefined) : await api.invoke('plugins:list', undefined);
    if (plugins.length === 0) {
      this.listEl.append(h('div', { className: 'note', text: 'No hay plugins instalados.' }));
      return;
    }
    for (const plugin of plugins) {
      const item = h(
        'div',
        { className: 'panel-item' },
        h('div', { className: 'title', text: `${plugin.manifest.name} v${plugin.manifest.version}` }),
        h('div', { className: 'sub', text: plugin.manifest.description || plugin.manifest.id }),
        plugin.error ? h('div', { className: 'note error', text: `⚠ ${plugin.error}` }) : null
      );
      const actions = h('div', { className: 'row-actions' });
      actions.append(
        h('button', {
          text: plugin.enabled ? 'Desactivar' : 'Activar',
          onClick: async () => {
            await api.invoke('plugins:setEnabled', { id: plugin.manifest.id, enabled: !plugin.enabled });
            await this.refresh(false);
          }
        })
      );
      if (plugin.enabled && !plugin.error) {
        for (const command of plugin.manifest.contributes.commands ?? []) {
          actions.append(
            h('button', {
              text: `▶ ${command.title}`,
              onClick: async () => {
                const arg = (await promptModal(command.title, 'Argumento (opcional)', '')) ?? '';
                const result = await api.invoke('plugins:runCommand', {
                  pluginId: plugin.manifest.id,
                  commandId: command.id,
                  projectId: state.activeProjectId,
                  arg
                });
                const pre = h('pre', {
                  text: result.output,
                  style: { whiteSpace: 'pre-wrap', maxHeight: '50vh', overflow: 'auto', margin: '0' }
                });
                openModal(`${command.title} — ${result.ok ? 'OK' : 'ERROR'}`, h('div', {}, pre));
              }
            })
          );
        }
      }
      item.append(actions);
      this.listEl.append(item);
    }
  }
}

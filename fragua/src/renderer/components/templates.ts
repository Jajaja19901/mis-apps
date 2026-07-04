// Panel de plantillas: instanciar plantillas (integradas o propias) en
// una carpeta elegida, y crear proyectos completos con la IA a partir de
// una descripción (generación vía protocolo fragua:write).

import { api } from '../api';
import { clear, h, openModal, toast } from '../dom';
import { bus, setActiveConversation, setConversations, setProjects, setActiveProject, state } from '../state';
import type { ProjectTemplate } from '../../shared/types';

export class TemplatesPanel {
  readonly element: HTMLElement;
  private listEl: HTMLElement;

  constructor() {
    this.listEl = h('div', { className: 'panel-list' });
    this.element = h(
      'div',
      { style: { display: 'flex', flexDirection: 'column', height: '100%' } },
      h('div', { className: 'sidebar-head' }, 'Plantillas y generación'),
      h(
        'div',
        { className: 'panel-section' },
        h('button', {
          className: 'primary',
          text: '✨ Generar proyecto con IA…',
          onClick: () => void this.generateWithAi()
        }),
        h('div', { className: 'note', text: 'O instancia una plantilla determinista:' })
      ),
      h('div', { className: 'sidebar-body' }, this.listEl)
    );
    void this.refresh();
  }

  private async refresh(): Promise<void> {
    clear(this.listEl);
    const templates = await api.invoke('templates:list', undefined);
    for (const template of templates) {
      this.listEl.append(
        h(
          'div',
          { className: 'panel-item' },
          h('div', { className: 'title', text: template.name }),
          h('div', { className: 'sub', text: `${template.builtin ? 'integrada' : 'propia'} · ${template.files.length} ficheros` }),
          h('div', { className: 'sub', text: template.description }),
          h(
            'div',
            { className: 'row-actions' },
            h('button', { text: 'Usar', onClick: () => void this.instantiate(template) }),
            !template.builtin
              ? h('button', {
                  className: 'danger',
                  text: 'Borrar',
                  onClick: async () => {
                    const result = await api.invoke('templates:delete', { id: template.id });
                    if (!result.ok) toast(result.error, 'error');
                    await this.refresh();
                  }
                })
              : null
          )
        )
      );
    }
  }

  private async instantiate(template: ProjectTemplate): Promise<void> {
    const inputs = new Map<string, HTMLInputElement>();
    const body = h('div', {});
    for (const variable of template.variables) {
      const input = h('input', { type: 'text', value: variable.default, placeholder: variable.default });
      inputs.set(variable.name, input);
      body.append(h('div', { className: 'field' }, h('label', { text: variable.label }), input));
    }
    const note = h('div', { className: 'note' });
    body.append(note);
    const foot = h('div', { style: { display: 'flex', gap: '8px' } });
    const close = openModal(`Plantilla: ${template.name}`, body, foot);
    foot.append(
      h('button', { text: 'Cancelar', onClick: () => close() }),
      h('button', {
        className: 'primary',
        text: 'Elegir carpeta y crear',
        onClick: async () => {
          const dir = await api.invoke('dialog:pickDirectory', undefined);
          if (!dir.ok) return;
          const variables: Record<string, string> = {};
          for (const [name, input] of inputs) variables[name] = input.value.trim();
          const result = await api.invoke('templates:instantiate', { templateId: template.id, targetDir: dir.value, variables });
          if (!result.ok) {
            note.textContent = result.error;
            note.className = 'note error';
            return;
          }
          close();
          toast(`Proyecto creado: ${result.value.written.length} ficheros`, 'ok');
          const opened = await api.invoke('project:open', { path: dir.value });
          if (opened.ok) {
            setProjects(await api.invoke('project:list', undefined));
            setActiveProject(opened.value.id);
          }
        }
      })
    );
  }

  /**
   * Generación con IA: crea una conversación con un prompt que exige el
   * protocolo fragua:write para todos los ficheros; el usuario revisa el
   * plan con "Revisar cambios propuestos" y lo aplica sobre el proyecto.
   */
  private async generateWithAi(): Promise<void> {
    const descInput = h('textarea', {
      placeholder: 'Describe el proyecto: qué hace, tecnologías, ficheros esperados…',
      style: { minHeight: '110px' }
    });
    const body = h(
      'div',
      {},
      h('div', { className: 'field' }, h('label', { text: 'Descripción del proyecto a generar' }), descInput),
      h('div', {
        className: 'note',
        text: 'Fragua pedirá al modelo TODOS los ficheros con el protocolo fragua:write. Después pulsa "Revisar cambios propuestos" en la respuesta para aplicarlos a la carpeta del proyecto activo.'
      })
    );
    const foot = h('div', { style: { display: 'flex', gap: '8px' } });
    const close = openModal('Generar proyecto con IA', body, foot);
    foot.append(
      h('button', { text: 'Cancelar', onClick: () => close() }),
      h('button', {
        className: 'primary',
        text: 'Pedir al modelo',
        onClick: async () => {
          const description = descInput.value.trim();
          if (!description) return;
          if (!state.activeProjectId) {
            toast('Abre (o crea) la carpeta destino como proyecto activo primero', 'error');
            return;
          }
          close();
          const conv = await api.invoke('conv:create', { projectId: state.activeProjectId, title: 'Generación de proyecto' });
          const prompt = [
            'Genera un proyecto COMPLETO y funcional según esta descripción:',
            '',
            description,
            '',
            'Requisitos estrictos:',
            '- Emite CADA fichero con un bloque ```fragua:write path=...``` con su contenido COMPLETO.',
            '- Incluye README.md con instrucciones de ejecución.',
            '- Nada de pseudocódigo ni funciones vacías; el proyecto debe ejecutar tal cual.',
            '- No repitas el contenido de los ficheros fuera de los bloques.'
          ].join('\n');
          await api.invoke('conv:appendMessage', { id: conv.id, role: 'user', content: prompt });
          setConversations(await api.invoke('conv:list', undefined));
          setActiveConversation(conv.id);
          bus.emit('chat-start-request', { conversationId: conv.id, useProjectContext: false });
        }
      })
    );
  }
}

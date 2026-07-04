// Panel de configuración: perfil de modelo activo (con edición completa
// de perfiles), comprobación de salud del proveedor, indexación, aspecto,
// terminal y exportación/importación de datos.

import { api } from '../api';
import { clear, h, openModal, toast } from '../dom';
import { setSettings, state } from '../state';
import type { ModelProfile, Settings } from '../../shared/types';

export class SettingsPanel {
  readonly element: HTMLElement;
  private body: HTMLElement;

  constructor() {
    this.body = h('div', { className: 'sidebar-body' });
    this.element = h(
      'div',
      { style: { display: 'flex', flexDirection: 'column', height: '100%' } },
      h('div', { className: 'sidebar-head' }, 'Configuración'),
      this.body
    );
    this.render();
  }

  private async update(partial: Partial<Settings>): Promise<void> {
    const updated = await api.invoke('settings:update', partial);
    setSettings(updated);
    this.render();
  }

  private render(): void {
    clear(this.body);
    const settings = state.settings;
    if (!settings) return;

    // ---- Modelo ----
    const profileSelect = h('select', {
      ariaLabel: 'Perfil de modelo activo',
      onChange: () => void this.update({ activeModelProfileId: profileSelect.value })
    });
    for (const profile of settings.modelProfiles) {
      profileSelect.append(h('option', { value: profile.id, text: profile.label, selected: profile.id === settings.activeModelProfileId }));
    }
    const healthNote = h('div', { className: 'note', text: 'Estado del proveedor: sin comprobar' });
    const active = settings.modelProfiles.find((p) => p.id === settings.activeModelProfileId);

    const modelSection = h(
      'div',
      { className: 'panel-section' },
      h('h3', { text: '🧠 Modelo de IA local' }),
      h('div', { className: 'field' }, h('label', { text: 'Perfil activo' }), profileSelect),
      h(
        'div',
        { className: 'inline' },
        h('button', {
          text: 'Comprobar conexión',
          onClick: async () => {
            healthNote.textContent = 'Comprobando…';
            healthNote.className = 'note';
            const health = await api.invoke('ai:health', undefined);
            healthNote.textContent = `${health.ok ? '✅' : '❌'} ${health.detail}${health.models.length ? ` · modelos: ${health.models.slice(0, 5).join(', ')}` : ''}`;
            healthNote.className = `note ${health.ok ? 'ok' : 'error'}`;
          }
        }),
        h('button', { text: 'Editar perfil…', onClick: () => active && this.editProfile(active, settings) })
      ),
      healthNote,
      active
        ? h('div', {
            className: 'note',
            text: `${active.kind} · ${active.baseUrl || 'sin URL'} · chat: ${active.chatModel} · embeddings: ${active.embeddingModel}`
          })
        : null
    );

    // ---- Indexación ----
    const embeddingsToggle = h('input', {
      type: 'checkbox',
      checked: settings.indexing.useEmbeddings,
      onChange: () => void this.update({ indexing: { ...settings.indexing, useEmbeddings: embeddingsToggle.checked } })
    });
    const indexingToggle = h('input', {
      type: 'checkbox',
      checked: settings.indexing.enabled,
      onChange: () => void this.update({ indexing: { ...settings.indexing, enabled: indexingToggle.checked } })
    });
    const indexSection = h(
      'div',
      { className: 'panel-section' },
      h('h3', { text: '🔎 Indexación' }),
      h('label', { className: 'toggle' }, indexingToggle, 'Indexación activada'),
      h('label', { className: 'toggle' }, embeddingsToggle, 'Embeddings (búsqueda semántica; requiere modelo de embeddings)'),
      h('div', { className: 'note', text: `Tamaño máx. por fichero: ${settings.indexing.maxFileSizeKb} KB · máx. fragmentos: ${settings.indexing.maxChunksPerProject}` })
    );

    // ---- Aspecto ----
    const themeSelect = h(
      'select',
      { onChange: () => void this.update({ theme: themeSelect.value as 'dark' | 'light' }) },
      h('option', { value: 'dark', text: 'Oscuro', selected: settings.theme === 'dark' }),
      h('option', { value: 'light', text: 'Claro', selected: settings.theme === 'light' })
    );
    const fontInput = h('input', {
      type: 'number',
      value: String(settings.editorFontSize),
      onChange: () => {
        const size = parseInt(fontInput.value, 10);
        if (size >= 8 && size <= 32) void this.update({ editorFontSize: size });
      }
    });
    const appearanceSection = h(
      'div',
      { className: 'panel-section' },
      h('h3', { text: '🎨 Aspecto' }),
      h('div', { className: 'field' }, h('label', { text: 'Tema' }), themeSelect),
      h('div', { className: 'field' }, h('label', { text: 'Tamaño de fuente del editor' }), fontInput)
    );

    // ---- Terminal ----
    const shellInput = h('input', { type: 'text', value: settings.terminalShell });
    const terminalSection = h(
      'div',
      { className: 'panel-section' },
      h('h3', { text: '⌨ Terminal' }),
      h('div', { className: 'field' }, h('label', { text: 'Shell' }), shellInput),
      h('button', { text: 'Guardar shell', onClick: () => void this.update({ terminalShell: shellInput.value.trim() || settings.terminalShell }) })
    );

    // ---- Datos ----
    const dataSection = h(
      'div',
      { className: 'panel-section' },
      h('h3', { text: '💾 Datos (offline, sin nube)' }),
      h(
        'div',
        { className: 'inline' },
        h('button', {
          text: 'Exportar todo…',
          onClick: async () => {
            const result = await api.invoke('export:bundle', {
              include: { settings: true, conversations: true, memory: true, templates: true }
            });
            if (result.ok) toast(`Exportado a ${result.value.path}`, 'ok');
            else if (result.error !== 'Exportación cancelada') toast(result.error, 'error');
          }
        }),
        h('button', {
          text: 'Importar…',
          onClick: async () => {
            const result = await api.invoke('import:bundle', undefined);
            if (result.ok) {
              toast(`Importado: ${result.value.imported.join(', ')}`, 'ok');
              setSettings(await api.invoke('settings:get', undefined));
              this.render();
            } else if (result.error !== 'Importación cancelada') {
              toast(result.error, 'error');
            }
          }
        })
      ),
      h('div', { className: 'note', text: 'Genera un único fichero .fragua.json con configuración, conversaciones, memoria y plantillas.' })
    );

    this.body.append(modelSection, indexSection, appearanceSection, terminalSection, dataSection);
  }

  /** Editor completo del perfil de modelo activo. */
  private editProfile(profile: ModelProfile, settings: Settings): void {
    const fields: Record<string, HTMLInputElement | HTMLSelectElement> = {
      label: h('input', { type: 'text', value: profile.label }),
      kind: h(
        'select',
        {},
        h('option', { value: 'ollama', text: 'Ollama', selected: profile.kind === 'ollama' }),
        h('option', { value: 'openai-compat', text: 'OpenAI-compatible (llama.cpp, LM Studio…)', selected: profile.kind === 'openai-compat' }),
        h('option', { value: 'mock', text: 'Simulador', selected: profile.kind === 'mock' })
      ),
      baseUrl: h('input', { type: 'text', value: profile.baseUrl, placeholder: 'http://127.0.0.1:11434' }),
      chatModel: h('input', { type: 'text', value: profile.chatModel }),
      embeddingModel: h('input', { type: 'text', value: profile.embeddingModel }),
      contextWindow: h('input', { type: 'number', value: String(profile.contextWindow) }),
      temperature: h('input', { type: 'number', value: String(profile.temperature) }),
      maxOutputTokens: h('input', { type: 'number', value: String(profile.maxOutputTokens) })
    };
    const labels: Record<string, string> = {
      label: 'Nombre del perfil',
      kind: 'Tipo de proveedor',
      baseUrl: 'URL base (siempre local)',
      chatModel: 'Modelo de chat',
      embeddingModel: 'Modelo de embeddings',
      contextWindow: 'Ventana de contexto (tokens)',
      temperature: 'Temperatura (0-1)',
      maxOutputTokens: 'Máx. tokens de salida'
    };
    const body = h('div', {});
    for (const [key, input] of Object.entries(fields)) {
      body.append(h('div', { className: 'field' }, h('label', { text: labels[key]! }), input));
    }
    const foot = h('div', { style: { display: 'flex', gap: '8px' } });
    const close = openModal(`Perfil: ${profile.label}`, body, foot);
    foot.append(
      h('button', { text: 'Cancelar', onClick: () => close() }),
      h('button', {
        className: 'primary',
        text: 'Guardar perfil',
        onClick: async () => {
          const updated: ModelProfile = {
            ...profile,
            label: (fields.label as HTMLInputElement).value.trim() || profile.label,
            kind: (fields.kind as HTMLSelectElement).value as ModelProfile['kind'],
            baseUrl: (fields.baseUrl as HTMLInputElement).value.trim(),
            chatModel: (fields.chatModel as HTMLInputElement).value.trim(),
            embeddingModel: (fields.embeddingModel as HTMLInputElement).value.trim(),
            contextWindow: Math.max(1024, parseInt((fields.contextWindow as HTMLInputElement).value, 10) || profile.contextWindow),
            temperature: Math.min(1, Math.max(0, parseFloat((fields.temperature as HTMLInputElement).value) || 0)),
            maxOutputTokens: Math.max(64, parseInt((fields.maxOutputTokens as HTMLInputElement).value, 10) || profile.maxOutputTokens)
          };
          const profiles = settings.modelProfiles.map((p) => (p.id === profile.id ? updated : p));
          await this.update({ modelProfiles: profiles });
          close();
          toast('Perfil guardado', 'ok');
        }
      })
    );
  }
}

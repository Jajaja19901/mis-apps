// Área central: pestañas + Monaco. Un único editor de código y un único
// editor de diff que se muestran/ocultan según la pestaña activa; cada
// pestaña de fichero conserva su modelo y su viewState (cursor, scroll).

import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
import { api } from '../api';
import { clear, confirmModal, h, openModal, toast } from '../dom';
import { bus, state } from '../state';
import type { FileVersion } from '../../shared/types';

self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string): Worker {
    switch (label) {
      case 'json':
        return new jsonWorker();
      case 'css':
      case 'scss':
      case 'less':
        return new cssWorker();
      case 'html':
      case 'handlebars':
      case 'razor':
        return new htmlWorker();
      case 'typescript':
      case 'javascript':
        return new tsWorker();
      default:
        return new editorWorker();
    }
  }
};

monaco.editor.defineTheme('fragua-dark', {
  base: 'vs-dark',
  inherit: true,
  rules: [],
  colors: {
    'editor.background': '#111418',
    'editorGutter.background': '#111418',
    'editorLineNumber.foreground': '#4a5260'
  }
});
monaco.editor.defineTheme('fragua-light', {
  base: 'vs',
  inherit: true,
  rules: [],
  colors: { 'editor.background': '#ffffff' }
});

const EXT_LANG: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript',
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  json: 'json', html: 'html', htm: 'html', css: 'css', scss: 'scss', less: 'less',
  md: 'markdown', py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java',
  c: 'c', h: 'c', cpp: 'cpp', hpp: 'cpp', cc: 'cpp', cs: 'csharp', php: 'php',
  sh: 'shell', bash: 'shell', zsh: 'shell', yml: 'yaml', yaml: 'yaml', xml: 'xml',
  sql: 'sql', swift: 'swift', kt: 'kotlin', lua: 'lua', toml: 'ini', ini: 'ini',
  dockerfile: 'dockerfile', vue: 'html', svelte: 'html'
};

export function languageForPath(path: string): string {
  const name = path.split('/').pop() ?? '';
  if (/^dockerfile$/i.test(name)) return 'dockerfile';
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
  return EXT_LANG[ext] ?? 'plaintext';
}

interface FileTab {
  kind: 'file';
  id: string;
  projectId: string;
  path: string;
  model: monaco.editor.ITextModel;
  viewState: monaco.editor.ICodeEditorViewState | null;
  dirty: boolean;
}

interface DiffTab {
  kind: 'diff';
  id: string;
  title: string;
  original: monaco.editor.ITextModel;
  modified: monaco.editor.ITextModel;
}

type Tab = FileTab | DiffTab;

export class EditorArea {
  private tabs: Tab[] = [];
  private activeTabId: string | null = null;
  private tabbar: HTMLElement;
  private host: HTMLElement;
  private codeMount: HTMLElement;
  private diffMount: HTMLElement;
  private placeholder: HTMLElement;
  private editor: monaco.editor.IStandaloneCodeEditor;
  private diffEditor: monaco.editor.IStandaloneDiffEditor | null = null;
  private nextId = 1;

  constructor(container: HTMLElement, private onOpenProject: () => void) {
    this.tabbar = h('div', { className: 'tabbar', role: 'tablist' });
    this.codeMount = h('div', { className: 'mount', style: { display: 'none' } });
    this.diffMount = h('div', { className: 'mount', style: { display: 'none' } });
    this.placeholder = this.buildPlaceholder();
    this.host = h('div', { className: 'editor-host' }, this.placeholder, this.codeMount, this.diffMount);
    container.append(this.tabbar, this.host);

    this.editor = monaco.editor.create(this.codeMount, {
      theme: state.settings?.theme === 'light' ? 'fragua-light' : 'fragua-dark',
      fontSize: state.settings?.editorFontSize ?? 14,
      automaticLayout: true,
      minimap: { enabled: true },
      scrollBeyondLastLine: false,
      renderWhitespace: 'selection',
      fixedOverflowWidgets: true
    });
    this.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => void this.saveActive());

    bus.on('settings-changed', (settings) => {
      monaco.editor.setTheme(settings.theme === 'light' ? 'fragua-light' : 'fragua-dark');
      this.editor.updateOptions({ fontSize: settings.editorFontSize });
    });
    bus.on('open-file', ({ projectId, path, line }) => void this.openFile(projectId, path, line));
    bus.on('open-diff', ({ title, original, modified, language }) => this.openDiff(title, original, modified, language));
    bus.on('fs-external-change', ({ projectId, path }) => void this.reloadIfClean(projectId, path));
  }

  private buildPlaceholder(): HTMLElement {
    return h(
      'div',
      { className: 'placeholder' },
      h(
        'div',
        { className: 'welcome' },
        h('h2', { text: 'Fragua' }),
        h('p', { text: 'Asistente de programación con IA 100% offline. Abre una carpeta de proyecto para empezar, o conversa con el modelo en el panel derecho.' }),
        h(
          'div',
          { className: 'cards' },
          h('button', { className: 'primary', text: 'Abrir proyecto…', onClick: () => this.onOpenProject() }),
          h('button', { text: 'Atajos: Ctrl+S guarda · Ctrl+Enter envía el chat' })
        )
      )
    );
  }

  private tabById(id: string): Tab | undefined {
    return this.tabs.find((t) => t.id === id);
  }

  activeFile(): { projectId: string; path: string; content: string } | null {
    const tab = this.activeTabId ? this.tabById(this.activeTabId) : undefined;
    if (!tab || tab.kind !== 'file') return null;
    return { projectId: tab.projectId, path: tab.path, content: tab.model.getValue() };
  }

  async openFile(projectId: string, path: string, line?: number): Promise<void> {
    const existing = this.tabs.find((t): t is FileTab => t.kind === 'file' && t.projectId === projectId && t.path === path);
    if (existing) {
      this.activate(existing.id);
      if (line) this.revealLine(line);
      return;
    }
    const read = await api.invoke('fs:read', { projectId, path });
    if (!read.ok) {
      toast(read.error, 'error');
      return;
    }
    const model = monaco.editor.createModel(read.value, languageForPath(path));
    const tab: FileTab = { kind: 'file', id: `tab${this.nextId++}`, projectId, path, model, viewState: null, dirty: false };
    model.onDidChangeContent(() => {
      if (!tab.dirty) {
        tab.dirty = true;
        this.renderTabs();
      }
    });
    this.tabs.push(tab);
    this.activate(tab.id);
    if (line) this.revealLine(line);
  }

  openDiff(title: string, original: string, modified: string, language: string): void {
    const tab: DiffTab = {
      kind: 'diff',
      id: `tab${this.nextId++}`,
      title,
      original: monaco.editor.createModel(original, language),
      modified: monaco.editor.createModel(modified, language)
    };
    this.tabs.push(tab);
    this.activate(tab.id);
  }

  private revealLine(line: number): void {
    this.editor.revealLineInCenter(line);
    this.editor.setPosition({ lineNumber: line, column: 1 });
    this.editor.focus();
  }

  private activate(id: string): void {
    const previous = this.activeTabId ? this.tabById(this.activeTabId) : undefined;
    if (previous && previous.kind === 'file') previous.viewState = this.editor.saveViewState();
    this.activeTabId = id;
    const tab = this.tabById(id);
    if (!tab) return;
    this.placeholder.style.display = 'none';
    if (tab.kind === 'file') {
      this.diffMount.style.display = 'none';
      this.codeMount.style.display = 'block';
      this.editor.setModel(tab.model);
      if (tab.viewState) this.editor.restoreViewState(tab.viewState);
      this.editor.focus();
    } else {
      this.codeMount.style.display = 'none';
      this.diffMount.style.display = 'block';
      if (!this.diffEditor) {
        this.diffEditor = monaco.editor.createDiffEditor(this.diffMount, {
          automaticLayout: true,
          readOnly: true,
          renderSideBySide: true
        });
      }
      this.diffEditor.setModel({ original: tab.original, modified: tab.modified });
    }
    this.renderTabs();
  }

  private close(id: string): void {
    const tab = this.tabById(id);
    if (!tab) return;
    const doClose = () => {
      if (tab.kind === 'file') {
        tab.model.dispose();
      } else {
        tab.original.dispose();
        tab.modified.dispose();
      }
      this.tabs = this.tabs.filter((t) => t.id !== id);
      if (this.activeTabId === id) {
        const next = this.tabs[this.tabs.length - 1];
        this.activeTabId = null;
        if (next) this.activate(next.id);
        else {
          this.codeMount.style.display = 'none';
          this.diffMount.style.display = 'none';
          this.placeholder.style.display = 'grid';
          this.renderTabs();
        }
      } else {
        this.renderTabs();
      }
    };
    if (tab.kind === 'file' && tab.dirty) {
      confirmModal('Cambios sin guardar', `"${tab.path}" tiene cambios sin guardar. ¿Cerrar igualmente?`, doClose);
    } else {
      doClose();
    }
  }

  async saveActive(): Promise<void> {
    const tab = this.activeTabId ? this.tabById(this.activeTabId) : undefined;
    if (!tab || tab.kind !== 'file') return;
    const result = await api.invoke('fs:write', { projectId: tab.projectId, path: tab.path, content: tab.model.getValue() });
    if (!result.ok) {
      toast(result.error, 'error');
      return;
    }
    tab.dirty = false;
    this.renderTabs();
    bus.emit('file-saved', { projectId: tab.projectId, path: tab.path });
    toast(`Guardado ${tab.path}`, 'ok', 1600);
  }

  private async reloadIfClean(projectId: string, path: string): Promise<void> {
    const tab = this.tabs.find((t): t is FileTab => t.kind === 'file' && t.projectId === projectId && t.path === path);
    if (!tab || tab.dirty) return;
    const read = await api.invoke('fs:read', { projectId, path });
    if (read.ok && read.value !== tab.model.getValue()) {
      const viewState = this.editor.saveViewState();
      tab.model.setValue(read.value);
      tab.dirty = false;
      if (this.activeTabId === tab.id && viewState) this.editor.restoreViewState(viewState);
      this.renderTabs();
    }
  }

  async showHistory(): Promise<void> {
    const active = this.activeFile();
    if (!active) {
      toast('Abre un fichero primero', 'info');
      return;
    }
    const versions = await api.invoke('history:list', { projectId: active.projectId, path: active.path });
    const body = h('div', { className: 'panel-list' });
    if (versions.length === 0) {
      body.append(h('p', { className: 'note', text: 'Sin versiones guardadas todavía. Cada guardado o edición de la IA crea una.' }));
    }
    const close = openModal(`Historial — ${active.path}`, body);
    const reasonLabel: Record<FileVersion['reason'], string> = {
      save: 'guardado manual',
      'ai-edit': 'edición de la IA',
      manual: 'antes de borrar'
    };
    for (const version of versions) {
      const row = h(
        'div',
        { className: 'panel-item' },
        h('div', { className: 'title', text: new Date(version.savedAt).toLocaleString('es') }),
        h('div', { className: 'sub', text: `${reasonLabel[version.reason]} · ${(version.sizeBytes / 1024).toFixed(1)} KB` }),
        h(
          'div',
          { className: 'row-actions' },
          h('button', {
            text: 'Comparar con actual',
            onClick: async () => {
              const content = await api.invoke('history:read', { projectId: active.projectId, versionId: version.id });
              if (!content.ok) {
                toast(content.error, 'error');
                return;
              }
              close();
              const current = this.activeFile();
              this.openDiff(
                `${active.path} (${new Date(version.savedAt).toLocaleTimeString('es')} → actual)`,
                content.value,
                current?.content ?? '',
                languageForPath(active.path)
              );
            }
          }),
          h('button', {
            text: 'Restaurar',
            onClick: () => {
              confirmModal('Restaurar versión', `Se sobrescribirá ${active.path} con la versión seleccionada (la actual queda en el historial).`, async () => {
                const result = await api.invoke('history:restore', { projectId: active.projectId, versionId: version.id });
                if (!result.ok) {
                  toast(result.error, 'error');
                  return;
                }
                close();
                await this.reloadForce(active.projectId, active.path);
                toast('Versión restaurada', 'ok');
              });
            }
          })
        )
      );
      body.append(row);
    }
  }

  private async reloadForce(projectId: string, path: string): Promise<void> {
    const tab = this.tabs.find((t): t is FileTab => t.kind === 'file' && t.projectId === projectId && t.path === path);
    if (!tab) return;
    const read = await api.invoke('fs:read', { projectId, path });
    if (read.ok) {
      tab.model.setValue(read.value);
      tab.dirty = false;
      this.renderTabs();
    }
  }

  closeProjectTabs(projectId: string): void {
    for (const tab of [...this.tabs]) {
      if (tab.kind === 'file' && tab.projectId === projectId) this.close(tab.id);
    }
  }

  private renderTabs(): void {
    clear(this.tabbar);
    for (const tab of this.tabs) {
      const label = tab.kind === 'file' ? tab.path.split('/').pop() ?? tab.path : tab.title;
      const tabEl = h(
        'div',
        {
          className: `tab ${tab.id === this.activeTabId ? 'active' : ''}`,
          role: 'tab',
          title: tab.kind === 'file' ? tab.path : tab.title,
          onClick: () => this.activate(tab.id)
        },
        tab.kind === 'diff' ? h('span', { className: 'icon', text: '⇄' }) : null,
        h('span', { text: label }),
        tab.kind === 'file' && tab.dirty ? h('span', { className: 'dirty', text: '•' }) : null,
        h('button', {
          className: 'close',
          text: '✕',
          ariaLabel: `Cerrar ${label}`,
          onClick: (e) => {
            e.stopPropagation();
            this.close(tab.id);
          }
        })
      );
      this.tabbar.append(tabEl);
    }
    if (this.tabs.length > 0) {
      this.tabbar.append(
        h('div', { style: { flex: '1' } }),
        h('button', {
          className: 'tab',
          text: '🕘 Historial',
          title: 'Historial local del fichero activo',
          onClick: () => void this.showHistory()
        })
      );
    }
  }
}

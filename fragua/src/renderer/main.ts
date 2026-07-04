// Punto de entrada del renderer: monta el workbench (barra de actividad,
// panel lateral, editor, chat, terminal, barra de estado), carga el
// estado inicial desde main y enruta los eventos globales.

import { api } from './api';
import { h, toast } from './dom';
import {
  bus,
  setActiveConversation,
  setConversations,
  setProjects,
  setSettings,
  setSidebarView,
  state,
  type SidebarView
} from './state';
import { EditorArea } from './components/editor';
import { ExplorerPanel } from './components/explorer';
import { ChatPanel } from './components/chat';
import { TerminalPanel } from './components/terminal';
import { SearchPanel } from './components/search';
import { ConversationsPanel } from './components/conversations';
import { TemplatesPanel } from './components/templates';
import { PluginsPanel } from './components/plugins';
import { MemoryPanel } from './components/memory';
import { SettingsPanel } from './components/settings';
import { StatusBar } from './components/statusbar';

async function bootstrap(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) throw new Error('Falta #app en index.html');

  // Estado inicial desde el proceso main
  setSettings(await api.invoke('settings:get', undefined));
  setProjects(await api.invoke('project:list', undefined));
  setConversations(await api.invoke('conv:list', undefined));

  // ---- Zona central ----
  const editorCol = h('div', { className: 'editor-col' });
  const explorer = new ExplorerPanel();
  const editor = new EditorArea(editorCol, () => void explorer.openProject());
  const chat = new ChatPanel(editor);
  const terminal = new TerminalPanel();
  const statusbar = new StatusBar();

  // ---- Paneles laterales ----
  const panels: Record<SidebarView, { icon: string; title: string; element: HTMLElement }> = {
    explorer: { icon: '🗂', title: 'Explorador', element: explorer.element },
    search: { icon: '🔎', title: 'Búsqueda', element: new SearchPanel().element },
    chats: { icon: '💬', title: 'Conversaciones', element: new ConversationsPanel().element },
    templates: { icon: '🧩', title: 'Plantillas', element: new TemplatesPanel().element },
    plugins: { icon: '🔌', title: 'Plugins', element: new PluginsPanel().element },
    memory: { icon: '🧠', title: 'Memoria', element: new MemoryPanel().element },
    settings: { icon: '⚙', title: 'Configuración', element: new SettingsPanel().element }
  };

  const sidebar = h('div', { className: 'sidebar' });
  const activityButtons = new Map<SidebarView, HTMLButtonElement>();
  const activitybar = h('div', { className: 'activitybar', role: 'navigation', ariaLabel: 'Vistas' });

  const showView = (view: SidebarView): void => {
    // pulsar la vista activa pliega/despliega el panel lateral
    if (state.sidebarView === view && !sidebar.classList.contains('hidden')) {
      sidebar.classList.add('hidden');
      activityButtons.get(view)?.classList.remove('active');
      return;
    }
    sidebar.classList.remove('hidden');
    setSidebarView(view);
    for (const [key, button] of activityButtons) button.classList.toggle('active', key === view);
    sidebar.replaceChildren(panels[view].element);
  };

  for (const [view, def] of Object.entries(panels) as [SidebarView, (typeof panels)[SidebarView]][]) {
    const button = h('button', {
      text: def.icon,
      title: def.title,
      ariaLabel: def.title,
      onClick: () => showView(view)
    });
    activityButtons.set(view, button);
    activitybar.append(button);
    if (view === 'plugins') activitybar.append(h('div', { className: 'spacer' }));
  }
  activitybar.append(
    h('button', {
      text: '⌨',
      title: 'Mostrar/ocultar terminal (Ctrl+`)',
      ariaLabel: 'Terminal',
      onClick: () => terminal.toggle()
    })
  );

  // ---- Composición del layout ----
  const centerRow = h('div', { className: 'center-row' }, editorCol, chat.element);
  const mainCol = h('div', { className: 'main-col' }, centerRow, terminal.element);
  terminal.element.classList.add('hidden');
  const workbench = h('div', { className: 'workbench' }, activitybar, sidebar, mainCol);
  root.append(workbench, statusbar.element);
  showView('explorer');

  // ---- Eventos globales ----
  api.on('fs:changed', (payload) => bus.emit('fs-external-change', payload));
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === '`') {
      e.preventDefault();
      terminal.toggle();
    }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      showView('search');
    }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'e') {
      e.preventDefault();
      showView('explorer');
    }
  });

  // Conversación inicial: retomar la última o empezar de cero al pedirlo
  const lastConversation = state.conversations[0];
  if (lastConversation) setActiveConversation(lastConversation.id);
}

bootstrap().catch((e: unknown) => {
  console.error(e);
  toast(`Error arrancando Fragua: ${(e as Error).message}`, 'error', 10000);
});

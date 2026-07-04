// Estado global del renderer + bus de eventos tipado. Deliberadamente
// pequeño: los componentes leen el estado, lo mutan mediante las
// funciones de este módulo y se suscriben a los eventos que les afectan.

import type { ConversationMeta, IndexStatus, ProjectInfo, Settings } from '../shared/types';

export interface AppEvents {
  'settings-changed': Settings;
  'projects-changed': ProjectInfo[];
  'active-project-changed': ProjectInfo | null;
  'conversations-changed': ConversationMeta[];
  'active-conversation-changed': string | null;
  'index-status': IndexStatus;
  'open-file': { projectId: string; path: string; line?: number };
  'open-diff': { title: string; original: string; modified: string; language: string };
  'sidebar-view': SidebarView;
  'file-saved': { projectId: string; path: string };
  'fs-external-change': { projectId: string; path: string };
  /** pide al ChatPanel que lance la petición al modelo sobre una conversación ya preparada */
  'chat-start-request': { conversationId: string; useProjectContext: boolean };
}

export type SidebarView = 'explorer' | 'search' | 'chats' | 'templates' | 'plugins' | 'memory' | 'settings';

type Handler<T> = (payload: T) => void;

class Bus {
  private handlers = new Map<keyof AppEvents, Set<Handler<never>>>();

  on<K extends keyof AppEvents>(event: K, handler: Handler<AppEvents[K]>): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as Handler<never>);
    return () => set!.delete(handler as Handler<never>);
  }

  emit<K extends keyof AppEvents>(event: K, payload: AppEvents[K]): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const handler of [...set]) {
      try {
        (handler as Handler<AppEvents[K]>)(payload);
      } catch (e) {
        console.error(`[bus:${event}]`, e);
      }
    }
  }
}

export const bus = new Bus();

interface State {
  settings: Settings | null;
  projects: ProjectInfo[];
  activeProjectId: string | null;
  conversations: ConversationMeta[];
  activeConversationId: string | null;
  sidebarView: SidebarView;
}

export const state: State = {
  settings: null,
  projects: [],
  activeProjectId: null,
  conversations: [],
  activeConversationId: null,
  sidebarView: 'explorer'
};

export function activeProject(): ProjectInfo | null {
  return state.projects.find((p) => p.id === state.activeProjectId) ?? null;
}

export function setSettings(settings: Settings): void {
  state.settings = settings;
  document.documentElement.dataset.theme = settings.theme;
  bus.emit('settings-changed', settings);
}

export function setProjects(projects: ProjectInfo[]): void {
  state.projects = projects;
  if (state.activeProjectId && !projects.some((p) => p.id === state.activeProjectId)) {
    state.activeProjectId = projects[0]?.id ?? null;
    bus.emit('active-project-changed', activeProject());
  }
  bus.emit('projects-changed', projects);
}

export function setActiveProject(projectId: string | null): void {
  if (state.activeProjectId === projectId) return;
  state.activeProjectId = projectId;
  bus.emit('active-project-changed', activeProject());
}

export function setConversations(list: ConversationMeta[]): void {
  state.conversations = list;
  bus.emit('conversations-changed', list);
}

export function setActiveConversation(id: string | null): void {
  state.activeConversationId = id;
  bus.emit('active-conversation-changed', id);
}

export function setSidebarView(view: SidebarView): void {
  state.sidebarView = view;
  bus.emit('sidebar-view', view);
}

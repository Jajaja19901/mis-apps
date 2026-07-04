// Contrato IPC tipado: cada canal declara su petición y su respuesta.
// Preload y main comparten este mapa, de modo que un canal mal usado
// no compila. Los eventos (main → renderer) van en IpcEvents.

import type {
  AppliedEdit,
  Conversation,
  ConversationMeta,
  EditPlan,
  ExportBundle,
  FileNode,
  FileVersion,
  IndexStatus,
  MemoryEntry,
  PluginCommandResult,
  PluginState,
  ProjectInfo,
  ProjectTemplate,
  ProviderHealth,
  Result,
  SearchResult,
  Settings,
  StreamChunk,
  TerminalSessionInfo
} from './types';

export interface IpcContract {
  // Configuración
  'settings:get': { req: void; res: Settings };
  'settings:update': { req: Partial<Settings>; res: Settings };

  // Proyectos
  'project:openDialog': { req: void; res: Result<ProjectInfo> };
  'project:open': { req: { path: string }; res: Result<ProjectInfo> };
  'project:close': { req: { projectId: string }; res: Result<null> };
  'project:list': { req: void; res: ProjectInfo[] };
  'project:recent': { req: void; res: ProjectInfo[] };
  'project:tree': { req: { projectId: string }; res: Result<FileNode> };

  // Ficheros
  'fs:read': { req: { projectId: string; path: string }; res: Result<string> };
  'fs:write': { req: { projectId: string; path: string; content: string }; res: Result<null> };
  'fs:create': { req: { projectId: string; path: string; kind: 'file' | 'dir' }; res: Result<null> };
  'fs:rename': { req: { projectId: string; from: string; to: string }; res: Result<null> };
  'fs:delete': { req: { projectId: string; path: string }; res: Result<null> };

  // Historial local de versiones
  'history:list': { req: { projectId: string; path: string }; res: FileVersion[] };
  'history:read': { req: { projectId: string; versionId: string }; res: Result<string> };
  'history:restore': { req: { projectId: string; versionId: string }; res: Result<null> };

  // Indexación y búsqueda
  'index:build': { req: { projectId: string }; res: Result<IndexStatus> };
  'index:status': { req: { projectId: string }; res: IndexStatus };
  'index:search': {
    req: { projectId: string; query: string; limit: number; mode: 'lexical' | 'semantic' | 'hybrid' };
    res: Result<SearchResult[]>;
  };

  // IA — la orquestación (memoria, retrieval, presupuesto) ocurre en main;
  // el renderer solo indica sobre qué conversación trabajar.
  'ai:chatStart': {
    req: { requestId: string; conversationId: string; useProjectContext: boolean };
    res: Result<null>;
  };
  'ai:chatCancel': { req: { requestId: string }; res: Result<null> };
  'ai:health': { req: void; res: ProviderHealth };
  'ai:parseEdits': { req: { text: string }; res: EditPlan };
  'ai:applyEdits': { req: { projectId: string; plan: EditPlan }; res: AppliedEdit[] };

  // Conversaciones y memoria
  'conv:list': { req: void; res: ConversationMeta[] };
  'conv:get': { req: { id: string }; res: Result<Conversation> };
  'conv:create': { req: { projectId: string | null; title?: string }; res: Conversation };
  'conv:appendMessage': {
    req: { id: string; role: 'user' | 'assistant'; content: string; attachments?: string[] };
    res: Result<Conversation>;
  };
  'conv:rename': { req: { id: string; title: string }; res: Result<null> };
  'conv:delete': { req: { id: string }; res: Result<null> };
  'conv:compact': { req: { id: string }; res: Result<Conversation> };
  'memory:list': { req: { projectId: string | null }; res: MemoryEntry[] };
  'memory:save': {
    req: { id?: string; scope: 'global' | 'project'; projectId: string | null; content: string };
    res: MemoryEntry;
  };
  'memory:delete': { req: { id: string }; res: Result<null> };

  // Terminal
  'term:create': { req: { projectId: string | null; cols: number; rows: number }; res: Result<TerminalSessionInfo> };
  'term:input': { req: { id: string; data: string }; res: void };
  'term:resize': { req: { id: string; cols: number; rows: number }; res: void };
  'term:kill': { req: { id: string }; res: void };
  'term:list': { req: void; res: TerminalSessionInfo[] };

  // Plugins
  'plugins:list': { req: void; res: PluginState[] };
  'plugins:setEnabled': { req: { id: string; enabled: boolean }; res: Result<null> };
  'plugins:reload': { req: void; res: PluginState[] };
  'plugins:runCommand': {
    req: { pluginId: string; commandId: string; projectId: string | null; arg: string };
    res: PluginCommandResult;
  };

  // Plantillas y generación de proyectos
  'templates:list': { req: void; res: ProjectTemplate[] };
  'templates:save': { req: { template: ProjectTemplate }; res: Result<null> };
  'templates:delete': { req: { id: string }; res: Result<null> };
  'templates:instantiate': {
    req: { templateId: string; targetDir: string; variables: Record<string, string> };
    res: Result<{ written: string[] }>;
  };

  // Exportación / importación
  'export:bundle': {
    req: { include: { settings: boolean; conversations: boolean; memory: boolean; templates: boolean } };
    res: Result<{ path: string }>;
  };
  'import:bundle': { req: void; res: Result<{ imported: string[] }> };

  // Diálogos nativos
  'dialog:pickDirectory': { req: void; res: Result<string> };
}

export type IpcChannel = keyof IpcContract;
export type IpcReq<C extends IpcChannel> = IpcContract[C]['req'];
export type IpcRes<C extends IpcChannel> = IpcContract[C]['res'];

export interface IpcEvents {
  'ai:stream': StreamChunk;
  'term:data': { id: string; data: string };
  'term:exit': { id: string; code: number };
  'index:progress': IndexStatus;
  'fs:changed': { projectId: string; path: string };
}

export type IpcEventChannel = keyof IpcEvents;
export type IpcEventPayload<C extends IpcEventChannel> = IpcEvents[C];

/** API que el preload expone en window.fragua */
export interface FraguaBridge {
  invoke<C extends IpcChannel>(channel: C, payload: IpcReq<C>): Promise<IpcRes<C>>;
  on<C extends IpcEventChannel>(channel: C, listener: (payload: IpcEventPayload<C>) => void): () => void;
  platform: string;
  versions: { electron: string; node: string; chrome: string };
}

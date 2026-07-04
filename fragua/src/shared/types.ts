// Tipos de dominio compartidos entre main, preload y renderer.
// Este archivo es la única fuente de verdad del modelo de datos.

// ---------- Configuración ----------

export type ProviderKind = 'ollama' | 'openai-compat' | 'mock';

export interface ModelProfile {
  id: string;
  label: string;
  kind: ProviderKind;
  baseUrl: string;
  chatModel: string;
  embeddingModel: string;
  contextWindow: number;
  temperature: number;
  maxOutputTokens: number;
}

export interface Settings {
  activeModelProfileId: string;
  modelProfiles: ModelProfile[];
  theme: 'dark' | 'light';
  uiLanguage: 'es' | 'en';
  editorFontSize: number;
  terminalShell: string;
  indexing: {
    enabled: boolean;
    useEmbeddings: boolean;
    maxFileSizeKb: number;
    maxChunksPerProject: number;
    excludeGlobs: string[];
  };
  chat: {
    maxContextTokens: number;
    maxSnippets: number;
    autoMemory: boolean;
  };
  telemetry: false; // producto offline: nunca hay telemetría, el tipo lo prohíbe
}

// ---------- Proyectos ----------

export interface ProjectInfo {
  id: string;
  path: string;
  name: string;
  openedAt: number;
}

export interface FileNode {
  name: string;
  path: string;
  kind: 'file' | 'dir';
  children?: FileNode[];
}

// ---------- Conversaciones y memoria ----------

export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
  /** rutas de archivos adjuntadas como contexto explícito */
  attachments?: string[];
  /** tokens estimados, para presupuesto de contexto */
  tokens?: number;
}

export interface Conversation {
  id: string;
  title: string;
  projectId: string | null;
  createdAt: number;
  updatedAt: number;
  /** resumen acumulado de mensajes antiguos ya compactados */
  summary: string;
  messages: ChatMessage[];
}

export interface ConversationMeta {
  id: string;
  title: string;
  projectId: string | null;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
}

export interface MemoryEntry {
  id: string;
  scope: 'global' | 'project';
  projectId: string | null;
  content: string;
  createdAt: number;
  updatedAt: number;
}

// ---------- Indexación y búsqueda ----------

export interface CodeChunk {
  id: string;
  filePath: string;
  startLine: number;
  endLine: number;
  content: string;
  symbols: string[];
}

export interface SearchResult {
  chunk: CodeChunk;
  score: number;
  origin: 'lexical' | 'semantic' | 'hybrid';
}

export interface IndexStatus {
  projectId: string;
  state: 'idle' | 'indexing' | 'ready' | 'error';
  files: number;
  chunks: number;
  vectors: number;
  lastUpdated: number;
  error?: string;
}

// ---------- IA ----------

export interface ChatRequestMessage {
  role: ChatRole;
  content: string;
}

export interface StreamChunk {
  requestId: string;
  delta: string;
  done: boolean;
  error?: string;
}

export interface ProviderHealth {
  ok: boolean;
  detail: string;
  models: string[];
}

// ---------- Ediciones propuestas por la IA ----------

export interface FileWriteOp {
  kind: 'write';
  path: string;
  content: string;
}

export interface FilePatchOp {
  kind: 'patch';
  path: string;
  /** diff unificado tal y como lo emitió el modelo */
  diff: string;
}

export interface FileDeleteOp {
  kind: 'delete';
  path: string;
}

export type EditOp = FileWriteOp | FilePatchOp | FileDeleteOp;

export interface EditPlan {
  ops: EditOp[];
  /** texto del modelo que no forma parte de ninguna operación */
  commentary: string;
}

export interface AppliedEdit {
  path: string;
  ok: boolean;
  detail: string;
}

// ---------- Historial local de versiones ----------

export interface FileVersion {
  id: string;
  filePath: string;
  savedAt: number;
  reason: 'save' | 'ai-edit' | 'manual';
  sizeBytes: number;
}

// ---------- Terminal ----------

export interface TerminalSessionInfo {
  id: string;
  title: string;
  cwd: string;
  backend: 'pty' | 'pipe';
}

// ---------- Plugins ----------

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  main: string;
  /** hooks que declara implementar */
  contributes: {
    commands?: { id: string; title: string }[];
  };
}

export interface PluginState {
  manifest: PluginManifest;
  dir: string;
  enabled: boolean;
  error?: string;
}

export interface PluginCommandResult {
  ok: boolean;
  output: string;
}

// ---------- Plantillas ----------

export interface TemplateFile {
  path: string;
  content: string;
}

export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  variables: { name: string; label: string; default: string }[];
  files: TemplateFile[];
  builtin: boolean;
}

// ---------- Exportación ----------

export interface ExportBundle {
  format: 'fragua-bundle';
  version: 1;
  exportedAt: number;
  settings?: Settings;
  conversations?: Conversation[];
  memory?: MemoryEntry[];
  templates?: ProjectTemplate[];
}

// ---------- Utilidades ----------

export interface Ok<T> {
  ok: true;
  value: T;
}

export interface Err {
  ok: false;
  error: string;
}

export type Result<T> = Ok<T> | Err;

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err(error: string): Err {
  return { ok: false, error };
}

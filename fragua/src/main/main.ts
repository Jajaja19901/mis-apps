// Proceso principal de Fragua: crea la ventana, instancia los servicios
// con el directorio de datos del usuario y los conecta al IPC.
// Seguridad del renderer: contextIsolation ON, nodeIntegration OFF,
// sandbox ON y navegación externa bloqueada.

import { app, BrowserWindow, Menu, shell, dialog, session } from 'electron';
import path from 'node:path';
import type { IpcEventChannel, IpcEventPayload } from '../shared/ipc';
import { SettingsService } from './services/settings';
import { ProjectService } from './services/projects';
import { FileService } from './services/files';
import { IndexerService } from './services/indexer';
import { createProvider, type AiProvider } from './services/ai/providers';
import { ConversationService } from './services/conversations';
import { MemoryService } from './services/memory';
import { ChatService } from './services/chat';
import { TerminalService } from './services/terminal';
import { PluginService, type PluginContext } from './services/plugins';
import { TemplateService } from './services/templates';
import { ExporterService } from './services/exporter';
import { registerIpcHandlers } from './ipcHandlers';

export interface Services {
  settings: SettingsService;
  projects: ProjectService;
  files: FileService;
  indexer: IndexerService;
  conversations: ConversationService;
  memory: MemoryService;
  chat: ChatService;
  terminal: TerminalService;
  plugins: PluginService;
  templates: TemplateService;
  exporter: ExporterService;
  provider: () => AiProvider;
}

let mainWindow: BrowserWindow | null = null;
let services: Services | null = null;

function emitToRenderer<C extends IpcEventChannel>(channel: C, payload: IpcEventPayload<C>): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function buildServices(): Services {
  const baseDir = app.getPath('userData');
  const settings = new SettingsService(baseDir);

  // El proveedor se cachea por perfil: cambiar el perfil activo en
  // Configuración crea el proveedor nuevo en la siguiente petición.
  let cachedProvider: AiProvider | null = null;
  const provider = (): AiProvider => {
    const profile = settings.activeProfile();
    if (!cachedProvider || cachedProvider.profile.id !== profile.id || cachedProvider.profile.baseUrl !== profile.baseUrl ||
        cachedProvider.profile.chatModel !== profile.chatModel || cachedProvider.profile.embeddingModel !== profile.embeddingModel) {
      cachedProvider = createProvider(profile);
    }
    return cachedProvider;
  };

  const projects = new ProjectService(baseDir, (payload) => emitToRenderer('fs:changed', payload));
  const files = new FileService(baseDir, (id) => projects.get(id));
  const indexer = new IndexerService(
    baseDir,
    projects,
    provider,
    () => settings.get(),
    (status) => emitToRenderer('index:progress', status)
  );
  projects.onFileChanged = (projectId, relPath) => void indexer.onFileChanged(projectId, relPath);

  const conversations = new ConversationService(baseDir);
  const memory = new MemoryService(baseDir);
  const chat = new ChatService(
    conversations,
    memory,
    indexer,
    files,
    provider,
    () => settings.get(),
    (chunk) => emitToRenderer('ai:stream', chunk)
  );
  const terminal = new TerminalService(
    () => settings.get().terminalShell,
    (projectId) => (projectId ? projects.get(projectId)?.path : undefined),
    (payload) => emitToRenderer('term:data', payload),
    (payload) => emitToRenderer('term:exit', payload)
  );
  const plugins = new PluginService(baseDir, (projectId, arg): PluginContext => {
    const project = projectId ? projects.get(projectId) : undefined;
    return {
      projectPath: project?.path ?? null,
      arg,
      readFile: (rel) => {
        if (!project) throw new Error('No hay proyecto activo');
        const r = files.read(project.id, rel);
        if (!r.ok) throw new Error(r.error);
        return r.value;
      },
      writeFile: (rel, content) => {
        if (!project) throw new Error('No hay proyecto activo');
        const r = files.write(project.id, rel, content, 'ai-edit');
        if (!r.ok) throw new Error(r.error);
      },
      listFiles: () => (project ? projects.listFiles(project.id) : []),
      chat: async (prompt) => {
        return provider().chat(
          [
            { role: 'system', content: 'Eres un asistente de código. Responde de forma concisa.' },
            { role: 'user', content: prompt }
          ],
          {
            temperature: 0.2,
            maxOutputTokens: 2048,
            signal: AbortSignal.timeout(180000),
            onDelta: () => undefined
          }
        );
      }
    };
  });
  plugins.installExampleIfEmpty();
  const templates = new TemplateService(baseDir);
  const exporter = new ExporterService(
    settings,
    conversations,
    memory,
    templates,
    async () => {
      if (!mainWindow) return null;
      const picked = await dialog.showSaveDialog(mainWindow, {
        title: 'Exportar datos de Fragua',
        defaultPath: 'fragua-backup.fragua.json',
        filters: [{ name: 'Bundle de Fragua', extensions: ['json'] }]
      });
      return picked.canceled || !picked.filePath ? null : picked.filePath;
    },
    async () => {
      if (!mainWindow) return null;
      const picked = await dialog.showOpenDialog(mainWindow, {
        title: 'Importar datos de Fragua',
        properties: ['openFile'],
        filters: [{ name: 'Bundle de Fragua', extensions: ['json'] }]
      });
      return picked.canceled || !picked.filePaths[0] ? null : picked.filePaths[0];
    }
  );

  return { settings, projects, files, indexer, conversations, memory, chat, terminal, plugins, templates, exporter, provider };
}

function devServerUrl(): string | null {
  const arg = process.argv.find((a) => a.startsWith('--dev-url='));
  return arg ? arg.slice('--dev-url='.length) : null;
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#111418',
    title: 'Fragua',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  });

  // Los enlaces externos se abren en el navegador del sistema, nunca dentro.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const dev = devServerUrl();
    if (!(dev && url.startsWith(dev)) && !url.startsWith('file://')) event.preventDefault();
  });

  const dev = devServerUrl();
  if (dev) {
    void mainWindow.loadURL(dev);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    void mainWindow.loadFile(path.join(__dirname, '..', '..', 'renderer', 'index.html'));
  }
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function buildMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'Fragua',
      submenu: [
        { role: 'about', label: 'Acerca de Fragua' },
        { type: 'separator' },
        { role: 'quit', label: 'Salir' }
      ]
    },
    {
      label: 'Edición',
      submenu: [
        { role: 'undo', label: 'Deshacer' },
        { role: 'redo', label: 'Rehacer' },
        { type: 'separator' },
        { role: 'cut', label: 'Cortar' },
        { role: 'copy', label: 'Copiar' },
        { role: 'paste', label: 'Pegar' },
        { role: 'selectAll', label: 'Seleccionar todo' }
      ]
    },
    {
      label: 'Ver',
      submenu: [
        { role: 'reload', label: 'Recargar' },
        { role: 'toggleDevTools', label: 'Herramientas de desarrollo' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Zoom normal' },
        { role: 'zoomIn', label: 'Acercar' },
        { role: 'zoomOut', label: 'Alejar' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Pantalla completa' }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  void app.whenReady().then(() => {
    // Cinturón extra: el renderer no puede pedir permisos (cámara, etc.).
    session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    services = buildServices();
    registerIpcHandlers(services, () => mainWindow);
    buildMenu();
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', () => {
    services?.terminal.dispose();
    services?.projects.dispose();
  });
}

// Registro central de manejadores IPC. El helper `handle` fija los tipos
// del contrato: canal equivocado o payload mal formado no compilan.

import { dialog, ipcMain, type BrowserWindow } from 'electron';
import type { IpcChannel, IpcReq, IpcRes } from '../shared/ipc';
import { err } from '../shared/types';
import { parseEditPlan } from '../shared/editProtocol';
import type { Services } from './main';

export function registerIpcHandlers(services: Services, getWindow: () => BrowserWindow | null): void {
  function handle<C extends IpcChannel>(channel: C, fn: (payload: IpcReq<C>) => IpcRes<C> | Promise<IpcRes<C>>): void {
    ipcMain.handle(channel, async (_event, payload: IpcReq<C>) => {
      try {
        return await fn(payload);
      } catch (e) {
        // Última red de seguridad: ninguna excepción debe tumbar el main.
        console.error(`[ipc:${channel}]`, e);
        return err(`Error interno en ${channel}: ${(e as Error).message}`) as IpcRes<C>;
      }
    });
  }

  // ---- Configuración ----
  handle('settings:get', () => services.settings.get());
  handle('settings:update', (partial) => services.settings.update(partial));

  // ---- Proyectos ----
  handle('project:openDialog', async () => {
    const win = getWindow();
    if (!win) return err('Sin ventana activa');
    const picked = await dialog.showOpenDialog(win, {
      title: 'Abrir carpeta de proyecto',
      properties: ['openDirectory']
    });
    const dir = picked.filePaths[0];
    if (picked.canceled || !dir) return err('Selección cancelada');
    return services.projects.open(dir);
  });
  handle('project:open', ({ path }) => services.projects.open(path));
  handle('project:close', ({ projectId }) => services.projects.close(projectId));
  handle('project:list', () => services.projects.list());
  handle('project:recent', () => services.projects.recent());
  handle('project:tree', ({ projectId }) => services.projects.tree(projectId));

  // ---- Ficheros ----
  handle('fs:read', ({ projectId, path }) => services.files.read(projectId, path));
  handle('fs:write', ({ projectId, path, content }) => services.files.write(projectId, path, content));
  handle('fs:create', ({ projectId, path, kind }) => services.files.create(projectId, path, kind));
  handle('fs:rename', ({ projectId, from, to }) => services.files.rename(projectId, from, to));
  handle('fs:delete', ({ projectId, path }) => services.files.delete(projectId, path));

  // ---- Historial local ----
  handle('history:list', ({ projectId, path }) => services.files.listVersions(projectId, path));
  handle('history:read', ({ projectId, versionId }) => services.files.readVersion(projectId, versionId));
  handle('history:restore', ({ projectId, versionId }) => services.files.restoreVersion(projectId, versionId));

  // ---- Indexación ----
  handle('index:build', ({ projectId }) => services.indexer.build(projectId));
  handle('index:status', ({ projectId }) => services.indexer.status(projectId));
  handle('index:search', ({ projectId, query, limit, mode }) => services.indexer.search(projectId, query, limit, mode));

  // ---- IA ----
  handle('ai:chatStart', ({ requestId, conversationId, useProjectContext }) =>
    services.chat.start(requestId, conversationId, useProjectContext)
  );
  handle('ai:chatCancel', ({ requestId }) => services.chat.cancel(requestId));
  handle('ai:health', () => services.provider().health());
  handle('ai:parseEdits', ({ text }) => parseEditPlan(text));
  handle('ai:applyEdits', ({ projectId, plan }) => services.files.applyEditPlan(projectId, plan));

  // ---- Conversaciones ----
  handle('conv:list', () => services.conversations.list());
  handle('conv:get', ({ id }) => services.conversations.get(id));
  handle('conv:create', ({ projectId, title }) => services.conversations.create(projectId, title));
  handle('conv:appendMessage', ({ id, role, content, attachments }) =>
    services.conversations.appendMessage(id, role, content, attachments)
  );
  handle('conv:rename', ({ id, title }) => services.conversations.rename(id, title));
  handle('conv:delete', ({ id }) => services.conversations.delete(id));
  handle('conv:compact', async ({ id }) => {
    try {
      return await services.chat.compact(id);
    } catch (e) {
      return err(`No se pudo compactar: ${(e as Error).message}`);
    }
  });

  // ---- Memoria ----
  handle('memory:list', ({ projectId }) => services.memory.list(projectId));
  handle('memory:save', (input) => services.memory.save(input));
  handle('memory:delete', ({ id }) => services.memory.delete(id));

  // ---- Terminal ----
  handle('term:create', ({ projectId, cols, rows }) => services.terminal.create(projectId, cols, rows));
  handle('term:input', ({ id, data }) => services.terminal.input(id, data));
  handle('term:resize', ({ id, cols, rows }) => services.terminal.resize(id, cols, rows));
  handle('term:kill', ({ id }) => services.terminal.kill(id));
  handle('term:list', () => services.terminal.list());

  // ---- Plugins ----
  handle('plugins:list', () => services.plugins.list());
  handle('plugins:setEnabled', ({ id, enabled }) => services.plugins.setEnabled(id, enabled));
  handle('plugins:reload', () => services.plugins.reload());
  handle('plugins:runCommand', ({ pluginId, commandId, projectId, arg }) =>
    services.plugins.runCommand(pluginId, commandId, projectId, arg)
  );

  // ---- Plantillas ----
  handle('templates:list', () => services.templates.list());
  handle('templates:save', ({ template }) => services.templates.save(template));
  handle('templates:delete', ({ id }) => services.templates.delete(id));
  handle('templates:instantiate', ({ templateId, targetDir, variables }) =>
    services.templates.instantiate(templateId, targetDir, variables)
  );

  // ---- Exportación ----
  handle('export:bundle', ({ include }) => services.exporter.exportBundle(include));
  handle('import:bundle', () => services.exporter.importBundle());

  // ---- Diálogos ----
  handle('dialog:pickDirectory', async () => {
    const win = getWindow();
    if (!win) return err('Sin ventana activa');
    const picked = await dialog.showOpenDialog(win, {
      title: 'Elegir carpeta',
      properties: ['openDirectory', 'createDirectory']
    });
    const dir = picked.filePaths[0];
    if (picked.canceled || !dir) return err('Selección cancelada');
    return { ok: true as const, value: dir };
  });
}

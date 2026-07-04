// Preload: único puente entre el renderer aislado y el proceso main.
// Expone una API mínima y con listas blancas de canales; el renderer
// jamás toca Node, fs ni ipcRenderer directamente.

import { contextBridge, ipcRenderer } from 'electron';
import type { FraguaBridge, IpcChannel, IpcEventChannel } from '../shared/ipc';

const INVOKE_CHANNELS: readonly IpcChannel[] = [
  'settings:get',
  'settings:update',
  'project:openDialog',
  'project:open',
  'project:close',
  'project:list',
  'project:recent',
  'project:tree',
  'fs:read',
  'fs:write',
  'fs:create',
  'fs:rename',
  'fs:delete',
  'history:list',
  'history:read',
  'history:restore',
  'index:build',
  'index:status',
  'index:search',
  'ai:chatStart',
  'ai:chatCancel',
  'ai:health',
  'ai:parseEdits',
  'ai:applyEdits',
  'conv:list',
  'conv:get',
  'conv:create',
  'conv:appendMessage',
  'conv:rename',
  'conv:delete',
  'conv:compact',
  'memory:list',
  'memory:save',
  'memory:delete',
  'term:create',
  'term:input',
  'term:resize',
  'term:kill',
  'term:list',
  'plugins:list',
  'plugins:setEnabled',
  'plugins:reload',
  'plugins:runCommand',
  'templates:list',
  'templates:save',
  'templates:delete',
  'templates:instantiate',
  'export:bundle',
  'import:bundle',
  'dialog:pickDirectory'
];

const EVENT_CHANNELS: readonly IpcEventChannel[] = ['ai:stream', 'term:data', 'term:exit', 'index:progress', 'fs:changed'];

const invokeSet = new Set<string>(INVOKE_CHANNELS);
const eventSet = new Set<string>(EVENT_CHANNELS);

const bridge: FraguaBridge = {
  invoke: (channel, payload) => {
    if (!invokeSet.has(channel)) return Promise.reject(new Error(`Canal IPC no permitido: ${channel}`));
    return ipcRenderer.invoke(channel, payload);
  },
  on: (channel, listener) => {
    if (!eventSet.has(channel)) throw new Error(`Canal de eventos no permitido: ${channel}`);
    const wrapped = (_event: Electron.IpcRendererEvent, payload: unknown) => listener(payload as never);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  },
  platform: process.platform,
  versions: {
    electron: process.versions.electron ?? '',
    node: process.versions.node ?? '',
    chrome: process.versions.chrome ?? ''
  }
};

contextBridge.exposeInMainWorld('fragua', bridge);

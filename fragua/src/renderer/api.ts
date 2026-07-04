// Acceso tipado al puente del preload. Todo el renderer importa `api`
// de aquí; si el preload no está (por ejemplo, abriendo el HTML en un
// navegador), se lanza un error claro en lugar de fallos silenciosos.

import type { FraguaBridge } from '../shared/ipc';

declare global {
  interface Window {
    fragua?: FraguaBridge;
  }
}

function getBridge(): FraguaBridge {
  if (!window.fragua) {
    throw new Error('El puente de Fragua no está disponible: la app debe ejecutarse dentro de Electron');
  }
  return window.fragua;
}

export const api: FraguaBridge = {
  invoke: (channel, payload) => getBridge().invoke(channel, payload),
  on: (channel, listener) => getBridge().on(channel, listener),
  get platform() {
    return getBridge().platform;
  },
  get versions() {
    return getBridge().versions;
  }
};

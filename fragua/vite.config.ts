import { defineConfig } from 'vite';
import path from 'node:path';

// El renderer se sirve desde file:// dentro de Electron, por eso base './'.
// Monaco y xterm se trocean en chunks propios para que el arranque cargue
// primero el shell de la UI y el editor llegue en paralelo.
export default defineConfig({
  root: path.resolve(__dirname, 'src/renderer'),
  base: './',
  build: {
    outDir: path.resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
    target: 'es2022',
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      output: {
        manualChunks: {
          monaco: ['monaco-editor'],
          xterm: ['@xterm/xterm', '@xterm/addon-fit']
        }
      }
    }
  },
  server: { port: 5183, strictPort: true }
});

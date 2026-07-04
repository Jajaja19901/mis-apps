// Sistema de plugins. Un plugin es una carpeta en <userData>/plugins con:
//   plugin.json  → manifiesto (id, name, version, main, contributes)
//   main.js      → módulo CommonJS que exporta `commands`
//
// Los comandos reciben un contexto controlado (leer/escribir ficheros del
// proyecto activo, consultar al modelo) y devuelven texto. Los plugins son
// código local del usuario: se ejecutan en el proceso main, igual que las
// extensiones de VS Code; el aislamiento es de errores (try/catch por
// llamada), no de privilegios, y así se documenta.

import fs from 'node:fs';
import path from 'node:path';
import type { PluginCommandResult, PluginManifest, PluginState, Result } from '../../shared/types';
import { err, ok } from '../../shared/types';
import { ensureDir, readJson, writeJsonAtomic } from '../storage';

export interface PluginContext {
  projectPath: string | null;
  readFile(relPath: string): string;
  writeFile(relPath: string, content: string): void;
  listFiles(): string[];
  chat(prompt: string): Promise<string>;
  arg: string;
}

type PluginCommandFn = (ctx: PluginContext) => string | Promise<string>;

interface LoadedPlugin {
  state: PluginState;
  commands: Map<string, PluginCommandFn>;
}

function validateManifest(raw: unknown, dir: string): PluginManifest | string {
  if (typeof raw !== 'object' || raw === null) return 'plugin.json no es un objeto';
  const m = raw as Record<string, unknown>;
  if (typeof m.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(m.id)) return 'id inválido (usa kebab-case)';
  if (typeof m.name !== 'string' || !m.name) return 'falta name';
  if (typeof m.version !== 'string' || !m.version) return 'falta version';
  if (typeof m.main !== 'string' || !m.main.endsWith('.js') || m.main.includes('..')) return 'main inválido';
  if (!fs.existsSync(path.join(dir, m.main))) return `no existe ${m.main}`;
  const contributes = (typeof m.contributes === 'object' && m.contributes !== null ? m.contributes : {}) as Record<string, unknown>;
  const commands: { id: string; title: string }[] = [];
  if (Array.isArray(contributes.commands)) {
    for (const c of contributes.commands) {
      const co = c as Record<string, unknown>;
      if (typeof co.id === 'string' && typeof co.title === 'string') commands.push({ id: co.id, title: co.title });
    }
  }
  return {
    id: m.id,
    name: m.name,
    version: m.version,
    description: typeof m.description === 'string' ? m.description : '',
    main: m.main,
    contributes: { commands }
  };
}

export class PluginService {
  private pluginsDir: string;
  private stateFile: string;
  private loaded = new Map<string, LoadedPlugin>();
  private disabled: Set<string>;

  constructor(
    baseDir: string,
    private makeContext: (projectId: string | null, arg: string) => PluginContext
  ) {
    this.pluginsDir = path.join(baseDir, 'plugins');
    this.stateFile = path.join(baseDir, 'plugins-state.json');
    ensureDir(this.pluginsDir);
    this.disabled = new Set(readJson<string[]>(this.stateFile, []));
    this.loadAll();
  }

  get directory(): string {
    return this.pluginsDir;
  }

  private loadAll(): void {
    this.loaded.clear();
    let dirs: string[] = [];
    try {
      dirs = fs
        .readdirSync(this.pluginsDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => path.join(this.pluginsDir, d.name));
    } catch {
      return;
    }
    for (const dir of dirs) {
      const manifestRaw = readJson<unknown>(path.join(dir, 'plugin.json'), null);
      if (manifestRaw === null) continue;
      const manifest = validateManifest(manifestRaw, dir);
      if (typeof manifest === 'string') {
        const id = path.basename(dir);
        this.loaded.set(id, {
          state: {
            manifest: { id, name: id, version: '0', description: '', main: '', contributes: {} },
            dir,
            enabled: false,
            error: manifest
          },
          commands: new Map()
        });
        continue;
      }
      const enabled = !this.disabled.has(manifest.id);
      const plugin: LoadedPlugin = {
        state: { manifest, dir, enabled },
        commands: new Map()
      };
      if (enabled) {
        try {
          const mainPath = path.join(dir, manifest.main);
          delete require.cache[require.resolve(mainPath)];
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const mod = require(mainPath) as { commands?: Record<string, PluginCommandFn> };
          if (mod && typeof mod.commands === 'object' && mod.commands !== null) {
            for (const [cmdId, fn] of Object.entries(mod.commands)) {
              if (typeof fn === 'function') plugin.commands.set(cmdId, fn);
            }
          }
          const declared = manifest.contributes.commands ?? [];
          for (const c of declared) {
            if (!plugin.commands.has(c.id)) {
              plugin.state.error = `El manifiesto declara el comando "${c.id}" pero main.js no lo exporta`;
            }
          }
        } catch (e) {
          plugin.state.error = `Error cargando main.js: ${(e as Error).message}`;
          plugin.commands.clear();
        }
      }
      this.loaded.set(manifest.id, plugin);
    }
  }

  list(): PluginState[] {
    return [...this.loaded.values()].map((p) => p.state).sort((a, b) => a.manifest.name.localeCompare(b.manifest.name));
  }

  reload(): PluginState[] {
    this.loadAll();
    return this.list();
  }

  setEnabled(id: string, enabled: boolean): Result<null> {
    if (!this.loaded.has(id)) return err('Plugin no encontrado');
    if (enabled) this.disabled.delete(id);
    else this.disabled.add(id);
    writeJsonAtomic(this.stateFile, [...this.disabled]);
    this.loadAll();
    return ok(null);
  }

  async runCommand(pluginId: string, commandId: string, projectId: string | null, arg: string): Promise<PluginCommandResult> {
    const plugin = this.loaded.get(pluginId);
    if (!plugin) return { ok: false, output: 'Plugin no encontrado' };
    if (!plugin.state.enabled) return { ok: false, output: 'El plugin está desactivado' };
    const fn = plugin.commands.get(commandId);
    if (!fn) return { ok: false, output: `El plugin no exporta el comando "${commandId}"` };
    try {
      const output = await fn(this.makeContext(projectId, arg));
      return { ok: true, output: String(output ?? '') };
    } catch (e) {
      return { ok: false, output: `El comando falló: ${(e as Error).message}` };
    }
  }

  /** Instala el plugin de ejemplo en la primera ejecución. */
  installExampleIfEmpty(): void {
    let entries: string[] = [];
    try {
      entries = fs.readdirSync(this.pluginsDir);
    } catch {
      return;
    }
    if (entries.length > 0) return;
    const dir = path.join(this.pluginsDir, 'contador-lineas');
    ensureDir(dir);
    writeJsonAtomic(path.join(dir, 'plugin.json'), {
      id: 'contador-lineas',
      name: 'Contador de líneas',
      version: '1.0.0',
      description: 'Cuenta líneas y ficheros del proyecto activo, agrupado por extensión.',
      main: 'main.js',
      contributes: { commands: [{ id: 'contar', title: 'Contar líneas del proyecto' }] }
    });
    fs.writeFileSync(
      path.join(dir, 'main.js'),
      `// Plugin de ejemplo de Fragua: cuenta líneas por extensión.
'use strict';

exports.commands = {
  contar(ctx) {
    if (!ctx.projectPath) return 'Abre un proyecto primero.';
    const porExtension = new Map();
    let totalLineas = 0;
    let totalFicheros = 0;
    for (const rel of ctx.listFiles()) {
      let contenido;
      try {
        contenido = ctx.readFile(rel);
      } catch {
        continue;
      }
      const lineas = contenido.split('\\n').length;
      const punto = rel.lastIndexOf('.');
      const ext = punto >= 0 ? rel.slice(punto) : '(sin extensión)';
      const previo = porExtension.get(ext) || { ficheros: 0, lineas: 0 };
      porExtension.set(ext, { ficheros: previo.ficheros + 1, lineas: previo.lineas + lineas });
      totalLineas += lineas;
      totalFicheros += 1;
    }
    const filas = [...porExtension.entries()]
      .sort((a, b) => b[1].lineas - a[1].lineas)
      .slice(0, 15)
      .map(([ext, datos]) => ext + ': ' + datos.ficheros + ' ficheros, ' + datos.lineas + ' líneas');
    return 'Total: ' + totalFicheros + ' ficheros, ' + totalLineas + ' líneas\\n' + filas.join('\\n');
  }
};
`,
      'utf8'
    );
    this.loadAll();
  }
}

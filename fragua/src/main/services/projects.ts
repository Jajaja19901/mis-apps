// Gestión de proyectos abiertos: registro en memoria, recientes en disco,
// árbol de ficheros con reglas de ignorado y vigilancia de cambios.

import fs from 'node:fs';
import path from 'node:path';
import type { FileNode, ProjectInfo, Result } from '../../shared/types';
import { err, ok } from '../../shared/types';
import { fnv1a } from '../../shared/textUtils';
import { IgnoreMatcher } from '../../shared/ignore';
import { readJson, writeJsonAtomic } from '../storage';

const MAX_TREE_ENTRIES = 30000;

export type ProjectEmitter = (payload: { projectId: string; path: string }) => void;

export class ProjectService {
  private open_ = new Map<string, ProjectInfo>();
  private watchers = new Map<string, fs.FSWatcher>();
  private recentFile: string;
  private emitChange: ProjectEmitter;
  /** callback opcional para que el indexador reaccione a cambios */
  onFileChanged: ((projectId: string, relPath: string) => void) | null = null;

  constructor(baseDir: string, emitChange: ProjectEmitter) {
    this.recentFile = path.join(baseDir, 'recent-projects.json');
    this.emitChange = emitChange;
  }

  open(dirPath: string): Result<ProjectInfo> {
    const abs = path.resolve(dirPath);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(abs);
    } catch {
      return err(`No existe la ruta: ${abs}`);
    }
    if (!stat.isDirectory()) return err(`No es un directorio: ${abs}`);
    const id = fnv1a(abs);
    const existing = this.open_.get(id);
    if (existing) return ok(existing);
    const info: ProjectInfo = { id, path: abs, name: path.basename(abs), openedAt: Date.now() };
    this.open_.set(id, info);
    this.rememberRecent(info);
    this.startWatcher(info);
    return ok(info);
  }

  close(projectId: string): Result<null> {
    const info = this.open_.get(projectId);
    if (!info) return err('Proyecto no abierto');
    this.open_.delete(projectId);
    const watcher = this.watchers.get(projectId);
    if (watcher) {
      watcher.close();
      this.watchers.delete(projectId);
    }
    return ok(null);
  }

  get(projectId: string): ProjectInfo | undefined {
    return this.open_.get(projectId);
  }

  list(): ProjectInfo[] {
    return [...this.open_.values()].sort((a, b) => a.openedAt - b.openedAt);
  }

  recent(): ProjectInfo[] {
    return readJson<ProjectInfo[]>(this.recentFile, []).filter((p) => {
      try {
        return fs.statSync(p.path).isDirectory();
      } catch {
        return false;
      }
    });
  }

  private rememberRecent(info: ProjectInfo): void {
    const recent = readJson<ProjectInfo[]>(this.recentFile, []).filter((p) => p.id !== info.id);
    recent.unshift(info);
    writeJsonAtomic(this.recentFile, recent.slice(0, 15));
  }

  buildIgnoreMatcher(projectRoot: string): IgnoreMatcher {
    const matcher = IgnoreMatcher.withDefaults(['.fragua/']);
    try {
      const gitignore = fs.readFileSync(path.join(projectRoot, '.gitignore'), 'utf8');
      matcher.addGitignore(gitignore);
    } catch {
      // sin .gitignore: solo defaults
    }
    return matcher;
  }

  tree(projectId: string): Result<FileNode> {
    const info = this.open_.get(projectId);
    if (!info) return err('Proyecto no abierto');
    const matcher = this.buildIgnoreMatcher(info.path);
    let entries = 0;
    const walk = (dir: string, rel: string): FileNode[] => {
      let dirents: fs.Dirent[];
      try {
        dirents = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return [];
      }
      const nodes: FileNode[] = [];
      for (const d of dirents) {
        if (entries >= MAX_TREE_ENTRIES) break;
        const childRel = rel ? `${rel}/${d.name}` : d.name;
        const isDir = d.isDirectory();
        if (matcher.ignores(childRel, isDir)) continue;
        if (d.isSymbolicLink()) continue;
        entries++;
        if (isDir) {
          nodes.push({ name: d.name, path: childRel, kind: 'dir', children: walk(path.join(dir, d.name), childRel) });
        } else if (d.isFile()) {
          nodes.push({ name: d.name, path: childRel, kind: 'file' });
        }
      }
      nodes.sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1;
        return a.name.localeCompare(b.name, 'es');
      });
      return nodes;
    };
    return ok({ name: info.name, path: '', kind: 'dir', children: walk(info.path, '') });
  }

  /** Enumera rutas relativas de todos los ficheros indexables. */
  listFiles(projectId: string): string[] {
    const info = this.open_.get(projectId);
    if (!info) return [];
    const matcher = this.buildIgnoreMatcher(info.path);
    const out: string[] = [];
    const walk = (dir: string, rel: string): void => {
      if (out.length >= MAX_TREE_ENTRIES) return;
      let dirents: fs.Dirent[];
      try {
        dirents = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const d of dirents) {
        const childRel = rel ? `${rel}/${d.name}` : d.name;
        const isDir = d.isDirectory();
        if (matcher.ignores(childRel, isDir)) continue;
        if (d.isSymbolicLink()) continue;
        if (isDir) walk(path.join(dir, d.name), childRel);
        else if (d.isFile()) out.push(childRel);
      }
    };
    walk(info.path, '');
    return out;
  }

  private startWatcher(info: ProjectInfo): void {
    // fs.watch recursivo está soportado en Linux desde Node 20, y en
    // macOS/Windows desde siempre. Si falla, la app sigue funcionando
    // sin autorefresco (el usuario puede refrescar el árbol a mano).
    try {
      const pending = new Map<string, NodeJS.Timeout>();
      const watcher = fs.watch(info.path, { recursive: true }, (_event, filename) => {
        if (!filename) return;
        const rel = filename.toString().replace(/\\/g, '/');
        const matcher = this.buildIgnoreMatcher(info.path);
        if (matcher.ignores(rel, false)) return;
        const existing = pending.get(rel);
        if (existing) clearTimeout(existing);
        pending.set(
          rel,
          setTimeout(() => {
            pending.delete(rel);
            this.emitChange({ projectId: info.id, path: rel });
            if (this.onFileChanged) this.onFileChanged(info.id, rel);
          }, 400)
        );
      });
      this.watchers.set(info.id, watcher);
    } catch {
      // vigilancia no disponible: sin efecto funcional crítico
    }
  }

  dispose(): void {
    for (const watcher of this.watchers.values()) watcher.close();
    this.watchers.clear();
  }
}

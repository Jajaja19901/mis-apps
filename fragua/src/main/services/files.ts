// Acceso a ficheros de proyecto con tres garantías:
// 1) Toda ruta se resuelve DENTRO de la raíz del proyecto (anti-traversal).
// 2) Antes de sobrescribir o borrar se guarda una versión en el historial
//    local, así cualquier edición (humana o de la IA) es reversible.
// 3) Límites de tamaño para no congelar la UI con ficheros gigantes.

import fs from 'node:fs';
import path from 'node:path';
import type { AppliedEdit, EditPlan, FileVersion, ProjectInfo, Result } from '../../shared/types';
import { err, ok } from '../../shared/types';
import { fnv1a, newId } from '../../shared/textUtils';
import { applyUnifiedDiff } from '../../shared/editProtocol';
import { looksBinaryContent } from '../../shared/chunker';
import { ensureDir, listJsonFiles, readJson, removeFile, writeJsonAtomic } from '../storage';

const MAX_READ_BYTES = 2 * 1024 * 1024;
const MAX_VERSIONS_PER_FILE = 20;

interface StoredVersion {
  meta: FileVersion;
  content: string;
}

export class FileService {
  private historyDir: string;

  constructor(
    baseDir: string,
    private getProject: (projectId: string) => ProjectInfo | undefined
  ) {
    this.historyDir = path.join(baseDir, 'history');
  }

  /** Resuelve una ruta relativa dentro del proyecto o devuelve null. */
  resolve(projectId: string, relPath: string): { abs: string; root: string; rel: string } | null {
    const project = this.getProject(projectId);
    if (!project) return null;
    const cleaned = relPath.replace(/\\/g, '/');
    // las rutas absolutas se rechazan (no se reinterpretan como relativas)
    if (path.isAbsolute(cleaned) || /^[A-Za-z]:/.test(cleaned)) return null;
    const abs = path.resolve(project.path, cleaned);
    const rootWithSep = project.path.endsWith(path.sep) ? project.path : project.path + path.sep;
    if (abs !== project.path && !abs.startsWith(rootWithSep)) return null;
    return { abs, root: project.path, rel: cleaned };
  }

  read(projectId: string, relPath: string): Result<string> {
    const loc = this.resolve(projectId, relPath);
    if (!loc) return err('Ruta fuera del proyecto o proyecto no abierto');
    let stat: fs.Stats;
    try {
      stat = fs.statSync(loc.abs);
    } catch {
      return err(`No existe: ${relPath}`);
    }
    if (!stat.isFile()) return err(`No es un fichero: ${relPath}`);
    if (stat.size > MAX_READ_BYTES) return err(`Fichero demasiado grande para el editor (${Math.round(stat.size / 1024)} KB)`);
    const content = fs.readFileSync(loc.abs, 'utf8');
    if (looksBinaryContent(content.slice(0, 2000))) return err('Fichero binario: no editable como texto');
    return ok(content);
  }

  write(projectId: string, relPath: string, content: string, reason: 'save' | 'ai-edit' = 'save'): Result<null> {
    const loc = this.resolve(projectId, relPath);
    if (!loc) return err('Ruta fuera del proyecto o proyecto no abierto');
    try {
      this.snapshotIfExists(projectId, loc.abs, loc.rel, reason);
      ensureDir(path.dirname(loc.abs));
      fs.writeFileSync(loc.abs, content, 'utf8');
      return ok(null);
    } catch (e) {
      return err(`No se pudo escribir ${relPath}: ${(e as Error).message}`);
    }
  }

  create(projectId: string, relPath: string, kind: 'file' | 'dir'): Result<null> {
    const loc = this.resolve(projectId, relPath);
    if (!loc) return err('Ruta fuera del proyecto o proyecto no abierto');
    try {
      if (fs.existsSync(loc.abs)) return err(`Ya existe: ${relPath}`);
      if (kind === 'dir') {
        fs.mkdirSync(loc.abs, { recursive: true });
      } else {
        ensureDir(path.dirname(loc.abs));
        fs.writeFileSync(loc.abs, '', 'utf8');
      }
      return ok(null);
    } catch (e) {
      return err(`No se pudo crear ${relPath}: ${(e as Error).message}`);
    }
  }

  rename(projectId: string, from: string, to: string): Result<null> {
    const src = this.resolve(projectId, from);
    const dst = this.resolve(projectId, to);
    if (!src || !dst) return err('Ruta fuera del proyecto o proyecto no abierto');
    try {
      if (!fs.existsSync(src.abs)) return err(`No existe: ${from}`);
      if (fs.existsSync(dst.abs)) return err(`Ya existe: ${to}`);
      ensureDir(path.dirname(dst.abs));
      fs.renameSync(src.abs, dst.abs);
      return ok(null);
    } catch (e) {
      return err(`No se pudo renombrar: ${(e as Error).message}`);
    }
  }

  delete(projectId: string, relPath: string): Result<null> {
    const loc = this.resolve(projectId, relPath);
    if (!loc) return err('Ruta fuera del proyecto o proyecto no abierto');
    if (loc.abs === loc.root) return err('No se puede borrar la raíz del proyecto');
    try {
      const stat = fs.statSync(loc.abs);
      if (stat.isFile()) this.snapshotIfExists(projectId, loc.abs, loc.rel, 'manual');
      fs.rmSync(loc.abs, { recursive: true });
      return ok(null);
    } catch (e) {
      return err(`No se pudo borrar ${relPath}: ${(e as Error).message}`);
    }
  }

  // ---------- Historial local ----------

  private versionDir(projectId: string, rel: string): string {
    return path.join(this.historyDir, projectId, fnv1a(rel));
  }

  private snapshotIfExists(projectId: string, abs: string, rel: string, reason: 'save' | 'ai-edit' | 'manual'): void {
    let stat: fs.Stats;
    try {
      stat = fs.statSync(abs);
    } catch {
      return; // el fichero es nuevo: nada que versionar
    }
    if (!stat.isFile() || stat.size > MAX_READ_BYTES) return;
    const content = fs.readFileSync(abs, 'utf8');
    if (looksBinaryContent(content.slice(0, 2000))) return;
    const meta: FileVersion = {
      id: newId('ver'),
      filePath: rel,
      savedAt: Date.now(),
      reason,
      sizeBytes: stat.size
    };
    const dir = this.versionDir(projectId, rel);
    writeJsonAtomic(path.join(dir, `${meta.savedAt}-${meta.id}.json`), { meta, content } satisfies StoredVersion);
    this.pruneVersions(dir);
  }

  private pruneVersions(dir: string): void {
    const files = listJsonFiles(dir).sort();
    while (files.length > MAX_VERSIONS_PER_FILE) {
      removeFile(files.shift()!);
    }
  }

  listVersions(projectId: string, relPath: string): FileVersion[] {
    const loc = this.resolve(projectId, relPath);
    if (!loc) return [];
    const dir = this.versionDir(projectId, loc.rel);
    return listJsonFiles(dir)
      .map((f) => readJson<StoredVersion | null>(f, null))
      .filter((v): v is StoredVersion => v !== null)
      .map((v) => v.meta)
      .sort((a, b) => b.savedAt - a.savedAt);
  }

  private findVersion(projectId: string, versionId: string): StoredVersion | null {
    const projectDir = path.join(this.historyDir, projectId);
    let dirs: string[];
    try {
      dirs = fs.readdirSync(projectDir).map((d) => path.join(projectDir, d));
    } catch {
      return null;
    }
    for (const dir of dirs) {
      for (const file of listJsonFiles(dir)) {
        if (file.includes(versionId)) {
          const v = readJson<StoredVersion | null>(file, null);
          if (v && v.meta.id === versionId) return v;
        }
      }
    }
    return null;
  }

  readVersion(projectId: string, versionId: string): Result<string> {
    const v = this.findVersion(projectId, versionId);
    return v ? ok(v.content) : err('Versión no encontrada');
  }

  restoreVersion(projectId: string, versionId: string): Result<null> {
    const v = this.findVersion(projectId, versionId);
    if (!v) return err('Versión no encontrada');
    return this.write(projectId, v.meta.filePath, v.content, 'save');
  }

  // ---------- Aplicación de planes de edición de la IA ----------

  applyEditPlan(projectId: string, plan: EditPlan): AppliedEdit[] {
    const results: AppliedEdit[] = [];
    for (const op of plan.ops) {
      if (op.kind === 'write') {
        const r = this.write(projectId, op.path, op.content, 'ai-edit');
        results.push({ path: op.path, ok: r.ok, detail: r.ok ? 'escrito' : r.error });
      } else if (op.kind === 'delete') {
        const r = this.delete(projectId, op.path);
        results.push({ path: op.path, ok: r.ok, detail: r.ok ? 'borrado' : r.error });
      } else {
        const current = this.read(projectId, op.path);
        if (!current.ok) {
          results.push({ path: op.path, ok: false, detail: `No se pudo leer para parchear: ${current.error}` });
          continue;
        }
        const patched = applyUnifiedDiff(current.value, op.diff);
        if (!patched.ok) {
          results.push({ path: op.path, ok: false, detail: patched.error });
          continue;
        }
        const w = this.write(projectId, op.path, patched.content, 'ai-edit');
        results.push({ path: op.path, ok: w.ok, detail: w.ok ? 'parche aplicado' : w.error });
      }
    }
    return results;
  }
}

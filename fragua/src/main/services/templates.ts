// Plantillas de proyecto: las integradas (código) + las del usuario
// (userData/templates.json). Instanciar una plantilla escribe el árbol
// de ficheros renderizado en un directorio de destino sin machacar nada.

import fs from 'node:fs';
import path from 'node:path';
import type { ProjectTemplate, Result } from '../../shared/types';
import { err, ok } from '../../shared/types';
import { BUILTIN_TEMPLATES } from '../../shared/builtinTemplates';
import { renderTemplate, validateTemplate } from '../../shared/templateEngine';
import { ensureDir, readJson, writeJsonAtomic } from '../storage';

export class TemplateService {
  private file: string;
  private userTemplates: ProjectTemplate[];

  constructor(baseDir: string) {
    this.file = path.join(baseDir, 'templates.json');
    this.userTemplates = readJson<unknown[]>(this.file, [])
      .filter(validateTemplate)
      .map((t) => ({ ...t, builtin: false }));
  }

  list(): ProjectTemplate[] {
    return [...BUILTIN_TEMPLATES, ...this.userTemplates];
  }

  save(template: ProjectTemplate): Result<null> {
    if (!validateTemplate(template)) return err('Plantilla inválida: revisa id, variables y rutas de ficheros');
    if (BUILTIN_TEMPLATES.some((t) => t.id === template.id)) return err('No se puede sobrescribir una plantilla integrada');
    const cleaned: ProjectTemplate = { ...template, builtin: false };
    this.userTemplates = this.userTemplates.filter((t) => t.id !== template.id);
    this.userTemplates.push(cleaned);
    writeJsonAtomic(this.file, this.userTemplates);
    return ok(null);
  }

  delete(id: string): Result<null> {
    if (BUILTIN_TEMPLATES.some((t) => t.id === id)) return err('No se puede borrar una plantilla integrada');
    const before = this.userTemplates.length;
    this.userTemplates = this.userTemplates.filter((t) => t.id !== id);
    if (this.userTemplates.length === before) return err('Plantilla no encontrada');
    writeJsonAtomic(this.file, this.userTemplates);
    return ok(null);
  }

  instantiate(templateId: string, targetDir: string, variables: Record<string, string>): Result<{ written: string[] }> {
    const template = this.list().find((t) => t.id === templateId);
    if (!template) return err('Plantilla no encontrada');
    const abs = path.resolve(targetDir);
    const rendered = renderTemplate(template, variables);
    if (rendered.missingVariables.length > 0) {
      return err(`Faltan variables obligatorias: ${rendered.missingVariables.join(', ')}`);
    }
    // comprobar colisiones ANTES de escribir nada (operación todo-o-nada)
    for (const f of rendered.files) {
      const dest = path.resolve(abs, f.path);
      if (!dest.startsWith(abs + path.sep) && dest !== abs) return err(`Ruta fuera del destino: ${f.path}`);
      if (fs.existsSync(dest)) return err(`Ya existe ${f.path} en el destino; elige una carpeta vacía`);
    }
    const written: string[] = [];
    for (const f of rendered.files) {
      const dest = path.resolve(abs, f.path);
      ensureDir(path.dirname(dest));
      fs.writeFileSync(dest, f.content, 'utf8');
      written.push(f.path);
    }
    return ok({ written });
  }

  all(): ProjectTemplate[] {
    return this.userTemplates;
  }

  importTemplates(templates: ProjectTemplate[]): number {
    let count = 0;
    for (const t of templates) {
      if (!validateTemplate(t)) continue;
      if (BUILTIN_TEMPLATES.some((b) => b.id === t.id)) continue;
      const r = this.save({ ...t, builtin: false });
      if (r.ok) count++;
    }
    return count;
  }
}

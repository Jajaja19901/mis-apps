// Motor de plantillas de proyecto: sustitución de variables {{nombre}}
// con filtros básicos, tanto en rutas como en contenidos.
// Filtros: upper, lower, kebab, snake, pascal, camel.

import type { ProjectTemplate, TemplateFile } from './types';

function applyFilter(value: string, filter: string): string {
  const words = value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  switch (filter) {
    case 'upper':
      return value.toUpperCase();
    case 'lower':
      return value.toLowerCase();
    case 'kebab':
      return words.map((w) => w.toLowerCase()).join('-');
    case 'snake':
      return words.map((w) => w.toLowerCase()).join('_');
    case 'pascal':
      return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('');
    case 'camel': {
      const pascal = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('');
      return pascal.charAt(0).toLowerCase() + pascal.slice(1);
    }
    default:
      return value;
  }
}

export function renderTemplateString(text: string, variables: Record<string, string>): string {
  return text.replace(/\{\{\s*([A-Za-z_][\w]*)\s*(?:\|\s*([a-z]+)\s*)?\}\}/g, (match, name: string, filter?: string) => {
    const value = variables[name];
    if (value === undefined) return match;
    return filter ? applyFilter(value, filter) : value;
  });
}

export interface RenderedTemplate {
  files: TemplateFile[];
  missingVariables: string[];
}

export function renderTemplate(template: ProjectTemplate, variables: Record<string, string>): RenderedTemplate {
  const merged: Record<string, string> = {};
  const missing: string[] = [];
  for (const v of template.variables) {
    const provided = variables[v.name];
    if (provided !== undefined && provided.trim() !== '') merged[v.name] = provided;
    else if (v.default !== '') merged[v.name] = v.default;
    else missing.push(v.name);
  }
  const files = template.files.map((f) => ({
    path: renderTemplateString(f.path, merged),
    content: renderTemplateString(f.content, merged)
  }));
  return { files, missingVariables: missing };
}

export function validateTemplate(t: unknown): t is ProjectTemplate {
  if (typeof t !== 'object' || t === null) return false;
  const obj = t as Record<string, unknown>;
  if (typeof obj.id !== 'string' || !obj.id) return false;
  if (typeof obj.name !== 'string' || !obj.name) return false;
  if (typeof obj.description !== 'string') return false;
  if (!Array.isArray(obj.variables)) return false;
  for (const v of obj.variables) {
    if (typeof v !== 'object' || v === null) return false;
    const vo = v as Record<string, unknown>;
    if (typeof vo.name !== 'string' || typeof vo.label !== 'string' || typeof vo.default !== 'string') return false;
  }
  if (!Array.isArray(obj.files)) return false;
  for (const f of obj.files) {
    if (typeof f !== 'object' || f === null) return false;
    const fo = f as Record<string, unknown>;
    if (typeof fo.path !== 'string' || typeof fo.content !== 'string') return false;
    if (fo.path.includes('..') || fo.path.startsWith('/')) return false;
  }
  return true;
}

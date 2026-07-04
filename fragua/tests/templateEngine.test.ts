import { describe, expect, it } from 'vitest';
import { renderTemplate, renderTemplateString, validateTemplate } from '../src/shared/templateEngine';
import { BUILTIN_TEMPLATES } from '../src/shared/builtinTemplates';
import type { ProjectTemplate } from '../src/shared/types';

describe('renderTemplateString', () => {
  it('sustituye variables y aplica filtros', () => {
    const vars = { name: 'Mi Proyecto Web' };
    expect(renderTemplateString('{{name}}', vars)).toBe('Mi Proyecto Web');
    expect(renderTemplateString('{{name|kebab}}', vars)).toBe('mi-proyecto-web');
    expect(renderTemplateString('{{name|snake}}', vars)).toBe('mi_proyecto_web');
    expect(renderTemplateString('{{name|pascal}}', vars)).toBe('MiProyectoWeb');
    expect(renderTemplateString('{{name|camel}}', vars)).toBe('miProyectoWeb');
    expect(renderTemplateString('{{name|upper}}', vars)).toBe('MI PROYECTO WEB');
  });

  it('deja intactas las variables desconocidas', () => {
    expect(renderTemplateString('{{otra}}', { name: 'x' })).toBe('{{otra}}');
  });
});

describe('renderTemplate', () => {
  const template: ProjectTemplate = {
    id: 't1',
    name: 'T',
    description: '',
    builtin: false,
    variables: [
      { name: 'name', label: 'Nombre', default: 'demo' },
      { name: 'req', label: 'Obligatoria', default: '' }
    ],
    files: [{ path: 'src/{{name|kebab}}.ts', content: 'export const NAME = "{{name}}";' }]
  };

  it('usa defaults y reporta variables obligatorias ausentes', () => {
    const out = renderTemplate(template, {});
    expect(out.missingVariables).toEqual(['req']);
    expect(out.files[0]!.path).toBe('src/demo.ts');
  });

  it('renderiza rutas y contenidos', () => {
    const out = renderTemplate(template, { name: 'Hola Mundo', req: 'x' });
    expect(out.missingVariables).toEqual([]);
    expect(out.files[0]!.path).toBe('src/hola-mundo.ts');
    expect(out.files[0]!.content).toContain('Hola Mundo');
  });
});

describe('validateTemplate', () => {
  it('acepta todas las plantillas integradas', () => {
    for (const t of BUILTIN_TEMPLATES) expect(validateTemplate(t)).toBe(true);
  });

  it('rechaza plantillas con rutas peligrosas', () => {
    const bad = {
      id: 'x',
      name: 'x',
      description: '',
      builtin: false,
      variables: [],
      files: [{ path: '../fuera.txt', content: '' }]
    };
    expect(validateTemplate(bad)).toBe(false);
  });

  it('rechaza estructuras malformadas', () => {
    expect(validateTemplate(null)).toBe(false);
    expect(validateTemplate({ id: 'a' })).toBe(false);
  });
});

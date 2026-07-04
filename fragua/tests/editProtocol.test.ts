import { describe, expect, it } from 'vitest';
import { applyUnifiedDiff, parseEditPlan } from '../src/shared/editProtocol';

describe('parseEditPlan', () => {
  it('parsea bloques fragua:write', () => {
    const text = [
      'Creo el archivo:',
      '```fragua:write path=src/app.ts',
      'export const x = 1;',
      '```'
    ].join('\n');
    const plan = parseEditPlan(text);
    expect(plan.ops).toHaveLength(1);
    expect(plan.ops[0]).toEqual({ kind: 'write', path: 'src/app.ts', content: 'export const x = 1;' });
    expect(plan.commentary).toContain('Creo el archivo');
  });

  it('parsea fragua:patch y fragua:delete', () => {
    const text = [
      '```fragua:patch path=a.txt',
      '@@ -1,1 +1,1 @@',
      '-hola',
      '+adios',
      '```',
      '```fragua:delete path=viejo.txt',
      '```'
    ].join('\n');
    const plan = parseEditPlan(text);
    expect(plan.ops).toHaveLength(2);
    expect(plan.ops[0]!.kind).toBe('patch');
    expect(plan.ops[1]).toEqual({ kind: 'delete', path: 'viejo.txt' });
  });

  it('rechaza rutas peligrosas', () => {
    const text = ['```fragua:write path=../../etc/passwd', 'x', '```'].join('\n');
    const plan = parseEditPlan(text);
    expect(plan.ops).toHaveLength(0);
  });

  it('acepta la variante con ruta en la línea anterior', () => {
    const text = ['**src/util.py**', '```python', 'def f():', '    return 1', '```'].join('\n');
    const plan = parseEditPlan(text);
    expect(plan.ops).toHaveLength(1);
    expect(plan.ops[0]).toMatchObject({ kind: 'write', path: 'src/util.py' });
  });

  it('detecta bloques diff con cabeceras +++', () => {
    const text = [
      '```diff',
      '--- a/src/main.c',
      '+++ b/src/main.c',
      '@@ -1,2 +1,2 @@',
      ' int main() {',
      '-  return 1;',
      '+  return 0;',
      '```'
    ].join('\n');
    const plan = parseEditPlan(text);
    expect(plan.ops).toHaveLength(1);
    expect(plan.ops[0]).toMatchObject({ kind: 'patch', path: 'src/main.c' });
  });

  it('deja los bloques sin ruta como comentario', () => {
    const text = ['Ejemplo:', '```js', 'console.log(1)', '```'].join('\n');
    const plan = parseEditPlan(text);
    expect(plan.ops).toHaveLength(0);
    expect(plan.commentary).toContain('console.log(1)');
  });
});

describe('applyUnifiedDiff', () => {
  const original = ['line1', 'line2', 'line3', 'line4', 'line5'].join('\n');

  it('aplica un hunk simple', () => {
    const diff = ['@@ -2,2 +2,2 @@', ' line2', '-line3', '+LINE3'].join('\n');
    const res = applyUnifiedDiff(original, diff);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.content).toBe(['line1', 'line2', 'LINE3', 'line4', 'line5'].join('\n'));
  });

  it('tolera números de línea equivocados buscando el contexto', () => {
    const diff = ['@@ -1,2 +1,2 @@', ' line3', '-line4', '+CUATRO'].join('\n');
    const res = applyUnifiedDiff(original, diff);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.content).toContain('CUATRO');
  });

  it('aplica varios hunks con inserciones', () => {
    const diff = [
      '@@ -1,1 +1,2 @@',
      ' line1',
      '+nueva',
      '@@ -4,2 +5,1 @@',
      ' line4',
      '-line5'
    ].join('\n');
    const res = applyUnifiedDiff(original, diff);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.content).toBe(['line1', 'nueva', 'line2', 'line3', 'line4'].join('\n'));
  });

  it('falla con mensaje claro si el contexto no existe', () => {
    const diff = ['@@ -1,1 +1,1 @@', '-no-existe', '+da-igual'].join('\n');
    const res = applyUnifiedDiff(original, diff);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('no-existe');
  });

  it('ignora cabeceras --- +++ dentro del cuerpo', () => {
    const diff = [
      '--- a/f.txt',
      '+++ b/f.txt',
      '@@ -1,1 +1,1 @@',
      '-line1',
      '+uno'
    ].join('\n');
    const res = applyUnifiedDiff(original, diff);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.content.startsWith('uno')).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { IgnoreMatcher } from '../src/shared/ignore';

describe('IgnoreMatcher', () => {
  it('ignora directorios por defecto y su contenido', () => {
    const m = IgnoreMatcher.withDefaults();
    expect(m.ignores('node_modules', true)).toBe(true);
    expect(m.ignores('node_modules/react/index.js', false)).toBe(true);
    expect(m.ignores('src/index.ts', false)).toBe(false);
  });

  it('respeta patrones con comodines', () => {
    const m = new IgnoreMatcher();
    m.addPatterns(['*.log', 'temp-?']);
    expect(m.ignores('errors.log', false)).toBe(true);
    expect(m.ignores('deep/dir/errors.log', false)).toBe(true);
    expect(m.ignores('temp-1', false)).toBe(true);
    expect(m.ignores('temp-12', false)).toBe(false);
  });

  it('soporta negación', () => {
    const m = new IgnoreMatcher();
    m.addPatterns(['*.log', '!importante.log']);
    expect(m.ignores('otro.log', false)).toBe(true);
    expect(m.ignores('importante.log', false)).toBe(false);
  });

  it('ancla patrones con /', () => {
    const m = new IgnoreMatcher();
    m.addPatterns(['/build']);
    expect(m.ignores('build', true)).toBe(true);
    expect(m.ignores('src/build', true)).toBe(false);
  });

  it('soporta ** para cruzar directorios', () => {
    const m = new IgnoreMatcher();
    m.addPatterns(['docs/**/borrador.md']);
    expect(m.ignores('docs/borrador.md', false)).toBe(true);
    expect(m.ignores('docs/a/b/borrador.md', false)).toBe(true);
    expect(m.ignores('otros/borrador.md', false)).toBe(false);
  });

  it('parsea contenido de .gitignore con comentarios', () => {
    const m = new IgnoreMatcher();
    m.addGitignore('# comentario\n\n*.tmp\ncache/\n');
    expect(m.ignores('a.tmp', false)).toBe(true);
    expect(m.ignores('cache/x.js', false)).toBe(true);
    expect(m.ignores('src/a.ts', false)).toBe(false);
  });
});

// Matcher de patrones estilo .gitignore, implementado desde cero.
// Soporta: comentarios, negación (!), anclaje a raíz (/), patrones de
// directorio (trailing /), *, ** y ?. Las rutas se evalúan siempre con
// separador '/'; el llamador normaliza antes.

interface CompiledRule {
  regex: RegExp;
  negated: boolean;
  dirOnly: boolean;
}

function globToRegex(pattern: string): RegExp {
  let anchored = false;
  let p = pattern;
  if (p.startsWith('/')) {
    anchored = true;
    p = p.slice(1);
  } else if (p.slice(0, -1).includes('/')) {
    // un patrón con '/' intermedio se ancla a la raíz según la spec de git
    anchored = true;
  }
  let re = '';
  for (let i = 0; i < p.length; i++) {
    const ch = p[i]!;
    if (ch === '*') {
      if (p[i + 1] === '*') {
        // '**' cruza directorios; consumir slash opcional posterior
        i++;
        if (p[i + 1] === '/') {
          i++;
          re += '(?:[^/]+/)*';
        } else {
          re += '.*';
        }
      } else {
        re += '[^/]*';
      }
    } else if (ch === '?') {
      re += '[^/]';
    } else if ('\\.[]{}()+^$|'.includes(ch)) {
      re += `\\${ch}`;
    } else {
      re += ch;
    }
  }
  const prefix = anchored ? '^' : '(?:^|/)';
  return new RegExp(`${prefix}${re}$`);
}

export class IgnoreMatcher {
  private rules: CompiledRule[] = [];

  /** Reglas por defecto razonables para indexación de código. */
  static withDefaults(extra: string[] = []): IgnoreMatcher {
    const m = new IgnoreMatcher();
    m.addPatterns([
      '.git/',
      'node_modules/',
      'dist/',
      'build/',
      'out/',
      'release/',
      'coverage/',
      '.cache/',
      '.vite/',
      '__pycache__/',
      '.venv/',
      'venv/',
      'target/',
      '*.min.js',
      '*.min.css',
      '*.map',
      '*.lock',
      'package-lock.json',
      ...extra
    ]);
    return m;
  }

  addPatterns(patterns: string[]): void {
    for (const raw of patterns) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      let negated = false;
      let body = line;
      if (body.startsWith('!')) {
        negated = true;
        body = body.slice(1);
      }
      let dirOnly = false;
      if (body.endsWith('/')) {
        dirOnly = true;
        body = body.slice(0, -1);
      }
      if (!body) continue;
      this.rules.push({ regex: globToRegex(body), negated, dirOnly });
    }
  }

  /** Carga el contenido de un .gitignore. */
  addGitignore(content: string): void {
    this.addPatterns(content.split(/\r?\n/));
  }

  /**
   * true si la ruta relativa (con '/') debe ignorarse.
   * isDir indica si la ruta es un directorio.
   */
  ignores(relPath: string, isDir: boolean): boolean {
    const path = relPath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    if (!path) return false;
    let ignored = false;
    for (const rule of this.rules) {
      if (rule.dirOnly && !isDir) {
        // una regla de directorio también tapa todo su contenido:
        // comprobar prefijos de la ruta
        const segments = path.split('/');
        let matched = false;
        for (let i = 1; i < segments.length; i++) {
          const prefix = segments.slice(0, i).join('/');
          if (rule.regex.test(prefix)) {
            matched = true;
            break;
          }
        }
        if (!matched) continue;
        ignored = !rule.negated;
        continue;
      }
      if (rule.regex.test(path)) {
        ignored = !rule.negated;
      } else if (rule.dirOnly && isDir) {
        continue;
      } else if (!rule.dirOnly) {
        // las reglas de fichero también tapan contenido si casan con un
        // directorio ancestro (p. ej. 'logs' ignora 'logs/a.txt')
        const segments = path.split('/');
        for (let i = 1; i < segments.length; i++) {
          const prefix = segments.slice(0, i).join('/');
          if (rule.regex.test(prefix)) {
            ignored = !rule.negated;
            break;
          }
        }
      }
    }
    return ignored;
  }
}

// Protocolo de ediciones de Fragua.
//
// El system prompt pide al modelo que proponga cambios con bloques cercados:
//
//   ```fragua:write path=src/app.ts
//   <contenido completo del archivo>
//   ```
//   ```fragua:patch path=src/app.ts
//   <diff unificado>
//   ```
//   ```fragua:delete path=src/viejo.ts
//   ```
//
// Además, como los modelos locales no siempre obedecen el formato, se
// aceptan variantes habituales: bloque de código precedido por una línea
// con la ruta (`// path: src/app.ts`, `**src/app.ts**`, `### src/app.ts`)
// y bloques ```diff con cabeceras ---/+++.
//
// Este módulo también implementa la aplicación de diffs unificados con
// tolerancia a desplazamientos (busca el contexto en una ventana).

import type { EditOp, EditPlan } from './types';
import { splitLines } from './textUtils';

const FENCE = /^```([^\n`]*)$/;

interface Fence {
  info: string;
  body: string[];
  /** línea anterior no vacía, para heurística de ruta */
  prevLine: string;
}

function collectFences(text: string): { fences: Fence[]; outside: string[] } {
  const lines = splitLines(text);
  const fences: Fence[] = [];
  const outside: string[] = [];
  let i = 0;
  let lastNonEmpty = '';
  while (i < lines.length) {
    const open = FENCE.exec(lines[i]!.trim());
    if (open) {
      const body: string[] = [];
      i++;
      while (i < lines.length && lines[i]!.trim() !== '```') {
        body.push(lines[i]!);
        i++;
      }
      i++; // saltar cierre (o EOF)
      fences.push({ info: open[1]!.trim(), body, prevLine: lastNonEmpty });
      lastNonEmpty = '';
      continue;
    }
    outside.push(lines[i]!);
    if (lines[i]!.trim() !== '') lastNonEmpty = lines[i]!.trim();
    i++;
  }
  return { fences, outside };
}

function sanitizeRelPath(raw: string): string | null {
  let p = raw.trim().replace(/\\/g, '/');
  p = p.replace(/^['"`]|['"`]$/g, '').replace(/^\.\//, '');
  if (!p || p.includes('..') || p.startsWith('/') || /^[A-Za-z]:/.test(p)) return null;
  if (!/^[\w@][\w@\-./+ ]*$/.test(p)) return null;
  return p;
}

function pathFromInfo(info: string): { mode: 'write' | 'patch' | 'delete' | null; path: string | null } {
  const m = /^fragua:(write|patch|delete)\s+path=(.+)$/.exec(info);
  if (m) return { mode: m[1] as 'write' | 'patch' | 'delete', path: sanitizeRelPath(m[2]!) };
  return { mode: null, path: null };
}

function pathFromPrevLine(prev: string): string | null {
  const patterns = [
    /^(?:\/\/|#)\s*(?:path|file|archivo|fichero)\s*:\s*(.+)$/i,
    /^\*\*([^*]+)\*\*:?$/,
    /^#{1,4}\s*`?([\w@][\w@\-./+ ]*\.[A-Za-z0-9]{1,10})`?:?$/,
    /^`([^`]+)`:?$/,
    /^([\w@][\w@\-./+ ]*\.[A-Za-z0-9]{1,10}):$/
  ];
  for (const p of patterns) {
    const m = p.exec(prev);
    if (m && m[1]) {
      const candidate = sanitizeRelPath(m[1]);
      if (candidate && candidate.includes('.')) return candidate;
    }
  }
  return null;
}

function pathsFromDiffBody(body: string[]): string | null {
  for (const line of body) {
    const plus = /^\+\+\+\s+(?:b\/)?(.+)$/.exec(line);
    if (plus && plus[1] && plus[1].trim() !== '/dev/null') return sanitizeRelPath(plus[1]);
  }
  for (const line of body) {
    const minus = /^---\s+(?:a\/)?(.+)$/.exec(line);
    if (minus && minus[1] && minus[1].trim() !== '/dev/null') return sanitizeRelPath(minus[1]);
  }
  return null;
}

/**
 * Extrae el plan de edición de la respuesta de un modelo.
 * Nunca lanza: si un bloque no se entiende, queda como comentario.
 */
export function parseEditPlan(text: string): EditPlan {
  const { fences, outside } = collectFences(text);
  const ops: EditOp[] = [];
  const leftover: string[] = [];
  for (const fence of fences) {
    const explicit = pathFromInfo(fence.info);
    if (explicit.mode === 'delete' && explicit.path) {
      ops.push({ kind: 'delete', path: explicit.path });
      continue;
    }
    if (explicit.mode === 'patch' && explicit.path) {
      ops.push({ kind: 'patch', path: explicit.path, diff: fence.body.join('\n') });
      continue;
    }
    if (explicit.mode === 'write' && explicit.path) {
      ops.push({ kind: 'write', path: explicit.path, content: fence.body.join('\n') });
      continue;
    }
    // Heurísticas para modelos que no siguen el protocolo exacto
    const infoIsDiff = /^diff\b|\bpatch\b/i.test(fence.info);
    const bodyLooksDiff = fence.body.some((l) => l.startsWith('@@')) &&
      fence.body.some((l) => l.startsWith('+++') || l.startsWith('---'));
    if (infoIsDiff || bodyLooksDiff) {
      const diffPath = pathsFromDiffBody(fence.body);
      if (diffPath) {
        ops.push({ kind: 'patch', path: diffPath, diff: fence.body.join('\n') });
        continue;
      }
    }
    const infoPath = sanitizeRelPath(fence.info.split(/\s+/).pop() ?? '');
    if (infoPath && infoPath.includes('.') && infoPath.includes('/')) {
      ops.push({ kind: 'write', path: infoPath, content: fence.body.join('\n') });
      continue;
    }
    const prevPath = pathFromPrevLine(fence.prevLine);
    if (prevPath) {
      ops.push({ kind: 'write', path: prevPath, content: fence.body.join('\n') });
      continue;
    }
    leftover.push('```' + fence.info, ...fence.body, '```');
  }
  const commentary = [...outside, ...leftover].join('\n').trim();
  return { ops, commentary };
}

// ---------- Aplicación de diff unificado ----------

interface Hunk {
  oldStart: number;
  lines: { tag: ' ' | '-' | '+'; text: string }[];
}

function parseHunks(diff: string): Hunk[] {
  const lines = splitLines(diff);
  const hunks: Hunk[] = [];
  let current: Hunk | null = null;
  for (const line of lines) {
    const header = /^@@\s+-(\d+)(?:,\d+)?\s+\+\d+(?:,\d+)?\s+@@/.exec(line);
    if (header) {
      current = { oldStart: parseInt(header[1]!, 10), lines: [] };
      hunks.push(current);
      continue;
    }
    if (!current) continue;
    if (line.startsWith('+')) current.lines.push({ tag: '+', text: line.slice(1) });
    else if (line.startsWith('-')) current.lines.push({ tag: '-', text: line.slice(1) });
    else if (line.startsWith(' ')) current.lines.push({ tag: ' ', text: line.slice(1) });
    else if (line === '') current.lines.push({ tag: ' ', text: '' });
    else if (line.startsWith('\\')) continue; // "\ No newline at end of file"
    // cabeceras ---/+++/diff/index se ignoran
  }
  return hunks;
}

function hunkMatchesAt(fileLines: string[], hunk: Hunk, pos: number): boolean {
  let offset = 0;
  for (const hl of hunk.lines) {
    if (hl.tag === '+') continue;
    if (fileLines[pos + offset] !== hl.text) return false;
    offset++;
  }
  return true;
}

/**
 * Aplica un diff unificado. Busca cada hunk primero en la posición
 * declarada y después en una ventana creciente alrededor (los modelos
 * locales suelen equivocarse en los números de línea).
 * Devuelve el contenido nuevo o un error descriptivo.
 */
export function applyUnifiedDiff(
  original: string,
  diff: string
): { ok: true; content: string } | { ok: false; error: string } {
  const hunks = parseHunks(diff);
  if (hunks.length === 0) return { ok: false, error: 'El diff no contiene hunks @@ válidos' };
  let lines = splitLines(original);
  let drift = 0;
  for (let h = 0; h < hunks.length; h++) {
    const hunk = hunks[h]!;
    const declared = Math.max(0, hunk.oldStart - 1 + drift);
    let found = -1;
    const maxRadius = Math.max(lines.length, 50);
    for (let radius = 0; radius <= maxRadius && found < 0; radius++) {
      const forward = declared + radius;
      const backward = declared - radius;
      if (forward < lines.length + 1 && hunkMatchesAt(lines, hunk, forward)) found = forward;
      else if (radius > 0 && backward >= 0 && hunkMatchesAt(lines, hunk, backward)) found = backward;
    }
    if (found < 0) {
      const firstOld = hunk.lines.find((l) => l.tag !== '+');
      return {
        ok: false,
        error: `No se pudo aplicar el hunk ${h + 1}: no se encontró el contexto "${firstOld ? firstOld.text.slice(0, 60) : ''}"`
      };
    }
    const before = lines.slice(0, found);
    const after: string[] = [];
    let cursor = found;
    for (const hl of hunk.lines) {
      if (hl.tag === ' ') {
        after.push(lines[cursor]!);
        cursor++;
      } else if (hl.tag === '-') {
        cursor++;
      } else {
        after.push(hl.text);
      }
    }
    const rest = lines.slice(cursor);
    const oldCount = hunk.lines.filter((l) => l.tag !== '+').length;
    const newCount = hunk.lines.filter((l) => l.tag !== '-').length;
    drift += found - declared + (newCount - oldCount);
    lines = [...before, ...after, ...rest];
  }
  return { ok: true, content: lines.join('\n') };
}

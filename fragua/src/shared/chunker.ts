// Troceado de ficheros en fragmentos indexables. Ventanas de líneas con
// solape, intentando cortar en fronteras "naturales" (línea en blanco o
// inicio de declaración) y extrayendo símbolos con heurísticas por regex
// para enriquecer la búsqueda.

import type { CodeChunk } from './types';
import { fnv1a, splitLines } from './textUtils';

const CHUNK_LINES = 60;
const OVERLAP_LINES = 10;

const SYMBOL_PATTERNS: RegExp[] = [
  /(?:^|\s)(?:function|def|fn|func)\s+([A-Za-z_$][\w$]*)/,
  /(?:^|\s)class\s+([A-Za-z_$][\w$]*)/,
  /(?:^|\s)(?:interface|struct|enum|trait|type)\s+([A-Za-z_$][\w$]*)/,
  /(?:^|\s)(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\(|function)/,
  /(?:^|\s)(?:public|private|protected|static|export)\s+(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(/
];

export function extractSymbols(lines: string[]): string[] {
  const found = new Set<string>();
  for (const line of lines) {
    for (const pattern of SYMBOL_PATTERNS) {
      const m = pattern.exec(line);
      if (m && m[1]) found.add(m[1]);
    }
  }
  return [...found];
}

function isBoundary(line: string): boolean {
  const t = line.trim();
  if (t === '') return true;
  return /^(export\s+)?(async\s+)?(function|class|def|fn|func|interface|struct|impl|public|private|protected)\b/.test(t);
}

/**
 * Trocea el contenido de un fichero. Los fragmentos tienen id estable
 * (hash de ruta + rango + contenido) para poder hacer indexación
 * incremental sin reindexar lo que no cambió.
 */
export function chunkFile(filePath: string, content: string): CodeChunk[] {
  const lines = splitLines(content);
  if (lines.length === 0) return [];
  const chunks: CodeChunk[] = [];
  let start = 0;
  while (start < lines.length) {
    let end = Math.min(start + CHUNK_LINES, lines.length);
    if (end < lines.length) {
      // retroceder hasta 15 líneas buscando una frontera limpia
      for (let back = 0; back < 15; back++) {
        const candidate = end - back;
        if (candidate > start + 20 && isBoundary(lines[candidate]!)) {
          end = candidate;
          break;
        }
      }
    }
    const slice = lines.slice(start, end);
    const text = slice.join('\n');
    if (text.trim().length > 0) {
      chunks.push({
        id: fnv1a(`${filePath}:${start}:${end}:${fnv1a(text)}`),
        filePath,
        startLine: start + 1,
        endLine: end,
        content: text,
        symbols: extractSymbols(slice)
      });
    }
    if (end >= lines.length) break;
    start = Math.max(end - OVERLAP_LINES, start + 1);
  }
  return chunks;
}

const BINARY_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp', 'tiff', 'avif',
  'pdf', 'zip', 'gz', 'tar', 'rar', '7z', 'jar', 'war',
  'exe', 'dll', 'so', 'dylib', 'bin', 'o', 'a', 'class', 'pyc',
  'woff', 'woff2', 'ttf', 'otf', 'eot',
  'mp3', 'mp4', 'wav', 'ogg', 'avi', 'mov', 'mkv', 'webm',
  'db', 'sqlite', 'sqlite3', 'wasm'
]);

export function looksBinaryPath(filePath: string): boolean {
  const dot = filePath.lastIndexOf('.');
  if (dot < 0) return false;
  return BINARY_EXTENSIONS.has(filePath.slice(dot + 1).toLowerCase());
}

/** Detección de binario por contenido: bytes nulos o proporción alta de no imprimibles. */
export function looksBinaryContent(sample: string): boolean {
  if (sample.includes('\u0000')) return true;
  let weird = 0;
  const n = Math.min(sample.length, 2000);
  for (let i = 0; i < n; i++) {
    const c = sample.charCodeAt(i);
    if (c < 9 || (c > 13 && c < 32)) weird++;
  }
  return n > 0 && weird / n > 0.05;
}

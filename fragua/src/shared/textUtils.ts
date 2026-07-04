// Utilidades de texto puras (sin dependencias de Node ni DOM) para que
// puedan usarse igual en main, renderer y tests.

/** FNV-1a de 32 bits, suficiente para claves de caché e ids estables. */
export function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

let idCounter = 0;

/** Id único legible: marca de tiempo + contador + entropía. */
export function newId(prefix: string): string {
  idCounter = (idCounter + 1) % 0xffff;
  const rand = Math.floor(Math.random() * 0xffffff).toString(36);
  return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}${rand}`;
}

/**
 * Estimación de tokens sin tokenizador real: media empírica de ~4 chars
 * por token en código y ~4.5 en prosa. Sobreestimamos ligeramente para
 * que el presupuesto de contexto nunca se pase.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 3.6);
}

/** Divide en líneas conservando el contenido exacto (sin el salto). */
export function splitLines(text: string): string[] {
  return text.split(/\r\n|\r|\n/);
}

/** Normaliza para búsqueda: minúsculas y sin acentos. */
export function normalizeForSearch(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Tokeniza identificadores de código: separa camelCase, snake_case,
 * kebab-case y descarta tokens de 1 carácter.
 */
export function tokenizeCode(text: string): string[] {
  const raw = text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_\-./\\]+/g, ' ')
    .split(/[^A-Za-z0-9]+/);
  const out: string[] = [];
  for (const t of raw) {
    const n = normalizeForSearch(t);
    if (n.length > 1) out.push(n);
  }
  return out;
}

/** Recorta un texto a un presupuesto de tokens aproximado. */
export function clampToTokens(text: string, maxTokens: number): string {
  const maxChars = Math.max(0, Math.floor(maxTokens * 3.6));
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n… [recortado por presupuesto de contexto]`;
}

/** Formatea bytes de forma humana. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

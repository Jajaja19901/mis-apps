// Persistencia JSON con escritura atómica (tmp + rename) para que un
// corte de luz nunca deje un archivo de datos corrupto a medias.

import fs from 'node:fs';
import path from 'node:path';

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

export function readJson<T>(file: string, fallback: T): T {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJsonAtomic(file: string, value: unknown): void {
  ensureDir(path.dirname(file));
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 1), 'utf8');
  fs.renameSync(tmp, file);
}

export function listJsonFiles(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => path.join(dir, f));
  } catch {
    return [];
  }
}

export function removeFile(file: string): void {
  try {
    fs.unlinkSync(file);
  } catch {
    // ya no existe: objetivo cumplido
  }
}

// Tests de integración de los servicios del proceso main sobre
// directorios temporales reales y el proveedor simulado (sin red).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SettingsService, defaultSettings } from '../src/main/services/settings';
import { ConversationService } from '../src/main/services/conversations';
import { MemoryService } from '../src/main/services/memory';
import { TemplateService } from '../src/main/services/templates';
import { ProjectService } from '../src/main/services/projects';
import { FileService } from '../src/main/services/files';
import { IndexerService } from '../src/main/services/indexer';
import { ChatService } from '../src/main/services/chat';
import { MockProvider } from '../src/main/services/ai/providers';
import type { Settings, StreamChunk } from '../src/shared/types';

let baseDir: string;
let projectDir: string;
const dirsToClean: string[] = [];
let projects: ProjectService;

function tmp(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  dirsToClean.push(dir);
  return dir;
}

beforeAll(() => {
  baseDir = tmp('fragua-data-');
  projectDir = tmp('fragua-proj-');
  fs.mkdirSync(path.join(projectDir, 'src'), { recursive: true });
  fs.writeFileSync(
    path.join(projectDir, 'src', 'auth.ts'),
    'export function loginUser(email: string, password: string) {\n  return validateCredentials(email, password);\n}\n'
  );
  fs.writeFileSync(
    path.join(projectDir, 'src', 'charts.ts'),
    'export function renderChart(data: number[]) {\n  return data.map((d) => `bar:${d}`);\n}\n'
  );
  fs.writeFileSync(path.join(projectDir, '.gitignore'), 'ignorado/\n');
  fs.mkdirSync(path.join(projectDir, 'ignorado'));
  fs.writeFileSync(path.join(projectDir, 'ignorado', 'secreto.ts'), 'const oculto = 1;');
  projects = new ProjectService(baseDir, () => undefined);
});

afterAll(() => {
  projects.dispose();
  for (const dir of dirsToClean) fs.rmSync(dir, { recursive: true, force: true });
});

const mockProfile = defaultSettings().modelProfiles.find((p) => p.kind === 'mock')!;

describe('SettingsService', () => {
  it('devuelve defaults y persiste actualizaciones', () => {
    const dir = tmp('fragua-set-');
    const service = new SettingsService(dir);
    expect(service.get().theme).toBe('dark');
    service.update({ theme: 'light', editorFontSize: 16 });
    const reloaded = new SettingsService(dir);
    expect(reloaded.get().theme).toBe('light');
    expect(reloaded.get().editorFontSize).toBe(16);
  });

  it('sanea valores inválidos', () => {
    const dir = tmp('fragua-set2-');
    const service = new SettingsService(dir);
    service.update({ editorFontSize: 500, activeModelProfileId: 'no-existe' } as Partial<Settings>);
    expect(service.get().editorFontSize).toBe(14);
    expect(service.get().modelProfiles.some((p) => p.id === service.get().activeModelProfileId)).toBe(true);
  });
});

describe('ConversationService', () => {
  it('ciclo completo: crear, añadir, listar, compactar, borrar', () => {
    const service = new ConversationService(tmp('fragua-conv-'));
    const conv = service.create(null, 'Prueba');
    expect(conv.title).toBe('Prueba');
    const appended = service.appendMessage(conv.id, 'user', 'hola');
    expect(appended.ok && appended.value.messages).toHaveLength(1);
    service.appendMessage(conv.id, 'assistant', 'buenas');
    expect(service.list()[0]!.messageCount).toBe(2);
    const kept = service.get(conv.id);
    if (!kept.ok) throw new Error('imposible');
    const compacted = service.applyCompaction(conv.id, 'resumen de prueba', kept.value.messages.slice(-1));
    expect(compacted.ok && compacted.value.summary).toBe('resumen de prueba');
    expect(compacted.ok && compacted.value.messages).toHaveLength(1);
    expect(service.delete(conv.id).ok).toBe(true);
    expect(service.get(conv.id).ok).toBe(false);
  });
});

describe('MemoryService', () => {
  it('separa ámbito global y de proyecto', () => {
    const service = new MemoryService(tmp('fragua-mem-'));
    service.save({ scope: 'global', projectId: null, content: 'siempre TypeScript' });
    service.save({ scope: 'project', projectId: 'p1', content: 'este proyecto usa Redis' });
    expect(service.list('p1')).toHaveLength(2);
    expect(service.list('p2')).toHaveLength(1);
    expect(service.list(null)[0]!.content).toContain('TypeScript');
  });

  it('edita y borra entradas', () => {
    const service = new MemoryService(tmp('fragua-mem2-'));
    const entry = service.save({ scope: 'global', projectId: null, content: 'v1' });
    service.save({ id: entry.id, scope: 'global', projectId: null, content: 'v2' });
    expect(service.list(null)).toHaveLength(1);
    expect(service.list(null)[0]!.content).toBe('v2');
    expect(service.delete(entry.id).ok).toBe(true);
    expect(service.delete(entry.id).ok).toBe(false);
  });
});

describe('TemplateService', () => {
  it('instancia una plantilla integrada sin colisiones', () => {
    const service = new TemplateService(tmp('fragua-tpl-'));
    const target = tmp('fragua-tpl-out-');
    const result = service.instantiate('builtin-node-cli', target, { name: 'Mi Utilidad', description: 'demo' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.written).toContain('src/cli.js');
      const pkg = JSON.parse(fs.readFileSync(path.join(target, 'package.json'), 'utf8'));
      expect(pkg.name).toBe('mi-utilidad');
    }
    // segunda instancia sobre el mismo destino: colisión detectada, nada escrito
    const again = service.instantiate('builtin-node-cli', target, { name: 'Otra', description: 'x' });
    expect(again.ok).toBe(false);
  });

  it('guarda y borra plantillas de usuario, protege las integradas', () => {
    const service = new TemplateService(tmp('fragua-tpl2-'));
    const saved = service.save({
      id: 'mia',
      name: 'Mía',
      description: '',
      builtin: false,
      variables: [],
      files: [{ path: 'hola.txt', content: 'hola' }]
    });
    expect(saved.ok).toBe(true);
    expect(service.delete('builtin-node-cli').ok).toBe(false);
    expect(service.delete('mia').ok).toBe(true);
  });
});

describe('FileService', () => {
  it('bloquea rutas fuera del proyecto', () => {
    const opened = projects.open(projectDir);
    if (!opened.ok) throw new Error(opened.error);
    const files = new FileService(baseDir, (id) => projects.get(id));
    expect(files.read(opened.value.id, '../../../etc/passwd').ok).toBe(false);
    expect(files.write(opened.value.id, '/tmp/x.txt', 'x').ok).toBe(false);
  });

  it('versiona al sobrescribir y restaura', () => {
    const opened = projects.open(projectDir);
    if (!opened.ok) throw new Error(opened.error);
    const files = new FileService(baseDir, (id) => projects.get(id));
    const id = opened.value.id;
    expect(files.write(id, 'nota.txt', 'primera versión').ok).toBe(true);
    expect(files.write(id, 'nota.txt', 'segunda versión').ok).toBe(true);
    const versions = files.listVersions(id, 'nota.txt');
    expect(versions.length).toBe(1);
    const restored = files.restoreVersion(id, versions[0]!.id);
    expect(restored.ok).toBe(true);
    const read = files.read(id, 'nota.txt');
    expect(read.ok && read.value).toBe('primera versión');
  });

  it('aplica planes de edición con write, patch y delete', () => {
    const opened = projects.open(projectDir);
    if (!opened.ok) throw new Error(opened.error);
    const files = new FileService(baseDir, (id) => projects.get(id));
    const id = opened.value.id;
    files.write(id, 'plan.txt', 'línea A\nlínea B\n');
    const results = files.applyEditPlan(id, {
      commentary: '',
      ops: [
        { kind: 'write', path: 'nuevo/creado.txt', content: 'contenido' },
        { kind: 'patch', path: 'plan.txt', diff: '@@ -1,2 +1,2 @@\n línea A\n-línea B\n+línea B2' },
        { kind: 'delete', path: 'nuevo/creado.txt' }
      ]
    });
    expect(results.map((r) => r.ok)).toEqual([true, true, true]);
    const patched = files.read(id, 'plan.txt');
    expect(patched.ok && patched.value).toContain('línea B2');
  });
});

describe('IndexerService', () => {
  it('indexa, busca y actualiza incrementalmente', async () => {
    const opened = projects.open(projectDir);
    if (!opened.ok) throw new Error(opened.error);
    const id = opened.value.id;
    const settings: Settings = { ...defaultSettings(), indexing: { ...defaultSettings().indexing, useEmbeddings: true } };
    const indexer = new IndexerService(baseDir, projects, () => new MockProvider(mockProfile), () => settings, () => undefined);
    const built = await indexer.build(id);
    expect(built.ok).toBe(true);
    if (built.ok) {
      expect(built.value.files).toBeGreaterThanOrEqual(2);
      expect(built.value.vectors).toBeGreaterThan(0);
    }
    // el fichero ignorado por .gitignore no entra al índice
    const secret = await indexer.search(id, 'oculto', 5, 'lexical');
    expect(secret.ok && secret.value.every((r) => !r.chunk.filePath.includes('secreto'))).toBe(true);

    const lexical = await indexer.search(id, 'login user credentials', 5, 'lexical');
    expect(lexical.ok).toBe(true);
    if (lexical.ok) expect(lexical.value[0]!.chunk.filePath).toBe('src/auth.ts');

    const hybrid = await indexer.search(id, 'render chart bars', 5, 'hybrid');
    expect(hybrid.ok).toBe(true);
    if (hybrid.ok) expect(hybrid.value[0]!.chunk.filePath).toBe('src/charts.ts');

    // cambio incremental
    fs.writeFileSync(path.join(projectDir, 'src', 'payments.ts'), 'export function chargeInvoice(total: number) { return total * 1.21; }\n');
    await indexer.onFileChanged(id, 'src/payments.ts');
    const pay = await indexer.search(id, 'charge invoice total', 5, 'lexical');
    expect(pay.ok).toBe(true);
    if (pay.ok) expect(pay.value[0]!.chunk.filePath).toBe('src/payments.ts');
  });
});

describe('ChatService (con MockProvider)', () => {
  it('streamea, persiste la respuesta y autotitula', async () => {
    const convService = new ConversationService(tmp('fragua-chat-'));
    const memService = new MemoryService(tmp('fragua-chat-mem-'));
    const files = new FileService(baseDir, (id) => projects.get(id));
    const settings = defaultSettings();
    const indexer = new IndexerService(baseDir, projects, () => new MockProvider(mockProfile), () => settings, () => undefined);
    const chunks: StreamChunk[] = [];
    const chat = new ChatService(
      convService,
      memService,
      indexer,
      files,
      () => new MockProvider(mockProfile),
      () => settings,
      (chunk) => chunks.push(chunk)
    );
    const conv = convService.create(null);
    convService.appendMessage(conv.id, 'user', '¿Qué es un semáforo en concurrencia?');
    const started = await chat.start('req-1', conv.id, false);
    expect(started.ok).toBe(true);
    // esperar el final del stream
    await new Promise<void>((resolve, reject) => {
      const t0 = Date.now();
      const poll = () => {
        if (chunks.some((c) => c.done)) resolve();
        else if (Date.now() - t0 > 15000) reject(new Error('timeout esperando el stream'));
        else setTimeout(poll, 25);
      };
      poll();
    });
    expect(chunks.filter((c) => c.delta).length).toBeGreaterThan(3);
    const final = convService.get(conv.id);
    expect(final.ok).toBe(true);
    if (final.ok) {
      expect(final.value.messages).toHaveLength(2);
      expect(final.value.messages[1]!.role).toBe('assistant');
      expect(final.value.messages[1]!.content).toContain('Simulador');
    }
    expect(chat.cancel('req-inexistente').ok).toBe(false);
  });

  it('rechaza conversaciones sin mensaje de usuario', async () => {
    const convService = new ConversationService(tmp('fragua-chat2-'));
    const memService = new MemoryService(tmp('fragua-chat2-mem-'));
    const files = new FileService(baseDir, (id) => projects.get(id));
    const settings = defaultSettings();
    const indexer = new IndexerService(baseDir, projects, () => new MockProvider(mockProfile), () => settings, () => undefined);
    const chat = new ChatService(convService, memService, indexer, files, () => new MockProvider(mockProfile), () => settings, () => undefined);
    const conv = convService.create(null);
    const started = await chat.start('req-2', conv.id, false);
    expect(started.ok).toBe(false);
  });
});

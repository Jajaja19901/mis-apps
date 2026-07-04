// Exportación e importación de datos del usuario en un único fichero
// .fragua.json (bundle versionado y validado). Sirve para copias de
// seguridad y para mover el entorno a otra máquina, sin ninguna nube.

import fs from 'node:fs';
import type { Conversation, ExportBundle, MemoryEntry, ProjectTemplate, Result, Settings } from '../../shared/types';
import { err, ok } from '../../shared/types';
import type { ConversationService } from './conversations';
import type { MemoryService } from './memory';
import type { SettingsService } from './settings';
import type { TemplateService } from './templates';

export interface ExportInclude {
  settings: boolean;
  conversations: boolean;
  memory: boolean;
  templates: boolean;
}

export class ExporterService {
  constructor(
    private settings: SettingsService,
    private conversations: ConversationService,
    private memory: MemoryService,
    private templates: TemplateService,
    private pickSavePath: () => Promise<string | null>,
    private pickOpenPath: () => Promise<string | null>
  ) {}

  async exportBundle(include: ExportInclude): Promise<Result<{ path: string }>> {
    const target = await this.pickSavePath();
    if (!target) return err('Exportación cancelada');
    const bundle: ExportBundle = {
      format: 'fragua-bundle',
      version: 1,
      exportedAt: Date.now()
    };
    if (include.settings) bundle.settings = this.settings.get();
    if (include.conversations) {
      bundle.conversations = this.conversations
        .list()
        .map((meta) => this.conversations.get(meta.id))
        .filter((r): r is { ok: true; value: Conversation } => r.ok)
        .map((r) => r.value);
    }
    if (include.memory) bundle.memory = this.memory.all();
    if (include.templates) bundle.templates = this.templates.all();
    try {
      fs.writeFileSync(target, JSON.stringify(bundle, null, 1), 'utf8');
      return ok({ path: target });
    } catch (e) {
      return err(`No se pudo escribir el fichero: ${(e as Error).message}`);
    }
  }

  async importBundle(): Promise<Result<{ imported: string[] }>> {
    const source = await this.pickOpenPath();
    if (!source) return err('Importación cancelada');
    let raw: string;
    try {
      raw = fs.readFileSync(source, 'utf8');
    } catch (e) {
      return err(`No se pudo leer el fichero: ${(e as Error).message}`);
    }
    let bundle: ExportBundle;
    try {
      bundle = JSON.parse(raw) as ExportBundle;
    } catch {
      return err('El fichero no es JSON válido');
    }
    if (bundle.format !== 'fragua-bundle' || bundle.version !== 1) {
      return err('El fichero no es un bundle de Fragua v1');
    }
    const imported: string[] = [];
    if (bundle.settings && typeof bundle.settings === 'object') {
      this.settings.update(bundle.settings as Partial<Settings>);
      imported.push('configuración');
    }
    if (Array.isArray(bundle.conversations)) {
      let count = 0;
      for (const conv of bundle.conversations) {
        if (typeof conv === 'object' && conv !== null && Array.isArray(conv.messages)) {
          this.conversations.importConversation(conv);
          count++;
        }
      }
      imported.push(`${count} conversaciones`);
    }
    if (Array.isArray(bundle.memory)) {
      const count = this.memory.importEntries(bundle.memory as MemoryEntry[]);
      imported.push(`${count} entradas de memoria`);
    }
    if (Array.isArray(bundle.templates)) {
      const count = this.templates.importTemplates(bundle.templates as ProjectTemplate[]);
      imported.push(`${count} plantillas`);
    }
    return ok({ imported });
  }
}

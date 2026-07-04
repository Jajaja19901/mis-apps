// Configuración persistente con defaults completos y merge profundo:
// una actualización parcial nunca puede dejar la configuración en un
// estado inválido.

import path from 'node:path';
import type { ModelProfile, Settings } from '../../shared/types';
import { readJson, writeJsonAtomic } from '../storage';

export const DEFAULT_MODEL_PROFILES: ModelProfile[] = [
  {
    id: 'ollama-default',
    label: 'Ollama (local)',
    kind: 'ollama',
    baseUrl: 'http://127.0.0.1:11434',
    chatModel: 'qwen2.5-coder:7b',
    embeddingModel: 'nomic-embed-text',
    contextWindow: 32768,
    temperature: 0.2,
    maxOutputTokens: 4096
  },
  {
    id: 'openai-compat-default',
    label: 'llama.cpp / LM Studio (API OpenAI local)',
    kind: 'openai-compat',
    baseUrl: 'http://127.0.0.1:8080/v1',
    chatModel: 'default',
    embeddingModel: 'default',
    contextWindow: 16384,
    temperature: 0.2,
    maxOutputTokens: 4096
  },
  {
    id: 'mock-provider',
    label: 'Simulador (sin modelo, para probar la app)',
    kind: 'mock',
    baseUrl: '',
    chatModel: 'mock',
    embeddingModel: 'mock',
    contextWindow: 8192,
    temperature: 0,
    maxOutputTokens: 2048
  }
];

export function defaultSettings(): Settings {
  return {
    activeModelProfileId: 'ollama-default',
    modelProfiles: DEFAULT_MODEL_PROFILES.map((p) => ({ ...p })),
    theme: 'dark',
    uiLanguage: 'es',
    editorFontSize: 14,
    terminalShell: process.platform === 'win32' ? 'powershell.exe' : process.env.SHELL || '/bin/bash',
    indexing: {
      enabled: true,
      useEmbeddings: false,
      maxFileSizeKb: 512,
      maxChunksPerProject: 60000,
      excludeGlobs: []
    },
    chat: {
      maxContextTokens: 12000,
      maxSnippets: 8,
      autoMemory: true
    },
    telemetry: false
  };
}

export class SettingsService {
  private file: string;
  private current: Settings;

  constructor(baseDir: string) {
    this.file = path.join(baseDir, 'settings.json');
    this.current = this.mergeWithDefaults(readJson<Partial<Settings>>(this.file, {}));
  }

  private mergeWithDefaults(stored: Partial<Settings>): Settings {
    const d = defaultSettings();
    const profiles =
      Array.isArray(stored.modelProfiles) && stored.modelProfiles.length > 0
        ? stored.modelProfiles.filter(
            (p): p is ModelProfile =>
              typeof p === 'object' && p !== null && typeof p.id === 'string' && typeof p.baseUrl === 'string'
          )
        : d.modelProfiles;
    const activeId =
      typeof stored.activeModelProfileId === 'string' && profiles.some((p) => p.id === stored.activeModelProfileId)
        ? stored.activeModelProfileId
        : (profiles[0]?.id ?? d.activeModelProfileId);
    return {
      activeModelProfileId: activeId,
      modelProfiles: profiles,
      theme: stored.theme === 'light' ? 'light' : 'dark',
      uiLanguage: stored.uiLanguage === 'en' ? 'en' : 'es',
      editorFontSize:
        typeof stored.editorFontSize === 'number' && stored.editorFontSize >= 8 && stored.editorFontSize <= 32
          ? stored.editorFontSize
          : d.editorFontSize,
      terminalShell: typeof stored.terminalShell === 'string' && stored.terminalShell ? stored.terminalShell : d.terminalShell,
      indexing: { ...d.indexing, ...(typeof stored.indexing === 'object' ? stored.indexing : {}) },
      chat: { ...d.chat, ...(typeof stored.chat === 'object' ? stored.chat : {}) },
      telemetry: false
    };
  }

  get(): Settings {
    return this.current;
  }

  update(partial: Partial<Settings>): Settings {
    this.current = this.mergeWithDefaults({ ...this.current, ...partial });
    writeJsonAtomic(this.file, this.current);
    return this.current;
  }

  activeProfile(): ModelProfile {
    const found = this.current.modelProfiles.find((p) => p.id === this.current.activeModelProfileId);
    return found ?? DEFAULT_MODEL_PROFILES[2]!;
  }
}

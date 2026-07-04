// Capa de proveedores de IA local. Tres implementaciones completas:
//
//  - OllamaProvider:      habla el protocolo nativo de Ollama (NDJSON).
//  - OpenAICompatProvider: habla /v1/chat/completions con SSE; vale para
//                          llama.cpp server, LM Studio, vLLM, LocalAI…
//  - MockProvider:        determinista, sin red; permite usar y probar
//                          toda la aplicación sin ningún modelo instalado.
//
// Cambiar de modelo = cambiar el perfil activo en Configuración. Nada
// más en la app conoce el proveedor concreto: solo esta interfaz.

import type { ChatRequestMessage, ModelProfile, ProviderHealth } from '../../../shared/types';

export interface ChatOptions {
  temperature: number;
  maxOutputTokens: number;
  signal: AbortSignal;
  onDelta: (delta: string) => void;
}

export interface AiProvider {
  readonly profile: ModelProfile;
  chat(messages: ChatRequestMessage[], options: ChatOptions): Promise<string>;
  embed(texts: string[]): Promise<number[][]>;
  health(): Promise<ProviderHealth>;
}

const CONNECT_TIMEOUT_MS = 8000;

function withTimeout(signal: AbortSignal, ms: number): AbortSignal {
  // Combina el abort del usuario con un timeout de conexión.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('timeout de conexión')), ms);
  const onAbort = () => controller.abort(signal.reason);
  if (signal.aborted) controller.abort(signal.reason);
  else signal.addEventListener('abort', onAbort, { once: true });
  controller.signal.addEventListener('abort', () => clearTimeout(timer), { once: true });
  return controller.signal;
}

async function* readLines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl = buffer.indexOf('\n');
      while (nl >= 0) {
        yield buffer.slice(0, nl).replace(/\r$/, '');
        buffer = buffer.slice(nl + 1);
        nl = buffer.indexOf('\n');
      }
    }
    if (buffer.trim()) yield buffer;
  } finally {
    reader.releaseLock();
  }
}

function describeFetchError(e: unknown, baseUrl: string): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/abort/i.test(msg)) return 'Petición cancelada';
  return `No se pudo conectar con ${baseUrl}: ${msg}. ¿Está el servidor del modelo arrancado?`;
}

// ---------- Ollama ----------

export class OllamaProvider implements AiProvider {
  constructor(readonly profile: ModelProfile) {}

  async chat(messages: ChatRequestMessage[], options: ChatOptions): Promise<string> {
    let full = '';
    let response: Response;
    try {
      response = await fetch(`${this.profile.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: options.signal,
        body: JSON.stringify({
          model: this.profile.chatModel,
          messages,
          stream: true,
          options: {
            temperature: options.temperature,
            num_predict: options.maxOutputTokens
          }
        })
      });
    } catch (e) {
      throw new Error(describeFetchError(e, this.profile.baseUrl));
    }
    if (!response.ok || !response.body) {
      const text = await response.text().catch(() => '');
      throw new Error(`Ollama respondió ${response.status}: ${text.slice(0, 300)}`);
    }
    for await (const line of readLines(response.body)) {
      if (!line.trim()) continue;
      let parsed: { message?: { content?: string }; done?: boolean; error?: string };
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }
      if (parsed.error) throw new Error(`Ollama: ${parsed.error}`);
      const delta = parsed.message?.content ?? '';
      if (delta) {
        full += delta;
        options.onDelta(delta);
      }
      if (parsed.done) break;
    }
    return full;
  }

  async embed(texts: string[]): Promise<number[][]> {
    const response = await fetch(`${this.profile.baseUrl}/api/embed`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: this.profile.embeddingModel, input: texts })
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Ollama embeddings ${response.status}: ${text.slice(0, 300)}`);
    }
    const data = (await response.json()) as { embeddings?: number[][] };
    if (!Array.isArray(data.embeddings)) throw new Error('Respuesta de embeddings inválida de Ollama');
    return data.embeddings;
  }

  async health(): Promise<ProviderHealth> {
    try {
      const response = await fetch(`${this.profile.baseUrl}/api/tags`, {
        signal: withTimeout(new AbortController().signal, CONNECT_TIMEOUT_MS)
      });
      if (!response.ok) return { ok: false, detail: `HTTP ${response.status}`, models: [] };
      const data = (await response.json()) as { models?: { name: string }[] };
      const models = (data.models ?? []).map((m) => m.name);
      const hasModel = models.some((m) => m === this.profile.chatModel || m.startsWith(`${this.profile.chatModel}:`));
      return {
        ok: true,
        detail: hasModel
          ? `Ollama activo, modelo "${this.profile.chatModel}" disponible`
          : `Ollama activo, pero falta el modelo "${this.profile.chatModel}" (ollama pull ${this.profile.chatModel})`,
        models
      };
    } catch (e) {
      return { ok: false, detail: describeFetchError(e, this.profile.baseUrl), models: [] };
    }
  }
}

// ---------- OpenAI-compatible (llama.cpp, LM Studio, vLLM…) ----------

export class OpenAICompatProvider implements AiProvider {
  constructor(readonly profile: ModelProfile) {}

  async chat(messages: ChatRequestMessage[], options: ChatOptions): Promise<string> {
    let full = '';
    let response: Response;
    try {
      response = await fetch(`${this.profile.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: options.signal,
        body: JSON.stringify({
          model: this.profile.chatModel,
          messages,
          stream: true,
          temperature: options.temperature,
          max_tokens: options.maxOutputTokens
        })
      });
    } catch (e) {
      throw new Error(describeFetchError(e, this.profile.baseUrl));
    }
    if (!response.ok || !response.body) {
      const text = await response.text().catch(() => '');
      throw new Error(`El servidor respondió ${response.status}: ${text.slice(0, 300)}`);
    }
    for await (const line of readLines(response.body)) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === '[DONE]') break;
      let parsed: { choices?: { delta?: { content?: string } }[]; error?: { message?: string } };
      try {
        parsed = JSON.parse(payload);
      } catch {
        continue;
      }
      if (parsed.error?.message) throw new Error(`Servidor local: ${parsed.error.message}`);
      const delta = parsed.choices?.[0]?.delta?.content ?? '';
      if (delta) {
        full += delta;
        options.onDelta(delta);
      }
    }
    return full;
  }

  async embed(texts: string[]): Promise<number[][]> {
    const response = await fetch(`${this.profile.baseUrl}/embeddings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: this.profile.embeddingModel, input: texts })
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Embeddings ${response.status}: ${text.slice(0, 300)}`);
    }
    const data = (await response.json()) as { data?: { index: number; embedding: number[] }[] };
    if (!Array.isArray(data.data)) throw new Error('Respuesta de embeddings inválida');
    return data.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
  }

  async health(): Promise<ProviderHealth> {
    try {
      const response = await fetch(`${this.profile.baseUrl}/models`, {
        signal: withTimeout(new AbortController().signal, CONNECT_TIMEOUT_MS)
      });
      if (!response.ok) return { ok: false, detail: `HTTP ${response.status}`, models: [] };
      const data = (await response.json()) as { data?: { id: string }[] };
      const models = (data.data ?? []).map((m) => m.id);
      return { ok: true, detail: 'Servidor OpenAI-compatible activo', models };
    } catch (e) {
      return { ok: false, detail: describeFetchError(e, this.profile.baseUrl), models: [] };
    }
  }
}

// ---------- Simulador determinista ----------

export class MockProvider implements AiProvider {
  constructor(readonly profile: ModelProfile) {}

  async chat(messages: ChatRequestMessage[], options: ChatOptions): Promise<string> {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    const question = lastUser ? lastUser.content.slice(0, 400) : '(sin pregunta)';
    const reply = [
      'Estás usando el **Simulador** de Fragua (no hay ningún modelo conectado).',
      '',
      `He recibido tu mensaje: "${question.replace(/\s+/g, ' ').trim().slice(0, 160)}"`,
      '',
      'Para conectar un modelo real ve a **Configuración → Modelo** y elige Ollama o un servidor OpenAI-compatible (llama.cpp, LM Studio). El resto de la aplicación (editor, terminal, índice, plantillas) funciona igual con o sin modelo.',
      '',
      'Ejemplo del protocolo de edición que usan los modelos reales:',
      '```fragua:write path=ejemplo/hola.txt',
      'Hola desde el simulador de Fragua.',
      '```'
    ].join('\n');
    // Streaming simulado en trozos de ~24 caracteres para ejercitar la UI.
    for (let i = 0; i < reply.length; i += 24) {
      if (options.signal.aborted) throw new Error('Petición cancelada');
      options.onDelta(reply.slice(i, i + 24));
      await new Promise((r) => setTimeout(r, 8));
    }
    return reply;
  }

  async embed(texts: string[]): Promise<number[][]> {
    // Embedding determinista por bolsa de trigramas: suficiente para que
    // la búsqueda semántica sea usable en demos y tests sin modelo.
    return texts.map((text) => {
      const v = new Array<number>(128).fill(0);
      const norm = text.toLowerCase();
      for (let i = 0; i < norm.length - 2; i++) {
        let h = 0;
        for (let j = 0; j < 3; j++) h = (h * 31 + norm.charCodeAt(i + j)) | 0;
        const slot = Math.abs(h) % 128;
        v[slot] = (v[slot] ?? 0) + 1;
      }
      return v;
    });
  }

  async health(): Promise<ProviderHealth> {
    return { ok: true, detail: 'Simulador activo (sin modelo real)', models: ['mock'] };
  }
}

export function createProvider(profile: ModelProfile): AiProvider {
  switch (profile.kind) {
    case 'ollama':
      return new OllamaProvider(profile);
    case 'openai-compat':
      return new OpenAICompatProvider(profile);
    case 'mock':
      return new MockProvider(profile);
  }
}

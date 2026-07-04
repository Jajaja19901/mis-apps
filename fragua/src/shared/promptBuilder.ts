// Construcción de prompts: system prompt del asistente, inyección de
// memoria, fragmentos de código recuperados por el índice y compactación
// de conversaciones largas dentro del presupuesto de tokens del modelo.

import type { ChatMessage, ChatRequestMessage, MemoryEntry, SearchResult } from './types';
import { clampToTokens, estimateTokens } from './textUtils';

export const SYSTEM_PROMPT_BASE = `Eres Fragua, un asistente profesional de programación que se ejecuta 100% en local.
Respondes en el idioma del usuario. Eres preciso, directo y técnico.

Cuando propongas crear o modificar archivos usa EXACTAMENTE este protocolo:
- Archivo completo (crear o reemplazar):
\`\`\`fragua:write path=ruta/relativa/archivo.ext
<contenido completo>
\`\`\`
- Modificación parcial (diff unificado):
\`\`\`fragua:patch path=ruta/relativa/archivo.ext
--- a/ruta/relativa/archivo.ext
+++ b/ruta/relativa/archivo.ext
@@ -N,M +N,M @@
 contexto
-línea vieja
+línea nueva
\`\`\`
- Borrado:
\`\`\`fragua:delete path=ruta/relativa/archivo.ext
\`\`\`

Reglas:
- Nunca uses pseudocódigo ni dejes funciones vacías.
- Si el usuario pide un proyecto completo, emite un bloque fragua:write por cada archivo.
- No inventes rutas: usa las rutas del contexto del proyecto cuando existan.
- Explica brevemente antes de los bloques; no repitas el código fuera de ellos.`;

export function buildContextSection(results: SearchResult[], maxTokens: number): string {
  if (results.length === 0) return '';
  const parts: string[] = ['Contexto del proyecto (fragmentos recuperados por el índice):'];
  let used = estimateTokens(parts[0]!);
  for (const r of results) {
    const header = `\n--- ${r.chunk.filePath} (líneas ${r.chunk.startLine}-${r.chunk.endLine}) ---\n`;
    const body = r.chunk.content;
    const cost = estimateTokens(header) + estimateTokens(body);
    if (used + cost > maxTokens) break;
    parts.push(header + body);
    used += cost;
  }
  return parts.length > 1 ? parts.join('') : '';
}

export function buildMemorySection(entries: MemoryEntry[], maxTokens: number): string {
  if (entries.length === 0) return '';
  const lines = entries.map((e) => `- ${e.content.trim()}`);
  return clampToTokens(`Memoria persistente (hechos que el usuario quiere que recuerdes):\n${lines.join('\n')}`, maxTokens);
}

export interface PromptBudget {
  maxContextTokens: number;
  reservedForAnswer: number;
}

/**
 * Ensambla la lista final de mensajes para el proveedor:
 * system (base + memoria + contexto) + resumen + cola de mensajes que
 * quepa en el presupuesto. Los mensajes más recientes tienen prioridad.
 */
export function assembleChatRequest(options: {
  messages: ChatMessage[];
  summary: string;
  memory: MemoryEntry[];
  retrieved: SearchResult[];
  budget: PromptBudget;
  attachmentsContent: { path: string; content: string }[];
}): ChatRequestMessage[] {
  const { messages, summary, memory, retrieved, budget, attachmentsContent } = options;
  const available = budget.maxContextTokens - budget.reservedForAnswer;

  const systemParts = [SYSTEM_PROMPT_BASE];
  const memorySection = buildMemorySection(memory, Math.floor(available * 0.1));
  if (memorySection) systemParts.push(memorySection);
  const contextSection = buildContextSection(retrieved, Math.floor(available * 0.35));
  if (contextSection) systemParts.push(contextSection);
  for (const att of attachmentsContent) {
    const block = `Archivo adjuntado por el usuario: ${att.path}\n\`\`\`\n${att.content}\n\`\`\``;
    systemParts.push(clampToTokens(block, Math.floor(available * 0.2)));
  }
  if (summary.trim()) {
    systemParts.push(clampToTokens(`Resumen de la conversación previa:\n${summary.trim()}`, Math.floor(available * 0.1)));
  }
  const system = systemParts.join('\n\n');

  const systemTokens = estimateTokens(system);
  let remaining = available - systemTokens;
  const tail: ChatRequestMessage[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]!;
    if (msg.role === 'system') continue;
    const cost = msg.tokens ?? estimateTokens(msg.content);
    if (remaining - cost < 0 && tail.length > 0) break;
    tail.unshift({ role: msg.role, content: msg.content });
    remaining -= cost;
    if (remaining <= 0) break;
  }
  if (tail.length === 0 && messages.length > 0) {
    const last = messages[messages.length - 1]!;
    tail.push({ role: last.role, content: clampToTokens(last.content, Math.max(256, remaining + estimateTokens(last.content))) });
  }
  return [{ role: 'system', content: system }, ...tail];
}

/**
 * Decide qué mensajes compactar cuando la conversación crece: se
 * conservan los últimos keepRecent y el resto pasa a resumirse.
 */
export function splitForCompaction(
  messages: ChatMessage[],
  keepRecent = 8
): { toSummarize: ChatMessage[]; toKeep: ChatMessage[] } {
  if (messages.length <= keepRecent) return { toSummarize: [], toKeep: messages };
  return {
    toSummarize: messages.slice(0, messages.length - keepRecent),
    toKeep: messages.slice(messages.length - keepRecent)
  };
}

export function buildSummarizationPrompt(previousSummary: string, toSummarize: ChatMessage[]): ChatRequestMessage[] {
  const transcript = toSummarize
    .map((m) => `${m.role === 'user' ? 'Usuario' : 'Asistente'}: ${m.content}`)
    .join('\n\n');
  const system =
    'Resume conversaciones técnicas de programación. Conserva: decisiones tomadas, rutas de archivos, ' +
    'nombres de funciones/clases relevantes, errores encontrados y tareas pendientes. Sé denso y factual. ' +
    'Responde SOLO con el resumen.';
  const user = previousSummary.trim()
    ? `Resumen previo:\n${previousSummary}\n\nNuevos mensajes a integrar:\n${transcript}\n\nEscribe el resumen actualizado.`
    : `Mensajes a resumir:\n${transcript}\n\nEscribe el resumen.`;
  return [
    { role: 'system', content: system },
    { role: 'user', content: clampToTokens(user, 6000) }
  ];
}

export function buildTitlePrompt(firstUserMessage: string): ChatRequestMessage[] {
  return [
    {
      role: 'system',
      content: 'Genera un título de 3 a 6 palabras para una conversación técnica. Responde SOLO el título, sin comillas.'
    },
    { role: 'user', content: clampToTokens(firstUserMessage, 500) }
  ];
}

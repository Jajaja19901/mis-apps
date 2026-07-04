// Renderizador de Markdown minimalista y SEGURO para el chat.
// Todo el texto pasa por escapeHtml antes de insertarse; no existe
// ninguna vía por la que el HTML del modelo llegue crudo al DOM.
// Soporta: encabezados, negrita, cursiva, código inline, bloques de
// código con lenguaje, listas, citas, enlaces (solo http/https) y
// párrafos. Suficiente para respuestas de un asistente de código sin
// arrastrar una librería completa.

import { splitLines } from './textUtils';

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderInline(text: string): string {
  let out = escapeHtml(text);
  // código inline primero para que su interior no se procese
  out = out.replace(/`([^`]+)`/g, (_m, code: string) => `<code>${code}</code>`);
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_m, label: string, url: string) => {
    return `<a href="${url}" rel="noopener noreferrer" target="_blank">${label}</a>`;
  });
  return out;
}

export interface MarkdownCodeBlock {
  index: number;
  lang: string;
  code: string;
}

export interface RenderedMarkdown {
  html: string;
  codeBlocks: MarkdownCodeBlock[];
}

/**
 * Convierte markdown a HTML seguro. Los bloques de código se numeran
 * (data-code-index) para que la UI pueda añadir botones "copiar" /
 * "aplicar" sin re-parsear.
 */
export function renderMarkdown(markdown: string): RenderedMarkdown {
  const lines = splitLines(markdown);
  const html: string[] = [];
  const codeBlocks: MarkdownCodeBlock[] = [];
  let paragraph: string[] = [];
  let listItems: string[] = [];
  let listOrdered = false;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    html.push(`<p>${renderInline(paragraph.join(' '))}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (listItems.length === 0) return;
    const tag = listOrdered ? 'ol' : 'ul';
    html.push(`<${tag}>${listItems.join('')}</${tag}>`);
    listItems = [];
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const fence = /^```(.*)$/.exec(line.trim());
    if (fence) {
      flushParagraph();
      flushList();
      const lang = fence[1]!.trim();
      const body: string[] = [];
      i++;
      while (i < lines.length && lines[i]!.trim() !== '```') {
        body.push(lines[i]!);
        i++;
      }
      i++;
      const code = body.join('\n');
      const index = codeBlocks.length;
      codeBlocks.push({ index, lang, code });
      html.push(
        `<div class="md-code" data-code-index="${index}">` +
          `<div class="md-code-head"><span>${escapeHtml(lang || 'texto')}</span></div>` +
          `<pre><code>${escapeHtml(code)}</code></pre></div>`
      );
      continue;
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      const level = Math.min(heading[1]!.length + 2, 6);
      html.push(`<h${level}>${renderInline(heading[2]!)}</h${level}>`);
      i++;
      continue;
    }
    const quote = /^>\s?(.*)$/.exec(line);
    if (quote) {
      flushParagraph();
      flushList();
      const body: string[] = [quote[1]!];
      i++;
      while (i < lines.length) {
        const q = /^>\s?(.*)$/.exec(lines[i]!);
        if (!q) break;
        body.push(q[1]!);
        i++;
      }
      html.push(`<blockquote>${renderInline(body.join(' '))}</blockquote>`);
      continue;
    }
    const unordered = /^\s*[-*+]\s+(.*)$/.exec(line);
    const ordered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (unordered || ordered) {
      flushParagraph();
      const isOrdered = !!ordered;
      if (listItems.length > 0 && listOrdered !== isOrdered) flushList();
      listOrdered = isOrdered;
      listItems.push(`<li>${renderInline((unordered ?? ordered)![1]!)}</li>`);
      i++;
      continue;
    }
    if (line.trim() === '') {
      flushParagraph();
      flushList();
      i++;
      continue;
    }
    flushList();
    paragraph.push(line.trim());
    i++;
  }
  flushParagraph();
  flushList();
  return { html: html.join('\n'), codeBlocks };
}

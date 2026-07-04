import { describe, expect, it } from 'vitest';
import { renderMarkdown, escapeHtml } from '../src/shared/markdown';

describe('renderMarkdown', () => {
  it('escapa HTML en todo el contenido (anti-XSS)', () => {
    const { html } = renderMarkdown('Hola <script>alert(1)</script> **<b>x</b>**');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<b>x</b>');
  });

  it('renderiza bloques de código con índice', () => {
    const { html, codeBlocks } = renderMarkdown('texto\n```ts\nconst a = 1;\n```\nmás');
    expect(codeBlocks).toHaveLength(1);
    expect(codeBlocks[0]!.lang).toBe('ts');
    expect(codeBlocks[0]!.code).toBe('const a = 1;');
    expect(html).toContain('data-code-index="0"');
    expect(html).toContain('const a = 1;');
  });

  it('renderiza listas, títulos y citas', () => {
    const { html } = renderMarkdown('# Título\n- uno\n- dos\n\n> cita\n\n1. primero');
    expect(html).toContain('<h3>Título</h3>');
    expect(html).toContain('<ul><li>uno</li><li>dos</li></ul>');
    expect(html).toContain('<blockquote>cita</blockquote>');
    expect(html).toContain('<ol><li>primero</li></ol>');
  });

  it('solo permite enlaces http(s)', () => {
    const { html } = renderMarkdown('[malo](javascript:alert(1)) [bueno](https://example.com)');
    expect(html).not.toContain('href="javascript:');
    expect(html).toContain('href="https://example.com"');
  });

  it('renderiza inline: negrita, cursiva y código', () => {
    const { html } = renderMarkdown('**fuerte** y *suave* con `codigo`');
    expect(html).toContain('<strong>fuerte</strong>');
    expect(html).toContain('<em>suave</em>');
    expect(html).toContain('<code>codigo</code>');
  });
});

describe('escapeHtml', () => {
  it('escapa los cinco caracteres relevantes', () => {
    expect(escapeHtml(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;');
  });
});

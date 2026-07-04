// Panel de terminal con xterm.js: múltiples sesiones en pestañas,
// redimensionado automático y limpieza al cerrar.

import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { api } from '../api';
import { clear, h, toast } from '../dom';
import { state } from '../state';

interface TermSession {
  id: string;
  title: string;
  term: Terminal;
  fit: FitAddon;
  mount: HTMLElement;
}

export class TerminalPanel {
  readonly element: HTMLElement;
  private tabsEl: HTMLElement;
  private hostEl: HTMLElement;
  private sessions: TermSession[] = [];
  private activeId: string | null = null;
  private resizeObserver: ResizeObserver;

  constructor() {
    this.tabsEl = h('div', { style: { display: 'flex', gap: '4px' } });
    this.hostEl = h('div', { className: 'terminal-host' });
    this.element = h(
      'div',
      { className: 'bottom-panel' },
      h(
        'div',
        { className: 'bottom-head' },
        h('span', { className: 'sidebar-head', text: 'Terminal', style: { padding: '0 4px' } }),
        this.tabsEl,
        h('div', { className: 'spacer' }),
        h('button', { text: '＋', title: 'Nuevo terminal', ariaLabel: 'Nuevo terminal', onClick: () => void this.createSession() }),
        h('button', { text: '🗑', title: 'Cerrar terminal actual', ariaLabel: 'Cerrar terminal', onClick: () => void this.killActive() })
      ),
      this.hostEl
    );

    api.on('term:data', ({ id, data }) => {
      this.sessions.find((s) => s.id === id)?.term.write(data);
    });
    api.on('term:exit', ({ id, code }) => {
      const session = this.sessions.find((s) => s.id === id);
      if (session) {
        session.term.write(`\r\n[proceso terminado con código ${code}]\r\n`);
        setTimeout(() => this.removeSession(id), 1200);
      }
    });
    this.resizeObserver = new ResizeObserver(() => this.fitActive());
    this.resizeObserver.observe(this.hostEl);
  }

  toggle(): void {
    this.element.classList.toggle('hidden');
    if (!this.element.classList.contains('hidden')) {
      if (this.sessions.length === 0) void this.createSession();
      else this.fitActive();
    }
  }

  async createSession(): Promise<void> {
    const term = new Terminal({
      fontSize: 13,
      fontFamily: "'SF Mono', Menlo, Consolas, monospace",
      cursorBlink: true,
      theme: { background: '#111418' }
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    const mount = h('div', { style: { height: '100%' } });
    this.hostEl.append(mount);
    term.open(mount);
    fit.fit();
    const created = await api.invoke('term:create', {
      projectId: state.activeProjectId,
      cols: term.cols,
      rows: term.rows
    });
    if (!created.ok) {
      toast(created.error, 'error');
      term.dispose();
      mount.remove();
      return;
    }
    const session: TermSession = { id: created.value.id, title: created.value.title, term, fit, mount };
    term.onData((data) => void api.invoke('term:input', { id: session.id, data }));
    term.onResize(({ cols, rows }) => void api.invoke('term:resize', { id: session.id, cols, rows }));
    this.sessions.push(session);
    this.activate(session.id);
  }

  private activate(id: string): void {
    this.activeId = id;
    for (const session of this.sessions) {
      session.mount.style.display = session.id === id ? 'block' : 'none';
    }
    this.renderTabs();
    this.fitActive();
    this.sessions.find((s) => s.id === id)?.term.focus();
  }

  private fitActive(): void {
    const active = this.sessions.find((s) => s.id === this.activeId);
    if (active && !this.element.classList.contains('hidden')) {
      try {
        active.fit.fit();
      } catch {
        // el host puede no estar medible aún
      }
    }
  }

  private async killActive(): Promise<void> {
    if (!this.activeId) return;
    await api.invoke('term:kill', { id: this.activeId });
    this.removeSession(this.activeId);
  }

  private removeSession(id: string): void {
    const session = this.sessions.find((s) => s.id === id);
    if (!session) return;
    session.term.dispose();
    session.mount.remove();
    this.sessions = this.sessions.filter((s) => s.id !== id);
    if (this.activeId === id) {
      this.activeId = this.sessions[0]?.id ?? null;
      if (this.activeId) this.activate(this.activeId);
    }
    this.renderTabs();
  }

  private renderTabs(): void {
    clear(this.tabsEl);
    for (let i = 0; i < this.sessions.length; i++) {
      const session = this.sessions[i]!;
      this.tabsEl.append(
        h('button', {
          className: `term-tab ${session.id === this.activeId ? 'active' : ''}`,
          text: `${i + 1}: ${session.title}`,
          onClick: () => this.activate(session.id)
        })
      );
    }
  }
}

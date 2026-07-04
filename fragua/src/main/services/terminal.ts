// Terminal integrado. Backend preferido: node-pty (terminal real con
// colores, TUIs y redimensionado). Si el módulo nativo no está
// disponible en la plataforma, cae a un backend de tuberías con
// child_process: menos capaz pero funcional (comandos, stdout/stderr).

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import os from 'node:os';
import type { Result, TerminalSessionInfo } from '../../shared/types';
import { err, ok } from '../../shared/types';
import { newId } from '../../shared/textUtils';

interface PtyLike {
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(): void;
  onData(cb: (data: string) => void): void;
  onExit(cb: (code: number) => void): void;
}

interface PtyModule {
  spawn(
    file: string,
    args: string[],
    options: { name: string; cols: number; rows: number; cwd: string; env: NodeJS.ProcessEnv }
  ): {
    write(data: string): void;
    resize(cols: number, rows: number): void;
    kill(): void;
    onData(cb: (data: string) => void): { dispose(): void };
    onExit(cb: (e: { exitCode: number }) => void): { dispose(): void };
  };
}

function loadPty(): PtyModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('node-pty') as PtyModule;
  } catch {
    return null;
  }
}

class PtyBackend implements PtyLike {
  private proc: ReturnType<PtyModule['spawn']>;

  constructor(pty: PtyModule, shell: string, cwd: string, cols: number, rows: number) {
    this.proc = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: Math.max(cols, 20),
      rows: Math.max(rows, 5),
      cwd,
      env: { ...process.env, TERM: 'xterm-256color' }
    });
  }
  write(data: string): void {
    this.proc.write(data);
  }
  resize(cols: number, rows: number): void {
    this.proc.resize(Math.max(cols, 20), Math.max(rows, 5));
  }
  kill(): void {
    this.proc.kill();
  }
  onData(cb: (data: string) => void): void {
    this.proc.onData(cb);
  }
  onExit(cb: (code: number) => void): void {
    this.proc.onExit((e) => cb(e.exitCode));
  }
}

class PipeBackend implements PtyLike {
  private proc: ChildProcessWithoutNullStreams;
  private dataCb: ((data: string) => void) | null = null;
  private exitCb: ((code: number) => void) | null = null;
  private lineBuffer = '';

  constructor(shell: string, cwd: string) {
    this.proc = spawn(shell, [], { cwd, env: { ...process.env, TERM: 'dumb' } });
    this.proc.stdout.on('data', (d: Buffer) => this.dataCb?.(d.toString().replace(/\n/g, '\r\n')));
    this.proc.stderr.on('data', (d: Buffer) => this.dataCb?.(d.toString().replace(/\n/g, '\r\n')));
    this.proc.on('exit', (code) => this.exitCb?.(code ?? 0));
    this.proc.on('error', () => this.exitCb?.(1));
  }
  write(data: string): void {
    // Emulación mínima de línea: eco local + envío al pulsar Enter.
    for (const ch of data) {
      if (ch === '\r') {
        this.dataCb?.('\r\n');
        this.proc.stdin.write(this.lineBuffer + '\n');
        this.lineBuffer = '';
      } else if (ch === '\x7f') {
        if (this.lineBuffer.length > 0) {
          this.lineBuffer = this.lineBuffer.slice(0, -1);
          this.dataCb?.('\b \b');
        }
      } else if (ch === '\x03') {
        this.dataCb?.('^C\r\n');
        this.lineBuffer = '';
        this.proc.kill('SIGINT');
      } else if (ch >= ' ' || ch === '\t') {
        this.lineBuffer += ch;
        this.dataCb?.(ch);
      }
    }
  }
  resize(): void {
    // sin efecto en tuberías
  }
  kill(): void {
    this.proc.kill();
  }
  onData(cb: (data: string) => void): void {
    this.dataCb = cb;
  }
  onExit(cb: (code: number) => void): void {
    this.exitCb = cb;
  }
}

interface Session {
  info: TerminalSessionInfo;
  backend: PtyLike;
}

export class TerminalService {
  private sessions = new Map<string, Session>();
  private pty = loadPty();

  constructor(
    private getShell: () => string,
    private getProjectPath: (projectId: string | null) => string | undefined,
    private emitData: (payload: { id: string; data: string }) => void,
    private emitExit: (payload: { id: string; code: number }) => void
  ) {}

  create(projectId: string | null, cols: number, rows: number): Result<TerminalSessionInfo> {
    const cwd = this.getProjectPath(projectId) ?? os.homedir();
    const shell = this.getShell();
    const id = newId('term');
    let backend: PtyLike;
    let kind: 'pty' | 'pipe';
    try {
      if (this.pty) {
        backend = new PtyBackend(this.pty, shell, cwd, cols, rows);
        kind = 'pty';
      } else {
        backend = new PipeBackend(shell, cwd);
        kind = 'pipe';
      }
    } catch (e) {
      try {
        backend = new PipeBackend(shell, cwd);
        kind = 'pipe';
      } catch (e2) {
        return err(`No se pudo lanzar el shell "${shell}": ${(e2 as Error).message} (previo: ${(e as Error).message})`);
      }
    }
    const info: TerminalSessionInfo = { id, title: `${shell.split(/[\\/]/).pop()} — ${cwd.split(/[\\/]/).pop()}`, cwd, backend: kind };
    backend.onData((data) => this.emitData({ id, data }));
    backend.onExit((code) => {
      this.sessions.delete(id);
      this.emitExit({ id, code });
    });
    this.sessions.set(id, { info, backend });
    if (kind === 'pipe') {
      this.emitData({
        id,
        data: '[Fragua] Terminal en modo básico (node-pty no disponible): sin colores ni programas interactivos.\r\n'
      });
    }
    return ok(info);
  }

  input(id: string, data: string): void {
    this.sessions.get(id)?.backend.write(data);
  }

  resize(id: string, cols: number, rows: number): void {
    this.sessions.get(id)?.backend.resize(cols, rows);
  }

  kill(id: string): void {
    this.sessions.get(id)?.backend.kill();
    this.sessions.delete(id);
  }

  list(): TerminalSessionInfo[] {
    return [...this.sessions.values()].map((s) => s.info);
  }

  dispose(): void {
    for (const id of [...this.sessions.keys()]) this.kill(id);
  }
}

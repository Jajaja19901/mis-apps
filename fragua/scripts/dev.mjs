// Arranque de desarrollo: compila el proceso main con tsc en modo watch,
// levanta Vite para el renderer y lanza Electron apuntando al dev server.
// Sin dependencias externas: solo child_process del propio Node.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const children = [];

function run(cmd, args, name) {
  const child = spawn(cmd, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], shell: false });
  const tag = `[${name}]`;
  child.stdout.on('data', (d) => process.stdout.write(`${tag} ${d}`));
  child.stderr.on('data', (d) => process.stderr.write(`${tag} ${d}`));
  child.on('exit', (code) => {
    console.log(`${tag} terminó con código ${code}`);
    if (name === 'electron') shutdown(code ?? 0);
  });
  children.push(child);
  return child;
}

function shutdown(code) {
  for (const c of children) {
    if (!c.killed) c.kill('SIGTERM');
  }
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

function waitForServer(url, timeoutMs) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve(undefined);
      });
      req.on('error', () => {
        if (Date.now() - started > timeoutMs) reject(new Error(`Vite no respondió en ${url}`));
        else setTimeout(attempt, 300);
      });
    };
    attempt();
  });
}

function waitForFile(file, timeoutMs) {
  const fs = require('node:fs');
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      if (fs.existsSync(file)) resolve(undefined);
      else if (Date.now() - started > timeoutMs) reject(new Error(`No apareció ${file}`));
      else setTimeout(attempt, 300);
    };
    attempt();
  });
}

const tscBin = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'tsc.cmd' : 'tsc');
const viteBin = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'vite.cmd' : 'vite');
const electronBin = require('electron');

run(tscBin, ['-p', 'tsconfig.main.json', '--watch', '--preserveWatchOutput'], 'tsc');
run(viteBin, ['--config', 'vite.config.ts'], 'vite');

const devUrl = 'http://127.0.0.1:5183';
await Promise.all([
  waitForServer(devUrl, 60000),
  waitForFile(path.join(root, 'dist', 'main', 'main', 'main.js'), 60000)
]);

run(electronBin, ['.', `--dev-url=${devUrl}`], 'electron');

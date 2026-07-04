// Plantillas de proyecto integradas. Todas generan proyectos completos y
// ejecutables sin red: cero dependencias externas en el resultado.

import type { ProjectTemplate } from './types';

export const BUILTIN_TEMPLATES: ProjectTemplate[] = [
  {
    id: 'builtin-node-cli',
    name: 'CLI en Node.js',
    description: 'Herramienta de línea de comandos en Node.js con parser de argumentos propio y tests.',
    builtin: true,
    variables: [
      { name: 'name', label: 'Nombre del proyecto', default: 'mi-cli' },
      { name: 'description', label: 'Descripción', default: 'Herramienta CLI' }
    ],
    files: [
      {
        path: 'package.json',
        content: `{
  "name": "{{name|kebab}}",
  "version": "0.1.0",
  "description": "{{description}}",
  "type": "module",
  "bin": { "{{name|kebab}}": "./src/cli.js" },
  "scripts": {
    "start": "node src/cli.js",
    "test": "node --test tests/"
  }
}
`
      },
      {
        path: 'src/cli.js',
        content: `#!/usr/bin/env node
import { parseArgs } from './args.js';

const HELP = \`{{name}} — {{description}}

Uso:
  {{name|kebab}} saluda --nombre <nombre>
  {{name|kebab}} --help
\`;

const parsed = parseArgs(process.argv.slice(2));

if (parsed.flags.help || parsed.command === '') {
  console.log(HELP);
  process.exit(0);
}

if (parsed.command === 'saluda') {
  const nombre = parsed.flags.nombre ?? 'mundo';
  console.log(\`Hola, \${nombre}!\`);
  process.exit(0);
}

console.error(\`Comando desconocido: \${parsed.command}\`);
process.exit(1);
`
      },
      {
        path: 'src/args.js',
        content: `// Parser de argumentos minimalista: comando + flags --clave valor / --flag.
export function parseArgs(argv) {
  const flags = {};
  let command = '';
  let i = 0;
  if (argv[0] && !argv[0].startsWith('-')) {
    command = argv[0];
    i = 1;
  }
  for (; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('-')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    }
  }
  return { command, flags };
}
`
      },
      {
        path: 'tests/args.test.js',
        content: `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs } from '../src/args.js';

test('separa comando y flags', () => {
  const r = parseArgs(['saluda', '--nombre', 'Ada']);
  assert.equal(r.command, 'saluda');
  assert.equal(r.flags.nombre, 'Ada');
});

test('flags booleanos', () => {
  const r = parseArgs(['--help']);
  assert.equal(r.command, '');
  assert.equal(r.flags.help, true);
});
`
      },
      {
        path: 'README.md',
        content: `# {{name}}

{{description}}

## Uso

\`\`\`bash
node src/cli.js saluda --nombre Ada
\`\`\`

## Tests

\`\`\`bash
npm test
\`\`\`
`
      }
    ]
  },
  {
    id: 'builtin-web-estatica',
    name: 'Web estática',
    description: 'Sitio web de un solo archivo HTML autocontenido, mobile-first, sin dependencias.',
    builtin: true,
    variables: [
      { name: 'title', label: 'Título del sitio', default: 'Mi sitio' },
      { name: 'accent', label: 'Color de acento (hex)', default: '#0f766e' }
    ],
    files: [
      {
        path: 'index.html',
        content: `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{title}}</title>
<style>
  :root { --accent: {{accent}}; }
  * { box-sizing: border-box; margin: 0; }
  body { font-family: system-ui, sans-serif; line-height: 1.6; color: #1f2937; }
  header { background: var(--accent); color: #fff; padding: 3rem 1.5rem; text-align: center; }
  main { max-width: 46rem; margin: 0 auto; padding: 2rem 1.5rem; }
  footer { text-align: center; padding: 2rem; color: #6b7280; font-size: .9rem; }
  .btn { display: inline-block; background: var(--accent); color: #fff; padding: .75rem 1.5rem;
         border-radius: .5rem; text-decoration: none; margin-top: 1rem; }
</style>
</head>
<body>
<header>
  <h1>{{title}}</h1>
  <p>Bienvenido a {{title}}.</p>
  <a class="btn" href="#contenido">Empezar</a>
</header>
<main id="contenido">
  <h2>Sobre este sitio</h2>
  <p>Edita <code>index.html</code> para personalizar el contenido. Todo el CSS va inline: un solo archivo, cero dependencias.</p>
</main>
<footer>{{title}}</footer>
</body>
</html>
`
      }
    ]
  },
  {
    id: 'builtin-api-node',
    name: 'API HTTP en Node.js',
    description: 'API REST con el módulo http nativo de Node: router propio, JSON, tests. Sin frameworks.',
    builtin: true,
    variables: [{ name: 'name', label: 'Nombre del servicio', default: 'mi-api' }],
    files: [
      {
        path: 'package.json',
        content: `{
  "name": "{{name|kebab}}",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "start": "node src/server.js",
    "test": "node --test tests/"
  }
}
`
      },
      {
        path: 'src/router.js',
        content: `// Router HTTP minimalista: método + patrón con :parámetros.
export function createRouter() {
  const routes = [];

  function add(method, pattern, handler) {
    const keys = [];
    const regex = new RegExp(
      '^' +
        pattern.replace(/:[^/]+/g, (m) => {
          keys.push(m.slice(1));
          return '([^/]+)';
        }) +
        '/?$'
    );
    routes.push({ method, regex, keys, handler });
  }

  function match(method, path) {
    for (const route of routes) {
      if (route.method !== method) continue;
      const m = route.regex.exec(path);
      if (!m) continue;
      const params = {};
      route.keys.forEach((k, i) => {
        params[k] = decodeURIComponent(m[i + 1]);
      });
      return { handler: route.handler, params };
    }
    return null;
  }

  return {
    get: (p, h) => add('GET', p, h),
    post: (p, h) => add('POST', p, h),
    put: (p, h) => add('PUT', p, h),
    delete: (p, h) => add('DELETE', p, h),
    match
  };
}
`
      },
      {
        path: 'src/server.js',
        content: `import http from 'node:http';
import { createRouter } from './router.js';

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const router = createRouter();
const items = new Map();
let nextId = 1;

router.get('/salud', () => ({ status: 200, body: { ok: true } }));
router.get('/items', () => ({ status: 200, body: [...items.values()] }));
router.get('/items/:id', (params) => {
  const item = items.get(Number(params.id));
  return item ? { status: 200, body: item } : { status: 404, body: { error: 'no existe' } };
});
router.post('/items', (_params, body) => {
  if (!body || typeof body.nombre !== 'string' || !body.nombre.trim()) {
    return { status: 400, body: { error: 'falta "nombre"' } };
  }
  const item = { id: nextId++, nombre: body.nombre.trim() };
  items.set(item.id, item);
  return { status: 201, body: item };
});
router.delete('/items/:id', (params) => {
  return items.delete(Number(params.id))
    ? { status: 204, body: null }
    : { status: 404, body: { error: 'no existe' } };
});

export const server = http.createServer((req, res) => {
  const url = new URL(req.url, \`http://\${req.headers.host}\`);
  const found = router.match(req.method, url.pathname);
  if (!found) {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'ruta no encontrada' }));
    return;
  }
  let raw = '';
  req.on('data', (chunk) => {
    raw += chunk;
    if (raw.length > 1e6) req.destroy();
  });
  req.on('end', () => {
    let body = null;
    if (raw) {
      try {
        body = JSON.parse(raw);
      } catch {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'JSON inválido' }));
        return;
      }
    }
    const out = found.handler(found.params, body);
    if (out.status === 204) {
      res.writeHead(204);
      res.end();
      return;
    }
    res.writeHead(out.status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(out.body));
  });
});

if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, () => console.log(\`{{name}} escuchando en http://localhost:\${PORT}\`));
}
`
      },
      {
        path: 'tests/api.test.js',
        content: `process.env.NODE_ENV = 'test';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { server } from '../src/server.js';

const base = await new Promise((resolve) => {
  server.listen(0, () => resolve(\`http://127.0.0.1:\${server.address().port}\`));
});
after(() => server.close());

test('salud responde ok', async () => {
  const res = await fetch(\`\${base}/salud\`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
});

test('crea y recupera items', async () => {
  const created = await fetch(\`\${base}/items\`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nombre: 'uno' })
  });
  assert.equal(created.status, 201);
  const item = await created.json();
  const got = await fetch(\`\${base}/items/\${item.id}\`);
  assert.equal(got.status, 200);
});

test('valida el cuerpo', async () => {
  const res = await fetch(\`\${base}/items\`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({})
  });
  assert.equal(res.status, 400);
});
`
      },
      {
        path: 'README.md',
        content: `# {{name}}

API REST sin frameworks (módulo http nativo).

- \`npm start\` — arranca en el puerto 3000 (o \`PORT\`).
- \`npm test\` — tests con el runner nativo de Node.

Rutas: \`GET /salud\`, \`GET/POST /items\`, \`GET/DELETE /items/:id\`.
`
      }
    ]
  }
];

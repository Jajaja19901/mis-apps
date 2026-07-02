/**
 * mh-collective-servidor.mjs — mini-servidor de sincronización para MH Collective (Node puro, cero deps).
 * Arranque:  node apps/mh-collective-servidor.mjs        (puerto 8787 por defecto; PORT=xxxx para otro)
 * Conexión:  en los móviles de la fiesta (misma WiFi), abrir la URL "LAN" que imprime la consola al arrancar.
 * Token:     MH_TOKEN=xxxx node apps/mh-collective-servidor.mjs → la API exige cabecera "x-mh-token: xxxx" (o ?token=xxxx).
 *            Sin MH_TOKEN la API queda ABIERTA: úsalo solo en una LAN/WiFi de confianza (la de la fiesta).
 * Persiste el estado en mh-collective-datos.json, junto a este archivo. Estado inicial: null hasta que un cliente publique.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 8787;
const TOKEN = process.env.MH_TOKEN || '';
const APP_HTML_PATH = path.join(__dirname, 'mh-collective-fiesta.html');
const DATA_PATH = path.join(__dirname, 'mh-collective-datos.json');
const MAX_BODY_BYTES = 2 * 1024 * 1024; // 2 MB
const SSE_PING_MS = 25000;

// ---------- Persistencia (JSON en disco, escritura atómica tmp+rename) ----------
let store = { version: 0, state: null };

function loadStore() {
  try {
    const raw = fs.readFileSync(DATA_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.version === 'number') {
      store = { version: parsed.version, state: parsed.state ?? null };
    }
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error(`[mh-servidor] No se pudo leer ${DATA_PATH}, se arranca con estado vacío:`, err.message);
    }
  }
}

function saveStore() {
  const tmpPath = path.join(__dirname, `.mh-collective-datos.tmp-${process.pid}-${Date.now()}.json`);
  fs.writeFileSync(tmpPath, JSON.stringify(store), 'utf8');
  fs.renameSync(tmpPath, DATA_PATH);
}

loadStore();

// ---------- Server-Sent Events ----------
const sseClients = new Set();

function broadcastVersion(version) {
  const payload = `data: ${JSON.stringify({ version })}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(payload);
    } catch {
      // cliente desconectado; se limpiará con el listener 'close'
    }
  }
}

// ---------- Utilidades HTTP ----------
function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-mh-token');
}

function sendJson(res, status, obj) {
  if (res.writableEnded) return;
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function checkToken(req, url) {
  if (!TOKEN) return true;
  const header = req.headers['x-mh-token'];
  const queryToken = url.searchParams.get('token');
  return header === TOKEN || queryToken === TOKEN;
}

function readJsonBody(req, res, onOk) {
  const chunks = [];
  let total = 0;
  let aborted = false;

  req.on('data', (chunk) => {
    if (aborted) return;
    total += chunk.length;
    if (total > MAX_BODY_BYTES) {
      aborted = true;
      sendJson(res, 413, { error: 'Cuerpo demasiado grande (máx 2 MB).' });
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });

  req.on('end', () => {
    if (aborted) return;
    const raw = Buffer.concat(chunks).toString('utf8');
    if (!raw) {
      onOk({});
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      sendJson(res, 400, { error: 'JSON malformado.' });
      return;
    }
    onOk(parsed);
  });

  req.on('error', () => {
    aborted = true;
  });
}

// ---------- Rutas ----------
function serveApp(res) {
  fs.readFile(APP_HTML_PATH, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        '<!doctype html><meta charset="utf-8"><h1>404</h1>' +
          '<p>Todavía no existe <code>apps/mh-collective-fiesta.html</code>. ' +
          'Genera primero la app y vuelve a cargar esta página.</p>',
      );
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(data);
  });
}

function handleGetState(req, res) {
  sendJson(res, 200, { version: store.version, state: store.state });
}

function handlePostState(req, res) {
  readJsonBody(req, res, (body) => {
    const { baseVersion, state } = body || {};
    if (typeof baseVersion !== 'number') {
      sendJson(res, 400, { error: 'Falta "baseVersion" (número) en el cuerpo.' });
      return;
    }
    if (baseVersion !== store.version) {
      sendJson(res, 409, { version: store.version, state: store.state });
      return;
    }
    const next = { version: store.version + 1, state: state ?? null };
    try {
      store = next;
      saveStore();
    } catch (err) {
      console.error('[mh-servidor] Error persistiendo datos:', err.message);
      sendJson(res, 500, { error: 'No se pudo guardar el estado.' });
      return;
    }
    sendJson(res, 200, { version: store.version });
    broadcastVersion(store.version);
  });
}

function handleEvents(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write(`data: ${JSON.stringify({ version: store.version })}\n\n`);
  sseClients.add(res);

  const ping = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      // se limpiará con el listener 'close'
    }
  }, SSE_PING_MS);

  req.on('close', () => {
    clearInterval(ping);
    sseClients.delete(res);
  });
}

// ---------- Servidor HTTP ----------
const server = http.createServer((req, res) => {
  let url;
  try {
    url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  } catch {
    sendJson(res, 400, { error: 'URL inválida.' });
    return;
  }

  setCors(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const { pathname } = url;

  try {
    if (pathname === '/' && req.method === 'GET') {
      serveApp(res);
      return;
    }

    if (pathname.startsWith('/api/')) {
      if (!checkToken(req, url)) {
        sendJson(res, 401, { error: 'Token inválido o ausente (x-mh-token / ?token=).' });
        return;
      }

      if (pathname === '/api/state' && req.method === 'GET') {
        handleGetState(req, res);
        return;
      }

      if (pathname === '/api/state' && req.method === 'POST') {
        handlePostState(req, res);
        return;
      }

      if (pathname === '/api/events' && req.method === 'GET') {
        handleEvents(req, res);
        return;
      }

      sendJson(res, 404, { error: 'Ruta de API no encontrada.' });
      return;
    }

    sendJson(res, 404, { error: 'No encontrado.' });
  } catch (err) {
    console.error('[mh-servidor] Error inesperado gestionando la petición:', err);
    sendJson(res, 500, { error: 'Error interno del servidor.' });
  }
});

server.on('clientError', (err, socket) => {
  if (socket.writable) {
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
  }
});

server.on('error', (err) => {
  console.error('[mh-servidor] Error del servidor:', err.message);
});

function getLanIps() {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) ips.push(net.address);
    }
  }
  return ips;
}

server.listen(PORT, () => {
  const ips = getLanIps();
  console.log(`[mh-servidor] MH Collective escuchando en el puerto ${PORT}`);
  console.log(`  Local:  http://localhost:${PORT}`);
  if (ips.length) {
    for (const ip of ips) console.log(`  LAN:    http://${ip}:${PORT}  (usa esta URL en los móviles de la fiesta)`);
  } else {
    console.log('  LAN:    (no se detectó ninguna IP de red local)');
  }
  console.log(
    TOKEN
      ? '  Token MH_TOKEN activo: la API exige cabecera x-mh-token (o ?token=).'
      : '  Sin MH_TOKEN: la API está ABIERTA (úsalo solo en una LAN de confianza).',
  );
});

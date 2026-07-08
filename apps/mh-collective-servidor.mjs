/**
 * mh-collective-servidor.mjs — mini-servidor de sincronización para MH Collective (Node puro, cero deps).
 * Arranque:  node apps/mh-collective-servidor.mjs        (puerto 8787 por defecto; PORT=xxxx para otro)
 * Conexión:  en los móviles de la fiesta (misma WiFi), abrir la URL "LAN" que imprime la consola al arrancar.
 * Token:     MH_TOKEN=xxxx node apps/mh-collective-servidor.mjs → la API exige cabecera "x-mh-token: xxxx".
 *            Sin MH_TOKEN solo se escucha en localhost (127.0.0.1). Para abrir en la WiFi de la fiesta
 *            hay que poner MH_TOKEN y, además, MH_HOST=0.0.0.0 (así nadie de fuera lee la caja sin token).
 * Red LAN:   MH_HOST=0.0.0.0 MH_TOKEN=loquesea node apps/mh-collective-servidor.mjs
 * Persiste el estado en mh-collective-datos.json, junto a este archivo. Estado inicial: null hasta que un cliente publique.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 8787;
const TOKEN = process.env.MH_TOKEN || '';
// Sin token → solo loopback (nadie de la red lee/escribe sin querer). Con token → se puede exponer a la LAN.
const HOST = process.env.MH_HOST || (TOKEN ? '0.0.0.0' : '127.0.0.1');
const APP_HTML_PATH = path.join(__dirname, 'mh-collective-fiesta.html');
const DATA_PATH = path.join(__dirname, 'mh-collective-datos.json');
const MAX_BODY_BYTES = 2 * 1024 * 1024;   // 2 MB de cuerpo bruto
const MAX_STATE_BYTES = 512 * 1024;       // 512 KB de estado serializado (una fiesta real cabe de sobra)
const MAX_DEPTH = 64;                      // profundidad máx del JSON del cuerpo (anti JSON-bomb)
const MAX_SSE_CLIENTS = 60;                // tope de conexiones en vivo
const SSE_PING_MS = 25000;

// Hash del token en buffer fijo para comparar en tiempo constante (evita timing oracle).
const TOKEN_HASH = TOKEN ? crypto.createHash('sha256').update(TOKEN).digest() : null;

// Bind no-loopback SIN token = configuración insegura: abortar antes de exponer datos.
if (TOKEN === '' && HOST !== '127.0.0.1' && HOST !== 'localhost' && HOST !== '::1') {
  console.error('[mh-servidor] ABORTADO: escuchar en ' + HOST + ' sin MH_TOKEN dejaría la caja y la lista');
  console.error('               accesibles a cualquiera de la red. Pon MH_TOKEN=xxxx para abrir en la LAN.');
  process.exit(1);
}

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
  // Limpia ficheros temporales huérfanos de un arranque anterior que muriera a medias.
  try {
    for (const f of fs.readdirSync(__dirname)) {
      if (f.startsWith('.mh-collective-datos.tmp-')) {
        try { fs.unlinkSync(path.join(__dirname, f)); } catch { /* da igual */ }
      }
    }
  } catch { /* directorio ilegible: no es crítico */ }
}

// Persiste de forma atómica Y durable. Recibe el objeto YA serializado para no volver a stringify
// (así un estado no serializable se rechaza ANTES de tocar disco o memoria — ver handlePostState).
function persist(serialized) {
  const tmpPath = path.join(__dirname, `.mh-collective-datos.tmp-${process.pid}-${Date.now()}.json`);
  const fd = fs.openSync(tmpPath, 'w');
  try {
    fs.writeSync(fd, serialized);
    fs.fsyncSync(fd);          // fuerza el flush a disco: sobrevive a un corte de luz
  } finally {
    fs.closeSync(fd);
  }
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
// La app se sirve del MISMO origen que la API, así que no hace falta CORS abierto.
// Solo respondemos a preflight con eco del método; sin Allow-Origin '*' (cierra exfiltración cross-origin).
function setCors(res) {
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-mh-token');
  res.setHeader('Vary', 'Origin');
}

// Blindado: si el objeto no es serializable (p.ej. estado envenenado), responde 500 simple
// en vez de propagar el throw y dejar TODAS las lecturas caídas.
function sendJson(res, status, obj) {
  if (res.writableEnded) return;
  let body;
  try {
    body = JSON.stringify(obj);
  } catch {
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end('{"error":"Respuesta no serializable."}');
    return;
  }
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

// Comparación en tiempo constante sobre los hashes SHA-256 (longitud fija). Solo por cabecera:
// el token en ?query= se filtra por logs/Referer, así que ya no se acepta.
function parseCookies(req) {
  const raw = req.headers['cookie'];
  const out = {};
  if (typeof raw !== 'string') return out;
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) {
      try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* cookie malformada */ }
    }
  }
  return out;
}
function checkToken(req) {
  if (!TOKEN_HASH) return true;
  // Cabecera x-mh-token si viene (fetch), o la cookie mh_token que dejó serveApp (imprescindible
  // para EventSource/SSE, que NO puede mandar cabeceras propias). Así el sync funciona en LAN con token.
  let provided = req.headers['x-mh-token'];
  if (typeof provided !== 'string' || provided.length === 0) provided = parseCookies(req).mh_token;
  if (typeof provided !== 'string' || provided.length === 0) return false;
  const got = crypto.createHash('sha256').update(provided).digest();
  return crypto.timingSafeEqual(got, TOKEN_HASH);
}

// Rechaza JSON con anidamiento abusivo ANTES de construir el árbol completo (anti JSON-bomb / DoS por pila).
function tooDeep(raw, max) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === '[' || c === '{') { depth++; if (depth > max) return true; }
    else if (c === ']' || c === '}') depth--;
  }
  return false;
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
    if (tooDeep(raw, MAX_DEPTH)) {
      sendJson(res, 400, { error: 'JSON demasiado anidado.' });
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
// Archivos estáticos de la PWA que viven JUNTO a la app en apps/: el service worker,
// el manifest y los DOS iconos que pone el dueño (icon-192.png / icon-512.png).
// Lista blanca fija (nada de rutas del usuario → sin path traversal).
const STATIC_ASSETS = {
  '/sw.js':         { file: 'sw.js',          type: 'text/javascript; charset=utf-8', extra: { 'Service-Worker-Allowed': '/' } },
  '/manifest.json': { file: 'manifest.json',  type: 'application/manifest+json; charset=utf-8' },
  '/icon-192.png':  { file: 'icon-192.png',   type: 'image/png' },
  '/icon-512.png':  { file: 'icon-512.png',   type: 'image/png' },
};
function serveStatic(res, asset) {
  fs.readFile(path.join(__dirname, asset.file), (err, data) => {
    if (err) {
      // Si el dueño aún no ha puesto sus iconos, no pasa nada: la app funciona igual.
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('No encontrado: ' + asset.file);
      return;
    }
    res.writeHead(200, Object.assign({ 'Content-Type': asset.type, 'Cache-Control': 'no-cache' }, asset.extra || {}));
    res.end(data);
  });
}
function serveApp(res) {
  fs.readFile(APP_HTML_PATH, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        '<!doctype html><meta charset="utf-8"><h1>404</h1>' +
          '<p>La aplicación aún no está disponible en este servidor.</p>',
      );
      return;
    }
    // IMPORTANTE: NO se entrega el token aquí. GET / es público (para que cargue la app), así que
    // mandar el token en esta respuesta lo regalaría a cualquiera que abra la URL (incluido un curl
    // de la red) y anularía su protección. El token se pasa por el FRAGMENTO del enlace que comparte
    // el dueño (…/#t=TOKEN); el navegador NO envía el fragmento al servidor, y el cliente lo convierte
    // en la cookie mh_token él solo. Así solo quien tiene el enlace con token queda autenticado.
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
    // Serializa PRIMERO: si el estado no es serializable o es enorme, se rechaza sin tocar
    // memoria ni disco (evita el envenenamiento persistente que dejaba todas las lecturas en 500).
    let serialized;
    try {
      serialized = JSON.stringify(next);
    } catch {
      sendJson(res, 400, { error: 'Estado no serializable.' });
      return;
    }
    if (Buffer.byteLength(serialized) > MAX_STATE_BYTES) {
      sendJson(res, 413, { error: 'Estado demasiado grande.' });
      return;
    }
    try {
      persist(serialized);
      store = next; // solo se compromete en memoria si el disco fue bien
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
  if (sseClients.size >= MAX_SSE_CLIENTS) {
    sendJson(res, 503, { error: 'Demasiadas conexiones en vivo. Inténtalo en un momento.' });
    return;
  }
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

    if (req.method === 'GET' && Object.prototype.hasOwnProperty.call(STATIC_ASSETS, pathname)) {
      serveStatic(res, STATIC_ASSETS[pathname]);
      return;
    }

    if (pathname.startsWith('/api/')) {
      if (!checkToken(req)) {
        sendJson(res, 401, { error: 'Token inválido o ausente. Abre la app con el enlace que incluye #t=TOKEN.' });
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

// Anti-slowloris y tope de sockets: un cliente lento no puede retener conexiones indefinidamente.
server.headersTimeout = 10000;
server.requestTimeout = 15000;
server.keepAliveTimeout = 30000;
server.maxConnections = 256;

server.on('clientError', (err, socket) => {
  if (socket.writable) {
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
  }
});

server.on('error', (err) => {
  console.error('[mh-servidor] Error del servidor:', err.message);
});

// Una excepción suelta en un callback async (socket que se cierra a mitad de escritura, etc.)
// no debe tumbar todo el servidor y cortar la fiesta: se registra y se sigue.
process.on('uncaughtException', (err) => {
  console.error('[mh-servidor] Excepción no capturada (se continúa):', err && err.message);
});
process.on('unhandledRejection', (err) => {
  console.error('[mh-servidor] Promesa rechazada sin gestionar (se continúa):', err && err.message);
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

server.listen(PORT, HOST, () => {
  const loopback = HOST === '127.0.0.1' || HOST === 'localhost' || HOST === '::1';
  console.log(`[mh-servidor] MH Collective escuchando en ${HOST}:${PORT}`);
  console.log(`  Local:  http://localhost:${PORT}`);
  if (!loopback) {
    const ips = getLanIps();
    if (ips.length) {
      for (const ip of ips) console.log(`  LAN:    http://${ip}:${PORT}  (usa esta URL en los móviles de la fiesta)`);
    } else {
      console.log('  LAN:    (no se detectó ninguna IP de red local)');
    }
  }
  if (TOKEN && loopback) {
    console.log('  Token activo, pero solo se escucha en localhost. Para la WiFi de la fiesta añade MH_HOST=0.0.0.0.');
  } else if (TOKEN) {
    console.log('  Token MH_TOKEN activo: la API exige la cabecera x-mh-token. Abierto a la LAN.');
  } else {
    console.log('  Sin MH_TOKEN: solo accesible desde este equipo (localhost). Pon MH_TOKEN + MH_HOST=0.0.0.0 para la LAN.');
  }
});

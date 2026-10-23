'use strict';

/**
 * NEXUS GAME — servidor local embutido no app desktop.
 *
 * Replica o comportamento do serve.py:
 *   - estático em web/ (sem cache)
 *   - /fontes/  (JSON, fonts.css e arquivos de fonte com CORS)
 *   - /_proxy?url=...  (repassa Authorization/Content-Type/Accept e faz streaming)
 */

const http = require('http');
const https = require('https');
const dns = require('dns').promises;
const net = require('net');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');

const ROOT = path.join(__dirname, '..', 'web');
const FONTS_DIR = path.join(__dirname, '..', 'fontes');
const FONT_EXT = ['.ttf', '.otf', '.woff', '.woff2'];

/* Mídia do projeto: a IA referencia "imagens/x.jpg" e "sons/y.mp3" (caminho
 * relativo); o HTML salvo embute o que for usado. */
const IMAGES_DIR = path.join(__dirname, '..', 'imagens');
const SOUNDS_DIR = path.join(__dirname, '..', 'sons');

/* --- Projetos salvos ------------------------------------------------------- */
const SALVOS_DIR = path.resolve(process.env.NEXUS_SALVOS_DIR || path.join(__dirname, '..', 'salvos'));
const IMAGE_EXT = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.avif', '.bmp'];
const SOUND_EXT = ['.mp3', '.ogg', '.wav', '.m4a', '.flac', '.opus', '.aac', '.weba'];
const MEDIA_KINDS = {
  imagens: { dir: IMAGES_DIR, ext: IMAGE_EXT, key: 'images' },
  sons: { dir: SOUNDS_DIR, ext: SOUND_EXT, key: 'sounds' },
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.flac': 'audio/flac',
  '.opus': 'audio/ogg',
  '.aac': 'audio/aac',
  '.weba': 'audio/webm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.map': 'application/json; charset=utf-8',
};

function send(res, status, body, headers) {
  const data = Buffer.isBuffer(body) ? body : Buffer.from(String(body), 'utf-8');
  res.writeHead(status, Object.assign({
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': data.length,
    'Cache-Control': 'no-store',
  }, headers || {}));
  res.end(data);
}

function safeJoin(root, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch (_) {
    return null;
  }
  if (decoded.indexOf('\0') !== -1) return null;
  const full = path.resolve(root, '.' + decoded);
  if (full !== root && !full.startsWith(root + path.sep)) return null;
  return full;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    req.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > 64 * 1024 * 1024) {
        const error = new Error('corpo excede limite'); error.statusCode = 413;
        reject(error); req.resume(); return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function serveStatic(req, res, pathname) {
  const target = pathname === '/' ? '/index.html' : pathname;
  let full = safeJoin(ROOT, target);
  if (!full) return send(res, 403, 'acesso negado');

  let stat;
  try {
    const realRoot = await fsp.realpath(ROOT);
    const realFile = await fsp.realpath(full);
    if (realFile !== realRoot && !realFile.startsWith(realRoot + path.sep)) return send(res, 403, 'acesso negado');
    full = realFile;
    stat = await fsp.stat(full);
  } catch (_) {
    return send(res, 404, 'nao encontrado');
  }
  if (stat.isDirectory()) {
    full = path.join(full, 'index.html');
    try {
      const realFile = await fsp.realpath(full);
      const realRoot = await fsp.realpath(ROOT);
      if (realFile !== realRoot && !realFile.startsWith(realRoot + path.sep)) return send(res, 403, 'acesso negado');
      full = realFile;
      stat = await fsp.stat(full);
    } catch (_) {
      return send(res, 404, 'nao encontrado');
    }
  }
  if (!stat.isFile()) return send(res, 404, 'nao encontrado');

  const ext = path.extname(full).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Length': stat.size,
    'Cache-Control': 'no-store',
  });
  if (req.method === 'HEAD') return res.end();

  try {
    await pipeline(fs.createReadStream(full), res);
  } catch (_) {
    /* cliente desconectou no meio do arquivo */
  }
}

function fontFormat(file) {
  return file.toLowerCase().endsWith('.otf') ? 'opentype' : 'truetype';
}

async function listFonts() {
  let names = [];
  try {
    names = await fsp.readdir(FONTS_DIR);
  } catch (_) {
    return [];
  }
  return names
    .filter((name) => !name.startsWith('.') && FONT_EXT.includes(path.extname(name).toLowerCase()))
    .sort()
    .map((name) => {
      const ext = path.extname(name).toLowerCase();
      return {
        file: name,
        family: path.basename(name, ext),
        ext,
        url: '/fontes/' + encodeURIComponent(name),
      };
    });
}

async function serveFonts(req, res, pathname) {
  if (pathname === '/fontes' || pathname === '/fontes/') {
    const fonts = await listFonts();
    return send(res, 200, JSON.stringify({ fonts }), {
      'Content-Type': 'application/json; charset=utf-8',
      'Cross-Origin-Resource-Policy': 'same-origin',
    });
  }

  if (pathname.endsWith('/fonts.css')) {
    const fonts = await listFonts();
    const css = fonts.map((font) => {
      const family = font.family.replace(/"/g, '');
      return '@font-face{font-family:"' + family + '";src:url("' + font.url +
        '") format("' + fontFormat(font.file) + '");font-display:swap}';
    }).join('\n');
    return send(res, 200, css, {
      'Content-Type': 'text/css; charset=utf-8',
      'Cross-Origin-Resource-Policy': 'same-origin',
    });
  }

  const name = path.basename(pathname);
  const ext = path.extname(name).toLowerCase();
  if (!FONT_EXT.includes(ext) || name.startsWith('.')) {
    return send(res, 404, 'nao encontrado');
  }

  const full = path.join(FONTS_DIR, name);
  let data;
  try {
    data = await fsp.readFile(full);
  } catch (_) {
    return send(res, 404, 'nao encontrado');
  }

  const type = MIME[ext] || 'application/octet-stream';
  const headers = {
    'Content-Type': type,
    'Content-Length': data.length,
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Cache-Control': 'no-store',
  };
  res.writeHead(200, headers);
  res.end(req.method === 'HEAD' ? undefined : data);
}

/* --- Mídia do projeto (imagens/ e sons/) ---------------------------------- */

async function listMedia(dir, exts, prefix) {
  let names = [];
  try {
    names = await fsp.readdir(dir);
  } catch (_) {
    return [];
  }
  const items = [];
  for (const name of names.sort()) {
    if (name.startsWith('.')) continue;
    const ext = path.extname(name).toLowerCase();
    if (!exts.includes(ext)) continue;
    const full = path.join(dir, name);
    let stat;
    try {
      stat = await fsp.stat(full);
    } catch (_) {
      continue;
    }
    if (!stat.isFile()) continue;
    items.push({
      file: name,
      name: path.basename(name, ext),
      ext,
      size: stat.size,
      url: prefix + encodeURIComponent(name),
    });
  }
  return items;
}

function sendJson(res, body) {
  return send(res, 200, JSON.stringify(body), {
    'Content-Type': 'application/json; charset=utf-8',
    'Cross-Origin-Resource-Policy': 'same-origin',
  });
}

async function serveMedia(req, res, pathname) {
  const trimmed = pathname.replace(/\/+$/, '') || '/';

  if (trimmed === '/midia') {
    const images = await listMedia(IMAGES_DIR, IMAGE_EXT, '/imagens/');
    const sounds = await listMedia(SOUNDS_DIR, SOUND_EXT, '/sons/');
    return sendJson(res, { images, sounds });
  }

  const segment = pathname.slice(1).split('/')[0];
  const kind = MEDIA_KINDS[segment];
  if (!kind) return send(res, 404, 'nao encontrado');

  if (trimmed === '/' + segment) {
    const items = await listMedia(kind.dir, kind.ext, '/' + segment + '/');
    return sendJson(res, { [kind.key]: items });
  }

  const name = path.basename(pathname);
  const ext = path.extname(name).toLowerCase();
  if (name.startsWith('.') || !kind.ext.includes(ext)) {
    return send(res, 404, 'midia nao encontrada');
  }

  const full = path.join(kind.dir, name);
  let data;
  try {
    data = await fsp.readFile(full);
  } catch (_) {
    return send(res, 404, 'midia nao encontrada');
  }

  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Length': data.length,
    'Access-Control-Allow-Origin': '*',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'Cache-Control': 'no-store',
  });
  res.end(req.method === 'HEAD' ? undefined : data);
}

/* --- Proteção do /_proxy contra SSRF ---------------------------------------
 * A página gerada pela IA roda em iframe sandbox: ela não lê a resposta
 * (origem opaca), mas ainda pode disparar requisições cegas para dentro da
 * rede. Bloqueamos faixas privadas/link-local/metadata e revalidamos cada
 * salto de redirecionamento. Loopback segue liberado porque provedores
 * locais (LM Studio, Ollama, llama.cpp) são caso de uso legítimo.
 * Resolução DNS não é validada (risco residual conhecido). */
const BLOCKED_HOSTS = new Set([
  'metadata',
  'metadata.google.internal',
  'instance-data',
  'metadata.azure.com',
]);

function ipv4Blocked(ip) {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const a = p[0];
  const b = p[1];
  if (a === 127) return false;                     /* loopback: provedores locais */
  if (a === 0 || a === 10) return true;
  if (a === 169 && b === 254) return true;         /* link-local / metadata */
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; /* CGNAT */
  if ((a === 192 && (b === 0 || b === 2 || b === 88)) ||
      (a === 198 && (b === 18 || b === 19 || b === 51)) ||
      (a === 203 && b === 0)) return true;
  if (a >= 224) return true;                       /* multicast / reservado */
  return false;
}

function ipv6Number(ip) {
  const text = String(ip).toLowerCase().split('%')[0];
  const mapped = text.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return { mapped: mapped[1] };
  const halves = text.split('::');
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length > 1 && halves[1] ? halves[1].split(':') : [];
  const words = left.concat(Array(Math.max(0, 8 - left.length - right.length)).fill('0'), right);
  if (words.length !== 8 || words.some((part) => !/^[0-9a-f]{1,4}$/.test(part))) return null;
  return words.reduce((n, part) => (n << 16n) | BigInt(parseInt(part, 16)), 0n);
}

function addressBlocked(ip, allowLoopback) {
  const family = net.isIP(ip);
  if (family === 4) {
    if (ip.startsWith('127.')) return !allowLoopback;
    return ipv4Blocked(ip);
  }
  if (family !== 6) return true;
  const value = ipv6Number(ip);
  if (value && typeof value === 'object' && value.mapped) return addressBlocked(value.mapped, allowLoopback);
  if (value === null || value === 0n) return true;
  if (value === 1n) return !allowLoopback;
  const start = 0x20000000000000000000000000000000n;
  const end = 0x40000000000000000000000000000000n;
  if (value < start || value >= end) return true;
  if ((value >> 96n) === 0x20010db8n || (value >> 105n) === 0x10008n || (value >> 112n) === 0x2002n) return true;
  return false;
}

function hostBlocked(host) {
  let h = String(host || '').toLowerCase();
  if (!h) return true;
  if (h.charAt(0) === '[') h = h.slice(1, -1);     /* [::1] -> ::1 */
  if (BLOCKED_HOSTS.has(h)) return true;
  if (h === 'localhost') return false;
  if (net.isIP(h)) return addressBlocked(h, true);
  return false;
}

function targetBlocked(target) {
  let u;
  try { u = new URL(target); } catch (e) { return true; }
  if ((u.protocol !== 'http:' && u.protocol !== 'https:') || u.username || u.password) return true;
  if (u.username || u.password) return true;
  return hostBlocked(u.hostname);
}

/* Resolve, validates every returned address and pins the socket lookup to that
 * exact result. This prevents DNS rebinding between validation and connect. */
async function pinnedRequest(target, opts) {
  const url = new URL(target);
  if (url.username || url.password || targetBlocked(target)) throw new Error('destino nao permitido');
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const literalLoopback = net.isIP(host) === 4 ? host.startsWith('127.') : host === '::1';
  const localAllowed = host === 'localhost' || literalLoopback;
  const records = net.isIP(host) ? [{ address: host, family: net.isIP(host) }] : await dns.lookup(host, { all: true, verbatim: true });
  if (!records.length || records.some((record) => addressBlocked(record.address, localAllowed) ||
      (host === 'localhost' && !((net.isIP(record.address) === 4 && record.address.startsWith('127.')) || record.address === '::1')))) {
    throw new Error('destino resolvido para rede nao permitida');
  }
  const transport = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const request = transport.request(url, {
      method: opts.method,
      headers: opts.headers,
      signal: opts.signal,
      lookup: (hostname, options, callback) => {
        if (options && options.all) return callback(null, records);
        const record = records[0];
        callback(null, record.address, record.family);
      },
    }, resolve);
    request.once('error', reject);
    if (opts.body) request.end(opts.body);
    else request.end();
  });
}

async function fetchAllowlisted(target, opts) {
  let current = target;
  let method = opts.method;
  let body = opts.body;
  let headers = Object.assign({}, opts.headers);
  for (let hop = 0; hop < 5; hop++) {
    const response = await pinnedRequest(current, { method, body, headers, signal: opts.signal });
    const code = response.statusCode || 502;
    const location = response.headers.location;
    if (code < 300 || code >= 400 || !location) return response;
    const next = new URL(location, current).href;
    if (targetBlocked(next)) throw new Error('redirecionamento bloqueado pelo proxy');
    response.resume();
    if (new URL(next).origin !== new URL(current).origin) {
      delete headers.authorization;
      delete headers.Authorization;
    }
    if ((code === 303 && method !== 'HEAD') || ((code === 301 || code === 302) && method === 'POST')) {
      method = 'GET'; body = undefined;
      delete headers['content-type']; delete headers['Content-Type'];
    }
    current = next;
  }
  throw new Error('redirecionamentos demais');
}

async function proxy(req, res, url) {
  if (!sameLocalOrigin(req)) return send(res, 403, 'origem nao permitida');
  const target = url.searchParams.get('url') || '';
  if (!/^https?:\/\//i.test(target)) {
    return send(res, 400, 'parametro url invalido');
  }
  if (targetBlocked(target)) {
    return send(res, 403, 'destino nao permitido (rede interna)');
  }

  const headers = {};
  for (const name of ['authorization', 'content-type', 'accept']) {
    const value = req.headers[name];
    if (value) headers[name] = value;
  }

  let body;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    body = await readBody(req);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 600000);
  const onClose = () => {
    if (!res.writableEnded) controller.abort();
  };
  res.on('close', onClose);

  try {
    const upstream = await fetchAllowlisted(target, {
      method: req.method,
      headers,
      body: body && body.length ? body : undefined,
      signal: controller.signal,
    });

    res.writeHead(upstream.statusCode || 502, {
      'Content-Type': upstream.headers['content-type'] || 'application/json',
      'Cache-Control': 'no-store',
    });
    if (typeof res.flushHeaders === 'function') res.flushHeaders();

    await pipeline(upstream, res);
  } catch (err) {
    if (res.headersSent) {
      res.destroy();
    } else {
      send(res, 502, 'proxy: ' + (err && err.message ? err.message : String(err)));
    }
  } finally {
    clearTimeout(timer);
    res.off('close', onClose);
  }
}

/* --- Projetos salvos — API REST ------------------------------------------- */

const fspMkdir = fsp.mkdir;

/* Project names are single path components. Reject malformed input instead of
 * basename()-normalizing it into a different, potentially destructive target. */
function validSaveName(value) {
  const name = String(value == null ? '' : value);
  return name.length > 0 && name.length <= 80 && !name.startsWith('.') &&
    !name.includes('..') && !/[\\/\0]/.test(name) &&
    /^[\p{L}\p{N} _().-]+$/u.test(name) &&
    !['assets', '_backups', 'index.html', 'meta.json'].includes(name.toLowerCase());
}

function savePath(name) {
  if (!validSaveName(name)) return null;
  const root = path.resolve(SALVOS_DIR);
  const full = path.resolve(root, name);
  return full !== root && full.startsWith(root + path.sep) ? full : null;
}

function safeAssetPath(relative) {
  const value = String(relative == null ? '' : relative).replace(/\\/g, '/');
  const parts = value.split('/');
  if (parts.length < 2 || !value || value.includes('\0') || parts.some((part) => !part || part === '.' || part === '..' || part.startsWith('.')) ||
      parts[0] !== 'assets') return null;
  return parts.join(path.sep);
}

async function safeProjectDirectory(name, create) {
  const full = savePath(name);
  if (!full) return null;
  if (!(await ensureSavesRoot())) return null;
  try {
    const stat = await fsp.lstat(full);
    if (stat.isSymbolicLink() || !stat.isDirectory()) return null;
  } catch (error) {
    if (error.code !== 'ENOENT' || !create) return null;
    await fsp.mkdir(full);
  }
  return full;
}

async function ensureSavesRoot() {
  try { await fsp.mkdir(SALVOS_DIR, { recursive: true }); } catch (_) { return false; }
  try {
    const stat = await fsp.lstat(SALVOS_DIR);
    return stat.isDirectory() && !stat.isSymbolicLink();
  } catch (_) { return false; }
}

async function safeAssetDestination(projectDir, relative, create) {
  const root = await fsp.realpath(projectDir);
  const parts = relative.split(path.sep);
  let current = root;
  for (let i = 0; i < parts.length - 1; i++) {
    current = path.join(current, parts[i]);
    try {
      const stat = await fsp.lstat(current);
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('caminho de asset invalido');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      if (!create) throw error;
      await fsp.mkdir(current);
    }
  }
  const destination = path.resolve(root, relative);
  if (!destination.startsWith(root + path.sep)) throw new Error('caminho de asset invalido');
  try {
    const stat = await fsp.lstat(destination);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('destino de asset invalido');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  return destination;
}

function sameLocalOrigin(req) {
  const hostHeader = String(req.headers.host || '');
  let requestHost;
  try { requestHost = new URL('http://' + hostHeader).hostname.replace(/^\[|\]$/g, '').toLowerCase(); }
  catch (_) { requestHost = ''; }
  if (req.headers['x-nexus-local-request'] === '1' && ['127.0.0.1', 'localhost', '::1'].includes(requestHost)) return true;
  const site = String(req.headers['sec-fetch-site'] || '').toLowerCase();
  if (site && site !== 'same-origin' && site !== 'none') return false;
  const origin = req.headers.origin;
  if (!origin) return site === 'same-origin' || site === 'none';
  try {
    const parsed = new URL(origin);
    const host = new URL('http://' + hostHeader);
    const hostname = host.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    return parsed.origin === host.origin && ['127.0.0.1', 'localhost', '::1'].includes(hostname);
  } catch (_) { return false; }
}

async function apiSavesList() {
  if (!(await ensureSavesRoot())) return [];
  let names = [];
  try { names = await fsp.readdir(SALVOS_DIR); } catch (_) { return []; }
  const projetos = [];
  for (const nome of names.sort().reverse()) {
    const pasta = path.join(SALVOS_DIR, nome);
    let stat;
    try { stat = await fsp.lstat(pasta); } catch (_) { continue; }
    if (!stat.isDirectory() || stat.isSymbolicLink() || !validSaveName(nome)) continue;
    const idx = path.join(pasta, 'index.html');
    const meta = path.join(pasta, 'meta.json');
    let size = 0, modified = 0;
    try { const s = await fsp.stat(idx); size = s.size; modified = s.mtimeMs; } catch (_) {}
    const p = { name: nome, size, modified: Math.floor(modified) };
    try {
      const m = JSON.parse(await fsp.readFile(meta, 'utf-8'));
      if (m.prompt) p.prompt = m.prompt;
    } catch (_) {}
    projetos.push(p);
  }
  projetos.sort((a, b) => b.modified - a.modified);
  return projetos;
}

async function apiSavesRead(nome) {
  const pasta = await safeProjectDirectory(nome, false);
  if (!pasta) return [null, validSaveName(nome) ? 404 : 400];
  const idx = path.join(pasta, 'index.html');
  try {
    const idxStat = await fsp.lstat(idx);
    if (idxStat.isSymbolicLink() || !idxStat.isFile()) return [null, 404];
    const data = await fsp.readFile(idx, 'utf-8');
    return [data, 200];
  } catch (_) { return [null, 404]; }
}

async function apiSavesReadAsset(nome, subpath) {
  const pasta = await safeProjectDirectory(nome, false);
  const sub = safeAssetPath(subpath);
  if (!pasta || !sub) return [null, 400, null];
  try {
      const full = await safeAssetDestination(pasta, sub, false);
    const data = await fsp.readFile(full);
    const ext = path.extname(full).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    return [data, 200, mime];
  } catch (_) { return [null, 404, null]; }
}

async function apiSavesSave(nome, body) {
  if (!validSaveName(nome)) return [{ ok: false, error: 'nome invalido' }, 400];
  if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.html !== 'string') {
    return [{ ok: false, error: 'html invalido' }, 400];
  }
  if (Buffer.byteLength(body.html, 'utf-8') > 32 * 1024 * 1024) return [{ ok: false, error: 'html excede limite' }, 413];
  const suppliedAssets = body.assets && typeof body.assets === 'object' && !Array.isArray(body.assets) ? body.assets : {};
  const preparedAssets = [];
  let assetTotal = 0;
  for (const [assetPath, assetData] of Object.entries(suppliedAssets)) {
    const safePath = safeAssetPath(assetPath);
    if (!safePath) return [{ ok: false, error: 'caminho de asset invalido' }, 400];
    let encoded = typeof assetData === 'string' ? assetData :
      (assetData && (assetData.base64 || assetData.data) ? String(assetData.base64 || assetData.data) : null);
    if (encoded === null) return [{ ok: false, error: 'asset invalido' }, 400];
    if (encoded.includes(',')) encoded = encoded.slice(encoded.indexOf(',') + 1);
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || encoded.length % 4 === 1) return [{ ok: false, error: 'asset base64 invalido' }, 400];
    const bytes = Buffer.from(encoded, 'base64');
    if (bytes.length > 6 * 1024 * 1024) return [{ ok: false, error: 'asset excede limite' }, 413];
    assetTotal += bytes.length;
    if (assetTotal > 20 * 1024 * 1024) return [{ ok: false, error: 'assets excedem limite' }, 413];
    preparedAssets.push([safePath, bytes]);
  }
  try {
    const pasta = await safeProjectDirectory(nome, true);
    if (!pasta) return [{ ok: false, error: 'destino invalido' }, 400];

    // Backup automático antes de substituir
    const idxAtual = path.join(pasta, 'index.html');
    let idxStat;
    try {
      idxStat = await fsp.lstat(idxAtual);
      if (idxStat.isSymbolicLink() || !idxStat.isFile()) return [{ ok: false, error: 'index.html invalido' }, 400];
    } catch (error) { if (error.code === 'ENOENT') idxStat = null; else throw error; }
    if (idxStat && idxStat.isFile()) {
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const bkDir = path.join(pasta, '_backups', ts);
      await fsp.mkdir(path.join(bkDir), { recursive: true });
      await fsp.copyFile(idxAtual, path.join(bkDir, 'index.html'));
      // Assets
      const assetsDir = path.join(pasta, 'assets');
      let assetsStat;
      try {
        assetsStat = await fsp.lstat(assetsDir);
        if (assetsStat.isSymbolicLink() || !assetsStat.isDirectory()) return [{ ok: false, error: 'assets invalido' }, 400];
      } catch (error) { if (error.code === 'ENOENT') assetsStat = null; else throw error; }
      if (assetsStat && assetsStat.isDirectory()) {
        await fsp.cp(assetsDir, path.join(bkDir, 'assets'), { recursive: true, force: true });
      }
    }

    await fsp.writeFile(path.join(pasta, 'index.html'), body.html, 'utf-8');

    // Salva assets se vierem no body
    for (const [safePath, buf] of preparedAssets) {
      const full = await safeAssetDestination(pasta, safePath, true);
      const handle = await fsp.open(full, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_TRUNC | (fs.constants.O_NOFOLLOW || 0), 0o600);
      try { await handle.writeFile(buf); } finally { await handle.close(); }
    }

    const meta = {
      prompt: body.prompt || '',
      date: body.date || '',
      modified: Date.now(),
    };
    const metaPath = path.join(pasta, 'meta.json');
    try {
      const metaStat = await fsp.lstat(metaPath);
      if (metaStat.isSymbolicLink() || !metaStat.isFile()) return [{ ok: false, error: 'meta.json invalido' }, 400];
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    await fsp.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
    return [{ ok: true, name: nome }, 200];
  } catch (e) {
    return [{ ok: false, error: e.message }, 500];
  }
}

async function apiSavesDelete(nome) {
  if (!validSaveName(nome)) return [{ ok: false, error: 'nome invalido' }, 400];
  try {
    if (!(await ensureSavesRoot())) return [{ ok: false, error: 'raiz invalida' }, 400];
    const pasta = path.join(path.resolve(SALVOS_DIR), nome);
    const stat = await fsp.lstat(pasta);
    if (stat.isSymbolicLink() || !stat.isDirectory()) return [{ ok: false, error: 'destino invalido' }, 400];
    await fsp.rm(pasta, { recursive: true, force: true });
    return [{ ok: true }, 200];
  } catch (e) {
    return [{ ok: false, error: e.message }, 500];
  }
}

async function serveApi(req, res, pathname) {
  const method = req.method;
  const parts = pathname.replace(/\/+$/, '').split('/');

  if (pathname === '/_api/saves' && method === 'GET') {
    return sendJson(res, await apiSavesList());
  }

  if (parts.length >= 4 && parts[1] === '_api' && parts[2] === 'saves') {
    const nome = parts[3];
    const rest = parts.slice(4).join('/');

    if ((method === 'POST' || method === 'DELETE') && !sameLocalOrigin(req)) {
      return sendJson(res, { ok: false, error: 'origem nao permitida' }, 403);
    }

    if (!validSaveName(nome)) return sendJson(res, { ok: false, error: 'nome invalido' }, 400);

    if (!rest) {
      if (method === 'POST') {
        const body = await readBodyJson(req);
        const [r, s] = await apiSavesSave(nome, body);
        return sendJson(res, r, s);
      }
      if (method === 'DELETE') {
        const [r, s] = await apiSavesDelete(nome);
        return sendJson(res, r, s);
      }
      return send(res, 405, 'metodo nao permitido');
    }

    if (rest === 'rename' && method === 'POST') {
      const body = await readBodyJson(req);
      const novo = String(body.name || '');
      if (!validSaveName(nome) || !validSaveName(novo)) return sendJson(res, { ok: false, error: 'nome invalido' }, 400);
      const src = path.join(path.resolve(SALVOS_DIR), nome);
      const dst = path.join(path.resolve(SALVOS_DIR), novo);
      try {
        let srcStat;
        try { srcStat = await fsp.lstat(src); }
        catch (error) { if (error.code === 'ENOENT') return sendJson(res, { ok: false, error: 'projeto nao encontrado' }, 404); throw error; }
        if (srcStat.isSymbolicLink() || !srcStat.isDirectory()) return sendJson(res, { ok: false, error: 'origem invalida' }, 400);
        try { await fsp.lstat(dst); return sendJson(res, { ok: false, error: 'destino ja existe' }, 409); }
        catch (e) { if (e.code !== 'ENOENT') throw e; }
        await fsp.rename(src, dst);
        return sendJson(res, { ok: true, name: novo });
      } catch (e) {
        return sendJson(res, { ok: false, error: e.message }, e.code === 'EEXIST' ? 409 : 500);
      }
    }

    if (rest === 'duplicate' && method === 'POST') {
      if (!validSaveName(nome)) return sendJson(res, { ok: false, error: 'nome invalido' }, 400);
      const safe = nome;
      const src = path.join(path.resolve(SALVOS_DIR), safe);
      const srcStat = await fsp.lstat(src).catch(() => null);
      if (!srcStat || srcStat.isSymbolicLink() || !srcStat.isDirectory()) return sendJson(res, { ok: false, error: 'origem nao encontrada' }, 404);
      let dstName = safe.slice(0, 73) + '-copia';
      let n = 2;
      while (await fsp.lstat(savePath(dstName)).then(() => true).catch(() => false)) dstName = safe.slice(0, 72 - String(n).length) + '-copia' + n++;
      const dst = savePath(dstName);
      try {
        await fsp.cp(src, dst, { recursive: true });
        return sendJson(res, { ok: true, name: dstName });
      } catch (e) {
        return sendJson(res, { ok: false, error: e.message }, 500);
      }
    }

    if (rest === 'index.html' && method === 'GET') {
      const [html, status] = await apiSavesRead(nome);
      if (status === 200) {
        const buf = Buffer.from(html, 'utf-8');
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Length': buf.length,
          'Cross-Origin-Resource-Policy': 'same-origin',
          'Cache-Control': 'no-store',
        });
        return res.end(buf);
      }
      return send(res, status, 'nao encontrado');
    }

    if (rest.startsWith('assets/') && method === 'GET') {
      const [data, status, mime] = await apiSavesReadAsset(nome, rest);
      if (status === 200) {
        res.writeHead(200, {
          'Content-Type': mime,
          'Content-Length': data.length,
          'Cross-Origin-Resource-Policy': 'same-origin',
          'Cache-Control': 'no-store',
        });
        return res.end(data);
      }
      return send(res, status, 'nao encontrado');
    }

    // List backups: /_api/saves/<nome>/backups
    if (rest === 'backups' && method === 'GET') {
      const safe = validSaveName(nome) ? nome : null;
      if (!safe) return sendJson(res, { error: 'nome invalido' }, 400);
      const bkRoot = path.join(SALVOS_DIR, safe, '_backups');
      let bkNames = [];
      try { bkNames = await fsp.readdir(bkRoot); } catch (_) { return sendJson(res, []); }
      const rootStat = await fsp.lstat(bkRoot).catch(() => null);
      if (!rootStat || rootStat.isSymbolicLink() || !rootStat.isDirectory()) return sendJson(res, []);
      const backups = [];
      for (const bkName of bkNames.sort().reverse()) {
        const bkDir = path.join(bkRoot, bkName);
        let bkStat;
        try { bkStat = await fsp.lstat(bkDir); } catch (_) { continue; }
        if (!bkStat.isDirectory() || bkStat.isSymbolicLink()) continue;
        const idx = path.join(bkDir, 'index.html');
        let s;
        try { s = await fsp.lstat(idx); } catch (_) { continue; }
        if (!s.isFile() || s.isSymbolicLink()) continue;
        backups.push({ timestamp: bkName, modified: Math.floor(s.mtimeMs), size: s.size });
      }
      return sendJson(res, backups);
    }

    // Restore backup: POST /_api/saves/<nome>/_backups/<ts>/restore
    const bkMatch = rest.match(/^_backups\/([^/]+)\/restore$/);
    if (bkMatch && method === 'POST') {
      const ts = bkMatch[1];
      const safe = validSaveName(nome) ? nome : null;
      if (!safe || !/^(?:\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}|\d{8}_\d{6})$/.test(ts)) return sendJson(res, { ok: false, error: 'backup invalido' }, 400);
      const bkDir = path.join(SALVOS_DIR, safe, '_backups', ts);
      const idxBk = path.join(bkDir, 'index.html');
      const projectDir = await safeProjectDirectory(safe, false);
      if (!projectDir) return sendJson(res, { ok: false, error: 'projeto nao encontrado' }, 404);
      const backupDirStat = await fsp.lstat(bkDir).catch(() => null);
      if (!backupDirStat || backupDirStat.isSymbolicLink() || !backupDirStat.isDirectory()) return sendJson(res, { ok: false, error: 'backup nao encontrado' }, 404);
      try {
        const backupStat = await fsp.lstat(idxBk);
        if (backupStat.isSymbolicLink() || !backupStat.isFile()) throw new Error('backup invalido');
      } catch (_) { return sendJson(res, { ok: false, error: 'backup nao encontrado' }, 404); }
      const pasta = projectDir;
      await fsp.copyFile(idxBk, path.join(pasta, 'index.html'));
      // Restore assets if exists
      const bkAssets = path.join(bkDir, 'assets');
      try {
        const assetsStat = await fsp.lstat(bkAssets);
        if (assetsStat.isSymbolicLink() || !assetsStat.isDirectory()) throw new Error('assets de backup invalidos');
        const dstAssets = path.join(pasta, 'assets');
        try { await fsp.rm(dstAssets, { recursive: true, force: true }); } catch (_) {}
        await fsp.cp(bkAssets, dstAssets, { recursive: true });
      } catch (_) {}
      return sendJson(res, { ok: true, name: safe, restored_from: ts });
    }

    // Read backup index.html: GET /_api/saves/<nome>/_backups/<ts>/index.html
    const readBk = rest.match(/^_backups\/([^/]+)\/index\.html$/);
    if (readBk && method === 'GET') {
      const ts = readBk[1];
      const safe = validSaveName(nome) ? nome : null;
      if (!safe) return send(res, 400, 'nome invalido');
      if (!/^(?:\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}|\d{8}_\d{6})$/.test(ts)) return send(res, 400, 'backup invalido');
      const idx = path.join(SALVOS_DIR, safe, '_backups', ts, 'index.html');
      try {
        const stat = await fsp.lstat(idx);
        if (stat.isSymbolicLink() || !stat.isFile()) return send(res, 404, 'backup nao encontrado');
        const data = await fsp.readFile(idx, 'utf-8');
        const buf = Buffer.from(data, 'utf-8');
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Length': buf.length,
          'Cross-Origin-Resource-Policy': 'same-origin',
          'Cache-Control': 'no-store',
        });
        return res.end(buf);
      } catch (_) { return send(res, 404, 'backup nao encontrado'); }
    }
  }

  return send(res, 404, 'nao encontrado');
}

/* Pequeno helper para ler body JSON em POST. */
function readBodyJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    req.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > 64 * 1024 * 1024) {
        const error = new Error('corpo excede limite'); error.statusCode = 413;
        reject(error); req.destroy(); return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8'))); }
      catch (e) { const error = new Error('JSON invalido'); error.statusCode = 400; reject(error); }
    });
    req.on('error', reject);
  });
}

function sendJson(res, body, status) {
  const s = status || 200;
  const json = Buffer.from(JSON.stringify(body), 'utf-8');
  res.writeHead(s, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': json.length,
    'Cache-Control': 'no-store',
  });
  res.end(json);
}

async function handle(req, res) {
  let url;
  try {
    url = new URL(req.url, 'http://127.0.0.1');
  } catch (_) {
    return send(res, 400, 'requisicao invalida');
  }

  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch (_) {
    return send(res, 400, 'caminho invalido');
  }

  if (pathname.endsWith('/_proxy')) return proxy(req, res, url);
  if (pathname === '/fontes' || pathname.startsWith('/fontes/')) {
    return serveFonts(req, res, pathname);
  }
  if (pathname.replace(/\/+$/, '') === '/midia' ||
      Object.keys(MEDIA_KINDS).some((k) => pathname === '/' + k || pathname.startsWith('/' + k + '/'))) {
    return serveMedia(req, res, pathname);
  }
  if (pathname.startsWith('/_api/')) {
    return serveApi(req, res, pathname);
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 404, 'nao encontrado');
  }
  return serveStatic(req, res, pathname);
}

function startServer(preferredPort, attempts) {
  const firstPort = Number.isInteger(preferredPort) ? preferredPort : 8790;
  const maxAttempts = Number.isInteger(attempts) ? attempts : 20;

  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      handle(req, res).catch((err) => {
        console.error('[server]', err);
        if (!res.headersSent) send(res, err.statusCode || 500, err.statusCode ? err.message : 'erro interno');
        else res.destroy();
      });
    });

    let port = firstPort;

    const onError = (err) => {
      server.removeListener('error', onError);
      if (err && err.code === 'EADDRINUSE' && port - firstPort < maxAttempts) {
        port += 1;
        server.listen(port, '127.0.0.1');
        server.once('error', onError);
        return;
      }
      reject(err);
    };

    server.once('error', onError);
    server.listen(port, '127.0.0.1', () => {
      server.removeListener('error', onError);
      const address = server.address();
      resolve({ server, port: address && typeof address === 'object' ? address.port : port });
    });
  });
}

function stopServer(server) {
  if (!server || !server.listening) return Promise.resolve();
  /* Fecha sockets keep-alive e conexões ativas para que o processo Electron
     não saia deixando a porta 8790 presa por um servidor órfão. */
  try {
    if (typeof server.closeIdleConnections === 'function') server.closeIdleConnections();
    if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
  } catch (_) {}
  return new Promise((resolve) => {
    let settled = false;
    const done = () => { if (!settled) { settled = true; resolve(); } };
    server.close(done);
    /* O callback normalmente é imediato depois de closeAllConnections(). */
    setTimeout(done, 1500).unref();
  });
}

module.exports = { startServer, stopServer };

if (require.main === module) {
  const port = Number(process.argv[2]) || 8790;
  startServer(port).then(({ port: actual }) => {
    console.log('NEXUS GAME server: http://127.0.0.1:' + actual + '/');
  }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

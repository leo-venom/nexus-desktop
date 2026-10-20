'use strict';

/**
 * NEXUS-DESKTOP — servidor local embutido no app desktop.
 *
 * Replica o comportamento do serve.py:
 *   - estático em web/ (sem cache)
 *   - /fontes/  (JSON, fonts.css e arquivos de fonte com CORS)
 *   - /_proxy?url=...  (repassa Authorization/Content-Type/Accept e faz streaming)
 */

const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');

const ROOT = path.join(__dirname, '..', 'web');
const FONTS_DIR = path.join(__dirname, '..', 'fontes');
const FONT_EXT = ['.ttf', '.otf', '.woff', '.woff2'];
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
  '.ico': 'image/x-icon',
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
    req.on('data', (chunk) => chunks.push(chunk));
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
    stat = await fsp.stat(full);
  } catch (_) {
    return send(res, 404, 'nao encontrado');
  }
  if (stat.isDirectory()) {
    full = path.join(full, 'index.html');
    try {
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
      'Access-Control-Allow-Origin': '*',
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
      'Access-Control-Allow-Origin': '*',
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
    'Access-Control-Allow-Origin': '*',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'Cache-Control': 'no-store',
  };
  res.writeHead(200, headers);
  res.end(req.method === 'HEAD' ? undefined : data);
}

async function proxy(req, res, url) {
  const target = url.searchParams.get('url') || '';
  if (!/^https?:\/\//i.test(target)) {
    return send(res, 400, 'parametro url invalido');
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
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body: body && body.length ? body : undefined,
      signal: controller.signal,
      redirect: 'follow',
    });

    res.writeHead(upstream.status, {
      'Content-Type': upstream.headers.get('content-type') || 'application/json',
      'Cache-Control': 'no-store',
    });
    if (typeof res.flushHeaders === 'function') res.flushHeaders();

    if (upstream.body) {
      await pipeline(Readable.fromWeb(upstream.body), res);
    } else {
      res.end();
    }
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
        if (!res.headersSent) send(res, 500, 'erro interno');
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
      resolve({ server, port });
    });
  });
}

module.exports = { startServer };

if (require.main === module) {
  const port = Number(process.argv[2]) || 8790;
  startServer(port).then(({ port: actual }) => {
    console.log('NEXUS-DESKTOP server: http://127.0.0.1:' + actual + '/');
  }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

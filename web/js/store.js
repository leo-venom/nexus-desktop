/* ============================================================
 * store.js — Projetos salvos em pasta própria via API REST.
 *
 * Cada projeto = pasta em salvos/<nome>/:
 *   index.html     ← jogo/página
 *   assets/        ← mídia (sons, imagens, modelos)
 *   meta.json      ← prompt, data, stats
 *
 * API: /_api/saves/<nome> (GET list, POST salvar, DELETE)
 *      /_api/saves/<nome>/index.html (GET)
 *      /_api/saves/<nome>/assets/<path> (GET)
 * ============================================================ */
(function () {
  'use strict';

  var API_BASE = '/_api/saves';
  var EXT = '.html';

  /* ---------- sanitização ---------- */

  function sanitizeName(raw) {
    var s = String(raw == null ? '' : raw).trim();
    if (s.toLowerCase().slice(-EXT.length) === EXT) s = s.slice(0, -EXT.length);
    s = s.replace(/[^\p{L}\p{N} _().-]+/gu, '-').replace(/\.{2,}/g, '-').trim().replace(/^\.+|\.+$/g, '');
    if (!s) s = 'projeto';
    if (s.length > 80) s = s.slice(0, 80);
    if (['assets', '_backups', 'index.html', 'meta.json'].indexOf(s.toLowerCase()) >= 0) s = 'projeto-' + s;
    return s;
  }

  /* ---------- helpers ---------- */

  function sizeLabel(bytes) {
    bytes = Number(bytes) || 0;
    if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
    if (bytes >= 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return bytes + ' B';
  }

  function pad2(n) { return n < 10 ? '0' + n : String(n); }

  function dateLabel(ms) {
    ms = Number(ms) || 0;
    if (ms <= 0) return '';
    var d = new Date(ms);
    return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  function meta(item) {
    return sizeLabel(item.size) + ' · ' + dateLabel(item.modified);
  }

  /* ---------- API REST ---------- */

  function api(path, method, body) {
    var url = API_BASE + path;
    var requestMethod = method || 'GET';
    var opts = {
      method: requestMethod,
      headers: { 'Accept': 'application/json' },
    };
    if (requestMethod === 'POST' || requestMethod === 'DELETE') {
      /* O servidor local usa este cabeçalho para reconhecer o shell mesmo
         quando Electron não envia Origin/Sec-Fetch-Site em fetch same-origin. */
      opts.headers['X-Nexus-Local-Request'] = '1';
    }
    if (body != null) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    return fetch(url, opts).then(function (r) {
      if (!r.ok) return r.json().catch(function () { return { error: r.statusText }; }).then(function (e) { throw new Error(e.error || r.statusText); });
      return r.json();
    });
  }

  function fetchHtml(path) {
    return fetch(API_BASE + path, {
      method: 'GET',
      headers: { 'Accept': 'text/html' },
    }).then(function (r) {
      if (!r.ok) throw new Error(r.statusText);
      return r.text();
    });
  }

  /* ---------- API pública ---------- */

  /* Salva o HTML e os arquivos de mídia recolhidos do documento. */
  function save(name, html, prompt, assets) {
    var safe = sanitizeName(name);
    var body = {
      html: html,
      prompt: prompt || '',
      date: new Date().toISOString(),
    };
    if (assets && Object.keys(assets).length) {
      body.assets = assets;
    }
    return api('/' + encodeURIComponent(safe), 'POST', body).then(function (r) {
      if (r.ok) return safe;
      throw new Error(r.error || 'falha ao salvar');
    });
  }

  /* Mapeia media local para assets/images, assets/sounds ou assets/generated,
     atualizando os caminhos no HTML guardado. */
  var ASSET_RE = /(?:imagens|sons|assets)\/[A-Za-z0-9._\/%+~@-]+/gi;
  var ASSET_MAX_FILE = 6 * 1024 * 1024;
  var ASSET_MAX_TOTAL = 20 * 1024 * 1024;

  function assetDestination(sourcePath) {
    if (sourcePath.indexOf('assets/') === 0) {
      return sourcePath.split('/').map(function (part) {
        try { return decodeURIComponent(part); } catch (e) { return part; }
      }).join('/');
    }
    var prefix = sourcePath.indexOf('imagens/') === 0 ? 'assets/images/' :
      (sourcePath.indexOf('sons/') === 0 ? 'assets/sounds/' : 'assets/generated/');
    var tail = sourcePath.replace(/^(?:imagens|sons|assets)\//, '');
    return prefix + tail.split('/').map(function (part) {
      try { return decodeURIComponent(part); }
      catch (e) { return part; }
    }).join('/');
  }

  function blobDataUrl(blob) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(fr.result); };
      fr.onerror = function () { reject(new Error('falha ao ler asset')); };
      fr.readAsDataURL(blob);
    });
  }

  /* Reescreve apenas referências locais: aceita barra inicial (`/imagens/x`),
     relativa (`imagens/x`, `./imagens/x`) e ignora URLs externas. A barra
     inicial precisa sair para o projeto salvo funcionar com <base href>. */
  function rewriteAssetRef(html, source, destination) {
    var escaped = source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var expression = new RegExp('(^|[\\s"\'`=(,;:>\\[\\{])(?:\\.\\/|\\/)?' + escaped, 'g');
    return String(html).replace(expression, function (match, prefix) {
      return prefix + destination;
    });
  }

  function extractAssetsFromHtml(html, projectName) {
    if (!html) return Promise.resolve({});
    var matches = new Set();
    var m;
    ASSET_RE.lastIndex = 0;
    while ((m = ASSET_RE.exec(html)) !== null) {
      matches.add(m[0]);
    }
    if (!matches.size) return Promise.resolve({ assets: {}, html: String(html) });
    var promises = [];
    var keys = [];
    matches.forEach(function (sourcePath) {
      var destination = assetDestination(sourcePath);
      keys.push({ source: sourcePath, destination: destination });
      var encodedPath = sourcePath.split('/').map(function (part) {
        try { return encodeURIComponent(decodeURIComponent(part)); }
        catch (e) { return encodeURIComponent(part); }
      }).join('/');
      var localPath = sourcePath.indexOf('assets/') === 0 && projectName
        ? API_BASE + '/' + encodeURIComponent(sanitizeName(projectName)) + '/' + encodedPath
        : '/' + encodedPath;
      promises.push(
        fetch(localPath, { cache: 'no-cache' }).then(function (r) {
          if (!r.ok && sourcePath.indexOf('assets/') === 0 && projectName) {
            return fetch('/' + encodedPath, { cache: 'no-cache' });
          }
          return r;
        }).then(function (r) {
          if (!r.ok) throw new Error('asset nao encontrado: ' + sourcePath);
          return r.blob();
        }).then(function (blob) {
          if (blob.size > ASSET_MAX_FILE) throw new Error('asset excede 6 MB: ' + sourcePath);
          return blobDataUrl(blob).then(function (dataUrl) {
            return { dataUrl: dataUrl, bytes: blob.size };
          });
        })
      );
    });
    return Promise.all(promises.map(function (promise) {
      return promise.catch(function (error) {
        /* Uma referência opcional quebrada não deve impedir o salvamento do
           documento inteiro; ela permanece no HTML para diagnóstico. */
        try { console.warn('[nexus] asset não incorporado:', error.message || error); } catch (e) {}
        return null;
      });
    })).then(function (dataUris) {
      var assets = {};
      var totalBytes = 0;
      var transformed = String(html);
      for (var i = 0; i < keys.length; i++) {
        if (!dataUris[i]) continue;
        totalBytes += dataUris[i].bytes;
        if (totalBytes > ASSET_MAX_TOTAL) throw new Error('assets do projeto excedem 20 MB');
        assets[keys[i].destination] = dataUris[i].dataUrl;
        transformed = rewriteAssetRef(transformed, keys[i].source, keys[i].destination);
      }
      return { assets: assets, html: transformed };
    });
  }

  /* Salva com extração automática de assets do HTML. */
  function saveWithAssets(name, html, prompt) {
    var safe = sanitizeName(name);
    return extractAssetsFromHtml(html, safe).then(function (result) {
      return save(safe, result.html, prompt, result.assets);
    });
  }

  function inlineProjectAssets(name, html) {
    var safe = sanitizeName(name);
    var source = String(html == null ? '' : html);
    var expression = /assets\/[A-Za-z0-9._/%+~@-]+/g;
    var refs = [];
    var seen = Object.create(null);
    var match;
    while ((match = expression.exec(source)) !== null) {
      var path = match[0];
      if (path.split('/').some(function (part) { return part === '.' || part === '..'; })) continue;
      if (!seen[path]) { seen[path] = true; refs.push(path); }
    }
    if (!refs.length) return Promise.resolve(source);
    var total = 0;
    return refs.reduce(function (chain, relative) {
      return chain.then(function (result) {
        return readAsset(safe, relative).then(function (blob) {
          if (!blob) throw new Error('asset nao encontrado: ' + relative);
          total += blob.size;
          if (total > ASSET_MAX_TOTAL) throw new Error('assets do projeto excedem 20 MB');
          return blobDataUrl(blob).then(function (dataUrl) {
            var escaped = relative.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            return result.replace(new RegExp(escaped, 'g'), dataUrl);
          });
        });
      });
    }, Promise.resolve(source));
  }

  /* Lista os projetos (mais recentes primeiro). */
  function list() {
    return api('', 'GET').then(function (arr) {
      return (arr || []).map(function (p) {
        return { name: p.name, size: p.size, modified: p.modified, prompt: p.prompt || '' };
      });
    });
  }

  /* Lê o index.html de um projeto. */
  function read(name) {
    var safe = sanitizeName(name);
    return fetchHtml('/' + encodeURIComponent(safe) + '/index.html').catch(function () { return null; });
  }

  /* Lê um asset. */
  function readAsset(name, assetPath) {
    var safe = sanitizeName(name);
    var relative = String(assetPath || '').replace(/^\/+/, '');
    var url = API_BASE + '/' + encodeURIComponent(safe) + '/' + relative.split('/').map(encodeURIComponent).join('/');
    return fetch(url, { method: 'GET' }).then(function (r) {
      if (!r.ok) return null;
      return r.blob();
    });
  }

  /* Gera a URL base para servir assets de um projeto aberto.
     Usada como <base href="..."> no iframe. */
  function projectBaseUrl(name) {
    return API_BASE + '/' + encodeURIComponent(sanitizeName(name)) + '/';
  }

  /* Lista backups de um projeto. */
  function listBackups(name) {
    var safe = sanitizeName(name);
    return api('/' + encodeURIComponent(safe) + '/backups', 'GET').then(function (arr) {
      return (arr || []).map(function (b) {
        return { timestamp: b.timestamp, modified: b.modified, size: b.size };
      });
    });
  }

  /* Lê o index.html de um backup específico. */
  function readBackup(name, timestamp) {
    var safe = sanitizeName(name);
    return fetchHtml('/' + encodeURIComponent(safe) + '/_backups/' + encodeURIComponent(timestamp) + '/index.html').catch(function () { return null; });
  }

  /* Restaura um backup. */
  function restoreBackup(name, timestamp) {
    var safe = sanitizeName(name);
    return api('/' + encodeURIComponent(safe) + '/_backups/' + encodeURIComponent(timestamp) + '/restore', 'POST').then(function (r) {
      if (r.ok) return r;
      throw new Error(r.error || 'falha ao restaurar');
    });
  }
  function remove(name) {
    var safe = sanitizeName(name);
    return api('/' + encodeURIComponent(safe), 'DELETE').then(function (r) {
      if (r.ok) return true;
      throw new Error(r.error || 'falha ao remover');
    }).catch(function () { return false; });
  }

  function rename(name, newName) {
    var safe = sanitizeName(name);
    var novo = sanitizeName(newName);
    return api('/' + encodeURIComponent(safe) + '/rename', 'POST', { name: novo }).then(function (r) {
      if (r.ok) return r.name;
      throw new Error(r.error || 'falha ao renomear');
    });
  }

  function duplicate(name) {
    var safe = sanitizeName(name);
    return api('/' + encodeURIComponent(safe) + '/duplicate', 'POST').then(function (r) {
      if (r.ok) return r.name;
      throw new Error(r.error || 'falha ao duplicar');
    });
  }

  window.Store = {
    EXT: EXT,
    sanitizeName: sanitizeName,
    sizeLabel: sizeLabel,
    dateLabel: dateLabel,
    meta: meta,
    save: save,
    saveWithAssets: saveWithAssets,
    extractAssetsFromHtml: extractAssetsFromHtml,
    inlineProjectAssets: inlineProjectAssets,
    list: list,
    read: read,
    readAsset: readAsset,
    projectBaseUrl: projectBaseUrl,
    'delete': remove,
    listBackups: listBackups,
    readBackup: readBackup,
    restoreBackup: restoreBackup,
    rename: rename,
    duplicate: duplicate,
    remove: remove,
  };
})();

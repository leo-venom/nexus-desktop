/* ============================================================
 * store.js — port de Store.kt: páginas salvas em HTML.
 * Desktop: File System Access API (pasta escolhida pelo usuário,
 * handle salvo no IndexedDB). Fallback: IndexedDB + download.
 * ============================================================ */
(function () {
  'use strict';

  var FOLDER = 'nexus77';
  var EXT = '.html';
  var DB_NAME = 'nexus77';
  var DB_VERSION = 1;

  var _encoder = (typeof TextEncoder !== 'undefined') ? new TextEncoder() : null;

  function utf8Bytes(s) {
    if (_encoder) return _encoder.encode(s).length;
    var n = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c < 0x80) n += 1;
      else if (c < 0x800) n += 2;
      else if (c >= 0xD800 && c <= 0xDBFF) { n += 4; i++; }
      else n += 3;
    }
    return n;
  }

  /* Normaliza o nome digitado num arquivo .html seguro (igual ao Kotlin). */
  function fileName(raw) {
    var s = String(raw == null ? '' : raw).trim();
    if (s.toLowerCase().slice(-EXT.length) === EXT) s = s.slice(0, -EXT.length);
    s = s.replace(/[\\/:*?"<>|\r\n\t]+/g, '-').trim().replace(/^\.+/, '').replace(/\.+$/, '');
    if (!s) s = 'pagina';
    if (s.length > 80) s = s.slice(0, 80);
    return s + EXT;
  }

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

  /* Linha secundária do card: tamanho + data. */
  function meta(item) {
    return sizeLabel(item.size) + ' · ' + dateLabel(item.modified);
  }

  /* ---------- IndexedDB ---------- */

  function idbOpen() {
    return new Promise(function (resolve, reject) {
      if (!window.indexedDB) return reject(new Error('IndexedDB indisponível'));
      var req = window.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
        if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'name' });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error('falha ao abrir IndexedDB')); };
    });
  }

  function idbTx(store, mode, fn) {
    return idbOpen().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(store, mode);
        var os = tx.objectStore(store);
        var req;
        try { req = fn(os); } catch (e) { reject(e); return; }
        tx.oncomplete = function () { db.close(); resolve(req ? req.result : undefined); };
        tx.onerror = function () { db.close(); reject(tx.error || new Error('falha no IndexedDB')); };
        tx.onabort = function () { db.close(); reject(tx.error || new Error('transação cancelada')); };
      });
    });
  }

  function idbGet(store, key) {
    return idbTx(store, 'readonly', function (os) { return os.get(key); });
  }
  function idbPut(store, value, key) {
    return idbTx(store, 'readwrite', function (os) { return os.put(value, key); });
  }
  function idbDelete(store, key) {
    return idbTx(store, 'readwrite', function (os) { return os.delete(key); });
  }
  function idbAll(store) {
    return idbTx(store, 'readonly', function (os) { return os.getAll(); });
  }

  /* ---------- File System Access ---------- */

  function supportsFolder() {
    return typeof window.showDirectoryPicker === 'function';
  }

  /* Handle da pasta escolhida (persistido no IndexedDB). */
  function getDirHandle() {
    return idbGet('meta', 'dir').then(function (h) { return h || null; }).catch(function () { return null; });
  }

  /* Pede acesso à pasta (precisa ser chamado a partir de um clique). */
  function ensureDir() {
    return getDirHandle().then(function (h) {
      if (!h) return null;
      if (typeof h.queryPermission !== 'function') return h;
      return h.queryPermission({ mode: 'readwrite' }).then(function (p) {
        if (p === 'granted') return h;
        return h.requestPermission({ mode: 'readwrite' }).then(function (p2) {
          return p2 === 'granted' ? h : null;
        });
      }).catch(function () { return null; });
    });
  }

  /* Abre o seletor de pasta e guarda o handle. */
  function pickFolder() {
    if (!supportsFolder()) {
      return Promise.reject(new Error('pasta local indisponível neste navegador'));
    }
    return window.showDirectoryPicker({ mode: 'readwrite' }).then(function (h) {
      return idbPut('meta', h, 'dir').then(function () { return h; });
    });
  }

  /* Nome da pasta escolhida (ou null se nenhuma). */
  function folderLabel() {
    return getDirHandle().then(function (h) { return h ? String(h.name || FOLDER) : null; });
  }

  /* ---------- download (fallback sem FSA) ---------- */

  function download(name, html) {
    try {
      var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    } catch (e) {
      /* ignora (ambiente sem DOM) */
    }
  }

  /* ---------- API pública ---------- */

  /* Grava o HTML (sobrescreve o mesmo nome). Resolve com o nome final. */
  function save(name, html) {
    var data = String(html == null ? '' : html);
    var now = Date.now();
    var size = utf8Bytes(data);
    return ensureDir().then(function (dir) {
      if (dir) {
        return dir.getFileHandle(name, { create: true })
          .then(function (fh) { return fh.createWritable(); })
          .then(function (w) {
            return w.write(data).then(function () { return w.close(); });
          })
          .then(function () { return name; });
      }
      return idbPut('files', { name: name, html: data, size: size, modified: now })
        .then(function () { download(name, data); return name; });
    });
  }

  /* Lista as páginas salvas (mais recentes primeiro). */
  function list() {
    return ensureDir().then(function (dir) {
      if (dir) {
        var out = [];
        function step(it) {
          return it.next().then(function (r) {
            if (r.done) return out;
            var name = r.value[0];
            var handle = r.value[1];
            if (handle && handle.kind === 'file' && name.toLowerCase().slice(-EXT.length) === EXT) {
              return handle.getFile().then(function (f) {
                out.push({ name: name, size: f.size, modified: f.lastModified });
                return step(it);
              });
            }
            return step(it);
          });
        }
        return step(dir.entries()).then(function (arr) {
          return arr.sort(function (a, b) { return b.modified - a.modified; });
        });
      }
      return idbAll('files').then(function (rows) {
        return (rows || []).map(function (r) {
          return { name: r.name, size: r.size, modified: r.modified };
        }).sort(function (a, b) { return b.modified - a.modified; });
      });
    });
  }

  /* Lê uma página salva (null se não existir). */
  function read(name) {
    return ensureDir().then(function (dir) {
      if (dir) {
        return dir.getFileHandle(name).then(function (fh) {
          return fh.getFile();
        }).then(function (f) {
          return f.text();
        }).catch(function () {
          return null;
        });
      }
      return idbGet('files', name).then(function (row) { return row ? row.html : null; });
    });
  }

  /* Remove uma página salva; true se algo foi removido. */
  function remove(name) {
    return ensureDir().then(function (dir) {
      if (dir) {
        return dir.removeEntry(name).then(function () { return true; }).catch(function () { return false; });
      }
      return idbGet('files', name).then(function (row) {
        if (!row) return false;
        return idbDelete('files', name).then(function () { return true; });
      });
    });
  }

  window.Store = {
    FOLDER: FOLDER,
    EXT: EXT,
    fileName: fileName,
    sizeLabel: sizeLabel,
    dateLabel: dateLabel,
    meta: meta,
    supportsFolder: supportsFolder,
    pickFolder: pickFolder,
    folderLabel: folderLabel,
    save: save,
    list: list,
    read: read,
    'delete': remove,
    remove: remove
  };
})();

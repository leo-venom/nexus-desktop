/* ============================================================
 * nx-image.js — referência visual do input
 * ============================================================
 * Valida a imagem real (magic bytes), limita tamanho/pixels,
 * gera miniatura e um relatório técnico de baixo nível.
 *
 * Não interpreta semântica: paleta, brilho, bordas, regiões,
 * grade 3x3, linhas e pistas de interface são aproximações.
 * OCR só roda se o navegador expuser TextDetector.
 *
 * API global `NxImage`:
 *   inspect(file)                  → Promise<asset> (valida + analisa)
 *   analyzeSource(source, meta)    → Promise<report>
 *   compare(refReport, candReport) → {score, issues, metrics}
 *   dataUrl(file)                  → Promise<string> (envio por visão)
 *   referenceBlock(asset, opts)    → string para o prompt
 *   DEFAULT_COMMAND                → pedido padrão quando só há imagem
 * ============================================================ */
(function () {
  'use strict';
  if (window.NxImage) return;

  var MAX_BYTES = 12 * 1024 * 1024;
  var MAX_PIXELS = 40 * 1000 * 1000;
  var MAX_SIDE = 10000;
  var SAMPLE_MAX = 512;
  var EDGE_MAX = 240;
  var SEG_MAX = 160;
  var THUMB_MAX = 220;
  var HEAD_BYTES = 512 * 1024;
  var GAME_ASSET_MAX_BYTES = 6 * 1024 * 1024;

  var DEFAULT_COMMAND = 'Recrie a imagem de referência como um jogo interativo. ' +
    'Mantenha a composição, as proporções, as cores e as posições relativas dos elementos; ' +
    'use Canvas 2D, Three.js ou outra biblioteca já disponível conforme a referência.';

  var DEFAULT_GAME_IMAGE_COMMAND = 'Aplique a imagem anexada como fundo (background) do jogo atual, ' +
    'mantendo o jogo, os controles e o layout como estão.';

  function codeError(code, message) {
    var e = new Error(message);
    e.code = code;
    return e;
  }

  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
  function round(n, p) {
    var f = Math.pow(10, p == null ? 3 : p);
    return Math.round(Number(n) * f) / f;
  }
  function hex(r, g, b) {
    function h(v) {
      var s = clamp(Math.round(v), 0, 255).toString(16);
      return s.length < 2 ? '0' + s : s;
    }
    return '#' + h(r) + h(g) + h(b);
  }
  function parseHex(h) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(h || ''));
    if (!m) return { r: 0, g: 0, b: 0 };
    var n = parseInt(m[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  function colorDist(a, b) {
    var dr = a.r - b.r, dg = a.g - b.g, db = a.b - b.b;
    return Math.sqrt(dr * dr + dg * dg + db * db);
  }
  function formatBytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1048576).toFixed(1) + ' MB';
  }
  function safeName(name) {
    var s = String(name == null ? 'imagem' : name).replace(/[\\/]/g, '-').replace(/\s+/g, ' ').trim();
    return s.slice(0, 120) || 'imagem';
  }

  /* ---------- leitura segura do arquivo ---------- */

  function sniff(head) {
    if (!head || head.length < 12) return null;
    if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4E && head[3] === 0x47 &&
        head[4] === 0x0D && head[5] === 0x0A && head[6] === 0x1A && head[7] === 0x0A) {
      return { mime: 'image/png', type: 'png', ext: 'png' };
    }
    if (head[0] === 0xFF && head[1] === 0xD8 && head[2] === 0xFF) {
      return { mime: 'image/jpeg', type: 'jpeg', ext: 'jpg' };
    }
    if (head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x46 &&
        head[8] === 0x57 && head[9] === 0x45 && head[10] === 0x42 && head[11] === 0x50) {
      return { mime: 'image/webp', type: 'webp', ext: 'webp' };
    }
    return null;
  }

  function uint24le(b, o) {
    return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)) >>> 0;
  }

  function preflightSize(kind, b) {
    try {
      if (kind.type === 'png' && b.length >= 24) {
        return {
          width: ((b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19]) >>> 0,
          height: ((b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23]) >>> 0
        };
      }
      if (kind.type === 'jpeg') {
        var i = 2;
        var sof = { 0xC0: 1, 0xC1: 1, 0xC2: 1, 0xC3: 1, 0xC5: 1, 0xC6: 1, 0xC7: 1,
          0xC9: 1, 0xCA: 1, 0xCB: 1, 0xCD: 1, 0xCE: 1, 0xCF: 1 };
        while (i + 9 < b.length) {
          if (b[i] !== 0xFF) { i++; continue; }
          var marker = b[i + 1];
          if (marker === 0xD8 || marker === 0xD9 || (marker >= 0xD0 && marker <= 0xD7)) { i += 2; continue; }
          var len = (b[i + 2] << 8) | b[i + 3];
          if (len < 2) return null;
          if (sof[marker]) {
            return { height: (b[i + 5] << 8) | b[i + 6], width: (b[i + 7] << 8) | b[i + 8] };
          }
          i += 2 + len;
        }
        return null;
      }
      if (kind.type === 'webp' && b.length >= 30) {
        var fourcc = String.fromCharCode(b[12], b[13], b[14], b[15]);
        if (fourcc === 'VP8X') {
          return { width: uint24le(b, 24) + 1, height: uint24le(b, 27) + 1 };
        }
        if (fourcc === 'VP8 ') {
          return {
            width: (b[26] | (b[27] << 8)) & 0x3FFF,
            height: (b[28] | (b[29] << 8)) & 0x3FFF
          };
        }
        if (fourcc === 'VP8L') {
          var bits = (b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24)) >>> 0;
          return { width: (bits & 0x3FFF) + 1, height: ((bits >>> 14) & 0x3FFF) + 1 };
        }
      }
    } catch (e) { /* metadados opcionais */ }
    return null;
  }

  function loadBitmap(file) {
    if (typeof createImageBitmap === 'function') {
      var opts = { imageOrientation: 'from-image', premultiplyAlpha: 'default' };
      return createImageBitmap(file, opts).catch(function () {
        return createImageBitmap(file);
      }).catch(function () {
        return loadImageElement(file);
      });
    }
    return loadImageElement(file);
  }

  function loadImageElement(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(codeError('decode', 'não foi possível decodificar a imagem'));
      };
      img.src = url;
    });
  }

  function disposeSource(source) {
    try { if (source && typeof source.close === 'function') source.close(); } catch (e) { /* ignora */ }
  }

  function sourceSize(source) {
    return {
      width: Math.round(source.width || source.naturalWidth || 0),
      height: Math.round(source.height || source.naturalHeight || 0)
    };
  }

  function drawScaled(source, maxSide) {
    var size = sourceSize(source);
    var scale = Math.min(1, maxSide / Math.max(size.width, size.height));
    var w = Math.max(1, Math.round(size.width * scale));
    var h = Math.max(1, Math.round(size.height * scale));
    var c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    var ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, w, h);
    return c;
  }

  function inspect(file) {
    if (!file || typeof file.size !== 'number') {
      return Promise.reject(codeError('missing', 'selecione um arquivo de imagem'));
    }
    if (!file.size) return Promise.reject(codeError('empty', 'arquivo vazio'));
    if (file.size > MAX_BYTES) {
      return Promise.reject(codeError('size', 'imagem maior que ' + formatBytes(MAX_BYTES) +
        ' (' + formatBytes(file.size) + ')'));
    }
    return file.slice(0, Math.min(file.size, HEAD_BYTES)).arrayBuffer().then(function (headBuf) {
      var kind = sniff(new Uint8Array(headBuf));
      if (!kind) return Promise.reject(codeError('format', 'formato inválido — use PNG, JPG, JPEG ou WEBP'));
      var pre = preflightSize(kind, new Uint8Array(headBuf));
      if (pre && pre.width && pre.height) {
        if (pre.width > MAX_SIDE || pre.height > MAX_SIDE ||
            pre.width * pre.height > MAX_PIXELS) {
          return Promise.reject(codeError('dimensions',
            'imagem grande demais (' + pre.width + '×' + pre.height + '); máximo ' +
            MAX_SIDE + ' px por lado e ' + (MAX_PIXELS / 1000000) + ' MP'));
        }
      }
      return loadBitmap(file).then(function (source) {
        var size = sourceSize(source);
        if (!size.width || !size.height) throw codeError('decode', 'imagem sem dimensões válidas');
        if (size.width > MAX_SIDE || size.height > MAX_SIDE ||
            size.width * size.height > MAX_PIXELS) {
          throw codeError('dimensions', 'imagem grande demais (' + size.width + '×' + size.height + ')');
        }
        if (pre && pre.width && pre.height &&
            Math.abs(pre.width - size.width) > 1 && Math.abs(pre.height - size.height) > 1 &&
            Math.abs(pre.width - size.height) > 1 && Math.abs(pre.height - size.width) > 1) {
          throw codeError('decode', 'metadados e dimensões decodificadas não conferem');
        }
        var thumb = drawScaled(source, THUMB_MAX);
        var thumbUrl = '';
        try { thumbUrl = thumb.toDataURL('image/png'); } catch (e) { /* miniatura é opcional */ }
        thumb.width = thumb.height = 0;
        var meta = {
          name: safeName(file.name),
          mime: kind.mime,
          bytes: file.size,
          declaredType: String(file.type || ''),
          width: size.width,
          height: size.height
        };
        return analyzeSource(source, meta).then(function (report) {
          disposeSource(source);
          return {
            file: file,
            name: meta.name,
            mime: kind.mime,
            size: file.size,
            sizeLabel: formatBytes(file.size),
            width: meta.width,
            height: meta.height,
            thumbnail: thumbUrl,
            report: report,
            ready: true,
            analyzedAt: Date.now()
          };
        }).catch(function (e) {
          disposeSource(source);
          throw e;
        });
      });
    });
  }

  /* ---------- análise de pixels ---------- */

  function collectPalette(data, w, h, step, borderOnly) {
    var map = Object.create(null);
    var seen = 0;
    var x, y;
    for (y = 0; y < h; y += step) {
      for (x = 0; x < w; x += step) {
        if (borderOnly && x > w * 0.08 && x < w * 0.92 && y > h * 0.08 && y < h * 0.92) continue;
        var p = (y * w + x) * 4;
        if (data[p + 3] < 8) continue;
        var r = data[p], g = data[p + 1], b = data[p + 2];
        var key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
        var e = map[key];
        if (!e) { e = map[key] = { n: 0, r: 0, g: 0, b: 0 }; }
        e.n++; e.r += r; e.g += g; e.b += b;
        seen++;
      }
    }
    var list = [];
    var k;
    for (k in map) {
      var it = map[k];
      list.push({ n: it.n, r: it.r / it.n, g: it.g / it.n, b: it.b / it.n });
    }
    list.sort(function (a, b) { return b.n - a.n; });
    var merged = [];
    for (var i = 0; i < list.length; i++) {
      var src = list[i];
      var found = null;
      for (var j = 0; j < merged.length; j++) {
        if (colorDist(src, merged[j]) < 26) { found = merged[j]; break; }
      }
      if (found) {
        var total = found.n + src.n;
        found.r = (found.r * found.n + src.r * src.n) / total;
        found.g = (found.g * found.n + src.g * src.n) / total;
        found.b = (found.b * found.n + src.b * src.n) / total;
        found.n = total;
      } else {
        merged.push({ n: src.n, r: src.r, g: src.g, b: src.b });
      }
    }
    merged.sort(function (a, b) { return b.n - a.n; });
    var out = [];
    for (var m = 0; m < merged.length && m < 8; m++) {
      var c = merged[m];
      out.push({ hex: hex(c.r, c.g, c.b), pct: round(c.n / Math.max(1, seen) * 100, 1) });
    }
    return { list: out, seen: seen, dominant: out[0] || { hex: '#000000', pct: 0 } };
  }

  function luminance(data, p) {
    return (0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2]) / 255;
  }

  function analyzeBrightness(data, w, h) {
    var sum = 0, sum2 = 0, sat = 0, n = 0;
    for (var y = 0; y < h; y += 2) {
      for (var x = 0; x < w; x += 2) {
        var p = (y * w + x) * 4;
        if (data[p + 3] < 8) continue;
        var l = luminance(data, p);
        sum += l; sum2 += l * l;
        var mx = Math.max(data[p], data[p + 1], data[p + 2]);
        var mn = Math.min(data[p], data[p + 1], data[p + 2]);
        sat += (mx - mn) / 255;
        n++;
      }
    }
    if (!n) return { mean: 0, contrast: 0, colorfulness: 0, label: 'unknown' };
    var mean = sum / n;
    var contrast = Math.sqrt(Math.max(0, sum2 / n - mean * mean));
    var label = mean < 0.18 ? 'very dark' : mean < 0.38 ? 'dark' :
      mean < 0.68 ? 'balanced' : mean < 0.85 ? 'bright' : 'very bright';
    return {
      mean: round(mean, 3),
      contrast: round(contrast, 3),
      colorfulness: round(sat / n, 3),
      label: label
    };
  }

  function edgeAnalysis(canvas) {
    var w = canvas.width, h = canvas.height;
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    var d = ctx.getImageData(0, 0, w, h).data;
    var gray = new Float32Array(w * h);
    for (var i = 0, p = 0; i < gray.length; i++, p += 4) {
      gray[i] = (0.2126 * d[p] + 0.7152 * d[p + 1] + 0.0722 * d[p + 2]) / 255;
    }
    var mask = new Uint8Array(w * h);
    var row = new Uint32Array(h);
    var col = new Uint32Array(w);
    var vertical = 0, horizontal = 0, diagonal = 0, edges = 0;
    for (var y = 1; y < h - 1; y++) {
      for (var x = 1; x < w - 1; x++) {
        var at = y * w + x;
        var gx = -gray[at - w - 1] - 2 * gray[at - 1] - gray[at + w - 1] +
          gray[at - w + 1] + 2 * gray[at + 1] + gray[at + w + 1];
        var gy = -gray[at - w - 1] - 2 * gray[at - w] - gray[at - w + 1] +
          gray[at + w - 1] + 2 * gray[at + w] + gray[at + w + 1];
        if (Math.sqrt(gx * gx + gy * gy) >= 0.24) {
          mask[at] = 1;
          row[y]++; col[x]++; edges++;
          if (Math.abs(gx) > Math.abs(gy) * 1.35) vertical++;
          else if (Math.abs(gy) > Math.abs(gx) * 1.35) horizontal++;
          else diagonal++;
        }
      }
    }
    function peaks(arr, limitIn, total) {
      var out = [];
      for (var k = 1; k < arr.length - 1; k++) {
        if (arr[k] < total * 0.5 || arr[k] < arr[k - 1] || arr[k] < arr[k + 1]) continue;
        out.push(round(k / (arr.length - 1), 3));
        if (out.length >= limitIn) break;
      }
      return out;
    }
    return {
      mask: mask,
      width: w,
      height: h,
      density: round(edges / Math.max(1, (w - 2) * (h - 2)), 3),
      orientation: {
        vertical: vertical,
        horizontal: horizontal,
        diagonal: diagonal
      },
      horizontalLines: peaks(row, 8, w),
      verticalLines: peaks(col, 8, h)
    };
  }

  function components(mask, w, h, opts) {
    opts = opts || {};
    var minArea = Math.max(2, Math.floor(w * h * (opts.minAreaPct == null ? 0.0015 : opts.minAreaPct)));
    var max = opts.max || 10;
    var seen = new Uint8Array(w * h);
    var out = [];
    var dirs = [1, -1, w, -w];
    for (var i = 0; i < mask.length; i++) {
      if (!mask[i] || seen[i]) continue;
      var stack = [i];
      seen[i] = 1;
      var count = 0;
      var minX = w, minY = h, maxX = 0, maxY = 0;
      var sr = 0, sg = 0, sb = 0;
      while (stack.length) {
        var at = stack.pop();
        var x = at % w, y = (at / w) | 0;
        count++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if (opts.pixels) {
          var pp = at * 4;
          sr += opts.pixels[pp]; sg += opts.pixels[pp + 1]; sb += opts.pixels[pp + 2];
        }
        for (var d = 0; d < 4; d++) {
          var nb = at + dirs[d];
          if (nb < 0 || nb >= mask.length) continue;
          if (d < 2 && (Math.floor(nb / w) !== y)) continue;
          if (mask[nb] && !seen[nb]) { seen[nb] = 1; stack.push(nb); }
        }
      }
      if (count < minArea) continue;
      var bw = maxX - minX + 1, bh = maxY - minY + 1;
      var areaPct = count / (w * h) * 100;
      if (areaPct > (opts.maxAreaPct == null ? 96 : opts.maxAreaPct)) continue;
      var item = {
        box: { x: round(minX / w, 3), y: round(minY / h, 3),
          w: round(bw / w, 3), h: round(bh / h, 3) },
        areaPct: round(areaPct, 1),
        aspect: round(bw / Math.max(1, bh), 2)
      };
      if (opts.pixels && count) item.color = hex(sr / count, sg / count, sb / count);
      out.push({ item: item, count: count });
    }
    out.sort(function (a, b) { return b.count - a.count; });
    return out.slice(0, max).map(function (e) { return e.item; });
  }

  function gridReport(data, ew, eh, edge) {
    var cells = [];
    for (var gy = 0; gy < 3; gy++) {
      for (var gx = 0; gx < 3; gx++) {
        var x0 = Math.floor(ew * gx / 3), x1 = Math.floor(ew * (gx + 1) / 3);
        var y0 = Math.floor(eh * gy / 3), y1 = Math.floor(eh * (gy + 1) / 3);
        var sr = 0, sg = 0, sb = 0, lum = 0, n = 0;
        for (var y = y0; y < y1; y += 2) {
          for (var x = x0; x < x1; x += 2) {
            var p = (y * ew + x) * 4;
            if (data[p + 3] < 8) continue;
            sr += data[p]; sg += data[p + 1]; sb += data[p + 2];
            lum += luminance(data, p);
            n++;
          }
        }
        var ec = 0, en = 0;
        if (edge) {
          var ex0 = Math.floor(edge.width * gx / 3), ex1 = Math.floor(edge.width * (gx + 1) / 3);
          var ey0 = Math.floor(edge.height * gy / 3), ey1 = Math.floor(edge.height * (gy + 1) / 3);
          for (var ey = ey0; ey < ey1; ey++) {
            for (var ex = ex0; ex < ex1; ex++) {
              en++;
              if (edge.mask[ey * edge.width + ex]) ec++;
            }
          }
        }
        cells.push({
          cell: { row: gy, col: gx },
          color: n ? hex(sr / n, sg / n, sb / n) : '#000000',
          lum: n ? round(lum / n, 3) : 0,
          edge: en ? round(ec / en, 3) : 0
        });
      }
    }
    return cells;
  }

  function symmetry(data, w, h) {
    var sum = 0, n = 0;
    for (var y = 0; y < h; y += 4) {
      for (var x = 0; x < Math.floor(w / 2); x += 4) {
        var a = (y * w + x) * 4;
        var b = (y * w + (w - 1 - x)) * 4;
        if (data[a + 3] < 8 || data[b + 3] < 8) continue;
        sum += colorDist(
          { r: data[a], g: data[a + 1], b: data[a + 2] },
          { r: data[b], g: data[b + 1], b: data[b + 2] }
        ) / 441.7;
        n++;
      }
    }
    return n ? round(1 - sum / n, 3) : 0;
  }

  function detectText(canvas) {
    var out = { available: false, engine: 'none', items: [], note: 'OCR não disponível neste navegador.' };
    if (typeof window.TextDetector !== 'function') return Promise.resolve(out);
    var detector;
    try { detector = new window.TextDetector(); } catch (e) { return Promise.resolve(out); }
    if (!detector || typeof detector.detect !== 'function') return Promise.resolve(out);
    return Promise.resolve(detector.detect(canvas)).then(function (items) {
      out.available = true;
      out.engine = 'TextDetector (nativo)';
      out.note = '';
      out.items = (items || []).slice(0, 20).map(function (it) {
        var b = it.boundingBox || {};
        return {
          text: String(it.rawValue || '').replace(/\s+/g, ' ').slice(0, 120),
          box: {
            x: round((b.x || 0) / Math.max(1, canvas.width), 3),
            y: round((b.y || 0) / Math.max(1, canvas.height), 3),
            w: round((b.width || 0) / Math.max(1, canvas.width), 3),
            h: round((b.height || 0) / Math.max(1, canvas.height), 3)
          }
        };
      }).filter(function (it) { return it.text; });
      return out;
    }).catch(function () { return out; });
  }

  function analyzeSource(source, meta) {
    var size = sourceSize(source);
    var sample = drawScaled(source, SAMPLE_MAX);
    var edgeCanvas = drawScaled(source, EDGE_MAX);
    var segCanvas = drawScaled(source, SEG_MAX);
    var ctx = sample.getContext('2d', { willReadFrequently: true });
    var data = ctx.getImageData(0, 0, sample.width, sample.height).data;
    var palette = collectPalette(data, sample.width, sample.height, 1, false);
    var border = collectPalette(data, sample.width, sample.height, 1, true);
    var borderDominant = border.dominant;
    var borderUnif = round(borderDominant.pct / 100, 3);
    var brightness = analyzeBrightness(data, sample.width, sample.height);
    var edge = edgeAnalysis(edgeCanvas);
    var segCtx = segCanvas.getContext('2d', { willReadFrequently: true });
    var segData = segCtx.getImageData(0, 0, segCanvas.width, segCanvas.height).data;
    var bgRgb = parseHex(borderDominant.hex);
    var fgMask = new Uint8Array(segCanvas.width * segCanvas.height);
    var fg = 0;
    for (var i = 0, p = 0; i < fgMask.length; i++, p += 4) {
      if (segData[p + 3] < 8) continue;
      var c = { r: segData[p], g: segData[p + 1], b: segData[p + 2] };
      if (colorDist(c, bgRgb) > 46) { fgMask[i] = 1; fg++; }
    }
    var edgeMask = new Uint8Array(edge.width * edge.height);
    for (var m = 0; m < edgeMask.length; m++) edgeMask[m] = edge.mask[m];
    var contours = components(edgeMask, edge.width, edge.height, { minAreaPct: 0.0008, max: 8 });
    var regions = components(fgMask, segCanvas.width, segCanvas.height, {
      minAreaPct: 0.002, max: 8, pixels: segData, maxAreaPct: 97
    });

    var midLum = 0, topLum = 0, botLum = 0, topN = 0, botN = 0;
    for (var yy = 0; yy < sample.height; yy += 2) {
      for (var xx = 0; xx < sample.width; xx += 2) {
        var pp = (yy * sample.width + xx) * 4;
        if (data[pp + 3] < 8) continue;
        var l = luminance(data, pp);
        if (yy < sample.height / 3) { topLum += l; topN++; }
        else if (yy > sample.height * 2 / 3) { botLum += l; botN++; }
      }
    }
    topLum = topN ? topLum / topN : 0;
    botLum = botN ? botLum / botN : 0;
    var bgType = borderUnif > 0.55 ? 'flat' : (Math.abs(topLum - botLum) > 0.12 ? 'vertical-gradient' : 'complex');
    var orientation = size.width > size.height * 1.05 ? 'landscape' :
      size.height > size.width * 1.05 ? 'portrait' : 'square';
    var dominantOrientation = edge.orientation.horizontal > edge.orientation.vertical * 1.35 ? 'horizontal' :
      edge.orientation.vertical > edge.orientation.horizontal * 1.35 ? 'vertical' : 'mixed';

    var report = {
      version: 1,
      image: {
        name: meta.name,
        mime: meta.mime,
        bytes: meta.bytes,
        width: size.width,
        height: size.height,
        megapixels: round(size.width * size.height / 1000000, 2),
        aspect: round(size.width / Math.max(1, size.height), 3),
        orientation: orientation
      },
      palette: palette.list,
      brightness: brightness,
      background: {
        color: borderDominant.hex,
        uniformity: borderUnif,
        type: bgType,
        topLuminance: round(topLum, 3),
        bottomLuminance: round(botLum, 3)
      },
      layout: {
        orientation: orientation,
        edgeDensity: edge.density,
        dominantEdge: dominantOrientation,
        symmetry: symmetry(data, sample.width, sample.height),
        horizontalLines: edge.horizontalLines,
        verticalLines: edge.verticalLines,
        grid: gridReport(data, sample.width, sample.height, edge)
      },
      regions: regions,
      contours: contours,
      depth: { available: false, note: 'Profundidade não estimada: uma única imagem não separa objetos de forma confiável.' },
      text: { available: false, engine: 'none', items: [], note: 'OCR não disponível neste navegador.' },
      uncertainties: [
        'Análise de baixo nível: não identifica semanticamente personagens, objetos ou cenários.',
        'Cores são aproximadas por amostragem e podem variar com compressão e redimensionamento.',
        'Regiões e contornos são componentes de cor/borda, não objetos reconhecidos.',
        'Uma imagem isolada não revela lógica de jogo, animações, controles ou geometria 3D.'
      ]
    };
    if (bgType === 'complex') {
      report.uncertainties.push('Fundo não uniforme: a separação entre fundo e objetos tem confiança baixa.');
    }
    if (regions.length && borderUnif > 0.55 && fg / fgMask.length < 0.45) {
      report.depth = {
        available: true,
        estimate: 'camada de fundo relativamente uniforme com elementos em primeiro plano',
        confidence: 'low',
        note: 'Pista fraca de separação fundo/objeto; ordem e geometria 3D não são recuperáveis.'
      };
    }
    var gridColors = report.layout.grid.map(function (c) { return c.color; }).join(', ');
    report.summary = 'Imagem ' + size.width + '×' + size.height + ' (' + orientation + '), ' +
      brightness.label + ', fundo ' + bgType + ', paleta dominante ' + palette.list.slice(0, 3).map(function (c) { return c.hex; }).join(' / ') +
      '. Grade 3x3: ' + gridColors + '.';

    var canvasForText = sample;
    return detectText(canvasForText).then(function (text) {
      report.text = text;
      if (!text.available) {
        report.uncertainties.push('Textos visíveis não foram reconhecidos (OCR indisponível).');
      }
      sample.width = sample.height = 0;
      edgeCanvas.width = edgeCanvas.height = 0;
      segCanvas.width = segCanvas.height = 0;
      return report;
    }).catch(function () {
      sample.width = sample.height = 0;
      edgeCanvas.width = edgeCanvas.height = 0;
      segCanvas.width = segCanvas.height = 0;
      return report;
    });
  }

  /* Relatório mínimo quando a análise local falha: nunca inventa detalhes. */
  function fallbackReport(meta, error) {
    return {
      version: 1,
      image: {
        name: safeName(meta && meta.name),
        mime: meta && meta.mime ? meta.mime : 'unknown',
        bytes: meta && meta.bytes || 0,
        width: meta && meta.width || 0,
        height: meta && meta.height || 0,
        megapixels: meta && meta.width && meta.height ? round(meta.width * meta.height / 1000000, 2) : 0,
        aspect: meta && meta.width && meta.height ? round(meta.width / meta.height, 3) : 0,
        orientation: meta && meta.width && meta.height ? (meta.width > meta.height ? 'landscape' : 'portrait') : 'unknown'
      },
      palette: [],
      brightness: { mean: 0, contrast: 0, colorfulness: 0, label: 'unknown' },
      background: { color: '#000000', uniformity: 0, type: 'unknown' },
      layout: { orientation: 'unknown', edgeDensity: 0, dominantEdge: 'unknown', symmetry: 0,
        horizontalLines: [], verticalLines: [], grid: [] },
      regions: [],
      contours: [],
      depth: { available: false, note: 'Análise indisponível.' },
      text: { available: false, engine: 'none', items: [], note: 'Análise indisponível.' },
      analysisError: String(error && error.message ? error.message : error || 'falha na análise local'),
      uncertainties: ['A análise local falhou; não há descrição visual confiável. Não invente detalhes.'],
      summary: 'Análise local indisponível.'
    };
  }

  /* ---------- comparação de características ---------- */

  function compare(ref, cand) {
    var empty = {
      score: 1,
      issues: [],
      metrics: { palette: 0, grid: 0, brightness: 0, aspect: 0, edges: 0 }
    };
    if (!ref || !cand) return empty;
    var rImg = ref.image || {}, cImg = cand.image || {};
    var rPal = ref.palette || [], cPal = cand.palette || [];
    var paletteDist = 0, paletteWeight = 0;
    rPal.slice(0, 6).forEach(function (rp) {
      var rr = parseHex(rp.hex);
      var best = 441, bestHex = '';
      cPal.slice(0, 8).forEach(function (cp) {
        var d = colorDist(rr, parseHex(cp.hex));
        if (d < best) { best = d; bestHex = cp.hex; }
      });
      var w = (rp.pct || 1) / 100;
      paletteDist += (best / 441.7) * w;
      paletteWeight += w;
    });
    paletteDist = paletteWeight ? paletteDist / paletteWeight : 0;

    var rGrid = (ref.layout && ref.layout.grid) || [];
    var cGrid = (cand.layout && cand.layout.grid) || [];
    var gridDist = 0, gridN = 0;
    for (var i = 0; i < Math.min(rGrid.length, cGrid.length); i++) {
      var a = parseHex(rGrid[i].color), b = parseHex(cGrid[i].color);
      gridDist += colorDist(a, b) / 441.7;
      gridN++;
    }
    gridDist = gridN ? gridDist / gridN : 0;

    var rB = (ref.brightness && ref.brightness.mean) || 0;
    var cB = (cand.brightness && cand.brightness.mean) || 0;
    var brightDist = Math.abs(rB - cB);
    var rAspect = rImg.aspect || 1;
    var cAspect = cImg.aspect || 1;
    var aspectDist = Math.min(1, Math.abs(rAspect - cAspect) / Math.max(1, rAspect));
    var rEdge = (ref.layout && ref.layout.edgeDensity) || 0;
    var cEdge = (cand.layout && cand.layout.edgeDensity) || 0;
    var edgeDist = Math.min(1, Math.abs(rEdge - cEdge) / Math.max(0.01, rEdge, cEdge));

    var score = clamp(
      paletteDist * 0.30 + gridDist * 0.30 + brightDist * 0.18 +
      aspectDist * 0.10 + edgeDist * 0.12, 0, 1
    );
    var issues = [];
    if (rB - cB > 0.12) issues.push('A referência é mais clara que o render (luminância média ' + round(rB, 2) + ' vs ' + round(cB, 2) + ').');
    else if (cB - rB > 0.12) issues.push('O render está mais claro que a referência (luminância média ' + round(cB, 2) + ' vs ' + round(rB, 2) + ').');
    if (paletteDist > 0.18) {
      issues.push('A paleta do render difere da referência: referência ' + (rPal[0] && rPal[0].hex || '?') +
        ', render ' + (cPal[0] && cPal[0].hex || '?') + '.');
    }
    if (gridDist > 0.16) {
      var worst = 0, wi = 0;
      for (var g = 0; g < Math.min(rGrid.length, cGrid.length); g++) {
        var d2 = colorDist(parseHex(rGrid[g].color), parseHex(cGrid[g].color)) / 441.7;
        if (d2 > worst) { worst = d2; wi = g; }
      }
      if (rGrid[wi] && cGrid[wi]) {
        issues.push('A maior diferença de composição está na célula ' + (rGrid[wi].cell.row + 1) + ',' +
          (rGrid[wi].cell.col + 1) + ' (referência ' + rGrid[wi].color + ', render ' + cGrid[wi].color + ').');
      }
    }
    if (aspectDist > 0.08) issues.push('A proporção da imagem difere da referência (' + round(rAspect, 2) + ':1 vs ' + round(cAspect, 2) + ':1).');
    if (edgeDist > 0.35) issues.push('A densidade de detalhes/bordas difere bastante da referência.');
    if (ref.summary) issues.push('Resumo da referência: ' + ref.summary);

    return {
      score: round(score, 3),
      issues: issues,
      metrics: {
        palette: round(paletteDist, 3),
        grid: round(gridDist, 3),
        brightness: round(brightDist, 3),
        aspect: round(aspectDist, 3),
        edges: round(edgeDist, 3)
      }
    };
  }

  function dataUrl(file, mime) {
    var safeMime = /^image\/(png|jpeg|webp)$/i.test(String(mime || '')) ? String(mime).toLowerCase() : '';
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () {
        var url = String(fr.result || '');
        /* O tipo declarado pelo arquivo pode vir vazio; o mime vem dos magic bytes. */
        if (safeMime && url.indexOf('data:') === 0) {
          var comma = url.indexOf(',');
          if (comma > 0) url = 'data:' + safeMime + ';base64,' + url.slice(comma + 1);
        }
        resolve(url);
      };
      fr.onerror = function () { reject(codeError('read', 'falha ao ler a imagem')); };
      fr.readAsDataURL(file);
    });
  }

  /* ---------- imagem como asset do jogo atual ---------- */

  var TEXTURE_WORDS = /\b(?:textura|texture|material|pattern|padrao|mosaico|tile|tiles|estampa|skin)\b/;
  var TEXTURE_TARGETS = /\b(?:cubo|cube|peca|pecas|piece|pieces|bloco|blocos|block|blocks|objeto|objetos|object|objects|modelo|modelos|model|character|personagem|personagens|parede|paredes|wall|walls|chao|floor|plataforma|plataformas|platform|nave|ship|carro|car|bola|ball|tabuleiro|board|dado|dice|inimigo|inimigos|enemy|alvo|target|sprite|sprites)\b/;

  function normalizeCommand(command) {
    return String(command == null ? '' : command).toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  /* Sem texto (ou sem pedido de textura/alvo) → fundo. Pedido de textura ou
     um componente nomeado → textura daquele componente. */
  function usageMode(command) {
    var text = normalizeCommand(command);
    if (!text.trim()) return 'background';
    return TEXTURE_WORDS.test(text) || TEXTURE_TARGETS.test(text) ? 'texture' : 'background';
  }

  function imageSummary(asset) {
    var report = asset && asset.report ? asset.report : null;
    var w = Number(asset && asset.width) || 0;
    var h = Number(asset && asset.height) || 0;
    var out = [];
    if (w && h) out.push(w + '×' + h + ' px');
    if (report && report.image && report.image.aspect) out.push('aspect ' + report.image.aspect + ':1');
    if (report && report.palette && report.palette.length) {
      out.push('palette ' + report.palette.slice(0, 4).map(function (c) { return c.hex; }).join(' / '));
    }
    return out.join(', ');
  }

  /* Bloco do prompt que transforma a referência em asset visível DENTRO do
     jogo atual (nunca em uma recriação da imagem). */
  function usageBlock(asset, opts) {
    opts = opts || {};
    var path = String(opts.path || '').trim();
    if (!path) return '';
    var mode = opts.mode === 'texture' ? 'texture' : 'background';
    var summary = imageSummary(asset);
    var out = 'REFERENCE IMAGE — APPLY IT INSIDE THE CURRENT GAME\n\n';
    if (opts.vision === true) {
      out += 'The original image is attached to this message. ';
    }
    out += 'The image is a real file at this exact path: ' + path + '\n';
    out += 'This is the only absolute path you may use; use it exactly as written (never prefix it with anything else).\n';
    if (summary) out += 'Image: ' + summary + '.\n';
    out += '\n';
    out += 'PURPOSE: improve the EXISTING game by making this image visible in it. ' +
      'Do NOT recreate the image as a new page, do NOT replace the game with a static picture, and do NOT remove or change ' +
      'the existing mechanics, controls, HUD or the fullscreen 15px layout rule. Apply the change by editing the current document ' +
      '(JSON edits per the edit directive, full document only as fallback).\n\n';
    out += 'HOW TO USE THE IMAGE — ' + (mode === 'texture' ? 'TEXTURE MODE' : 'BACKGROUND MODE') + ':\n';
    if (mode === 'background') {
      out += '- Apply the image as the game BACKGROUND, behind the gameplay, HUD and controls.\n';
      out += '- 2D: draw it with ctx.drawImage() before the gameplay every frame using cover fit, or use a fixed CSS layer ' +
        'with background: url("' + path + '") center/cover no-repeat; that layer must have pointer-events: none and z-index below the game/HUD.\n';
      out += '- 3D: use scene.background = new THREE.TextureLoader().load("' + path + '"); (or a large plane behind the action) ' +
        'and set texture.colorSpace = THREE.SRGBColorSpace. Keep the existing objects, lighting and controls.\n';
      out += '- The background must never cover or hide the gameplay; if the image is busy, keep the gameplay readable.\n';
    } else {
      out += '- Apply the image as the TEXTURE of the object/component named by the user (e.g. cube, Tetris piece, character, platform, wall). ' +
        'If no object is clearly named, apply it to the main controllable object/terrain — NEVER to the background by mistake.\n';
      out += '- 2D: load the image with new Image(); set img.crossOrigin = "anonymous"; then use ctx.createPattern(img, "repeat") ' +
        'to fill the shape, or drawImage() clipped to the object outline.\n';
      out += '- 3D: const tex = new THREE.TextureLoader().load("' + path + '"); tex.colorSpace = THREE.SRGBColorSpace; ' +
        'then set the target mesh material.map = tex and material.needsUpdate = true. Keep geometry, physics and controls unchanged.\n';
      out += '- The texture must be visibly mapped onto the named component; it must not replace the whole scene background.\n';
    }
    out += '- The exact path above must remain in the final document. Never inline base64/data URIs, never use blob: or file:.\n';
    out += '- If the document already displays the game, keep all existing gameplay code and add only what this image needs.\n';
    return out;
  }

  function approxBytes(dataUrl) {
    var value = String(dataUrl || '');
    var comma = value.indexOf(',');
    var b64 = comma >= 0 ? value.slice(comma + 1) : '';
    var padding = b64.slice(-2) === '==' ? 2 : (b64.slice(-1) === '=' ? 1 : 0);
    return Math.floor(b64.length * 3 / 4) - padding;
  }

  function canvasDataUrl(canvas, mime, quality) {
    return new Promise(function (resolve, reject) {
      if (typeof canvas.toBlob !== 'function') {
        try { resolve(canvas.toDataURL(mime, quality)); }
        catch (e) { reject(codeError('encode', 'falha ao recodificar a imagem')); }
        return;
      }
      canvas.toBlob(function (blob) {
        if (!blob) return reject(codeError('encode', 'falha ao recodificar a imagem'));
        var fr = new FileReader();
        fr.onload = function () { resolve(String(fr.result || '')); };
        fr.onerror = function () { reject(codeError('encode', 'falha ao ler a imagem recodificada')); };
        fr.readAsDataURL(blob);
      }, mime, quality);
    });
  }

  /* Data URL pronta para o upload local. Imagens acima de 6 MB são
     recodificadas (o limite do save é 6 MB por asset). */
  function assetForGame(asset) {
    if (!asset || !asset.file) {
      return Promise.reject(codeError('missing', 'imagem indisponível para o jogo'));
    }
    if ((Number(asset.size) || 0) <= GAME_ASSET_MAX_BYTES) {
      return dataUrl(asset.file, asset.mime);
    }
    var mime = asset.mime === 'image/jpeg' ? 'image/jpeg' : 'image/webp';
    return loadBitmap(asset.file).then(function (source) {
      var sizes = [4096, 2560, 1600];
      var qualities = [0.92, 0.85, 0.75];
      var pending = Promise.resolve(null);
      sizes.forEach(function (maxSide) {
        qualities.forEach(function (quality) {
          pending = pending.then(function (found) {
            if (found) return found;
            var canvas = drawScaled(source, maxSide);
            return canvasDataUrl(canvas, mime, quality).then(function (url) {
              canvas.width = canvas.height = 0;
              return approxBytes(url) <= GAME_ASSET_MAX_BYTES ? url : null;
            });
          });
        });
      });
      return pending.then(function (found) {
        disposeSource(source);
        if (!found) {
          throw codeError('size',
            'imagem grande demais para usar no jogo (máximo ' + formatBytes(GAME_ASSET_MAX_BYTES) + ' após otimização)');
        }
        return found;
      }).catch(function (error) {
        disposeSource(source);
        throw error;
      });
    });
  }

  /* ---------- prompt ---------- */

  function referenceBlock(asset, opts) {
    opts = opts || {};
    var report = asset && asset.report ? asset.report : fallbackReport(asset, 'sem análise');
    var vision = opts.vision === true;
    var followup = opts.followup === true;
    var out = 'REFERÊNCIA VISUAL ANEXADA\n\n';
    out += 'O usuário anexou uma imagem para recriar. ';
    if (vision) {
      out += 'A imagem original está anexada a esta mensagem e é a fonte primária de fidelidade; ' +
        'observe-a diretamente. O relatório técnico abaixo é apenas apoio e pode estar incompleto. ';
    } else if (followup) {
      out += 'Esta é uma continuação: a imagem não é reenviada. Use o relatório técnico abaixo e o documento atual; ' +
        'não invente detalhes que não estejam neles. ';
    } else {
      out += 'Você NÃO tem acesso aos pixels da imagem. Use apenas o relatório técnico abaixo; ' +
        'não finja ver detalhes que não estão nele. ';
    }
    out += 'O relatório é uma análise local aproximada de baixo nível, não uma descrição semântica completa.\n\n';
    out += 'Relatório técnico (JSON):\n```json\n' + JSON.stringify(report) + '\n```\n\n';
    out += 'REGRAS DA RECRIAÇÃO VISUAL:\n';
    out += '- O comando do usuário tem prioridade; use a referência como direção visual.\n';
    out += '- Reproduza a composição, a paleta, as proporções e as posições relativas com a maior fidelidade viável.\n';
    out += '- Reconstrua os elementos com HTML/CSS/Canvas, Three.js ou outra biblioteca já disponível. ' +
      'Não adicione dependências desnecessárias.\n';
    out += '- Produza uma experiência INTERATIVA (jogo), não uma imagem estática; implemente controles e mecânicas coerentes.\n';
    out += '- Quando a imagem não revelar um detalhe, faça uma aproximação funcional e marque a incerteza; nunca afirme que o resultado é idêntico.\n';
    out += '- Use assets locais existentes quando forem adequados; caso contrário, gere tudo proceduralmente.\n';
    out += '- Respeite o formato de saída da diretiva: SOMENTE HTML cru, documento completo.\n';
    return out;
  }

  window.NxImage = {
    VERSION: '1.1.0',
    MAX_BYTES: MAX_BYTES,
    MAX_PIXELS: MAX_PIXELS,
    MAX_SIDE: MAX_SIDE,
    GAME_ASSET_MAX_BYTES: GAME_ASSET_MAX_BYTES,
    DEFAULT_COMMAND: DEFAULT_COMMAND,
    DEFAULT_GAME_IMAGE_COMMAND: DEFAULT_GAME_IMAGE_COMMAND,
    inspect: inspect,
    analyzeSource: analyzeSource,
    compare: compare,
    dataUrl: dataUrl,
    referenceBlock: referenceBlock,
    usageMode: usageMode,
    usageBlock: usageBlock,
    assetForGame: assetForGame,
    fallbackReport: fallbackReport,
    formatBytes: formatBytes,
    sniff: sniff
  };
})();

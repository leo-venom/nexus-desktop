/* ============================================================
 * ai-client.js — port de AiClient.kt para o navegador.
 * API estilo OpenAI via fetch: streaming SSE (progresso em bytes
 * decodificados de delta.content) + fallback não-streaming em
 * HTTP 4xx. Timeouts por fase (conexão/leitura ociosa).
 * ============================================================ */
(function () {
  'use strict';

  var CONNECT_TIMEOUT_MS = 20000;
  var CHAT_READ_TIMEOUT_MS = 600000;
  var MODELS_READ_TIMEOUT_MS = 60000;

  /* Erro de comunicação/parse com a API compatível OpenAI. */
  function AiException(message) {
    this.name = 'AiException';
    this.message = String(message);
    if (Error.captureStackTrace) Error.captureStackTrace(this, AiException);
    else this.stack = (new Error(this.message)).stack;
  }
  AiException.prototype = Object.create(Error.prototype);
  AiException.prototype.constructor = AiException;

  var _encoder = (typeof TextEncoder !== 'undefined') ? new TextEncoder() : null;

  /* Tamanho em bytes UTF-8 (igual ao toByteArray(UTF_8).size do Kotlin). */
  function byteLen(s) {
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

  /* base + "/v1"; aceita endpoint já com /v1, /models ou /chat/completions. */
  function buildUrl(endpoint, suffix) {
    var base = String(endpoint == null ? '' : endpoint).trim();
    if (!base) base = (window.Prefs && window.Prefs.DEFAULT_ENDPOINT) || 'https://api.openai.com/v1';
    if (base.slice(-17) === '/chat/completions') base = base.slice(0, -17);
    else if (base.slice(-7) === '/models') base = base.slice(0, -7);
    else if (base.slice(-3) !== '/v1') base = base.replace(/\/+$/, '') + '/v1';
    return base.replace(/\/+$/, '') + '/' + suffix;
  }

  function chatUrl(endpoint) { return buildUrl(endpoint, 'chat/completions'); }
  function modelsUrl(endpoint) { return buildUrl(endpoint, 'models'); }

  function timeoutError(phase) {
    return new AiException(phase === 'connect' ? 'timeout de conexão' : 'timeout de leitura');
  }

  /* Erro de rede/CORS: fetch rejeitou com TypeError (não é AiException). */
  function isNetworkFailure(e) {
    return !(e instanceof AiException);
  }

  function isMissingProxy(e) {
    return e instanceof AiException && /^HTTP (404|501)/.test(e.message);
  }

  /* URL do proxy local (serve.py), relativa à página (funciona em subpasta). */
  function proxyUrl(url) {
    if (typeof location === 'undefined') return null;
    if (location.protocol !== 'http:' && location.protocol !== 'https:') return null;
    var base = (typeof document !== 'undefined' && document.baseURI) || location.href;
    return new URL('_proxy?url=' + encodeURIComponent(url), base).href;
  }

  /* Usa o proxy local quando existir; senão cai no fetch direto (CORS). */
  function withProxyFallback(url, attempt) {
    var proxied = proxyUrl(url);
    if (!proxied) {
      return attempt(url).catch(function (e) {
        if (isNetworkFailure(e)) {
          throw new AiException('file:// bloqueia chamadas à API (CORS) — abra pelo atalho NEXUS GAME (abrir.sh)');
        }
        throw e;
      });
    }
    return attempt(proxied).catch(function (e) {
      if (isMissingProxy(e) || isNetworkFailure(e)) {
        return attempt(url).catch(function (e2) {
          if (isNetworkFailure(e2)) {
            throw new AiException('falha de rede/CORS — rode "python3 serve.py" (proxy local)');
          }
          throw e2;
        });
      }
      throw e;
    });
  }

  /* Valida o texto lido e devolve-o; erros HTTP/vazio viram AiException. */
  function checkText(r) {
    if (!r.ok) {
      throw new AiException('HTTP ' + r.status + ': ' + (r.text.trim() ? r.text : 'sem detalhes'));
    }
    if (!r.text.trim()) throw new AiException('resposta vazia do servidor');
    return r.text;
  }

  /* Requisição simples (corpo inteiro), com timeout de conexão e de leitura. */
  function requestText(method, url, apiKey, body, connectMs, readMs) {
    var ctrl = new AbortController();
    var timedOut = false;
    var phase = 'connect';
    var timer = setTimeout(function () { timedOut = true; phase = 'connect'; ctrl.abort(); }, connectMs);

    function armRead() {
      clearTimeout(timer);
      phase = 'read';
      timer = setTimeout(function () { timedOut = true; phase = 'read'; ctrl.abort(); }, readMs);
    }

    var headers = { 'Authorization': 'Bearer ' + apiKey };
    var opts = { method: method, headers: headers, signal: ctrl.signal };
    if (method === 'POST') {
      headers['Content-Type'] = 'application/json; charset=utf-8';
      opts.body = body;
    }

    return fetch(url, opts).then(function (res) {
      armRead();
      return res.text().then(function (text) {
        clearTimeout(timer);
        return { status: res.status, ok: res.ok, text: text };
      });
    }).catch(function (e) {
      clearTimeout(timer);
      if (timedOut) throw timeoutError(phase);
      throw e;
    });
  }

  function postText(url, apiKey, body, readTimeoutMs) {
    return requestText('POST', url, apiKey, body, CONNECT_TIMEOUT_MS, readTimeoutMs).then(checkText);
  }

  /* POST em streaming: lê o corpo aos poucos e reporta bytes de delta.content. */
  function postStream(url, apiKey, body, readTimeoutMs, onProgress) {
    var ctrl = new AbortController();
    var timedOut = false;
    var phase = 'connect';
    var timer = setTimeout(function () { timedOut = true; phase = 'connect'; ctrl.abort(); }, CONNECT_TIMEOUT_MS);

    function armRead() {
      clearTimeout(timer);
      phase = 'read';
      timer = setTimeout(function () { timedOut = true; phase = 'read'; ctrl.abort(); }, readTimeoutMs);
    }

    return fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Authorization': 'Bearer ' + apiKey
      },
      body: body,
      signal: ctrl.signal
    }).then(function (res) {
      armRead();
      var status = res.status;
      var ok = res.ok;

      function finish(text, sawSse) {
        clearTimeout(timer);
        var t = checkText({ status: status, ok: ok, text: text });
        if (!sawSse && onProgress) onProgress(byteLen(t));
        return t;
      }

      /* Sem ReadableStream (navegador antigo): corpo inteiro de uma vez. */
      if (!res.body || typeof res.body.getReader !== 'function') {
        return res.text().then(function (text) { return finish(text, false); });
      }

      var reader = res.body.getReader();
      var dec = new TextDecoder('utf-8');
      var raw = '';
      var pending = '';
      var contentBytes = 0;
      var sawSse = false;
      var finishReason = '';

      function handleLine(line) {
        raw += line + '\n';
        var t = line.trim();
        if (t.indexOf('data:') !== 0) return;
        sawSse = true;
        var payload = t.substring(5).trim();
        if (!payload || payload === '[DONE]') return;
        var piece = deltaPiece(payload);
        if (piece) {
          contentBytes += byteLen(piece);
          if (onProgress) onProgress(contentBytes);
        }
        try {
          var pj = JSON.parse(payload);
          var ch0 = pj && pj.choices && pj.choices[0];
          if (ch0 && ch0.finish_reason) finishReason = String(ch0.finish_reason);
        } catch (e) {}
      }

      function pump() {
        return reader.read().then(function (r) {
          if (r.done) {
            var tail = dec.decode();
            if (tail) pending += tail;
            if (pending) handleLine(pending);
            pending = '';
            return finish(raw, sawSse);
          }
          armRead();
          pending += dec.decode(r.value, { stream: true });
          var idx;
          while ((idx = pending.indexOf('\n')) >= 0) {
            handleLine(pending.substring(0, idx));
            pending = pending.substring(idx + 1);
          }
          return pump();
        });
      }

      return pump();
    }).catch(function (e) {
      clearTimeout(timer);
      if (timedOut) throw timeoutError(phase);
      throw e;
    });
  }

  /* Extrai delta.content (ou message.content) de um payload SSE. */
  function deltaPiece(payload) {
    try {
      var obj = JSON.parse(payload);
      var choices = obj && obj.choices;
      if (!choices || !choices.length) return '';
      var c0 = choices[0] || {};
      var d = c0.delta;
      if (d && typeof d === 'object' && d.content != null) return String(d.content);
      var m = c0.message;
      if (m && typeof m === 'object' && m.content != null) return String(m.content);
      return '';
    } catch (e) {
      return '';
    }
  }

  /* optInt do org.json: mantém o valor anterior quando ausente/ inválido. */
  function optInt(o, key, fallback) {
    if (!o || typeof o !== 'object') return fallback;
    var v = o[key];
    if (v === undefined || v === null) return fallback;
    var n = Number(v);
    return isFinite(n) ? Math.trunc(n) : fallback;
  }

  /* Interpreta a resposta: streaming (SSE) com fallback p/ JSON simples. */
  function parseChat(raw) {
    var content = '';
    var prompt = 0;
    var completion = 0;
    var total = 0;
    var sawSse = false;
    var lines = String(raw == null ? '' : raw).split('\n');
    for (var i = 0; i < lines.length; i++) {
      var t = lines[i].trim();
      if (t.indexOf('data:') !== 0) continue;
      sawSse = true;
      var payload = t.substring(5).trim();
      if (!payload || payload === '[DONE]') continue;
      var obj;
      try { obj = JSON.parse(payload); } catch (e) { continue; }
      if (!obj || typeof obj !== 'object') continue;

      var u = obj.usage;
      if (u && typeof u === 'object') {
        prompt = optInt(u, 'prompt_tokens', prompt);
        completion = optInt(u, 'completion_tokens', completion);
        total = optInt(u, 'total_tokens', total);
      }

      var choices = obj.choices;
      if (!choices || !choices.length) continue;
      var c0 = choices[0] || {};
      var piece = '';
      if (c0.delta && typeof c0.delta === 'object' && c0.delta.content != null) {
        piece = String(c0.delta.content);
      } else if (c0.message && typeof c0.message === 'object' && c0.message.content != null) {
        piece = String(c0.message.content);
      }
      if (piece) content += piece;
    }
    if (!sawSse) return parseNonStream(raw);
    if (total <= 0) total = prompt + completion;
    if (!content.trim()) throw new AiException('resposta vazia do modelo');
    return { content: content, promptTokens: prompt, completionTokens: completion, totalTokens: total,
             finishReason: finishReason || '' };
  }

  /* Resposta não-streaming (um único JSON). */
  function parseNonStream(raw) {
    var response = JSON.parse(raw);
    var choices = response && response.choices;
    if (!choices || typeof choices.length !== 'number') {
      throw new AiException("resposta sem 'choices'");
    }
    if (choices.length === 0) throw new AiException('resposta sem escolhas');
    var msg = choices[0] && choices[0].message;
    if (!msg || typeof msg !== 'object') throw new AiException("resposta sem 'message'");
    var content = msg.content == null ? '' : String(msg.content);
    if (!content.trim()) throw new AiException('resposta vazia do modelo');
    var usage = response.usage;
    var prompt = optInt(usage, 'prompt_tokens', 0);
    var completion = optInt(usage, 'completion_tokens', 0);
    var total = optInt(usage, 'total_tokens', 0);
    if (total <= 0) total = prompt + completion;
    var fr = (choices[0] && choices[0].finish_reason) ? String(choices[0].finish_reason) : '';
    return { content: content, promptTokens: prompt, completionTokens: completion, totalTokens: total,
             finishReason: fr };
  }

  /* Envia system+user; devolve Promise<ChatResult>. */
  function chat(endpoint, apiKey, model, temperature, maxTokens, system, user, onProgress) {
    var messages = [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ];
    function body(stream) {
      var o = {
        model: model,
        temperature: Number(temperature),
        messages: messages
      };
      if (maxTokens > 0) o.max_tokens = maxTokens;
      if (stream) {
        o.stream = true;
        o.stream_options = { include_usage: true };
      }
      return JSON.stringify(o);
    }
    var url = chatUrl(endpoint);

    function attempt(target) {
      return postStream(target, apiKey, body(true), CHAT_READ_TIMEOUT_MS, onProgress)
        .then(function (raw) { return parseChat(raw); })
        .catch(function (e) {
          if (e && typeof e.message === 'string' && e.message.indexOf('HTTP 4') === 0) {
            return postText(target, apiKey, body(false), CHAT_READ_TIMEOUT_MS)
              .then(function (raw) { return parseChat(raw); });
          }
          throw e;
        });
    }

    return withProxyFallback(url, attempt);
  }

  /* Lista os ids de modelos disponíveis, ordenados. */
  function listModels(endpoint, apiKey) {
    var url = modelsUrl(endpoint);

    function attempt(target) {
      return requestText('GET', target, apiKey, null, CONNECT_TIMEOUT_MS, MODELS_READ_TIMEOUT_MS)
        .then(checkText)
        .then(function (text) {
          var response = JSON.parse(text);
          var data = response && response.data;
          if (!Array.isArray(data)) throw new AiException("resposta sem 'data'");
          var ids = [];
          for (var i = 0; i < data.length; i++) {
            var item = data[i];
            var id = item && item.id != null ? String(item.id) : '';
            if (id) ids.push(id);
          }
          ids.sort();
          return ids;
        });
    }

    return withProxyFallback(url, attempt);
  }

  /* Extrai a mensagem de erro mais útil possível de um erro/resposta falha. */
  function errorMessage(e) {
    var raw = (e && e.message != null ? String(e.message) : '').trim();
    if (!raw) return 'falha na requisição';
    var jsonPart = raw.indexOf('HTTP ') === 0
      ? (raw.indexOf(': ') >= 0 ? raw.substring(raw.indexOf(': ') + 2) : raw)
      : raw;
    try {
      var json = JSON.parse(jsonPart);
      var nested = json && json.error && json.error.message;
      if (nested != null && String(nested)) return String(nested);
      var direct = json && json.message;
      if (direct != null && String(direct)) return String(direct);
    } catch (e2) {
      /* não era JSON; usa o texto cru abaixo */
    }
    return raw.slice(0, 200);
  }

  window.AiClient = {
    VERSION: '2.5.1',
    CONNECT_TIMEOUT_MS: CONNECT_TIMEOUT_MS,
    CHAT_READ_TIMEOUT_MS: CHAT_READ_TIMEOUT_MS,
    MODELS_READ_TIMEOUT_MS: MODELS_READ_TIMEOUT_MS,
    AiException: AiException,
    buildUrl: buildUrl,
    chatUrl: chatUrl,
    modelsUrl: modelsUrl,
    chat: chat,
    listModels: listModels,
    errorMessage: errorMessage
  };
})();

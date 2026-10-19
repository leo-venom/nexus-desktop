/* ============================================================
 * app.js — port de MainActivity.kt para o navegador.
 * Fluxo: prompt -> AiClient.chat -> Html.extractDocument ->
 * decorate -> iframe (srcdoc). Sessão, salvar/abrir/excluir,
 * temas e bridge window.Nexus77 -> window.MxShell.
 * ============================================================ */
(function () {
  'use strict';

  var prefs = window.Prefs;
  var theme = window.Themes.of(prefs.themeIndex());
  var lastThemeIndex = prefs.themeIndex();

  var lastRendered = null;   // documento canônico (CSS com CDN, sem rewrite)
  var lastPrompt = null;
  var generating = false;
  var showingList = false;
  var editCount = 0;        // patches consecutivos na mesma página
  var MAX_EDITS = 5;        // força regeneração completa após N patches

  var liveActive = false;
  var liveIn = 0;
  var liveOut = 0;
  var lastProgressAt = 0;

  var APP_BASE = new URL('./', location.href).href;

  var frame, input, gearBtn, saveBtn, openBtn, statusEl, kbLabel;
  var dot, modelText, tfill, tlabel, resetBtn, vu;

  function $(id) { return document.getElementById(id); }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function toast(message) {
    if (window.Settings && window.Settings.toast) window.Settings.toast(message);
  }

  /* ---------- tema / sessão ---------- */

  function errorColor() {
    return theme.isDark ? '#FF5C5C' : '#D32F2F';
  }

  function applyTheme() {
    var s = document.documentElement.style;
    s.setProperty('--nx-bg', theme.background);
    s.setProperty('--nx-surface', theme.surface);
    s.setProperty('--nx-surface-alt', theme.surfaceAlt);
    s.setProperty('--nx-accent', theme.accent);
    s.setProperty('--nx-accent-soft', window.Themes.hexA(theme.accent, 140));
    s.setProperty('--nx-accent-faint', window.Themes.hexA(theme.accent, 20));
    s.setProperty('--nx-text', theme.text);
    s.setProperty('--nx-secondary', theme.secondary);
    s.setProperty('--nx-on-accent', theme.onAccent);
    s.setProperty('--mx-error', errorColor());
    if (vu) vu.setTheme(theme);
    updateSessionUi();
  }

  function formatTokens(n) {
    n = Math.trunc(Number(n) || 0);
    if (n < 1000) return String(n);
    if (n < 1000000) {
      return n % 1000 === 0 ? (n / 1000) + 'k' : (n / 1000).toFixed(1) + 'k';
    }
    return n % 1000000 === 0 ? (n / 1000000) + 'M' : (n / 1000000).toFixed(2) + 'M';
  }

  function updateSessionUi() {
    var keySet = prefs.hasKey();
    dot.style.background = keySet ? theme.accent : errorColor();
    modelText.textContent = keySet ? prefs.model() : 'sem API key';

    var extraIn = liveActive ? liveIn : 0;
    var extraOut = liveActive ? liveOut : 0;
    var inTok = prefs.sessionPromptTokens() + extraIn;
    var outTok = prefs.sessionCompletionTokens() + extraOut;
    var used = prefs.sessionTokens() + extraIn + extraOut;
    var budget = prefs.SESSION_TOKEN_BUDGET;

    tfill.style.width = (Math.min(used, budget) / budget * 100) + '%';
    tlabel.textContent = (liveActive ? '~' : '') +
      '↑' + formatTokens(inTok) + ' ↓' + formatTokens(outTok) +
      ' · ' + formatTokens(used) + '/' + formatTokens(budget);
  }

  function status(text, kind, end) {
    statusEl.textContent = text;
    statusEl.title = text;
    var cls = 'status';
    if (kind) cls += ' ' + kind;
    if (end) cls += ' end';
    statusEl.className = cls;
  }

  /* ---------- render ---------- */

  /* O iframe roda sem allow-same-origin (origem opaca): a ponte é postMessage. */
  var SHIM = '<script>(function(){' +
    'function call(n,a){try{window.parent.postMessage({__nx:1,m:n,a:a},"*")}catch(e){}}' +
    'window.Nexus77={' +
    'setInput:function(t){call("setInput",String(t==null?"":t))},' +
    'openSaved:function(n){call("openSaved",String(n))},' +
    'closeList:function(){call("closeList")},' +
    'pickFile:function(){call("pickFile")},' +
    'deleteSaved:function(n){call("deleteSaved",String(n))}' +
    '};' +
    'document.addEventListener("click",function(e){var t=e.target;var a=t&&t.closest?t.closest("a[href]"):null;if(!a)return;' +
    'var h=a.getAttribute("href")||"";if(!h||h.charAt(0)==="#"||h.indexOf("javascript:")===0)return;' +
    'e.preventDefault();call("openUrl",a.href||h)},true);' +
    '})();<\/script>';

  function injectShim(html) {
    var head = /<head[^>]*>/i.exec(html);
    if (head) {
      var at = head.index + head[0].length;
      return html.slice(0, at) + '\n' + SHIM + html.slice(at);
    }
    var tag = /<html[^>]*>/i.exec(html);
    if (tag) {
      var at2 = tag.index + tag[0].length;
      return html.slice(0, at2) + '\n' + SHIM + html.slice(at2);
    }
    return SHIM + html;
  }

  function render(html) {
    var out = window.Html.rewriteLibs(String(html == null ? '' : html), APP_BASE);
    frame.srcdoc = injectShim(out);
    /* Foca o iframe para teclado funcionar sem clique */
    setTimeout(function () {
      try { frame.contentWindow.focus(); } catch (e) { frame.focus(); }
    }, 50);
  }

  /* Decora com o tema atual; se a página já tem o bloco base, só troca. */
  function themed(html) {
    if (!html) return html;
    var marker = '<style id="nx77-base">';
    var idx = html.indexOf(marker);
    if (idx >= 0) {
      var end = html.indexOf('</style>', idx);
      if (end >= 0) {
        var replacement = '<style id="nx77-base">\n' + window.Html.varsCss(theme) +
          '\n' + window.Html.baseCss() + '\n</style>';
        return html.slice(0, idx) + replacement + html.slice(end + '</style>'.length);
      }
    }
    return window.Html.decorate(html, theme);
  }

  /* ---------- geração ---------- */

  function kbText(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  function setLoading(on) {
    if (on) {
      kbLabel.hidden = false;
      kbLabel.textContent = '…';
      if (vu) vu.start();
    } else {
      if (vu) vu.stop();
      kbLabel.hidden = true;
    }
  }

  function onGenProgress(contentBytes) {
    var now = performance.now();
    if (now - lastProgressAt < 60) return;
    lastProgressAt = now;
    kbLabel.textContent = kbText(contentBytes);
    liveOut = Math.floor(contentBytes / 4);
    updateSessionUi();
  }

  function sendPrompt() {
    if (generating) return;
    var prompt = input.value.trim();
    if (!prompt) {
      toast('Descreva o que você quer ver');
      return;
    }
    if (!prefs.hasKey()) {
      toast('Configure sua API key em ⚙');
      window.Settings.open({ onSaved: onSettingsSaved });
      return;
    }

    generating = true;
    showingList = false;
    lastPrompt = prompt;
    saveBtn.disabled = true;
    openBtn.disabled = true;
    status(lastRendered != null ? 'ajustando…' : 'gerando…', 'accent', false);
    setLoading(true);
    input.blur();

    var editing = lastRendered != null;
    var baseSystem = window.Html.systemPrompt(theme, prefs.detailLevel());
    var user = window.Html.userPrompt(prompt, lastRendered);
    var userFresh = prompt;  // fallback: só o comando, sem página atual

    /* Força regeneração completa a cada MAX_EDITS patches para evitar degradação */
    var editOverLimit = editing && editCount >= MAX_EDITS;
    if (editOverLimit) {
      toast('Regenerando página completa — ' + editCount + ' patches atingido');
      editCount = 0;
    }
    var system = editOverLimit ? baseSystem : editing ? baseSystem + window.Html.EDIT_DIRECTIVE : baseSystem;
    if (!editing) editCount = 0;

    function run(systemPrompt, userMessage) {
      var msg = userMessage == null ? user : userMessage;
      return window.AiClient.chat(
        prefs.endpoint(), prefs.apiKey(), prefs.model(),
        prefs.temperature(), prefs.maxTokens(), systemPrompt, msg, onGenProgress
      );
    }

    var encoder = new TextEncoder();
    liveActive = true;
    liveIn = Math.floor((encoder.encode(system).length + encoder.encode(user).length) / 4);
    liveOut = 0;
    lastProgressAt = 0;
    updateSessionUi();
    var started = performance.now();

    run(system).then(function (result) {
      if (editing) {
        /* Edição cirúrgica: aplica só os trechos pedidos (não reescreve a página). */
        var patched = window.Html.applyEdits(lastRendered, result.content);
        if (patched.ok) { editCount++; return { result: result, doc: patched.html }; }
        editCount = 0;
        if (window.Html.looksLikeDocument(result.content)) {
          return { result: result, doc: window.Html.extractDocument(result.content) };
        }
        /* Patch inválido: refaz pedindo o documento completo (fallback seguro). */
        status('⚠️ regenerando…', 'accent', false);
        liveOut = 0;
        lastProgressAt = 0;
        editCount = 0;
        return run(baseSystem, userFresh).then(function (r2) {
          return { result: r2, doc: window.Html.extractDocument(r2.content) };
        });
      }
      editCount = 0;
      return { result: result, doc: window.Html.extractDocument(result.content) };
    }).then(function (out) {
      var result = out.result;
      var doc = out.doc;
      var elapsed = (performance.now() - started) / 1000;
      if (!doc.trim()) {
        failGeneration('resposta vazia do modelo');
        return;
      }
      lastRendered = doc;
      render(themed(doc));
      var kb = Math.ceil(encoder.encode(doc).length / 1024);
      liveActive = false;
      var tokSuffix = '';
      if (result.totalTokens > 0) {
        prefs.addSessionTokens(result.promptTokens, result.completionTokens);
        updateSessionUi();
        tokSuffix = ' • ↑' + formatTokens(result.promptTokens) +
          ' ↓' + formatTokens(result.completionTokens) + ' tok';
      }
      status('✓ ' + kb + ' KB • ' + elapsed.toFixed(1) + 's • ' + prefs.model() + tokSuffix, '', true);
      input.value = '';
      input.blur();
      finishGeneration();
    }).catch(function (e) {
      failGeneration(window.AiClient.errorMessage(e));
    });
  }

  function failGeneration(message) {
    status('✗ ' + message, 'error', false);
    if (lastRendered == null) {
      render(window.Html.errorPage(theme, 'Falha na geração', message));
    }
    toast(message);
    finishGeneration();
  }

  function finishGeneration() {
    generating = false;
    saveBtn.disabled = false;
    openBtn.disabled = false;
    liveActive = false;
    updateSessionUi();
    setLoading(false);
  }

  function showWelcome() {
    showingList = false;
    status(prefs.hasKey()
      ? 'pronto — descreva o que quer ver'
      : 'configure a API key em ⚙ para começar', '', false);
    render(window.Html.welcomePage(theme, prefs.hasKey()));
  }

  function resetSession() {
    if (generating) {
      toast('Aguarde a geração atual terminar');
      return;
    }
    prefs.resetSessionTokens();
    lastRendered = null;
    updateSessionUi();
    showWelcome();
    toast('Sessão reiniciada');
  }

  function onSettingsSaved() {
    var changed = prefs.themeIndex() !== lastThemeIndex;
    theme = window.Themes.of(prefs.themeIndex());
    lastThemeIndex = prefs.themeIndex();
    applyTheme();
    if (lastRendered == null) {
      showWelcome();
    } else if (changed) {
      render(themed(lastRendered));
    }
    updateSessionUi();
  }

  /* ---------- salvar / abrir / excluir ---------- */

  function defaultSaveName() {
    var slug = String(lastPrompt || '').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+/, '').replace(/-+$/, '')
      .slice(0, 40);
    var d = new Date();
    function p(n) { return n < 10 ? '0' + n : String(n); }
    var stamp = String(d.getFullYear()) + p(d.getMonth() + 1) + p(d.getDate()) +
      '-' + p(d.getHours()) + p(d.getMinutes());
    var stem = slug || 'pagina';
    return stem + '-' + stamp + '.html';
  }

  function requestSave() {
    if (lastRendered == null) {
      toast('Gere uma página antes de salvar');
      return;
    }
    showSaveDialog();
  }

  function showSaveDialog() {
    window.Store.folderLabel().then(function (folder) {
      var root = el('div', 'mx-modal');
      var card = el('div', 'mx-modal-card mx-modal-small');
      card.appendChild(el('div', 'mx-modal-title', 'Salvar página'));
      card.appendChild(el('div', 'mx-path', 'Pasta: ' + (folder || 'nexus77')));
      var inp = el('input', 'mx-input');
      inp.type = 'text';
      inp.value = defaultSaveName();
      card.appendChild(inp);

      var row = el('div', 'mx-btnrow');
      var cancel = el('button', 'mx-btn mx-btn-ghost', 'Cancelar');
      cancel.type = 'button';
      var ok = el('button', 'mx-btn mx-btn-inline mx-btn-primary', 'Salvar');
      ok.type = 'button';
      row.appendChild(cancel);
      row.appendChild(ok);
      card.appendChild(row);
      root.appendChild(card);
      document.body.appendChild(root);

      inp.focus();
      inp.select();

      function close() {
        document.removeEventListener('keydown', onKey);
        if (root.parentNode) root.parentNode.removeChild(root);
      }
      function submit() {
        var name = inp.value.trim();
        if (!name) {
          toast('Digite um nome');
          return;
        }
        close();
        savePage(name);
      }
      function onKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); close(); }
        else if (e.key === 'Enter') { e.preventDefault(); submit(); }
      }
      document.addEventListener('keydown', onKey);
      root.addEventListener('mousedown', function (e) { if (e.target === root) close(); });
      cancel.addEventListener('click', close);
      ok.addEventListener('click', submit);
    }).catch(function (e) {
      toast('Falha ao salvar: ' + (e && e.message ? e.message : e));
    });
  }

  function savePage(rawName) {
    var doc = lastRendered;
    if (!doc) return;
    var html = themed(doc);
    var name = window.Store.fileName(rawName);
    saveBtn.disabled = true;
    window.Store.folderLabel().then(function (folder) {
      /* Primeiro save: pede a pasta (o clique em "Salvar" dá a ativação). */
      if (!folder && window.Store.supportsFolder()) {
        return window.Store.pickFolder().then(function () { return true; }).catch(function () { return false; });
      }
      return true;
    }).then(function () {
      return Promise.all([window.Store.save(name, html), window.Store.folderLabel()]);
    }).then(function (res) {
      saveBtn.disabled = false;
      var saved = res[0];
      var folder = res[1] || 'pasta nexus77';
      status('✓ salvo: ' + saved, 'accent', false);
      toast('Salvo em ' + folder + '/' + saved);
    }).catch(function (e) {
      saveBtn.disabled = false;
      toast('Falha ao salvar: ' + (e && e.message ? e.message : e));
    });
  }

  function openSavedList() {
    openBtn.disabled = true;
    window.Store.list().then(function (items) {
      openBtn.disabled = false;
      showingList = true;
      var entries = items.map(function (it) {
        return { name: it.name, meta: window.Store.meta(it) };
      });
      render(window.Html.savedListPage(theme, entries));
      status(items.length === 0
        ? 'nada salvo ainda'
        : items.length + ' arquivo(s) em pasta nexus77', '', false);
    }).catch(function (e) {
      openBtn.disabled = false;
      toast('Falha ao listar: ' + (e && e.message ? e.message : e));
    });
  }

  function openSaved(name) {
    window.Store.read(name).then(function (text) {
      if (text == null || !String(text).trim()) {
        toast('Arquivo vazio ou não encontrado');
        return;
      }
      lastRendered = text;
      showingList = false;
      render(text);
      status('aberto: ' + name, '', false);
    }).catch(function (e) {
      toast('Falha ao abrir: ' + (e && e.message ? e.message : e));
    });
  }

  function closeSavedList() {
    if (lastRendered == null) {
      showWelcome();
      return;
    }
    showingList = false;
    render(themed(lastRendered));
    status('página atual', '', false);
  }

  function pickHtmlFile() {
    var root = el('div', 'mx-modal');
    var card = el('div', 'mx-modal-card mx-modal-small');
    card.appendChild(el('div', 'mx-modal-title', 'Abrir HTML'));
    card.appendChild(el('div', 'mx-msg', 'Escolha um arquivo .html do seu computador.'));

    var picker = document.createElement('input');
    picker.type = 'file';
    picker.accept = '.html,text/html,application/xhtml+xml,text/plain';
    picker.style.display = 'none';
    card.appendChild(picker);

    var row = el('div', 'mx-btnrow');
    var cancel = el('button', 'mx-btn mx-btn-ghost', 'Cancelar');
    cancel.type = 'button';
    var choose = el('button', 'mx-btn mx-btn-inline mx-btn-primary', 'Escolher arquivo…');
    choose.type = 'button';
    row.appendChild(cancel);
    row.appendChild(choose);
    card.appendChild(row);
    root.appendChild(card);
    document.body.appendChild(root);

    function close() {
      document.removeEventListener('keydown', onKey);
      if (root.parentNode) root.parentNode.removeChild(root);
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
    }
    document.addEventListener('keydown', onKey);
    root.addEventListener('mousedown', function (e) { if (e.target === root) close(); });
    cancel.addEventListener('click', close);
    choose.addEventListener('click', function () { picker.click(); });

    picker.addEventListener('change', function () {
      var file = picker.files && picker.files[0];
      close();
      if (!file) return;
      file.text().then(function (text) {
        if (!text || !text.trim()) {
          toast('Arquivo vazio ou não legível');
          return;
        }
        lastRendered = text;
        showingList = false;
        render(text);
        status('arquivo local', '', false);
      }).catch(function (e) {
        toast('Falha ao abrir: ' + (e && e.message ? e.message : e));
      });
    });
  }

  function deleteSaved(name) {
    var root = el('div', 'mx-modal');
    var card = el('div', 'mx-modal-card mx-modal-small');
    card.appendChild(el('div', 'mx-modal-title', 'Excluir arquivo'));
    card.appendChild(el('div', 'mx-msg', 'Excluir "' + name + '" de pasta nexus77?'));

    var row = el('div', 'mx-btnrow');
    var cancel = el('button', 'mx-btn mx-btn-ghost', 'Cancelar');
    cancel.type = 'button';
    var ok = el('button', 'mx-btn mx-btn-inline', 'Excluir');
    ok.type = 'button';
    ok.style.color = 'var(--mx-error)';
    row.appendChild(cancel);
    row.appendChild(ok);
    card.appendChild(row);
    root.appendChild(card);
    document.body.appendChild(root);

    function close() {
      document.removeEventListener('keydown', onKey);
      if (root.parentNode) root.parentNode.removeChild(root);
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
    }
    document.addEventListener('keydown', onKey);
    root.addEventListener('mousedown', function (e) { if (e.target === root) close(); });
    cancel.addEventListener('click', close);
    ok.addEventListener('click', function () {
      close();
      window.Store.remove(name).then(function (removed) {
        toast(removed ? 'Excluído' : 'Não foi possível excluir');
        openSavedList();
      }).catch(function (e) {
        toast('Falha ao excluir: ' + (e && e.message ? e.message : e));
      });
    });
  }

  /* ---------- init ---------- */

  function init() {
    frame = $('frame');
    input = $('prompt');
    gearBtn = $('btn-gear');
    saveBtn = $('btn-save');
    openBtn = $('btn-open');
    statusEl = $('status');
    kbLabel = $('kb');
    dot = $('dot');
    modelText = $('model');
    tfill = $('tfill');
    tlabel = $('tlabel');
    resetBtn = $('btn-reset');

    vu = window.VuMeter.attach($('vu'));

    gearBtn.addEventListener('click', function () {
      window.Settings.open({ onSaved: onSettingsSaved });
    });
    saveBtn.addEventListener('click', requestSave);
    openBtn.addEventListener('click', openSavedList);
    resetBtn.addEventListener('click', resetSession);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        sendPrompt();
      }
    });

    /* Bridge exposta às páginas do iframe (window.Nexus77). */
    window.MxShell = {
      setInput: function (text) {
        input.value = String(text == null ? '' : text);
        input.focus();
        var n = input.value.length;
        try { input.setSelectionRange(n, n); } catch (e) { /* ignora */ }
      },
      openSaved: function (name) { openSaved(String(name)); },
      closeList: function () { closeSavedList(); },
      pickFile: function () { pickHtmlFile(); },
      deleteSaved: function (name) { deleteSaved(String(name)); },
      openUrl: function (url) {
        try { window.open(String(url), '_blank', 'noopener'); } catch (e) { /* ignora */ }
      }
    };

    /* Recebe as chamadas da página (shim postMessage) — whitelist. */
    var BRIDGE_METHODS = {
      setInput: true, openSaved: true, closeList: true,
      pickFile: true, deleteSaved: true, openUrl: true
    };
    window.addEventListener('message', function (e) {
      var d = e.data;
      if (!d || d.__nx !== 1) return;
      if (e.source !== frame.contentWindow) return;
      var m = String(d.m || '');
      if (!BRIDGE_METHODS[m]) return;
      var shell = window.MxShell;
      if (shell && typeof shell[m] === 'function') {
        try { shell[m](d.a); } catch (err) { /* ignora */ }
      }
    });

    lastThemeIndex = prefs.themeIndex();
    theme = window.Themes.of(lastThemeIndex);
    applyTheme();
    showWelcome();

    if (window.console) {
      console.log('NEXUS-DESKTOP · ai-client v' + (window.AiClient ? window.AiClient.VERSION : '?') +
        ' · origem ' + location.origin);
    }

    if (location.protocol === 'file:') {
      /* Auto-redireciona para o servidor local */
      var serverUrl = 'http://127.0.0.1:8790/';
      var x = new XMLHttpRequest();
      x.open('GET', serverUrl, true);
      x.timeout = 3000;
      x.onload = function () {
        if (x.status === 200) {
          window.location.href = serverUrl;
        }
      };
      x.onerror = x.ontimeout = function () {
        toast('Sirva por http://127.0.0.1:8790 — abra pelo atalho NEXUS-DESKTOP');
      };
      try { x.send(); } catch (e) { /* ignora */ }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

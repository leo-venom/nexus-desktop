/* ============================================================
 * settings.js — port de SettingsActivity.kt para um modal.
 * Seções: API (endpoint/chave), GERAÇÃO (modelo, temperatura,
 * detalhe, max tokens) e TEMA (grupos ESCUROS/CLAROS).
 * ============================================================ */
(function () {
  'use strict';

  var openState = null;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  /* Toast global simples (usado também pelo app). */
  function toast(message) {
    var t = document.getElementById('mx-toast');
    if (!t) {
      t = el('div', 'mx-toast');
      t.id = 'mx-toast';
      document.body.appendChild(t);
    }
    t.textContent = message;
    t.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(function () { t.classList.remove('show'); }, 2400);
  }

  function field(label, value, placeholder, type) {
    var wrap = el('div', 'mx-field');
    wrap.appendChild(el('label', 'mx-lbl', label));
    var input = el('input', 'mx-input');
    input.type = type || 'text';
    input.value = value == null ? '' : value;
    input.placeholder = placeholder || '';
    wrap.appendChild(input);
    return { wrap: wrap, input: input };
  }

  function open(opts) {
    opts = opts || {};
    if (openState) return openState;

    var prefs = window.Prefs;
    var stack = [];

    var root = el('div', 'mx-modal');
    var card = el('div', 'mx-modal-card');
    root.appendChild(card);

    var head = el('div', 'mx-modal-head');
    head.appendChild(el('span', 'mx-modal-title', 'CONFIGURAÇÕES'));
    var closeBtn = el('button', 'mx-x', '✕');
    closeBtn.type = 'button';
    closeBtn.title = 'Fechar';
    head.appendChild(closeBtn);
    card.appendChild(head);

    /* ---------- API ---------- */
    card.appendChild(el('div', 'mx-sec', 'API'));
    var endpoint = field('Endpoint (compatível OpenAI)', prefs.endpoint(), 'https://api.openai.com/v1', 'url');
    card.appendChild(endpoint.wrap);
    var key = field('API key', prefs.apiKey(), 'sk-…', 'password');
    card.appendChild(key.wrap);

    var showWrap = el('label', 'mx-check');
    var showKey = el('input');
    showKey.type = 'checkbox';
    showWrap.appendChild(showKey);
    showWrap.appendChild(document.createTextNode(' ver chave'));
    card.appendChild(showWrap);
    showKey.addEventListener('change', function () {
      var pos = key.input.selectionStart;
      key.input.type = showKey.checked ? 'text' : 'password';
      try { key.input.setSelectionRange(pos, pos); } catch (e) { /* ignora */ }
    });

    /* ---------- GERAÇÃO ---------- */
    card.appendChild(el('div', 'mx-sec', 'GERAÇÃO'));
    var model = field('Modelo', prefs.model(), 'gpt-4o-mini', 'text');
    card.appendChild(model.wrap);

    var fetchBtn = el('button', 'mx-btn mx-btn-block', 'Buscar modelos');
    fetchBtn.type = 'button';
    card.appendChild(fetchBtn);

    var tempLabel = el('div', 'mx-lbl mx-lbl-top', 'Temperatura: ' + prefs.temperature().toFixed(2));
    card.appendChild(tempLabel);
    var tempBar = el('input', 'mx-range');
    tempBar.type = 'range';
    tempBar.min = '0';
    tempBar.max = '200';
    tempBar.step = '1';
    tempBar.value = String(Math.max(0, Math.min(200, Math.round(prefs.temperature() * 100))));
    card.appendChild(tempBar);
    tempBar.addEventListener('input', function () {
      tempLabel.textContent = 'Temperatura: ' + (Number(tempBar.value) / 100).toFixed(2);
    });

    var tokens = field('Max tokens (0 = sem limite)', String(prefs.maxTokens()), '0', 'number');
    tokens.input.min = '0';
    tokens.input.step = '1';
    card.appendChild(tokens.wrap);

    /* ---------- TEMA ---------- */
    card.appendChild(el('div', 'mx-sec', 'TEMA'));
    var themeInputs = [];
    function addThemeGroup(label, entries) {
      if (!entries.length) return;
      card.appendChild(el('div', 'mx-sec mx-sec-sub', label));
      entries.forEach(function (entry) {
        var lab = el('label', 'mx-radio');
        var r = el('input');
        r.type = 'radio';
        r.name = 'mx-theme';
        r.value = String(entry.index);
        r.checked = entry.index === prefs.themeIndex();
        themeInputs.push(r);
        lab.appendChild(r);
        lab.appendChild(document.createTextNode(' ' + entry.theme.name));
        card.appendChild(lab);

        /* Preview ao passar o mouse */
        (function (idx) {
          lab.addEventListener('mouseenter', function () {
            var t = window.Themes.of(idx);
            var s = document.documentElement.style;
            s.setProperty('--nx-bg', t.background);
            s.setProperty('--nx-surface', t.surface);
            s.setProperty('--nx-surface-alt', t.surfaceAlt);
            s.setProperty('--nx-accent', t.accent);
            s.setProperty('--nx-accent-soft', window.Themes.hexA(t.accent, 140));
            s.setProperty('--nx-accent-faint', window.Themes.hexA(t.accent, 20));
            s.setProperty('--nx-text', t.text);
            s.setProperty('--nx-secondary', t.secondary);
            s.setProperty('--nx-on-accent', t.onAccent);
            s.setProperty('--mx-error', t.isDark ? '#FF5C5C' : '#D32F2F');
          });
          lab.addEventListener('mouseleave', function () {
            var cur = window.Themes.of(prefs.themeIndex());
            var s = document.documentElement.style;
            s.setProperty('--nx-bg', cur.background);
            s.setProperty('--nx-surface', cur.surface);
            s.setProperty('--nx-surface-alt', cur.surfaceAlt);
            s.setProperty('--nx-accent', cur.accent);
            s.setProperty('--nx-accent-soft', window.Themes.hexA(cur.accent, 140));
            s.setProperty('--nx-accent-faint', window.Themes.hexA(cur.accent, 20));
            s.setProperty('--nx-text', cur.text);
            s.setProperty('--nx-secondary', cur.secondary);
            s.setProperty('--nx-on-accent', cur.onAccent);
            s.setProperty('--mx-error', cur.isDark ? '#FF5C5C' : '#D32F2F');
          });
        })(entry.index);
      });
    }
    var indexed = window.Themes.ALL.map(function (t, i) { return { index: i, theme: t }; });
    addThemeGroup('ESCUROS', indexed.filter(function (e) { return e.theme.isDark; }));
    addThemeGroup('CLAROS', indexed.filter(function (e) { return !e.theme.isDark; }));

    /* ---------- Salvar ---------- */
    var saveBtn = el('button', 'mx-btn mx-btn-primary mx-btn-block mx-save', 'Salvar configurações');
    saveBtn.type = 'button';
    card.appendChild(saveBtn);

    card.appendChild(el('div', 'mx-ver',
      'ai-client v' + (window.AiClient ? window.AiClient.VERSION : '?') + ' · ' + location.origin));

    /* ---------- comportamento ---------- */

    function close() {
      if (stack.length) { closeTop(); return; }
      document.removeEventListener('keydown', onKey);
      if (root.parentNode) root.parentNode.removeChild(root);
      openState = null;
    }

    function closeTop() {
      var top = stack.pop();
      if (top && top.parentNode) top.parentNode.removeChild(top);
    }

    function onKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (stack.length) closeTop(); else close();
      }
    }

    closeBtn.addEventListener('click', close);
    root.addEventListener('mousedown', function (e) {
      if (e.target === root) close();
    });
    document.addEventListener('keydown', onKey);

    function showModels(models) {
      var current = model.input.value.trim();
      var preselect = Math.max(0, models.indexOf(current));
      var overlay = el('div', 'mx-modal mx-modal-top');
      var box = el('div', 'mx-modal-card mx-modal-small');
      box.appendChild(el('div', 'mx-modal-head mx-modal-title', 'Modelos'));
      var list = el('div', 'mx-model-list');
      models.forEach(function (name, i) {
        var b = el('button', 'mx-model' + (i === preselect ? ' sel' : ''), name);
        b.type = 'button';
        b.addEventListener('click', function () {
          model.input.value = name;
          closeTop();
        });
        list.appendChild(b);
      });
      box.appendChild(list);
      var cancel = el('button', 'mx-btn mx-btn-block', 'Cancelar');
      cancel.type = 'button';
      cancel.addEventListener('click', closeTop);
      box.appendChild(cancel);
      overlay.appendChild(box);
      overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) closeTop(); });
      document.body.appendChild(overlay);
      stack.push(overlay);
    }

    fetchBtn.addEventListener('click', function () {
      var endpointValue = endpoint.input.value.trim();
      if (endpointValue.indexOf('http') !== 0) {
        toast('Endpoint deve começar com http');
        return;
      }
      var keyValue = key.input.value.trim();
      if (!keyValue) {
        toast('Informe a API key');
        return;
      }
      fetchBtn.disabled = true;
      fetchBtn.textContent = 'buscando…';
      window.AiClient.listModels(endpointValue, keyValue).then(function (models) {
        fetchBtn.disabled = false;
        fetchBtn.textContent = 'Buscar modelos';
        if (!models.length) {
          toast('Nenhum modelo retornado');
          return;
        }
        showModels(models);
      }).catch(function (e) {
        fetchBtn.disabled = false;
        fetchBtn.textContent = 'Buscar modelos';
        toast(window.AiClient.errorMessage(e));
      });
    });

    saveBtn.addEventListener('click', function () {
      var endpointValue = endpoint.input.value.trim();
      if (endpointValue.indexOf('http') !== 0) {
        toast('Endpoint deve começar com http');
        return;
      }
      var selected = -1;
      themeInputs.forEach(function (r) { if (r.checked) selected = Number(r.value); });

      prefs.set('endpoint', endpointValue);
      prefs.set('apiKey', key.input.value);
      prefs.set('model', model.input.value);
      var mt = parseInt(tokens.input.value, 10);
      prefs.set('maxTokens', isNaN(mt) || mt < 0 ? 0 : mt);
      prefs.set('temperature', Number(tempBar.value) / 100);
      if (selected >= 0) prefs.set('themeIndex', selected);


      toast('Configurações salvas ✓');
      close();
      if (opts.onSaved) opts.onSaved();
    });

    document.body.appendChild(root);
    openState = { close: close };
    setTimeout(function () { endpoint.input.focus(); }, 30);
    return openState;
  }

  window.Settings = {
    open: open,
    toast: toast
  };
})();

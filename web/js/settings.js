/* ============================================================
 * settings.js — port de SettingsActivity.kt para um modal.
 * Seções: API (endpoint/chave) e GERAÇÃO (modelo, temperatura,
 * max tokens). O seletor de TEMAS foi removido: o app usa um
 * tema único padrão.
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

    var tokens = field('Max tokens (0 = padrão do provedor)', String(prefs.maxTokens()), '0', 'number');
    tokens.input.min = '0';
    tokens.input.step = '1';
    card.appendChild(tokens.wrap);
    card.appendChild(el('div', 'mx-note',
      '0 não envia limite e deixa o provedor decidir. Acima do teto do modelo o app corta ' +
      '(GPT-6 Luna: até 128.000).'));

    var autoFixWrap = el('label', 'mx-check', ' Correção automática contínua (anti-erro em loop)');
    autoFixWrap.style.marginTop = '12px';
    var autoFixCheck = el('input');
    autoFixCheck.type = 'checkbox';
    autoFixCheck.checked = prefs.autoFix();
    autoFixWrap.insertBefore(autoFixCheck, autoFixWrap.firstChild);
    card.appendChild(autoFixWrap);

    /* ---------- IMAGEM DE REFERÊNCIA ---------- */
    card.appendChild(el('div', 'mx-sec', 'IMAGEM DE REFERÊNCIA'));

    var imgMode = prefs.imageMode();

    var imgAutoWrap = el('label', 'mx-check', ' Automático (recomendado): envia a imagem original; se o modelo recusar, usa a análise local');
    var imgAuto = el('input');
    imgAuto.type = 'radio';
    imgAuto.name = 'nx-image-mode';
    imgAuto.value = 'auto';
    imgAuto.checked = imgMode === 'auto';
    imgAutoWrap.insertBefore(imgAuto, imgAutoWrap.firstChild);
    card.appendChild(imgAutoWrap);

    var imgLocalWrap = el('label', 'mx-check', ' Somente análise local (nunca envia os pixels)');
    var imgLocal = el('input');
    imgLocal.type = 'radio';
    imgLocal.name = 'nx-image-mode';
    imgLocal.value = 'local';
    imgLocal.checked = imgMode === 'local';
    imgLocalWrap.insertBefore(imgLocal, imgLocalWrap.firstChild);
    card.appendChild(imgLocalWrap);

    card.appendChild(el('div', 'mx-note',
      'No automático, a imagem original é enviada ao provedor para melhor fidelidade; ' +
      'se ele recusar, o app usa o relatório local. "Somente local" mantém a imagem no computador.'));

    var imgIterate = field('Correções visuais automáticas (0–2)', String(prefs.visualIterations()), '0', 'number');
    imgIterate.input.min = '0';
    imgIterate.input.max = '2';
    imgIterate.input.step = '1';
    card.appendChild(imgIterate.wrap);
    card.appendChild(el('div', 'mx-note',
      'Depois de gerar, o app compara o canvas com a referência e pede até esse número de ajustes. ' +
      'Só funciona quando a página desenha em um canvas acessível; 0 desliga.'));

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
      prefs.set('endpoint', endpointValue);
      prefs.set('apiKey', key.input.value);
      prefs.set('model', model.input.value);
      var mt = parseInt(tokens.input.value, 10);
      prefs.set('maxTokens', isNaN(mt) || mt < 0 ? 0 : mt);
      prefs.set('temperature', Number(tempBar.value) / 100);
      prefs.set('autoFix', autoFixCheck.checked === true);
      prefs.set('imageMode', imgLocal.checked ? 'local' : 'auto');
      prefs.set('imageModeVersion', 2);
      var vi = parseInt(imgIterate.input.value, 10);
      prefs.set('visualIterations', isNaN(vi) ? 0 : Math.max(0, Math.min(2, vi)));

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

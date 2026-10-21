/* ============================================================
 * prefs.js — preferências persistidas (port de Prefs.kt)
 * Armazenamento: localStorage["nexus77"] (JSON).
 * ============================================================ */
(function () {
  'use strict';

  var KEY = 'nexus77';
  var DEFAULT_ENDPOINT = 'https://api.openai.com/v1';
  var SESSION_TOKEN_BUDGET = 1000000;

  var DEFAULTS = {
    endpoint: '',
    apiKey: '',
    model: 'gpt-4o-mini',
    temperature: 0.7,
    maxTokens: 0,
    themeIndex: 0,
    detailLevel: 1,
    sessionTokens: 0,
    sessionPromptTokens: 0,
    sessionCompletionTokens: 0,
    usageLog: []
  };

  function read() {
    var raw = {};
    try {
      raw = JSON.parse(localStorage.getItem(KEY) || '{}') || {};
    } catch (e) {
      raw = {};
    }
    var st = {};
    Object.keys(DEFAULTS).forEach(function (k) {
      st[k] = (raw[k] === undefined || raw[k] === null) ? DEFAULTS[k] : raw[k];
    });
    return st;
  }

  var state = read();

  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) { /* ignora (modo privado / cota) */ }
  }

  function num(v, fb) {
    var n = Number(v);
    return isFinite(n) ? n : fb;
  }

  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

  window.Prefs = {
    KEY: KEY,
    DEFAULT_ENDPOINT: DEFAULT_ENDPOINT,
    SESSION_TOKEN_BUDGET: SESSION_TOKEN_BUDGET,

    get: function (k) { return state[k]; },
    set: function (k, v) { state[k] = v; persist(); },
    data: state,

    hasKey: function () { return String(state.apiKey || '').trim().length > 0; },
    endpoint: function () {
      var e = String(state.endpoint || '').trim();
      return e || DEFAULT_ENDPOINT;
    },
    apiKey: function () { return String(state.apiKey || '').trim(); },
    model: function () {
      return String(state.model || DEFAULTS.model).trim() || DEFAULTS.model;
    },
    temperature: function () { return clamp(num(state.temperature, 0.7), 0, 2); },
    maxTokens: function () { return Math.max(0, Math.floor(num(state.maxTokens, 0))); },
    themeIndex: function () { return 0; },   /* tema único — seletor removido */
    detailLevel: function () { return 2; },   /* modo game único — sem seletor */

    sessionTokens: function () { return num(state.sessionTokens, 0); },
    sessionPromptTokens: function () { return num(state.sessionPromptTokens, 0); },
    sessionCompletionTokens: function () { return num(state.sessionCompletionTokens, 0); },

    addSessionTokens: function (prompt, completion) {
      var p = Math.max(0, num(prompt, 0));
      var c = Math.max(0, num(completion, 0));
      state.sessionPromptTokens = num(state.sessionPromptTokens, 0) + p;
      state.sessionCompletionTokens = num(state.sessionCompletionTokens, 0) + c;
      state.sessionTokens = num(state.sessionTokens, 0) + p + c;
      persist();
    },
    resetSessionTokens: function () {
      state.sessionTokens = 0;
      state.sessionPromptTokens = 0;
      state.sessionCompletionTokens = 0;
      persist();
    },

    /* ---------- histórico de consumo (rolling: 1 h / 24 h / 7 d / 30 d) ---------- */

    usageLog: function () {
      return Array.isArray(state.usageLog) ? state.usageLog : [];
    },
    addUsage: function (prompt, completion, when) {
      var p = Math.max(0, Math.round(num(prompt, 0)));
      var c = Math.max(0, Math.round(num(completion, 0)));
      if (p + c <= 0) return;
      var t = num(when, Date.now());
      if (!isFinite(t) || t <= 0) t = Date.now();
      var log = [];
      var arr = Array.isArray(state.usageLog) ? state.usageLog : [];
      arr.forEach(function (e) {
        if (!e || typeof e.t !== 'number' || !isFinite(e.t)) return;
        log.push({ t: e.t, p: Math.max(0, num(e.p, 0)), c: Math.max(0, num(e.c, 0)) });
      });
      log.push({ t: t, p: p, c: c });
      var min = Date.now() - 31 * 86400000;
      log = log.filter(function (e) { return e.t >= min; });
      if (log.length > 5000) log = log.slice(log.length - 5000);
      state.usageLog = log;
      persist();
    },
    usageTotals: function (now) {
      var t = num(now, Date.now());
      var out = {
        hour: { prompt: 0, completion: 0, total: 0 },
        day: { prompt: 0, completion: 0, total: 0 },
        week: { prompt: 0, completion: 0, total: 0 },
        month: { prompt: 0, completion: 0, total: 0 }
      };
      var spans = { hour: 3600000, day: 86400000, week: 7 * 86400000, month: 30 * 86400000 };
      var arr = Array.isArray(state.usageLog) ? state.usageLog : [];
      arr.forEach(function (e) {
        if (!e || typeof e.t !== 'number' || !isFinite(e.t)) return;
        var age = t - e.t;
        if (age < 0 || age > spans.month) return;
        var p = Math.max(0, num(e.p, 0));
        var c = Math.max(0, num(e.c, 0));
        Object.keys(spans).forEach(function (k) {
          if (age <= spans[k]) {
            out[k].prompt += p;
            out[k].completion += c;
            out[k].total += p + c;
          }
        });
      });
      return out;
    },
    resetUsage: function () {
      state.usageLog = [];
      persist();
    }
  };
})();

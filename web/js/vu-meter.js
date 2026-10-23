/* ============================================================
 * vu-meter.js — 20 retângulos 10×10 em fileira horizontal,
 * separados por vãos fixos de 1px (219px no total).
 * Uma "cabeça" percorre a fileira da esquerda para a direita e
 * volta, acendendo cada retângulo com rastro curto. A cor de
 * cada retângulo vem de um degradê (esmeralda → azul → rosa)
 * derivado do tema atual.
 * ============================================================ */
(function () {
  'use strict';

  var BAR_COUNT = 20;
  var BAR_W = 10;
  var BAR_H = 10;
  var GAP = 1;          /* vão fixo entre retângulos */
  var CYCLE_S = 3.0;    /* ida + volta completa */
  var TRAIL = 3.2;      /* alcance do brilho atrás da cabeça, em barras */
  var FLOOR = 0.15;     /* brilho mínimo: a fileira nunca fica apagada */

  /* ---------- cor ---------- */

  function parseHex(hex) {
    var h = String(hex || '').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h.slice(0, 6), 16);
    if (isNaN(n)) return [255, 255, 255];
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function mixColor(a, b, t) {
    var ca = parseHex(a);
    var cb = parseHex(b);
    var k = t < 0 ? 0 : (t > 1 ? 1 : t);
    return 'rgb(' +
      Math.round(ca[0] + (cb[0] - ca[0]) * k) + ',' +
      Math.round(ca[1] + (cb[1] - ca[1]) * k) + ',' +
      Math.round(ca[2] + (cb[2] - ca[2]) * k) + ')';
  }

  function attach(canvas) {
    var ctx = canvas.getContext('2d');

    /* degradê: posição 0 = esquerda, 2 = direita */
    var palette = ['#00E88A', '#00A3FF', '#A855F7'];
    var barColors = [];

    var raf = null;
    var startedAt = 0;
    var pausedAt = 0;
    var running = false;

    canvas.hidden = true;

    function buildColors() {
      barColors = [];
      for (var i = 0; i < BAR_COUNT; i++) {
        var pos = BAR_COUNT > 1 ? i / (BAR_COUNT - 1) : 0;   /* 0..1 */
        var seg = pos < 0.5 ? 0 : 1;
        var local = pos < 0.5 ? pos * 2 : (pos - 0.5) * 2;
        barColors.push(mixColor(palette[seg], palette[seg + 1] || palette[seg], local));
      }
    }

    buildColors();

    /* ---------- geometria ---------- */

    function resize() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var w = canvas.clientWidth || 0;
      var h = canvas.clientHeight || 0;
      var pw = Math.round(w * dpr);
      var ph = Math.round(h * dpr);
      if (canvas.width !== pw) canvas.width = pw;
      if (canvas.height !== ph) canvas.height = ph;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function layout() {
      var w = canvas.clientWidth || 0;
      var h = canvas.clientHeight || 0;
      var gap = GAP;
      var total = BAR_COUNT * BAR_W + gap * (BAR_COUNT - 1);
      return {
        w: w,
        h: h,
        gap: gap,
        x0: (w - total) / 2,
        y: (h - BAR_H) / 2
      };
    }

    /* ---------- animação ---------- */

    /* 0..1..0 com suavização nas pontas: nada de "tranco" ao inverter */
    function headPosition(seconds) {
      var u = (seconds / CYCLE_S) % 1;
      if (u < 0) u += 1;
      var p = u < 0.5 ? u * 2 : (1 - u) * 2;
      p = p * p * (3 - 2 * p);            /* smoothstep */
      return p * (BAR_COUNT - 1);
    }

    function draw(seconds) {
      var g = layout();
      if (g.w <= 0 || g.h <= 0) return;

      ctx.clearRect(0, 0, g.w, g.h);

      var head = headPosition(seconds);
      var pitch = BAR_W + g.gap;

      for (var i = 0; i < BAR_COUNT; i++) {
        var d = Math.abs(i - head);
        var lit = d >= TRAIL ? 0 : 1 - d / TRAIL;
        var inten = FLOOR + (1 - FLOOR) * Math.pow(lit, 1.35);
        var color = barColors[i] || palette[0];

        var x = g.x0 + i * pitch;

        ctx.globalAlpha = inten;
        ctx.fillStyle = color;
        if (lit > 0.02) {
          ctx.shadowColor = color;
          ctx.shadowBlur = 6 * inten;
        } else {
          ctx.shadowBlur = 0;
        }
        ctx.fillRect(x, g.y, BAR_W, BAR_H);
      }

      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }

    function frame() {
      if (!running) return;
      var seconds = (performance.now() - startedAt) / 1000;
      resize();
      draw(seconds);
      raf = requestAnimationFrame(frame);
    }

    function start() {
      if (running) return;
      running = true;
      canvas.hidden = false;
      startedAt = performance.now() - pausedAt;
      resize();
      raf = requestAnimationFrame(frame);
    }

    function stop() {
      running = false;
      pausedAt = performance.now() - startedAt;
      if (raf) cancelAnimationFrame(raf);
      raf = null;
      canvas.hidden = true;
    }

    /* Mantém a assinatura antiga (forte, fraco, trilho, meio). */
    function setColors(strongColor, dimColor, trackCol, midColor) {
      if (strongColor) palette[0] = strongColor;
      if (midColor) palette[1] = midColor;
      buildColors();
      if (!running) { resize(); draw(0); }
    }

    function setTheme(theme) {
      var c = (theme && theme.colors && theme.colors.length >= 3) ? theme.colors : null;
      if (c) {
        /* colors = [acento, rosa, azul] */
        palette = [theme.accent, c[2], c[1]];
      } else {
        palette = ['#00E88A', '#00A3FF', '#A855F7'];
      }
      buildColors();
      if (!running) { resize(); draw(0); }
    }

    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(function () {
        if (running) return;
        resize();
        draw(0);
      }).observe(canvas);
    }

    return {
      start: start,
      stop: stop,
      setColors: setColors,
      setTheme: setTheme,
      resize: function () { resize(); draw(0); }
    };
  }

  window.VuMeter = {
    attach: attach
  };
})();

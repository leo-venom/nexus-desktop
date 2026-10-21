/* ============================================================
 * vu-meter.js — port de VuMeterView.kt para <canvas>.
 * 5 barras largas com animação de 5 ondas senoidais sobrepostas,
 * degradê rico e cap aceso.
 * ============================================================ */
(function () {
  'use strict';

  var BAR_COUNT = 5;
  var DURATION_MS = 1400;

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function attach(canvas) {
    var ctx = canvas.getContext('2d');
    var strong = '#00E5FF';
    var dim = '#00E5FF33';
    var mid = '';
    var trackColor = '#FFFFFF1A';
    var raf = null;
    var startedAt = 0;
    var pausedAt = 0;
    var running = false;

    canvas.hidden = true;

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

    function draw(phase) {
      var w = canvas.clientWidth || 0;
      var h = canvas.clientHeight || 0;
      if (w <= 0 || h <= 0) return;
      ctx.clearRect(0, 0, w, h);

      var gap = w * 0.08;
      var barW = (w - gap * (BAR_COUNT - 1)) / BAR_COUNT;
      var radius = barW * 0.35;
      var p = phase * 2 * Math.PI;

      for (var i = 0; i < BAR_COUNT; i++) {
        var left = i * (barW + gap);

        // trilho de fundo
        ctx.fillStyle = trackColor;
        roundRect(ctx, left, 0, barW, h, radius);
        ctx.fill();

        // 5 ondas senoidais com frequências e fases distintas
        var w1 = Math.sin(p + i * 0.30);
        var w2 = Math.sin(p * 1.7 + i * 0.80);
        var w3 = Math.sin(p * 2.9 + i * 1.20);
        var w4 = Math.sin(p * 0.6 + i * 0.50);
        var w5 = Math.sin(p * 4.1 + i * 1.50);

        // combinação ponderada — movimento orgânico e rico
        var wave = (0.25 * w1 + 0.25 * w2 + 0.20 * w3 + 0.15 * w4 + 0.15 * w5) * 0.5 + 0.5;
        wave = Math.max(0, Math.min(1, wave));
        var eased = wave * wave * (3 - 2 * wave); // smoothstep
        var level = 0.10 + 0.90 * eased;
        var barH = h * level;
        var top = h - barH;

        // degradê em 3 tons do tema: base → meio (rosa) → topo (azul)
        var grad = ctx.createLinearGradient(left, h, left, top);
        grad.addColorStop(0, dim);
        if (mid) {
          grad.addColorStop(0.55, window.Themes.hexA(mid.slice(0, 7), 200));
          grad.addColorStop(1, strong);
        } else {
          grad.addColorStop(0.5, window.Themes.hexA(strong.slice(0, 7), 140));
          grad.addColorStop(1, strong);
        }
        ctx.fillStyle = grad;
        roundRect(ctx, left, top, barW, barH, radius);
        ctx.fill();

        // cap aceso no topo
        ctx.fillStyle = strong;
        var capH = Math.max(barW * 0.55, 3);
        var capBottom = Math.min(top + capH, h);
        roundRect(ctx, left, top, barW, capBottom - top, radius);
        ctx.fill();

        // brilho extra no topo do cap (pequeno destaque)
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        var glowH = capH * 0.35;
        roundRect(ctx, left + barW * 0.15, top + 1, barW * 0.7, glowH, radius * 0.6);
        ctx.fill();
      }
    }

    function frame() {
      if (!running) return;
      var phase = ((performance.now() - startedAt) % DURATION_MS) / DURATION_MS;
      resize();
      draw(phase);
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

    function setColors(strongColor, dimColor, trackCol, midColor) {
      strong = strongColor;
      dim = dimColor;
      mid = midColor || '';
      trackColor = trackCol;
      if (!running) { resize(); draw(0); }
    }

    /* Tema único BLACK CYBER: base esmeralda → meio rosa → topo azul. */
    function setTheme(theme) {
      var c = (theme && theme.colors && theme.colors.length >= 3) ? theme.colors : null;
      if (c) setColors(c[2], window.Themes.hexA(theme.accent, 51), '#FFFFFF1A', c[1]);
      else setColors(theme.accent, window.Themes.hexA(theme.accent, 51), '#FFFFFF1A');
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
    BAR_COUNT: BAR_COUNT,
    DURATION_MS: DURATION_MS,
    attach: attach
  };
})();
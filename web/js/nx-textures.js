/* ============================================================
 * nx-textures.js — PACK DE TEXTURAS PROCEDURAIS do NEXUS GAME
 *
 * Biblioteca pronta para os jogos gerados. Cada textura é desenhada
 * uma única vez num canvas em cache e reutilizada (pattern / canvas).
 *
 * API (global `NxTex`):
 *   NxTex.names()                     -> array com todos os nomes
 *   NxTex.canvas(nome, tam)           -> HTMLCanvasElement (cache)
 *   NxTex.pattern(ctx, nome, tam)     -> CanvasPattern (cache por ctx)
 *   NxTex.bloco(ctx,x,y,w,h,nome)     -> pinta bloco com textura + luz/sombra
 *   NxTex.css(nome)                   -> 'url(dataURL)' para background
 *   NxTex.three(nome)                 -> THREE.CanvasTexture (se THREE existir)
 *   NxTex.aleatoria()                 -> nome sorteado
 *
 * Sem dependências. Funciona em iframe sandbox (origem opaca).
 * ============================================================ */
(function () {
  'use strict';

  if (window.NxTex) return;

  var CACHE = {};       /* nome -> canvas */
  var PATTERNS = [];    /* {ctx, nome, pat} */
  var TAM = 128;

  /* ---------- utilidades de desenho ---------- */
  function novo(tam) {
    var c = document.createElement('canvas');
    c.width = c.height = tam || TAM;
    return c;
  }

  function ruido(x, tam, alpha, escuro) {
    for (var i = 0; i < tam * tam * 0.45; i++) {
      var a = Math.random() * alpha;
      var v = Math.floor(Math.random() * 90);
      x.fillStyle = escuro
        ? 'rgba(0,0,0,' + a.toFixed(3) + ')'
        : 'rgba(' + (170 + v) + ',' + (170 + v) + ',' + (170 + v) + ',' + a.toFixed(3) + ')';
      x.fillRect(Math.random() * tam | 0, Math.random() * tam | 0, 1, 1);
    }
  }

  function grad(x, tam, stops, vertical) {
    var g = vertical === false
      ? x.createLinearGradient(0, 0, tam, 0)
      : x.createLinearGradient(0, 0, 0, tam);
    for (var i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], stops[i][1]);
    x.fillStyle = g;
    x.fillRect(0, 0, tam, tam);
    return g;
  }

  function brilhoTopo(x, tam, alpha) {
    var g = x.createLinearGradient(0, 0, 0, tam * 0.45);
    g.addColorStop(0, 'rgba(255,255,255,' + alpha + ')');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, tam, tam * 0.45);
  }

  /* ---------- 24 texturas ---------- */

  var TEX = {

    lava: function (x, t) {
      grad(x, t, [[0, '#FFE066'], [0.35, '#FF9A00'], [0.7, '#E63A00'], [1, '#7A0B00']]);
      for (var i = 0; i < 22; i++) {                       /* veios de magma */
        x.beginPath();
        x.strokeStyle = 'rgba(255,' + (120 + Math.random() * 90 | 0) + ',0,' + (0.25 + Math.random() * 0.5) + ')';
        x.lineWidth = 1 + Math.random() * 3;
        var px = Math.random() * t, py = 0;
        x.moveTo(px, py);
        while (py < t) { py += 6 + Math.random() * 10; px += (Math.random() - 0.5) * 16; x.lineTo(px, py); }
        x.stroke();
      }
      for (var k = 0; k < 90; k++) {                        /* brasas */
        x.fillStyle = 'rgba(255,244,170,' + (0.3 + Math.random() * 0.7) + ')';
        var s = 1 + Math.random() * 2;
        x.fillRect(Math.random() * t, Math.random() * t, s, s);
      }
      for (var d = 0; d < 26; d++) {                        /* crosta escura */
        x.fillStyle = 'rgba(40,0,0,' + (0.3 + Math.random() * 0.5) + ')';
        x.beginPath(); x.arc(Math.random() * t, Math.random() * t, 3 + Math.random() * 9, 0, 6.3); x.fill();
      }
    },

    metal: function (x, t) {
      grad(x, t, [[0, '#C9D2DA'], [0.5, '#8A97A3'], [1, '#5C6771']]);
      ruido(x, t, 0.35, false);
      for (var i = 0; i < t; i += 8) {                      /* listras escovadas */
        x.fillStyle = 'rgba(255,255,255,' + (0.04 + Math.random() * 0.09) + ')';
        x.fillRect(0, i, t, 1);
        x.fillStyle = 'rgba(0,0,0,' + (0.05 + Math.random() * 0.08) + ')';
        x.fillRect(0, i + 2, t, 1);
      }
      brilhoTopo(x, t, 0.30);
    },

    cromo: function (x, t) {
      grad(x, t, [[0, '#0B0F14'], [0.22, '#FFFFFF'], [0.42, '#8C97A3'], [0.6, '#FFFFFF'], [0.8, '#5C6771'], [1, '#F2F6FA']], false);
      brilhoTopo(x, t, 0.20);
    },

    ouro: function (x, t) {
      grad(x, t, [[0, '#8B6914'], [0.3, '#FFD86B'], [0.55, '#FFE89A'], [0.8, '#D4A017'], [1, '#6E4F0A']], false);
      ruido(x, t, 0.18, true);
      brilhoTopo(x, t, 0.28);
    },

    vidro: function (x, t) {
      grad(x, t, [[0, 'rgba(180,235,255,0.55)'], [0.5, 'rgba(90,180,230,0.30)'], [1, 'rgba(200,245,255,0.55)']]);
      x.strokeStyle = 'rgba(255,255,255,0.55)';
      x.lineWidth = 2;
      x.strokeRect(2, 2, t - 4, t - 4);
      x.beginPath();                                        /* reflexo diagonal */
      x.moveTo(0, t * 0.7); x.lineTo(t * 0.7, 0);
      x.strokeStyle = 'rgba(255,255,255,0.35)'; x.lineWidth = 6; x.stroke();
      x.fillStyle = 'rgba(255,255,255,0.18)';
      x.fillRect(t * 0.12, t * 0.12, t * 0.18, t * 0.5);
    },

    madeira: function (x, t) {
      grad(x, t, [[0, '#8B5A2B'], [0.5, '#A9702F'], [1, '#6B3E1B']]);
      for (var y = 0; y < t; y += 7) {                       /* veios horizontais */
        var amp = 3 + Math.random() * 5, fase = Math.random() * 6.3;
        x.beginPath();
        for (var px = 0; px <= t; px++) {
          var py = y + Math.sin((px / t) * 6.3 * 1.5 + fase) * amp;
          px === 0 ? x.moveTo(px, py) : x.lineTo(px, py);
        }
        x.strokeStyle = 'rgba(60,30,10,' + (0.10 + Math.random() * 0.22) + ')';
        x.lineWidth = 1 + Math.random() * 1.5;
        x.stroke();
      }
      for (var n = 0; n < 3; n++) {                          /* nós */
        var cx = Math.random() * t, cy = Math.random() * t;
        for (var r = 9; r > 1; r -= 2) {
          x.beginPath();
          x.strokeStyle = 'rgba(55,26,8,' + (0.20 + Math.random() * 0.35) + ')';
          x.lineWidth = 1.4;
          x.ellipse(cx, cy, r, r * 0.65, 0, 0, 6.3);
          x.stroke();
        }
      }
    },

    pedra: function (x, t) {
      grad(x, t, [[0, '#9AA0A6'], [0.5, '#6E747A'], [1, '#474C52']]);
      ruido(x, t, 0.5, true);
      ruido(x, t, 0.22, false);
      for (var i = 0; i < 5; i++) {                          /* rachaduras */
        x.beginPath();
        var px = Math.random() * t, py = Math.random() * t;
        x.moveTo(px, py);
        for (var s = 0; s < 4; s++) {
          px += (Math.random() - 0.5) * 40;
          py += (Math.random() - 0.5) * 40;
          x.lineTo(px, py);
        }
        x.strokeStyle = 'rgba(20,22,26,0.45)';
        x.lineWidth = 1 + Math.random();
        x.stroke();
      }
    },

    gelo: function (x, t) {
      grad(x, t, [[0, '#EAF8FF'], [0.45, '#A8DCF5'], [1, '#5FAED6']]);
      for (var i = 0; i < 14; i++) {                         /* facetas de cristal */
        x.beginPath();
        x.moveTo(Math.random() * t, Math.random() * t);
        x.lineTo(Math.random() * t, Math.random() * t);
        x.lineTo(Math.random() * t, Math.random() * t);
        x.closePath();
        x.fillStyle = 'rgba(255,255,255,' + (0.05 + Math.random() * 0.22) + ')';
        x.fill();
      }
      brilhoTopo(x, t, 0.35);
    },

    agua: function (x, t) {
      grad(x, t, [[0, '#7FD4FF'], [0.5, '#2E9BD6'], [1, '#0B5A8C']]);
      for (var y = 0; y < t; y += 8) {
        x.beginPath();
        for (var px = 0; px <= t; px += 2) {
          var py = y + Math.sin((px / t) * 6.3 * 2 + y) * 3;
          px === 0 ? x.moveTo(px, py) : x.lineTo(px, py);
        }
        x.strokeStyle = 'rgba(255,255,255,' + (0.06 + Math.random() * 0.16) + ')';
        x.lineWidth = 1.5;
        x.stroke();
      }
      brilhoTopo(x, t, 0.22);
    },

    grama: function (x, t) {
      grad(x, t, [[0, '#6FBF3A'], [0.5, '#3F8F1F'], [1, '#245910']]);
      for (var i = 0; i < 240; i++) {                        /* folhas */
        var px = Math.random() * t, py = Math.random() * t;
        x.strokeStyle = 'rgba(' + (120 + Math.random() * 90 | 0) + ',' + (180 + Math.random() * 70 | 0) + ',40,' + (0.25 + Math.random() * 0.5) + ')';
        x.lineWidth = 1;
        x.beginPath();
        x.moveTo(px, py);
        x.lineTo(px + (Math.random() - 0.5) * 3, py - 3 - Math.random() * 5);
        x.stroke();
      }
    },

    asfalto: function (x, t) {
      grad(x, t, [[0, '#4A4F55'], [0.5, '#33383D'], [1, '#20242A']]);
      for (var i = 0; i < t * t * 0.5; i++) {                /* grãos */
        var v = 60 + Math.random() * 120 | 0;
        x.fillStyle = 'rgba(' + v + ',' + v + ',' + (v + 6) + ',' + (0.12 + Math.random() * 0.4) + ')';
        x.fillRect(Math.random() * t, Math.random() * t, 1, 1);
      }
      x.fillStyle = 'rgba(255,220,90,0.55)';                 /* faixa */
      x.fillRect(0, t * 0.48, t, 3);
    },

    grade: function (x, t) {
      x.fillStyle = '#08131A'; x.fillRect(0, 0, t, t);
      x.strokeStyle = 'rgba(0,229,255,0.55)'; x.lineWidth = 1.5;
      for (var i = 0; i <= t; i += 16) {
        x.beginPath(); x.moveTo(i, 0); x.lineTo(i, t); x.stroke();
        x.beginPath(); x.moveTo(0, i); x.lineTo(t, i); x.stroke();
      }
      x.strokeStyle = 'rgba(0,229,255,0.95)'; x.lineWidth = 2;
      x.strokeRect(1, 1, t - 2, t - 2);
    },

    nebulosa: function (x, t) {
      grad(x, t, [[0, '#1B0B3B'], [0.45, '#4B1B7A'], [0.75, '#8A2BE2'], [1, '#12061F']]);
      for (var i = 0; i < 7; i++) {                          /* nuvens */
        var g = x.createRadialGradient(
          Math.random() * t, Math.random() * t, 0,
          Math.random() * t, Math.random() * t, t * 0.45);
        g.addColorStop(0, 'rgba(' + (150 + Math.random() * 100 | 0) + ',60,255,0.22)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = g; x.fillRect(0, 0, t, t);
      }
      for (var s = 0; s < 90; s++) {                         /* estrelas */
        var a = 0.35 + Math.random() * 0.65;
        x.fillStyle = 'rgba(255,255,255,' + a + ')';
        var sz = Math.random() < 0.9 ? 1 : 2;
        x.fillRect(Math.random() * t, Math.random() * t, sz, sz);
      }
    },

    areia: function (x, t) {
      grad(x, t, [[0, '#F0DCB0'], [0.5, '#D9BD86'], [1, '#B99A63']]);
      for (var i = 0; i < t * t * 0.55; i++) {
        var v = 150 + Math.random() * 90 | 0;
        x.fillStyle = 'rgba(' + v + ',' + (v - 24) + ',' + (v - 70) + ',' + (0.15 + Math.random() * 0.4) + ')';
        x.fillRect(Math.random() * t, Math.random() * t, 1, 1);
      }
      for (var y = 0; y < t; y += 10) {                       /* ondulações */
        x.beginPath();
        for (var px = 0; px <= t; px += 3) {
          x.lineTo(px, y + Math.sin(px / 9 + y) * 2);
        }
        x.strokeStyle = 'rgba(140,110,70,0.18)'; x.lineWidth = 1.6; x.stroke();
      }
    },

    chocolate: function (x, t) {
      grad(x, t, [[0, '#5A2E12'], [0.35, '#7B4420'], [0.7, '#3B1F0B'], [1, '#241005']]);
      for (var i = 0; i < 40; i++) {                          /* bolhas */
        var cx = Math.random() * t, cy = Math.random() * t, r = 1 + Math.random() * 4;
        var g = x.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 0, cx, cy, r);
        g.addColorStop(0, 'rgba(190,130,80,0.65)');
        g.addColorStop(1, 'rgba(40,20,6,0.25)');
        x.fillStyle = g;
        x.beginPath(); x.arc(cx, cy, r, 0, 6.3); x.fill();
      }
      brilhoTopo(x, t, 0.16);
    },

    neon: function (x, t) {
      x.fillStyle = '#06030F'; x.fillRect(0, 0, t, t);
      var cores = ['#FF2D95', '#00E5FF', '#7C4DFF', '#FFE600'];
      for (var i = 0; i < 9; i++) {
        var c = cores[i % cores.length];
        x.strokeStyle = c;
        x.lineWidth = 2 + Math.random() * 3;
        x.shadowColor = c;
        x.shadowBlur = 10;
        x.beginPath();
        if (Math.random() < 0.5) {
          var yy = Math.random() * t;
          x.moveTo(0, yy); x.lineTo(t, yy + (Math.random() - 0.5) * 24);
        } else {
          var xx = Math.random() * t;
          x.moveTo(xx, 0); x.lineTo(xx + (Math.random() - 0.5) * 24, t);
        }
        x.stroke();
      }
      x.shadowBlur = 0;
    },

    tijolo: function (x, t) {
      x.fillStyle = '#2A211C'; x.fillRect(0, 0, t, t);       /* argamassa */
      var h = t / 4, w = t / 2;
      for (var row = 0; row < 4; row++) {
        var off = (row % 2) ? w / 2 : 0;
        for (var col = -1; col < 3; col++) {
          var bx = col * w + off + 2, by = row * h + 2;
          var g = x.createLinearGradient(bx, by, bx, by + h);
          g.addColorStop(0, '#B5503A');
          g.addColorStop(0.6, '#9C402C');
          g.addColorStop(1, '#7A2E20');
          x.fillStyle = g;
          x.fillRect(bx, by, w - 4, h - 4);
          x.fillStyle = 'rgba(255,255,255,0.07)';
          x.fillRect(bx, by, w - 4, 2);
        }
      }
      ruido(x, t, 0.18, true);
    },

    marmore: function (x, t) {
      grad(x, t, [[0, '#F7F9FB'], [0.5, '#E7EBF0'], [1, '#D2D8DF']]);
      for (var i = 0; i < 8; i++) {                          /* veios */
        x.beginPath();
        var px = Math.random() * t, py = -4;
        x.moveTo(px, py);
        while (py < t + 4) {
          py += 8 + Math.random() * 14;
          px += (Math.random() - 0.5) * 26;
          x.lineTo(px, py);
        }
        x.strokeStyle = 'rgba(120,130,145,' + (0.12 + Math.random() * 0.3) + ')';
        x.lineWidth = 0.8 + Math.random() * 2;
        x.stroke();
      }
    },

    couro: function (x, t) {
      grad(x, t, [[0, '#6B4A2F'], [0.5, '#553A24'], [1, '#3A2618']]);
      for (var i = 0; i < t * t * 0.22; i++) {               /* poros */
        x.fillStyle = 'rgba(0,0,0,' + (0.10 + Math.random() * 0.28) + ')';
        x.beginPath();
        x.arc(Math.random() * t, Math.random() * t, 0.6 + Math.random() * 1.2, 0, 6.3);
        x.fill();
      }
      brilhoTopo(x, t, 0.10);
    },

    plasma: function (x, t) {
      grad(x, t, [[0, '#2B0A4A'], [0.4, '#7B1FA2'], [0.7, '#E040FB'], [1, '#12041F']]);
      for (var i = 0; i < 12; i++) {
        var cx = Math.random() * t, cy = Math.random() * t;
        x.beginPath();
        for (var a = 0; a < 6.3; a += 0.25) {
          var r = 6 + Math.sin(a * 3 + i) * 8 + Math.random() * 4;
          var px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
          a === 0 ? x.moveTo(px, py) : x.lineTo(px, py);
        }
        x.strokeStyle = 'rgba(255,140,255,' + (0.25 + Math.random() * 0.4) + ')';
        x.lineWidth = 1.5;
        x.stroke();
      }
    },

    cristal: function (x, t) {
      grad(x, t, [[0, '#B8FFE8'], [0.45, '#3FD9B0'], [1, '#0E7A63']]);
      for (var i = 0; i < 10; i++) {                         /* facetas */
        x.beginPath();
        var cx = Math.random() * t, cy = Math.random() * t, r = 10 + Math.random() * 26;
        for (var s = 0; s < 6; s++) {
          var a = (Math.PI * 2 / 6) * s;
          var px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
          s === 0 ? x.moveTo(px, py) : x.lineTo(px, py);
        }
        x.closePath();
        x.fillStyle = 'rgba(255,255,255,' + (0.04 + Math.random() * 0.16) + ')';
        x.strokeStyle = 'rgba(255,255,255,' + (0.12 + Math.random() * 0.28) + ')';
        x.lineWidth = 1;
        x.fill(); x.stroke();
      }
      brilhoTopo(x, t, 0.30);
    },

    ferrugem: function (x, t) {
      grad(x, t, [[0, '#8A4B22'], [0.5, '#A65C22'], [1, '#4E2A12']]);
      for (var i = 0; i < 26; i++) {                         /* manchas */
        var cx = Math.random() * t, cy = Math.random() * t, r = 3 + Math.random() * 16;
        var g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, 'rgba(' + (150 + Math.random() * 80 | 0) + ',70,20,0.55)');
        g.addColorStop(1, 'rgba(60,25,8,0)');
        x.fillStyle = g;
        x.beginPath(); x.arc(cx, cy, r, 0, 6.3); x.fill();
      }
      ruido(x, t, 0.30, true);
    },

    concreto: function (x, t) {
      grad(x, t, [[0, '#B9BEC4'], [0.5, '#9AA0A7'], [1, '#7C828A']]);
      ruido(x, t, 0.35, true);
      ruido(x, t, 0.18, false);
      for (var i = 0; i < 40; i++) {                         /* poros */
        x.fillStyle = 'rgba(70,74,80,' + (0.10 + Math.random() * 0.25) + ')';
        x.beginPath();
        x.arc(Math.random() * t, Math.random() * t, 0.8 + Math.random() * 1.8, 0, 6.3);
        x.fill();
      }
    },

    holograma: function (x, t) {
      grad(x, t, [[0, 'rgba(0,60,90,0.9)'], [0.5, 'rgba(0,140,190,0.75)'], [1, 'rgba(0,60,90,0.9)']]);
      for (var y = 0; y < t; y += 3) {                       /* scanlines */
        x.fillStyle = 'rgba(0,229,255,' + (y % 6 === 0 ? 0.20 : 0.06) + ')';
        x.fillRect(0, y, t, 1);
      }
      x.strokeStyle = 'rgba(120,255,255,0.85)'; x.lineWidth = 1.5;
      x.strokeRect(3, 3, t - 6, t - 6);
      x.fillStyle = 'rgba(160,255,255,0.16)';
      x.fillRect(0, (Date.now() / 30) % t, t, 8);
    },

    /* ---------- +20 texturas ---------- */

    obsidiana: function (x, t) {
      grad(x, t, [[0, '#1A1226'], [0.45, '#0B0714'], [1, '#2A1B3D']]);
      for (var i = 0; i < 10; i++) {                          /* facetas de vidro vulcânico */
        x.beginPath();
        var cx = Math.random() * t, cy = Math.random() * t, r = 8 + Math.random() * 26;
        for (var s = 0; s < 3; s++) {
          var a = Math.random() * 6.3;
          var px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
          s === 0 ? x.moveTo(px, py) : x.lineTo(px, py);
        }
        x.closePath();
        x.fillStyle = 'rgba(120,80,190,' + (0.04 + Math.random() * 0.12) + ')';
        x.fill();
        x.strokeStyle = 'rgba(170,120,255,' + (0.10 + Math.random() * 0.25) + ')';
        x.lineWidth = 1; x.stroke();
      }
      brilhoTopo(x, t, 0.14);
    },

    basalto: function (x, t) {
      grad(x, t, [[0, '#3A3A40'], [0.5, '#26262C'], [1, '#151519']]);
      for (var i = 0; i < t * t * 0.4; i++) {
        var v = 30 + Math.random() * 60 | 0;
        x.fillStyle = 'rgba(' + v + ',' + v + ',' + (v + 4) + ',' + (0.2 + Math.random() * 0.45) + ')';
        x.fillRect(Math.random() * t, Math.random() * t, 1, 1);
      }
      for (var k = 0; k < 9; k++) {                           /* juntas colunares */
        x.beginPath();
        var px = Math.random() * t, py = 0;
        x.moveTo(px, py);
        while (py < t) { py += 10; px += (Math.random() - 0.5) * 8; x.lineTo(px, py); }
        x.strokeStyle = 'rgba(0,0,0,0.55)'; x.lineWidth = 1 + Math.random(); x.stroke();
      }
    },

    ametista: function (x, t) {
      grad(x, t, [[0, '#E8D5FF'], [0.4, '#A97BD8'], [0.75, '#6B3D9E'], [1, '#3A1A5C']]);
      for (var i = 0; i < 14; i++) {                          /* pontas de cristal */
        x.beginPath();
        var cx = Math.random() * t, cy = Math.random() * t;
        x.moveTo(cx, cy - 14 - Math.random() * 10);
        x.lineTo(cx + 6 + Math.random() * 6, cy);
        x.lineTo(cx, cy + 12);
        x.lineTo(cx - 6 - Math.random() * 6, cy);
        x.closePath();
        x.fillStyle = 'rgba(255,255,255,' + (0.05 + Math.random() * 0.18) + ')';
        x.strokeStyle = 'rgba(230,200,255,' + (0.2 + Math.random() * 0.3) + ')';
        x.lineWidth = 1; x.fill(); x.stroke();
      }
      brilhoTopo(x, t, 0.25);
    },

    rubi: function (x, t) {
      grad(x, t, [[0, '#FF6B8A'], [0.4, '#D4173D'], [0.75, '#8B0022'], [1, '#4A0011']]);
      for (var i = 0; i < 13; i++) {
        x.beginPath();
        var cx = Math.random() * t, cy = Math.random() * t, r = 7 + Math.random() * 20;
        for (var s = 0; s < 5; s++) {
          var a = (6.3 / 5) * s;
          var px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
          s === 0 ? x.moveTo(px, py) : x.lineTo(px, py);
        }
        x.closePath();
        x.fillStyle = 'rgba(255,255,255,' + (0.04 + Math.random() * 0.16) + ')';
        x.strokeStyle = 'rgba(255,170,190,' + (0.2 + Math.random() * 0.3) + ')';
        x.lineWidth = 1; x.fill(); x.stroke();
      }
      brilhoTopo(x, t, 0.28);
    },

    safira: function (x, t) {
      grad(x, t, [[0, '#BEE3FF'], [0.4, '#2E6FD4'], [0.75, '#0B3A85'], [1, '#041A44']]);
      for (var i = 0; i < 13; i++) {
        x.beginPath();
        var cx = Math.random() * t, cy = Math.random() * t, r = 6 + Math.random() * 22;
        for (var s = 0; s < 6; s++) {
          var a = (6.3 / 6) * s + Math.random() * 0.3;
          var px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
          s === 0 ? x.moveTo(px, py) : x.lineTo(px, py);
        }
        x.closePath();
        x.fillStyle = 'rgba(200,235,255,' + (0.05 + Math.random() * 0.18) + ')';
        x.strokeStyle = 'rgba(150,210,255,' + (0.2 + Math.random() * 0.3) + ')';
        x.lineWidth = 1; x.fill(); x.stroke();
      }
      brilhoTopo(x, t, 0.26);
    },

    turquesa: function (x, t) {
      grad(x, t, [[0, '#C9FFF2'], [0.4, '#37D6BE'], [0.75, '#0E8B7E'], [1, '#04423C']]);
      for (var i = 0; i < 12; i++) {
        var cx = Math.random() * t, cy = Math.random() * t;
        x.beginPath();
        x.moveTo(cx, cy - 10);
        x.quadraticCurveTo(cx + 10, cy, cx, cy + 10);
        x.quadraticCurveTo(cx - 10, cy, cx, cy - 10);
        x.fillStyle = 'rgba(255,255,255,' + (0.05 + Math.random() * 0.16) + ')';
        x.fill();
      }
      brilhoTopo(x, t, 0.22);
    },

    cobre: function (x, t) {
      grad(x, t, [[0, '#E09A63'], [0.45, '#B4652C'], [1, '#6E3413']]);
      ruido(x, t, 0.28, true);
      for (var i = 0; i < t; i += 6) {
        x.fillStyle = 'rgba(255,210,160,' + (0.05 + Math.random() * 0.10) + ')';
        x.fillRect(0, i, t, 1);
      }
      brilhoTopo(x, t, 0.26);
    },

    bronze: function (x, t) {
      grad(x, t, [[0, '#C9A227'], [0.4, '#8C6B1F'], [0.7, '#5C4310'], [1, '#33250A']]);
      ruido(x, t, 0.22, true);
      for (var i = 0; i < 8; i++) {                           /* pátina */
        var cx = Math.random() * t, cy = Math.random() * t, r = 5 + Math.random() * 16;
        var g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, 'rgba(70,160,130,0.30)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, 6.3); x.fill();
      }
      brilhoTopo(x, t, 0.20);
    },

    titanio: function (x, t) {
      grad(x, t, [[0, '#B9C6D4'], [0.35, '#6E7F91'], [0.65, '#3A4756'], [1, '#202932']]);
      for (var i = 0; i < t * t * 0.3; i++) {
        var v = 120 + Math.random() * 90 | 0;
        x.fillStyle = 'rgba(' + v + ',' + (v + 6) + ',' + (v + 14) + ',' + (0.08 + Math.random() * 0.22) + ')';
        x.fillRect(Math.random() * t, Math.random() * t, 1, 1);
      }
      for (var k = 0; k < 12; k++) {                          /* ranhuras diagonais */
        x.strokeStyle = 'rgba(255,255,255,' + (0.05 + Math.random() * 0.12) + ')';
        x.lineWidth = 1;
        x.beginPath();
        var yy = Math.random() * t;
        x.moveTo(0, yy); x.lineTo(t, yy - 6);
        x.stroke();
      }
      brilhoTopo(x, t, 0.24);
    },

    fibra_carbono: function (x, t) {
      x.fillStyle = '#12161A'; x.fillRect(0, 0, t, t);
      var cell = t / 8;
      for (var r = 0; r < 8; r++) {
        for (var c = 0; c < 8; c++) {
          var bx = c * cell, by = r * cell;
          x.fillStyle = (r + c) % 2 === 0 ? '#1E252C' : '#0C1013';
          x.fillRect(bx, by, cell, cell);
          x.strokeStyle = 'rgba(120,140,160,0.16)';
          x.lineWidth = 1;
          x.beginPath();
          if ((r + c) % 2 === 0) { x.moveTo(bx, by + cell * 0.5); x.lineTo(bx + cell, by + cell * 0.5); }
          else { x.moveTo(bx + cell * 0.5, by); x.lineTo(bx + cell * 0.5, by + cell); }
          x.stroke();
        }
      }
      brilhoTopo(x, t, 0.18);
    },

    camuflagem: function (x, t) {
      x.fillStyle = '#5A6B3A'; x.fillRect(0, 0, t, t);
      var cores = ['#3E4C27', '#7A8A4E', '#2B3520', '#93996A'];
      for (var i = 0; i < 26; i++) {
        x.fillStyle = cores[i % cores.length];
        x.beginPath();
        var cx = Math.random() * t, cy = Math.random() * t;
        var pts = 5 + (Math.random() * 4 | 0);
        for (var p = 0; p < pts; p++) {
          var a = (6.3 / pts) * p;
          var r = 8 + Math.random() * 18;
          var px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r * 0.75;
          p === 0 ? x.moveTo(px, py) : x.lineTo(px, py);
        }
        x.closePath(); x.fill();
      }
      ruido(x, t, 0.16, true);
    },

    zebra: function (x, t) {
      grad(x, t, [[0, '#F7F7F2'], [1, '#DEDCD2']]);
      for (var i = 0; i < 9; i++) {                           /* listras verticais */
        x.beginPath();
        var px = i * (t / 8.5) + (Math.random() - 0.5) * 6;
        x.moveTo(px, -4);
        x.bezierCurveTo(px + 14, t * 0.3, px - 12, t * 0.7, px + 8, t + 4);
        x.strokeStyle = '#141414';
        x.lineWidth = 4 + Math.random() * 5;
        x.stroke();
      }
      ruido(x, t, 0.08, true);
    },

    tigre: function (x, t) {
      grad(x, t, [[0, '#F5A63A'], [0.45, '#E07B1E'], [1, '#B85A10']]);
      for (var i = 0; i < 8; i++) {                           /* listras horizontais */
        var py = i * (t / 7.5) + (Math.random() - 0.5) * 8;
        x.beginPath();
        x.moveTo(-4, py);
        x.bezierCurveTo(t * 0.3, py + 12, t * 0.7, py - 12, t + 4, py + 6);
        x.strokeStyle = 'rgba(25,15,5,0.85)';
        x.lineWidth = 3 + Math.random() * 4;
        x.stroke();
      }
      ruido(x, t, 0.14, true);
      brilhoTopo(x, t, 0.10);
    },

    veludo: function (x, t) {
      grad(x, t, [[0, '#7B1E4A'], [0.5, '#5A1233'], [1, '#2E0719']]);
      for (var i = 0; i < t * t * 0.35; i++) {
        x.fillStyle = 'rgba(255,180,220,' + (0.03 + Math.random() * 0.10) + ')';
        x.fillRect(Math.random() * t, Math.random() * t, 1, 1);
      }
      for (var s = 0; s < 8; s++) {                           /* dobras */
        x.beginPath();
        var px = Math.random() * t;
        x.moveTo(px, 0);
        x.quadraticCurveTo(px + 20, t * 0.5, px, t);
        x.strokeStyle = 'rgba(255,190,230,0.07)';
        x.lineWidth = 4 + Math.random() * 6;
        x.stroke();
      }
      brilhoTopo(x, t, 0.10);
    },

    pergaminho: function (x, t) {
      grad(x, t, [[0, '#F3E4C3'], [0.5, '#E4CE9F'], [1, '#C7A972']]);
      for (var i = 0; i < 18; i++) {                          /* manchas de idade */
        var cx = Math.random() * t, cy = Math.random() * t, r = 4 + Math.random() * 18;
        var g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, 'rgba(150,110,60,0.22)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, 6.3); x.fill();
      }
      x.strokeStyle = 'rgba(120,85,40,0.18)';
      x.lineWidth = 0.8;
      for (var k = 0; k < 20; k++) {                          /* fibras */
        var yy = Math.random() * t;
        x.beginPath(); x.moveTo(0, yy); x.lineTo(t, yy + (Math.random() - 0.5) * 4); x.stroke();
      }
    },

    circuito: function (x, t) {
      x.fillStyle = '#0A2018'; x.fillRect(0, 0, t, t);
      var verde = '#2FE08A';
      for (var i = 0; i < 20; i++) {                          /* trilhas */
        x.strokeStyle = 'rgba(47,224,138,' + (0.25 + Math.random() * 0.5) + ')';
        x.lineWidth = 1 + Math.random() * 1.5;
        x.beginPath();
        var px = Math.random() * t, py = Math.random() * t;
        x.moveTo(px, py);
        for (var s = 0; s < 4; s++) {
          if (Math.random() < 0.5) px += (Math.random() - 0.5) * 40;
          else py += (Math.random() - 0.5) * 40;
          x.lineTo(px, py);
        }
        x.stroke();
        x.fillStyle = verde;
        x.beginPath(); x.arc(px, py, 1.8, 0, 6.3); x.fill();
      }
      for (var c = 0; c < 10; c++) {                          /* chips */
        x.fillStyle = 'rgba(10,40,30,0.9)';
        x.strokeStyle = 'rgba(47,224,138,0.55)';
        x.lineWidth = 1;
        var bw = 8 + Math.random() * 14, bh = 6 + Math.random() * 10;
        var bx = Math.random() * (t - bw), by = Math.random() * (t - bh);
        x.fillRect(bx, by, bw, bh); x.strokeRect(bx, by, bw, bh);
      }
    },

    binario: function (x, t) {
      x.fillStyle = '#020A04'; x.fillRect(0, 0, t, t);
      x.font = '10px monospace';
      for (var c = 0; c < t; c += 9) {
        for (var r = 0; r < t; r += 12) {
          var a = 0.15 + Math.random() * 0.75;
          x.fillStyle = 'rgba(' + (30 + Math.random() * 60 | 0) + ',' + (200 + Math.random() * 55 | 0) + ',90,' + a + ')';
          x.fillText(Math.random() < 0.5 ? '0' : '1', c, r + 10);
        }
      }
      var g = x.createLinearGradient(0, 0, 0, t);
      g.addColorStop(0, 'rgba(0,0,0,0.55)');
      g.addColorStop(0.5, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.55)');
      x.fillStyle = g; x.fillRect(0, 0, t, t);
    },

    aurora: function (x, t) {
      grad(x, t, [[0, '#020814'], [0.55, '#062036'], [1, '#01060F']]);
      for (var i = 0; i < 6; i++) {                           /* cortinas */
        var g = x.createLinearGradient(0, t * Math.random(), t, t);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(0.4, i % 2 ? 'rgba(0,255,170,0.30)' : 'rgba(120,80,255,0.28)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = g;
        x.beginPath();
        x.moveTo(0, t);
        for (var px = 0; px <= t; px += 8) {
          x.lineTo(px, t * 0.45 + Math.sin(px / 18 + i) * 22);
        }
        x.lineTo(t, t); x.closePath();
        x.fill();
      }
      for (var s = 0; s < 40; s++) {
        x.fillStyle = 'rgba(255,255,255,' + (0.2 + Math.random() * 0.5) + ')';
        x.fillRect(Math.random() * t, Math.random() * t * 0.6, 1, 1);
      }
    },

    fogo_azul: function (x, t) {
      grad(x, t, [[0, '#DFF6FF'], [0.3, '#5FC8FF'], [0.65, '#1E6FE0'], [1, '#0A1F5C']]);
      for (var i = 0; i < 18; i++) {                          /* línguas de chama */
        x.beginPath();
        var cx = Math.random() * t, base = t;
        x.moveTo(cx - 5, base);
        x.quadraticCurveTo(cx - 9, t * 0.5, cx, t * (0.1 + Math.random() * 0.25));
        x.quadraticCurveTo(cx + 9, t * 0.5, cx + 5, base);
        x.closePath();
        x.fillStyle = 'rgba(180,240,255,' + (0.06 + Math.random() * 0.16) + ')';
        x.fill();
      }
      for (var k = 0; k < 60; k++) {
        x.fillStyle = 'rgba(220,250,255,' + (0.2 + Math.random() * 0.6) + ')';
        x.fillRect(Math.random() * t, Math.random() * t, 1, 1 + Math.random() * 2);
      }
    },

    pantano: function (x, t) {
      grad(x, t, [[0, '#4A5A22'], [0.45, '#2E3D14'], [1, '#141C08']]);
      for (var i = 0; i < 14; i++) {                          /* poças */
        var cx = Math.random() * t, cy = Math.random() * t, r = 6 + Math.random() * 20;
        var g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, 'rgba(90,130,50,0.45)');
        g.addColorStop(1, 'rgba(10,20,4,0)');
        x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, 6.3); x.fill();
      }
      for (var s = 0; s < 60; s++) {                          /* lodo */
        x.fillStyle = 'rgba(120,140,60,' + (0.1 + Math.random() * 0.3) + ')';
        x.fillRect(Math.random() * t, Math.random() * t, 1 + Math.random() * 2, 1);
      }
    },
  };

  var NOMES = Object.keys(TEX);

  /* ---------- API ---------- */

  function canvas(nome, tam) {
    var n = String(nome || '').toLowerCase().trim();
    if (!TEX[n]) n = mapear(n);
    var t = tam || TAM;
    var key = n + '@' + t;
    if (CACHE[key]) return CACHE[key];
    var c = novo(t);
    var x = c.getContext('2d');
    try { TEX[n](x, t); } catch (e) { x.fillStyle = '#888'; x.fillRect(0, 0, t, t); }
    CACHE[key] = c;
    return c;
  }

  /* Traduz pedidos livres para a textura mais próxima do pack. */
  var SINONIMOS = [
    ['lava', ['lava', 'magma', 'fogo', 'vulcao', 'vulcão', 'inferno', 'brasa']],
    ['metal', ['metal', 'aco', 'aço', 'ferro', 'industrial', 'nave']],
    ['cromo', ['cromo', 'cromado', 'espelho']],
    ['ouro', ['ouro', 'dourado', 'moeda', 'tesouro']],
    ['vidro', ['vidro', 'cristalino', 'transparente']],
    ['madeira', ['madeira', 'tronco', 'mogno', 'carvalho']],
    ['pedra', ['pedra', 'rocha', 'granito', 'montanha']],
    ['gelo', ['gelo', 'neve', 'glacial', 'inverno']],
    ['agua', ['agua', 'água', 'oceano', 'mar', 'piscina']],
    ['grama', ['grama', 'relva', 'campo', 'selva']],
    ['asfalto', ['asfalto', 'pista', 'estrada', 'corrida']],
    ['grade', ['grade', 'grid', 'retro', 'tron', 'hacker']],
    ['nebulosa', ['nebulosa', 'galaxia', 'galáxia', 'espaco', 'espaço', 'estrelas']],
    ['areia', ['areia', 'deserto', 'praia', 'duna']],
    ['chocolate', ['chocolate', 'cacau', 'doce']],
    ['neon', ['neon', 'cyberpunk', 'laser', 'fluorescente']],
    ['tijolo', ['tijolo', 'alvenaria', 'parede']],
    ['marmore', ['marmore', 'mármore', 'luxo', 'elegante']],
    ['couro', ['couro', 'pele', 'sapato']],
    ['plasma', ['plasma', 'energia', 'mágico', 'magico', 'portal']],
    ['cristal', ['cristal', 'esmeralda', 'gema', 'joia', 'jóia']],
    ['ferrugem', ['ferrugem', 'enferrujado', 'velho', 'sucata']],
    ['concreto', ['concreto', 'cimento', 'urbano', 'predio', 'prédio']],
    ['holograma', ['holograma', 'holografico', 'holográfico', 'digital', 'projecao']],
    ['obsidiana', ['obsidiana', 'vidro vulcanico', 'vidro vulcânico', 'preto brilhante']],
    ['basalto', ['basalto', 'vulcanica', 'vulcânica', 'rocha negra']],
    ['ametista', ['ametista', 'purpura', 'púrpura', 'gema roxa']],
    ['rubi', ['rubi', 'gema vermelha', 'granada']],
    ['safira', ['safira', 'gema azul', 'azul profundo']],
    ['turquesa', ['turquesa', 'agua-marinha', 'água-marinha', 'ciano pedra']],
    ['cobre', ['cobre', 'cobreado', 'metal laranja']],
    ['bronze', ['bronze', 'metal antigo', 'medalha']],
    ['titanio', ['titanio', 'titânio', 'metal azulado', 'aco azul', 'aço azul']],
    ['fibra_carbono', ['carbono', 'fibra de carbono', 'racing', 'corrida profissional', 'karbon']],
    ['camuflagem', ['camuflagem', 'militar', 'exercito', 'exército', 'tatico', 'tático']],
    ['zebra', ['zebra', 'listras preto e branco', 'animal listrado']],
    ['tigre', ['tigre', 'felino', 'laranja listrado']],
    ['veludo', ['veludo', 'tecido', 'seda', 'cortina', 'luxo tecido']],
    ['pergaminho', ['pergaminho', 'papel velho', 'mapa antigo', 'medieval', 'antigo']],
    ['circuito', ['circuito', 'pcb', 'placa', 'eletronica', 'eletrônica', 'chip']],
    ['binario', ['binario', 'binário', 'matrix', 'codigo', 'código', 'hacker verde']],
    ['aurora', ['aurora', 'aurora boreal', 'ceu verde', 'céu verde', 'polar']],
    ['fogo_azul', ['fogo azul', 'chama azul', 'plasma azul', 'gelo em chamas']],
    ['pantano', ['pantano', 'pântano', 'lodo', 'swamp', 'charco']]
  ];

  function mapear(nome) {
    var n = String(nome || '');
    for (var i = 0; i < SINONIMOS.length; i++) {
      var alvo = SINONIMOS[i][0], chaves = SINONIMOS[i][1];
      for (var k = 0; k < chaves.length; k++) {
        if (n.indexOf(chaves[k]) >= 0) return alvo;
      }
    }
    return 'pedra';
  }

  function pattern(ctx, nome, tam) {
    if (!ctx) return null;
    var n = String(nome || '').toLowerCase().trim();
    if (!TEX[n]) n = mapear(n);
    for (var i = 0; i < PATTERNS.length; i++) {
      if (PATTERNS[i].ctx === ctx && PATTERNS[i].nome === n) return PATTERNS[i].pat;
    }
    var pat = ctx.createPattern(canvas(n, tam), 'repeat');
    PATTERNS.push({ ctx: ctx, nome: n, pat: pat });
    if (PATTERNS.length > 60) PATTERNS.shift();
    return pat;
  }

  /* Bloco com textura + brilho no topo e sombra na base (estilo pixel/arcade). */
  function bloco(ctx, x0, y0, w, h, nome) {
    if (!ctx) return;
    ctx.save();
    ctx.fillStyle = pattern(ctx, nome) || '#888';
    ctx.fillRect(x0, y0, w, h);
    var lg = ctx.createLinearGradient(x0, y0, x0, y0 + h);
    lg.addColorStop(0, 'rgba(255,255,255,0.38)');
    lg.addColorStop(0.45, 'rgba(255,255,255,0.04)');
    lg.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = lg;
    ctx.fillRect(x0, y0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillRect(x0 + 1, y0 + 1, w - 2, Math.max(1, h * 0.06));
    ctx.fillStyle = 'rgba(0,0,0,0.40)';
    ctx.fillRect(x0 + 1, y0 + h - Math.max(1, h * 0.08), w - 2, Math.max(1, h * 0.08));
    ctx.restore();
  }

  function css(nome) {
    return 'url(' + canvas(nome).toDataURL() + ')';
  }

  function three(nome) {
    if (typeof THREE === 'undefined' || !THREE.CanvasTexture) return null;
    var t = new THREE.CanvasTexture(canvas(nome, 256));
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    return t;
  }

  function aleatoria() {
    return NOMES[Math.floor(Math.random() * NOMES.length)];
  }

  window.NxTex = {
    names: function () { return NOMES.slice(); },
    canvas: canvas,
    pattern: pattern,
    bloco: bloco,
    css: css,
    three: three,
    aleatoria: aleatoria,
    mapear: mapear,
    version: '1.0.0'
  };
})();

/* ============================================================
 * nx-materials.js — Sistema de Materiais PBR + Texturas Processuais
 * ============================================================
 * Substitui o antigo nx-textures.js (88 texturas removidas).
 *
 * API global `NxMat` (plana):
 *   NxMat.threeMat(nome, cor, opts)     → THREE.MeshStandardMaterial configurado
 *   NxMat.threeCanvas(nome, cor, repeat) → THREE.CanvasTexture procedural
 *   NxMat.threeNormal(nome)             → normal map procedural
 *   NxMat.threeNeon(cor)                → material emissivo neon
 *   NxMat.threeGel(cor)                 → MeshPhysicalMaterial translúcido
 *
 *   NxMat.pixiTexture(nome, cor)        → textura PIXI.FillPattern
 *   NxMat.phaserTexture(nome, cor)      → textura para Phaser
 *   NxMat.canvasPattern(nome, cor)      → CanvasPattern
 *   NxMat.canvasDataUrl(nome, cor)      → data URL
 *
 *   NxMat.shader(nome)                  → { vertex, fragment } GLSL pra OGL / raw WebGL
 *
 *   NxMat.select(cena, estilo)          → escolhe materiais pra cena
 *   NxMat.names()                       → lista de materiais disponíveis
 * ============================================================ */
(function () {
  'use strict';
  if (window.NxMat) return;

  var CACHE = {};
  var TAM = 256;

  /* ---------- helpers de desenho procedural ---------- */
  function canvas(tam) {
    var c = document.createElement('canvas');
    c.width = c.height = tam || TAM;
    return c;
  }

  function noise(c, tam, alpha, dark) {
    var ctx = c.getContext('2d');
    for (var i = 0; i < tam * tam * 0.3; i++) {
      var a = Math.random() * alpha;
      var v = Math.floor(Math.random() * 80);
      ctx.fillStyle = dark
        ? 'rgba(0,0,0,' + a.toFixed(3) + ')'
        : 'rgba(' + (170 + v) + ',' + (170 + v) + ',' + (170 + v) + ',' + a.toFixed(3) + ')';
      ctx.fillRect(Math.random() * tam | 0, Math.random() * tam | 0, 1, 1);
    }
  }

  function grad(c, cor1, cor2, dir) {
    var ctx = c.getContext('2d');
    var g = dir === 'h'
      ? ctx.createLinearGradient(0, 0, c.width, 0)
      : ctx.createLinearGradient(0, 0, 0, c.height);
    g.addColorStop(0, cor1); g.addColorStop(1, cor2);
    ctx.fillStyle = g; ctx.fillRect(0, 0, c.width, c.height);
  }

  function hex2rgb(h) {
    var n = parseInt(String(h).replace('#',''), 16);
    return { r: (n>>16)&255, g: (n>>8)&255, b: n&255 };
  }

  /* ================================================================
   * TEXTURAS PROCESSUAIS POR NOME
   * ================================================================ */
  var TEX = {};

  /* Metais */
  TEX.metal_brilhante = function (c, t, cor) {
    var ctx = c.getContext('2d');
    var rgb = cor ? hex2rgb(cor) : { r: 200, g: 210, b: 220 };
    ctx.fillStyle = 'rgb(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ')';
    ctx.fillRect(0, 0, c.width, c.height);
    noise(c, c.width, 0.12, false);
    /* riscos de metal escovado */
    for (var i = 0; i < 60; i++) {
      var y = Math.random() * c.height;
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.03 + Math.random() * 0.08) + ')';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(c.width, y + (Math.random() - 0.5) * 2); ctx.stroke();
    }
  };

  TEX.metal_escuro = function (c) {
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#2a2a30'; ctx.fillRect(0, 0, c.width, c.height);
    noise(c, c.width, 0.2, true);
    for (var i = 0; i < 40; i++) {
      ctx.strokeStyle = 'rgba(180,180,200,' + (0.02 + Math.random() * 0.05) + ')';
      ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(Math.random() * c.width, 0); ctx.lineTo(Math.random() * c.width, c.height); ctx.stroke();
    }
  };

  TEX.metal_dourado = function (c) {
    grad(c, '#b8860b', '#daa520', 'h');
    noise(c, c.width, 0.10, true);
  };

  /* Plásticos */
  TEX.plastico_fosco = function (c, t, cor) {
    var ctx = c.getContext('2d');
    ctx.fillStyle = cor || '#3a6ea5'; ctx.fillRect(0, 0, c.width, c.height);
    noise(c, c.width, 0.06, false);
  };

  TEX.plastico_brilhante = function (c, t, cor) {
    var ctx = c.getContext('2d');
    ctx.fillStyle = cor || '#cc3333'; ctx.fillRect(0, 0, c.width, c.height);
    /* brilho no canto */
    var g = ctx.createRadialGradient(20, 20, 5, 20, 20, 60);
    g.addColorStop(0, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 80, 80);
    noise(c, c.width, 0.04, false);
  };

  /* Pedras */
  TEX.pedra_cinza = function (c) {
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#6b6b6b'; ctx.fillRect(0, 0, c.width, c.height);
    noise(c, c.width, 0.3, true);
    /* veios */
    for (var i = 0; i < 8; i++) {
      ctx.strokeStyle = 'rgba(80,80,80,0.2)';
      ctx.lineWidth = 1 + Math.random() * 2;
      ctx.beginPath(); ctx.moveTo(Math.random() * c.width, 0);
      ctx.lineTo(Math.random() * c.width, c.height); ctx.stroke();
    }
  };

  TEX.pedra_ardosia = function (c) {
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#3d3d4a'; ctx.fillRect(0, 0, c.width, c.height);
    noise(c, c.width, 0.25, true);
    for (var i = 0; i < 12; i++) {
      ctx.strokeStyle = 'rgba(60,60,80,0.3)';
      ctx.beginPath(); ctx.moveTo(0, i * (c.height / 12) + Math.random() * 4);
      ctx.lineTo(c.width, i * (c.height / 12) + Math.random() * 4); ctx.stroke();
    }
  };

  /* Madeira */
  TEX.madeira_clara = function (c) {
    var ctx = c.getContext('2d');
    grad(c, '#c4a265', '#a08050', 'v');
    for (var i = 0; i < 40; i++) {
      var y = Math.random() * c.height;
      ctx.strokeStyle = 'rgba(120,80,40,' + (0.04 + Math.random() * 0.08) + ')';
      ctx.lineWidth = 1 + Math.random() * 2;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.bezierCurveTo(c.width * 0.3, y + (Math.random() - 0.5) * 6, c.width * 0.7, y + (Math.random() - 0.5) * 6, c.width, y); ctx.stroke();
    }
  };

  TEX.madeira_escura = function (c) {
    var ctx = c.getContext('2d');
    grad(c, '#5c3a1e', '#3a2210', 'v');
    for (var i = 0; i < 30; i++) {
      var y = Math.random() * c.height;
      ctx.strokeStyle = 'rgba(30,15,5,' + (0.06 + Math.random() * 0.1) + ')';
      ctx.beginPath(); ctx.moveTo(0, y); ctx.bezierCurveTo(c.width * 0.4, y + (Math.random() - 0.5) * 5, c.width * 0.6, y + (Math.random() - 0.5) * 5, c.width, y); ctx.stroke();
    }
  };

  /* Tecidos */
  TEX.tecido_liso = function (c, t, cor) {
    var ctx = c.getContext('2d');
    ctx.fillStyle = cor || '#4a6a5a'; ctx.fillRect(0, 0, c.width, c.height);
    noise(c, c.width, 0.08, true);
    /* trama */
    for (var i = 0; i < c.width; i += 4) {
      ctx.strokeStyle = 'rgba(255,255,255,0.02)';
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, c.height); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(c.width, i); ctx.stroke();
    }
  };

  /* Concreto */
  TEX.concreto = function (c) {
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#888888'; ctx.fillRect(0, 0, c.width, c.height);
    noise(c, c.width, 0.35, true);
    /* manchas */
    for (var i = 0; i < 10; i++) {
      var x = Math.random() * c.width, y = Math.random() * c.height;
      var r = 10 + Math.random() * 30;
      ctx.fillStyle = 'rgba(60,60,60,' + (0.04 + Math.random() * 0.06) + ')';
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
  };

  /* Terra / solo */
  TEX.terra = function (c) {
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#6b4a2e'; ctx.fillRect(0, 0, c.width, c.height);
    noise(c, c.width, 0.4, false);
    for (var i = 0; i < 15; i++) {
      var x = Math.random() * c.width, y = Math.random() * c.height;
      ctx.fillStyle = 'rgba(40,25,10,' + (0.06 + Math.random() * 0.1) + ')';
      ctx.beginPath(); ctx.arc(x, y, 3 + Math.random() * 6, 0, Math.PI * 2); ctx.fill();
    }
  };

  /* Neon / emissivo */
  TEX.neon = function (c, t, cor) {
    var ctx = c.getContext('2d');
    ctx.fillStyle = cor || '#ff0077'; ctx.fillRect(0, 0, c.width, c.height);
    /* grade hexagonal */
    for (var y = 0; y < c.height; y += 12) {
      for (var x = 0; x < c.width; x += 20) {
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(x, y, 18, 10);
      }
    }
  };

  /* Vidro */
  TEX.vidro = function (c) {
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#aaddff'; ctx.globalAlpha = 0.15; ctx.fillRect(0, 0, c.width, c.height);
    ctx.globalAlpha = 1;
    /* reflexos */
    var g = ctx.createLinearGradient(10, 10, 60, 60);
    g.addColorStop(0, 'rgba(255,255,255,0.3)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(5, 5, 60, 60);
    noise(c, c.width, 0.03, false);
  };

  /* Borg / cyber */
  TEX.circuito = function (c) {
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#0a1a0a'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = '#00e88a'; ctx.lineWidth = 1;
    for (var i = 0; i < 20; i++) {
      var x = Math.random() * c.width, y = Math.random() * c.height;
      ctx.globalAlpha = 0.15 + Math.random() * 0.25;
      ctx.beginPath(); ctx.moveTo(x, y);
      ctx.lineTo(x + (Math.random() - 0.5) * 40, y + (Math.random() - 0.5) * 40);
      ctx.lineTo(x + (Math.random() - 0.5) * 60, y + (Math.random() - 0.5) * 60);
      ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  };

  /* Energia */
  TEX.energia = function (c) {
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#0a0020'; ctx.fillRect(0, 0, c.width, c.height);
    for (var i = 0; i < 15; i++) {
      var x = Math.random() * c.width;
      ctx.strokeStyle = 'rgba(0,200,255,' + (0.1 + Math.random() * 0.3) + ')';
      ctx.lineWidth = 1 + Math.random() * 3;
      ctx.beginPath(); ctx.moveTo(x, 0);
      var px = x, py = 0;
      for (var s = 0; s < 12; s++) {
        px += (Math.random() - 0.5) * 30;
        py += c.height / 12;
        ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
  };

  /* Lava */
  TEX.lava = function (c) {
    var ctx = c.getContext('2d');
    grad(c, '#ff4400', '#ffaa00', 'v');
    noise(c, c.width, 0.15, true);
    for (var i = 0; i < 10; i++) {
      ctx.fillStyle = 'rgba(255,200,50,' + (0.05 + Math.random() * 0.1) + ')';
      ctx.beginPath(); ctx.arc(Math.random() * c.width, Math.random() * c.height, 5 + Math.random() * 15, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  /* Mármore */
  TEX.marmore = function (c) {
    var ctx = c.getContext('2d');
    grad(c, '#e8e0d8', '#d0c8c0', 'h');
    noise(c, c.width, 0.05, false);
    for (var i = 0; i < 20; i++) {
      ctx.strokeStyle = 'rgba(100,90,80,' + (0.03 + Math.random() * 0.07) + ')';
      ctx.lineWidth = 0.5 + Math.random() * 1.5;
      ctx.beginPath(); ctx.moveTo(Math.random() * c.width, Math.random() * c.height);
      ctx.bezierCurveTo(
        Math.random() * c.width, Math.random() * c.height,
        Math.random() * c.width, Math.random() * c.height,
        Math.random() * c.width, Math.random() * c.height);
      ctx.stroke();
    }
  };

  /* Borracha */
  TEX.borracha = function (c, t, cor) {
    var ctx = c.getContext('2d');
    ctx.fillStyle = cor || '#1a1a1a'; ctx.fillRect(0, 0, c.width, c.height);
    noise(c, c.width, 0.15, true);
  };

  /* Grade tecnológica */
  TEX.grade = function (c) {
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#0d1117'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = '#00e88a'; ctx.lineWidth = 0.5;
    ctx.globalAlpha = 0.2;
    for (var x = 0; x < c.width; x += 16) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, c.height); ctx.stroke(); }
    for (var y = 0; y < c.height; y += 16) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(c.width, y); ctx.stroke(); }
    ctx.globalAlpha = 1;
  };

  /* Holograma */
  TEX.holograma = function (c) {
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#001020'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = '#00ccff'; ctx.globalAlpha = 0.15;
    for (var i = 0; i < 30; i++) {
      var x = Math.random() * c.width, y = Math.random() * c.height;
      ctx.beginPath(); ctx.arc(x, y, 5 + Math.random() * 15, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    /* scanline */
    for (var sy = 0; sy < c.height; sy += 3) {
      ctx.fillStyle = 'rgba(0,200,255,0.03)';
      ctx.fillRect(0, sy, c.width, 1);
    }
  };

  /* Camuflado */
  TEX.camuflado = function (c) {
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#4a6a3a'; ctx.fillRect(0, 0, c.width, c.height);
    var cores = ['#3a5a2a', '#5a7a4a', '#2a4a1a', '#6a5a3a'];
    for (var i = 0; i < 25; i++) {
      ctx.fillStyle = cores[i % cores.length];
      ctx.beginPath();
      ctx.ellipse(Math.random() * c.width, Math.random() * c.height, 8 + Math.random() * 20, 6 + Math.random() * 14, Math.random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  /* ================================================================
   * FAMÍLIAS DE MATERIAIS (roughness, metalness, mapas)
   * ================================================================ */
  var FAMILIAS = {
    /* Metais */
    metal_brilhante:     { roughness: 0.18, metalness: 0.95, emissive: null, normal: 2 },
    metal_escuro:        { roughness: 0.22, metalness: 0.92, emissive: null, normal: 3 },
    metal_dourado:       { roughness: 0.15, metalness: 0.98, emissive: null, normal: 2 },
    /* Plásticos */
    plastico_fosco:      { roughness: 0.65, metalness: 0.0,  emissive: null, normal: 1 },
    plastico_brilhante:  { roughness: 0.15, metalness: 0.0,  emissive: null, normal: 1 },
    /* Pedra */
    pedra_cinza:         { roughness: 0.88, metalness: 0.0,  emissive: null, normal: 5 },
    pedra_ardosia:       { roughness: 0.75, metalness: 0.05, emissive: null, normal: 4 },
    /* Madeira */
    madeira_clara:       { roughness: 0.80, metalness: 0.0,  emissive: null, normal: 3 },
    madeira_escura:      { roughness: 0.82, metalness: 0.0,  emissive: null, normal: 3 },
    /* Tecido */
    tecido_liso:         { roughness: 0.92, metalness: 0.0,  emissive: null, normal: 1 },
    /* Construção */
    concreto:            { roughness: 0.90, metalness: 0.0,  emissive: null, normal: 4 },
    terra:               { roughness: 0.95, metalness: 0.0,  emissive: null, normal: 5 },
    marmore:             { roughness: 0.15, metalness: 0.0,  emissive: null, normal: 2 },
    /* Especiais */
    neon:                { roughness: 0.3,  metalness: 0.1,  emissive: '#ff0077', normal: 1 },
    vidro:               { roughness: 0.05, metalness: 0.0,  emissive: null, normal: 1, transmission: 0.85, ior: 1.45 },
    circuito:            { roughness: 0.35, metalness: 0.8,  emissive: '#00e88a', normal: 2 },
    energia:             { roughness: 0.2,  metalness: 0.3,  emissive: '#0088ff', normal: 1 },
    lava:                { roughness: 0.95, metalness: 0.0,  emissive: '#ff6600', normal: 3 },
    borracha:            { roughness: 0.90, metalness: 0.0,  emissive: null, normal: 1 },
    grade:               { roughness: 0.4,  metalness: 0.7,  emissive: '#00e88a', normal: 2 },
    holograma:           { roughness: 0.1,  metalness: 0.0,  emissive: '#00ccff', normal: 1 },
    camuflado:           { roughness: 0.85, metalness: 0.0,  emissive: null, normal: 2 },
  };

  /* ================================================================
   * SINÔNIMOS (pt-BR + en) para match textual
   * ================================================================ */
  var SINONIMOS = {
    metal_brilhante:    ['metal', 'metal polido', 'aco', 'steel', 'polished metal', 'cromo', 'chrome', 'prata', 'silver'],
    metal_escuro:       ['metal escuro', 'ferro', 'iron', 'dark metal', 'aco escuro', 'gunmetal'],
    metal_dourado:      ['ouro', 'gold', 'golden', 'metal dourado', 'latão', 'brass'],
    plastico_fosco:     ['plastic', 'plastico', 'plastic soft', 'plastico fosco', 'acrilico', 'acrylic'],
    plastico_brilhante: ['plastico brilhante', 'plastic shiny', 'polido', 'ABS', 'resina'],
    pedra_cinza:        ['pedra', 'stone', 'gray stone', 'pedra cinza', 'rocha', 'rock', 'granito', 'granite'],
    pedra_ardosia:      ['ardosia', 'slate', 'pedra escura', 'dark stone', 'basalto', 'basalt'],
    madeira_clara:      ['madeira', 'wood', 'light wood', 'madeira clara', 'pinho', 'pine', 'carvalho', 'oak'],
    madeira_escura:     ['madeira escura', 'dark wood', 'nogueira', 'walnut', 'cerejeira', 'cherry', 'mogno', 'mahogany'],
    tecido_liso:        ['tecido', 'fabric', 'cloth', 'pano', 'textile', 'veludo', 'velvet', 'lona', 'canvas'],
    concreto:           ['concrete', 'concreto', 'cimento', 'cement'],
    terra:              ['terra', 'soil', 'dirt', 'solo', 'barro', 'mud', 'terreno'],
    marmore:            ['marmore', 'marble', 'white marble', 'pedra branca'],
    neon:               ['neon', 'neon light', 'luz neon', 'glow', 'led', 'luminoso'],
    vidro:              ['vidro', 'glass', 'cristal', 'crystal', 'transparente', 'vitro'],
    circuito:           ['circuito', 'circuit', 'cyber', 'tech', 'tecnologico', 'placa', 'board', 'eletronico'],
    energia:            ['energia', 'energy', 'power', 'eletrico', 'electric', 'força', 'lightning', 'raio'],
    lava:               ['lava', 'magma', 'fogo', 'fire', 'flame', 'chama'],
    borracha:           ['borracha', 'rubber', 'preto fosco', 'matte black', 'neoprene'],
    grade:              ['grade', 'grid', 'tech grid', 'cyber grid', 'digital', 'matrix'],
    holograma:          ['holograma', 'hologram', 'holographic', 'projecao', 'projection', 'scan'],
    camuflado:          ['camuflado', 'camouflage', 'militar', 'military', 'camo', 'exército', 'army'],
  };

  /* ================================================================
   * API PRINCIPAL
   * ================================================================ */

  /* Obtém ou gera o canvas de textura */
  function getCanvas(nome, tam, cor) {
    var key = nome + '|' + (tam || TAM) + '|' + (cor || '');
    if (CACHE[key]) return CACHE[key];
    if (!TEX[nome]) return null;
    var c = canvas(tam);
    TEX[nome](c, tam, cor);
    CACHE[key] = c;
    return c;
  }

  /* Limpa cache (troca de cena) */
  function clearCache() {
    CACHE = {};
  }

  /* Lista todos os nomes */
  function names() {
    return Object.keys(FAMILIAS).sort();
  }

  /* Um nome aleatório */
  function random() {
    var list = names();
    return list[Math.floor(Math.random() * list.length)];
  }

  /* Busca por sinônimo ou nome parcial */
  function fuzzyFind(query) {
    var q = String(query || '').toLowerCase().trim();
    if (!q) return null;
    /* match exato no nome */
    if (FAMILIAS[q]) return q;
    /* match em sinônimos */
    for (var nome in SINONIMOS) {
      var list = SINONIMOS[nome];
      for (var i = 0; i < list.length; i++) {
        if (list[i].toLowerCase() === q) return nome;
      }
    }
    /* match parcial */
    for (var n in FAMILIAS) {
      if (n.indexOf(q) >= 0) return n;
    }
    for (var nm in SINONIMOS) {
      var sl = SINONIMOS[nm];
      for (var j = 0; j < sl.length; j++) {
        if (sl[j].toLowerCase().indexOf(q) >= 0) return nm;
      }
    }
    return null;
  }

  /* ================================================================
   * THREE.JS — materiais e texturas
   * ================================================================ */
  var THREE = null;

  function three() {
    if (THREE) return THREE;
    try { THREE = window.THREE; } catch (e) {}
    return THREE;
  }

  /* Cria CanvasTexture a partir de uma textura procedural */
  function threeCanvas(nome, tam, cor) {
    var T = three();
    if (!T) return null;
    var c = getCanvas(nome, tam, cor);
    if (!c) return null;
    var tex = new T.CanvasTexture(c);
    tex.wrapS = tex.wrapT = T.RepeatWrapping;
    tex.anisotropy = 4;
    tex.magFilter = T.LinearFilter;
    tex.minFilter = T.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    return tex;
  }

  /* Cria normal map procedural (bump simulado) */
  function threeNormal(nome, tam) {
    var T = three();
    if (!T || !FAMILIAS[nome]) return null;
    var intensidade = FAMILIAS[nome].normal || 2;
    var c = canvas(tam || 128);
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#8080ff'; ctx.fillRect(0, 0, c.width, c.height);
    /* ruído no canal alpha = altura */
    for (var i = 0; i < c.width * c.height * 0.25; i++) {
      var x = Math.random() * c.width | 0;
      var y = Math.random() * c.height | 0;
      var v = Math.floor(80 + Math.random() * intensidade * 30);
      ctx.fillStyle = 'rgb(128,128,' + v + ')';
      ctx.fillRect(x, y, 1, 1);
    }
    var tex = new T.CanvasTexture(c);
    tex.wrapS = tex.wrapT = T.RepeatWrapping;
    return tex;
  }

  /* Cria material Three.js completo */
  function threeMaterial(nome, cor, opts) {
    var T = three();
    if (!T || !FAMILIAS[nome]) return null;
    var f = FAMILIAS[nome];
    cor = cor || '#888888';
    opts = opts || {};

    var corTex = threeCanvas(nome, 256, cor);
    var normTex = threeNormal(nome, 128);

    if (f.transmission) {
      /* Vidro / gel */
      return new T.MeshPhysicalMaterial({
        color: cor, roughness: f.roughness, metalness: f.metalness,
        transmission: f.transmission || 0.85, thickness: opts.thickness || 1.0,
        ior: f.ior || 1.45, clearcoat: opts.clearcoat || 0.2,
        transparent: true, opacity: opts.opacity || 0.85,
        map: corTex, normalMap: normTex,
      });
    }

    if (f.emissive) {
      return new T.MeshStandardMaterial({
        color: cor, roughness: f.roughness, metalness: f.metalness,
        emissive: opts.emissive || f.emissive,
        emissiveIntensity: opts.emissiveIntensity || 0.6,
        map: corTex, normalMap: normTex,
      });
    }

    return new T.MeshStandardMaterial({
      color: cor, roughness: f.roughness, metalness: f.metalness,
      map: corTex, normalMap: normTex,
    });
  }

  /* Atalho neon */
  function threeNeon(cor) {
    return threeMaterial('neon', cor, { emissiveIntensity: 1.2 });
  }

  /* Atalho gel/vidro */
  function threeGel(cor, opts) {
    return threeMaterial('vidro', cor || '#66ffcc', opts || {});
  }

  /* ================================================================
   * CANVAS 2D — patterns e data URLs
   * ================================================================ */
  function canvasPattern(nome, ctx, tam, cor) {
    var c = getCanvas(nome, tam, cor);
    if (!c) return null;
    return ctx.createPattern(c, 'repeat');
  }

  function canvasDataUrl(nome, tam, cor) {
    var c = getCanvas(nome, tam, cor);
    if (!c) return null;
    return c.toDataURL();
  }

  /* ================================================================
   * PIXI.JS — textura via canvas
   * ================================================================ */
  function pixiTexture(nome, tam, cor) {
    var c = getCanvas(nome, tam, cor);
    if (!c) return null;
    try {
      if (window.PIXI) return PIXI.Texture.from(c);
    } catch (e) {}
    return null;
  }

  /* ================================================================
   * PHASER — textura via canvas
   * ================================================================ */
  function phaserTexture(nome, tam, cor) {
    var c = getCanvas(nome, tam, cor);
    if (!c) return null;
    return c.toDataURL();
  }

  /* ================================================================
   * SELETOR INTELIGENTE DE MATERIAIS
   * ================================================================ */
  function select(descricao) {
    /* Interpreta a descrição do jogo e retorna materiais sugeridos */
    var text = String(descricao || '').toLowerCase();
    var sugestoes = [];

    /* Regras de decisão */
    if (/metal|aço|steel|chrome|prata|silver|ouro|gold/i.test(text)) {
      if (/ouro|gold/i.test(text)) sugestoes.push('metal_dourado');
      else if (/escuro|dark|gunmetal|ferro|iron/i.test(text)) sugestoes.push('metal_escuro');
      else sugestoes.push('metal_brilhante');
    }
    if (/plastico|plastic|acrilico|acrylic|resina/i.test(text)) {
      sugestoes.push(/fosco|soft|mate/i.test(text) ? 'plastico_fosco' : 'plastico_brilhante');
    }
    if (/pedra|stone|rocha|rock|granito|granite|ardosia|slate|basalto|basalt/i.test(text)) {
      sugestoes.push(/ardosia|slate|escuro|dark|basalt|basalto/i.test(text) ? 'pedra_ardosia' : 'pedra_cinza');
    }
    if (/madeira|wood|pinho|pine|carvalho|oak|nogueira|walnut|mogno|mahogany/i.test(text)) {
      sugestoes.push(/escuro|dark|walnut|mogno|nogueira/i.test(text) ? 'madeira_escura' : 'madeira_clara');
    }
    if (/tecido|fabric|cloth|pano|veludo|velvet|lona|textile/i.test(text)) {
      sugestoes.push('tecido_liso');
    }
    if (/concreto|concrete|cimento|cement/i.test(text)) {
      sugestoes.push('concreto');
    }
    if (/terra|solo|soil|dirt|barro|mud|terreno/i.test(text)) {
      sugestoes.push('terra');
    }
    if (/marmore|marble/i.test(text)) {
      sugestoes.push('marmore');
    }
    if (/neon|glow|luminoso|led/i.test(text)) {
      sugestoes.push('neon');
    }
    if (/vidro|glass|cristal|crystal|transparente|vitro/i.test(text)) {
      sugestoes.push('vidro');
    }
    if (/circuito|circuit|cyber|tech|placa|board|eletronico/i.test(text)) {
      sugestoes.push('circuito');
    }
    if (/energia|energy|eletrico|electric|força|lightning|raio|power/i.test(text)) {
      sugestoes.push('energia');
    }
    if (/lava|magma|fogo|fire|flame|chama/i.test(text)) {
      sugestoes.push('lava');
    }
    if (/borracha|rubber|neoprene|preto fosco|matte black/i.test(text)) {
      sugestoes.push('borracha');
    }
    if (/grade|grid|matrix|digital|hack/i.test(text)) {
      sugestoes.push('grade');
    }
    if (/holograma|hologram|projecao|projection|scan|holo/i.test(text)) {
      sugestoes.push('holograma');
    }
    if (/camuflado|camouflage|militar|military|camo|exercito|army|guerra|war/i.test(text)) {
      sugestoes.push('camuflado');
    }

    return sugestoes.filter(function(v, i, a) { return a.indexOf(v) === i; });
  }

  /* ================================================================
   * SHADERS GLSL (para OGL / raw WebGL)
   * ================================================================ */
  var SHADERS = {
    /* Holograma animado */
    holograma: {
      vertex: '\nattribute vec2 uv;\nvarying vec2 vUv;\nvoid main() {\n  vUv = uv;\n  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);\n}',
      fragment: '\nprecision highp float;\nuniform float time;\nvarying vec2 vUv;\nvoid main() {\n  vec2 uv = vUv;\n  float scanline = sin(uv.y * 200.0 + time * 2.0) * 0.3 + 0.7;\n  float fringe = sin(uv.x * 40.0 + uv.y * 30.0 + time * 1.5) * 0.2 + 0.8;\n  vec3 col = mix(vec3(0.0, 0.8, 1.0), vec3(0.0, 0.4, 0.8), uv.x);\n  col *= scanline * fringe;\n  gl_FragColor = vec4(col, 0.85);\n}'
    },
    /* Energia pulsante */
    energia: {
      vertex: '\nattribute vec2 uv;\nvarying vec2 vUv;\nvoid main() {\n  vUv = uv;\n  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);\n}',
      fragment: '\nprecision highp float;\nuniform float time;\nvarying vec2 vUv;\nvoid main() {\n  vec2 uv = vUv;\n  float d = length(uv - 0.5);\n  float pulse = sin(d * 10.0 - time * 2.0) * 0.5 + 0.5;\n  float glow = exp(-d * 3.0) * pulse;\n  vec3 col = vec3(0.0, 0.3 + glow * 0.7, 0.5 + glow * 0.5);\n  col += vec3(0.2, 0.5, 1.0) * glow * 0.5;\n  gl_FragColor = vec4(col, 1.0);\n}'
    },
    /* Lava */
    lava: {
      vertex: '\nattribute vec2 uv;\nvarying vec2 vUv;\nvoid main() {\n  vUv = uv;\n  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);\n}',
      fragment: '\nprecision highp float;\nuniform float time;\nvarying vec2 vUv;\nvoid main() {\n  vec2 uv = vUv;\n  float n = sin(uv.x * 10.0 + time * 0.5) * cos(uv.y * 8.0 + time * 0.7);\n  n = n * 0.5 + 0.5;\n  vec3 col = mix(vec3(0.8, 0.1, 0.0), vec3(1.0, 0.6, 0.0), n);\n  col = mix(col, vec3(1.0, 0.8, 0.1), pow(n, 3.0) * 0.5);\n  gl_FragColor = vec4(col, 1.0);\n}'
    },
    /* Neon flicker */
    neon: {
      vertex: '\nattribute vec2 uv;\nvarying vec2 vUv;\nvoid main() {\n  vUv = uv;\n  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);\n}',
      fragment: '\nprecision highp float;\nuniform float time;\nuniform vec3 uColor;\nvarying vec2 vUv;\nvoid main() {\n  float flicker = 0.9 + 0.1 * sin(time * 5.0 + vUv.x * 10.0);\n  float edge = 1.0 - smoothstep(0.3, 0.5, length(vUv - 0.5));\n  vec3 col = uColor * flicker * (0.8 + edge * 0.4);\n  gl_FragColor = vec4(col, 1.0);\n}'
    },
    /* Circuito vivo */
    circuito: {
      vertex: '\nattribute vec2 uv;\nvarying vec2 vUv;\nvoid main() {\n  vUv = uv;\n  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);\n}',
      fragment: '\nprecision highp float;\nuniform float time;\nvarying vec2 vUv;\nvoid main() {\n  vec2 uv = vUv * 8.0;\n  vec2 id = floor(uv);\n  vec2 f = fract(uv);\n  float pulse = sin(time * 2.0 + id.x * 3.0 + id.y * 7.0) * 0.5 + 0.5;\n  float line = max(1.0 - abs(f.x - 0.5) * 8.0, 1.0 - abs(f.y - 0.5) * 8.0);\n  line = step(0.7, line) * pulse;\n  vec3 col = mix(vec3(0.02, 0.05, 0.02), vec3(0.0, 1.0, 0.3), line);\n  gl_FragColor = vec4(col, 1.0);\n}'
    },
  };

  /* Retorna shader source */
  function shaderSource(nome) {
    return SHADERS[nome] || null;
  }

  /* Lista shaders */
  function shaderNames() {
    return Object.keys(SHADERS).sort();
  }

  /* ================================================================
   * EXPOSIÇÃO GLOBAL
   * ================================================================ */
  window.NxMat = {
    VERSION: '1.0.0',
    /* Texturas */
    names: names,
    random: random,
    fuzzyFind: fuzzyFind,
    clearCache: clearCache,
    getCanvas: getCanvas,
    list: function() { return Object.keys(FAMILIAS).sort(); },
    familias: FAMILIAS,
    /* Three.js */
    threeMat: threeMaterial,
    threeCanvas: threeCanvas,
    threeNormal: threeNormal,
    threeNeon: threeNeon,
    threeGel: threeGel,
    /* Canvas */
    canvasPattern: canvasPattern,
    canvasDataUrl: canvasDataUrl,
    /* Pixi */
    pixiTexture: pixiTexture,
    /* Phaser */
    phaserTexture: phaserTexture,
    /* Seletor */
    select: select,
    /* Shaders GLSL */
    shader: shaderSource,
    shaderNames: shaderNames,
  };
})();
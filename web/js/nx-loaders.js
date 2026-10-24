/* ============================================================
 * nx-loaders.js — Loaders sob demanda + utilitários de assets
 * ============================================================
 * Fornece funções que a IA pode usar para carregar bibliotecas
 * que não podem ser incluídas localmente (WASM, addons Three.js).
 *
 * API global `NxLoad`:
 *   NxLoad.cdn(libName)            → Promise que resolve quando a lib carregar
 *   NxLoad.rapier()                → carrega Rapier (física 3D WASM)
 *   NxLoad.recast()                → carrega Recast Navigation (WASM)
 *   NxLoad.postprocessing()        → carrega postprocessing (addon Three.js)
 *   NxLoad.meshBVH()               → carrega three-mesh-bvh
 *   NxLoad.ready(name)             → true se já carregou
 *
 *   NxLoad.spritesheet(img, json)  → decodifica spritesheet + atlas
 *   NxLoad.tiled(json)             → carrega mapa Tiled em JSON
 * ============================================================ */
(function () {
  'use strict';
  if (window.NxLoad) return;

  var LOADED = {};
  var PENDING = {};

  /* URLs CDN para cada lib que não pode ser local */
  var CDN = {
    rapher: 'https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.13.0/rapier.esm.js',
    recast: 'https://cdn.jsdelivr.net/npm/recast-navigation-js@0.4.0/dist/recast-navigation-js.js',
    postprocessing: 'https://cdn.jsdelivr.net/npm/postprocessing@6.36.3/dist/postprocessing.js',
    'three-mesh-bvh': 'https://cdn.jsdelivr.net/npm/three-mesh-bvh@0.7.8/build/index.umd.cjs',
  };

  /* Carrega um script pelo CDN */
  function loadScript(url) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = url;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('falha ao carregar: ' + url)); };
      document.head.appendChild(s);
    });
  }

  function cdnLoad(name) {
    if (LOADED[name]) return Promise.resolve();
    if (PENDING[name]) return PENDING[name];
    var url = CDN[name];
    if (!url) return Promise.reject(new Error('loader desconhecido: ' + name));
    PENDING[name] = loadScript(url).then(function () {
      LOADED[name] = true;
      delete PENDING[name];
    });
    return PENDING[name];
  }

  /* ---- API ---- */

  function ready(name) { return !!LOADED[name]; }

  /* Rapier (física 3D) */
  function loadRapier() {
    if (typeof RAPIER !== 'undefined') { LOADED.rapier = true; return Promise.resolve(); }
    /* Rapier precisa de init() WASM - carrega via CDN com compat */
    var url = 'https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.13.0/rapier.esm.js';
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.type = 'module';
      s.textContent = [
        'import * as RAPIER from "' + url + '";',
        'await RAPIER.init();',
        'window.RAPIER = RAPIER;',
        'window.dispatchEvent(new CustomEvent("rapier-ready"));',
      ].join('\n');
      s.onerror = function () { reject(new Error('Rapier falhou')); };
      window.addEventListener('rapier-ready', function () { LOADED.rapier = true; resolve(); }, { once: true });
      document.head.appendChild(s);
    });
  }

  /* Recast Navigation (WASM) */
  function loadRecast() {
    if (window.RecastNavigation) { LOADED.recast = true; return Promise.resolve(); }
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/recast-navigation-js@0.4.0/dist/recast-navigation-js.js';
      s.onload = function () {
        if (window.RecastNavigation && window.RecastNavigation.isSupported()) {
          LOADED.recast = true; resolve();
        } else {
          reject(new Error('Recast nao suportado neste navegador'));
        }
      };
      s.onerror = function () { reject(new Error('Recast CDN falhou')); };
      document.head.appendChild(s);
    });
  }

  /* Postprocessing (Three.js addon - EffectComposer) */
  function loadPostprocessing() {
    if (window.EffectComposer) { LOADED.postprocessing = true; return Promise.resolve(); }
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = CDN.postprocessing;
      s.onload = function () { LOADED.postprocessing = true; resolve(); };
      s.onerror = function () { reject(new Error('postprocessing CDN falhou')); };
      document.head.appendChild(s);
    });
  }

  /* three-mesh-bvh */
  function loadMeshBVH() {
    if (window.MeshBVH) { LOADED['three-mesh-bvh'] = true; return Promise.resolve(); }
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = CDN['three-mesh-bvh'];
      s.onload = function () { LOADED['three-mesh-bvh'] = true; resolve(); };
      s.onerror = function () { reject(new Error('three-mesh-bvh CDN falhou')); };
      document.head.appendChild(s);
    });
  }

  /* ---- Spritesheet loader (puro JS, local) ---- */
  function loadSpritesheet(imageUrl, jsonData) {
    /* jsonData: { frames: { nome: { frame: {x, y, w, h} } } } */
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        var frames = {};
        var data = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
        var f = data.frames || data;
        for (var name in f) {
          var fr = f[name].frame || f[name];
          frames[name] = { x: fr.x, y: fr.y, w: fr.w, h: fr.h };
        }
        resolve({ image: img, frames: frames });
      };
      img.onerror = function () { reject(new Error('spritesheet nao carregou: ' + imageUrl)); };
      img.src = imageUrl;
    });
  }

  /* ---- Tiled map loader (puro JS, local) ---- */
  function loadTiled(jsonData) {
    var map = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
    return {
      width: map.width,
      height: map.height,
      tileWidth: map.tilewidth,
      tileHeight: map.tileheight,
      layers: (map.layers || []).map(function (layer) {
        return {
          name: layer.name,
          type: layer.type,
          data: layer.data,
          visible: layer.visible !== false,
          objects: layer.objects || [],
        };
      }),
      tilesets: (map.tilesets || []).map(function (ts) {
        return {
          firstGid: ts.firstgid,
          image: ts.image,
          tileWidth: ts.tilewidth,
          tileHeight: ts.tileheight,
          columns: ts.columns,
          tileCount: ts.tilecount,
        };
      }),
    };
  }

  window.NxLoad = {
    VERSION: '1.0.0',
    ready: ready,
    cdn: cdnLoad,
    rapier: loadRapier,
    recast: loadRecast,
    postprocessing: loadPostprocessing,
    meshBVH: loadMeshBVH,
    spritesheet: loadSpritesheet,
    tiled: loadTiled,
    /* Utilitário: decodifica tiles de um layer Tiled */
    getTile: function (map, layerIndex, x, y) {
      var layer = map.layers[layerIndex];
      if (!layer || !layer.data) return 0;
      return layer.data[y * map.width + x] || 0;
    },
  };
})();
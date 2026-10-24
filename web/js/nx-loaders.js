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

  /* URLs CDN para cada lib que não pode ser incluída localmente */
  var CDN = {
    rapier: 'https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.13.0/rapier.es.js',
    recast: 'https://cdn.jsdelivr.net/npm/recast-navigation@0.43.1/+esm',
    postprocessing: 'https://cdn.jsdelivr.net/npm/postprocessing@6.36.3/build/postprocessing.js',
    'three-mesh-bvh': 'https://unpkg.com/three-mesh-bvh@0.7.8/build/index.umd.cjs',
  };

  /* Carrega um script clássico pelo CDN */
  function loadScript(url) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = url;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('falha ao carregar: ' + url)); };
      document.head.appendChild(s);
    });
  }

  /* Carrega um módulo ES pelo CDN (Rapier/Recast são ESM + WASM). */
  function loadModule(url, label) {
    return import(url).catch(function (e) {
      throw new Error(label + ' CDN falhou: ' + (e && e.message ? e.message : e));
    });
  }

  function cdnLoad(name) {
    if (name === 'rapier') return loadRapier();
    if (name === 'recast') return loadRecast();
    if (name === 'postprocessing') return loadPostprocessing();
    if (name === 'meshBVH' || name === 'three-mesh-bvh') return loadMeshBVH();
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
    if (PENDING.rapier) return PENDING.rapier;
    /* rapier3d-compat é ESM e precisa de init() para o WASM. */
    PENDING.rapier = loadModule(CDN.rapier, 'Rapier').then(function (mod) {
      return mod.init().then(function () {
        window.RAPIER = mod;
        LOADED.rapier = true;
        delete PENDING.rapier;
        try { window.dispatchEvent(new CustomEvent('rapier-ready')); } catch (_) {}
      });
    }).catch(function (e) {
      delete PENDING.rapier;
      throw e;
    });
    return PENDING.rapier;
  }

  /* Recast Navigation (WASM) */
  function loadRecast() {
    if (window.RecastNavigation) { LOADED.recast = true; return Promise.resolve(); }
    if (PENDING.recast) return PENDING.recast;
    /* recast-navigation >= 0.43 é ESM; o init() carrega o WASM. */
    PENDING.recast = loadModule(CDN.recast, 'Recast').then(function (mod) {
      return mod.init().then(function () {
        window.RecastNavigation = mod;
        LOADED.recast = true;
        delete PENDING.recast;
      });
    }).catch(function (e) {
      delete PENDING.recast;
      throw e;
    });
    return PENDING.recast;
  }

  /* O UMD do postprocessing expõe POSTPROCESSING; cria os globais usuais. */
  function exposePostprocessing() {
    var pp = window.POSTPROCESSING;
    if (!pp) return false;
    ['EffectComposer', 'RenderPass', 'EffectPass', 'BloomEffect', 'SMAAEffect',
      'ToneMappingEffect', 'ShaderPass', 'MaskPass', 'ClearPass', 'CopyPass'].forEach(function (name) {
      if (typeof window[name] === 'undefined' && typeof pp[name] !== 'undefined') window[name] = pp[name];
    });
    return !!window.EffectComposer;
  }

  /* Postprocessing (Three.js addon - EffectComposer) */
  function loadPostprocessing() {
    if (exposePostprocessing()) { LOADED.postprocessing = true; return Promise.resolve(); }
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = CDN.postprocessing;
      s.onload = function () {
        if (exposePostprocessing()) { LOADED.postprocessing = true; resolve(); }
        else reject(new Error('postprocessing CDN sem EffectComposer'));
      };
      s.onerror = function () { reject(new Error('postprocessing CDN falhou')); };
      document.head.appendChild(s);
    });
  }

  /* O UMD do three-mesh-bvh expõe MeshBVHLib; alias para o global da diretiva. */
  function exposeMeshBVH() {
    var lib = window.MeshBVHLib;
    if (!lib) return false;
    if (typeof window.MeshBVH === 'undefined' && lib.MeshBVH) window.MeshBVH = lib.MeshBVH;
    ['computeBoundsTree', 'disposeBoundsTree', 'acceleratedRaycast',
      'MeshBVHVisualizer', 'StaticGeometryGenerator'].forEach(function (name) {
      if (typeof window[name] === 'undefined' && typeof lib[name] !== 'undefined') window[name] = lib[name];
    });
    return !!window.MeshBVH;
  }

  /* three-mesh-bvh */
  function loadMeshBVH() {
    if (exposeMeshBVH()) { LOADED['three-mesh-bvh'] = true; return Promise.resolve(); }
    if (!window.THREE) return Promise.reject(new Error('three-mesh-bvh requer three.js'));
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = CDN['three-mesh-bvh'];
      s.onload = function () {
        if (exposeMeshBVH()) { LOADED['three-mesh-bvh'] = true; resolve(); }
        else reject(new Error('three-mesh-bvh sem MeshBVH'));
      };
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
/* ============================================================
 * library-selector.js — Catálogo completo de bibliotecas
 * ============================================================
 * Módulo independente: analisa o pedido e o documento atual,
 * seleciona as bibliotecas ideais e constrói a diretiva para a IA.
 *
 * Libs locais ficam em vendor/<nome>/<nome>.min.js (ou similar).
 * Exceções: Canvas 2D (nativo), OGL (module — type="module") e as quatro
 * libs carregadas via CDN sob demanda por NxLoad (Rapier, Recast,
 * postprocessing, three-mesh-bvh).
 * ============================================================ */
(function () {
  'use strict';

  /* ================================================================
   * CATÁLOGO CENTRAL
   * ================================================================
   * Cada entrada: nome, categoria, descrição, keywords p/ detecção,
   * global (variável global exposta), local (tem vendor/), depende
   * de outra lib, suporta áudio.
   * ================================================================ */
  var LIBRARIES = {
    /* ---- Motores 3D ---- */
    three: {
      name: 'Three.js',
      category: '3d',
      description: 'Motor 3D completo (WebGL). Cenas, materiais PBR, iluminação, sombras, animação por código. Sem addons (OrbitControls, GLTFLoader, EffectComposer — faz tudo manual).',
      keywords: ['3d','tres dimensoes','cena 3d','objeto 3d','modelo 3d','webgl','threejs','three','cubo','esfera','malha','mesh','camera','luz','sombra','material','geometria','renderizacao 3d'],
      global: 'THREE',
      local: true,
      file: 'three/three.min.js',
      audio: false,
      size: '~500KB'
    },
    babylon: {
      name: 'Babylon.js',
      category: '3d',
      description: 'Engine 3D completa alternativa ao Three.js. PBR, física integrada (Cannon), GUI 3D, partículas, XR, carregador GLTF próprio.',
      keywords: ['babylon','babylonjs','engine 3d completa','fisica integrada','xr','webxr','gui 3d','particulas 3d','pbr avancado','gltf'],
      global: 'BABYLON',
      local: true,
      file: 'babylon/babylon.js',
      audio: false,
      size: '~4.9MB'
    },
    ogl: {
      name: 'OGL',
      category: '3d',
      description: 'Micro-framework WebGL minimalista (ES modules). Shaders customizados, geometria procedural, sem overhead. REQUER type="module" no script.',
      keywords: ['ogl','webgl customizado','shader','glsl','webgl baixo nivel','micro framework','gpgpu','compute shader'],
      global: 'OGL',
      local: true,
      file: 'ogl/ogl-loader.js',
      audio: false,
      module: true,
      size: '~29KB (modular)'
    },

    /* ---- Motores 2D ---- */
    phaser: {
      name: 'Phaser',
      category: '2d-game',
      description: 'Framework completo para jogos 2D. Física Arcade, cenas, sprites, animações, input, som embutido. Ideal para plataforma, arcade, puzzle, RPG, shooter.',
      keywords: ['jogo 2d','plataforma','plataforma 2d','arcade','phaser','sprite','tileset','tilemap','fisica arcade','platformer','side scroller','top down','rpg 2d','jogo de tiro 2d'],
      global: 'Phaser',
      local: true,
      file: 'phaser/phaser.min.js',
      audio: true,      // tem audio proprio
      size: '~1.1MB'
    },
    pixi: {
      name: 'PixiJS',
      category: '2d-render',
      description: 'Renderizador 2D WebGL ultra-rápido. Sprites em massa, partículas, filtros, shaders 2D. Ideal para efeitos visuais e jogos 2D leves.',
      keywords: ['pixi','pixijs','particulas 2d','efeitos 2d','renderizacao 2d','webgl 2d','sprites muitos','performance 2d','filtros','shaders 2d'],
      global: 'PIXI',
      local: true,
      file: 'pixi/pixi.min.js',
      audio: false,     // usa @pixi/sound separado
      size: '~435KB',
      extraLib: 'pixi-sound'  // audio adicional
    },
    konva: {
      name: 'Konva.js',
      category: '2d-canvas',
      description: 'Framework Canvas 2D de alto nível. Camadas, formas, drag-and-drop, detecção de hit, eventos. Editores visuais, diagramas, whiteboards.',
      keywords: ['editor visual','desenho','canvas 2d','konva','diagrama','whiteboard','ferramenta desenho','arrastar soltar','hit detection','camadas'],
      global: 'Konva',
      local: true,
      file: 'konva/konva.min.js',
      audio: false,
      size: '~168KB'
    },

    /* ---- Física 2D ---- */
    matter: {
      name: 'Matter.js',
      category: 'physics-2d',
      description: 'Motor de física 2D rígida. Corpos, colisões, restrições, compostos, veículos, ragdoll. Use com Canvas 2D ou Phaser.',
      keywords: ['fisica 2d','matter','matterjs','colisao','corpo rigido','restricao','joint','ragdoll','veiculo','simulacao fisica', 'mola'],
      global: 'Matter',
      local: true,
      file: 'matter/matter.min.js',
      audio: false,
      size: '~79KB'
    },

    /* ---- Animação ---- */
    gsap: {
      name: 'GSAP',
      category: 'animation',
      description: 'Biblioteca de animação profissional. Timelines, easings, cores animadas, sequências complexas para UI, logos, transições.',
      keywords: ['animacao','gsap','timeline','tween','easing','scrolltrigger','motionpath','flip','sequencia animada','transicao complexa'],
      global: 'gsap',
      local: true,
      file: 'gsap/gsap.min.js',
      audio: false,
      size: '~71KB'
    },
    lottie: {
      name: 'Lottie-web',
      category: 'animation',
      description: 'Renderiza animações After Effects (JSON/Bodymovin). Vetorial, escalável. Ícones animados, ilustrações vivas, UI animada.',
      keywords: ['lottie','after effects','bodymovin','animacao vetorial','json animacao','icone animado','ui animada'],
      global: 'lottie',
      local: true,
      file: 'lottie/lottie.min.js',
      audio: false,
      size: '~299KB'
    },

    /* ---- Áudio ---- */
    howler: {
      name: 'Howler.js',
      category: 'audio',
      description: 'Reprodução de áudio multi-formato. Música, efeitos, volume, sprite audio, fade, loop. Compatível com qualquer motor.',
      keywords: ['howler','howlerjs','musica','efeito sonoro','audio','reproducao audio','som','trilha sonora'],
      global: 'Howler',
      local: true,
      file: 'howler/howler.min.js',
      audio: true,
      size: '~36KB'
    },
    tone: {
      name: 'Tone.js',
      category: 'audio',
      description: 'Síntese musical procedural. Osciladores, sequenciadores, efeitos (reverb, delay, distorção), samples, schedulers. Gera música por código.',
      keywords: ['tone','tonejs','musica procedural','sintetizador','sequenciador','bpm','midi','sintese','daw'],
      global: 'Tone',
      local: true,
      file: 'tone/Tone.js',
      audio: true,
      size: '~342KB'
    },
    zzfx: {
      name: 'ZzFX',
      category: 'audio',
      description: 'Síntese de efeitos sonoros ultra-leve (7.8KB). Tiros, explosões, pulos, moedas, power-ups em uma linha. Perfeito para jogos.',
      keywords: ['zzfx','efeito sonoro leve','som de jogo','tiro som','explosao som','pulo som','sfx','sound effect','8bit'],
      global: 'ZzFX',
      local: true,
      file: 'zzfx/ZzFX.js',
      audio: true,
      size: '~7.8KB'
    },
    pixiSound: {
      name: '@pixi/sound',
      category: 'audio',
      description: 'Áudio integrado ao PixiJS. Carrega e toca sons nos jogos PixiJS sem conflito de contexto.',
      keywords: ['pixi sound','pixijs som','@pixi/sound'],
      global: 'PIXI.sound',
      local: true,
      file: 'pixi-sound/pixi-sound.js',
      audio: true,
      depends: ['pixi'],
      size: '~34KB'
    },

    /* ---- Nativo ---- */
    canvas2d: {
      name: 'Canvas 2D API Nativa',
      category: '2d-native',
      description: 'API nativa Canvas 2D do navegador. Zero dependências, máximo controle. Jogos simples, desenhos, gráficos, sem engine extra.',
      keywords: ['canvas 2d','canvas nativo','api nativa','sem dependencias','desenho simples','graficos simples','jogo simples 2d'],
      global: null,
      local: false,
      file: null,
      audio: false,
      size: '0KB (nativo)'
    },

    /* ---- Física 3D ---- */
    rapier: {
      name: 'Rapier',
      category: 'physics-3d',
      description: 'Motor de física 3D com WASM. Corpos rígidos, colisões, juntas, veículos. REQUER CDN (WASM) — use NxLoad.rapier() para carregar.',
      keywords: ['fisica 3d','rapier','colisao 3d','corpo rigido 3d','physics 3d','joint','veiculo 3d','simulacao fisica 3d'],
      global: 'RAPIER',
      local: false,
      file: null,
      cdn: true,
      size: '~1.5MB (WASM)'
    },

    /* ---- IA / Comportamento ---- */
    yuka: {
      name: 'Yuka',
      category: 'ai',
      description: 'IA para jogos: NPCs autônomos, perseguição, fuga, patrulha, máquina de estados, movimentação inteligente.',
      keywords: ['yuka','ia para jogos','npc','inteligencia artificial','inimigo','perseguir','patrulha','fuga','behavior tree','state machine','autonomo'],
      global: 'YUKA',
      local: true,
      file: 'yuka/yuka.min.js',
      size: '~157KB'
    },

    /* ---- Navegação / Pathfinding 3D ---- */
    recast: {
      name: 'Recast Navigation JS',
      category: 'ai',
      description: 'Pathfinding 3D com navmesh. NPCs encontram caminhos, desviam obstáculos, navegam em cenários complexos. REQUER CDN — use NxLoad.recast().',
      keywords: ['recast','pathfinding','navegacao 3d','navmesh','caminho','rota','npc caminho','desvio obstaculo','navigation'],
      global: 'RecastNavigation',
      local: false,
      cdn: true,
      size: '~500KB (WASM)'
    },

    /* ---- Efeitos Visuais Three.js ---- */
    postprocessing: {
      name: 'postprocessing',
      category: '3d',
      description: 'Efeitos visuais para Three.js: bloom, profundidade de campo, vinheta, aberração cromática. REQUER CDN — use NxLoad.postprocessing().',
      keywords: ['postprocessing','bloom','depth of field','efeito visual','cinematografico','pós-processamento','glow','vinheta','aberracao cromatica'],
      global: 'EffectComposer',
      local: false,
      cdn: true,
      size: '~300KB'
    },

    /* ---- Aceleração geométrica Three.js ---- */
    meshBVH: {
      name: 'three-mesh-bvh',
      category: '3d',
      description: 'Aceleração de raycasting e colisão em geometrias complexas Three.js. REQUER CDN — use NxLoad.meshBVH().',
      keywords: ['mesh bvh','bvh','raycast acelerado','colisao geometria','three mesh bvh','aceleracao geometria'],
      global: 'MeshBVH',
      local: false,
      cdn: true,
      size: '~100KB'
    },

    /* ---- Geração procedural ---- */
    simplexNoise: {
      name: 'simplex-noise',
      category: 'procedural',
      description: 'Geração procedural de terreno, mapas de altura, nuvens, ondas, cavernas por ruído simplex. Usa semente para reprodução.',
      keywords: ['simplex','noise','ruido','terreno procedural','geracao procedural','mapa altura','ilha','onda','nuvem','semente','seed','caverna','fbm','voronoi','domain warp','createNoise2D','createNoise3D','createNoise4D','alea','perlin'],
      global: 'SimplexNoise',
      local: true,
      file: 'simplex-noise/simplex-noise.global.js',
      size: '~21KB'
    },

    /* ---- Shaders GLSL prontos ---- */
    shaderGLSL: {
      name: 'NxShader (GLSL)',
      category: 'procedural',
      description: '28 shaders GLSL prontos (fogo, água, aurora, plasma, CRT, holograma, escudo, toon, mármore…) com chunks reaproveitáveis de hash, ruído simplex, fbm, voronoi, rotação, HSV e paleta. Funciona com ShaderMaterial do Three.js.',
      keywords: ['shader','glsl','fragment shader','vertex shader','efeito visual','fogo shader','agua shader','aurora','plasma','crt','holograma','escudo','toon','marmore','voronoi','fbm','simplex','shadermaterial','three'],
      global: 'NxShader',
      local: true,
      file: null,
      builtin: true,
      builtinScript: 'js/nx-shaders.js',
      size: 'via nx-shaders.js'
    },

    /* ---- Spritesheet / Atlas ---- */
    spritesheetLoader: {
      name: 'Spritesheet Loader',
      category: '2d-tools',
      description: 'Carregamento de spritesheets e atlas de texturas com metadados JSON. Animações de personagens, partículas, UI. Use NxLoad.spritesheet().',
      keywords: ['spritesheet','atlas','sprite sheet','animacao 2d','personagem animado','sequencia sprite','frame animation'],
      global: 'NxLoad',
      local: true,
      file: null,
      builtin: true,
      builtinScript: 'js/nx-loaders.js',
      size: 'via NxLoad'
    },

    /* ---- Mapas Tiled ---- */
    tiledLoader: {
      name: 'Tiled Map Loader',
      category: '2d-tools',
      description: 'Carregamento de mapas exportados do Tiled (JSON). Tilemaps, camadas, objetos, colisão, fases. Use NxLoad.tiled().',
      keywords: ['tiled','mapa tiles','tilemap','fase 2d','editor de mapas','tiled json','nivel','level design','camera tile'],
      global: 'NxLoad',
      local: true,
      file: null,
      builtin: true,
      builtinScript: 'js/nx-loaders.js',
      size: 'via NxLoad'
    },

    /* ---- Painel de Debug ---- */
    lilGui: {
      name: 'lil-gui',
      category: 'debug',
      description: 'Painel de depuração para ajustar iluminação, cores, física, partículas em tempo real. Use GUI.add(). Ativado só em desenvolvimento.',
      keywords: ['lil gui','debug','painel debug','ajuste tempo real','gui','controle deslizante','depuracao','tweak'],
      global: 'GUI',
      local: true,
      file: 'lil-gui/lil-gui.umd.js',
      size: '~61KB'
    },
  };

  /* ================================================================
   * MAPA KEYWORD → BIBLIOTECAS
   * Primeira keyword que casar define a seleção primária.
   * Várias keywords podem adicionar libs diferentes à mesma cena.
   * ================================================================ */
  var TYPE_TO_LIBS = {
    /* 3D */
    '3d': ['three'],
    'tres dimensoes': ['three'],
    'cena 3d': ['three'],
    'objeto 3d': ['three'],
    'webgl': ['three'],
    'cubo': ['three'],
    'nave': ['three'],
    'espaco': ['three'],
    'babylon': ['babylon'],
    'ogl': ['ogl'],

    /* 2D games */
    'jogo 2d': ['phaser'],
    'plataforma': ['phaser'],
    'arcade': ['phaser'],
    'platformer': ['phaser', 'matter'],
    'rpg 2d': ['phaser'],
    'jogo de tiro 2d': ['phaser'],
    'jogo 2d completo': ['phaser'],

    /* Pixi / efeitos */
    'particulas 2d': ['pixi'],
    'particulas': ['pixi'],
    'efeitos 2d': ['pixi'],
    'muitos sprites': ['pixi'],
    'performance 2d': ['pixi'],
    'efeitos visuais': ['pixi'],

    /* Física */
    'fisica 2d': ['matter', 'phaser'],
    'colisao': ['matter', 'phaser'],
    'corpo rigido': ['matter'],
    'ragdoll': ['matter'],
    'simulacao fisica': ['matter'],

    /* Animação */
    'animacao': ['gsap'],
    'animacao complexa': ['gsap'],
    'animacao logo': ['gsap'],
    'timeline': ['gsap'],
    'lottie': ['lottie'],
    'after effects': ['lottie'],
    'animacao vetorial': ['lottie'],
    'icone animado': ['lottie'],
    'logo animado': ['gsap'],
    'transicao animada': ['gsap'],
    'motion': ['gsap'],

    /* Desenho / Editor */
    'editor visual': ['konva'],
    'desenho': ['konva', 'canvas2d'],
    'diagrama': ['konva'],
    'whiteboard': ['konva'],
    'ferramenta desenho': ['konva', 'canvas2d'],

    /* Áudio explícito */
    'musica procedural': ['tone'],
    'musica': ['howler', 'tone'],
    'musica de fundo': ['howler'],
    'sintetizador': ['tone'],
    'efeito sonoro': ['howler', 'zzfx'],
    'trilha sonora': ['howler'],
    'sons de jogo': ['howler', 'zzfx'],
    'tiro': ['zzfx'],
    'tiros': ['zzfx'],
    'explosao': ['zzfx'],
    'explosoes': ['zzfx'],
    'pulo': ['zzfx'],
    'sfx': ['zzfx'],

    /* Física 3D */
    'fisica 3d': ['rapier'],
    'physics 3d': ['rapier'],
    'rapier': ['rapier'],

    /* IA */
    'yuka': ['yuka'],
    'npc': ['yuka'],
    'inimigo inteligente': ['yuka'],
    'ia para jogo': ['yuka'],
    'pathfinding': ['recast'],
    'navegacao 3d': ['recast'],
    'recast': ['recast'],

    /* Efeitos Visuais */
    'bloom': ['postprocessing'],
    'pos processamento': ['postprocessing'],
    'postprocessing': ['postprocessing'],

    /* Aceleração */
    'bvh': ['meshBVH'],
    'mesh bvh': ['meshBVH'],
    'raycast acelerado': ['meshBVH'],

    /* Geração procedural */
    'terreno procedural': ['simplexNoise', 'three'],
    'geracao procedural': ['simplexNoise'],
    'simplex': ['simplexNoise'],

    /* Spritesheet */
    'spritesheet': ['spritesheetLoader', 'phaser'],
    'atlas': ['spritesheetLoader', 'pixi'],

    /* Tiled */
    'tiled': ['tiledLoader'],
    'tilemap': ['tiledLoader', 'phaser'],
    'fase 2d': ['tiledLoader', 'phaser'],

    /* Debug */
    'debug': ['lilGui'],
    'lil gui': ['lilGui'],

    /* Canvas puro */
    'canvas 2d': ['canvas2d'],
    'canvas nativo': ['canvas2d'],
    'jogo simples 2d': ['canvas2d', 'phaser'],
    'graficos simples': ['canvas2d'],
    'desenho simples': ['canvas2d'],

    /* ES module libs */
    'shader': ['three', 'ogl'],
    'glsl': ['ogl'],
    'webgl baixo nivel': ['ogl'],
  };

  /* ================================================================
   * RESOLUÇÃO DE DEPENDÊNCIAS
   * ================================================================ */
  function resolveDeps(selected) {
    var result = [];
    var seen = {};
    function add(libName) {
      if (seen[libName]) return;
      seen[libName] = true;
      var lib = LIBRARIES[libName];
      if (!lib) return;
      if (lib.depends) {
        lib.depends.forEach(function (dep) { add(dep); });
      }
      result.push(libName);
    }
    selected.forEach(function (libName) { add(libName); });
    return result;
  }

  /* ================================================================
   * PRIORIDADE: engines mais pesadas/niche ficam depois
   * ================================================================ */
  var PRIORITY = [
    'three', 'babylon', 'ogl',
    'phaser', 'pixi', 'konva',
    'matter', 'rapier',
    'gsap', 'lottie',
    'yuka', 'recast',
    'howler', 'tone', 'zzfx', 'pixiSound',
    'simplexNoise', 'spritesheetLoader', 'tiledLoader',
    'postprocessing', 'meshBVH',
    'lilGui',
    'canvas2d'
  ];

  function sortByPriority(arr) {
    return arr.slice().sort(function (a, b) {
      return PRIORITY.indexOf(a) - PRIORITY.indexOf(b);
    });
  }

  /* ================================================================
   * NORMALIZAÇÃO DE TEXTO
   * ================================================================ */
  function normalizeText(text) {
    return String(text || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  /* ================================================================
   * SELEÇÃO AUTOMÁTICA POR IA
   *
   * Analisa o comando do usuário + documento atual e retorna a lista
   * de bibliotecas mais adequadas.
   * ================================================================ */
  function selectLibraries(command, currentDoc) {
    var normalized = normalizeText(command);
    var docText = currentDoc ? normalizeText(currentDoc) : '';
    var combined = normalized + ' ' + docText;

    var selected = new Set();
    var matched = false;

    /* 1) Match por keyword no comando */
    for (var keyword in TYPE_TO_LIBS) {
      if (normalized.indexOf(keyword) >= 0) {
        TYPE_TO_LIBS[keyword].forEach(function (lib) { selected.add(lib); });
        matched = true;
      }
    }

    /* 2) Fallback: keyword no documento atual */
    if (!matched) {
      for (var kw in TYPE_TO_LIBS) {
        if (docText.indexOf(kw) >= 0) {
          TYPE_TO_LIBS[kw].forEach(function (lib) { selected.add(lib); });
        }
      }
    }

    /* 3) Palavras 3D/three sempre ligam three */
    if (combined.indexOf('three') >= 0 || combined.indexOf('3d') >= 0) {
      selected.add('three');
    }

    /* 4) Se pediu áudio explícito (musica, som, efeito), adiciona howler+zzfx */
    if (/musica|som|efeito sonoro|trilha|sfx|audio/i.test(normalized)) {
      selected.add('howler');
      if (/tiro|explosao|pulo|moeda|power.up|colisao/i.test(normalized)) {
        selected.add('zzfx');
      }
      if (/musica procedural|sintetizador|sequenciador|bpm/i.test(normalized)) {
        selected.add('tone');
      }
    }

    /* 5) Se tem pixi e som, adiciona pixiSound */
    if (selected.has('pixi') && (selected.has('howler') || /som|audio|musica|efeito/i.test(normalized))) {
      selected.add('pixiSound');
    }

    /* 6) Fallback: canvas nativo */
    if (selected.size === 0) {
      selected.add('canvas2d');
    }

    /* 7) Resolve dependências e ordena por prioridade */
    var resolved = resolveDeps(Array.from(selected));
    return sortByPriority(resolved);
  }

  /* ================================================================
   * HELPERS
   * ================================================================ */
  function getLibraryInfo(libName) {
    return LIBRARIES[libName] || null;
  }

  function getLibraryFile(libName) {
    var lib = LIBRARIES[libName];
    return lib ? lib.file || lib.local : null;
  }

  function getLibraryGlobal(libName) {
    var lib = LIBRARIES[libName];
    return lib ? lib.global : null;
  }

  function isLibraryLocal(libName) {
    var lib = LIBRARIES[libName];
    return lib ? lib.local === true : false;
  }

  function isLibraryModule(libName) {
    var lib = LIBRARIES[libName];
    return lib ? lib.module === true : false;
  }

  function getLibraryCategory(libName) {
    var lib = LIBRARIES[libName];
    return lib ? lib.category : null;
  }

  /* ================================================================
   * CONSTRÓI A DIRETIVA DE BIBLIOTECAS PARA O SYSTEM PROMPT
   * ================================================================ */
  function buildLibraryDirective(selectedLibs) {
    if (!selectedLibs || selectedLibs.length === 0) return '';

    var out = '\n\n=== BIBLIOTECAS DISPONÍVEIS (selecionadas para este projeto) ===\n';
    out += 'Use as bibliotecas abaixo conforme a necessidade. Todas estão disponíveis localmente (offline).\n\n';

    selectedLibs.forEach(function (libName) {
      var lib = LIBRARIES[libName];
      if (!lib || !lib.local) return;

      out += '- ' + lib.name;
      if (lib.size) out += ' (' + lib.size + ')';
      out += ': ' + lib.description + '\n';
      if (lib.builtin) {
        out += '  Use: <script src="' + (lib.builtinScript || 'js/nx-loaders.js') + '"></script> (já embutido no HTML — não adicione de novo)\n';
      } else if (lib.module) {
        out += '  Use: <script type="module">import * as LIB from "vendor/' + lib.file + '"; window.' + lib.global + ' = LIB; </script>\n';
      } else {
        out += '  Use: <script src="vendor/' + lib.file + '"></script>\n';
      }
      if (lib.extraLib) {
        var extra = LIBRARIES[lib.extraLib];
        if (extra) {
          out += '  Áudio extra: <script src="vendor/' + extra.file + '"></script> (global: ' + extra.global + ')\n';
        }
      }
      out += '  Global: ' + (lib.global || 'N/A (nativo)') + '\n';
    });

    out += '\nCanvas 2D nativo: use document.createElement("canvas") e ctx.getContext("2d") — sem script extra.\n';
    out += 'REGRAS:\n';
    out += '- NUNCA use import maps, ES modules (exceto OGL que é module nativo).\n';
    out += '- NUNCA carregue a mesma biblioteca duas vezes.\n';
    out += '- three.js: SEMPRE use local vendor/three/three.min.js. Addons (OrbitControls, GLTFLoader, EffectComposer) NÃO existem.\n';
    out += '- Motores incompatíveis entre si: não use three.js + babylon.js na mesma cena.\n';
    out += '- Phaser/Pixi/Matter/Canvas2D podem coexistir (cada um controla seu canvas/renderer).\n';
    out += '- Áudio: prefira Howler.js para reprodução geral, ZzFX para efeitos leves, Tone.js para música procedural.\n';
    out += '- PixiJS + @pixi/sound devem ser usados juntos para áudio em projetos Pixi.\n';

    return out;
  }

  /* ================================================================
   * EXPOSIÇÃO
   * ================================================================ */
  window.LibrarySelector = {
    VERSION: '3.0.1',
    LIBRARIES: LIBRARIES,
    TYPE_TO_LIBS: TYPE_TO_LIBS,
    selectLibraries: selectLibraries,
    getLibraryInfo: getLibraryInfo,
    getLibraryFile: getLibraryFile,
    getLibraryGlobal: getLibraryGlobal,
    isLibraryLocal: isLibraryLocal,
    isLibraryModule: isLibraryModule,
    getLibraryCategory: getLibraryCategory,
    buildLibraryDirective: buildLibraryDirective,
    resolveDeps: resolveDeps,
    sortByPriority: sortByPriority
  };
})();
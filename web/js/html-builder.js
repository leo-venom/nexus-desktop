/* ============================================================
 * html-builder.js — port fiel de Html.kt (Android) para o navegador.
 * Monta o prompt, extrai o documento, decora com o tema e gera as
 * páginas internas (welcome, erro e lista de salvos).
 * Sem dependências de DOM; usa apenas Themes.hexA para o alpha.
 * ============================================================ */
(function () {
  'use strict';

  /* Base lógica (no app era o loadDataWithBaseURL). */
  var BASE = 'https://nexus77.local/';

  var VIEWPORT_REGEX = /name\s*=\s*["']viewport["']/i;
  var HEAD_REGEX = /<head[^>]*>/i;
  var HTML_REGEX = /<html[^>]*>/i;

  var BASE_PROMPT = `You are the CREATIVE generator of NEXUS GAME. From the user's short command, you build ONE complete, self-contained HTML document — a game, a drawing, a 3D object, or a visual composition based on what the user asked for.

Rules:
- Output ONLY raw HTML. No markdown fences, no explanations, no text before or after.
- Start with <!DOCTYPE html>. Single file: all CSS and JavaScript inline.
- You may load libraries from public CDNs, EXCEPT three.js: use the local UMD build already shipped with the app: <script src="vendor/three/three.min.js"></script> (global THREE, never import maps or module builds). It is always available offline. IMPORTANT: this build has NO addons — THREE.OrbitControls / THREE.GLTFLoader / EffectComposer DO NOT EXIST; do camera orbit manually (pointer drag) and avoid post-processing.
- The command defines the scope: build exactly what was asked, with no extra sections, features or decoration. When vague, choose the closest impressive interpretation - never pad it with unrequested content.
- Keep text to the absolute minimum: titles and essential labels only, no paragraphs or descriptions unless asked.
- Beauty comes from composition, typography, spacing, color and ONE strong focal idea - not from stacking effects. Prefer a clean, confident layout over visual noise.
- Effects are conditional: use motion, 3D or particles ONLY when the concept is inherently animated (game, 3D scene, animation, visualizer). Otherwise a refined static page is the better answer.
- If you animate, use at most ONE ambient effect system (e.g. a subtle particle field) as a supporting layer, unless the command explicitly asks for more - no overlapping particle layers, no full-screen blur/glow stacks, no constant heavy shadows. Subtle beats busy.
- Fill the whole viewport, be responsive to any screen size, keep content centered, avoid scrollbars.
- Touch targets at least 44px. Aim for smooth 60fps: one canvas, one animation loop, transforms/opacity over layout, device pixel ratio capped at 2, pause the loop when the tab is hidden.
- Never ask questions and never refuse: if the command is vague, choose the most impressive reasonable interpretation.
- If the user writes in Portuguese, keep visible page text in Portuguese (pt-BR).
- If the message includes a "Current page" HTML document, that is the page currently on screen: treat the command as an edit to it - change only what was asked, keep everything else intact, and output the complete updated document. Only build a page from scratch when no current page is provided.`;

  /* Palavras-chave que disparam o modo jogo com texturas e áudio. */
  var GAME_TERMS = [
    'jogo','jogar','game','joguinho','snake','tetris','flappy','bird','pacman',
    'mario','pong','breakout','zelda','rpg','platform','shooter','racing',
    'runner','platformer','roguelike','shmup','fps','beat','fighter','dino',
    'labirinto','maze','puzzle','chess','xadrez','tower','defense','clicker',
    'idle','dungeon','ninja','metroidvania','parkour','corrida','tiro',
    'luta','survival','aventura','adventure','battle','space','invaders',
    'drift','souls','bullet','rhythm','simulator','simulador','estrategia',
    'strategy','war','magic','dragon','dragão','fantasy','craft','build',
    'construction',
    /* Português — termos que também devem cair em jogo */
    'plataforma','nave','atirar','atira','pule','pular','pula','correr',
    'mate','matar','mata','morte','morrer','morro','vida','vidas','score',
    'pontos','pontuação','pontuacao','fase','fases','nivel','nível','boss',
    'inimigo','inimigos','arma','armas','poder','poderes','magia','feitico',
    'feitiço','espada','arco','flecha','escudo','velocidade','munição',
    'municao','combate','batalha','duelo','arena','campo','mundo','fundo',
    'mapa','cidade','floresta','deserto','gelo','caverna','masmorra',
    /* three.js para jogos 3D */
    'three','three.js','webgl',
    /* Termos criativos — montagem, cena, objeto 3D, simulação, visual */
    'cubo','esfera','cilindro','torus','cone','piramide','poliedro',
    'planeta','objeto 3d','cena 3d','mundo 3d','modelo 3d',
    'montagem','construção','construcao','cena','cenário','cenario',
    'mundo aberto','sandbox','playground',
    'visualização','visualizacao','galeria','exposição','exposicao',
    'instalação','instalacao','interativo','interativa',
    'simulação','simulacao','física','fisica','gravidade','pêndulo','pendulo','mola',
    'colorido','colorida','arco-íris','arco-iris','degradê','degrade',
    'wallpaper','fundo animado','generativo','generative',
    'procedural','criativo','criativa','fractal','padrão','padrao',
    'fluido','líquido','liquido','fumaça','fumaca','onda','ondas',
    'experiência','experiencia','ambiente','atmosfera',
    'caos','infinito','partícula','particula','neon',
  ];

  function isGameCommand(cmd) {
    if (!cmd || typeof cmd !== 'string') return false;
    var c = cmd.toLowerCase().trim();
    if (!c) return false;
    for (var i = 0; i < GAME_TERMS.length; i++) {
      if (c.indexOf(GAME_TERMS[i]) >= 0) return true;
    }
    return false;
  }

  /* Palavras-chave que disparam o modo desenho/objeto: ilustrações, arte,
     infográficos, logos, composições visuais, diagramas, objetos 3D, física,
     simulações visuais, typography art e data viz — entregues com nível de
     qualidade e detalhe equivalente ao do modo jogo. */
  var DRAWING_TERMS = [
    /* Ilustração e arte */
    'desenho','desenhar','desenhe','ilustração','ilustracao','ilustrar',
    'arte','art','artista','pintura','pintar','quadro','tela',
    'retrato','paisagem','natureza-morta','abstract','abstrato',
    'aquarela','nanquim','carvão','carvao','sketch','rascunho',
    'cartoon','charge','mangá','anime','manga','personagem',
    'arte digital','digital art','vector','vetor','vector art',
    /* Logo e identidade visual */
    'logo','logotipo','logomarca','brand','identidade visual',
    'marca','emblema','símbolo','simbolo','icone','ícone','icon',
    /* Infográfico e diagrama */
    'infográfico','infografico','diagrama','gráfico','grafico',
    'grafico de barras','grafico de pizza','grafico de linhas','chart',
    'fluxograma','flowchart','mapa mental','mind map','organograma',
    'linha do tempo','timeline','esquema','schema',
    /* Objetos 3D e escultura */
    'objeto 3d','objeto','escultura','estátua','estatua','busto','relevo',
    '3d','cubo','esfera','planeta','cilindro','torus','cone','piramide',
    'poliedro','malha','malhas','mesh','modelagem','geometry','geometria',
    'vaso','jarra','taça','taca','tigela','prato','caneca',
    'cadeira','mesa','sofá','sofa','armário','armario','cama',
    'carro','moto','bicicleta','nave','navio','aviao','avião',
    'casa','predio','prédio','castelo','ponte','torre','farol',
    'arvore','árvore','flor','planta','animal','cachorro','gato','passaro',
    'cavalo','peixe','tubarao','tubarão','dinossauro','foguete',
    /* Composição visual */
    'composição','composicao','layout','design','poster','cartaz',
    'banner','flyer','folder','capa','moodboard','storyboard',
    'colagem','collage','tipografia','lettering','caligrafia',
    'wallpaper','papel de parede','background','fundo','plano de fundo',
    /* Simulação visual e física */
    'simulação','simulacao','simular','partículas','particulas',
    'fluido','fluido simulator','fumaça','fumaca','fogo','explosão',
    'explosao','água','agua','ondas','pendulo','mola','gravidade',
    'teia','spider web','orbita','orbita','sistema solar',
    /* Data visualization */
    'data viz','visualização de dados','visualizacao de dados',
    'dashboard','indicador','métricas','metricas','relatório','relatorio',
    'termômetro','termometro','velocímetro','velocimetro','medidor',
    /* Photography e filter (efeitos visuais) */
    'efeito','efeitos','filtro','filter','photo','foto','fotografia',
    'lomografia','vintage','glitch','neon','holograma','holographic',
    /* Animações visuais */
    'animação','animacao','animado','motion','animatic','bouncing',
    'loading','spinner','progress','progresso'
  ];

  function isDrawingCommand(cmd) {
    if (!cmd || typeof cmd !== 'string') return false;
    var c = cmd.toLowerCase().trim();
    if (!c) return false;
    /* Se também parece jogo, prioriza jogo (game terms têm precedência). */
    if (isGameCommand(cmd)) return false;
    for (var i = 0; i < DRAWING_TERMS.length; i++) {
      if (c.indexOf(DRAWING_TERMS[i]) >= 0) return true;
    }
    return false;
  }

  /* Palavras-chave que disparam o modo chat/conversa: saudações, perguntas
     simples, conversas casuais, comandos que não são jogo nem desenho.
     Tudo que não casa com game nem drawing vira automaticamente chat. */
  var CHAT_TERMS = [
    'oi','ola','olá','hey','hello','hi','bom dia','boa tarde','boa noite',
    'tudo bem','como vai','e aí','e ai','td bem','beleza','blz','show',
    'obrigado','obrigada','valeu','brigado','brigada','thanks','thx','ty',
    'de nada','dnd','denada','disponha','por nada',
    'quem é voce','quem e voce','quem é você','quem e você','quem é vc',
    'que é isso','o que é isso','oq é isso','oq e isso',
    'ok','okay','tá','ta','sim','nao','não','talvez','claro','com certeza'
  ];

  function isChatCommand(cmd) {
    if (!cmd || typeof cmd !== 'string') return false;
    /* Chat é o fallback: se não é jogo nem desenho, é chat.
       Mas também detectamos saudações explícitas para acelerar. */
    if (isGameCommand(cmd) || isDrawingCommand(cmd)) return false;
    var c = cmd.toLowerCase().trim();
    if (!c) return false;
    for (var i = 0; i < CHAT_TERMS.length; i++) {
      if (c === CHAT_TERMS[i] || c.indexOf(CHAT_TERMS[i]) === 0) return true;
    }
    /* Fallback: comandos muito curtos (< 4 palavras) que não são jogo/desenho */
    var words = c.split(/\s+/).filter(function(w){return w.length > 0;});
    if (words.length <= 3) return true;
    return false;
  }

  function detectMode(command) {
    /* Retorna: 'game', 'drawing', ou 'chat' */
    if (isGameCommand(command)) return 'game';
    if (isDrawingCommand(command)) return 'drawing';
    return 'chat';
  }

  var GAME_DIRECTIVE = `
MODO JOGO ATIVADO — JOGO / OBJETO 3D / CENA INTERATIVA.

Você entrega um BUILD JOGÁVEL E ACABADO, não um protótipo. O jogo é o produto: profundidade, resposta imediata, 60fps. Texto é ruído — nada de título, instruções, créditos ou legendas; HUD só com números e rótulos de até 3 palavras.

1) CONTRATO DE SAÍDA
- Um documento HTML completo e FECHADO (</body></html>). Sem markdown, sem cercas, sem texto antes ou depois.
- <script> no topo do body. Se faltar espaço, corte comentários e código morto — NUNCA features nem o fechamento.
- three.js: <script src="vendor/three/three.min.js"></script> (global THREE). PROIBIDO CDN de three, import map, type="module" e addons — OrbitControls, GLTFLoader, EffectComposer e RoomEnvironment NÃO existem neste build.
- Nenhuma biblioteca além de three.js e WebAudio.

2) FUNDO — O JOGO É A TELA
- Cena 3D: o fundo é a própria cena (cor de céu + fog + environment). NUNCA foto atrás do 3D.
- Jogo 2D: o fundo é desenhado pelo jogo (gradiente de céu, parallax, tiles, profundidade). Nada de foto por padrão.
- 'imagens/back1.jpg' é OPCIONAL: só em jogo 2D chapado cujo cenário combine com a foto, e então NADA por cima (sem vinheta, scanline, grid, gradiente ou glow). Se o pedido pedir outro fundo, obedeça o pedido.
- Proibida qualquer camada decorativa entre o fundo e o jogo.

3) ESQUELETO OBRIGATÓRIO — siga esta estrutura (adapte nomes, não invente outro loop)

var c = document.getElementById('c');
var renderer = new THREE.WebGLRenderer({ canvas: c, antialias: false, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

var scene = new THREE.Scene();
var camera = new THREE.PerspectiveCamera(55, 1, 0.1, 300);
var W = 0, H = 0;

function fit() {
  var w = window.innerWidth | 0, h = window.innerHeight | 0;
  if (w < 32 || h < 32) { requestAnimationFrame(fit); return; }
  W = w; H = h;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(W, H, false);
  camera.aspect = W / H; camera.updateProjectionMatrix();
}
fit();
window.addEventListener('resize', fit);

/* IBL sem addons (core puro): ambiente gerado de uma cena de luzes */
scene.environment = (function () {
  var s = new THREE.Scene();
  s.add(new THREE.Mesh(new THREE.SphereGeometry(60, 24, 12),
    new THREE.MeshBasicMaterial({ color: 0x1b2a3a, side: THREE.BackSide })));
  var k = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10),
    new THREE.MeshBasicMaterial({ color: 0xffffff }));
  k.position.set(18, 26, 10); s.add(k);
  var g = new THREE.Mesh(new THREE.PlaneGeometry(40, 40),
    new THREE.MeshBasicMaterial({ color: 0x0e4a36 }));
  g.rotation.x = -Math.PI / 2; g.position.y = -12; s.add(g);
  var pm = new THREE.PMREMGenerator(renderer);
  var t = pm.fromScene(s, 0.04).texture;
  pm.dispose();
  return t;
})();

var state = 'play';                       /* play | pause | over */
var acc = 0, prev = performance.now(), STEP = 1 / 120;

function step(dt) { /* física com dt fixo */ }
function draw(dt) { /* render */ }

function loop(now) {
  requestAnimationFrame(loop);
  var dt = (now - prev) / 1000; prev = now;
  if (dt > 0.25) dt = 0.25;               /* volta de aba/minimizado */
  acc += dt;
  var guard = 0;
  while (acc >= STEP && guard++ < 8) { step(STEP); acc -= STEP; }
  draw(dt);
}
requestAnimationFrame(loop);

document.addEventListener('visibilitychange', function () {
  prev = performance.now(); acc = 0;
});

/* input único: teclado E ponteiro (mouse e toque) */
var keys = {};
window.addEventListener('keydown', function (e) {
  keys[e.key.toLowerCase()] = true;
  if (e.key === 'Escape' || e.key.toLowerCase() === 'p') togglePause();
});
window.addEventListener('keyup', function (e) { keys[e.key.toLowerCase()] = false; });
function togglePause() {
  state = state === 'play' ? 'pause' : (state === 'pause' ? 'play' : state);
}

4) ACABAMENTO — o que "pronto" significa
- 3+ tipos de inimigo/obstáculo com comportamento DIFERENTE (não a mesma coisa recolorida).
- 5+ níveis com dificuldade crescente e progressão visível.
- 3+ power-ups que mudam como se joga.
- Colisão real (círculo/AABB), dano, invencibilidade curta com piscada, vidas ou barra.
- Game over com estatísticas + restart em 1 tecla; recorde em localStorage.
- Juice: tremor curto de tela, flash de dano, partículas em pool, hitstop de 60-90ms no impacto forte.
- Áudio: SFX + ambiente procedural; um AudioContext criado uma vez e retomado no primeiro gesto.
- Nada de estado sem saída: o jogo perde e ganha.

5) REALISMO 3D EM GPU INTEGRADA
- MeshStandardMaterial/MeshPhysicalMaterial com roughness/metalness coerentes (metal: .9/.25 · plástico: .6/.45 · pedra: .95/.05). Nunca material branco padrão.
- scene.environment do PMREM acima dá reflexo e luz indireta de graça — sem ele o PBR fica morto.
- 1 luz direcional (sombra 1024, bias -0.0005) + 1 hemisférica fraca; chão recebe sombra, objeto principal projeta.
- ACES + exposição 1.0-1.15; fog na cor do fundo; céu como cor com gradiente suave em canvas.
- Detalhe por geometria procedural (chanfros, ruído em vértices, lathe/extrude) e CanvasTexture 128-256px, anisotropia 4.
- Órbita manual: pointerdown/move/up alterando theta/phi, wheel no raio, com limites. NUNCA THREE.OrbitControls.

6) ORÇAMENTO (estourar = jogo travado)
- <= 60 draw calls, <= 80k triângulos, <= 300 partículas em pool.
- Zero alocação de objeto/vetor/string dentro de step()/draw() — crie antes, reutilize.
- 1 canvas, 1 requestAnimationFrame, 1 AudioContext.
- DPR cap 1.5, shadow map <= 1024, sem post-processing, sem bloom, sem EffectComposer.
- FPS AUTO silencioso: conte frames em janelas de 1s; abaixo de 50fps em 2 janelas -> DPR 1, metade das partículas, sombra off; 58fps+ em 2 -> volta. Sem UI, sem aviso.
- 2D: fundo pintado uma vez em canvas offscreen e reutilizado com drawImage; gradientes/paths cacheados; colisão AABB/círculo; nada de filter/blur/backdrop-filter animado.

7) HUD E TEXTO
- HUD mínimo em bolhas/cantos: score, vida, nível, power-up. Só números e rótulos de até 3 palavras.
- Sem tela de título, menu ou botão "Iniciar" — começa jogando.
- Sem instruções na tela; controle sempre por teclado/setas/WASD E ponteiro/toque.

8) REPROVA (falha de entrega)
- Protótipo mínimo, stub, TODO, placeholder, canvas vazio.
- "8 níveis" que são o mesmo inimigo recolorido; array de níveis com 1 item.
- Sem colisão, sem game over, sem restart, sem som.
- Tela coberta de texto, cards, painéis, créditos, moldura, borda, vinheta ou camada decorativa.
- Vazar marcador interno do pack de texturas, comentário de planejamento ou explicação fora do HTML.

@@NX_TEX_BEGIN@@
TEXTURAS PROCEDURAIS — receitas base (three.js CanvasTexture — aplicar somente quando o pedido pedir textura/material):
Todas as texturas usam: var c=document.createElement('canvas'); c.width=c.height=128; var x=c.getContext('2d'); /* desenho */ var t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping; material.map=t;

1. METAL: ruído ImageData (loop em pixels, variar R/G/B entre 140-200) + sobrepor listras horizontais finas (fillRect altura 1-2px, espaçadas 8px, cinza escuro). material: MeshStandardMaterial, metalness:0.8, roughness:0.3.
2. CROMADO: gradiente linear horizontal dramático (preto → branco → #888 → branco → preto) que simula reflexão de ambiente. material: MeshStandardMaterial, metalness:0.9, roughness:0.1.
3. OURO: gradiente linear diagonal (marrom #8B6914 → dourado #FFD700 → marrom #8B6914) + ruído leve + emissive #886600 com intensidade 0.15. material: MeshStandardMaterial, metalness:0.7, roughness:0.3.
4. VIDRO: NUNCA usar transmission ou envMap (quebra em iframe sandbox — material fica preto). Usar MeshStandardMaterial com transparent:true, opacity:0.25-0.4, roughness:0.05, metalness:0, side:THREE.DoubleSide, emissive sutil (cor clara). Alternativa: MeshPhongMaterial com shininess:100, specular:branco. OU dois meshes: externo transparente + interno emissivo.
5. MADEIRA: linhas senoidais horizontais (variação de tom marrom com Math.sin) + nós aleatórios (círculos escuros fillStyle marrom escuro, radius 3-8px em posições aleatórias). material: MeshStandardMaterial, roughness:0.7.
6. PEDRA: ruído Perlin/simplex ou noise de alta frequência em tons de cinza (80-160) + veios escuros aleatórios (linhas finas sinuosas). material: MeshStandardMaterial, roughness:0.9.
7. LAVA: gradiente vertical laranja/vermelho/amarelo + ruído. Animação: redesenhar o canvas a cada frame deslocando o ruído OU texture.offset.x += 0.005; texture.offset.y += 0.005. emissive laranja/vermelho que pulsa. CRÍTICO: texture.needsUpdate = true após redesenhar.
8. CÉU/NEBULOSA: gradiente radial com múltiplas paradas (azul escuro → roxo → magenta) + estrelas (fillRect 1-2px, brilho variado). Pode ser skybox (mesh grande com material map virado para dentro) ou fundo.
9. TERRA/BARRO: ruído marrom/avermelhado (RGB 80-160, 40-100, 20-60) + manchas escuras irregulares. material: MeshStandardMaterial, roughness:0.9.
10. ASFALTO: ruído cinza escuro de alta frequência (RGB 40-80) + linhas horizontais claras espaçadas (marcas de pista). material: MeshStandardMaterial, roughness:0.8.
11. GRAMA: gradiente verde com ruído + traços verticais finos (fillRect 1px largura, 4-8px altura, verde claro, espaçados 4px). material: MeshStandardMaterial, roughness:0.9.
12. GRADE/GRID: linhas horizontais e verticais regulares (1-2px, cor clara) sobre fundo escuro. Útil para chão de jogos, UI holográfica, efeito retro.

PACK DE TEXTURAS PRONTO — window.NxTex (USE ESTE, NÃO REESCREVA):
O documento já carrega js/nx-textures.js, que expõe 44 texturas procedurais bonitas e prontas:
lava, metal, cromo, ouro, vidro, madeira, pedra, gelo, agua, grama, asfalto, grade, nebulosa, areia, chocolate, neon, tijolo, marmore, couro, plasma, cristal, ferrugem, concreto, holograma, obsidiana, basalto, ametista, rubi, safira, turquesa, cobre, bronze, titanio, fibra_carbono, camuflagem, zebra, tigre, veludo, pergaminho, circuito, binario, aurora, fogo_azul, pantano.

API (2D):
- NxTex.bloco(ctx, x, y, w, h, 'lava')  → pinta o bloco JÁ com textura + brilho no topo + sombra na base. Use em cada peça/inimigo/plataforma.
- ctx.fillStyle = NxTex.pattern(ctx, 'metal')  → pattern repetido para preencher áreas.
- NxTex.canvas('pedra', 64)  → canvas cru (32/64/128/256).
- NxTex.css('nebulosa')  → 'url(data:...)' para background de elemento.
- NxTex.mapear('textura de chocolate')  → traduz o pedido do usuário para a textura mais próxima.
- NxTex.names()  → lista as 44.

API (3D/three.js):
- material.map = NxTex.three('lava')  → THREE.CanvasTexture com RepeatWrapping (já configurada).

REGRA: se o pedido citar uma textura que existe no pack, CHAME NxTex para ela em vez de escrever a receita. Só crie textura manual quando o material pedido não existir no pack — e nesse caso derive das cores do material (nunca cor lisa).

TEXTURA EM JOGO 2D (canvas puro) — OBRIGATÓRIO:
Jogo 2D (Tetris, Snake, plataforma, shooter top-down, quebra-cabeça) NÃO pode usar cor chapada nos objetos. Cada objeto/peça/inimigo precisa de textura procedural:
- Crie UMA vez um canvas pequeno (32x32 ou 64x64) com gradiente + ruído + detalhes (ex.: lava = gradiente amarelo→laranja→vermelho + pontos claros; metal = cinza + listras; pedra = ruído; grama = verde + traços).
- Transforme em pattern: var pat = ctx.createPattern(canvasTextura, 'repeat');
- Pinte cada peça com ctx.fillStyle = pat (o pattern repete dentro do bloco), depois adicione brilho no topo e sombra na base com fillRect de rgba.
- Nunca use só fillStyle = '#FF0000' numa peça/inimigo: peça com cor lisa = entrega incompleta.
- Se o pedido diz "textura lava", TODAS as peças devem mostrar a lava (gradiente + veios + brilho), não apenas a borda ou o fundo.

REGRA DE 3D SIMPLES: se o pedido for um objeto ou cena 3D — cubo, esfera, planeta, torus, cilindro, voxel — você DEVE aplicar uma textura procedural de verdade (CanvasTexture), nunca apenas uma cor lisa em MeshStandardMaterial. Escolha a textura pelo contexto do pedido (lava → LAVA animada; metal → METAL; planeta → TERRA ou CÉU; moeda → OURO). O cubo/cena 3D sem textura é considerado entrega incompleta.

INFERÊNCIA AUTOMÁTICA DE TEXTURA (aplicar SEMPRE sem o usuário pedir):
- Inimigo robô/mecânico/arma → Metal ou Cromado
- Inimigo orgânico/monstro/criatura → Pedra, Terra ou Madeira
- Cenário de fundo/distante → Céu/nebulosa
- Chão/plataforma → Asfalto, Terra, Grama ou Grade
- Obstáculo/parede → Pedra, Madeira ou Metal
- Item colecionável/moeda/power-up → Ouro ou Vidro
- Efeito especial/portal/lava → Lava (COM animação de fluxo)
- Elementos de UI/holografia → Vidro ou Grade

ANIMAÇÃO DE TEXTURA:
- Lava/água/fogo: loop rAF que redesenha o CanvasTexture a cada frame (desloca ruído, muda gradiente). SEMPRE setar texture.needsUpdate = true após redesenhar.
- Efeito de fluxo mais leve (água, vento): texture.offset.x += 0.005 ou texture.offset.y += 0.005 a cada frame. RepeatWrapping obrigatório.
- Piscar/brilho: variar material.emissiveIntensity com Math.sin(time * freq) no loop.
@@NX_TEX_END@@

13 SONS WEBAUDIO REALISTAS — ARQUITETURA COMPLETA:

AudioContext compartilhado, criado no primeiro clique/interação do usuário. Função única playSom(tipo):

var actx = null;
function initAudio() { if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); }

function playSom(tipo) {
  initAudio();
  var p = SOM_PARAMS[tipo]; if (!p) return;
  // criar OscillatorNode(s) ou AudioBuffer (ruído branco), GainNode(s), BiquadFilterNode
  // conectar: source → gain → filter → destination (ou cadeias múltiplas)
  // configurar frequência, tipo de onda, ganho, cutoff conforme o tipo
  // start(actx.currentTime) + stop(actx.currentTime + duração)
}

1. MÚSICA DE FUNDO (background): Osciladores em escala pentatônica/blues (notas: 262, 294, 330, 392, 440, 523 Hz) + LFO vibrato modulando frequência ±5 cents + BiquadFilterNode lowpass 800-2000Hz. Música ACELERA com o nível (aumentar frequência do LFO, diminuir cutoff do filtro).
2. TIRO/LASER: Oscilador 800→100Hz descendente em 0.15s (linearRampToValueAtTime) + GainNode decay rápido (setValueAtTime 0.3, exponentialRampToValueAtTime 0.001 em 0.15s). Variação aleatória ±5% na frequência inicial. Tipo: square ou sawtooth.
3. EXPLOSÃO: AudioBuffer de ruído branco (Math.random() * 2 - 1, 0.5s sample rate) + GainNode decay 0.5s + BiquadFilterNode lowpass 2000→100Hz descendente. Camada extra: OscillatorNode 40-60Hz (sine) sub grave com decay 0.3s.
4. IMPACTO/COLISÃO: AudioBuffer ruído curto 0.08s + OscillatorNode grave 80-120Hz (triangle) decay rápido. Impacto metálico: + OscillatorNode 2000-4000Hz (sine) decay 0.02s (ring metálico).
5. MOTOR/ENGINE: Dois OscillatorNode 100Hz+200Hz (sawtooth) com detune sutil (detune: 5-15 cents) + BiquadFilterNode bandpass (freq 300-800, Q 1-3). Frequência varia com velocidade.
6. PASSOS: AudioBuffer ruído 0.05s + BiquadFilterNode lowpass 500Hz + OscillatorNode grave 60Hz (sine). Repetir em intervalo pela velocidade. VARIAR a cada passo.
7. VENTO/AMBIENTE: AudioBuffer ruído contínuo + BiquadFilterNode lowpass 300-800Hz com gain 0.02-0.05. LFO (OscillatorNode 0.1-0.5Hz) modulando cutoff para variação suave.
8. POWER-UP/COLETA: Dois OscillatorNode ascendentes: 400→800Hz + 600→1200Hz em 0.2s (sine). Attack 0.01s, decay 0.2s. BiquadFilterNode lowpass sweep 500→3000Hz.
9. GAME OVER: OscillatorNode descendente 400→50Hz em 1.5s (triangle ou sawtooth) + ruído grave decay longo. ESCALA descendente de 3-4 notas (400→300→200→50Hz, cada nota 0.3s).
10. HIT/DANO: AudioBuffer ruído 0.05s + OscillatorNode 300→80Hz descendente 0.1s. GainNode com spike (attack 0s, decay 0.1s).
11. MENU HOVER/CLICK: OscillatorNode 0.03s, 600-800Hz (sine), attack 0s decay 0.03s. Click: dois OscillatorNode simultâneos (600+800Hz).
12. LEVEL COMPLETE/JINGLE: Escala ascendente C-E-G-C (262→330→392→523 Hz) com acorde básico de fundo (C major: 262+330+392). Cada nota 0.15-0.2s. Fade out 0.5s.
13. MOEDA/PONTO: OscillatorNode 800→1600Hz ascendente 0.1s (sine). Two-tone: 800Hz 0.05s + 1200Hz 0.05s.

CHECK FINAL — passe por cada item; se algum falhar, conserte antes de entregar:
- Documento fechado (</body></html>), <script> todos balanceados, nenhum erro no primeiro frame?
- Primeiro frame já mostra o jogo/objeto, sem clique e sem tela de título?
- Vence e perde? Restart em 1 tecla? Recorde salvo?
- Jogo: 3+ inimigos distintos, 5+ níveis, 3+ power-ups, colisão real?
- Fundo é a própria cena (3D) ou desenhado pelo jogo (2D), sem camada decorativa por cima?
- 60fps dentro do orçamento (DPR 1.5, 1 loop, pool de partículas, zero alocação no frame)?

ENTREGUE APENAS O HTML.

`;

  /* ==========================================================
   * DRAWING_DIRECTIVE — modo desenho/objeto/ilustração/arte.
   * Ativado quando o comando pede desenho, ilustração, logo,
   * objeto 3D, infográfico ou composição visual (mas não jogo).
   * Mesmo nível de qualidade e detalhe do GAME_DIRECTIVE.
   * A HEAD contém APENAS regras visuais genéricas (gradientes,
   * sombras, iluminação, composição) — SEM menção a NxTex ou
   * textura procedural. O bloco de textura (marcado @@NX_TEX)
   * entra quando o pedido pede textura explícita.
   * ========================================================== */
  var DRAWING_DIRECTIVE = `

MODO DESENHO ATIVADO — VOCÊ ESTÁ CRIANDO UM DESENHO/ILUSTRAÇÃO/OBJETO COMPLETO. Siga TODAS as regras abaixo. A saída é HTML + CSS + Canvas/three.js puro, SEM engine externa além do three.js para 3D.

SÓ O QUE FOI PEDIDO — REGRA ABSOLUTA (a mais importante deste modo):
- Entregue EXATAMENTE o que o pedido descreve, nada mais. Um cubo é um cubo; um vaso é um vaso; um logo é o logo.
- PROIBIDO acrescentar por conta própria: títulos, subtítulos, rótulos ("SETOR 09", "ONLINE", "ENERGIA 98%"), legendas, HUD, painéis, cards, badges, contadores, molduras, botões, ícones, grades/estrelas de fundo, vinheta, "camadas" decorativas, segundo objeto ou cenário.
- PROIBIDO texto visível na página: nenhuma palavra, a menos que o pedido peça texto/tipografia/logo com nome.
- PROIBIDO encher a tela com elementos de apoio para "parecer completo". Pedido de UM objeto = esse objeto bem acabado e mais nada.
- Para enriquecer, enriqueça DENTRO do objeto: material, luz, reflexo, sombra própria, detalhe de superfície.
- Só adicione elemento extra quando o pedido pedir explicitamente ("com fundo", "com texto", "três objetos", "com legenda", "com interface").

REGRA ABSOLUTA — ENTREGA COMPLETA EM UMA RESPOSTA:
O documento inteiro precisa caber em UMA resposta do modelo. Priorize um desenho COMPLETO, visualmente impressionante e fechado (com </body></html>). Se estiver ficando grande, corte comentários e redundância — NUNCA corte detalhes visuais, cores, formas, iluminação ou o fechamento do HTML.

REGRAS DE TELA (OBRIGATÓRIO):
- 100vw x 100dvh, sem scroll. body: margin:0;padding:0;overflow:hidden;width:100vw;height:100dvh;display:flex;align-items:center;justify-content:center;
- Centralize o desenho/objeto na tela com escala responsiva (min/max dimensões, viewport units, ou escala relativa ao canvas).
- devicePixelRatio cap em Math.min(window.devicePixelRatio||1, 2).
- FUNDO PADRÃO: a imagem 'imagens/back1.jpg' em center/cover sem repetição (o arquivo back1.jpg já existe no projeto e é servido pelo servidor local). Use-a como fundo do desenho/objeto a menos que o pedido peça outro fundo.
- Se o pedido pedir outro fundo/mudança de fundo, troque por ele (cor, gradiente ou outra imagem). Se for imagem, use 'imagens/' como caminho.
- Se o desenho usar canvas, meça defensivamente: se innerWidth/innerHeight vier 0, remedir em requestAnimationFrame até obter valores > 0.

PRIMEIRO FRAME — REGRA ABSOLUTA (o objeto aparece SEM interação):
- O desenho/objeto precisa estar visível no primeiro frame, sem clique, tecla, scroll, hover ou espera.
- PROIBIDO gate de início: flag "started", "if(!started)return", IntersectionObserver, document.visibilityState, requestIdleCallback, setTimeout/setInterval de espera, tela "carregando…", ou esperar fontes/imagens antes de desenhar.
- Canvas 3D: chame renderer.render(scene,camera) uma vez de forma SÍNCRONA antes do loop; se o viewport medir 0, espere e redesenhe — nunca deixe em branco.
- Canvas 2D: chame draw() uma vez antes de agendar o requestAnimationFrame.

QUALIDADE VISUAL — REGRA ABSOLUTA (bonito, LEVE e RÁPIDO):
- NADA de formas geométricas simples sem acabamento. Um círculo solto ou um retângulo sem estilo NÃO é entrega completa.
- Acabamento se faz com o que é BARATO: gradientes de 2-4 stops, contorno (stroke) contrastante, camadas de cor (2-3 shapes sobrepostos), highlight e sombra em forma de shape deslocado. Isso já dá volume e brilho sem custo por pixel.
- Em desenho 2D (canvas puro): cada forma principal = preenchimento com gradiente (radial/linear) + contorno + highlight/sombra desenhados como shape. Nada de ctx.fillStyle sólido + fillRect em elemento grande.
- Em desenho 3D (three.js): cada mesh precisa de material configurado (MeshStandardMaterial com color/emissive/metalness/roughness coerentes) + iluminação (ambient + directional) + fundo condizente. NUNCA deixe a cor branca padrão do material.
- ctx.shadowBlur e ctx.globalCompositeOperation são CAROS (blur em software): use no MÁXIMO em 1-2 elementos pequenos ou numa camada pré-renderizada em offscreen canvas. PROIBIDO shadowBlur/globalCompositeOperation dentro de loop, por forma, em tela cheia ou em animação de frame.
- Desenho estático (não animado): desenhe UMA vez, fora de qualquer requestAnimationFrame, e pare. Não deixe loop rodando à toa.
- ctx.save/restore é obrigatório ao transformar o estado do canvas (translate, rotate, scale).

O QUE ENTREGAR — NADA ALÉM DISSO:
- PARA DESENHO/ILUSTRAÇÃO: o objeto/cena pedido, com acabamento alto NO PRÓPRIO OBJETO (material, gradiente, contorno, highlight, sombra). 1 objeto bem feito vale mais que vários inventados.
- PARA OBJETO 3D: modelo com geometria adequada + material configurado com cor/emissive/metalness/roughness coerentes + iluminação (ambient + directional) + câmera com órbita MANUAL por drag (OrbitControls não existe neste build) + fundo simples (cor/gradiente, não cenário)
- PARA LOGO/ÍCONE: forma limpa e marcante, paleta reduzida (2-4 cores), apresentação sobre fundo que contraste, animação de entrada sutil
- PARA INFOGRÁFICO/DIAGRAMA: dados reais (não placeholder), ícones/ilustrações de apoio, hierarquia visual clara (título > subtítulo > corpo > legenda)
- PARA ANIMAÇÃO VISUAL: loop fluido rAF com delta time, easing (cubic-bezier, Math.sin/cos), partículas com pool (máx 60), sem alocação no loop
- PARA SIMULAÇÃO FÍSICA: gravidade, atrito, colisão AABB/círculo, parâmetros ajustáveis no topo do script
- PARA DATA VIZ: dados reais embutidos, eixos com labels + grid, tooltip no hover, animação de entrada dos dados (barras/pizzas crescendo)
- PARA TIPOGRAFIA/LETTERING: cada letra como elemento span com cor/gradiente próprio, kerning manual, animação de entrada staggered

COMO ENTREGAR O DESENHO COMPLETO:
1. Planeje a composição antes de codificar: distribuição dos elementos, pesos visuais, paleta (escolha as cores que combinam com o pedido), hierarquia.
2. Use a paleta escolhida EXPANSIVAMENTE — cada cor deve aparecer em pelo menos um gradiente, shape, partícula, brilho ou detalhe. Se o pedido citou cores/estilo, essas cores são obrigatórias e substituem a sua escolha.
3. Canvas 2D — regras de ouro: ctx.save/restore antes de transformar; gradientes com 2-4 stops (ctx.createRadialGradient / createLinearGradient) criados UMA vez fora do loop; contornos com ctx.strokeStyle+lineWidth diferentes do fill; profundidade por highlight/sombra em shape deslocado. ctx.shadowBlur só em elemento pequeno ou em camada offscreen pré-renderizada — nunca por forma dentro do loop.
4. Three.js 3D: scene → perspectiveCamera(75, w/h, 0.1, 1000) → WebGLRenderer({antialias:true, powerPreference:'high-performance'}) + renderer.setPixelRatio(Math.min(devicePixelRatio,2)) → órbita/rotação manual por drag ou autoRotate no rAF (NÃO use OrbitControls/GLTFLoader: não existem no build local) → ambient + directional/point lights (intensity 0.5-1.5) → shadowMap.enabled num único directional → material com color + emissive + metalness/roughness coerentes → fundo com scene.background = new THREE.Color() ou gradiente.
5. Animações: requestAnimationFrame com delta time (clock.getDelta), easing suave (Math.sin/cos, cubic-bezier), sem stutter. Stagger de entrada com delay progressivo.
6. Responsividade: window.addEventListener('resize', handler) com debounce (setTimeout 200ms), centralizar sempre, redimensionar canvas/DOM proporcionalmente.
7. Acessibilidade: aria-label descritivo no elemento principal/svg/canvas, contraste de cor adequado (WCAG AA).

@@NX_TEX_BEGIN@@

PACK DE TEXTURAS PRONTO — window.NxTex:
O documento já carrega js/nx-textures.js com 44 texturas procedurais (lava, metal, cromo, ouro, vidro, madeira, pedra, etc.).
- ctx.fillStyle = NxTex.pattern(ctx, 'metal') → pattern para preencher formas no canvas 2D
- NxTex.canvas('pedra', 64) → canvas de textura para criar patterns manuais
- NxTex.css('nebulosa') → 'url(data:...)' para background de elementos DOM
- NxTex.three('lava') → THREE.CanvasTexture para materiais 3D (RepeatWrapping já configurado)
- NxTex.bloco(ctx, x, y, w, h, 'lava') → pinta bloco com textura + brilho topo + sombra base
- NxTex.mapear('textura de chocolate') → traduz sinônimos para o nome correto

INFERÊNCIA AUTOMÁTICA (aplicar quando fizer sentido ao tema do desenho):
- Objeto metálico/robô/engrenagem → Metal, Cromo, Aço ou Titânio
- Natureza/orgânico → Madeira, Pedra, Terra, Grama, Pântano
- Água/líquido → Água, Gelo, Fogo Azul
- Fogo/lava/energia → Lava, Fogo Azul, Aurora, Plasma
- Pedra/construção → Pedra, Tijolo, Mármore, Concreto, Obsidiana, Basalto
- Joia/cristal → Cristal, Ametista, Rubi, Safira, Turquesa, Ouro
- Tecido/orgânico → Veludo, Couro, Camuflagem, Zebra, Tigre
- Madeira/móvel → Madeira, Veludo, Pergaminho
- Tecnologia/futurista → Circuito, Binário, Holograma, Neon, Fibra de Carbono
- Céu/espaço → Nebulosa, Aurora
- Doce/comida → Chocolate

REGRA: se o pedido citar um material que existe no pack, CHAME NxTex para ele. Só crie textura manual quando o material não existir no pack — e nunca cor lisa em canvas/3D.

@@NX_TEX_END@@

DESEMPENHO — LEVE E RÁPIDO (REGRA ABSOLUTA):
- Desenho/objeto leve: poucos paths, poucos gradientes, ZERO blur em tela cheia. Nada de repetir desenho caro a cada frame.
- Estático (sem animação): desenhe UMA vez, sem requestAnimationFrame, e pare o loop.
- Animado: UM único loop rAF com delta time. Partículas com pool fixo (máx 60), sem alocação dentro do loop.
- Camadas caras (gradiente de fundo, glow, textura, sombra) desenhe UMA vez em canvas offscreen e só drawImage por frame.
- Reaproveite gradientes/paths/patterns (crie uma vez, reutilize por referência). Nunca crie gradiente dentro do loop.
- PROIBIDO: ctx.filter='blur()', shadowBlur dentro de loop, globalCompositeOperation por forma, centenas de partículas, canvas maior que a tela.
- Cap de devicePixelRatio em 2 (canvas.width = w * dpr; ctx.scale(dpr,dpr)).
- 3D: shadowMap ligado só num directional light, geometria enxuta, dpr cap 2, sem post-processing pesado.
- 3D ANIMADO — FPS AUTO: conte frames em janelas de 1s; se cair abaixo de 50 fps em 2 janelas seguidas, baixe o pixelRatio para 1 e reduza efeitos; volte ao normal se passar de 58 fps. Silencioso, sem UI.
- Pause animações quando document.hidden; retome no visibilitychange.
- Meta: primeiro frame bonito e completo, sensação de 60 fps em máquina modesta.

EXEMPLOS DE REFERÊNCIA (guia de qualidade, não cópia):
- "desenhe um vaso": vaso 3D com revolução (LatheGeometry), gradiente suave de cerâmica (MeshStandardMaterial com color gradiente), iluminação dramática (directional + ambient), sombra projetada, fundo degradê.
- "crie um logo neon": o lettering pedido com glow animado (text-shadow multicamada + @keyframes pulsando) sobre fundo escuro liso — sem partículas nem elementos extras.
- "ilustre uma paisagem": 3 planos em canvas 2D (montanhas ao fundo com gradiente, árvores no meio, grama/rio na frente), cada forma com gradiente 3+ stops, contorno e sombra, céu com gradiente radial.
- "faça um cubo 3D de metal": BoxGeometry + MeshStandardMaterial com cor metálica + emissive sutil + OrbitControls + ambient/directional lights + shadowMap + fundo escuro liso (sem grade, sem rótulos).

NÃO FAÇA:
- Títulos, rótulos, legendas, HUD, painéis, badges, molduras, botões ou qualquer texto que o pedido não pediu
- Camadas decorativas de fundo (grade, estrelas, vinheta, partículas ambientes) para "enriquecer" a cena
- Segundo objeto/cenário inventado quando o pedido é de um objeto só
- Formas geométricas simples sem acabamento (círculo, quadrado, retângulo com cor lisa)
- Placeholder, "exemplo", "ilustração meramente ilustrativa"
- Objeto 3D sem iluminação (sem ambient nem directional) ou com MeshStandardMaterial na cor branca padrão
- Canvas vazio ou com um único filledRect
- Fundo branco puro sem contexto (a menos que o pedido peça fundo claro)
- Custo desnecessário: blur/shadow em tela cheia, glow por forma, partículas aos milhares, loop rAF rodando em desenho estático
- Criar textura procedural (NxTex, ctx.createPattern, THREE.CanvasTexture) quando o pedido NÃO cita material/textura

VERIFIQUE ANTES DE ENTREGAR:
- Entregou SÓ o que foi pedido? Nenhum texto, HUD, painel ou camada extra inventada? (se sim, remova antes de entregar)
- Composição equilibrada? o objeto é o foco absoluto?
- Paleta coerente com o pedido e usada de forma expansiva?
- Se o pedido citou cores/estilo, elas foram respeitadas?
- Acabamento em cada forma (gradiente, contorno, highlight/sombra em shape)?
- 3D: material configurado + iluminação + câmera orbiting?
- Canvas medido defensivamente (innerWidth 0 → remedir)?
- Responsivo? centralizado na tela?
- LEVE E RÁPIDO: sem blur em tela cheia, sem trabalho caro repetido por frame, desenho estático desenhado uma vez?
- Textura só entrou se o pedido pediu material/textura? (pedido sem material = cor + gradiente)
- Detalhamento adequado ao comando?`;

  /* Os marcadores @@NX_TEX_BEGIN@@ / @@NX_TEX_END@@ já vêm no texto do
     DRAWING_DIRECTIVE (antes do PACK de texturas e no fim das regras de
     textura). Não injetar marcador extra: um segundo BEGIN ficava dentro do
     bloco e vazava "@@NX_TEX_BEGIN@@" no prompt final. */

  /* Separa DRAWING_DIRECTIVE em head / textura / tail */
  var _drawTexBegin = DRAWING_DIRECTIVE.indexOf('@@NX_TEX_BEGIN@@');
  var _drawTexEnd = DRAWING_DIRECTIVE.indexOf('@@NX_TEX_END@@');
  var DRAWING_DIRECTIVE_HEAD = _drawTexBegin < 0 ? DRAWING_DIRECTIVE : DRAWING_DIRECTIVE.slice(0, _drawTexBegin);
  var DRAWING_TEX_DIRECTIVE = (_drawTexBegin < 0 || _drawTexEnd < 0) ? '' :
    DRAWING_DIRECTIVE.slice(_drawTexBegin + '@@NX_TEX_BEGIN@@'.length, _drawTexEnd);
  var DRAWING_DIRECTIVE_TAIL = _drawTexEnd < 0 ? '' :
    DRAWING_DIRECTIVE.slice(_drawTexEnd + '@@NX_TEX_END@@'.length);
  DRAWING_DIRECTIVE = DRAWING_DIRECTIVE_HEAD + DRAWING_TEX_DIRECTIVE + DRAWING_DIRECTIVE_TAIL;

  /* Divide o GAME_DIRECTIVE em cabeça / bloco de texturas / cauda.
     O bloco de texturas entra no prompt SOMENTE quando o pedido pede textura. */
  var _texBegin = GAME_DIRECTIVE.indexOf('@@NX_TEX_BEGIN@@');
  var _texEnd = GAME_DIRECTIVE.indexOf('@@NX_TEX_END@@');
  var GAME_DIRECTIVE_HEAD = _texBegin < 0 ? GAME_DIRECTIVE : GAME_DIRECTIVE.slice(0, _texBegin);
  var TEXTURE_DIRECTIVE = (_texBegin < 0 || _texEnd < 0) ? '' :
    GAME_DIRECTIVE.slice(_texBegin + '@@NX_TEX_BEGIN@@'.length, _texEnd);
  var GAME_DIRECTIVE_TAIL = _texEnd < 0 ? '' :
    GAME_DIRECTIVE.slice(_texEnd + '@@NX_TEX_END@@'.length);
  GAME_DIRECTIVE = GAME_DIRECTIVE_HEAD + TEXTURE_DIRECTIVE + GAME_DIRECTIVE_TAIL;

  /* Bloco curto no lugar do bloco de texturas quando o pedido NÃO pede textura (modo jogo). */
  var TEXTURE_OFF_DIRECTIVE = `
TEXTURAS — SOMENTE SOB PEDIDO (este pedido NÃO pede textura):
- NÃO use window.NxTex, NÃO chame ctx.createPattern, NÃO crie THREE.CanvasTexture e NÃO desenhe textura procedural.
- Cada peça/inimigo/plataforma/objeto usa cor sólida, gradiente de 2-3 tons, forma geométrica ou sombra/brilho simples — visual limpo e flat.
- Não converta material em textura por conta própria e não escreva receitas de ruído/veios/pattern: não é requisito de entrega aqui.
- Exceção: se o usuário pedir para REMOVER texturas da página atual, apague as existentes (trocando por cor sólida/gradiente) e não crie novas.
- Se o pedido citar explicitamente um material/textura (ex.: "peças de tijolo", "metal", "lava"), aí sim use o pack NxTex para esse material.
`;

  /* Bloco curto no lugar do bloco de texturas quando o pedido NÃO pede textura (modo desenho). */
  var DRAWING_TEX_OFF_DIRECTIVE = `
TEXTURAS E MATERIAIS — NÃO USE textura procedural neste desenho:
- NÃO use window.NxTex, NÃO chame ctx.createPattern, NÃO crie THREE.CanvasTexture e NÃO desenhe textura procedural.
- Use cores sólidas, gradientes de 2-5 tons, formas geométricas limpas com sombra/brilho e contornos refinados — é o caminho mais LEVE e RÁPIDO.
- O acabamento visual VEM de: gradientes multicoloridos, contornos (ctx.stroke), highlight/sombra em shape deslocado, camadas de cor e composição equilibrada — não de textura procedural.
- Se o pedido citar EXPLICITAMENTE um material específico (ex.: "textura de tijolo", "metal", "madeira", "lava"),
  aí sim use NxTex para aquele material. Caso contrário, resolva com cor e gradiente.
`;

  /* Detecta pedido explícito de textura no comando do usuário (ou na página atual). */
  var TEX_TERMS = [
    'textura', 'texturas', 'texturizado', 'texturizada', 'texturizar',
    'pattern', 'material', 'materiais', 'shader', 'pbr',
    'tijolo', 'tijolos', 'madeira', 'metal', 'metalico', 'pedra', 'rocha',
    'lava', 'grama', 'asfalto', 'marmore', 'ouro', 'prata', 'gelo', 'agua',
    'neon', 'chocolate', 'couro', 'cristal', 'ferrugem', 'concreto',
    'holograma', 'obsidiana', 'basalto', 'ametista', 'rubi', 'safira',
    'turquesa', 'cobre', 'bronze', 'titanio', 'camuflagem', 'zebra', 'tigre',
    'veludo', 'pergaminho', 'circuito', 'binario', 'aurora', 'pantano',
    'areia', 'terra', 'realista', 'realistas', 'fotorrealista', 'voxel'
  ];
  /* "sem textura", "tira a textura", "remove texture" → NÃO usar textura. */
  var TEX_NEGATE = /(?:^|[^a-z0-9])(?:sem|no|without|remove|remover|remova|retire|retirar|retira|retiram|tirar|tira|tiram|tire|apague|apagar|desativa\w*|desligar\w*|desligue)\b[^.!?]{0,28}?textur\w*/;

  function accentless(s) {
    return String(s == null ? '' : s).toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function docHasTextures(doc) {
    if (!doc || typeof doc !== 'string') return false;
    return /\bNxTex\b|createPattern|CanvasTexture|nx-textures/.test(doc);
  }

  function wantsTextures(cmd, doc) {
    var c = accentless(cmd);
    if (c && TEX_NEGATE.test(c)) return false;
    var i;
    if (c) {
      for (i = 0; i < TEX_TERMS.length; i++) {
        if (new RegExp('(?:^|[^a-z0-9])' + TEX_TERMS[i] + '(?:[^a-z0-9]|$)').test(c)) return true;
      }
    }
    /* Ajuste numa página que já tem textura: mantém textura. */
    return docHasTextures(doc);
  }

  /* ==========================================================
   * CHAT_DIRECTIVE — modo conversa/resposta textual.
   * Ativado quando o comando não é jogo nem desenho. Responde
   * com HTML bonito, interativo e visualmente refinado — nunca
   * texto puro.
   * ========================================================== */
  var CHAT_DIRECTIVE = `

MODO CHAT ATIVADO — VOCÊ ESTÁ RESPONDENDO A UMA MENSAGEM. Sua resposta NÃO é um jogo nem um desenho técnico. Crie uma página HTML bonita, elegante e interativa que comunique a resposta com estilo e personalidade.

REGRAS ABSOLUTAS:
- Saída é SEMPRE HTML completo (<!DOCTYPE html>), não texto puro.
- A página deve ser visualmente impressionante mesmo para uma resposta simples: use tipografia refinada, cores do tema, microanimações sutis, espaçamento generoso.
- FUNDO: use o --nx-bg do tema, ou um gradiente sutil que remeta ao sentimento da resposta.
- Centralize o conteúdo vertical e horizontalmente. Nada de texto colado na borda.
- Cards/elementos de resposta com --nx-surface, borda arredondada (12-16px), padding generoso (24-48px).
- NUNCA texto preto no branco sem estilo. Mesmo "oi" merece um card bonito.

TIPOGRAFIA (prioridade máxima em chat):
- Use a paleta de cores do tema EXPANSIVAMENTE para títulos, destaques, ícones e bordas.
- Títulos grandes com lettering: font-weight 700-900, gradiente com --nx-accent, animação de entrada sutil (fadeIn 0.4-0.8s).
- Corpo do texto em --nx-text com line-height 1.6-1.8, fonte confortável (sans-serif ou serif).
- Destaques, ícones e emojis ampliados como elementos decorativos (não só texto).
- O título principal deve ter presença visual: grande, colorido, com glow ou gradiente.

ANIMAÇÕES E INTERAÇÃO:
- Animações de entrada: fadeIn+slideUp nos elementos principais (0.4-0.8s, staggered se múltiplos).
- Microinterações: hover sutil em cards/botões (scale 1.02, glow 200ms).
- Se a resposta pedir ação (sim/não/ok): um botão estilizado com hover e ripple.
- Use no máximo 1-2 animações simultâneas — elegância, não exagero.
- Partículas ou efeitos decorativos SOMENTE se combinarem com o tom da resposta.

O CONTEÚDO:
- Responda em PORTUGUÊS (pt-BR) se o usuário escreveu em português.
- Seja direto e amigável. Não encha lingüiça.
- Se a pergunta for técnica ou pedir informação, apresente em formato hierarquizado (cards, listas estilizadas, ícones).
- Se for uma saudação, seja caloroso e apresente o NEXUS GAME e seus modos (jogo, desenho, chat).
- NUNCA invente desculpas para não responder ("Não sei fazer isso", "Sou limitado" etc.). Escolha a interpretação mais impressionante e entregue algo bonito.

EXEMPLOS DE RESPOSTA (tom e estilo):
- "oi" → Card centralizado com gradiente suave, "👋 Olá!" grande no accent, subtítulo explicando os 3 modos (jogo, desenho, chat) com bordas decorativas.
- "obrigado" → "✨ De nada!" com glow animado, textinho de boas-vindas, botão "Continuar criando" estilizado.
- "quem é você?" → Card com ícone decorativo, título "NEXUS GAME", descrição com os recursos principais em cards menores.

CHECKLIST FINAL:
- HTML completo? viewport? sem scroll?
- Título bonito? cores do tema?
- Card/elemento de resposta centralizado?
- Animações de entrada sutis?
- Interação (botão hover)?
- Tom amigável e direto?`;

  /* Escopo único — NEXUS GAME é sempre modo criativo completo. */
  function gameScopeNote(level) {
    return '\n\nESCOPO — CRIAÇÃO COMPLETA E OTIMIZADA: entregue o que o pedido pede com a qualidade que ele merece. Jogo tradicional = níveis, inimigos, power-ups, áudio, HUD, game over. Objeto 3D/cena = material bem configurado, iluminação, textura, rotação. Simulação/ambiente = loop rAF otimizado, partículas com pool, interação. Tudo com início imediato (sem menu/tela de apresentação), canvas de borda a borda, sem moldura, sem elementos extras que o pedido não pediu. Qualidade máxima NA CRIAÇÃO (personagens, materiais, efeitos, áudio) — nada de camadas, seções ou textos extras. Desempenho manda: prefira desenho leve e barato, reutilize objetos, evite recalcular por frame. 60fps constante.';
  }

  function drawingScopeNote() {
    return '\n\nESCOPO — DESENHO COMPLETO, LEVE E RÁPIDO, ESTRITAMENTE O PEDIDO: entregue exatamente o objeto/cena que o usuário pediu — sem títulos, sem rótulos, sem HUD, sem painéis, sem textos e sem camadas decorativas inventadas. O acabamento (gradientes, contornos, highlight/sombra em shape) vai NO OBJETO, não em elementos extras. Barato de desenhar: poucos paths, nada de blur em tela cheia, desenho estático desenhado UMA vez. Textura procedural SÓ se o pedido citar material/textura. Paleta: a que você escolher para o pedido (ou a que ele especificar).';
  }

  function chatScopeNote() {
    return '\n\nESCOPO — RESPOSTA VISUALMENTE REFINADA: a página deve ser bonita, elegante e transmitir a mensagem com estilo. Mesmo respostas curtas merecem tipografia cuidada, cores do tema, animação de entrada sutil e um card centralizado. O tom é amigável e direto.';
  }

  function gameLightingNote(theme) {
    var lum = 0.2126 * parseInt(theme.background.slice(1,3),16) / 255 +
              0.7152 * parseInt(theme.background.slice(3,5),16) / 255 +
              0.0722 * parseInt(theme.background.slice(5,7),16) / 255;
    if (lum < 0.2) return '\nThe game scene MUST be visibly lit. Add a subtle rim light or glow on characters and interactive elements so they stand out from the dark background.';
    return '';
  }

  /* Cor do brilho que atravessa o título: branco sobre accent escuro,
     quase-preto sobre accent claro — garante contraste no tema único. */
  function sheenOn(hex) {
    var h = String(hex || '').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return '#FFFFFF';
    var lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum > 0.62 ? '#0B0B0E' : '#FFFFFF';
  }

  /* Escapa texto para HTML. Equivale ao replace global do Kotlin. */
  function esc(s) {
    return String(s == null ? '' : s)
      .split('&').join('&amp;')
      .split('<').join('&lt;');
  }

  /* Escapa texto para atributo com aspas duplas. */
  function escAttr(s) {
    return esc(s).split('"').join('&quot;');
  }

  /* Diretriz de nível de detalhe (0 = mínimo, 2 = máximo). */
  function detailDirective(level) {
    var l = Math.floor(Number(level));
    if (!isFinite(l)) l = 1;
    l = Math.max(0, Math.min(2, l));
    if (l === 0) return '\n\nDetail level: MINIMAL. Keep it small and essential: no external libraries, no heavy effects - just a clean single-file page that answers the command.';
    if (l === 2) return '\n\nDetail level: MAXIMUM — ENGINEERING QUALITY (not effect quantity). Produce a production-grade single-file page applying these standards:\n' +
          '1. THREE.JS 3D (only when the concept needs 3D): scene → perspective camera → WebGLRenderer({antialias:true}) → shadowMap.enabled=true → directional+ambient lights → animate(t) loop using THREE.Clock.getDelta() for frame-independent motion → handle window resize (camera.aspect, renderer.setSize caps dpr at 2). Dispose materials/geometries on scene rebuild.\n' +
          '2. CANVAS 2D (only when needed): requestAnimationFrame with delta time, devicePixelRatio cap at 2, clearRect before draw.\n' +
          '3. MOTION & EFFECTS WITH RESTRAINT: one ambient layer max; if particles are truly part of the concept, keep them subtle (hundreds, not thousands) and use Float32Array + canvas; prefer transform/opacity; no stacked blur/glow/shadow on many layers; will-change only on elements that actually animate.\n' +
          '4. UI POLISH: tasteful typography scale, 8px spacing rhythm, subtle backdrop blur only where it aids legibility, fine border-radius (12-16px), micro-interactions (hover scale/glow 200ms ease) used sparingly.\n' +
          '5. PERFORMANCE: debounce resize, avoid layout thrash, reuse geometry/material instances, cap pixel ratio at 2, keep the bundle light (no unnecessary libraries).\n' +
          'Produce polished, purposeful, fully responsive 60fps code — no stubs, no placeholders.';
    return '';
  }

  /* Arquivos de mídia que o usuário colocou em imagens/ e sons/ (vindos de
     /midia). Entram no prompt como caminhos relativos: a página gerada é
     servida de http://127.0.0.1:PORT/ no iframe, então "imagens/x.jpg"
     resolve. No salvamento essas referências viram data URI (inlineMedia). */
  var MEDIA_LIMIT = 60;   /* itens listados por tipo (mantém o prompt curto) */

  function mediaBlock(media) {
    if (!media || typeof media !== 'object') return '';
    var imgs = Array.isArray(media.images) ? media.images : [];
    var snds = Array.isArray(media.sounds) ? media.sounds : [];
    if (!imgs.length && !snds.length) return '';

    function rel(kind, item) {
      /* url vem do servidor já percent-encoded ("/imagens/a%20b.png") */
      var url = item && item.url ? String(item.url) : '';
      return kind + '/' + (url.indexOf('/') >= 0 ? url.substring(url.lastIndexOf('/') + 1) : url);
    }
    function line(kind, item) {
      var path = rel(kind, item);
      var kb = item && item.size ? Math.max(1, Math.round(item.size / 1024)) : 0;
      return '- ' + path + (kb ? ' (' + kb + ' KB)' : '');
    }

    var out = '\n\nMEDIA FILES available in this project (real files the user added). Use them when the command calls for a background, texture, sprite sheet, music or sound effect:\n';
    if (imgs.length) {
      out += 'Images:\n' + imgs.slice(0, MEDIA_LIMIT).map(function (it) { return line('imagens', it); }).join('\n') + '\n';
      if (imgs.length > MEDIA_LIMIT) out += '- (' + (imgs.length - MEDIA_LIMIT) + ' more images not listed)\n';
    }
    if (snds.length) {
      out += 'Sounds:\n' + snds.slice(0, MEDIA_LIMIT).map(function (it) { return line('sons', it); }).join('\n') + '\n';
      if (snds.length > MEDIA_LIMIT) out += '- (' + (snds.length - MEDIA_LIMIT) + ' more sounds not listed)\n';
    }
    out += 'How to use them:\n';
    out += '- Reference the EXACT relative path shown above. Never prefix it with "/", "http://", "file://" or an app URL, and never change the extension.\n';
    out += '- Image as background: element.style.backgroundImage = \'url("imagens/x.jpg")\' or CSS background: url("imagens/x.jpg") center/cover no-repeat.\n';
    out += '- Image as repeating block texture: const img = new Image(); img.src = "imagens/x.jpg"; img.onload = () => { ctx.fillStyle = ctx.createPattern(img, "repeat"); }.\n';
    out += '- Sprite sheet: load with new Image() and slice it with ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh).\n';
    out += '- Sound effects: new Audio("sons/x.mp3").play() on the event (shot, hit, jump, pickup). Set cloneNode for rapid repeats if needed.\n';
    out += '- Music: const music = new Audio("sons/x.mp3"); music.loop = true; music.volume = 0.35; — start it on the first user gesture (click/keydown), never on load.\n';
    out += '- Never invent filenames: use only the files listed above. If the command needs an asset that is not listed, build it procedurally (canvas, gradients, WebAudio oscillators) instead of guessing a path.\n';
    out += '- Never inline base64 media in the generated HTML; the app embeds the files itself when the page is saved.\n';
    return out;
  }

  /* System prompt — detecta automaticamente o modo:
     game (GAME_DIRECTIVE) > drawing (DRAWING_DIRECTIVE) > chat (CHAT_DIRECTIVE) */
  function systemPrompt(theme, detailLevel, command, doc, media) {
    var level = (detailLevel === undefined || detailLevel === null) ? 1 : detailLevel;
    var mode = detectMode(command);
    var intro = '';
    var directive = '';
    var scope = '';
    var lighting = '';

    if (mode === 'game') {
      intro = 'You are creating a COMPLETE HTML GAME for NEXUS GAME. Output ONLY raw HTML. No markdown fences, no explanations, no text before or after.\n\n';
      directive = wantsTextures(command, doc)
        ? GAME_DIRECTIVE
        : (GAME_DIRECTIVE_HEAD + TEXTURE_OFF_DIRECTIVE + GAME_DIRECTIVE_TAIL);
      scope = gameScopeNote(level);
      lighting = gameLightingNote(theme);
    } else if (mode === 'drawing') {
      intro = 'You are creating a COMPLETE HTML DRAWING / ILLUSTRATION / OBJECT for NEXUS GAME. Output ONLY raw HTML. No markdown fences, no explanations, no text before or after.\n\n';
      directive = wantsTextures(command, doc)
        ? DRAWING_DIRECTIVE
        : (DRAWING_DIRECTIVE_HEAD + DRAWING_TEX_OFF_DIRECTIVE + DRAWING_DIRECTIVE_TAIL);
      scope = drawingScopeNote();
      lighting = gameLightingNote(theme);
    } else {
      /* modo chat — resposta textual com HTML bonito */
      intro = 'You are responding in HTML for NEXUS GAME. Output ONLY raw HTML. No markdown fences, no explanations, no text before or after.\n\n';
      directive = CHAT_DIRECTIVE;
      scope = chatScopeNote();
      lighting = '';
    }

    var out = intro;
    out += 'Rules:\n';
    out += '- Output ONLY raw HTML. No markdown fences, no explanations.\n';
    out += '- Start with <!DOCTYPE html>. Single file: all CSS and JavaScript inline.\n';
    if (mode === 'game' || mode === 'drawing') {
      out += '- For 3D use the LOCAL three.js UMD build: <script src="vendor/three/three.min.js"></script> (global THREE; never imports/module builds). No addons available: THREE.OrbitControls, GLTFLoader, EffectComposer do NOT exist — orbit the camera manually with pointer drag. Use only core APIs (WebGLRenderer, PerspectiveCamera, Mesh*, Lights, Color, Fog).\n';
    }
    out += '- Never ask questions and never refuse: if the command is vague, choose the most impressive reasonable interpretation.\n';
    out += '- If the user writes in Portuguese, keep visible page text in Portuguese (pt-BR).\n';
    out += '- If the message includes a "Current page" HTML document, treat the command as an edit - change only what was asked.\n';
    out += directive;
    out += scope;
    out += lighting;
    out += '\n\nPALETA — VOCÊ ESCOLHE (REGRA):\n';
    out += '- The palette is YOURS to choose: pick colors that fit the subject, mood and genre of the request, and look professional and vibrant. Default to a dark background unless the subject asks for something light.\n';
    out += '- If the user explicitly asks for colors, a theme, a palette, "estilo X", or references a specific look, follow that EXACTLY and drop your own preference.\n';
    out += '- Never fall back to the app shell UI colors for games, drawings or objects: the page must stand on its own, with its own palette.\n';
    if (mode === 'game') {
      out += mediaBlock(media);
    }
    return out;
  }

  /* Comando do usuário; se houver página atual, vira edição dela.
     `notes` entra DEPOIS do documento (erros de runtime, histórico curto) para o
     modelo ver o estado real da página antes de decidir o que mudar. */
  function userPrompt(command, currentDoc, notes) {
    var extra = notes == null ? '' : String(notes);
    if (currentDoc == null || !String(currentDoc).trim()) {
      return extra ? command + '\n\n' + extra : command;
    }
    return 'Current page (the HTML document currently displayed on screen):\n```html\n' + currentDoc +
      '\n```' + (extra ? '\n\n' + extra : '') + '\n\nCommand: ' + command;
  }

  /* Tira cercas markdown e texto antes/depois do documento HTML. */
  /* Erros de sintaxe nos blocos <script> inline do documento.
     Um documento "fechado" com JS quebrado = tela sem objeto (cubo/peça que
     nunca aparece). Detecta e devolve as mensagens para o app pedir reparo. */
  function jsSyntaxErrors(html) {
    var out = [];
    if (!html) return out;
    var re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
    var m, i = 0;
    while ((m = re.exec(String(html))) !== null) {
      i++;
      var attrs = String(m[1] || '');
      if (/\bsrc\s*=/i.test(attrs)) continue;              /* script externo */
      if (/type\s*=\s*["']?module/i.test(attrs)) continue;  /* módulo ES: não avaliar */
      var code = m[2];
      if (!code || !code.trim()) continue;
      try {
        /* new Function compila sem executar — só valida a sintaxe. */
        new Function(code);
      } catch (e) {
        out.push('script #' + i + ': ' + (e && e.message ? e.message : String(e)));
        if (out.length >= 6) break;
      }
    }
    return out;
  }

  /* Validação de qualidade do documento gerado (modos visuais).
     Só falhas de ALTA confiança — cada item vira uma linha do pedido de reparo.
     mode: 'game' | 'drawing' | 'chat' (detectMode). Devolve [{code, msg}]. */
  function lint(html, mode) {
    var out = [];
    if (!html) return out;
    var s = String(html);
    var low = s.toLowerCase();
    var isGame = mode === 'game';

    /* 1) Resposta cortada: sem </html> ou pares <script> desbalanceados. */
    if (low.indexOf('</html>') < 0) {
      out.push({ code: 'truncated', msg: 'o documento termina sem </html> (resposta cortada)' });
    }
    var rest = s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
    if (/<script\b/i.test(rest)) {
      out.push({ code: 'truncated', msg: 'há um <script> aberto e nunca fechado' });
    }
    if (/<\/script>/i.test(rest)) {
      out.push({ code: 'truncated', msg: 'há um </script> sem <script> correspondente' });
    }

    /* 2) Addons/módulos: este três.js é só o core, addons não existem. */
    var addon = low.match(/orbitcontrols|gltfloader|effectcomposer|roomenvironment|contactshadows|rgbelloader|importmap|type\s*=\s*["']?module/);
    if (addon) {
      out.push({ code: 'addon', msg: 'usa "' + addon[0] + '" (addons/ES modules não estão disponíveis; só o core do três.js)' });
    }

    /* 3) three.js vindo de CDN: offline quebra a página. */
    var cdn = s.match(/<script\b[^>]*\bsrc\s*=\s*["'](https?:\/\/[^"']*three[^"']*)["']/i);
    if (cdn) {
      out.push({ code: 'cdnThree', msg: 'carrega three.js de CDN (' + cdn[1] + ') em vez do vendor local' });
    }

    /* 4) Placeholder no lugar de implementação. */
    var stub = s.match(/\b(TODO|FIXME|XXX)\b/) || low.match(/lorem ipsum|not implemented|implementação pendente/);
    if (stub) {
      out.push({ code: 'stub', msg: 'deixou trecho por fazer ("' + String(stub[0]).slice(0, 40) + '")' });
    }

    if (isGame) {
      /* 5) Sem loop de animação: o jogo não roda. */
      if (!/requestAnimationFrame|setAnimationLoop/.test(s)) {
        out.push({ code: 'noLoop', msg: 'não tem loop de animação (requestAnimationFrame/setAnimationLoop)' });
      }
      /* 6) Sem tratamento de resize: quebra ao girar a tela. */
      if (!/addEventListener\s*\(\s*['"]resize|ResizeObserver|onresize/.test(s)) {
        out.push({ code: 'noResize', msg: 'não trata resize (sem listener de resize/ResizeObserver)' });
      }
      /* 7) Parede de texto: jogo é jogo, não documentação. */
      var vis = s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&[a-z#0-9]+;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (vis.length > 900) {
        out.push({ code: 'textwall', msg: 'tem ' + vis.length + ' caracteres de texto visível (máx. ~900; é um jogo, não um texto)' });
      }
    }
    return out;
  }

  function extractDocument(raw) {
    var s = String(raw == null ? '' : raw).trim();
    if (s.indexOf('```') === 0) {
      var nl = s.indexOf('\n');
      s = (nl >= 0 ? s.substring(nl + 1) : s).trim();
    }
    var lower = s.toLowerCase();
    var doctype = lower.indexOf('<!doctype');
    var htmlIdx = lower.indexOf('<html');
    var candidates = [doctype, htmlIdx].filter(function (i) { return i > 0; });
    if (candidates.length) {
      s = s.substring(Math.min.apply(null, candidates));
    }
    if (s.slice(-3) === '```') {
      s = s.substring(0, s.length - 3).trim();
    }
    return s;
  }

  /* Diretriz extra no refino: edição cirúrgica em vez de reescrever tudo. */
  var EDIT_DIRECTIVE = '\n\nEDIT MODE (overrides the "Current page" rule above): the current page is on screen.\n' +
    'Do NOT return the whole document. Return ONLY a JSON object with minimal exact replacements:\n' +
    '{"edits":[{"find":"<exact text copied from the current document>","replace":"<new text>"}]}\n' +
    'Rules:\n' +
    '- "find" must be copied EXACTLY (same whitespace and case) and must be unique in the document.\n' +
    '- Never return the whole document.\n' +
    '- As many edits as needed to express the change precisely (never return the whole document).\n' +
    '- Only if the change truly cannot be expressed as find/replace, return the complete HTML document instead.\n' +
    '- Output raw JSON (or raw HTML in that fallback). No markdown fences, no explanations.';

  function stripFences(raw) {
    var t = String(raw == null ? '' : raw).trim();
    if (t.indexOf('```') === 0) {
      var nl = t.indexOf('\n');
      t = (nl >= 0 ? t.substring(nl + 1) : t).trim();
    }
    if (t.slice(-3) === '```') t = t.substring(0, t.length - 3).trim();
    return t;
  }

  function looksLikeDocument(raw) {
    var t = stripFences(raw).toLowerCase();
    return t.indexOf('<!doctype') === 0 || t.indexOf('<html') === 0;
  }

  /* Primeiro objeto/array JSON balanceado dentro de um texto. */
  function firstJsonValue(text) {
    var start = -1;
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (ch === '{' || ch === '[') { start = i; break; }
    }
    if (start < 0) return null;
    var open = text.charAt(start);
    var close = open === '{' ? '}' : ']';
    var depth = 0;
    var inStr = false;
    var esc = false;
    for (var j = start; j < text.length; j++) {
      var c = text.charAt(j);
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') inStr = true;
      else if (c === open) depth++;
      else if (c === close) {
        depth--;
        if (depth === 0) return text.substring(start, j + 1);
      }
    }
    return null;
  }

  /* Regex tolerante a indentação/quebras: cada bloco de espaços do "find" vira \s+. */
  function _wsRegex(find) {
    var parts = String(find).split(/\s+/).filter(function (s) { return s !== ''; });
    if (!parts.length) return null;
    var esc = function (s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); };
    try { return new RegExp(parts.map(function (s) { return esc(s); }).join('\\s+')); }
    catch (e) { return null; }
  }

  /**
   * Aplica edições cirúrgicas ({edits:[{find,replace}]}) sobre o documento atual.
   * Tolerante: casamento exato → CRLF → whitespace normalizado. Parcial: aplica o
   * que casar e reporta o que não casou (uma âncora ruim não descarta o resto).
   * Retorna {ok, partial, html, applied, failed}.
   */
  function applyEdits(doc, raw) {
    var miss = { ok: false, partial: false, applied: 0, failed: 0 };
    if (!doc) return miss;
    var chunk = firstJsonValue(stripFences(raw));
    if (!chunk) return miss;
    var parsed;
    try { parsed = JSON.parse(chunk); } catch (e) { return miss; }
    var edits = Array.isArray(parsed) ? parsed
      : (parsed && Array.isArray(parsed.edits) ? parsed.edits : null);
    if (!edits || !edits.length || edits.length > 200) return miss;

    var out = String(doc);
    var applied = 0;
    var failed = 0;
    for (var i = 0; i < edits.length; i++) {
      var e = edits[i] || {};
      var find = e.find == null ? '' : String(e.find);
      var replace = e.replace == null ? '' : String(e.replace);
      if (!find) { failed++; continue; }
      var idx = out.indexOf(find);
      var target = find;
      if (idx < 0) {
        var variants = [find.replace(/\r\n/g, '\n'), find.replace(/\n/g, '\r\n')];
        for (var v = 0; v < variants.length && idx < 0; v++) {
          if (variants[v] !== find) {
            var at = out.indexOf(variants[v]);
            if (at >= 0) { idx = at; target = variants[v]; }
          }
        }
      }
      if (idx < 0) {
        var rx = _wsRegex(find);
        var m = rx ? rx.exec(out) : null;
        if (m) { idx = m.index; target = m[0]; }
      }
      if (idx < 0) { failed++; continue; }
      out = out.substring(0, idx) + replace + out.substring(idx + target.length);
      applied++;
    }
    var ok = applied > 0 && failed === 0;
    return { ok: ok, partial: applied > 0 && failed > 0, html: out, applied: applied, failed: failed };
  }

  /* Variáveis CSS do tema injetadas no documento da IA. */
  function varsCss(theme) {
    return ':root{\n' +
      '--nx-bg: ' + theme.background + ';\n' +
      '--nx-surface: ' + theme.surface + ';\n' +
      '--nx-surface-alt: ' + theme.surfaceAlt + ';\n' +
      '--nx-accent: ' + theme.accent + ';\n' +
      '--nx-accent-soft: ' + window.Themes.hexA(theme.accent, 140) + ';\n' +
      '--nx-accent-faint: ' + window.Themes.hexA(theme.accent, 20) + ';\n' +
      '--nx-text: ' + theme.text + ';\n' +
      '--nx-secondary: ' + theme.secondary + ';\n' +
      (theme.colors && theme.colors[1] ? '--nx-c2: ' + theme.colors[1] + ';\n' : '') +
      (theme.colors && theme.colors[2] ? '--nx-c3: ' + theme.colors[2] + ';\n' : '') +
      '}';
  }

  /* CSS base: sem barras de rolagem, sem forçar background (o modelo define o próprio fundo). */
  function baseCss() {
    return 'html,body{margin:0;padding:0;overscroll-behavior:none}\n' +
      '::-webkit-scrollbar{width:0;height:0}\n' +
      '::selection{background:var(--nx-accent-soft);color:var(--nx-text)}\n' +
      'a{color:var(--nx-accent)}';
  }

  /* Polyfill de storage: no iframe sandbox (origem opaca) localStorage/sessionStorage
     lançam SecurityError — sem isso, jogos que salvam recorde quebram na largada. */
  var STORAGE_SAFE = '<script id="nx-safe">(function(){' +
    'function probe(){try{window.localStorage.getItem("__nx_t");return true}catch(e){return false}}' +
    'if(probe())return;' +
    'function mk(){var d={};return{' +
      'getItem:function(k){return Object.prototype.hasOwnProperty.call(d,k)?d[k]:null},' +
      'setItem:function(k,v){d[k]=String(v)},' +
      'removeItem:function(k){delete d[k]},' +
      'clear:function(){d={}},' +
      'key:function(i){return Object.keys(d)[i]||null},' +
      'get length(){return Object.keys(d).length}' +
    '}}' +
    'var L=mk(),S=mk();' +
    'try{Object.defineProperty(window,"localStorage",{value:L,configurable:true,writable:true})}catch(e){try{window.localStorage=L}catch(_){}}' +
    'try{Object.defineProperty(window,"sessionStorage",{value:S,configurable:true,writable:true})}catch(e){try{window.sessionStorage=S}catch(_){}}' +
    '})();<\/script>';

  /* Injeta viewport (se faltar) + estilo base depois de <head>. */
  function decorate(html, theme) {
    var injection = '';
    if (!VIEWPORT_REGEX.test(html)) {
      injection += '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover">\n';
    }
    /* Polyfill de storage: só injeta se ainda não existir (themed() já pode ter posto). */
    if (html.indexOf('id="nx-safe"') < 0) injection += STORAGE_SAFE + '\n';
    /* Pack de texturas procedurais (js/nx-textures.js) — só entra quando a página
       usa textura (NxTex/pattern/CanvasTexture). Sem uso, não carrega 36 KB à toa. */
    if (/\bNxTex\b|createPattern|CanvasTexture|nx-textures/.test(html)) {
      injection += '<script src="js/nx-textures.js"></script>\n';
    }
    injection += '<style id="nx77-base">\n' + varsCss(theme) + '\n' + baseCss() + '\n</style>';

    var head = HEAD_REGEX.exec(html);
    if (head) {
      var at = head.index + head[0].length;
      return html.substring(0, at) + '\n' + injection + '\n' + html.substring(at);
    }
    var tag = HTML_REGEX.exec(html);
    if (tag) {
      var at2 = tag.index + tag[0].length;
      return html.substring(0, at2) + '\n<head>\n' + injection + '\n</head>' + html.substring(at2);
    }
    return '<!DOCTYPE html><html><head>\n' + injection + '\n</head><body>\n' + html + '\n</body></html>';
  }

  /* Tela de apresentação: halo estático + título animado (entrada letra a letra,
     brilho deslizante e glow suave) — sem cubo e sem partículas. */
  function welcomePage(theme, hasKey) {
    var bg = theme.background;
    var accent = theme.accent;
    var hi = sheenOn(accent);
    var accentSoft = window.Themes.hexA(theme.accent, 150);
    var accentFaint = window.Themes.hexA(theme.accent, 20);
    /* Detalhes do tema único BLACK CYBER: esmeralda → rosa → azul. */
    var c2 = (theme.colors && theme.colors[1]) || accent;
    var c3 = (theme.colors && theme.colors[2]) || accent;

    var word = 'NEXUS GAME';
    var visible = word.replace(/ /g, '').length;
    var vi = 0;
    var letters = word.split('').map(function (ch, i) {
      if (ch === ' ') {
        return '<span class="sp" aria-hidden="true" style="--i:' + i + '"></span>';
      }
      var f = visible > 1 ? vi / (visible - 1) : 0;
      vi++;
      var col = f < 0.5 ? accent : (f < 0.8 ? c2 : c3);
      return '<span aria-hidden="true" style="--i:' + i + ';--c:' + col + '">' + esc(ch) + '</span>';
    }).join('');

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover">
<title>NEXUS GAME</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%}
body{background:url('imagens/back1.jpg') center/cover fixed no-repeat #000;font-family:-apple-system,'Segoe UI',Roboto,sans-serif;display:flex;align-items:center;justify-content:center;overflow:hidden}
.stage{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:28px;padding:24px}
.title{position:relative;display:block;margin:0;text-align:center;white-space:nowrap;
  font-family:'Courier New',monospace;font-weight:bold;
  font-size:clamp(34px,7.4vw,88px);letter-spacing:.12em;text-indent:.12em;
  animation:nx-glow 5s ease-in-out 1.4s infinite}
.title span{display:inline-block;color:transparent;
  background-image:linear-gradient(100deg,transparent 42%,${hi} 50%,transparent 58%),
                   linear-gradient(160deg,var(--c,${accent}) 0%,${accentSoft} 100%);
  background-size:300% 100%,100% 100%;
  background-position:0% 0,0 0;
  background-repeat:no-repeat;
  -webkit-background-clip:text;background-clip:text;
  animation:nx-in .7s cubic-bezier(.22,.9,.24,1) calc(var(--i)*60ms) both,
            nx-sheen 3.6s ease-in-out calc(1.1s + var(--i)*120ms) infinite}
.title .sp{width:.34em}
@keyframes nx-in{
  from{opacity:0;transform:translateY(.45em) scale(.9)}
  to{opacity:1;transform:none}}
@keyframes nx-sheen{
  0%{background-position:0% 0,0 0}
  35%,100%{background-position:100% 0,0 0}}
@keyframes nx-glow{
  0%,100%{filter:drop-shadow(0 0 0 transparent)}
  50%{filter:drop-shadow(0 0 22px ${accentFaint})}}
@media (prefers-reduced-motion:reduce){
  .title{animation:none}
  .title span{animation:none;opacity:1;transform:none;
    background-image:none;color:${accent}}}
.line{height:1px;width:min(56vw,440px);opacity:.75;
  background:linear-gradient(90deg,transparent,${accent} 25%,${c2} 60%,${c3} 85%,transparent)}
</style>
</head>
<body>
<div class="stage">
  <h1 class="title" aria-label="NEXUS GAME">${letters}</h1>
  <div class="line"></div>
</div>
</body>
</html>`;
  }

  /* Página de erro exibida quando ainda não há documento gerado. */
  function errorPage(theme, title, detail) {
    var bg = theme.background;
    var surface = theme.surface;
    var fg = theme.text;
    var secondary = theme.secondary;
    var accent = theme.accent;
    var border = window.Themes.hexA(theme.accent, 70);

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>NEXUS GAME</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%}
body{background:${bg};color:${fg};font-family:-apple-system,'Segoe UI',Roboto,sans-serif;display:flex;align-items:center;justify-content:center;padding:28px}
.card{max-width:380px;text-align:center;background:${surface};border:1px solid ${border};border-radius:16px;padding:26px 22px}
.icon{font-size:34px;margin-bottom:10px}
h2{font-family:'Courier New',monospace;font-size:15px;letter-spacing:.18em;text-transform:uppercase;color:${accent};margin-bottom:10px}
p{color:${secondary};font-size:13.5px;line-height:1.6;word-break:break-word}
</style>
</head>
<body>
<div class="card"><div class="icon">⚠️</div><h2>${esc(title)}</h2><p>${esc(detail)}</p></div>
</body>
</html>`;
  }

  /* Item da página "Abrir" (páginas salvas). */
  function savedListPage(theme, entries) {
    var bg = theme.background;
    var surface = theme.surface;
    var surfaceAlt = theme.surfaceAlt;
    var fg = theme.text;
    var secondary = theme.secondary;
    var accent = theme.accent;
    var accentSoft = window.Themes.hexA(theme.accent, 140);
    var accentFaint = window.Themes.hexA(theme.accent, 22);
    var border = window.Themes.hexA(theme.accent, 70);

    var body;
    if (!entries || entries.length === 0) {
      body = '<div class="empty">Nada salvo ainda.<br><span>Gere uma página e clique em <b>SALVAR</b>.</span></div>';
    } else {
      body = entries.map(function (e) {
        var n = escAttr(e.name);
        return '<div class="row">' +
          '<button class="open" data-n="' + n + '">' +
          '<span class="fname">' + esc(e.name) + '</span>' +
          '<span class="fmeta">' + esc(e.meta) + '</span></button>' +
          '<button class="del" data-n="' + n + '" title="Excluir">✕</button></div>';
      }).join('');
    }

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover">
<title>Salvos — NEXUS GAME</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%}
body{background:${bg};color:${fg};font-family:-apple-system,'Segoe UI',Roboto,sans-serif;display:flex;flex-direction:column;overflow:hidden}
.top{display:flex;align-items:center;gap:10px;padding:14px 16px 6px}
.back{border:1px solid ${border};background:${accentFaint};color:${accent};border-radius:999px;padding:8px 14px;font-size:13px;font-family:'Courier New',monospace;cursor:pointer;-webkit-tap-highlight-color:transparent}
.back:active{background:${accentSoft};color:${bg}}
.ttl{font-family:'Courier New',monospace;font-size:14px;letter-spacing:.22em;color:${accent}}
.pick{margin-left:auto;border:1px solid ${border};background:${accentFaint};color:${accent};border-radius:999px;padding:8px 14px;font-size:12.5px;font-family:'Courier New',monospace;cursor:pointer;-webkit-tap-highlight-color:transparent}
.pick:active{background:${accentSoft};color:${bg}}
.path{padding:0 18px 6px;color:${secondary};font-size:11.5px;font-family:'Courier New',monospace}
.list{flex:1;overflow-y:auto;padding:6px 16px 24px;display:flex;flex-direction:column;gap:10px;-webkit-overflow-scrolling:touch}
.row{display:flex;align-items:stretch;gap:8px}
.open{flex:1;display:flex;flex-direction:column;gap:3px;text-align:left;background:${surface};border:1px solid ${border};border-radius:14px;padding:14px 15px;cursor:pointer;-webkit-tap-highlight-color:transparent}
.open:active{background:${surfaceAlt}}
.fname{color:${fg};font-size:14px;word-break:break-all}
.fmeta{color:${secondary};font-size:11.5px;font-family:'Courier New',monospace}
.del{width:50px;background:${surface};border:1px solid ${border};color:${accent};border-radius:14px;font-size:18px;cursor:pointer;-webkit-tap-highlight-color:transparent}
.del:active{background:${accentFaint}}
.empty{margin:auto;text-align:center;color:${secondary};font-size:13.5px;line-height:1.7;padding:24px}
.empty span{font-size:12px}
.empty b{color:${accent};font-family:'Courier New',monospace}
</style>
</head>
<body>
<div class="top"><button class="back" id="bk">‹ Voltar</button><span class="ttl">SALVOS</span><button class="pick" id="pk">Abrir HTML…</button></div>
<div class="path">pasta nexus77</div>
<div class="list">${body}</div>
<script>
document.getElementById('bk').addEventListener('click', function(){ try{ Nexus77.closeList(); }catch(e){} });
document.getElementById('pk').addEventListener('click', function(){ try{ Nexus77.pickFile(); }catch(e){} });
document.querySelectorAll('.open[data-n]').forEach(function(c){
  c.addEventListener('click', function(){ try{ Nexus77.openSaved(c.getAttribute('data-n')); }catch(e){} });
});
document.querySelectorAll('.del[data-n]').forEach(function(c){
  c.addEventListener('click', function(){ try{ Nexus77.deleteSaved(c.getAttribute('data-n')); }catch(e){} });
});
</script>
</body>
</html>`;
  }

  /* Bibliotecas locais: três arquivos servidos de web/vendor/three/. */
  var CDN_HOSTS = ['unpkg.com', 'cdn.jsdelivr.net', 'cdnjs.cloudflare.com'];
  var THREE_FILES = {
    'three.min.js': 'three.min.js',
    'three.js': 'three.min.js',
    'three.module.min.js': 'three.module.min.js',
    'three.module.js': 'three.module.min.js'
  };

  /* Troca URLs de CDN do three.js pelo vendor local, só no render. */
  function rewriteLibs(html, base) {
    if (!html) return html;
    return String(html).replace(/(?:https?:)?\/\/[^\s"'()<>]+/gi, function (url) {
      try {
        var u = new URL(url, 'https://x/');
        if (CDN_HOSTS.indexOf(u.hostname) === -1) return url;
        var path = u.pathname;
        if (path.toLowerCase().indexOf('three') === -1) return url;
        var file = path.substring(path.lastIndexOf('/') + 1);
        var mapped = THREE_FILES[file];
        if (!mapped) return url;
        return base + 'vendor/three/' + mapped;
      } catch (e) {
        return url;
      }
    });
  }

  window.Html = {
    BASE: BASE,
    BASE_PROMPT: BASE_PROMPT,
    EDIT_DIRECTIVE: EDIT_DIRECTIVE,
    GAME_DIRECTIVE: GAME_DIRECTIVE,
    DRAWING_DIRECTIVE: DRAWING_DIRECTIVE,
    CHAT_DIRECTIVE: CHAT_DIRECTIVE,
    TEXTURE_OFF_DIRECTIVE: TEXTURE_OFF_DIRECTIVE,
    wantsTextures: wantsTextures,
    STORAGE_SAFE: STORAGE_SAFE,
    isGameCommand: isGameCommand,
    isDrawingCommand: isDrawingCommand,
    isChatCommand: isChatCommand,
    detectMode: detectMode,
    gameScopeNote: gameScopeNote,
    drawingScopeNote: drawingScopeNote,
    chatScopeNote: chatScopeNote,
    applyEdits: applyEdits,
    looksLikeDocument: looksLikeDocument,
    VIEWPORT_REGEX: VIEWPORT_REGEX,
    HEAD_REGEX: HEAD_REGEX,
    HTML_REGEX: HTML_REGEX,
    systemPrompt: systemPrompt,
    mediaBlock: mediaBlock,
    detailDirective: detailDirective,
    userPrompt: userPrompt,
    extractDocument: extractDocument,
    decorate: decorate,
    welcomePage: welcomePage,
    errorPage: errorPage,
    savedListPage: savedListPage,
    varsCss: varsCss,
    baseCss: baseCss,
    esc: esc,
    escAttr: escAttr,
    jsSyntaxErrors: jsSyntaxErrors,
    lint: lint,
    rewriteLibs: rewriteLibs
  };
})();

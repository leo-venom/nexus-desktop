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

  var BASE_PROMPT = `You are the GAME generator of NEXUS GAME. From the user's short command, you build ONE complete, self-contained, PLAYABLE HTML game document.

Rules:
- Output ONLY raw HTML. No markdown fences, no explanations, no text before or after.
- Start with <!DOCTYPE html>. Single file: all CSS and JavaScript inline.
- You may load libraries from public CDNs. For 3D always use three.js via this exact script tag: <script src="https://unpkg.com/three@0.160.0/build/three.min.js"></script> (global THREE - do not use import maps or module builds). This URL is always available in the app, even offline.
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

  /* Regras para o código gerado ser totalmente editável pelo editor visual. */
  var EDIT_FRIENDLY = `
EDIT-FRIENDLY MARKUP — the app has a visual editor that inspects this page, so structure the code for it:
- Every visible piece (title, text, button, card, panel, shape) must be its OWN element with a meaningful id (e.g. id="titulo", id="btn-jogar", id="painel").
- Canvas is ONLY for the animated scene/background. HUD, score, titles, buttons and menus must be real HTML elements layered on top — never drawn inside the canvas.
- Keep each sentence in ONE text node: no <br> and no per-letter <span> inside a text. Animate a word/phrase with CSS on its parent element instead.
- Never use !important in CSS: live inline edits must win.
- Do not place a full-screen transparent overlay above the content, and never set pointer-events:none on visible layers.
- Use px/rem font sizes and explicit colors so they can be tweaked live.
- Lay out with flex/grid so elements never overlap or clip each other, and everything stays inside the viewport at any screen size.`;

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
    /* 3D / textura / material — também usam as receitas de textura procedural */
    '3d','cubo','esfera','planeta','torus','cilindro','poliedro','malha','mesh',
    'textura','texturas','material','shader','webgl','three','three.js',
    'objeto 3d','cena 3d','modelo 3d','animação 3d','animacao 3d','iluminação',
    'iluminacao','partícula','particula','pixel art','voxel','render 3d'
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

  var GAME_DIRECTIVE = `
GAME MODE ATIVADO — VOCÊ ESTÁ GERANDO UM JOGO COMPLETO. Siga TODAS as regras abaixo em PORTUGUÊS (pt-BR) para textos visíveis.

REGRA ABSOLUTA — ENTREGA COMPLETA EM UMA RESPOSTA:
O documento inteiro precisa caber em UMA resposta do modelo. Comece a escrever o <script> do jogo cedo e mantenha o código enxuto: priorize um jogo COMPLETO, jogável e fechado (com </body></html> no final) em vez de volume. Se estiver ficando grande, corte cenário, partículas e comentários — NUNCA corte níveis, inimigos, controles, áudio, HUD ou o fechamento do HTML. Documento cortado no meio = entrega inválida e tela preta.

REGRA ABSOLUTA — TAMANHO:
Sem mínimo nem teto de tamanho de código. O código que o jogo exigir para ser completo e rodar liso a 60fps. Cortar redundância é obrigatório — mas não corte jogabilidade, níveis, inimigos, power-ups, som ou efeitos.

REGRAS DE TELA (OBRIGATÓRIO):
- 100vw x 100dvh, sem scroll. body { margin:0; padding:0; overflow:hidden; width:100vw; height:100dvh; }
- MEDIÇÃO DEFENSIVA DO VIEWPORT (obrigatório): o jogo roda dentro de um iframe e window.innerWidth/innerHeight podem retornar 0 no primeiro instante. NUNCA dimensione o canvas uma única vez no carregamento. Sempre: function fit(){var W=window.innerWidth||document.documentElement.clientWidth||0;var H=window.innerHeight||document.documentElement.clientHeight||0;if(W<40||H<40){requestAnimationFrame(fit);return}/* dimensiona canvas e recalcula escala */}. Chame fit() dentro de requestAnimationFrame, registre window.addEventListener('resize', fit) e window.addEventListener('orientationchange', fit), e repita via setTimeout(fit, 300) como rede de segurança. Se a primeira medição vier 0, o jogo DEVE esperar e remedir em vez de desenhar num canvas 0x0.
- devicePixelRatio cap em Math.min(window.devicePixelRatio||1, 2).
- Menus, pausa e game over: overlays position:fixed em tela cheia (inset:0) sobre o canvas. O campo de jogo NUNCA é menor que a tela.
- HUD (score, vidas, nível, power-ups, textos) DEVE ficar nas bordas ESQUERDA e DIREITA como faixas verticais finas (60-80px de largura). O canvas de jogo ocupa a tela INTEIRA por trás. NADA sobre a área central do jogo — nem score, nem texto, nem botão. Em mobile (<500px): semi-transparente mas sempre nas extremidades, nunca no centro.

FOCO NO JOGO, NÃO NO FUNDO — REGRA ABSOLUTA:
Fundo = cor sólida ou gradiente de 2-3 tons ou no máximo 1-2 camadas de parallax pré-renderizadas (offscreen canvas, drawImage por frame). PROIBIDO: cenário 3D elaborado, layers com textura animada, nebulosa recalculada por frame, blur ou shadow em tela cheia, milhares de partículas ambientes. O fundo não deve consumir mais que ~15% do tempo de frame. A beleza do jogo VEM dos objetos, inimigos, texturas, efeitos, HUD e som — não do fundo. Em dúvida entre fundo bonito e frame estável, escolha o frame.

O JOGO PRECISA TER, NO MÍNIMO:
- 8-12 níveis com dificuldade progressiva (velocidade, densidade, novos padrões/tipos)
- 3+ tipos de inimigo com comportamentos DIFERENTES (não só cor ou tamanho — movimentos, ataques, IA distintos)
- 2-3 power-ups ou itens colecionáveis que realmente funcionam e alteram a jogabilidade
- Fundo leve com 1-2 camadas de parallax pré-renderizadas (offscreen canvas, drawImage)
- Partículas de impacto + ambientes COM POOL e teto (~40-60 partículas no máximo, reuso de objetos)
- Música procedural (osciladores WebAudio) + SFX para TODAS as ações
- Screen shake + floating score + transições animadas entre telas
- Menu animado + tela de pausa + tela de game over com estatísticas (score, nível, tempo)
- Recorde máximo + último nível alcançado salvos em localStorage
- Controles por TECLADO e TOQUE (touch events) — ambos funcionando

COMO ENTREGAR O JOGO COMPLETO:
1. Cada nível implementado individualmente com parâmetros próprios (velocidade, spawn rate, cores, padrões de inimigos). Não repita o mesmo código 12 vezes — use um array de configuração de níveis e um gerador.
2. ÁUDIO: WebAudio com osciladores reais, não placeholder. AudioContext compartilhado criado no primeiro clique/interação (requisito do navegador). Função única playSom(tipo) que faz lookup de parâmetros, cria nós (OscillatorNode, GainNode, BiquadFilterNode), conecta, start + stop automático.
3. Sistema de partículas COM POOL (array fixo reutilizado) e teto (~40-60 máx). Quando uma partícula morre, ela volta ao pool em vez de ser descartada. Prefira Float32Array + canvas a objetos avulsos.
4. Fundo leve com 1-2 camadas de parallax desenhadas em offscreen canvas (uma vez) e apenas drawImage por frame — sem redesenhar, sem cálculos por frame.
5. Transições animadas entre telas (menu→jogando→game over) com fade/deslize de 300-500ms.
6. Efeitos dedicados por ação: screen shake no impacto, floating score ao matar inimigo, flash na borda ao tomar dano, glow ao pegar power-up.
7. Tela de game over COM estatísticas: score final, nível alcançado, tempo de jogo, high score. Animação de entrada.
8. Mecânicas secundárias: combos, multiplicadores de score por kills consecutivas, bônus de velocidade.

PRIMEIRO FRAME — REGRA ABSOLUTA:
O jogo precisa mostrar conteúdo JÁ no primeiro frame, sem depender de clique ou tecla:
- Desenhe o campo, o HUD e a peça/personagem ativa imediatamente após criar o canvas (chame draw() uma vez antes do loop).
- SEMPRE exista um objeto ativo (peça atual / nave / jogador) posicionado no campo desde o início.
- Se o loop usa requestAnimationFrame, dispare também um draw() síncrono antes dele.
- Tela vazia no boot = bug de entrega. Se medir o viewport der 0, espere e redesenhe — nunca deixe o canvas em branco.

@@NX_TEX_BEGIN@@
12 TEXTURAS PROCESSUAIS (three.js CanvasTexture — aplicar somente quando o pedido pedir textura/material):
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
- NxTex.names()  → lista as 24.

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

DESEMPENHO — META 60 FPS CONSTANTES (obrigatório):
- Um único canvas e um único loop de requestAnimationFrame. Nada de vários loops concorrentes.
- NÃO redesenhe o fundo a cada frame: pinte-o uma vez em canvas offscreen e use drawImage; parallax só com deslocamento de offset.
- Partículas: array fixo com pool (máx 40-60), zero alocação de objetos dentro do loop.
- Sem filter: blur(), box-shadow ou backdrop-filter em elementos animados; sem sombras por frame no canvas (use 1-2 sombras pré-renderizadas se indispensável).
- Reaproveite gradientes/paths (crie uma vez, reutilize); nada de criar gradiente ou string de cor dentro do loop.
- Colisões simples (AABB/círculos), sem cálculos por pixel.
- Cap de devicePixelRatio em 2; se a tela for grande, reduza a resolução interna do canvas em vez de perder frames.
- Pause o loop quando document.hidden; retome no visibilitychange.
- Áudio: nós criados por som e descartados (ou pool); nunca criar AudioContext por efeito.

NÃO FAÇA:
- Versão mínima funcional, código comentado/TODO, placeholder, canvas vazio
- 1 tipo de inimigo com cores diferentes chamado de "8 níveis"
- Jogo sem som, sem música, sem game over, sem menu, sem tela de pausa
- Arrays de configuração de nível vazios ou com só 1 entrada

VERIFIQUE ANTES DE ENTREGAR:
- 60fps? fundo leve? tela inteira? HUD nas laterais?
- 8-12 níveis? 3+ inimigos com comportamentos diferentes? 2-3 power-ups?
- Parallax? partículas com pool (~40-60)? música+SFX? screen shake?
- Menu+pausa+game over com stats? recorde salvo? teclado+toque?
- Texturas aplicadas quando o pedido pedir? sons em todas as ações?
- Cada nível diferente do anterior (não só velocidade)?`;

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

  /* Bloco curto no lugar do bloco de texturas quando o pedido NÃO pede textura. */
  var TEXTURE_OFF_DIRECTIVE = `
TEXTURAS — SOMENTE SOB PEDIDO (este pedido NÃO pede textura):
- NÃO use window.NxTex, NÃO chame ctx.createPattern, NÃO crie THREE.CanvasTexture e NÃO desenhe textura procedural.
- Cada peça/inimigo/plataforma/objeto usa cor sólida, gradiente de 2-3 tons, forma geométrica ou sombra/brilho simples — visual limpo e flat.
- Não converta material em textura por conta própria e não escreva receitas de ruído/veios/pattern: não é requisito de entrega aqui.
- Exceção: se o usuário pedir para REMOVER texturas da página atual, apague as existentes (trocando por cor sólida/gradiente) e não crie novas.
- Se o pedido citar explicitamente um material/textura (ex.: "peças de tijolo", "metal", "lava"), aí sim use o pack NxTex para esse material.
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

  /* Escopo único — NEXUS GAME é sempre modo completo, otimizado para desempenho. */
  function gameScopeNote(level) {
    return '\n\nESCOPO — JOGO COMPLETO, OTIMIZADO PARA DESEMPENHO: entregue o checklist inteiro (8-12 níveis, 3+ inimigos com IA distinta, 2-3 power-ups, parallax de 1-2 camadas, partículas com pool, música + SFX, screen shake, transições, menu/pausa/game over com estatísticas e recorde salvo) DENTRO de um orçamento de 60fps constantes. Desempenho manda: prefira desenho simples e barato, reutilize objetos, evite recalcular por frame. Se algo precisa ser cortado para manter 60fps, corte cenário e efeito — nunca jogabilidade, inimigos, níveis ou áudio.';
  }

  function gameLightingNote(theme) {
    var lum = 0.2126 * parseInt(theme.background.slice(1,3),16) / 255 +
              0.7152 * parseInt(theme.background.slice(3,5),16) / 255 +
              0.0722 * parseInt(theme.background.slice(5,7),16) / 255;
    if (lum < 0.2) return '\nThe game scene MUST be visibly lit. Add a subtle rim light or glow on characters and interactive elements so they stand out from the dark background.';
    return '';
  }

  /* Cor do brilho que atravessa o título: branco sobre accent escuro,
     quase-preto sobre accent claro — garante contraste nos 30 temas. */
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

  /* System prompt — NEXUS GAME tem um único modo: jogo. */
  function systemPrompt(theme, detailLevel, command, doc, media) {
    var level = (detailLevel === undefined || detailLevel === null) ? 1 : detailLevel;
    var out = 'You are creating a COMPLETE HTML GAME for NEXUS GAME. Output ONLY raw HTML. No markdown fences, no explanations, no text before or after.\n\n';
    out += 'Rules:\n';
    out += '- Output ONLY raw HTML. No markdown fences, no explanations.\n';
    out += '- Start with <!DOCTYPE html>. Single file: all CSS and JavaScript inline.\n';
    out += '- For 3D use three.js: <script src="https://unpkg.com/three@0.160.0/build/three.min.js"></script> (global THREE - do not use imports or module builds).\n';
    out += '- Never ask questions and never refuse: if the command is vague, choose the most impressive reasonable interpretation.\n';
    out += '- If the user writes in Portuguese, keep visible page text in Portuguese (pt-BR).\n';
    out += '- If the message includes a "Current page" HTML document, treat the command as an edit - change only what was asked.\n';
    out += wantsTextures(command, doc)
      ? GAME_DIRECTIVE
      : (GAME_DIRECTIVE_HEAD + TEXTURE_OFF_DIRECTIVE + GAME_DIRECTIVE_TAIL);
    out += gameScopeNote(level);
    out += gameLightingNote(theme);
    out += '\n\nCurrent app theme \u2014 use these exact colors as the main palette:\n';
    out += '- background: ' + theme.background + '\n';
    out += '- accent (primary/highlights): ' + theme.accent + '\n';
    out += '- text: ' + theme.text + '\n';
    out += '- secondary text: ' + theme.secondary + '\n';
    out += '- surface (cards/panels): ' + theme.surface + '\n';
    out += '- surface alt: ' + theme.surfaceAlt + '\n';
    if (theme.colors && theme.colors.length) {
      out += '- extra palette colors (use them freely for gradients, particle colors, UI accents and lighting): ' + theme.colors.join(', ') + '\n';
    }
    out += 'For a game, ignore the "at most one gradient" and "avoid rainbow noise" rules \u2014 use the palette expansively across gradients, particles, lighting and UI. Respect the dark background, but the game must be vibrant.\n';
    out += mediaBlock(media);
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
      '}';
  }

  /* CSS base: fundo/texto do tema, sem barras de rolagem. */
  function baseCss() {
    return 'html,body{margin:0;padding:0;background:var(--nx-bg);color:var(--nx-text);overscroll-behavior:none}\n' +
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
    injection += STORAGE_SAFE + '\n';
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

    var word = 'NEXUS GAME';
    var letters = word.split('').map(function (ch, i) {
      var style = ' style="--i:' + i + '"';
      if (ch === ' ') {
        return '<span class="sp" aria-hidden="true"' + style + '></span>';
      }
      return '<span aria-hidden="true"' + style + '>' + esc(ch) + '</span>';
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
body{background:${bg};font-family:-apple-system,'Segoe UI',Roboto,sans-serif;display:flex;align-items:center;justify-content:center;overflow:hidden}
.stage{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:28px;padding:24px}
.halo{position:absolute;width:min(78vw,660px);height:min(78vw,660px);border-radius:50%;pointer-events:none;
  background:radial-gradient(circle,${accentFaint} 0%,transparent 62%)}
.title{position:relative;display:block;margin:0;text-align:center;white-space:nowrap;
  font-family:'Courier New',monospace;font-weight:bold;
  font-size:clamp(34px,7.4vw,88px);letter-spacing:.12em;text-indent:.12em;
  animation:nx-glow 5s ease-in-out 1.4s infinite}
.title span{display:inline-block;color:transparent;
  background-image:linear-gradient(100deg,transparent 42%,${hi} 50%,transparent 58%),
                   linear-gradient(160deg,${accent} 0%,${accentSoft} 100%);
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
.line{height:1px;width:min(56vw,440px);opacity:.6;
  background:linear-gradient(90deg,transparent,${accent},transparent)}
</style>
</head>
<body>
<div class="stage">
  <div class="halo"></div>
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
    TEXTURE_OFF_DIRECTIVE: TEXTURE_OFF_DIRECTIVE,
    wantsTextures: wantsTextures,
    STORAGE_SAFE: STORAGE_SAFE,
    isGameCommand: isGameCommand,
    gameScopeNote: gameScopeNote,
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
    rewriteLibs: rewriteLibs
  };
})();

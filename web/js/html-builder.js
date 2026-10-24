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

  /* ============================================================
   * DIRECTIVA ÚNICA (ordem do Leo, 2026-10-23; REGRA 6 confirmada em 2026-10-24).
   * Sete regras imutáveis:
   *   1) Tela inteira, sem rolagem, qualquer resolução;
   *   2) Desempenho máximo (three.js + 2D);
   *   3) Iluminação bonita;
   *   4) Texturas e bibliotecas extras sob pedido;
   *   5) Som futurista obrigatório em jogos;
   *   6) Jogo em tela cheia, barra 15px, controles teclado/mouse;
   *   7) Só o que foi pedido.
   * ============================================================ */
  var DIRECTIVE = `
IDENTIDADE

Você é o NEXUS GAME: um construtor de páginas HTML criativas e visualmente impressionantes.
O pedido define o que a página é — jogo, simulação, cena 3D, desenho, ilustração, diagrama, painel, ferramenta, objeto interativo, texto formatado ou qualquer mistura disso. Não existe catálogo de tipos: decida pelo pedido e entregue a interpretação mais impressionante que caiba nele.

CONTRATO DE SAÍDA

- Responda SOMENTE com HTML cru. Sem cercas de código, sem explicação, sem texto antes ou depois.
- Comece com <!DOCTYPE html> e termine com </html>. Um único arquivo: todo o CSS dentro de <style> e todo o JavaScript dentro de <script>, inline.
- CDNs liberadas para qualquer biblioteca, EXCETO three.js e outras engines (use sempre vendor local, offline). O app injeta automaticamente os scripts necessários do diretório vendor/.
- Não existem addons de three.js: OrbitControls, GLTFLoader, EffectComposer, RoomEnvironment e RGBELoader NÃO estão disponíveis. Órbita de câmera é feita à mão com pointer + wheel. Use apenas a API core (WebGLRenderer, Scene, PerspectiveCamera, Mesh, InstancedMesh, Lights, Color, Fog, Texture).
- Nada de import map, nada de type="module", nada de import de CDN.
- Se o pedido for vago, escolha a interpretação mais impressionante e plausível — nunca pergunte, nunca recuse, nunca peça esclarecimento.
- Texto visível no idioma do pedido (português → pt-BR).
- Sem TODO, FIXME, lorem ipsum, placeholder, "implementação pendente" ou função vazia. Nunca deixe stub. Toda função declarada tem implementação real.
- Se a mensagem trouxer um documento "Current page", trate o comando como edição: mude só o que foi pedido e preserve o resto. NUNCA reescreva a página do zero quando a intenção é ajustar.

REGRA 1 — TELA INTEIRA, SEM ROLAGEM, EM QUALQUER RESOLUÇÃO

A página ocupa exatamente a janela, sem corte, sem sobra, sem barra de rolagem. Respeite toda largura e altura disponíveis.

- html, body { margin:0; padding:0; height:100%; overflow:hidden; }
- Raiz da cena: position:fixed; inset:0; width:100vw; height:100dvh (declare 100vh antes de 100dvh como fallback).
- Nenhuma dimensão de composição em px fixo: use %, vw/vh, vmin/vmax, fr, aspect-ratio, clamp(), min(), max(). Exceção: a barra de texto do jogo (15px de altura, REGRA 6) e medidas absolutas pequenas (≤5px) como bordas e raios são permitidas em px.
- Escute resize, orientationchange e ResizeObserver no container; recalcule tudo a cada mudança.
- 3D: renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5)); renderer.setSize(W, H, false); camera.aspect = W / H; camera.updateProjectionMatrix(). Reenquadre por FOV ou distância da câmera conforme o aspecto, nunca deixe cortar.
- 2D (canvas): dimensione o buffer pelo dpr e desenhe com ctx.setTransform(dpr, 0, 0, dpr, 0, 0), em coordenadas CSS.
- O conteúdo deve caber em 320x480 e continuar bonito em 2560x1080.
- Respeite a área segura: env(safe-area-inset-top/right/bottom/left).
- Alvos de toque com no mínimo 44x44 px de área clicável.
- Nada de overflow:auto na raiz; se precisar rolar, role um painel interno, nunca a página.

REGRA 2 — DESEMPENHO MÁXIMO (three.js + 2D)

O alvo é rodar liso em hardware modesto (2 núcleos, GPU integrada). O orçamento é lei.

- Uma cena, um WebGLRenderer, um requestAnimationFrame, um AudioContext por página. Nada de laço duplicado, nada de renderer por objeto.
- new THREE.WebGLRenderer({ antialias:true, powerPreference:'high-performance', alpha:false, stencil:false, depth:true })
- renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure entre 1.0 e 1.15.
- Sombras: renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap. Só UMA luz projeta sombra. shadow.mapSize = 1024 (nunca 2048/4096); shadow.bias = -0.0005; shadow.normalBias = 0.02; frustum do shadow.camera o mais justo possível.
- Loop com delta e teto: const dt = Math.min(clock.getDelta(), 0.25). Atualize a simulação com acumulador fixo (1/60) para não explodir em aba lenta.
- ZERO alocação dentro do loop: nada de new Vector3(), new Color() ou new Mesh() por frame — declare fora e reaproveite.
- Geometrias e materiais compartilhados por tipo de objeto; clone apenas o Mesh.
- Muitos objetos iguais → InstancedMesh com setMatrixAt e instanceMatrix.needsUpdate = true. Objetos estáticos → mesh.matrixAutoUpdate = false e updateMatrix() uma vez.
- Orçamento: até ~60 draw calls, ~80 mil triângulos, ~300 partículas. Estoure só se o resultado justificar e compense em outro lugar.
- Proibido post-processing: sem EffectComposer, sem bloom, sem SSAO, sem DOF. Iluminação e material fazem o trabalho.
- Texturas geradas em canvas (NxMat): até 256x256, anisotropy 4, LinearMipmapLinearFilter, generateMipmaps true.
- Transmission e MeshPhysicalMaterial: SOMENTE para corpo translúcido pedido (gelatina, gel, slime, gosma, gelo, resina, vidro grosso, água). Máx 2 materiais Physical, transmission ≤ 0.98, thickness ≤ 1.5, ior 1.30-1.45, clearcoat ≤ 0.6, attenuationDistance ≥ 2.5. Todo o resto da cena: MeshStandardMaterial.
- FPS adaptativo e silencioso: média em janelas de 2 s; abaixo de 50 → pixelRatio 1, metade das partículas, sombras desligadas; acima de 58 → restaure. Sem HUD de FPS.
- document.visibilitychange: pare o loop e zere o clock.
- Ao reconstruir a cena, descarte: geometry.dispose(), material.dispose(), texture.dispose(), renderer.dispose().
- Página 2D: canvas único, rAF com delta, DPR limitado a 2, o que é estático desenhado uma vez em camada offscreen.
- Jogos 2D e 3D seguem o MESMO código disciplinado: um canvas/rAF, sem vazamento de memória, sem alocações por frame.

REGRA 3 — ILUMINAÇÃO BONITA

Cena com material padrão e uma luz branca parece amadora. O visual vem da luz.

- Environment barato: gere PMREM com mini-cena (esfera invertida + 2-3 caixas emissivas) e descarte gerador e mini-cena.
- Três pontos: key (1.2-2.0, com a única sombra), fill frio (0.25-0.7, sem sombra) e rim/back (0.6-1.2).
- Materiais PBR coerentes: metal roughness 0.25 metalness 0.9; plástico roughness 0.45 metalness 0; pedra roughness 0.8 metalness 0. Nunca deixe MeshStandardMaterial branco padrão.
- Fundo nunca preto puro nem branco puro: gradiente no body ou scene.fog.
- Emissive pulsando 0.6-1.4 dá vida sem custo.
- Sombra de contato (CanvasTexture radial em multiply) vende realismo quando sombra real está desligada.
- Em 2D: luz direcional consistente, gradiente no fundo, vinheta sutil.

NEON — use NxMat.threeNeon(cor) para material emissivo neon. Cores oficiais: magenta #ff0077, ciano #00ffff, verde #33ff55, laranja #ff8800, azul #0088ff, amarelo #ffff33. Máx 3 peças neon acesas. body escuro ou o halo não aparece.
NxMat API: NxMat.threeNeon(cor) devolve material emissivo; NxMat.threeMat(nome, cor) devolve material PBR completo com textura procedural; NxMat.threeCanvas(nome) devolve THREE.CanvasTexture da textura nomeada.

MATERIAIS — 22 materiais PBR em NxMat. Metais: metal_brilhante, metal_escuro, metal_dourado. Plásticos: plastico_fosco, plastico_brilhante. Pedra: pedra_cinza, pedra_ardosia, marmore. Madeira: madeira_clara, madeira_escura. Tecido, concreto, terra, borracha. Especiais: neon, vidro, circuito, energia, lava, grade, holograma, camuflado. Use NxMat.threeMat(nome, cor) para criar o material configurado com roughness, metalness, normal map e emissivo corretos. Lista completa em NxMat.names().

GELATINA — corpo translúcido com refração: NxMat.threeGel(cor, opts) devolve MeshPhysicalMaterial calibrado com transmission. Exige scene.environment. Máx 1 corpo + 10 objetos internos opacos com contraste.

REGRA 4 — TEXTURAS E BIBLIOTECAS EXTRAS SOMENTE SOB PEDIDO

- Se o pedido NÃO mencionar textura, material, padrão, som, música ou engine específica: não carregue nada extra, use Canvas 2D nativo.
- 22 materiais PBR NxMat disponíveis (NxMat.threeMat, NxMat.threeCanvas, NxMat.canvasPattern).
- Biblioteca extra para jogos 3D: Three.js (vendor/three/three.min.js, SEM addons) ou Babylon.js (vendor/babylon/babylon.js).
- Biblioteca para jogos 2D completos: Phaser (vendor/phaser/phaser.min.js).
- Renderização 2D acelerada: PixiJS (vendor/pixi/pixi.min.js) + @pixi/sound opcional.
- Canvas 2D nativo para jogos/desenhos simples — zero dependências.
- Física 2D realista: Matter.js (vendor/matter/matter.min.js).
- Animações: GSAP (vendor/gsap/gsap.min.js) para UI; Lottie (vendor/lottie/lottie.min.js) para animações vetoriais.
- Desenho/editores visuais: Konva.js (vendor/konva/konva.min.js).
- Shaders customizados leves: OGL (vendor/ogl/ — ES modules, use type="module").
- Todas estão offline (vendor/). O app injeta os <script> automaticamente ao detectar o uso.
- NUNCA carregue duas engines 3D (three.js + babylon.js) na mesma página.
- NUNCA use base64 de mídia. Use caminhos relativos: assets/fundo.jpg.

REGRA 5 — TODO JOGO NASCE COM SONS FUTURISTAS (sobrepõe a Regra 4 em jogos)

Quando for JOGO (ação, plataforma, corrida, puzzle, tiro, simulação, 2D ou 3D), o áudio NÃO é opcional: trilha e efeitos sonoros, mesmo sem pedido. Regra 4 continua valendo integralmente para páginas não-jogo.

- Trilha elaborada em camadas (RECEITA DE MÚSICA abaixo), volume 0.15-0.3, + efeitos nos eventos.
- Estilo futurista/cyber: saw/square/triangle, ruído filtrado, envelopes rápidos, delay curto.
- Proibido áudio em arquivo ou base64 — tudo sintetizado em WebAudio ou com as libs abaixo.
- Bibliotecas de áudio disponíveis (vendor/): Howler.js para reprodução geral, Tone.js para música procedural, ZzFX para efeitos leves (tiro, explosão, pulo).
- PixiJS + @pixi/sound para áudio em projetos Pixi.
- AudioContext no primeiro gesto do usuário (click, keydown, pointerdown). Nunca autoplay.
- Mute: tecla M.
- Áudio não pode reduzir fps (REGRA 2).

RECEITA DE MÚSICA:
- Arquitetura: AudioContext + GainNode master + DynamicsCompressorNode; scheduler com setInterval(25 ms) e lookahead 0.1 s; 16 passos em loop.
- BAIXO: sawtooth raiz 55-110 Hz, colcheias, lowpass envelope (200→900 Hz, 0.05 s, decay 0.25 s).
- ARP: square semicolcheias, tríade 2 oitavas acima, delay feedback 0.35.
- PAD: 2-3 sawtooth detuned ±7 cent, lowpass 600-1200 Hz modulado LFO 0.1 Hz, gain 0.08.
- BATERIA: kick sine 120→45 Hz 0.1 s; snare ruído + bandpass 1.8 kHz decay 0.12 s; hihat ruído + highpass 7 kHz decay 0.03 s, colcheias.
- Harmonia: 4 compassos menor natural (i-VI-III-VII ou i-iv-v-VI), BPM 90-120.

RECEITAS DE EFEITOS (6-20 linhas WebAudio cada):
- TIRO/LASER: saw 900→120 Hz 0.12 s + ruído 10 ms + delay 0.2
- EXPLOSÃO: sub sine 60→30 Hz 0.4 s + ruído lowpass sweep 2500→120 Hz 0.6 s + cauda 0.8 s + WaveShaper
- IMPACTO: ruído 30 ms + sine 100→60 Hz + ring inarmônico 2-4 kHz decay 0.08 s
- PULO: sine 220→520 Hz 0.18 s + vibrato 8 Hz
- MOEDA: sino FM carrier 880 Hz ratio 3.5, two-tone 880→1320 Hz decay 0.25 s
- POWER-UP: arp ascendente 5 notas pentatônicas + shimmer + filter sweep 400→4000 Hz
- LEVEL UP: fanfarra 3-4 notas maiores + reverb + shimmer
- DANO: ruído 50 ms + saw 300→80 Hz 0.1 s + distorção leve
- GAME OVER: acorde menor detuned tape-stop ×1→×0.4 em 1.2 s + ruído grave
- MOTOR: 2 saw detuned 70-180 Hz + bandpass Q=2 + LFO amplitude
- PASSOS: ruído 40 ms + lowpass 300-700 Hz + thump 60 Hz
- AMBIENTE: ruído rosa + lowpass 300-900 Hz modulado LFO 0.1-0.5 Hz, gain 0.02-0.05
- UI/CLICK: triangle 600-800 Hz 30 ms

REGRA 6 — JOGO EM TELA CHEIA, BARRA 15px, CONTROLES TECLADO/MOUSE

Quando a página for um JOGO (ação, plataforma, corrida, puzzle, tiro, simulação, 2D ou 3D):

- TELA TODA PARA O JOGO. Ocupa 100vw × 100dvh. Proibido laterais, colunas, molduras, painéis, cards ou qualquer elemento fixo que roube espaço. O jogo é a estrela, a tela inteira é o palco.

- TEXTO NA BARRA SUPERIOR DE 15px. Pontuação, vidas, nível, timer, nome do jogo — tudo que for texto vai numa barra horizontal de exatos 15px de altura no topo, com fundo semitransparente escuro (rgba(0,0,0,0.55)), fonte 10-11px, position:fixed;top:0;left:0;width:100%;height:15px;z-index:10, texto centralizado verticalmente (line-height:15px). Nada de texto fora desta barra. A barra é sobreposta ao jogo e não reduz a área jogável.

- CONTROLES POR TECLADO E/OU MOUSE. O jogo TEM que ser jogável desde o primeiro frame. Implemente controles de teclado (setas/WASD, espaço para ação, ESC para pausa) e/ou mouse (clique para atirar/agir, arrasto, mira). Touch é bônus, nunca substituto. Sem delay, sem animação de entrada antes de aceitar comando. O objeto controlável já nasce respondendo a input.

REGRA 7 — SÓ O QUE FOI PEDIDO

Construa exatamente o que foi pedido, sem acrescentar nada. Proibido seções extras, cards, créditos, textos decorativos, elementos que não estavam no pedido. Qualidade se faz com acabamento dentro do que foi solicitado, não com quantidade.

COMO DECIDIR

Antes de escrever, responda em silêncio: o que a pessoa quer ver na tela? qual é a única coisa que precisa impressionar? como isso se enquadra em qualquer resolução? Depois construa o mínimo de código que entrega isso com o máximo de acabamento: tipografia cuidada, espaçamento consistente, transições suaves, nada de borda 1px cinza default nem fonte do sistema sem tratamento.

O resultado deve parecer feito por um estúdio, não gerado por um template.
`;

  /* Paleta do app como REFERÊNCIA (não obrigação). Silenciosa quando o tema
     não traz cores — o harness de teste roda sem o objeto completo. */
  function paletaRef(t) {
    if (!t || !t.background) return '';
    var linhas = [];
    if (t.background) linhas.push('fundo ' + t.background);
    if (t.surface) linhas.push('superfície ' + t.surface);
    if (t.accent) linhas.push('destaque ' + t.accent);
    if (t.text) linhas.push('texto ' + t.text);
    var out = '\n\nPALETA DO APP (referência, não obrigação):\n';
    out += '- ' + linhas.join(' · ') + '\n';
    out += '- Use estas cores quando combinarem com o pedido; se o pedido pedir outro estilo, outra cor ou outra atmosfera, siga o pedido e ignore esta lista.\n';
    return out;
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

  /* Arquivos de mídia em imagens/ e sons/. No HTML são caminhos relativos
     durante a sessão; no salvamento viram assets/images ou assets/sounds,
     mantendo caminho relativo funcional ao reabrir a página. */
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
    out += '- EXCEPTION: a REFERENCE IMAGE block may provide an absolute path starting with "/imagens/". That path is app-provided and must be used exactly as written, including the leading "/".\n';
    out += '- Image as background: element.style.backgroundImage = \'url("imagens/x.jpg")\' or CSS background: url("imagens/x.jpg") center/cover no-repeat.\n';
    out += '- Image as repeating block texture: const img = new Image(); img.src = "imagens/x.jpg"; img.onload = () => { ctx.fillStyle = ctx.createPattern(img, "repeat"); }.\n';
    out += '- Sprite sheet: load with new Image() and slice it with ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh).\n';
    out += '- Sound effects: new Audio("sons/x.mp3").play() on the event (shot, hit, jump, pickup). Set cloneNode for rapid repeats if needed.\n';
    out += '- Music: const music = new Audio("sons/x.mp3"); music.loop = true; music.volume = 0.35; — start it on the first user gesture (click/keydown), never on load.\n';
    out += '- Never invent filenames: use only the files listed above. If the command needs an asset that is not listed, build it procedurally (canvas, gradients, WebAudio oscillators) instead of guessing a path.\n';
    out += '- Never inline base64 media in the generated HTML; the app copies media into the project assets when saving.\n';
    return out;
  }

  /* System prompt — módulo único, sem modos: diretiva fixa + paleta de
     referência + nível de detalhe + mídia disponível + seleção de bibliotecas.
     `command` e `doc` seguem na assinatura por compatibilidade com app.js;
     quem transporta o documento atual é o userPrompt. */
  function systemPrompt(theme, detailLevel, command, doc, media) {
    var level = (detailLevel === undefined || detailLevel === null) ? 1 : detailLevel;
    var selectedLibs = window.LibrarySelector.selectLibraries(command, doc);
    var libraryDirective = window.LibrarySelector.buildLibraryDirective(selectedLibs);
    return DIRECTIVE + paletaRef(theme) + detailDirective(level) + mediaBlock(media) + libraryDirective;
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

  /* Validação de qualidade do documento gerado.
     Só falhas de ALTA confiança — cada item vira uma linha do pedido de reparo.
     Devolve [{code, msg}]. */
  function lint(html) {
    var out = [];
    if (!html) return out;
    var s = String(html);
    var low = s.toLowerCase();

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

    /* 2) Addons/módulos: este three.js é só o core, addons não existem. */
    var addon = low.match(/orbitcontrols|gltfloader|effectcomposer|roomenvironment|contactshadows|rgbelloader|importmap|type\s*=\s*["']?module/);
    if (addon) {
      out.push({ code: 'addon', msg: 'usa "' + addon[0] + '" (addons/ES modules não estão disponíveis; só o core do three.js)' });
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
    /* Pack de materiais PBR (js/nx-materials.js) — só entra quando a página
       usa material (NxMat/threeCanvas/canvasPattern). Sem uso, não carrega 30 KB à toa. */
    if (/\bNxMat\b|threeCanvas|canvasPattern|nx-materials/.test(html)) {
      injection += '<script src="js/nx-materials.js"></script>\n';
    }
    /* Pack de shaders GLSL (js/nx-shaders.js) — só se o HTML usar shader */
    if (/\bNxShader\b|glsl|fragShader|fragmentShader|nx-shaders/.test(html)) {
      injection += '<script src="js/nx-shaders.js"></script>\n';
    }
    /* Carregamento automático de bibliotecas selecionadas.
       Detecta uso de variáveis globais e injeta os <script> correspondentes. */
    var libScripts = buildLibraryScripts(html);
    if (libScripts) injection += libScripts + '\n';
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

  /* Gera tags <script> para as bibliotecas detectadas no HTML gerado pela IA.
     Usa o catálogo do LibrarySelector (vendor local + loaders sob demanda). */
  function buildLibraryScripts(html) {
    var scripts = [];
    var libs = window.LibrarySelector;
    if (!libs) return '';

    function alreadyInlined(fileName) {
      var re = new RegExp('<script[^>]*src\\s*=\\s*["\']([^"\']*' + fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')[\"\']');
      return re.test(html);
    }
    function codeMentions(word) {
      return new RegExp('\\b' + word + '\\b').test(html);
    }

    if (codeMentions('THREE') && !alreadyInlined('three.min.js'))
      scripts.push('<script src="vendor/three/three.min.js"></script>');

    if (codeMentions('BABYLON') && !alreadyInlined('babylon.js'))
      scripts.push('<script src="vendor/babylon/babylon.js"></script>');

    if (codeMentions('OGL') && !alreadyInlined('ogl-loader.js'))
      scripts.push('<script type="module" src="vendor/ogl/ogl-loader.js"></script>');

    if (codeMentions('Phaser') && !alreadyInlined('phaser.min.js'))
      scripts.push('<script src="vendor/phaser/phaser.min.js"></script>');

    if (codeMentions('PIXI') && !alreadyInlined('pixi.min.js')) {
      scripts.push('<script src="vendor/pixi/pixi.min.js"></script>');
      if (codeMentions('sound') && !alreadyInlined('pixi-sound.js'))
        scripts.push('<script src="vendor/pixi-sound/pixi-sound.js"></script>');
    }

    if (codeMentions('Konva') && !alreadyInlined('konva.min.js'))
      scripts.push('<script src="vendor/konva/konva.min.js"></script>');

    if (codeMentions('Matter') && !alreadyInlined('matter.min.js'))
      scripts.push('<script src="vendor/matter/matter.min.js"></script>');

    if (codeMentions('gsap') && !alreadyInlined('gsap.min.js'))
      scripts.push('<script src="vendor/gsap/gsap.min.js"></script>');

    if (codeMentions('lottie') && !alreadyInlined('lottie.min.js'))
      scripts.push('<script src="vendor/lottie/lottie.min.js"></script>');

    if ((codeMentions('Howler') || codeMentions('howl')) && !alreadyInlined('howler.min.js'))
      scripts.push('<script src="vendor/howler/howler.min.js"></script>');

    if (codeMentions('Tone') && !alreadyInlined('Tone.js'))
      scripts.push('<script src="vendor/tone/Tone.js"></script>');

    if ((codeMentions('ZzFX') || codeMentions('zzfx')) && !alreadyInlined('ZzFX.global.js'))
      scripts.push('<script src="vendor/zzfx/ZzFX.global.js"></script>');

    /* Yuka (IA) */
    if (codeMentions('YUKA') && !alreadyInlined('yuka.min.js'))
      scripts.push('<script src="vendor/yuka/yuka.min.js"></script>');

    /* lil-gui (debug): UMD expõe lil.GUI; alias garante o global GUI da diretiva. */
    if ((codeMentions('GUI') || codeMentions('lil-gui')) && !alreadyInlined('lil-gui.umd.js')) {
      scripts.push('<script src="vendor/lil-gui/lil-gui.umd.js"></script>');
      scripts.push('<script>window.GUI=window.GUI||(window.lil&&window.lil.GUI);<\/script>');
    }

    /* simplex-noise (build clássico: expõe SimplexNoise / createSimplexNoise / createNoise2D|3D|4D) */
    if (/\bSimplexNoise\b|\bcreateSimplexNoise\b|\bcreateNoise[234]D\b|\balea\b|\bbuildPermutationTable\b/.test(html) && !alreadyInlined('simplex-noise'))
      scripts.push('<script src="vendor/simplex-noise/simplex-noise.global.js"></script>');

    /* NxLoad (loaders para Rapier, Recast, postprocessing, meshBVH, spritesheet, tiled) */
    if (/\bNxLoad\b|rapier|recast|postprocessing|MeshBVH|spritesheet|tiled/.test(html) && !alreadyInlined('nx-loaders.js'))
      scripts.push('<script src="js/nx-loaders.js"></script>');

    return scripts.length ? scripts.join('\n') : '';
  }

  /* Tela de apresentação: halo estático + título animado (entrada letra a letra,
     brilho deslizante e glow suave) — sem cubo e sem partículas. */
  function welcomePage(theme, hasKey) {
    var bg = theme.background;
    var accent = theme.accent;
    var hi = sheenOn(accent);
    var accentSoft = window.Themes.hexA(theme.accent, 150);
    var accentFaint = window.Themes.hexA(theme.accent, 20);
    /* Detalhes do tema único BLACK CYBER: esmeralda → roxo → azul. */
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
      body = '<div class="grid">' + entries.map(function (e) {
        var n = escAttr(e.name);
        var short = e.name.replace(/\\.html$/i, '');
        var label = escAttr(short);
        var tip = escAttr(short + ' — ' + e.meta);
        return '<div class="card" data-n="' + n + '">' +
          '<span class="tile">' +
          '<button class="open" type="button" data-n="' + n + '" title="' + tip + '" aria-label="Abrir ' + label + '">' +
          '<span class="glyph">&lt;/&gt;</span></button>' +
          '<button class="del" type="button" data-n="' + n + '" title="Excluir ' + label + '" aria-label="Excluir ' + label + '">✕</button>' +
          '</span>' +
          '<span class="cap" title="' + tip + '">' + esc(short) + '</span>' +
          '<span class="actions" data-n="' + n + '">' +
          '<button class="act act-rename" type="button" data-n="' + n + '" title="Renomear">✎</button>' +
          '<button class="act act-duplicate" type="button" data-n="' + n + '" title="Duplicar">⧉</button>' +
          '</span>' +
          '</div>';
      }).join('') + '</div>';
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
.list{flex:1;overflow-y:auto;padding:10px 16px 24px;-webkit-overflow-scrolling:touch}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(76px,1fr));gap:16px 8px;align-content:start;justify-items:center}
.card{position:relative;display:flex;flex-direction:column;align-items:center;gap:6px;width:100%;min-width:0;cursor:pointer;-webkit-tap-highlight-color:transparent}
.tile{position:relative;display:block;width:50px;height:50px}
.open{width:50px;height:50px;display:flex;align-items:center;justify-content:center;padding:0;background:${surface};border:1px solid ${border};border-radius:11px;cursor:pointer;transition:background .15s ease,border-color .15s ease,transform .12s ease;-webkit-tap-highlight-color:transparent}
.open:hover{border-color:${accentSoft};background:${surfaceAlt}}
.open:active{background:${accentFaint};transform:scale(.95)}
.open:focus-visible{outline:2px solid ${accentSoft};outline-offset:2px}
.glyph{font-family:'Courier New',monospace;font-size:11px;letter-spacing:-.5px;color:${accent};pointer-events:none}
.del{position:absolute;top:-5px;right:-5px;width:16px;height:16px;padding:0;border-radius:50%;border:1px solid ${border};background:${surfaceAlt};color:${accent};font-size:9px;line-height:1;display:flex;align-items:center;justify-content:center;cursor:pointer;opacity:0;transition:opacity .15s ease,background .15s ease;-webkit-tap-highlight-color:transparent}
.card:hover .del,.card:focus-within .del,.del:focus{opacity:1}
@media (hover:none){.del{opacity:.8}}
.del:active{background:${accentSoft};color:${bg}}
.cap{max-width:100%;color:${secondary};font-size:9.5px;line-height:1.25;text-align:center;font-family:'Courier New',monospace;overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;word-break:break-word}
.card:hover .cap{color:${fg}}
.actions{display:flex;gap:4px;margin-top:2px;opacity:0;transition:opacity .15s}
.card:hover .actions,.card:focus-within .actions{opacity:1}
.act{border:1px solid ${border};background:${surfaceAlt};color:${secondary};border-radius:4px;width:18px;height:16px;padding:0;font-size:9px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center}
.act:hover{background:${accentFaint};color:${accent}}
.empty{text-align:center;color:${secondary};font-size:13.5px;line-height:1.7;padding:48px 24px}
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
var grid = document.querySelector('.grid');
if (grid) grid.addEventListener('click', function(ev){
  var t = ev.target;
  if (!t || !t.closest) return;
  var del = t.closest('.del[data-n]');
  if (del) { ev.stopPropagation(); try{ Nexus77.deleteSaved(del.getAttribute('data-n')); }catch(e){} return; }
  var rename = t.closest('.act-rename[data-n]');
  if (rename) { ev.stopPropagation(); try{Nexus77.renameSaved(JSON.stringify({name:rename.getAttribute('data-n')}))}catch(e){} return; }
  var dupe = t.closest('.act-duplicate[data-n]');
  if (dupe) { ev.stopPropagation(); try{ Nexus77.duplicateSaved(dupe.getAttribute('data-n')); }catch(e){} return; }
  var card = t.closest('.card[data-n]');
  if (card) { try{ Nexus77.openSaved(card.getAttribute('data-n')); }catch(e){} }
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
    EDIT_DIRECTIVE: EDIT_DIRECTIVE,
    DIRECTIVE: DIRECTIVE,
    STORAGE_SAFE: STORAGE_SAFE,
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
    rewriteLibs: rewriteLibs,
    selectLibraries: window.LibrarySelector.selectLibraries,
    buildLibraryDirective: window.LibrarySelector.buildLibraryDirective,
    getLibraryGlobal: window.LibrarySelector.getLibraryGlobal,
    isLibraryLocal: window.LibrarySelector.isLibraryLocal
  };
})();

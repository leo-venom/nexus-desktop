# ⚠️ OBSOLETO — GAME_MODE.md (v2.13.0)

**Este documento refere-se à arquitetura de modos (jogo/desenho/chat) REMOVIDA em v2.14.0.**

> **Substituído por:** [`DIRECTIVE.md`](DIRECTIVE.md) — diretriz unificada sem modos.

---

# GAME_MODE — diretriz oficial do modo jogo (histórico v2.13.0)

**Gerado do código em execução** (`web/js/html-builder.js`) por `docs/gerar_game_mode.js` ·
NEXUS GAME v2.13.0 · 2026-10-22. Não edite à mão: rode o gerador.

> **AVISO:** O `GAME_DIRECTIVE`, `detectMode`, `wantsTextures`, `gameScopeNote`, `gameLightingNote`
> e exports relacionados foram **removidos** em v2.14.0. Este documento não reflete o código atual.

O modo é escolhido por `Html.detectMode(command)` — 🎮 `game`, 🎨 `drawing`, 💬 `chat`.
Este documento descreve **apenas** o modo jogo. Comandos de jogo recebem:

```text
BASE_PROMPT + GAME_DIRECTIVE (ou HEAD + TEXTURE_OFF + TAIL) + gameScopeNote +
gameLightingNote + PALETA (a IA escolhe 3 cores) + mediaBlock(media)
```

## Números

| Item | Valor |
|---|---|
| `GAME_DIRECTIVE` completo | 16.753 chars (230 linhas) |
| `GAME_DIRECTIVE_HEAD` (sempre) | 6.768 chars (40,4%) |
| Bloco de texturas `@@NX_TEX` (sob pedido) | 6.413 chars (38,3%) |
| `GAME_DIRECTIVE_TAIL` (sempre) | 3.572 chars (21,3%) |
| `TEXTURE_OFF_DIRECTIVE` | 740 chars |
| Prompt de jogo (system) sem texturas | 13.391 chars |
| Prompt de jogo (system) com texturas | 19.063 chars |
| Prompt de desenho (`drawing`) | 14.234 chars |
| Blocos numerados | 8 |
| Texturas no pack `NxTex` | 44 |
| Receitas `CanvasTexture` | 12 |
| Sons WebAudio | 13 |
| Perguntas do `CHECK FINAL` | 6 |
| Temas no app | 1 (fixo; a paleta do jogo NÃO é herdada) |

## Blocos do `GAME_DIRECTIVE`

| # | Bloco | Chars |
|---|---|---|
| 1 | CONTRATO DE SAÍDA | 519 |
| 2 | FUNDO — O JOGO É A TELA | 511 |
| 3 | ESQUELETO OBRIGATÓRIO — siga esta estrutura (adapte nomes, não invente outro loop) | 2.705 |
| 4 | ACABAMENTO — o que "pronto" significa | 647 |
| 5 | REALISMO 3D EM GPU INTEGRADA | 737 |
| 6 | ORÇAMENTO (estourar = jogo travado) | 675 |
| 7 | HUD E TEXTO | 264 |
| 8 | REPROVA (falha de entrega) | 418 |

## Pack de texturas e cauda

O bloco `@@NX_TEX_BEGIN@@ … @@NX_TEX_END@@` entra **somente quando o pedido cita textura/material**
(`Html.wantsTextures`). Sem textura, `TEXTURE_OFF_DIRECTIVE` ocupa o lugar dele.
A cauda (`SONS` + `CHECK FINAL`) entra **sempre**.

| Parte | Chars |
|---|---|
| PACK DE TEXTURAS PRONTO — window.NxTex (USE ESTE, NÃO REESCREVA) | 538 |
| API (2D) | 503 |
| API (3D/three.js) | 1.236 |
| REGRA DE 3D SIMPLES | 887 |
| ANIMAÇÃO DE TEXTURA | 409 |
| SONS — MÚSICA ELABORADA + EFEITOS (RECEITAS) | 3.900 |
| CHECK FINAL — passe por cada item; se algum falhar, conserte antes de entregar | 557 |
| ENTREGUE APENAS O HTML. | 25 |

Texturas do pack: lava, metal, cromo, ouro, vidro, madeira, pedra, gelo, agua, grama, asfalto, grade, nebulosa, areia, chocolate, neon, tijolo, marmore, couro, plasma, cristal, ferrugem, concreto, holograma, obsidiana, basalto, ametista, rubi, safira, turquesa, cobre, bronze, titanio, fibra_carbono, camuflagem, zebra, tigre, veludo, pergaminho, circuito, binario, aurora, fogo_azul, pantano.

## Texto integral (verbatim do código)

```text

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


SONS FUTURISTAS — MÚSICA ELABORADA + EFEITOS (RECEITAS):

AudioContext compartilhado, criado no primeiro gesto do usuário. GainNode master 0.15–0.3 + DynamicsCompressorNode leve; mute na tecla M.

MÚSICA DE FUNDO ELABORADA (obrigatória em todo jogo): trilha em 4 camadas com scheduler de 16 passos (setInterval 25 ms + lookahead 0.1 s agendando em actx.currentTime).
1. BAIXO: sawtooth na raiz do acorde (55-110Hz) em colcheias + BiquadFilter lowpass com envelope (cutoff 200→900Hz em 0.05s, decay 0.25s).
2. ARP: square em semicolcheias percorrendo a tríade do acorde 2 oitavas acima (220-880Hz) + delay (feedback 0.35, tempo 3/16 do BPM), gain 0.12.
3. PAD: 2-3 sawtooth detuned (±7 cents) segurando o acorde inteiro, lowpass 600-1200Hz modulado por LFO lento (0.1Hz), gain 0.08.
4. BATERIA: kick = sine 120→45Hz em 0.1s (2× por compasso); snare = ruído + bandpass 1.8kHz decay 0.12s; hihat = ruído + highpass 7kHz decay 0.03s em colcheias.
Harmonia: progressão de 4 compassos em menor natural (i–VI–III–VII ou i–iv–v–VI), BPM 90-120. A intensidade sobe com o nível (adicionar camadas, abrir corte de filtro), nunca trocar tudo de uma vez.

EFEITOS (6-20 linhas de WebAudio cada):
1. TIRO/LASER: sawtooth 900→120Hz em 0.12s + transiente de ruído 10ms + delay curto (feedback 0.2); variação de ±5% na freq inicial a cada tiro.
2. EXPLOSÃO: 3 camadas — sub sine 60→30Hz (0.4s), ruído com lowpass sweep 2500→120Hz (0.6s) e cauda grave (0.8s, gain 0.15); WaveShaper leve para peso.
3. IMPACTO/COLISÃO: ruído de 30ms + sine 100→60Hz + ring metálico (3 osciladores inarmônicos 2-4kHz, decay 0.08s).
4. PULO: sine 220→520Hz em 0.18s com vibrato leve (LFO 8Hz) e ataque rápido.
5. MOEDA/COLETA: sino FM (carrier 880Hz, ratio 3.5, índice de modulação decaindo) two-tone 880→1320Hz, decay 0.25s.
6. POWER-UP: arp ascendente de 5 notas pentatônicas em square + shimmer na oitava acima (triangle) + filter sweep 400→4000Hz.
7. LEVEL UP/VITÓRIA: fanfarra de 3-4 notas maiores em sawtooth com tríade de apoio + reverb curto + shimmer final.
8. DANO/HIT: ruído de 50ms + saw 300→80Hz em 0.1s com distorção leve no ataque.
9. GAME OVER: acorde menor detuned em tape-stop (pitch ×1→×0.4 em 1.2s) + ruído grave decaído.
10. MOTOR: 2 sawtooth detuned (70-180Hz) + bandpass Q=2 + LFO de amplitude; a frequência segue a velocidade.
11. PASSOS: ruído de 40ms + lowpass 300-700Hz variando por passo + thump grave de 60Hz; nenhum passo igual ao anterior.
12. VENTO/AMBIENTE: ruído rosa + lowpass 300-900Hz modulado por LFO 0.1-0.5Hz, gain 0.02-0.05.
13. UI/CLICK: blip suave (triangle 600-800Hz, 30ms, ataque zero); hover usa metade do gain.

CHECK FINAL — passe por cada item; se algum falhar, conserte antes de entregar:
- Documento fechado (</body></html>), <script> todos balanceados, nenhum erro no primeiro frame?
- Primeiro frame já mostra o jogo/objeto, sem clique e sem tela de título?
- Vence e perde? Restart em 1 tecla? Recorde salvo?
- Jogo: 3+ inimigos distintos, 5+ níveis, 3+ power-ups, colisão real?
- Fundo é a própria cena (3D) ou desenhado pelo jogo (2D), sem camada decorativa por cima?
- 60fps dentro do orçamento (DPR 1.5, 1 loop, pool de partículas, zero alocação no frame)?

ENTREGUE APENAS O HTML.


```

## Como regerar

```bash
node docs/gerar_game_mode.js
```

O gerador falha (exit 1) se `window.Html.GAME_DIRECTIVE` não existir, então o arquivo
nunca fica silenciosamente vazio. Números de referência também estão em
`docs/ESTADO_ATUAL.md` (§5 e §11) e as âncoras obrigatórias em `docs/REGRAS_DEFINITIVAS.md` (passo 6).

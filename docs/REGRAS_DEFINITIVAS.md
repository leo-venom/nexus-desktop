# 🔴 REGRAS DEFINITIVAS — NEXUS GAME (v3.0.1+)

**Atualizado:** 2026-10-24  
**Fonte da verdade:** `web/js/html-builder.js` (DIRECTIVE em execução)  
**Substitui:** as versões de 2026-10-22 (v2.14.0) e 2026-10-23 (v2.15.0/v3.0.0).

> **REGRA 6 canônica (decisão do Leo, 2026-10-24):** **tela cheia** — 100vw × 100dvh,
> barra de texto de **15px** no topo, controles de teclado/mouse. O layout de 2026-10-22
> (tela central + controles laterais + moldura metálica de 2px) e a barra de 5px de
> 2026-10-23 estão **revogados**. Nenhum documento ou trecho de código pode reintroduzi-los.

---

## 0. ARQUITETURA UNIFICADA — SETE REGRAS

**Não existem modos** (jogo / desenho / objeto / chat). O modelo decide o que a página é.
Restam **sete regras imutáveis**, na ordem do DIRECTIVE:

| # | Regra | Essência |
|---|-------|----------|
| 1 | **Tela inteira, sem rolagem, em qualquer resolução** | 100vw × 100dvh, unidades relativas, resize/ResizeObserver, safe-area, toque ≥44px |
| 2 | **Desempenho máximo (three.js + 2D)** | 1 cena/renderer/rAF/AudioContext, orçamento ≤60 calls/≈80k tri/≈300 partículas, FPS adaptativo silencioso |
| 3 | **Iluminação bonita** | PMREM barato, 3 pontos (key/fill/rim), PBR coerente, fundo em gradiente/fog, emissive pulsante |
| 4 | **Texturas e bibliotecas extras só sob pedido** | NxMat/NxShader/libs somente quando citados; nada de base64; caminhos relativos |
| 5 | **Todo jogo nasce com sons futuristas** | Trilha em 4 camadas + 13 efeitos WebAudio, sempre em jogos; gesto inicial, mute M |
| 6 | **Jogo em tela cheia, barra 15px, controles teclado/mouse** | O jogo ocupa a tela toda; todo texto na barra de 15px; input desde o primeiro frame |
| 7 | **Só o que foi pedido** | Sem seções extras, cards, créditos ou decoração não solicitada |

**Consequências implementadas (v3.0.x):**
- `GAME_DIRECTIVE`, `DRAWING_DIRECTIVE`, `CHAT_DIRECTIVE`, `TEXTURE_OFF_DIRECTIVE` **removidos** (v2.14.0).
- `detectMode`, `wantsTextures`, `isGameCommand` e afins **removidos**.
- `BASE_PROMPT` (inglês) **removido** na v3.0.1; restou apenas o `DIRECTIVE` unificado.
- `NxTex` (44/88 texturas) **removido** na v3.0.0 → substituído por `NxMat` (22 materiais PBR)
  + `NxShader` (28 shaders + 7 chunks) + `NxLoad` (loaders sob demanda).
- `Html.lint(html)` — **1 argumento**, só checagens gerais (truncado, addon/CDN three, stub).
- `DIRECTIVE`: **13.256 chars / 146 linhas**; `systemPrompt` nível 1 ≈ **14,4 mil chars**.
- Versão única em package/lock/ai-client/selector/README/docs: **3.0.1**.

---

## 1. FUNDO — `baseCss()` NUNCA PODE TER `background`

### Causa raiz
Quando `baseCss()` definia `background:var(--nx-bg)`, o `<style id="nx77-base">` injetado
depois do CSS do modelo sobrescrevia o fundo autoral (ex.: `background:url('imagens/back1.jpg')`)
por preto puro — mesma especificidade, último vence.

### Estado correto (v3.0.1)
```js
function baseCss() {
  return 'html,body{margin:0;padding:0;overscroll-behavior:none}\n' + ...
}
```
- Sem `background` e sem `color` em `html,body` — o modelo define ambos.
- `varsCss()` continua criando `--nx-*`; criar variáveis é permitido, aplicá-las em
  `html,body` não é.

### Verificação
```bash
grep -n 'html,body.*background' web/js/html-builder.js
# Deve retornar vazio
```

**NUNCA adicionar `background` de volta ao `baseCss()`.**

---

## 2. REGRA 1 — TELA INTEIRA, SEM ROLAGEM (resumo canônico)

Texto completo: `docs/DIRECTIVE.md` / `html-builder.js`.

- `html, body { margin:0; padding:0; height:100%; overflow:hidden; }`
- Raiz: `position:fixed; inset:0; width:100vw; height:100dvh` (com `100vh` antes como fallback).
- Nenhuma dimensão de composição em px fixo — exceto a barra de 15px da REGRA 6 e medidas ≤5px
  (bordas/raios).
- `resize`, `orientationchange` e `ResizeObserver` recalculam tudo.
- 3D: `setPixelRatio(min(dpr,1.5))`, `setSize(W,H,false)`, `camera.aspect`, `updateProjectionMatrix()`.
- 2D: buffer pelo DPR + `ctx.setTransform(dpr,0,0,dpr,0,0)`.
- Cabe em **320×480** e continua bonito em **2560×1080**; safe-area respeitada.
- Alvos de toque ≥ **44×44 px**.
- Sem `overflow:auto` na raiz; rolagem só em painel interno.

**Verificação:** o texto da REGRA 1 no prompt deve conter a exceção dos 15px (REGRA 6) e
**não** conter "Mouse não existe no celular".

---

## 3. REGRA 2 — DESEMPENHO (resumo canônico)

- 1 cena / 1 `WebGLRenderer` / 1 `requestAnimationFrame` / 1 `AudioContext`.
- `{antialias:true, powerPreference:'high-performance', alpha:false, stencil:false, depth:true}`.
- `SRGBColorSpace` + `ACESFilmicToneMapping` (exposure 1.0–1.15).
- `PCFSoftShadowMap`; **1 luz com sombra**; mapSize **1024**; bias `-0.0005`; normalBias `0.02`.
- `dt = min(clock.getDelta(), 0.25)` + acumulador fixo `1/60`.
- **Zero alocação no loop**; geometria/material compartilhados; `InstancedMesh` para repetição;
  estáticos com `matrixAutoUpdate=false`.
- Orçamento: **≤60 draw calls · ≈80k triângulos · ≈300 partículas**.
- **Post-processing proibido** (sem bloom/SSAO/DOF/EffectComposer).
- Texturas de canvas ≤ **256×256**, anisotropy 4.
- `MeshPhysicalMaterial`/transmission só para corpo translúcido pedido (máx 2 materiais;
  transmission ≤0.98; thickness ≤1.5; ior 1.30–1.45; clearcoat ≤0.6; attenuationDistance ≥2.5).
- FPS adaptativo silencioso: janelas de 2 s; <50 → DPR 1/metade das partículas/sombras off;
  >58 restaura; sem HUD.
- `visibilitychange` para o loop e zera clock; `dispose()` ao reconstruir.
- 2D: canvas único, rAF com delta, DPR ≤2, estático em camada offscreen.

**Lint não checa isso** — cumprimento é responsabilidade do modelo via DIRECTIVE.

---

## 4. REGRA 3 — ILUMINAÇÃO (resumo canônico)

- Environment barato: `PMREMGenerator` com mini-cena (esfera invertida + 2–3 caixas emissivas);
  descartar gerador e mini-cena.
- 3 pontos: **key 1.2–2.0** (única sombra), **fill frio 0.25–0.7**, **rim/back 0.6–1.2**.
- PBR coerente: metal .25/.9; plástico .45/0; pedra .8/0 — nunca `MeshStandardMaterial` branco.
- Fundo nunca preto/branco puro: gradiente no body ou `scene.fog` na cor do fundo.
- Emissive pulsando **0.6–1.4**.
- Sombra de contato: `CanvasTexture` radial em `multiply` quando não há sombra real.
- 2D: luz direcional consistente + gradiente + vinheta sutil.
- Neon: `NxMat.threeNeon(cor)`, no máx. 3 peças; body escuro.
- Gelatina: `NxMat.threeGel(cor, opts)`, máx. 1 corpo + 10 objetos internos opacos.

---

## 5. REGRA 4 — TEXTURAS E BIBLIOTECAS SÓ SOB PEDIDO

Sem pedido → **nada extra**: sem `NxMat`/`NxShader`, sem `CanvasTexture`, sem ruído procedural,
sem `AudioContext` (exceto REGRA 5 em jogos). Use Canvas 2D nativo.

Com pedido, o app injeta automaticamente:

| Recurso | Conteúdo |
|---|---|
| `NxMat` | **22 materiais PBR** procedurais + normal map + cache |
| `NxShader` | **28 shaders GLSL + 7 chunks** |
| `NxLoad` | Rapier, Recast, postprocessing, three-mesh-bvh, spritesheet, Tiled |
| Bibliotecas | **24 entradas** no seletor (20 locais/nativos + 4 CDN sob demanda) |

Regras permanentes:
- **NxTex não existe mais** — qualquer referência a `NxTex.*`, `gel`, `gelGeo` é resíduo.
- **NUNCA base64** de mídia; caminhos relativos (`imagens/x.jpg`, `assets/fundo.jpg`).
- **NUNCA duas engines 3D** (three.js + Babylon.js) na mesma página.
- Three.js sempre vendor local (`vendor/three/three.min.js`), **sem addons/import maps/modules**.
- OGL é a exceção modular (`type="module"`), pois é ES modules por natureza.

**Verificação:**
```bash
grep -rn "NxTex" web/js docs README.md | grep -v "não existe\|remov\|histórico\|obsolet"
# Deve retornar vazio (fora de notas históricas)
```

---

## 6. REGRA 5 — TODO JOGO NASCE COM SONS FUTURISTAS

Vale para **todo jogo** (2D/3D, qualquer gênero), mesmo sem pedido. A REGRA 4 continua
valendo integralmente para páginas que não são jogo.

- **Trilha em 4 camadas** (master 0.15–0.3): baixo saw 55–110 Hz com envelope de filtro ·
  arp square em semicolcheias com delay · pad de 2–3 saws detuned ±7 cent com LFO 0.1 Hz ·
  bateria sintetizada (kick sine 120→45 Hz, snare ruído+bandpass 1.8 kHz, hihat ruído+highpass 7 kHz).
- Scheduler de **16 passos**, `setInterval(25 ms)`, lookahead 0.1 s; compressor no master;
  harmonia menor natural (i–VI–III–VII), BPM 90–120.
- **13 efeitos**: tiro/laser, explosão, impacto, pulo, moeda, power-up, level up, dano,
  game over, motor, passos, ambiente, UI/click.
- Estilo futurista/cyber: saw/square/triangle + ruído filtrado, envelopes rápidos, delay curto.
- **AudioContext só no 1º gesto** (click/keydown/pointerdown) — nunca autoplay.
- **Mute na tecla M**.
- Proibido arquivo de áudio ou base64; tudo sintetizado em WebAudio ou Howler/Tone/ZzFX.
- Áudio não pode reduzir FPS (REGRA 2).

**Verificação:** gerar um jogo sem pedir som e confirmar `AudioContext`, scheduler e efeitos
no HTML final.

---

## 7. REGRA 6 — JOGO EM TELA CHEIA, BARRA 15px, CONTROLES TECLADO/MOUSE

### Texto canônico (v3.0.1)
```
Quando a página for um JOGO (ação, plataforma, corrida, puzzle, tiro, simulação, 2D ou 3D):

- TELA TODA PARA O JOGO. Ocupa 100vw × 100dvh. Proibido laterais, colunas, molduras,
  painéis, cards ou qualquer elemento fixo que roube espaço.
- TEXTO NA BARRA SUPERIOR DE 15px. Pontuação, vidas, nível, timer, nome do jogo — tudo
  que for texto vai numa barra horizontal de exatos 15px de altura no topo, fundo
  rgba(0,0,0,0.55), fonte 10-11px, position:fixed;top:0;left:0;width:100%;height:15px;
  z-index:10, line-height:15px. Nada de texto fora desta barra. A barra é sobreposta
  ao jogo e não reduz a área jogável.
- CONTROLES POR TECLADO E/OU MOUSE. Jogável desde o primeiro frame: setas/WASD, espaço,
  ESC para pausa; clique/arrasto/mira. Touch é bônus, nunca substituto. Sem delay e sem
  animação de entrada antes de aceitar comando.
```

### Regras permanentes
- **100vw × 100dvh** para o jogo; canvas/WebGL de borda a borda.
- **Proibido**: colunas laterais, painéis, HUD no centro, molduras, bezels, cards, faixas
  que reduzam a área jogável.
- **Todo texto** em uma única barra fixa de **15px** no topo (a barra é overlay; não empurra o jogo).
- **Input desde o primeiro frame** — o objeto controlável nasce respondendo.
- Teclado **e/ou** mouse obrigatórios; toque é complemento.
- A barra de 15px é a **única exceção em px** da REGRA 1 (além de medidas ≤5px).

### Histórico (não usar)
| Data | Layout | Status |
|---|---|---|
| 2026-10-22 | Tela central + controles laterais ≤150px + moldura metálica 2px | **Revogado** |
| 2026-10-23 | Tela cheia + barras de 5px | **Revogado** (valor errado) |
| **2026-10-24** | **Tela cheia + barra de 15px + teclado/mouse** | **Canônico** |

**Verificação:**
```bash
grep -n "REGRA 6 — JOGO EM TELA CHEIA, BARRA 15px" web/js/html-builder.js
grep -n "BARRAS 5px\|CONTROLES LATERAIS\|moldura metálica" web/js/html-builder.js
# Primeiro deve achar; segundo deve retornar vazio
```

---

## 8. REGRA 7 — SÓ O QUE FOI PEDIDO

Construir exatamente o pedido, sem seções extras, cards, créditos, textos decorativos ou
elementos não solicitados. Acabamento dentro do escopo — nunca quantidade para parecer completo.
Protótipo, placeholder, menu no lugar do jogo ou texto substituindo conteúdo reprovam.

---

## 9. PALETA — REFERÊNCIA, NÃO OBRIGAÇÃO

`systemPrompt` chama `paletaRef(theme)`. Tema único `PADRÃO · BLACK CYBER`
(fundo `#000000`, superfície `#06100C`, destaque `#00E88A`, texto `#E6F5EE`).
Silenciosa quando `theme` não tem `background` (harness sem objeto completo).
O modelo pode ignorar a paleta quando o pedido pedir outra atmosfera.

---

## 10. `maxTokens: 65535` E ORÇAMENTO DE SESSÃO 1M

- `maxTokens: 0` fazia o provedor usar default (4K–8K) e truncava jogos (~25 KB).
- **Padrão:** `65535` (`prefs.js`). **NUNCA voltar para 0.**
- `SESSION_TOKEN_BUDGET = 1000000` (`prefs.js`).

```bash
grep 'maxTokens' web/js/prefs.js   # deve mostrar 65535
```

---

## 11. TIMEOUTS — 60 s / 120 s / 300 s

| Fase | Valor | Constante |
|---|---|---|
| Conexão | **60 s** | `CONNECT_TIMEOUT_MS` |
| Leitura do stream (sem bytes) | **120 s** | `CHAT_READ_TIMEOUT_MS` |
| Fallback não-streaming | **300 s** | `CHAT_TEXT_TIMEOUT_MS` |
| Lista de modelos | 60 s | `MODELS_READ_TIMEOUT_MS` |

Motivo: `deepseek-v4.1-flash` pode levar 30–60 s de prefill. **Nunca reduzir sem testar**
com prompt completo. `BrokenPipeError`/`ConnectionResetError` são tratados em `serve.py`.

---

## 12. `back1.jpg` — POLÍTICA

| Contexto | Uso |
|---|---|
| Jogo 3D | **NUNCA** (céu + fog + environment) |
| Jogo 2D | **Opcional**, só em 2D chapado; nada por cima (sem vinheta/scanline/grid) |
| Desenho/objeto | Padrão (`center/cover no-repeat`), quando combinar com o pedido |
| Página salva | Mídia embutida em `assets/images` (não base64 no HTML) |

Arquivo mantido em `imagens/back1.jpg` com **124.961 B** (1920×1080). Não recolocar arquivo gigante.

---

## 13. INÍCIO IMEDIATO + PRIMEIRO FRAME SÍNCRONO

- Proibido tela de apresentação, título, instruções, menu inicial ou botão "Iniciar".
- Proibido gate `if(!started)`, clique/tecla obrigatória ou `setTimeout` de espera.
- `draw()`/`renderer.render()` chamado **uma vez antes** do rAF.
- Sempre existe objeto ativo (jogador/peça/nave/cubo) desde o boot.
- Se o viewport medir 0, esperar e redesenhar.

---

## 14. SEGURANÇA E SALVAMENTO (v3.0.x)

- Iframe com `sandbox="allow-scripts"` (origem opaca); bridge por `postMessage` com whitelist
  e checagem de `e.source`.
- Electron: `contextIsolation`, `sandbox`, `nodeIntegration:false`.
- **API de saves** (`/_api/saves/<nome>`): nomes validados, sem `..`, sem nomes reservados,
  symlinks rejeitados, destino contido em `salvos/`. Rotas: ler, salvar, excluir, renomear,
  duplicar, listar backups e restaurar.
- **Assets:** máximo **6 MB por arquivo** e **20 MB por projeto**; validados antes da escrita;
  reorganizados em `assets/images`, `assets/sounds` ou `assets/generated`.
- **Proxy `/_proxy` anti-SSRF:** DNS resolvido e fixado no socket, endereços validados,
  redirecionamentos revalidados (máx. **4**). Loopback é permitido **de propósito** para
  LLMs locais.
- O harness de testes é **somente leitura** por padrão; operações de escrita são manuais.

---

## 15. VERIFICAÇÃO PÓS-MANUTENÇÃO

Sempre que editar `html-builder.js`, `prefs.js`, `ai-client.js`, `library-selector.js`,
`serve.py` ou `desktop/server.js`, rodar:

```bash
cd "/home/leo/Documents/Obsidian Vault/01_Projeto/nexus-game"

# 1. Sintaxe JS + Python
(cd web/js && for f in *.js; do node --check "$f" || echo "FALHOU: $f"; done)
python3 -m py_compile serve.py
node --check desktop/server.js && node --check desktop/main.js

# 2. baseCss sem background
grep -n 'html,body.*background' web/js/html-builder.js   # vazio

# 3. maxTokens e orçamento
grep -n 'maxTokens\|SESSION_TOKEN_BUDGET' web/js/prefs.js

# 4. Sete regras + REGRA 6 canônica
node -e "
var c={window:{},document:{documentElement:{setAttribute:function(){}}},console:console};
var vm=require('vm'),fs=require('fs');
['themes','prefs','library-selector','html-builder'].forEach(function(f){
  vm.runInNewContext(fs.readFileSync('web/js/'+f+'.js','utf8'),c);
});
var H=c.window.Html,T=c.window.Themes;
var p=H.systemPrompt(T.of(0),1,'teste');
var ok=true;
for(var i=1;i<=7;i++){ if(p.indexOf('REGRA '+i)===-1){ok=false;console.log('FALTA REGRA '+i);} }
if(p.indexOf('REGRA 6 — JOGO EM TELA CHEIA, BARRA 15px')===-1){ok=false;console.log('REGRA 6 errada');}
if(/BARRAS 5px|CONTROLES LATERAIS|moldura metálica/i.test(p)){ok=false;console.log('layout antigo no prompt');}
console.log(ok?'PASS 7 REGRAS':'FAIL');
console.log('chars:',p.length);
"

# 5. lint 1 arg, sem BASE_PROMPT, sem modos
node -e "
var c={window:{},document:{documentElement:{setAttribute:function(){}}},console:console};
var vm=require('vm'),fs=require('fs');
['themes','prefs','library-selector','html-builder'].forEach(function(f){
  vm.runInNewContext(fs.readFileSync('web/js/'+f+'.js','utf8'),c);
});
var H=c.window.Html;
console.log('lint.length:',H.lint.length);          // 1
console.log('BASE_PROMPT:',typeof H.BASE_PROMPT);   // undefined
console.log('detectMode:',typeof H.detectMode);     // undefined
"

# 6. Contagens (22 / 28 / 7 / 24)
node -e "
var c={window:{},document:{documentElement:{setAttribute:function(){}}},console:console};
var vm=require('vm'),fs=require('fs');
['nx-materials','nx-shaders','library-selector'].forEach(function(f){
  vm.runInNewContext(fs.readFileSync('web/js/'+f+'.js','utf8'),c);
});
console.log('NxMat',c.window.NxMat.names().length,'NxShader',c.window.NxShader.names().length,'chunks',c.window.NxShader.chunks().length,'libs',Object.keys(c.window.LibrarySelector.LIBRARIES).length);
"

# 7. Resíduos proibidos
grep -rn "NxTex\|BARRAS 5px\|CONTROLES LATERAIS\|2\.15\.1\|2\.14\.0" web/js README.md docs/*.md | head
```

**Harness no navegador:** abrir `web/test-harness.html` com o servidor (`serve.py` ou Electron);
os testes cobrem módulos, DIRECTIVE (1–7), NxMat/NxShader/NxLoad, LibrarySelector e lint.

---

## 16. NÚMEROS DE REFERÊNCIA (v3.0.1, medidos em 2026-10-24)

| Item | Valor |
|---|---|
| `html-builder.js` | **917 linhas** |
| `app.js` | **2.113 linhas** |
| `library-selector.js` | **658 linhas** |
| `nx-materials.js` | **730 linhas** |
| `nx-shaders.js` | **868 linhas** |
| `nx-loaders.js` | **188 linhas** |
| `ai-client.js` | **490 linhas** |
| `store.js` | **337 linhas** |
| `vu-meter.js` | **201 linhas** |
| `serve.py` | **867 linhas** |
| `desktop/server.js` | **1.039 linhas** |
| `desktop/main.js` | **141 linhas** |
| `DIRECTIVE` | **13.256 chars** (146 linhas) |
| `systemPrompt` (detail 1) | **≈14.377 chars** |
| Regras | **7** |
| `NxMat` | **22 materiais** |
| `NxShader` | **28 shaders + 7 chunks** |
| Bibliotecas | **24** (20 locais/nativos + 4 CDN) |
| Tema | **1** (`PADRÃO · BLACK CYBER`) |
| VU meter | **20 barras** |
| `maxTokens` | **65.535** |
| Orçamento de sessão | **1.000.000** |
| Timeouts | **60 / 120 / 300 s** |
| Versão | **3.0.1** |

---

*Fim das regras definitivas. Qualquer edição que viole estas regras é regressão.*

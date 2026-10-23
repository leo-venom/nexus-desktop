# 🔴 REGRAS DEFINITIVAS — NEXUS GAME (v2.14.0+)

**Data:** 2026-10-22  
**Autor:** Hermes (após refatoração arquitetura unificada — ordem do Leo, 2026-10-21)  
**Propósito:** Documentar causas raiz, correções e regras que NUNCA podem ser alteradas.

---

## 0. ARQUITETURA UNIFICADA — SEM MODOS

### Regra fundamental (ordem do Leo, 2026-10-21)
**Não existem mais modos** (jogo / desenho / objeto / chat). O modelo decide o que a página é.
Restam **QUATRO regras** imutáveis:
1. **Enquadrar tudo na tela, em qualquer resolução** (320×480 → 2560×1080).
2. **Desempenho máximo em three.js** (1 cena/renderer/rAF, 1 luz c/ sombra, ≤60 draw calls, ~80k tri, ~300 partículas, FPS adaptativo silencioso).
3. **Iluminação bonita** (IBL via PMREMGenerator, 3 pontos key/fill/rim, PBR coerente, gradiente de fundo, emissive pulsante).
4. **Texturas e sons somente sob pedido** (pack `window.NxTex` 44 texturas + `fuzzyMatch`; som só com gesto, sem autoplay).

**Consequências implementadas (v2.14.0):**
- `GAME_DIRECTIVE`, `DRAWING_DIRECTIVE`, `CHAT_DIRECTIVE`, `TEXTURE_OFF_DIRECTIVE` **REMOVIDOS**.
- `detectMode`, `wantsTextures`, `gameScopeNote`, `drawingScopeNote`, `chatScopeNote`, `gameLightingNote`,
  `isGameCommand`, `isDrawingCommand`, `isChatCommand` **REMOVIDOS**.
- `html-builder.js`: **1.401 → 757 linhas**.
- `systemPrompt(theme, detailLevel, command, doc, media)` virou **módulo único**:
  ```js
  return DIRECTIVE + paletaRef(theme) + detailDirective(level) + mediaBlock(media);
  ```
- `Html.lint(html)` — **1 argumento** (sem `mode`); checagens só gerais: truncado, addon/CDN three, stub.
- `repararQualidade` guarda só `editing`.

---

## 1. FUNDO — `baseCss()` NUNCA PODE TER `background`

### Causa raiz
`html-builder.js` → `baseCss()`:

```js
// ANTES (PROBLEMA):
'html,body{margin:0;padding:0;background:var(--nx-bg);color:var(--nx-text);overscroll-behavior:none}'
```

Sobrescrevia o `background` que o modelo colocava no `body` (ex.: `background:url('imagens/back1.jpg')`).
Como o `<style id="nx77-base">` era injetado DEPOIS do CSS do modelo, e ambos tinham a mesma especificidade (`html,body{...}`),
**o último vencia** → o fundo preto `#000000` (BLACK CYBER) engolia o `back1.jpg`.

### Correção (definitiva)
```js
// DEPOIS (CORRETO — setembro 2026):
'html,body{margin:0;padding:0;overscroll-behavior:none}'
```

- `background` removido de `html,body` — o modelo define o próprio fundo
- `::selection{background:var(--nx-accent-soft)}` permanece (realce de texto)
- `color:var(--nx-text)` também removido — modelo define a própria cor de texto

### Verificação
```bash
grep -n 'html,body.*background' web/js/html-builder.js
# Deve retornar vazio
```

### Regra permanente
`baseCss()` só pode ter: `margin:0;padding:0;overscroll-behavior:none`.  
**NUNCA adicionar `background` de volta.**  
`varsCss()` (que define `--nx-bg`, `--nx-surface`, etc.) está correto — só cria variáveis, não aplica a nenhum seletor.

---

## 2. ENQUADRAMENTO — REGRA 1 DO DIRECTIVE (IMUTÁVEL)

### Texto canônico (extraído do `DIRECTIVE` em `html-builder.js`)
```
REGRA 1 — ENQUADRAMENTO: TUDO NA TELA, EM QUALQUER TELA

A página deve preencher exatamente a janela do usuário, sem corte, sem sobra, sem barra de rolagem — de celular vertical a monitor ultrawide. Você não sabe a resolução em que vai rodar: componha em unidades relativas e reaja a mudanças.

- html, body { margin:0; padding:0; height:100%; overflow:hidden; }
- Raiz da cena: position:fixed; inset:0; width:100vw; height:100vh; height:100dvh (declare 100vh antes de 100dvh como fallback).
- Nenhuma dimensão de composição em px fixo: use %, vw/vh, vmin/vmax, fr, aspect-ratio, clamp(), min(), max(). px só para detalhes finos (bordas, raios, ícones).
- Escute resize, orientationchange e ResizeObserver no container; recalcule tudo a cada mudança.
- 3D: renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5)); renderer.setSize(W, H, false); camera.aspect = W / H; camera.updateProjectionMatrix(). Se o enquadramento depende do aspecto, reenquadre por FOV ou por distância da câmera em vez de deixar cortar.
- 2D (canvas): dimensione o buffer pelo dpr e desenhe com ctx.setTransform(dpr, 0, 0, dpr, 0, 0), em coordenadas CSS.
- O conteúdo deve caber sem cortar em 320x480 e continuar bonito em 2560x1080: use vmin/clamp na tipografia e grids que colapsam.
- Respeite a área segura: env(safe-area-inset-top/right/bottom/left).
- Alvos de toque com no mínimo 44x44 px de área clicável.
- Nada de overflow:auto na raiz; se precisar rolar, role um painel interno, nunca a página.
- Mouse não existe no celular: todo controle essencial precisa de alternativa por toque.
```

### Verificação automática (no `lint`)
```js
// Checagem 1 — resposta truncada
if (low.indexOf('</html>') < 0) { out.push({code:'truncated', ...}) }

// Checagem 2 — addons/ES modules proibidos
var addon = low.match(/orbitcontrols|gltfloader|effectcomposer|roomenvironment|contactshadows|rgbelloader|importmap|type\s*=\s*["']?module/);

// Checagem 3 — three.js de CDN
var cdn = s.match(/<script[^>]*src\s*=\s*["'](https?:\/\/[^"']*three[^"']*)["']/i);

// Checagem 4 — placeholder (TODO/FIXME/lorem)
var stub = s.match(/(TODO|FIXME|XXX)/) || low.match(/lorem ipsum|not implemented|implementação pendente/);
```

---

## 3. DESEMPENHO — REGRA 2 DO DIRECTIVE (IMUTÁVEL)

### Texto canônico
```
REGRA 2 — DESEMPENHO MÁXIMO (three.js)

O alvo é rodar liso em hardware modesto (2 núcleos, GPU integrada). O orçamento é lei.

- 1 cena / 1 renderer / 1 rAF / 1 AudioContext.
- renderer: {antialias:true, powerPreference:'high-performance', alpha:false, stencil:false, depth:true}.
- SRGBColorSpace + ACESFilmicToneMapping (exposure 1.0–1.15).
- PCFSoftShadowMap, **1 luz com sombra**, mapSize 1024, bias -0.0005, normalBias 0.02, frustum justo.
- dt = min(clock.getDelta(), 0.25) + acumulador 1/60 (step fixo).
- ZERO alocação no loop de render.
- Geometria/material COMPARTILHADOS. InstancedMesh + setMatrixAt, matrixAutoUpdate=false.
- ≤ 60 draw calls / ~80k triângulos / ~300 partículas.
- PROIBIDO post-processing (bloom, SSAO, DOF).
- CanvasTexture ≤ 256 px, anisotropy 4.
- Sem transmission / MeshPhysicalMaterial pesado.
- FPS adaptativo silencioso (média 2 s; <50 → DPR 1/metade das partículas/sombras off; >58 restaura; sem HUD).
- visibilitychange para o loop e zera clock.
- dispose() ao reconstruir (geometrias, materiais, texturas, render targets).
- Regra equivalente para páginas 2D (canvas: um buffer, drawImage offscreen, sem blur/shadow por frame).
```

### Verificação
- `Html.lint` **não checa mais loop/resize/textwall** (eram específicos de modo jogo).
- O cumprimento é responsabilidade do modelo via `DIRECTIVE`.

---

## 4. ILUMINAÇÃO — REGRA 3 DO DIRECTIVE (IMUTÁVEL)

### Texto canônico
```
REGRA 3 — ILUMINAÇÃO BONITA

IBL via PMREMGenerator.fromScene(miniCena, 0.04) → scene.environment (descartar pmrem).
3 pontos: key 1.2–2.0 c/ sombra, fill frio 0.25–0.7, rim/back 0.6–1.2.
PBR coerente (pedra .8/0, metal .25/.9, plástico .45/0), nunca material branco padrão.
Fundo em gradiente, nunca preto/branco puro.
scene.fog na cor do fundo.
Emissive pulsando 0.6–1.4.
Sombra de contato: CanvasTexture radial em multiply.
Ajustar exposição antes de aumentar luz.
2D: luz direcional + vinheta.
```

---

## 5. TEXTURAS E SONS — REGRA 4 DO DIRECTIVE (IMUTÁVEL)

### Texto canônico
```
REGRA 4 — TEXTURAS E SÓS SÓ SOB PEDIDO

Sem pedido → PROIBIDO window.NxTex, createPattern, THREE.CanvasTexture, gerador de ruído, AudioContext.
Com pedido → pack local window.NxTex (NxTex.three(nome,rx,ry), NxTex.css(nome), NxTex.canvas(nome), NxTex.fuzzyMatch(termo)).
Nomes: concreto, madeira, marmore, tijolo, metal, grama, terra, areia, pedra, tecido, papel, asfalto, agua, nuvem, fogo, musgo, ferrugem, ouro, carbono, xadrez, listras, grade, ruido, gradiente.
Pack injetado pelo app quando o HTML cita NxTex / createPattern / CanvasTexture.

Som só com gesto (AudioContext no 1º click/keydown/pointerdown, nunca autoplay, preferir oscilador/ruído).
NUNCA base64.
```

### Implementação
- `decorate()` injeta `<script src="js/nx-textures.js">` quando o HTML gerado cita `NxTex`/`createPattern`/`CanvasTexture`.
- `app.js` inlina o pack no `Salvar`.
- `mediaBlock(media)` passa mídia do projeto (imagens/sons) se houver.

---

## 6. PALETA — REFERÊNCIA, NÃO OBRIGAÇÃO

`systemPrompt` chama `paletaRef(theme)`:
```js
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
```
- Silenciosa quando `theme` não tem `background` (harness roda sem objeto completo).
- **Não é regra** — o modelo pode ignorar.

---

## 7. `maxTokens: 65535` (era 0)

### Causa raiz
`maxTokens: 0` não enviava `max_tokens` → provedor usa default (4K-8K). Jogo Tetris ~25 KB (~6.5K tokens) era cortado.

### Correção
`prefs.js` default = `maxTokens: 65535`.  
**NUNCA voltar para 0.**

---

## 8. TIMEOUTS: CONNECT=60s, READ=120s

### Causa raiz
`CONNECT_TIMEOUT_MS=20000` insuficiente para `deepseek-v4.1-flash` (prefill 30-60s).
`CHAT_READ_TIMEOUT_MS=90000` → 120000.

### serve.py — BrokenPipeError
```python
except (BrokenPipeError, ConnectionResetError):
    return  # cliente já desconectou
```

### Regra permanente
Timeouts mínimos: CONNECT=60000, READ=120000.  
NUNCA reduzir sem testar com deepseek-v4.1-flash + prompt completo.

---

## 9. `back1.jpg` — POLÍTICA DEFINITIVA

| Modo / Contexto       | `back1.jpg`           |
|-----------------------|------------------------|
| Jogo 3D               | **NUNCA** (cena é o fundo: céu + fog + environment) |
| Jogo 2D               | **OPCIONAL** — só em 2D chapado cujo cenário combine; **nada por cima** (sem vinheta, scanline, grid, glow) |
| Desenho/Objeto        | **PADRÃO** (`center/cover no-repeat`), objeto centralizado por cima; troca quando pedido pede outro fundo |
| Página salva (`Salvar`) | `inlineMedia()` embute como base64 (limites: 6 MB/arquivo, 20 MB total) |

**Arquivo:** `imagens/back1.jpg` mantido em **≤ 200 KB (1920×1080)**.  
**NUNCA** recolocar arquivo gigante.  
**NUNCA** voltar `background` para `baseCss()` (Regra 1).

---

## 10. HUD EM BOLHAS NAS LATERAIS (quando houver HUD)

- Bolhas/pílulas arredondadas (border-radius 12-20px).
- Fundo semi-transparente (rgba do fundo, 55-75%), borda fina na cor de destaque, glow.
- Largura MÁXIMA 100px, encostada na borda com 10px de margem.
- Empilhadas verticalmente com 8-10px de espaço.
- Fonte pequena (10-13px), número grande em destaque.
- NADA no centro sobre o jogo.
- Canvas ocupa 100% da tela por trás, de borda a borda.

---

## 11. INÍCIO IMEDIATO + PRIMEIRO FRAME SÍNCRONO

- PROIBIDO tela de apresentação, título, instruções, menu inicial, botão "Iniciar".
- PROIBIDO gates: `if(!started)`, clique, tecla, setTimeout de espera.
- `draw()/renderer.render()` chamado UMA vez ANTES do rAF.
- `SEMPRE exista um objeto ativo` (jogador/peça/nave/cubo) desde o boot.
- Se viewport medir 0, esperar e redesenhar.

---

## 12. SÓ O QUE FOI PEDIDO + REPROVA + CHECK FINAL

Equivalentes no `DIRECTIVE`:
- **REGRA 1** — enquadramento (nada além do que foi pedido na composição raiz).
- **REGRA 2** — orçamento (protótipo, placeholder, sem som/menu ou texto no lugar do jogo reprova).
- **CONTRATO DE SAÍDA** — "ENTREGUE APENAS O HTML."

---

## Checklist de verificação pós-manutenção

Sempre que editar `html-builder.js`, `prefs.js`, `ai-client.js`, `serve.py`, rodar:

```bash
# 1. Sintaxe
cd /home/leo/Documents/Obsidian Vault/01_Projeto/nexus-game/web/js && node --check html-builder.js && node --check prefs.js && node --check ai-client.js
cd /home/leo/Documents/Obsidian Vault/01_Projeto/nexus-game && python3 -m py_compile serve.py

# 2. baseCss() sem background
grep -n 'html,body.*background' web/js/html-builder.js
# Deve retornar vazio

# 3. maxTokens > 0
grep 'maxTokens' web/js/prefs.js
# Deve mostrar 65535

# 4. DIRECTIVE contém as 4 regras
node -e "
var c={window:{}};var vm=require('vm'),fs=require('fs');
vm.runInNewContext(fs.readFileSync('web/js/themes.js','utf8')+'\n'+fs.readFileSync('web/js/html-builder.js','utf8'),c);
var H=c.window.Html, T=c.window.Themes;
var p=H.systemPrompt(T.of(0),1,'teste');
var ok=p.indexOf('REGRA 1')>=0 && p.indexOf('REGRA 2')>=0 && p.indexOf('REGRA 3')>=0 && p.indexOf('REGRA 4')>=0;
console.log(ok?'PASS DIRECTIVE 4 REGRAS':'FAIL');
console.log('chars:', p.length);
"

# 5. lint tem 1 arg e sem mode
node -e "
var c={window:{}};var vm=require('vm'),fs=require('fs');
vm.runInNewContext(fs.readFileSync('web/js/themes.js','utf8')+'\n'+fs.readFileSync('web/js/html-builder.js','utf8'),c);
var H=c.window.Html;
console.log('lint.length:', H.lint.length); // deve ser 1
"

# 6. Modos removidos (detectMode não existe)
node -e "
var c={window:{}};var vm=require('vm'),fs=require('fs');
vm.runInNewContext(fs.readFileSync('web/js/themes.js','utf8')+'\n'+fs.readFileSync('web/js/html-builder.js','utf8'),c);
var H=c.window.Html;
console.log('detectMode:', typeof H.detectMode); // deve ser undefined
console.log('GAME_DIRECTIVE:', typeof H.GAME_DIRECTIVE); // undefined
console.log('DIRECTIVE:', typeof H.DIRECTIVE); // string
"
```

---

## 13. NÚMEROS DE REFERÊNCIA (v2.14.0)

| Item | Valor |
|---|---|
| `html-builder.js` | **757 linhas** (era 1.401) |
| `app.js` | **1.915 linhas** |
| `DIRECTIVE` | ~8.9 KB (string) |
| `systemPrompt` (com tema + detail 1) | ~8.9 KB |
| Texturas `NxTex` | **44** |
| Sons WebAudio | **trilha elaborada 4 camadas + 13 efeitos** (no Directive) |
| Tema | **1** — `PADRÃO · BLACK CYBER` |
| `maxTokens` default | **65535** |
| Commits base | 22 → HEAD `d5e5a0f` |

---

## 14. TODO JOGO NASCE COM SONS FUTURISTAS — REGRA 5 DO DIRECTIVE (Leo, 2026-10-22)

**Texto canônico:** `web/js/html-builder.js`, bloco `REGRA 5 — TODO JOGO NASCE COM SONS FUTURISTAS`.

### Regra permanente

- Quando a página é **jogo** (2D/3D, qualquer gênero), o áudio **não é opcional** e não espera
  pedido: trilha ELABORADA em camadas (master 0.15–0.3) + efeitos nos eventos (tiro, explosão, pulo,
  coleta/power-up, colisão, level up, game over).
- Estilo **futurista/cyber**, WebAudio puro (osciladores + ruído filtrado, envelopes rápidos,
  delay/reverb curto). Proibido arquivo de áudio ou base64.
- **Receitas novas (Leo, 2026-10-22):** as receitas antigas foram REMOVIDAS. Trilha = 4 camadas
  (baixo saw com envelope de filtro · arp square com delay · pad detuned com LFO · bateria
  sintetizada) em scheduler de 16 passos, harmonia menor (i–VI–III–VII), BPM 90–120. Efeitos
  ricos: FM (moeda), tape-stop (game over), ring inarmônico (impacto), WaveShaper (explosão),
  shimmer (power-up). Texto canônico no bloco `RECEITA DE MÚSICA`/`RECEITAS DE EFEITOS` da REGRA 5.
- A Regra 4 ("texturas e sons somente sob pedido") segue **intacta para páginas não-jogo**.
- AudioContext no primeiro gesto (click/keydown/pointerdown), nunca autoplay; volume master com
  mute (tecla M ou bolha discreta no HUD lateral); sem custo de fps (Regra 2).

### Verificação

Renderizar o system prompt e conferir que `REGRA 5 — TODO JOGO NASCE COM SONS FUTURISTAS`
está presente; gerar um jogo sem pedir som e verificar `AudioContext`/efeitos no documento.

---

## 15. LAYOUT DE JOGO — TELA CENTRAL + CONTROLES LATERAIS + MOLDURA 2px (Leo, 2026-10-22) — REGRA 6 DO DIRECTIVE

**Texto canônico:** `web/js/html-builder.js`, bloco `REGRA 6 — LAYOUT DE JOGO: TELA DO JOGO É A ESTRELA`.

### Regra permanente (prioridade máxima = área e qualidade do jogo)

- **Tela do jogo no centro, maior espaço possível:** a área de jogo usa toda a altura útil da
  janela (100dvh menos safe-area) e a maior largura que sobrar depois das laterais. Proibido
  encolher o jogo para caber título, painel ou card — o que se reduz é o controle lateral,
  **nunca** a área de jogo.
- **Textos e botões só nas laterais:** colunas encostadas nas bordas esquerda/direita, cada item
  com **largura máx. 150px**, respeitando a altura da tela (sem corte, sem rolagem). Bolhas de
  HUD continuam em **100px máx** (§10). Nada de texto/botão por cima do jogo.
- **Moldura metálica 2px** na área de jogo (gradiente prata/ouro escovado, border-image ou
  gradiente fino). Só isso: proibido painel grosso, bezel, frame, sombra pesada ou dupla borda.
  **Sobrepõe §10** no ponto "canvas de borda a borda / sem moldura": em jogo agora há a moldura 2px.
- **NUNCA criar camada de fundo `background`:** proibido div/camada/overlay pintada por trás ou
  por cima da área de jogo. O jogo desenha a própria cena (`back1.jpg` só como base opcional em
  2D chapado — §9). O que se vê é apenas: cena do jogo + moldura 2px + controles laterais.
- **Sempre som bonito** (obrigatório, REGRA 5/§14): trilha em loop sutil + efeitos nos eventos.
  Jogo sem som bonito não é entrega.
- **Qualidade máxima** é a métrica final: acabamento de estúdio dentro da área de jogo
  (materiais, luz, animação, resposta de input) sem abrir mão da REGRA 2 (desempenho).

### Verificação

Renderizar o system prompt e conferir que `REGRA 6 — LAYOUT DE JOGO` está presente; gerar um jogo
e verificar: área de jogo central e dominante, controles laterais ≤150px, borda 2px metálica,
nenhuma camada de fundo extra e áudio presente.

---

*Fim das regras definitivas. Qualquer edição no código que viole estas regras é regressão.*

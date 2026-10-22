# 🔴 REGRAS DEFINITIVAS — NEXUS GAME

**Data:** 2026-10-21  
**Autor:** Hermes (após análise e correção de regressões)  
**Propósito:** Documentar causas raiz, correções e regras que NUNCA podem ser alteradas.

---

## 1. FUNDO — `baseCss()` NUNCA PODE TER `background`

### Causa raiz
`html-builder.js` → `baseCss()` linha 1026:

```js
// ANTES (PROBLEMA):
'html,body{margin:0;padding:0;background:var(--nx-bg);color:var(--nx-text);overscroll-behavior:none}'
```

Isso sobrescrevia o `background` que o modelo colocava no `body` (ex.: `background:url('imagens/back1.jpg')`).  
Como o `<style id="nx77-base">` era injetado DEPOIS do CSS do modelo, e ambos tinham a mesma especificidade (`html,body{...}`),
**o último vencia** → o fundo preto `#000000` (BLACK CYBER) engolia o `back1.jpg`.

O modelo então "via" a tela preta e desenhava gradiente, cor sólida ou partículas POR CIMA,
pensando que estava preenchendo um fundo vazio — quando na verdade estava criando uma
**camada extra** sobre o `back1.jpg` que já existia mas estava invisível.

### Correção (definitiva)
```js
// DEPOIS (CORRETO — setembro 2026):
'html,body{margin:0;padding:0;overscroll-behavior:none}'
```

- `background` removido de `html,body` — o modelo define o próprio fundo
- `::selection{background:var(--nx-accent-soft)}` permanece (realce de texto, não afeta fundo)
- `color:var(--nx-text)` também removido — modelo define a própria cor de texto

### Verificação
```bash
grep -n 'html,body.*background' web/js/html-builder.js
# Deve retornar vazio (nenhuma linha)
```

### Regra permanente
`baseCss()` só pode ter: `margin:0;padding:0;overscroll-behavior:none`.  
**NUNCA adicionar `background` de volta.**  
`varsCss()` (que define `--nx-bg`, `--nx-surface`, etc.) está correto — só cria variáveis,
não aplica a nenhum seletor.

---

## 2. FUNDO — QUEM DESENHA A TELA (GAME_DIRECTIVE / DRAWING_DIRECTIVE)

### O problema
Duas tentativas anteriores falharam em extremos opostos:

1. **Sem regra no prompt** (só a correção do `baseCss()`) → o modelo inventava fundo
   (azul escuro `#0a1a2e`, gradiente, partículas, grid) e ignorava a pasta `imagens/`.
2. **`back1.jpg` obrigatório em todo jogo** → foto atrás de cena 3D (efeito colagem),
   fundo chapado em jogo 2D que precisava de parallax, e cada página salva carregava
   ~3,9 MB de base64 (a foto tinha 2,96 MB).

### Política atual (v2.13.0) — `GAME_DIRECTIVE`, seção `2) FUNDO — O JOGO É A TELA`
- **Jogo 3D:** o fundo é a própria cena (cor de céu + `fog` + `scene.environment`).
  **NUNCA** foto atrás do 3D.
- **Jogo 2D:** o fundo é desenhado pelo jogo (gradiente de céu, parallax, tiles,
  profundidade). Nada de foto por padrão.
- **`imagens/back1.jpg` é OPCIONAL:** só em jogo 2D chapado cujo cenário combine com a
  foto — e então **nada por cima** (sem vinheta, scanline, grid, gradiente ou glow).
  Se o pedido pedir outro fundo, obedeça o pedido.
- **Desenho/objeto (`DRAWING_DIRECTIVE`):** `back1.jpg` continua sendo o fundo **padrão**
  (`center/cover`, sem repetição), com o objeto centralizado por cima; troca-se quando o
  pedido pede outro fundo.
- Proibida qualquer camada decorativa entre o fundo e o jogo.

### Arquivo
`imagens/back1.jpg` foi reduzido de **7640×4585 / 2,96 MB** para **1920×1080 / 122 KB**
(`-resize 1920x1080^ -extent -quality 82 -strip`). Motivo: `inlineMedia()` embute a
imagem em base64 nas páginas salvas (limites 6 MB/arquivo, 20 MB no total) — 2,96 MB
viravam ~3,9 MB de base64 por save.

### Regra permanente
- `back1.jpg` **nunca** é obrigatório em jogo (nem 3D, nem 2D com cenário próprio).
- O CSS exato de fundo com a foto só existe no modo desenho (`center/cover no-repeat`).
- Não recolocar o arquivo gigante: manter **≤ 200 KB (1920×1080)**.
- Não voltar `background` para `baseCss()` (ver Regra 1).

---

## 3. `maxTokens: 65535` (era 0)

### Causa raiz
`maxTokens: 0` no `prefs.js` significava que o parâmetro `max_tokens` NÃO era enviado
no body da requisição. Cada provedor/gateway tem seu limite padrão (normalmente 4K-8K tokens).
Um jogo Tetris completo tem ~25KB (~6.5K tokens) — era cortado no meio, faltando `</html>`.

O mecanismo `completarSeTruncado()` em `app.js` tentava continuar, mas:
- Cada continuação pagava outro TTFT
- A emenda podia produzir tags quebradas (`</scr\nipt>`)
- O modelo perdia contexto do que já tinha escrito

### Correção
`maxTokens: 65535` → enviado como `max_tokens: 65535` na requisição.  
Isso dá ao modelo espaço de sobra para jogos de 50-100KB.

### Regra permanente
Default em `prefs.js` = `maxTokens: 65535`.  
NUNCA voltar para `0`.  
Se o usuário quiser mudar nas configurações ⚙, o campo aceita qualquer valor.

---

## 4. Timeouts: CONNECT=60s, READ=120s

### Causa raiz
`CONNECT_TIMEOUT_MS=20000` (20s) era insuficiente para `deepseek-v4.1-flash`
com o prompt de jogo de ~4600 tokens. O TTFT (time to first token) pode chegar a 30-60s
por causa do prefill.

Fluxo do erro:
1. Usuário envia prompt de jogo
2. App → serve.py → api.experientiallabs.ai
3. Deepseek processa o prefill de 4600 tokens (leva 30-60s)
4. **Browser: 20s CONNECT_TIMEOUT estoura** → AbortController.abort()
5. serve.py tenta escrever → BrokenPipeError → 502
6. App mostra "tempo esgotado ao conectar no provedor"

### Correção
```js
CONNECT_TIMEOUT_MS = 60000;    // 20s → 60s
CHAT_READ_TIMEOUT_MS = 120000; // 90s → 120s
```

### serve.py — BrokenPipeError
Adicionado tratamento para `BrokenPipeError` e `ConnectionResetError` no proxy:
```python
except (BrokenPipeError, ConnectionResetError):
    return  # cliente já desconectou (timeout/cancelamento)
```

### Regra permanente
Timeouts mínimos: CONNECT=60000, READ=120000.  
NUNCA reduzir sem testar com deepseek-v4.1-flash e prompt de jogo completo.

---

## 5. GAME_DIRECTIVE universal

O GAME_DIRECTIVE agora cobre **qualquer tipo de criação** em um único prompt:

| Tipo | O que o modelo entrega |
|------|----------------------|
| **JOGO TRADICIONAL** (plataforma, shooter, tetris, nave, puzzle, corrida, luta, rpg) | Níveis, inimigos com IA, power-ups, HUD em bolhas, áudio completo, game over, pausa, recorde |
| **OBJETO 3D / CENA / MONTAGEM** (cubo, esfera, planeta, escultura, paisagem 3D, composição) | Material configurado, iluminação, textura, rotação, sem HUD/texto |
| **SIMULAÇÃO / AMBIENTE / EXPERIÊNCIA** (partículas, fluido, fractal, física, playground) | Loop rAF com pool, interativo, sem HUD |
| **OUTRA CRIAÇÃO VISUAL** | Exatamente o que foi pedido |

### GAME_TERMS expandido
+40 termos criativos adicionados: cubo, esfera, cilindro, torus, cone, piramide, poliedro,
planeta, montagem, construção, cena, cenário, sandbox, playground, visualização, galeria,
interativo, simulação, física, gravidade, colorido, arco-íris, degradê, wallpaper,
fundo animado, generativo, procedural, fractal, padrão, fluido, fumaça, onda,
experiência, ambiente, atmosfera, caos, infinito, partícula, neon.

---

## 6. HUD EM BOLHAS NAS LATERAIS (jogos)

Regra que estava no GAME_DIRECTIVE original e foi restaurada após regressão:
- HUD em bolhas/pílulas arredondadas (border-radius 12-20px)
- Fundo semi-transparente (rgba do fundo, 55-75%), borda fina na cor de destaque, glow
- Largura MÁXIMA 100px, encostada na borda com 10px de margem
- Empilhadas verticalmente com 8-10px de espaço
- Fonte pequena (10-13px), número grande em destaque
- NADA no centro sobre o jogo
- Canvas ocupa 100% da tela por trás, de borda a borda

---

## 7. INÍCIO IMEDIATO + PRIMEIRO FRAME SÍNCRONO

Restaurado após regressão:
- PROIBIDO tela de apresentação, título, instruções, menu inicial, botão "Iniciar"
- PROIBIDO gates: `if(!started)`, clique, tecla, setTimeout de espera
- `draw()/renderer.render()` chamado UMA vez ANTES do rAF
- `SEMPRE exista um objeto ativo` (jogador/peça/nave/cubo) desde o boot
- Se viewport medir 0, esperar e redesenhar

---

## 8. SÓ O QUE FOI PEDIDO + REPROVA + CHECK FINAL

A proibição de elementos extras e a conferência final continuam no prompt, mas os blocos
antigos `NÃO FAÇA` / `VERIFIQUE` **não existem mais** na reescrita do `GAME_DIRECTIVE`
(0 ocorrências). O equivalente hoje:

- **`7) HUD E TEXTO`** — HUD enxuto, fonte do sistema, sem parágrafo de instrução na tela
  (nada além do que foi pedido)
- **`8) REPROVA (falha de entrega)`** — protótipo, placeholder, sem som/menu ou texto no
  lugar do jogo reprova
- **TAIL `CHECK FINAL`** — 6 perguntas de conferência + "ENTREGUE APENAS O HTML."

**Regra permanente:** qualquer edição no prompt precisa manter essas três âncoras
(`8) REPROVA`, `CHECK FINAL`, `ENTREGUE APENAS O HTML.`).

---

## Checklist de verificação pós-manutenção

Sempre que editar `html-builder.js`, `prefs.js`, `ai-client.js` ou `serve.py`, rodar:

```bash
# 1. Sintaxe
cd /nexus-game/web/js && node --check html-builder.js && node --check prefs.js && node --check ai-client.js
cd /nexus-game && python3 -m py_compile serve.py

# 2. baseCss() sem background
grep -n 'html,body.*background' web/js/html-builder.js
# Deve retornar vazio

# 3. maxTokens > 0
grep 'maxTokens' web/js/prefs.js
# Deve mostrar 65535

# 4. Política de FUNDO no prompt
node -e "
var c={window:{}};var vm=require('vm'),fs=require('fs');
vm.runInNewContext(fs.readFileSync('web/js/themes.js','utf8')+'\\n'+fs.readFileSync('web/js/html-builder.js','utf8'),c);
var H=c.window.Html, T=c.window.Themes;
var g=H.systemPrompt(T.of(0),1,'jogo de nave');
var d=H.systemPrompt(T.of(0),1,'paisagem');
var ok=g.indexOf('FUNDO — O JOGO É A TELA')>=0 && g.indexOf('back1.jpg')>=0 &&
       g.indexOf('OPCIONAL')>=0 && d.indexOf('FUNDO PADRÃO')>=0 && d.indexOf('back1.jpg')>=0;
console.log(ok?'PASS':'FAIL','FUNDO (jogo: cena + back1 opcional · desenho: back1 padrão)');
"

# 5. Todos os modos funcionam
node -e "
var c={window:{}};var vm=require('vm'),fs=require('fs');
vm.runInNewContext(fs.readFileSync('web/js/themes.js','utf8')+'\n'+fs.readFileSync('web/js/html-builder.js','utf8'),c);
['cubo 3d','jogo de nave','simulação','paisagem','oi'].forEach(function(x){
  console.log(c.window.Html.detectMode(x),x);
});
"

# 6. Âncoras do prompt de jogo (8 blocos + CHECK FINAL)
node -e "
var c={window:{}};var vm=require('vm'),fs=require('fs');
vm.runInNewContext(fs.readFileSync('web/js/themes.js','utf8')+'\n'+fs.readFileSync('web/js/html-builder.js','utf8'),c);
var H=c.window.Html, p=H.systemPrompt(c.window.Themes.of(0),1,'jogo de nave');
var must=['1) CONTRATO DE SAÍDA','2) FUNDO — O JOGO É A TELA','3) ESQUELETO OBRIGATÓRIO',
          '4) ACABAMENTO','5) REALISMO 3D EM GPU','6) ORÇAMENTO','7) HUD E TEXTO',
          '8) REPROVA','CHECK FINAL','ENTREGUE APENAS O HTML.'];
var falta=must.filter(function(m){return p.indexOf(m)<0;});
console.log(falta.length?'FAIL faltam: '+falta.join(' | '):'PASS âncoras ('+p.length+' chars)');
console.log(p.indexOf('@@NX_TEX')<0?'PASS sem vazamento':'FAIL vazou @@NX_TEX');
"
```
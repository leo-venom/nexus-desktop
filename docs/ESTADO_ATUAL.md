# ESTADO ATUAL — NEXUS GAME

**Versão:** 2.13.0 (working tree) · **HEAD:** `38faba1` · **Atualizado:** 2026-10-21
**Local:** `/home/leo/Documents/Obsidian Vault/01_Projeto/nexus-game/`
**Repositório:** `github.com/leo-venom/nexus-desktop`

---

## 1. O que é

Gerador de **jogos HTML, desenhos/objetos e respostas visuais** com IA. Um shell web (Electron ou navegador) conversa com
qualquer API compatível com OpenAI e renderiza o resultado em `<iframe>` isolado
(`sandbox="allow-scripts allow-pointer-lock allow-popups"`, origem opaca).

**3 modos automáticos:** o app detecta se o comando é jogo, desenho/objeto ou chat,
aplicando a diretriz correta com o mesmo padrão de qualidade visual.

**Tema único:** não existe mais seletor de temas. O shell usa `PADRÃO · BLACK CYBER`
(preto `#000000`, accent esmeralda `#00E88A`, detalhes rosa `#FF2D95` e azul `#00A3FF`).
Jogos/desenhos/objetos **não herdam** essa paleta: escolhem a própria ou a que o pedido citar.

**Prévia ao vivo:** durante a geração o documento parcial é renderizado no iframe a cada
~1,2 s (selo `⚡ prévia ao vivo`), então a imagem começa a aparecer em ~5-6 s em vez de só
no fim. O render final substitui a prévia.

| Modo | Gatilho | Diretriz |
|------|---------|----------|
| 🎮 **Jogo** | Termos de jogo (tetris, nave, plataforma, rpg...) | `GAME_DIRECTIVE` (16,6 KB) — 8-12 níveis, 3+ inimigos, áudio, texturas |
| 🎨 **Desenho/Objeto** | Termos de arte (desenho, logo, infográfico, objeto 3D, paisagem...) | `DRAWING_DIRECTIVE` — qualidade visual **leve e rápida**, acabamento por gradiente/stroke, composição |
| 💬 **Chat** | Saudações, perguntas curtas, fallback geral | `CHAT_DIRECTIVE` — HTML bonito, tipografia refinada, cards |

---

## 2. Números reais

| Item | Valor |
|---|---|
| Linhas de código | **~10.600** (JS 7.200 · CSS 721 · HTML 57 · Python 253 · Electron 524 · docs ~1.900) |
| `app.js` | **1.701** |
| `html-builder.js` | **~1.190** |
| `GAME_DIRECTIVE` | 16.653 chars |
| `DRAWING_DIRECTIVE` | ~14.000 chars |
| `CHAT_DIRECTIVE` | ~3.500 chars |
| Prompt de jogo (system completo) | **18.668 chars** com textura · **13.009** sem (bloco de textura é opt-in) + **~1.4 KB** mídia real |
| Texturas procedurais | **44** (`nx-textures.js`, 36.856 bytes) |
| Texturas procedurais | **44** (`nx-textures.js`, 36.856 bytes) |
| Sons WebAudio | **13** receitas |
| Temas | **30** — 20 escuros + 10 claros |
| Commits | 20 |

### 2.1 Mídia do projeto (novo em v2.9.3)

Pastas `imagens/` e `sons/` na raiz do projeto onde o usuário coloca backgrounds, texturas de
bloco, sprites, músicas e efeitos sonoros. A lista real de arquivos é servida em `/midia`,
`/imagens/` e `/sons/` (JSON + arquivos com CORS/CORP) e entra no system prompt via 5º
argumento de `systemPrompt` (função `mediaBlock`). A página gerada referencia os caminhos
relativos exatos (`imagens/fundo.jpg`, `sons/tiro.mp3`). No `Salvar`, `inlineMedia()`
embute as mídias usadas como data URI (limites: 6 MB/arquivo, 20 MB total).
Extensões suportadas: imagens — PNG, JPG, JPEG, WebP, GIF, SVG, AVIF, BMP; sons — MP3,
OGG, WAV, M4A, FLAC, Opus, AAC, WebM.
`LEIA-ME.txt` em ambas as pastas com instruções de uso.
Servidores `serve.py` e `desktop/server.js` replicam o comportamento de `/fontes/`.

---

## 3. Estrutura

```
nexus-game/
├── README.md                    168  instruções de uso
├── abrir.sh                      24  fallback: serve.py + xdg-open
├── NEXUS-GAME.desktop            10  atalho (Exec → desktop/start.sh)
├── serve.py                     253  proxy CORS + estático + /fontes/
├── fontes/                           Gameplay.ttf + LEIA-ME
├── imagens/                          backgrounds, texturas, sprites + LEIA-ME
├── sons/                             músicas, efeitos + LEIA-ME
├── desktop/
│   ├── main.js                  146  BrowserWindow, F11/F12, single-instance
│   ├── server.js                378  servidor Node (proxy + estático + /fontes/)
│   ├── start.sh                      verifica node_modules, --disable-gpu, exec Electron
│   ├── package.json / lock
│   └── icon.png
├── web/
│   ├── index.html                57  shell: header único + iframe
│   ├── css/app.css              721  tema via var(--nx-*), popover, modais
│   ├── vendor/three/                 three.min.js r160 + module
│   └── js/
│       ├── themes.js             54  tema único (ALL=[DEFAULT])
│       ├── prefs.js             152  localStorage["nexus77"] + tokens
│       ├── html-builder.js     1292  prompts, extração, edição tolerante, decoração
│       ├── ai-client.js         464  SSE + proxy/fallback + cancel + finishReason
│       ├── store.js             258  File System Access + IndexedDB
│       ├── vu-meter.js          161  canvas 5 barras / 5 ondas
│       ├── settings.js          228  modal config (API / geração)
│       ├── app.js              1884  fluxo principal + modo edição + bridge
│       └── nx-textures.js       904  44 texturas procedurais (window.NxTex)
└── docs/
    ├── ESTADO_ATUAL.md              este documento
    ├── GAME_MODE.md                 diretriz do modo jogo (gerada do código)
    ├── DOCUMENTACAO.md              arquitetura e APIs
    ├── MAPA_UI.md                   elemento de tela → arquivo:linha
    ├── CHANGELOG.md                 histórico v1.x → v2.9.3
    ├── VALIDACAO.md                 matriz de testes
    └── BASE_REUTILIZAVEL.md         receita para novos projetos
```

---

## 4. Fluxo de geração

```
prompt do usuário
   ↓
app.sendPrompt()                                  app.js
   ↓
Html.systemPrompt(tema, nível, comando, lastRendered, mediaManifest)
   ↓
AiClient.chat(...)                                ai-client.js — SSE
   ↓
   ├── proxy local /_proxy  (serve.py | desktop/server.js)  → resolve CORS
   └── fallback fetch direto
   ↓
truncamento? → completarSeTruncado()              loop até 12× até fechar </html>
   ↓
Html.extractDocument()                            limpa markdown, corta no <!doctype>
   ↓
render(themed(doc))                               tema + rewriteLibs + injectShim
   ↓
iframe.srcdoc  ──►  JOGO (origem opaca)
```

---

## 5. Modo jogo — o que o prompt exige

`systemPrompt()` monta o prompt **do zero** (sem `BASE_PROMPT`, sem `EDIT_FRIENDLY`, sem
`detailDirective`) e concatena, nesta ordem:

1. Intro + regras de saída (HTML puro, single-file, three.js via CDN global)
2. **`GAME_DIRECTIVE`** (16.651 chars)
3. `gameScopeNote()` — escopo completo otimizado para desempenho
4. `gameLightingNote()` — reforço de iluminação se o tema for escuro (WCAG < 0.2)
5. Paleta exata do tema + instrução de uso expansivo de cores

### Blocos do GAME_DIRECTIVE

| Bloco | Conteúdo |
|---|---|
| ENTREGA COMPLETA EM UMA RESPOSTA | jogo fechado em `</body></html>`, cortar cenário antes de cortar estrutura |
| TAMANHO | sem mínimo nem teto; cortar redundância, nunca funcionalidade |
| REGRAS DE TELA | 100vw × 100dvh, sem scroll, overlays fullscreen, **HUD nas laterais 60-80px** |
| MEDIÇÃO DEFENSIVA | `innerWidth` pode vir 0 no iframe → medir em rAF, remedir em resize/orientationchange/`setTimeout(300)` |
| FOCO NO JOGO | fundo ≤ 15% do frame; proibido cenário 3D elaborado, blur/shadow fullscreen |
| MÍNIMO | 8-12 níveis, 3+ inimigos com IA distinta, 2-3 power-ups, parallax, partículas com pool, música + SFX, screen shake, menu/pausa/game over, teclado + toque |
| COMO ENTREGAR | 8 passos (níveis como dados, áudio real, pool de partículas, parallax offscreen, transições, efeitos por ação, game over com stats, combos) |
| PACK `NxTex` | 44 texturas prontas + API + regra "chame, não reescreva" |
| TEXTURAS PROCESSUAIS (3D) | 12 receitas CanvasTexture com material/parâmetros |
| INFERÊNCIA AUTOMÁTICA | robô→metal, orgânico→pedra/terra/madeira, moeda→ouro, portal→lava… |
| ANIMAÇÃO DE TEXTURA | `texture.offset` / redesenho por frame + `needsUpdate` |
| TEXTURA EM JOGO 2D | obrigatório `createPattern` em cada peça/inimigo; proibido cor chapada |
| PRIMEIRO FRAME | campo + HUD + objeto ativo desenhados no boot, antes do rAF |
| REGRA DE 3D SIMPLES | cubo/esfera/planeta sempre com textura procedural |
| 13 SONS WEBAUDIO | receitas completas (frequências, envelopes, filtros) + arquitetura |
| DESEMPENHO — 60 FPS | um canvas/um loop, fundo offscreen, pool 40-60, sem blur animado, AABB, DPR cap 2, pausa em `visibilitychange` |
| NÃO FAÇA | protótipo, placeholder, 1 inimigo = "8 níveis", jogo sem som/menu |
| VERIFIQUE | checklist de 16 itens antes de entregar |

---

## 6. Pack de texturas — `window.NxTex`

44 texturas procedurais, injetadas em todo jogo via `<script src="js/nx-textures.js">`.

**Lista:** lava, metal, cromo, ouro, vidro, madeira, pedra, gelo, agua, grama, asfalto, grade,
nebulosa, areia, chocolate, neon, tijolo, marmore, couro, plasma, cristal, ferrugem, concreto,
holograma, obsidiana, basalto, ametista, rubi, safira, turquesa, cobre, bronze, titanio,
fibra_carbono, camuflagem, zebra, tigre, veludo, pergaminho, circuito, binario, aurora,
fogo_azul, pantano.

```js
NxTex.bloco(ctx, x, y, w, h, 'lava')      // textura + brilho topo + sombra base
ctx.fillStyle = NxTex.pattern(ctx, 'metal')
NxTex.canvas('pedra', 128)                 // 32/64/128/256
NxTex.css('nebulosa')                      // 'url(data:...)'
material.map = NxTex.three('lava')         // THREE.CanvasTexture
NxTex.mapear('textura de chocolate')       // → 'chocolate'
NxTex.names()                              // 44 nomes
```

**Mapeamento:** ~120 sinônimos PT/EN (`granada`→rubi, `pcb`→circuito, `matrix`→binario,
`lava`→lava). Fallback: `pedra`. Nunca cor lisa.
**Cache:** `nome@tamanho`, desenhada uma vez, reutilizada.

---

## 7. Proteções no app (não dependem do modelo)

| Proteção | Onde | O que resolve |
|---|---|---|
| Storage polyfill `nx-safe` | `decorate()` + `themed()` | `localStorage` lança `SecurityError` no sandbox → recorde quebrava. Store em memória. |
| Loop de continuação (12×) | `app.js` `completarSeTruncado` | Provedor corta a saída (~40 KB) → emenda sem whitespace até `</html>`. |
| Detecção de truncamento | `ai-client.js` | `finish_reason === 'length'` **ou** documento sem `</html>`. |
| Stall detector 90s | `ai-client.js` | Stream parado aborta com mensagem clara (antes: 10 min parecendo travado). |
| `AiClient.cancel()` | `ai-client.js` | Cancela geração em andamento. |
| Resize nudge | shim | Dispara `resize` em 0/150/500/1200 ms + `DOMContentLoaded` → jogos que mediram 0×0 se recompõem. |
| Log de erro real | `ai-client.js` | `console.warn('[nexus] proxy falhou: <stack>')` — evita mascarar bug como "CORS". |
| `rewriteLibs` | `html-builder.js` | CDN do three.js → vendor local (funciona offline). |
| `sanitizeSnapshotHtml` | `app.js` | Remove artefatos do shim/fontes do HTML finalizado. |
| **Erro síncrono não trava mais** | `app.js` `sendPrompt` | Corpo da geração em `try/catch` → qualquer exceção vira `failGeneration` e libera o botão. Antes, um erro antes do `.then` deixava `generating = true` para sempre. |
| **Watchdog de geração** | `app.js` `armarWatchdog` | 2,5 min sem progresso → cancela, destrava a UI e avisa. Relógio unificado em `Date.now()` e heartbeat de 20 s no corpo da resposta: provedor lento mas vivo não é mais morto. |
| **ESC cancela limpo** | `app.js` init | `Esc` durante geração chama `AiClient.cancel()` + `finishGeneration()` (não age com modal aberto). `canceladoPeloUsuario` evita que o `AbortError` escreva página de erro na tela. |
| **↺ reinicia mesmo gerando** | `app.js` `resetSession` | Antes só mostrava "aguarde"; agora cancela e reinicia. |
| **Fallback não-streaming com teto próprio** | `ai-client.js` | `postText` não herda o stall de 90 s do stream: usa `CHAT_TEXT_TIMEOUT_MS` (5 min), senão provedor que não faz streaming morria sempre. |
| **Abortar durante o fallback** | `ai-client.js` `requestText` | Registra `_activeCtrl`, então `Esc`/watchdog também cancelam a requisição não-streaming. |
| **Proxy sem SSRF** | `serve.py` + `desktop/server.js` | `/_proxy` recusa rede privada, link-local e metadata de nuvem; redirecionamentos revalidados (máx. 4). Loopback liberado para LLM local. |
| **Edição tolerante e parcial** | `html-builder.js` `applyEdits` | Cascata exato → CRLF → whitespace (`_wsRegex`). Uma âncora ruim não descarta o resto (`{ok, partial, applied, failed}`); teto de 200 edições. |
| **Erro de runtime volta para a IA** | `app.js` `SHIM` + `notes` | `error`/`unhandledrejection`/`console.error` são deduplicados, enviados pela bridge `errors` e injetados no prompt (até 12 linhas) como "o sintoma que o usuário vê". |
| **Aviso de jogo quebrado** | `app.js` `watchFrameErrors` | Checa em 2,5 s **e** 6 s (erro tardio de áudio/textura não escapa), avisa uma vez só. |
| **Correção nunca piora a página** | `app.js` `run`/`retryUser` | Se a resposta de edição não for aplicável, reenvia com o documento atual + pedido de HTML completo. Sem documento novo: `⚠ nada aplicado — página atual mantida`. |
| **Sessão limpa de verdade** | `app.js` `resetSession` | Zera `lastRendered`, `editSelHtml`, `editCount`, `frameErrors` e `lastCommands` — nada da página anterior entra no próximo prompt. |

---

## 8. Tema único

Um só tema (`Themes.DEFAULT = PADRÃO · BLACK CYBER`) com `background`, `surface`,
`surfaceAlt`, `accent`, `text`, `secondary`, `isDark`, `colors[]` (esmeralda/rosa/azul) e
`onAccent`. O seletor de temas foi removido; `Themes.of(i)` ignora o índice.

- **Escuros (20):** RGB neon, fire, synthwave, cyberpunk, rainbow, vaporwave, toxic, blood moon,
  galaxy, aurora, strawberry, ocean deep, lime blast, ultraviolet, candy, artic ice, lava, poison,
  midnight sun, pixel dream.
- **Claros (10):** rubi, tangerina, limão, esmeralda, turquesa, céu, lavanda, orquídea, areia,
  grafite.

Agrupados em **ESCUROS / CLAROS** no modal ⚙, com preview por hover.

---

## 9. UI

Header único, sem barra inferior:

`NEXUS GAME` · dot de sessão · input (Enter envia, ↺ reseta) · status · VU/KB ·
`✎ EDITAR` / `✔ FINALIZAR` · `SALVAR` · `ABRIR` · `CONSUMO` · `⚙`

**Modal ⚙:** API (endpoint, key, modelo, buscar modelos) · GERAÇÃO (temperatura, max tokens) ·
FONTES.

**Painel CONSUMO:** modelo ativo, barra da sessão, `↑entrada ↓saída · usado/1M`, 4 cartões
(última hora / 24 h / 7 dias / 30 dias).

**Modo edição:** 1 clique seleciona, duplo abre popover ancorado, arrasto direto, redimensionar
pelas bordas, Ctrl+Z com pilha de 200, drill-down de camadas, FINALIZAR grava o HTML editado.

---

## 10. Execução

```bash
# App Electron (principal)
./desktop/start.sh

# Fallback navegador
python3 serve.py 8790
```

- Porta 8790 → 8810 se ocupada.
- Electron precisa de `npm --prefix desktop install` na primeira vez.
- `--disable-gpu` é obrigatório nesta máquina (GPU Ivy Bridge não suporta o Vulkan do Electron 44).
- Atalho **SUPER + N** → `NEXUS-GAME.desktop` (registrado no Hyprland).

---

## 11. Limitações conhecidas

**Altas**
1. **Sem validação do jogo gerado** — a única checagem antes de renderizar é `if (!doc.trim())`.
   Não há verificação de sintaxe JS, canvas pintado ou tela vazia.
2. **Dependência total do prompt** — 18.666 chars; regras no meio podem ser ignoradas
   ("lost in the middle").
3. **Loop de continuação caro** — até 12 × (system + 8 KB de cauda) ≈ **~80 mil tokens** de
   entrada num jogo grande.

**Médias**
4. `maxTokens: 0` — o corte é decidido pelo provedor.
5. `temperature: 0.7` — estrutura instável em jogos complexos; não há preset por gênero.
6. **Edição cirúrgica ainda é heurística** — `applyEdits` casa exato → CRLF → whitespace e
   agora aplica parcialmente, mas âncoras ambíguas (trechos repetidos) podem acertar a
   ocorrência errada; não há verificação sintática do resultado.
7. **Sem testes de qualidade** — nada mede FPS real, touch, áudio tocando, texturas aplicadas.
8. **Áudio pode ficar mudo** — `AudioContext` suspenso até gesto do usuário.
9. **Watchdog pós-render é só de erro, não de travamento** — exceções e rejeições são
   capturadas, mas um `while(true)` no rAF congela a aba sem gerar erro.

**Baixas**
10. Sem cache/reuso de assets entre gerações (exceto o pack `NxTex`).
11. Sem preview antes de renderizar.
12. Sem timeout de render para HTML muito grande.

---

## 12. Validação rápida

```bash
cd web/js
for f in *.js; do node --check "$f" || echo "FALHOU: $f"; done

node -e "
global.window={}; require('./themes.js');
var vm=require('vm'),fs=require('fs');
vm.runInThisContext(fs.readFileSync('html-builder.js','utf8'));
var p=window.Html.systemPrompt(window.Themes.of(0),2,'tetris');
console.log('prompt', p.length, p.includes('GAME MODE ATIVADO'), p.includes('NxTex.bloco'));
console.log('temas', window.Themes.ALL.length);
"
```

**Última verificação (2026-10-20):** 9 arquivos JS com sintaxe OK · prompt 18.666 chars ·
GAME MODE ativo · 1 tema · prévia ao vivo · reparo de JS quebrado · three.js r160 local ·
`applyEdits`/`userPrompt` 17/17 no harness · smoke Electron 20/20.

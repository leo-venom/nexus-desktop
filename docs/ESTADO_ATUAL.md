# ESTADO ATUAL — NEXUS GAME

**Versão:** 2.15.1 · **Atualizado:** 2026-10-23
**Local:** `/home/leo/Documents/Obsidian Vault/01_Projeto/nexus-game/`
**Repositório:** `github.com/leo-venom/nexus-desktop`

---

## 1. O que é

Gerador de **páginas HTML criativas** com IA — jogos, simulações, cenas 3D, desenhos,
ilustrações, diagramas, painéis, ferramentas, objetos interativos, textos formatados
ou qualquer mistura. Um shell web (Electron ou navegador) conversa com qualquer API
compatível com OpenAI e renderiza o resultado em `<iframe>` isolado
(`sandbox="allow-scripts allow-pointer-lock allow-popups"`, origem opaca).

**Arquitetura unificada (v2.15.1):** o modelo decide o que a página é. **Sete regras imutáveis** no DIRECTIVE:
1. **Tela inteira, sem rolagem, qualquer resolução** (320×480 → 2560×1080).
2. **Desempenho máximo (three.js + 2D)** (1 cena/renderer/rAF, ≤60 draw calls,
   ~80k tri, ~300 partículas, FPS adaptativo silencioso).
3. **Iluminação bonita** (IBL via PMREMGenerator, 3 pontos key/fill/rim, PBR coerente,
   gradiente de fundo, emissive pulsante).
4. **Texturas e sons sob pedido** (pack `window.NxTex` 88 texturas).
5. **Som futurista obrigatório em jogos** (trilha 4 camadas + 13 efeitos WebAudio).
6. **Jogo em tela cheia, barras 5px, controles teclado/mouse**.
7. **Só o que foi pedido** — sem extras.

**Tema único:** `PADRÃO · BLACK CYBER` (preto `#000000`, accent esmeralda `#00E88A`,
detalhes roxo `#A855F7` e azul `#00A3FF`). A página **não herda** essa paleta:
o modelo escolhe a própria ou segue as cores que o pedido citar (paleta do app entra
como **referência, não obrigação** via `paletaRef(theme)`).

---

## 2. Números reais (v2.15.0)

| Item | Valor |
|---|---|
| Linhas de código | **~9.000** (JS ~6.500 · Python 589 · Electron 700 · CSS 750 · HTML 58) + docs ~2.200 |
| `app.js` | **2.054** (86 funções, maior arquivo) |
| `html-builder.js` | **825** (DIRECTIVE ~11,8 KB com 7 regras) |
| `nx-textures.js` | **2.365** (91 funções de desenho, 88 texturas) |
| `store.js` | **231** (API REST de projetos) |
| Texturas procedurais | **88** (+20 novas — diamante, jade, opala, iridescente e mais) |
| Sons WebAudio | **13** receitas (trilha 4 camadas + efeitos) |
| Tema | **1** — `PADRÃO · BLACK CYBER` (roxo no lugar do rosa) |
| `maxTokens` default | **65535** |
| Timeouts | CONNECT 60s · READ 120s |
| Commits | 22 + working tree ~3.300 linhas alteradas |

### 2.1 Projetos salvos (novo em v2.15.0)

```
nexus-game/
├── salvos/
│   ├── <projeto>/
│   │   ├── index.html       ← jogo/página
│   │   ├── meta.json        ← prompt, data
│   │   ├── assets/          ← mídia extraída (imagens, sons)
│   │   └── _backups/        ← backups automáticos a cada save
│   │       └── YYYYMMDD_HHMMSS/
│   │           ├── index.html
│   │           └── assets/
```

**Comportamento:**
- Abriu projeto salvo → SALVAR sobrescreve direto (sem perguntar)
- Nova geração em cima de projeto aberto → SALVAR continua no mesmo projeto
- Reset (↺) → próximo SALVAR cria projeto novo
- Backup automático de versões anteriores com assets

**API REST:** `/_api/saves/<nome>` (POST/GET/DELETE) · backups · restore

### 2.2 Mídia do projeto

Pastas `imagens/` e `sons/` na raiz com arquivos servidos via `/midia`.
O app extrai assets automaticamente ao salvar (`assets/` na pasta do projeto).
embute as mídias usadas como data URI (limites: 6 MB/arquivo, 20 MB total).
Extensões suportadas: imagens — PNG, JPG, JPEG, WebP, GIF, SVG, AVIF, BMP; sons — MP3,
OGG, WAV, M4A, FLAC, Opus, AAC, WebM.
`LEIA-ME.txt` em ambas as pastas com instruções de uso.
Servidores `serve.py` e `desktop/server.js` replicam o comportamento de `/fontes/`.

**`imagens/back1.jpg`** (124.961 bytes, 1920×1080, q82) existe para o modo desenho: é o
`FUNDO PADRÃO` do `DRAWING_DIRECTIVE`. Em jogo é **opcional** — cena 3D desenha o próprio
fundo; jogo 2D desenha céu/parallax/tiles. O downscale de 7640×4585 (2,9 MB) para 1920×1080
reduziu o inline no `Salvar` de ~3,9 MB para ~167 KB de base64. Política completa na
`REGRAS_DEFINITIVAS.md`, Regra 2.

---

## 3. Estrutura

```
nexus-game/
├── README.md                    196  instruções de uso
├── abrir.sh                      24  fallback: serve.py + xdg-open
├── NEXUS-GAME.desktop             9  atalho (Exec → desktop/start.sh)
├── serve.py                     367  proxy CORS + estático + /fontes/ + /midia
├── fontes/                           Gameplay.ttf + LEIA-ME
├── imagens/                          back1.jpg + backgrounds, texturas, sprites + LEIA-ME
├── sons/                             músicas, efeitos + LEIA-ME
├── desktop/
│   ├── main.js                  128  BrowserWindow, F11/F12, single-instance
│   ├── server.js                487  servidor Node (proxy + estático + /fontes/)
│   ├── start.sh                  32  verifica node_modules, --disable-gpu, exec Electron
│   ├── package.json / lock       17  v2.14.0
│   └── icon.png
├── web/
│   ├── index.html                58  shell: header único + iframe
│   ├── css/app.css              746  tema via var(--nx-*), popover, modais
│   ├── vendor/three/                 three.min.js r160 + module
│   └── js/
│       ├── themes.js             54  tema único (ALL=[DEFAULT])
│       ├── prefs.js             152  localStorage["nexus77"] + tokens
│       ├── html-builder.js      757  prompt unificado, extração, edição, lint, decoração
│       ├── ai-client.js         490  SSE + proxy/fallback + cancel + clamp maxTokens
│       ├── store.js             258  File System Access + IndexedDB
│       ├── vu-meter.js          171  canvas 5 barras / 5 ondas
│       ├── settings.js          228  modal config (API / geração)
│       ├── app.js              1915  fluxo principal + edição + reparo qualidade
│       └── nx-textures.js       959  44 texturas procedurais (window.NxTex)
└── docs/
    ├── ESTADO_ATUAL.md              este documento
    ├── REGRAS_DEFINITIVAS.md   256  regras permanentes (arquitetura unificada) + checklist
    ├── GAME_MODE.md            308  **OBSOLETO** (dependia de GAME_DIRECTIVE removido)
    ├── gerar_game_mode.js      181  **OBSOLETO** (dependia de GAME_DIRECTIVE removido)
    ├── DOCUMENTACAO.md         275  arquitetura e APIs
    ├── MAPA_UI.md              101  elemento de tela → arquivo:linha
    ├── CHANGELOG.md            697+ histórico v1.x → v2.14.0
    ├── VALIDACAO.md             97  matriz de testes
    └── BASE_REUTILIZAVEL.md    113  receita para novos projetos
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
iframe.srcdoc  ──►  PÁGINA HTML (origem opaca)
```

---

## 5. Prompt unificado — o que o systemPrompt monta

`systemPrompt(theme, detailLevel, command, doc, media)` (módulo único, v2.14.0+) concatena:

1. **`DIRECTIVE`** — string completa com: IDENTIDADE, CONTRATO DE SAÍDA, REGRA 1 (enquadramento),
   REGRA 2 (desempenho), REGRA 3 (iluminação), REGRA 4 (texturas/sons só sob pedido),
   COMO DECIDIR. (~8.9 KB)
2. **`paletaRef(theme)`** — se tema tem `background`: `"- fundo <bg> · superfície <surface> · destaque <accent> · texto <text>"` + linha "Use estas cores quando combinarem com o pedido; se o pedido pedir outro estilo, outra cor ou outra atmosfera, siga o pedido e ignore esta lista." (silenciosa se tema sem background).
3. **`detailDirective(level)`** — `0` = MINIMAL (1 item), `1` = `''`, `2` = MAXIMUM (5 itens).
4. **`mediaBlock(media)`** — mídia do projeto (imagens/sons), se houver.

`command` e `doc` ficam na assinatura por compatibilidade com `app.js:674`; o documento atual
é transportado pelo `userPrompt` (bloco `Current page`).

### Blocos da DIRECTIVE (v2.14.0)

| Bloco | Conteúdo |
|---|---|
| **IDENTIDADE** | Construtor de páginas HTML criativas; sem catálogo de tipos; o pedido define o que a página é. |
| **CONTRATO DE SAÍDA** | HTML puro, single-file, CSS/JS inline; CDNs liberadas **exceto** three.js → `vendor/three/three.min.js` (UMD, global `THREE`, offline); sem addons, import map, `type="module"`; nunca perguntar/recusar; pt-BR; sem TODO/lorem/placeholder; bloco "Current page" = edição pontual. |
| **REGRA 1 — ENQUADRAMENTO** | `html,body{margin:0;padding:0;height:100%;overflow:hidden}`; raiz `position:fixed;inset:0;width:100vw;height:100vh;height:100dvh`; unidades relativas; `resize`/`orientationchange`/`ResizeObserver`; 3D: `setPixelRatio(min(dpr,1.5))`, `setSize(W,H,false)`, reenquadrar por FOV/distância; caber 320×480 → 2560×1080; `env(safe-area-inset-*)`; toque ≥44×44 px; sem `overflow:auto` na raiz; controles essenciais com alternativa de toque. |
| **REGRA 2 — DESEMPENHO** | 1 cena/renderer/rAF/AudioContext; `{antialias:true, powerPreference:'high-performance', alpha:false, stencil:false, depth:true}`; SRGB + ACESFilmic; PCFSoftShadowMap, **1 luz c/ sombra**, mapSize 1024, bias -0.0005, normalBias 0.02; `dt=min(delta,0.25)` + acumulador 1/60; zero alocação; geometria/material compartilhados; InstancedMesh; ≤60 draw calls / ~80k tri / ~300 partículas; proibido post-processing; CanvasTexture ≤256 px; FPS adaptativo silencioso; `dispose()` ao reconstruir. |
| **REGRA 3 — ILUMINAÇÃO** | IBL via PMREMGenerator.fromScene(miniCena, 0.04) → scene.environment; 3 pontos (key 1.2–2.0 c/ sombra, fill frio 0.25–0.7, rim/back 0.6–1.2); PBR coerente; gradiente de fundo; scene.fog; emissive pulsante 0.6–1.4; sombra contato CanvasTexture radial multiply. |
| **REGRA 4 — TEXTURAS E SONS SÓ SOB PEDIDO** | Sem pedido → proibido NxTex/createPattern/CanvasTexture/ruído/AudioContext; com pedido → pack `window.NxTex` (44 texturas: concreto, madeira, marmore, tijolo, metal, grama, terra, areia, pedra, tecido, papel, asfalto, agua, nuvem, fogo, musgo, ferrugem, ouro, carbono, xadrez, listras, grade, ruido, gradiente) + fuzzyMatch; som só com gesto (AudioContext no 1º click/keydown/pointerdown, sem autoplay, oscilador/ruído); nunca base64. |
| **COMO DECIDIR** | Decidir em silêncio o que impressiona; mínimo de código, máximo acabamento; "parecer feito por um estúdio". |

### Pack NxTex (injetado quando HTML cita NxTex/createPattern/CanvasTexture)

| API | Uso |
|---|---|
| `NxTex.three(nome,rx,ry)` | `THREE.CanvasTexture` para material.map |
| `NxTex.css(nome)` | `url(data:...)` para `background-image` CSS |
| `NxTex.canvas(nome,tam)` | `HTMLCanvasElement` (32/64/128/256) |
| `NxTex.fuzzyMatch(termo)` | mapa ~120 sinônimos PT/EN → nome do pack |
| `NxTex.names()` | 44 nomes |

Texturas: lava, metal, cromo, ouro, vidro, madeira, pedra, gelo, agua, grama, asfalto, grade, nebulosa, areia, chocolate, neon, tijolo, marmore, couro, plasma, cristal, ferrugem, concreto, holograma, obsidiana, basalto, ametista, rubi, safira, turquesa, cobre, bronze, titanio, fibra_carbono, camuflagem, zebra, tigre, veludo, pergaminho, circuito, binario, aurora, fogo_azul, pantano.

---

## 6. Pack de texturas — `window.NxTex` (injetado sob pedido)

44 texturas procedurais. **Injetadas apenas quando o HTML gerado cita `NxTex`/`createPattern`/`CanvasTexture`**
(via `decorate()` → `<script src="js/nx-textures.js">`). No `Salvar`, `app.js` inlina o pack.

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
| **Validação antes de renderizar** | `html-builder.js` `lint(html)` | 4 checagens gerais: `truncated` (sem `</html>` ou `<script>` desbalanceado), `addon` (OrbitControls/GLTFLoader/EffectComposer/RoomEnvironment/ContactShadows/RGBELoader/importmap/module), `cdnThree` (three.js de CDN), `stub` (TODO/FIXME/XXX/lorem ipsum). Devolve `[]` quando passa. |
| **Reparo de qualidade** | `app.js` `repararQualidade` | `lint` reprovou (ou o JS está quebrado) → **uma** regeneração com a lista de falhas. Nunca em edição (`editing`); se o reparo falhar, a página atual é mantida. |
| **Teto de `max_tokens` por modelo** | `ai-client.js` `clampMaxTokens` | `65535` (gemini-2*), `100000` (o3/o4/gpt-5), `32768` (gpt-4.1), `16384` (gpt-4o/4-turbo), `32000` (claude), `8192` (deepseek), `16384` default → evita HTTP 400 por teto inválido. |
| **Timeouts por etapa** | `ai-client.js` | conexão 60 s, leitura do stream 120 s (stall de 90 s), fallback não-streaming 300 s, lista de modelos 60 s e heartbeat de 20 s no corpo para o watchdog. |

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
1. **Validação é estática, não visual** — `jsSyntaxErrors`, `Html.lint` e uma regeneração
   (`repararQualidade`) pegam sintaxe quebrada, addon/CDN indevido, stub, loop sem resize e
   parede de texto. Continua sem medir FPS real, toque, áudio tocando ou textura aplicada.
2. **Dependência total do prompt** — 19.063 chars; regras no meio podem ser ignoradas
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
var H=window.Html, T=window.Themes;
var p=H.systemPrompt(T.of(0),1,'cubo girando');
console.log('prompt', p.length, p.includes('REGRA 1'), p.includes('REGRA 2'), p.includes('REGRA 3'), p.includes('REGRA 4'));
console.log('temas', T.ALL.length);
console.log('lint.length', H.lint.length); // deve ser 1
console.log('detectMode', typeof H.detectMode); // undefined
"
```

**Última verificação (2026-10-21):** 9 arquivos JS com sintaxe OK · prompt ~8.9 KB · `lint` 4 checagens · reparo de qualidade · `clampMaxTokens` · **arquitetura unificada (sem modos)** · 1 tema · prévia ao vivo · reparo de JS quebrado · three.js r160 local · `applyEdits`/`userPrompt` harness OK · smoke Electron OK.

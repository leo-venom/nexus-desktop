# Changelog — NEXUS GAME

## v2.13.0 — 2026-10-21

### Corrigido (Electron — desempenho)
- **`--disable-gpu` no `desktop/start.sh` matava o WebGL.** Medido com um probe no
  próprio Electron: com `--disable-gpu` o `getContext('webgl')` devolve **null**
  ("sem webgl") — qualquer cena three.js/jogo 3D do app desktop não renderiza.
  Com a GPU ligada (mesmo hardware, iGPU Intel HD 2500 / Ivy Bridge):
  `ANGLE (Intel, Mesa Intel HD Graphics 2500 (IVB GT1), OpenGL ES 3.0)`,
  800×600 a **60,8 fps**.
- **Flags novas em `desktop/start.sh`:** `--enable-gpu-rasterization`,
  `--enable-zero-copy`, `--ignore-gpu-blocklist`, `--use-angle=gl`,
  `--disable-vulkan`, `--disable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan`,
  `--disable-renderer-backgrounding`, `--disable-background-timer-throttling`.
  Vulkan sai porque este hardware é Ivy Bridge ("Vulkan support is incomplete",
  "'--ozone-platform=wayland' is not compatible with Vulkan"); VAAPI/iHD também
  falha aqui (`libva iHD_drv_video.so init failed`) e foi removido.
- **`desktop/main.js`:** mesmas flags de GPU via `app.commandLine`; janela criada
  **sem bounds** + `maximize()` no `ready-to-show` (no Wayland `setBounds` é
  ignorado). Removidos `targetDisplay()`/`fitToDisplay()` e os listeners de `screen`.

### Corrigido (three.js)
- **`THREE.OrbitControls`, `GLTFLoader` e `EffectComposer` NÃO existem no build
  local** (`vendor/three/three.min.js`, UMD r160 — verificado: `THREE.REVISION`
  = "160", `typeof THREE.OrbitControls === 'undefined'`). O prompt mandava usar
  OrbitControls em vários lugares → cena 3D quebrava. Agora o prompt usa o caminho
  local `vendor/three/three.min.js`, avisa que não há addons e exige órbita manual
  por drag. Probe dentro de um iframe `sandbox="allow-scripts"`: WebGL 2.0 ativo e
  pixel central do cubo renderizado `[10,159,94,255]`.

### Adicionado
- **FPS AUTO (regra no prompt):** o jogo mede fps em janelas de 1 s e, abaixo de
  50 fps por 2 janelas, reduz sozinho (pixelRatio 1, metade das partículas, sem
  sombras/glow); volta ao normal acima de 58 fps. Silencioso, sem UI.

### Alterado
- **HUD de jogo em BOLHAS nas laterais:** cada informação em pílula arredondada,
  vidro semi-transparente, borda na cor de destaque, **largura máx. 100px**, 10px de
  margem, coluna à esquerda/direita. Nada no centro; proibida faixa/painel largo.
- **SEM BORDAS:** canvas de borda a borda (100vw×100dvh), proibida moldura, card,
  vinheta, cabeçalho ou margem em volta do jogo.
- **SÓ O QUE FOI PEDIDO (jogo e desenho):** proibido inventar seções, telas, cards,
  créditos, títulos, rótulos, HUD decorativo ou camadas extras; enriquecer DENTRO do
  objeto/jogo, nunca ao redor.

### Alterado (prompt de jogo — reescrita)
- **`GAME_DIRECTIVE` reescrito e medido:** **16.753 chars** (antes o texto competia
  com o jogo). Prompt de jogo fica em **13.391 chars sem texturas** e **19.063 com
  texturas**; o pack `@@NX_TEX` (**6.413 chars**, 44 texturas, 12 receitas
  `CanvasTexture`) e a cauda (**3.572 chars**, 13 sons WebAudio + `CHECK FINAL` +
  `ENTREGUE APENAS O HTML.`) seguem intactos.
- **8 blocos numerados** (`CONTRATO DE SAÍDA`, `FUNDO — O JOGO É A TELA`,
  `ESQUELETO OBRIGATÓRIO`, `ACABAMENTO`, `REALISMO 3D EM GPU`, `ORÇAMENTO`,
  `HUD E TEXTO`, `REPROVA`) com âncoras estáveis para verificação automática.
- **Fundo:** jogo 3D desenha a própria cena; jogo 2D é desenhado; `back1.jpg` só
  **opcional** em 2D chapado. `DRAWING_DIRECTIVE` mantém `back1.jpg` como padrão.
  `baseCss()` nunca define `background` em `html,body`.

### Adicionado (qualidade)
- **`Html.lint(html, mode)`** — 8 checagens objetivas: resposta truncada, addon/ES
  module, three.js por CDN, trecho por fazer (`TODO`), loop de animação, resize e
  parede de texto (>900 chars visíveis, só em jogo).
- **`repararQualidade()`** no pipeline de `app.js` — no máximo **uma** regeneração
  completa quando o lint reprova; nunca em ajuste de página nem em modo chat, e
  nunca descarta o documento bom se o reparo falhar.
- **`clampMaxTokens(model, maxTokens)`** — teto de saída por modelo (gemini-2
  65535, o3/o4/gpt-5 100000, gpt-4.1 32768, gpt-4o/4-turbo 16384, claude 32000,
  deepseek 8192, default 16384). Pedir acima do limite devolvia HTTP 400 e
  derrubava a geração inteira. `prefs.maxTokens` passa de `0` para `65535`.
- **`NxTex` com `fuzzyMatch`** (nome normalizado → palavra → substring →
  Levenshtein) como último recurso: nome desconhecido nunca devolve textura
  inexistente.
- **`docs/gerar_game_mode.js`** — gera `docs/GAME_MODE.md` do próprio código
  (split por âncoras `TEXTURAS PROCEDURAIS` / `13 SONS WEBAUDIO`, falha com
  `exit 1` se as âncoras ou o export sumirem). `docs/REGRAS_DEFINITIVAS.md`
  reúne as regras + checklist de 6 passos.

### Corrigido (rede e build)
- **`serve.py`:** `BrokenPipeError`/`ConnectionResetError` no `/_proxy` (cliente
  cancelou ou deu timeout) não viram mais `502` nem logam stacktrace.
- **Timeouts:** conexão `20s → 60s` (modelo frio demora) e leitura `90s → 120s`
  sem nenhum byte; mensagens de erro dizem o tempo real.

### Alterado (tamanho)
- **`imagens/back1.jpg`: 2,9 MB / 7640×4585 → 125 KB / 1920×1080** (mesmo visual
  de fundo desfocado, agora dentro do orçamento de mídia inline).

## v2.12.0 — 2026-10-21

### Corrigido
- **"O objeto não aparece" (cubo 3D, peça do Tetris) — causa raiz: documento
  fechado com JS pela metade.** Quando o provedor cortava a resposta, a continuação
  devolvia só `</script></body></html>`; o teste de fim olhava apenas `</html>` e dava
  a página por completa. O `<script>` ficava sem fechar → `SyntaxError: Unexpected end
  of input` → **nada executa** e a tela fica sem objeto. Verificado com um Tetris real
  (25,6 KB, `finish=stop`, `</html>` presente, JS inválido).
  - `completarSeTruncado()` só considera o documento fechado se `<script>` e
    `</script>` estiverem balanceados.
  - Novo `Html.jsSyntaxErrors(html)`: compila cada `<script>` inline com
    `new Function()` (não executa) e devolve os erros; ignora `src` e `type=module`.
  - Novo passo `repararJsQuebrado()` no `sendPrompt()`: com erro de sintaxe, reenvia o
    documento + a mensagem do erro e pede o HTML completo corrigido (máx. 2 rodadas).
- **Erro dentro do `requestAnimationFrame` era engolido pelo shim** (`try{cb(t)}catch(e){}`).
  Agora é reportado como `raf` e entra no próximo prompt — antes o loop morria em silêncio.
- **Watchdog de canvas no shim:** aos 4 s verifica canvas 0x0 e canvas 2D totalmente
  transparente, reportando `blank` (o objeto não apareceu).
- **Polyfill `nx-safe` era injetado duas vezes** (`ensureSafeStorage()` + `decorate()`);
  agora `decorate()` só injeta se ainda não existir.

### Alterado
- **Jogos sem tela de apresentação / botão iniciar.** Nova regra `INÍCIO IMEDIATO`
  no `GAME_DIRECTIVE`: proibido splash, título, menu inicial, "Iniciar/Jogar/Play";
  proibido gate (`started`, clique, IntersectionObserver, `visibilityState`,
  `requestIdleCallback`, espera de fontes/imagens); primeiro render síncrono antes do
  rAF; pausa só sob pedido; restart no game over por clique/tecla.
- **Desenhos também ganharam `PRIMEIRO FRAME — REGRA ABSOLUTA`**: objeto visível sem
  interação, render síncrono antes do loop, sem gate de início.

## v2.11.0 — 2026-10-21

### Removido
- **Seletor de temas (30 temas) eliminado.** O modal de configurações agora tem só
  **API** e **GERAÇÃO** — a seção TEMA, os radios ESCUROS/CLAROS e o preview por
  hover saíram. `prefs.themeIndex()` sempre devolve `0` e `Themes.ALL` tem 1 item.
- **A paleta do app não vai mais para o prompt.** O bloco "Current app theme — use
  these exact colors" e as diretivas "use TODAS as cores do tema" foram removidos:
  jogos, desenhos e objetos escolhem a **própria paleta** (coerente com o pedido) ou
  seguem as cores que o usuário pedir explicitamente.

### Alterado
- **Prévia ao vivo durante a geração (latência percebida).** Antes o iframe só mostrava
  algo quando o modelo terminava (40-50 s de "gerando…" sem imagem). Agora o
  `AiClient.postStream` acumula os deltas e chama `onProgress(bytes, texto)`; o shell
  fecha as tags abertas (`</script>`, `</style>`, `</body>`, `</html>`) e renderiza o
  documento parcial a cada ~1,2 s a partir de 1,2 KB, sem roubar foco. Selo
  **⚡ prévia ao vivo** no canto do palco; o render final substitui a prévia e esconde o
  selo. Ajustes de página (`EDITAR`) não usam prévia.
- **Erro de UI não derruba mais o stream.** `onProgress` roda dentro de `try/catch` no
  cliente: um bug na prévia matava a leitura do SSE e aparecia como falha de rede.
- **`isNetworkFailure()` só considera `TypeError`.** Antes qualquer erro que não fosse
  `AiException` era rotulado "falha de rede/CORS — rode serve.py" — um `ReferenceError`
  de JS virava diagnóstico falso. Agora o erro real sobe para a UI.
- **Tema único `PADRÃO · BLACK CYBER`** — base `#000000`, superfícies `#06100C` /
  `#0B1A14`, accent **verde esmeralda `#00E88A`**, detalhes **rosa `#FF2D95`** e
  **azul `#00A3FF`**, texto `#E6F5EE`, secundário `#7FA894`.
  Contraste AA/AAA verificado: accent/bg 12.9:1 · texto/bg 18.7:1 · secundário/bg
  7.9:1 · onAccent 11.9:1.
- Brand do header (`.brand`) virou degradê esmeralda→rosa→azul (`--nx-c2`/`--nx-c3`),
  o título da tela de boas-vindas colore letra a letra nas três cores e a linha
  abaixo do título usa o mesmo degradê. VU meter passou a usar 3 tons
  (base esmeralda → meio rosa → topo azul).

## v2.10.0 — 2026-10-21

### Adicionado
- **3 modos de geração automática:** o app detecta inteligentemente se o comando
  é **jogo** (GAME), **desenho/objeto/arte** (DRAWING) ou **chat/conversa** (CHAT)
  e aplica a diretriz correta automaticamente.
- **Modo Desenho/Objeto (`DRAWING_DIRECTIVE`):** ativado por ~120 termos
  (desenho, ilustração, logo, infográfico, objeto 3D, paisagem, escultura,
  poster, data viz, tipografia, animação visual, simulação física...).
  Mesmo nível de qualidade e detalhe do modo jogo: exige acabamento em cada
  forma (gradientes, contornos, highlight/sombra em shape, iluminação 3D),
  composição equilibrada, paleta expansiva do tema — porém **leve e rápido**:
  sem blur em tela cheia, sem trabalho caro por frame, desenho estático
  desenhado uma vez. Exemplos de referência incluídos na diretriz para guiar a IA.
- **Modo Chat (`CHAT_DIRECTIVE`):** ativado para saudações, perguntas curtas
  e comandos que não são jogo nem desenho. Responde com HTML bonito:
  cards centralizados, tipografia refinada com cores do tema, animações de
  entrada sutis, microinterações hover. Nunca texto puro sem estilo.
- **`detectMode(command)`** — função de detecção automática com precedência
  game > drawing > chat. Commandos muito curtos (≤3 palavras) sem termos
  de jogo/desenho viram chat.
- **`drawingScopeNote()`** e **`chatScopeNote()`** — notas de escopo para
  cada modo.
- **`isDrawingCommand()`** e **`isChatCommand()`** — predicated exports.
- **~120 termos de desenho** e ~40 termos de chat no `html-builder.js`.

### Alterado
- `systemPrompt()` agora usa `detectMode(command)` para escolher entre
  GAME_DIRECTIVE, DRAWING_DIRECTIVE ou CHAT_DIRECTIVE automaticamente.
- `BASE_PROMPT` atualizado para "CREATIVE generator" em vez de "GAME generator".
- Texto da interface "NEXUS GAME" mantido (marca); os modos são transparentes
  para o usuário — o prompt é apenas digitado e a IA decide o formato.
- Prompt de 3D (three.js CDN) só é injetado nos modos game e drawing.
- `mediaBlock` (imagens/sons do projeto) só entra no modo game.
- `gameLightingNote` só entra nos modos game e drawing.
- Interface HEADER mantida (o prompt placeholder ganhou exemplos mais amplos:
  "jogo de nave", "desenhe um castelo", "oi").

### Corrigido
- **Textura procedural só entra quando o pedido pede material/textura.** O bloco
  `@@NX_TEX_BEGIN@@…@@NX_TEX_END@@` do `DRAWING_DIRECTIVE`/`GAME_DIRECTIVE` é
  removido de quem não pediu; no lugar entra `DRAWING_TEX_OFF_DIRECTIVE` /
  `TEXTURE_OFF_DIRECTIVE` ("não use NxTex/createPattern/CanvasTexture; resolva com
  cor + gradiente"). `wantsTextures()` reconhece material explícito (metal, madeira,
  tijolo, lava…) e trata "sem textura / tira a textura" como negação. Página atual
  que já tem textura mantém textura no ajuste.
- **Marcador `@@NX_TEX_BEGIN@@` vazava no prompt do modo desenho.** O código
  injetava um segundo marcador antes do PACK, e o split pegava o primeiro — o
  literal `@@NX_TEX_BEGIN@@` aparecia para o modelo. Removida a injeção (os
  marcadores já existem no texto da diretriz).
- **Desenho/objeto deixou de exigir custo caro.** `ctx.shadowBlur`, `ctx.filter`,
  `globalCompositeOperation` por forma e blur em tela cheia estavam sendo
  *mandados* como padrão de acabamento (blur em software = frame lento). Agora a
  regra é **LEVE E RÁPIDO**: acabamento por gradiente 2-4 stops + stroke +
  highlight/sombra em shape deslocado, camadas caras pré-renderizadas em offscreen,
  desenho estático desenhado UMA vez (sem rAF rodando) e meta de 60 fps em máquina
  modesta. `drawingScopeNote()` acompanha.

## v2.9.3 — 2026-10-20

### Corrigido
- **"Corrija o jogo" regenerava do zero e podia piorar.** Quando a resposta em modo edição
  não era um objeto `{edits:[…]}` válido, o app chamava `sendPrompt` novamente com o comando
  cru e **sem o documento atual** — a IA reinventava o jogo em vez de consertar o existente.
  Agora existe um caminho de retentativa explícito: `run(baseSystem, retryUser)` reenvia com
  `Html.userPrompt(userBase, lastRendered, notes)` + instrução para devolver o **documento
  completo atualizado**. Se nem isso trouxer documento, a página em tela é **mantida**
  (`doc == null` → `⚠ nada aplicado — página atual mantida`) em vez de ser substituída por
  uma versão nova e possivelmente pior.
- **Edição cirúrgica frágil (find/replace exato).** `applyEdits` falhava com qualquer
  diferença de indentação ou `\r\n` e, pior, descartava **todas** as edições por causa de uma
  âncora ruim. Agora o casamento é em cascata — exato → CRLF → whitespace normalizado
  (`_wsRegex`) — e o resultado é **parcial**: aplica o que casar e reporta o que falhou
  (`{ok, partial, html, applied, failed}`). `partial` faz `editCount++` e avisa
  `⚠ N falha(s) não casaram — aplicado o resto`. Teto de 200 edições por resposta.
- **A IA não sabia que o jogo estava quebrado.** O iframe é origem opaca: nada do erro
  aparecia para o app, então "o jogo não funciona" chegava ao modelo como um comando cego.
  O `SHIM` agora captura `error` (capture, incluindo falha de recurso com `tagName`/`src`),
  `unhandledrejection` e `console.error`, deduplica e envia via bridge `errors`. O app guarda
  `frameErrors` e injeta até 12 linhas (`k:linha · mensagem`) no prompt sob "Runtime errors
  reported by the CURRENT page (it is broken — fix these first)". **A IA passa a receber o
  sintoma que o usuário vê.**
- **Aviso de erro dependia de sorte no timing.** `watchFrameErrors` checava uma única vez em
  ~1 s; erro disparado no `load` tardio (áudio, textura, `THREE`) passava batido. Agora checa
  em **2,5 s e 6 s**, com flag `notified` para avisar uma única vez.
- **Estado da sessão anterior vazava para a próxima.** `resetSession` limpava só
  `lastRendered`/tokens. Agora zera também `editSelHtml`, `editCount`, `frameErrors` e
  `lastCommands` — elemento selecionado, contador de ajustes, erros e histórico não
  contaminam uma geração nova.
- **`elementHint` usava alvo velho.** Ao preservar `editSelHtml` para o refinamento
  (correção anterior), uma geração **nova** podia herdar o elemento selecionado da página
  antiga. O hint agora só é montado `if (editing && editSelHtml)`.
- **Refinamento sem memória.** Cada ajuste era interpretado isolado e a IA podia desfazer o
  anterior. `lastCommands` guarda os 6 últimos comandos aplicados com sucesso e injeta os 3
  mais recentes como contexto ("Previous commands already applied to this page — do not undo
  them").

### Adicionado
- **Telemetria de erro no `SHIM`** (`_pushErr`): normaliza espaços, corta em 300 chars,
  deduplica por `k|msg|linha`, cap de 40 entradas, chaves `{k, m, l}`.
- **`notes` em `Html.userPrompt`** (3º parâmetro): erros de runtime + comandos anteriores
  entram entre o documento e o comando, mantendo o `Command:` no fim (posição de maior
  aderência).

### Alterado
- **Tela de apresentação leve e animada em CSS puro.** `welcomePage()` continua sem
  `<canvas>`, sem `requestAnimationFrame` e sem script — nenhum trabalho de JS na abertura —
  mas voltou a ter movimento, agora **só com `@keyframes`** (compositor, custo zero de CPU):
  - **Entrada letra a letra**: `nx-in` (`.7s`, `cubic-bezier(.22,.9,.24,1)`) com
    `translateY(.45em) scale(.9)` → `none`, `animation-delay: calc(var(--i)*60ms)`.
  - **Onda de brilho por letra**: `nx-sheen` (`3.6s` loop, `delay: calc(1.1s + var(--i)*120ms)`)
    desloca uma faixa de `linear-gradient(100deg,transparent 42%,${hi} 50%,transparent 58%)`
    de `background-position:0%` → `100%` (pico em 35%), de modo que o brilho atravessa
    "NEXUS GAME" da esquerda para a direita e pausa antes de repetir. A palavra inteira fica
    no accent; a faixa é apenas uma segunda camada de gradiente clipada no texto.
  - **Glow**: `nx-glow` (`5s`, delay `1.4s`) pulsa `drop-shadow` em `.title`.
  - **Espaço entre as palavras**: como os `<span>` são `inline-block`, o espaço colapsava —
    corrigido com `<span class="sp">` e `.title .sp{width:.34em}`.
  - **Contraste do brilho**: nova `sheenOn(hex)` escolhe `#0B0B0E` ou `#FFFFFF` pela
    luminância (`0.299r+0.587g+0.114b`, corte `0.62`), em vez de usar `theme.text` — em temas
    claros com accent claro a faixa ficava invisível. Nos 30 temas: 22 brancas, 8 escuras.
  - **`prefers-reduced-motion`**: `animation:none` no título e `background-image:none;
    color:${accent}` nos spans, garantindo letras sólidas (antes herdava
    `background-position:50% 50%` e congelava a faixa branca no meio da palavra).
  - `background-attachment:fixed` foi descartado: com `background-clip:text` as porcentagens
    de `background-size`/`background-position` são resolvidas de forma inconsistente.
  Página gerada: **2.785 bytes**, 10 spans, 3 keyframes, sem `canvas` e sem `fixed`.

### Verificado
- `node /tmp/nx-exp/edits.js` — **17/17**: exato, whitespace tolerante, CRLF, parcial,
  nenhum casamento, não-JSON, cercas markdown, `find` vazio, >200 edits, array puro,
  `replace` vazio, sem loop, metas de regex, e os 4 formatos de `userPrompt`.
- Smoke Electron headless — **20/20, exit 0** (geração, sandbox, texturas, SALVAR, export
  38 KB com `NxTex`, viewport móvel, ESC durante geração lenta, sem exceções).
- `node --check` OK em `app.js` (**1.701 l.**) e `html-builder.js` (**825 l.**).
- `welcomePage()` — harness com stubs de `window`/`Themes.hexA` sobre os **30 temas**: sem
  `canvas`, sem `requestAnimationFrame`, sem `background-attachment`, sem `undefined`/`NaN`,
  10 spans + `class="sp"` e os 3 keyframes em todos; bytes idênticos (**2.785 B**).
  Screenshots em Chromium headless confirmaram a onda atravessando da esquerda para a direita
  (`X` aceso em ~2,1 s, `G` em ~2,5 s) e letras sólidas no accent com
  `--force-prefers-reduced-motion`.

### Notas de investigação
- **"A edição se perde" não era bug de estado.** `snapshot()` remove `#nx-shim`/`#nx-freeze`
  e `sanitizeSnapshotHtml` remove `<style id="nx-fonts">` e reescreve `/vendor/three/`; logo
  `applySnapshot` grava um documento canônico limpo. **Não** re-renderizar depois é correto
  por design — um re-render recarregaria o iframe e apagaria o estado do jogo (score, posição).
  A percepção de perda vinha do encadeamento regenerar → piorar, tratado acima.

### Adicionado
- **Mídia do projeto (`imagens/` e `sons/`)** — pastas na raiz do projeto onde o usuário coloca
  backgrounds, texturas de bloco, sprites, músicas e efeitos sonoros. A lista real de arquivos
  é servida em `/midia`, `/imagens/` e `/sons/` (JSON + arquivos com CORS/CORP) e entra no
  system prompt via 5º argumento de `systemPrompt` (função `mediaBlock`). A página gerada
  referencia os caminhos relativos exatos (`imagens/fundo.jpg`, `sons/tiro.mp3`). No `Salvar`,
  `inlineMedia()` embute as mídias usadas como data URI (limites: 6 MB/arquivo, 20 MB total).
- `LEIA-ME.txt` em ambas as pastas com instruções de uso.
- Extensões suportadas: imagens — PNG, JPG, JPEG, WebP, GIF, SVG, AVIF, BMP; sons — MP3,
  OGG, WAV, M4A, FLAC, Opus, AAC, WebM.
- Servidores `serve.py` e `desktop/server.js` replicam o comportamento de `/fontes/` para mídia.

## v2.9.2 — 2026-10-20

### Corrigido
- **`Esc` durante a geração escrevia uma página de erro por cima do jogo.** O `AbortError`
  caía no `catch` de `failGeneration` e renderizava "falha na geração" mesmo com o usuário
  tendo cancelado de propósito. Nova flag `canceladoPeloUsuario` (setada em ESC, watchdog e
  `resetSession`) faz `failGeneration` sair cedo — a UI só destrava, sem sujar o palco.
- **Watchdog matava geração saudável.** `onGenProgress` media tempo com `performance.now()`
  enquanto `armarWatchdog`/`_genStartedAt` usavam `Date.now()`: a comparação misturava
  relógios e o watchdog virava teto rígido de 150 s ignorando progresso. Agora `lastProgressAt`
  é **sempre** `Date.now()`, e o watchdog só dispara após 2,5 min reais sem sinal de vida.
- **Fallback não-streaming herdava o stall de 90 s.** Em HTTP 4xx o `postText` era abortado
  pelo mesmo limite do stream, e provedores que respondem o documento inteiro morriam sempre
  em ~90 s. Agora o caminho não-streaming tem teto próprio: `CHAT_TEXT_TIMEOUT_MS` (5 min).
- **`Esc` não abortava o fallback não-streaming.** `requestText` não registrava o
  `AbortController` em `_activeCtrl`; agora registra e limpa no `stop()`, então ESC e watchdog
  cancelam de fato qualquer requisição viva.
- **`export` baixava o HTML sem as texturas inline.** `savePage` não inlinava
  `nx-textures.js`: o arquivo salvo referênciava `js/nx-textures.js` e abria sem textura fora
  da pasta do app. `inlineTextures()` (novo) embute o pack no `<script>` e usa
  `Store.fileName()` na nomeação.

### Adicionado
- **Heartbeat de progresso (`HEARTBEAT_MS` = 20 s)** — ao ler a resposta, um tick periódico
  chama `onProgress`, sinalizando vida sem exigir bytes novos. Provedor lento mas saudável não
  é mais confundido com travado.
- **Proxy `/_proxy` protegido contra SSRF** (`serve.py` e `desktop/server.js`): aceita apenas
  `http`/`https` e recusa rede privada, link-local e metadata de nuvem (`10/8`, `172.16/12`,
  `192.168/16`, `169.254/16`, `100.100.100.200`, `[fe80::]`, `[fd00::]`, `metadata.*`,
  `0.0.0.0`). Redirecionamentos são seguidos manualmente e revalidados (máx. 4 saltos), para
  que um `302` não fure a checagem. **Loopback continua liberado** — LM Studio / Ollama /
  llama.cpp são uso legítimo. Resolução DNS não é validada (risco residual documentado).

### Documentação
- `README.md` — versão 2.9.2, 30 temas (20 escuros + 10 claros), `## Recursos` duplicado
  renomeado para `## Interface e sessão`, nota de segurança do proxy, status atualizado.
- `docs/ESTADO_ATUAL.md` — HEAD `7937076`, `app.js` 1610 linhas, `ai-client.js` 464 linhas,
  tabela de proteções com as três falhas acima e o proxy.

## v2.9.1 — 2026-10-20

### Corrigido
- **Botão de gerar travava e não iniciava.** Um erro síncrono antes do `.then` (ex.: exceção em
  `systemPrompt`, `prefs` ou `status`) deixava `generating = true` permanentemente e a UI parava
  de responder. Agora o corpo da geração roda em `try/catch` e sempre cai em `failGeneration`.
  Verificado: erro forçado → status `✗ falha interna simulada` e a geração seguinte funciona.

### Adicionado
- **Watchdog de geração** — 2,5 min sem progresso cancela e destrava a UI.
- **ESC cancela** a geração em andamento (não age quando há modal aberto).
- **↺ reinicia a sessão mesmo durante a geração** (antes só pedia para aguardar).

## v2.9.0 — 2026-10-20

### Adicionado
- **+20 texturas no pack** (44 no total): obsidiana, basalto, ametista, rubi, safira, turquesa,
  cobre, bronze, titânio, fibra de carbono, camuflagem, zebra, tigre, veludo, pergaminho,
  circuito, binário, aurora, fogo azul, pântano.
- **~40 sinônimos novos** no `NxTex.mapear()` (granada→rubi, pcb→circuito, matrix→binário,
  aurora boreal→aurora, chama azul→fogo_azul, lodo→pântano…).
- **`docs/ESTADO_ATUAL.md`** — documento consolidado do estado do projeto.

## v2.8.0 — 2026-10-20

### Adicionado
- **Pack de texturas `web/js/nx-textures.js`** — 24 texturas procedurais bonitas, injetadas em
  todo jogo (`window.NxTex`). API: `bloco`, `pattern`, `canvas`, `css`, `three`, `mapear`,
  `names`, `aleatoria`. Cache por `nome@tamanho`.
- **Regra no prompt:** usar `NxTex` em vez de reescrever receita de textura.

## v2.7.0 — 2026-10-20

### Removido
- **SITE MODE por completo** — `SITE_DIRECTIVE`, `SITE_TERMS`, `isSiteCommand()` e o branch de site
  no `systemPrompt()`. NEXUS GAME tem um único modo: **jogo**. Qualquer comando gera jogo.

## v2.6.0 — 2026-10-20

### Adicionado
- **TEXTURA EM JOGO 2D (obrigatório)** no prompt — `createPattern` em cada peça/inimigo;
  proibido cor chapada; lava deve aparecer em TODAS as peças quando pedida.
- **PRIMEIRO FRAME (regra absoluta)** — campo, HUD e objeto ativo desenhados no boot, com `draw()`
  síncrono antes do `requestAnimationFrame`.
- **Resize nudge no shim** — dispara `resize` em 0/150/500/1200 ms e no `DOMContentLoaded` para
  jogos que mediram o viewport zerado.

## v2.5.1 — 2026-10-20

### Corrigido
- **Jogo grande parava em ~40 KB.** O provedor corta a saída e um único pedido de continuação era
  cortado no mesmo ponto. Agora `completarSeTruncado()` roda em **loop até 12x**, emendando sem
  whitespace, até o documento fechar em `</html>`. Verificado: 4 pedaços de ~29 KB → 71 KB
  emendados, canvas desenhando.

## v2.5.0 — 2026-10-20

### Removido
- **Seletor de nível de detalhe** (Simples/Médio/Rico) do modal de configurações. Modo game único.

### Adicionado
- **Seção DESEMPENHO — META 60 FPS CONSTANTES** no `GAME_DIRECTIVE`: um canvas e um loop,
  fundo em offscreen + `drawImage`, partículas com pool (40-60), proibição de blur/shadow em
  elemento animado, gradientes reaproveitados, colisão AABB, DPR cap 2, pausa em
  `visibilitychange`, `AudioContext` único.

## v2.4.0 — 2026-10-20

### Alterado
- **Produto 100% focado em jogos**: GAME passa a ser o modo padrão; SITE só quando o comando pede
  site/página explicitamente.
- Escopo do jogo derivado do nível escolhido (Simples/Médio/Rico) — depois unificado em v2.5.0.
- Identidade de "gerador de jogos" na UI (placeholder), `.desktop`, `package.json` e README.

## v2.3.0 — 2026-10-20

### Adicionado
- **30 temas restaurados** — 20 escuros + **10 claros** (rubi, tangerina, limão, esmeralda,
  turquesa, céu, lavanda, orquídea, areia, grafite); grupos ESCUROS/CLAROS no modal.
- **SITE_DIRECTIVE** + `isSiteCommand()` (rolagem, seções, hero, parallax, precedência sobre jogo).
- **`GAME_DIRECTIVE` completo** — 12 texturas processuais + 13 sons WebAudio + checklist + regras
  de tela + inferência automática de textura.
- **Storage polyfill (`nx-safe`)** — `localStorage`/`sessionStorage` em memória no iframe sandbox;
  sem ele qualquer jogo com recorde quebrava.
- **Detecção 3D/textura** — `cubo 3d`, `textura lava`, `planeta`, `shader`, `webgl`, `voxel`
  passam a ativar GAME MODE (antes caíam no prompt normal, sem receita de textura).
- **Regra de 3D simples** — cubo/esfera/planeta nunca saem com cor lisa.
- **Medição defensiva de viewport** — `innerWidth/innerHeight` podem vir 0 no iframe; medir em
  `requestAnimationFrame`, remedir em `resize`/`orientationchange` e em `setTimeout(300)`.

### Corrigido
- **TELA PRETA em todo jogo**: a emenda da resposta truncada inseria `\n`, quebrando tags partidas
  (`</scr` + `ipt>`); agora concatena sem separador.
- **Detecção de truncamento** por `finish_reason === 'length'` ou documento sem `</html>`.
- `themed()` reinyecta o polyfill em re-render/troca de tema.

### Removido
- Limite de `MAX_EDITS` (5 → sem limite) e teto de 32 edições (→ 200).

## Não publicado

### Adicionado
- **Shell Electron** — `desktop/main.js` + `desktop/server.js` abrem a interface em janela
  própria em janela normal (F11 alterna tela cheia, F12 DevTools), com instância única; o servidor local roda
  no mesmo processo (8790→8810 se a porta estiver ocupada) e links externos abrem em janela
  interna. `NEXUS-GAME.desktop`/`desktop/start.sh` são o caminho principal;
  `abrir.sh`/`serve.py` continuam como fallback no navegador
- **Fontes da pasta `fontes/`** — o seletor de fonte do modo edição lista apenas as fontes
  do projeto (`fontes/*.ttf|otf|woff|woff2`); `serve.py` serve `/fontes/` (JSON + arquivos)
- **SALVAR com nome limpo** — o diálogo abre com o nome pré-carregado sem carimbo de data e
  sem `.html`: página aberta sugere o próprio nome; geração nova sugere o slug do prompt
  (até 60 chars, fallback `pagina`); o Store anexa `.html` ao gravar

### Alterado
- **Janela detecta a resolução** — o shell abandonou o tamanho fixo (90% + teto 1600×900):
  abre na **área útil da tela detectada** (tela do cursor, ou a que contém a janela) e se
  reajusta quando a resolução, o DPI ou os monitores mudam (`display-metrics-changed`,
  `display-added`, `display-removed`)
- **Geração mais contida** — o prompt deixou de mandar "spectacular/particles/motion over
  static": efeitos agora são condicionais ao pedido, com no máximo um sistema de partículas
  sutil de apoio. O foco passa a ser composição/beleza, escopo fiel ao comando e orçamento de
  performance (um canvas, um loop, dpr 2, pausa com aba oculta); o nível "Rico" virou
  qualidade de engenharia, não quantidade de efeito

### Corrigido
- **Modo edição (popover)** — leitura de estilos reais do elemento: transparência de cores
  (`rgba()` com escape correto no shim), tamanho de fonte fracionário (`parseFloat`) e
  família de fonte computada
- **Página salva abre fora do app** — a sanitização do snapshot remove o shim e a página de
  fontes (`nx-fonts`/`fonts.css`) e devolve o three vendorizado à CDN pública (`unpkg`); o
  arquivo salvo funciona sozinho, sem depender do servidor local
- **Clique seleciona o elemento certo** — elementos com `pointer-events:none` e mídia
  full-screen (canvas/img/video/iframe) não são mais confundidos com overlay; a coleta
  reativa o hit-test só durante o clique e restaura em `finally`
- **Arrastar sem salto** — o arrasto mede a posição real depois de fixar o elemento (base em
  `left/top:0` + `getBoundingClientRect`), zera `right/bottom` e usa `box-sizing:border-box`;
  o deslocamento agora é delta puro (antes o primeiro movimento somava ao valor antigo)

## 2.2.0 — 2026-10-19

Modo de edição visual de elementos: clicar na página gerada e ajustar na mão.

### Adicionado
- **Modo edição** (`✎ EDITAR` / `✔ FINALIZAR`) — ao entrar, **congela todas as animações**
  (CSS + loops `requestAnimationFrame`) de forma **reversível**; ao finalizar, tudo volta
- **Seleção por clique** — 1 clique só seleciona o elemento (contorno tracejado neon,
  sem `border`, então nada empurra o layout)
- **Popover ancorado ao elemento** (228px) — abre por **duplo clique**, nunca sozinho
- **Controles por tipo de elemento:**
  - **texto** → conteúdo, fonte, cor
  - **SVG** → preenchimento (`fill`) e contorno (`stroke`)
  - **canvas** → nota explicando que o conteúdo é pixel (não DOM) + fundo e tamanho
  - **objeto** → cor (fundo) e tamanho
- **Transparência (alpha)** em cada seletor de cor, com o valor real do elemento
- **Valores reais** no popover (`getComputedStyle` + `getBoundingClientRect`), nunca defaults
- **Arrastar direto** — elemento selecionado já é arrastável (limiar de 4px para o clique
  simples não mover)
- **Redimensionar pelas bordas** — a 10px da borda/canto o cursor vira `*-resize`
- **Ctrl+Z (desfazer)** com pilha de 200 ações + **contador `↩ N`** no popover; desfaz cor,
  tamanho, texto, mover, redimensionar e **excluir**
- **Popover arrastável** pela alça `⠿`, com posição fixada que sobrevive à reconstrução
- **Drill-down de camadas** — camadas decorativas full-screen (vignette/partículas/sem texto)
  são ignoradas; clique repetido ou Ctrl+clique desce um nível (jogos)
- **Ramos SVG e canvas** no popover (era a causa de "alguns elementos não dá para editar")
- **Diretiva `EDIT_FRIENDLY`** no prompt — a IA passa a gerar código estruturalmente
  compatível com o editor: cada peça com `id`, canvas só para o fundo, 1 nó de texto por
  frase, sem `!important`, sem overlay full-screen, layout em flex/grid

### Alterado
- **FINALIZAR grava o HTML editado como documento oficial** — as edições deixam de se perder
  ao trocar de tema, gerar de novo ou salvar
- **Popover não abre no clique simples** — selecionar, arrastar e redimensionar ficaram
  fluidos; o popover só aparece sob pedido
- **Durante arrasto/redimensionamento o popover desaparece** para não obstruir a visão
- **Ctrl+Z funciona com o foco dentro da página** (handler também no shim do iframe)
- **Ctrl+Z não abre mais o popover** quando ele estava fechado

### Corrigido
- Indicador de seleção não aparecia (`var()` em `outline` shorthand é rejeitado pelo Chrome)
- O snapshot do FINALIZAR removia o shim do DOM vivo, matando a ponte de edição
- Cursor de redimensionamento mudo nos cantos (ordem das letras `"es"` vs `"se"`)
- `|` perdido vazando no `BASE_PROMPT`

## 1.5.0 — 2026-10-19

### Adicionado
- **20 temas NEGRO coloridos** com paleta multicolorida (`colors[]`) enviada no prompt da IA — resultados vibrantes com múltiplas cores
- **Pixel art cyber na welcome page**: canvas com chuva de partículas coloridas em pixel art abaixo do título
- **Preview de tema por hover**: passar o mouse no ⚙ troca o shell ao vivo, mouseleave restaura
- **Auto-focus no iframe**: teclado funciona sem precisar clicar na página (WASD, setas, espaço)
- **Auto-redirect file:// → http**: abre automaticamente pelo servidor local se estiver rodando
- **Atalho Super+N**: tecla de atalho no Hyprland para abrir o NEXUS GAME
- **Sandbox do iframe**: `allow-pointer-lock`, `allow-popups`, `keyboard-lock`, `autoplay` — jogos 3D funcionam

### Alterado
- **Temas**: removidos 15 temas antigos → 20 temas NEGRO com paletas multicoloridas
- **Prompt nível Rico**: diretriz técnica detalhada (antialias, shadowMap, delta time, dispose, resize handler, dpr cap)
- **Texto mínimo no prompt**: "titles only, no paragraphs, graphics over words"
- **VU meter**: 10 barras/2 ondas → 5 barras largas/5 ondas senoidais sobrepostas, degradê 3 stops, brilho extra
- **Botões (reset, gear, SALVAR/ABRIR)**: borda, hover scale, transição suave
- **Pasta renomeada**: `mexus-desktop/` → `nexus-game/`

### Corrigido
- **Travamento em edição**: `editCount` não declarada → `ReferenceError` → "gerando…" infinito
- **Loop infinito no fallback**: `run(baseSystem)` reenviava página atual → IA tratava como edição de novo; agora usa `userFresh` (só o comando)
- **Feedback de fallback**: agora mostra "⚠️ regenerando…" quando o patch falha

## 1.4.0 — 2026-10-18

### Alterado (visual)

- **Tela de apresentação redesenhada**: removidos o cubo 3D girando, o texto de apoio,
  o aviso de chave e os chips de sugestão.
- Título **NEXUS GAME** grande com animação elaborada: entrada letra a letra
  (elevação + desfoque), gradiente com brilho em movimento (shimmer), halo pulsante e
  linha expansível; respeita `prefers-reduced-motion`.
- O aviso de API key continua no status da barra superior.
- `AiClient.VERSION` → `1.3.0`.

## 1.2.4 — 2026-10-18

### Alterado (textos)

- Marca exibida trocada de **MEXUS-DESKTOP** para **NEXUS GAME**: título da janela,
  header, welcome, títulos das páginas (erro/lista), `BASE_PROMPT`, banner do `serve.py`,
  mensagens de erro e log do console.
- Atalho renomeado para `NEXUS-GAME.desktop` (a pasta do projeto continua
  `nexus-game/`).
- `AiClient.VERSION` → `1.2.4`.

## 1.2.3 — 2026-10-18

### Alterado (somente visual)

- **Removido o botão enviar**; o envio é feito com **Enter** no prompt (já era suportado).
- `app.js` sem referências a `sendBtn`; CSS sem a regra `.send`; prompt ganhou o espaço
  que era do botão.
- Nenhum ID ou lógica alterada; `AiClient.VERSION` → `1.2.3`.

## 1.2.2 — 2026-10-18

### Alterado (somente visual)

- **Prompt, botão enviar e ⚙ movidos para a barra superior**; a barra inferior foi
  removida. A linha única agora é: marca → sessão → prompt/enviar → status → VU/KB →
  SALVAR/ABRIR → **⚙ no canto direito**.
- Ganho de mais ~60 px de altura para o palco (iframe).
- Abaixo de 1000 px o rótulo de tokens é ocultado e o modelo encolhe (`@media`).
- Nenhum ID ou lógica alterada; `AiClient.VERSION` → `1.2.2`.

## 1.2.1 — 2026-10-18

### Alterado (somente visual)

- **Cabeçalho compacto em linha única** (desktop): marca → dot/modelo → barra e rótulo de
  tokens → reset → status → VU/KB → SALVAR/ABRIR. Ganho de ~50 px de altura para o palco.
- Status truncado com reticências e `title` (tooltip) com o texto completo.
- Abaixo de 920 px o cabeçalho quebra em duas linhas (`@media` no `app.css`).
- Nenhum ID ou lógica alterada; `AiClient.VERSION` → `1.2.1`.

## 1.2.0 — 2026-10-18

### Adicionado

- **Edição cirúrgica no refino**: com uma página em tela, o system prompt recebe
  `EDIT_DIRECTIVE` e o modelo devolve só `{"edits":[{"find":"…","replace":"…"}]}`.
  `Html.applyEdits` aplica os trechos no documento atual (match exato, tolerância a CRLF);
  o resto da página permanece intacto — uma edição simples deixa de reescrever todo o
  código (e o custo de saída cai de KBs para dezenas de tokens).
- Fallback seguro em cadeia: patch válido → HTML completo (`looksLikeDocument`) →
  nova chamada com o prompt base (documento completo).
- `Html.EDIT_DIRECTIVE`, `Html.applyEdits`, `Html.looksLikeDocument`; `AiClient.VERSION`
  agora `1.2.0`.

### Notas

- A **criação** de uma página continua devolvendo o documento completo (contrato original).
- O refino comprovadamente envia a página atual (`Current page` + documento); o que mudou
  é o formato da resposta.

### Validação

- Matriz de 14 testes executada em 2026-10-18 (sintaxe, unit, E2E de geração, refino
  cirúrgico, fallback, proxy/CORS, paths, bridge e launcher) — ver `docs/VALIDACAO.md`.

## 1.1.0 — 2026-10-18

### Corrigido

- **`Failed to fetch`** ao gerar com provedores que não liberam CORS no POST (ex.: OpenAI):
  adicionado `serve.py` com proxy `/_proxy?url=...` e fallback automático no `ai-client.js`
  (proxy → direto). O app agora mostra a mensagem real da API (ex.: chave inválida).
- **Cache de JS**: `serve.py` envia `Cache-Control: no-store`; um reload sempre pega o
  código atualizado (antes o navegador reutilizava o `ai-client.js` antigo).
- **`file://`**: mensagem explícita ("file:// bloqueia chamadas à API (CORS) — abra pelo
  atalho NEXUS GAME") em vez do genérico "Failed to fetch".

### Adicionado

- `abrir.sh` + `NEXUS-GAME.desktop`: atalho de duplo clique que sobe o proxy
  invisivelmente e abre o navegador.
- `AiClient.VERSION` (`1.1.0`), exibida no rodapé do ⚙ e no console — confirma qual
  código o navegador carregou.
- Primeiro SALVAR pede a pasta (File System Access); cancelar cai em IndexedDB + download.
- "Abrir HTML…" usa um modal no shell ("Escolher arquivo…") para garantir a ativação
  de usuário do seletor.

## 1.0.0 — 2026-10-18

Primeiro port completo do NEXUS77 (Android/Kotlin) para o navegador.

### Adicionado

- Shell desktop (`web/index.html` + `css/app.css`): header com marca, SALVAR/ABRIR,
  linha de sessão (dot, modelo, barra e rótulo de tokens, reset), VU meter + KB + status,
  palco em iframe e barra de comando.
- `themes.js`: 15 temas (12 escuros + 3 claros) com `hexA()` em `#RRGGBBAA`.
- `prefs.js`: persistência em `localStorage["nexus77"]` (inclui contadores de sessão).
- `html-builder.js`: port fiel de `Html.kt` — `BASE_PROMPT`, `systemPrompt`,
  `detailDirective`, `userPrompt`, `extractDocument`, `decorate`, `varsCss`, `baseCss`,
  `welcomePage`, `errorPage`, `savedListPage`, `esc`, `escAttr` e `rewriteLibs`.
- `ai-client.js`: port de `AiClient.kt` com `fetch` + streaming SSE, progresso em bytes
  decodificados, fallback não-streaming em HTTP 4xx, timeouts (20 s / 600 s / 60 s),
  `listModels` e `errorMessage`.
- `store.js`: port de `Store.kt` com File System Access (handle no IndexedDB,
  permissões em clique) e fallback IndexedDB + download; normalização de nome e meta
  tamanho/data.
- `vu-meter.js`: port de `VuMeterView` para canvas 2D (10 cubos, onda de senos 1400 ms).
- `settings.js`: modal equivalente à `SettingsActivity` (API, geração, tema, busca de
  modelos) + toast global.
- `app.js`: port de `MainActivity` — geração/refino, sessão, temas, salvar/abrir/excluir,
  arquivo local, atalhos e bridge.
- Bridge `window.Nexus77` → shell via `postMessage`, com iframe
  `sandbox="allow-scripts"` (sem acesso ao `localStorage`/API key).
- three.js local (`web/vendor/three/`), com reescrita de CDN apenas no render.
- Docs: `README.md`, `DOCUMENTACAO.md`, `MAPA_UI.md`, `BASE_REUTILIZAVEL.md`.

### Decisões/adaptações

- `decorate(html, theme)` (ordem de parâmetros invertida em relação ao Kotlin).
- `Downloads/nexus77` → pasta escolhida pelo usuário (rótulo "pasta nexus77").
- Toasts nativos → toast do shell; `SettingsActivity` → modal; back → ESC/‹ Voltar.
- Mantidos quirks do Kotlin: filtro `it > 0` em `extractDocument` (doctype na posição 0
  é descartado) e `esc` sem escape de `>`/aspas.

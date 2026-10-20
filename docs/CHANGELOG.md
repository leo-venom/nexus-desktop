# Changelog — NEXUS GAME

## v2.7.0 — 2026-10-20

### Removido
- **SITE MODE por completo** — `SITE_DIRECTIVE`, `SITE_TERMS`, `isSiteCommand()` e o branch de site
  no `systemPrompt()`. NEXUS GAME tem um único modo: **jogo**. Qualquer comando gera jogo.

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

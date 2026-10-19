# Changelog — NEXUS-DESKTOP

## 1.5.0 — 2026-10-19

### Adicionado
- **20 temas NEGRO coloridos** com paleta multicolorida (`colors[]`) enviada no prompt da IA — resultados vibrantes com múltiplas cores
- **Pixel art cyber na welcome page**: canvas com chuva de partículas coloridas em pixel art abaixo do título
- **Preview de tema por hover**: passar o mouse no ⚙ troca o shell ao vivo, mouseleave restaura
- **Auto-focus no iframe**: teclado funciona sem precisar clicar na página (WASD, setas, espaço)
- **Auto-redirect file:// → http**: abre automaticamente pelo servidor local se estiver rodando
- **Atalho Super+N**: tecla de atalho no Hyprland para abrir o NEXUS-DESKTOP
- **Sandbox do iframe**: `allow-pointer-lock`, `allow-popups`, `keyboard-lock`, `autoplay` — jogos 3D funcionam

### Alterado
- **Temas**: removidos 15 temas antigos → 20 temas NEGRO com paletas multicoloridas
- **Prompt nível Rico**: diretriz técnica detalhada (antialias, shadowMap, delta time, dispose, resize handler, dpr cap)
- **Texto mínimo no prompt**: "titles only, no paragraphs, graphics over words"
- **VU meter**: 10 barras/2 ondas → 5 barras largas/5 ondas senoidais sobrepostas, degradê 3 stops, brilho extra
- **Botões (reset, gear, SALVAR/ABRIR)**: borda, hover scale, transição suave
- **Pasta renomeada**: `mexus-desktop/` → `nexus-desktop/`

### Corrigido
- **Travamento em edição**: `editCount` não declarada → `ReferenceError` → "gerando…" infinito
- **Loop infinito no fallback**: `run(baseSystem)` reenviava página atual → IA tratava como edição de novo; agora usa `userFresh` (só o comando)
- **Feedback de fallback**: agora mostra "⚠️ regenerando…" quando o patch falha

## 1.4.0 — 2026-10-18

### Alterado (visual)

- **Tela de apresentação redesenhada**: removidos o cubo 3D girando, o texto de apoio,
  o aviso de chave e os chips de sugestão.
- Título **NEXUS-DESKTOP** grande com animação elaborada: entrada letra a letra
  (elevação + desfoque), gradiente com brilho em movimento (shimmer), halo pulsante e
  linha expansível; respeita `prefers-reduced-motion`.
- O aviso de API key continua no status da barra superior.
- `AiClient.VERSION` → `1.3.0`.

## 1.2.4 — 2026-10-18

### Alterado (textos)

- Marca exibida trocada de **MEXUS-DESKTOP** para **NEXUS-DESKTOP**: título da janela,
  header, welcome, títulos das páginas (erro/lista), `BASE_PROMPT`, banner do `serve.py`,
  mensagens de erro e log do console.
- Atalho renomeado para `NEXUS-DESKTOP.desktop` (a pasta do projeto continua
  `nexus-desktop/`).
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
  atalho NEXUS-DESKTOP") em vez do genérico "Failed to fetch".

### Adicionado

- `abrir.sh` + `NEXUS-DESKTOP.desktop`: atalho de duplo clique que sobe o proxy
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

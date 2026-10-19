# Documentação — NEXUS-DESKTOP

Port desktop do **NEXUS77** (Android/Kotlin). O app é um shell que conversa com uma API
estilo OpenAI e renderiza o HTML gerado pela IA em um iframe isolado.

## 1. Visão geral

```text
[prompt] -> app.sendPrompt()
        -> Html.systemPrompt(theme, detailLevel) + Html.userPrompt(prompt, lastRendered)
        -> AiClient.chat(...)            (streaming SSE; progresso em bytes)
        -> Html.extractDocument(texto)   (criação: documento completo)
           ou Html.applyEdits(doc, texto) (refino: edições cirúrgicas)
        -> app.themed(doc)               (decora com --nx-* do tema)
        -> app.render(doc)               (rewriteLibs -> injectShim -> iframe.srcdoc)
```

O documento canônico (`lastRendered`) guarda as URLs de CDN; o rewrite para o vendor
local acontece **somente no render**, então salvar/refinar continua portátil.

## 2. Arquivos

### web/index.html
Shell estático: **uma linha no topo** com marca, sessão, prompt (**Enter envia**), status,
VU/KB, SALVAR/ABRIR e ⚙ (canto direito); `iframe#frame` ocupa o restante. Não há barra
inferior nem botão enviar. Carrega os scripts na ordem: themes → prefs → html-builder →
ai-client → store → vu-meter → settings → app.

### web/css/app.css
Layout do shell e dos modais. Todas as cores vêm de variáveis `--nx-*` aplicadas em
`document.documentElement` por `app.applyTheme()`; `--mx-error` é derivado do tema.

### web/js/themes.js
15 temas (`T(name, background, surface, surfaceAlt, accent, text, secondary, isDark)`),
com `onAccent` calculado. Exporta `{ALL, of, hexA}`; `hexA('#RRGGBB', alpha)` devolve
`#RRGGBBAA` (CSS válido, alpha por último).

### web/js/prefs.js
Persistência em `localStorage["nexus77"]` (JSON). Chaves: `endpoint`, `apiKey`, `model`,
`temperature`, `maxTokens`, `themeIndex`, `detailLevel`, `sessionTokens`,
`sessionPromptTokens`, `sessionCompletionTokens`. API: `get/set/data`, `hasKey`,
`endpoint()`, `apiKey()`, `model()`, `temperature()` (0–2), `maxTokens()` (>=0),
`themeIndex()`, `detailLevel()` (0–2), `addSessionTokens`, `resetSessionTokens`.

### web/js/html-builder.js
Port de `Html.kt`. Exporta `window.Html`:

| função | papel |
| --- | --- |
| `BASE_PROMPT` | regras da geração (marca NEXUS-DESKTOP) |
| `systemPrompt(theme, level)` | prompt + diretriz de detalhe + paleta exata |
| `detailDirective(level)` | 0 mínimo / 1 padrão / 2 máximo |
| `userPrompt(cmd, doc)` | anexa a página atual para edição |
| `extractDocument(raw)` | remove cercas e corta até `<!doctype`/`<html` |
| `varsCss(theme)` / `baseCss()` | bloco `<style id="nx77-base">` |
| `decorate(html, theme)` | injeta viewport (se faltar) + CSS base |
| `welcomePage(theme, hasKey)` | tela de apresentação: título animado (letra a letra, shimmer, halo e linha) |
| `errorPage(theme, title, detail)` | cartão de erro |
| `savedListPage(theme, entries)` | lista de salvos (ponte `Nexus77.*`) |
| `esc` / `escAttr` | escape de texto/atributo |
| `rewriteLibs(html, base)` | CDN do three.js → `vendor/three/` |
| `EDIT_DIRECTIVE` | instrução de edição cirúrgica (JSON `find/replace`) |
| `applyEdits(doc, raw)` | aplica `{edits:[{find,replace}]}`; `{ok:false}` se não casar |
| `looksLikeDocument(raw)` | detecta HTML completo (usado no fallback) |

Observações de fidelidade:
- `extractDocument` mantém o filtro `it > 0`: um `<!DOCTYPE>` na posição 0 é descartado
  (comportamento idêntico ao Kotlin).
- `esc` escapa só `&` e `<`; `escAttr` também escapa `"` (igual ao original).
- A assinatura JS é `decorate(html, theme)` (no Kotlin era `decorate(theme, html)`).

### web/js/ai-client.js
Port de `AiClient.kt` com `fetch`:

- `buildUrl(endpoint, suffix)` aceita endpoint com `/v1`, `/models` ou `/chat/completions`;
- `chat(...)` tenta **streaming** (`stream:true` + `stream_options.include_usage`) e, se a
  resposta for HTTP 4xx, repete **sem streaming**;
- usa `/_proxy` do `serve.py` quando a página está em http(s); se o proxy não existir
  (404/501) ou falhar na rede, cai no fetch direto (provedores com CORS);
- progresso: `onProgress(bytes)` recebe o total acumulado de bytes UTF-8 de
  `delta.content` (tamanho real do documento em formação);
- timeouts: conexão 20 s; leitura ociosa 600 s (reset a cada chunk); `/models` 60 s;
- erros: `AiException` com `HTTP <code>: <corpo>` ou `resposta vazia do servidor`;
- `errorMessage(e)` extrai `error.message`/`message` do JSON ou devolve o texto (200 chars);
- `VERSION` (`1.1.0`) — exibida no rodapé do ⚙ e no console;
- em `file://` não há proxy possível: o erro vira uma mensagem explícita sobre CORS.

### web/js/store.js
Port de `Store.kt` adaptado ao desktop:

- **preferencial**: `showDirectoryPicker` (File System Access). O handle fica no IndexedDB
  (`meta.dir`); `queryPermission`/`requestPermission` são chamados em cliques.
- **fallback**: IndexedDB (`files`) + download `<a download>` no save.
- `fileName(raw)` normaliza (`[\\/:*?"<>|\r\n\t]+` → `-`, trim de pontos, máx. 80 + `.html`);
- `meta(item)` = tamanho (`B` / `KB` / `MB`) + data `dd/MM HH:mm`.

### web/js/vu-meter.js
Port de `VuMeterView.kt`: canvas 2D, 10 cubos, `gap = w*0.06`,
`barW = (w - gap*9)/10`, raio `barW*0.42`, onda de senos com smoothstep em 1400 ms,
trilho esmaecido + degradê + cap aceso. `attach(canvas)` devolve
`{start, stop, setColors, setTheme, resize}`.

### web/js/settings.js
Modal equivalente à `SettingsActivity`: seções API / GERAÇÃO / TEMA, "ver chave",
"Buscar modelos" (com diálogo de escolha), temperatura 0–2 (slider 0–200), nível de
detalhe (Simples/Médio/Rico), max tokens, temas agrupados ESCUROS/CLAROS e
"Salvar configurações". Validações: endpoint precisa começar com `http`; chave
obrigatória para buscar modelos. `Settings.toast(msg)` é o toast global.

### web/js/app.js
Port de `MainActivity.kt`: estado (`lastRendered`, `lastPrompt`, `generating`,
`showingList`, contadores ao vivo), UI, fluxo de geração, sessão, salvar/abrir/excluir,
tema e bridge. Ver `MAPA_UI.md` para as âncoras.

## 3. Fluxo de geração

1. `sendPrompt()` valida prompt vazio e presença de API key (abre ⚙ se faltar).
2. Monta `system`/`user`, estima `liveIn = (bytes(system)+bytes(user))/4`.
3. `AiClient.chat(...)` — cada chunk atualiza `kbLabel` (máx. ~16×/s) e `liveOut = bytes/4`.
4. Sucesso: `extractDocument`; se vazio → `failGeneration("resposta vazia do modelo")`.
5. `lastRendered = doc`; `render(themed(doc))`; status
   `✓ N KB • X.Xs • modelo • ↑p ↓c tok` (sufixo só quando `totalTokens > 0`).
6. Falha: status `✗ mensagem`; se não havia página, mostra `errorPage`; toast; libera UI.

### Edição cirúrgica (refino)

Com `lastRendered` existente, o app usa `EDIT_DIRECTIVE` no system prompt (sobrepõe a
regra de devolver o documento inteiro). O modelo responde:

```json
{"edits":[{"find":"<trecho exato do documento atual>","replace":"<novo trecho>"}]}
```

`Html.applyEdits` aplica os trechos em sequência sobre o documento atual (match exato;
tolera CRLF nas duas direções). O restante da página fica **byte a byte intacto** — só o
pedido muda (ex.: um título), sem reescrever o código todo. Limites: até 32 edições
(a diretriz pede ≤ 8) e `find` não vazio.

Fallback seguro, em ordem:
1. patch aplicado → usa o resultado;
2. resposta é HTML completo (`looksLikeDocument`) → usa `extractDocument`;
3. senão → **refaz a chamada** com o prompt base (documento completo).

Assim, uma edição simples não regenera a página inteira; e se o modelo não cooperar, o
resultado continua correto.

## 4. Sessão e tokens

`updateSessionUi()` mostra dot (accent/erro), modelo (ou "sem API key"), barra e rótulo
`~↑entrada ↓saída · usado/1M`. Durante a geração os valores são estimados (`~`); ao final
`addSessionTokens(prompt, completion)` grava os exatos. `↺` zera a sessão e volta à welcome
(bloqueado durante geração).

## 5. Temas

`applyTheme()` define `--nx-bg`, `--nx-surface`, `--nx-surface-alt`, `--nx-accent`,
`--nx-accent-soft` (140), `--nx-accent-faint` (20), `--nx-text`, `--nx-secondary`,
`--nx-on-accent` e `--mx-error`. Ao salvar configurações com tema diferente,
`themed(lastRendered)` substitui o bloco `<style id="nx77-base">` existente (ou decora),
sem chamar a IA.

## 6. Salvar / abrir / excluir

- **SALVAR**: exige página; diálogo com nome sugerido (`slug do último prompt + yyyyMMdd-HHmm.html`).
  No **primeiro** save, se o navegador suportar File System Access e ainda não houver pasta,
  o seletor de pasta é aberto (cancelar cai no fallback). Grava
  `themed(lastRendered)` na pasta escolhida (ou IndexedDB + download).
- **ABRIR**: lista a pasta/IndexedDB e renderiza `Html.savedListPage`; o clique chama
  `Nexus77.openSaved`, `Nexus77.deleteSaved`, `Nexus77.pickFile` (arquivo local) e
  `Nexus77.closeList` via postMessage. `pickFile` abre um modal no shell com
  "Escolher arquivo…" (o clique no shell garante a ativação de usuário do seletor).
- **Excluir**: confirmação e `Store.remove`.

## 7. Bridge e segurança

O iframe usa `sandbox="allow-scripts"` (sem `allow-same-origin`): a página gerada tem
origem opaca e **não** alcança o shell. O shim injetado em cada render define
`window.Nexus77` e envia `{__nx:1, m, a}` por `postMessage`; o shell valida
`e.source === frame.contentWindow` e uma whitelist antes de executar. Links externos são
interceptados e abertos em nova aba (`openUrl`).

## 8. Proxy local (CORS)

`serve.py` (raiz do projeto) serve `web/` e expõe `/_proxy?url=<alvo>` (GET/POST):
repassa `Authorization`, `Content-Type` e o corpo, e devolve a resposta em streaming.
O navegador fala com `http://127.0.0.1:8790` (mesma origem), então não há preflight/CORS.

Motivo: a OpenAI responde ao preflight, mas o `POST /v1/chat/completions` **não** inclui
`Access-Control-Allow-Origin` — o navegador bloqueia com "Failed to fetch". O proxy
resolve para qualquer provedor (OpenAI, gateways, servidores locais).

O `ai-client.js` tenta o proxy primeiro; se `/_proxy` não existir (404/501 — ex.:
`python3 -m http.server`), cai no fetch direto. Funções: `proxyUrl`, `isMissingProxy`,
`isNetworkFailure`, `withProxyFallback`.

O `serve.py` envia `Cache-Control: no-store` em todas as respostas (inclusive no proxy):
um reload sempre pega o HTML/JS atuais (evita rodar um `ai-client.js` antigo do cache).

## 9. Abrir por `file://` (limitação) e o atalho

Abrir `web/index.html` direto do disco **não funciona** para provedores sem CORS:
a origem é `null`, e a OpenAI não envia `Access-Control-Allow-Origin` no
`POST /v1/chat/completions` → o navegador bloqueia ("Failed to fetch"). Não há como
contornar com HTML/JS (regra de segurança do navegador).

Solução: `abrir.sh` (ou `NEXUS-DESKTOP.desktop`) sobe o `serve.py` se necessário e abre
`http://127.0.0.1:8790/`. O script verifica a porta com `curl`, inicia o servidor
destacado (`setsid`) e chama `xdg-open`. Log em `/tmp/nexus-desktop.log`.

## 10. Requisitos

- Navegador moderno (Chromium, Firefox ou Safari recentes). File System Access é
  exclusivo do Chromium; nos demais o fallback IndexedDB/download assume.
- Abrir pelo atalho/`serve.py` (`http://127.0.0.1:8790`). `file://` bloqueia a API
  (CORS) e mostra uma mensagem explicativa.

## 11. Validação

A matriz de testes (14 itens) e as evidências estão em `VALIDACAO.md`: sintaxe e testes
unitários; E2E de geração e refino cirúrgico (patch + fallback); proxy/CORS; paths;
bridge; launcher.

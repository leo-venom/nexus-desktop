# Mapa da UI — NEXUS-DESKTOP

Todo elemento de tela com `arquivo:linha` + âncora e o código que o controla.
Consulte antes de mexer em qualquer UI.

## Shell (index.html)

| Elemento | Local | Âncora | Comportamento |
| --- | --- | --- | --- |
| Marca "NEXUS-DESKTOP" | `web/index.html:13` | `#brand` | cor via `--nx-accent` (`app.js:48 applyTheme`) |
| Dot da sessão | `web/index.html:14` | `#dot` | `app.js:73 updateSessionUi` (accent/erro) |
| Modelo em uso | `web/index.html:15` | `#model` | `app.js:73 updateSessionUi` ("sem API key" sem chave) |
| Barra de tokens | `web/index.html:16` | `#tfill` | `app.js:73 updateSessionUi` (usado/1M) |
| Rótulo de tokens | `web/index.html:17` | `#tlabel` | `app.js:73 updateSessionUi` (`~↑ ↓ · usado/1M`) |
| Reset da sessão | `web/index.html:18` | `#btn-reset` | `app.js:270 resetSession` |
| Prompt | `web/index.html:19` | `#prompt` | **Enter envia** (sem botão) → `app.js:179 sendPrompt` |
| Status | `web/index.html:21` | `#status` | `app.js:91 status(text, kind, end)` (tooltip com texto completo) |
| VU meter | `web/index.html:22` | `#vu` | `vu-meter.js:23 attach` (start `:100`, stop `:109`) |
| KB ao vivo | `web/index.html:23` | `#kb` | `app.js:159 setLoading` + `:170 onGenProgress` |
| Botão SALVAR | `web/index.html:24` | `#btn-save` | `app.js:310 requestSave` → `:318 showSaveDialog` → `:369 savePage` |
| Botão ABRIR | `web/index.html:25` | `#btn-open` | `app.js:395 openSavedList` |
| Botão ⚙ | `web/index.html:26` | `#btn-gear` | `settings.js:43 open` (canto direito) |
| Palco (iframe) | `web/index.html:30` | `#frame` | `app.js:130 render` (`:116 injectShim`, `:136 themed`) |

Tudo em **uma linha no topo**: marca → sessão → prompt (Enter envia) → status → VU/KB →
SALVAR/ABRIR → ⚙ (canto direito). **Sem barra inferior e sem botão enviar.** Abaixo de
1000 px o rótulo de tokens some e o modelo encolhe (`@media` no `app.css`).

## Modais e páginas internas

| Elemento | Local | Âncora | Comportamento |
| --- | --- | --- | --- |
| Modal de configurações | `web/js/settings.js:43` | `Settings.open` | seções API/GERAÇÃO/TEMA; fecha por ✕, ESC ou clique no fundo (`:155 close`, `:174`) |
| "ver chave" | `web/js/settings.js:75` | `showKey` | alterna `password`/`text` |
| Slider de temperatura | `web/js/settings.js:99` | `tempBar` | rótulo `Temperatura: %.2f` |
| "Buscar modelos" | `web/js/settings.js:207` | `fetchBtn` | valida endpoint/chave, `AiClient.listModels` |
| Diálogo de modelos | `web/js/settings.js:180` | `showModels` | lista com pré-seleção; clique preenche o campo |
| Salvar configurações | `web/js/settings.js:235` | `saveBtn` | grava prefs, toast, `onSaved` |
| Toast global | `web/js/settings.js:19` | `Settings.toast` | `#mx-toast`, 2,4 s |
| Versão do cliente | `web/js/settings.js:153` | `.mx-ver` | `ai-client v1.3.0 · origem` |
| Diálogo Salvar página | `web/js/app.js:318` | `showSaveDialog` | nome sugerido `app.js:297 defaultSaveName`; 1º save pede a pasta (FSA) |
| Abrir HTML (modal) | `web/js/app.js:438` | `pickHtmlFile` | "Escolher arquivo…" com gesto real no shell |
| Confirmação de exclusão | `web/js/app.js:492` | `deleteSaved` | `Store.remove` + recarrega lista |
| Welcome | `web/js/html-builder.js:232` | `welcomePage` | título animado (sem cubo/textos) |
| Erro | `web/js/html-builder.js:207` | `errorPage` | "Falha na geração" só sem página prévia |
| Lista de salvos | `web/js/html-builder.js:238` | `savedListPage` | botões chamam `Nexus77.*` (postMessage) |

## Ponte (bridge)

| Método | Origem | Destino |
| --- | --- | --- |
| `Nexus77.setInput` | página (chips) | `app.js:565 MxShell.setInput` |
| `Nexus77.openSaved` | lista | `MxShell.openSaved` → `app.js:413` |
| `Nexus77.closeList` | lista | `MxShell.closeList` → `app.js:428` |
| `Nexus77.pickFile` | lista | `MxShell.pickFile` → `app.js:438` |
| `Nexus77.deleteSaved` | lista | `MxShell.deleteSaved` → `app.js:492` |
| `Nexus77.* → openUrl` | links | `MxShell.openUrl` (nova aba) |
| Whitelist/listener | `app.js:582` / `:586` | valida `e.source` e método |

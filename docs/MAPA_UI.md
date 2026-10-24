# Mapa da UI — NEXUS GAME

> ⚠️ **DOCUMENTO HISTÓRICO (pós-2.2.0)** — as referências `arquivo:linha` são da era v2.2 e
> já não batem com o código atual (v3.0.1). Use como mapa conceitual; para números atuais,
> consulte [`ESTADO_ATUAL.md`](ESTADO_ATUAL.md) e [`DOCUMENTACAO.md`](DOCUMENTACAO.md).

Todo elemento de tela com `arquivo:linha` + âncora e o código que o controla.
Consulte antes de mexer em qualquer UI. Linhas conferidas no working tree pós-2.2.0 (out/2026).

## Shell (index.html)

| Elemento | Local | Âncora | Comportamento |
| --- | --- | --- | --- |
| Marca "NEXUS GAME" | `web/index.html:13` | `#brand` | cor via `--nx-accent` (`app.js:54 applyTheme`) |
| Dot da sessão | `web/index.html:14` | `#dot` | `app.js:79 updateSessionUi` (accent/erro) |
| Modelo em uso | `web/index.html:15` | `#model` | `app.js:79 updateSessionUi` ("sem API key" sem chave) |
| Barra de tokens | `web/index.html:16` | `#tfill` | `app.js:79 updateSessionUi` (usado/1M) |
| Rótulo de tokens | `web/index.html:17` | `#tlabel` | `app.js:79 updateSessionUi` (`~↑ ↓ · usado/1M`) |
| Reset da sessão | `web/index.html:18` | `#btn-reset` | `app.js:561 resetSession` (bloqueado durante geração) |
| Prompt | `web/index.html:19` | `#prompt` | **Enter envia** (`app.js:1275`) → `app.js:428 sendPrompt` |
| Status | `web/index.html:21` | `#status` | `app.js:97 status(text, kind, end)` (tooltip com texto completo) |
| VU meter | `web/index.html:22` | `#vu` | `vu-meter.js:23 attach` (start `:112`, stop `:121`) |
| KB ao vivo | `web/index.html:23` | `#kb` | `app.js:408 setLoading` + `:419 onGenProgress` |
| Botão ✎ EDITAR | `web/index.html:24` | `#btn-edit` | `app.js:1252` (entra no modo edição — ver seção) |
| Botão ✔ FINALIZAR | `web/index.html:25` | `#btn-finalize` | `app.js:1263` (snapshot + fontes + sai do modo) |
| Botão SALVAR | `web/index.html:26` | `#btn-save` | `app.js:602 requestSave` → `:610 showSaveDialog` → `:661 savePage` |
| Botão ABRIR | `web/index.html:27` | `#btn-open` | `app.js:687 openSavedList` |
| Botão ⚙ | `web/index.html:28` | `#btn-gear` | `settings.js:43 open` (canto direito) |
| Palco (iframe) | `web/index.html:32` | `#frame` | `app.js:354 render` (`:298 injectShim`, `:364 themed`); `sandbox="allow-scripts allow-pointer-lock allow-popups"` |

Tudo em **uma linha no topo**: marca → sessão → prompt (Enter envia) → status → VU/KB →
✎/✔ → SALVAR/ABRIR → ⚙ (canto direito). **Sem barra inferior e sem botão enviar.** Abaixo
de 1000 px o rótulo de tokens some e o modelo encolhe (`@media` no `app.css`).

Scripts no fim do body, em ordem de dependência — `index.html:36-43`:
`themes.js` (36), `prefs.js` (37), `html-builder.js` (38), `ai-client.js` (39),
`store.js` (40), `vu-meter.js` (41), `settings.js` (42), `app.js` (43).

## Modo edição (✎ EDITAR / ✔ FINALIZAR)

| Elemento | Local | Âncora | Comportamento |
| --- | --- | --- | --- |
| Entrar no modo | `app.js:1252` | `editBtn` click | exige `lastRendered`; `loadFonts` `:1258`; postMessage `{accent, editMode:true}` `:1261` |
| Sair / finalizar | `app.js:1263` | `finalizeBtn` click | `snapshot:true` `:1270` **antes** de descongelar (HTML editado vira o oficial); `editMode:false` `:1273`; `loadFonts` + toast de fontes |
| Popover de edição | `app.js:1007` | `#nx-pop` | montado por `editSelReceived` (`:833`); head/grip `:1021/:1023`, tag `:1026`, badge `:1028`, ✕ `:1030`, body `:1061` |
| Slider (fontSize etc.) | `app.js:872-891` | `.nx-pop-range` | `el()` helper `:37`; aplica via `applyStyle` na bridge |
| Select (font-family etc.) | `app.js:893-926` | `.nx-pop-select` | lista de opções → bridge |
| Cor + transparência | `app.js:934` | `.nx-pop-color/hex` | picker `:943-946`, hex `:948-951`, alpha `:958-966` |
| Texto | `app.js:1066-1071` | `.nx-pop-text` | `setText` via bridge |
| Entrar dentro (drill) | `app.js:1125` | `nx-pop-btn` | desce de camada (Ctrl+clique ou clique repetido) |
| Desfazer | `app.js:1139` | `nx-pop-btn` | `postMessage {undo:true}`; Ctrl+Z global `:1282-1290` (ignora INPUT/TEXTAREA) |
| Pedir pra IA | `app.js:1146-1152` | `.nx-pop-primary` | injeta `No elemento <tag>: …` no prompt e envia (`sendAI` `:1152`) |
| Excluir elemento | `app.js:1167` | `.nx-pop-danger` | `deleteEl` (com undo) |
| Fechar popover | `app.js:1192` | `closeEditPopup` | `removePopupDom` `:996`; ✕/ESC/clicar fora; bridge `editClose` `:1332` |
| Badge ↩ n | `app.js:1028` | `undoBadge` | contador via `undoCount` `:1328-1329`; apenas indicador (sem clique) — desfazer no botão `:1139` ou Ctrl+Z `:1282-1290` |
| Seleção de elemento | `app.js:140` | SHIM `call("editSel")` | `pickAt` reativa hit-test e ignora mídia full-screen; → `app.js:833 editSelReceived`; `editSelHtml` `:827/:840` → prompt `:454-456` |
| Snapshot do HTML | `app.js:166` | SHIM `call("snapshot")` | → `app.js:1203 applySnapshot` (`sanitizeSnapshotHtml`; limpa `editSelHtml` `:1216`) |
| Arrastar popover | `app.js:1037` | `head` mousedown | move o popover; `editDragging` `:1337` esconde dicas; `repositionPopover` `:867` |
| Congelar / descongelar | `app.js:152` | SHIM `editMode` | `freeze()` `:122` / `thaw()` `:129` da página gerada |

SHIM da página gerada: `app.js:108+` (`injectShim` `:298`). Define `window.Nexus77` (`:146`),
undo (`pushUndo`/`doUndo` `:239/:244`), `snapshot` `:231`, `drill`, `deselect`, `applyStyle`,
`setText`, `resize`. **Editar o SHIM exige re-validar com `node --check /tmp/nx-shim.js`.**

## Modais e páginas internas

| Elemento | Local | Âncora | Comportamento |
| --- | --- | --- | --- |
| Modal de configurações | `web/js/settings.js:43` | `Settings.open` | seções API/GERAÇÃO/TEMA/FONTES; fecha por ✕, ESC ou fundo (`:190 close`, `:197 closeTop`) |
| "ver chave" | `web/js/settings.js:70` | `showKey` | checkbox; alterna `password`/`text` (`:75-77`) |
| Slider de temperatura | `web/js/settings.js:92` | `tempBar` | rótulo `Temperatura: %.2f` |
| "Buscar modelos" | `web/js/settings.js:86` | `fetchBtn` | valida endpoint/chave, `AiClient.listModels` |
| Diálogo de modelos | `web/js/settings.js:215` | `showModels` | lista com pré-seleção; clique preenche o campo |
| Salvar configurações | `web/js/settings.js:181` | `saveBtn` | grava prefs, toast, `onSaved` |
| Toast global | `web/js/settings.js:19` | `Settings.toast` | `#mx-toast`, 2,4 s |
| Versão do cliente | `web/js/settings.js:185` | `.mx-ver` | `ai-client v… · origem` |
| Diálogo Salvar página | `web/js/app.js:610` | `showSaveDialog` | nome sugerido `app.js:588 defaultSaveName` (limpo, sem data/`.html`); 1º save pede a pasta (FSA) |
| Abrir HTML (modal) | `web/js/app.js:731` | `pickHtmlFile` | "Escolher arquivo…" com gesto real no shell |
| Confirmação de exclusão | `web/js/app.js:786` | `deleteSaved` | `Store.remove` + recarrega lista |
| Welcome | `web/js/html-builder.js:593` | `welcomePage` | título animado em CSS puro: `nx-in` (letra a letra), `nx-sheen` (onda de brilho) e `nx-glow`; `sheenOn` escolhe a cor da faixa |
| Erro | `web/js/html-builder.js:339` | `errorPage` | "Falha na geração" só sem página prévia |
| Lista de salvos | `web/js/html-builder.js:370` | `savedListPage` | botões chamam `Nexus77.*` (`html-builder.js:430-436`, postMessage) |

## Ponte (bridge)

| Método | Origem | Destino |
| --- | --- | --- |
| `Nexus77.setInput` | página (chips) | `app.js:1295 MxShell.setInput` (foca/seleciona o texto) |
| `Nexus77.openSaved` | lista | `MxShell.openSaved` → `app.js:1301` |
| `Nexus77.closeList` | lista | `MxShell.closeList` → `app.js:1302` |
| `Nexus77.pickFile` | lista | `MxShell.pickFile` → `app.js:1303` |
| `Nexus77.deleteSaved` | lista | `MxShell.deleteSaved` → `app.js:1304` |
| `Nexus77.openUrl` | links | `MxShell.openUrl` (`app.js:1305`) → janela interna no Electron / nova aba no navegador (`:1305-1306`) |
| `editSel` / `snapshot` / `undoCount` / `editClose` / `editDragging` | shim do modo edição | tratados direto no listener (`app.js:1315-1353`) |
| Whitelist / listener | `app.js:1311-1314` / `:1315` | valida `d.__nx === 1` (`:1317`), `e.source === frame.contentWindow` (`:1318`) e o método antes de executar (`:1348`) |

`MxShell` é exposto em `app.js:1294`; a página tem origem opaca (`sandbox` sem
`allow-same-origin`) e só alcança o shell pelos métodos da whitelist.

## Inicialização (`init`, app.js)

- Roda no `DOMContentLoaded` (`app.js:1384`) ou imediatamente se já carregado.
- Tema: `lastThemeIndex` `:1355` → `Themes.of` `:1356` → `applyTheme()` `:1357` → welcome `:1358`.
- Log de versão no console `:1360-1363`.
- `file://` → testa `http://127.0.0.1:8790/` (XHR, 3 s) e redireciona; senão toast com o atalho (`:1365-1380`).

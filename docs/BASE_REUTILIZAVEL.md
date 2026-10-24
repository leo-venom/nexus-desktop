# Base reutilizável — app WebView/shell + HTML gerado por IA (desktop)

> ⚠️ **DOCUMENTO HISTÓRICO** — descrito na era v2.x (15 temas, File System Access).
> Hoje há **1 tema** e salvamento via API REST com backups. Para a arquitetura vigente,
> consulte [`DOCUMENTACAO.md`](DOCUMENTACAO.md) e [`ESTADO_ATUAL.md`](ESTADO_ATUAL.md).

Receita validada no **NEXUS GAME** (port do NEXUS77). Serve para novos projetos em que
uma IA gera HTML e o app apenas exibe o resultado.

## Arquitetura

```text
index.html (shell)
  ├── css/app.css            tema por var(--nx-*)
  └── js/
      ├── themes.js          15 temas + hexA()
      ├── prefs.js           localStorage (JSON)
      ├── html-builder.js    prompt + extração + decoração + páginas internas
      ├── ai-client.js       fetch/SSE + fallback 4xx
      ├── store.js           FSA (pasta) + fallback IndexedDB/download
      ├── vu-meter.js        medidor em canvas (opcional)
      ├── settings.js        modal de configurações
      └── app.js             fluxo principal
```

O núcleo web não tem build, bundler nem dependências: scripts clássicos com globais
(`Themes`, `Prefs`, `Html`, `AiClient`, `Store`, `VuMeter`, `Settings`). O shell desktop
é opcional: Electron é a única dependência de desenvolvimento (`desktop/package.json`),
instalada com `npm --prefix desktop install`.

## Render adaptativo (o que faz funcionar)

- `iframe.srcdoc` com `sandbox="allow-scripts"` (origem opaca) — a página não alcança o shell.
- `Html.decorate` injeta `<meta viewport>` **se faltar** + `<style id="nx77-base">` com
  `--nx-*` e CSS base (sem barras de rolagem, fundo/texto do tema).
- O `BASE_PROMPT` exige preencher o viewport, responsivo, centrado, sem scrollbars.
- Tema também vai no **system prompt** (cores exatas) — o HTML nasce no tema.
- Trocar de tema = substituir o bloco `nx77-base` (sem chamar a IA).

## Confiabilidade da resposta

- `BASE_PROMPT`: "never ask questions and never refuse".
- `extractDocument`: remove cercas ```` ``` ````, corta até `<!doctype`/`<html`, remove
  cerca final.
- `ai-client`: streaming com fallback não-streaming em HTTP 4xx; valida
  `choices/message/content`; erros tipados (`AiException`); timeouts generosos.
- Falha de geração só troca a tela se **não havia** página anterior.

## Ponte página → shell

```js
// na página (shim injetado)
window.Nexus77.setInput(texto);      // preencher o prompt
window.Nexus77.openSaved(nome);      // lista de salvos
window.Nexus77.closeList();
window.Nexus77.pickFile();
window.Nexus77.deleteSaved(nome);
// shim: window.parent.postMessage({__nx:1,m,a}, '*')
```

No shell: validar `e.source === iframe.contentWindow` + whitelist de métodos.
Nunca usar `allow-same-origin` junto com `allow-scripts` para conteúdo gerado por IA:
isso permitiria à página ler o `localStorage` (API key).

## Persistência

- **Arquivos**: File System Access (`showDirectoryPicker`, handle no IndexedDB) com
  fallback IndexedDB + `<a download>`. Exige contexto seguro (`http://127.0.0.1`).
- **Config**: `localStorage` com uma única chave JSON (`"nexus77"`).
- Nomes de arquivo: normalizar (`[\\/:*?"<>|\r\n\t]+` → `-`, trim de pontos, 80 chars).

## Edição cirúrgica (refino)

Criação devolve o documento completo; **refino não deve**. Com uma página em tela, injete
uma diretriz que **sobreponha** a regra do documento completo e peça um JSON de
substituições:

```json
{"edits":[{"find":"<trecho exato do documento>","replace":"<novo trecho>"}]}
```

Aplique com match exato (tolere CRLF nas duas direções) e preserve o resto do documento
byte a byte — evita drift e reduz muito os tokens de saída. Fallback em cadeia: se não for
JSON aplicável, aceite um HTML completo; se também não vier, refaça a chamada com o prompt
base. A diretriz precisa dizer explicitamente que **sobrepõe** a instrução anterior,
senão o modelo devolve a página inteira.

## CORS e `file://`

Páginas abertas por `file://` têm origem `null`; o navegador bloqueia chamadas à API
cross-origin. Provedores como a OpenAI **não** enviam `Access-Control-Allow-Origin` no
`POST /chat/completions` (só no preflight), então "Failed to fetch" é inevitável — não é
bug do app. Padrão que resolve: um servidor local mínimo que serve os estáticos **e** faz
proxy `/_proxy?url=<alvo>` (repassa `Authorization`/`Content-Type`/corpo e devolve em
streaming). O cliente tenta o proxy e cai no fetch direto se ele não existir.

Para o usuário, entregue um atalho (`abrir.sh` + `.desktop`) que sobe o servidor
invisivelmente e abre o navegador. Sirva com `Cache-Control: no-store` durante o
desenvolvimento e exponha uma `VERSION` visível na UI (ex.: rodapé do ⚙) para confirmar
qual código o navegador carregou.

## Pitfalls

- `file://` quebra FSA/vendor → sempre servir por http local.
- `String.replace` em JS troca só a 1ª ocorrência; para "replace global" use
  `split(x).join(y)` (ou `replaceAll`).
- Ao portar Kotlin, cuidado com `optString("content", "")`: `content: null` viraria
  `"null"`; no JS trate `null` como `''`.
- `decorate` precisa ser idempotente na prática: substitua o bloco existente em vez de
  empilhar `<style id="nx77-base">` duplicado.
- three.js: reescrever a URL do CDN **só no render** e manter o documento canônico com a
  URL original (salvar/refinar continuam portáteis).
- VU meter: redimensionar o canvas com `devicePixelRatio` (cap 2) e `setTransform`.
- `file://` nunca chama APIs sem CORS; use o proxy local + atalho.
- Sem `Cache-Control`, o navegador reusa JS antigo; use `no-store` em dev.
- Prompt base + modo edição: a diretriz de edição precisa dizer que **sobrepõe** a regra
  "output the complete updated document"; senão o modelo devolve o documento inteiro.

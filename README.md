# NEXUS-DESKTOP

Port desktop do **NEXUS77** (Android/Kotlin): shell + chat de IA que gera HTML vivo —
100% no navegador, sem build e sem dependências externas.

## Abrir

**Duplo clique em `NEXUS-DESKTOP.desktop`** (ou em `abrir.sh`). O atalho inicia o
`serve.py` (proxy local) de forma invisível e abre <http://127.0.0.1:8790/> no navegador.

Pelo terminal:

```bash
cd "/home/leo/Documents/Obsidian Vault/01_Projeto/nexus-desktop"
python3 serve.py            # porta 8790 (opcional: python3 serve.py 9000)
```

### Por que não abrir o `index.html` direto?

Abrir por `file://` **não funciona** para a maioria dos provedores (incluindo a OpenAI):
a página fica com origem `null` e o navegador bloqueia chamadas cross-origin. A OpenAI
não envia `Access-Control-Allow-Origin` no `POST /v1/chat/completions` (confirmado com
`curl`), então o `fetch` falha com "Failed to fetch". É regra de segurança do navegador —
não há como contornar com HTML/JS. O `serve.py` existe só para isso: o navegador fala com
`127.0.0.1` (mesma origem) e o servidor fala com a API.

> Provedores que enviam `Access-Control-Allow-Origin: *` no POST funcionam até por
> `file://`; a OpenAI não envia.

## Configurar

1. Clique em **⚙** (canto inferior direito).
2. Preencha **Endpoint** compatível com OpenAI (ex.: `https://api.openai.com/v1`) e a **API key**.
3. Informe o **Modelo** (ou use **Buscar modelos**).
4. **Salvar configurações**.

No rodapé do ⚙ aparece a versão (`ai-client v1.1.0 · origem …`) — útil para conferir se o
navegador carregou o código atual.

## Recursos

- comando curto → página HTML completa renderizada no palco;
- novo comando **refina** a página atual com **edição cirúrgica**: o modelo devolve só os
  trechos alterados (JSON `find/replace`) e o resto da página fica intacto — com fallback
  seguro para documento completo;
- VU meter + KB ao vivo durante a geração; tokens estimados (`~`) e exatos ao final;
- 15 temas (12 escuros + 3 claros) — trocar o tema redecora a página **sem chamar a IA**;
- SALVAR / ABRIR / excluir páginas `.html`;
- three.js local em `web/vendor/three/` (URLs de CDN são reescritas para o vendor no render);
- sessão com orçamento de 1M tokens e reset (`↺`).

## Estrutura

```text
nexus-desktop/
├── serve.py                 # servidor local + proxy /_proxy (sem CORS)
├── abrir.sh                 # sobe o serve.py (se preciso) e abre o navegador
├── NEXUS-DESKTOP.desktop    # atalho de duplo clique
├── web/
│   ├── index.html           # shell: header, palco (iframe), barra de comando
│   ├── css/app.css          # tema via var(--nx-*), modais e toast
│   ├── js/
│   │   ├── themes.js        # 15 temas + hexA()
│   │   ├── prefs.js         # localStorage["nexus77"]
│   │   ├── html-builder.js  # prompt, extração, decoração e páginas internas
│   │   ├── ai-client.js     # fetch + SSE + proxy + fallback não-streaming em HTTP 4xx
│   │   ├── store.js         # pasta via FSA + fallback IndexedDB/download
│   │   ├── vu-meter.js      # medidor de 10 cubos em canvas
│   │   ├── settings.js      # modal de configurações
│   │   └── app.js           # fluxo principal (port de MainActivity.kt)
│   └── vendor/three/        # three.min.js / three.module.min.js
└── docs/
    ├── DOCUMENTACAO.md      # arquitetura, APIs e fluxos
    ├── MAPA_UI.md           # elemento de tela → arquivo:linha + âncora
    ├── BASE_REUTILIZAVEL.md # receita para novos projetos desktop
    ├── VALIDACAO.md         # matriz de testes e evidências (v1.2.0)
    └── CHANGELOG.md
```

## Status

**v1.3.0 — validada** em 2026-10-18. Matriz completa, evidências e como reproduzir em
[`docs/VALIDACAO.md`](docs/VALIDACAO.md).

## Solução de problemas

| Sintoma | Causa / solução |
| --- | --- |
| `Failed to fetch` | Aberto por `file://` ou servidor sem proxy. Use o atalho/`serve.py`. Confira a versão no ⚙ (deve ser `v1.3.0`). |
| `HTTP 401` / `Incorrect API key` | Chave inválida ou endpoint errado. Use **Buscar modelos** no ⚙ para testar. |
| `HTTP 404`/`501` no `/_proxy` | Servidor não é o `serve.py` (ex.: `python3 -m http.server`). Troque para `python3 serve.py`. |
| `timeout de conexão/leitura` | Rede/provedor lento ou inacessível. |
| Lista de salvos vazia | Clique **ABRIR** (pede a pasta na primeira vez) ou salve uma página primeiro. |
| Porta 8790 ocupada | `python3 serve.py 9000` (e abra a porta indicada). |

## Segurança

As páginas geradas pela IA rodam em `<iframe sandbox="allow-scripts">` (origem opaca):
não acessam o DOM, o `localStorage` nem a API key do shell. A ponte `window.Nexus77`
usa `postMessage` com whitelist de métodos (`setInput`, `openSaved`, `closeList`,
`pickFile`, `deleteSaved`, `openUrl`).

## Diferenças em relação ao app Android

| Android | Desktop |
| --- | --- |
| `Downloads/nexus77` (MediaStore) | pasta escolhida via File System Access; fallback IndexedDB + download |
| `WebView.loadDataWithBaseURL` | `iframe.srcdoc` + `Html.rewriteLibs` |
| `addJavascriptInterface` | `postMessage` (iframe sandbox, origem opaca) |
| `SettingsActivity` | modal (`settings.js`) |
| `Toast` nativo | toast do shell (`Settings.toast`) |
| Back button fecha lista | `ESC` fecha a lista/modal; link "‹ Voltar" na página |
| Chamada HTTP direta | proxy local `serve.py` (CORS) |

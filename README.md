# NEXUS GAME

Gerador de **jogos HTML completos** com IA: chat + shell que cria, edita e roda jogos em iframe isolado.
A interface roda em um **app Electron próprio, em janela normal**, sem barra de navegador;
o Chromium embutido preserva File System Access, iframe e renderização.

**Versão 2.9.0** · estado completo em [`docs/ESTADO_ATUAL.md`](docs/ESTADO_ATUAL.md)

## Recursos

- **Modo jogo único** — todo comando gera jogo (não existe modo site/página)
- **`GAME_DIRECTIVE` de 16.651 chars** — regras de tela, HUD lateral, 8-12 níveis, 3+ inimigos,
  power-ups, parallax, partículas com pool, música + SFX, menu/pausa/game over
- **44 texturas procedurais prontas** (`window.NxTex`) — lava, metal, cristais, circuito, aurora…
- **13 sons WebAudio** com receitas completas (frequências, envelopes, filtros)
- **30 temas** — 20 escuros + 10 claros
- **Desempenho 60 fps** cobrado no prompt (um canvas/um loop, fundo offscreen, pool de partículas)
- **Proteções no app** — storage polyfill, loop de continuação de resposta cortada, resize nudge,
  stall detector de 90 s
- **Modo edição visual** — clique seleciona, duplo clique abre popover, arrasto, redimensionamento
  por bordas, Ctrl+Z com pilha de 200, FINALIZAR grava as edições

## Abrir

**Duplo clique em `NEXUS-GAME.desktop`**. O atalho executa `desktop/start.sh`, que sobe
o servidor local (Node) e abre a janela Electron em
<http://127.0.0.1:8790/>. Se a porta estiver ocupada, tenta 8791…8810.

Na primeira vez em uma cópia nova do projeto, instale o Electron (uma vez, ~300 MB):

```bash
cd "/home/leo/Documents/Obsidian Vault/01_Projeto/nexus-game"
npm --prefix desktop install
```

Pelo terminal:

```bash
./desktop/start.sh          # app Electron (janela normal)
```

Fallback no navegador (sem Electron):

```bash
python3 serve.py            # porta 8790 (opcional: python3 serve.py 9000)
./abrir.sh                  # sobe o serve.py e abre no navegador padrão
```

### Por que não abrir o `index.html` direto?

Abrir por `file://` **não funciona** para a maioria dos provedores (incluindo a OpenAI):
a página fica com origem `null` e o navegador bloqueia chamadas cross-origin. A OpenAI
não envia `Access-Control-Allow-Origin` no `POST /v1/chat/completions` (confirmado com
`curl`), então o `fetch` falha com "Failed to fetch". É regra de segurança do navegador —
não há como contornar com HTML/JS. O servidor local (`serve.py` ou `desktop/server.js`)
existe só para isso: a janela fala com `127.0.0.1` (mesma origem) e o servidor fala com a API.

> Provedores que enviam `Access-Control-Allow-Origin: *` no POST funcionam até por
> `file://`; a OpenAI não envia.

## Configurar

1. Clique em **⚙** (canto inferior direito).
2. Preencha **Endpoint** compatível com OpenAI (ex.: `https://api.openai.com/v1`) e a **API key**.
3. Informe o **Modelo** (ou use **Buscar modelos**).
4. **Salvar configurações**.

No rodapé do ⚙ aparece a versão (`ai-client v2.2.0 · origem …`) — útil para conferir se a
janela carregou o código atual.

## Recursos

- app **Electron** em janela normal que detecta a resolução e ocupa a área útil da tela
  (F11 alterna tela cheia; F12 DevTools), sem barra de navegador;
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
nexus-game/
├── NEXUS-GAME.desktop    # atalho: app Electron (janela normal)
├── desktop/                 # shell Electron
│   ├── main.js              # janela na área útil detectada, single-instance, F11/F12, popups
│   ├── server.js            # servidor local + proxy /_proxy + /fontes/
│   ├── start.sh             # sobe o servidor e executa o Electron
│   ├── package.json         # devDependency electron
│   └── icon.png             # ícone do atalho
├── serve.py                 # servidor alternativo (fallback no navegador)
├── abrir.sh                 # fallback: sobe o serve.py e abre o navegador
├── fontes/                  # fontes locais servidas em /fontes/ (ttf/otf/woff/woff2)
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
    ├── VALIDACAO.md         # matriz de testes e evidências
    └── CHANGELOG.md
```

## Status

**v2.2.0** — validada em 2026-10-19. O shell Electron e as correções do topo do
[`CHANGELOG`](docs/CHANGELOG.md) estão no working tree (não publicados); a matriz de
2026-10-18 está em [`docs/VALIDACAO.md`](docs/VALIDACAO.md).

## Solução de problemas

| Sintoma | Causa / solução |
| --- | --- |
| `Failed to fetch` | Aberto por `file://` ou servidor sem proxy. Use o atalho (Electron) ou `abrir.sh`/`serve.py`. Confira a versão no ⚙ (deve ser `v2.2.0`). |
| Electron não abre | Falta o binário: `npm --prefix desktop install`. Rode `./desktop/start.sh` no terminal para ver o erro (o launcher descarta a saída). |
| `HTTP 401` / `Incorrect API key` | Chave inválida ou endpoint errado. Use **Buscar modelos** no ⚙ para testar. |
| `HTTP 404`/`501` no `/_proxy` | Servidor não é o `serve.py`/`desktop/server.js` (ex.: `python3 -m http.server`). Troque para um deles. |
| `timeout de conexão/leitura` | Rede/provedor lento ou inacessível. |
| Lista de salvos vazia | Clique **ABRIR** (pede a pasta na primeira vez) ou salve uma página primeiro. |
| Porta 8790 ocupada | No Electron, tenta 8791…8810 automaticamente. No fallback, `python3 serve.py 9000` e abra a porta indicada. |

## Segurança

As páginas geradas pela IA rodam em `<iframe sandbox="allow-scripts">` (origem opaca):
não acessam o DOM, o `localStorage` nem a API key do shell. A ponte `window.Nexus77`
usa `postMessage` com whitelist de métodos (`setInput`, `openSaved`, `closeList`,
`pickFile`, `deleteSaved`, `openUrl`).

A janela Electron carrega apenas `127.0.0.1`, com `contextIsolation`, `sandbox` e sem
`nodeIntegration`; links externos (`http`/`https`) abrem em uma janela interna com as
mesmas proteções, e outros protocolos são bloqueados.

## Diferenças em relação ao app Android

| Android | Desktop |
| --- | --- |
| `Downloads/nexus77` (MediaStore) | pasta escolhida via File System Access; fallback IndexedDB + download |
| `WebView.loadDataWithBaseURL` | `iframe.srcdoc` + `Html.rewriteLibs` |
| `addJavascriptInterface` | `postMessage` (iframe sandbox, origem opaca) |
| `SettingsActivity` | modal (`settings.js`) |
| `Toast` nativo | toast do shell (`Settings.toast`) |
| Back button fecha lista | `ESC` fecha a lista/modal; link "‹ Voltar" na página |
| Chamada HTTP direta | proxy local (`serve.py` ou `desktop/server.js`) |
| Janela do app | janela Electron normal (F11 alterna tela cheia) |

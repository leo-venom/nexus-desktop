# NEXUS GAME

Gerador de **jogos HTML, desenhos/objetos e páginas visuais** com IA. O pedido define o
que a página é — não existem mais modos separados; o modelo decide e entrega a
interpretação mais impressionante dentro das 7 regras do DIRECTIVE.

A interface roda em um **app Electron próprio, em janela normal**, sem barra de navegador;
o Chromium embutido preserva iframe, renderização e WebGL.

**Versão 3.0.1** · estado completo em [`docs/ESTADO_ATUAL.md`](docs/ESTADO_ATUAL.md) ·
histórico em [`docs/CHANGELOG.md`](docs/CHANGELOG.md)

## Recursos

### Diretiva única (7 regras)
1. **Tela inteira, sem rolagem** — 320×480 até 2560×1080, com unidades relativas e safe-area.
2. **Desempenho máximo** — 1 cena/renderer/rAF, ≤60 draw calls, ~80k triângulos, FPS adaptativo.
3. **Iluminação bonita** — PMREM, 3 pontos, PBR coerente, fundo em gradiente.
4. **Texturas e bibliotecas extras somente sob pedido** — 22 materiais `NxMat`, 24 bibliotecas.
5. **Todo jogo nasce com som futurista** — trilha em 4 camadas + 13 efeitos WebAudio.
6. **Jogo em tela cheia** — 100vw × 100dvh, barra de texto fixa de 15px no topo, sem
   laterais/molduras/painéis, controles de teclado e/ou mouse desde o primeiro frame.
7. **Só o que foi pedido** — sem seções, cards, créditos ou decoração extra.

### Jogos
- **Começa jogando**: sem tela de apresentação, menu ou botão iniciar — o objeto controlável
  já responde no primeiro frame, com render síncrono antes do loop.
- **Layout REGRA 6**: a tela inteira é o jogo; placar/vidas/timer ficam numa barra de 15px
  sobreposta no topo, sem roubar área jogável.
- **Som obrigatório**: receita de música em 4 camadas (baixo, arp, pad e bateria) e efeitos
  ricos para tiro, explosão, impacto, pulo, moeda, power-up, level up, dano, game over etc.
- **FPS AUTO**: mede o desempenho e reduz sozinho pixel ratio, partículas e sombras.

### Motores e bibliotecas
- **24 bibliotecas** no catálogo: 20 locais/nativas (Three.js r160, Babylon.js, OGL, Phaser,
  PixiJS, Konva, Matter, GSAP, Lottie, Howler, Tone, ZzFX, @pixi/sound, Yuka, simplex-noise,
  lil-gui, NxShader, loaders de spritesheet/Tiled, Canvas 2D) e 4 via CDN sob demanda
  (Rapier, Recast, postprocessing, three-mesh-bvh) através de `NxLoad`.
- **22 materiais PBR** (`NxMat`) com textura procedural, normal map e configuração de
  roughness/metalness.
- **28 shaders GLSL + 7 chunks reutilizáveis** (`NxShader`): fogo, água, aurora, plasma,
  CRT, holograma, escudo, toon, mármore, voronoi, fbm etc.
- **three.js r160 local** (`vendor/three/three.min.js`, UMD, sem addons) — 3D funciona offline.

### Desenhos, objetos e respostas visuais
- O mesmo DIRECTIVE cobre ilustração, logo, infográfico, objeto 3D, paisagem, data viz,
  tipografia, animação e simulação física.
- Acabamento dentro do objeto/pedido — sem títulos, HUD ou painéis inventados.

### Geral
- **1 tema único** `PADRÃO · BLACK CYBER` (preto + esmeralda/roxo/azul) — sem seletor.
- **Prévia ao vivo** durante a geração (documento parcial renderizado a cada ~1,2 s).
- **Proteções no app** — storage polyfill no iframe sandbox, continuação de resposta cortada,
  checagem de sintaxe do JS com reparo automático, watchdog de canvas vazio, stall detector
  e anti-erro com telemetria real (até 2 correções).
- **Modo edição visual** — clique seleciona, duplo clique abre popover, arrasto,
  redimensionamento por bordas, Ctrl+Z com pilha de 200, FINALIZAR grava as edições.
- **Salvamento em projetos** — `salvos/<nome>/` com `index.html`, `meta.json` e `assets/`;
  backup automático a cada save e restauração pela API.

## Abrir

**Duplo clique em `NEXUS-GAME.desktop`**. O atalho executa `desktop/start.sh`, que sobe
o servidor local (Node) e abre a janela Electron em <http://127.0.0.1:8790/>. Se a porta
estiver ocupada, tenta 8791…8810.

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
`curl`), então o `fetch` falha com "Failed to fetch". O servidor local (`serve.py` ou
`desktop/server.js`) existe só para isso: a janela fala com `127.0.0.1` (mesma origem) e
o servidor fala com a API.

> Provedores que enviam `Access-Control-Allow-Origin: *` no POST funcionam até por
> `file://`; a OpenAI não envia.

## Configurar

1. Clique em **⚙** (canto direito da barra superior).
2. Preencha **Endpoint** compatível com OpenAI (ex.: `https://api.openai.com/v1`) e a **API key**.
3. Informe o **Modelo** (ou use **Buscar modelos**).
4. **Salvar configurações**.

No rodapé do ⚙ aparece a versão (`ai-client v3.0.1 · origem …`) — útil para conferir se a
janela carregou o código atual.

## Interface e sessão

- app **Electron** em janela normal que ocupa a área útil da tela (F11 alterna tela cheia;
  F12 abre DevTools), sem barra de navegador;
- comando curto → página HTML completa renderizada no palco;
- novo comando **refina** a página atual com **edição cirúrgica**: o modelo devolve só os
  trechos alterados (JSON `find/replace`) e o resto da página fica intacto — com fallback
  seguro para documento completo;
- VU meter de 20 barras + KB ao vivo durante a geração; tokens estimados (`~`) e exatos ao final;
- 1 tema único (`PADRÃO · BLACK CYBER`) — a paleta da criação vem do pedido;
- SALVAR / ABRIR / excluir projetos; cada save gera backup automático;
- sessão com orçamento de 1M tokens e reset (`↺`);
- `maxTokens` padrão 65.535; timeouts de conexão 60 s e leitura 120 s.

## Estrutura

```text
nexus-game/
├── NEXUS-GAME.desktop       # atalho: app Electron (janela normal)
├── desktop/                 # shell Electron
│   ├── main.js              # janela, single-instance, F11/F12, popups
│   ├── server.js            # servidor local + proxy /_proxy + API de saves
│   ├── start.sh             # sobe o servidor e executa o Electron
│   ├── package.json         # devDependency electron
│   └── icon.png             # ícone do atalho
├── serve.py                 # servidor alternativo (fallback no navegador)
├── abrir.sh                 # fallback: sobe o serve.py e abre o navegador
├── fontes/                  # fontes locais servidas em /fontes/
├── imagens/                 # mídia de entrada (back1.jpg etc.)
├── sons/                    # mídia de entrada
├── salvos/                  # projetos salvos (API REST)
├── web/
│   ├── index.html           # shell: header, palco (iframe), barra de comando
│   ├── css/app.css          # tema via var(--nx-*), modais e toast
│   ├── js/
│   │   ├── themes.js        # tema único + hexA()
│   │   ├── prefs.js         # localStorage["nexus77"]
│   │   ├── library-selector.js  # catálogo de 24 bibliotecas
│   │   ├── html-builder.js  # DIRECTIVE, prompt, extração, decoração
│   │   ├── ai-client.js     # fetch + SSE + proxy + fallback
│   │   ├── store.js         # API REST de projetos
│   │   ├── vu-meter.js      # medidor de 20 barras em canvas
│   │   ├── settings.js      # modal de configurações
│   │   ├── app.js           # fluxo principal
│   │   ├── nx-materials.js  # 22 materiais PBR
│   │   ├── nx-shaders.js    # 28 shaders GLSL + 7 chunks
│   │   └── nx-loaders.js    # loaders CDN + spritesheet/Tiled
│   ├── vendor/              # bibliotecas locais (three, phaser, pixi…)
│   └── test-harness.html    # testes locais no navegador
└── docs/
    ├── DOCUMENTACAO.md      # arquitetura, APIs e fluxos
    ├── ESTADO_ATUAL.md      # números e estado corrente
    ├── REGRAS_DEFINITIVAS.md # regras permanentes
    ├── DIRECTIVE.md         # DIRECTIVE atual (verbatim)
    ├── MAPA_UI.md           # âncoras de UI
    ├── BASE_REUTILIZAVEL.md # receita para novos projetos desktop
    ├── VALIDACAO.md         # matriz de testes (histórico + atual)
    └── CHANGELOG.md         # histórico v1 → v3.0.1
```

## Status

**v3.0.1** (2026-10-24) — consistência de REGRA 6, versões e documentação corrigidas.
O CHANGELOG registra as mudanças; a matriz de testes de 2026-10-18 está em
[`docs/VALIDACAO.md`](docs/VALIDACAO.md).

## Solução de problemas

| Sintoma | Causa / solução |
| --- | --- |
| `Failed to fetch` | Aberto por `file://` ou servidor sem proxy. Use o atalho (Electron) ou `abrir.sh`/`serve.py`. Confira a versão no ⚙ (deve ser `v3.0.1`). |
| Electron não abre | Falta o binário: `npm --prefix desktop install`. Rode `./desktop/start.sh` no terminal para ver o erro. |
| `HTTP 401` / `Incorrect API key` | Chave inválida ou endpoint errado. Use **Buscar modelos** no ⚙ para testar. |
| `HTTP 404`/`501` no `/_proxy` | O servidor não é o `serve.py`/`desktop/server.js` (ex.: `python3 -m http.server`). Troque para um deles. |
| `timeout de conexão/leitura` | Rede/provedor lento ou inacessível. |
| Lista de salvos vazia | Confirme que o app foi iniciado por `desktop/start.sh` ou `serve.py` e salve um projeto primeiro. Eles ficam em `salvos/<nome>/`. |
| Porta 8790 ocupada | No Electron, tenta 8791…8810 automaticamente. No fallback, `python3 serve.py 9000`. |
| Editei JS e o app quebrou | O Electron carrega os scripts uma vez. Reinicie `desktop/start.sh` após mudar `web/js/`. |

## Segurança

As páginas geradas pela IA rodam em `<iframe sandbox="allow-scripts">` (origem opaca):
não acessam o DOM, o `localStorage` nem a API key do shell. A ponte `window.Nexus77`
usa `postMessage` com whitelist de métodos (`setInput`, `openSaved`, `closeList`,
`pickFile`, `deleteSaved`, `openUrl`).

A janela Electron carrega apenas `127.0.0.1`, com `contextIsolation`, `sandbox` e sem
`nodeIntegration`; links externos (`http`/`https`) abrem em uma janela interna com as
mesmas proteções, e outros protocolos são bloqueados.

O proxy `/_proxy` aceita **apenas** `http`/`https` e recusa destinos em redes privadas,
link-local e de metadata de nuvem (`10/8`, `172.16/12`, `192.168/16`, `169.254/16`,
`100.100.100.200`, `metadata.*`…). **Loopback é liberado de propósito**, para LM Studio /
Ollama / llama.cpp locais. O DNS é resolvido e o socket é fixado no IP validado (anti
DNS-rebinding), redirecionamentos são revalidados (máx. 4 saltos) e faixas IPv6
especiais são bloqueadas.

## Diferenças em relação ao app Android

| Android | Desktop |
| --- | --- |
| `Downloads/nexus77` (MediaStore) | projetos via API REST em `salvos/` + backup automático |
| `WebView.loadDataWithBaseURL` | `iframe.srcdoc` + `Html.rewriteLibs` |
| `addJavascriptInterface` | `postMessage` (iframe sandbox, origem opaca) |
| `SettingsActivity` | modal (`settings.js`) |
| `Toast` nativo | toast do shell (`Settings.toast`) |
| Back button fecha lista | `ESC` fecha a lista/modal; link "‹ Voltar" na página |
| Chamada HTTP direta | proxy local (`serve.py` ou `desktop/server.js`) |
| Janela do app | janela Electron normal (F11 alterna tela cheia) |

# ESTADO ATUAL — NEXUS GAME

**Versão:** 3.1.0 · **Atualizado:** 2026-10-24
**Local:** `/home/leo/Documents/Obsidian Vault/01_Projeto/nexus-game/`

---

## 1. O que é

Gerador de **jogos e páginas HTML criativas** com IA. Um shell web (Electron ou navegador)
conversa com qualquer API compatível com OpenAI e renderiza o resultado em `<iframe>` isolado.
Arquitetura unificada: **não existem modos** (jogo/desenho/chat) — o modelo decide o que a
página é a partir do pedido.

**Entrada de imagem:** o prompt aceita uma referência PNG/JPEG/WEBP, analisada localmente
(Canvas 2D + `TextDetector` nativo opcional). **Sem jogo aberto**, ela recria a página como
jogo interativo; o modo **automático** é o padrão (tenta enviar os pixels ao endpoint e cai
para o relatório local se o modelo recusar). **Com jogo aberto**, a imagem é aplicada
**dentro do jogo**: fundo (background) por padrão ou textura do componente nomeado, via
`imagens/nexus-ref-*` e caminho root-relative. **Somente local** nunca envia os pixels.

### 7 regras imutáveis no DIRECTIVE
1. **Tela inteira, sem rolagem** (320×480 → 2560×1080).
2. **Desempenho máximo** (1 cena/renderer/rAF, ≤60 draw calls, FPS adaptativo).
3. **Iluminação bonita** (PMREM + 3 pontos + PBR).
4. **Texturas e bibliotecas extras sob pedido** (22 materiais NxMat, 24 libs).
5. **Som futurista em jogos** (trilha 4 camadas + 13 efeitos + Howler/Tone/ZzFX).
6. **Jogo em tela cheia, barra 15px, controles teclado/mouse**.
7. **Só o que foi pedido** — sem extras.

> A REGRA 6 foi confirmada como **tela cheia** em 2026-10-24. O layout central com laterais
> e moldura 2px (nota de 2026-10-22) está **superado**.

---

## 2. Números reais (v3.1.0)

| Item | Valor |
|---|---|
| Linhas de código | **11.741** (JS 8.578 · CSS 906 · HTML 79 · Python 935 · Electron 1.243) |
| `html-builder.js` | **920** (DIRECTIVE + regras + prompt) |
| `app.js` | **2.595** |
| `nx-image.js` | **975** (validação + análise local + fundo/textura + reencode) |
| `library-selector.js` | **702** (24 libs + detector de uso) |
| `nx-materials.js` | **730** (22 materiais PBR) |
| `nx-shaders.js` | **868** (28 shaders + 7 chunks) |
| `nx-loaders.js` | **228** (loaders sob demanda + aliases) |
| `ai-client.js` | **505** (multimodal condicional + teto GPT-6) |
| `store.js` | **347** |
| `vu-meter.js` | **201** (20 barras) |
| `serve.py` | **935** |
| `desktop/server.js` | **1.102** |
| `DIRECTIVE` | **13.256 chars** |
| `systemPrompt` (detail 1) | **14.377 chars** (~3.6k tokens) |
| Catálogo de bibliotecas | **24** (20 locais/nativas + 4 via CDN) |
| Materiais PBR | **22** |
| Shaders GLSL | **28** + 7 chunks |
| Temas | **1** (`PADRÃO · BLACK CYBER`) |
| `maxTokens` default | **65.535** (0 = padrão do provedor; GPT-6 até 128.000) |
| Orçamento de sessão | **1.000.000** tokens |
| Timeouts | CONNECT 60s · READ 120s |

---

## 3. Catálogo completo (24 bibliotecas)

| # | Biblioteca | Categoria | Tamanho | Local |
|---|---|---|---|---|
| 1 | **Three.js** | 3D | ~500 KB | ✅ vendor/ |
| 2 | **Babylon.js** | 3D | ~4.9 MB | ✅ vendor/ |
| 3 | **OGL** | 3D | ~29 KB | ✅ vendor/ (ES module) |
| 4 | **Phaser** | 2D Game | ~1.1 MB | ✅ vendor/ |
| 5 | **PixiJS** | 2D Render | ~435 KB | ✅ vendor/ |
| 6 | **Konva.js** | 2D Canvas | ~168 KB | ✅ vendor/ |
| 7 | **Canvas 2D** | 2D Nativo | 0 | ✅ nativo |
| 8 | **Matter.js** | Física 2D | ~79 KB | ✅ vendor/ |
| 9 | **GSAP** | Animação | ~71 KB | ✅ vendor/ |
| 10 | **Lottie** | Animação | ~299 KB | ✅ vendor/ |
| 11 | **Howler.js** | Áudio | ~36 KB | ✅ vendor/ |
| 12 | **Tone.js** | Áudio musical | ~342 KB | ✅ vendor/ |
| 13 | **ZzFX** | Áudio SFX | ~8 KB | ✅ vendor/ (global build) |
| 14 | **@pixi/sound** | Áudio Pixi | ~34 KB | ✅ vendor/ |
| 15 | **Yuka** | IA NPCs | ~157 KB | ✅ vendor/ |
| 16 | **simplex-noise** | Procedural | ~21 KB | ✅ vendor/ |
| 17 | **lil-gui** | Debug UI | ~61 KB | ✅ vendor/ |
| 18 | **Rapier** | Física 3D | via CDN | ⚡ NxLoad (WASM) |
| 19 | **Recast Navigation** | Pathfinding | via CDN | ⚡ NxLoad (WASM) |
| 20 | **postprocessing** | Efeitos Three.js | via CDN | ⚡ NxLoad |
| 21 | **three-mesh-bvh** | Aceleração | via CDN | ⚡ NxLoad |
| 22 | **NxShader (GLSL)** | Shaders | built-in | ✅ `js/nx-shaders.js` |
| 23 | **Spritesheet Loader** | 2D Tools | built-in | ✅ `NxLoad.spritesheet()` |
| 24 | **Tiled Map Loader** | 2D Tools | built-in | ✅ `NxLoad.tiled()` |

> **Verificado em 2026-10-24 (Chromium headless): 24/24 carregam.** Os quatro CDN usam
> Rapier `rapier.es.js`, Recast `0.43.1/+esm`, postprocessing `build/postprocessing.js`
> e three-mesh-bvh UMD (unpkg). `NxLoad` cria os aliases `RAPIER`, `RecastNavigation`,
> `EffectComposer`/`RenderPass` e `MeshBVH`/`computeBoundsTree`.

---

## 4. Estrutura de diretórios

```
nexus-game/
├── serve.py                     servidor Python (fallback)
├── abrir.sh                     fallback navegador
├── NEXUS-GAME.desktop           atalho Electron
├── fontes/                      fontes do projeto
├── imagens/                     mídia de entrada (back1.jpg)
├── sons/                        mídia de entrada
├── salvos/                      projetos salvos (API REST + backups)
├── desktop/
│   ├── main.js                  shell Electron
│   ├── server.js                servidor Node embutido
│   ├── start.sh                 launcher
│   ├── package.json             versão 3.1.0
│   └── node_modules/            Electron (298 MB, fora do git)
├── web/
│   ├── index.html               shell HTML
│   ├── css/app.css              estilos
│   ├── vendor/                  bibliotecas locais
│   ├── js/
│   │   ├── themes.js            1 tema (BLACK CYBER)
│   │   ├── prefs.js             localStorage
│   │   ├── library-selector.js  catálogo de 24 libs
│   │   ├── html-builder.js      DIRECTIVE + prompt builder
│   │   ├── nx-image.js          validação + análise local da imagem
│   │   ├── ai-client.js         API client SSE
│   │   ├── store.js             API REST de saves
│   │   ├── vu-meter.js          VU animado (20 barras)
│   │   ├── settings.js          modal config
│   │   ├── app.js               fluxo principal
│   │   ├── nx-materials.js      22 materiais PBR
│   │   ├── nx-shaders.js        28 shaders GLSL + 7 chunks
│   │   └── nx-loaders.js        loaders sob demanda
│   └── test-harness.html        testes locais no navegador
└── docs/
    ├── DOCUMENTACAO.md          documentação completa
    ├── CHANGELOG.md             histórico v1 → v3.1.0
    ├── ESTADO_ATUAL.md          este arquivo
    ├── REGRAS_DEFINITIVAS.md    regras permanentes
    ├── DIRECTIVE.md             DIRECTIVE atual (verbatim)
    ├── VALIDACAO.md             matriz de testes
    ├── MAPA_UI.md               âncoras de UI
    └── ANALISE_COMPLETA.md      auditoria de 2026-10-24
```

---

## 5. Fluxo de geração

```
prompt do usuário (+ imagem opcional já validada/analisada)
   ↓
NxImage.referenceBlock(asset)   → relatório local + imagem no modo automático
   ↓
LibrarySelector.selectLibraries(command, doc)   → 24 libs analisadas
   ↓
Html.systemPrompt(tema, nível, prompt, doc, media)
   → DIRECTIVE + paletaRef + detailDirective + mediaBlock + libraryDirective
   ↓
AiClient.chat(...)   streaming SSE + fallback
   ↓
extractDocument()   limpeza
   ↓
render(themed(doc))   rewriteLibs + injectShim + NxMat/NxShader/NxLoad + libs
   ↓
iframe.srcdoc → PÁGINA HTML + anti-erro opcional
```

---

## 6. Testes executados (v3.1.0 + imagem no jogo, 2026-10-24)

1. ✅ Sintaxe — todos os `.js` (`node --check`), `serve.py` (`py_compile`), Electron.
2. ✅ Prompt — 7 regras presentes; REGRA 6 com **tela cheia + barra 15px**.
3. ✅ Catálogo — **24 bibliotecas** carregadas.
4. ✅ NxMat — **22 materiais**, `names()`, `getCanvas()`, `select()`, `fuzzyFind()`.
5. ✅ NxShader — **28 shaders** + **7 chunks**, `get()`, `names()`, `chunks()`.
6. ✅ NxLoad — loaders registrados (Rapier/Recast/postprocessing/meshBVH/spritesheet/Tiled).
7. ✅ Test harness executado em Chromium headless (servidor local) — **21 PASS / 0 FAIL**;
   inclui o detector `usedLibraries()`, o chip `#libs`, a integração ZzFX/lil-gui/NxLoad,
   os testes de imagem (PNG/JPEG/WEBP reais, GIF recusado, limites, miniatura, JSON,
   `referenceBlock`, `compare`, multimodal condicional), a migração de `local` antigo para
   automático e o teto de 128.000 do GPT-6; sem `NxTex`; API `/_api/saves` somente leitura.
8. ✅ Versões unificadas em **3.1.0** (package, lock, ai-client, selector, README, docs).
9. ✅ Docs reconciliadas (NxTex removido; contagens 24/28/22; REGRA 6 única).
10. ✅ Harness da skill — `verify-nx.js` **40 PASS / 0 FAIL**; `verify-antierro.js` **7 PASS / 0 FAIL**.
11. ✅ Resíduos — `web/_tmp_t/`, `.bak-*`, `test-iife.js`, `catalogo.html` (quebrado) e 6 pastas
    vendor vazias (incluindo `rabier`) movidos/removidos; quarentena em
    `/tmp/nexus-game-cleanup-20261024-010150`.
12. ✅ Bibliotecas — **24/24 carregam** em Chromium headless: 20 locais/nativas + 4 CDN
    (Rapier, Recast, postprocessing, meshBVH) com URLs e globais corrigidos; ZzFX passou a
    usar build global e lil-gui recebe alias `GUI`.
13. ✅ E2E de imagem — **15 PASS / 0 FAIL** em Chromium/CDP com mock OpenAI: UI original,
    seletor, texto puro, miniatura/dimensões, texto+imagem local sem pixels, remoção,
    JPEG/WEBP reais, somente imagem, formato inválido, arquivo grande, falha de análise +
    texto, modo automático, fallback de endpoint sem imagem, comparação visual e janela estreita. Os HTTP 400 do
    console são as rejeições deliberadas do mock no cenário de fallback.
14. ✅ Electron real — **4 PASS / 0 FAIL** (Xvfb + CDP + user-data temporário): isolamento
    preservado, geração de texto pelo proxy, anexo local com miniatura e geração
    texto+imagem; **nenhum erro de renderer**.
15. ✅ Backups das alterações de imagem em
    `/tmp/nexus-image-backup-20261024-020623/` (index, CSS, app, ai-client, prefs, settings,
    html-builder, harness, docs).
16. ✅ Teto do GPT-6 elevado para **128.000 tokens** (antes o modelo caía no default de
    16.384), rótulo do modal corrigido e harness em **21/0**; backup desta alteração em
    `/tmp/nexus-token-backup-20261024-030503`.
17. ✅ Imagem em modo **automático** por padrão (imagem direta + fallback local), migração de
    `local` antigo e opção explícita **Somente local**; harness **21/0**, E2E **15/15**,
    migração de preferências **4/4** em Chromium real; backup em
    `/tmp/nexus-auto-image-backup-20261024-031621`.
18. ✅ **Imagem dentro do jogo atual (v3.1.0)** — fundo sem texto e textura de componente
    nomeado, upload root-relative, verificação pós-geração, save/reabrir e ciclo do anexo;
    harness **26/0** (5 testes novos) e E2E Chromium/CDP com mock SSE **31/31**, incluindo
    falha de upload, cancelamento durante o upload e recriação sem jogo aberto.
19. ✅ **Upload local `/_api/ref-image`** nos servidores Python e Node — **17/17** em HTTP:
    upload 200 (PNG), 403 sem header, 400 magic/base64 inválidos, 413 acima de 6 MB,
    GET da imagem e assets de save com ACAO `*` + CORP `cross-origin`.

---

## 7. Entrada de imagem (v3.1.0)

- Botão de clipe dentro do prompt, seletor nativo, cartão com thumbnail/nome/dimensões/
  tamanho e remoção; estados oculto/analisando/pronto/erro/removido.
- Validação real por magic bytes (PNG/JPEG/WEBP), 12 MB, 40 MP, 10.000 px por lado.
  Miniatura e relatório ficam em memória; sem jogo aberto, nada é gravado no projeto.
- Análise local em Canvas 2D; **sem OpenCV.js/Tesseract.js**; OCR apenas se o navegador
  expuser `TextDetector`. Relatório JSON declara incertezas e não finge semântica.
- **Automático (padrão):** a imagem original vai em `image_url` e é a fonte primária do
  prompt; HTTP 400/413/415/422 cai uma vez para o relatório local. Refinos não reenviam a
  imagem. Preferências antigas `local` sem versão migram para automático.
- **Somente local:** modelo recebe somente o relatório, nunca pixels; a escolha explícita
  é preservada por `imageModeVersion = 2`.
- Somente imagem usa `NxImage.DEFAULT_COMMAND`; a recriação pedida é interativa.
- **Com jogo aberto (novo):** `usageMode()` decide fundo (padrão) ou textura (pedido de
  textura/alvo nomeado); a imagem é enviada por `POST /_api/ref-image` para
  `imagens/nexus-ref-*` e usada como `/imagens/…`. `garantirImagemAplicada()` exige caminho
  + pista de uso e faz uma correção completa se faltar. O save copia para
  `salvos/<nome>/assets/images/` e reescreve o caminho sem barra inicial.
- O anexo só é limpo após a imagem aparecer no documento final; falha de upload,
  cancelamento ou resposta sem a imagem preservam anexo e página. Para recriar com jogo
  aberto, use **↺**.
- Comparação visual opcional (0–2) só para gerações novas com canvas; desligada por padrão.
- Testes: harness **26/0**, E2E **31/31**, HTTP **17/17**, Electron **4/4**. Limitações:
  análise aproximada, OCR dependente do navegador, comparação restrita a canvas e visão
  dependente do endpoint.

---

## 8. Pendências operacionais

- A v3.0.1 foi commitada em 2026-10-24 (`3e7d44a`, seguido de `7250fdc`). As correções de
  integração das 24 bibliotecas, o indicador `#libs`, a entrada de imagem e a **v3.1.0**
  (imagem dentro do jogo) foram implementados depois e **ainda não estão commitados**.
- Os scripts de teste E2E/Electron e os mocks usados nesta validação estão em `/tmp`
  (`nexus-mock-api.js`, `nexus-e2e-image.js`, `nx-mock.mjs`, `nx-e2e.mjs`,
  `nx-http-tests.mjs`, `nexus-electron-check.js`) e **não fazem parte do repositório**;
  o harness permanente é `web/test-harness.html`.
- Projetos de teste em `salvos/` (ex.: `cobras-10-vidas`, `luz-do-dia-com-nuvems`,
  `tema-cyber`, `tetris-3d`, `tetris22`) permanecem não rastreados.
- `desktop/node_modules` (298 MB) permanece dentro do Vault (ignorado pelo git); afeta
  indexação/backup do Obsidian.
- `salvos/*/_backups/` de projetos antigos estão rastreados no git (14 arquivos); novos projetos não.
- Tags git param em `v2.13.0`; falta criar a tag `v3.1.0` no commit atual.

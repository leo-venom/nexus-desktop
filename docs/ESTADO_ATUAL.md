# ESTADO ATUAL — NEXUS GAME

**Versão:** 3.0.1 · **Atualizado:** 2026-10-24
**Local:** `/home/leo/Documents/Obsidian Vault/01_Projeto/nexus-game/`

---

## 1. O que é

Gerador de **jogos e páginas HTML criativas** com IA. Um shell web (Electron ou navegador)
conversa com qualquer API compatível com OpenAI e renderiza o resultado em `<iframe>` isolado.
Arquitetura unificada: **não existem modos** (jogo/desenho/chat) — o modelo decide o que a
página é a partir do pedido.

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

## 2. Números reais (v3.0.1)

| Item | Valor |
|---|---|
| Linhas de código | **9.801** (JS 6.946 · CSS 750 · HTML 58 · Python 867 · Electron 1.180) |
| `html-builder.js` | **917** (DIRECTIVE + regras + prompt) |
| `app.js` | **2.113** |
| `library-selector.js` | **658** (24 libs) |
| `nx-materials.js` | **730** (22 materiais PBR) |
| `nx-shaders.js` | **868** (28 shaders + 7 chunks) |
| `nx-loaders.js` | **188** (loaders sob demanda) |
| `ai-client.js` | **490** |
| `store.js` | **337** |
| `vu-meter.js` | **201** (20 barras) |
| `serve.py` | **867** |
| `desktop/server.js` | **1.039** |
| `DIRECTIVE` | **13.256 chars** |
| `systemPrompt` (detail 1) | **14.377 chars** (~3.6k tokens) |
| Catálogo de bibliotecas | **24** (20 locais/nativas + 4 via CDN) |
| Materiais PBR | **22** |
| Shaders GLSL | **28** + 7 chunks |
| Temas | **1** (`PADRÃO · BLACK CYBER`) |
| `maxTokens` default | **65.535** |
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
| 13 | **ZzFX** | Áudio SFX | ~7.8 KB | ✅ vendor/ |
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
│   ├── package.json             versão 3.0.1
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
    ├── CHANGELOG.md             histórico v1 → v3.0.1
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
prompt do usuário
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

## 6. Testes executados (v3.0.1, 2026-10-24)

1. ✅ Sintaxe — todos os `.js` (`node --check`), `serve.py` (`py_compile`), Electron.
2. ✅ Prompt — 7 regras presentes; REGRA 6 com **tela cheia + barra 15px**.
3. ✅ Catálogo — **24 bibliotecas** carregadas.
4. ✅ NxMat — **22 materiais**, `names()`, `getCanvas()`, `select()`, `fuzzyFind()`.
5. ✅ NxShader — **28 shaders** + **7 chunks**, `get()`, `names()`, `chunks()`.
6. ✅ NxLoad — loaders registrados (Rapier/Recast/postprocessing/meshBVH/spritesheet/Tiled).
7. ✅ Test harness executado em Chromium headless (servidor local) — **8 PASS / 0 FAIL**;
   sem `NxTex`; API `/_api/saves` somente leitura.
8. ✅ Versões unificadas em **3.0.1** (package, lock, ai-client, README, docs).
9. ✅ Docs reconciliadas (NxTex removido; contagens 24/28/22; REGRA 6 única).
10. ✅ Harness da skill — `verify-nx.js` **40 PASS / 0 FAIL**; `verify-antierro.js` **7 PASS / 0 FAIL**.
11. ✅ Resíduos — `web/_tmp_t/`, `.bak-*`, `test-iife.js`, `catalogo.html` (quebrado) e 6 pastas
    vendor vazias (incluindo `rabier`) movidos/removidos; quarentena em
    `/tmp/nexus-game-cleanup-20261024-010150`.

---

## 7. Pendências operacionais

- O trabalho da v3.0.0 + v3.0.1 foi commitado em 2026-10-24. Os 3 projetos de teste em
  `salvos/` ficaram fora do commit (permanecem não rastreados).
- `desktop/node_modules` (298 MB) permanece dentro do Vault (ignorado pelo git); afeta
  indexação/backup do Obsidian.
- `salvos/*/_backups/` de projetos antigos estão rastreados no git (14 arquivos); novos projetos não.
- As 3 pastas não rastreadas em `salvos/` (`cobras-10-vidas`, `luz-do-dia-com-nuvems`,
  `tema-cyber`) são projetos de teste — decidir se entram no git ou saem.
- Tags git param em `v2.13.0`; falta criar a tag `v3.0.1` no commit atual.

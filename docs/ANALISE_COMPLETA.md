# ANÁLISE COMPLETA — NEXUS GAME (pós-correção v3.0.1)

> **Reescrita em 2026-10-24.** Substitui a auditoria de 2026-10-22, cujos achados foram
> tratados nesta rodada. Todos os números abaixo foram **medidos hoje** (`wc`, `stat`, `git`,
> prompt renderizado com `node`), não reaproveitados de docs antigas.

## 1. Identidade

NEXUS GAME — shell web (Electron + servidor Python/Node) com chat IA que gera páginas e jogos
HTML/three.js em tempo real, renderizados em `<iframe>` sandbox. Motor: HTML + three.js local.
Local: `/home/leo/Documents/Obsidian Vault/01_Projeto/nexus-game/`.

Arquitetura **unificada, sem modos**: um `DIRECTIVE` com **7 regras** governa todos os pedidos.
A **REGRA 6 canônica** (decisão do Leo, 2026-10-24) é **tela cheia** (100vw × 100dvh),
**barra de texto de 15px** no topo e controles de teclado/mouse desde o primeiro frame.
Laterais + moldura 2px (2026-10-22) e barras de 5px (2026-10-23) estão revogadas.

## 2. O que foi corrigido nesta rodada

| # | Achado anterior | Correção aplicada | Status |
|---|---|---|---|
| 1 | REGRA 6 contraditória (tela cheia vs. laterais vs. 5px) | Título e corpo da REGRA 6 alinhados a **tela cheia + 15px**; REGRA 1 com exceção explícita dos 15px; comentário do `html-builder.js` atualizado | ✅ |
| 2 | Versão dividida (2.13.0/2.14.0/2.15.1/3.0.0) | Versão única **3.0.1** em package/lock, `AiClient.VERSION`, `LibrarySelector.VERSION`, README e docs | ✅ |
| 3 | `BASE_PROMPT` morto (~1,5 KB) ainda exportado | Removido do código e dos exports; `BASE_PROMPT` agora é `undefined` | ✅ |
| 4 | Test harness carregava `nx-textures.js` (deletado) e omitia `library-selector.js` | Includes corrigidos; testes de 7 regras, 15px, 22/28/7/24 | ✅ |
| 5 | Docs descreviam NxTex (44/88 texturas), 23 libs, 7 shaders, 4 regras | `DIRECTIVE.md` e `REGRAS_DEFINITIVAS.md` regenerados; `DOCUMENTACAO.md` e README atualizados; `ANALISE_COMPLETA.md` reescrita | ✅ |
| 6 | Documentos históricos pareciam atuais | Banners em `VALIDACAO`, `MAPA_UI`, `BASE_REUTILIZAVEL`, `ANALISE_GELATINA`, `ANALISE_CUBO_GELATINOSO`, `ANALISE_RELEVO`, `ANALISE_GODOT` | ✅ |
| 7 | `web/_tmp_t/` (3 HTML de teste), 3 `.bak-*`, `test-iife.js`, 6 pastas vendor vazias (incl. `rabier`) | Movidos para `/tmp/nexus-game-cleanup-20261024-010150`; pastas vazias removidas com `rmdir` | ✅ |
| 8 | Skill `nexus-game` com NxTex/gelGeo, 88 texturas e scripts mortos | SKILL.md atualizada; `references/jogo-texturas-audio.md` reescrito para NxMat/NxShader; `verify-gel.js`/`verify-relevo.js` arquivados; novo `verify-nx.js`; `verify-antierro.js` corrigido | ✅ |
| 9 | Nota Obsidian de layout mandava usar laterais + moldura 2px | Reescrita para tela cheia + barra 15px, com nota de substituição | ✅ |
| 10 | Skill/nota diziam “3 fluxos” e “10 regras” | Nota de direção marcada como histórica; SKILL.md agora lista 9 regras de manutenção + arquitetura v3.0.1 | ✅ |

## 3. Estrutura

```text
nexus-game/
├── serve.py (867 l.)              servidor Python (fallback)
├── desktop/                       Electron (main 141, server 1.039)
├── web/
│   ├── index.html (59 l.) · css/app.css (771 l.)
│   ├── js/                        12 arquivos, 7.057 linhas
│   ├── vendor/                    bibliotecas locais
│   └── test-harness.html          harness no navegador
├── salvos/                        7 projetos (3 não rastreados)
├── imagens/                       back1.jpg (124.961 B)
├── docs/                          3.381 linhas + README (217)
└── fontes/                        fontes do projeto
```

## 4. Arquitetura e fluxo

```text
prompt → LibrarySelector.selectLibraries (24 entradas)
      → Html.systemPrompt(tema, nível, cmd, doc, media)
         = DIRECTIVE + paletaRef + detailDirective + mediaBlock + libraryDirective
      → AiClient.chat (SSE + fallback)
      → Html.extractDocument
      → render(themed(doc)): rewriteLibs → injectShim → NxMat/NxShader/NxLoad + libs
      → iframe.srcdoc → telemetria → anti-erro (máx. 2 correções)
```

- **Diretiva única** (`DIRECTIVE`, 13.256 chars / 146 linhas); `systemPrompt` nível 1 = 14.377 chars.
- **NxMat** injetado quando citado: 22 materiais PBR com normal map procedural.
- **NxShader**: 28 shaders GLSL + 7 chunks.
- **NxLoad**: Rapier, Recast, postprocessing, three-mesh-bvh, spritesheet e Tiled.
- **Anti-erro**: `ANTI_ERR_WAIT_MS 4300`, `ANTI_ERR_MAX 2`; telemetria real do iframe.
- **Salvamento**: REST em `/_api/saves/<nome>` + backups automáticos; assets em
  `assets/images|sounds|generated` (6 MB/arquivo, 20 MB/projeto).

## 5. Componentes (medidos em 2026-10-24)

| Arquivo | Linhas | Bytes |
|---|---:|---:|
| `web/js/app.js` | 2.138 | 91.060 |
| `web/js/html-builder.js` | 919 | 52.104 |
| `web/js/nx-shaders.js` | 868 | 32.497 |
| `web/js/nx-materials.js` | 730 | 30.387 |
| `web/js/library-selector.js` | 702 | 26.765 |
| `web/js/ai-client.js` | 490 | 18.477 |
| `web/js/store.js` | 337 | 12.337 |
| `web/js/settings.js` | 236 | 8.211 |
| `web/js/vu-meter.js` | 201 | 5.767 |
| `web/js/nx-loaders.js` | 228 | 8.652 |
| `web/js/prefs.js` | 154 | 5.263 |
| `web/js/themes.js` | 54 | 1.902 |
| `serve.py` | 867 | 36.295 |
| `desktop/server.js` | 1.039 | 39.470 |
| `desktop/main.js` | 141 | 4.211 |
| `web/css/app.css` | 771 | 16.949 |
| `web/index.html` | 59 | 2.682 |
| **Total código** | **9.934** | **393.166** |

## 6. Prompt e regras

- `DIRECTIVE`: **7 regras** (1 tela inteira · 2 desempenho · 3 iluminação · 4 texturas/libs
  sob pedido · 5 som em todo jogo · 6 tela cheia/15px/teclado-mouse · 7 só o pedido).
- `Html.lint(html)` tem **1 argumento** e 4 checagens gerais (truncado, addon/CDN three, stub).
- `BASE_PROMPT`, `detectMode`, `GAME_DIRECTIVE` e `SITE_DIRECTIVE`: **undefined** (removidos).
- Paleta é referência (tema único `PADRÃO · BLACK CYBER`).
- `maxTokens 65.535`; orçamento de sessão 1.000.000; timeouts 60/120/300 s.

## 7. Ecossistema de recursos

| Recurso | Contagem | Fonte |
|---|---:|---|
| Materiais PBR | **22** | `nx-materials.js` |
| Shaders GLSL | **28** | `nx-shaders.js` |
| Chunks GLSL | **7** | `nx-shaders.js` |
| Bibliotecas no seletor | **24** (20 locais/nativos + 4 CDN) | `library-selector.js` |
| Temas | **1** | `themes.js` |
| Barras do VU | **20** | `vu-meter.js` |

## 8. Segurança

- Iframe `sandbox="allow-scripts"` (origem opaca) + bridge `postMessage` com whitelist.
- Electron com `contextIsolation`, `sandbox`, `nodeIntegration:false`.
- Saves: nomes validados, sem `..`, reservados ou symlinks; destino contido em `salvos/`.
- Assets: validação antes da escrita, 6 MB/arquivo, 20 MB/projeto.
- Proxy: DNS resolvido e fixado, redirecionamentos revalidados (máx. 4); loopback permitido
  de propósito para LLMs locais.

## 9. Validação executada

1. ✅ `node --check` nos 12 JS de `web/js`, `desktop/server.js`, `desktop/main.js`.
2. ✅ `python3 -m py_compile serve.py`.
3. ✅ `baseCss()` sem `background`.
4. ✅ Prompt: 7 regras, REGRA 6 tela cheia/15px, sem “BARRAS 5px/laterais/moldura”.
5. ✅ `lint.length === 1`; `BASE_PROMPT` e `detectMode` inexistentes.
6. ✅ Contagens: NxMat 22 · NxShader 28 · chunks 7 · libs 24.
7. ✅ Harness da skill: `verify-nx.js` **40 PASS / 0 FAIL**; `verify-antierro.js` **7 PASS / 0 FAIL**.
8. ✅ Test harness do navegador executado em Chromium headless — **11 PASS / 0 FAIL**,
   incluindo detector `usedLibraries()`, chip `#libs` e integração ZzFX/lil-gui/NxLoad.
9. ✅ **24/24 bibliotecas carregadas** em Chromium headless (vendor + CDN + built-ins).
10. ⚠️ **Não houve teste visual de um jogo novo gerado pela IA** (FPS/toque/áudio reais)
    nesta rodada; a validação é estática, de integração e por harness.

## 10. Revisão crítica pós-correção

### Pendências (por prioridade)

1. **MÉDIA — correções de integração e indicador sem commit.** A v3.0.1 está nos commits
   `3e7d44a` e `7250fdc`; as correções das 24 bibliotecas e o chip `#libs` ainda estão no
   working tree. A tag `v3.0.1` ainda não foi criada.
2. **MÉDIA — `desktop/node_modules` (298 MB) dentro do Vault**, ignorado pelo git mas sujeito
   a backup/indexação do Obsidian.
3. **MÉDIA — 14 arquivos de `salvos/*/_backups/` antigos estão rastreados**; novos backups não.
   Definir política (versionar ou ignorar `_backups/`).
4. **MÉDIA — 5 projetos salvos não rastreados** (`cobras-10-vidas`, `luz-do-dia-com-nuvems`,
   `tema-cyber`, `tetris-3d`, `tetris22`) — decidir se entram no git ou saem.
5. **BAIXA — 4 bibliotecas dependem de CDN** (Rapier, Recast, postprocessing, three-mesh-bvh);
   offline puro cobre o resto.
6. **BAIXA — validação visual ausente**; Playwright não integrado.

### O que está consistente

- Uma versão (3.0.1), uma diretiva, sete regras, uma REGRA 6 (tela cheia/15px).
- NxTex eliminado do código e dos docs ativos; NxMat/NxShader/NxLoad documentados.
- Contagens 22/28+7/24 verificadas por script.
- **24/24 bibliotecas carregam** em Chromium headless; integrações CDN e globais corrigidas.
- Segurança de saves/proxy implementada nos dois servidores.
- `baseCss` sem `background`; `maxTokens` 65.535; timeouts 60/120/300 s preservados.

## 11. Números de referência (v3.0.1)

| Item | Valor |
|---|---|
| Linhas de código | **9.934** |
| `DIRECTIVE` | **13.256 chars** (13.560 bytes) |
| `systemPrompt` (detail 1) | **14.377 chars** (14.703 bytes) |
| `html-builder.js` | **919 linhas** |
| Materiais / shaders / chunks | **22 / 28 / 7** |
| Bibliotecas | **24** (20 locais/nativos + 4 CDN) |
| Docs + README | **3.598 linhas** |
| Peso do código | **393 KB** |
| `.git` | **4,5 MB** |
| `desktop/node_modules` | **298 MB** |
| Versão | **3.0.1** |

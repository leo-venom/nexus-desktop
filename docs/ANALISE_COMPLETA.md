# ANÁLISE COMPLETA — NEXUS GAME

> Recriado em 2026-10-22 (a versão anterior, não rastreada, sumiu do disco — ver achado 2).
> Todos os números abaixo foram **medidos hoje** (`wc -l`, `stat`, `git`, prompt renderizado
> com `node`), não reaproveitados de docs antigas.

## 1. Identidade

NEXUS GAME — shell web (Electron + servidor Python) com chat IA que gera páginas/jogos 3D
HTML+three.js em tempo real. Motor: HTML/three.js local (Godot descartado pelo Leo em 2026-10-21).
Local: `/home/leo/Documents/Obsidian Vault/01_Projeto/nexus-game/`.

## 2. Estrutura

```
web/        index.html (58) · css/app.css (746) · js/ (5.306 linhas)
serve.py    servidor standalone (367)
desktop/    main.js (128) + server.js (487) + node_modules (298 MB!)
docs/       13 arquivos + 1 script (3.033 linhas)
imagens/    536 KB (back1.jpg 124.961 B, 1920×1080)
sons/       8 KB
```

## 3. Arquitetura

`app.js` (orquestra) → `ai-client.js` (SSE + fallback + proxy) → `html-builder.js`
(DIRECTIVE única + lint + reparo) → iframe sandbox → telemetria (`SHIM`) → anti-erro.
`nx-textures.js` (pack NxTex) injetado só quando o HTML cita NxTex/createPattern/CanvasTexture.
`store.js` persiste páginas; `prefs.js` guarda chave/orçamento/maxTokens.

## 4. Componentes (linhas medias)

| Arquivo | Linhas | Bytes |
|---|---|---|
| `web/js/app.js` | 2.008 | 86.367 |
| `web/js/nx-textures.js` | 1.170 | 49.009 |
| `web/js/html-builder.js` | 775 | 46.393 |
| `web/js/ai-client.js` | 490 | — |
| `web/js/store.js` | 258 | — |
| `web/js/settings.js` | 228 | — |
| `web/js/vu-meter.js` | 171 | — |
| `web/js/prefs.js` | 152 | — |
| `web/js/themes.js` | 54 | — |
| `desktop/server.js` | 487 | — |
| `desktop/main.js` | 128 | — |
| `serve.py` | 367 | — |

## 5. Modo edição

Popover + freeze + bridge (`references/editor-v2-interacao.md`); `MAX_EDITS = 0`
(`app.js:20`) = patches consecutivos sem limite de regeneração.

## 6. Bridge

`SHIM` captura `error`/`unhandledrejection`/`console.error`, deduplica e devolve via
postMessage `errors` → injetado em `userPrompt` como `notes` (até 12 linhas).

## 7. Prompt — módulo único (v2.14.0, sem modos)

`systemPrompt(theme, level, …) = DIRECTIVE + paletaRef + detailDirective + mediaBlock`
(`html-builder.js:249`). Medido com `node`:

| Bloco | Chars | ~tok |
|---|---|---|
| `DIRECTIVE` (IDENTIDADE + CONTRATO + REGRA 1–4 + COMO DECIDIR) | 12.140 | 3.035 |
| system nível 0 | 12.555 | 3.139 |
| system nível 1 (default) | 12.404 | 3.101 |
| system nível 2 | 13.778 | 3.445 |

Verificações: REGRA 1–4 presentes ✓ · sem vazamento de `build exactly what was asked`/`EDIT-FRIENDLY` ✓ ·
`100vw`/`dvh`/`overflow:hidden` presentes ✓.

## 8. Temas

**1 tema fixo** (`PADRÃO · BLACK CYBER`) — seletor removido por ordem do Leo (2026-10-21).
Paleta da criação vem do modelo/pedido; `paletaRef()` é referência, não obrigação.

## 9. Validação

`Html.lint(html)` 1 argumento (só checagens gerais: truncado, CDN three, stub).
Anti-erro: `ANTI_ERR_WAIT_MS 4300`, `ANTI_ERR_MAX 2` (autocorreção pelo modelo com telemetria real).

## 10. Fluxos

Gerar (SSE) → lint → anti-erro → preview → salvar (inline de mídia, 6 MB/arquivo, 20 MB total).
Mídia: `imagens/` + `sons/` servidas em `/midia`, embutidas no Salvar.

## 11. Pitfalls conhecidos (continuam válidos)

- Editar JS com o app aberto → erro "X is not a function" (versões misturadas).
- `git status` antes de qualquer "está pronto" — trabalho não commitado evapora.
- Não auditar por strings antigas (`GAME MODE`, `REGRA ABSOLUTA`) — o prompt foi unificado.

## 12. Summary (medido em 2026-10-22)

| Item | Valor medido |
|---|---|
| Total de linhas | **7.092** (web JS 5.306 · CSS 746 · HTML 58 · Python 367 · Electron 615) + docs 3.033 |
| `app.js` | **2.008** (era 1.915 na doc) |
| `html-builder.js` | **775** (era 757 na doc) |
| `DIRECTIVE` | **12.140 chars** (era "~8,9 KB" na doc) |
| Prompt system (detail 1) | **12.404 chars** (~3.101 tok) |
| Texturas NxTex | **44 receitas** ✓ · `nx-textures.js` **49.009 bytes** (doc: 39.125) |
| Tema | **1** — PADRÃO · BLACK CYBER ✓ |
| `maxTokens` default | **65.535** ✓ (`prefs.js:17`) |
| Orçamento de sessão | **1.000.000** tokens ✓ (`prefs.js:10`) |
| VU meter | **5** barras ✓ (`vu-meter.js:9`) |
| Timeouts | **60 s / 120 s** ✓ (`ai-client.js:10-11`) |
| Commits | **24** (doc: 22) · tags `v2.2.0`, `v2.13.0` · HEAD `d5e5a0f` |
| Versão no código | `AiClient.VERSION` = **2.13.0** (`ai-client.js:475`) |
| Pesos | desktop **298 MB** · .git 2,6 MB · web 1,6 MB · imagens 536 KB · docs 212 KB |

## 13. Não publicado

CHANGELOG tem `v2.14.0` (2026-10-22) **sem commit** — descreve a unificação do prompt,
`gelGeo` e o lint novo que estão só no working tree.

## 14. Recursos

Texturas: 44 receitas + `gel`/`gelGeo` (superelipsoide) + `pbr`/`three`/`pattern`.
Sons: 13 receitas WebAudio. Mídia inline no Salvar. Proxy `/_proxy` com anti-SSRF.

## 15. Revisão crítica

### Achados → evidência → prioridade

1. **ALTA — Trabalho não commitado: 8 arquivos, +893/−1147.** `git status`: `app.js`,
   `html-builder.js`, `nx-textures.js`, 4 docs modificados + 5 docs não rastreados
   (`ANALISE_GELATINA/GODOT/RELEVO/CUBO_GELATINOSO.md`, `DIRECTIVE.md`). A refatoração
   do prompt unificado inteira está fora do git.
2. **ALTA — `docs/ANALISE_COMPLETA.md` não existia mais** (perdido por nunca ter sido
   commitado). Este arquivo o recria — **rastreá-lo no git**.
3. **ALTA — Versão dividida:** README e `ai-client.js:475` = `2.13.0`; CHANGELOG e
   ESTADO_ATUAL = `2.14.0`; tags param em `v2.13.0`. Impossível saber qual build roda
   (o rodapé do ⚙ mostra 2.13.0).
4. **MÉDIA — ESTADO_ATUAL §2 defasado:** app.js 1.915→**2.008**; html-builder 757→**775**;
   DIRECTIVE ~8,9 KB→**12.140 chars**; prompt detail 1 ~8,9 KB→**12.404**;
   nx-textures 39.125→**49.009 bytes**; commits 22→**24**. (44 texturas ✓).
5. **MÉDIA — `web/_tmp_t/` (t1.html, t2.html, t3.html — 40 KB) lixo temporário dentro
   de `web/`**, servido pelo servidor e sujeito a commit acidental.
6. **MÉDIA — `desktop/node_modules` (298 MB) dentro do Vault** (pitfall antigo; backup/
   indexação do Obsidian sofrem).
7. **BAIXA — SKILL/auditorias antigas citam `GAME_DIRECTIVE`, `REGRA ABSOLUTA`,
   `HUD E BOTÕES NAS LATERAIS`** — strings que não existem mais no prompt unificado
   (`DIRECTIVE`/REGRA 1–4). Auditar por elas dá falso-negativo.

### O que está consistente

9 regras definitivas (fundo sem camada, HUD nas laterais, primeiro frame síncrono,
início imediato, só o pedido, maxTokens 65.535, timeouts 60/120 s, DIRECTIVE universal),
tema único, `MAX_EDITS=0`, `BAR_COUNT=5`, `SESSION_TOKEN_BUDGET=1M`, SCREEN
(100vw/dvh/overflow hidden), sem vazamento BASE/EDIT_FRIENDLY, BrokenPipe tratado no
`serve.py:346`.

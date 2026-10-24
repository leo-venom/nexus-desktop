# Documentação — NEXUS GAME v3.0.1

Port desktop do **NEXUS77** (Android/Kotlin). O app é um shell que conversa com uma API
estilo OpenAI e renderiza o HTML gerado pela IA em um iframe isolado.

---

## 1. Visão geral

```text
[prompt] -> app.sendPrompt()
        -> Html.systemPrompt(theme, detailLevel, cmd, lastRendered, media)
        -> AiClient.chat(...)            (streaming SSE; progresso em bytes)
        -> Html.extractDocument(texto)   (criação: documento completo)
           ou Html.applyEdits(doc, texto) (refino: edições cirúrgicas)
        -> app.themed(doc)               (decora com --nx-* do tema)
        -> app.render(doc)               (rewriteLibs -> injectShim -> iframe.srcdoc)
```

O documento canônico (`lastRendered`) guarda as URLs de CDN; o rewrite para o vendor
local acontece **somente no render**, então salvar/refinar continua portátil.

---

## 2. Arquivos

### web/index.html
Shell estático: **uma linha no topo** com marca, sessão, prompt (**Enter envia**), status,
VU/KB, SALVAR/ABRIR e ⚙ (canto direito); `iframe#frame` ocupa o restante. Carrega os scripts
na ordem: themes → prefs → library-selector → html-builder → ai-client → store → vu-meter →
settings → app.

### web/css/app.css
Layout do shell e dos modais. Todas as cores vêm de variáveis `--nx-*` aplicadas em
`document.documentElement` por `app.applyTheme()`; `--mx-error` é derivado do tema.

### web/js/themes.js
**1 tema fixo** — `PADRÃO · BLACK CYBER` (preto `#000000`, esmeralda `#00E88A`,
roxo `#A855F7`, azul `#00A3FF`). `of()` sempre devolve o mesmo.

### web/js/prefs.js
Persistência em `localStorage["nexus77"]` (JSON). Chaves: `endpoint`, `apiKey`, `model`,
`temperature`, `maxTokens`, `sessionTokens`, `sessionPromptTokens`, `sessionCompletionTokens`,
`usageLog`, `autoFix`.

### web/js/library-selector.js
Catálogo inteligente de **24 entradas** (20 locais/nativas + 4 CDN) divididas em categorias:

| Categoria | Bibliotecas |
|---|---|
| **3D** | Three.js, Babylon.js, OGL, postprocessing (CDN), three-mesh-bvh (CDN) |
| **2D Game** | Phaser, PixiJS, Canvas 2D |
| **2D Canvas** | Konva.js |
| **Física** | Matter.js (2D), Rapier (3D, CDN) |
| **Animação** | GSAP, Lottie |
| **Áudio** | Howler.js, Tone.js, ZzFX, @pixi/sound |
| **IA / NPCs** | Yuka, Recast Navigation (CDN) |
| **Procedural** | simplex-noise, NxShader (GLSL) |
| **Ferramentas** | Spritesheet Loader, Tiled Map Loader |
| **Debug** | lil-gui |

Funções:
- `selectLibraries(command, doc)` — seleciona automático por keywords (pt-BR + en)
- `buildLibraryDirective(selected)` — gera bloco pro system prompt
- `getLibraryFile(name)` / `getLibraryGlobal(name)` / `isLibraryLocal(name)` / `isLibraryModule(name)`
- `resolveDeps(selected)` — resolve dependências entre libs

### web/js/html-builder.js
Port de `Html.kt`. Exporta `window.Html`:

| função | papel |
|---|---|
| `DIRECTIVE` | bloco completo com IDENTIDADE, CONTRATO DE SAÍDA, REGRA 1-7 |
| `systemPrompt(theme, level, cmd, doc, media)` | prompt + paleta + nível de detalhe + mídia + libs |
| `userPrompt(base, doc, notes)` | anexa a página atual + erros/comandos anteriores |
| `extractDocument(raw)` | remove cercas e corta até `<!doctype`/`<html` |
| `decorate(html, theme)` | injeta viewport + storage polyfill + nx-materials.js + nx-shaders.js + nx-loaders.js + libs |
| `buildLibraryScripts(html)` | detecta e injeta `<script>` locais das bibliotecas vendor usadas (Three.js, Babylon, Phaser, Pixi, Matter, GSAP, Konva, Lottie, Howler, Tone, ZzFX, Yuka, lil-gui, simplex-noise etc.) |
| `welcomePage(theme, hasKey)` | tela de apresentação animada em CSS puro |
| `errorPage(theme, title, detail)` | cartão de erro |
| `savedListPage(theme, entries)` | lista de salvos |
| `applyEdits(doc, raw)` | aplica `{edits:[{find,replace}]}` com tolerância |
| `lint(html)` | 4 checagens: truncado, addon, CDN three, stub |
| `rewriteLibs(html, base)` | CDN three.js → vendor/three/ |

### web/js/ai-client.js
Port de `AiClient.kt` com `fetch`:

- `chat(endpoint, key, model, temp, maxTokens, system, user, onProgress)` — streaming SSE + fallback
- `listModels(endpoint, key)` — busca modelos da API
- `cancel()` — aborta geração
- Timeouts: conexão 60 s, leitura 120 s, não-streaming 300 s
- Proxy `/_proxy` com fallback fetch direto

### web/js/store.js
API REST para `/_api/saves/<nome>` (POST/GET/DELETE). Backups automáticos em `_backups/<ts>/`.

### web/js/vu-meter.js
Canvas 2D, 20 barras, cabeça percorrente com rastro, degradê esmeralda→azul→roxo.

### web/js/settings.js
Modal de configurações: API (endpoint, key, modelo), GERAÇÃO (temperatura, max tokens, auto-fix).

### web/js/app.js
Port de `MainActivity`: estado, UI, fluxo de geração, sessão, salvar/abrir/excluir,
tema, bridge, modo edição visual, anti-erro, Ctrl+Z.

### web/js/nx-materials.js
**22 materiais PBR** com texturas processuais. API global `NxMat`:

| Função | Descrição |
|---|---|
| `NxMat.threeMat(nome, cor)` | THREE.MeshStandardMaterial com roughness/metalness/normal/emissivo |
| `NxMat.threeNeon(cor)` | Material emissivo neon |
| `NxMat.threeGel(cor, opts)` | MeshPhysicalMaterial translúcido (transmission) |
| `NxMat.threeCanvas(nome, tam)` | THREE.CanvasTexture procedural |
| `NxMat.canvasPattern(nome, ctx)` | CanvasPattern para 2D |
| `NxMat.canvasDataUrl(nome, tam)` | data URL da textura |
| `NxMat.pixiTexture(nome, tam)` | PIXI.Texture |
| `NxMat.phaserTexture(nome, tam)` | data URL para Phaser |
| `NxMat.select(descricao)` | Seleciona materiais pela descrição |
| `NxMat.fuzzyFind(query)` | Busca por sinônimo ou nome |
| `NxMat.names()` / `NxMat.list()` | Lista materiais |
| `NxMat.clearCache()` | Limpa cache de texturas |

Materiais: `metal_brilhante`, `metal_escuro`, `metal_dourado`, `plastico_fosco`,
`plastico_brilhante`, `pedra_cinza`, `pedra_ardosia`, `madeira_clara`, `madeira_escura`,
`tecido_liso`, `concreto`, `terra`, `marmore`, `neon`, `vidro`, `circuito`, `energia`,
`lava`, `borracha`, `grade`, `holograma`, `camuflado`.

### web/js/nx-shaders.js
**28 shaders GLSL + 7 chunks reutilizáveis**. API global `NxShader`:

| Função | Descrição |
|---|---|
| `NxShader.get(nome)` | `{vertex, fragment}` strings |
| `NxShader.threeMat(nome, opts)` | THREE.ShaderMaterial com uniforms |
| `NxShader.updateTime(mat, t)` | Atualiza uniform time |
| `NxShader.names()` | Lista os 28 shaders |
| `NxShader.chunks()` | Lista os 7 chunks (`fbm`, `hash`, `hsv`, `noise`, `palette`, `rotate`, `voronoi`) |

Shaders: `agua`, `aguaFbm`, `aurora`, `caustica`, `circuito`, `crt`, `dissolve`,
`dissolveRuido`, `energia`, `escudo`, `estrelas`, `fogo`, `fresnel`, `galaxia`, `glitch`,
`gradiente`, `holograma`, `lava`, `marmore`, `matrix`, `nebulosa`, `neon`, `ondas`, `plasma`,
`terreno`, `toon`, `voronoiCells`, `warp`.

### web/js/nx-loaders.js
Loaders sob demanda. API global `NxLoad`:

| Função | Descrição |
|---|---|
| `NxLoad.rapier()` | Carrega Rapier (física 3D WASM, CDN) |
| `NxLoad.recast()` | Carrega Recast Navigation (pathfinding, CDN) |
| `NxLoad.postprocessing()` | Carrega postprocessing (bloom/DOF, CDN) |
| `NxLoad.meshBVH()` | Carrega three-mesh-bvh (raycast, CDN) |
| `NxLoad.spritesheet(img, json)` | Decodifica spritesheet + atlas JSON |
| `NxLoad.tiled(json)` | Carrega mapa Tiled .json |
| `NxLoad.ready(name)` | True se já carregou |

### desktop/main.js
Shell Electron: instância única, janela normal, F11 tela cheia, F12 DevTools.

### desktop/server.js
Réplica do `serve.py` em Node: estático, `/fontes/`, `/_proxy`, `/_api/saves`.

### desktop/start.sh
Exige `desktop/node_modules/.bin/electron` e executa com flags de GPU.

---

## 3. Fluxo de geração

1. `sendPrompt()` valida prompt e API key
2. `LibrarySelector.selectLibraries(prompt)` → seleciona libs ideais
3. Monta system = `DIRECTIVE + paletaRef + detailDirective + mediaBlock + libraryDirective`
4. `AiClient.chat(...)` — streaming SSE com progresso
5. `extractDocument()` limpa resposta
6. `render(themed(doc))` — rewriteLibs → injectShim → iframe.srcdoc
7. Anti-erro opcional: telemetria → relatório → correção automática

---

## 4. Bridge e segurança

O iframe usa `sandbox="allow-scripts"` (sem `allow-same-origin`): a página gerada tem
origem opaca. O shim injetado define `window.Nexus77` e envia mensagens por `postMessage`;
o shell valida `e.source === frame.contentWindow` e uma whitelist de métodos.
No servidor, a API de saves valida nomes e contenção de caminho (sem `..`, nomes reservados
ou symlinks), limita assets a 6 MB/arquivo e 20 MB/projeto, e o `/_proxy` resolve e fixa o
DNS, revalida redirecionamentos (máx. 4) e bloqueia alvos internos — loopback é permitido
de propósito para LLMs locais.

---

## 5. Modo edição visual

- `✎ EDITAR` congela animações, permite clicar para selecionar elemento
- Duplo clique abre popover com controles (cor, tamanho, texto, fonte)
- Arrasto direto para mover, bordas para redimensionar
- Ctrl+Z desfaz (pilha de 200)
- `✔ FINALIZAR` captura o HTML editado e descongela

---

## 6. Servidor local

Dois servidores equivalentes:

| Servidor | Comando | Uso |
|---|---|---|
| Python | `python3 serve.py` | Fallback navegador |
| Node | `desktop/server.js` | Embutido no Electron |

Ambos servem `web/`, `/_proxy`, `/fontes/`, `/midia`, `/_api/saves`.

---

## 7. Projetos salvos

Cada salvo vira `salvos/<nome>/` com:
- `index.html` — jogo/página
- `meta.json` — prompt original, data
- `assets/images`, `assets/sounds`, `assets/generated` — mídia extraída/reorganizada
- `_backups/<timestamp>/` — backups automáticos a cada save (com assets)

Limites: **6 MB por arquivo** e **20 MB por projeto**. API REST: `/_api/saves/<nome>`
(POST/GET/DELETE) + `/rename`, `/duplicate`, `/backups`, `/_backups/<ts>/restore`.

---

## 8. Execução

```bash
# App Electron (principal)
./desktop/start.sh

# Fallback navegador
python3 serve.py 8790

# Verificar sintaxe JS
cd web/js && for f in *.js; do node --check "$f" || echo "FALHOU: $f"; done
```

---

## 9. Catálogo de bibliotecas — seleção automática

A IA analisa o prompt e escolhe as libs ideais. Exemplos:

| Pedido | Bibliotecas selecionadas |
|---|---|
| "nave 3D" | `[three]` |
| "plataforma 2D com pulo" | `[phaser, zzfx]` |
| "efeitos de partículas" | `[pixi, pixiSound]` |
| "física 2D colisão" | `[phaser, matter]` |
| "animação de logo" | `[gsap]` |
| "música procedural" | `[howler, tone]` |
| "tiros e explosões" | `[zzfx]` |
| "corrida 3D com física" | `[three, rapier]` |
| "mundo com NPCs inteligentes" | `[three, yuka]` |
| "terreno procedural" | `[three, simplexNoise]` |
| "spritesheet com fases Tiled" | `[phaser, spritesheetLoader, tiledLoader]` |
| "painel de debug" | `[lilGui]` |

---

## 10. Limitações conhecidas

1. **Validação é estática, não visual** — harness mede módulos, prompt e APIs, mas não FPS/toque/áudio reais
2. **Áudio suspenso até primeiro gesto** — regra do navegador
3. **Rapier, Recast, postprocessing, meshBVH dependem de CDN** (WASM/addons Three.js)
4. **Playwright não integrado** — test runner separado pendente
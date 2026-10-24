# Documentação — NEXUS GAME v3.1.0

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
Shell estático: **uma linha no topo** com marca, sessão, prompt (**Enter envia**), chip
`LIBS` (bibliotecas usadas pela página), status, VU/KB, SALVAR/ABRIR e ⚙ (canto direito);
`iframe#frame` ocupa o restante. O prompt tem dois botões internos (anexar imagem à
esquerda, reset à direita) e um cartão de referência logo abaixo. Carrega os scripts
na ordem: themes → prefs → library-selector → html-builder → nx-image → ai-client → store →
vu-meter → settings → app.

### web/css/app.css
Layout do shell e dos modais. Todas as cores vêm de variáveis `--nx-*` aplicadas em
`document.documentElement` por `app.applyTheme()`; `--mx-error` é derivado do tema.

### web/js/themes.js
**1 tema fixo** — `PADRÃO · BLACK CYBER` (preto `#000000`, esmeralda `#00E88A`,
roxo `#A855F7`, azul `#00A3FF`). `of()` sempre devolve o mesmo.

### web/js/prefs.js
Persistência em `localStorage["nexus77"]` (JSON). Chaves: `endpoint`, `apiKey`, `model`,
`temperature`, `maxTokens`, `sessionTokens`, `sessionPromptTokens`, `sessionCompletionTokens`,
`usageLog`, `autoFix`, `imageMode` (`auto` padrão ou `local`), `imageModeVersion`
(preserva a escolha explícita de somente local) e `visualIterations` (0–2).

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
- `usedLibraries(html)` — lê o HTML final e devolve as libs realmente usadas (vendor,
  NxLoad/CDN, NxShader e Canvas 2D); alimenta o chip `#libs` da barra superior
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
| `mediaBlock(media)` | lista mídia local; autoriza o caminho absoluto `/imagens/…` como exceção do bloco REFERENCE IMAGE |
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

- `chat(endpoint, key, model, temp, maxTokens, system, user, onProgress, opts)` — streaming SSE
  + fallback; `opts.image` (data URL PNG/JPEG/WEBP validado) transforma o conteúdo do usuário
  em `[{type:'text'}, {type:'image_url'}]`; sem `opts.image`, o payload é idêntico ao anterior
- `isImageInputError(e)` — reconhece HTTP 400/413/415/422 para acionar o fallback multimodal
- `clampMaxTokens(model, maxTokens)` — `0` omite o limite; valores explícitos são cortados
  nos tetos conhecidos (GPT-6 128.000, GPT-5 100.000, GPT-4.1 32.768, GPT-4o 16.384 etc.)
  para evitar HTTP 400
- `listModels(endpoint, key)` — busca modelos da API
- `cancel()` — aborta geração
- Timeouts: conexão 60 s, leitura 120 s, não-streaming 300 s
- Proxy `/_proxy` com fallback fetch direto

### web/js/store.js
API REST para `/_api/saves/<nome>` (POST/GET/DELETE). Backups automáticos em `_backups/<ts>/`.

### web/js/vu-meter.js
Canvas 2D, 20 barras, cabeça percorrente com rastro, degradê esmeralda→azul→roxo.

### web/js/settings.js
Modal de configurações: API (endpoint, key, modelo), GERAÇÃO (temperatura, max tokens,
auto-fix) e IMAGEM DE REFERÊNCIA (automático ou somente local e correções visuais 0–2).

### web/js/app.js
Port de `MainActivity`: estado, UI, fluxo de geração, sessão, salvar/abrir/excluir,
tema, bridge, modo edição visual, anti-erro, Ctrl+Z, anexo de imagem e comparação visual
opcional. Com jogo aberto, o anexo passa por `uploadGameImage()` antes do prompt e vira
asset do jogo; sem jogo, segue o fluxo de recriação. O anexo é descartado após sucesso
confirmado, reset ou remoção; falha de upload/cancelamento e resposta sem a imagem mantêm
o anexo disponível para nova tentativa.

### web/js/nx-image.js
Análise local da referência, sem dependência de endpoint/modelo:

- `inspect(file)` — magic bytes (PNG/JPEG/WEBP), limites (12 MB, 40 MP, 10.000 px),
  dimensões reais, miniatura e relatório
- `analyzeSource(source, meta)` — Canvas 2D: paleta, brilho/contraste, fundo, bordas
  Sobel, componentes, grade 3×3, simetria, linhas; `TextDetector` nativo é opcional
- `compare(ref, cand)` — distância de paleta/grade/brilho/proporção/bordas + issues
- `dataUrl(file)` — leitura para o modo automático
- `usageMode(command)` — `background` por padrão; `texture` quando há palavra de textura
  ou um componente nomeado (cubo, peça, objeto, parede, nave etc.)
- `usageBlock(asset, {path, mode, vision})` — bloco em inglês que manda usar o caminho
  `/imagens/…` **dentro** do jogo (fundo ou textura), proibindo recriar a imagem/base64
- `assetForGame(asset)` — data URL pronta para upload; acima de 6 MB reencoda via canvas
- `DEFAULT_GAME_IMAGE_COMMAND` — pedido padrão quando há jogo aberto e nenhum texto
- `referenceBlock(asset, {vision, followup})` — relatório JSON + regras de recriação
- `fallbackReport(meta, error)` — relatório mínimo, sem inventar detalhes

A análise é aproximada e declara incertezas; não há OpenCV.js/Tesseract.js embutidos.

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

Os quatro loaders CDN usam URLs fixas verificadas: Rapier `rapier.es.js`, Recast
`recast-navigation@0.43.1/+esm`, postprocessing `build/postprocessing.js` e three-mesh-bvh
UMD (unpkg). O loader inicializa WASM (`init()`) e cria os globais esperados pela diretiva:
`RAPIER`, `RecastNavigation`, `EffectComposer`/`RenderPass` e `MeshBVH`/`computeBoundsTree`.
ZzFX usa o build clássico `vendor/zzfx/ZzFX.global.js` (expõe `zzfx`/`ZZFX`/`ZzFX`).

### desktop/main.js
Shell Electron: instância única, janela normal, F11 tela cheia, F12 DevTools.

### desktop/server.js
Réplica do `serve.py` em Node: estático, `/fontes/`, `/_proxy`, `/_api/saves`.

### desktop/start.sh
Exige `desktop/node_modules/.bin/electron` e executa com flags de GPU.

---

## 3. Fluxo de geração

1. `sendPrompt()` valida prompt/API key e, se houver anexo, se a análise terminou
2. Se **há jogo aberto** e anexo: `NxImage.usageMode(command)` decide fundo/textura e
   `uploadGameImage()` grava a imagem em `imagens/nexus-ref-*` via `POST /_api/ref-image`;
   falha de upload aborta a geração sem tocar na página
3. `NxImage.usageBlock()` (jogo aberto) ou `NxImage.referenceBlock()` (sem jogo) entra no
   prompt; no modo automático, a imagem original também é enviada ao modelo
4. `LibrarySelector.selectLibraries(prompt)` → seleciona libs ideais
5. Monta system = `DIRECTIVE + paletaRef + detailDirective + mediaBlock + libraryDirective`
6. `AiClient.chat(...)` — streaming SSE com progresso; no modo automático, conteúdo multimodal
7. `extractDocument()` limpa resposta
8. Verificações: continuação de resposta cortada, sintaxe do JS, qualidade (`Html.lint`) e,
   com jogo aberto, `garantirImagemAplicada()` exige o caminho exato + pista de uso; se
   faltar, pede **uma** correção completa e só aceita HTML válido
9. `render(themed(doc))` — rewriteLibs → injectShim → iframe.srcdoc
10. Anti-erro opcional: telemetria → relatório → correção automática
11. Comparação visual opcional (0–2): captura canvas → `NxImage.compare` → correção
    (somente gerações novas, nunca em ajuste de página)

---

## 4. Bridge e segurança

O iframe usa `sandbox="allow-scripts"` (sem `allow-same-origin`): a página gerada tem
origem opaca. O shim injetado define `window.Nexus77` e envia mensagens por `postMessage`;
o shell valida `e.source === frame.contentWindow` e uma whitelist de métodos.
No servidor, a API de saves valida nomes e contenção de caminho (sem `..`, nomes reservados
ou symlinks), limita assets a 6 MB/arquivo e 20 MB/projeto, e o `/_proxy` resolve e fixa o
DNS, revalida redirecionamentos (máx. 4) e bloqueia alvos internos — loopback é permitido
de propósito para LLMs locais.

A imagem anexada é escolhida pelo seletor nativo do renderer sandbox; o app não recebe
caminhos do sistema, não executa conteúdo da imagem e não cria IPC/preload. Sem jogo
aberto, ela permanece em memória (miniatura + relatório) e, no modo automático, os pixels
vão ao endpoint configurado; se ele recusar, o app usa o relatório local. No modo somente
local, os pixels nunca saem do navegador. Com jogo aberto, a imagem é gravada no servidor
local por `POST /_api/ref-image` (mesma origem ou header `X-Nexus-Local-Request`,
PNG/JPEG/WEBP por magic bytes, ≤6 MB) como `imagens/nexus-ref-*`, nome único, modo `0600`
e abertura `O_EXCL`/`O_NOFOLLOW`; o HTML usa apenas esse caminho root-relative. O save
incorpora o arquivo em `assets/images/` do projeto.

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

Ambos servem `web/`, `/_proxy`, `/fontes/`, `/midia`, `/_api/saves` e
`POST /_api/ref-image` (upload local da imagem anexada a um jogo aberto).

---

## 7. Projetos salvos

Cada salvo vira `salvos/<nome>/` com:
- `index.html` — jogo/página
- `meta.json` — prompt original, data
- `assets/images`, `assets/sounds`, `assets/generated` — mídia extraída/reorganizada
- `_backups/<timestamp>/` — backups automáticos a cada save (com assets)

Limites: **6 MB por arquivo** e **20 MB por projeto**. API REST: `/_api/saves/<nome>`
(POST/GET/DELETE) + `/rename`, `/duplicate`, `/backups`, `/_backups/<ts>/restore`.
Referências root-relative `/imagens/…` ou `/sons/…` são copiadas para `assets/images/` ou
`assets/sounds/` e reescritas sem a barra inicial, para funcionar com o `<base href>` ao
reabrir. Assets de projeto são servidos com ACAO `*` + CORP `cross-origin` (WebGL/Canvas).

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

## 10. Imagem de referência

### Fluxo e estados
O botão de clipe abre o seletor nativo. Estados visíveis no cartão: oculto (sem anexo),
`analisando imagem…`, pronto (miniatura + nome + dimensões + tamanho), erro curto e
removido. A imagem pode ser removida antes do envio; após sucesso confirmado, é descartada.
Com jogo aberto, o cartão mostra `pronta · fundo por padrão; textura se pedir`.

### Modos
| Modo | O que o modelo recebe | Quando usar |
|---|---|---|
| **Automático** (padrão) | imagem original (fonte primária) + relatório | endpoint multimodal; melhor fidelidade |
| **Somente local** | relatório JSON aproximado, sem pixels | modelo sem visão ou privacidade |

No modo automático, HTTP 400/413/415/422 aciona **uma** nova tentativa sem imagem, com o
relatório local; o anexo permanece e a geração não é perdida. Refinos posteriores nunca
reenviam a imagem. Preferências antigas `local` sem `imageModeVersion = 2` migram para
automático; depois desta versão, escolher somente local grava a versão e é preservado.

### Imagem dentro do jogo atual (v3.1.0)
Quando `lastRendered != null`, o anexo deixa de ser referência de recriação e vira **asset
do jogo**:

| Pedido | Modo | Instrução principal |
|---|---|---|
| vazio ou “use como fundo” | **background** | imagem atrás do gameplay (CSS/`drawImage`/`scene.background`), sem bloquear input |
| “textura do cubo/peça/objeto” | **texture** | `createPattern`/`drawImage` (2D) ou `material.map` (3D) no componente nomeado; sem alvo, no objeto controlável |

- `NxImage.usageMode(command)` decide pelo texto (palavras de textura ou alvo nomeado);
  qualquer outro caso é fundo.
- `uploadGameImage()` grava a imagem em `imagens/nexus-ref-<timestamp>-<rand>.<ext>` via
  `POST /_api/ref-image` e devolve o caminho root-relative usado no prompt
  (`NxImage.usageBlock`). O endpoint exige origem local/header, valida magic bytes e
  limite de 6 MB; imagens maiores são reencodadas por `NxImage.assetForGame`.
- Depois da geração, `garantirImagemAplicada()` exige o caminho exato **e** uma pista de
  uso (`url(`, `src=`, `TextureLoader`, `createPattern`, `drawImage`, `.map`). Se faltar,
  faz uma rodada de correção com o documento completo; se ainda assim faltar, avisa e
  mantém o anexo.
- O save copia o arquivo para `salvos/<nome>/assets/images/` e reescreve o caminho para
  `assets/images/...` (sem barra inicial). O anexo só é limpo após uso confirmado; falha
  de upload, cancelamento ou resposta sem a imagem preservam página e anexo.
- Sem jogo aberto, nada muda: a imagem recria a página pelo fluxo de referência. Para
  recriar com um jogo aberto, o usuário reinicia a sessão (↺).

### Recriação e comparação
A instrução padrão (somente imagem) pede uma recriação fiel e **interativa**, prioriza o
comando do usuário e proíbe inventar detalhes ausentes. A comparação opcional (0–2)
captura apenas o maior canvas, compara métricas com a referência e pede correção; não
funciona para páginas puramente CSS/DOM e pode pular canvas WebGL ilegível.

## 11. Limitações conhecidas

1. **Validação é estática, não visual** — harness mede módulos, prompt e APIs, mas não FPS/toque/áudio reais
2. **Áudio suspenso até primeiro gesto** — regra do navegador
3. **Rapier, Recast, postprocessing, meshBVH dependem de CDN** (WASM/addons Three.js)
4. **Playwright não integrado** — test runner separado pendente
5. **Análise de imagem aproximada** — sem OCR garantido (só `TextDetector` nativo), sem
   semântica e sem profundidade confiável; regiões/contornos são estimativas
6. **Comparação visual cobre canvas** — páginas DOM/CSS e canvas WebGL que retornam vazio
   não são comparadas; a correção é limitada a 2 rodadas e vem desligada
7. **Visão depende do endpoint** — o app não garante que o modelo aceite imagens; nesse
   caso o fallback local preserva a geração, mas perde detalhes visuais
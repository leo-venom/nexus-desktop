# Análise de viabilidade — trocar o motor HTML/three.js por Godot/GDScript

Data: 2026-10-21 · Base: NEXUS GAME v2.13.0 (commit d5e5a0f, árvore local com docs modificados)

## Veredito curto

**INVIÁVEL** como troca de motor do NEXUS GAME. Não é questão de gosto nem de esforço: o produto é
um **gerador em tempo de execução** (LLM escreve o jogo enquanto roda) e GDScript **não pode ser
compilado/executado a partir de texto em build exportado**. Trocaria a única arquitetura que
funciona (documento de texto → iframe instantâneo) por um pipeline com compilação por jogo.

**Viável** em dois cenários separados:
1. Jogo **artesanal** (feito à mão) em Godot — projeto novo, não o NEXUS GAME.
2. Feature **"exportar projeto Godot"** — a IA gera .gd/.tscn e o usuário baixa; não roda ao vivo.

## Dados medidos nesta máquina

| Item | Valor |
|---|---|
| Código do shell web | 4.984 linhas JS + 746 CSS (app.js 1.915, html-builder 757, nx-textures 959, ai-client 490) |
| Backend | serve.py 367 linhas · desktop/server.js 487 linhas · Electron 44.9 |
| three.js embutido | `three.min.js` 669.884 bytes (654 KB), UMD, sem addons |
| Prompt fixo por geração | 11.211 chars ≈ 2.803 tokens (sem texturas) · 19.063 chars com pack de texturas |
| Projeto em disco | 303 MB (298 MB = `desktop/node_modules`) |
| Execução da página | `iframe sandbox="allow-scripts allow-pointer-lock allow-popups"` + `srcdoc`, origem opaca, ponte por `postMessage` |
| Prévia ao vivo | re-render a cada 1.200 ms a partir de 1.200 chars (`completePartial`) |
| Godot no Arch | 4.7.2 — 75,07 MiB download / **173,60 MiB instalado** |
| GPU | Intel `8086:0152` (Ivy Bridge, Gen7) — **sem Vulkan**; Mesa 26.2.2 |
| CPU/RAM | 2 núcleos / 7 GB |

## Bloqueios técnicos (em ordem de gravidade)

### 1. GDScript não roda a partir de texto gerado
Não existe `eval` em GDScript e os templates de export **remoção o compilador**. O LLM não pode
"escrever o jogo e rodar". Só há dois caminhos, ambos ruins:

- **Embarcar o editor Godot** (173 MB) e criar/importar um projeto por geração → segundos de import,
  janela nativa nova, cache de shader, processo por jogo. A prévia de 1,2 s desaparece.
- **Godot web export** (wasm) → exige `SharedArrayBuffer` = `Cross-Origin-Opener-Policy` +
  `Cross-Origin-Embedder-Policy`. O jogo roda em `srcdoc` com origem opaca: **impossível** servir
  esses headers nesse iframe. Mataria também o sandbox atual (o jogo passaria a rodar como binário
  nativo com acesso a FS/rede).

### 2. Fim da prévia em streaming (o coração do app)
HTML parcial é renderizável: o app reescreve o documento incompleto e mostra o jogo nascendo.
`.gd` + `.tscn` parciais não são parseáveis — o usuário ficaria 60–120 s olhando spinner. Hoje o
`CONNECT_TIMEOUT=60 s` / `READ_TIMEOUT=120 s` existem porque o corpo é consumido incrementalmente.

### 3. Saída multi-arquivo e mais frágil
Contrato atual: **um** `<!DOCTYPE html>` fechado, tudo inline. Godot exige no mínimo
`project.godot` + `main.tscn` + `main.gd`. Custo de tokens maior, sintaxe rígida (indentação,
`NodePath`, tipagem), e zero tolerância: HTML degrada, GDScript que não parseia = tela preta.

### 4. Editor de elementos morre
O editor (popover, clique, arrasto, resize, undo, `editSelHtml` → `elementHint`) é 100% DOM/CSS.
Godot não tem DOM nem CSS: retocar cor/tamanho/posição de um nó exigiria uma ponte nova sobre a
árvore remota e um popover próprio — reescrita, não adaptação.

### 5. Todo o acervo do prompt vira lixo
`nx-textures.js` (44 texturas, 12 receitas `CanvasTexture`) e os 13 sons WebAudio são receitas de
**Canvas2D + WebAudio**. Em GDScript viram `Image`/`NoiseTexture` e `AudioStreamGenerator` — nada
reaproveitável. Seriam semanas só para reescrever as receitas.

### 6. Custo no hardware do Leo
Gen7 sem Vulkan → Godot 4 só no renderer **Compatibility** (OpenGL 3.3), com stutter de compilação
de shader na primeira execução. 2 núcleos: import de projeto e primeiro frame competem com o
servidor Python. Hoje o jogo abre em < 100 ms num iframe.

## O que o Godot faria melhor (honesto)

- Física, animação, navegação, tilemap e luzes prontos — sem escrever engine no prompt.
- Export nativo para Android/desktop com performance previsível.
- Cena editável por humano depois de gerada.
Nada disso resolve o problema real do NEXUS GAME, que é **gerar e ver na hora**.

## Alternativas recomendadas (mesmo objetivo, custo baixo)

| Objetivo | Caminho certo |
|---|---|
| 3D melhor nos jogos gerados | Empacotar three.js com addons (`OrbitControls`, `RoomEnvironment`) num bundle local único — some a limitação "sem addons" |
| Física nos jogos gerados | `cannon-es` local (~150 KB) + receita no prompt |
| Pós-processamento (bloom, SSAO) | `EffectComposer` no bundle local |
| Jogo "de verdade" em engine | Projeto Godot separado, feito à mão, em `01_Projeto/` — o NEXUS GAME continua sendo o gerador |
| Pedido do usuário "quero ver em Godot" | Feature de export: IA gera `project.godot`+`main.gd`+`main.tscn` e o app entrega um .zip |

## Números do cenário de troca (estimativa)

| Etapa | Esforço |
|---|---|
| Host Godot + gerador de projeto por pedido | 3–4 semanas |
| Ponte de edição (substituto do popover DOM) | 2–3 semanas |
| Reescrita de texturas e áudio (44 + 13) | 2 semanas |
| Reescrita do prompt + validação/lint de GDScript | 2 semanas |
| **Total** | **~2 meses** para entregar um app mais lento, sem prévia e sem sandbox |

## Conclusão

Manter HTML/three.js. O valor do NEXUS GAME é o ciclo **pedido → jogo jogável em segundos**, e isso
só existe porque o runtime é um documento de texto interpretado na hora. Godot é o oposto
disso por construção: projeto compilado, multi-arquivo, sem `eval`. Godot entra como projeto
paralelo artesanal — nunca como motor do gerador.

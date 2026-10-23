# Análise — texturas com relevo realista (normal/bump/roughness) no NEXUS GAME

Data: 2026-10-22 · Base: v2.14.0, three.js local r160, `nx-textures.js` (959 linhas, 44 texturas)

## Estado: IMPLEMENTADO (Nível 0 + Nível 1) em 2026-10-22

`nx-textures.js` 1.1.0 entrega `NxTex.normal()`, `NxTex.normalCanvas()`, `NxTex.pbr()` e
`NxTex.acabamento()`, com tabela de relevo e acabamento para as 44 texturas; o bloco RELEVO entrou
na `DIRECTIVE`. Ver CHANGELOG v2.14.0. Nível 2 (mapas autorais por família) continua pendente.

## Veredito

**SIM, é possível — sem trocar de motor, sem CDN, sem addon.** O build local do three.js já traz
`normalMap`, `bumpMap`, `roughnessMap`, `metalnessMap`, `aoMap` e `displacementMap` no core.
O que falta é **gerar e ligar os mapas**: hoje o pack só entrega cor (`map`) + `anisotropy = 4`.

Ganho visual é grande justamente onde o jogo parece "plástico": pedra, metal, madeira, ferrugem,
concreto e tijolo passam a reagir à luz com relevo sem nenhum polígono extra.

## Evidência no build local

| Símbolo no `vendor/three/three.min.js` (669.884 bytes) | Ocorrências |
|---|---|
| `normalMap` | 81 |
| `bumpMap` | 48 |
| `roughnessMap` / `metalnessMap` | 30 / 30 |
| `aoMap` | 67 |
| `displacementMap` | 53 |
| `normalScale` / `bumpScale` | 29 / 31 |

Estado atual do pack (`nx-textures.js`): 44 receitas Canvas2D, cache por nome, `TAM = 128`,
`NxTex.three(nome)` cria `CanvasTexture` de **256** com `wrapS/wrapT = RepeatWrapping` e
`anisotropy = 4`. **Nenhum mapa além de `map`.** O prompt só pede `roughness`/`metalness` escalares.

## Custos medidos nesta máquina (Chromium, 44 texturas)

| Operação | Tempo total | Por textura |
|---|---|---|
| Desenhar as 44 texturas de cor @128 (como hoje) | 2.871 ms | 65 ms |
| Normal map por Sobel a partir da cor @128 | 1.111 ms | **25 ms** |
| Desenhar as 44 @256 | 3.915 ms | 89 ms |
| Normal map @256 | 925 ms | **21 ms** |

Memória por textura (RGBA + mipmaps ~33%): **85 KB @128** · **341 KB @256**.
Um jogo típico usa 1–3 texturas → 3 mapas por material = **~0,25–1 MB** de VRAM. Irrelevante.

Cache resolve o custo: o normal map é gerado **uma vez por textura** na primeira vez que o jogo
pede, não por frame.

## O que NÃO foi medido (honesto)

Impacto de FPS na iGPU Ivy Bridge. O navegador de teste roda em **SwiftShader** (software:
`ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device))`), onde o número não representa a GPU real —
o teste deu variação de ruído (–25%). A medição válida tem de ser feita **dentro do Electron**,
com a cena real, comparando `map` × `map + normalMap`.

Custo esperado (teoria, não medição): `normalMap` = 1 fetch de textura + 3 operações por pixel,
**zero geometria extra**. `displacementMap` é o caro (exige malha subdividida) — não recomendado.

## Três níveis de implementação

### Nível 0 — relevo grátis (bump por luminância) — ~20 min
`mat.bumpMap = NxTex.three('pedra'); mat.bumpScale = 0.03;`
O three deriva o relevo da própria luminância da cor. Zero geração nova, zero memória extra
(reusa a mesma textura). Funciona bem em superfícies com variação tonal (pedra, concreto,
ferrugem, madeira). Limitação: `bumpScale` alto em textura de cor saturada gera relevo "errado"
(neon, zebra, holograma).

### Nível 1 — normal map real (Sobel da luminância, cacheado) — ~1–2 h
`NxTex.normal(nome, força)` → `CanvasTexture` RGBA com wrap correto, cacheada por nome+força.
Helper `NxTex.pbr(material, nome)` liga `map` + `normalMap` + `roughness`/`metalness` coerentes.
Custo medido: 25 ms na primeira vez por textura (uma vez por sessão).
Ganho: direção de luz correta no relevo, sem o artefato do bump em cor saturada.

### Nível 2 — mapas autorais por família (o "realista de verdade") — ~1 dia
Altura desenhada por família (não derivada da cor) + `roughnessMap` (metal polido × oxidado,
pedra seca × úmida) + `aoMap` simples. Vale para ~30 das 44 texturas (minerais, metais, orgânicas,
gemas). Efeitos (lava, plasma, neon, aurora, nebulosa, holograma, binário, circuito, fogo_azul,
água) não têm relevo — devem ficar planos/emissivos.

## Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Hitch de compilação do novo shader na iGPU (primeira aparição) | `renderer.compile(scene, camera)` antes do primeiro frame (a Regra 4 já exige primeiro frame síncrono) |
| Relevo exagerado em textura de cor | `normalScale`/`bumpScale` baixos por padrão + receita no prompt por família |
| Prompt inchado | 1 bloco de ~500 chars + API no pack (mesmo padrão do `NxTex.three`) |
| Pesquisa de shader em jogo com 240 malhas | Um material por textura (compartilhado), nunca material por mesh |

## Recomendação

Nível 0 + Nível 1 na mesma passada (o Nível 0 já cobre o caso simples e o Nível 1 dá o relevo
direcional correto), com o Nível 2 só nas famílias minerais/metálicas. Sem trocar motor, sem
CDN, sem addon, e sem custo por frame relevante em cena de jogo típica.

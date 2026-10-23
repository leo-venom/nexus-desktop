# Análise — "cubo gelatinoso" (Gelatinous Cube) no NEXUS GAME

Data: 2026-10-22 · Base: v2.14.0 + GELATINA (NxTex 1.2.0) · teste em cena WebGL com o stack real

## Estado: IMPLEMENTADO em 2026-10-22

`NxTex.gelGeo()` (v1.3.0) faz a geometria arredondada por superelipsoide e o bloco GELATINA ganhou
as regras de forma, conteúdo suspenso com contraste, quina iluminada (key 1.8–2.4) e limites.
Verificado: 1.014 vértices, normais ok, bbox 1,46 para caixa 1,7; cena com esqueleto/espada/moeda
renderiza sem artefato. O que a inspeção visual ainda cobrou (refração forte da grade, topo
superexposto) é **tuning de cena**, já coberto pelas regras novas de luz e contraste.

## Resumo

O pedido **funciona**, mas hoje depende de sorte: o bloco GELATINA ensina o material, não a
**forma**. Com `BoxGeometry` puro (o caminho que o modelo toma por padrão) o resultado é um
**bloco de resina/plástico com arestas vivas** — nada de gelatina. A diferença entre "caixa de gel"
e "cubo gelatinoso" está em **arredondar as arestas** e **ter algo suspenso dentro**.

## Teste comparativo (mesma luz, mesmo env, mesmo material `NxTex.gel`)

| Variante | Aparência medida |
|---|---|
| A) `BoxGeometry(1.7,1.7,1.7,1,1,1)` + `transmission 0.95` | **bloco de plástico/resina**, aresta cortante, highlight quebrado — não lê como gel |
| B) `BoxGeometry(1.7,1.7,1.7,14,14,14)` deformado para superelipsoide (n=4.2) + `transmission` + esqueleto/espada dentro | **cubo gelatinoso convincente**: rim contínuo na quina e conteúdo visível através da massa |
| C) mesma geometria arredondada + `opacity 0.45` | **acrílico leitoso**; conteúdo quase desaparece, sem profundidade |

Conclusão: `transmission` resolve o material, mas a **silhueta** precisa de arestas arredondadas.
Aresta viva = superfície de baixa energia (vidro/acrílico); aresta arredondada = tensão superficial
(gelatina). E o conteúdo suspenso é o que conta a história do monstro.

## Receita que funcionou (superelipsoide por deslocamento de vértices)

```js
var g = new THREE.BoxGeometry(s, s, s, 14, 14, 14);   // 1.350 vértices
var p = g.attributes.position, v = new THREE.Vector3(), n = 4.2, h = s / 2;
for (var i = 0; i < p.count; i++) {
  v.fromBufferAttribute(p, i);
  var dx = Math.abs(v.x / h), dy = Math.abs(v.y / h), dz = Math.abs(v.z / h);
  var d = Math.pow(Math.pow(dx, n) + Math.pow(dy, n) + Math.pow(dz, n), 1 / n);
  v.multiplyScalar((d > 1e-6 ? 1 / d : 1) * 0.86);   // 0.86 = quina mais gorda que o cubo
  p.setXYZ(i, v.x, v.y, v.z);
}
g.computeVertexNormals();
```
`n` alto (6–10) → quase cubo; `n` 3–4 → goma arredondada. O fator 0.86 dá aquele "estufado".

## Custo medido nesta máquina

| Item | Valor |
|---|---|
| Vértices do cubo arredondado (14 segmentos) | 1.350 (≈2,7 mil triângulos) |
| Wobble de vértices por frame (JS, 14 seg) | **0,52 ms** |
| Wobble 10 seg / 6 seg | 0,50 ms / 0,35 ms |
| Squash/stretch por `scale` (600 frames) | **0,2 ms no total** (praticamente grátis) |

Ou seja: wobble de verdade custa ~3% do orçamento de 16,7 ms; `scale` custa zero. Para GPU fraca,
`scale` + 1 deformação leve a cada 2–3 frames resolve.

## O que falta no prompt (lacuna real)

O bloco GELATINA (implementado hoje) fala de material, `depthWrite`, environment e squash/stretch —
**não fala de aresta, nem de conteúdo interno, nem de forma**. Um pedido "cubo gelatinoso" hoje
recebe `BoxGeometry` cru. Faltam ~500–600 chars:

1. **Arestas**: nunca `BoxGeometry` sem subdivisão para corpo de gel — usar a receita do superelipsoide
   (ou `SphereGeometry` achatada quando for bolha/gota). Aresta viva = plástico.
2. **Conteúdo suspenso**: o gel precisa de algo dentro (ossos, espada, inseto, moeda) — é o que
   transforma "cubo verde" em "cubo gelatinoso". Objetos opacos, `MeshStandardMaterial`, sem gel.
3. **Quina iluminada**: uma luz rasante ou `rim` na cor do gel cria o highlight contínuo da aresta
   (é o que a quina arredondada precisa para ler como úmida).
4. **Limites**: 1 corpo de gel + até ~10 objetos internos; wobble por `scale` por padrão, vértices
   só se o pedido for claramente "tremendo".

## Veredito

Viável e barato. Não precisa de asset, CDN, addon nem motor novo: é geometria (subdividir + empurrar
vértices) e três frases de prompt. Sem essa correção, o app entrega um cubo de resina quando o Leo
pedir o monstro clássico.

# Análise — pedido de peça/objeto GELATINOSO e SEMI-TRANSPARENTE

> ⚠️ **DOCUMENTO HISTÓRICO (2026-10-22, v2.14.0)** — cita `NxTex.gel()`, removido na v3.0.0.
> Hoje o recurso vive em `NxMat.threeGel(cor, opts)` (ver [`DIRECTIVE.md`](DIRECTIVE.md)).
> A permissão condicionada de `transmission` continua na REGRA 2 do DIRECTIVE.

Data: 2026-10-22 · Base: v2.14.0 (three local r160, prompt `DIRECTIVE`, anti-erro ativo)

## Estado: IMPLEMENTADO em 2026-10-22

REGRA 2 ajustada (permissão condicionada), bloco GELATINA na DIRECTIVE e `NxTex.gel()` no pack
(versão 1.2.0). Verificado: material calibrado, `attenuationDistance` clampado em 2.5, refração
visível em cena com fundo listrado, `lint()` sem falhas no documento de gel.

## Resumo

Hoje esse pedido **sai errado por regra do próprio prompt**: a `DIRECTIVE` proíbe `transmission`,
`MeshPhysicalMaterial` e `clearcoat` (linha 93). O modelo então resolve "gelatina" com
`MeshStandardMaterial` + `transparent/opacity` — que, medido em cena, lê como **acrílico tingido**,
não como gelatina.

E o mais importante: **a tecnologia funciona nesta stack**. Testado dentro de iframe com
`sandbox="allow-scripts"` (o ambiente real dos jogos): `transmission` renderiza, refrata o fundo e
não fica preto. O bloqueio é 100% de regra, não de engine.

## Evidência

### 1. O que o prompt manda hoje
`html-builder.js`, REGRA 2 (desempenho):
> "Nunca use transmission, MeshPhysicalMaterial pesado, clearcoat, nem dezenas de materiais com
> uniforms próprios."

Fora isso, a única orientação de material é `roughness`/`metalness` escalares (REGRA 3). Não existe
nenhuma menção a gelatina, gel, slime, translúcido, `depthWrite`, `renderOrder` ou ordenação de
transparentes. O pack `NxTex` mapeia "transparente" → textura `vidro`, e não tem família gel.

### 2. Teste real dos materiais (cena em iframe sandbox, three r160 local)

| Material | Resultado visual |
|---|---|
| `MeshStandardMaterial` sólido | plástico/cerâmica glossy — sem leitura de gelatina |
| `transparent:true, opacity:0.45, depthWrite:false` | **acrílico/plástico translúcido**; o que está atrás aparece sem distorção |
| `MeshPhysicalMaterial transmission:0.95, thickness:0.8, ior:1.33` | **gelatina convincente**; o objeto atrás fica visível e colorido |
| `transmission:0.98, thickness:1.2, ior:1.4` + fundo listrado | as listras **encurvam/deslocam dentro da esfera** → refração de verdade |
| `transmission:0.92 + clearcoat:1 + attenuationDistance:1.2` | escureceu demais (pareceu resina escura) → `attenuationDistance` curto em malha pequena mata o brilho |

Conclusão do teste de refração: `transmission` **amostra a cena atrás** (não é opacity disfarçada).
Nenhuma variante deu tela preta ou erro de shader com o `PMREMGenerator` que a REGRA 3 já exige.

### 3. Custo — o que está medido e o que não está

- Medido: renderiza sem erro dentro do sandbox, com e sem `scene.environment`.
- **Não medido com confiança**: FPS na iGPU Ivy Bridge. As tentativas no navegador de teste caíram em
  SwiftShader (software) e os números saíram incoerentes (120 esferas "mais rápidas" que 1) —
  recompilação de shader e rasterizador de software poluem a medição. Não vou inventar número.
- Fato de arquitetura: a refração exige amostrar o que está atrás, então o custo cresce com a
  **cena opaca atrás** — um gel em cena de 10 objetos é barato; 40 objetos translúcidos não é.

### 4. Riscos reais do visual "gelatina"
1. **Ordenação**: transparente sem `depthWrite` + várias peças = sobreposição errada. Máx. 1–3 peças de gel.
2. **Escurecimento**: `attenuationDistance` baixo (≤1,5 em malha pequena) apaga o gel — usar ≥2,5 ou omitir.
3. **Sem `scene.environment`** o gel fica chapado (a REGRA 3 já manda montar o PMREM, então ok).
4. **Movimento**: gelatina parada não convence — precisa de squash/stretch (scale) e/ou wobble de vértices.

## Receita que funciona (testada)

```js
// 1) corpo principal: gelatina translúcida com refração
var gel = new THREE.MeshPhysicalMaterial({
  color: 0x66ffcc, transmission: 0.95, thickness: 1.1, ior: 1.36,
  roughness: 0.08, metalness: 0, clearcoat: 0.4, clearcoatRoughness: 0.1
});
// 2) interior/realce barato: casca BackSide emissiva fraca (vende volume sem custo de passe)
// 3) vida: squash/stretch no scale + wobble senoidal nos vértices (fora do loop, sem alocar)
mesh.scale.set(1 + 0.05*Math.sin(t*6), 1 - 0.05*Math.sin(t*6), 1 + 0.04*Math.cos(t*5));
```

## O que mudar (proposta, ~1 alteração de regra + 1 bloco)

| Onde | Mudança |
|---|---|
| REGRA 2, linha 93 | trocar a proibição absoluta por: `transmission`/`MeshPhysicalMaterial` **permitidos só** para corpos translúcidos (gelatina, gel, slime, gelo, resina, vidro grosso, água), no máximo **2 materiais**, `transmission ≤ 0.98`, `thickness ≤ 1.5`, `ior 1,30–1,45`, `clearcoat ≤ 0.6`; proibido `attenuationDistance < 2`; proibido em peça pequena sem `scene.environment` |
| NOVO bloco "GELATINA / TRANSLÚCIDO" (~700 chars) | receita acima + limite de 1–3 peças + `depthWrite:false` + `renderOrder` + wobble/squash obrigatório + aviso de que opacity sozinha = plástico |
| `NxTex` (opcional) | `NxTex.gel(mat, cor)` configurando o Physical com os valores certos e devolvendo o material |

Esforço: ~30–40 min (texto de prompt + helper) e teste visual no app. Sem novo asset, sem CDN,
sem addon, sem tocar no motor.

## Riscos de aceitar a mudança
- Modelo pode exagerar e encher a cena de `MeshPhysicalMaterial` → mitigado pelo limite de 2 materiais
  e pelo anti-erro (que agora devolve erro ao modelo automaticamente).
- Em GPU fraca, cena com muito transparente pode cair de FPS → mitigado pelo limite de peças e pelo
  FPS adaptativo que a REGRA 2 já exige.

**Veredito: viável e recomendado.** O pedido de gelatina hoje é o caso mais claro de regra
antiquada. Ela existe por medo de custo em GPU integrada — medo válido para 40 objetos, não para
o objeto único que o usuário pediu.

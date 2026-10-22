#!/usr/bin/env node
/* ============================================================
 * gerar_game_mode.js — regenera docs/GAME_MODE.md a partir do
 * código em execução (web/js/html-builder.js).
 *
 * Uso:  node docs/gerar_game_mode.js
 * Não tem dependências: lê o fonte, avalia em vm e mede tudo.
 * ============================================================ */
'use strict';

var fs = require('fs');
var vm = require('vm');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var read = function (rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); };

var ctx = { window: {}, document: {} };
vm.runInNewContext(read('web/js/themes.js') + '\n' + read('web/js/html-builder.js'), ctx);

var H = ctx.window.Html;
var T = ctx.window.Themes;

if (!H || !H.GAME_DIRECTIVE) {
  console.error('Falhou: window.Html.GAME_DIRECTIVE não encontrado.');
  process.exit(1);
}

var DIRECTIVE = H.GAME_DIRECTIVE;

/* ---- métricas de texto ---- */
function chars(s) { return s ? s.length : 0; }
function lines(s) { return s ? s.split('\n').length : 0; }
function pct(part, total) {
  if (!total) return '—';
  return (Math.round((part / total) * 1000) / 10).toFixed(1).replace('.', ',') + '%';
}

var promptSemTex = H.systemPrompt(T.of(0), 1, 'jogo de nave');
var promptComTex = H.systemPrompt(T.of(0), 1, 'jogo de nave com textura de tijolo');
var promptDesenho = H.systemPrompt(T.of(0), 1, 'paisagem ao pôr do sol');

/* ---- fatias: HEAD / PACK / TAIL ----
   O html-builder.js remove os marcadores @@NX_TEX_BEGIN@@/END@@ ao montar a
   constante final, por isso a divisão é feita por âncoras de título (únicas no
   texto). Se um dia os marcadores voltarem a ser exportados, eles têm prioridade. */
var HEAD_ANCHOR = 'TEXTURAS PROCEDURAIS';
var TAIL_ANCHOR = '13 SONS WEBAUDIO';
var PACK = '';
var HEAD = DIRECTIVE;
var TAIL = '';
var packMatch = DIRECTIVE.match(/@@NX_TEX_BEGIN@@([\s\S]*?)@@NX_TEX_END@@/);
if (packMatch) {
  PACK = packMatch[1];
  HEAD = DIRECTIVE.split('@@NX_TEX_BEGIN@@')[0];
  TAIL = DIRECTIVE.split('@@NX_TEX_END@@')[1] || '';
} else {
  var packAt = DIRECTIVE.indexOf(HEAD_ANCHOR);
  var tailAt = DIRECTIVE.indexOf(TAIL_ANCHOR);
  if (packAt < 0 || tailAt < 0 || tailAt <= packAt) {
    console.error('Falhou: âncoras "' + HEAD_ANCHOR + '" / "' + TAIL_ANCHOR + '" não encontradas (nessa ordem) em GAME_DIRECTIVE.');
    process.exit(1);
  }
  HEAD = DIRECTIVE.slice(0, packAt);
  PACK = DIRECTIVE.slice(packAt, tailAt);
  TAIL = DIRECTIVE.slice(tailAt);
}

/* ---- blocos numerados ---- */
var blockRe = /^(\d)\) (.+)$/gm;
var hits = [];
var m;
while ((m = blockRe.exec(DIRECTIVE))) {
  hits.push({ num: Number(m[1]), title: m[2].trim(), start: m.index, end: DIRECTIVE.length });
}
for (var i = 0; i < hits.length - 1; i++) hits[i].end = hits[i + 1].start;
/* O último bloco numerado fica na cabeça: não pode engolir pack nem cauda. */
if (hits.length) hits[hits.length - 1].end = chars(HEAD);

/* ---- seções nomeadas dentro do PACK e da TAIL ---- */
function namedSections(text) {
  var out = [];
  var re = /^(PACK DE TEXTURAS PRONTO[^\n]*|API \(2D\):|API \(3D\/three\.js\):|REGRA DE 3D SIMPLES|ANIMAÇÃO DE TEXTURA:|13 SONS WEBAUDIO[^\n]*|CHECK FINAL[^\n]*|ENTREGUE APENAS O HTML\.)/gm;
  var h;
  while ((h = re.exec(text))) out.push({ title: h[1].replace(/[:\s]+$/, ''), start: h.index, end: text.length });
  for (var j = 0; j < out.length - 1; j++) out[j].end = out[j + 1].start;
  return out;
}

/* ---- inventário do pack NxTex e dos sons ---- */
var packNamesLine = (PACK.match(/^lava, .+$/m) || [''])[0].replace(/\.$/, '');
var texNames = packNamesLine ? packNamesLine.split(',').map(function (s) { return s.trim(); }).filter(Boolean) : [];
var receitas = (PACK.match(/^\d+\. .+$/gm) || []).length;
var sons = (TAIL.match(/^\d+\. .+$/gm) || []).length;
var checks = (TAIL.match(/^- .+\?$/gm) || []).length;

/* ---- versão ---- */
var verMatch = read('web/js/ai-client.js').match(/VERSION:\s*'([^']+)'/);
var VERSION = verMatch ? verMatch[1] : '?';
var hoje = new Date().toISOString().slice(0, 10);

/* ---- monta o markdown ---- */
var out = [];
out.push('# GAME_MODE — diretriz oficial do modo jogo');
out.push('');
out.push('**Gerado do código em execução** (`web/js/html-builder.js`) por `docs/gerar_game_mode.js` ·');
out.push('NEXUS GAME v' + VERSION + ' · ' + hoje + '. Não edite à mão: rode o gerador.');
out.push('');
out.push('O modo é escolhido por `Html.detectMode(command)` — 🎮 `game`, 🎨 `drawing`, 💬 `chat`.');
out.push('Este documento descreve **apenas** o modo jogo. Comandos de jogo recebem:');
out.push('');
out.push('```text');
out.push('BASE_PROMPT + GAME_DIRECTIVE (ou HEAD + TEXTURE_OFF + TAIL) + gameScopeNote +');
out.push('gameLightingNote + PALETA (a IA escolhe 3 cores) + mediaBlock(media)');
out.push('```');
out.push('');
out.push('## Números');
out.push('');
out.push('| Item | Valor |');
out.push('|---|---|');
out.push('| `GAME_DIRECTIVE` completo | ' + chars(DIRECTIVE).toLocaleString('pt-BR') + ' chars (' + lines(DIRECTIVE) + ' linhas) |');
out.push('| `GAME_DIRECTIVE_HEAD` (sempre) | ' + chars(HEAD).toLocaleString('pt-BR') + ' chars (' + pct(chars(HEAD), chars(DIRECTIVE)) + ') |');
out.push('| Bloco de texturas `@@NX_TEX` (sob pedido) | ' + chars(PACK).toLocaleString('pt-BR') + ' chars (' + pct(chars(PACK), chars(DIRECTIVE)) + ') |');
out.push('| `GAME_DIRECTIVE_TAIL` (sempre) | ' + chars(TAIL).toLocaleString('pt-BR') + ' chars (' + pct(chars(TAIL), chars(DIRECTIVE)) + ') |');
out.push('| `TEXTURE_OFF_DIRECTIVE` | ' + chars(H.TEXTURE_OFF_DIRECTIVE).toLocaleString('pt-BR') + ' chars |');
out.push('| Prompt de jogo (system) sem texturas | ' + chars(promptSemTex).toLocaleString('pt-BR') + ' chars |');
out.push('| Prompt de jogo (system) com texturas | ' + chars(promptComTex).toLocaleString('pt-BR') + ' chars |');
out.push('| Prompt de desenho (`drawing`) | ' + chars(promptDesenho).toLocaleString('pt-BR') + ' chars |');
out.push('| Blocos numerados | ' + hits.length + ' |');
out.push('| Texturas no pack `NxTex` | ' + texNames.length + ' |');
out.push('| Receitas `CanvasTexture` | ' + receitas + ' |');
out.push('| Sons WebAudio | ' + sons + ' |');
out.push('| Perguntas do `CHECK FINAL` | ' + checks + ' |');
out.push('| Temas no app | ' + (T.ALL || []).length + ' (fixo; a paleta do jogo NÃO é herdada) |');
out.push('');
out.push('## Blocos do `GAME_DIRECTIVE`');
out.push('');
out.push('| # | Bloco | Chars |');
out.push('|---|---|---|');
hits.forEach(function (b) {
  out.push('| ' + b.num + ' | ' + b.title + ' | ' + chars(DIRECTIVE.slice(b.start, b.end)).toLocaleString('pt-BR') + ' |');
});
out.push('');
out.push('## Pack de texturas e cauda');
out.push('');
out.push('O bloco `@@NX_TEX_BEGIN@@ … @@NX_TEX_END@@` entra **somente quando o pedido cita textura/material**');
out.push('(`Html.wantsTextures`). Sem textura, `TEXTURE_OFF_DIRECTIVE` ocupa o lugar dele.');
out.push('A cauda (`13 SONS` + `CHECK FINAL`) entra **sempre**.');
out.push('');
out.push('| Parte | Chars |');
out.push('|---|---|');
namedSections(PACK).forEach(function (s) {
  out.push('| ' + s.title + ' | ' + chars(PACK.slice(s.start, s.end)).toLocaleString('pt-BR') + ' |');
});
namedSections(TAIL).forEach(function (s) {
  out.push('| ' + s.title + ' | ' + chars(TAIL.slice(s.start, s.end)).toLocaleString('pt-BR') + ' |');
});
out.push('');
out.push('Texturas do pack: ' + texNames.join(', ') + '.');
out.push('');
out.push('## Texto integral (verbatim do código)');
out.push('');
out.push('```text');
out.push(DIRECTIVE);
out.push('```');
out.push('');
out.push('## Como regerar');
out.push('');
out.push('```bash');
out.push('node docs/gerar_game_mode.js');
out.push('```');
out.push('');
out.push('O gerador falha (exit 1) se `window.Html.GAME_DIRECTIVE` não existir, então o arquivo');
out.push('nunca fica silenciosamente vazio. Números de referência também estão em');
out.push('`docs/ESTADO_ATUAL.md` (§5 e §11) e as âncoras obrigatórias em `docs/REGRAS_DEFINITIVAS.md` (passo 6).');
out.push('');

var dest = path.join(ROOT, 'docs/GAME_MODE.md');
fs.writeFileSync(dest, out.join('\n'), 'utf8');
console.log('GAME_MODE.md gerado: ' + out.join('\n').length + ' chars, ' + out.join('\n').split('\n').length + ' linhas');
console.log('GAME_DIRECTIVE ' + chars(DIRECTIVE) + ' · prompt sem tex ' + chars(promptSemTex) + ' · com tex ' + chars(promptComTex));

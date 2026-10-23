#!/usr/bin/env node
/* ============================================================
 * gerar_game_mode.js — OBSOLETO (v2.14.0+)
 *
 * A arquitetura de modos (jogo/desenho/chat) foi REMOVIDA.
 * O GAME_DIRECTIVE, DRAWING_DIRECTIVE, CHAT_DIRECTIVE,
 * TEXTURE_OFF_DIRECTIVE, detectMode, wantsTextures,
 * gameScopeNote, drawingScopeNote, chatScopeNote, gameLightingNote
 * não existem mais.
 *
 * Substituído por DIRECTIVE única (docs/DIRECTIVE.md).
 * ============================================================ */
'use strict';

console.log('⚠️  gerar_game_mode.js OBSOLETO');
console.log('A arquitetura de modos foi removida em v2.14.0.');
console.log('Consulte docs/DIRECTIVE.md para a diretriz unificada.');
console.log('');
console.log('Para extrair a DIRECTIVE do código:');
console.log('  node -e "');
console.log('    var c={window:{}};');
console.log('    var vm=require(\"vm\"),fs=require(\"fs\");');
console.log('    vm.runInNewContext(fs.readFileSync(\"web/js/themes.js\",\"utf8\")+\"\n\"+fs.readFileSync(\"web/js/html-builder.js\",\"utf8\"),c);');
console.log('    console.log(c.window.Html.DIRECTIVE);');
console.log('  "');
process.exit(0);

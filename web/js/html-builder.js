/* ============================================================
 * html-builder.js — port fiel de Html.kt (Android) para o navegador.
 * Monta o prompt, extrai o documento, decora com o tema e gera as
 * páginas internas (welcome, erro e lista de salvos).
 * Sem dependências de DOM; usa apenas Themes.hexA para o alpha.
 * ============================================================ */
(function () {
  'use strict';

  /* Base lógica (no app era o loadDataWithBaseURL). */
  var BASE = 'https://nexus77.local/';

  var VIEWPORT_REGEX = /name\s*=\s*["']viewport["']/i;
  var HEAD_REGEX = /<head[^>]*>/i;
  var HTML_REGEX = /<html[^>]*>/i;

  var BASE_PROMPT = `You are the page generator of the app NEXUS-DESKTOP. From the user's short command, you build ONE complete, self-contained HTML document.

Rules:
- Output ONLY raw HTML. No markdown fences, no explanations, no text before or after.
- Start with <!DOCTYPE html>. Single file: all CSS and JavaScript inline.
- You may load libraries from public CDNs. For 3D always use three.js via this exact script tag: <script src="https://unpkg.com/three@0.160.0/build/three.min.js"></script> (global THREE - do not use import maps or module builds). This URL is always available in the app, even offline.
- The command defines the scope: build exactly what was asked, with no extra sections, features or decoration. When vague, choose the closest impressive interpretation - never pad it with unrequested content.
- Keep text to the absolute minimum: titles and essential labels only, no paragraphs or descriptions unless asked.
- Beauty comes from composition, typography, spacing, color and ONE strong focal idea - not from stacking effects. Prefer a clean, confident layout over visual noise.
- Effects are conditional: use motion, 3D or particles ONLY when the concept is inherently animated (game, 3D scene, animation, visualizer). Otherwise a refined static page is the better answer.
- If you animate, use at most ONE ambient effect system (e.g. a subtle particle field) as a supporting layer, unless the command explicitly asks for more - no overlapping particle layers, no full-screen blur/glow stacks, no constant heavy shadows. Subtle beats busy.
- Fill the whole viewport, be responsive to any screen size, keep content centered, avoid scrollbars.
- Touch targets at least 44px. Aim for smooth 60fps: one canvas, one animation loop, transforms/opacity over layout, device pixel ratio capped at 2, pause the loop when the tab is hidden.
- Never ask questions and never refuse: if the command is vague, choose the most impressive reasonable interpretation.
- If the user writes in Portuguese, keep visible page text in Portuguese (pt-BR).
- If the message includes a "Current page" HTML document, that is the page currently on screen: treat the command as an edit to it - change only what was asked, keep everything else intact, and output the complete updated document. Only build a page from scratch when no current page is provided.`;

  /* Regras para o código gerado ser totalmente editável pelo editor visual. */
  var EDIT_FRIENDLY = `
EDIT-FRIENDLY MARKUP — the app has a visual editor that inspects this page, so structure the code for it:
- Every visible piece (title, text, button, card, panel, shape) must be its OWN element with a meaningful id (e.g. id="titulo", id="btn-jogar", id="painel").
- Canvas is ONLY for the animated scene/background. HUD, score, titles, buttons and menus must be real HTML elements layered on top — never drawn inside the canvas.
- Keep each sentence in ONE text node: no <br> and no per-letter <span> inside a text. Animate a word/phrase with CSS on its parent element instead.
- Never use !important in CSS: live inline edits must win.
- Do not place a full-screen transparent overlay above the content, and never set pointer-events:none on visible layers.
- Use px/rem font sizes and explicit colors so they can be tweaked live.
- Lay out with flex/grid so elements never overlap or clip each other, and everything stays inside the viewport at any screen size.`;

  /* Escapa texto para HTML. Equivale ao replace global do Kotlin. */
  function esc(s) {
    return String(s == null ? '' : s)
      .split('&').join('&amp;')
      .split('<').join('&lt;');
  }

  /* Escapa texto para atributo com aspas duplas. */
  function escAttr(s) {
    return esc(s).split('"').join('&quot;');
  }

  /* Diretriz de nível de detalhe (0 = mínimo, 2 = máximo). */
  function detailDirective(level) {
    var l = Math.floor(Number(level));
    if (!isFinite(l)) l = 1;
    l = Math.max(0, Math.min(2, l));
    if (l === 0) return '\n\nDetail level: MINIMAL. Keep it small and essential: no external libraries, no heavy effects - just a clean single-file page that answers the command.';
    if (l === 2) return '\n\nDetail level: MAXIMUM — ENGINEERING QUALITY (not effect quantity). Produce a production-grade single-file page applying these standards:\n' +
          '1. THREE.JS 3D (only when the concept needs 3D): scene → perspective camera → WebGLRenderer({antialias:true}) → shadowMap.enabled=true → directional+ambient lights → animate(t) loop using THREE.Clock.getDelta() for frame-independent motion → handle window resize (camera.aspect, renderer.setSize caps dpr at 2). Dispose materials/geometries on scene rebuild.\n' +
          '2. CANVAS 2D (only when needed): requestAnimationFrame with delta time, devicePixelRatio cap at 2, clearRect before draw.\n' +
          '3. MOTION & EFFECTS WITH RESTRAINT: one ambient layer max; if particles are truly part of the concept, keep them subtle (hundreds, not thousands) and use Float32Array + canvas; prefer transform/opacity; no stacked blur/glow/shadow on many layers; will-change only on elements that actually animate.\n' +
          '4. UI POLISH: tasteful typography scale, 8px spacing rhythm, subtle backdrop blur only where it aids legibility, fine border-radius (12-16px), micro-interactions (hover scale/glow 200ms ease) used sparingly.\n' +
          '5. PERFORMANCE: debounce resize, avoid layout thrash, reuse geometry/material instances, cap pixel ratio at 2, keep the bundle light (no unnecessary libraries).\n' +
          'Produce polished, purposeful, fully responsive 60fps code — no stubs, no placeholders.';
    return '';
  }

  /* System prompt: regras + nível de detalhe + paleta exata do tema. */
  function systemPrompt(theme, detailLevel) {
    var level = (detailLevel === undefined || detailLevel === null) ? 1 : detailLevel;
    var out = '';
    out += BASE_PROMPT;
    out += EDIT_FRIENDLY;
    out += detailDirective(level);
    out += '\n\nCurrent app theme — use these exact colors as the main palette:\n';
    out += '- background: ' + theme.background + '\n';
    out += '- accent (primary/highlights): ' + theme.accent + '\n';
    out += '- text: ' + theme.text + '\n';
    out += '- secondary text: ' + theme.secondary + '\n';
    out += '- surface (cards/panels): ' + theme.surface + '\n';
    out += '- surface alt: ' + theme.surfaceAlt + '\n';
    if (theme.colors && theme.colors.length) {
      out += '- extra palette colors (accents, highlights and at most one gradient): ' + theme.colors.join(', ') + '\n';
    }
    out += 'Respect the palette: dark background means dark design. Use the extra colors with restraint for accents, highlights and one gradient — avoid monochrome, but also avoid rainbow noise and effect stacking.\n';
    return out;
  }

  /* Comando do usuário; se houver página atual, vira edição dela. */
  function userPrompt(command, currentDoc) {
    if (currentDoc == null || !String(currentDoc).trim()) return command;
    return 'Current page (the HTML document currently displayed on screen):\n```html\n' + currentDoc + '\n```\n\nCommand: ' + command;
  }

  /* Tira cercas markdown e texto antes/depois do documento HTML. */
  function extractDocument(raw) {
    var s = String(raw == null ? '' : raw).trim();
    if (s.indexOf('```') === 0) {
      var nl = s.indexOf('\n');
      s = (nl >= 0 ? s.substring(nl + 1) : s).trim();
    }
    var lower = s.toLowerCase();
    var doctype = lower.indexOf('<!doctype');
    var htmlIdx = lower.indexOf('<html');
    var candidates = [doctype, htmlIdx].filter(function (i) { return i > 0; });
    if (candidates.length) {
      s = s.substring(Math.min.apply(null, candidates));
    }
    if (s.slice(-3) === '```') {
      s = s.substring(0, s.length - 3).trim();
    }
    return s;
  }

  /* Diretriz extra no refino: edição cirúrgica em vez de reescrever tudo. */
  var EDIT_DIRECTIVE = '\n\nEDIT MODE (overrides the "Current page" rule above): the current page is on screen.\n' +
    'Do NOT return the whole document. Return ONLY a JSON object with minimal exact replacements:\n' +
    '{"edits":[{"find":"<exact text copied from the current document>","replace":"<new text>"}]}\n' +
    'Rules:\n' +
    '- "find" must be copied EXACTLY (same whitespace and case) and must be unique in the document.\n' +
    '- Never return the whole document.\n' +
    '- Up to 8 edits, only when necessary.\n' +
    '- Only if the change truly cannot be expressed as find/replace, return the complete HTML document instead.\n' +
    '- Output raw JSON (or raw HTML in that fallback). No markdown fences, no explanations.';

  function stripFences(raw) {
    var t = String(raw == null ? '' : raw).trim();
    if (t.indexOf('```') === 0) {
      var nl = t.indexOf('\n');
      t = (nl >= 0 ? t.substring(nl + 1) : t).trim();
    }
    if (t.slice(-3) === '```') t = t.substring(0, t.length - 3).trim();
    return t;
  }

  function looksLikeDocument(raw) {
    var t = stripFences(raw).toLowerCase();
    return t.indexOf('<!doctype') === 0 || t.indexOf('<html') === 0;
  }

  /* Primeiro objeto/array JSON balanceado dentro de um texto. */
  function firstJsonValue(text) {
    var start = -1;
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (ch === '{' || ch === '[') { start = i; break; }
    }
    if (start < 0) return null;
    var open = text.charAt(start);
    var close = open === '{' ? '}' : ']';
    var depth = 0;
    var inStr = false;
    var esc = false;
    for (var j = start; j < text.length; j++) {
      var c = text.charAt(j);
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') inStr = true;
      else if (c === open) depth++;
      else if (c === close) {
        depth--;
        if (depth === 0) return text.substring(start, j + 1);
      }
    }
    return null;
  }

  /**
   * Aplica edições cirúrgicas ({edits:[{find,replace}]}) sobre o documento atual.
   * Retorna {ok:true, html} ou {ok:false} — o app decide o fallback.
   */
  function applyEdits(doc, raw) {
    if (!doc) return { ok: false };
    var chunk = firstJsonValue(stripFences(raw));
    if (!chunk) return { ok: false };
    var parsed;
    try { parsed = JSON.parse(chunk); } catch (e) { return { ok: false }; }
    var edits = Array.isArray(parsed) ? parsed
      : (parsed && Array.isArray(parsed.edits) ? parsed.edits : null);
    if (!edits || !edits.length || edits.length > 32) return { ok: false };

    var out = String(doc);
    for (var i = 0; i < edits.length; i++) {
      var e = edits[i] || {};
      var find = e.find == null ? '' : String(e.find);
      var replace = e.replace == null ? '' : String(e.replace);
      if (!find) return { ok: false };
      var idx = out.indexOf(find);
      if (idx < 0) {
        var variants = [find.replace(/\r\n/g, '\n'), find.replace(/\n/g, '\r\n')];
        for (var v = 0; v < variants.length && idx < 0; v++) {
          if (variants[v] !== find) {
            var at = out.indexOf(variants[v]);
            if (at >= 0) { idx = at; find = variants[v]; }
          }
        }
      }
      if (idx < 0) return { ok: false };
      out = out.substring(0, idx) + replace + out.substring(idx + find.length);
    }
    return { ok: true, html: out };
  }

  /* Variáveis CSS do tema injetadas no documento da IA. */
  function varsCss(theme) {
    return ':root{\n' +
      '--nx-bg: ' + theme.background + ';\n' +
      '--nx-surface: ' + theme.surface + ';\n' +
      '--nx-surface-alt: ' + theme.surfaceAlt + ';\n' +
      '--nx-accent: ' + theme.accent + ';\n' +
      '--nx-accent-soft: ' + window.Themes.hexA(theme.accent, 140) + ';\n' +
      '--nx-accent-faint: ' + window.Themes.hexA(theme.accent, 20) + ';\n' +
      '--nx-text: ' + theme.text + ';\n' +
      '--nx-secondary: ' + theme.secondary + ';\n' +
      '}';
  }

  /* CSS base: fundo/texto do tema, sem barras de rolagem. */
  function baseCss() {
    return 'html,body{margin:0;padding:0;background:var(--nx-bg);color:var(--nx-text);overscroll-behavior:none}\n' +
      '::-webkit-scrollbar{width:0;height:0}\n' +
      '::selection{background:var(--nx-accent-soft);color:var(--nx-text)}\n' +
      'a{color:var(--nx-accent)}';
  }

  /* Injeta viewport (se faltar) + estilo base depois de <head>. */
  function decorate(html, theme) {
    var injection = '';
    if (!VIEWPORT_REGEX.test(html)) {
      injection += '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover">\n';
    }
    injection += '<style id="nx77-base">\n' + varsCss(theme) + '\n' + baseCss() + '\n</style>';

    var head = HEAD_REGEX.exec(html);
    if (head) {
      var at = head.index + head[0].length;
      return html.substring(0, at) + '\n' + injection + '\n' + html.substring(at);
    }
    var tag = HTML_REGEX.exec(html);
    if (tag) {
      var at2 = tag.index + tag[0].length;
      return html.substring(0, at2) + '\n<head>\n' + injection + '\n</head>' + html.substring(at2);
    }
    return '<!DOCTYPE html><html><head>\n' + injection + '\n</head><body>\n' + html + '\n</body></html>';
  }

  /* Tela de apresentação: título animado (sem cubo nem textos). */
  function welcomePage(theme, hasKey) {
    var bg = theme.background;
    var accent = theme.accent;
    var accentSoft = window.Themes.hexA(theme.accent, 140);
    var accentFaint = window.Themes.hexA(theme.accent, 20);

    var word = 'NEXUS-DESKTOP';
    var letters = word.split('').map(function (ch, i) {
      return '<span style="--i:' + i + '" aria-hidden="true">' + esc(ch) + '</span>';
    }).join('');

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover">
<title>NEXUS-DESKTOP</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%}
body{background:${bg};font-family:-apple-system,'Segoe UI',Roboto,sans-serif;display:flex;align-items:center;justify-content:center;overflow:hidden}
.stage{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:28px;padding:24px}
.halo{position:absolute;width:min(78vw,660px);height:min(78vw,660px);border-radius:50%;pointer-events:none;
  background:radial-gradient(circle,${accentFaint} 0%,transparent 62%);
  filter:blur(8px);animation:breathe 7s ease-in-out infinite}
.title{position:relative;display:block;margin:0;text-align:center;white-space:nowrap;
  font-family:'Courier New',monospace;font-weight:bold;
  font-size:clamp(34px,7.4vw,88px);letter-spacing:.12em;text-indent:.12em}
.title span{display:inline-block;color:transparent;
  background:linear-gradient(100deg,${accent} 0%,#FFFFFF 42%,${accent} 58%,${accentSoft} 100%);
  background-size:300% 100%;background-attachment:fixed;
  -webkit-background-clip:text;background-clip:text;
  opacity:0;transform:translateY(.55em) scale(.9);filter:blur(10px);
  animation:rise .95s cubic-bezier(.16,.84,.24,1) forwards, shimmer 6.5s linear infinite;
  animation-delay:calc(var(--i)*.055s),calc(var(--i)*.055s + .9s)}
.line{height:1px;width:0;background:linear-gradient(90deg,transparent,${accent},transparent);
  animation:grow 1.3s .8s cubic-bezier(.2,.8,.2,1) forwards, pulse 3.4s 2.2s ease-in-out infinite}
@keyframes rise{to{opacity:1;transform:none;filter:blur(0) drop-shadow(0 0 16px ${accentSoft})}}
@keyframes shimmer{from{background-position:0% 50%}to{background-position:300% 50%}}
@keyframes breathe{0%,100%{transform:scale(.9);opacity:.5}50%{transform:scale(1.08);opacity:1}}
@keyframes grow{to{width:min(56vw,440px)}}
@keyframes pulse{0%,100%{opacity:.4}50%{opacity:1}}
.pixel{width:min(320px,68vw);height:100px;border-radius:4px;image-rendering:pixelated}
@media (prefers-reduced-motion:reduce){
  .title span,.line,.halo{animation:none}
  .title span{opacity:1;transform:none;filter:none}
  .line{width:min(56vw,440px);opacity:.8}
}
</style>
</head>
<body>
<div class="stage">
  <div class="halo"></div>
  <h1 class="title" aria-label="NEXUS-DESKTOP">${letters}</h1>
  <div class="line"></div>
  <canvas id="pixel" class="pixel"></canvas>
</div>
<script>
var c=document.getElementById('pixel'),x=c.getContext('2d');
var W,H,p=[]
function resize(){W=c.clientWidth||320;H=c.clientHeight||120;
c.width=Math.round(W*2);c.height=Math.round(H*2);x.setTransform(2,0,0,2,0,0)}
function rnd(a,b){return Math.random()*(b-a)+a}
function spawn(){p.push({x:rnd(0,W),y:rnd(-30,0),vx:rnd(-.8,.8),vy:rnd(.4,1.2),
s:Math.floor(rnd(2,5)),c:['${accent}','#FFD700','#00E5FF','#FF2D95','#7C4DFF'][Math.floor(rnd(0,5))],
life:rnd(40,120),max:rnd(40,120)})}
function draw(){x.clearRect(0,0,W,H);
for(var i=p.length-1;i>=0;i--){var o=p[i];o.x+=o.vx;o.y+=o.vy;o.life--;
var a=o.life/o.max;x.globalAlpha=a;x.fillStyle=o.c;
var s=o.s;x.fillRect(Math.floor(o.x),Math.floor(o.y),s,s);
x.fillRect(Math.floor(o.x)+1,Math.floor(o.y)+1,s-2,s-2);
if(o.life<=0)p.splice(i,1)}
if(p.length<30&&Math.random()<.3)spawn();
x.globalAlpha=1;requestAnimationFrame(draw)}
resize();window.addEventListener('resize',resize);
for(var i=0;i<20;i++)spawn();draw();
</script>
</body>
</html>`;
  }

  /* Página de erro exibida quando ainda não há documento gerado. */
  function errorPage(theme, title, detail) {
    var bg = theme.background;
    var surface = theme.surface;
    var fg = theme.text;
    var secondary = theme.secondary;
    var accent = theme.accent;
    var border = window.Themes.hexA(theme.accent, 70);

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>NEXUS-DESKTOP</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%}
body{background:${bg};color:${fg};font-family:-apple-system,'Segoe UI',Roboto,sans-serif;display:flex;align-items:center;justify-content:center;padding:28px}
.card{max-width:380px;text-align:center;background:${surface};border:1px solid ${border};border-radius:16px;padding:26px 22px}
.icon{font-size:34px;margin-bottom:10px}
h2{font-family:'Courier New',monospace;font-size:15px;letter-spacing:.18em;text-transform:uppercase;color:${accent};margin-bottom:10px}
p{color:${secondary};font-size:13.5px;line-height:1.6;word-break:break-word}
</style>
</head>
<body>
<div class="card"><div class="icon">⚠️</div><h2>${esc(title)}</h2><p>${esc(detail)}</p></div>
</body>
</html>`;
  }

  /* Item da página "Abrir" (páginas salvas). */
  function savedListPage(theme, entries) {
    var bg = theme.background;
    var surface = theme.surface;
    var surfaceAlt = theme.surfaceAlt;
    var fg = theme.text;
    var secondary = theme.secondary;
    var accent = theme.accent;
    var accentSoft = window.Themes.hexA(theme.accent, 140);
    var accentFaint = window.Themes.hexA(theme.accent, 22);
    var border = window.Themes.hexA(theme.accent, 70);

    var body;
    if (!entries || entries.length === 0) {
      body = '<div class="empty">Nada salvo ainda.<br><span>Gere uma página e clique em <b>SALVAR</b>.</span></div>';
    } else {
      body = entries.map(function (e) {
        var n = escAttr(e.name);
        return '<div class="row">' +
          '<button class="open" data-n="' + n + '">' +
          '<span class="fname">' + esc(e.name) + '</span>' +
          '<span class="fmeta">' + esc(e.meta) + '</span></button>' +
          '<button class="del" data-n="' + n + '" title="Excluir">✕</button></div>';
      }).join('');
    }

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover">
<title>Salvos — NEXUS-DESKTOP</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%}
body{background:${bg};color:${fg};font-family:-apple-system,'Segoe UI',Roboto,sans-serif;display:flex;flex-direction:column;overflow:hidden}
.top{display:flex;align-items:center;gap:10px;padding:14px 16px 6px}
.back{border:1px solid ${border};background:${accentFaint};color:${accent};border-radius:999px;padding:8px 14px;font-size:13px;font-family:'Courier New',monospace;cursor:pointer;-webkit-tap-highlight-color:transparent}
.back:active{background:${accentSoft};color:${bg}}
.ttl{font-family:'Courier New',monospace;font-size:14px;letter-spacing:.22em;color:${accent}}
.pick{margin-left:auto;border:1px solid ${border};background:${accentFaint};color:${accent};border-radius:999px;padding:8px 14px;font-size:12.5px;font-family:'Courier New',monospace;cursor:pointer;-webkit-tap-highlight-color:transparent}
.pick:active{background:${accentSoft};color:${bg}}
.path{padding:0 18px 6px;color:${secondary};font-size:11.5px;font-family:'Courier New',monospace}
.list{flex:1;overflow-y:auto;padding:6px 16px 24px;display:flex;flex-direction:column;gap:10px;-webkit-overflow-scrolling:touch}
.row{display:flex;align-items:stretch;gap:8px}
.open{flex:1;display:flex;flex-direction:column;gap:3px;text-align:left;background:${surface};border:1px solid ${border};border-radius:14px;padding:14px 15px;cursor:pointer;-webkit-tap-highlight-color:transparent}
.open:active{background:${surfaceAlt}}
.fname{color:${fg};font-size:14px;word-break:break-all}
.fmeta{color:${secondary};font-size:11.5px;font-family:'Courier New',monospace}
.del{width:50px;background:${surface};border:1px solid ${border};color:${accent};border-radius:14px;font-size:18px;cursor:pointer;-webkit-tap-highlight-color:transparent}
.del:active{background:${accentFaint}}
.empty{margin:auto;text-align:center;color:${secondary};font-size:13.5px;line-height:1.7;padding:24px}
.empty span{font-size:12px}
.empty b{color:${accent};font-family:'Courier New',monospace}
</style>
</head>
<body>
<div class="top"><button class="back" id="bk">‹ Voltar</button><span class="ttl">SALVOS</span><button class="pick" id="pk">Abrir HTML…</button></div>
<div class="path">pasta nexus77</div>
<div class="list">${body}</div>
<script>
document.getElementById('bk').addEventListener('click', function(){ try{ Nexus77.closeList(); }catch(e){} });
document.getElementById('pk').addEventListener('click', function(){ try{ Nexus77.pickFile(); }catch(e){} });
document.querySelectorAll('.open[data-n]').forEach(function(c){
  c.addEventListener('click', function(){ try{ Nexus77.openSaved(c.getAttribute('data-n')); }catch(e){} });
});
document.querySelectorAll('.del[data-n]').forEach(function(c){
  c.addEventListener('click', function(){ try{ Nexus77.deleteSaved(c.getAttribute('data-n')); }catch(e){} });
});
</script>
</body>
</html>`;
  }

  /* Bibliotecas locais: três arquivos servidos de web/vendor/three/. */
  var CDN_HOSTS = ['unpkg.com', 'cdn.jsdelivr.net', 'cdnjs.cloudflare.com'];
  var THREE_FILES = {
    'three.min.js': 'three.min.js',
    'three.js': 'three.min.js',
    'three.module.min.js': 'three.module.min.js',
    'three.module.js': 'three.module.min.js'
  };

  /* Troca URLs de CDN do three.js pelo vendor local, só no render. */
  function rewriteLibs(html, base) {
    if (!html) return html;
    return String(html).replace(/(?:https?:)?\/\/[^\s"'()<>]+/gi, function (url) {
      try {
        var u = new URL(url, 'https://x/');
        if (CDN_HOSTS.indexOf(u.hostname) === -1) return url;
        var path = u.pathname;
        if (path.toLowerCase().indexOf('three') === -1) return url;
        var file = path.substring(path.lastIndexOf('/') + 1);
        var mapped = THREE_FILES[file];
        if (!mapped) return url;
        return base + 'vendor/three/' + mapped;
      } catch (e) {
        return url;
      }
    });
  }

  window.Html = {
    BASE: BASE,
    BASE_PROMPT: BASE_PROMPT,
    EDIT_DIRECTIVE: EDIT_DIRECTIVE,
    applyEdits: applyEdits,
    looksLikeDocument: looksLikeDocument,
    VIEWPORT_REGEX: VIEWPORT_REGEX,
    HEAD_REGEX: HEAD_REGEX,
    HTML_REGEX: HTML_REGEX,
    systemPrompt: systemPrompt,
    detailDirective: detailDirective,
    userPrompt: userPrompt,
    extractDocument: extractDocument,
    decorate: decorate,
    welcomePage: welcomePage,
    errorPage: errorPage,
    savedListPage: savedListPage,
    varsCss: varsCss,
    baseCss: baseCss,
    esc: esc,
    escAttr: escAttr,
    rewriteLibs: rewriteLibs
  };
})();

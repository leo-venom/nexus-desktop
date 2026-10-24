/* ============================================================
 * app.js — port de MainActivity.kt para o navegador.
 * Fluxo: prompt -> AiClient.chat -> Html.extractDocument ->
 * decorate -> iframe (srcdoc). Sessão, salvar/abrir/excluir,
 * temas e bridge window.Nexus77 -> window.MxShell.
 * ============================================================ */
(function () {
  'use strict';

  var prefs = window.Prefs;
  /* Tema único: o app não tem mais seletor de temas. */
  var theme = window.Themes.of(0);

  var lastRendered = null;   // documento canônico (CSS com CDN, sem rewrite)
  var lastPrompt = null;
  var lastOpenName = null;   // arquivo aberto (lista local) → base do nome sugerido no SALVAR
  var generating = false;
  var showingList = false;
  var editCount = 0;        // patches consecutivos na mesma página
  var MAX_EDITS = 0;        // 0 = sem limite (nunca força regeneração por contagem)
  var frameErrors = [];     // erros de runtime da página em tela (vão no próximo prompt)
  var frameErrToken = 0;    // identifica o render atual (evita toast de página antiga)
  var lastCommands = [];    // últimos comandos bem-sucedidos (contexto curto)

  /* HISTÓRICO DE GERAÇÃO — Ctrl+Z desfaz a última modificação da IA. */
  var genHistory = [];      // pilha de documentos anteriores (topo = mais recente)
  var GEN_HISTORY_MAX = 20; // máximo de versões guardadas

  /* Salva o documento atual antes de ser substituído por uma geração nova. */
  function pushGenHistory() {
    if (lastRendered != null) {
      genHistory.push(lastRendered);
      if (genHistory.length > GEN_HISTORY_MAX) genHistory.shift();
    }
  }

  /* Restaura o documento anterior (Ctrl+Z). True se conseguiu. */
  function undoGen() {
    if (!genHistory.length) {
      toast('Nada a desfazer');
      return false;
    }
    var prev = genHistory.pop();
    lastRendered = prev;
    editCount = 0;
    editSelHtml = '';
    render(themed(prev));
    status('↩ desfeito', '', true);
    toast('Modificação desfeita');
    return true;
  }

  /* Limpa o histórico (reset de sessão). */
  function clearGenHistory() {
    genHistory = [];
  }

  var liveActive = false;
  var liveIn = 0;
  var liveOut = 0;
  var liveText = '';          /* texto acumulado do streaming (para a prévia ao vivo) */
  var previewAt = 0;
  var genEditing = false;     /* geração atual é ajuste de página existente */
  var PREVIEW_MIN_CHARS = 1200;   /* documento mínimo p/ valer uma prévia */
  var PREVIEW_EVERY_MS = 1200;    /* intervalo entre prévias */
  /* ANTI-ERRO: a página entregue é conferida viva; erro real volta ao modelo. */
  var ANTI_ERR_MAX = 2;           /* correções automáticas por geração */
  var ANTI_ERR_WAIT_MS = 4300;    /* espera a telemetria do iframe (canvas vazio: 4000 ms) */
  var lastProgressAt = 0;          /* SEMPRE Date.now() — o watchdog usa o mesmo relógio */
  var canceladoPeloUsuario = false; /* ESC / reset: a promessa em voo rejeita com AbortError */

  var APP_BASE = new URL('./', location.href).href;
  var THREE_CDN = 'https://unpkg.com/three@0.160.0/build/';

  var USAGE_PERIODS = [
    ['hour', 'Última hora'],
    ['day', 'Últimas 24 h'],
    ['week', 'Últimos 7 dias'],
    ['month', 'Últimos 30 dias']
  ];

  var frame, input, gearBtn, saveBtn, openBtn, statusEl, kbLabel, previewBadge, libsEl;
  var dot, resetBtn, vu;
  var usageBtn, usagePanel, usageModel, usageFill, usageSession, usageStats, usageClose;
  var editBtn, finalizeBtn;
  var imageBtn, imageFileInput, imgAttach, imgThumb, imgName, imgSub, imgState, imgRemove;
  var imageAsset = null;       // { file, name, mime, size, width, height, thumbnail, report }
  var imageBusy = false;
  var imageError = '';
  var imagePendingName = '';
  var imageToken = 0;          // invalida análises antigas quando o anexo muda
  var captureSeq = 0;
  var pendingCapture = null;
  var editMode = false;

  function $(id) { return document.getElementById(id); }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function toast(message) {
    if (window.Settings && window.Settings.toast) window.Settings.toast(message);
  }

  /* ---------- tema / sessão ---------- */

  function errorColor() {
    return theme.isDark ? '#FF5C5C' : '#D32F2F';
  }

  function applyTheme() {
    var s = document.documentElement.style;
    s.setProperty('--nx-bg', theme.background);
    s.setProperty('--nx-surface', theme.surface);
    s.setProperty('--nx-surface-alt', theme.surfaceAlt);
    s.setProperty('--nx-accent', theme.accent);
    s.setProperty('--nx-accent-soft', window.Themes.hexA(theme.accent, 140));
    s.setProperty('--nx-accent-faint', window.Themes.hexA(theme.accent, 20));
    s.setProperty('--nx-text', theme.text);
    s.setProperty('--nx-secondary', theme.secondary);
    s.setProperty('--nx-on-accent', theme.onAccent);
    if (theme.colors && theme.colors[1]) s.setProperty('--nx-c2', theme.colors[1]);
    if (theme.colors && theme.colors[2]) s.setProperty('--nx-c3', theme.colors[2]);
    s.setProperty('--mx-error', errorColor());
    if (vu) vu.setTheme(theme);
    updateSessionUi();
  }

  function formatTokens(n) {
    n = Math.trunc(Number(n) || 0);
    if (n < 1000) return String(n);
    if (n < 1000000) {
      return n % 1000 === 0 ? (n / 1000) + 'k' : (n / 1000).toFixed(1) + 'k';
    }
    return n % 1000000 === 0 ? (n / 1000000) + 'M' : (n / 1000000).toFixed(2) + 'M';
  }

  function updateSessionUi() {
    var keySet = prefs.hasKey();
    dot.style.background = keySet ? theme.accent : errorColor();
    usageModel.textContent = keySet ? prefs.model() : 'sem API key';

    var extraIn = liveActive ? liveIn : 0;
    var extraOut = liveActive ? liveOut : 0;
    var inTok = prefs.sessionPromptTokens() + extraIn;
    var outTok = prefs.sessionCompletionTokens() + extraOut;
    var used = prefs.sessionTokens() + extraIn + extraOut;
    var budget = prefs.SESSION_TOKEN_BUDGET;

    usageFill.style.width = (Math.min(used, budget) / budget * 100) + '%';
    usageSession.textContent = (liveActive ? '~' : '') +
      '↑' + formatTokens(inTok) + ' ↓' + formatTokens(outTok) +
      ' · ' + formatTokens(used) + '/' + formatTokens(budget);

    renderUsageStats();
  }

  function renderUsageStats() {
    var totals = prefs.usageTotals(Date.now());
    var html = '';
    var i;
    for (i = 0; i < USAGE_PERIODS.length; i++) {
      var key = USAGE_PERIODS[i][0];
      var t = totals[key] || { prompt: 0, completion: 0, total: 0 };
      html += '<div class="usage-stat">' +
        '<div class="usage-k">' + USAGE_PERIODS[i][1] + '</div>' +
        '<div class="usage-v">' + formatTokens(t.total) + '</div>' +
        '<div class="usage-io">↑' + formatTokens(t.prompt) +
        ' ↓' + formatTokens(t.completion) + '</div>' +
        '</div>';
    }
    usageStats.innerHTML = html;
  }

  function setUsage(open) {
    usagePanel.hidden = !open;
    usageBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    usageBtn.classList.toggle('on', open);
    if (open) updateSessionUi();
  }

  function status(text, kind, end) {
    statusEl.textContent = text;
    statusEl.title = text;
    var cls = 'status';
    if (kind) cls += ' ' + kind;
    if (end) cls += ' end';
    statusEl.className = cls;
  }

  /* ---------- render ---------- */

  /* O iframe roda sem allow-same-origin (origem opaca): a ponte é postMessage. */
  var SHIM = '<script id="nx-shim">(function(){' +
    'function call(n,a){try{window.parent.postMessage({__nx:1,m:n,a:a},"*")}catch(e){}}' +
    /* Telemetria: erros de runtime do jogo voltam para o app e entram no próximo prompt. */
    'var _errs=[],_errSeen={};' +
    'function _pushErr(k,msg,line){try{msg=String(msg==null?"":msg).replace(/\\s+/g," ").slice(0,300);' +
    'if(!msg)return;var key=k+"|"+msg+"|"+(line||0);if(_errSeen[key])return;_errSeen[key]=1;' +
    'if(_errs.length>=40)return;_errs.push({k:k,m:msg,l:line||0});call("errors",JSON.stringify(_errs))}catch(e){}}' +
    'window.addEventListener("error",function(e){' +
    'if(e&&e.target&&e.target!==window&&e.target.tagName){return}' +  /* ignora recurso 404 */
    'var m=e&&e.message?e.message:String(e);if(m.indexOf("ResizeObserver")>=0)return;' +  /* ignora ResizeObserver */
    '_pushErr("error",m,e&&e.lineno||0)},true);' +
    'window.addEventListener("unhandledrejection",function(e){var r=e&&e.reason;' +
    'var m=(r&&(r.message||r))||"";if(!m)return;' +
    'if(m.indexOf("AbortError")>=0||m.indexOf("canceled")>=0)return;' +  /* ignora cancelamentos */
    '_pushErr("promise",m,0)});' +
    /* Watchdog de canvas vazio: objeto que não aparece vira aviso suave, sem disparar reparo automático sozinho. */
    'setTimeout(function(){try{' +
    'var cs=document.querySelectorAll("canvas");if(!cs.length)return;var bad=[],checked=0;' +
    'for(var i=0;i<cs.length;i++){var c=cs[i];var w=c.width||0,h=c.height||0;' +
    'if(w<8||h<8){bad.push("canvas "+(i+1)+" em "+(w||0)+"x"+(h||0)+" (nunca dimensionado)");continue}' +
    'var g=null;try{g=c.getContext("2d")}catch(e){}if(!g)continue;checked++;' +
    'try{var d=g.getImageData(0,0,w,h).data,painted=false;' +
    'for(var p=3;p<d.length;p+=4*101){if(d[p]>8){painted=true;break}}' +
    'if(!painted)bad.push("canvas "+(i+1)+" em branco ("+w+"x"+h+")")}catch(e){}' +
    '}' +
    '}catch(e){}},4000);' +
    'function rgb2hex(c){if(!c)return"#000000";var m=c.match(/\\d+/g);if(!m||m.length<3)return c.charAt(0)==="#"?c:"#000000";' +
    'var h=function(n){var s=parseInt(n,10).toString(16);return s.length<2?"0"+s:s};return"#"+h(m[0])+h(m[1])+h(m[2])}' +
    'function alphaOf(c){if(!c)return 1;var m=c.match(/rgba?\\(([^)]+)\\)/);if(!m)return 1;var p=m[1].split(",");return p.length>=4?Math.max(0,Math.min(1,parseFloat(p[3]))):1}' +
    'var _ed={on:false,el:null,drag:false};' +
    'var _accent="#00E5FF";' +
    'var _raf=window.requestAnimationFrame.bind(window),_caf=window.cancelAnimationFrame.bind(window);' +
    'var _frozen=[];' +
    'window.requestAnimationFrame=function(cb){return _raf(function(t){if(_ed.on){_frozen.push(cb)}else{try{cb(t)}catch(e){_pushErr("raf",(e&&e.message)||String(e),(e&&e.lineno)||0)}}})};' +
    'window.cancelAnimationFrame=function(id){return _caf(id)};' +
    'function sel(e){if(!e)return;e.style.outlineStyle="dashed";e.style.outlineWidth="3px";e.style.outlineColor=_accent;e.style.outlineOffset="-3px";e.style.boxShadow="0 0 0 5px "+_accent+"59"}' +
    'function desel(e){if(!e)return;e.style.outlineStyle="";e.style.outlineWidth="";e.style.outlineColor="";e.style.outlineOffset="";e.style.boxShadow=""}' +
    'function freeze(){_ed.on=true;' +
    'var s=document.getElementById("nx-freeze");' +
    'if(!s){s=document.createElement("style");s.id="nx-freeze";' +
    's.textContent="*,*::before,*::after{animation-play-state:paused !important;transition:none !important}";' +
    '(document.head||document.documentElement).appendChild(s)}' +
    'try{document.getAnimations().forEach(function(a){try{a.pause()}catch(e){}})}catch(e){}' +
    'if(document.body)document.body.style.cursor="crosshair"}' +
    'function thaw(){_ed.on=false;' +
    'var s=document.getElementById("nx-freeze");if(s&&s.parentNode)s.parentNode.removeChild(s);' +
    'try{document.getAnimations().forEach(function(a){try{a.play()}catch(e){}})}catch(e){}' +
    'var q=_frozen.splice(0);for(var i=0;i<q.length;i++){try{window.requestAnimationFrame(q[i])}catch(e){}}' +
    'if(document.body)document.body.style.cursor="";' +
    'if(_ed.el){desel(_ed.el);_ed.el=null}}' +
    'function sendSel(refresh){if(!_ed.el)return;var t=_ed.el,cs=getComputedStyle(t),r=t.getBoundingClientRect();' +
    'var tg=t.tagName.toLowerCase();' +
    'var isText=["p","h1","h2","h3","h4","h5","h6","span","a","li","button","label","strong","em","small","b","i"].indexOf(tg)>=0;' +
    'var isSvg=["svg","path","circle","rect","ellipse","line","polygon","polyline","g","text","use"].indexOf(tg)>=0;' +
    'var isCanvas=tg==="canvas";' +
    'call("editSel",JSON.stringify({refresh:!!refresh,tag:tg,text:isText,svg:isSvg,canvas:isCanvas,depth:_ed.depth||"",txt:(t.textContent||"").trim().slice(0,300),' +
    'html:t.outerHTML.slice(0,3000),rect:{left:r.left,top:r.top,width:r.width,height:r.height},' +
    'styles:{color:rgb2hex(cs.color),background:rgb2hex(cs.backgroundColor),colorA:alphaOf(cs.color),' +
    'backgroundA:alphaOf(cs.backgroundColor),fontSize:parseFloat(cs.fontSize)||16,' +
    'fontWeight:cs.fontWeight,fontFam:cs.fontFamily,width:Math.round(r.width),height:Math.round(r.height),opacity:cs.opacity,' +
    'fill:rgb2hex(cs.fill),fillA:alphaOf(cs.fill),stroke:rgb2hex(cs.stroke),strokeA:alphaOf(cs.stroke)}}))}' +
    'window.Nexus77={' +
    'setInput:function(t){call("setInput",String(t==null?"":t))},' +
    'openSaved:function(n){call("openSaved",String(n))},' +
    'closeList:function(){call("closeList")},' +
    'pickFile:function(){call("pickFile")},' +
    'deleteSaved:function(n){call("deleteSaved",String(n))},' +
    'renameSaved:function(n,novo){' +
    'var d=null;' +
    'if(novo===undefined){try{d=JSON.parse(String(n))}catch(e){}}' +
    'if(!d||typeof d!=="object")d={name:n,novo:novo};' +
    'call("renameSaved",JSON.stringify(d))},' +
    'duplicateSaved:function(n){call("duplicateSaved",String(n))},' +
    'editMode:function(o){o?freeze():thaw()},' +
    'getSel:function(){return _ed.el?_ed.el.outerHTML:""}' +
    '};' +
    'window.addEventListener("message",function(e){var d=e.data||{};' +
    'if(d.accent)_accent=d.accent;' +
    'if(d.editMode!==undefined)window.Nexus77.editMode(d.editMode);' +
    'if(d.pushUndo)pushUndo(_ed.el,d.force===true);' +
    'if(d.undo)doUndo();' +
    'if(d.applyStyle&&_ed.el){pushUndo(_ed.el);for(var k in d.applyStyle){try{_ed.el.style[k]=d.applyStyle[k]}catch(ex){}}}' +
    'if(d.setText&&_ed.el){pushUndo(_ed.el);try{var w=document.createTreeWalker(_ed.el,4,null,false),ft=w.nextNode();' +
    'if(ft)ft.nodeValue=d.setText;else _ed.el.textContent=d.setText}catch(ex){}}' +
    'if(d.resize&&_ed.el){pushUndo(_ed.el);var p=d.resize;if(p.w!==undefined){_ed.el.style.width=p.w+"px"};if(p.h!==undefined){_ed.el.style.height=p.h+"px"}}' +
    'if(d.deleteEl&&_ed.el){pushUndo(_ed.el,true);var pn=_ed.el.parentNode;if(pn)pn.removeChild(_ed.el);_ed.el=null;call("editSel","{}")}' +
    'if(d.toggleDrag!==undefined){_ed.drag=d.toggleDrag}' +
    'if(d.snapshot){call("snapshot",snapshot())}' +
    'if(d.capture){var _u=null;try{_u=frameShot()}catch(e){}' +
    'call("capture",JSON.stringify({id:d.capture,ok:!!_u,url:_u||"",error:_u?"":"captura indisponível"}))}' +
    'if(d.drill&&_ed.lastPt){var st=pickAt(_ed.lastPt.x,_ed.lastPt.y);if(st.length){var li=st.indexOf(_ed.el);var ni=(li>=0&&li<st.length-1)?li+1:0;selectNode(st[ni],ni,st.length)}}' +
    'if(d.deselect&&_ed.el){desel(_ed.el);_ed.el=null}' +
    '});' +
    'document.addEventListener("mousemove",function(e){' +
    'if(!_ed.on)return;var el=_ed.el;' +
    'if(!el){if(document.body)document.body.style.cursor="crosshair";return}' +
    'var z=edgeZone(el,e.clientX,e.clientY);var r=el.getBoundingClientRect();' +
    'var inside=(e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom);' +
    'if(document.body)document.body.style.cursor=z?cursorFor(z):(inside?"move":"crosshair")},true);' +
    'document.addEventListener("keydown",function(e){' +
    'if(!(e.ctrlKey||e.metaKey)||e.shiftKey)return;' +
    'if(String(e.key).toLowerCase()!=="z")return;' +
    'var tg=e.target&&e.target.tagName?e.target.tagName.toUpperCase():"";' +
    'if(tg==="INPUT"||tg==="TEXTAREA")return;' +
    'if(_ed.on){e.preventDefault();e.stopPropagation();doUndo();return}' +
    'call("undoGen");e.preventDefault()' +
    '},true);' +
    'document.addEventListener("dblclick",function(e){' +
    'if(!_ed.on)return;e.preventDefault();e.stopPropagation();' +
    'var t=e.target;if(_ed.el&&_ed.el!==t)desel(_ed.el);sel(t);_ed.el=t;_ed.drag=true;sendSel()},true);' +
    'document.addEventListener("mousedown",function(e){' +
    'if(!_ed.on||!_ed.el||e.button!==0)return;' +
    'var el=_ed.el,r=el.getBoundingClientRect();' +
    'var zone=edgeZone(el,e.clientX,e.clientY);' +
    'var inEl=(e.target===el||el.contains(e.target));' +
    'if(!inEl&&!zone)return;' +
    'e.preventDefault();e.stopPropagation();' +
    'var sx=e.clientX,sy=e.clientY,w0=r.width,h0=r.height,l0=r.left,t0=r.top;' +
     'var moved=false,baseL=0,baseT=0,mode=(zone?"resize":"move");' +
     'function mm(ev){var dx=ev.clientX-sx,dy=ev.clientY-sy;' +
     'if(!moved){if(Math.abs(dx)<4&&Math.abs(dy)<4)return;moved=true;pushUndo(el,true);call("editDragging","1");' +
     'el.style.position="fixed";el.style.margin="0";el.style.right="auto";el.style.bottom="auto";el.style.boxSizing="border-box";' +
     'el.style.left="0px";el.style.top="0px";' +
     'el.style.width=w0+"px";el.style.height=h0+"px";' +
     'var r1=el.getBoundingClientRect();baseL=l0-r1.left;baseT=t0-r1.top;' +
     'el.style.left=baseL+"px";el.style.top=baseT+"px"}' +
     'if(mode==="move"){el.style.left=(baseL+dx)+"px";el.style.top=(baseT+dy)+"px";return}' +
     'var nw=w0,nh=h0,nl=baseL,nt=baseT;' +
    'if(zone.indexOf("e")>=0)nw=Math.max(10,w0+dx);' +
    'if(zone.indexOf("s")>=0)nh=Math.max(10,h0+dy);' +
    'if(zone.indexOf("w")>=0){nw=Math.max(10,w0-dx);nl=l0+(w0-nw)}' +
    'if(zone.indexOf("n")>=0){nh=Math.max(10,h0-dy);nt=t0+(h0-nh)}' +
    'el.style.width=nw+"px";el.style.height=nh+"px";' +
    'el.style.left=nl+"px";el.style.top=nt+"px"}' +
    'function mu(){document.removeEventListener("mousemove",mm);document.removeEventListener("mouseup",mu);' +
    'if(moved){_ed.lastPt=null;call("editDragging","0")}}' +
    'document.addEventListener("mousemove",mm);document.addEventListener("mouseup",mu)},true);' +
    'function isOverlay(n){try{var r=n.getBoundingClientRect();' +
    'if(n.matches&&n.matches("canvas,img,video,iframe,svg"))return false;' +
    'var vw=window.innerWidth,vh=window.innerHeight;' +
    'if(r.width<vw*0.94||r.height<vh*0.94)return false;' +
    'var cs=getComputedStyle(n);if(alphaOf(cs.backgroundColor)>=0.15)return false;' +
    'if((n.textContent||"").trim().length>0)return false;' +
    'if(n.querySelector&&n.querySelector("canvas,img,video,svg,iframe"))return false;' +
    'return true}catch(e){return false}}' +
    'function pickAt(x,y){var ps=null;try{' +
    /* pe:none tira overlays do hit-test; reativa só durante a coleta e remove em finally */
    'ps=document.createElement("style");ps.id="nx-pick";' +
    'ps.textContent="*,*::before,*::after{pointer-events:auto !important}";' +
    '(document.head||document.documentElement).appendChild(ps);' +
    'var raw=[];try{raw=document.elementsFromPoint(x,y)}catch(ex){}' +
    'raw=raw.filter(function(n){return n&&n.tagName&&n!==document.body&&n!==document.documentElement&&n.getBoundingClientRect().width>0});' +
    'var st=raw.filter(function(n){return !isOverlay(n)});' +
    'return st.length?st:raw' +
    '}finally{try{var pn=ps&&ps.parentNode;if(pn)pn.removeChild(ps)}catch(e){}}}' +
    'function snapshot(){var had=_ed.el;if(had)desel(had);' +
    'var cl=document.documentElement.cloneNode(true);' +
    'var fz=cl.querySelector("#nx-freeze");if(fz&&fz.parentNode)fz.parentNode.removeChild(fz);' +
    'var sh=cl.querySelector("#nx-shim");if(sh&&sh.parentNode)sh.parentNode.removeChild(sh);' +
    'var h="<!DOCTYPE html>\\n"+cl.outerHTML;' +
    'if(had)sel(had);return h}' +
    /* Captura opcional: maior canvas visível, reduzido para comparação local. */
    'function frameShot(){try{' +
    'var cs=document.querySelectorAll("canvas"),best=null,bestArea=0;' +
    'for(var i=0;i<cs.length;i++){var c=cs[i],w=c.width||0,h=c.height||0;' +
    'if(w<8||h<8)continue;try{var r=c.getBoundingClientRect();if(r.width<8||r.height<8)continue}catch(e){}' +
    'var a=w*h;if(a>bestArea){bestArea=a;best=c}}' +
    'if(!best)return null;' +
    'var sc=Math.min(1,320/Math.max(best.width,best.height));' +
    'var cc=document.createElement("canvas");' +
    'cc.width=Math.max(1,Math.round(best.width*sc));cc.height=Math.max(1,Math.round(best.height*sc));' +
    'var g=cc.getContext("2d");if(!g)return null;g.drawImage(best,0,0,cc.width,cc.height);' +
    'return cc.toDataURL("image/png")}catch(e){return null}}' +
    'var _undo=[],_uLast=0,_uEl=null;' +
    'function tw(el){var w=document.createTreeWalker(el,4,null,false);return w.nextNode()}' +
    'function pushUndo(el,force){if(!el)return;var now=Date.now();' +
    'if(!force&&_uEl===el&&(now-_uLast)<900)return;_uEl=el;_uLast=now;' +
    'var t=tw(el);' +
    '_undo.push({el:el,parent:el.parentNode,next:el.nextSibling,style:el.style.cssText||"",text:t?t.nodeValue:null});' +
    'if(_undo.length>200)_undo.shift();call("undoCount",String(_undo.length))}' +
    'function doUndo(){var u=_undo.pop();if(!u){call("undoCount","0");return}' +
    'try{if(!u.el.parentNode&&u.parent)u.parent.insertBefore(u.el,u.next);' +
    'u.el.style.cssText=u.style||"";' +
    'if(u.text!==null){var t=tw(u.el);if(t)t.nodeValue=u.text}}catch(e){}' +
    'if(u.el.parentNode){_ed.el=u.el;sel(u.el);sendSel(true)}' +
    'call("undoCount",String(_undo.length))}' +
    'var _EDGE=10;' +
    'function edgeZone(el,x,y){var r=el.getBoundingClientRect();' +
    'var L=x-r.left,R=r.right-x,T=y-r.top,B=r.bottom-y;var z="";' +
    'if(L>=-_EDGE&&L<=_EDGE&&y>=r.top-_EDGE&&y<=r.bottom+_EDGE)z+="w";' +
    'else if(R>=-_EDGE&&R<=_EDGE&&y>=r.top-_EDGE&&y<=r.bottom+_EDGE)z+="e";' +
    'if(T>=-_EDGE&&T<=_EDGE&&x>=r.left-_EDGE&&x<=r.right+_EDGE)z+="n";' +
    'else if(B>=-_EDGE&&B<=_EDGE&&x>=r.left-_EDGE&&x<=r.right+_EDGE)z+="s";' +
    'return z}' +
    'function cursorFor(z){if(!z)return"";' +
    'var v=z.indexOf("n")>=0?"n":(z.indexOf("s")>=0?"s":"");' +
    'var hz=z.indexOf("w")>=0?"w":(z.indexOf("e")>=0?"e":"");' +
    'var key=v+hz;' +
    'return {"n":"ns-resize","s":"ns-resize","e":"ew-resize","w":"ew-resize",' +
    '"ne":"nesw-resize","sw":"nesw-resize","nw":"nwse-resize","se":"nwse-resize"}[key]||""}' +
    'function selectNode(node,idx,len,pop){if(!node)return;if(_ed.el&&_ed.el!==node)desel(_ed.el);' +
    'sel(node);_ed.el=node;_ed.drag=true;_ed.depth=(len>1?(idx+1)+"/"+len:"");' +
    'if(pop)sendSel();else call("editClose","")}' +
    'document.addEventListener("click",function(e){' +
    'var t=e.target;' +
    'if(_ed.on){e.preventDefault();e.stopPropagation();' +
    'var nowT=Date.now();' +
    'if(_ed.lastClickTgt===t&&(nowT-(_ed.lastClickAt||0))<400){_ed.lastClickAt=nowT;return}' +
    '_ed.lastClickTgt=t;_ed.lastClickAt=nowT;' +
    'var x=e.clientX,y=e.clientY,st=pickAt(x,y);if(!st.length)st=[t];' +
    'var idx=0;' +
    'if((e.ctrlKey||e.altKey||e.metaKey)&&_ed.el){' +
    'var li0=st.indexOf(_ed.el);if(li0>=0&&li0<st.length-1)idx=li0+1}' +
    'else if(_ed.lastPt&&Math.abs(_ed.lastPt.x-x)<16&&Math.abs(_ed.lastPt.y-y)<16){' +
    'var li=st.indexOf(_ed.el);if(li>=0&&li<st.length-1)idx=li+1}' +
    '_ed.lastPt={x:x,y:y};selectNode(st[idx],idx,st.length,false);return}' +
    'var a=t&&t.closest?t.closest("a[href]"):null;if(!a)return;' +
    'var h=a.getAttribute("href")||"";if(!h||h.charAt(0)==="#"||h.indexOf("javascript:")===0)return;' +
    'e.preventDefault();call("openUrl",a.href||h)},true);' +
    /* carrega fontes da pasta fontes/ do projeto e injeta @font-face no documento */
    'var _ff=document.createElement("link");_ff.rel="stylesheet";' +
    '_ff.href="/fontes/fonts.css?_t="+Date.now();' +
    'try{document.head.appendChild(_ff)}catch(e){}' +
    'var _fx=new XMLHttpRequest();_fx.open("GET","/fontes/?_t="+Date.now(),true);_fx.timeout=4000;' +
    '_fx.onload=function(){if(_fx.status!==200)return;var _d;try{_d=JSON.parse(_fx.responseText)}catch(e){return}' +
    'if(!_d||!_d.fonts||!_d.fonts.length)return;var _s=document.createElement("style");_s.id="nx-fonts";' +
    'var _c="";for(var _i=0;_i<_d.fonts.length;_i++){' +
    'var _f=_d.fonts[_i];var _fm=String(_f.family||"").replace(/"/g,"");if(!_fm||!_f.url)continue;' +
    'var _ft=_f.ext===".otf"?"opentype":_f.ext===".woff"?"woff":_f.ext===".woff2"?"woff2":"truetype";' +
    '_c+="@font-face{font-family:\\""+_fm+"\\";src:url(\\""+_f.url+"\\") format(\\""+_ft+"\\");font-display:swap}"}' +
    '_s.textContent=_c;try{document.head.appendChild(_s)}catch(e){}};' +
    'try{_fx.send()}catch(e){}' +
    /* Empurrões de resize: jogos que medem o viewport no load pegam 0x0 e ficam
       com canvas vazio. Disparar resize depois fazem eles recalcular. */
    'function _nudge(){try{window.dispatchEvent(new Event("resize"));}catch(e){}}' +
    'try{_nudge();setTimeout(_nudge,150);setTimeout(_nudge,500);setTimeout(_nudge,1200);}catch(e){}' +
    'try{document.addEventListener("DOMContentLoaded",function(){_nudge();setTimeout(_nudge,250)},false)}catch(e){}' +
    '})();<\/script>';

  function injectShim(html) {
    var head = /<head[^>]*>/i.exec(html);
    if (head) {
      var at = head.index + head[0].length;
      return html.slice(0, at) + '\n' + SHIM + html.slice(at);
    }
    var tag = /<html[^>]*>/i.exec(html);
    if (tag) {
      var at2 = tag.index + tag[0].length;
      return html.slice(0, at2) + '\n' + SHIM + html.slice(at2);
    }
    return SHIM + html;
  }

  /* ---------- fontes (pasta fontes/ do projeto) ---------- */

  var fontList = [];  // [{file, family, ext, url}] vindo de GET /fontes/

  /* Carrega a lista de fontes da pasta fontes/ do projeto. */
  function loadFonts(cb) {
    var x = new XMLHttpRequest();
    x.open('GET', '/fontes/', true);
    x.timeout = 4000;
    x.onload = function () {
      if (x.status === 200) {
        try { var d = JSON.parse(x.responseText); fontList = (d && d.fonts) || []; }
        catch (e) { fontList = []; }
      } else { fontList = []; }
      if (cb) cb();
    };
    x.onerror = x.ontimeout = function () { fontList = []; if (cb) cb(); };
    try { x.send(); } catch (e) { fontList = []; if (cb) cb(); }
  }

  /* ---------- mídia (imagens/ e sons/ do projeto) ---------- */

  /* Lista de arquivos reais do projeto; vai no system prompt para a página
     gerada referenciar "imagens/x.jpg" / "sons/y.mp3". null = ainda não sei
     (servidor off ou aberto por file://): o prompt sai como antes. */
  var mediaManifest = null;   // {images:[{file,name,ext,size,url}], sounds:[...]}

  function loadMedia(cb) {
    var x = new XMLHttpRequest();
    x.open('GET', '/midia', true);
    x.timeout = 5000;
    x.onload = function () {
      if (x.status === 200) {
        try {
          var d = JSON.parse(x.responseText);
          mediaManifest = {
            images: (d && d.images) || [],
            sounds: (d && d.sounds) || []
          };
        } catch (e) { mediaManifest = null; }
      } else { mediaManifest = null; }
      if (cb) cb();
    };
    x.onerror = x.ontimeout = function () { mediaManifest = null; if (cb) cb(); };
    try { x.send(); } catch (e) { mediaManifest = null; if (cb) cb(); }
  }

  /* Opções do seletor: apenas as fontes da pasta fontes/ do projeto. */
  function fontOptions() {
    var o = [['', '— padrão do tema —']];
    for (var j = 0; j < fontList.length; j++) {
      o.push(['"' + fontList[j].family + '"', fontList[j].family + '  (minha)']);
    }
    return o;
  }

  /* Descobre qual opção corresponde ao fontFamily computado do elemento. */
  function matchFont(computed) {
    if (!computed) return '';
    var first = String(computed).split(',')[0].replace(/["']/g, '').trim().toLowerCase();
    if (!first) return '';
    var opts = fontOptions();
    for (var i = 0; i < opts.length; i++) {
      var v = String(opts[i][0]).split(',')[0].replace(/["']/g, '').trim().toLowerCase();
      if (v && v === first) return opts[i][0];
    }
    return '';
  }

  /* Mostra na barra superior as bibliotecas que a página em tela usa. */
  function setLibraries(html) {
    if (!libsEl) return;
    var selector = window.LibrarySelector;
    var keys = selector ? selector.usedLibraries(html) : [];
    var names = keys.map(function (key) {
      var lib = selector.LIBRARIES[key];
      return lib ? lib.name : key;
    });
    if (!names.length) {
      libsEl.hidden = true;
      libsEl.textContent = '';
      libsEl.removeAttribute('title');
      libsEl.removeAttribute('aria-label');
      return;
    }
    var label = 'Bibliotecas usadas: ' + names.join(', ');
    libsEl.textContent = names.join(' · ');
    libsEl.title = label;
    libsEl.setAttribute('aria-label', label);
    libsEl.hidden = false;
  }

  /* ---------- imagem de referência do input ---------- */

  function updateImageUi() {
    if (!imageBtn) return;
    imageBtn.classList.toggle('has', !!imageAsset);
    imageBtn.disabled = generating || imageBusy;
    imgRemove.disabled = generating;
    var visible = !!imageAsset || imageBusy || !!imageError;
    imgAttach.hidden = !visible;
    if (!visible) {
      imgThumb.removeAttribute('src');
      imgName.textContent = '';
      imgSub.textContent = '';
      imgState.textContent = '';
      imgState.className = 'imgstate';
      return;
    }
    var thumb = imageAsset && imageAsset.thumbnail ? imageAsset.thumbnail : '';
    imgThumb.hidden = !thumb;
    if (thumb) {
      if (imgThumb.getAttribute('src') !== thumb) imgThumb.src = thumb;
    } else {
      imgThumb.removeAttribute('src');
    }
    imgName.textContent = imageAsset ? imageAsset.name : (imagePendingName || 'imagem');
    imgSub.textContent = imageAsset
      ? (imageAsset.width + '×' + imageAsset.height + ' · ' + imageAsset.sizeLabel)
      : '';
    imgState.className = 'imgstate' + (imageError ? ' error' : imageBusy ? ' busy' : '');
    imgState.textContent = imageBusy
      ? 'analisando imagem…'
      : imageError || (imageAsset
        ? (lastRendered != null
          ? 'pronta · fundo por padrão; textura se pedir'
          : 'análise concluída · pronta')
        : '');
    var hint = lastRendered != null
      ? 'Anexar imagem — fundo do jogo por padrão; peça “textura do cubo/peça/objeto” para aplicar em um componente'
      : 'Anexar imagem de referência para criar um jogo';
    imageBtn.title = hint;
    imageBtn.setAttribute('aria-label', hint);
  }

  function chooseImage(file) {
    if (!file || generating || imageBusy) return;
    if (!window.NxImage) {
      imageError = 'analisador de imagem indisponível';
      imagePendingName = file.name || 'imagem';
      updateImageUi();
      return;
    }
    var token = ++imageToken;
    imageAsset = null;
    imageBusy = true;
    imageError = '';
    imagePendingName = String(file.name || 'imagem').replace(/[\\/]/g, '-').slice(0, 120);
    try { imageFileInput.value = ''; } catch (e) { /* ignora */ }
    updateImageUi();
    window.NxImage.inspect(file).then(function (asset) {
      if (token !== imageToken) return;
      imageBusy = false;
      imageAsset = asset;
      imageError = '';
      updateImageUi();
    }).catch(function (e) {
      if (token !== imageToken) return;
      imageBusy = false;
      imageAsset = null;
      imageError = String(e && e.message ? e.message : e || 'falha ao ler a imagem').slice(0, 110);
      updateImageUi();
    });
  }

  function clearImageAttachment(silent) {
    imageToken++;
    imageAsset = null;
    imageBusy = false;
    imageError = '';
    imagePendingName = '';
    try { imageFileInput.value = ''; } catch (e) { /* ignora */ }
    if (imgThumb) imgThumb.removeAttribute('src');
    updateImageUi();
    if (!silent) toast('Imagem removida');
  }

  /* Grava a foto anexada em imagens/ e devolve o caminho root-relative usado
     dentro do jogo. O arquivo fica em cache no próprio asset da sessão. */
  function uploadGameImage(asset) {
    if (!asset || !asset.file) return Promise.reject(new Error('imagem indisponível'));
    if (asset.gameRemote && asset.gameRemote.path) return Promise.resolve(asset.gameRemote.path);
    if (!window.NxImage || !window.NxImage.assetForGame) {
      return Promise.reject(new Error('preparador de imagem indisponível'));
    }
    return window.NxImage.assetForGame(asset).then(function (dataUrl) {
      var controller = null;
      try { controller = new AbortController(); } catch (e) { controller = null; }
      var timer = setTimeout(function () {
        if (controller) controller.abort();
      }, 15000);
      function done() { clearTimeout(timer); }
      return fetch('/_api/ref-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-Nexus-Local-Request': '1',
        },
        body: JSON.stringify({ data: dataUrl }),
        signal: controller ? controller.signal : undefined,
      }).then(function (r) {
        return r.json().catch(function () {
          return { ok: false, error: r.statusText || ('HTTP ' + r.status) };
        }).then(function (body) {
          done();
          if (!r.ok || !body || body.ok !== true) {
            throw new Error((body && body.error) || ('HTTP ' + r.status));
          }
          var path = String(body.path || '');
          if (!/^\/imagens\/[A-Za-z0-9._-]+$/.test(path)) throw new Error('resposta de imagem inválida');
          asset.gameRemote = { path: path, bytes: Number(body.bytes) || 0 };
          return path;
        });
      }).catch(function (e) {
        done();
        if (e && e.name === 'AbortError') throw new Error('tempo esgotado ao preparar a imagem');
        throw e;
      });
    });
  }

  /* A imagem só conta como aplicada se o caminho exato aparece perto de um uso
     real (CSS, src, textura three.js, pattern ou drawImage), não em comentário. */
  function gameImageApplied(doc, path) {
    if (!path) return true;
    var text = String(doc == null ? '' : doc);
    var at = text.indexOf(path);
    while (at >= 0) {
      var around = text.slice(Math.max(0, at - 180), Math.min(text.length, at + path.length + 180));
      if (/url\s*\(|src\s*=|TextureLoader|createPattern|drawImage|\.map\s*=|backgroundImage|load\s*\(/.test(around)) {
        return true;
      }
      at = text.indexOf(path, at + path.length);
    }
    return false;
  }

  /* Pede ao shim um PNG do maior canvas da página (comparação opcional). */
  function captureFrame(timeoutMs) {
    return new Promise(function (resolve) {
      if (!frame || !frame.contentWindow) { resolve(null); return; }
      var id = String(++captureSeq);
      var timer = null;
      function finish(value) {
        if (!pendingCapture || pendingCapture.id !== id) return;
        pendingCapture = null;
        clearTimeout(timer);
        resolve(value);
      }
      pendingCapture = { id: id, finish: finish };
      timer = setTimeout(function () { finish(null); }, timeoutMs || 7000);
      tryPostMessage({ capture: id });
    });
  }

  function loadCapture(dataUrl) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('captura inválida')); };
      img.src = dataUrl;
    });
  }

  function captureUsable(report) {
    if (!report || !report.image || !report.image.width) return false;
    var edges = report.layout && report.layout.edgeDensity || 0;
    var colors = report.palette ? report.palette.length : 0;
    return !(colors <= 1 && edges < 0.002);
  }

  function render(html) {    var out = window.Html.rewriteLibs(String(html == null ? '' : html), APP_BASE);
    setLibraries(out);
    frameErrors = [];
    frameErrToken++;
    hidePreviewBadge();                        /* documento final substitui a prévia */
    frame.srcdoc = injectShim(out);
    /* Foca o iframe para teclado funcionar sem clique */
    setTimeout(function () {
      try { frame.contentWindow.focus(); } catch (e) { frame.focus(); }
    }, 50);
    watchFrameErrors(frameErrToken);
  }

  /* Aviso silencioso apenas para erros graves. Falsos positivos comuns
     (console.error de bibliotecas, recurso 404, canvas em branco) são
     ignorados. O relatório completo fica disponível no próximo prompt. */
  function watchFrameErrors(token) {
    var notified = false;
    function check() {
      if (token !== frameErrToken) return;
      if (generating || lastRendered == null) return;
      if (notified || !frameErrors.length) return;
      /* Só notifica se houver erro REAL de JavaScript (tipo "error" ou "raf"),
         ignorando "console", "resource", "promise" que são ruído comum. */
      var grave = frameErrors.some(function (e) {
        return e && (e.k === 'error' || e.k === 'raf');
      });
      if (!grave) return;
      notified = true;
      toast('⚠ ' + frameErrors.length + ' erro(s) no jogo');
    }
    setTimeout(check, 3000);
    setTimeout(check, 7000);
  }

  /* Decora com o tema atual; se a página já tem o bloco base, só troca. */
  /* Injeta o polyfill de storage se o documento ainda não o tem. */
  function ensureSafeStorage(html) {
    if (!html || html.indexOf('id="nx-safe"') >= 0) return html;
    var safe = window.Html.STORAGE_SAFE || '';
    if (!safe) return html;
    var head = /<head[^>]*>/i.exec(html);
    if (head) {
      var at = head.index + head[0].length;
      return html.slice(0, at) + '\n' + safe + html.slice(at);
    }
    var tag = /<html[^>]*>/i.exec(html);
    if (tag) {
      var at2 = tag.index + tag[0].length;
      return html.slice(0, at2) + '\n<head>\n' + safe + '\n</head>' + html.slice(at2);
    }
    return html;
  }

  function themed(html) {
    if (!html) return html;
    /* Garante o polyfill de storage mesmo em HTML antigo/re-renderizado. */
    html = ensureSafeStorage(html);
    var marker = '<style id="nx77-base">';
    var idx = html.indexOf(marker);
    if (idx >= 0) {
      var end = html.indexOf('</style>', idx);
      if (end >= 0) {
        var replacement = '<style id="nx77-base">\n' + window.Html.varsCss(theme) +
          '\n' + window.Html.baseCss() + '\n</style>';
        return html.slice(0, idx) + replacement + html.slice(end + '</style>'.length);
      }
    }
    return window.Html.decorate(html, theme);
  }

  /* Deixa o snapshot autônomo: remove os assets locais injetados pelo shim
     (fonte e CSS) e devolve as libs reescritas pelo rewriteLibs() à CDN. */
  function sanitizeSnapshotHtml(html) {
    var out = String(html == null ? '' : html);
    /* <style id="nx-fonts">…</style> injetado pelo shim (todas as cópias) */
    out = out.replace(/<style\s+id=["']nx-fonts["'][^>]*>[\s\S]*?<\/style>\s*/gi, '');
    /* <link … fonts.css …> local, com ou sem query string */
    out = out.replace(/<link\b[^>]*fonts\.css[^>]*>\s*/gi, '');
    /* vendor local do three (absoluto/protocol-relative) → CDN pública */
    out = out.replace(/(?:https?:)?\/\/[^\s"'()<>]*\/vendor\/three\/(three(?:\.module)?(?:\.min)?\.js)/gi,
      function (m, file) {
        return THREE_CDN + (file.toLowerCase().indexOf('module') >= 0 ? 'three.module.min.js' : 'three.min.js');
      });
    /* vendor relativo citado em JS/CSS → CDN pública */
    out = out.replace(/(["'])\/vendor\/three\/(three(?:\.module)?(?:\.min)?\.js)\1/gi,
      function (m, q, file) {
        return q + THREE_CDN + (file.toLowerCase().indexOf('module') >= 0 ? 'three.module.min.js' : 'three.min.js') + q;
      });
    return out;
  }

  /* ---------- geração ---------- */

  function kbText(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  function setLoading(on) {
    if (on) {
      kbLabel.hidden = false;
      kbLabel.textContent = '…';
      if (vu) vu.start();
    } else {
      if (vu) vu.stop();
      kbLabel.hidden = true;
    }
  }

  /* Fecha tags abertas para a prévia poder renderizar (documento parcial). */
  function completePartial(html) {
    var s = String(html || '');
    if (s.lastIndexOf('<script') > s.lastIndexOf('</script>')) s += '\n</script>';
    if (s.lastIndexOf('<style') > s.lastIndexOf('</style>')) s += '\n</style>';
    if (!/<\/body>/i.test(s)) s += '\n</body>';
    if (!/<\/html>/i.test(s)) s += '\n</html>';
    return s;
  }

  /* Prévia ao vivo: mostra o documento enquanto o modelo escreve.
     Não rouba foco (o usuário continua podendo digitar/ESC) e não conta os
     erros da prévia — o documento final substitui tudo. */
  function previewPartial(text) {
    if (!generating || genEditing || editMode || !previewBadge) return;
    var s = String(text || '');
    if (s.length < PREVIEW_MIN_CHARS) return;
    var bodyAt = s.search(/<body[^>]*>/i);
    if (bodyAt < 0 || s.length - bodyAt < PREVIEW_MIN_CHARS * 0.5) return;
    var now = Date.now();
    if (now - previewAt < PREVIEW_EVERY_MS) return;
    previewAt = now;
    try {
      frameErrToken++;                          /* invalida watchFrameErrors da prévia */
      frame.srcdoc = injectShim(window.Html.rewriteLibs(completePartial(s), APP_BASE));
      previewBadge.hidden = false;
    } catch (e) { /* prévia é cosmética — nunca derruba a geração */ }
  }

  function hidePreviewBadge() {
    if (previewBadge) previewBadge.hidden = true;
  }

  /* Progresso ao vivo. `null` = apenas sinal de vida (sem contagem de bytes):
     usado pelas continuações e pelo fallback sem streaming, que não relatam bytes. */
  function onGenProgress(contentBytes, text) {
    if (text != null) {
      liveText = text;
      previewPartial(text);
    }
    if (contentBytes == null) { lastProgressAt = Date.now(); return; }
    var now = Date.now();
    if (now - lastProgressAt < 60) return;
    lastProgressAt = now;
    kbLabel.textContent = kbText(contentBytes);
    liveOut = Math.floor(contentBytes / 4);
    updateSessionUi();
  }

  /* Sinal de vida sem mexer no contador de KB (continuações / fallback). */
  function marcarProgresso() { lastProgressAt = Date.now(); }

  /* Watchdog: se a geração ficar "presa" sem progresso, destrava a UI. */
  var _genStartedAt = 0;
  var _genWatch = null;

  function armarWatchdog() {
    _genStartedAt = Date.now();
    if (_genWatch) clearInterval(_genWatch);
    _genWatch = setInterval(function () {
      if (!generating) { clearInterval(_genWatch); _genWatch = null; return; }
      var parado = Date.now() - Math.max(_genStartedAt, lastProgressAt || 0);
      if (parado > 150000) {                 /* 2,5 min sem nenhum progresso */
        clearInterval(_genWatch); _genWatch = null;
        canceladoPeloUsuario = true;         /* evita que o AbortError sobrescreva a mensagem */
        try { window.AiClient.cancel(); } catch (e) {}
        finishGeneration();
        status('✗ geração travada — destravado', 'error', false);
        toast('Geração travada por inatividade — tente de novo');
      }
    }, 5000);
  }

  function sendPrompt() {
    if (generating) {
      toast('Gerando… aguarde (ESC cancela)');
      return;
    }
    var prompt = '';
    try {
      prompt = input.value.trim();
    } catch (e) { prompt = ''; }
    if (imageBusy) {
      toast('Aguarde a análise da imagem');
      return;
    }
    if (!prompt && !imageAsset) {
      toast(imageError
        ? 'A imagem é inválida — remova ou escolha outra'
        : 'Descreva o jogo ou anexe uma imagem');
      return;
    }
    if (!prefs.hasKey()) {
      toast('Configure sua API key em ⚙');
      window.Settings.open({ onSaved: onSettingsSaved });
      return;
    }

    generating = true;
    updateImageUi();
    armarWatchdog();
    try {
      iniciarGeracao(prompt, imageAsset);
    } catch (e) {
      failGeneration(window.AiClient.errorMessage(e));
    }
  }

  function iniciarGeracao(prompt, asset) {
    asset = asset || null;
    var editingNow = lastRendered != null;
    var gameImage = !!(editingNow && asset);
    showingList = false;
    canceladoPeloUsuario = false;
    lastProgressAt = 0;
    lastPrompt = prompt || (asset
      ? (gameImage ? 'imagem aplicada ao jogo' : 'recriacao visual')
      : '');
    // Não zera lastOpenName aqui — se há um projeto aberto, continua sendo o mesmo.
    // Só reseta no resetSession() ou ao abrir outro projeto.
    saveBtn.disabled = true;
    openBtn.disabled = true;
    status(gameImage ? 'preparando imagem…' : (editingNow ? 'ajustando…' : 'gerando…'), 'accent', false);
    setLoading(true);
    input.blur();

    if (!gameImage) {
      continuarGeracao(prompt, asset, null);
      return;
    }

    /* Jogo aberto: a imagem vira arquivo em imagens/ antes do prompt, para o
       modelo receber um caminho real que funciona também depois de salvar. */
    uploadGameImage(asset).then(function (path) {
      if (canceladoPeloUsuario) { canceladoPeloUsuario = false; finishGeneration(); return; }
      continuarGeracao(prompt, asset, path);
    }).catch(function (e) {
      if (canceladoPeloUsuario) { canceladoPeloUsuario = false; finishGeneration(); return; }
      failGeneration(window.AiClient.errorMessage(e));
    });
  }

  function continuarGeracao(prompt, asset, imagePath) {
    var editing = lastRendered != null;
    var gameImage = !!(editing && asset && imagePath);
    var imageMode = gameImage ? window.NxImage.usageMode(prompt) : 'background';
    var command = prompt || (asset
      ? (gameImage ? window.NxImage.DEFAULT_GAME_IMAGE_COMMAND : window.NxImage.DEFAULT_COMMAND)
      : '');
    var commandLabel = prompt || (asset
      ? (gameImage ? 'imagem no jogo (' + imageMode + ')' : 'recriar a imagem de referência')
      : '');
    genEditing = editing;               /* bloqueia prévia parcial em ajustes de página */
    var baseSystem = window.Html.systemPrompt(theme, prefs.detailLevel(), command, lastRendered, mediaManifest);

    var elementHint = '';
    if (editing && editSelHtml) {   /* só faz sentido quando há página em tela */
      elementHint = '\n\nTarget element (user clicked this to edit):\n```html\n' + editSelHtml + '\n```\nFocus ONLY on this element. Change what was asked, keep the rest intact.';
      /* NÃO limpa aqui: se a requisição falhar, o alvo continua válido para a próxima. */
    }

    /* Notas para o modelo: erros reais da página em tela + histórico curto de comandos. */
    var notes = '';
    if (editing && frameErrors.length) {
      notes += 'Runtime errors reported by the CURRENT page (it is broken — fix these first, ' +
        'they are the symptom the user sees):\n' +
        frameErrors.slice(0, 12).map(function (e, i) {
          return (i + 1) + '. [' + e.k + (e.l ? ':' + e.l : '') + '] ' + e.m;
        }).join('\n');
    }
    if (editing && lastCommands.length) {
      if (notes) notes += '\n\n';
      notes += 'Previous commands already applied to this page (context only — do not undo them):\n- ' +
        lastCommands.slice(-3).join('\n- ');
    }

    var refLocal = '';
    var refFollow = '';
    if (asset) {
      if (gameImage) {
        refLocal = '\n\n' + window.NxImage.usageBlock(asset, { path: imagePath, mode: imageMode });
        refFollow = refLocal;
      } else {
        refLocal = '\n\n' + window.NxImage.referenceBlock(asset, { vision: false });
        refFollow = '\n\n' + window.NxImage.referenceBlock(asset, { vision: false, followup: true });
      }
    }
    var userBase = command + elementHint + refLocal;
    var user = window.Html.userPrompt(userBase, lastRendered, notes);
    var userFollow = window.Html.userPrompt(command + elementHint + refFollow, lastRendered, notes);
    var userVision = asset
      ? window.Html.userPrompt(command + elementHint + '\n\n' + (gameImage
          ? window.NxImage.usageBlock(asset, { path: imagePath, mode: imageMode, vision: true })
          : window.NxImage.referenceBlock(asset, { vision: true })), lastRendered, notes)
      : user;
    var sendVision = !!(asset && prefs.imageMode() !== 'local' && window.NxImage);

    /* Força regeneração completa a cada MAX_EDITS patches para evitar degradação */
    var editOverLimit = MAX_EDITS > 0 && editing && editCount >= MAX_EDITS;
    if (editOverLimit) {
      toast('Regenerando página completa — ' + editCount + ' patches atingido');
      editCount = 0;
    }
    var system = editOverLimit ? baseSystem : editing ? baseSystem + window.Html.EDIT_DIRECTIVE : baseSystem;
    if (!editing) editCount = 0;

    function run(systemPrompt, userMessage, opts, onProg) {
      var msg = userMessage == null ? userFollow : userMessage;
      return window.AiClient.chat(
        prefs.endpoint(), prefs.apiKey(), prefs.model(),
        prefs.temperature(), prefs.maxTokens(), systemPrompt, msg,
        onProg || onGenProgress, opts || null
      );
    }

    /* JS com erro de sintaxe = NADA roda: o cubo/peça nunca aparece.
       Pede ao modelo o documento completo corrigido (máx. 2 rodadas). */
    function repararJsQuebrado(out, tentativa) {
      var erros = window.Html.jsSyntaxErrors(out.doc);
      if (!erros.length) return Promise.resolve(out);
      if (tentativa >= 2) {
        status('⚠ JS ainda com erro de sintaxe', 'error', false);
        return Promise.resolve(out);
      }
      status('⚠ corrigindo JS quebrado (' + (tentativa + 1) + ')…', 'accent', false);
      liveOut = 0;
      lastProgressAt = 0;
      var msg = 'Current page (BROKEN — JavaScript syntax error, so nothing runs and no object appears):\n```html\n' +
        out.doc + '\n```\n\nJavaScript errors found:\n' + erros.join('\n') +
        (gameImage ? '\n\nKeep the reference image usage at ' + imagePath + ' (' + imageMode + ') intact.' : '') +
        '\n\nReturn the COMPLETE corrected HTML document: same features, nothing removed, every <script> block closed and syntactically valid. Output ONLY raw HTML, no explanations.';
      return run(baseSystem, msg).then(function (r3) {
        var doc3 = window.Html.extractDocument(r3.content || '');
        if (!doc3.trim()) return out;
        return repararJsQuebrado({ result: r3, doc: doc3 }, tentativa + 1);
      }).catch(function (e) {
        if (canceladoPeloUsuario) throw e;
        return out;                       /* não perde o que já veio */
      });
    }

    /* Qualidade objetiva do documento (Html.lint): addon/CDN, loop ou resize
       ausentes, parede de texto, trecho por fazer. UMA regeneração completa —
       e nunca em ajuste de página, que destruiria a página do usuário. */
    function repararQualidade(out, tentativa) {
      if (editing) return Promise.resolve(out);
      if (tentativa >= 1) return Promise.resolve(out);
      if (out.doc == null || window.Html.jsSyntaxErrors(out.doc).length) return Promise.resolve(out);
      var falhas = window.Html.lint(out.doc);
      if (!falhas.length) return Promise.resolve(out);
      status('⚠ ajustando qualidade (' + falhas.length + ' falha' + (falhas.length > 1 ? 's' : '') + ')…', 'accent', false);
      liveOut = 0;
      lastProgressAt = 0;
      var msg = 'The document below was generated for this request but failed quality checks:\n- ' +
        falhas.map(function (f) { return f.msg; }).join('\n- ') +
        '\n\nDocument to fix:\n```html\n' + out.doc + '\n```\n\n' +
        'Return the COMPLETE corrected HTML document: same features, every item above fixed, ' +
        'more polished. Output ONLY raw HTML, no explanations.';
      return run(baseSystem, msg).then(function (r4) {
        var doc4 = window.Html.extractDocument(r4.content || '');
        if (!window.Html.looksLikeDocument(r4.content) || !doc4.trim()) return out;
        return repararQualidade({ result: r4, doc: doc4 }, tentativa + 1);
      }).catch(function (e) {
        if (canceladoPeloUsuario) throw e;
        return out;                       /* não perde o documento bom */
      });
    }

    /* UMA correção se o documento final não usa a imagem anexada. A imagem
       precisa aparecer de verdade, não só ser mencionada. */
    function garantirImagemAplicada(out, tentativa) {
      if (!gameImage || out.doc == null) return Promise.resolve(out);
      if (gameImageApplied(out.doc, imagePath) || tentativa >= 1) return Promise.resolve(out);
      status('⚠ imagem ainda não aplicada — corrigindo…', 'accent', false);
      liveOut = 0;
      lastProgressAt = 0;
      var msg = 'The updated game does NOT visibly use the attached reference image yet. ' +
        'It MUST appear inside the game as its ' +
        (imageMode === 'texture' ? 'texture on the requested component' : 'background') + '.\n\n' +
        window.NxImage.usageBlock(asset, { path: imagePath, mode: imageMode }) +
        '\n\nDocument to fix:\n```html\n' + out.doc + '\n```\n\n' +
        'Return the COMPLETE corrected HTML document (not an edits JSON): same game, same controls and mechanics, ' +
        'with the image path used exactly as given. Output ONLY raw HTML, no explanations.';
      return run(baseSystem, msg).then(function (r5) {
        var doc5 = window.Html.extractDocument(r5.content || '');
        if (!window.Html.looksLikeDocument(r5.content) || !doc5.trim() ||
            window.Html.jsSyntaxErrors(doc5).length) {
          status('⚠ correção da imagem inválida — página mantida', 'accent', true);
          return out;
        }
        try {
          if (r5.totalTokens > 0) {
            prefs.addSessionTokens(r5.promptTokens, r5.completionTokens);
            prefs.addUsage(r5.promptTokens, r5.completionTokens);
            updateSessionUi();
          }
        } catch (e) { /* contabilidade nunca derruba a correção */ }
        if (!gameImageApplied(doc5, imagePath)) return out;
        return { result: r5, doc: doc5 };
      }).catch(function (e) {
        if (canceladoPeloUsuario) throw e;
        return out;                       /* não perde o documento bom */
      });
    }

    /* ============================================================
     * ANTI-ERRO (ordem do Leo, 2026-10-21).
     * A página JÁ está em tela. A telemetria do iframe (exceção,
     * promise rejeitada, console.error, canvas nunca dimensionado ou
     * em branco) é lida e, havendo erro real, o documento volta para o
     * modelo com o relatório — sem o usuário precisar pedir nada.
     * Máximo ANTI_ERR_MAX rodadas; nunca roda na prévia.
     * ============================================================ */
    function relatorioErros(lista) {
      return lista.slice(0, 12).map(function (e, i) {
        return (i + 1) + '. [' + e.k + (e.l ? ':' + e.l : '') + '] ' + e.m;
      }).join('\n');
    }

    /* Espera a telemetria chegar e devolve só os erros DESTE render. */
    function esperarTelemetria() {
      var tok = frameErrToken;
      return new Promise(function (res) {
        setTimeout(function () {
          var filtrados = (tok === frameErrToken ? frameErrors.slice(0) : []).filter(function (e) {
            return e && (e.k === 'error' || e.k === 'promise' || e.k === 'raf');
          });
          res(filtrados);
        }, ANTI_ERR_WAIT_MS);
      });
    }

    function antiErro(doc, tentativa) {
      return esperarTelemetria().then(function (erros) {
        if (canceladoPeloUsuario) return { doc: doc, tentativas: tentativa, limpo: false };
        if (!erros.length) {
          return { doc: doc, tentativas: tentativa, limpo: true };
        }
        if (tentativa >= ANTI_ERR_MAX) {
          /* Limite atingido: o relatório continua guardado para o próximo pedido. */
          status('⚠ ' + erros.length + ' erro(s) na página', 'error', true);
          toast('⚠ ' + erros.length + ' erro(s) — o relatório vai junto no próximo pedido');
          return { doc: doc, tentativas: tentativa, limpo: false };
        }
        status('🔧 anti-erro (' + (tentativa + 1) + '/' + ANTI_ERR_MAX + ') · ' +
          erros.length + ' erro(s)', 'accent', false);
        liveOut = 0;
        liveActive = true;
        lastProgressAt = Date.now();
        var msg = 'ANTI-ERROR REPORT — the page you just wrote is ALREADY RUNNING in the browser and it ' +
          'really failed. These errors were captured from the live page, not guessed:\n\n' +
          relatorioErros(erros) + '\n\n' +
          'Broken document (complete):\n```html\n' + doc + '\n```\n\n' +
          'Fix the ROOT CAUSE of every error above and keep every feature that already works. ' +
          'Common causes: a three.js addon that does not exist in this build (no OrbitControls/GLTFLoader/EffectComposer), ' +
          'element accessed before it exists, undefined variable, canvas never sized, geometry/material created but never ' +
          'added to the scene, WebAudio started without a user gesture, CDN resource that failed to load. ' +
          'Never remove features to silence an error — make the code correct. ' +
          (gameImage ? 'Keep the reference image usage at ' + imagePath + ' (' + imageMode + ') intact. ' : '') +
          'Return the COMPLETE corrected HTML document. Output ONLY raw HTML, no explanations.';
        return run(baseSystem, msg).then(function (r) {
          var d = window.Html.extractDocument(r.content || '');
          if (!window.Html.looksLikeDocument(r.content) || !d.trim() ||
              window.Html.jsSyntaxErrors(d).length) {
            status('⚠ correção automática inválida — página mantida', 'accent', true);
            return { doc: doc, tentativas: tentativa, limpo: false };
          }
          /* O consumo da correção é consumo real do usuário. */
          try {
            if (r.totalTokens > 0) {
              prefs.addSessionTokens(r.promptTokens, r.completionTokens);
              prefs.addUsage(r.promptTokens, r.completionTokens);
              updateSessionUi();
            }
          } catch (e) { /* contabilidade nunca derruba a correção */ }
          lastRendered = d;
          pushGenHistory();  // anti-erro: guarda antes de corrigir
          render(themed(d));            /* zera frameErrors e rearma a telemetria */
          liveActive = false;
          return antiErro(d, tentativa + 1);
        }).catch(function (e) {
          if (canceladoPeloUsuario) return { doc: doc, tentativas: tentativa, limpo: false };
          status('⚠ correção automática falhou — página mantida', 'accent', true);
          return { doc: doc, tentativas: tentativa, limpo: false };
        });
      });
    }

    /* Comparação opcional: captura o canvas da própria página e pede
       correções mensuráveis (paleta, grade, brilho, proporção, detalhe).
       Nunca roda em ajuste de página nem em projeto salvo. */
    function iterarVisual(out) {
      var limit = prefs.visualIterations();
      if (!asset || editing || !out || !out.doc || limit <= 0) return Promise.resolve(out);
      var current = out.doc;
      var round = 0;
      function step() {
        if (round >= limit || canceladoPeloUsuario || !generating) return Promise.resolve(out);
        return new Promise(function (resolve) { setTimeout(resolve, 1800); }).then(function () {
          if (canceladoPeloUsuario || !generating) return { stop: true };
          status('🔍 comparando com a referência (' + (round + 1) + '/' + limit + ')…', 'accent', false);
          return captureFrame(7000).then(function (dataUrl) {
            if (!dataUrl) {
              status('⚠ comparação visual indisponível (sem canvas acessível)', 'accent', true);
              return { stop: true };
            }
            return loadCapture(dataUrl).then(function (img) {
              return window.NxImage.analyzeSource(img, {
                name: 'render', mime: 'image/png', bytes: 0,
                width: img.width, height: img.height
              }).then(function (report) {
                if (!captureUsable(report)) {
                  status('⚠ captura do jogo vazia — comparação ignorada', 'accent', true);
                  return { stop: true };
                }
                var diff = window.NxImage.compare(asset.report, report);
                if (diff.score < 0.14) {
                  status('✓ composição próxima da referência', '', true);
                  return { stop: true };
                }
                var msg = 'VISUAL COMPARISON — the page was just rendered and its canvas captured locally. ' +
                  'It was compared with the attached reference by low-level features, not semantic understanding.\n' +
                  'Difference score: ' + diff.score + ' (0 = close, 1 = very different).\n' +
                  'Metrics: ' + JSON.stringify(diff.metrics) + '\n' +
                  'Measurable differences:\n- ' + diff.issues.join('\n- ') + '\n\n' +
                  window.NxImage.referenceBlock(asset, { followup: true }) + '\n\n' +
                  'Current document:\n```html\n' + current + '\n```\n\n' +
                  'Correct the document to reduce these measurable differences while keeping ALL controls, ' +
                  'interactions and game mechanics working. Never replace the game with a static image. ' +
                  'Return the COMPLETE corrected HTML document. Output ONLY raw HTML, no explanations.';
                return run(baseSystem, msg, null, marcarProgresso).then(function (r) {
                  if (canceladoPeloUsuario) return { stop: true };
                  var next = window.Html.extractDocument(r.content || '');
                  if (!window.Html.looksLikeDocument(r.content) || !next.trim() ||
                      window.Html.jsSyntaxErrors(next).length) {
                    status('⚠ ajuste visual inválido — página mantida', 'accent', true);
                    return { stop: true };
                  }
                  try {
                    if (r.totalTokens > 0) {
                      prefs.addSessionTokens(r.promptTokens, r.completionTokens);
                      prefs.addUsage(r.promptTokens, r.completionTokens);
                      updateSessionUi();
                    }
                  } catch (e) { /* contabilidade nunca derruba a correção */ }
                  pushGenHistory();
                  current = next;
                  lastRendered = next;
                  out.doc = next;
                  render(themed(next));
                  round++;
                  status('✓ ajuste visual aplicado (' + round + '/' + limit + ')', '', true);
                  return step();
                }).catch(function (e) {
                  if (canceladoPeloUsuario) return { stop: true };
                  status('⚠ comparação visual falhou — página mantida', 'accent', true);
                  return { stop: true };
                });
              });
            });
          });
        });
      }
      return step().then(function () { return out; });
    }

    var encoder = new TextEncoder();
    liveActive = true;
    var startUser = sendVision ? userVision : user;
    liveIn = Math.floor((encoder.encode(system).length + encoder.encode(startUser).length) / 4);
    liveOut = 0;
    lastProgressAt = 0;
    liveText = '';
    previewAt = 0;
    updateSessionUi();
    var started = performance.now();

    var primeira;
    var renderedDoc = null;
    if (sendVision) {
      primeira = window.NxImage.dataUrl(asset.file, asset.mime).catch(function () { return ''; }).then(function (dataUrl) {
        if (!dataUrl || !/^data:image\/(png|jpeg|webp);base64,/i.test(dataUrl)) {
          toast('Imagem não preparada — usando análise local');
          return run(system, user);
        }
        return run(system, userVision, { image: dataUrl }).catch(function (e) {
          if (canceladoPeloUsuario) throw e;
          if (!window.AiClient.isImageInputError(e)) throw e;
          status('⚠ modelo recusou a imagem — usando análise local…', 'accent', false);
          toast('Modelo sem suporte a imagem — análise local usada');
          return run(system, user);
        });
      });
    } else {
      primeira = run(system, user);
    }

    primeira.then(function (result) {
      if (editing) {
        /* Edição cirúrgica: aplica só os trechos pedidos (não reescreve a página). */
        var patched = editOverLimit ? { ok: false } : window.Html.applyEdits(lastRendered, result.content);
        if (patched.ok) { editCount++; return { result: result, doc: patched.html }; }
        if (patched.partial) {
          /* Alguns trechos casaram: aplica o que deu certo e avisa o resto. */
          editCount++;
          toast('⚠ ' + patched.failed + ' trecho(s) não casaram — aplicado o resto');
          return { result: result, doc: patched.html };
        }
        if (window.Html.looksLikeDocument(result.content)) {
          return { result: result, doc: window.Html.extractDocument(result.content) };
        }
        /* Patch inválido: segunda tentativa AINDA com a página atual em mãos
           (regenerar do zero destruía o jogo do usuário). */
        status('⚠️ ajuste não aplicável — refazendo com a página atual…', 'accent', false);
        liveOut = 0;
        lastProgressAt = 0;
        editCount = 0;
        var retryUser = window.Html.userPrompt(
          command + elementHint + refFollow,
          lastRendered,
          (notes ? notes + '\n\n' : '') +
            'The previous response returned edits whose "find" text did not match this document. ' +
            'Return the COMPLETE updated HTML document instead of an edits object.'
        );
        return run(baseSystem, retryUser).then(function (r2) {
          var doc2 = window.Html.extractDocument(r2.content || '');
          if (!window.Html.looksLikeDocument(r2.content) || !doc2.trim()) {
            /* Nada aproveitável: mantém a página intacta em vez de apagá-la. */
            return { result: result, doc: null };
          }
          return { result: r2, doc: doc2 };
        });
      }
      editCount = 0;
      return { result: result, doc: window.Html.extractDocument(result.content) };
    }).then(function (out) {
      if (out.doc == null) return out;               /* mantém a página atual */
      return completarSeTruncado(out.result, out.doc).then(function (d) { out.doc = d; return out; });
    }).then(function (out) {
      if (out.doc == null) return out;
      return repararJsQuebrado(out, 0);
    }).then(function (out) {
      if (out.doc == null) return out;
      return repararQualidade(out, 0);
    }).then(function (out) {
      if (out.doc == null) return out;
      return garantirImagemAplicada(out, 0);
    }).then(function (out) {
      /* Cancelado entre o fim da resposta e este callback: não renderiza nada. */
      if (canceladoPeloUsuario) { canceladoPeloUsuario = false; finishGeneration(); return; }
      var result = out.result;
      var doc = out.doc;
      var elapsed = (performance.now() - started) / 1000;
      if (doc == null) {
        /* A tentativa de correção não devolveu documento: nada foi perdido. */
        liveActive = false;
        status('⚠ nada aplicado — página atual mantida', 'accent', true);
        finishGeneration();
        return;
      }
      if (!doc.trim()) {
        failGeneration('resposta vazia do modelo');
        return;
      }
      var imageAppliedInRender = !gameImage || gameImageApplied(doc, imagePath);
      pushGenHistory();  // guarda a página atual antes da IA gerar a nova
      lastRendered = doc;
      editSelHtml = '';                    /* alvo consumido só quando a edição foi aplicada */
      if (imageAppliedInRender) {
        lastCommands.push(commandLabel);
        if (lastCommands.length > 6) lastCommands.shift();
      }
      render(themed(doc));
      renderedDoc = doc;
      var kb = Math.ceil(encoder.encode(doc).length / 1024);
      liveActive = false;
      if (result.totalTokens > 0) {
        prefs.addSessionTokens(result.promptTokens, result.completionTokens);
        prefs.addUsage(result.promptTokens, result.completionTokens);
        updateSessionUi();
      }
      if (gameImage && !imageAppliedInRender) {
        status('⚠ imagem não aplicada — anexo mantido', 'accent', true);
        toast('A imagem não foi aplicada ao jogo — anexo mantido para tentar de novo');
      } else {
        status('✓ ' + kb + ' KB • ' + elapsed.toFixed(1) + 's', '', true);
      }
      input.value = '';
      input.blur();
      /* ANTI-ERRO: opcional (desligado por padrão em prefs.autoFix). Quando desligado,
         os erros vão como contexto no próximo prompt manual, sem loop infinito automático. */
      if (!prefs.autoFix()) {
        return { doc: doc, tentativas: 0, limpo: true };
      }
      return antiErro(doc, 0);
    }).then(function (r) {
      if (!r || !r.doc || editing || !asset || canceladoPeloUsuario) return r;
      return iterarVisual(r);
    }).then(function (r) {
      if (canceladoPeloUsuario) {
        canceladoPeloUsuario = false;    /* cancelado: preserva o anexo para tentar de novo */
        finishGeneration();
        return;
      }
      if (!renderedDoc) {
        finishGeneration();
        return;
      }
      var finalDoc = r && r.doc ? r.doc : renderedDoc;
      var imageApplied = !gameImage || gameImageApplied(finalDoc, imagePath);
      if (!gameImage || imageApplied) {
        clearImageAttachment(true);      /* só depois de a geração dar certo */
      }
      if (gameImage && !imageApplied) {
        status('⚠ imagem não aplicada — anexo mantido', 'error', true);
      } else if (r && r.tentativas > 0 && r.limpo) {
        var kb2 = Math.ceil(encoder.encode(finalDoc).length / 1024);
        status('✓ ' + kb2 + ' KB • anti-erro OK (' + r.tentativas + ')', '', true);
        toast('🔧 ' + r.tentativas + ' erro(s) corrigido(s) automaticamente');
      }
      finishGeneration();
    }).catch(function (e) {
      failGeneration(window.AiClient.errorMessage(e));
    });
  }

  function failGeneration(message) {
    var cancelado = canceladoPeloUsuario;
    canceladoPeloUsuario = false;
    finishGeneration();
    /* Cancelamento pelo usuário (ESC/reset) ou watchdog: a mensagem já foi dada;
       o AbortError não deve escrever um erro em inglês nem trocar a página. */
    if (cancelado) return;
    status('✗ ' + message, 'error', false);
    if (lastRendered == null) {
      render(window.Html.errorPage(theme, 'Falha na geração', message));
    }
    toast(message);
  }

  function finishGeneration() {
    generating = false;
    if (_genWatch) { clearInterval(_genWatch); _genWatch = null; }
    saveBtn.disabled = false;
    openBtn.disabled = false;
    liveActive = false;
    hidePreviewBadge();
    updateImageUi();
    updateSessionUi();
    setLoading(false);
  }

  function showWelcome() {
    showingList = false;
    status(prefs.hasKey()
      ? ''
      : 'configure a API key em ⚙ para começar', '', false);
    render(window.Html.welcomePage(theme, prefs.hasKey()));
  }

  function resetSession() {
    if (generating) {
      canceladoPeloUsuario = true;
      try { window.AiClient.cancel(); } catch (e) {}
      finishGeneration();
      toast('Geração cancelada — sessão reiniciada');
    }
    prefs.resetSessionTokens();
    lastRendered = null;
    /* Sessão nova: nada do documento anterior deve vazar para o próximo prompt. */
    editSelHtml = '';
    editCount = 0;
    frameErrors = [];
    lastCommands = [];
    lastOpenName = null;    // reseta o vínculo com projeto salvo
    clearGenHistory();
    clearImageAttachment(true);
    updateSessionUi();
    showWelcome();
    toast('Sessão reiniciada');
  }

  function onSettingsSaved() {
    theme = window.Themes.of(0);
    applyTheme();
    if (lastRendered == null) {
      showWelcome();
    }
    updateSessionUi();
  }

  /* ---------- salvar / abrir / excluir ---------- */

  function defaultSaveName() {
    // Nome limpo no campo: página aberta sugere o próprio nome; geração nova sugere o
    // slug do último prompt. Sem ".html" — o Store anexa a extensão ao salvar.
    if (lastOpenName) {
      var openStem = String(lastOpenName).replace(/\.html$/i, '').trim();
      if (openStem) return openStem;
    }
    var slug = String(lastPrompt || '').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+/, '').replace(/-+$/, '')
      .slice(0, 60);
    return slug || 'pagina';
  }

  function requestSave() {
    if (lastRendered == null) {
      toast('Gere uma página antes de salvar');
      return;
    }
    /* Se já tem projeto aberto, sobrescreve direto. */
    if (lastOpenName) {
      savePage(lastOpenName, true);
      return;
    }
    /* Primeiro save da sessão: usa slug do prompt como nome. */
    var name = defaultSaveName();
    savePage(name, true);
  }

  function showSaveDialog() {
    var root = el('div', 'mx-modal');
    var card = el('div', 'mx-modal-card mx-modal-small');
    card.appendChild(el('div', 'mx-modal-title', 'Salvar projeto'));
    card.appendChild(el('div', 'mx-path', 'Pasta: salvos/ '));
    var inp = el('input', 'mx-input');
    inp.type = 'text';
    inp.value = defaultSaveName();
    card.appendChild(inp);

    var row = el('div', 'mx-btnrow');
    var cancel = el('button', 'mx-btn mx-btn-ghost', 'Cancelar');
    cancel.type = 'button';
    var ok = el('button', 'mx-btn mx-btn-inline mx-btn-primary', 'Salvar');
    ok.type = 'button';
    row.appendChild(cancel);
    row.appendChild(ok);
    card.appendChild(row);
    root.appendChild(card);
    document.body.appendChild(root);

    inp.focus();
    inp.select();

    function close() {
      document.removeEventListener('keydown', onKey);
      if (root.parentNode) root.parentNode.removeChild(root);
    }
    function submit() {
      var name = inp.value.trim();
      if (!name) {
        toast('Digite um nome');
        return;
      }
      close();
      savePage(name);
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'Enter') { e.preventDefault(); submit(); }
    }
    document.addEventListener('keydown', onKey);
    root.addEventListener('mousedown', function (e) { if (e.target === root) close(); });
    cancel.addEventListener('click', close);
    ok.addEventListener('click', submit);
  }

  /* Limites de inline: 6 MB por arquivo, 20 MB no total. */
  var MEDIA_INLINE_MAX_FILE = 6 * 1024 * 1024;
  var MEDIA_INLINE_MAX_TOTAL = 20 * 1024 * 1024;

  function inlineMedia(html) {
    if (!html) return Promise.resolve(html);
    var src = '(?:imagens|sons)/[A-Za-z0-9._%~+@-]+(?:/[A-Za-z0-9._%~+@-]+)*';
    var re = new RegExp(src, 'g');
    var matches = html.match(re);
    if (!matches || !matches.length) return Promise.resolve(html);

    var seen = {};
    var unique = [];
    for (var i = 0; i < matches.length; i++) {
      var m = matches[i];
      if (!seen[m]) { seen[m] = true; unique.push(m); }
    }
    if (!unique.length) return Promise.resolve(html);

    var total = 0;
    var skipped = 0;
    var base = APP_BASE.replace(/\/$/, '');

    return unique.reduce(function (chain, rel) {
      return chain.then(function (currentHtml) {
        if (skipped) return currentHtml;
        var url = base + '/' + rel;
        return fetch(url, { cache: 'force-cache' }).then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.blob();
        }).then(function (blob) {
          if (blob.size > MEDIA_INLINE_MAX_FILE) {
            skipped++;
            return currentHtml;
          }
          if (total + blob.size > MEDIA_INLINE_MAX_TOTAL) {
            skipped++;
            return currentHtml;
          }
          total += blob.size;
          return new Promise(function (resolve) {
            var fr = new FileReader();
            fr.onload = function () { resolve(fr.result); };
            fr.onerror = function () { resolve(null); };
            fr.readAsDataURL(blob);
          });
        }).then(function (dataUri) {
          if (!dataUri) return currentHtml;
          return currentHtml.replace(new RegExp(rel.replace(/[.*+?^${}()|[\\]\\]/g, '\\\\$&'), 'g'), dataUri);
        }).catch(function (e) {
          console.warn('[nexus] inlineMedia falhou para', rel, e);
          return currentHtml;
        });
      });
    }, Promise.resolve(html)).then(function (finalHtml) {
      if (skipped) {
        toast('\u26A0 ' + skipped + ' m\u00EDdia(s) ficaram de fora do arquivo salvo (grandes demais)');
      }
      return finalHtml;
    });
  }

  function savePage(rawName, silent) {
    var doc = lastRendered;
    if (!doc) return;
    var named = window.Store.sanitizeName(rawName);
    var promptText = lastPrompt || '';
    saveBtn.disabled = true;
    var existingProject = lastOpenName ? window.Store.sanitizeName(lastOpenName) : null;
    var prepared = existingProject
      ? window.Store.inlineProjectAssets(existingProject, themed(sanitizeSnapshotHtml(doc)))
      : Promise.resolve(themed(sanitizeSnapshotHtml(doc)));
    prepared.then(function (html) {
      return window.Store.saveWithAssets(named, html, promptText);
    }).then(function (saved) {
      saveBtn.disabled = false;
      lastOpenName = saved;
      if (!silent) status('✓ salvo: ' + saved, 'accent', false);
      toast('Salvo em salvos/' + saved);
    }).catch(function (e) {
      saveBtn.disabled = false;
      toast('Falha ao salvar: ' + (e && e.message ? e.message : e));
    });
  }

  function openSavedList() {
    openBtn.disabled = true;
    window.Store.list().then(function (items) {
      openBtn.disabled = false;
      showingList = true;
      var entries = items.map(function (it) {
        return { name: it.name, meta: window.Store.meta(it) };
      });
      render(window.Html.savedListPage(theme, entries));
      status(items.length === 0
        ? 'nada salvo ainda'
        : items.length + ' arquivo(s) em pasta nexus77', '', false);
    }).catch(function (e) {
      openBtn.disabled = false;
      toast('Falha ao listar: ' + (e && e.message ? e.message : e));
    });
  }

  function openSaved(name) {
    window.Store.read(name).then(function (text) {
      if (text == null || !String(text).trim()) {
        toast('Arquivo vazio ou não encontrado');
        return;
      }
      /* Injeta/atualiza <base> para assets resolverem da pasta do projeto. */
      var baseUrl = window.Store.projectBaseUrl(name);
      if (/<base\b/i.test(text)) {
        text = text.replace(/<base\b[^>]*>/i, '<base href="' + baseUrl + '">');
      } else if (/<head[^>]*>/i.test(text)) {
        text = text.replace(/<head[^>]*>/i, function (m) { return m + '<base href="' + baseUrl + '">'; });
      } else if (/<html[^>]*>/i.test(text)) {
        text = text.replace(/<html[^>]*>/i, function (m) { return m + '<head><base href="' + baseUrl + '"></head>'; });
      } else {
        text = '<head><base href="' + baseUrl + '"></head>' + text;
      }
      lastRendered = text;
      lastOpenName = name;   // SALVAR sugere o próprio nome deste arquivo
      showingList = false;
      render(text);
      updateImageUi();
      status('aberto: ' + name, '', false);
    }).catch(function (e) {
      toast('Falha ao abrir: ' + (e && e.message ? e.message : e));
    });
  }

  function closeSavedList() {
    if (lastRendered == null) {
      showWelcome();
      return;
    }
    showingList = false;
    render(themed(lastRendered));
    status('página atual', '', false);
  }

  function pickHtmlFile() {
    var root = el('div', 'mx-modal');
    var card = el('div', 'mx-modal-card mx-modal-small');
    card.appendChild(el('div', 'mx-modal-title', 'Abrir HTML'));
    card.appendChild(el('div', 'mx-msg', 'Escolha um arquivo .html do seu computador.'));

    var picker = document.createElement('input');
    picker.type = 'file';
    picker.accept = '.html,text/html,application/xhtml+xml,text/plain';
    picker.style.display = 'none';
    card.appendChild(picker);

    var row = el('div', 'mx-btnrow');
    var cancel = el('button', 'mx-btn mx-btn-ghost', 'Cancelar');
    cancel.type = 'button';
    var choose = el('button', 'mx-btn mx-btn-inline mx-btn-primary', 'Escolher arquivo…');
    choose.type = 'button';
    row.appendChild(cancel);
    row.appendChild(choose);
    card.appendChild(row);
    root.appendChild(card);
    document.body.appendChild(root);

    function close() {
      document.removeEventListener('keydown', onKey);
      if (root.parentNode) root.parentNode.removeChild(root);
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
    }
    document.addEventListener('keydown', onKey);
    root.addEventListener('mousedown', function (e) { if (e.target === root) close(); });
    cancel.addEventListener('click', close);
    choose.addEventListener('click', function () { picker.click(); });

    picker.addEventListener('change', function () {
      var file = picker.files && picker.files[0];
      close();
      if (!file) return;
      file.text().then(function (text) {
        if (!text || !text.trim()) {
          toast('Arquivo vazio ou não legível');
          return;
        }
        lastRendered = text;
        lastOpenName = file.name || null;   // SALVAR sugere o próprio nome local
        showingList = false;
        render(text);
        status('arquivo local', '', false);
      }).catch(function (e) {
        toast('Falha ao abrir: ' + (e && e.message ? e.message : e));
      });
    });
  }

  function deleteSaved(name) {
    var root = el('div', 'mx-modal');
    var card = el('div', 'mx-modal-card mx-modal-small');
    card.appendChild(el('div', 'mx-modal-title', 'Excluir arquivo'));
    card.appendChild(el('div', 'mx-msg', 'Excluir "' + name + '" de pasta nexus77?'));

    var row = el('div', 'mx-btnrow');
    var cancel = el('button', 'mx-btn mx-btn-ghost', 'Cancelar');
    cancel.type = 'button';
    var ok = el('button', 'mx-btn mx-btn-inline', 'Excluir');
    ok.type = 'button';
    ok.style.color = 'var(--mx-error)';
    row.appendChild(cancel);
    row.appendChild(ok);
    card.appendChild(row);
    root.appendChild(card);
    document.body.appendChild(root);

    function close() {
      document.removeEventListener('keydown', onKey);
      if (root.parentNode) root.parentNode.removeChild(root);
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
    }
    document.addEventListener('keydown', onKey);
    root.addEventListener('mousedown', function (e) { if (e.target === root) close(); });
    cancel.addEventListener('click', close);
    ok.addEventListener('click', function () {
      close();
      window.Store.remove(name).then(function (removed) {
        toast(removed ? 'Excluído' : 'Não foi possível excluir');
        openSavedList();
      }).catch(function (e) {
        toast('Falha ao excluir: ' + (e && e.message ? e.message : e));
      });
    });
  }

  function renameSavedDialog(name) {
    var root = el('div', 'mx-modal');
    var card = el('div', 'mx-modal-card mx-modal-small');
    card.appendChild(el('div', 'mx-modal-title', 'Renomear projeto'));
    card.appendChild(el('div', 'mx-msg', 'Escolha o novo nome para "' + String(name) + '".'));
    var inputName = document.createElement('input');
    inputName.type = 'text';
    inputName.value = String(name || '');
    inputName.maxLength = 80;
    inputName.autocomplete = 'off';
    inputName.className = 'mx-input';
    card.appendChild(inputName);
    var row = el('div', 'mx-btnrow');
    var cancel = el('button', 'mx-btn mx-btn-ghost', 'Cancelar');
    var ok = el('button', 'mx-btn mx-btn-inline mx-btn-primary', 'Renomear');
    cancel.type = ok.type = 'button';
    row.appendChild(cancel); row.appendChild(ok); card.appendChild(row);
    root.appendChild(card); document.body.appendChild(root);
    function close() {
      document.removeEventListener('keydown', onKey);
      if (root.parentNode) root.parentNode.removeChild(root);
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      if (e.key === 'Enter' && document.activeElement === inputName) { e.preventDefault(); ok.click(); }
    }
    document.addEventListener('keydown', onKey);
    root.addEventListener('mousedown', function (e) { if (e.target === root) close(); });
    cancel.addEventListener('click', close);
    ok.addEventListener('click', function () {
      var novo = String(inputName.value || '').trim();
      if (!novo) { inputName.focus(); return; }
      ok.disabled = true;
      window.Store.rename(name, novo).then(function (novoNome) {
        close(); openSavedList(); toast('Renomeado para ' + novoNome);
      }).catch(function (e) {
        ok.disabled = false;
        toast('Erro ao renomear: ' + (e && e.message ? e.message : e));
      });
    });
    inputName.focus(); inputName.select();
  }

  /* ---------- init ---------- */

  var editSelHtml = ''; // HTML do elemento selecionado no modo edição
  var editPopup = null; // popover de edição ativo
  var undoBadge = null; // contador de ações desfazíveis
  var popPinned = false; // popover reposicionado pelo usuário (não segue mais o elemento)
  var popPinPos = null;  // posição fixada pelo usuário

  function editSelReceived(data) {
    if (!data) return;
    var info;
    try { info = JSON.parse(data); } catch (e) { return; }
    if (!info || !info.tag) { closeEditPopup(); return; }
    /* undo/refresh: mantém o popover fechado se ele já estava fechado */
    if (info.refresh && !editPopup) return;
    editSelHtml = info.html || '';
    showEditPopup(info);
  }

  var editInfo = null;

  function frameOffset() {
    try {
      var r = frame.getBoundingClientRect();
      return { left: r.left, top: r.top };
    } catch (e) { return { left: 0, top: 0 }; }
  }

  function positionPopover(pop, rect) {
    var off = frameOffset();
    var pw = pop.offsetWidth || 230;
    var ph = pop.offsetHeight || 280;
    var x = off.left + rect.left + rect.width + 12;
    var y = off.top + rect.top;
    if (x + pw > window.innerWidth - 8) x = off.left + rect.left - pw - 12;
    if (x < 8) x = 8;
    if (y + ph > window.innerHeight - 8) y = window.innerHeight - ph - 8;
    if (y < 8) y = 8;
    pop.style.left = Math.round(x) + 'px';
    pop.style.top = Math.round(y) + 'px';
  }

  function repositionPopover() {
    if (popPinned) return;  /* o usuário já posicionou: não mexer */
    if (editPopup && editInfo && editInfo.rect) positionPopover(editPopup, editInfo.rect);
  }

  function sliderRow(label, min, max, initial, unit, onInput) {
    var wrap = el('div', 'nx-pop-row');
    var v0 = (initial == null || isNaN(Number(initial))) ? Math.round((min + max) / 2) : Math.round(Number(initial));
    v0 = Math.max(min, Math.min(max, v0));
    var lbl = el('div', 'nx-pop-lbl', label + ' · ' + v0 + unit);
    wrap.appendChild(lbl);
    var s = document.createElement('input');
    s.type = 'range';
    s.className = 'nx-pop-range';
    s.min = String(min);
    s.max = String(max);
    s.value = String(v0);
    s.addEventListener('input', function () {
      lbl.textContent = label + ' · ' + s.value + unit;
      onInput(Number(s.value));
    });
    wrap.appendChild(s);
    return wrap;
  }

  /* Linha com <select> — usada pelo seletor de modelo de fonte. */
  function selectRow(label, value, options, onChange) {
    var wrap = el('div', 'nx-pop-row');
    wrap.appendChild(el('div', 'nx-pop-lbl', label));
    var s = document.createElement('select');
    s.className = 'nx-pop-select';
    for (var i = 0; i < options.length; i++) {
      var o = document.createElement('option');
      o.value = options[i][0];
      o.textContent = options[i][1];
      s.appendChild(o);
    }
    if (value) {
      var found = false;
      for (var j = 0; j < options.length; j++) if (options[j][0] === value) found = true;
      if (!found) {
        var oo = document.createElement('option');
        oo.value = value;
        oo.textContent = 'atual: ' + String(value).slice(0, 28);
        s.appendChild(oo);
      }
      s.value = value;
    }
    s.addEventListener('change', function () { onChange(s.value); });
    wrap.appendChild(s);
    return wrap;
  }

  function hexToRgb(h) {
    var m = /^#?([0-9a-fA-F]{6})$/.exec(h || '');
    if (!m) return { r: 0, g: 0, b: 0 };
    var n = parseInt(m[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  /* Monta o valor CSS: hex quando opaco, rgba quando tem transparência. */
  function cssColor(hex, alpha) {
    if (alpha >= 1) return hex;
    var c = hexToRgb(hex);
    return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + alpha.toFixed(2) + ')';
  }

  function colorRow(label, initial, initialAlpha, onInput) {
    var wrap = el('div', 'nx-pop-row');
    var hdr = el('div', 'nx-pop-lbl', label);
    wrap.appendChild(hdr);

    var line = el('div', 'nx-pop-colorline');
    var v0 = (initial && /^#[0-9a-fA-F]{6}$/.test(initial)) ? initial : '#000000';
    var a0 = (initialAlpha == null || isNaN(Number(initialAlpha))) ? 1 : Math.max(0, Math.min(1, Number(initialAlpha)));

    var picker = document.createElement('input');
    picker.type = 'color';
    picker.className = 'nx-pop-color';
    picker.value = v0;

    var hex = document.createElement('input');
    hex.type = 'text';
    hex.className = 'nx-pop-hex';
    hex.value = v0;

    line.appendChild(picker);
    line.appendChild(hex);
    wrap.appendChild(line);

    /* --- transparência --- */
    var aLbl = el('div', 'nx-pop-lbl', 'Transparência · ' + Math.round((1 - a0) * 100) + '%');
    wrap.appendChild(aLbl);
    var aBar = document.createElement('input');
    aBar.type = 'range';
    aBar.className = 'nx-pop-range';
    aBar.min = '0';
    aBar.max = '100';
    aBar.value = String(Math.round(a0 * 100));
    wrap.appendChild(aBar);

    var curHex = v0;
    var curA = a0;

    function emit() {
      aLbl.textContent = 'Transparência · ' + Math.round((1 - curA) * 100) + '%';
      onInput(cssColor(curHex, curA));
    }

    picker.addEventListener('input', function () {
      curHex = picker.value;
      hex.value = picker.value;
      emit();
    });
    hex.addEventListener('change', function () {
      if (/^#[0-9a-fA-F]{6}$/.test(hex.value)) {
        curHex = hex.value;
        picker.value = hex.value;
        emit();
      }
    });
    aBar.addEventListener('input', function () {
      curA = Number(aBar.value) / 100;
      emit();
    });

    return wrap;
  }

  function removePopupDom() {
    if (editPopup) {
      document.removeEventListener('keydown', editPopupKey);
      window.removeEventListener('resize', repositionPopover);
      window.removeEventListener('scroll', repositionPopover, true);
      if (editPopup.parentNode) editPopup.parentNode.removeChild(editPopup);
      editPopup = null;
      undoBadge = null;
    }
  }

  function showEditPopup(info) {
    /* Só remove o popover antigo — NÃO desseleciona (a seleção continua no iframe). */
    removePopupDom();
    editInfo = info;

    var tag = info.tag || 'div';
    var isText = !!info.text;
    var st = info.styles || {};
    var rect = info.rect || { left: 0, top: 0, width: 0, height: 0 };

    var pop = el('div', 'nx-pop');
    pop.id = 'nx-pop';

    /* cabeçalho */
    var head = el('div', 'nx-pop-head');
    var hleft = el('div', 'nx-pop-left');
    hleft.appendChild(el('span', 'nx-pop-grip', '⠿'));
    var ttl = '<' + tag + '>';
    if (info.depth) ttl += '  ' + info.depth;
    hleft.appendChild(el('span', 'nx-pop-tag', ttl));
    head.appendChild(hleft);
    undoBadge = el('span', 'nx-pop-badge', '↩ 0');
    head.appendChild(undoBadge);
    var x = el('button', 'nx-pop-x', '✕');
    x.type = 'button';
    x.title = 'Fechar';
    x.addEventListener('click', closeEditPopup);
    head.appendChild(x);

    /* arrastar o popover pela alça / cabeçalho */
    head.addEventListener('mousedown', function (e) {
      if (e.target === x || x.contains(e.target)) return;
      if (e.target === undoBadge) return;
      e.preventDefault();
      var r = pop.getBoundingClientRect();
      var ox = e.clientX - r.left, oy = e.clientY - r.top;
      function mm(ev) {
        popPinned = true;
        var nl = Math.max(0, Math.min(window.innerWidth - 60, ev.clientX - ox));
        var nt = Math.max(0, Math.min(window.innerHeight - 30, ev.clientY - oy));
        pop.style.left = nl + 'px';
        pop.style.top = nt + 'px';
        popPinPos = { left: nl + 'px', top: nt + 'px' };
      }
      function mu() {
        document.removeEventListener('mousemove', mm);
        document.removeEventListener('mouseup', mu);
      }
      document.addEventListener('mousemove', mm);
      document.addEventListener('mouseup', mu);
    });

    pop.appendChild(head);

    var body = el('div', 'nx-pop-body');

    if (isText) {
      /* --- TEXTO: conteúdo, fonte, cor --- */
      body.appendChild(el('div', 'nx-pop-lbl', 'Texto'));
      var ta = document.createElement('textarea');
      ta.className = 'nx-pop-text';
      ta.rows = 2;
      ta.value = info.txt || '';
      ta.addEventListener('input', function () { tryPostMessage({ setText: ta.value }); });
      body.appendChild(ta);

      body.appendChild(selectRow('Modelo', matchFont(st.fontFam), fontOptions(), function (v) {
        tryPostMessage({ applyStyle: { fontFamily: v || '' } });
      }));
      body.appendChild(sliderRow('Fonte', 8, 120, st.fontSize, 'px', function (v) {
        tryPostMessage({ applyStyle: { fontSize: v + 'px' } });
      }));
      body.appendChild(colorRow('Cor', st.color, st.colorA, function (v) {
        tryPostMessage({ applyStyle: { color: v } });
      }));
    } else if (info.svg) {
      /* --- SVG: preenchimento + contorno (SVG não usa color/background) --- */
      body.appendChild(colorRow('Preenchimento', st.fill, st.fillA, function (v) {
        tryPostMessage({ applyStyle: { fill: v } });
      }));
      body.appendChild(colorRow('Contorno', st.stroke, st.strokeA, function (v) {
        tryPostMessage({ applyStyle: { stroke: v } });
      }));
      body.appendChild(sliderRow('Largura', 10, 1600, st.width, 'px', function (v) {
        tryPostMessage({ resize: { w: v } });
      }));
      body.appendChild(sliderRow('Altura', 10, 1200, st.height, 'px', function (v) {
        tryPostMessage({ resize: { h: v } });
      }));
    } else if (info.canvas) {
      /* --- CANVAS: conteúdo é pixel, não elementos --- */
      body.appendChild(el('div', 'nx-pop-note',
        'Isto é um <canvas> (jogo/WebGL): o conteúdo é pixel, não elementos. ' +
        'Dá pra mudar fundo e tamanho aqui — para mudanças visuais internas, use a IA abaixo.'));
      body.appendChild(colorRow('Fundo', st.background, st.backgroundA, function (v) {
        tryPostMessage({ applyStyle: { background: v } });
      }));
      body.appendChild(sliderRow('Largura', 10, 2400, st.width, 'px', function (v) {
        tryPostMessage({ resize: { w: v } });
      }));
      body.appendChild(sliderRow('Altura', 10, 1800, st.height, 'px', function (v) {
        tryPostMessage({ resize: { h: v } });
      }));
    } else {
      /* --- OBJETO: cor (fundo visível) + tamanho --- */
      body.appendChild(colorRow('Cor', st.background, st.backgroundA, function (v) {
        tryPostMessage({ applyStyle: { background: v } });
      }));
      body.appendChild(sliderRow('Largura', 10, 1600, st.width, 'px', function (v) {
        tryPostMessage({ resize: { w: v } });
      }));
      body.appendChild(sliderRow('Altura', 10, 1200, st.height, 'px', function (v) {
        tryPostMessage({ resize: { h: v } });
      }));
    }

    /* --- entrar dentro (quando há camadas sobrepostas) --- */
    if (info.depth && info.depth.indexOf('/') >= 0) {
      var drillBtn = el('button', 'nx-pop-btn', '▾ Entrar dentro');
      drillBtn.type = 'button';
      drillBtn.title = 'Selecionar o elemento abaixo desta camada';
      drillBtn.addEventListener('click', function () {
        tryPostMessage({ drill: true });
      });
      body.appendChild(drillBtn);
      body.appendChild(el('div', 'nx-pop-hint', 'Ctrl+clique ou clique repetido desce de camada'));
    }

    /* --- mover / redimensionar --- */
    body.appendChild(el('div', 'nx-pop-hint', '🖐 Arraste para mover · arraste as bordas para redimensionar'));

    /* --- desfazer --- */
    var undoBtn = el('button', 'nx-pop-btn', '↩ Desfazer   (Ctrl+Z)');
    undoBtn.type = 'button';
    undoBtn.addEventListener('click', function () { tryPostMessage({ undo: true }); });
    body.appendChild(undoBtn);

    /* --- pedir pra IA --- */
    body.appendChild(el('div', 'nx-pop-sep'));
    var ai = document.createElement('textarea');
    ai.className = 'nx-pop-text';
    ai.rows = 2;
    ai.placeholder = 'Pedir alteração pra IA…';
    var aiBtn = el('button', 'nx-pop-btn nx-pop-primary', '🤖 Enviar pra IA');
    aiBtn.type = 'button';
    function sendAI() {
      var msg = ai.value.trim();
      if (!msg) { toast('Descreva a alteração'); return; }
      input.value = 'No elemento <' + tag + '>: ' + msg;
      sendPrompt();
      closeEditPopup();
    }
    aiBtn.addEventListener('click', sendAI);
    ai.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); sendAI(); }
    });
    body.appendChild(ai);
    body.appendChild(aiBtn);

    /* --- excluir --- */
    var del = el('button', 'nx-pop-btn nx-pop-danger', '🗑 Excluir');
    del.type = 'button';
    del.addEventListener('click', function () {
      tryPostMessage({ deleteEl: true });
      closeEditPopup();
    });
    body.appendChild(del);

    pop.appendChild(body);
    document.body.appendChild(pop);
    /* se o usuário já fixou uma posição, mantém; senão ancora ao lado do elemento */
    if (popPinned && popPinPos) {
      pop.style.left = popPinPos.left;
      pop.style.top = popPinPos.top;
    } else {
      positionPopover(pop, rect);
    }

    editPopup = pop;
    document.addEventListener('keydown', editPopupKey);
    window.addEventListener('resize', repositionPopover);
    window.addEventListener('scroll', repositionPopover, true);
  }

  /* Fechar explicitamente (✕ / ESC / clicar fora): remove e desseleciona no iframe. */
  function closeEditPopup() {
    removePopupDom();
    editInfo = null;
    tryPostMessage({ deselect: true });
  }

  function editPopupKey(e) {
    if (e.key === 'Escape') closeEditPopup();
  }

  /* Recebe o HTML editado do iframe e grava como documento canônico. */
  function applySnapshot(html) {
    if (!html) return;
    var clean = sanitizeSnapshotHtml(html);
    /* remove TODOS os blocos de tema (são reaplicados no render pelo themed()) */
    var mk = '<style id="nx77-base">';
    var i;
    while ((i = clean.indexOf(mk)) >= 0) {
      var j = clean.indexOf('</style>', i);
      if (j < 0) break;
      clean = clean.slice(0, i) + clean.slice(j + 8);
    }
    lastRendered = clean;
    editCount = 0;
    editSelHtml = '';
    status('✔ Edições salvas na página', 'accent', true);
  }

  /* Se o provedor cortar a resposta (finish_reason=length ou HTML sem </html>),
     pede a continuação e emenda — sem isso o jogo chega incompleto e a tela fica preta. */
  var MAX_CONTINUACOES = 12;   /* quantas vezes pedimos a continuação de um documento cortado */

  function completarSeTruncado(res, doc, tentativa) {
    tentativa = tentativa || 0;
    var texto = String(res && res.content ? res.content : doc || '');
    var corpo = String(doc || '');
    var cortou = (res && res.finishReason === 'length');
    var fechado = /<\/html>\s*$/i.test(corpo.trim());
    var scriptsOk = (corpo.match(/<script/gi) || []).length === (corpo.match(/<\/script>/gi) || []).length;
    /* Só para quando o documento está realmente fechado; finish_reason='length'
       pode chegar com o HTML já completo (o modelo só parou de falar).
       Um <script> sem </script> NÃO conta como fechado — era assim que o
       documento parava com o JS pela metade e o jogo não desenhava nada. */
    if (fechado && scriptsOk) return Promise.resolve(corpo);
    if (tentativa >= MAX_CONTINUACOES) {
      status('⚠️ documento ainda incompleto após ' + tentativa + ' continuações', 'accent', false);
      return Promise.resolve(corpo);
    }
    status('⚠️ resposta cortada — completando (' + (tentativa + 1) + ')…', 'accent', false);
    var cauda = corpo.slice(-8000);
    var pedido = 'You are CONTINUING an HTML document that was cut off mid-way. Output ONLY the remaining raw HTML, starting exactly at the cut point, until the document is properly closed (</body></html>). Never repeat what was already sent, never explain, no markdown fences.';
    var msg = 'The document was cut here. Continue from the exact next character:\n```html\n' + cauda + '\n```';
    return window.AiClient.chat(
      prefs.endpoint(), prefs.apiKey(), prefs.model(),
      prefs.temperature(), prefs.maxTokens(), pedido, msg, marcarProgresso
    ).then(function (r2) {
      var resto = String(r2.content || '');
      if (!resto.trim()) return corpo;                 /* nada veio: para */
      var low = resto.toLowerCase();
      var j = low.indexOf('<!doctype');
      var k = low.indexOf('<html');
      var cortes = [j, k].filter(function (v) { return v >= 0; });
      if (cortes.length) resto = resto.slice(Math.min.apply(null, cortes));
      resto = resto.replace(/^\s*```html\s*/i, '').replace(/```\s*$/, '');
      /* Sem whitespace à esquerda: evita quebrar uma tag partida ao meio. */
      resto = resto.replace(/^\s+/, '');
      /* Concatena SEM inserir nada: o corte pode ter sido no meio de uma tag
         (ex.: "</scr" + "ipt>") e qualquer whitespace extra quebraria o HTML. */
      var emendado = corpo + resto;
      if (emendado === corpo) return corpo;            /* nada novo: evita loop */
      return completarSeTruncado(r2, emendado, tentativa + 1);
    }).catch(function (e) {
      /* Cancelado pelo usuário: propaga para a geração terminar sem renderizar meia página. */
      if (canceladoPeloUsuario) throw e;
      return corpo;
    });
  }

  function tryPostMessage(data) {
    try {
      if (frame && frame.contentWindow) {
        frame.contentWindow.postMessage(data, '*');
      }
    } catch (e) { /* ignora */ }
  }

  function init() {
    frame = $('frame');
    input = $('prompt');
    gearBtn = $('btn-gear');
    saveBtn = $('btn-save');
    openBtn = $('btn-open');
    statusEl = $('status');
    kbLabel = $('kb');
    libsEl = $('libs');
    previewBadge = $('nx-preview');
    dot = $('dot');
    usageBtn = $('btn-usage');
    usagePanel = $('usage');
    usageModel = $('usage-model');
    usageFill = $('usage-fill');
    usageSession = $('usage-session');
    usageStats = $('usage-stats');
    usageClose = $('usage-close');
    resetBtn = $('btn-reset');
    editBtn = $('btn-edit');
    finalizeBtn = $('btn-finalize');
    imageBtn = $('btn-image');
    imageFileInput = $('imagefile');
    imgAttach = $('imgattach');
    imgThumb = $('imgthumb');
    imgName = $('imgname');
    imgSub = $('imgsub');
    imgState = $('imgstate');
    imgRemove = $('img-remove');

    vu = window.VuMeter.attach($('vu'));

    /* Carrega fontes e mídia do projeto para o prompt. */
    loadFonts();
    loadMedia();

    gearBtn.addEventListener('click', function () {
      window.Settings.open({ onSaved: onSettingsSaved });
    });
    saveBtn.addEventListener('click', requestSave);
    openBtn.addEventListener('click', openSavedList);
    resetBtn.addEventListener('click', resetSession);

    imageBtn.addEventListener('click', function () {
      if (generating || imageBusy) return;
      try { imageFileInput.value = ''; } catch (e) { /* ignora */ }
      imageFileInput.click();
    });
    imageFileInput.addEventListener('change', function () {
      var file = imageFileInput.files && imageFileInput.files[0];
      if (file) chooseImage(file);
    });
    imgRemove.addEventListener('click', function () { clearImageAttachment(false); });

    /* ESC cancela a geração em andamento. */
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (!generating) return;
      if (document.querySelector('.mx-modal')) return;   /* modal aberto: ESC fecha o modal */
      e.preventDefault();
      canceladoPeloUsuario = true;                        /* AbortError não sobrescreve esta mensagem */
      try { window.AiClient.cancel(); } catch (_) {}
      finishGeneration();
      status('✗ geração cancelada', 'error', false);
      toast('Geração cancelada');
    });
    usageBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      setUsage(usagePanel.hidden);
    });
    usageClose.addEventListener('click', function () { setUsage(false); });
    document.addEventListener('click', function (e) {
      if (usagePanel.hidden) return;
      var t = e.target;
      if (usagePanel.contains(t) || usageBtn.contains(t)) return;
      setUsage(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !usagePanel.hidden) setUsage(false);
    });
    editBtn.addEventListener('click', function () {
      if (!lastRendered) { toast('Gere uma página primeiro'); return; }
      editMode = true;
      popPinned = false;
      popPinPos = null;
      editBtn.style.display = 'none';
      loadFonts();
      loadMedia();
      finalizeBtn.style.display = '';
      status('✎ Clique p/ selecionar · duplo clique p/ editar valores · arraste p/ mover', 'accent', false);
      tryPostMessage({ accent: theme.accent, editMode: true });
    });
    finalizeBtn.addEventListener('click', function () {
      editMode = false;
      closeEditPopup();
      loadFonts(function () {
        toast('Fontes atualizadas (' + fontList.length + ' disponíveis)');
      });
      loadMedia();
      /* captura o HTML editado ANTES de descongelar (vira o documento oficial) */
      tryPostMessage({ snapshot: true });
      finalizeBtn.style.display = 'none';
      editBtn.style.display = '';
      tryPostMessage({ editMode: false });
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        sendPrompt();
      }
    });
    /* Ctrl+Z / Cmd+Z: desfaz edição visual OU geração da IA */
    document.addEventListener('keydown', function (e) {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey) return;
      if (String(e.key).toLowerCase() !== 'z') return;
      var ae = document.activeElement;
      var tg = ae && ae.tagName ? ae.tagName.toUpperCase() : '';
      if (tg === 'INPUT' || tg === 'TEXTAREA') return;   /* deixa o undo nativo do campo */
      if (editMode || editPopup) {
        e.preventDefault();
        tryPostMessage({ undo: true });
        return;
      }
      /* Fora do modo edição: Ctrl+Z desfaz a última geração da IA */
      e.preventDefault();
      undoGen();
    });

    /* Bridge exposta às páginas do iframe (window.Nexus77). */
    window.MxShell = {
      setInput: function (text) {
        input.value = String(text == null ? '' : text);
        input.focus();
        var n = input.value.length;
        try { input.setSelectionRange(n, n); } catch (e) { /* ignora */ }
      },
      openSaved: function (name) { openSaved(String(name)); },
      closeList: function () { closeSavedList(); },
      pickFile: function () { pickHtmlFile(); },
      deleteSaved: function (name) { deleteSaved(String(name)); },
      renameSaved: function (json) {
        try {
          var d = JSON.parse(json);
          if (!d || !d.name) throw new Error('projeto sem nome');
          if (d.novo) {
            window.Store.rename(d.name, d.novo).then(function (novoNome) {
              openSavedList(); toast('Renomeado para ' + novoNome);
            }).catch(function (e) { toast('Erro ao renomear: ' + (e.message || e)); });
          } else {
            renameSavedDialog(String(d.name));
          }
        } catch (e) { toast('Erro ao renomear'); }
      },
      duplicateSaved: function (name) {
        window.Store.duplicate(String(name)).then(function(novoNome){ openSavedList(); toast('Duplicado como ' + novoNome); }).catch(function(e){ toast('Erro: ' + (e.message||e)); });
      },
      openUrl: function (url) {
        try { window.open(String(url), '_blank', 'noopener'); } catch (e) { /* ignora */ }
      }
    };

    /* Recebe as chamadas da página (shim postMessage) — whitelist. */
    var BRIDGE_METHODS = {
      setInput: true, openSaved: true, closeList: true,
      pickFile: true, deleteSaved: true, openUrl: true, editSel: true,
      renameSaved: true, duplicateSaved: true
    };
    window.addEventListener('message', function (e) {
      var d = e.data;
      if (!d || d.__nx !== 1) return;
      if (e.source !== frame.contentWindow) return;
      var m = String(d.m || '');
      if (m === 'editSel') {
        try { editSelReceived(d.a); } catch (err) { /* ignora */ }
        return;
      }
      if (m === 'snapshot') {
        try { applySnapshot(d.a); } catch (err) { /* ignora */ }
        return;
      }
      if (m === 'capture') {
        try {
          var cap = JSON.parse(String(d.a || '{}'));
          if (pendingCapture && String(cap.id) === pendingCapture.id) {
            pendingCapture.finish(cap.ok && cap.url ? String(cap.url) : null);
          }
        } catch (err) { /* ignora */ }
        return;
      }
      if (m === 'errors') {
        /* Lista cumulativa enviada pelo shim; guarda a versão mais nova e completa. */
        try {
          var list = JSON.parse(String(d.a || '[]'));
          if (Array.isArray(list)) frameErrors = list.slice(0, 40);
        } catch (err) { /* ignora */ }
        return;
      }
      if (m === 'undoCount') {
        if (undoBadge) undoBadge.textContent = '↩ ' + String(d.a || '0');
        return;
      }
      if (m === 'editClose') {
        removePopupDom();
        editInfo = null;
        return;
      }
      if (m === 'undoGen') {
        undoGen();
        return;
      }
      if (m === 'editDragging') {
        if (editPopup) {
          if (String(d.a) === '1') {
            editPopup.style.display = 'none';
          } else {
            editPopup.style.display = '';
            repositionPopover();
          }
        }
        return;
      }
      if (!BRIDGE_METHODS[m]) return;
      var shell = window.MxShell;
      if (shell && typeof shell[m] === 'function') {
        try { shell[m](d.a); } catch (err) { /* ignora */ }
      }
    });

    theme = window.Themes.of(0);
    applyTheme();
    updateImageUi();
    showWelcome();

    if (window.console) {
      console.log('NEXUS GAME · ai-client v' + (window.AiClient ? window.AiClient.VERSION : '?') +
        ' · origem ' + location.origin);
    }

    if (location.protocol === 'file:') {
      /* Auto-redireciona para o servidor local */
      var serverUrl = 'http://127.0.0.1:8790/';
      var x = new XMLHttpRequest();
      x.open('GET', serverUrl, true);
      x.timeout = 3000;
      x.onload = function () {
        if (x.status === 200) {
          window.location.href = serverUrl;
        }
      };
      x.onerror = x.ontimeout = function () {
        toast('Sirva por http://127.0.0.1:8790 — abra pelo atalho NEXUS GAME');
      };
      try { x.send(); } catch (e) { /* ignora */ }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

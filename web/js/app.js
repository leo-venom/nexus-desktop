/* ============================================================
 * app.js — port de MainActivity.kt para o navegador.
 * Fluxo: prompt -> AiClient.chat -> Html.extractDocument ->
 * decorate -> iframe (srcdoc). Sessão, salvar/abrir/excluir,
 * temas e bridge window.Nexus77 -> window.MxShell.
 * ============================================================ */
(function () {
  'use strict';

  var prefs = window.Prefs;
  var theme = window.Themes.of(prefs.themeIndex());
  var lastThemeIndex = prefs.themeIndex();

  var lastRendered = null;   // documento canônico (CSS com CDN, sem rewrite)
  var lastPrompt = null;
  var lastOpenName = null;   // arquivo aberto (lista local) → base do nome sugerido no SALVAR
  var generating = false;
  var showingList = false;
  var editCount = 0;        // patches consecutivos na mesma página
  var MAX_EDITS = 0;        // 0 = sem limite (nunca força regeneração por contagem)

  var liveActive = false;
  var liveIn = 0;
  var liveOut = 0;
  var lastProgressAt = 0;

  var APP_BASE = new URL('./', location.href).href;
  var THREE_CDN = 'https://unpkg.com/three@0.160.0/build/';

  var USAGE_PERIODS = [
    ['hour', 'Última hora'],
    ['day', 'Últimas 24 h'],
    ['week', 'Últimos 7 dias'],
    ['month', 'Últimos 30 dias']
  ];

  var frame, input, gearBtn, saveBtn, openBtn, statusEl, kbLabel;
  var dot, resetBtn, vu;
  var usageBtn, usagePanel, usageModel, usageFill, usageSession, usageStats, usageClose;
  var editBtn, finalizeBtn;
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
    'function rgb2hex(c){if(!c)return"#000000";var m=c.match(/\\d+/g);if(!m||m.length<3)return c.charAt(0)==="#"?c:"#000000";' +
    'var h=function(n){var s=parseInt(n,10).toString(16);return s.length<2?"0"+s:s};return"#"+h(m[0])+h(m[1])+h(m[2])}' +
    'function alphaOf(c){if(!c)return 1;var m=c.match(/rgba?\\(([^)]+)\\)/);if(!m)return 1;var p=m[1].split(",");return p.length>=4?Math.max(0,Math.min(1,parseFloat(p[3]))):1}' +
    'var _ed={on:false,el:null,drag:false};' +
    'var _accent="#00E5FF";' +
    'var _raf=window.requestAnimationFrame.bind(window),_caf=window.cancelAnimationFrame.bind(window);' +
    'var _frozen=[];' +
    'window.requestAnimationFrame=function(cb){return _raf(function(t){if(_ed.on){_frozen.push(cb)}else{try{cb(t)}catch(e){}}})};' +
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
    'if(!_ed.on)return;' +
    'e.preventDefault();e.stopPropagation();doUndo()},true);' +
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

  function render(html) {
    var out = window.Html.rewriteLibs(String(html == null ? '' : html), APP_BASE);
    frame.srcdoc = injectShim(out);
    /* Foca o iframe para teclado funcionar sem clique */
    setTimeout(function () {
      try { frame.contentWindow.focus(); } catch (e) { frame.focus(); }
    }, 50);
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

  function onGenProgress(contentBytes) {
    var now = performance.now();
    if (now - lastProgressAt < 60) return;
    lastProgressAt = now;
    kbLabel.textContent = kbText(contentBytes);
    liveOut = Math.floor(contentBytes / 4);
    updateSessionUi();
  }

  function sendPrompt() {
    if (generating) return;
    var prompt = input.value.trim();
    if (!prompt) {
      toast('Descreva o que você quer ver');
      return;
    }
    if (!prefs.hasKey()) {
      toast('Configure sua API key em ⚙');
      window.Settings.open({ onSaved: onSettingsSaved });
      return;
    }

    generating = true;
    showingList = false;
    lastPrompt = prompt;
    lastOpenName = null;   // nova geração → o nome sugerido volta ao slug do prompt
    saveBtn.disabled = true;
    openBtn.disabled = true;
    status(lastRendered != null ? 'ajustando…' : 'gerando…', 'accent', false);
    setLoading(true);
    input.blur();

    var editing = lastRendered != null;
    var baseSystem = window.Html.systemPrompt(theme, prefs.detailLevel(), prompt);
    var elementHint = '';
    if (editSelHtml) {
      elementHint = '\n\nTarget element (user clicked this to edit):\n```html\n' + editSelHtml + '\n```\nFocus ONLY on this element. Change what was asked, keep the rest intact.';
      editSelHtml = '';
    }
    var userBase = prompt + elementHint;
    var user = window.Html.userPrompt(userBase, lastRendered);
    var userFresh = userBase;  // fallback: só o comando, sem página atual

    /* Força regeneração completa a cada MAX_EDITS patches para evitar degradação */
    var editOverLimit = MAX_EDITS > 0 && editing && editCount >= MAX_EDITS;
    if (editOverLimit) {
      toast('Regenerando página completa — ' + editCount + ' patches atingido');
      editCount = 0;
    }
    var system = editOverLimit ? baseSystem : editing ? baseSystem + window.Html.EDIT_DIRECTIVE : baseSystem;
    if (!editing) editCount = 0;

    function run(systemPrompt, userMessage) {
      var msg = userMessage == null ? user : userMessage;
      return window.AiClient.chat(
        prefs.endpoint(), prefs.apiKey(), prefs.model(),
        prefs.temperature(), prefs.maxTokens(), systemPrompt, msg, onGenProgress
      );
    }

    var encoder = new TextEncoder();
    liveActive = true;
    liveIn = Math.floor((encoder.encode(system).length + encoder.encode(user).length) / 4);
    liveOut = 0;
    lastProgressAt = 0;
    updateSessionUi();
    var started = performance.now();

    run(system).then(function (result) {
      if (editing) {
        /* Edição cirúrgica: aplica só os trechos pedidos (não reescreve a página). */
        var patched = window.Html.applyEdits(lastRendered, result.content);
        if (patched.ok) { editCount++; return { result: result, doc: patched.html }; }
        editCount = 0;
        if (window.Html.looksLikeDocument(result.content)) {
          return { result: result, doc: window.Html.extractDocument(result.content) };
        }
        /* Patch inválido: refaz pedindo o documento completo (fallback seguro). */
        status('⚠️ regenerando…', 'accent', false);
        liveOut = 0;
        lastProgressAt = 0;
        editCount = 0;
        return run(baseSystem, userFresh).then(function (r2) {
          return { result: r2, doc: window.Html.extractDocument(r2.content) };
        });
      }
      editCount = 0;
      return { result: result, doc: window.Html.extractDocument(result.content) };
    }).then(function (out) {
      return completarSeTruncado(out.result, out.doc).then(function (d) { out.doc = d; return out; });
    }).then(function (out) {
      var result = out.result;
      var doc = out.doc;
      var elapsed = (performance.now() - started) / 1000;
      if (!doc.trim()) {
        failGeneration('resposta vazia do modelo');
        return;
      }
      lastRendered = doc;
      render(themed(doc));
      var kb = Math.ceil(encoder.encode(doc).length / 1024);
      liveActive = false;
      if (result.totalTokens > 0) {
        prefs.addSessionTokens(result.promptTokens, result.completionTokens);
        prefs.addUsage(result.promptTokens, result.completionTokens);
        updateSessionUi();
      }
      status('✓ ' + kb + ' KB • ' + elapsed.toFixed(1) + 's', '', true);
      input.value = '';
      input.blur();
      finishGeneration();
    }).catch(function (e) {
      failGeneration(window.AiClient.errorMessage(e));
    });
  }

  function failGeneration(message) {
    status('✗ ' + message, 'error', false);
    if (lastRendered == null) {
      render(window.Html.errorPage(theme, 'Falha na geração', message));
    }
    toast(message);
    finishGeneration();
  }

  function finishGeneration() {
    generating = false;
    saveBtn.disabled = false;
    openBtn.disabled = false;
    liveActive = false;
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
      toast('Aguarde a geração atual terminar');
      return;
    }
    prefs.resetSessionTokens();
    lastRendered = null;
    updateSessionUi();
    showWelcome();
    toast('Sessão reiniciada');
  }

  function onSettingsSaved() {
    var changed = prefs.themeIndex() !== lastThemeIndex;
    theme = window.Themes.of(prefs.themeIndex());
    lastThemeIndex = prefs.themeIndex();
    applyTheme();
    if (lastRendered == null) {
      showWelcome();
    } else if (changed) {
      render(themed(lastRendered));
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
    showSaveDialog();
  }

  function showSaveDialog() {
    window.Store.folderLabel().then(function (folder) {
      var root = el('div', 'mx-modal');
      var card = el('div', 'mx-modal-card mx-modal-small');
      card.appendChild(el('div', 'mx-modal-title', 'Salvar página'));
      card.appendChild(el('div', 'mx-path', 'Pasta: ' + (folder || 'nexus77')));
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
    }).catch(function (e) {
      toast('Falha ao salvar: ' + (e && e.message ? e.message : e));
    });
  }

  function savePage(rawName) {
    var doc = lastRendered;
    if (!doc) return;
    var html = themed(sanitizeSnapshotHtml(doc));
    var name = window.Store.fileName(rawName);
    saveBtn.disabled = true;
    window.Store.folderLabel().then(function (folder) {
      /* Primeiro save: pede a pasta (o clique em "Salvar" dá a ativação). */
      if (!folder && window.Store.supportsFolder()) {
        return window.Store.pickFolder().then(function () { return true; }).catch(function () { return false; });
      }
      return true;
    }).then(function () {
      return Promise.all([window.Store.save(name, html), window.Store.folderLabel()]);
    }).then(function (res) {
      saveBtn.disabled = false;
      var saved = res[0];
      var folder = res[1] || 'pasta nexus77';
      status('✓ salvo: ' + saved, 'accent', false);
      toast('Salvo em ' + folder + '/' + saved);
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
      lastRendered = text;
      lastOpenName = name;   // SALVAR sugere o próprio nome deste arquivo
      showingList = false;
      render(text);
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
    /* Só para quando o documento está realmente fechado; finish_reason='length'
       pode chegar com o HTML já completo (o modelo só parou de falar). */
    if (fechado) return Promise.resolve(corpo);
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
      prefs.temperature(), prefs.maxTokens(), pedido, msg
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
    }).catch(function () { return corpo; });
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

    vu = window.VuMeter.attach($('vu'));

    gearBtn.addEventListener('click', function () {
      window.Settings.open({ onSaved: onSettingsSaved });
    });
    saveBtn.addEventListener('click', requestSave);
    openBtn.addEventListener('click', openSavedList);
    resetBtn.addEventListener('click', resetSession);
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
    /* Ctrl+Z / Cmd+Z: desfaz a última ação de edição */
    document.addEventListener('keydown', function (e) {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey) return;
      if (String(e.key).toLowerCase() !== 'z') return;
      var ae = document.activeElement;
      var tg = ae && ae.tagName ? ae.tagName.toUpperCase() : '';
      if (tg === 'INPUT' || tg === 'TEXTAREA') return;   /* deixa o undo nativo do campo */
      if (!editMode && !editPopup) return;
      e.preventDefault();
      tryPostMessage({ undo: true });
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
      openUrl: function (url) {
        try { window.open(String(url), '_blank', 'noopener'); } catch (e) { /* ignora */ }
      }
    };

    /* Recebe as chamadas da página (shim postMessage) — whitelist. */
    var BRIDGE_METHODS = {
      setInput: true, openSaved: true, closeList: true,
      pickFile: true, deleteSaved: true, openUrl: true, editSel: true
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
      if (m === 'undoCount') {
        if (undoBadge) undoBadge.textContent = '↩ ' + String(d.a || '0');
        return;
      }
      if (m === 'editClose') {
        removePopupDom();
        editInfo = null;
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

    lastThemeIndex = prefs.themeIndex();
    theme = window.Themes.of(lastThemeIndex);
    applyTheme();
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

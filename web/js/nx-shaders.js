/* ============================================================
 * nx-shaders.js — Biblioteca de shaders GLSL (v2)
 * ============================================================
 * 28 shaders prontos + 7 trechos GLSL reutilizáveis (noise,
 * fbm, voronoi, hash, rotate, hsv, palette).
 *
 * Compatível com THREE.ShaderMaterial (GLSL ES 1.00 / WebGL1).
 * Offline: tudo inline aqui, sem fetch e sem CDN.
 *
 * API global `NxShader`:
 *   NxShader.get(nome)            → { vertex, fragment, uniforms, category, ... }
 *   NxShader.names()              → lista ordenada de shaders
 *   NxShader.categories()         → lista de categorias
 *   NxShader.byCategory(cat)      → shaders da categoria
 *   NxShader.info(nome)           → metadados (sem o código)
 *   NxShader.raw(nome)            → fragment source completo (com trechos)
 *   NxShader.chunk(nome)          → trecho GLSL isolado
 *   NxShader.chunks()             → lista de trechos
 *   NxShader.threeMat(nome, opts) → THREE.ShaderMaterial configurado
 *   NxShader.updateTime(mat, t)   → avança o uniform de tempo
 *
 * Uniforms que TODOS os materiais recebem (use só os que precisar):
 *   time / uTime  float   tempo em segundos
 *   uColor        vec3    cor principal
 *   uColor2       vec3    cor secundária
 *   uEdgeColor    vec3    cor de borda/destaque
 *   uResolution   vec2    tamanho em pixels
 *   uProgress     float   0..1 (transições)
 *   uPower        float   intensidade de fresnel
 *   uScale        float   escala do padrão
 * ============================================================ */
(function () {
  'use strict';
  if (window.NxShader) return;

  var VERSION = '2.0.0';

  /* ================================================================
   * VERTEX SHADERS
   * ================================================================ */

  var VERT = {
    /* Plano/quad com UV — o caso mais comum */
    base: [
      'varying vec2 vUv;',
      'void main() {',
      '  vUv = uv;',
      '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
      '}'
    ].join('\n'),

    /* Malha 3D com normal + direção de visão (para fresnel/toon/escudo) */
    normal: [
      'varying vec2 vUv;',
      'varying vec3 vNormal;',
      'varying vec3 vViewDir;',
      'varying vec3 vPos;',
      'void main() {',
      '  vUv = uv;',
      '  vNormal = normalize(normalMatrix * normal);',
      '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
      '  vPos = mv.xyz;',
      '  vViewDir = normalize(-mv.xyz);',
      '  gl_Position = projectionMatrix * mv;',
      '}'
    ].join('\n')
  };

  /* Declarações de varying por tipo de vertex */
  var VARYINGS = {
    base: 'varying vec2 vUv;',
    normal: [
      'varying vec2 vUv;',
      'varying vec3 vNormal;',
      'varying vec3 vViewDir;',
      'varying vec3 vPos;'
    ].join('\n')
  };

  /* ================================================================
   * TRECHOS GLSL REUTILIZÁVEIS
   * ================================================================ */

  var CHUNKS = {};

  /* --- hash: números pseudoaleatórios determinísticos --- */
  CHUNKS.hash = [
    'float nxhash11(float p) {',
    '  p = fract(p * 0.1031);',
    '  p *= p + 33.33;',
    '  p *= p + p;',
    '  return fract(p);',
    '}',
    'float nxhash21(vec2 p) {',
    '  vec3 p3 = fract(vec3(p.xyx) * 0.1031);',
    '  p3 += dot(p3, p3.yzx + 33.33);',
    '  return fract((p3.x + p3.y) * p3.z);',
    '}',
    'vec2 nxhash22(vec2 p) {',
    '  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));',
    '  p3 += dot(p3, p3.yzx + 33.33);',
    '  return fract((p3.xx + p3.yz) * p3.zy);',
    '}'
  ].join('\n');

  /* --- noise: simplex noise 2D e 3D (Ashima Arts / Stefan Gustavson) --- */
  CHUNKS.noise = [
    'vec3 nxmod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }',
    'vec2 nxmod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }',
    'float nxmod289(float x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }',
    'vec4 nxmod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }',
    'vec3 nxpermute(vec3 x) { return nxmod289(((x * 34.0) + 1.0) * x); }',
    'vec4 nxpermute(vec4 x) { return nxmod289(((x * 34.0) + 1.0) * x); }',
    'vec4 nxtaylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }',
    '',
    '/* simplex 2D — retorna [-1, 1] */',
    'float nxsnoise(vec2 v) {',
    '  const vec4 C = vec4(0.211324865405187, 0.366025403784439,',
    '                      -0.577350269189626, 0.024390243902439);',
    '  vec2 i  = floor(v + dot(v, C.yy));',
    '  vec2 x0 = v - i + dot(i, C.xx);',
    '  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);',
    '  vec4 x12 = x0.xyxy + C.xxzz;',
    '  x12.xy -= i1;',
    '  i = nxmod289(i);',
    '  vec3 p = nxpermute(nxpermute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));',
    '  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);',
    '  m = m * m;',
    '  m = m * m;',
    '  vec3 x = 2.0 * fract(p * C.www) - 1.0;',
    '  vec3 h = abs(x) - 0.5;',
    '  vec3 ox = floor(x + 0.5);',
    '  vec3 a0 = x - ox;',
    '  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);',
    '  vec3 g;',
    '  g.x  = a0.x  * x0.x  + h.x  * x0.y;',
    '  g.yz = a0.yz * x12.xz + h.yz * x12.yw;',
    '  return 130.0 * dot(m, g);',
    '}',
    '',
    '/* simplex 3D — retorna [-1, 1] */',
    'float nxsnoise(vec3 v) {',
    '  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);',
    '  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);',
    '  vec3 i  = floor(v + dot(v, C.yyy));',
    '  vec3 x0 = v - i + dot(i, C.xxx);',
    '  vec3 g = step(x0.yzx, x0.xyz);',
    '  vec3 l = 1.0 - g;',
    '  vec3 i1 = min(g.xyz, l.zxy);',
    '  vec3 i2 = max(g.xyz, l.zxy);',
    '  vec3 x1 = x0 - i1 + C.xxx;',
    '  vec3 x2 = x0 - i2 + C.yyy;',
    '  vec3 x3 = x0 - D.yyy;',
    '  i = nxmod289(i);',
    '  vec4 p = nxpermute(nxpermute(nxpermute(',
    '             i.z + vec4(0.0, i1.z, i2.z, 1.0))',
    '           + i.y + vec4(0.0, i1.y, i2.y, 1.0))',
    '           + i.x + vec4(0.0, i1.x, i2.x, 1.0));',
    '  float n_ = 0.142857142857;',
    '  vec3 ns = n_ * D.wyz - D.xzx;',
    '  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);',
    '  vec4 x_ = floor(j * ns.z);',
    '  vec4 y_ = floor(j - 7.0 * x_);',
    '  vec4 x = x_ * ns.x + ns.yyyy;',
    '  vec4 y = y_ * ns.x + ns.yyyy;',
    '  vec4 h = 1.0 - abs(x) - abs(y);',
    '  vec4 b0 = vec4(x.xy, y.xy);',
    '  vec4 b1 = vec4(x.zw, y.zw);',
    '  vec4 s0 = floor(b0) * 2.0 + 1.0;',
    '  vec4 s1 = floor(b1) * 2.0 + 1.0;',
    '  vec4 sh = -step(h, vec4(0.0));',
    '  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;',
    '  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;',
    '  vec3 p0 = vec3(a0.xy, h.x);',
    '  vec3 p1 = vec3(a0.zw, h.y);',
    '  vec3 p2 = vec3(a1.xy, h.z);',
    '  vec3 p3 = vec3(a1.zw, h.w);',
    '  vec4 norm = nxtaylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));',
    '  p0 *= norm.x;',
    '  p1 *= norm.y;',
    '  p2 *= norm.z;',
    '  p3 *= norm.w;',
    '  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);',
    '  m = m * m;',
    '  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));',
    '}'
  ].join('\n');

  /* --- fbm: soma de oitavas de simplex (depende de `noise`) --- */
  CHUNKS.fbm = [
    '/* fractal brownian motion 2D — retorna aproximadamente [-1, 1] */',
    'float nxfbm(vec2 p) {',
    '  float v = 0.0;',
    '  float a = 0.5;',
    '  mat2 rot = mat2(0.80, 0.60, -0.60, 0.80);',
    '  for (int i = 0; i < 5; i++) {',
    '    v += a * nxsnoise(p);',
    '    p = rot * p * 2.0;',
    '    a *= 0.5;',
    '  }',
    '  return v;',
    '}',
    'float nxfbm(vec3 p) {',
    '  float v = 0.0;',
    '  float a = 0.5;',
    '  for (int i = 0; i < 5; i++) {',
    '    v += a * nxsnoise(p);',
    '    p *= 2.0;',
    '    a *= 0.5;',
    '  }',
    '  return v;',
    '}'
  ].join('\n');

  /* --- voronoi: células (F1, F2) (depende de `hash`) --- */
  CHUNKS.voronoi = [
    '/* x = distância até a célula mais próxima, y = até a segunda */',
    'vec2 nxvoronoi(vec2 p) {',
    '  vec2 n = floor(p);',
    '  vec2 f = fract(p);',
    '  float f1 = 8.0;',
    '  float f2 = 8.0;',
    '  for (int j = -1; j <= 1; j++) {',
    '    for (int i = -1; i <= 1; i++) {',
    '      vec2 g = vec2(float(i), float(j));',
    '      vec2 o = nxhash22(n + g);',
    '      vec2 r = g + o - f;',
    '      float d = dot(r, r);',
    '      if (d < f1) {',
    '        f2 = f1;',
    '        f1 = d;',
    '      } else if (d < f2) {',
    '        f2 = d;',
    '      }',
    '    }',
    '  }',
    '  return vec2(sqrt(f1), sqrt(f2));',
    '}'
  ].join('\n');

  /* --- rotate: matriz de rotação 2D --- */
  CHUNKS.rotate = [
    'mat2 nxrot(float a) {',
    '  float s = sin(a);',
    '  float c = cos(a);',
    '  return mat2(c, -s, s, c);',
    '}'
  ].join('\n');

  /* --- hsv: conversão HSV → RGB --- */
  CHUNKS.hsv = [
    'vec3 nxhsv2rgb(vec3 c) {',
    '  vec3 rgb = clamp(abs(mod(c.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);',
    '  rgb = rgb * rgb * (3.0 - 2.0 * rgb);',
    '  return c.z * mix(vec3(1.0), rgb, c.y);',
    '}'
  ].join('\n');

  /* --- palette: paleta cosseno (Inigo Quilez) --- */
  CHUNKS.palette = [
    'vec3 nxpalette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {',
    '  return a + b * cos(6.28318530718 * (c * t + d));',
    '}'
  ].join('\n');

  /* ================================================================
   * DECLARAÇÕES DE UNIFORMS
   * ================================================================ */

  var UNIFORM_DECL = {
    time: 'uniform float time;',
    uTime: 'uniform float uTime;',
    uColor: 'uniform vec3 uColor;',
    uColor2: 'uniform vec3 uColor2;',
    uEdgeColor: 'uniform vec3 uEdgeColor;',
    uResolution: 'uniform vec2 uResolution;',
    uProgress: 'uniform float uProgress;',
    uPower: 'uniform float uPower;',
    uScale: 'uniform float uScale;'
  };

  /* ================================================================
   * CONSTRUÇÃO DO FRAGMENT SHADER
   * ================================================================ */

  function buildFragment(uniforms, vertexKind, chunks, body) {
    var out = ['precision highp float;', ''];
    var i;
    /* ordem canônica para o source ficar estável entre builds */
    var canon = ['time', 'uTime', 'uColor', 'uColor2', 'uEdgeColor',
      'uResolution', 'uProgress', 'uPower', 'uScale'];
    for (i = 0; i < canon.length; i++) {
      if (uniforms.indexOf(canon[i]) !== -1 && UNIFORM_DECL[canon[i]]) {
        out.push(UNIFORM_DECL[canon[i]]);
      }
    }
    out.push('');
    out.push(VARYINGS[vertexKind] || VARYINGS.base);
    out.push('');
    for (i = 0; i < chunks.length; i++) {
      if (!CHUNKS[chunks[i]]) continue;
      out.push('/* --- ' + chunks[i] + ' --- */');
      out.push(CHUNKS[chunks[i]]);
      out.push('');
    }
    out.push(body);
    return out.join('\n');
  }

  /* ================================================================
   * CATÁLOGO DE SHADERS
   * ================================================================ */

  var SHADERS = {};
  var ORDER = [];

  function def(name, category, desc, opts, chunks, body) {
    var shader = {
      name: name,
      category: category,
      desc: desc,
      uniforms: opts.uniforms || [],
      vertexKind: opts.vertex || 'base',
      chunks: chunks || [],
      vertex: VERT[opts.vertex || 'base'],
      fragment: buildFragment(opts.uniforms || [], opts.vertex || 'base', chunks || [], body)
    };
    SHADERS[name] = shader;
    ORDER.push(name);
  }

  /* ---------------- ESPAÇO ---------------- */

  def('nebulosa', 'espaco', 'Nebulosa de ruído com domínio deformado e núcleos brilhantes',
    { uniforms: ['uTime', 'uColor', 'uColor2'], vertex: 'base' },
    ['noise', 'fbm'], [
      'void main() {',
      '  vec2 uv = vUv * 3.0;',
      '  vec2 q = vec2(nxfbm(uv + uTime * 0.05),',
      '                nxfbm(uv + vec2(5.2, 1.3) - uTime * 0.04));',
      '  vec2 r = vec2(nxfbm(uv + 4.0 * q + vec2(1.7, 9.2) + uTime * 0.08),',
      '                nxfbm(uv + 4.0 * q + vec2(8.3, 2.8) - uTime * 0.06));',
      '  float f = nxfbm(uv + 4.0 * r);',
      '  f = clamp(f * 0.5 + 0.5, 0.0, 1.0);',
      '  vec3 col = mix(uColor * 0.12, uColor2, smoothstep(0.18, 0.82, f));',
      '  col += vec3(1.0, 0.96, 0.92) * pow(f, 6.0) * 0.8;',
      '  gl_FragColor = vec4(col, 1.0);',
      '}'
    ].join('\n'));

  def('galaxia', 'espaco', 'Espiral galáctica com poeira e estrelas',
    { uniforms: ['uTime', 'uColor', 'uColor2'], vertex: 'base' },
    ['hash', 'noise', 'fbm'], [
      'void main() {',
      '  vec2 p = (vUv - 0.5) * 2.0;',
      '  float ang = atan(p.y, p.x);',
      '  float rad = length(p);',
      '  float arms = sin(ang * 2.0 + rad * 10.0 - uTime * 0.4) * 0.5 + 0.5;',
      '  float dust = nxfbm(p * 3.0 + vec2(uTime * 0.05));',
      '  float glow = exp(-rad * 2.2) * (0.35 + 0.65 * arms);',
      '  float stars = pow(nxhash21(floor(p * 140.0)), 24.0) * smoothstep(1.0, 0.15, rad);',
      '  vec3 col = mix(uColor, uColor2, arms);',
      '  col *= glow * (0.75 + 0.5 * dust);',
      '  col += vec3(1.0, 0.95, 0.85) * stars * 2.0;',
      '  gl_FragColor = vec4(col, 1.0);',
      '}'
    ].join('\n'));

  def('estrelas', 'espaco', 'Campo de estrelas cintilantes em grade',
    { uniforms: ['uTime', 'uColor'], vertex: 'base' },
    ['hash'], [
      'void main() {',
      '  vec2 p = vUv * 60.0;',
      '  vec2 id = floor(p);',
      '  vec2 f = fract(p) - 0.5;',
      '  float rnd = nxhash21(id);',
      '  float twinkle = 0.55 + 0.45 * sin(uTime * 2.0 + rnd * 6.2831);',
      '  vec2 off = (nxhash22(id) - 0.5) * 0.6;',
      '  float d = length(f - off);',
      '  float star = smoothstep(0.16, 0.0, d) * step(0.86, rnd);',
      '  vec3 col = uColor * star * twinkle * 1.6;',
      '  gl_FragColor = vec4(col, 1.0);',
      '}'
    ].join('\n'));

  /* ---------------- NATUREZA ---------------- */

  def('aurora', 'natureza', 'Cortina de aurora boreal em faixas de ruído',
    { uniforms: ['uTime', 'uColor', 'uColor2'], vertex: 'base' },
    ['noise', 'fbm'], [
      'void main() {',
      '  vec2 uv = vUv;',
      '  float t = uTime * 0.15;',
      '  float n = nxfbm(vec2(uv.x * 3.0 + t, uv.y * 1.5 - t * 0.7));',
      '  float band = sin((uv.y * 3.0 + n * 0.9 - t * 2.0) * 3.14159265);',
      '  band = smoothstep(0.0, 0.85, band);',
      '  float curtain = smoothstep(0.05, 0.35, uv.y) * smoothstep(1.0, 0.55, uv.y);',
      '  vec3 col = mix(uColor, uColor2, uv.y + n * 0.25);',
      '  col *= band * curtain;',
      '  col += uColor2 * pow(band, 8.0) * 0.6;',
      '  gl_FragColor = vec4(col, 1.0);',
      '}'
    ].join('\n'));

  def('fogo', 'natureza', 'Chamas em fbm com base quente e topo escuro',
    { uniforms: ['uTime', 'uColor', 'uColor2'], vertex: 'base' },
    ['noise', 'fbm'], [
      'void main() {',
      '  vec2 uv = vUv * vec2(3.0, 3.0);',
      '  float t = uTime * 0.9;',
      '  float n = nxfbm(vec2(uv.x, uv.y * 1.5 - t));',
      '  n += 0.35 * nxfbm(vec2(uv.x * 2.0 + 3.1, uv.y * 3.0 - t * 1.7));',
      '  float flame = clamp(1.0 - uv.y * 0.55 + n * 0.65, 0.0, 1.0);',
      '  vec3 col = mix(uColor * 0.6, uColor2, pow(flame, 1.5));',
      '  col = mix(vec3(0.02, 0.0, 0.0), col, smoothstep(0.05, 0.9, flame));',
      '  gl_FragColor = vec4(col, 1.0);',
      '}'
    ].join('\n'));

  def('aguaFbm', 'natureza', 'Água com duas camadas de ruído e brilho especular',
    { uniforms: ['uTime', 'uColor', 'uColor2'], vertex: 'base' },
    ['noise', 'fbm'], [
      'void main() {',
      '  vec2 p = vUv * 4.0;',
      '  float t = uTime * 0.35;',
      '  float h1 = nxfbm(p + vec2(t, t * 0.6));',
      '  float h2 = nxfbm(p * 1.9 + vec2(-t * 1.3, t * 0.9));',
      '  float hh = h1 * 0.65 + h2 * 0.35;',
      '  vec3 col = mix(uColor * 0.3, uColor2, hh * 0.5 + 0.5);',
      '  col += vec3(1.0) * pow(max(hh, 0.0), 6.0) * 0.7;',
      '  gl_FragColor = vec4(col, 0.92);',
      '}'
    ].join('\n'));

  def('terreno', 'natureza', 'Curvas de nível topográficas',
    { uniforms: ['uTime', 'uColor', 'uColor2'], vertex: 'base' },
    ['noise', 'fbm'], [
      'void main() {',
      '  vec2 p = vUv * 4.0 + vec2(uTime * 0.02);',
      '  float h = nxfbm(p) * 0.5 + 0.5;',
      '  float lines = abs(fract(h * 12.0) - 0.5) * 2.0;',
      '  lines = smoothstep(0.72, 1.0, lines);',
      '  vec3 col = mix(uColor * 0.22, uColor2, h);',
      '  col += vec3(1.0) * lines * 0.35;',
      '  gl_FragColor = vec4(col, 1.0);',
      '}'
    ].join('\n'));

  def('caustica', 'natureza', 'Cáusticas de água (luz refratada)',
    { uniforms: ['uTime', 'uColor', 'uColor2'], vertex: 'base' },
    ['noise', 'fbm'], [
      'void main() {',
      '  vec2 p = vUv * 5.0;',
      '  float t = uTime * 0.35;',
      '  vec2 q = vec2(nxfbm(p + t), nxfbm(p + vec2(3.7, 1.9) - t));',
      '  float caustic = pow(1.0 - abs(nxfbm(p + 3.0 * q)), 6.0);',
      '  vec3 col = mix(uColor * 0.22, uColor2, caustic);',
      '  col += vec3(1.0) * pow(caustic, 2.0) * 0.6;',
      '  gl_FragColor = vec4(col, 1.0);',
      '}'
    ].join('\n'));

  /* ---------------- ABSTRATO ---------------- */

  def('plasma', 'abstrato', 'Plasma clássico: senos somados + ruído',
    { uniforms: ['uTime', 'uColor', 'uColor2'], vertex: 'base' },
    ['noise', 'fbm'], [
      'void main() {',
      '  vec2 p = vUv * 6.0;',
      '  float t = uTime * 0.7;',
      '  float v = sin(p.x + t) + sin(p.y + t * 1.3) + sin((p.x + p.y) * 0.7 + t * 0.8);',
      '  v += nxfbm(p * 0.8 + t * 0.3) * 2.0;',
      '  v = v * 0.16 + 0.5;',
      '  vec3 col = mix(uColor, uColor2, clamp(v, 0.0, 1.0));',
      '  col += vec3(0.5) * pow(clamp(v, 0.0, 1.0), 8.0);',
      '  gl_FragColor = vec4(col, 1.0);',
      '}'
    ].join('\n'));

  def('warp', 'abstrato', 'Domain warping psicodélico (2 níveis de deformação)',
    { uniforms: ['uTime', 'uColor', 'uColor2'], vertex: 'base' },
    ['noise', 'fbm'], [
      'void main() {',
      '  vec2 p = vUv * 2.5;',
      '  float t = uTime * 0.12;',
      '  vec2 q = vec2(nxfbm(p + vec2(0.0, t)),',
      '                nxfbm(p + vec2(5.2, 1.3) - t));',
      '  vec2 r = vec2(nxfbm(p + 2.0 * q + vec2(1.7, 9.2) + t * 1.5),',
      '                nxfbm(p + 2.0 * q + vec2(8.3, 2.8) - t));',
      '  float f = nxfbm(p + 2.0 * r) * 0.5 + 0.5;',
      '  vec3 col = mix(uColor, uColor2, f);',
      '  col = mix(col, vec3(1.0) - col, clamp(length(q), 0.0, 1.0) * 0.6);',
      '  gl_FragColor = vec4(col, 1.0);',
      '}'
    ].join('\n'));

  def('ondas', 'abstrato', 'Interferência de ondas circulares',
    { uniforms: ['uTime', 'uColor', 'uColor2'], vertex: 'base' },
    ['noise', 'fbm'], [
      'void main() {',
      '  vec2 p = vUv - 0.5;',
      '  float d = length(p);',
      '  float v = sin(d * 38.0 - uTime * 2.5) * 0.5 + 0.5;',
      '  v *= sin(p.x * 18.0 + uTime) * 0.5 + 0.5;',
      '  v += nxfbm(p * 3.0 + uTime * 0.1) * 0.15;',
      '  vec3 col = mix(uColor, uColor2, clamp(v, 0.0, 1.0));',
      '  gl_FragColor = vec4(col, 1.0);',
      '}'
    ].join('\n'));

  def('gradiente', 'abstrato', 'Gradiente suave animado por ruído',
    { uniforms: ['uTime', 'uColor', 'uColor2'], vertex: 'base' },
    ['noise', 'fbm'], [
      'void main() {',
      '  float n = nxfbm(vUv * 2.0 + uTime * 0.08);',
      '  float g = clamp(vUv.x * 0.6 + vUv.y * 0.4 + n * 0.35, 0.0, 1.0);',
      '  vec3 col = mix(uColor, uColor2, g);',
      '  col += vec3(0.06) * n;',
      '  gl_FragColor = vec4(col, 1.0);',
      '}'
    ].join('\n'));

  /* ---------------- MATERIAL 3D ---------------- */

  def('fresnel', 'material3d', 'Borda luminosa estilo fresnel (precisa de malha 3D)',
    { uniforms: ['uTime', 'uColor', 'uColor2', 'uPower'], vertex: 'normal' },
    [], [
      'void main() {',
      '  float f = pow(1.0 - clamp(dot(normalize(vNormal), normalize(vViewDir)), 0.0, 1.0), uPower);',
      '  float pulse = 0.85 + 0.15 * sin(uTime * 2.0);',
      '  vec3 col = mix(uColor2 * 0.12, uColor, f);',
      '  col += uColor * f * f * 0.8;',
      '  gl_FragColor = vec4(col * pulse, 1.0);',
      '}'
    ].join('\n'));

  def('escudo', 'material3d', 'Campo de força com grade hexagonal e ondulação',
    { uniforms: ['uTime', 'uColor', 'uColor2', 'uPower'], vertex: 'normal' },
    [], [
      'void main() {',
      '  vec2 g = abs(fract(vUv * 8.0) - 0.5);',
      '  float grid = smoothstep(0.40, 0.50, max(g.x, g.y));',
      '  float f = pow(1.0 - clamp(dot(normalize(vNormal), normalize(vViewDir)), 0.0, 1.0), uPower);',
      '  float ripple = sin(length(vUv - 0.5) * 20.0 - uTime * 3.0) * 0.5 + 0.5;',
      '  vec3 col = uColor * (f * 1.2 + grid * 0.35 + ripple * f * 0.5);',
      '  col += uColor2 * (1.0 - f) * 0.08;',
      '  gl_FragColor = vec4(col, 0.55 + f * 0.45);',
      '}'
    ].join('\n'));

  def('toon', 'material3d', 'Sombreamento em faixas (cel shading) com rim light',
    { uniforms: ['uColor', 'uColor2', 'uEdgeColor'], vertex: 'normal' },
    [], [
      'void main() {',
      '  vec3 L = normalize(vec3(0.55, 0.80, 0.65));',
      '  float d = clamp(dot(normalize(vNormal), L), 0.0, 1.0);',
      '  float band = floor(d * 4.0) / 4.0 + 0.25;',
      '  vec3 col = mix(uColor2, uColor, clamp(band, 0.0, 1.0));',
      '  float rim = pow(1.0 - clamp(dot(normalize(vNormal), normalize(vViewDir)), 0.0, 1.0), 3.0);',
      '  col += uEdgeColor * rim * 0.5;',
      '  gl_FragColor = vec4(col, 1.0);',
      '}'
    ].join('\n'));

  def('voronoiCells', 'material3d', 'Células de Voronoi cristalinas com bordas',
    { uniforms: ['uTime', 'uColor', 'uColor2'], vertex: 'base' },
    ['hash', 'voronoi'], [
      'void main() {',
      '  vec2 p = vUv * 6.0 + vec2(uTime * 0.1, 0.0);',
      '  vec2 c = nxvoronoi(p);',
      '  float edge = smoothstep(0.0, 0.25, c.y - c.x);',
      '  vec3 col = mix(uColor2, uColor, edge);',
      '  col *= 0.55 + 0.45 * (1.0 - c.x);',
      '  gl_FragColor = vec4(col, 1.0);',
      '}'
    ].join('\n'));

  def('marmore', 'material3d', 'Mármore: veios senoidais sobre ruído',
    { uniforms: ['uTime', 'uColor', 'uColor2'], vertex: 'base' },
    ['noise', 'fbm'], [
      'void main() {',
      '  vec2 p = vUv * 3.0;',
      '  float n = nxfbm(p + nxfbm(p * 1.7 + uTime * 0.05));',
      '  float v = sin((vUv.x + vUv.y) * 6.28318530 + n * 3.0) * 0.5 + 0.5;',
      '  vec3 col = mix(uColor, uColor2, smoothstep(0.25, 0.85, v));',
      '  float vein = smoothstep(0.02, 0.0, abs(v - 0.5));',
      '  col = mix(col, vec3(0.95), vein * 0.5);',
      '  gl_FragColor = vec4(col, 1.0);',
      '}'
    ].join('\n'));

  /* ---------------- INTERFACE ---------------- */

  def('dissolveRuido', 'interface', 'Desintegração por ruído com borda incandescente',
    { uniforms: ['uTime', 'uColor', 'uEdgeColor', 'uProgress'], vertex: 'base' },
    ['noise', 'fbm'], [
      'void main() {',
      '  float n = nxfbm(vUv * 6.0) * 0.5 + 0.5;',
      '  float pr = uProgress > 0.0001 ? uProgress : (sin(uTime * 0.6) * 0.5 + 0.5);',
      '  float inner = smoothstep(pr - 0.06, pr + 0.06, n);',
      '  float edge = clamp(1.0 - abs(n - pr) / 0.06, 0.0, 1.0);',
      '  vec3 col = mix(uEdgeColor, uColor, inner);',
      '  col += uEdgeColor * pow(edge, 2.0) * 1.5;',
      '  gl_FragColor = vec4(col, max(inner, edge * 0.9));',
      '}'
    ].join('\n'));

  def('crt', 'interface', 'Monitor CRT: scanlines, aberração e vinheta',
    { uniforms: ['uTime', 'uColor'], vertex: 'base' },
    ['hash'], [
      'void main() {',
      '  vec2 uv = vUv;',
      '  vec2 c = uv - 0.5;',
      '  float scan = 0.85 + 0.15 * sin(uv.y * 900.0);',
      '  vec3 col = uColor * scan;',
      '  col.r *= 1.0 + c.x * 1.6;',
      '  col.b *= 1.0 - c.x * 1.6;',
      '  col *= smoothstep(0.85, 0.25, length(c));',
      '  col *= 0.96 + 0.04 * sin(uTime * 30.0);',
      '  col += (nxhash21(uv * 512.0 + uTime) - 0.5) * 0.05;',
      '  gl_FragColor = vec4(col, 1.0);',
      '}'
    ].join('\n'));

  def('glitch', 'interface', 'Glitch digital com blocos deslocados e RGB split',
    { uniforms: ['uTime', 'uColor', 'uColor2'], vertex: 'base' },
    ['hash'], [
      'void main() {',
      '  vec2 uv = vUv;',
      '  float t = floor(uTime * 8.0);',
      '  float band = floor(uv.y * 24.0);',
      '  float rnd = nxhash21(vec2(band, t));',
      '  uv.x = fract(uv.x + (rnd - 0.5) * 0.12 * step(0.72, rnd));',
      '  vec3 col = mix(uColor, uColor2, uv.x);',
      '  float split = step(0.5, fract(uv.x * 3.0 + t * 0.13)) * 0.5;',
      '  col.r = mix(col.r, uColor2.r, split);',
      '  float block = step(0.93, nxhash21(vec2(floor(uv.x * 12.0), band) + t));',
      '  col += vec3(0.8) * block * 0.4;',
      '  col *= 0.9 + 0.1 * sin(uv.y * 700.0);',
      '  gl_FragColor = vec4(col, 1.0);',
      '}'
    ].join('\n'));

  /* ---------------- LEGADO (mantidos por compatibilidade) ---------------- */

  def('holograma', 'interface', 'Holograma com scanlines e franjas',
    { uniforms: ['time', 'uColor'], vertex: 'base' },
    [], [
      'void main() {',
      '  vec2 uv = vUv;',
      '  float scanline = sin(uv.y * 200.0 + time * 2.0) * 0.3 + 0.7;',
      '  float fringe = sin(uv.x * 40.0 + uv.y * 30.0 + time * 1.5) * 0.2 + 0.8;',
      '  vec3 col = uColor * scanline * fringe;',
      '  gl_FragColor = vec4(col, 0.85);',
      '}'
    ].join('\n'));

  def('energia', 'interface', 'Pulso de energia radial',
    { uniforms: ['time', 'uColor'], vertex: 'base' },
    [], [
      'void main() {',
      '  float d = length(vUv - 0.5);',
      '  float pulse = sin(d * 10.0 - time * 2.0) * 0.5 + 0.5;',
      '  float glow = exp(-d * 4.0) * pulse;',
      '  vec3 col = uColor * (0.3 + glow * 0.7);',
      '  col += vec3(0.2, 0.5, 1.0) * glow * 0.5;',
      '  gl_FragColor = vec4(col, 1.0);',
      '}'
    ].join('\n'));

  def('lava', 'natureza', 'Lava simples em senos cruzados',
    { uniforms: ['time', 'uColor'], vertex: 'base' },
    [], [
      'void main() {',
      '  float n = sin(vUv.x * 10.0 + time * 0.5) * cos(vUv.y * 8.0 + time * 0.7);',
      '  n = n * 0.5 + 0.5;',
      '  vec3 col = mix(vec3(0.8, 0.1, 0.0), vec3(1.0, 0.6, 0.0), n);',
      '  col = mix(col, vec3(1.0, 0.8, 0.1), pow(n, 3.0) * 0.5);',
      '  gl_FragColor = vec4(col, 1.0);',
      '}'
    ].join('\n'));

  def('neon', 'interface', 'Neon com flicker e halo',
    { uniforms: ['time', 'uColor'], vertex: 'base' },
    [], [
      'void main() {',
      '  float flicker = 0.9 + 0.1 * sin(time * 5.0 + vUv.x * 10.0);',
      '  float edge = 1.0 - smoothstep(0.3, 0.5, length(vUv - 0.5));',
      '  vec3 col = uColor * flicker * (0.8 + edge * 0.4);',
      '  gl_FragColor = vec4(col, 1.0);',
      '}'
    ].join('\n'));

  def('circuito', 'interface', 'Trilhas de circuito com pulsos',
    { uniforms: ['time', 'uColor'], vertex: 'base' },
    [], [
      'void main() {',
      '  vec2 uv = vUv * 8.0;',
      '  vec2 id = floor(uv);',
      '  vec2 f = fract(uv);',
      '  float pulse = sin(time * 2.0 + id.x * 3.0 + id.y * 7.0) * 0.5 + 0.5;',
      '  float line = max(1.0 - abs(f.x - 0.5) * 8.0, 1.0 - abs(f.y - 0.5) * 8.0);',
      '  line = step(0.7, line) * pulse;',
      '  vec3 col = mix(vec3(0.02, 0.05, 0.02), uColor, line);',
      '  gl_FragColor = vec4(col, 1.0);',
      '}'
    ].join('\n'));

  def('agua', 'natureza', 'Água simples com espuma',
    { uniforms: ['time', 'uColor'], vertex: 'base' },
    [], [
      'void main() {',
      '  vec2 uv = vUv * 4.0;',
      '  float h = sin(uv.x * 6.0 + time * 1.2) * 0.3 + sin(uv.y * 8.0 + time * 0.9) * 0.3;',
      '  h = h * 0.5 + 0.5;',
      '  vec3 col = mix(uColor, vec3(1.0), h * 0.15);',
      '  col += step(0.92, h) * 0.5;',
      '  gl_FragColor = vec4(col, 0.75);',
      '}'
    ].join('\n'));

  def('dissolve', 'interface', 'Dissolve por hash branco (versão antiga)',
    { uniforms: ['time', 'uColor', 'uEdgeColor'], vertex: 'base' },
    [], [
      'void main() {',
      '  float progress = sin(time * 0.3) * 0.5 + 0.5;',
      '  float noiseVal = fract(sin(dot(vUv, vec2(12.9898, 78.233))) * 43758.5453);',
      '  float inner = step(progress, noiseVal);',
      '  vec3 col = mix(uEdgeColor, uColor, inner);',
      '  col = mix(col, vec3(0.0), 1.0 - inner);',
      '  gl_FragColor = vec4(col, inner);',
      '}'
    ].join('\n'));

  def('matrix', 'interface', 'Chuva de glifos estilo Matrix',
    { uniforms: ['time', 'uColor'], vertex: 'base' },
    [], [
      'void main() {',
      '  vec2 uv = vUv * 20.0;',
      '  float coluna = floor(uv.x);',
      '  float linha = floor(uv.y);',
      '  float glitch = sin(coluna * 12.0 + linha * 7.0 + time * 3.0) * 0.5 + 0.5;',
      '  float glyph = step(0.85, fract(uv.y + time * (0.5 + glitch * 0.5)));',
      '  vec3 col = uColor * glyph * (0.4 + 0.6 * glitch);',
      '  gl_FragColor = vec4(col, glyph * 0.8);',
      '}'
    ].join('\n'));

  /* ================================================================
   * API
   * ================================================================ */

  function get(name) {
    return SHADERS[name] || null;
  }

  function names() {
    return ORDER.slice().sort();
  }

  function categories() {
    var seen = {};
    var out = [];
    for (var i = 0; i < ORDER.length; i++) {
      var c = SHADERS[ORDER[i]].category;
      if (!seen[c]) { seen[c] = true; out.push(c); }
    }
    return out.sort();
  }

  function byCategory(cat) {
    var out = [];
    for (var i = 0; i < ORDER.length; i++) {
      if (SHADERS[ORDER[i]].category === cat) out.push(ORDER[i]);
    }
    return out.sort();
  }

  function info(name) {
    var s = get(name);
    if (!s) return null;
    return {
      name: s.name,
      category: s.category,
      desc: s.desc,
      uniforms: s.uniforms.slice(),
      vertexKind: s.vertexKind,
      chunks: s.chunks.slice(),
      solids: s.vertexKind === 'normal'
    };
  }

  function raw(name) {
    var s = get(name);
    return s ? s.fragment : null;
  }

  function chunk(name) {
    return CHUNKS[name] || null;
  }

  function chunks() {
    return Object.keys(CHUNKS).sort();
  }

  /* Uniforms completos (superset) que todo material recebe */
  function uniformsFor(name, opts) {
    if (typeof THREE === 'undefined') return {};
    opts = opts || {};
    var w = opts.width || (typeof window !== 'undefined' ? window.innerWidth : 1) || 1;
    var h = opts.height || (typeof window !== 'undefined' ? window.innerHeight : 1) || 1;
    var u = {
      time: { value: 0 },
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(opts.color || '#00e88a') },
      uColor2: { value: new THREE.Color(opts.color2 || '#1b3bff') },
      uEdgeColor: { value: new THREE.Color(opts.edgeColor || '#ff4488') },
      uResolution: { value: new THREE.Vector2(w, h) },
      uProgress: { value: opts.progress === undefined ? 0 : opts.progress },
      uPower: { value: opts.power === undefined ? 2.5 : opts.power },
      uScale: { value: opts.scale === undefined ? 1 : opts.scale }
    };
    return u;
  }

  /* Cria THREE.ShaderMaterial a partir de um shader nomeado */
  function threeMat(name, opts) {
    if (typeof THREE === 'undefined') return null;
    var s = get(name);
    if (!s) return null;
    opts = opts || {};
    var mat = new THREE.ShaderMaterial({
      vertexShader: s.vertex,
      fragmentShader: s.fragment,
      uniforms: uniformsFor(name, opts),
      transparent: true,
      side: opts.side === undefined ? THREE.DoubleSide : opts.side,
      depthWrite: opts.depthWrite === undefined ? false : opts.depthWrite,
      wireframe: !!opts.wireframe
    });
    mat.userData.nxShader = name;
    mat.userData.nxCategory = s.category;
    return mat;
  }

  /* Atualiza o uniform de tempo (aceita `time` e `uTime`) */
  function updateTime(mat, t) {
    if (!mat || !mat.uniforms) return;
    if (mat.uniforms.time) mat.uniforms.time.value = t;
    if (mat.uniforms.uTime) mat.uniforms.uTime.value = t;
  }

  window.NxShader = {
    VERSION: VERSION,
    get: get,
    names: names,
    categories: categories,
    byCategory: byCategory,
    info: info,
    raw: raw,
    chunk: chunk,
    chunks: chunks,
    uniforms: uniformsFor,
    threeMat: threeMat,
    updateTime: updateTime,
    VERT: VERT
  };
})();

/* ============================================================
 * themes.js — port de NexusTheme.kt
 * Agora com paleta multicolorida (colors[]) para resultados ricos.
 * ============================================================ */
(function () {
  'use strict';

  function T(name, background, surface, surfaceAlt, accent, text, secondary, isDark, colors, onAccent) {
    return {
      name: name,
      background: background,
      surface: surface,
      surfaceAlt: surfaceAlt,
      accent: accent,
      text: text,
      secondary: secondary,
      isDark: isDark,
      colors: colors || [],       // cores extras pro prompt da IA
      onAccent: onAccent || (isDark ? '#0A0E12' : '#FFFFFF')
    };
  }

  var ALL = [
    T('NEGRO · RGB neon',     '#000000', '#0B0B0E', '#14141A', '#FF2D95', '#E8E8F0', '#8888A0', true,
      ['#FF2D95', '#00E5FF', '#FFE600', '#7C4DFF']),
    T('NEGRO · fire',         '#000000', '#0E0A08', '#1A100C', '#FF6B35', '#F5E8E0', '#A08070', true,
      ['#FF6B35', '#FF2D2D', '#FFD700', '#FF4500']),
    T('NEGRO · synthwave',    '#000000', '#0A0812', '#141020', '#FF00FF', '#E8E0F8', '#8870B0', true,
      ['#FF00FF', '#00FFFF', '#FF6BFF', '#6600FF']),
    T('NEGRO · cyberpunk',    '#000000', '#0A0E0A', '#121A12', '#00FF88', '#E0F5E8', '#70A880', true,
      ['#00FF88', '#00CCFF', '#FFE600', '#FF6600']),
    T('NEGRO · rainbow',      '#000000', '#0E0A0E', '#1A101A', '#FF006E', '#F0E8F0', '#A080A0', true,
      ['#FF006E', '#FFD700', '#00FF88', '#00BFFF', '#9B59B6']),

    /* ── +5 temas BLACK coloridos ── */
    T('NEGRO · vaporwave',    '#000000', '#0A0A14', '#121026', '#FF6EFF', '#E8E0F8', '#8870B0', true,
      ['#FF6EFF', '#00E5FF', '#FFD700', '#FF2D95', '#7C4DFF']),
    T('NEGRO · toxic',        '#000000', '#0A1008', '#102010', '#39FF14', '#E0F5E0', '#70A870', true,
      ['#39FF14', '#00FF88', '#FFE600', '#00E5FF', '#FF6600']),
    T('NEGRO · blood moon',   '#000000', '#100A0A', '#1E1010', '#FF0040', '#F5E0E0', '#A87070', true,
      ['#FF0040', '#FF6B35', '#FFD700', '#8B0000', '#FF4500']),
    T('NEGRO · galaxy',       '#000000', '#0A0A18', '#101028', '#7C4DFF', '#E8E0F8', '#8070B0', true,
      ['#7C4DFF', '#FF00FF', '#00E5FF', '#FFFFFF', '#FFD700']),
    T('NEGRO · aurora',       '#000000', '#080E0A', '#0E1A10', '#00FFAA', '#E0F5EC', '#70A888', true,
      ['#00FFAA', '#7C4DFF', '#00E5FF', '#39FF14', '#FFD700']),

    /* ── +10 temas BLACK coloridos ── */
    T('NEGRO · strawberry',   '#000000', '#0E080A', '#1C0E12', '#FF2D55', '#F5E0E8', '#A87080', true,
      ['#FF2D55', '#FF6B8A', '#FFD700', '#00E5FF', '#FFB6C1']),
    T('NEGRO · ocean deep',   '#000000', '#080A12', '#0E1220', '#0066FF', '#E0E8F5', '#7088B0', true,
      ['#0066FF', '#00E5FF', '#00FFAA', '#7C4DFF', '#FFFFFF']),
    T('NEGRO · lime blast',   '#000000', '#080E08', '#0E1A0E', '#AAFF00', '#E8F5E0', '#80A870', true,
      ['#AAFF00', '#39FF14', '#FFE600', '#00E5FF', '#FF6600']),
    T('NEGRO · ultraviolet',  '#000000', '#08061A', '#0E0C2E', '#B366FF', '#E8E0F8', '#8870B0', true,
      ['#B366FF', '#FF00FF', '#00E5FF', '#FFD700', '#FF6BFF']),
    T('NEGRO · candy',        '#000000', '#0E080E', '#1C0E1C', '#FF69B4', '#F5E0F0', '#A870A0', true,
      ['#FF69B4', '#FFD700', '#00E5FF', '#FF2D95', '#AAFF00']),
    T('NEGRO · artic ice',    '#000000', '#080A0E', '#0E1220', '#00D4FF', '#E0F0F8', '#7090B0', true,
      ['#00D4FF', '#0066FF', '#00FFAA', '#FFFFFF', '#B366FF']),
    T('NEGRO · lava',         '#000000', '#100A08', '#20120E', '#FF2D00', '#F5E8E0', '#B08070', true,
      ['#FF2D00', '#FFD700', '#FF6B35', '#FF4500', '#FF0040']),
    T('NEGRO · poison',       '#000000', '#080A08', '#0E1A0E', '#00FF66', '#E0F5E8', '#70A880', true,
      ['#00FF66', '#39FF14', '#00E5FF', '#AAFF00', '#FF006E']),
    T('NEGRO · midnight sun', '#000000', '#0A0810', '#120E1C', '#FF6B00', '#F0E8E0', '#A08070', true,
      ['#FF6B00', '#FFD700', '#FF0040', '#7C4DFF', '#00E5FF']),
    T('NEGRO · pixel dream',  '#000000', '#0A0A0E', '#12141A', '#00FFFF', '#E8E8F0', '#8088A0', true,
      ['#00FFFF', '#FF00FF', '#FFD700', '#FF2D95', '#39FF14']),

    /* ── 10 temas CLAROS ── */
    T('CLARO · rubi',         '#FFF5F7', '#FFFFFF', '#FFE8EE', '#C2185B', '#2A0F18', '#8A6070', false,
      ['#C2185B', '#E91E63', '#FF4081', '#F50057', '#AD1457']),
    T('CLARO · tangerina',    '#FFF8F0', '#FFFFFF', '#FFEEDD', '#E65100', '#2A1A08', '#8A7060', false,
      ['#E65100', '#FF6D00', '#FF9100', '#FFAB40', '#BF360C']),
    T('CLARO · limão',        '#FDFFF0', '#FFFFFF', '#F6FFD9', '#7CB342', '#1E2A0A', '#708050', false,
      ['#7CB342', '#9CCC65', '#C6FF00', '#FFEB3B', '#558B2F']),
    T('CLARO · esmeralda',    '#F2FFF8', '#FFFFFF', '#DDFBEC', '#00897B', '#0A2420', '#5A8078', false,
      ['#00897B', '#00ACC1', '#26A69A', '#4DB6AC', '#00695C']),
    T('CLARO · turquesa',     '#F0FBFF', '#FFFFFF', '#DCF4FF', '#0097A7', '#082A30', '#5A8890', false,
      ['#0097A7', '#00BCD4', '#26C6DA', '#4DD0E1', '#00838F']),
    T('CLARO · céu',          '#F4F9FF', '#FFFFFF', '#E3EFFF', '#1976D2', '#0A1A2E', '#607A98', false,
      ['#1976D2', '#42A5F5', '#90CAF9', '#0288D1', '#0D47A1']),
    T('CLARO · lavanda',      '#F9F6FF', '#FFFFFF', '#EDE5FF', '#7E57C2', '#1C1030', '#7A6A98', false,
      ['#7E57C2', '#9575CD', '#B39DDB', '#673AB7', '#512DA8']),
    T('CLARO · orquídea',     '#FFF4FB', '#FFFFFF', '#FFE3F5', '#C026A3', '#2A0A20', '#90708A', false,
      ['#C026A3', '#E040FB', '#F06292', '#BA68C8', '#8E24AA']),
    T('CLARO · areia',        '#FDFAF3', '#FFFFFF', '#F5EEDC', '#A47C48', '#2A2010', '#8A7C60', false,
      ['#A47C48', '#C9A227', '#D4A373', '#E9C46A', '#8D6E63']),
    T('CLARO · grafite',      '#F5F6F8', '#FFFFFF', '#E8EAEF', '#455A64', '#101820', '#708090', false,
      ['#455A64', '#607D8B', '#90A4AE', '#37474F', '#B0BEC5'])
  ];

  /** Formato CSS RRGGBBAA (alpha por último). color = '#RRGGBB'. */
  function hexA(color, alpha) {
    var a = Math.max(0, Math.min(255, Math.floor(Number(alpha) || 0)));
    var aa = a.toString(16).toUpperCase();
    if (aa.length < 2) aa = '0' + aa;
    return color + aa;
  }

  /** Equivalente de NexusTheme.of(index): clampa para 0..size-1. */
  function of(index) {
    var i = Math.floor(Number(index));
    if (!isFinite(i)) i = 0;
    i = Math.max(0, Math.min(ALL.length - 1, i));
    return ALL[i];
  }

  window.Themes = {
    ALL: ALL,
    of: of,
    hexA: hexA
  };
})();
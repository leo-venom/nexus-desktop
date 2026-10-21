/* ============================================================
 * themes.js — TEMA ÚNICO (padrão).
 * O seletor de temas foi removido (ordem do Leo, 2026-10-21):
 * o shell NEXUS GAME/NEXUS DESKTOP segue UM tema padrão fixo.
 * Jogos, desenhos e objetos NÃO herdam mais a paleta do app:
 * a paleta vem do modelo de IA ou do que o pedido especificar.
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
      colors: colors || [],       // cores extras (só apresentação interna do shell)
      onAccent: onAccent || (isDark ? '#0A0E12' : '#FFFFFF')
    };
  }

  /* Único tema do app — BLACK CYBER.
     Base preta com detalhes em verde esmeralda, rosa e azul.
     Usado apenas pela interface do shell (header, modal, popover, páginas de
     sistema). Não vai para o prompt: jogos/desenhos escolhem a própria paleta. */
  var DEFAULT_THEME = T('PADRÃO · BLACK CYBER', '#000000', '#06100C', '#0B1A14', '#00E88A', '#E6F5EE', '#7FA894', true,
    ['#00E88A', '#FF2D95', '#00A3FF']);

  var ALL = [DEFAULT_THEME];

  /** Formato CSS RRGGBBAA (alpha por último). color = '#RRGGBB'. */
  function hexA(color, alpha) {
    var a = Math.max(0, Math.min(255, Math.floor(Number(alpha) || 0)));
    var aa = a.toString(16).toUpperCase();
    if (aa.length < 2) aa = '0' + aa;
    return color + aa;
  }

  /** Compatibilidade: sempre devolve o tema único, ignorando o índice. */
  function of(index) {
    return DEFAULT_THEME;
  }

  window.Themes = {
    ALL: ALL,
    DEFAULT: DEFAULT_THEME,
    of: of,
    hexA: hexA
  };
})();

/**
 * Paridad con `services/cardRowTheme.ts` + `constants/themeChest.ts` (firma HTML / filas).
 * Mantener sincronizado al añadir temas en themeChest.
 */

const DEFAULT_CARD_THEME_ID = 'obsidian';

/** @type {import('./cardRowTheme.types').CardTheme[]} */
const CARD_THEMES = [
  {
    id: 'deep_teal',
    background: ['#E0F7FA', '#B2EBF2', '#4DD0C8'],
    border: { color: '#00E5FF', width: 3 },
    title: { color: '#00695C', fontWeight: '900', fontStyle: 'normal' },
    subtitle: { color: '#00897B', fontWeight: '600', fontStyle: 'normal' },
    extraText: { color: '#2E7D72', fontSize: 11, fontWeight: '500', fontStyle: 'italic' },
    bubble: { backgroundColor: 'rgba(255,255,255,0.94)', borderRadius: 24 },
    icon: { color: '#00695C' },
  },
  {
    id: 'citrus_pop',
    background: ['#FFFDE7', '#FFF59D', '#FFEE58'],
    border: { color: '#76FF03', width: 3 },
    title: { color: '#E65100', fontWeight: '900', fontStyle: 'normal' },
    subtitle: { color: '#EF6C00', fontWeight: '600', fontStyle: 'normal' },
    extraText: { color: '#E65100', fontSize: 11, fontWeight: '500', fontStyle: 'italic' },
    bubble: { backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 22 },
    icon: { color: '#E65100' },
  },
  {
    id: 'sky_indigo',
    background: ['#E8EAF6', '#C5CAE9', '#9FA8DA'],
    border: { color: '#5C6BC0', width: 3 },
    title: { color: '#1A237E', fontWeight: '900', fontStyle: 'normal' },
    subtitle: { color: '#283593', fontWeight: '600', fontStyle: 'normal' },
    extraText: { color: '#3949AB', fontSize: 11, fontWeight: '500', fontStyle: 'italic' },
    bubble: { backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 22 },
    icon: { color: '#1A237E' },
  },
  {
    id: 'pure_snow',
    background: ['#FFFFFF', '#F5F5F5', '#EEEEEE'],
    border: { color: '#BDBDBD', width: 3 },
    title: { color: '#212121', fontWeight: '800', fontStyle: 'normal' },
    subtitle: { color: '#616161', fontWeight: '600', fontStyle: 'normal' },
    extraText: { color: '#757575', fontSize: 11, fontWeight: '500', fontStyle: 'normal' },
    bubble: { backgroundColor: 'rgba(250,250,250,0.98)', borderRadius: 14 },
    icon: { color: '#424242' },
  },
  {
    id: 'neon_matrix',
    background: ['#1B1B1B', '#121212', '#0A0A0A'],
    border: { color: '#00E676', width: 3 },
    title: { color: '#00E676', fontWeight: '800', fontStyle: 'normal' },
    subtitle: { color: '#69F0AE', fontWeight: '600', fontStyle: 'normal' },
    extraText: { color: '#69F0AE', fontSize: 11, fontWeight: '500', fontStyle: 'italic' },
    bubble: { backgroundColor: 'rgba(0,230,118,0.12)', borderRadius: 16 },
    icon: { color: '#00E676' },
  },
  {
    id: 'lavender_blush',
    background: ['#FCE4EC', '#F8BBD0', '#F48FB1'],
    border: { color: '#E0E0E0', width: 3 },
    title: { color: '#AD1457', fontWeight: '800', fontStyle: 'normal' },
    subtitle: { color: '#C2185B', fontWeight: '600', fontStyle: 'normal' },
    extraText: { color: '#AD1457', fontSize: 11, fontWeight: '500', fontStyle: 'italic' },
    bubble: { backgroundColor: 'rgba(255,255,255,0.88)', borderRadius: 18 },
    icon: { color: '#C2185B' },
  },
  {
    id: 'royal_navy',
    background: ['#0D1B2A', '#1B2838', '#162032'],
    border: { color: '#7A4DFF', width: 3.5 },
    title: { color: '#7A4DFF', fontWeight: '800', fontStyle: 'normal' },
    subtitle: { color: '#E6C966', fontWeight: '600', fontStyle: 'normal' },
    extraText: { color: '#C9A227', fontSize: 11, fontWeight: '500', fontStyle: 'italic' },
    bubble: { backgroundColor: 'rgba(212,175,55,0.15)', borderRadius: 20 },
    icon: { color: '#7A4DFF' },
  },
  {
    id: 'obsidian',
    background: ['#1C1C1C', '#121212', '#050505'],
    border: { color: '#B0BEC5', width: 3.5 },
    title: { color: '#ECEFF1', fontWeight: '800', fontStyle: 'normal' },
    subtitle: { color: '#B0BEC5', fontWeight: '600', fontStyle: 'normal' },
    extraText: { color: '#90A4AE', fontSize: 11, fontWeight: '500', fontStyle: 'italic' },
    bubble: { backgroundColor: 'rgba(176,190,197,0.14)', borderRadius: 18 },
    icon: { color: '#CFD8DC' },
  },
  {
    id: 'emerald_crown',
    background: ['#003D33', '#00695C', '#00897B'],
    border: { color: '#7A4DFF', width: 3.5 },
    title: { color: '#FFFFFF', fontWeight: '800', fontStyle: 'normal' },
    subtitle: { color: '#A7FFEB', fontWeight: '600', fontStyle: 'normal' },
    extraText: { color: '#80CBC4', fontSize: 11, fontWeight: '500', fontStyle: 'italic' },
    bubble: { backgroundColor: 'rgba(212,175,55,0.18)', borderRadius: 22 },
    icon: { color: '#7A4DFF' },
  },
  {
    id: 'texas_burnt_orange',
    background: ['#BF5700', '#9E4500', '#6D3000'],
    border: { color: '#FFFFFF', width: 3.5 },
    title: { color: '#FFFFFF', fontWeight: '800', fontStyle: 'normal' },
    subtitle: { color: '#FFCCBC', fontWeight: '600', fontStyle: 'normal' },
    extraText: { color: '#FFCCBC', fontSize: 11, fontWeight: '500', fontStyle: 'italic' },
    bubble: { backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 20 },
    icon: { color: '#FFFFFF' },
  },
  {
    id: 'texas_whiteout',
    background: ['#FFFFFF', '#F5F5F5', '#EEEEEE'],
    border: { color: '#BF5700', width: 3 },
    title: { color: '#BF5700', fontWeight: '800', fontStyle: 'normal' },
    subtitle: { color: '#5D4037', fontWeight: '600', fontStyle: 'normal' },
    extraText: { color: '#795548', fontSize: 11, fontWeight: '500', fontStyle: 'normal' },
    bubble: { backgroundColor: 'rgba(191,87,0,0.08)', borderRadius: 14 },
    icon: { color: '#BF5700' },
  },
  {
    id: 'texas_night_game',
    background: ['#0D1117', '#161B22', '#1F2937'],
    border: { color: '#BF5700', width: 3.5 },
    title: { color: '#BF5700', fontWeight: '800', fontStyle: 'normal' },
    subtitle: { color: '#9CA3AF', fontWeight: '600', fontStyle: 'normal' },
    extraText: { color: '#9CA3AF', fontSize: 11, fontWeight: '500', fontStyle: 'italic' },
    bubble: { backgroundColor: 'rgba(191,87,0,0.12)', borderRadius: 18 },
    icon: { color: '#BF5700' },
  },
];

const FALLBACK_CARD_ROW = {
  gradient: ['#F2F2F7', '#F2F2F7', '#F2F2F7'],
  borderColor: 'rgba(47,123,255,0.35)',
  borderWidth: 1,
  titleColor: '#1C1C1E',
  titleFontWeight: '800',
  titleFontStyle: 'normal',
  metaColor: '#636366',
  subtitleFontWeight: '600',
  subtitleFontStyle: 'normal',
  extraColor: '#8E8E93',
  extraFontSize: 11,
  extraFontWeight: '500',
  extraFontStyle: 'italic',
  iconColor: '#2F7BFF',
  bubbleBackgroundColor: 'rgba(255,255,255,0.82)',
  bubbleBorderRadius: 14,
};

function getThemeById(id) {
  const key = String(id || '').trim();
  if (!key) return undefined;
  return CARD_THEMES.find((t) => t.id === key);
}

/** @param {string | undefined} themeId */
function getCardRowTheme(themeId) {
  const t = getThemeById(themeId || DEFAULT_CARD_THEME_ID);
  if (!t) {
    return { ...FALLBACK_CARD_ROW };
  }
  return {
    gradient: [t.background[0], t.background[1], t.background[2]],
    borderColor: t.border.color,
    borderWidth: t.border.width,
    titleColor: t.title.color,
    titleFontWeight: t.title.fontWeight,
    titleFontStyle: t.title.fontStyle,
    metaColor: t.subtitle.color,
    subtitleFontWeight: t.subtitle.fontWeight,
    subtitleFontStyle: t.subtitle.fontStyle,
    extraColor: t.extraText.color,
    extraFontSize: t.extraText.fontSize,
    extraFontWeight: t.extraText.fontWeight,
    extraFontStyle: t.extraText.fontStyle,
    iconColor: t.icon.color,
    bubbleBackgroundColor: t.bubble.backgroundColor,
    bubbleBorderRadius: t.bubble.borderRadius,
  };
}

module.exports = {
  DEFAULT_CARD_THEME_ID,
  CARD_THEMES,
  getThemeById,
  getCardRowTheme,
  FALLBACK_CARD_ROW,
};

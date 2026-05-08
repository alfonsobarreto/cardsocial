/**
 * Temas de la tarjeta universal (web). Colores alineados con themeChest; tipografía más fina
 * que el locker nativo para coincidir con la vista espejo en la app.
 */

export type ThemeTier = 'fresh' | 'moderno' | 'luxury';
export type ShadowStyle = 'drop' | 'inner' | 'none';
export type ThemeFontWeight = '300' | '400' | '500' | '600' | '700' | '800' | '900';
export type ThemeFontStyle = 'normal' | 'italic';

export type CardThemeText = {
  color: string;
  fontSize: number;
  fontWeight: ThemeFontWeight;
  fontStyle: ThemeFontStyle;
};

export type CardTheme = {
  id: string;
  name: string;
  tier: ThemeTier;
  background: [string, string, string];
  border: { color: string; width: number };
  title: CardThemeText;
  subtitle: CardThemeText;
  iconLabel: CardThemeText;
  extraText: CardThemeText;
  bubble: { backgroundColor: string; borderRadius: number };
  icon: { name: string; color: string; size: number };
  shadowStyle: ShadowStyle;
  locked: boolean;
  price: number;
};

const N = 'normal' as const;
const I = 'italic' as const;

export const CARD_THEMES: CardTheme[] = [
  // ═══ FRESH ═══
  {
    id: 'deep_teal', name: 'Deep Teal', tier: 'fresh',
    background: ['#E0F7FA', '#B2EBF2', '#4DD0C8'],
    border: { color: '#00E5FF', width: 3 },
    title: { color: '#00695C', fontSize: 22, fontWeight: '300', fontStyle: N },
    subtitle: { color: '#00897B', fontSize: 13, fontWeight: '300', fontStyle: N },
    iconLabel: { color: '#00796B', fontSize: 11, fontWeight: '300', fontStyle: N },
    extraText: { color: '#2E7D72', fontSize: 11, fontWeight: '300', fontStyle: I },
    bubble: { backgroundColor: 'rgba(255,255,255,0.94)', borderRadius: 24 },
    icon: { name: 'star-four-points', color: '#00695C', size: 32 },
    shadowStyle: 'drop', locked: false, price: 0,
  },
  {
    id: 'citrus_pop', name: 'Citrus Pop', tier: 'fresh',
    background: ['#FFFDE7', '#FFF59D', '#FFEE58'],
    border: { color: '#76FF03', width: 3 },
    title: { color: '#E65100', fontSize: 22, fontWeight: '300', fontStyle: N },
    subtitle: { color: '#EF6C00', fontSize: 13, fontWeight: '300', fontStyle: N },
    iconLabel: { color: '#F57C00', fontSize: 11, fontWeight: '300', fontStyle: N },
    extraText: { color: '#E65100', fontSize: 11, fontWeight: '300', fontStyle: I },
    bubble: { backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 22 },
    icon: { name: 'cloud', color: '#E65100', size: 32 },
    shadowStyle: 'drop', locked: false, price: 0,
  },
  {
    id: 'sky_indigo', name: 'Sky Indigo', tier: 'fresh',
    background: ['#E8EAF6', '#C5CAE9', '#9FA8DA'],
    border: { color: '#5C6BC0', width: 3 },
    title: { color: '#1A237E', fontSize: 22, fontWeight: '300', fontStyle: N },
    subtitle: { color: '#283593', fontSize: 13, fontWeight: '300', fontStyle: N },
    iconLabel: { color: '#3949AB', fontSize: 11, fontWeight: '300', fontStyle: N },
    extraText: { color: '#3949AB', fontSize: 11, fontWeight: '300', fontStyle: I },
    bubble: { backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 22 },
    icon: { name: 'bell', color: '#1A237E', size: 32 },
    shadowStyle: 'drop', locked: false, price: 0,
  },
  // ═══ MODERNO ═══
  {
    id: 'pure_snow', name: 'Pure Snow', tier: 'moderno',
    background: ['#FFFFFF', '#F5F5F5', '#EEEEEE'],
    border: { color: '#BDBDBD', width: 3 },
    title: { color: '#212121', fontSize: 22, fontWeight: '300', fontStyle: N },
    subtitle: { color: '#616161', fontSize: 13, fontWeight: '300', fontStyle: N },
    iconLabel: { color: '#424242', fontSize: 11, fontWeight: '300', fontStyle: N },
    extraText: { color: '#757575', fontSize: 11, fontWeight: '300', fontStyle: N },
    bubble: { backgroundColor: 'rgba(250,250,250,0.98)', borderRadius: 14 },
    icon: { name: 'account', color: '#424242', size: 32 },
    shadowStyle: 'none', locked: false, price: 0,
  },
  {
    id: 'neon_matrix', name: 'Neon Matrix', tier: 'moderno',
    background: ['#1B1B1B', '#121212', '#0A0A0A'],
    border: { color: '#00E676', width: 3 },
    title: { color: '#00E676', fontSize: 22, fontWeight: '300', fontStyle: N },
    subtitle: { color: '#69F0AE', fontSize: 13, fontWeight: '300', fontStyle: N },
    iconLabel: { color: '#B9F6CA', fontSize: 11, fontWeight: '300', fontStyle: N },
    extraText: { color: '#69F0AE', fontSize: 11, fontWeight: '300', fontStyle: I },
    bubble: { backgroundColor: 'rgba(0,230,118,0.12)', borderRadius: 16 },
    icon: { name: 'key-variant', color: '#00E676', size: 32 },
    shadowStyle: 'none', locked: false, price: 0,
  },
  {
    id: 'lavender_blush', name: 'Lavender Blush', tier: 'moderno',
    background: ['#FCE4EC', '#F8BBD0', '#F48FB1'],
    border: { color: '#E0E0E0', width: 3 },
    title: { color: '#AD1457', fontSize: 22, fontWeight: '300', fontStyle: N },
    subtitle: { color: '#C2185B', fontSize: 13, fontWeight: '300', fontStyle: N },
    iconLabel: { color: '#880E4F', fontSize: 11, fontWeight: '300', fontStyle: N },
    extraText: { color: '#AD1457', fontSize: 11, fontWeight: '300', fontStyle: I },
    bubble: { backgroundColor: 'rgba(255,255,255,0.88)', borderRadius: 18 },
    icon: { name: 'diamond-stone', color: '#C2185B', size: 32 },
    shadowStyle: 'none', locked: false, price: 0,
  },
  // ═══ LUXURY ═══
  {
    id: 'royal_navy', name: 'Royal Navy', tier: 'luxury',
    background: ['#0D1B2A', '#1B2838', '#162032'],
    border: { color: '#D4AF37', width: 3.5 },
    title: { color: '#D4AF37', fontSize: 22, fontWeight: '300', fontStyle: N },
    subtitle: { color: '#E6C966', fontSize: 13, fontWeight: '300', fontStyle: N },
    iconLabel: { color: '#F0D875', fontSize: 11, fontWeight: '300', fontStyle: N },
    extraText: { color: '#C9A227', fontSize: 11, fontWeight: '300', fontStyle: I },
    bubble: { backgroundColor: 'rgba(212,175,55,0.15)', borderRadius: 20 },
    icon: { name: 'shield-check', color: '#D4AF37', size: 32 },
    shadowStyle: 'inner', locked: false, price: 0,
  },
  {
    id: 'obsidian', name: 'Obsidian', tier: 'luxury',
    background: ['#1C1C1C', '#121212', '#050505'],
    border: { color: '#B0BEC5', width: 3.5 },
    title: { color: '#ECEFF1', fontSize: 22, fontWeight: '300', fontStyle: N },
    subtitle: { color: '#B0BEC5', fontSize: 13, fontWeight: '300', fontStyle: N },
    iconLabel: { color: '#90A4AE', fontSize: 11, fontWeight: '300', fontStyle: N },
    extraText: { color: '#90A4AE', fontSize: 11, fontWeight: '300', fontStyle: I },
    bubble: { backgroundColor: 'rgba(176,190,197,0.14)', borderRadius: 18 },
    icon: { name: 'lock', color: '#CFD8DC', size: 32 },
    shadowStyle: 'inner', locked: false, price: 0,
  },
  {
    id: 'emerald_crown', name: 'Emerald Crown', tier: 'luxury',
    background: ['#003D33', '#00695C', '#00897B'],
    border: { color: '#D4AF37', width: 3.5 },
    title: { color: '#FFFFFF', fontSize: 22, fontWeight: '300', fontStyle: N },
    subtitle: { color: '#A7FFEB', fontSize: 13, fontWeight: '300', fontStyle: N },
    iconLabel: { color: '#B2DFDB', fontSize: 11, fontWeight: '300', fontStyle: N },
    extraText: { color: '#80CBC4', fontSize: 11, fontWeight: '300', fontStyle: I },
    bubble: { backgroundColor: 'rgba(212,175,55,0.18)', borderRadius: 22 },
    icon: { name: 'crown', color: '#D4AF37', size: 32 },
    shadowStyle: 'inner', locked: false, price: 0,
  },
  // ═══ Texas bundle ═══
  {
    id: 'texas_burnt_orange', name: 'Texas Burnt Orange', tier: 'luxury',
    background: ['#BF5700', '#9E4500', '#6D3000'],
    border: { color: '#FFFFFF', width: 3.5 },
    title: { color: '#FFFFFF', fontSize: 22, fontWeight: '300', fontStyle: N },
    subtitle: { color: '#FFCCBC', fontSize: 13, fontWeight: '300', fontStyle: N },
    iconLabel: { color: '#FFE0B2', fontSize: 11, fontWeight: '300', fontStyle: N },
    extraText: { color: '#FFCCBC', fontSize: 11, fontWeight: '300', fontStyle: I },
    bubble: { backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 20 },
    icon: { name: 'star-four-points', color: '#FFFFFF', size: 32 },
    shadowStyle: 'drop', locked: false, price: 0,
  },
  {
    id: 'texas_whiteout', name: 'Texas Whiteout', tier: 'moderno',
    background: ['#FFFFFF', '#F5F5F5', '#EEEEEE'],
    border: { color: '#BF5700', width: 3 },
    title: { color: '#BF5700', fontSize: 22, fontWeight: '300', fontStyle: N },
    subtitle: { color: '#5D4037', fontSize: 13, fontWeight: '300', fontStyle: N },
    iconLabel: { color: '#8D4E37', fontSize: 11, fontWeight: '300', fontStyle: N },
    extraText: { color: '#795548', fontSize: 11, fontWeight: '300', fontStyle: N },
    bubble: { backgroundColor: 'rgba(191,87,0,0.08)', borderRadius: 14 },
    icon: { name: 'flag', color: '#BF5700', size: 32 },
    shadowStyle: 'none', locked: false, price: 0,
  },
  {
    id: 'texas_night_game', name: 'Texas Night Game', tier: 'luxury',
    background: ['#0D1117', '#161B22', '#1F2937'],
    border: { color: '#BF5700', width: 3.5 },
    title: { color: '#BF5700', fontSize: 22, fontWeight: '300', fontStyle: N },
    subtitle: { color: '#9CA3AF', fontSize: 13, fontWeight: '300', fontStyle: N },
    iconLabel: { color: '#D1D5DB', fontSize: 11, fontWeight: '300', fontStyle: N },
    extraText: { color: '#9CA3AF', fontSize: 11, fontWeight: '300', fontStyle: I },
    bubble: { backgroundColor: 'rgba(191,87,0,0.12)', borderRadius: 18 },
    icon: { name: 'stadium-variant', color: '#BF5700', size: 32 },
    shadowStyle: 'inner', locked: false, price: 0,
  },
];

export const DEFAULT_THEME = CARD_THEMES.find((t) => t.id === 'obsidian')!;

export function getThemeById(id: string | null | undefined): CardTheme {
  if (!id) return DEFAULT_THEME;
  return CARD_THEMES.find((t) => t.id === id) ?? DEFAULT_THEME;
}

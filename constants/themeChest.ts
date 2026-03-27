/**
 * themeChest.ts
 * Data for the 9 Card Themes organized in 3 tiers: Fresh, Moderno, Luxury.
 *
 * Each theme defines the visual identity of a user's card preview:
 *   background (3-stop vertical gradient), border, title, subtitle, icon, shadow.
 */

export type ThemeTier = 'fresh' | 'moderno' | 'luxury';
export type ShadowStyle = 'drop' | 'inner' | 'none';

export type CardTheme = {
  id: string;
  name: string;
  tier: ThemeTier;
  /** 3-stop vertical gradient [top, mid, bottom] */
  background: [string, string, string];
  border: {
    color: string;
    width: number;
  };
  title: {
    color: string;
    fontSize: number;
  };
  subtitle: {
    color: string;
    fontSize: number;
  };
  icon: {
    /** MaterialCommunityIcons name */
    name: string;
    color: string;
    size: number;
  };
  shadowStyle: ShadowStyle;
  /** Whether the theme requires purchase */
  locked: boolean;
  /** Price in credits (0 = free) */
  price: number;
};

// ── Tier labels ──────────────────────────────────────────────────────────────

export const TIER_META: Record<ThemeTier, { label: [string, string]; emoji: string }> = {
  fresh:   { label: ['Frescos', 'Fresh'],     emoji: '🌿' },
  moderno: { label: ['Modernos', 'Modern'],   emoji: '⚡' },
  luxury:  { label: ['De Lujo', 'Luxury'],    emoji: '👑' },
};

// ── 9 Themes ─────────────────────────────────────────────────────────────────

export const CARD_THEMES: CardTheme[] = [
  // ═══ FRESH (1-3) — light, airy, vibrant ═══════════════════════════════════
  {
    id: 'deep_teal',
    name: 'Deep Teal',
    tier: 'fresh',
    background: ['#B2FEFA', '#80ECD8', '#4DE2C0'],
    border: { color: '#00E5FF', width: 3 },
    title:    { color: '#00695C', fontSize: 22 },
    subtitle: { color: '#00897B', fontSize: 13 },
    icon:     { name: 'star-four-points', color: '#00796B', size: 32 },
    shadowStyle: 'drop',
    locked: false,
    price: 0,
  },
  {
    id: 'citrus_pop',
    name: 'Citrus Pop',
    tier: 'fresh',
    background: ['#FEFFC8', '#E8F48C', '#C5E860'],
    border: { color: '#76FF03', width: 3 },
    title:    { color: '#E65100', fontSize: 22 },
    subtitle: { color: '#F57C00', fontSize: 13 },
    icon:     { name: 'cloud', color: '#EF6C00', size: 32 },
    shadowStyle: 'drop',
    locked: false,
    price: 0,
  },
  {
    id: 'sky_indigo',
    name: 'Sky Indigo',
    tier: 'fresh',
    background: ['#C5CAE9', '#9FA8DA', '#7986CB'],
    border: { color: '#5C6BC0', width: 3 },
    title:    { color: '#1A237E', fontSize: 22 },
    subtitle: { color: '#3949AB', fontSize: 13 },
    icon:     { name: 'bell', color: '#283593', size: 32 },
    shadowStyle: 'drop',
    locked: false,
    price: 0,
  },

  // ═══ MODERNO (4-6) — neutral, clean, dark-friendly ════════════════════════
  {
    id: 'pure_snow',
    name: 'Pure Snow',
    tier: 'moderno',
    background: ['#FAFAFA', '#F0F0F0', '#E8E8E8'],
    border: { color: '#BDBDBD', width: 3 },
    title:    { color: '#212121', fontSize: 22 },
    subtitle: { color: '#757575', fontSize: 13 },
    icon:     { name: 'account', color: '#424242', size: 32 },
    shadowStyle: 'none',
    locked: true,
    price: 50,
  },
  {
    id: 'neon_matrix',
    name: 'Neon Matrix',
    tier: 'moderno',
    background: ['#1B1B1B', '#0D2818', '#0A1F14'],
    border: { color: '#00E676', width: 3 },
    title:    { color: '#00E676', fontSize: 22 },
    subtitle: { color: '#69F0AE', fontSize: 13 },
    icon:     { name: 'key-variant', color: '#00E676', size: 32 },
    shadowStyle: 'none',
    locked: true,
    price: 75,
  },
  {
    id: 'lavender_blush',
    name: 'Lavender Blush',
    tier: 'moderno',
    background: ['#FCE4EC', '#F8BBD0', '#F48FB1'],
    border: { color: '#E0E0E0', width: 3 },
    title:    { color: '#C2185B', fontSize: 22 },
    subtitle: { color: '#E91E63', fontSize: 13 },
    icon:     { name: 'diamond-stone', color: '#AD1457', size: 32 },
    shadowStyle: 'none',
    locked: true,
    price: 75,
  },

  // ═══ LUXURY (7-9) — dark, premium, metallic accents ═══════════════════════
  {
    id: 'royal_navy',
    name: 'Royal Navy',
    tier: 'luxury',
    background: ['#0D1B2A', '#1B2838', '#162032'],
    border: { color: '#D4AF37', width: 3.5 },
    title:    { color: '#D4AF37', fontSize: 22 },
    subtitle: { color: '#E6C966', fontSize: 13 },
    icon:     { name: 'shield-check', color: '#D4AF37', size: 32 },
    shadowStyle: 'inner',
    locked: true,
    price: 150,
  },
  {
    id: 'obsidian',
    name: 'Obsidian',
    tier: 'luxury',
    background: ['#1C1C1C', '#121212', '#0A0A0A'],
    border: { color: '#9E9E9E', width: 3.5 },
    title:    { color: '#BDBDBD', fontSize: 22 },
    subtitle: { color: '#757575', fontSize: 13 },
    icon:     { name: 'lock', color: '#9E9E9E', size: 32 },
    shadowStyle: 'inner',
    locked: true,
    price: 150,
  },
  {
    id: 'emerald_crown',
    name: 'Emerald Crown',
    tier: 'luxury',
    background: ['#004D40', '#00695C', '#00897B'],
    border: { color: '#D4AF37', width: 3.5 },
    title:    { color: '#FFFFFF', fontSize: 22 },
    subtitle: { color: '#A7FFEB', fontSize: 13 },
    icon:     { name: 'crown', color: '#D4AF37', size: 32 },
    shadowStyle: 'inner',
    locked: true,
    price: 200,
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

export function getThemeById(id: string): CardTheme | undefined {
  return CARD_THEMES.find((t) => t.id === id);
}

export function getThemesByTier(tier: ThemeTier): CardTheme[] {
  return CARD_THEMES.filter((t) => t.tier === tier);
}

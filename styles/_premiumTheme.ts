/**
 * Prefijo `_` en el nombre: Expo Router ignora este archivo (no es una pantalla).
 * Paleta premium (derivada / corregida del brief Stitch).
 * - Sintaxis válida, `as const` para tuplas.
 * - Modo claro: `onAccent` oscuro sobre oro (#E9C349) para contraste WCAG en CTAs shell.
 * - Superficies (Fase 2): día `#FFFFFF` sobre shell; noche `#1C1C1E` sobre lienzo `#000000`.
 * - Acento único cascarón (Fase 4): `#E9C349` dorado vibrante — sin azules de sistema (#007AFF / #0D4D8A).
 * Mapea estos tokens a `app/theme.ts` cuando integres el diseño global.
 */

/** Dorado principal shell (todas las plataformas que lean premium). */
export const SHELL_ACCENT_GOLD = '#E9C349' as const;

export const premiumTheme = {
  light: {
    /** Lienzo del cascarón (Fase 1): pared única día. */
    background: '#F2F2F7',
    /** Misma tinta para capas sobre gradiente/tab bar cuando aplica blur. */
    backgroundTranslucent: 'rgba(242, 242, 247, 0.94)',
    text: '#1C1C1E',
    textSecondary: '#636366',
    divider: '#E5E5EA',
    accent: '#E9C349',
    success: '#34C759',
    danger: '#FF3B30',

    surface: '#FFFFFF',
    surfaceElevated: '#FFFFFF',
    border: '#C6C6C8',
    muted: '#8E8E93',
    overlay: 'rgba(0, 0, 0, 0.5)',
    /** Texto/iconos sobre CTAs dorados (#E9C349). */
    onAccent: '#1C1C1E',
    /** Texto/iconos sobre la franja VIP (gradiente oscuro → oro). */
    onVipBanner: '#FFFFFF',
    vipBannerIcon: '#1C1C1E',
    vipBannerChevron: '#F5F0E6',

    accentPressed: '#BF9E26',
    accentDisabled: '#E5E5EA',
    dangerMuted: 'rgba(255, 59, 48, 0.1)',
    focus: '#E9C349',

    tabShellGradient: ['#F2F2F7', '#F2F2F7', '#F2F2F7'] as const,
    vipBannerGradient: ['#0F1419', '#1A2332', '#D4BD45'] as const,
    /** Marco modal / drawer (oro vibrante). */
    luxuryFrameGradient: ['#A68B5B', '#E9C349', '#F8EED0', '#E9C349', '#9A8048'] as const,
    /** Botón primario metálico (CREAR, Card-Studio, etc.). */
    luxuryCtaGradient: ['#8B7340', '#E9C349', '#FFF4D8', '#F2CA50', '#C9A227', '#7A6228'] as const,
  },

  dark: {
    background: '#000000',
    /** Pared cascarón noche (sin gris intermedios en el gradiente shell). */
    backgroundTranslucent: '#000000',
    text: '#FFFFFF',
    textSecondary: '#8E8E93',
    divider: '#3A3A3C',
    accent: '#E9C349',
    success: '#30D158',
    danger: '#FF453A',

    surface: '#1C1C1E',
    surfaceElevated: '#1C1C1E',
    border: '#3A3A3C',
    muted: '#48484A',
    overlay: 'rgba(0, 0, 0, 0.5)',
    onAccent: '#0C0C0C',
    onVipBanner: '#FFFFFF',
    vipBannerIcon: '#0C0C0C',
    vipBannerChevron: '#F5F0E6',

    accentPressed: '#D1B848',
    accentDisabled: '#2C2C2E',
    dangerMuted: 'rgba(255, 69, 58, 0.15)',
    focus: '#E9C349',

    tabShellGradient: ['#000000', '#000000', '#000000'] as const,
    vipBannerGradient: ['#0A0804', '#1C1810', '#DCA832'] as const,
    luxuryFrameGradient: ['#5C4D32', '#B8942E', '#E8D4A3', '#DCA832', '#5C4D32'] as const,
    luxuryCtaGradient: ['#6B5420', '#B8942E', '#FFEFD0', '#F2CA50', '#E9C349', '#6B5420'] as const,
  },
} as const;

export type PremiumTheme = typeof premiumTheme;
export type PremiumMode = keyof PremiumTheme;
export type PremiumTokens = PremiumTheme['light'];

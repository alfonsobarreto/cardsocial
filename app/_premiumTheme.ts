/**
 * Prefijo `_` en el nombre: Expo Router ignora este archivo (no es una pantalla).
 * Paleta premium (derivada / corregida del brief Stitch).
 * - Sintaxis válida, `as const` para tuplas.
 * - Modo claro: `onAccent` oscuro sobre oro (#D4AF37) para WCAG AA en texto de botón ~14px.
 * - Modo oscuro: `vipBannerGradient` incluye acento lujo (no solo grises).
 * Mapea estos tokens a `app/theme.ts` cuando integres el diseño global.
 */

export const premiumTheme = {
  light: {
    background: '#FFFFFF',
    backgroundTranslucent: 'rgba(255, 255, 255, 0.9)',
    text: '#1C1C1E',
    textSecondary: '#636366',
    divider: '#E5E5EA',
    accent: '#D4AF37',
    success: '#34C759',
    danger: '#FF3B30',

    surface: '#F2F2F7',
    surfaceElevated: '#FFFFFF',
    border: '#C6C6C8',
    muted: '#8E8E93',
    overlay: 'rgba(0, 0, 0, 0.4)',
    /** Texto/iconos sobre botones o chips de color `accent` (oro). */
    onAccent: '#1C1C1E',
    /** Texto/iconos sobre la franja VIP (gradiente oscuro → oro). */
    onVipBanner: '#FFFFFF',
    vipBannerIcon: '#1C1C1E',
    vipBannerChevron: '#F5F0E6',

    accentPressed: '#B8860B',
    accentDisabled: '#E5E5EA',
    dangerMuted: 'rgba(255, 59, 48, 0.1)',
    focus: '#007AFF',

    tabShellGradient: ['#F2F2F7', '#E8E8ED', '#E5E5EA'] as const,
    vipBannerGradient: ['#0F1419', '#1A2332', '#B8962E'] as const,
    /** Marco modal / drawer (oro). */
    luxuryFrameGradient: ['#A68B5B', '#D4AF37', '#F8EED0', '#D4AF37', '#9A8048'] as const,
    /** Botón primario metálico (CREAR, Card-Studio, etc.). */
    luxuryCtaGradient: ['#8B7340', '#D4AF37', '#FFF4D8', '#F2CA50', '#C9A227', '#7A6228'] as const,
  },

  dark: {
    background: '#000000',
    backgroundTranslucent: 'rgba(0, 0, 0, 0.88)',
    text: '#FFFFFF',
    textSecondary: '#8E8E93',
    divider: '#1C1C1E',
    accent: '#D4AF37',
    success: '#30D158',
    danger: '#FF453A',

    surface: '#1C1C1E',
    surfaceElevated: '#2C2C2E',
    border: '#3A3A3C',
    muted: '#48484A',
    overlay: 'rgba(0, 0, 0, 0.6)',
    onAccent: '#0C0C0C',
    onVipBanner: '#FFFFFF',
    vipBannerIcon: '#0C0C0C',
    vipBannerChevron: '#F5F0E6',

    accentPressed: '#C5A028',
    accentDisabled: '#2C2C2E',
    dangerMuted: 'rgba(255, 69, 58, 0.15)',
    focus: '#0A84FF',

    tabShellGradient: ['#1C1C1E', '#0F0F10', '#000000'] as const,
    vipBannerGradient: ['#0A0804', '#1C1810', '#C9A227'] as const,
    luxuryFrameGradient: ['#5C4D32', '#B8942E', '#E8D4A3', '#C9A227', '#5C4D32'] as const,
    luxuryCtaGradient: ['#6B5420', '#B8942E', '#FFEFD0', '#F2CA50', '#D4AF37', '#6B5420'] as const,
  },
} as const;

export type PremiumTheme = typeof premiumTheme;
export type PremiumMode = keyof PremiumTheme;
export type PremiumTokens = PremiumTheme['light'];

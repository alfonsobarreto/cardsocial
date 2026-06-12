/**
 * Prefijo `_` en el nombre: Expo Router ignora este archivo (no es una pantalla).
 * Paleta premium alineada con Sistema Visual de Marca (Creature / kri-chühr).
 * - Acento cascarón: Electric Blue (#2F7BFF) + Digital Violet (#7A4DFF).
 * - Lienzo noche: Midnight Navy (#071226); día: Ice Blue / Soft Lavender.
 * Mapea estos tokens a `app/theme.ts`.
 */

import {
  brandAccentAlpha,
  brandColors,
  brandDarkSurfaces,
  brandGradients,
  brandTextOnDark,
  SHELL_ACCENT,
  SHELL_ACCENT_GOLD,
} from '@/styles/brandTokens';

export { SHELL_ACCENT, SHELL_ACCENT_GOLD };

const accentPressed = '#1F63D9';
const accentPressedDark = '#2568E0';

export const premiumTheme = {
  light: {
    background: brandColors.iceBlue,
    backgroundTranslucent: 'rgba(230, 244, 255, 0.94)',
    text: '#0A0A14',
    textSecondary: '#4A4A5C',
    divider: '#C8D8F0',
    accent: brandColors.electricBlue,
    accentSecondary: brandColors.digitalViolet,
    success: '#34C759',
    danger: '#FF3B30',

    surface: brandColors.white,
    surfaceElevated: brandColors.white,
    border: '#B8CCE8',
    muted: '#6E6E80',
    overlay: 'rgba(7, 18, 38, 0.5)',
    onAccent: brandColors.white,
    onVipBanner: brandColors.white,
    vipBannerIcon: brandColors.white,
    vipBannerChevron: brandColors.softLavender,

    accentPressed,
    accentDisabled: '#D8E4F5',
    dangerMuted: 'rgba(255, 59, 48, 0.1)',
    focus: brandColors.electricBlue,

    tabShellGradient: [brandColors.iceBlue, brandColors.iceBlue, brandColors.iceBlue] as const,
    vipBannerGradient: brandGradients.vipBanner,
    luxuryFrameGradient: brandGradients.frame,
    luxuryCtaGradient: brandGradients.cta,
  },

  dark: {
    background: brandColors.midnightNavy,
    backgroundTranslucent: brandColors.midnightNavy,
    text: brandTextOnDark.primary,
    textSecondary: brandTextOnDark.muted,
    divider: brandAccentAlpha.border22,
    accent: brandColors.electricBlue,
    accentSecondary: brandColors.digitalViolet,
    success: '#30D158',
    danger: '#FF453A',

    surface: brandDarkSurfaces.surface,
    surfaceElevated: brandDarkSurfaces.surfaceElevated,
    border: brandDarkSurfaces.searchBorder,
    muted: brandTextOnDark.subtle,
    overlay: 'rgba(7, 18, 38, 0.72)',
    onAccent: brandColors.white,
    onVipBanner: brandColors.white,
    vipBannerIcon: brandColors.white,
    vipBannerChevron: brandColors.softLavender,

    accentPressed: accentPressedDark,
    accentDisabled: brandDarkSurfaces.surface,
    dangerMuted: 'rgba(255, 69, 58, 0.15)',
    focus: brandColors.digitalViolet,

    tabShellGradient: [
      brandColors.midnightNavy,
      brandColors.midnightNavy,
      brandColors.midnightNavy,
    ] as const,
    vipBannerGradient: brandGradients.vipBanner,
    luxuryFrameGradient: brandGradients.frame,
    luxuryCtaGradient: brandGradients.cta,
  },
} as const;

export type PremiumTheme = typeof premiumTheme;
export type PremiumMode = keyof PremiumTheme;
export type PremiumTokens = PremiumTheme['light'];

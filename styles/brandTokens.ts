/**
 * Tokens de marca Card Social — Sistema Visual (estrategia Creature / kri-chühr).
 * Fuente de verdad compartida entre app móvil, frontend-web y admin-web.
 */

export const brandColors = {
  midnightNavy: '#071226',
  electricBlue: '#2F7BFF',
  digitalViolet: '#7A4DFF',
  softLavender: '#EAE4FF',
  iceBlue: '#E6F4FF',
  white: '#FFFFFF',
} as const;

/** Superficies modo noche — elevación sutil sobre Midnight Navy (sin violeta saturado). */
export const brandDarkSurfaces = {
  surface: '#0C1729',
  surfaceElevated: '#101E34',
  iconCircle: '#0D1B30',
  searchField: 'rgba(230, 244, 255, 0.06)',
  searchBorder: 'rgba(47, 123, 255, 0.22)',
} as const;

/** Texto sobre fondos oscuros — usa Soft Lavender / Ice Blue del PDF. */
export const brandTextOnDark = {
  primary: brandColors.white,
  muted: 'rgba(234, 228, 255, 0.62)',
  subtle: 'rgba(230, 244, 255, 0.45)',
} as const;

/** Acento principal del cascarón (Electric Blue). */
export const SHELL_ACCENT = brandColors.electricBlue;

/** @deprecated Usar SHELL_ACCENT — alias temporal para migración desde dorado. */
export const SHELL_ACCENT_GOLD = SHELL_ACCENT;

export const brandGradients = {
  blueToViolet: [brandColors.electricBlue, brandColors.digitalViolet] as const,
  navyToViolet: [brandColors.midnightNavy, brandColors.digitalViolet] as const,
  navyToBlue: [brandColors.midnightNavy, brandColors.electricBlue] as const,
  cta: [
    brandColors.electricBlue,
    '#4D8FFF',
    brandColors.digitalViolet,
    '#6235E0',
    brandColors.electricBlue,
  ] as const,
  frame: [
    brandColors.midnightNavy,
    brandColors.electricBlue,
    brandColors.digitalViolet,
    brandColors.electricBlue,
    brandColors.midnightNavy,
  ] as const,
  vipBanner: [brandColors.midnightNavy, brandDarkSurfaces.surfaceElevated, brandColors.digitalViolet] as const,
} as const;

/** RGBA helpers para overlays sobre acento azul (#2F7BFF) y violeta (#7A4DFF). */
export const brandAccentAlpha = {
  border22: 'rgba(47, 123, 255, 0.22)',
  border35: 'rgba(47, 123, 255, 0.35)',
  border45: 'rgba(47, 123, 255, 0.45)',
  badge14: 'rgba(47, 123, 255, 0.14)',
  badge18: 'rgba(47, 123, 255, 0.18)',
  badge24: 'rgba(47, 123, 255, 0.24)',
  pressed14: 'rgba(47, 123, 255, 0.14)',
  pressed18: 'rgba(47, 123, 255, 0.18)',
  glow12: 'rgba(122, 77, 255, 0.12)',
  glow16: 'rgba(122, 77, 255, 0.16)',
  lavender08: 'rgba(234, 228, 255, 0.08)',
  ice06: 'rgba(230, 244, 255, 0.06)',
} as const;

export const brandTypography = {
  primary: 'Satoshi',
  secondary: 'Inter',
} as const;

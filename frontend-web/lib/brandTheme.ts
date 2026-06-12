/**
 * Tema web Card Social — Sistema Visual de Marca (Creature / kri-chühr).
 * Espejo de `styles/brandTokens.ts` para Next.js (sin alias @/ del monorepo móvil).
 */

export const brandColors = {
  midnightNavy: '#071226',
  electricBlue: '#2F7BFF',
  digitalViolet: '#7A4DFF',
  softLavender: '#EAE4FF',
  iceBlue: '#E6F4FF',
  white: '#FFFFFF',
} as const;

export const brandDarkSurfaces = {
  surface: '#0C1729',
  surfaceElevated: '#101E34',
  iconCircle: '#0D1B30',
  searchField: 'rgba(230, 244, 255, 0.06)',
  searchBorder: 'rgba(47, 123, 255, 0.22)',
} as const;

export const brandTextOnDark = {
  primary: brandColors.white,
  muted: 'rgba(234, 228, 255, 0.62)',
  subtle: 'rgba(230, 244, 255, 0.45)',
} as const;

export const brandAccentAlpha = {
  border22: 'rgba(47, 123, 255, 0.22)',
  border35: 'rgba(47, 123, 255, 0.35)',
  border45: 'rgba(47, 123, 255, 0.45)',
  badge14: 'rgba(47, 123, 255, 0.14)',
  badge18: 'rgba(47, 123, 255, 0.18)',
  glow12: 'rgba(122, 77, 255, 0.12)',
  glow16: 'rgba(122, 77, 255, 0.16)',
  lavender08: 'rgba(234, 228, 255, 0.08)',
  ice06: 'rgba(230, 244, 255, 0.06)',
} as const;

export const brandGradients = {
  cta: `linear-gradient(135deg, ${brandColors.electricBlue} 0%, #4D8FFF 45%, ${brandColors.digitalViolet} 100%)`,
  ctaHorizontal: `linear-gradient(90deg, ${brandColors.electricBlue} 0%, ${brandColors.digitalViolet} 100%)`,
  textHighlight: `linear-gradient(90deg, ${brandColors.electricBlue} 0%, ${brandColors.digitalViolet} 100%)`,
  brandBar: `linear-gradient(90deg, rgba(47, 123, 255, 0.15) 0%, rgba(0,0,0,0) 100%)`,
} as const;

export const brandTypography = {
  primary: 'Satoshi, ui-sans-serif, system-ui, sans-serif',
  secondary: 'var(--font-inter), Inter, ui-sans-serif, system-ui, sans-serif',
} as const;

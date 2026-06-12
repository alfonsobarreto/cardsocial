/**
 * Tema Card Studio / Vault web — alineado con Sistema Visual de Marca (6 colores PDF).
 */
import {
  brandAccentAlpha,
  brandColors,
  brandDarkSurfaces,
  brandGradients,
  brandTextOnDark,
} from './brandTheme';

export const studioTheme = {
  bg: brandColors.midnightNavy,
  surface: brandDarkSurfaces.surface,
  surfaceElevated: brandDarkSurfaces.surfaceElevated,
  border: brandDarkSurfaces.searchBorder,
  borderStrong: brandAccentAlpha.border35,
  gold: brandColors.electricBlue,
  goldLight: brandColors.iceBlue,
  goldDeep: brandColors.digitalViolet,
  lavender: brandColors.softLavender,
  ice: brandColors.iceBlue,
  text: brandTextOnDark.primary,
  textMuted: brandTextOnDark.muted,
  textSubtle: brandTextOnDark.subtle,
  fab: brandColors.digitalViolet,
  fabText: brandColors.white,
  error: '#FF6B6B',
  success: '#4ECDC4',
  iconCircleBg: brandDarkSurfaces.iconCircle,
  iconCircleBorder: brandAccentAlpha.border22,
  typeBadgeBg: brandAccentAlpha.badge14,
  typeBadgeText: brandColors.iceBlue,
  searchBg: brandDarkSurfaces.searchField,
  searchBorder: brandDarkSurfaces.searchBorder,
  headerWelcome: brandColors.softLavender,
} as const;

export const studioGradients = {
  cta: brandGradients.cta,
  brandBar: brandGradients.brandBar,
  title: brandGradients.textHighlight,
} as const;

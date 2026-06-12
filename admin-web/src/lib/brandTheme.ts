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
} as const;

export const brandGradients = {
  textHighlight: `linear-gradient(90deg, ${brandColors.electricBlue} 0%, ${brandColors.digitalViolet} 100%)`,
  cta: `linear-gradient(135deg, ${brandColors.electricBlue} 0%, ${brandColors.digitalViolet} 100%)`,
} as const;

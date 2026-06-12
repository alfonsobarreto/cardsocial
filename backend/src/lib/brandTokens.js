/**
 * Tokens de marca Card Social — Sistema Visual (Creature / kri-chühr).
 * Fuente compartida para HTML legacy, correos y rutas públicas del backend Azure.
 */
const brandColors = {
  midnightNavy: '#071226',
  electricBlue: '#2F7BFF',
  digitalViolet: '#7A4DFF',
  softLavender: '#EAE4FF',
  iceBlue: '#E6F4FF',
  white: '#FFFFFF',
};

const brandDarkSurfaces = {
  surface: '#0C1729',
  surfaceElevated: '#101E34',
};

const brandAccentAlpha = {
  border14: 'rgba(47, 123, 255, 0.14)',
  border22: 'rgba(47, 123, 255, 0.22)',
  border32: 'rgba(47, 123, 255, 0.32)',
  border35: 'rgba(47, 123, 255, 0.35)',
  glow08: 'rgba(47, 123, 255, 0.08)',
  glow10: 'rgba(47, 123, 255, 0.10)',
  glow28: 'rgba(47, 123, 255, 0.28)',
  glow35: 'rgba(47, 123, 255, 0.35)',
  violet08: 'rgba(122, 77, 255, 0.08)',
  violet10: 'rgba(122, 77, 255, 0.10)',
  violet92: 'rgba(77, 143, 255, 0.92)',
};

const brandGradients = {
  cta: `linear-gradient(90deg, #4D8FFF, ${brandColors.electricBlue}, ${brandColors.digitalViolet})`,
  ctaText: brandColors.white,
  pageBg: `linear-gradient(180deg, ${brandColors.midnightNavy} 0%, ${brandDarkSurfaces.surfaceElevated} 46%, ${brandColors.midnightNavy} 100%)`,
  radialBlue: `radial-gradient(circle at 18% 0%, ${brandAccentAlpha.border14}, transparent 32%)`,
  radialViolet: `radial-gradient(circle at 82% 6%, ${brandAccentAlpha.violet08}, transparent 28%)`,
  textHighlight: `linear-gradient(90deg, ${brandColors.electricBlue} 0%, ${brandColors.digitalViolet} 100%)`,
};

module.exports = { brandColors, brandAccentAlpha, brandGradients, brandDarkSurfaces };

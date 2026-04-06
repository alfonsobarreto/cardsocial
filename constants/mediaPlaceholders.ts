/**
 * Fallbacks visuales unificados cuando no hay foto de perfil o logo de negocio.
 */

export const MEDIA_PLACEHOLDER = {
  personBgLight: '#EAF7FF',
  personBorderLight: 'rgba(13, 77, 138, 0.22)',
  personIconLight: '#1EA7FF',
  personBgDark: '#0D2E40',
  personBorderDark: 'rgba(212, 175, 55, 0.22)',
  personIconDark: '#87C8E8',
  personIconName: 'account' as const,
  businessBgLight: '#EAF7FF',
  businessBorderLight: 'rgba(13, 77, 138, 0.22)',
  businessIconLight: '#C5A065',
  businessBgDark: '#0D2E40',
  businessBorderDark: 'rgba(212, 175, 55, 0.22)',
  businessIconDark: '#C5A065',
  businessIconName: 'storefront-outline' as const,
} as const;

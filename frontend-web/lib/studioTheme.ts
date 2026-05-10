/**
 * Tema "Luxurious" alineado con Vault / shell premium de la app móvil.
 * Valores de referencia para el scaffold; afinar con auditoría visual vs `vault.tsx`.
 */
export const studioTheme = {
  bg: '#000000',
  surface: '#0D0D0D',
  surfaceElevated: '#141414',
  border: 'rgba(233, 195, 73, 0.35)',
  borderStrong: 'rgba(233, 195, 73, 0.6)',
  gold: '#E9C349',
  goldLight: '#E9D8B0',
  goldDeep: '#8B7355',
  text: '#FFFFFF',
  textMuted: 'rgba(255,255,255,0.62)',
  textSubtle: 'rgba(255,255,255,0.45)',
  fab: '#C5A065',
  fabText: '#0A0A0A',
  error: '#FF6B6B',
  success: '#4ECDC4',
  iconCircleBg: '#1C1C1E',
  typeBadgeBg: 'rgba(233, 195, 73, 0.14)',
  typeBadgeText: '#E9D8B0',
} as const;

export const studioGradients = {
  cta: 'linear-gradient(135deg, #E8D5A3 0%, #C5A065 50%, #8B7355 100%)',
  brandBar: 'linear-gradient(90deg, rgba(197, 160, 101, 0.15) 0%, rgba(0,0,0,0) 100%)',
} as const;

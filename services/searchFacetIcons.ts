/**
 * Icono Material para facetas en listas de búsqueda (sin dependencias de RN).
 * Usado por `searchFacetQuickAction` y tests Fase 2.
 */
export function facetIconNameForSearch(type: string): string {
  const t = String(type || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
  if (t.includes('whatsapp')) return 'whatsapp';
  if (t.includes('instagram')) return 'instagram';
  if (t.includes('facebook')) return 'facebook';
  if (t.includes('linkedin')) return 'linkedin';
  if (t.includes('telegram')) return 'telegram';
  if (t.includes('twitter') || t === 'x') return 'twitter';
  if (t.includes('youtube')) return 'youtube';
  if (t.includes('tiktok')) return 'music-note';
  if (t.includes('snapchat')) return 'snapchat';
  if (t.includes('pinterest')) return 'pinterest';
  if (t.includes('email') || t.includes('correo')) return 'email-outline';
  if (t.includes('map') || t.includes('ubic')) return 'map-marker';
  if (t.includes('pdf') || t.includes('document')) return 'file-pdf-box';
  if (t.includes('link') || t.includes('web') || t.includes('enlace')) return 'link-variant';
  if (t.includes('tel') || t.includes('phone') || t.includes('telefono') || t.includes('llamada')) {
    return 'phone-in-talk';
  }
  if (t.includes('texto')) return 'text-box-outline';
  return 'card-account-details-outline';
}

const _nfc = (s: string) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');

/**
 * Icono Material para facetas en listas de búsqueda (sin dependencias de RN).
 * Usado por `searchFacetQuickAction` y tests Fase 2.
 */
export function facetIconNameForSearch(type: string): string {
  const t = _nfc(type);
  if (t.includes('whatsapp')) return 'whatsapp';
  if (t.includes('instagram')) return 'instagram';
  if (t.includes('facebook')) return 'facebook';
  if (t.includes('linkedin')) return 'linkedin';
  if (t.includes('telegram')) return 'send';
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

/**
 * Inferencia enriquecida: primero por LABEL (el nombre que el usuario puso),
 * luego por dominio de la URL, finalmente por tipo de dato.
 * Cubre vault items con íconos HTTP customizados que no tienen `iconName` MCI.
 */
export function inferMciIconFromContext(type: string, label: string, value: string): string {
  const l = _nfc(label);
  const url = (value || '').toLowerCase();

  // 1. Por label — más confiable porque el usuario nombró explícitamente el item
  if (l.includes('whatsapp')) return 'whatsapp';
  if (l.includes('instagram')) return 'instagram';
  if (l.includes('facebook') || l === 'fb') return 'facebook';
  if (l.includes('linkedin')) return 'linkedin';
  if (l.includes('telegram')) return 'send';
  if (l.includes('twitter') || l === 'x') return 'twitter';
  if (l.includes('youtube')) return 'youtube';
  if (l.includes('tiktok')) return 'music-note';
  if (l.includes('snapchat')) return 'snapchat';
  if (l.includes('pinterest')) return 'pinterest';
  if (l.includes('gmail')) return 'gmail';
  if (l.includes('hotmail') || l.includes('outlook')) return 'email-outline';
  if (l.includes('foto') || l.includes('photo') || l.includes('pic') || l.includes('imagen') || l.includes('galeria')) return 'image-outline';
  if (l.includes('pdf')) return 'file-pdf-box';
  if (l.includes('map') || l.includes('mapa') || l.includes('ubicac')) return 'map-marker';
  if (l.includes('email') || l.includes('correo')) return 'email-outline';
  if (l.includes('tel') || l.includes('phone') || l.includes('llamada')) return 'phone-in-talk';

  // 2. Por dominio de la URL
  if (url.includes('facebook.com') || url.includes('fb.com') || url.includes('fb.me')) return 'facebook';
  if (url.includes('instagram.com')) return 'instagram';
  if (url.includes('linkedin.com')) return 'linkedin';
  if (url.includes('wa.me') || url.includes('whatsapp.com')) return 'whatsapp';
  if (url.includes('twitter.com') || url.includes('x.com/')) return 'twitter';
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube';
  if (url.includes('tiktok.com')) return 'music-note';
  if (url.includes('t.me/') || url.includes('telegram.me')) return 'send';
  if (url.includes('snapchat.com')) return 'snapchat';
  if (url.includes('pinterest.com')) return 'pinterest';
  if (url.includes('maps.google') || url.includes('goo.gl/maps')) return 'map-marker';

  // 3. Fallback por tipo de dato
  return facetIconNameForSearch(type);
}

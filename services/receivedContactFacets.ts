import { normalizeVaultItemTypeKey } from '@/services/deepSearch';

export type SearchFacetLike = { type: string; label: string; value: string };

export function extractEmailFromFacets(facets: SearchFacetLike[]): string {
  for (const f of facets) {
    const t = normalizeVaultItemTypeKey(f.type);
    if (t === 'email' || t.includes('email') || t.includes('correo')) {
      const v = String(f.value || '').trim();
      if (v.includes('@')) {
        return v;
      }
    }
  }
  return '';
}

export function extractWhatsAppUrlFromFacets(facets: SearchFacetLike[]): string {
  for (const f of facets) {
    const v = String(f.value || '').trim();
    if (/wa\.me|api\.whatsapp|whatsapp\.com/i.test(v)) {
      if (/^https?:\/\//i.test(v)) {
        return v;
      }
      return `https://${v.replace(/^\/+/, '')}`;
    }
  }
  for (const f of facets) {
    const v = String(f.value || '').trim();
    if (/^https?:\/\//i.test(v) && normalizeVaultItemTypeKey(`${f.type} ${f.label}`).includes('whatsapp')) {
      return v;
    }
  }
  return '';
}

/**
 * Lógica pura Search & Social Market Hub (Fase 2). Tests: `npm run test:search-phase2`.
 */

import type { BusinessCard } from '@/types/businessCard';

export function parseStoryExpiryMs(card: BusinessCard): number | null {
  const e = card.storyExpiresAt as unknown;
  if (e == null) {
    return null;
  }
  if (e instanceof Date) {
    return e.getTime();
  }
  if (typeof e === 'number' && Number.isFinite(e)) {
    return e;
  }
  if (typeof e === 'object' && e !== null && 'toMillis' in e && typeof (e as { toMillis: () => number }).toMillis === 'function') {
    try {
      return (e as { toMillis: () => number }).toMillis();
    } catch {
      return null;
    }
  }
  if (typeof e === 'object' && e !== null && 'seconds' in e) {
    const s = Number((e as { seconds: number }).seconds);
    return Number.isFinite(s) ? s * 1000 : null;
  }
  return null;
}

/** Anillo historia/oferta en filas del Mercado (Firestore: hasActiveStory + isPremiumStory). */
export function marketSearchStoryRingState(card: BusinessCard): 'none' | 'normal' | 'vip' {
  if (!card.hasActiveStory) {
    return 'none';
  }
  const exp = parseStoryExpiryMs(card);
  if (exp != null && exp < Date.now()) {
    return 'none';
  }
  return card.isPremiumStory ? 'vip' : 'normal';
}

export function buildMarketCardSearchFacets(card: BusinessCard): Array<{ type: string; label: string; value: string }> {
  const out: Array<{ type: string; label: string; value: string }> = [];
  const email = String(card.ownerEmail || '').trim();
  if (email) {
    out.push({ type: 'email', label: 'Email', value: email });
  }
  const phone = String(card.ownerPhone || '').trim();
  if (phone) {
    out.push({ type: 'teléfono', label: 'Teléfono', value: phone });
  }
  const maps = String(card.mapsLink || '').trim();
  if (maps) {
    out.push({ type: 'mapa', label: 'Mapa', value: maps });
  } else if (
    Number.isFinite(card.latitude) &&
    Number.isFinite(card.longitude) &&
    (card.latitude !== 0 || card.longitude !== 0)
  ) {
    out.push({
      type: 'mapa',
      label: 'Ubicación',
      value: `https://www.google.com/maps?q=${card.latitude},${card.longitude}`,
    });
  }
  const pdf = String(card.professionalVault?.contractsPdf || '').trim();
  if (pdf) {
    out.push({ type: 'pdf', label: 'PDF', value: pdf });
  }
  const link = String(card.permanent_business_link || '').trim();
  if (link) {
    out.push({ type: 'enlace', label: 'Web', value: link });
  }
  return out;
}

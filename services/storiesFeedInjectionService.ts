/**
 * Inyección de historias VIP del Mercado en el carrusel de Stories (Fase 2).
 * Usa Firestore `businessCards` (hasActiveStory + isPremiumStory), excluye contactos y al viewer.
 */

import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from '@/services/firebaseConfig';
import type { BusinessCard } from '@/types/businessCard';

export type VipMarketStorySlot = {
  id: string;
  businessCardId: string;
  businessName: string;
  photoUrl: string | null;
  subtitle: string;
  distanceMiles: number | null;
  ctaLabel: string;
  ctaUrl: string | null;
};

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3959;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function storyStillActive(card: BusinessCard): boolean {
  if (!card.hasActiveStory) {
    return false;
  }
  const e = card.storyExpiresAt as unknown;
  if (e == null) {
    return true;
  }
  if (e instanceof Date) {
    return e.getTime() > Date.now();
  }
  if (typeof e === 'object' && e !== null && 'toMillis' in e && typeof (e as { toMillis: () => number }).toMillis === 'function') {
    try {
      return (e as { toMillis: () => number }).toMillis() > Date.now();
    } catch {
      return true;
    }
  }
  if (typeof e === 'object' && e !== null && 'seconds' in e) {
    const s = Number((e as { seconds: number }).seconds) * 1000;
    return Number.isFinite(s) && s > Date.now();
  }
  return true;
}

/**
 * Negocios con historia VIP de pago visibles en mercado, cercanos si hay GPS; sin contactos ya agregados.
 */
export async function fetchVipMarketStorySlots(params: {
  viewerUid: string;
  contactUids: string[];
  userLatitude?: number | null;
  userLongitude?: number | null;
  radiusMiles?: number;
  maxSlots?: number;
}): Promise<VipMarketStorySlot[]> {
  const {
    viewerUid,
    contactUids,
    userLatitude,
    userLongitude,
    radiusMiles = 15,
    maxSlots = 10,
  } = params;

  const contactSet = new Set(contactUids.map((u) => String(u || '').trim()).filter(Boolean));
  const viewer = String(viewerUid || '').trim();

  const hasCoords =
    typeof userLatitude === 'number' &&
    typeof userLongitude === 'number' &&
    Number.isFinite(userLatitude) &&
    Number.isFinite(userLongitude);

  try {
    const businessCardsRef = collection(db, 'businessCards');
    const q = query(businessCardsRef, where('isActive', '==', true), where('isPublishedToMarket', '==', true), limit(100));
    const snapshot = await getDocs(q);
    const cards: BusinessCard[] = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as BusinessCard));

    const rows = cards
      .filter((c) => c.kycVerified === true)
      .filter((c) => Boolean(c.hasActiveStory) && Boolean(c.isPremiumStory))
      .filter((c) => storyStillActive(c))
      .filter((c) => {
        const ou = String(c.ownerUid || '').trim();
        return ou && ou !== viewer && !contactSet.has(ou);
      })
      .map((card) => {
        let distanceMiles: number | null = null;
        if (hasCoords && Number.isFinite(card.latitude) && Number.isFinite(card.longitude)) {
          distanceMiles = calculateDistance(userLatitude!, userLongitude!, card.latitude, card.longitude);
        }
        return { card, distanceMiles };
      })
      .filter((x) => (hasCoords ? x.distanceMiles != null && x.distanceMiles <= radiusMiles : true))
      .sort((a, b) => {
        if (a.distanceMiles != null && b.distanceMiles != null) {
          return a.distanceMiles - b.distanceMiles;
        }
        if (a.distanceMiles != null) {
          return -1;
        }
        if (b.distanceMiles != null) {
          return 1;
        }
        return (Number(b.card.searchRankScore) || 0) - (Number(a.card.searchRankScore) || 0);
      })
      .slice(0, maxSlots);

    return rows.map(({ card, distanceMiles }, i) => {
      const link =
        String(card.permanent_business_link || '').trim() ||
        String(card.mapsLink || '').trim() ||
        (Number.isFinite(card.latitude) &&
        Number.isFinite(card.longitude) &&
        (card.latitude !== 0 || card.longitude !== 0)
          ? `https://www.google.com/maps?q=${card.latitude},${card.longitude}`
          : '');
      return {
        id: `vip-market-${card.id}-${i}`,
        businessCardId: card.id,
        businessName: String(card.businessName || '').trim() || 'Negocio',
        photoUrl: card.businessLogo ? String(card.businessLogo) : null,
        subtitle: String(card.businessDescription || '').trim().slice(0, 140) || '',
        distanceMiles,
        ctaLabel: 'CardSocial Market',
        ctaUrl: link || null,
      };
    });
  } catch (e) {
    console.warn('fetchVipMarketStorySlots', e);
    return [];
  }
}

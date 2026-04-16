/**
 * Social Market: Fuse/deepSearch + sinónimos + contactos recibidos + negocios (regla única licencia OK).
 */

import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { readBusinessCardIdentityFields } from '@/services/businessCardService';
import { isBusinessCardMarketEligible } from '@/services/businessCardMarketEligibility';
import { db } from '@/services/firebaseConfig';
import {
  collectStringsReceivedContact,
  haystackMatchesDeepSearchQuery,
  orderByDeepSearchWithExpandedQuery,
} from '@/services/deepSearch';
import { buildExpandedMarketQuery } from '@/services/marketSearchSynonyms';
import { BusinessCard, BusinessCardSearchResult } from '@/types/businessCard';
import type { IssuerSmartCardPresentation } from '@/types/sharedCardPresentation';
import type { PublicCardSlotPayload } from '@/services/qrApi';

/** Tarjetas recibidas/aceptadas (misma fuente que pestaña Contactos), con meta local opcional. */
export type ReceivedContactForMarketSearch = {
  uid: string;
  sid: string | null;
  bId: string | null;
  userFullName: string;
  userNickName: string;
  userAvatarUrl: string | null;
  cardName: string;
  ratingAvg: number;
  totalRatings?: number;
  holdersCount?: number;
  searchFacets: Array<{ type: string; label: string; value: string }>;
  metaGroup: string;
  metaIcons?: Array<{ name: string; url: string }>;
  themeId?: string;
  layout?: 'vertical' | 'horizontal';
  fontId?: string | null;
  fontName?: string | null;
  fontFamily?: string | null;
  fontTier?: 'free' | 'premium' | null;
  wallpaperId?: string | null;
  wallpaperUrl?: string | null;
  wallpaperThumbUrl?: string | null;
  wallpaperTier?: 'free' | 'premium' | null;
  wallpaperPriceCredits?: number;
  enableParallax?: boolean;
  itemIds?: string[];
  cardUpdatedAt?: string | null;
  storyState?: 'none' | 'normal' | 'vip';
  channelMuted?: boolean;
  publicCardSlots?: PublicCardSlotPayload[];
  ownerOccupation?: string | null;
};

export type SocialMarketSearchSections = {
  contacts: BusinessCardSearchResult[];
  businesses: BusinessCardSearchResult[];
};

export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3959;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/** Evita NaN/∞/negativos en UI de millas; si no es válido, no se muestra distancia. */
function safeDistanceMiles(miles: number | null | undefined): number | null {
  if (miles == null) {
    return null;
  }
  const n = Number(miles);
  if (!Number.isFinite(n) || n < 0) {
    return null;
  }
  return n;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

export function issuerPresentationFromRow(row: ReceivedContactForMarketSearch): IssuerSmartCardPresentation {
  return {
    themeId: row.themeId,
    layout: row.layout,
    fontId: row.fontId ?? undefined,
    fontName: row.fontName ?? undefined,
    fontFamily: row.fontFamily ?? undefined,
    fontTier: row.fontTier ?? undefined,
    wallpaperId: row.wallpaperId ?? undefined,
    wallpaperUrl: row.wallpaperUrl ?? undefined,
    wallpaperThumbUrl: row.wallpaperThumbUrl ?? undefined,
    wallpaperTier: row.wallpaperTier ?? undefined,
    wallpaperPriceCredits: row.wallpaperPriceCredits,
    enableParallax: row.enableParallax,
    itemIds: row.itemIds,
    cardUpdatedAt: row.cardUpdatedAt ?? undefined,
  };
}

export function createReceivedContactBusinessCard(row: ReceivedContactForMarketSearch): BusinessCard {
  const now = new Date();
  const title = String(row.userFullName || row.cardName || '').trim() || '—';
  const link = row.sid != null && String(row.sid).trim()
    ? String(row.sid).trim()
    : row.bId != null && String(row.bId).trim()
      ? String(row.bId).trim()
      : 'legacy';
  return {
    bId: `received-contact:${row.uid}:${link}`,
    uid: row.uid,
    type: 'business',
    bcName: title,
    bcContactName: '',
    ownerEmail: '',
    ownerPhone: '',
    physicalAddress: '',
    latitude: 0,
    longitude: 0,
    city: '',
    postalCode: '',
    keywords: [],
    businessDescription: `@${String(row.userNickName || 'user').trim()} · ${String(row.cardName || '').trim()}`,
    bcLogoUrl: row.userAvatarUrl || undefined,
    kycVerified: false,
    kycTermsAccepted: false,
    vaultDataIds: [],
    averageRating: Number(row.ratingAvg) || 0,
    totalRatings: Number(row.totalRatings ?? 0) || 0,
    negativeRatingsCount: 0,
    isActive: true,
    isPublishedToMarket: false,
    lastUpdated: now,
    createdAt: now,
    viewCount: 0,
    searchRankScore: 0,
  };
}

function stringsForBusinessCard(card: BusinessCard): string[] {
  const out: string[] = [];
  const push = (v: unknown) => {
    const t = String(v ?? '').trim();
    if (t) {
      out.push(t);
    }
  };
  push(card.bcName);
  push(card.businessDescription);
  push(card.physicalAddress);
  push(card.city);
  push(card.elevatorPitch);
  const words = (card.elevatorPitchWords as string[] | undefined)?.length
    ? (card.elevatorPitchWords as string[])
    : card.keywords || [];
  for (const w of words) {
    push(w);
  }
  for (const k of card.keywords || []) {
    push(k);
  }
  return out;
}

function businessMatchesMarketQuery(card: BusinessCard, queryRaw: string): boolean {
  const expanded = buildExpandedMarketQuery(queryRaw);
  const strings = stringsForBusinessCard(card);
  if (!strings.length) {
    return false;
  }
  if (expanded && haystackMatchesDeepSearchQuery(strings, expanded)) {
    return true;
  }
  return haystackMatchesDeepSearchQuery(strings, queryRaw);
}

/**
 * Contactos recibidos (API / misma lista que Contactos): collectStringsReceivedContact + orden Fuse.
 */
function searchReceivedContactsForMarket(
  queryRaw: string,
  rows: ReceivedContactForMarketSearch[],
): BusinessCardSearchResult[] {
  const qForDeep = buildExpandedMarketQuery(queryRaw) || String(queryRaw || '').trim();
  const ordered = orderByDeepSearchWithExpandedQuery(rows, qForDeep, (row) =>
    collectStringsReceivedContact(
      {
        uid: row.uid,
        sid: row.sid,
        bId: row.bId,
        userFullName: row.userFullName,
        userNickName: row.userNickName,
        cardName: row.cardName,
        searchFacets: row.searchFacets,
      },
      row.metaGroup,
      row.metaIcons,
    ),
  );
  return ordered.map((row) => ({
    card: createReceivedContactBusinessCard(row),
    distanceMiles: null,
    relevanceScore: 100,
    matchedKeywords: [],
    showDistance: false,
    rowSource: 'received_contact' as const,
    receivedContactFacets: row.searchFacets,
    receivedContactCardName: row.cardName,
    issuerPresentation: issuerPresentationFromRow(row),
    receivedHoldersCount: Number(row.holdersCount ?? 0) || 0,
    receivedSourceSid: row.sid ?? null,
    receivedSourceBId: row.bId ?? null,
    receivedChannelMuted: Boolean(row.channelMuted),
    receivedPublicCardSlots: Array.isArray(row.publicCardSlots) ? row.publicCardSlots : [],
    receivedOwnerOccupation: row.ownerOccupation ?? null,
    receivedIssuerNickname: String(row.userNickName || '').trim() || undefined,
  }));
}

/**
 * Social Market: contactos recibidos + negocios Firestore filtrados solo por isBusinessCardMarketEligible.
 */
export async function searchSocialMarket(
  queryRaw: string,
  receivedContacts: ReceivedContactForMarketSearch[],
  userLatitude?: number,
  userLongitude?: number,
  radiusMiles = 15,
): Promise<SocialMarketSearchSections> {
  const trimmed = String(queryRaw || '').trim();
  const contacts = trimmed ? searchReceivedContactsForMarket(trimmed, receivedContacts) : [];
  const businesses: BusinessCardSearchResult[] = [];

  const hasLocation = typeof userLatitude === 'number' && typeof userLongitude === 'number';

  if (!trimmed) {
    return { contacts, businesses };
  }

  try {
    const businessCardsRef = collection(db, 'businessCards');
    const q = query(
      businessCardsRef,
      where('isActive', '==', true),
      where('isPublishedToMarket', '==', true),
      limit(80),
    );

    const snapshot = await getDocs(q);
    const businessCards: BusinessCard[] = snapshot.docs.map((dSnap) => {
      const raw = dSnap.data() as Record<string, unknown>;
      const idn = readBusinessCardIdentityFields(raw);
      return { ...raw, ...idn, bId: dSnap.id, uid: String((raw as { uid?: string }).uid ?? '') } as BusinessCard;
    });

    let candidates = businessCards;
    if (hasLocation) {
      candidates = businessCards.filter((card) => {
        const distance = calculateDistance(userLatitude!, userLongitude!, card.latitude, card.longitude);
        return Number.isFinite(distance) && distance <= radiusMiles;
      });
    }

    type Row = {
      card: BusinessCard;
      relevanceScore: number;
      distanceMiles: number | null;
    };

    const textMatched = candidates.filter((card) => businessMatchesMarketQuery(card, trimmed));
    const eligibility = await Promise.all(
      textMatched.map((card) => isBusinessCardMarketEligible(card).then((ok) => ({ card, ok }))),
    );
    const matched: Row[] = [];
    for (const { card, ok } of eligibility) {
      if (!ok) {
        continue;
      }
      const strings = stringsForBusinessCard(card);
      const expanded = buildExpandedMarketQuery(trimmed);
      const relExact = haystackMatchesDeepSearchQuery(strings, expanded) ? 1 : 0.5;
      const rawMiles = hasLocation
        ? calculateDistance(userLatitude!, userLongitude!, card.latitude, card.longitude)
        : null;
      const distanceMiles = safeDistanceMiles(rawMiles);

      matched.push({
        card,
        relevanceScore: relExact * 100,
        distanceMiles,
      });
    }

    matched.sort((a, b) => {
      if (!hasLocation) {
        const ra = Number(a.card.averageRating) || 0;
        const rb = Number(b.card.averageRating) || 0;
        if (rb !== ra) {
          return rb - ra;
        }
        return b.relevanceScore - a.relevanceScore;
      }
      const da = a.distanceMiles ?? 0;
      const db_ = b.distanceMiles ?? 0;
      if (da !== db_) {
        return da - db_;
      }
      return b.relevanceScore - a.relevanceScore;
    });

    for (const r of matched) {
      const dm = safeDistanceMiles(r.distanceMiles);
      businesses.push({
        card: r.card,
        distanceMiles: dm,
        relevanceScore: r.relevanceScore,
        matchedKeywords: [],
        showDistance: hasLocation && dm != null && dm > 0,
        rowSource: 'social_market',
      });
    }
  } catch (error) {
    console.error('Error searching Social Market:', error);
  }

  return { contacts, businesses };
}

export async function findNearbyBusinesses(
  userLatitude: number,
  userLongitude: number,
  radiusMiles = 15,
  limit_results = 20,
): Promise<BusinessCardSearchResult[]> {
  try {
    const businessCardsRef = collection(db, 'businessCards');
    const q = query(
      businessCardsRef,
      where('isActive', '==', true),
      where('isPublishedToMarket', '==', true),
      limit(80),
    );

    const snapshot = await getDocs(q);
    const allCards: BusinessCard[] = snapshot.docs.map((dSnap) => {
      const raw = dSnap.data() as Record<string, unknown>;
      const idn = readBusinessCardIdentityFields(raw);
      return { ...raw, ...idn, bId: dSnap.id, uid: String((raw as { uid?: string }).uid ?? '') } as BusinessCard;
    });

    const inRadius = allCards
      .map((card) => ({
        card,
        distanceMiles: safeDistanceMiles(calculateDistance(userLatitude, userLongitude, card.latitude, card.longitude)),
      }))
      .filter((x) => x.distanceMiles != null && x.distanceMiles <= radiusMiles);

    const nearbyFlags = await Promise.all(
      inRadius.map(({ card, distanceMiles }) =>
        isBusinessCardMarketEligible(card).then((ok) => ({ card, distanceMiles, ok })),
      ),
    );
    const eligiblePairs = nearbyFlags
      .filter((x) => x.ok)
      .map(({ card, distanceMiles }) => ({ card, distanceMiles }));

    const withDistances = eligiblePairs
      .sort((a, b) => Number(a.distanceMiles ?? 0) - Number(b.distanceMiles ?? 0))
      .slice(0, limit_results);

    return withDistances.map((item) => {
      const dm = safeDistanceMiles(item.distanceMiles);
      const rel = dm != null ? 100 - (dm / radiusMiles) * 50 : 50;
      return {
        card: item.card,
        distanceMiles: dm,
        relevanceScore: Number.isFinite(rel) ? rel : 50,
        matchedKeywords: [],
        showDistance: dm != null && dm > 0,
        rowSource: 'social_market' as const,
      };
    });
  } catch (error) {
    console.error('Error finding nearby businesses:', error);
    return [];
  }
}

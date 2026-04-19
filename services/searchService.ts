/**
 * Social Market: Fuse/deepSearch + sinónimos + contactos recibidos + negocios (regla única licencia OK).
 * Negocios del mercado: Mongo `business_cards` vía GET /api/business-cards/market-catalog (ya no Firestore).
 */

import axios from 'axios';

import { getActiveUserId } from '@/services/authSession';
import { getScopedJwtToken } from '@/services/backendAuth';
import { readBusinessCardIdentityFields } from '@/services/businessCardService';
import { isBusinessCardMarketEligible } from '@/services/businessCardMarketEligibility';
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
  bcName?: string | null;
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
  bcContactName?: string | null;
  bcLogoUrl?: string | null;
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

/**
 * Convierte el wire `BusinessCardDoc` del backend a la forma legacy `BusinessCard`
 * que usan `stringsForBusinessCard` / distancia (physicalAddress, latitude, …).
 */
function wireBusinessCardToMarketShape(row: Record<string, unknown>): BusinessCard {
  const idn = readBusinessCardIdentityFields(row);
  const facets = Array.isArray(row.bcMarketFacets)
    ? (row.bcMarketFacets as Array<{ label?: unknown; value?: unknown }>)
    : [];
  const facetBits = facets
    .map((f) => [String(f.label ?? '').trim(), String(f.value ?? '').trim()].filter(Boolean).join(' '))
    .filter(Boolean);
  const businessDescription =
    [idn.bcContactName, idn.bcName, ...facetBits].filter(Boolean).join(' · ') || '—';
  const now = new Date();
  const uid = String(row.ownerUid ?? '').trim();
  const bId = String(row.bId ?? '').trim();
  const kw = Array.isArray(row.bcKeywords) ? row.bcKeywords.map((k) => String(k)) : [];
  const elevatorPitchWords = [...kw, ...facetBits];

  return {
    bId,
    uid,
    type: 'business',
    bcName: idn.bcName,
    bcContactName: idn.bcContactName,
    bcLogoUrl: idn.bcLogoUrl || undefined,
    ownerEmail: '',
    ownerPhone: '',
    physicalAddress: String(row.bcPhysicalAddress ?? '').trim(),
    latitude: Number(row.bcLatitude) || 0,
    longitude: Number(row.bcLongitude) || 0,
    city: '',
    postalCode: '',
    keywords: kw,
    businessDescription,
    elevatorPitchWords,
    kycVerified: Boolean(row.kycVerified),
    kycTermsAccepted: Boolean(row.kycTermsAccepted),
    vaultDataIds: Array.isArray(row.vaultItemIds) ? row.vaultItemIds.map(String) : [],
    averageRating: Number(row.averageRating) || 0,
    totalRatings: Number(row.totalRatings) || 0,
    negativeRatingsCount: Number(row.negativeRatingsCount) || 0,
    isActive: row.isActive !== false,
    isPublishedToMarket: Boolean(row.isPublishedToMarket),
    lastUpdated: now,
    createdAt: now,
    viewCount: Number(row.viewCount) || 0,
    searchRankScore: Number(row.searchRankScore) || 0,
  };
}

async function fetchMongoMarketBusinessCards(): Promise<BusinessCard[]> {
  const uid = await getActiveUserId();
  if (!uid) return [];
  try {
    const auth = await getScopedJwtToken(uid, 'qr.access');
    const response = await axios.get(`${auth.baseUrl}/api/business-cards/market-catalog`, {
      headers: {
        'x-api-gateway-key': auth.gatewayKey,
        Authorization: `Bearer ${auth.token}`,
      },
      timeout: 20000,
    });
    const raw = Array.isArray(response?.data?.cards) ? response.data.cards : [];
    return raw.map((c: unknown) => wireBusinessCardToMarketShape(c as Record<string, unknown>));
  } catch (e) {
    console.warn('[searchService] fetchMongoMarketBusinessCards:', e);
    return [];
  }
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
  /** Contacto recibido tipo negocio: solo datos de tarjeta (sin perfil emisor). */
  const title =
    String(row.bcName || '').trim() || String(row.cardName || '').trim() || '—';
  const link = row.sid != null && String(row.sid).trim()
    ? String(row.sid).trim()
    : row.bId != null && String(row.bId).trim()
      ? String(row.bId).trim()
      : 'legacy';
  const contactLine = String(row.bcContactName || '').trim();
  const cardLine = String(row.bcName || '').trim() || String(row.cardName || '').trim();
  const bizDesc = [contactLine, cardLine].filter(Boolean).join(' · ') || '—';
  return {
    bId: `received-contact:${row.uid}:${link}`,
    uid: row.uid,
    type: 'business',
    bcName: title,
    bcContactName: contactLine,
    bcLogoUrl: row.bcLogoUrl != null && String(row.bcLogoUrl).trim() ? String(row.bcLogoUrl).trim() : undefined,
    ownerEmail: '',
    ownerPhone: '',
    physicalAddress: '',
    latitude: 0,
    longitude: 0,
    city: '',
    postalCode: '',
    keywords: [],
    businessDescription: bizDesc,
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
        ownerOccupation: row.ownerOccupation ?? null,
        bcName: row.bcName ?? null,
        bcContactName: row.bcContactName ?? null,
        bcLogoUrl: row.bcLogoUrl ?? null,
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
    receivedIssuerUserAvatarUrl: row.userAvatarUrl,
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
 * Social Market: contactos recibidos + negocios Mongo (publicados) filtrados por isBusinessCardMarketEligible.
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
    const businessCards = await fetchMongoMarketBusinessCards();

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
    const allCards = await fetchMongoMarketBusinessCards();

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

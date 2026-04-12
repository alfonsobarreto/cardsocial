/**
 * Convierte una Business Card del Social Market al payload premium (wireframe espejo)
 * reutilizado por MyCardsPreviewItem → openVaultPreviewItem → VaultDocumentViewerModal.
 */

import { normalizeMaterialIconName } from '@/app/components/iconNameValidation';
import type { MyCardsPayload } from '@/components/MyCards';
import type { WireframeEditSlot } from '@/components/smartCard/IsolatedWireframeCard';
import type { MirrorVaultItem } from '@/services/buildReceiverPreviewVaultItems';
import { inferMciIconFromContext } from '@/services/searchFacetIcons';
import { buildMarketCardSearchFacets } from '@/services/searchPhase2Logic';
import type { BusinessCard, BusinessCardSearchResult } from '@/types/businessCard';

function normalizeFacetType(type: string): string {
  return String(type || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

/** Tema por defecto solo si la tarjeta no trae `themeId` (Firestore). */
export const MARKET_PREMIUM_WIREFRAME_THEME_ID = 'emerald_crown';

/**
 * Facetas de negocio → ítems espejo (mismos campos que contactos / QR público).
 */
export function mirrorVaultItemsFromBusinessCard(card: BusinessCard): MirrorVaultItem[] {
  const facets = buildMarketCardSearchFacets(card);
  return facets.map((f, i): MirrorVaultItem => {
    const v = String(f.value || '').trim();
    const baseType = String(f.type || '');
    let typeOut = baseType;
    let vaultMimeType: string | undefined;
    const tn = normalizeFacetType(baseType);

    if (tn.includes('map') || tn === 'mapa') {
      typeOut = 'Ubicación';
    } else if (tn.includes('pdf') || tn.includes('document')) {
      typeOut = 'Documento';
      const lower = v.toLowerCase();
      const looksPdfPath = /\.pdf(\?|$)/i.test(v);
      if (!looksPdfPath && /\/api\/vault\/file\//i.test(v)) {
        vaultMimeType = 'application/pdf';
      } else if (!looksPdfPath && /^https?:\/\//i.test(v)) {
        vaultMimeType = 'application/pdf';
      }
    }

    return {
      id: `market-premium-${i}-${tn || 'slot'}`,
      title: String(f.label || '').trim() || '—',
      type: typeOut,
      value: v,
      // Validate stored iconName against MCI; fall back to context-inferred icon
      // (label + URL + type) to handle items that use HTTP custom icons.
      iconName: (() => {
        const raw = f.iconName?.trim() ?? '';
        const validated = raw ? normalizeMaterialIconName(raw, '') : '';
        const inferred = inferMciIconFromContext(f.type, String(f.label || ''), v);
        return validated || normalizeMaterialIconName(inferred, 'card-account-details-outline');
      })(),
      isFavorite: false,
      ...(vaultMimeType ? { vaultMimeType } : {}),
    };
  });
}

export function wireframeSlotsFromBusinessCard(card: BusinessCard): WireframeEditSlot[] {
  const items = mirrorVaultItemsFromBusinessCard(card);
  return items.map((item, index) => ({
    id: `market-wf-${index}-${item.id}`,
    index,
    item,
  }));
}

export function adaptBusinessCardSearchResultToMyCardsPayload(
  result: BusinessCardSearchResult,
  tr: (es: string, en: string) => string,
): MyCardsPayload {
  const card = result.card;
  const slots = wireframeSlotsFromBusinessCard(card);
  const subtitle =
    String(card.ownerName || '').trim().slice(0, 60) ||
    String(card.businessDescription || '').trim().slice(0, 120) ||
    tr('Mercado Social', 'Social Market');

  const themeFromCard = String(card.themeId || '').trim();
  return {
    cardName: String(card.businessName || '').trim() || tr('Negocio', 'Business'),
    subtitle,
    avatarUrl: card.businessLogo ?? null,
    themeId: themeFromCard || MARKET_PREMIUM_WIREFRAME_THEME_ID,
    layout: 'vertical',
    holdersCount: Math.max(0, Math.floor(Number(card.holdersCount ?? 0))),
    ratingAvg: Number(card.averageRating),
    totalRatings: Math.max(0, Math.floor(Number(card.totalRatings ?? 0))),
    enableParallax: true,
    slots,
    noAvatarIcon: 'storefront-outline',
  };
}

/**
 * Vista previa al escanear QR de negocio cuando la tarjeta vive en Firestore (`businessCards`).
 * Usa el mismo wireframe premium que el Mercado y el **themeId** guardado en el documento.
 */
export function businessFirestoreDocToMyCardsPayload(
  raw: Record<string, unknown>,
  cardId: string,
  tr: (es: string, en: string) => string,
): MyCardsPayload {
  const card = {
    id: String(raw.id || cardId),
    ownerUid: String(raw.ownerUid || ''),
    type: 'business' as const,
    businessName: String(raw.businessName || ''),
    ownerName: String(raw.ownerName || ''),
    physicalAddress: String(raw.physicalAddress || ''),
    latitude: Number(raw.latitude ?? 0),
    longitude: Number(raw.longitude ?? 0),
    city: String(raw.city || ''),
    postalCode: String(raw.postalCode || ''),
    keywords: Array.isArray(raw.keywords) ? (raw.keywords as string[]).map(String) : [],
    businessLogo: raw.businessLogo != null ? String(raw.businessLogo) : '',
    marketFacets: Array.isArray(raw.marketFacets) ? raw.marketFacets as Array<{ type: string; label: string; value: string; iconName?: string }> : [],
    averageRating: Number(raw.averageRating ?? 5),
    totalRatings: Number(raw.totalRatings ?? 0),
    negativeRatingsCount: Number(raw.negativeRatingsCount ?? 0),
    kycVerified: Boolean(raw.kycVerified),
    kycTermsAccepted: Boolean(raw.kycTermsAccepted),
    isActive: raw.isActive !== false,
    isPublishedToMarket: Boolean(raw.isPublishedToMarket),
    lastUpdated: new Date(),
    createdAt: new Date(),
    viewCount: Number(raw.viewCount ?? 0),
    searchRankScore: Number(raw.searchRankScore ?? 0),
    vaultDataIds: Array.isArray(raw.vaultDataIds)
      ? (raw.vaultDataIds as string[]).map(String)
      : Array.isArray(raw.vaultLinkIds)
        ? (raw.vaultLinkIds as string[]).map(String)
        : [],
    themeId: String(raw.themeId || '').trim(),
    holdersCount: Number(raw.holdersCount ?? 0),
  } as BusinessCard;

  const slots = wireframeSlotsFromBusinessCard(card);
  const subBase =
    String(card.ownerName || '').trim().slice(0, 60) ||
    String((raw.businessDescription as string) || '').trim().slice(0, 120) ||
    tr('Mercado Social', 'Social Market');

  const themeId = String(raw.themeId || '').trim() || MARKET_PREMIUM_WIREFRAME_THEME_ID;

  return {
    cardName: String(card.businessName || '').trim() || tr('Negocio', 'Business'),
    subtitle: subBase,
    avatarUrl: card.businessLogo ? String(card.businessLogo) : null,
    themeId,
    layout: 'vertical',
    holdersCount: Math.max(0, Math.floor(Number(raw.holdersCount ?? 0))),
    ratingAvg: Number(card.averageRating),
    totalRatings: Math.max(0, Math.floor(Number(card.totalRatings ?? 0))),
    enableParallax: true,
    slots,
    noAvatarIcon: 'storefront-outline',
  };
}

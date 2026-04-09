/**
 * Convierte una Business Card del Social Market al payload premium (wireframe espejo)
 * reutilizado por MyCardsPreviewItem → openVaultPreviewItem → VaultDocumentViewerModal.
 */

import type { WireframeEditSlot } from '@/components/smartCard/IsolatedWireframeCard';
import type { MirrorVaultItem } from '@/services/buildReceiverPreviewVaultItems';
import { buildMarketCardSearchFacets } from '@/services/searchPhase2Logic';
import { facetIconNameForSearch } from '@/services/searchFacetIcons';
import type { BusinessCard, BusinessCardSearchResult } from '@/types/businessCard';
import type { MyCardsPayload } from '@/components/MyCards';

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
      iconName: facetIconNameForSearch(f.type),
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
  const cityLine = [card.city, card.postalCode].filter(Boolean).join(' · ');
  const subBase =
    String(cityLine || '').trim() ||
    String(card.physicalAddress || '').trim().slice(0, 120) ||
    String(card.businessDescription || '').trim().slice(0, 120) ||
    tr('Mercado Social', 'Social Market');

  let subtitle = subBase;
  if (result.distanceMiles != null && result.showDistance !== false) {
    const dist = result.distanceMiles;
    const distLabel =
      dist < 0.1
        ? tr('muy cerca', 'very close')
        : tr(`a ${dist.toFixed(1)} millas`, `${dist.toFixed(1)} mi`);
    subtitle = subBase ? `${subBase} · ${distLabel}` : distLabel;
  }

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
  const prof = raw.professionalVault as { contractsPdf?: string } | undefined;
  const card = {
    id: String(raw.id || cardId),
    ownerUid: String(raw.ownerUid || ''),
    type: 'business' as const,
    businessName: String(raw.businessName || ''),
    ownerName: String(raw.ownerName || ''),
    ownerEmail: String(raw.ownerEmail || ''),
    ownerPhone: String(raw.ownerPhone || ''),
    physicalAddress: String(raw.physicalAddress || ''),
    latitude: Number(raw.latitude ?? 0),
    longitude: Number(raw.longitude ?? 0),
    city: String(raw.city || ''),
    postalCode: String(raw.postalCode || ''),
    keywords: Array.isArray(raw.keywords) ? (raw.keywords as string[]).map(String) : [],
    businessLogo: raw.businessLogo != null ? String(raw.businessLogo) : '',
    mapsLink: raw.mapsLink != null ? String(raw.mapsLink) : '',
    permanent_business_link:
      raw.permanent_business_link != null ? String(raw.permanent_business_link) : '',
    professionalVault: { contractsPdf: String(prof?.contractsPdf || '') },
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
  const cityLine = [card.city, card.postalCode].filter(Boolean).join(' · ');
  const subBase =
    String(cityLine || '').trim() ||
    String(card.physicalAddress || '').trim().slice(0, 120) ||
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

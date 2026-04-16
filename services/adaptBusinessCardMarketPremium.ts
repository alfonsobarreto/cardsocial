/**
 * Convierte una Business Card del Social Market al payload premium (wireframe espejo)
 * reutilizado por MyCardsPreviewItem → openVaultPreviewItem → VaultDocumentViewerModal.
 */

import { normalizeMaterialIconName } from '@/app/components/iconNameValidation';
import type { MyCardsPayload } from '@/components/MyCards';
import type { WireframeEditSlot } from '@/components/smartCard/IsolatedWireframeCard';
import type { MirrorVaultItem } from '@/services/buildReceiverPreviewVaultItems';
import { readBusinessCardIdentityFields } from '@/services/businessCardService';
import { buildMarketCardSearchFacets } from '@/services/searchPhase2Logic';
import type { BusinessCard, BusinessCardSearchResult } from '@/types/businessCard';

function normalizeFacetType(type: string): string {
  return String(type || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Tema por defecto solo si la tarjeta no trae `themeId` (Firestore). */
export const MARKET_PREMIUM_WIREFRAME_THEME_ID = 'emerald_crown';

/**
 * Facetas de negocio → ítems espejo (mismos campos que contactos / QR público).
 */
export function mirrorVaultItemsFromBusinessCard(card: BusinessCard | any): MirrorVaultItem[] {
  // 1. FIX DE LOS 7 ICONOS: Priorizar publicCardSlots si existen.
  // Si la tarjeta trae slots completos (no truncados por la búsqueda), los usamos todos.
  let facets: Array<{ type: string; label: string; value: string; iconName?: string }> = [];
  if (Array.isArray(card.publicCardSlots) && card.publicCardSlots.length > 0) {
    facets = card.publicCardSlots.map((slot: any) => ({
      type: slot.type || '',
      label: slot.title || slot.label || '',
      value: slot.value || slot.url || '',
      iconName: slot.iconName || ''
    }));
  } else {
    // Fallback: usar los de búsqueda si es lo único que mandó el backend
    facets = buildMarketCardSearchFacets(card as BusinessCard);
  }

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

    // 2. FIX DE LOS ICONOS ROTOS (?): Mapeo manual agresivo e infalible
    return {
      id: `market-premium-${i}-${tn || 'slot'}`,
      title: String(f.label || '').trim() || '—',
      type: typeOut,
      value: v,
      iconName: normalizeMaterialIconName(f.iconName?.trim() ?? '', 'link-variant'),
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
  // TRUCO DE INYECCIÓN: Si el result trae publicCardSlots, se los pasamos a la card.
  const card = { ...result.card };
  if (result.receivedPublicCardSlots) {
    (card as any).publicCardSlots = result.receivedPublicCardSlots;
  }

  const slots = wireframeSlotsFromBusinessCard(card);
  const subtitle =
    String(card.bcContactName || '').trim().slice(0, 60) ||
    String(card.businessDescription || '').trim().slice(0, 120) ||
    tr('Mercado Social', 'Social Market');

  const themeFromCard = String(card.themeId || '').trim();
  return {
    cardName: String(card.bcName || '').trim() || tr('Negocio', 'Business'),
    subtitle,
    avatarUrl: card.bcLogoUrl ?? null,
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

export function businessFirestoreDocToMyCardsPayload(
  raw: Record<string, unknown>,
  fallbackBId: string,
  tr: (es: string, en: string) => string,
): MyCardsPayload {
  const idn = readBusinessCardIdentityFields(raw);
  const card = {
    bId: String(raw.bId || fallbackBId),
    uid: String(raw.uid ?? ''),
    type: 'business' as const,
    bcName: idn.bcName,
    bcContactName: idn.bcContactName,
    physicalAddress: String(raw.physicalAddress || ''),
    latitude: Number(raw.latitude ?? 0),
    longitude: Number(raw.longitude ?? 0),
    city: String(raw.city || ''),
    postalCode: String(raw.postalCode || ''),
    keywords: Array.isArray(raw.keywords) ? (raw.keywords as string[]).map(String) : [],
    bcLogoUrl: idn.bcLogoUrl || undefined,
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
    String(card.bcContactName || '').trim().slice(0, 60) ||
    String((raw.businessDescription as string) || '').trim().slice(0, 120) ||
    tr('Mercado Social', 'Social Market');

  const themeId = String(raw.themeId || '').trim() || MARKET_PREMIUM_WIREFRAME_THEME_ID;

  return {
    cardName: String(card.bcName || '').trim() || tr('Negocio', 'Business'),
    subtitle: subBase,
    avatarUrl: card.bcLogoUrl ? String(card.bcLogoUrl) : null,
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
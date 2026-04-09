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

/** Tema luxury fijo para vista previa VIP del mercado (tarjeta de negocio). */
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

  return {
    cardName: String(card.businessName || '').trim() || tr('Negocio', 'Business'),
    subtitle,
    avatarUrl: card.businessLogo ?? null,
    themeId: MARKET_PREMIUM_WIREFRAME_THEME_ID,
    layout: 'vertical',
    holdersCount: 0,
    ratingAvg: Number(card.averageRating),
    totalRatings: Math.max(0, Math.floor(Number(card.totalRatings ?? 0))),
    enableParallax: true,
    slots,
    noAvatarIcon: 'storefront-outline',
  };
}

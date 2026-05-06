/**
 * Lógica pura Search & Social Market Hub (Fase 2). Tests: `npm run test:search-phase2`.
 */

import type { BusinessCard } from '@/types/businessCard';

export function buildMarketCardSearchFacets(card: BusinessCard): Array<{ type: string; label: string; value: string; iconName?: string }> {
  if (Array.isArray(card.marketFacets) && card.marketFacets.length > 0) {
    return card.marketFacets;
  }
  // No marketFacets means the card hasn't been synced from the Vault yet.
  // Return empty — never invent data from flat fields.
  return [];
}

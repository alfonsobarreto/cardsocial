/**
 * Construye `bcMarketFacets` desde ítems de bóveda ya cargados (sin Firestore).
 * Misma semántica que `resolveBusinessMarketFacets` en `businessMarketFacets.ts`.
 */

import { normalizeMaterialIconNamePermissive } from './materialIconResolveShared';
import { inferMciIconFromContext } from './searchFacetIcons';
import type { MarketFacet } from './types/cards';

const MAX_FACETS = 12;

export type VaultRowForMarketFacet = {
  id: string;
  title?: string;
  type?: string;
  value?: string;
  iconName?: string;
  icon?: string;
  label?: string;
};

export function buildBusinessMarketFacetsFromVaultItems(
  linkIds: string[],
  vaultItems: VaultRowForMarketFacet[],
): MarketFacet[] {
  const byId = new Map<string, VaultRowForMarketFacet>();
  for (const v of vaultItems) {
    const id = String(v?.id || '').trim();
    if (id) byId.set(id, v);
  }
  const unique = [...new Set(linkIds.filter(Boolean))].slice(0, MAX_FACETS);
  const out: MarketFacet[] = [];

  for (const linkId of unique) {
    const row = byId.get(String(linkId).trim());
    if (!row) continue;

    const type = String(row.type ?? '').trim() || 'otro';
    const label =
      String(row.title ?? row.label ?? type).trim() || type || 'Dato';
    const value = String(row.value ?? '').trim();
    if (!value) continue;

    const iconNameRaw = row.iconName != null ? String(row.iconName).trim() : '';
    const iconFieldRaw = row.icon != null ? String(row.icon).trim() : '';
    const rawCandidate =
      iconNameRaw || (iconFieldRaw && !iconFieldRaw.startsWith('http') ? iconFieldRaw : '');

    const explicitIcon = rawCandidate
      ? normalizeMaterialIconNamePermissive(rawCandidate, '')
      : '';
    const inferredIcon =
      explicitIcon ||
      normalizeMaterialIconNamePermissive(inferMciIconFromContext(type, label, value), '');

    const facet: MarketFacet = { type, label, value };
    if (inferredIcon) facet.iconName = inferredIcon;
    out.push(facet);
  }

  return out;
}

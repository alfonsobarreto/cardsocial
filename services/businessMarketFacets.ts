/**
 * Client-side computation of `bcMarketFacets` for a BusinessCard.
 *
 * A facet is a denormalized projection of a vault link (`users/{uid}/links/{id}`)
 * that the Social Market feed can display without reading another user's vault.
 * The backend stores whatever array we send; it does NOT inspect vault links
 * itself (the backend has no Firestore access).
 *
 * Call this from the caller right before POST/PATCH and include the result in
 * the payload as `bcMarketFacets`. If resolution fails for a specific link
 * (missing doc, timeout, malformed data), that link is silently dropped — it
 * never blocks the overall save.
 */

import { normalizeMaterialIconName } from '@/app/components/iconNameValidation';
import { db } from '@/services/firebaseConfig';
import { inferMciIconFromContext } from '@/services/searchFacetIcons';
import { doc, getDoc } from 'firebase/firestore';

import type { MarketFacet } from './types/cards';

const MAX_FACETS = 12;
const PER_LINK_TIMEOUT_MS = 4000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);
}

export async function resolveBusinessMarketFacets(
  uid: string,
  linkIds: string[],
): Promise<MarketFacet[]> {
  const unique = [...new Set(linkIds.filter(Boolean))].slice(0, MAX_FACETS);
  if (!unique.length) return [];

  const results = await Promise.all(
    unique.map(async (linkId) => {
      try {
        const snap = await withTimeout(getDoc(doc(db, 'users', uid, 'links', linkId)), PER_LINK_TIMEOUT_MS);
        if (!snap || !snap.exists()) return null;
        const row = snap.data() as Record<string, unknown>;

        const type = String(row.type ?? '').trim() || 'otro';
        const label = String(row.title ?? row.label ?? type).trim() || type || 'Dato';
        const value = String(row.value ?? '').trim();
        if (!value) return null;

        const iconNameRaw = row.iconName != null ? String(row.iconName).trim() : '';
        const iconFieldRaw = row.icon != null ? String(row.icon).trim() : '';
        const rawCandidate =
          iconNameRaw || (iconFieldRaw && !iconFieldRaw.startsWith('http') ? iconFieldRaw : '');

        const explicitIcon = rawCandidate ? normalizeMaterialIconName(rawCandidate, '') : '';
        const inferredIcon =
          explicitIcon || normalizeMaterialIconName(inferMciIconFromContext(type, label, value), '');

        const facet: MarketFacet = { type, label, value };
        if (inferredIcon) facet.iconName = inferredIcon;
        return facet;
      } catch {
        return null;
      }
    }),
  );

  return results.filter((r): r is MarketFacet => r !== null);
}

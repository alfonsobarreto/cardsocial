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

import { db } from '@/services/firebaseConfig';
import {
  buildBusinessMarketFacetsFromVaultItems,
  type VaultRowForMarketFacet,
} from '@/services/businessMarketFacetsFromSnapshot';
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

  const rows = await Promise.all(
    unique.map(async (linkId): Promise<VaultRowForMarketFacet | null> => {
      try {
        const snap = await withTimeout(
          getDoc(doc(db, 'users', uid, 'links', linkId)),
          PER_LINK_TIMEOUT_MS,
        );
        if (!snap || !snap.exists()) return null;
        const d = snap.data() as Record<string, unknown>;
        return {
          id: linkId,
          title: d.title != null ? String(d.title) : undefined,
          type: d.type != null ? String(d.type) : undefined,
          value: d.value != null ? String(d.value) : undefined,
          iconName: d.iconName != null ? String(d.iconName) : undefined,
          icon: d.icon != null ? String(d.icon) : undefined,
          label: d.label != null ? String(d.label) : undefined,
        };
      } catch {
        return null;
      }
    }),
  );

  const vaultItems = rows.filter((r): r is VaultRowForMarketFacet => r !== null);
  return buildBusinessMarketFacetsFromVaultItems(unique, vaultItems);
}

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
import { decodeVaultLink } from '@/services/vaultFirestoreCodec';
import { getVaultE2eDerivedKey } from '@/services/vaultE2eSession';
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

  let aesKey: Uint8Array | null = null;
  try {
    aesKey = await getVaultE2eDerivedKey(uid);
  } catch {
    aesKey = null;
  }

  const rows = await Promise.all(
    unique.map(async (linkId): Promise<VaultRowForMarketFacet | null> => {
      try {
        const snap = await withTimeout(
          getDoc(doc(db, 'users', uid, 'links', linkId)),
          PER_LINK_TIMEOUT_MS,
        );
        if (!snap || !snap.exists()) return null;
        const d0 = snap.data() as Record<string, unknown>;
        const logical = await decodeVaultLink(linkId, { id: linkId, ...d0 }, aesKey);
        return {
          id: linkId,
          title: logical.title != null ? String(logical.title) : undefined,
          type: logical.type != null ? String(logical.type) : undefined,
          value: logical.value != null ? String(logical.value) : undefined,
          iconName: logical.iconName != null ? String(logical.iconName) : undefined,
          icon: logical.icon != null ? String(logical.icon) : undefined,
          label: d0.label != null ? String(d0.label) : undefined,
        };
      } catch {
        return null;
      }
    }),
  );

  const vaultItems = rows.filter((r): r is VaultRowForMarketFacet => r !== null);
  return buildBusinessMarketFacetsFromVaultItems(unique, vaultItems);
}

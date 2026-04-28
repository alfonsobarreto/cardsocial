import { collection, getDocs } from 'firebase/firestore';

import { getJwt } from '@/lib/studioQrClient';
import { getStudioDb } from '@/lib/studioFirebase';
import { mergeBuiltinGhostPlaceholders } from '@/lib/studioVaultService';
import type { StudioVaultLink } from '@/lib/studioVaultTypes';

import {
  buildPublicCardSlotsForPersist,
  migrateVaultIconsForStorage,
  type IconVaultGlyphLookup,
  type VaultLinkSnapshotItem,
} from '@card-social/services/vaultPublicCardSlots';
import { buildBusinessMarketFacetsFromVaultItems } from '@card-social/services/businessMarketFacetsFromSnapshot';

async function getIconVaultMapWeb(uid: string): Promise<IconVaultGlyphLookup> {
  const db = getStudioDb();
  const snap = await getDocs(collection(db, 'users', uid, 'icon_vault'));
  const out: IconVaultGlyphLookup = {};
  snap.docs.forEach((d) => {
    out[d.id] = d.data() as { materialIconName?: string | null };
  });
  return out;
}

async function loadVaultSnapshotForStudioWeb(
  uid: string,
  freshlySaved?: StudioVaultLink,
): Promise<{
  vaultItems: VaultLinkSnapshotItem[];
  iconVaultById: IconVaultGlyphLookup;
}> {
  const db = getStudioDb();
  const snap = await getDocs(collection(db, 'users', uid, 'links'));
  const byId = new Map<string, Record<string, unknown>>();
  for (const itemDoc of snap.docs) {
    const id = String(itemDoc.id || '').trim();
    if (!id) continue;
    byId.set(id, { id: itemDoc.id, ...itemDoc.data() });
  }
  if (freshlySaved?.id) {
    const sid = String(freshlySaved.id).trim();
    if (sid) {
      const prev = byId.get(sid) || { id: sid };
      byId.set(sid, { ...prev, ...freshlySaved, id: sid });
    }
  }
  const mergedGhost = mergeBuiltinGhostPlaceholders(
    migrateVaultIconsForStorage([...byId.values()]) as unknown as StudioVaultLink[],
  );
  const vaultItems = migrateVaultIconsForStorage(mergedGhost as unknown[]);
  const iconVaultById = await getIconVaultMapWeb(uid);
  return { vaultItems, iconVaultById };
}

type SmartListRow = { sid: string; vaultItemIds?: string[] };
type BizListRow = { bId: string; vaultItemIds?: string[] };

/**
 * Studio web: tras `saveVaultLink`, empuja `publicCardSlots` a las tarjetas en Mongo
 * que incluyen ese vault item.
 */
export async function syncStudioVaultLinkToMongoCards(
  uid: string,
  saved: StudioVaultLink,
): Promise<void> {
  const linkId = String(saved.id || '').trim();
  if (!linkId || !uid) return;

  const { vaultItems, iconVaultById } = await loadVaultSnapshotForStudioWeb(uid, saved);
  const auth = await getJwt(uid, 'qr.access');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-api-gateway-key': auth.gatewayKey,
    Authorization: `Bearer ${auth.token}`,
  };

  const [smartRes, bizRes] = await Promise.all([
    fetch(`${auth.baseUrl}/api/smart-cards`, { headers }),
    fetch(`${auth.baseUrl}/api/business-cards`, { headers }),
  ]);
  if (!smartRes.ok || !bizRes.ok) {
    throw new Error(`List cards failed (${smartRes.status} / ${bizRes.status})`);
  }

  const smartJson = (await smartRes.json()) as { cards?: SmartListRow[] };
  const bizJson = (await bizRes.json()) as { cards?: BizListRow[] };
  const smartCards = Array.isArray(smartJson.cards) ? smartJson.cards : [];
  const businessCards = Array.isArray(bizJson.cards) ? bizJson.cards : [];

  for (const card of smartCards) {
    const ids = card.vaultItemIds || [];
    if (!ids.some((id) => String(id).trim() === linkId)) continue;
    const slots = buildPublicCardSlotsForPersist(vaultItems, ids, iconVaultById);
    const r = await fetch(`${auth.baseUrl}/api/smart-cards/${encodeURIComponent(card.sid)}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ publicCardSlots: slots }),
    });
    if (!r.ok) {
      console.warn('[studioVaultCardSync] smart PATCH failed', card.sid, r.status);
    }
  }

  for (const card of businessCards) {
    const ids = card.vaultItemIds || [];
    if (!ids.some((id) => String(id).trim() === linkId)) continue;
    const slots = buildPublicCardSlotsForPersist(vaultItems, ids, iconVaultById);
    const facets = buildBusinessMarketFacetsFromVaultItems(ids, vaultItems);
    const r = await fetch(`${auth.baseUrl}/api/business-cards/${encodeURIComponent(card.bId)}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ publicCardSlots: slots, bcMarketFacets: facets }),
    });
    if (!r.ok) {
      console.warn('[studioVaultCardSync] business PATCH failed', card.bId, r.status);
    }
  }
}

/**
 * Lógica pura compartida / documentada para Stories Fase 1 (scripts/test-stories-phase1.mjs).
 * También cubierta en Search Fase 2: `npm run test:search-phase2`.
 */

export function storyChannelKey(ownerUid: string, cardId: string): string {
  return `${String(ownerUid || '').trim()}::${String(cardId || '').trim()}`;
}

export function filterVaultItemsByCardItemIds<T extends { id: string }>(
  vaultItems: T[],
  cardItemIds: string[]
): T[] {
  const allowed = new Set(cardItemIds.map((id) => String(id).trim()).filter(Boolean));
  return vaultItems.filter((item) => allowed.has(String(item.id || '').trim()));
}

/**
 * Réplica del criterio en `backend/src/routes/qrRoutes.js` (contacts/received).
 */
export function resolveContactStoryState(params: {
  ownerUid: string;
  cardIdForStory: string;
  muteKey: string;
  mutedCardKeys: Set<string>;
  storyCardByKey: Map<string, 'normal' | 'vip'>;
  storyByOwner: Map<string, 'normal' | 'vip'>;
}): 'none' | 'normal' | 'vip' {
  const { ownerUid, cardIdForStory, muteKey, mutedCardKeys, storyCardByKey, storyByOwner } = params;
  if (cardIdForStory && mutedCardKeys.has(muteKey)) {
    return 'none';
  }
  if (cardIdForStory) {
    return storyCardByKey.get(muteKey) || 'none';
  }
  return storyByOwner.get(ownerUid) || 'none';
}

/** Fila mínima para reconstruir mapas a partir de `listReceivedContacts` (misma semántica que el backend). */
export type ReceivedContactStoryInput = {
  uid: string;
  cardId: string | null;
  channelMuted?: boolean;
  storyState: 'none' | 'normal' | 'vip';
};

export type StoryLookupMaps = {
  mutedCardKeys: Set<string>;
  storyCardByKey: Map<string, 'normal' | 'vip'>;
  storyByOwner: Map<string, 'normal' | 'vip'>;
};

export function buildStoryLookupFromReceivedContacts(rows: ReceivedContactStoryInput[]): StoryLookupMaps {
  const mutedCardKeys = new Set<string>();
  const storyCardByKey = new Map<string, 'normal' | 'vip'>();
  const storyByOwner = new Map<string, 'normal' | 'vip'>();
  for (const r of rows) {
    const uid = String(r.uid || '').trim();
    const cid = r.cardId ? String(r.cardId).trim() : '';
    const mk = storyChannelKey(uid, cid);
    if (r.channelMuted && cid) {
      mutedCardKeys.add(mk);
    }
    const st = r.storyState === 'vip' ? 'vip' : r.storyState === 'normal' ? 'normal' : null;
    if (!st) {
      continue;
    }
    if (cid) {
      storyCardByKey.set(mk, st);
    } else {
      storyByOwner.set(uid, st);
    }
  }
  return { mutedCardKeys, storyCardByKey, storyByOwner };
}

export function resolveSearchRowStoryState(
  row: { uid: string; cardId: string | null; channelMuted?: boolean },
  lookup: StoryLookupMaps
): 'none' | 'normal' | 'vip' {
  const cid = row.cardId ? String(row.cardId).trim() : '';
  const muteKey = storyChannelKey(row.uid, cid);
  return resolveContactStoryState({
    ownerUid: row.uid,
    cardIdForStory: cid,
    muteKey,
    mutedCardKeys: lookup.mutedCardKeys,
    storyCardByKey: lookup.storyCardByKey,
    storyByOwner: lookup.storyByOwner,
  });
}

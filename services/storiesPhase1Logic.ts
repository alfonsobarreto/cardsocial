/**
 * Lógica pura compartida / documentada para Stories Fase 1 (scripts/test-stories-phase1.mjs).
 * También cubierta en Search Fase 2: `npm run test:search-phase2`.
 */

export function storyChannelKey(uid: string, sidOrBId: string): string {
  return `${String(uid || '').trim()}::${String(sidOrBId || '').trim()}`;
}

export function filterVaultItemsByCardItemIds<T extends { id: string }>(
  vaultItems: T[],
  cardItemIds: string[]
): T[] {
  const allowed = new Set(cardItemIds.map((id) => String(id).trim()).filter(Boolean));
  return vaultItems.filter((item) => allowed.has(String(item.id || '').trim()));
}

/**
 * Réplica del criterio en `backend/src/routes/qrRoutes.js` (contacts/received):
 * una fila por permiso (uid emisor + sid/bId); historias por `storyChannelKey`.
 */
export function resolveContactStoryState(params: {
  uid: string;
  sidOrBIdForStory: string;
  muteKey: string;
  mutedCardKeys: Set<string>;
  storyCardByKey: Map<string, 'normal' | 'vip'>;
  storyByOwner: Map<string, 'normal' | 'vip'>;
}): 'none' | 'normal' | 'vip' {
  const { uid, sidOrBIdForStory, muteKey, mutedCardKeys, storyCardByKey, storyByOwner } = params;
  if (sidOrBIdForStory && mutedCardKeys.has(muteKey)) {
    return 'none';
  }
  if (sidOrBIdForStory) {
    return storyCardByKey.get(muteKey) || 'none';
  }
  return storyByOwner.get(uid) || 'none';
}

/** Fila mínima para reconstruir mapas a partir de `listReceivedContacts` (misma semántica que el backend). */
export type ReceivedContactStoryInput = {
  uid: string;
  sid: string | null;
  bId: string | null;
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
    const sid = r.sid ? String(r.sid).trim() : '';
    const bId = r.bId ? String(r.bId).trim() : '';
    const sidOrBId = sid || bId;
    const mk = storyChannelKey(uid, sidOrBId);
    if (r.channelMuted && sidOrBId) {
      mutedCardKeys.add(mk);
    }
    const st = r.storyState === 'vip' ? 'vip' : r.storyState === 'normal' ? 'normal' : null;
    if (!st) {
      continue;
    }
    if (sidOrBId) {
      storyCardByKey.set(mk, st);
    } else {
      storyByOwner.set(uid, st);
    }
  }
  return { mutedCardKeys, storyCardByKey, storyByOwner };
}

export function resolveSearchRowStoryState(
  row: { uid: string; sid: string | null; bId: string | null; channelMuted?: boolean },
  lookup: StoryLookupMaps
): 'none' | 'normal' | 'vip' {
  const sid = row.sid ? String(row.sid).trim() : '';
  const bId = row.bId ? String(row.bId).trim() : '';
  const sidOrBId = sid || bId;
  const muteKey = storyChannelKey(row.uid, sidOrBId);
  return resolveContactStoryState({
    uid: row.uid,
    sidOrBIdForStory: sidOrBId,
    muteKey,
    mutedCardKeys: lookup.mutedCardKeys,
    storyCardByKey: lookup.storyCardByKey,
    storyByOwner: lookup.storyByOwner,
  });
}

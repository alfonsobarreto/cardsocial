import { buildBusinessMarketFacetsFromVaultItems } from '@/services/businessMarketFacetsFromSnapshot';
import { listMyBusinessCards, updateBusinessCard } from '@/services/businessCardsRepo';
import { loadVaultSnapshotForSlotSync } from '@/services/loadVaultSnapshotForSlotSync';
import { listMySmartCards, updateSmartCard } from '@/services/smartCardsRepo';
import type { PublicCardSlot } from '@/services/types/cards';
import { buildPublicCardSlotsForPersist } from '@/services/vaultPublicCardSlots';

/**
 * Tras guardar un link en Bóveda (Firestore + caché local), actualiza `publicCardSlots`
 * en Mongo para cada Smart/Business card que referencia ese `itemId`.
 */
export async function syncVaultLinkToMongoCardsAfterSave(uid: string, linkId: string): Promise<void> {
  const linkIdTrim = String(linkId || '').trim();
  if (!uid || !linkIdTrim) return;

  const { vaultItems, iconVaultById } = await loadVaultSnapshotForSlotSync(uid);
  const [smartCards, businessCards] = await Promise.all([
    listMySmartCards(uid),
    listMyBusinessCards(uid),
  ]);

  for (const card of smartCards) {
    const ids = card.vaultItemIds || [];
    if (!ids.some((id) => String(id).trim() === linkIdTrim)) continue;
    const slots = buildPublicCardSlotsForPersist(vaultItems, ids, iconVaultById) as PublicCardSlot[];
    await updateSmartCard(uid, card.sid, { publicCardSlots: slots });
  }

  for (const card of businessCards) {
    const ids = card.vaultItemIds || [];
    if (!ids.some((id) => String(id).trim() === linkIdTrim)) continue;
    const slots = buildPublicCardSlotsForPersist(vaultItems, ids, iconVaultById) as PublicCardSlot[];
    const facets = buildBusinessMarketFacetsFromVaultItems(ids, vaultItems);
    await updateBusinessCard(uid, card.bId, { publicCardSlots: slots, bcMarketFacets: facets });
  }
}

/**
 * Tras borrar un link en Bóveda (Firestore), quita ese id de `vaultItemIds` en Mongo y
 * reconstruye slots/facetas. Sin esto, Mis Tarjetas seguía mostrando ids huérfanos y
 * el preview podía quedar bloqueado esperando refetches pesados.
 */
export async function syncVaultDeletionToMongoCards(uid: string, deletedLinkId: string): Promise<void> {
  const lid = String(deletedLinkId || '').trim();
  if (!uid || !lid) return;

  const { vaultItems, iconVaultById } = await loadVaultSnapshotForSlotSync(uid);
  const [smartCards, businessCards] = await Promise.all([
    listMySmartCards(uid),
    listMyBusinessCards(uid),
  ]);

  for (const card of smartCards) {
    const ids = (card.vaultItemIds || []).map((id) => String(id).trim()).filter(Boolean);
    if (!ids.includes(lid)) continue;
    const nextIds = ids.filter((id) => id !== lid);
    const slots = buildPublicCardSlotsForPersist(vaultItems, nextIds, iconVaultById) as PublicCardSlot[];
    await updateSmartCard(uid, card.sid, { vaultItemIds: nextIds, publicCardSlots: slots });
  }

  for (const card of businessCards) {
    const ids = (card.vaultItemIds || []).map((id) => String(id).trim()).filter(Boolean);
    if (!ids.includes(lid)) continue;
    const nextIds = ids.filter((id) => id !== lid);
    const slots = buildPublicCardSlotsForPersist(vaultItems, nextIds, iconVaultById) as PublicCardSlot[];
    const facets = buildBusinessMarketFacetsFromVaultItems(nextIds, vaultItems);
    await updateBusinessCard(uid, card.bId, {
      vaultItemIds: nextIds,
      publicCardSlots: slots,
      bcMarketFacets: facets,
    });
  }
}

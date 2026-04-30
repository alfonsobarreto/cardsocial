/**
 * Paridad con `app/(tabs)/vault.tsx`: al cambiar o borrar un ítem de bóveda,
 * limpiar/actualizar referencias en `users/{uid}/cards` (Firestore).
 */
import { collection, doc, getDocs, updateDoc, type DocumentData } from 'firebase/firestore';

import { getStudioDb } from '@/lib/studioFirebase';
import type { StudioVaultLink } from '@/lib/studioVaultTypes';

export async function syncStudioVaultUpdateAcrossFirestoreCards(
  userId: string,
  updatedItem: StudioVaultLink,
): Promise<void> {
  const db = getStudioDb();
  const nowIso = new Date().toISOString();

  const cardsSnapshot = await getDocs(collection(db, 'users', userId, 'cards'));

  for (const cardDoc of cardsSnapshot.docs) {
    const cardData = cardDoc.data() as Record<string, unknown>;
    const patch: Record<string, unknown> = {};

    if (Array.isArray(cardData.items)) {
      let touched = false;
      const nextItems = (cardData.items as Record<string, unknown>[]).map((entry) => {
        const match =
          String(entry?.vaultDataId || '') === updatedItem.id || String(entry?.id || '') === updatedItem.id;
        if (!match) return entry;
        touched = true;
        return {
          ...entry,
          title: updatedItem.title,
          nameOfData: updatedItem.title,
          value: updatedItem.value,
          type: updatedItem.type,
          icon: updatedItem.icon,
          iconName: updatedItem.iconName,
          isFavorite: updatedItem.isFavorite,
          updatedAt: nowIso,
        };
      });
      if (touched) patch.items = nextItems;
    }

    if (Array.isArray(cardData.cardItems)) {
      let touched = false;
      const nextCardItems = (cardData.cardItems as Record<string, unknown>[]).map((entry) => {
        const match =
          String(entry?.vaultDataId || '') === updatedItem.id || String(entry?.id || '') === updatedItem.id;
        if (!match) return entry;
        touched = true;
        return {
          ...entry,
          title: updatedItem.title,
          nameOfData: updatedItem.title,
          value: updatedItem.value,
          type: updatedItem.type,
          icon: updatedItem.icon,
          iconName: updatedItem.iconName,
          isFavorite: updatedItem.isFavorite,
          updatedAt: nowIso,
        };
      });
      if (touched) patch.cardItems = nextCardItems;
    }

    if (Object.keys(patch).length > 0) {
      patch.updatedAt = nowIso;
      await updateDoc(doc(db, 'users', userId, 'cards', cardDoc.id), patch as DocumentData);
    }
  }
}

export async function syncStudioVaultDeleteAcrossFirestoreCards(userId: string, vaultDataId: string): Promise<void> {
  const db = getStudioDb();
  const nowIso = new Date().toISOString();

  const cardsSnapshot = await getDocs(collection(db, 'users', userId, 'cards'));

  for (const cardDoc of cardsSnapshot.docs) {
    const cardData = cardDoc.data() as Record<string, unknown>;
    const patch: Record<string, unknown> = {};

    if (Array.isArray(cardData.itemIds)) {
      const nextIds = (cardData.itemIds as string[]).filter((id) => id !== vaultDataId);
      if (nextIds.length !== (cardData.itemIds as string[]).length) {
        patch.itemIds = nextIds;
      }
    }

    if (Array.isArray(cardData.items)) {
      const nextItems = (cardData.items as Record<string, unknown>[]).filter(
        (entry) => String(entry?.vaultDataId) !== vaultDataId && String(entry?.id) !== vaultDataId,
      );
      if (nextItems.length !== (cardData.items as unknown[]).length) {
        patch.items = nextItems;
      }
    }

    if (Array.isArray(cardData.cardItems)) {
      const nextCardItems = (cardData.cardItems as Record<string, unknown>[]).filter(
        (entry) => String(entry?.vaultDataId) !== vaultDataId && String(entry?.id) !== vaultDataId,
      );
      if (nextCardItems.length !== (cardData.cardItems as unknown[]).length) {
        patch.cardItems = nextCardItems;
      }
    }

    if (Object.keys(patch).length > 0) {
      patch.updatedAt = nowIso;
      await updateDoc(doc(db, 'users', userId, 'cards', cardDoc.id), patch as DocumentData);
    }
  }
}

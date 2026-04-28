import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/services/firebaseConfig';
import { mergeBuiltinGhostLinkIntoVault } from '@/services/ghostLinkVaultBootstrap';
import { getUserIconVaultMap, type IconVaultEntry } from '@/services/iconVaultService';
import { migrateVaultIconsForStorage, type VaultLinkSnapshotItem } from '@/services/vaultPublicCardSlots';
import { readVaultJsonWithLegacyMigration, vaultStorageKey } from '@/services/userScopedStorage';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Misma fuente que `loadVaultItems` en cards.tsx, para reconstruir `publicCardSlots` sin estado React.
 */
export async function loadVaultSnapshotForSlotSync(uid: string): Promise<{
  vaultItems: VaultLinkSnapshotItem[];
  iconVaultById: Record<string, IconVaultEntry>;
}> {
  const raw = await readVaultJsonWithLegacyMigration(uid);
  let parsed = raw ? (JSON.parse(raw) as unknown[]) : [];
  let itemsMigrated = migrateVaultIconsForStorage(parsed);
  if (JSON.stringify(itemsMigrated) !== JSON.stringify(parsed)) {
    await AsyncStorage.setItem(vaultStorageKey(uid), JSON.stringify(itemsMigrated));
  }

  const byId = new Map<string, unknown>();
  for (const it of itemsMigrated) {
    const id = String((it as { id?: string })?.id || '').trim();
    if (id) {
      byId.set(id, it);
    }
  }
  try {
    const cloudSnapshot = await getDocs(collection(db, 'users', uid, 'links'));
    for (const itemDoc of cloudSnapshot.docs) {
      const id = String(itemDoc.id || '').trim();
      if (!id || byId.has(id)) {
        continue;
      }
      byId.set(id, { id: itemDoc.id, ...itemDoc.data() });
    }
  } catch {
    /* sin red */
  }
  itemsMigrated = migrateVaultIconsForStorage([...byId.values()] as unknown[]);

  if (itemsMigrated.length === 0) {
    try {
      const cloudSnapshot = await getDocs(collection(db, 'users', uid, 'links'));
      const cloudItems = cloudSnapshot.docs.map((itemDoc) => ({
        id: itemDoc.id,
        ...itemDoc.data(),
      }));
      itemsMigrated = migrateVaultIconsForStorage(cloudItems as unknown[]);
      await AsyncStorage.setItem(vaultStorageKey(uid), JSON.stringify(itemsMigrated));
    } catch {
      /* sin red */
    }
  }
  itemsMigrated = (await mergeBuiltinGhostLinkIntoVault(
    uid,
    itemsMigrated as unknown[],
  )) as VaultLinkSnapshotItem[];

  let iconMap: Record<string, IconVaultEntry> = {};
  try {
    const vaultMap = await getUserIconVaultMap(uid);
    iconMap = Object.fromEntries(vaultMap);
  } catch {
    iconMap = {};
  }
  return { vaultItems: itemsMigrated, iconVaultById: iconMap };
}

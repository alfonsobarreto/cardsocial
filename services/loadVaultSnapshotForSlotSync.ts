import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/services/firebaseConfig';
import { mergeBuiltinGhostLinkIntoVault } from '@/services/ghostLinkVaultBootstrap';
import { getUserIconVaultMap, type IconVaultEntry } from '@/services/iconVaultService';
import { migrateVaultIconsForStorage, type VaultLinkSnapshotItem } from '@/services/vaultPublicCardSlots';
import { decodeVaultLink } from '@/services/vaultFirestoreCodec';
import { readVaultJsonWithLegacyMigration, vaultStorageKey } from '@/services/userScopedStorage';
import AsyncStorage from '@react-native-async-storage/async-storage';

function linkHasAnyIconField(row: Record<string, unknown>): boolean {
  return (
    Boolean(String(row.iconVaultId ?? '').trim()) ||
    Boolean(String(row.icon ?? '').trim()) ||
    Boolean(String(row.iconName ?? '').trim())
  );
}

/**
 * Antes: si un `id` ya existía en AsyncStorage, **no** se mergeaba Firestore → quedaba caché
 * vieja sin iconVaultId/icon y la vista previa + publicCardSlots salían vacíos aunque la nube
 * estuviera bien. Ahora resolvemos por `updatedAt` y, en empate / sin fechas, rellenamos iconos
 * desde la nube si el local no tiene ninguno.
 */
function mergeLocalLinkWithCloud(
  local: Record<string, unknown>,
  cloud: Record<string, unknown>,
): Record<string, unknown> {
  const lU = Date.parse(String(local.updatedAt ?? ''));
  const cU = Date.parse(String(cloud.updatedAt ?? ''));
  const lOk = Number.isFinite(lU);
  const cOk = Number.isFinite(cU);
  if (cOk && lOk && cU !== lU) {
    return cU >= lU ? { ...local, ...cloud } : { ...cloud, ...local };
  }
  if (cOk && !lOk) {
    return { ...local, ...cloud };
  }
  if (lOk && !cOk) {
    return { ...cloud, ...local };
  }
  const localIcons = linkHasAnyIconField(local);
  const cloudIcons = linkHasAnyIconField(cloud);
  if (!localIcons && cloudIcons) {
    return { ...local, ...cloud };
  }
  if (localIcons && !cloudIcons) {
    return { ...cloud, ...local };
  }
  return { ...local, ...cloud };
}

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
      if (!id) {
        continue;
      }
      const rawRow: Record<string, unknown> = { id: itemDoc.id, ...itemDoc.data() };
      const cloudRow = (await decodeVaultLink(id, rawRow, null)) as unknown as Record<string, unknown>;
      const existing = byId.get(id);
      if (!existing) {
        byId.set(id, cloudRow);
        continue;
      }
      byId.set(id, mergeLocalLinkWithCloud(existing as Record<string, unknown>, cloudRow));
    }
  } catch {
    /* sin red */
  }
  itemsMigrated = migrateVaultIconsForStorage([...byId.values()] as unknown[]);

  if (itemsMigrated.length === 0) {
    try {
      const cloudSnapshot = await getDocs(collection(db, 'users', uid, 'links'));
      const cloudItems = await Promise.all(
        cloudSnapshot.docs.map(async (itemDoc) => {
          const id = String(itemDoc.id || '').trim();
          const raw = { id: itemDoc.id, ...itemDoc.data() } as Record<string, unknown>;
          return (await decodeVaultLink(id, raw, null)) as unknown;
        }),
      );
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

  try {
    await AsyncStorage.setItem(vaultStorageKey(uid), JSON.stringify(itemsMigrated));
  } catch {
    /* ignore — caché opcional; la fusión con Firestore ya alinea memoria en runtime */
  }

  let iconMap: Record<string, IconVaultEntry> = {};
  try {
    const vaultMap = await getUserIconVaultMap(uid);
    iconMap = Object.fromEntries(vaultMap);
  } catch {
    iconMap = {};
  }
  return { vaultItems: itemsMigrated, iconVaultById: iconMap };
}

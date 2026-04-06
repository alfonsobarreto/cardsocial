import {
  BUILTIN_GHOST_LINK_ITEM_ID,
  GHOST_LINK_VAULT_LEGACY_VALUE,
  GHOST_LINK_VAULT_TYPE,
  GHOST_LINK_VAULT_VALUE,
  isGhostLinkVaultType,
} from '@/constants/ghostLinkVault';
import { db } from '@/services/firebaseConfig';
import { stableKeyForCatalogIcon } from '@/services/iconVaultService';
import { vaultStorageKey } from '@/services/userScopedStorage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, setDoc } from 'firebase/firestore';

const BOOTSTRAP_ICON = { icon: 'phone-in-talk' as const, label: 'Llamada', labelEn: 'Call' };

export function buildBuiltinGhostLinkVaultItem(): Record<string, unknown> {
  const now = new Date().toISOString();
  return {
    id: BUILTIN_GHOST_LINK_ITEM_ID,
    title: 'Llamada privada',
    type: GHOST_LINK_VAULT_TYPE,
    value: GHOST_LINK_VAULT_VALUE,
    iconName: BOOTSTRAP_ICON.label,
    icon: BOOTSTRAP_ICON.icon,
    iconVaultId: stableKeyForCatalogIcon(BOOTSTRAP_ICON),
    isFavorite: false,
    vaultProtected: true,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Si la bóveda no tiene ningún ítem Ghost-Link, inserta el ítem base de Card-Social y persiste local (+ Firestore best-effort).
 */
function mapGhostLinkLegacyValuesToEmpty(items: any[]): { next: any[]; changed: boolean } {
  let changed = false;
  const next = items.map((x: any) => {
    if (!isGhostLinkVaultType(x?.type)) {
      return x;
    }
    if (String(x?.value || '') === GHOST_LINK_VAULT_LEGACY_VALUE) {
      changed = true;
      return { ...x, value: GHOST_LINK_VAULT_VALUE };
    }
    return x;
  });
  return { next, changed };
}

export async function mergeBuiltinGhostLinkIntoVault(uid: string, items: unknown[]): Promise<any[]> {
  const arr0 = Array.isArray(items) ? [...items] : [];
  const { next: migrated, changed: legacyMigrated } = mapGhostLinkLegacyValuesToEmpty(arr0);
  if (legacyMigrated) {
    try {
      await AsyncStorage.setItem(vaultStorageKey(uid), JSON.stringify(migrated));
    } catch {
      /* ignore */
    }
  }
  const arr = migrated;
  if (arr.some((x: any) => isGhostLinkVaultType(x?.type))) {
    return arr;
  }
  const row = buildBuiltinGhostLinkVaultItem();
  const next = [row, ...arr];
  try {
    await AsyncStorage.setItem(vaultStorageKey(uid), JSON.stringify(next));
  } catch {
    /* ignore */
  }
  try {
    await setDoc(doc(db, 'users', uid, 'links', BUILTIN_GHOST_LINK_ITEM_ID), row, { merge: true });
  } catch {
    /* offline / permisos */
  }
  return next;
}

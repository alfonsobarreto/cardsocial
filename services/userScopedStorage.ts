import AsyncStorage from '@react-native-async-storage/async-storage';

/** Pre–user-scoping keys (single-device shared; migrate away on read). */
export const LEGACY_VAULT_STORAGE_KEY = 'vault_data';
export const LEGACY_SMART_CARDS_STORAGE_KEY = 'smart_cards';
const LEGACY_VAULT_RECENT_ICONS_KEY = 'vault_recent_icon_ids';

export function vaultStorageKey(uid: string): string {
  return `vault_data:${uid}`;
}

export function smartCardsStorageKey(uid: string): string {
  return `smart_cards:${uid}`;
}

/** Orden manual de filas en Mis Tarjetas (Smart + negocio mezcladas), JSON string[]. */
export function cardsTabFeedOrderStorageKey(uid: string): string {
  return `cards_tab_feed_order:${uid}`;
}

export function vaultRecentIconsStorageKey(uid: string): string {
  return `vault_recent_icon_ids:${uid}`;
}

/**
 * Reads vault JSON for this user. If the namespaced key is missing, copies legacy `vault_data` once and removes it.
 */
export async function readVaultJsonWithLegacyMigration(uid: string): Promise<string | null> {
  const key = vaultStorageKey(uid);
  const scoped = await AsyncStorage.getItem(key);
  if (scoped != null) {
    return scoped;
  }
  const legacy = await AsyncStorage.getItem(LEGACY_VAULT_STORAGE_KEY);
  if (legacy != null) {
    await AsyncStorage.setItem(key, legacy);
    await AsyncStorage.removeItem(LEGACY_VAULT_STORAGE_KEY);
    return legacy;
  }
  return null;
}

/** Migra caché local `name` → `scName` (misma clave que Mongo/API). */
export function migrateSmartCardsJsonNameToScName(json: string | null): string | null {
  if (json == null) {
    return null;
  }
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed)) {
      return json;
    }
    let changed = false;
    const next = parsed.map((row: Record<string, unknown>) => {
      if (!row || typeof row !== 'object') {
        return row;
      }
      if (!('name' in row)) {
        if ('scName' in row) {
          return row;
        }
        changed = true;
        return { ...row, scName: 'Smart Card' };
      }
      const legacy = row.name;
      const sc =
        row.scName != null && String(row.scName).trim() !== ''
          ? String(row.scName).trim()
          : String(legacy ?? '').trim();
      const { name: _drop, ...rest } = row;
      changed = true;
      return { ...rest, scName: sc };
    });
    return changed ? JSON.stringify(next) : json;
  } catch {
    return json;
  }
}

export async function readSmartCardsJsonWithLegacyMigration(uid: string): Promise<string | null> {
  const key = smartCardsStorageKey(uid);
  const scoped = await AsyncStorage.getItem(key);
  if (scoped != null) {
    const migrated = migrateSmartCardsJsonNameToScName(scoped);
    if (migrated !== scoped) {
      await AsyncStorage.setItem(key, migrated!);
    }
    return migrated;
  }
  const legacy = await AsyncStorage.getItem(LEGACY_SMART_CARDS_STORAGE_KEY);
  if (legacy != null) {
    const migrated = migrateSmartCardsJsonNameToScName(legacy) ?? legacy;
    await AsyncStorage.setItem(key, migrated);
    await AsyncStorage.removeItem(LEGACY_SMART_CARDS_STORAGE_KEY);
    return migrated;
  }
  return null;
}

export async function readRecentIconsJsonWithLegacyMigration(uid: string): Promise<string | null> {
  const key = vaultRecentIconsStorageKey(uid);
  const scoped = await AsyncStorage.getItem(key);
  if (scoped != null) {
    return scoped;
  }
  const legacy = await AsyncStorage.getItem(LEGACY_VAULT_RECENT_ICONS_KEY);
  if (legacy != null) {
    await AsyncStorage.setItem(key, legacy);
    await AsyncStorage.removeItem(LEGACY_VAULT_RECENT_ICONS_KEY);
    return legacy;
  }
  return null;
}

/**
 * Call immediately before `signOut` while `auth.currentUser` is still set.
 * Clears legacy global keys and this user's scoped vault/cards/recent-icons cache.
 */
export async function clearLocalCachesForSignOut(uid: string | null): Promise<void> {
  const keys: string[] = [
    LEGACY_VAULT_STORAGE_KEY,
    LEGACY_SMART_CARDS_STORAGE_KEY,
    LEGACY_VAULT_RECENT_ICONS_KEY,
  ];
  if (uid) {
    keys.push(
      vaultStorageKey(uid),
      smartCardsStorageKey(uid),
      vaultRecentIconsStorageKey(uid),
      cardsTabFeedOrderStorageKey(uid),
    );
  }
  await AsyncStorage.multiRemove(keys);
}

import { receivedContactMergeKey } from '@/services/receivedContactsPresentationMerge';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** Misma clave que `app/(tabs)/contacts.tsx` */
export const CONTACT_META_STORAGE_KEY = 'contacts_meta_v2';

const GROUP_DEFAULT = 'Random';

type BunkerMetaRow = {
  group: string;
  isFavorite: boolean;
  firstSeenAt: string;
  storyState?: string;
  scanThemeId?: string;
  /** Foto vista al aceptar (preview QR / Firestore); respaldo si el API aún no trae userAvatarUrl. */
  seedAvatarUrl?: string;
};

export async function seedMetaForIncomingCard(params: {
  issuerUid: string;
  sid?: string | null;
  bId?: string | null;
  group: string;
  /** Tema visto al escanear (Smart / Business) para no perder la paleta en la lista. */
  scanThemeId?: string | null;
  /** URL del avatar en el modal de aceptar; se guarda solo si viene no vacía. Si se omite, se conserva la anterior. */
  seedAvatarUrl?: string | null;
}): Promise<void> {
  const issuerUid = String(params.issuerUid || '').trim();
  if (!issuerUid) {
    return;
  }
  const sid = params.sid != null && String(params.sid).trim() ? String(params.sid).trim() : null;
  const bId = params.bId != null && String(params.bId).trim() ? String(params.bId).trim() : null;
  const linkKey = receivedContactMergeKey({ uid: issuerUid, sid, bId });
  const group = String(params.group || '').trim() || GROUP_DEFAULT;
  const nowIso = new Date().toISOString();

  let map: Record<string, BunkerMetaRow> = {};
  try {
    const raw = await AsyncStorage.getItem(CONTACT_META_STORAGE_KEY);
    if (raw) {
      map = JSON.parse(raw) as Record<string, BunkerMetaRow>;
    }
  } catch {
    map = {};
  }

  const prev = map[linkKey] || map[issuerUid];
  const incomingSeed =
    params.seedAvatarUrl != null && String(params.seedAvatarUrl).trim()
      ? String(params.seedAvatarUrl).trim().slice(0, 4096)
      : undefined;
  const prevSeed =
    prev?.seedAvatarUrl != null && String(prev.seedAvatarUrl).trim()
      ? String(prev.seedAvatarUrl).trim().slice(0, 4096)
      : undefined;
  const nextSeed = incomingSeed ?? prevSeed;
  const nextTheme =
    params.scanThemeId != null && String(params.scanThemeId).trim()
      ? String(params.scanThemeId).trim()
      : prev?.scanThemeId && String(prev.scanThemeId).trim()
        ? String(prev.scanThemeId).trim()
        : undefined;
  map[linkKey] = {
    group,
    isFavorite: Boolean(prev?.isFavorite),
    firstSeenAt: prev?.firstSeenAt || nowIso,
    storyState: prev?.storyState || 'none',
    ...(nextTheme ? { scanThemeId: nextTheme } : {}),
    ...(nextSeed ? { seedAvatarUrl: nextSeed } : {}),
  };

  await AsyncStorage.setItem(CONTACT_META_STORAGE_KEY, JSON.stringify(map));
}

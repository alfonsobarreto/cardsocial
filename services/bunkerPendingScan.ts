import AsyncStorage from '@react-native-async-storage/async-storage';

export const PENDING_BUNKER_SCAN_KEY = 'bunker_pending_scan_v1';

export type PendingBunkerScan =
  | { kind: 'universal'; token: string; savedAt: string }
  | { kind: 'dynamic_qr'; token: string; cardId: string; savedAt: string };

/** Avoid `Omit<Union, K>` — `keyof` on unions is an intersection and drops `cardId`. */
export type PendingBunkerScanPayload =
  | { kind: 'universal'; token: string }
  | { kind: 'dynamic_qr'; token: string; cardId: string };

export async function savePendingBunkerScan(payload: PendingBunkerScanPayload): Promise<void> {
  const row: PendingBunkerScan = {
    ...payload,
    savedAt: new Date().toISOString(),
  } as PendingBunkerScan;
  await AsyncStorage.setItem(PENDING_BUNKER_SCAN_KEY, JSON.stringify(row));
}

export async function loadPendingBunkerScan(): Promise<PendingBunkerScan | null> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_BUNKER_SCAN_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as PendingBunkerScan;
    if (parsed?.kind === 'universal' && String((parsed as any).token || '').trim()) {
      return parsed;
    }
    if (
      parsed?.kind === 'dynamic_qr' &&
      String((parsed as any).token || '').trim() &&
      String((parsed as any).cardId || '').trim()
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export async function clearPendingBunkerScan(): Promise<void> {
  await AsyncStorage.removeItem(PENDING_BUNKER_SCAN_KEY);
}

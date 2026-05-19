/**
 * Evita pérdidas de ítems creados en local antes de que Firestore replique el doc,
 * cuando el snapshot “solo-nube” pisa AsyncStorage antes de tiempo.
 */

export interface VaultMergeableItem {
  id: string;
  updatedAt?: string;
  createdAt?: string;
}

function itemTimestampMs(item: VaultMergeableItem): number {
  const u = Date.parse(String(item.updatedAt || ''));
  if (Number.isFinite(u)) {
    return u;
  }
  const c = Date.parse(String(item.createdAt || ''));
  if (Number.isFinite(c)) {
    return c;
  }
  return 0;
}

export function mergeLocalAndCloudVaultItems<T extends VaultMergeableItem>(
  local: readonly T[],
  cloud: readonly T[],
): T[] {
  const byId = new Map<string, T>();

  const put = (item: T) => {
    const id = String(item?.id ?? '').trim();
    if (!id) {
      return;
    }
    const prev = byId.get(id);
    if (!prev) {
      byId.set(id, item);
      return;
    }
    const nextTs = itemTimestampMs(item);
    const prevTs = itemTimestampMs(prev);
    if (nextTs > prevTs) {
      byId.set(id, item);
      return;
    }
    /** Desempate: timestamps igualan o faltan → prioriza el candidato estable más reciente. */
    if (nextTs === prevTs) {
      const nextIso = `${String(item.updatedAt || '')}:${String(item.createdAt || '')}`;
      const prevIso = `${String(prev.updatedAt || '')}:${String(prev.createdAt || '')}`;
      if (nextIso >= prevIso) {
        byId.set(id, item);
      }
    }
  };

  for (const c of cloud) {
    put(c);
  }
  for (const l of local) {
    put(l);
  }

  return Array.from(byId.values());
}

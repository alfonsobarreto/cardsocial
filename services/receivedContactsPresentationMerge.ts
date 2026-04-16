/**
 * Fusiona filas recibidas del API con caché local: actualiza tema/wallpaper solo si `cardUpdatedAt` del servidor es más reciente.
 */

export function parseCardUpdatedMs(iso: string | null | undefined): number {
  if (!iso) return 0;
  const t = Date.parse(String(iso));
  return Number.isFinite(t) ? t : 0;
}

/** Campos visuales que solo deben cambiar cuando la tarjeta del emisor se actualiza en servidor. */
const VISUAL_KEYS = new Set([
  'themeId',
  'layout',
  'fontId',
  'fontName',
  'fontFamily',
  'fontTier',
  'wallpaperId',
  'wallpaperUrl',
  'wallpaperThumbUrl',
  'wallpaperTier',
  'wallpaperPriceCredits',
  'enableParallax',
  'itemIds',
  'publicCardSlots',
  'searchFacets',
  'ownerOccupation',
  'cardUpdatedAt',
]);

/** Fila con identidad estable y marca temporal opcional del diseño en servidor. */
export type PresentationMergeRow = {
  uid: string;
  sid?: string | null;
  bId?: string | null;
  cardUpdatedAt?: string | null;
} & Record<string, unknown>;

/** Clave estable por vínculo recibido: mismo emisor, varias tarjetas → varias filas. */
export function receivedContactMergeKey(row: { uid: string; sid?: string | null | undefined; bId?: string | null | undefined }): string {
  const sid = row.sid != null && String(row.sid).trim() ? String(row.sid).trim() : '';
  const bId = row.bId != null && String(row.bId).trim() ? String(row.bId).trim() : '';
  const ref = sid || bId;
  return `${String(row.uid || '').trim()}::${ref}`;
}

function pickVisualSnapshot(row: PresentationMergeRow): Partial<PresentationMergeRow> {
  const out: Partial<PresentationMergeRow> = {};
  for (const k of VISUAL_KEYS) {
    if (k in row) {
      out[k] = row[k as keyof typeof row] as unknown;
    }
  }
  return out;
}

/**
 * `remote` es la lista autoritativa de miembros (misma longitud/orden que API).
 * Si la tarjeta del contacto no cambió en servidor, se conserva el snapshot visual local para evitar parpadeos de wallpaper/tema.
 */
export function mergeReceivedContactRows<T extends PresentationMergeRow>(prev: T[], remote: T[]): T[] {
  const prevMap = new Map(prev.map((r) => [receivedContactMergeKey(r), r]));
  return remote.map((r) => {
    const old = prevMap.get(receivedContactMergeKey(r));
    if (!old) {
      return r;
    }
    const tNew = parseCardUpdatedMs(r.cardUpdatedAt);
    const tOld = parseCardUpdatedMs(old.cardUpdatedAt);
    const serverNewer = tNew > tOld || (tOld === 0 && tNew > 0);
    if (serverNewer) {
      return r;
    }
    const visual = pickVisualSnapshot(old);
    return { ...r, ...visual } as T;
  });
}

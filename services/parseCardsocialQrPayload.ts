/**
 * QR dinámico app: JSON `cardsocial-qr-v1` (ver scan.tsx).
 * Business / branded: deep links `card-social://business/...` o `card-social://qr/...`.
 */

/** Limpia BOM, espacios y extrae un deep link embebido en texto o URL. */
export function normalizeQrScanPayload(raw: string): string {
  let s = String(raw || '')
    .replace(/^\uFEFF/, '')
    .trim();
  const embedded = s.match(/(?:card-social|cardsocial):\/\/[^\s"'<>\]]+/i);
  if (embedded) {
    return embedded[0].trim();
  }
  return s;
}

export type ParsedDynamicAppQr = {
  kind: 'dynamic_app';
  token: string;
  cardId: string;
  exp: number | null;
};

export type ParsedBusinessDeepLink = {
  kind: 'business_deep_link';
  ownerUid: string;
  cardId: string;
};

function decodeParam(s: string): string {
  try {
    return decodeURIComponent(String(s || '').replace(/\+/g, ' '));
  } catch {
    return String(s || '');
  }
}

/** `card-social://business/{cardId}?owner=...&mode=permanent` */
export function parsePermanentBusinessQr(data: string): ParsedBusinessDeepLink | null {
  const raw = normalizeQrScanPayload(data);
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (!lower.includes('card-social://business/') && !lower.includes('cardsocial://business/')) {
    return null;
  }
  const mPath = raw.match(/(?:card-social|cardsocial):\/\/business\/([^?#]+)/i);
  if (!mPath) return null;
  const cardId = decodeParam(mPath[1]);
  const mOwner = raw.match(/[?&]owner=([^&]+)/i);
  if (!mOwner) return null;
  const ownerUid = decodeParam(mOwner[1]);
  if (!cardId || !ownerUid) return null;
  return { kind: 'business_deep_link', ownerUid, cardId };
}

/** `card-social://qr/{cardId}?business=...&owner=...` */
export function parseBrandedBusinessQrUrl(data: string): ParsedBusinessDeepLink | null {
  const raw = normalizeQrScanPayload(data);
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (!lower.includes('card-social://qr/') && !lower.includes('cardsocial://qr/')) {
    return null;
  }
  const mPath = raw.match(/(?:card-social|cardsocial):\/\/qr\/([^?#]+)/i);
  if (!mPath) return null;
  const cardId = decodeParam(mPath[1]);
  const mOwner = raw.match(/[?&]owner=([^&]+)/i);
  if (!mOwner) return null;
  const ownerUid = decodeParam(mOwner[1]);
  if (!cardId || !ownerUid) return null;
  return { kind: 'business_deep_link', ownerUid, cardId };
}

export function parseDynamicAppQrJson(data: string): ParsedDynamicAppQr | null {
  const raw = normalizeQrScanPayload(data);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const k = String(parsed?.kind || '').trim().toLowerCase();
    const token = String(parsed?.token || '').trim();
    const cardId = String(parsed?.cardId || '').trim();
    const expRaw = Number(parsed?.exp);
    const exp = Number.isFinite(expRaw) ? expRaw : null;
    if (token && k === 'cardsocial-qr-v1' && cardId) {
      return { kind: 'dynamic_app', token, cardId, exp };
    }
  } catch {
    /* not JSON */
  }
  return null;
}

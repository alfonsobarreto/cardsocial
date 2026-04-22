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
  sid: string | null;
  bId: string | null;
  exp: number | null;
};

export type ParsedBusinessDeepLink = {
  kind: 'business_deep_link';
  uid: string;
  bId: string;
};

function decodeParam(s: string): string {
  try {
    return decodeURIComponent(String(s || '').replace(/\+/g, ' '));
  } catch {
    return String(s || '');
  }
}

/** `card-social://business/{bId}?uid=...&mode=permanent` (legacy: `owner=`) */
export function parsePermanentBusinessQr(data: string): ParsedBusinessDeepLink | null {
  const raw = normalizeQrScanPayload(data);
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (!lower.includes('card-social://business/') && !lower.includes('cardsocial://business/')) {
    return null;
  }
  const mPath = raw.match(/(?:card-social|cardsocial):\/\/business\/([^?#]+)/i);
  if (!mPath) return null;
  const bId = decodeParam(mPath[1]);
  const mUid = raw.match(/[?&]uid=([^&]+)/i);
  const mLegacyOwner = raw.match(/[?&]owner=([^&]+)/i);
  const uidRaw = mUid?.[1] ?? mLegacyOwner?.[1];
  if (!uidRaw) return null;
  const uid = decodeParam(uidRaw);
  if (!bId || !uid) return null;
  return { kind: 'business_deep_link', uid, bId };
}

/** `card-social://qr/{bId}?business=...&uid=...` (legacy: `owner=`) */
/**
 * `https://cardsocial.me/b/{bId}?uid=...` (QR impreso / cámara del sistema).
 * Misma identidad que `card-social://business/...` para canje en app.
 */
export function parsePublicBusinessWebUrl(data: string): ParsedBusinessDeepLink | null {
  const raw = String(data || '')
    .replace(/^\uFEFF/, '')
    .trim();
  if (!raw) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    try {
      url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    } catch {
      return null;
    }
  }
  if (!/^https?:$/i.test(url.protocol)) {
    return null;
  }
  const host = url.hostname.toLowerCase();
  const allowed =
    host === 'cardsocial.me' ||
    host === 'www.cardsocial.me' ||
    host === 'cardsocial.app' ||
    host === 'www.cardsocial.app' ||
    host === 'localhost' ||
    host === '127.0.0.1';
  if (!allowed) {
    return null;
  }
  const path = url.pathname.replace(/\/+$/, '');
  const m = path.match(/\/b\/([^/]+)$/);
  if (!m) {
    return null;
  }
  const bId = decodeParam(m[1]);
  const uidRaw = url.searchParams.get('uid') || url.searchParams.get('owner');
  if (!bId || !uidRaw) {
    return null;
  }
  const uid = decodeParam(uidRaw);
  if (!uid) {
    return null;
  }
  return { kind: 'business_deep_link', uid, bId };
}

export function parseBrandedBusinessQrUrl(data: string): ParsedBusinessDeepLink | null {
  const raw = normalizeQrScanPayload(data);
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (!lower.includes('card-social://qr/') && !lower.includes('cardsocial://qr/')) {
    return null;
  }
  const mPath = raw.match(/(?:card-social|cardsocial):\/\/qr\/([^?#]+)/i);
  if (!mPath) return null;
  const bId = decodeParam(mPath[1]);
  const mUid = raw.match(/[?&]uid=([^&]+)/i);
  const mLegacyOwner = raw.match(/[?&]owner=([^&]+)/i);
  const uidRaw = mUid?.[1] ?? mLegacyOwner?.[1];
  if (!uidRaw) return null;
  const uid = decodeParam(uidRaw);
  if (!bId || !uid) return null;
  return { kind: 'business_deep_link', uid, bId };
}

export function parseDynamicAppQrJson(data: string): ParsedDynamicAppQr | null {
  const raw = normalizeQrScanPayload(data);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const k = String(parsed?.kind || '').trim().toLowerCase();
    const token = String(parsed?.token || '').trim();
    const sidRaw = parsed?.sid != null ? String(parsed.sid).trim() : '';
    const bIdRaw = parsed?.bId != null ? String(parsed.bId).trim() : '';
    const sid = sidRaw || null;
    const bId = bIdRaw || null;
    const expRaw = Number(parsed?.exp);
    const exp = Number.isFinite(expRaw) ? expRaw : null;
    if (token && k === 'cardsocial-qr-v1') {
      return { kind: 'dynamic_app', token, sid, bId, exp };
    }
  } catch {
    /* not JSON */
  }
  return null;
}

export type ParsedUniversalWebQr = {
  kind: 'universal_web';
  token: string;
};

/**
 * QR web24h: el payload suele ser `https://…/u/{token}?…` (misma forma que abre la cámara del sistema).
 * Dentro de la app del receptor debemos extraer el token y canjearlo in-app, sin abrir el navegador.
 */
export function parseUniversalWebQrUrl(data: string): ParsedUniversalWebQr | null {
  const raw = String(data || '')
    .replace(/^\uFEFF/, '')
    .trim();
  if (!raw) return null;

  const deep = raw.match(/(?:card-social|cardsocial):\/\/u\/([^?#]+)/i);
  if (deep) {
    const token = decodeURIComponent(String(deep[1] || '').trim());
    if (token) return { kind: 'universal_web', token };
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    try {
      url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    } catch {
      return null;
    }
  }

  if (!/^https?:$/i.test(url.protocol)) {
    return null;
  }

  const path = url.pathname.replace(/\/+$/, '');
  const m = path.match(/\/u\/([^/]+)$/);
  if (!m) return null;
  const token = decodeURIComponent(String(m[1] || '').trim());
  if (!token) return null;
  return { kind: 'universal_web', token };
}

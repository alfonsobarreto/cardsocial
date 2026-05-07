import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Short-lived, server-signed ticket for `/embed/market-radar`.
 * Verified only with `STUDIO_EMBED_SECRET` (never expose to clients except as one opaque query param).
 */
export type StudioEmbedPayload = {
  v: 1;
  uid: string;
  iat: number;
  exp: number;
};

export function signStudioEmbedToken(payload: StudioEmbedPayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyStudioEmbedToken(token: string, secret: string): StudioEmbedPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  if (!body || !sig) return null;
  const expected = createHmac('sha256', secret).update(body).digest('base64url');
  const sb = Buffer.from(sig, 'utf8');
  const eb = Buffer.from(expected, 'utf8');
  if (sb.length !== eb.length || !timingSafeEqual(sb, eb)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as StudioEmbedPayload;
    if (payload.v !== 1 || typeof payload.uid !== 'string' || !payload.uid) return null;
    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== 'number' || payload.exp < now) return null;
    return payload;
  } catch {
    return null;
  }
}

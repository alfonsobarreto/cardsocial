import { NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';

import { resolveAdminApp, shouldLogFirebaseAdmin } from '@/lib/firebaseAdminStudio';
import { signStudioEmbedToken } from '@/lib/studioEmbedToken';

export const runtime = 'nodejs';

/** TTL del ticket `et` (solo hasta el exchange). Muy largo para uso desde la app; la sesión real es Firebase Auth. */
const EMBED_TTL_SEC = 10 * 365 * 24 * 60 * 60;

/** Studio locale keys accepted for the embed URL (mirror `studioI18n`). */
function normalizeLang(raw: unknown): string {
  const s = String(raw || 'en').toLowerCase().split('-')[0] ?? 'en';
  return s === 'es' || s === 'en' || s === 'it' || s === 'fr' || s === 'pt' || s === 'de' ? s : 'en';
}

function embedSecretIssue(secret: string | undefined): 'embed_secret_missing' | 'embed_secret_too_short' | null {
  const s = secret?.trim() ?? '';
  if (!s) return 'embed_secret_missing';
  if (s.length < 16) return 'embed_secret_too_short';
  return null;
}

/**
 * Origin público de la página embed. Si el cliente envía `publicOrigin` y coincide con `Host`,
 * se usa (Expo + LAN); evita URLs `http://localhost:3001` en el ticket cuando el móvil abre `http://<IP>:3001`.
 */
function resolvePublicPageOrigin(req: Request, bodyPublicOrigin: unknown): string {
  const reqUrl = new URL(req.url);
  const requestOrigin = reqUrl.origin;

  const hostHeader = (req.headers.get('host') || '').trim().toLowerCase();
  const raw = typeof bodyPublicOrigin === 'string' ? bodyPublicOrigin.trim().replace(/\/+$/, '') : '';
  if (raw && /^https?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      if (parsed.username || parsed.password) {
        return requestOrigin;
      }
      if (!hostHeader || parsed.host.toLowerCase() !== hostHeader) {
        return requestOrigin;
      }
      return `${parsed.protocol}//${parsed.host}`;
    } catch {
      return requestOrigin;
    }
  }

  const forwarded = req.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  if (forwarded) {
    const rawProto = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase();
    const safeProto = rawProto === 'http' || rawProto === 'https' ? rawProto : 'https';
    return `${safeProto}://${forwarded}`;
  }

  return requestOrigin;
}

/**
 * Mint an opaque `et` ticket for `/embed/market-radar` (TTL largo para clientes nativos; tras `/api/embed/exchange` manda Firebase).
 * Called from Expo with `Authorization: Bearer <Firebase ID token>` (fresh from `getIdToken`).
 */
export async function POST(req: Request) {
  const secretRaw = process.env.STUDIO_EMBED_SECRET;
  const secretIssue = embedSecretIssue(secretRaw);
  if (secretIssue) {
    if (shouldLogFirebaseAdmin()) {
      console.error('[mint-market-radar] 503 embed secret:', secretIssue);
    }
    return NextResponse.json({ ok: false, error: secretIssue }, { status: 503 });
  }
  const secret = secretRaw!.trim();

  const admin = resolveAdminApp();
  if (!admin.ok) {
    if (shouldLogFirebaseAdmin()) {
      console.error('[mint-market-radar] 503', { error: admin.code, detail: admin.detail });
    }
    return NextResponse.json(
      { ok: false, error: admin.code, ...(admin.detail ? { detail: admin.detail } : {}) },
      { status: 503 },
    );
  }

  const authHeader = req.headers.get('authorization') || '';
  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  const idToken = match?.[1]?.trim();
  if (!idToken) {
    return NextResponse.json({ ok: false, error: 'missing_bearer_token' }, { status: 401 });
  }

  let uid: string;
  try {
    const decoded = await getAuth(admin.app).verifyIdToken(idToken);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_or_expired_id_token' }, { status: 401 });
  }

  let lang = 'en';
  let bodyPublicOrigin: unknown;
  try {
    const body = (await req.json()) as { lang?: string; publicOrigin?: string };
    lang = normalizeLang(body?.lang);
    bodyPublicOrigin = body?.publicOrigin;
  } catch {
    /* empty body OK */
  }

  const now = Math.floor(Date.now() / 1000);
  const et = signStudioEmbedToken({ v: 1, uid, iat: now, exp: now + EMBED_TTL_SEC }, secret);

  const origin = resolvePublicPageOrigin(req, bodyPublicOrigin);
  const q = new URLSearchParams({ et, lang });
  const url = `${origin.replace(/\/+$/, '')}/embed/market-radar?${q.toString()}`;

  return NextResponse.json({ ok: true, url, expiresIn: EMBED_TTL_SEC });
}

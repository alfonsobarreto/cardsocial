import { NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';

import { getAdminApp } from '@/lib/firebaseAdminStudio';
import { signStudioEmbedToken } from '@/lib/studioEmbedToken';

export const runtime = 'nodejs';

const EMBED_TTL_SEC = 600;

/** Studio locale keys accepted for the embed URL (mirror `studioI18n`). */
function normalizeLang(raw: unknown): string {
  const s = String(raw || 'en').toLowerCase().split('-')[0] ?? 'en';
  return s === 'es' || s === 'it' || s === 'fr' || s === 'pt' ? s : 'en';
}

/**
 * Mint a short-lived opaque `et` ticket for `/embed/market-radar`.
 * Called from Expo with `Authorization: Bearer <Firebase ID token>` (fresh from `getIdToken`).
 */
export async function POST(req: Request) {
  const secret = process.env.STUDIO_EMBED_SECRET?.trim();
  const app = getAdminApp();
  if (!app || !secret || secret.length < 16) {
    return NextResponse.json(
      { ok: false, error: 'unconfigured', message: 'Set STUDIO_EMBED_SECRET (min 16 chars) and FIREBASE_SERVICE_ACCOUNT_JSON.' },
      { status: 503 },
    );
  }

  const authHeader = req.headers.get('authorization') || '';
  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  const idToken = match?.[1]?.trim();
  if (!idToken) {
    return NextResponse.json({ ok: false, error: 'missing_token' }, { status: 401 });
  }

  let uid: string;
  try {
    const decoded = await getAuth(app).verifyIdToken(idToken);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_id_token' }, { status: 401 });
  }

  let lang = 'en';
  try {
    const body = (await req.json()) as { lang?: string };
    lang = normalizeLang(body?.lang);
  } catch {
    /* empty body OK */
  }

  const now = Math.floor(Date.now() / 1000);
  const et = signStudioEmbedToken({ v: 1, uid, iat: now, exp: now + EMBED_TTL_SEC }, secret);

  const origin = new URL(req.url).origin;
  const q = new URLSearchParams({ et, lang });
  const url = `${origin}/embed/market-radar?${q.toString()}`;

  return NextResponse.json({ ok: true, url, expiresIn: EMBED_TTL_SEC });
}

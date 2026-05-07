import { NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';

import { getAdminApp } from '@/lib/firebaseAdminStudio';
import { verifyStudioEmbedToken } from '@/lib/studioEmbedToken';

export const runtime = 'nodejs';

/**
 * Swap a fresh `et` ticket for a Firebase Auth custom token.
 * Called only by the embed page (`/embed/market-radar`) in the browser right after navigation.
 */
export async function POST(req: Request) {
  const secret = process.env.STUDIO_EMBED_SECRET?.trim();
  const app = getAdminApp();
  if (!app || !secret) {
    return NextResponse.json({ ok: false, error: 'unconfigured' }, { status: 503 });
  }

  let body: { et?: string };
  try {
    body = (await req.json()) as { et?: string };
  } catch {
    return NextResponse.json({ ok: false, error: 'bad_json' }, { status: 400 });
  }
  const et = String(body?.et || '').trim();
  if (!et) {
    return NextResponse.json({ ok: false, error: 'missing_et' }, { status: 400 });
  }

  const payload = verifyStudioEmbedToken(et, secret);
  if (!payload) {
    return NextResponse.json({ ok: false, error: 'invalid_or_expired_et' }, { status: 401 });
  }

  try {
    const customToken = await getAuth(app).createCustomToken(payload.uid, {
      embed_market_radar: true,
    });
    return NextResponse.json({ ok: true, customToken });
  } catch (e) {
    console.error('[embed/exchange]', e);
    return NextResponse.json({ ok: false, error: 'create_custom_token_failed' }, { status: 500 });
  }
}

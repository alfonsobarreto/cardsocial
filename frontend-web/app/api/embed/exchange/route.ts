import { NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';

import { resolveAdminApp, shouldLogFirebaseAdmin } from '@/lib/firebaseAdminStudio';
import { verifyStudioEmbedToken } from '@/lib/studioEmbedToken';

export const runtime = 'nodejs';

function embedSecretIssue(secret: string | undefined): 'embed_secret_missing' | 'embed_secret_too_short' | null {
  const s = secret?.trim() ?? '';
  if (!s) return 'embed_secret_missing';
  if (s.length < 16) return 'embed_secret_too_short';
  return null;
}

/**
 * Swap a fresh `et` ticket for a Firebase Auth custom token.
 * Called only by the embed page (`/embed/market-radar`) in the browser right after navigation.
 */
export async function POST(req: Request) {
  const secretRaw = process.env.STUDIO_EMBED_SECRET;
  const secretIssue = embedSecretIssue(secretRaw);
  if (secretIssue) {
    if (shouldLogFirebaseAdmin()) {
      console.error('[embed/exchange] 503 embed secret:', secretIssue);
    }
    return NextResponse.json({ ok: false, error: secretIssue }, { status: 503 });
  }
  const secret = secretRaw!.trim();

  const admin = resolveAdminApp();
  if (!admin.ok) {
    if (shouldLogFirebaseAdmin()) {
      console.error('[embed/exchange] 503', { error: admin.code, detail: admin.detail });
    }
    return NextResponse.json(
      { ok: false, error: admin.code, ...(admin.detail ? { detail: admin.detail } : {}) },
      { status: 503 },
    );
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
    const customToken = await getAuth(admin.app).createCustomToken(payload.uid, {
      embed_market_radar: true,
    });
    return NextResponse.json({ ok: true, customToken });
  } catch (e) {
    console.error('[embed/exchange]', e);
    return NextResponse.json(
      { ok: false, error: 'custom_token_failed', detail: (e as Error)?.message || String(e) },
      { status: 500 },
    );
  }
}

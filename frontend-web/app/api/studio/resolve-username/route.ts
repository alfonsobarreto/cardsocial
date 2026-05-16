import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '@/lib/firebaseAdminStudio';
import { pickLocaleFromHeaders, userFacingMessageForErrorCode } from '@/lib/userFacingApiMessages';

export const runtime = 'nodejs';

/**
 * Misma lógica que la app móvil (`signin.tsx` / `userIdentityFields`) pero con Admin SDK
 * (las reglas de Firestore no permiten leer `users` sin ser el dueño).
 */
function signInEmailsFromUserDoc(d: Record<string, unknown>): string[] {
  const primary = String(d.emailLower || d.email || '')
    .trim()
    .toLowerCase();
  const pending = String(d.pendingEmailLower || d.pendingEmail || '')
    .trim()
    .toLowerCase();
  const out: string[] = [];
  if (primary) out.push(primary);
  if (pending && pending !== primary) out.push(pending);
  return out;
}

async function resolveEmails(username: string): Promise<string[] | null> {
  const app = getAdminApp();
  if (!app) {
    return null;
  }
  const db = getFirestore(app);
  const normalizedLower = username.trim().toLowerCase();
  if (!normalizedLower) {
    return null;
  }

  const tryDoc = async (field: string, value: string) => {
    const snap = await db.collection('users').where(field, '==', value).limit(1).get();
    if (snap.empty) return null;
    const emails = signInEmailsFromUserDoc(snap.docs[0].data() as Record<string, unknown>);
    return emails.length ? emails : null;
  };

  const byLower = await tryDoc('userNickNameLower', normalizedLower);
  if (byLower) return byLower;
  const byLegacy = await tryDoc('nicknameLower', normalizedLower);
  if (byLegacy) return byLegacy;

  const trimmed = username.trim();
  const byNick = await tryDoc('nickname', trimmed);
  if (byNick) return byNick;
  const byUserNick = await tryDoc('userNickName', trimmed);
  if (byUserNick) return byUserNick;

  return null;
}

export async function POST(req: Request) {
  const loc = pickLocaleFromHeaders(req.headers);
  try {
    const body = (await req.json()) as { username?: string };
    const username = String(body?.username || '').trim();
    if (!username || username.length > 80) {
      return NextResponse.json(
        { ok: false, error: userFacingMessageForErrorCode('invalid', loc), errorCode: 'invalid' },
        { status: 400 },
      );
    }
    if (!getAdminApp()) {
      return NextResponse.json(
        {
          ok: false,
          error: userFacingMessageForErrorCode('unconfigured', loc),
          errorCode: 'unconfigured',
        },
        { status: 503 },
      );
    }
    const emails = await resolveEmails(username);
    if (!emails?.length) {
      return NextResponse.json(
        { ok: false, error: userFacingMessageForErrorCode('not_found', loc), errorCode: 'not_found' },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true, emails, email: emails[0] });
  } catch (e) {
    console.error('[resolve-username]', e);
    return NextResponse.json(
      { ok: false, error: userFacingMessageForErrorCode('server', loc), errorCode: 'server' },
      { status: 500 },
    );
  }
}

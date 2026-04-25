import { NextResponse } from 'next/server';
import { getApps, initializeApp, cert, type App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

export const runtime = 'nodejs';

function getAdminApp(): App | null {
  if (getApps().length > 0) {
    return getApps()[0]!;
  }
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) {
    return null;
  }
  try {
    const credentials = JSON.parse(raw) as Record<string, unknown>;
    return initializeApp({
      credential: cert(credentials as Parameters<typeof cert>[0]),
      projectId: typeof credentials.project_id === 'string' ? credentials.project_id : undefined,
    });
  } catch {
    return null;
  }
}

/**
 * Misma lógica que la app móvil (`signin.tsx` / `userIdentityFields`) pero con Admin SDK
 * (las reglas de Firestore no permiten leer `users` sin ser el dueño).
 */
async function resolveEmail(username: string): Promise<string | null> {
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
    const d = snap.docs[0].data() as { emailLower?: string; email?: string };
    return String(d.emailLower || d.email || '')
      .trim()
      .toLowerCase() || null;
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
  try {
    const body = (await req.json()) as { username?: string };
    const username = String(body?.username || '').trim();
    if (!username || username.length > 80) {
      return NextResponse.json({ ok: false, error: 'invalid' }, { status: 400 });
    }
    if (!getAdminApp()) {
      return NextResponse.json(
        { ok: false, error: 'unconfigured', message: 'Set FIREBASE_SERVICE_ACCOUNT_JSON on the server, or sign in with your email.' },
        { status: 503 },
      );
    }
    const email = await resolveEmail(username);
    if (!email) {
      return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, email });
  } catch (e) {
    console.error('[resolve-username]', e);
    return NextResponse.json({ ok: false, error: 'server' }, { status: 500 });
  }
}

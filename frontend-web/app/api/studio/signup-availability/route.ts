import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '@/lib/firebaseAdminStudio';
import { pickLocaleFromHeaders, userFacingMessageForErrorCode } from '@/lib/userFacingApiMessages';

export const runtime = 'nodejs';

/**
 * Comprueba disponibilidad de nick / email / teléfono usando Admin SDK.
 * La app móvil no puede consultar `users` sin ser el dueño (reglas Firestore).
 */
export async function POST(req: Request) {
  const loc = pickLocaleFromHeaders(req.headers);
  try {
    const app = getAdminApp();
    if (!app) {
      return NextResponse.json(
        {
          ok: false,
          error: userFacingMessageForErrorCode('unconfigured', loc),
          errorCode: 'unconfigured',
        },
        { status: 503 },
      );
    }

    const body = (await req.json()) as {
      nickname?: string;
      emailLower?: string;
      phoneNormalized?: string;
      ignoreUid?: string;
    };

    const db = getFirestore(app);
    const ignoreUid = String(body?.ignoreUid || '').trim();

    const collides = async (field: string, value: string): Promise<boolean> => {
      const v = String(value || '').trim();
      if (!v) return false;
      const snap = await db.collection('users').where(field, '==', v).limit(1).get();
      if (snap.empty) return false;
      if (ignoreUid && snap.docs[0].id === ignoreUid) return false;
      return true;
    };

    const nickTaken = async (rawNick: string): Promise<boolean> => {
      const trimmed = String(rawNick || '').trim();
      if (!trimmed) return false;
      const lower = trimmed.toLowerCase();
      if (await collides('userNickNameLower', lower)) return true;
      if (await collides('nicknameLower', lower)) return true;
      if (await collides('nickname', trimmed)) return true;
      if (await collides('userNickName', trimmed)) return true;
      return false;
    };

    const out: Record<string, 'available' | 'taken'> = {};

    if (body.nickname != null && String(body.nickname).trim()) {
      out.nickname = (await nickTaken(body.nickname)) ? 'taken' : 'available';
    }

    const emailLower = body.emailLower != null ? String(body.emailLower).trim().toLowerCase() : '';
    if (emailLower) {
      out.email = (await collides('emailLower', emailLower)) ? 'taken' : 'available';
    }

    const phoneNorm = body.phoneNormalized != null ? String(body.phoneNormalized).trim() : '';
    if (phoneNorm) {
      out.phone = (await collides('phoneNormalized', phoneNorm)) ? 'taken' : 'available';
    }

    if (Object.keys(out).length === 0) {
      return NextResponse.json(
        { ok: false, error: userFacingMessageForErrorCode('invalid', loc), errorCode: 'invalid' },
        { status: 400 },
      );
    }

    return NextResponse.json({ ok: true, ...out });
  } catch (e) {
    console.error('[signup-availability]', e);
    return NextResponse.json(
      { ok: false, error: userFacingMessageForErrorCode('server', loc), errorCode: 'server' },
      { status: 500 },
    );
  }
}

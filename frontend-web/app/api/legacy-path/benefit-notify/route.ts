import { NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { Resend } from 'resend';

import { resolveAdminApp, shouldLogFirebaseAdmin } from '@/lib/firebaseAdminStudio';
import {
  buildLegacyBenefitPlainText,
  legacyBenefitSubject,
  minReferralsMetForBenefitNotify,
  type BenefitMilestone,
} from '@card-social/services/legacyPhysicalBenefitEmailCopy';
import { pickLocaleFromHeaders, userFacingMessageForErrorCode } from '@/lib/userFacingApiMessages';
import { machineSuccessUserMessage } from '@card-social/services/machineSuccessCatalog';

export const runtime = 'nodejs';

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept-Language',
    'Access-Control-Max-Age': '86400',
  };
}

async function aggregateReferralsCount(fs: Firestore, uid: string): Promise<number> {
  const agg = await fs
    .collection('referrals')
    .where('referrerUid', '==', uid)
    .where('status', '==', 'completed')
    .count()
    .get();
  const n = Number(agg.data().count ?? 0);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function POST(req: Request) {
  const cors = corsHeaders();
  const loc = pickLocaleFromHeaders(req.headers);

  try {
    const admin = resolveAdminApp();
    if (!admin.ok) {
      return NextResponse.json(
        { ok: false, error: userFacingMessageForErrorCode(admin.code, loc), errorCode: admin.code },
        { status: 503, headers: cors },
      );
    }

    const authHeader = req.headers.get('authorization') || '';
    const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
    const idToken = match?.[1]?.trim();
    if (!idToken) {
      return NextResponse.json(
        { ok: false, error: userFacingMessageForErrorCode('missing_bearer_token', loc), errorCode: 'missing_bearer_token' },
        { status: 401, headers: cors },
      );
    }

    let uid: string;
    let recipientEmail: string | undefined;
    try {
      const decoded = await getAuth(admin.app).verifyIdToken(idToken);
      uid = decoded.uid;
      recipientEmail = decoded.email;
    } catch {
      return NextResponse.json(
        { ok: false, error: userFacingMessageForErrorCode('invalid_or_expired_id_token', loc), errorCode: 'invalid_or_expired_id_token' },
        { status: 401, headers: cors },
      );
    }

    const bodyRaw = await req.json().catch(() => null);
    const milestone = String((bodyRaw as { milestone?: string } | null)?.milestone || '').trim() as BenefitMilestone;
    const allowed = new Set<BenefitMilestone>(['pvc_or_higher', 'metal_card']);
    if (!allowed.has(milestone)) {
      return NextResponse.json(
        { ok: false, error: userFacingMessageForErrorCode('invalid_milestone', loc), errorCode: 'invalid_milestone' },
        { status: 400, headers: cors },
      );
    }
    if (!recipientEmail?.trim()) {
      return NextResponse.json(
        { ok: false, error: userFacingMessageForErrorCode('email_not_available_on_account', loc), errorCode: 'email_not_available_on_account' },
        { status: 422, headers: cors },
      );
    }

    const fs = getFirestore(admin.app);
    const count = await aggregateReferralsCount(fs, uid);
    const minimum = minReferralsMetForBenefitNotify(milestone);

    const userSnap = await fs.collection('users').doc(uid).get();
    const data = userSnap.exists ? userSnap.data() : {};
    const sent = (data?.legacyPhysicalBenefitEmails ?? {}) as { pvcOrHigher?: boolean; metal?: boolean };

    const already =
      milestone === 'pvc_or_higher' ? Boolean(sent.pvcOrHigher) : Boolean(sent.metal);
    if (already) {
      return NextResponse.json(
        {
          ok: true,
          successCode: 'ALREADY_SENT',
          message: machineSuccessUserMessage('ALREADY_SENT', loc),
        },
        { status: 200, headers: cors },
      );
    }

    if (count < minimum) {
      return NextResponse.json(
        {
          ok: false,
          error: userFacingMessageForErrorCode('tier_not_met', loc),
          errorCode: 'tier_not_met',
          count,
        },
        { status: 403, headers: cors },
      );
    }

    const apiKey = process.env.RESEND_API_KEY?.trim();
    const from = process.env.RESEND_FROM_EMAIL?.trim();
    if (!apiKey || !from) {
      if (shouldLogFirebaseAdmin()) console.error('[legacy-path/benefit-notify] Resend misconfigured');
      return NextResponse.json(
        { ok: false, error: userFacingMessageForErrorCode('email_unconfigured', loc), errorCode: 'email_unconfigured' },
        { status: 503, headers: cors },
      );
    }

    const name =
      typeof data?.userFullName === 'string' && String(data.userFullName).trim()
        ? String(data.userFullName).trim()
        : typeof data?.nickname === 'string' && String(data.nickname).trim()
          ? String(data.nickname).trim()
          : 'Card‑Social Maker';

    const emailLocale = loc;
    const plain = buildLegacyBenefitPlainText(emailLocale, name, milestone, count);

    const resend = new Resend(apiKey);
    await resend.emails.send({
      from,
      to: recipientEmail.trim(),
      subject: legacyBenefitSubject(emailLocale),
      text: plain,
      html: `<p style="font-family:Segoe UI,Roboto,sans-serif;font-size:16px;line-height:1.55;">${plain.replace(/\n/g, '<br />')}</p>`,
    });

    const nextEmails = {
      pvcOrHigher: milestone === 'pvc_or_higher' ? true : Boolean(sent.pvcOrHigher),
      metal: milestone === 'metal_card' ? true : Boolean(sent.metal),
    };
    await fs
      .collection('users')
      .doc(uid)
      .set(
        {
          legacyPhysicalBenefitEmails: nextEmails,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

    return NextResponse.json({ ok: true }, { status: 200, headers: cors });
  } catch (error) {
    console.error('[legacy-path/benefit-notify]', error);
    return NextResponse.json(
      { ok: false, error: userFacingMessageForErrorCode('send_failed', loc), errorCode: 'send_failed' },
      { status: 502, headers: cors },
    );
  }
}

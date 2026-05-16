import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { getAuth } from 'firebase-admin/auth';

import {
  buildBusinessCardEmailSignatureHtml,
  buildBusinessCardEmailSignaturePlainText,
  escapeHtmlForEmail,
  resolveAbsoluteImageUrlForEmail,
} from '@card-social/services/businessCardEmailSignatureHtml';
import {
  resolveSignatureCardPublicOrigin,
  resolveSignatureQrImageHostOrigin,
  readSignatureOriginEnvFromProcess,
} from '@card-social/services/emailSignaturePublicBase';
import { getThemeById } from '@card-social/constants/themeChest';

import { resolveAdminApp, shouldLogFirebaseAdmin } from '@/lib/firebaseAdminStudio';
import { pickLocaleFromHeaders, userFacingMessageForErrorCode } from '@/lib/userFacingApiMessages';
import { emailT, normalizeEmailLocaleFromBodyOrHeaders, type EmailLocale } from '@card-social/services/emailI18n';

export const runtime = 'nodejs';

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept-Language',
    'Access-Control-Max-Age': '86400',
  };
}

/** Origen público HTTPS para enlaces `/b/` en firma (no LAN / no `http` en desarrollo local). */
function sitePublicBase(): string {
  return resolveSignatureCardPublicOrigin(readSignatureOriginEnvFromProcess());
}

function internalApiPublicBase(): string {
  return (process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'https://api.cardsocial.me').replace(
    /\/+$/,
    '',
  );
}

/**
 * Host del `<img src>` del QR (`/api/qr/generate`).
 * Override: `SIGNATURE_QR_IMAGE_BASE_URL` cuando sea HTTPS público; si no, mismo origen canónico que la tarjeta.
 */
function signatureQrImageBaseUrl(): string {
  const cardOrigin = resolveSignatureCardPublicOrigin(readSignatureOriginEnvFromProcess());
  return resolveSignatureQrImageHostOrigin(cardOrigin, readSignatureOriginEnvFromProcess());
}

async function fetchBusinessPreviewPublic(bId: string, uid: string): Promise<Record<string, unknown> | null> {
  const API_BASE =
    process.env.INTERNAL_API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    'https://api.cardsocial.me';

  try {
    const qs = new URLSearchParams({ bId, uid, source: 'email-signature-send' });
    const res = await fetch(`${API_BASE.replace(/\/+$/, '')}/api/public/business-card-preview?${qs}`, {
      cache: 'no-store',
    });
    const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok || !data || data.ok !== true) return null;
    return data;
  } catch {
    return null;
  }
}

function wrapCorporateSignatureEmail(signatureHtmlFragment: string, locale: EmailLocale): string {
  const lang = locale;

  const headline = escapeHtmlForEmail(emailT(locale, 'email_sig_wrap_headline'));
  const p1 = escapeHtmlForEmail(emailT(locale, 'email_sig_wrap_p1'));
  const p2 = escapeHtmlForEmail(emailT(locale, 'email_sig_wrap_p2'));

  return `<!DOCTYPE html>
<html lang="${lang}">
<head><meta charset="utf-8" /></head>
<body style="margin:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#222;">
  <div style="max-width:640px;margin:0 auto;padding:28px 20px;">
    <h1 style="font-size:20px;line-height:1.3;margin:0 0 16px;color:#111;">${headline}</h1>
    <p style="font-size:15px;line-height:1.55;margin:0 0 12px;">${p1}</p>
    <p style="font-size:15px;line-height:1.55;margin:0 0 28px;color:#444;">${p2}</p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin:0;">
      <tr><td style="padding:0;">${signatureHtmlFragment}</td></tr>
    </table>
  </div>
</body></html>`;
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
        {
          ok: false,
          error: userFacingMessageForErrorCode('invalid_or_expired_id_token', loc),
          errorCode: 'invalid_or_expired_id_token',
        },
        { status: 401, headers: cors },
      );
    }

    const bodyRaw = await req.json().catch(() => null);
    const bId = String((bodyRaw as { bId?: string } | null)?.bId || '').trim();
    const locale = normalizeEmailLocaleFromBodyOrHeaders(
      (bodyRaw as { locale?: string } | null)?.locale,
      req.headers,
      pickLocaleFromHeaders,
    );

    if (!bId) {
      return NextResponse.json(
        { ok: false, error: userFacingMessageForErrorCode('bId_required', loc), errorCode: 'bId_required' },
        { status: 400, headers: cors },
      );
    }
    if (!recipientEmail?.trim()) {
      return NextResponse.json(
        {
          ok: false,
          error: userFacingMessageForErrorCode('email_not_available_on_account', loc),
          errorCode: 'email_not_available_on_account',
        },
        { status: 422, headers: cors },
      );
    }

    const preview = await fetchBusinessPreviewPublic(bId, uid);
    if (!preview) {
      return NextResponse.json(
        {
          ok: false,
          error: userFacingMessageForErrorCode('card_not_found_or_forbidden', loc),
          errorCode: 'card_not_found_or_forbidden',
        },
        { status: 404, headers: cors },
      );
    }

    const bcName = String(preview.cardName ?? '').trim() || 'Card-Social';
    const bcContactRaw = preview.bcContactName != null ? String(preview.bcContactName).trim() : '';
    const themeId = String(preview.themeId ?? '').trim() || undefined;
    const themeMetaName = themeId ? getThemeById(themeId)?.name : undefined;
    const subtitle =
      bcContactRaw ||
      (themeMetaName != null ? String(themeMetaName).trim() : '') ||
      emailT(locale, 'email_sig_fallback_subtitle');

    const publicCardSite = sitePublicBase();
    const apiOrigin = internalApiPublicBase();
    /** Origen absoluto del endpoint `/api/qr/generate` (prioriza `SIGNATURE_QR_IMAGE_BASE_URL`). */
    const qrBase = signatureQrImageBaseUrl();

    const publicCardUrl = `${publicCardSite}/b/${encodeURIComponent(bId)}?uid=${encodeURIComponent(uid)}`;
    const logoRaw = preview.ownerPhotoUrl != null ? String(preview.ownerPhotoUrl).trim() : '';
    const logoUrl = resolveAbsoluteImageUrlForEmail(logoRaw, {
      siteOrigin: publicCardSite,
      apiOrigin,
    });

    const signatureHtml = buildBusinessCardEmailSignatureHtml({
      webBaseUrl: qrBase,
      publicCardUrl,
      bcName,
      subtitle,
      logoUrl,
      themeId,
      emailLogoNormalize: { siteOrigin: publicCardSite, apiOrigin },
      qrImageAlt: emailT(locale, 'email_sig_qr_alt'),
    });

    const plainCompanion = buildBusinessCardEmailSignaturePlainText({
      bcName,
      subtitle,
      publicCardUrl,
    });

    const apiKey = process.env.RESEND_API_KEY?.trim();
    const from = process.env.RESEND_FROM_EMAIL?.trim();

    if (!apiKey || !from) {
      if (shouldLogFirebaseAdmin()) {
        console.error('[email-signature/send] Resend misconfigured');
      }
      return NextResponse.json(
        { ok: false, error: userFacingMessageForErrorCode('email_unconfigured', loc), errorCode: 'email_unconfigured' },
        { status: 503, headers: cors },
      );
    }

    const resend = new Resend(apiKey);
    await resend.emails.send({
      from,
      to: recipientEmail.trim(),
      subject: emailT(locale, 'email_sig_subject'),
      text: `${emailT(locale, 'email_sig_text_preamble')}\n\n${plainCompanion}`,
      html: wrapCorporateSignatureEmail(signatureHtml, locale),
    });

    return NextResponse.json({ ok: true }, { status: 200, headers: cors });
  } catch (error) {
    console.error('[email-signature/send]', error);
    return NextResponse.json(
      { ok: false, error: userFacingMessageForErrorCode('send_failed', loc), errorCode: 'send_failed' },
      { status: 502, headers: cors },
    );
  }
}

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

export const runtime = 'nodejs';

type EmailSigLocale = 'es' | 'en';

const EMAIL_SIGNATURE_I18N: Record<
  EmailSigLocale,
  { subject: string; wrapHeadline: string; wrapP1: string; wrapP2: string; textPreamble: string }
> = {
  es: {
    subject: 'Tu nueva firma corporativa',
    wrapHeadline: 'Tu nueva firma corporativa',
    wrapP1:
      'Abre este correo en tu computadora. Selecciona la firma de abajo (solo el recuadro con logo y QR) y cópiala. Evita seleccionar la descripción textual — solo bloqueamos la tabla de la marca.',
    wrapP2:
      'Pégala después en Gmail o Outlook Web: Configuración → Firma. En la app de correo móvil suele tratarse mejor el pegado cuando la firma llega así desde escritorio.',
    textPreamble:
      'Instrucciones: abre en tu computadora, copia el bloque de firma desde el HTML del correo, y pégala en Gmail/Outlook.',
  },
  en: {
    subject: 'Your new corporate signature',
    wrapHeadline: 'Your new corporate signature',
    wrapP1:
      'Open this email on your desktop. Select the signature block below (the card with logo and QR code) and copy it. Prefer selecting only the branded table.',
    wrapP2:
      'Paste it into Gmail or Outlook Web: Settings → Signature. Mail apps on phones often behave better once the signature came from desktop email.',
    textPreamble:
      'Instructions: open on desktop, copy the branded signature block from this email HTML, paste into Gmail/Outlook.',
  },
};

function normalizeEmailSigLocale(raw: string | undefined | null): EmailSigLocale {
  return String(raw || '').toLowerCase() === 'es' ? 'es' : 'en';
}

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

function wrapCorporateSignatureEmail(signatureHtmlFragment: string, locale: EmailSigLocale): string {
  const copy = EMAIL_SIGNATURE_I18N[locale];
  const lang = locale === 'es' ? 'es' : 'en';

  const headline = escapeHtmlForEmail(copy.wrapHeadline);
  const p1 = escapeHtmlForEmail(copy.wrapP1);
  const p2 = escapeHtmlForEmail(copy.wrapP2);

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

  try {
    const admin = resolveAdminApp();
    if (!admin.ok) {
      return NextResponse.json(
        { ok: false, error: admin.code },
        { status: 503, headers: cors },
      );
    }

    const authHeader = req.headers.get('authorization') || '';
    const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
    const idToken = match?.[1]?.trim();
    if (!idToken) {
      return NextResponse.json({ ok: false, error: 'missing_bearer_token' }, { status: 401, headers: cors });
    }

    let uid: string;
    let recipientEmail: string | undefined;
    try {
      const decoded = await getAuth(admin.app).verifyIdToken(idToken);
      uid = decoded.uid;
      recipientEmail = decoded.email;
    } catch {
      return NextResponse.json({ ok: false, error: 'invalid_or_expired_id_token' }, { status: 401, headers: cors });
    }

    const bodyRaw = await req.json().catch(() => null);
    const bId = String((bodyRaw as { bId?: string } | null)?.bId || '').trim();
    const locale = normalizeEmailSigLocale((bodyRaw as { locale?: string } | null)?.locale);

    if (!bId) {
      return NextResponse.json({ ok: false, error: 'bId_required' }, { status: 400, headers: cors });
    }
    if (!recipientEmail?.trim()) {
      return NextResponse.json({ ok: false, error: 'email_not_available_on_account' }, { status: 422, headers: cors });
    }

    const preview = await fetchBusinessPreviewPublic(bId, uid);
    if (!preview) {
      return NextResponse.json({ ok: false, error: 'card_not_found_or_forbidden' }, { status: 404, headers: cors });
    }

    const bcName = String(preview.cardName ?? '').trim() || 'Card-Social';
    const bcContactRaw = preview.bcContactName != null ? String(preview.bcContactName).trim() : '';
    const themeId = String(preview.themeId ?? '').trim() || undefined;
    const themeMetaName = themeId ? getThemeById(themeId)?.name : undefined;
    const subtitle =
      bcContactRaw ||
      (themeMetaName != null ? String(themeMetaName).trim() : '') ||
      (locale === 'es' ? 'Tarjeta de negocio' : 'Business card');

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

    const i18n = EMAIL_SIGNATURE_I18N[locale];

    const signatureHtml = buildBusinessCardEmailSignatureHtml({
      webBaseUrl: qrBase,
      publicCardUrl,
      bcName,
      subtitle,
      logoUrl,
      themeId,
      emailLogoNormalize: { siteOrigin: publicCardSite, apiOrigin },
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
      return NextResponse.json({ ok: false, error: 'email_unconfigured' }, { status: 503, headers: cors });
    }

    const resend = new Resend(apiKey);
    await resend.emails.send({
      from,
      to: recipientEmail.trim(),
      subject: i18n.subject,
      text: `${i18n.textPreamble}\n\n${plainCompanion}`,
      html: wrapCorporateSignatureEmail(signatureHtml, locale),
    });

    return NextResponse.json({ ok: true }, { status: 200, headers: cors });
  } catch (error) {
    console.error('[email-signature/send]', error);
    return NextResponse.json({ ok: false, error: 'send_failed' }, { status: 502, headers: cors });
  }
}

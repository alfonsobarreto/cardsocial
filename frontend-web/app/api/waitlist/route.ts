import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

import { getAdminApp } from '@/lib/firebaseAdminStudio';
import { pickLocaleFromHeaders, userFacingMessageForErrorCode } from '@/lib/userFacingApiMessages';
import { emailT, type EmailLocale } from '@card-social/services/emailI18n';

export const runtime = 'nodejs';

type Locale = EmailLocale;
type Interest = 'personal' | 'business' | 'investor';

type WaitlistPayload = {
  locale?: Locale;
  fullName?: string;
  email?: string;
  phoneCountryCode?: string;
  phoneNational?: string;
  phoneE164?: string;
  interest?: Interest;
  interestLabel?: string;
  pagePath?: string;
  company?: string;
};

function clean(value: unknown, max = 500): string {
  return String(value || '').trim().slice(0, max);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** Siempre minúsculas + trim para coincidir con sync waitlist y doc IDs. */
function normalizeLeadEmail(value: unknown): string {
  return clean(value, 160).toLowerCase();
}

function normalizeLocale(raw: unknown): Locale {
  if (raw === 'es' || raw === 'en' || raw === 'it' || raw === 'fr' || raw === 'de' || raw === 'pt') {
    return raw;
  }
  return 'en';
}

function normalizeInterest(raw: unknown): Interest | null {
  if (raw === 'personal' || raw === 'business' || raw === 'investor') return raw;
  return null;
}

function waitlistLeadDocId(emailLower: string): string {
  return Buffer.from(emailLower.trim().toLowerCase(), 'utf8').toString('base64url');
}

/**
 * Idioma del correo al equipo interno. `WAITLIST_ADMIN_EMAIL_LOCALE` = es | en | it | pt | fr | de (por defecto `es`).
 */
function waitlistAdminNotifyLocale(): Locale {
  const r = process.env.WAITLIST_ADMIN_EMAIL_LOCALE?.trim().toLowerCase();
  if (r === 'es' || r === 'en' || r === 'it' || r === 'pt' || r === 'fr' || r === 'de') return r;
  return 'es';
}

function notifySubject(interest: Interest, locale: Locale): string {
  return emailT(locale, `waitlist_notify_subject_${interest}`);
}

function interestLabelForLocale(interest: Interest, locale: Locale): string {
  return emailT(locale, `waitlist_interest_label_${interest}`);
}

function leadLocaleDisplayForAdmin(leadLocale: Locale, adminLocale: Locale): string {
  return emailT(adminLocale, `waitlist_lead_lang_${leadLocale}`);
}

function adminEmailHtml(
  lead: Required<Omit<WaitlistPayload, 'company'>>,
  submittedAt: string,
  adminLoc: Locale,
): string {
  const headline = notifySubject(lead.interest, adminLoc);
  const intro = emailT(adminLoc, 'waitlist_admin_intro');
  const interestLine = interestLabelForLocale(lead.interest, adminLoc);
  const langLine = leadLocaleDisplayForAdmin(lead.locale, adminLoc);
  const ln = (k: string, v: string) =>
    `<li><strong>${escapeHtml(emailT(adminLoc, k))}:</strong> ${v}</li>`;
  return `
    <div style="font-family:Arial,sans-serif;color:#111;line-height:1.5">
      <h2>${escapeHtml(headline)}</h2>
      <p>${escapeHtml(intro)}</p>
      <ul>
        ${ln('waitlist_admin_label_name', escapeHtml(lead.fullName))}
        ${ln('waitlist_admin_label_email', escapeHtml(lead.email))}
        ${ln(
          'waitlist_admin_label_phone',
          `${escapeHtml(lead.phoneE164)} (${escapeHtml(lead.phoneCountryCode)} ${escapeHtml(lead.phoneNational)})`,
        )}
        ${ln('waitlist_admin_label_interest', escapeHtml(interestLine))}
        ${ln('waitlist_admin_label_language', escapeHtml(langLine))}
        ${ln('waitlist_admin_label_page', escapeHtml(lead.pagePath))}
        ${ln('waitlist_admin_label_date', escapeHtml(submittedAt))}
      </ul>
    </div>
  `;
}

function adminEmailText(
  lead: Required<Omit<WaitlistPayload, 'company'>>,
  submittedAt: string,
  adminLoc: Locale,
): string {
  const l = (key: string) => emailT(adminLoc, key);
  const headline = notifySubject(lead.interest, adminLoc);
  const interestLine = interestLabelForLocale(lead.interest, adminLoc);
  const langLine = leadLocaleDisplayForAdmin(lead.locale, adminLoc);
  return [
    headline,
    '',
    emailT(adminLoc, 'waitlist_admin_intro'),
    `${l('waitlist_admin_label_name')}: ${lead.fullName}`,
    `${l('waitlist_admin_label_email')}: ${lead.email}`,
    `${l('waitlist_admin_label_phone')}: ${lead.phoneE164} (${lead.phoneCountryCode} ${lead.phoneNational})`,
    `${l('waitlist_admin_label_interest')}: ${interestLine}`,
    `${l('waitlist_admin_label_language')}: ${langLine}`,
    `${l('waitlist_admin_label_page')}: ${lead.pagePath}`,
    `${l('waitlist_admin_label_date')}: ${submittedAt}`,
  ].join('\n');
}

function autoReplySubject(locale: Locale, interest: Interest): string {
  if (interest === 'investor') {
    return emailT(locale, 'waitlist_autoreply_subject_investor');
  }
  return emailT(locale, 'waitlist_autoreply_subject_beta');
}

function autoReplyHtml(locale: Locale, interest: Interest, executiveSummaryUrl: string): string {
  if (interest === 'investor') {
    return `
      <div style="font-family:Arial,sans-serif;color:#111;line-height:1.6">
        <h2>${escapeHtml(emailT(locale, 'waitlist_autoreply_investor_h2'))}</h2>
        <p>${escapeHtml(emailT(locale, 'waitlist_autoreply_investor_p1'))}</p>
        <p><a href="${escapeHtml(executiveSummaryUrl)}">${escapeHtml(emailT(locale, 'waitlist_autoreply_investor_link_text'))}</a></p>
        <p>${escapeHtml(emailT(locale, 'waitlist_autoreply_investor_p2'))}</p>
      </div>
    `;
  }
  return `
    <div style="font-family:Arial,sans-serif;color:#111;line-height:1.6">
      <h2>${escapeHtml(emailT(locale, 'waitlist_autoreply_beta_h2'))}</h2>
      <p>${escapeHtml(emailT(locale, 'waitlist_autoreply_beta_p1'))}</p>
      <p>${escapeHtml(emailT(locale, 'waitlist_autoreply_beta_p2'))}</p>
    </div>
  `;
}

function autoReplyText(locale: Locale, interest: Interest, executiveSummaryUrl: string): string {
  if (interest === 'investor') {
    return [
      emailT(locale, 'waitlist_autoreply_investor_h2'),
      emailT(locale, 'waitlist_autoreply_investor_p1'),
      `${emailT(locale, 'waitlist_autoreply_investor_link_text')}: ${executiveSummaryUrl}`,
      emailT(locale, 'waitlist_autoreply_investor_p2'),
    ].join('\n\n');
  }
  return [emailT(locale, 'waitlist_autoreply_beta_h2'), '', emailT(locale, 'waitlist_autoreply_beta_p1'), '', emailT(locale, 'waitlist_autoreply_beta_p2')].join('\n');
}

async function sendWebhook(lead: Required<Omit<WaitlistPayload, 'company'>>, submittedAt: string) {
  const webhookUrl = process.env.WAITLIST_WEBHOOK_URL?.trim();
  if (!webhookUrl) return;
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...lead, submittedAt, source: 'cardsocial.me' }),
    });
  } catch (error) {
    console.error('[waitlist/webhook]', error);
  }
}

export async function POST(req: Request) {
  const loc = pickLocaleFromHeaders(req.headers);
  let body: WaitlistPayload;
  try {
    body = (await req.json()) as WaitlistPayload;
  } catch {
    return NextResponse.json(
      { ok: false, error: userFacingMessageForErrorCode('bad_json', loc), errorCode: 'bad_json' },
      { status: 400 },
    );
  }

  if (clean(body.company)) {
    return NextResponse.json({ ok: true });
  }

  const locale = normalizeLocale(body.locale);
  const interest = normalizeInterest(body.interest);
  const fullName = clean(body.fullName, 120);
  const email = normalizeLeadEmail(body.email);
  const phoneCountryCode = clean(body.phoneCountryCode, 12);
  const phoneNational = clean(body.phoneNational, 60);
  const phoneE164 = clean(body.phoneE164, 32);
  const pagePath = clean(body.pagePath, 80) || (locale === 'es' ? '/es' : '/');

  if (!fullName || !isEmail(email) || !phoneCountryCode || !phoneNational || !phoneE164 || !interest) {
    return NextResponse.json(
      { ok: false, error: userFacingMessageForErrorCode('invalid_payload', loc), errorCode: 'invalid_payload' },
      { status: 400 },
    );
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  const notifyTo = process.env.WAITLIST_NOTIFY_TO?.trim() || 'pochobs@gmail.com';
  const executiveSummaryUrl =
    process.env.EXECUTIVE_SUMMARY_URL?.trim() || 'https://cardsocial.me/executive-summary';

  if (!apiKey || !from) {
    return NextResponse.json(
      { ok: false, error: userFacingMessageForErrorCode('email_unconfigured', loc), errorCode: 'email_unconfigured' },
      { status: 503 },
    );
  }

  const adminLoc = waitlistAdminNotifyLocale();

  const lead = {
    locale,
    fullName,
    email,
    phoneCountryCode,
    phoneNational,
    phoneE164,
    interest,
    interestLabel: interestLabelForLocale(interest, locale),
    pagePath,
  };
  const submittedAt = new Date().toISOString();
  const resend = new Resend(apiKey);

  await sendWebhook(lead, submittedAt);

  try {
    await resend.emails.send({
      from,
      to: notifyTo,
      replyTo: email,
      subject: notifySubject(interest, adminLoc),
      text: adminEmailText(lead, submittedAt, adminLoc),
      html: adminEmailHtml(lead, submittedAt, adminLoc),
    });

    await resend.emails.send({
      from,
      to: email,
      subject: autoReplySubject(locale, interest),
      text: autoReplyText(locale, interest, executiveSummaryUrl),
      html: autoReplyHtml(locale, interest, executiveSummaryUrl),
    });
  } catch (error) {
    console.error('[waitlist/resend]', error);
    return NextResponse.json(
      { ok: false, error: userFacingMessageForErrorCode('email_failed', loc), errorCode: 'email_failed' },
      { status: 502 },
    );
  }

  const adminApp = getAdminApp();
  if (adminApp) {
    try {
      const fs = getFirestore(adminApp);
      const docId = waitlistLeadDocId(email);
      await fs.collection('waitlist_leads').doc(docId).set(
        {
          email,
          fullName: lead.fullName,
          phoneE164: lead.phoneE164,
          phoneCountryCode: lead.phoneCountryCode,
          phoneNational: lead.phoneNational,
          interest: lead.interest,
          locale: lead.locale,
          pagePath: lead.pagePath,
          submittedAt,
          source: 'landing',
          confirmed: false,
          leadCreatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    } catch (err) {
      console.error('[waitlist/firestore]', err);
    }
  }

  return NextResponse.json({ ok: true });
}

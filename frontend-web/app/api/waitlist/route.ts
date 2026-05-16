import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

import { getAdminApp } from '@/lib/firebaseAdminStudio';
import { pickLocaleFromHeaders, userFacingMessageForErrorCode } from '@/lib/userFacingApiMessages';

export const runtime = 'nodejs';

type Locale = 'en' | 'es';
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

const interestLabels: Record<Locale, Record<Interest, string>> = {
  en: {
    personal: 'Secure my personal card',
    business: 'I am a Business Owner',
    investor: 'I am an Investor',
  },
  es: {
    personal: 'Asegurar mi tarjeta personal',
    business: 'Soy dueño de negocio',
    investor: 'Soy inversionista',
  },
};

const notifySubjects: Record<Locale, Record<Interest, string>> = {
  en: {
    personal: 'New personal card lead for Card-Social',
    business: 'New business owner lead for Card-Social',
    investor: 'You have a new investor lead for Card-Social',
  },
  es: {
    personal: 'Nuevo usuario interesado en su tarjeta personal',
    business: 'Nuevo dueño de negocio interesado en Card-Social',
    investor: 'Tienes un inversionista interesado en Card-Social',
  },
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
  return raw === 'es' ? 'es' : 'en';
}

function normalizeInterest(raw: unknown): Interest | null {
  if (raw === 'personal' || raw === 'business' || raw === 'investor') return raw;
  return null;
}

function waitlistLeadDocId(emailLower: string): string {
  return Buffer.from(emailLower.trim().toLowerCase(), 'utf8').toString('base64url');
}

function adminEmailHtml(lead: Required<Omit<WaitlistPayload, 'company'>>, submittedAt: string): string {
  const localeName = lead.locale === 'es' ? 'Español' : 'English';
  return `
    <div style="font-family:Arial,sans-serif;color:#111;line-height:1.5">
      <h2>${escapeHtml(notifySubjects[lead.locale][lead.interest])}</h2>
      <p>Tienes un nuevo lead desde la landing de Card-Social.</p>
      <ul>
        <li><strong>Nombre:</strong> ${escapeHtml(lead.fullName)}</li>
        <li><strong>Email:</strong> ${escapeHtml(lead.email)}</li>
        <li><strong>Teléfono/WhatsApp:</strong> ${escapeHtml(lead.phoneE164)} (${escapeHtml(lead.phoneCountryCode)} ${escapeHtml(lead.phoneNational)})</li>
        <li><strong>Interés:</strong> ${escapeHtml(lead.interestLabel)}</li>
        <li><strong>Idioma:</strong> ${localeName}</li>
        <li><strong>Página:</strong> ${escapeHtml(lead.pagePath)}</li>
        <li><strong>Fecha:</strong> ${escapeHtml(submittedAt)}</li>
      </ul>
    </div>
  `;
}

function adminEmailText(lead: Required<Omit<WaitlistPayload, 'company'>>, submittedAt: string): string {
  return [
    notifySubjects[lead.locale][lead.interest],
    '',
    'Tienes un nuevo lead desde la landing de Card-Social.',
    `Nombre: ${lead.fullName}`,
    `Email: ${lead.email}`,
    `Telefono/WhatsApp: ${lead.phoneE164} (${lead.phoneCountryCode} ${lead.phoneNational})`,
    `Interes: ${lead.interestLabel}`,
    `Idioma: ${lead.locale === 'es' ? 'Español' : 'English'}`,
    `Pagina: ${lead.pagePath}`,
    `Fecha: ${submittedAt}`,
  ].join('\n');
}

function autoReplySubject(locale: Locale, interest: Interest): string {
  if (interest === 'investor') {
    return locale === 'es'
      ? 'Card-Social: acceso al resumen ejecutivo'
      : 'Card-Social: access to the executive summary';
  }
  return locale === 'es'
    ? 'Bienvenido a la Beta privada de Card-Social'
    : 'Welcome to the Card-Social private beta';
}

function autoReplyHtml(locale: Locale, interest: Interest, executiveSummaryUrl: string): string {
  if (interest === 'investor') {
    if (locale === 'es') {
      return `
        <div style="font-family:Arial,sans-serif;color:#111;line-height:1.6">
          <h2>Gracias por tu interés en Card-Social.</h2>
          <p>Recibimos tu solicitud como inversionista. Nuestro equipo revisará tu información y te contactará con los próximos pasos.</p>
          <p><a href="${escapeHtml(executiveSummaryUrl)}">Descarga nuestro Resumen Ejecutivo aquí</a></p>
          <p>Card-Social está construyendo una infraestructura de identidad, privacidad e inteligencia local para la nueva economía de networking.</p>
        </div>
      `;
    }
    return `
      <div style="font-family:Arial,sans-serif;color:#111;line-height:1.6">
        <h2>Thank you for your interest in Card-Social.</h2>
        <p>We received your investor request. Our team will review your information and follow up with next steps.</p>
        <p><a href="${escapeHtml(executiveSummaryUrl)}">Download our Executive Summary here</a></p>
        <p>Card-Social is building identity, privacy, and local intelligence infrastructure for the new networking economy.</p>
      </div>
    `;
  }

  if (locale === 'es') {
    return `
      <div style="font-family:Arial,sans-serif;color:#111;line-height:1.6">
        <h2>Bienvenido a Card-Social.</h2>
        <p>Recibimos tu solicitud para la Beta privada. Estás en la lista para acceder a una nueva forma de proteger tu identidad, compartir tarjetas dinámicas y entrar al Social Market.</p>
        <p>Te contactaremos pronto con los próximos pasos.</p>
      </div>
    `;
  }
  return `
    <div style="font-family:Arial,sans-serif;color:#111;line-height:1.6">
      <h2>Welcome to Card-Social.</h2>
      <p>We received your private beta request. You are on the list to access a new way to protect your identity, share dynamic cards, and enter the Social Market.</p>
      <p>We will follow up soon with next steps.</p>
    </div>
  `;
}

function autoReplyText(locale: Locale, interest: Interest, executiveSummaryUrl: string): string {
  if (interest === 'investor') {
    return locale === 'es'
      ? [
          'Gracias por tu interés en Card-Social.',
          'Recibimos tu solicitud como inversionista. Nuestro equipo revisará tu información y te contactará con los próximos pasos.',
          `Descarga nuestro Resumen Ejecutivo aquí: ${executiveSummaryUrl}`,
          'Card-Social está construyendo una infraestructura de identidad, privacidad e inteligencia local para la nueva economía de networking.',
        ].join('\n\n')
      : [
          'Thank you for your interest in Card-Social.',
          'We received your investor request. Our team will review your information and follow up with next steps.',
          `Download our Executive Summary here: ${executiveSummaryUrl}`,
          'Card-Social is building identity, privacy, and local intelligence infrastructure for the new networking economy.',
        ].join('\n\n');
  }
  return locale === 'es'
    ? 'Bienvenido a Card-Social.\n\nRecibimos tu solicitud para la Beta privada. Te contactaremos pronto con los próximos pasos.'
    : 'Welcome to Card-Social.\n\nWe received your private beta request. We will follow up soon with next steps.';
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

  const lead = {
    locale,
    fullName,
    email,
    phoneCountryCode,
    phoneNational,
    phoneE164,
    interest,
    interestLabel: interestLabels[locale][interest],
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
      subject: notifySubjects[locale][interest],
      text: adminEmailText(lead, submittedAt),
      html: adminEmailHtml(lead, submittedAt),
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

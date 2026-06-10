/**
 * POST /api/email-signature/send — envío de firma HTML por correo (móvil Dashboard).
 * Implementado en Express (sin proxy a Next) para evitar timeouts por cold start de Next.js.
 */

const express = require('express');
const path = require('path');

const { verifyFirebaseIdToken } = require('../lib/firebaseAdminApp');
const { sendEmail, isEmailSendConfigured } = require('../services/email.service');
const { EMAIL_SENDERS } = require('../config/emailSenders');
const {
  buildBusinessCardEmailSignatureHtml,
  buildBusinessCardEmailSignaturePlainText,
  resolveAbsoluteImageUrlForEmail,
  wrapCorporateSignatureEmail,
} = require('../lib/businessCardEmailSignatureHtml');
const { resolveSignatureOriginsForEmail } = require('../lib/emailSignatureOrigins');

const emailLocales = require(path.join(__dirname, '../../../services/i18n/emailLocales.json'));

function corsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept-Language');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function emailT(locale, key) {
  const row = emailLocales[key];
  if (!row || typeof row !== 'object') return key;
  return row[locale] || row.en || row.es || key;
}

function normalizeLocale(raw) {
  const l = String(raw || '').trim().toLowerCase();
  return l === 'es' ? 'es' : 'en';
}

function jsonError(res, status, errorCode, message) {
  return res.status(status).json({ ok: false, error: message, errorCode });
}

async function loadBusinessCardForSignature(db, uid, bId) {
  const [bizDoc, cardDoc] = await Promise.all([
    db.collection('business_cards').findOne(
      { bId, ownerUid: uid },
      {
        projection: {
          bcName: 1,
          bcContactName: 1,
          bcLogoUrl: 1,
          themeId: 1,
        },
      },
    ),
    db.collection('smart_cards').findOne(
      { $and: [{ $or: [{ uid }, { ownerUid: uid }] }, { bId }] },
      { projection: { scName: 1, ownerPhotoUrl: 1 } },
    ),
  ]);
  if (!bizDoc) return null;

  const bcName =
    bizDoc.bcName != null && String(bizDoc.bcName).trim()
      ? String(bizDoc.bcName).trim()
      : cardDoc?.scName != null && String(cardDoc.scName).trim()
        ? String(cardDoc.scName).trim()
        : 'Card-Social';
  const bcContactName =
    bizDoc.bcContactName != null && String(bizDoc.bcContactName).trim()
      ? String(bizDoc.bcContactName).trim()
      : '';
  const logoRaw = bizDoc.bcLogoUrl ? String(bizDoc.bcLogoUrl).trim() : '';
  const fallbackPhoto =
    cardDoc?.ownerPhotoUrl != null ? String(cardDoc.ownerPhotoUrl).trim() : '';

  return {
    bcName,
    bcContactName,
    themeId: bizDoc.themeId != null ? String(bizDoc.themeId).trim() : '',
    ownerPhotoUrl: logoRaw || fallbackPhoto || null,
  };
}

function createEmailSignatureRoutes({ storage, env }) {
  const router = express.Router();

  router.options('/send', (req, res) => {
    corsHeaders(res);
    res.status(204).end();
  });

  router.post('/send', async (req, res) => {
    corsHeaders(res);
    const locale = normalizeLocale(req.body?.locale);

    try {
      if (!isEmailSendConfigured()) {
        return jsonError(
          res,
          503,
          'email_unconfigured',
          locale === 'es'
            ? 'El envío por email no está configurado del lado del servidor.'
            : 'Outbound email is not configured on the server.',
        );
      }

      const authHeader = String(req.headers.authorization || '');
      const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
      const idToken = match?.[1]?.trim();
      if (!idToken) {
        return jsonError(
          res,
          401,
          'missing_bearer_token',
          locale === 'es' ? 'Falta el token de sesión.' : 'Missing session token.',
        );
      }

      let uid;
      let recipientEmail;
      try {
        const decoded = await verifyFirebaseIdToken(idToken);
        uid = String(decoded.uid || '').trim();
        recipientEmail = decoded.email ? String(decoded.email).trim() : '';
      } catch {
        return jsonError(
          res,
          401,
          'invalid_or_expired_id_token',
          locale === 'es' ? 'Sesión expirada. Vuelve a iniciar sesión.' : 'Session expired. Sign in again.',
        );
      }

      const bId = String(req.body?.bId || '').trim();
      if (!bId) {
        return jsonError(
          res,
          400,
          'bId_required',
          locale === 'es' ? 'Falta el identificador de la tarjeta.' : 'Card id is required.',
        );
      }
      if (!recipientEmail) {
        return jsonError(
          res,
          422,
          'email_not_available_on_account',
          locale === 'es'
            ? 'Tu cuenta no tiene un correo asociado.'
            : 'Your account has no email address on file.',
        );
      }

      const db = await storage.connect();
      const card = await loadBusinessCardForSignature(db, uid, bId);
      if (!card) {
        return jsonError(
          res,
          404,
          'card_not_found_or_forbidden',
          locale === 'es'
            ? 'No pudimos cargar esta tarjeta para enviar la firma.'
            : 'We could not load this card to send the signature.',
        );
      }

      const { cardOrigin, apiOrigin, qrBase } = resolveSignatureOriginsForEmail(env);
      const publicCardUrl = `${cardOrigin}/b/${encodeURIComponent(bId)}?uid=${encodeURIComponent(uid)}`;
      const subtitle =
        card.bcContactName ||
        emailT(locale, 'email_sig_fallback_subtitle');

      const logoUrl = resolveAbsoluteImageUrlForEmail(card.ownerPhotoUrl, {
        siteOrigin: cardOrigin,
        apiOrigin,
      });

      const signatureHtml = buildBusinessCardEmailSignatureHtml({
        webBaseUrl: qrBase,
        publicCardUrl,
        bcName: card.bcName,
        subtitle,
        logoUrl,
        themeId: card.themeId || undefined,
        emailLogoNormalize: { siteOrigin: cardOrigin, apiOrigin },
        qrImageAlt: emailT(locale, 'email_sig_qr_alt'),
      });

      const plainCompanion = buildBusinessCardEmailSignaturePlainText({
        bcName: card.bcName,
        subtitle,
        publicCardUrl,
      });

      await sendEmail({
        from: EMAIL_SENDERS.notifications,
        to: recipientEmail,
        subject: emailT(locale, 'email_sig_subject'),
        text: `${emailT(locale, 'email_sig_text_preamble')}\n\n${plainCompanion}`,
        html: wrapCorporateSignatureEmail(signatureHtml, locale, emailT),
      });

      return res.status(200).json({ ok: true });
    } catch (error) {
      console.error('[email-signature/send]', error?.message || error);
      return jsonError(
        res,
        502,
        'send_failed',
        locale === 'es'
          ? 'El servidor no pudo completar el envío. Inténtalo más tarde.'
          : 'The server could not complete the send. Please try again later.',
      );
    }
  });

  return router;
}

module.exports = { createEmailSignatureRoutes };

/**
 * POST /api/auth/send-verification-email — Bearer
 * POST /api/auth/send-password-reset — público (mensaje genérico)
 * POST /api/auth/send-email-change-link — Bearer + newEmail
 * POST /api/auth/sync-waitlist-on-verified — Bearer (email_verified)
 */

const express = require('express');
const { getFirebaseAdminAuth, verifyFirebaseIdToken, getFirestoreOptional } = require('../lib/firebaseAdminApp');
const {
  buildVerificationEmail,
  buildPasswordResetEmail,
  buildEmailChangeEmail,
} = require('../lib/authTransactionalResendTemplates');
const { sendEmail } = require('../services/email.service');
const { EMAIL_SENDERS } = require('../config/emailSenders');
const { markWaitlistLeadAppVerified, normalizeWaitlistEmail } = require('../lib/waitlistLeadFirestore');
const { buildUserFacingJson } = require('../lib/userFacingErrors');

/** @type {Map<string, number>} */
const lastSentByUid = new Map();
/** @type {Map<string, number>} */
const lastPwdResetByKey = new Map();

const MIN_INTERVAL_MS = 90 * 1000;
const PWD_RESET_MIN_MS = 90 * 1000;

function resolveContinueUrl() {
  const raw = String(process.env.EMAIL_VERIFICATION_CONTINUE_URL || '').trim().replace(/\/+$/, '');
  const base = raw || 'https://cardsocial.me';
  return base.startsWith('https://') ? base : 'https://cardsocial.me';
}

function clientIp(req) {
  const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xff || String(req.socket?.remoteAddress || '').trim() || 'unknown';
}

function pwdResetRateKey(req, emailLower) {
  return `${clientIp(req)}::${emailLower}`;
}

function createAuthVerificationEmailRouter() {
  const router = express.Router();

  router.post('/send-verification-email', async (req, res) => {
    try {
      if (!String(process.env.RESEND_API_KEY || '').trim()) {
        return res.status(503).json(buildUserFacingJson(req, 'service_unavailable', 'GATEWAY_MISCONFIGURED'));
      }

      const authHeader = String(req.headers.authorization || '').trim();
      const m = /^Bearer\s+(.+)$/i.exec(authHeader);
      if (!m) {
        return res.status(401).json(buildUserFacingJson(req, 'invalid_token', 'JWT_TOKEN_MISSING'));
      }

      let decoded;
      try {
        decoded = await verifyFirebaseIdToken(m[1]);
      } catch (e) {
        const code = String(e?.code || '');
        const errCode = code === 'auth/id-token-expired' ? 'JWT_TOKEN_INVALID' : 'JWT_TOKEN_INVALID';
        return res.status(401).json(buildUserFacingJson(req, 'invalid_token', errCode));
      }

      const uid = String(decoded.uid || '').trim();
      const email = String(decoded.email || '').trim().toLowerCase();
      if (!uid || !email) {
        return res.status(400).json(buildUserFacingJson(req, 'invalid_body', 'REQUIRED_FIELDS_MISSING'));
      }

      if (decoded.email_verified === true) {
        return res.status(200).json({ ok: true, alreadyVerified: true });
      }

      const now = Date.now();
      const prev = lastSentByUid.get(uid) || 0;
      if (now - prev < MIN_INTERVAL_MS) {
        return res.status(429).json(
          buildUserFacingJson(req, 'rate limited', 'rate_limited', {
            retryAfterSec: Math.ceil((MIN_INTERVAL_MS - (now - prev)) / 1000),
          }),
        );
      }

      const localeRaw = String(req.body?.locale || '').toLowerCase();
      const locale = localeRaw.startsWith('es') ? 'es' : 'en';

      const baseContinue = resolveContinueUrl();
      const continueUrl = baseContinue.includes('?')
        ? `${baseContinue}&from=email-verification`
        : `${baseContinue}?from=email-verification`;

      const actionCodeSettings = {
        url: continueUrl,
        handleCodeInApp: false,
      };

      const adminAuth = getFirebaseAdminAuth();
      let userRecord;
      try {
        userRecord = await adminAuth.getUser(uid);
      } catch (e) {
        return res.status(400).json(buildUserFacingJson(req, 'invalid_body', 'USER_NOT_FOUND'));
      }

      if (userRecord.emailVerified) {
        return res.status(200).json({ ok: true, alreadyVerified: true });
      }

      const linkEmail = String(userRecord.email || email).trim();
      if (!linkEmail) {
        return res.status(400).json(buildUserFacingJson(req, 'invalid_body', 'REQUIRED_FIELDS_MISSING'));
      }

      const verificationUrl = await adminAuth.generateEmailVerificationLink(linkEmail, actionCodeSettings);

      const displayName =
        String(userRecord.displayName || '').trim() ||
        String(userRecord.providerData?.[0]?.displayName || '').trim() ||
        '';

      const { subject, html, text } = buildVerificationEmail({
        verificationUrl,
        displayName,
        locale,
      });

      await sendEmail({
        to: linkEmail,
        subject,
        html,
        text,
        from: EMAIL_SENDERS.verification,
      });

      lastSentByUid.set(uid, now);

      return res.status(200).json({ ok: true, sent: true });
    } catch (error) {
      const code = String(error?.code || '');
      if (code === 'ADMIN_NOT_CONFIGURED') {
        return res.status(503).json(buildUserFacingJson(req, 'service_unavailable', 'GATEWAY_MISCONFIGURED'));
      }
      console.error('[send-verification-email]', error);
      return res.status(500).json(buildUserFacingJson(req, 'server_error', 'SERVER_INTERNAL_ERROR'));
    }
  });

  router.post('/send-password-reset', async (req, res) => {
    const generic = { ok: true };
    try {
      if (!String(process.env.RESEND_API_KEY || '').trim()) {
        return res.status(503).json(buildUserFacingJson(req, 'service_unavailable', 'GATEWAY_MISCONFIGURED'));
      }
      const emailRaw = String(req.body?.email || '').trim().toLowerCase();
      if (!emailRaw || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) {
        return res.status(200).json(generic);
      }

      const now = Date.now();
      const rk = pwdResetRateKey(req, emailRaw);
      const prev = lastPwdResetByKey.get(rk) || 0;
      if (now - prev < PWD_RESET_MIN_MS) {
        return res.status(200).json(generic);
      }
      lastPwdResetByKey.set(rk, now);

      const localeRaw = String(req.body?.locale || '').toLowerCase();
      const locale = localeRaw.startsWith('es') ? 'es' : 'en';

      const baseContinue = resolveContinueUrl();
      const continueUrl = baseContinue.includes('?')
        ? `${baseContinue}&from=reset-password`
        : `${baseContinue}?from=reset-password`;
      const actionCodeSettings = { url: continueUrl, handleCodeInApp: false };

      let adminAuth;
      try {
        adminAuth = getFirebaseAdminAuth();
      } catch (e) {
        if (String(e?.code || '') === 'ADMIN_NOT_CONFIGURED') {
          return res.status(503).json(buildUserFacingJson(req, 'service_unavailable', 'GATEWAY_MISCONFIGURED'));
        }
        throw e;
      }

      let resetUrl;
      try {
        resetUrl = await adminAuth.generatePasswordResetLink(emailRaw, actionCodeSettings);
      } catch (e) {
        const c = String(e?.code || '');
        if (c === 'auth/user-not-found') {
          return res.status(200).json(generic);
        }
        console.error('[send-password-reset] generate link', e);
        return res.status(200).json(generic);
      }

      const { subject, html, text } = buildPasswordResetEmail({ resetUrl, locale });
      try {
        await sendEmail({
          to: emailRaw,
          subject,
          html,
          text,
          from: EMAIL_SENDERS.verification,
        });
      } catch (e) {
        console.error('[send-password-reset] resend', e);
      }
      return res.status(200).json(generic);
    } catch (error) {
      console.error('[send-password-reset]', error);
      return res.status(200).json(generic);
    }
  });

  router.post('/send-email-change-link', async (req, res) => {
    try {
      if (!String(process.env.RESEND_API_KEY || '').trim()) {
        return res.status(503).json(buildUserFacingJson(req, 'service_unavailable', 'GATEWAY_MISCONFIGURED'));
      }
      const authHeader = String(req.headers.authorization || '').trim();
      const mhi = /^Bearer\s+(.+)$/i.exec(authHeader);
      if (!mhi) {
        return res.status(401).json(buildUserFacingJson(req, 'invalid_token', 'JWT_TOKEN_MISSING'));
      }

      let decoded;
      try {
        decoded = await verifyFirebaseIdToken(mhi[1]);
      } catch (e) {
        return res.status(401).json(buildUserFacingJson(req, 'invalid_token', 'JWT_TOKEN_INVALID'));
      }

      const uid = String(decoded.uid || '').trim();
      const currentEmail = String(decoded.email || '').trim().toLowerCase();
      const newEmail = String(req.body?.newEmail || '').trim().toLowerCase();
      if (!uid || !currentEmail) {
        return res.status(400).json(buildUserFacingJson(req, 'invalid_body', 'REQUIRED_FIELDS_MISSING'));
      }
      if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
        return res.status(400).json(buildUserFacingJson(req, 'auth_forbidden', 'invalid_new_email'));
      }
      if (newEmail === currentEmail) {
        return res.status(400).json(buildUserFacingJson(req, 'auth_forbidden', 'same_email'));
      }

      const localeRaw = String(req.body?.locale || '').toLowerCase();
      const locale = localeRaw.startsWith('es') ? 'es' : 'en';

      const adminAuth = getFirebaseAdminAuth();
      if (typeof adminAuth.generateVerifyAndChangeEmailLink !== 'function') {
        return res.status(501).json(buildUserFacingJson(req, 'server_error', 'SERVER_INTERNAL_ERROR'));
      }

      let userRecord;
      try {
        userRecord = await adminAuth.getUser(uid);
      } catch (e) {
        return res.status(400).json(buildUserFacingJson(req, 'invalid_body', 'USER_NOT_FOUND'));
      }
      const recordEmail = String(userRecord.email || '').trim().toLowerCase();
      if (recordEmail !== currentEmail) {
        return res.status(409).json(buildUserFacingJson(req, 'auth_forbidden', 'email_mismatch_refresh_token'));
      }

      const baseContinue = resolveContinueUrl();
      const continueUrl = baseContinue.includes('?')
        ? `${baseContinue}&from=email-change`
        : `${baseContinue}?from=email-change`;
      const actionCodeSettings = { url: continueUrl, handleCodeInApp: false };

      let confirmUrl;
      try {
        confirmUrl = await adminAuth.generateVerifyAndChangeEmailLink(
          currentEmail,
          newEmail,
          actionCodeSettings,
        );
      } catch (e) {
        const c = String(e?.code || '');
        if (c === 'auth/email-already-exists') {
          return res.status(409).json(buildUserFacingJson(req, 'auth_forbidden', 'email_already_in_use'));
        }
        console.error('[send-email-change-link]', e);
        return res.status(500).json(buildUserFacingJson(req, 'auth_forbidden', 'link_failed'));
      }

      const { subject, html, text } = buildEmailChangeEmail({ confirmUrl, newEmail, locale });
      await sendEmail({
        to: newEmail,
        subject,
        html,
        text,
        from: EMAIL_SENDERS.verification,
      });

      return res.status(200).json({ ok: true, sent: true });
    } catch (error) {
      const code = String(error?.code || '');
      if (code === 'ADMIN_NOT_CONFIGURED') {
        return res.status(503).json(buildUserFacingJson(req, 'service_unavailable', 'GATEWAY_MISCONFIGURED'));
      }
      console.error('[send-email-change-link]', error);
      return res.status(500).json(buildUserFacingJson(req, 'server_error', 'SERVER_INTERNAL_ERROR'));
    }
  });

  router.post('/sync-waitlist-on-verified', async (req, res) => {
    try {
      const authHeader = String(req.headers.authorization || '').trim();
      const mz = /^Bearer\s+(.+)$/i.exec(authHeader);
      if (!mz) {
        return res.status(401).json(buildUserFacingJson(req, 'invalid_token', 'JWT_TOKEN_MISSING'));
      }
      let decoded;
      try {
        decoded = await verifyFirebaseIdToken(mz[1]);
      } catch (e) {
        return res.status(401).json(buildUserFacingJson(req, 'invalid_token', 'JWT_TOKEN_INVALID'));
      }
      if (decoded.email_verified !== true) {
        return res.status(200).json({ ok: true, skipped: true, reason: 'email_not_verified' });
      }
      const email = normalizeWaitlistEmail(decoded.email);
      if (!email) {
        return res.status(200).json({ ok: true, skipped: true, reason: 'no_email' });
      }
      const fs = getFirestoreOptional();
      if (!fs) {
        return res.status(200).json({ ok: true, skipped: true, reason: 'firestore_admin_unavailable' });
      }
      const { updated } = await markWaitlistLeadAppVerified(fs, email);
      return res.status(200).json({ ok: true, waitlistUpdated: updated });
    } catch (error) {
      const code = String(error?.code || '');
      if (code === 'ADMIN_NOT_CONFIGURED') {
        return res.status(503).json(buildUserFacingJson(req, 'service_unavailable', 'GATEWAY_MISCONFIGURED'));
      }
      console.error('[sync-waitlist-on-verified]', error);
      return res.status(500).json(buildUserFacingJson(req, 'server_error', 'SERVER_INTERNAL_ERROR'));
    }
  });

  return router;
}

module.exports = { createAuthVerificationEmailRouter };

/**
 * POST /api/admin/broadcast/preview
 * POST /api/admin/broadcast/send
 *
 * Auth: gateway + JWT scope admin.broadcast
 */

const express = require('express');
const { sendEmail } = require('../services/email.service');
const { sendPushToUser } = require('../lib/pushNotifications');
const { getFirestoreOptional } = require('../lib/firebaseAdminApp');
const { resolveBroadcastRecipients, SEGMENTS } = require('../lib/broadcastSegments');

const LANG_KEYS = ['es', 'en', 'it', 'fr', 'pt'];

function histogramFromRecipients(recipients) {
  /** @type {Record<string, number>} */
  const h = {};
  for (const r of recipients) {
    const k = r.languageNorm || 'en';
    h[k] = (h[k] || 0) + 1;
  }
  return h;
}

function bodyToHtml(text) {
  const safe = String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:16px;line-height:1.55;color:#222;">${safe.replace(/\r?\n/g, '<br/>')}</div>`;
}

function pickMessage(messages, langNorm) {
  const m = messages && typeof messages === 'object' ? messages : {};
  const block = m[langNorm] || m.en || m.es || {};
  const subject = String(block.subject || block.title || '').trim();
  const title = String(block.title || block.subject || '').trim();
  const body = String(block.body || '').trim();
  return { subject, title, body };
}

function createBroadcastRouter({ getMongoDb }) {
  const router = express.Router();

  router.post('/preview', async (req, res) => {
    try {
      const segment = String(req.body?.segment || '').trim();
      const days = Number(req.body?.days);
      if (!SEGMENTS.includes(segment)) {
        return res.status(400).json({
          ok: false,
          error: `Invalid segment. Use one of: ${SEGMENTS.join(', ')}`,
        });
      }
      const db = getMongoDb();
      const fs = getFirestoreOptional();
      const recipients = await resolveBroadcastRecipients(db, fs, segment, { days });
      const withEmail = recipients.filter((r) => r.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email));
      const sample = recipients.slice(0, 24).map((r) => ({
        uid: r.uid,
        email: r.email || null,
        language: r.languageNorm,
      }));
      return res.status(200).json({
        ok: true,
        segment,
        count: recipients.length,
        withEmail: withEmail.length,
        firestoreEnabled: Boolean(fs),
        languageHistogram: histogramFromRecipients(recipients),
        sample,
      });
    } catch (e) {
      if (e.code === 'BAD_SEGMENT') {
        return res.status(400).json({ ok: false, error: e.message });
      }
      console.error('[broadcast/preview]', e);
      return res.status(500).json({ ok: false, error: e.message || 'preview failed' });
    }
  });

  router.post('/send', async (req, res) => {
    try {
      const segment = String(req.body?.segment || '').trim();
      const channel = String(req.body?.channel || 'email').trim();
      const messages = req.body?.messages;
      const confirmCount = Number(req.body?.confirmRecipientCount);
      const ack = String(req.body?.confirmAck || '').trim();

      if (!SEGMENTS.includes(segment)) {
        return res.status(400).json({
          ok: false,
          error: `Invalid segment. Use one of: ${SEGMENTS.join(', ')}`,
        });
      }
      if (!['email', 'push', 'both'].includes(channel)) {
        return res.status(400).json({ ok: false, error: 'channel must be email, push, or both' });
      }
      if (ack !== 'BROADCAST_CONFIRM') {
        return res.status(400).json({
          ok: false,
          error: 'confirmAck must be exactly BROADCAST_CONFIRM',
        });
      }
      if (!messages || typeof messages !== 'object') {
        return res.status(400).json({ ok: false, error: 'messages object required per language' });
      }

      if (['email', 'both'].includes(channel) && !process.env.AZURE_EMAIL_CONNECTION_STRING) {
        return res.status(503).json({
          ok: false,
          error: 'Email channel requires AZURE_EMAIL_CONNECTION_STRING',
        });
      }

      const baseEn = pickMessage(messages, 'en');
      if (!String(baseEn.body || '').trim()) {
        return res.status(400).json({ ok: false, error: 'messages.en.body is required (fallback copy)' });
      }
      if (
        ['email', 'both'].includes(channel) &&
        !String(baseEn.subject || baseEn.title || '').trim()
      ) {
        return res.status(400).json({
          ok: false,
          error: 'messages.en.subject (or title) required for email channel',
        });
      }

      const db = getMongoDb();
      const fs = getFirestoreOptional();
      const recipients = await resolveBroadcastRecipients(db, fs, segment, {
        days: Number(req.body?.days),
      });

      if (!Number.isFinite(confirmCount) || confirmCount !== recipients.length) {
        return res.status(400).json({
          ok: false,
          error: `confirmRecipientCount must match current audience (${recipients.length}). Run preview again.`,
        });
      }

      let sentEmail = 0;
      let failedEmail = 0;
      let sentPush = 0;
      let skippedNoEmail = 0;

      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

      for (const r of recipients) {
        const lang = r.languageNorm || 'en';
        const { subject, title, body } = pickMessage(messages, lang);
        const emailSubject = String(subject || title || '').trim() || 'Card-Social';
        const pushTitle = String(title || subject || '').trim() || 'Card-Social';
        const bodyText = String(body || '').trim();

        if (channel === 'email' || channel === 'both') {
          if (!r.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email)) {
            skippedNoEmail += 1;
          } else {
            try {
              await sendEmail({
                to: r.email,
                subject: emailSubject,
                html: bodyToHtml(bodyText),
                text: bodyText,
              });
              sentEmail += 1;
              await sleep(75);
            } catch (err) {
              failedEmail += 1;
              console.warn('[broadcast/send] email fail', r.uid, err?.message);
            }
          }
        }

        if (channel === 'push' || channel === 'both') {
          try {
            await sendPushToUser(db, r.uid, {
              title: pushTitle,
              body: bodyText || pushTitle,
              data: { segment, lang },
            });
            sentPush += 1;
          } catch (err) {
            console.warn('[broadcast/send] push fail', r.uid, err?.message);
          }
        }
      }

      return res.status(200).json({
        ok: true,
        segment,
        channel,
        audience: recipients.length,
        sentEmail,
        failedEmail,
        sentPush,
        skippedNoEmail,
      });
    } catch (e) {
      console.error('[broadcast/send]', e);
      return res.status(500).json({ ok: false, error: e.message || 'send failed' });
    }
  });

  return router;
}

module.exports = { createBroadcastRouter, SEGMENTS, LANG_KEYS };

/**
 * Authenticated NFC hardware routes.
 *
 * Mount:
 *   app.use('/api/nfc', gatewayKeyMiddleware, jwtAuthMiddleware,
 *           qrScopeMiddleware, createNfcRoutes({ storage }));
 */

const express = require('express');
const { buildUserFacingJson } = require('../lib/userFacingErrors');
const {
  buildFallbackTarget,
  buildMountedTarget,
  normalizeActivationPin,
  normalizeMaterial,
  normalizeNfcCardId,
  normalizeStatus,
  sanitizeRecoveryContact,
  toWireNfcCard,
} = require('../lib/nfcCards');

function trimOrEmpty(value) {
  return String(value ?? '').trim();
}

function eventRow(nfcCardId, type, actorUid, extra = {}) {
  return {
    nfcCardId,
    type,
    actorUid: actorUid || null,
    createdAt: new Date(),
    ...extra,
  };
}

function createNfcRoutes({ storage }) {
  const router = express.Router();

  router.get('/cards', async (req, res) => {
    try {
      const uid = trimOrEmpty(req.auth?.sub);
      if (!uid) return res.status(401).json(buildUserFacingJson(req, 'auth_forbidden', 'AUTH_REQUIRED'));
      const db = await storage.connect();
      const cards = await db.collection('nfc_cards')
        .find({ ownerUid: uid })
        .sort({ updatedAt: -1 })
        .toArray();
      return res.json({ ok: true, cards: cards.map(toWireNfcCard) });
    } catch (error) {
      console.error('[nfc/cards]', error);
      return res.status(500).json(buildUserFacingJson(req, 'auth_forbidden', 'SERVER_INTERNAL_ERROR'));
    }
  });

  router.get('/mount-options', async (req, res) => {
    try {
      const uid = trimOrEmpty(req.auth?.sub);
      if (!uid) return res.status(401).json(buildUserFacingJson(req, 'auth_forbidden', 'AUTH_REQUIRED'));
      const db = await storage.connect();
      const business = await db.collection('business_cards')
        .find({ ownerUid: uid }, { projection: { bId: 1, bcName: 1, bcContactName: 1, updatedAt: 1 } })
        .sort({ updatedAt: -1 })
        .limit(24)
        .toArray();
      const smart = await db.collection('smart_cards')
        .find(
          { $or: [{ ownerUid: uid }, { uid }] },
          { projection: { sid: 1, scName: 1, userFullName: 1, ownerDisplayName: 1, updatedAt: 1 } },
        )
        .sort({ updatedAt: -1 })
        .limit(24)
        .toArray();
      const options = [
        ...business.map((row) => ({
          type: 'businessCard',
          id: String(row.bId || ''),
          displayName: String(row.bcName || 'Business Card'),
          subtitle: String(row.bcContactName || 'Permanente'),
          isTemporary: false,
          expiresInLabel: null,
        })),
        ...smart.map((row) => ({
          type: 'smartCard',
          id: String(row.sid || ''),
          displayName: String(row.scName || row.userFullName || row.ownerDisplayName || 'SmartCard'),
          subtitle: 'Temporal 24 h',
          isTemporary: true,
          expiresInLabel: '24 h',
        })),
      ].filter((row) => row.id);
      return res.json({ ok: true, options });
    } catch (error) {
      console.error('[nfc/mount-options]', error);
      return res.status(500).json(buildUserFacingJson(req, 'auth_forbidden', 'SERVER_INTERNAL_ERROR'));
    }
  });

  router.post('/cards/link', async (req, res) => {
    try {
      const uid = trimOrEmpty(req.auth?.sub);
      if (!uid) return res.status(401).json(buildUserFacingJson(req, 'auth_forbidden', 'AUTH_REQUIRED'));
      const nfcCardId = normalizeNfcCardId(req.body?.nfcCardId);
      if (!nfcCardId) return res.status(400).json(buildUserFacingJson(req, 'auth_forbidden', 'NFC_INVALID_CARD_ID'));
      const activationPin = normalizeActivationPin(req.body?.activationPin);
      if (!activationPin) return res.status(400).json(buildUserFacingJson(req, 'auth_forbidden', 'NFC_INVALID_ACTIVATION_PIN'));
      const label = trimOrEmpty(req.body?.label).slice(0, 120) || 'Tarjeta NFC';
      const material = normalizeMaterial(req.body?.material);
      const db = await storage.connect();
      const now = new Date();
      const existing = await db.collection('nfc_cards').findOne({ nfcCardId });
      if (!existing) {
        return res.status(404).json(buildUserFacingJson(req, 'auth_forbidden', 'NFC_CARD_NOT_PROVISIONED'));
      }
      if (existing.isClaimed === true || existing.ownerUid) {
        return res.status(409).json(buildUserFacingJson(req, 'auth_forbidden', 'NFC_CARD_ALREADY_CLAIMED'));
      }
      const expectedPin = normalizeActivationPin(existing.activationPin);
      if (!expectedPin || expectedPin !== activationPin) {
        return res.status(403).json(buildUserFacingJson(req, 'nfc_activation_pin_invalid', 'NFC_ACTIVATION_PIN_INVALID'));
      }
      const base = {
        ownerUid: uid,
        label,
        material,
        status: 'active',
        isClaimed: true,
        activatedAt: now,
        updatedAt: now,
        lastConfirmedAt: now,
      };
      const claimResult = await db.collection('nfc_cards').updateOne(
        { nfcCardId, isClaimed: { $ne: true }, activationPin: existing.activationPin },
        { $set: base, $unset: { activationPin: '' }, $inc: { version: 1 } },
      );
      if (!claimResult.matchedCount) {
        return res.status(409).json(buildUserFacingJson(req, 'auth_forbidden', 'NFC_CARD_ALREADY_CLAIMED_REFRESH'));
      }
      await db.collection('nfc_card_events').insertOne(eventRow(nfcCardId, 'linked', uid));
      const doc = await db.collection('nfc_cards').findOne({ nfcCardId, ownerUid: uid });
      return res.status(201).json({ ok: true, card: toWireNfcCard(doc) });
    } catch (error) {
      console.error('[nfc/link]', error);
      return res.status(500).json(buildUserFacingJson(req, 'auth_forbidden', 'SERVER_INTERNAL_ERROR'));
    }
  });

  router.post('/cards/:nfcCardId/mount', async (req, res) => {
    try {
      const uid = trimOrEmpty(req.auth?.sub);
      if (!uid) return res.status(401).json(buildUserFacingJson(req, 'auth_forbidden', 'AUTH_REQUIRED'));
      const nfcCardId = normalizeNfcCardId(req.params.nfcCardId);
      if (!nfcCardId) return res.status(400).json(buildUserFacingJson(req, 'auth_forbidden', 'NFC_INVALID_CARD_ID'));
      const db = await storage.connect();
      const current = await db.collection('nfc_cards').findOne({ nfcCardId, ownerUid: uid });
      if (!current) return res.status(404).json(buildUserFacingJson(req, 'auth_forbidden', 'NFC_CARD_NOT_FOUND'));
      const mountedTarget = await buildMountedTarget(db, uid, req.body);
      if (!mountedTarget) return res.status(400).json(buildUserFacingJson(req, 'auth_forbidden', 'NFC_INVALID_MOUNT_TARGET'));
      const fallbackTarget = await buildFallbackTarget(db, uid, req.body);
      if (mountedTarget.isTemporary && !fallbackTarget) {
        return res.status(400).json(buildUserFacingJson(req, 'auth_forbidden', 'NFC_FALLBACK_REQUIRED'));
      }
      const now = new Date();
      await db.collection('nfc_cards').updateOne(
        { nfcCardId, ownerUid: uid },
        {
          $set: {
            status: 'active',
            mountedTarget,
            fallbackTarget: fallbackTarget || {
              type: mountedTarget.type,
              id: mountedTarget.id,
              displayName: mountedTarget.displayName,
              publicUrl: mountedTarget.publicUrl,
            },
            lastMountedAt: now,
            lastConfirmedAt: now,
            updatedAt: now,
          },
          $inc: { version: 1 },
        },
      );
      await db.collection('nfc_card_events').insertOne(eventRow(nfcCardId, 'mounted', uid, {
        previousStatus: current.status || null,
        nextStatus: 'active',
        previousTarget: current.mountedTarget || null,
        nextTarget: mountedTarget,
      }));
      const doc = await db.collection('nfc_cards').findOne({ nfcCardId, ownerUid: uid });
      return res.json({ ok: true, card: toWireNfcCard(doc) });
    } catch (error) {
      console.error('[nfc/mount]', error);
      return res.status(500).json(buildUserFacingJson(req, 'auth_forbidden', 'SERVER_INTERNAL_ERROR'));
    }
  });

  router.patch('/cards/:nfcCardId/status', async (req, res) => {
    try {
      const uid = trimOrEmpty(req.auth?.sub);
      if (!uid) return res.status(401).json(buildUserFacingJson(req, 'auth_forbidden', 'AUTH_REQUIRED'));
      const nfcCardId = normalizeNfcCardId(req.params.nfcCardId);
      if (!nfcCardId) return res.status(400).json(buildUserFacingJson(req, 'auth_forbidden', 'NFC_INVALID_CARD_ID'));
      const nextStatus = normalizeStatus(req.body?.status, '');
      if (!['active', 'paused', 'lost'].includes(nextStatus)) {
        return res.status(400).json(buildUserFacingJson(req, 'auth_forbidden', 'NFC_INVALID_STATUS_TRANSITION'));
      }
      const db = await storage.connect();
      const current = await db.collection('nfc_cards').findOne({ nfcCardId, ownerUid: uid });
      if (!current) return res.status(404).json(buildUserFacingJson(req, 'auth_forbidden', 'NFC_CARD_NOT_FOUND'));
      const recoveryContact = nextStatus === 'lost'
        ? sanitizeRecoveryContact(req.body?.recoveryContact) || current.recoveryContact || null
        : current.recoveryContact || null;
      const now = new Date();
      await db.collection('nfc_cards').updateOne(
        { nfcCardId, ownerUid: uid },
        {
          $set: {
            status: nextStatus,
            recoveryContact,
            lastConfirmedAt: now,
            updatedAt: now,
          },
          $inc: { version: 1 },
        },
      );
      const type = nextStatus === 'lost' ? 'lost_enabled' : nextStatus;
      await db.collection('nfc_card_events').insertOne(eventRow(nfcCardId, type, uid, {
        previousStatus: current.status || null,
        nextStatus,
      }));
      const doc = await db.collection('nfc_cards').findOne({ nfcCardId, ownerUid: uid });
      return res.json({ ok: true, card: toWireNfcCard(doc) });
    } catch (error) {
      console.error('[nfc/status]', error);
      return res.status(500).json(buildUserFacingJson(req, 'auth_forbidden', 'SERVER_INTERNAL_ERROR'));
    }
  });

  return router;
}

module.exports = { createNfcRoutes };

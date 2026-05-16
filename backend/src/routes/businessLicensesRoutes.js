/**
 * REST routes for Business Card Licenses (Mongo `business_card_licenses`).
 *
 * Reemplaza la persistencia Firestore `users/{uid}/business_card_licenses/{bId}`
 * por Mongo. La colección es única (no per-user), indexada por `(uid, bId)`.
 *
 * Mount:
 *   app.use('/api/business-card-licenses', gatewayKeyMiddleware,
 *           jwtAuthMiddleware, qrScopeMiddleware,
 *           createBusinessLicensesRoutes({ storage }));
 *
 * Endpoints:
 *   POST   /upsert                 → activar o renovar 1 año (owner only)
 *   GET    /:bId/active            → { active: bool } para el bId del caller
 *   GET    /                       → listar licencias propias (dull-mode)
 */

const express = require('express');
const { sendUserFacingError, buildUserFacingJson } = require('../lib/userFacingErrors');

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

function trimOrEmpty(v) {
  return String(v ?? '').trim();
}

function toIso(value) {
  if (!value) return null;
  try {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  } catch {
    return null;
  }
}

function serialize(doc) {
  if (!doc) return null;
  return {
    uid: doc.uid,
    bId: doc.bId,
    annualPriceUsd: Number(doc.annualPriceUsd || 0),
    startedAt: toIso(doc.startedAt),
    expiresAt: toIso(doc.expiresAt),
    isActive: Boolean(doc.isActive),
    purchaseId: doc.purchaseId ?? null,
    platform: doc.platform ?? null,
    cashbackCreditsGranted: Number(doc.cashbackCreditsGranted || 0),
    updatedAt: toIso(doc.updatedAt),
  };
}

function createBusinessLicensesRoutes({ storage }) {
  const router = express.Router();

  router.post('/upsert', async (req, res) => {
    try {
      const authUid = trimOrEmpty(req.auth?.sub);
      const uid = trimOrEmpty(req.body?.uid) || authUid;
      const bId = trimOrEmpty(req.body?.bId);
      if (!uid || !bId) {
        return res.status(400).json(buildUserFacingJson(req, 'invalid_body', 'REQUIRED_FIELDS_MISSING'));
      }
      if (authUid && authUid !== uid) {
        return sendUserFacingError(res, req, 403, 'auth_forbidden', 'UID_MISMATCH');
      }

      const now = new Date();
      const db = await storage.connect();
      const col = db.collection('business_card_licenses');

      /**
       * Renovación acumulativa: si la licencia actual aún no expira, el año
       * nuevo se añade a partir de `expiresAt`; si ya expiró (o no existe),
       * el año empieza ahora. Evita que renovar temprano "regale" días.
       */
      const existing = await col.findOne({ uid, bId });
      const base = existing && existing.expiresAt && new Date(existing.expiresAt).getTime() > now.getTime()
        ? new Date(existing.expiresAt).getTime()
        : now.getTime();
      const nextExpires = new Date(base + ONE_YEAR_MS);

      const license = {
        uid,
        bId,
        annualPriceUsd: Number(req.body?.annualPriceUsd || 0),
        startedAt: existing?.startedAt ? new Date(existing.startedAt) : now,
        expiresAt: nextExpires,
        isActive: true,
        purchaseId: trimOrEmpty(req.body?.purchaseId) || null,
        platform: (req.body?.platform === 'ios' || req.body?.platform === 'android')
          ? req.body.platform
          : null,
        cashbackCreditsGranted: Number(req.body?.cashbackCreditsGranted || 0),
        updatedAt: now,
      };

      await col.updateOne(
        { uid, bId },
        { $set: license, $setOnInsert: { createdAt: now } },
        { upsert: true },
      );

      return res.status(200).json({ ok: true, license: serialize(license) });
    } catch (error) {
      console.error('[business-card-licenses] upsert error:', error?.message || error);
      return res.status(500).json(buildUserFacingJson(req, 'server_error', 'SERVER_INTERNAL_ERROR'));
    }
  });

  router.get('/:bId/active', async (req, res) => {
    try {
      const authUid = trimOrEmpty(req.auth?.sub);
      const uid = trimOrEmpty(req.query?.uid) || authUid;
      const bId = trimOrEmpty(req.params?.bId);
      if (!uid || !bId) {
        return res.status(400).json(buildUserFacingJson(req, 'invalid_body', 'REQUIRED_FIELDS_MISSING'));
      }

      const db = await storage.connect();
      const doc = await db.collection('business_card_licenses').findOne({ uid, bId });
      const now = Date.now();
      const expiresTs = doc?.expiresAt ? new Date(doc.expiresAt).getTime() : 0;
      const active = Boolean(doc?.isActive) && Number.isFinite(expiresTs) && expiresTs > now;

      return res.status(200).json({ ok: true, active, license: serialize(doc) });
    } catch (error) {
      console.error('[business-card-licenses] active check error:', error?.message || error);
      return res.status(500).json(buildUserFacingJson(req, 'server_error', 'SERVER_INTERNAL_ERROR'));
    }
  });

  router.get('/', async (req, res) => {
    try {
      const authUid = trimOrEmpty(req.auth?.sub);
      const uid = trimOrEmpty(req.query?.uid) || authUid;
      if (!uid) {
        return res.status(400).json(buildUserFacingJson(req, 'invalid_body', 'REQUIRED_FIELDS_MISSING'));
      }
      if (authUid && authUid !== uid) {
        return sendUserFacingError(res, req, 403, 'auth_forbidden', 'UID_MISMATCH');
      }

      const db = await storage.connect();
      const rows = await db
        .collection('business_card_licenses')
        .find({ uid })
        .sort({ updatedAt: -1 })
        .toArray();

      return res.status(200).json({ ok: true, licenses: rows.map(serialize) });
    } catch (error) {
      console.error('[business-card-licenses] list error:', error?.message || error);
      return res.status(500).json(buildUserFacingJson(req, 'server_error', 'SERVER_INTERNAL_ERROR'));
    }
  });

  return router;
}

module.exports = {
  createBusinessLicensesRoutes,
};

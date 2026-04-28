/**
 * REST routes for SmartCards (Mongo `smart_cards`).
 *
 * Canonical contract: see `services/types/cards.ts` (SmartCardDoc).
 *
 * A SmartCard is a PROJECTION of the owner's user profile. On create, we
 * read `users/{uid}` from Mongo and copy:
 *   users.fullName / userFullName  → smart_cards.userFullName
 *   users.userAvatarUrl / avatarUrl → smart_cards.userAvatarUrl
 *   users.userNickName / nickname  → smart_cards.userNickname
 *   users.userOccupation           → smart_cards.userOccupation
 *
 * When the user edits their profile, call POST /propagate-identity to
 * re-sync ALL owned smart cards in one operation. No drift, no merges.
 *
 * Mount:
 *   app.use('/api/smart-cards', gatewayKeyMiddleware, jwtAuthMiddleware,
 *           qrScopeMiddleware, createSmartCardsRoutes({ storage }));
 *
 * Endpoints:
 *   GET    /                    → list own smart cards (newest first)
 *   GET    /:sid                → read one (owner only in v1)
 *   POST   /                    → create (auto-projects user identity)
 *   PATCH  /:sid                → partial update (identity fields are read-only here)
 *   DELETE /:sid                → hard delete + cascade
 *   POST   /propagate-identity  → re-sync user identity across all own cards
 */

const crypto = require('crypto');
const express = require('express');

const MAX_VAULT_ITEMS = 12;

function newSmartCardId() {
  const bytes = crypto.randomBytes(16);
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
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

function trimOrEmpty(v) {
  return String(v ?? '').trim();
}

function trimOrNull(v) {
  const t = trimOrEmpty(v);
  return t ? t : null;
}

function toFiniteNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function toBoolean(v, fallback = false) {
  if (typeof v === 'boolean') return v;
  if (v === 'true' || v === 1 || v === '1') return true;
  if (v === 'false' || v === 0 || v === '0') return false;
  return fallback;
}

function normalizeLayout(v) {
  return trimOrEmpty(v) === 'horizontal' ? 'horizontal' : 'vertical';
}

function sanitizePublicCardSlots(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const row of raw.slice(0, MAX_VAULT_ITEMS)) {
    const itemId = trimOrEmpty(row?.itemId);
    if (!itemId) continue;
    const slot = {
      itemId,
      type: trimOrEmpty(row?.type) || 'link',
      label: trimOrEmpty(row?.label),
      value: trimOrEmpty(row?.value),
    };
    const iconName = trimOrEmpty(row?.iconName);
    if (iconName) slot.iconName = iconName;
    const icon = trimOrEmpty(row?.icon);
    if (/^https?:\/\//i.test(icon)) slot.icon = icon;
    out.push(slot);
  }
  return out;
}

function sanitizeVaultItemIds(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const id of raw) {
    const s = trimOrEmpty(id);
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
    if (out.length >= MAX_VAULT_ITEMS) break;
  }
  return out;
}

/** API REST (`vaultItemIds`) + legado qrRoutes (`itemIds`). */
function mergeVaultItemIdsForWire(doc) {
  const a = Array.isArray(doc?.vaultItemIds) ? doc.vaultItemIds : [];
  const b = Array.isArray(doc?.itemIds) ? doc.itemIds : [];
  return sanitizeVaultItemIds([...a, ...b]);
}

/**
 * Pull user identity from Mongo `users`. Tolerates both legacy and modern
 * field names (userFullName / fullName, userAvatarUrl / avatarUrl, etc.).
 * Never throws — returns empty-string defaults if the user doc is missing.
 */
async function projectUserIdentity(db, uid) {
  const user = await db.collection('users').findOne(
    { uid },
    {
      projection: {
        userFullName: 1,
        fullName: 1,
        userAvatarUrl: 1,
        avatarUrl: 1,
        userNickName: 1,
        nickname: 1,
        userOccupation: 1,
      },
    },
  );
  return {
    userFullName: trimOrEmpty(user?.userFullName ?? user?.fullName),
    userAvatarUrl: trimOrNull(user?.userAvatarUrl ?? user?.avatarUrl),
    userNickname: trimOrNull(user?.userNickName ?? user?.nickname),
    userOccupation: trimOrNull(user?.userOccupation),
  };
}

function toWireSmartCard(doc) {
  if (!doc) return null;
  return {
    sid: String(doc.sid || ''),
    ownerUid: String(doc.ownerUid || doc.uid || ''),
    createdAt: toIso(doc.createdAt) || new Date(0).toISOString(),
    updatedAt: toIso(doc.updatedAt) || new Date(0).toISOString(),

    userFullName: String(doc.userFullName || ''),
    userAvatarUrl: doc.userAvatarUrl ? String(doc.userAvatarUrl) : null,
    userNickname: doc.userNickname ? String(doc.userNickname) : null,
    userOccupation: doc.userOccupation ? String(doc.userOccupation) : null,

    vaultItemIds: mergeVaultItemIdsForWire(doc),
    publicCardSlots: Array.isArray(doc.publicCardSlots) ? doc.publicCardSlots : [],

    themeId: doc.themeId ? String(doc.themeId) : null,
    fontId: doc.fontId ? String(doc.fontId) : null,
    wallpaperId: doc.wallpaperId ? String(doc.wallpaperId) : null,
    iconPackId: doc.iconPackId ? String(doc.iconPackId) : null,
    enableParallax: Boolean(doc.enableParallax),
    isFavorite: Boolean(doc.isFavorite),
    layout: normalizeLayout(doc.layout),

    holdersCount: toFiniteNumber(doc.holdersCount, 0),
    averageRating: toFiniteNumber(doc.averageRating, 5),
    totalRatings: toFiniteNumber(doc.totalRatings, 0),
  };
}

async function cascadeSmartCardDelete(db, sid) {
  await Promise.all([
    db.collection('share_permissions').deleteMany({ sid }),
    db.collection('ghost_link_invites').deleteMany({ 'card.sid': sid }),
    db.collection('call_logs').deleteMany({ 'card.sid': sid }),
    db.collection('card_subscriber_mutes').deleteMany({ sid }),
    db.collection('story_card_states').deleteMany({ sid }),
    db.collection('temporary_access').deleteMany({ sid }),
  ]);
}

function createSmartCardsRoutes({ storage }) {
  const router = express.Router();

  // ───────────────────────── GET / — list mine ──────────────────────────────
  router.get('/', async (req, res) => {
    try {
      const uid = String(req.auth?.sub || '').trim();
      if (!uid) return res.status(401).json({ ok: false, error: 'Unauthenticated' });

      const db = req.app.locals.db || (await storage.connect());
      const docs = await db
        .collection('smart_cards')
        .find({ $or: [{ ownerUid: uid }, { uid }] })
        .sort({ createdAt: -1 })
        .toArray();
      return res.status(200).json({ ok: true, cards: docs.map(toWireSmartCard) });
    } catch (error) {
      console.error('[smartCards] GET / failed:', error);
      return res.status(500).json({ ok: false, error: error.message || 'list failed' });
    }
  });

  // ───────────────────────── GET /:sid ──────────────────────────────────────
  router.get('/:sid', async (req, res) => {
    try {
      const uid = String(req.auth?.sub || '').trim();
      if (!uid) return res.status(401).json({ ok: false, error: 'Unauthenticated' });
      const sid = trimOrEmpty(req.params.sid);
      if (!sid) return res.status(400).json({ ok: false, error: 'sid is required' });

      const db = req.app.locals.db || (await storage.connect());
      const doc = await db.collection('smart_cards').findOne({ sid });
      if (!doc) return res.status(404).json({ ok: false, error: 'Card not found' });
      const owner = String(doc.ownerUid || doc.uid || '').trim();
      if (owner !== uid) {
        return res.status(403).json({ ok: false, error: 'Not authorized to read this card' });
      }
      return res.status(200).json({ ok: true, card: toWireSmartCard(doc) });
    } catch (error) {
      console.error('[smartCards] GET /:sid failed:', error);
      return res.status(500).json({ ok: false, error: error.message || 'read failed' });
    }
  });

  // ───────────────────────── POST / — create ────────────────────────────────
  router.post('/', async (req, res) => {
    try {
      const uid = String(req.auth?.sub || '').trim();
      if (!uid) return res.status(401).json({ ok: false, error: 'Unauthenticated' });

      const body = req.body || {};
      const now = new Date();
      const sid = newSmartCardId();

      const db = req.app.locals.db || (await storage.connect());
      const identity = await projectUserIdentity(db, uid);

      // Block creation until the user has a minimally populated profile.
      if (!identity.userFullName) {
        return res.status(409).json({
          ok: false,
          error: 'User profile is incomplete (missing fullName). Set it before creating a smart card.',
        });
      }

      const doc = {
        sid,
        ownerUid: uid,
        uid,
        createdAt: now,
        updatedAt: now,

        ...identity,

        vaultItemIds: sanitizeVaultItemIds(body.vaultItemIds),
        publicCardSlots: sanitizePublicCardSlots(body.publicCardSlots),

        themeId: trimOrNull(body.themeId) || 'deep_teal',
        fontId: trimOrNull(body.fontId),
        wallpaperId: trimOrNull(body.wallpaperId),
        iconPackId: trimOrNull(body.iconPackId),
        enableParallax: toBoolean(body.enableParallax, false),
        isFavorite: false,
        layout: normalizeLayout(body.layout),

        holdersCount: 0,
        averageRating: 5,
        totalRatings: 0,
      };

      await db.collection('smart_cards').insertOne(doc);
      return res.status(201).json({ ok: true, card: toWireSmartCard(doc) });
    } catch (error) {
      console.error('[smartCards] POST / failed:', error);
      return res.status(500).json({ ok: false, error: error.message || 'create failed' });
    }
  });

  // ───────────────────────── PATCH /:sid ────────────────────────────────────
  // Identity fields (userFullName/userAvatarUrl/userNickname/userOccupation)
  // are READ-ONLY here. They only change via POST /propagate-identity.
  router.patch('/:sid', async (req, res) => {
    try {
      const uid = String(req.auth?.sub || '').trim();
      if (!uid) return res.status(401).json({ ok: false, error: 'Unauthenticated' });
      const sid = trimOrEmpty(req.params.sid);
      if (!sid) return res.status(400).json({ ok: false, error: 'sid is required' });

      const body = req.body || {};
      const set = {};

      if (body.vaultItemIds !== undefined) set.vaultItemIds = sanitizeVaultItemIds(body.vaultItemIds);
      if (body.publicCardSlots !== undefined) set.publicCardSlots = sanitizePublicCardSlots(body.publicCardSlots);

      if (body.themeId !== undefined) set.themeId = trimOrNull(body.themeId);
      if (body.fontId !== undefined) set.fontId = trimOrNull(body.fontId);
      if (body.wallpaperId !== undefined) set.wallpaperId = trimOrNull(body.wallpaperId);
      if (body.iconPackId !== undefined) set.iconPackId = trimOrNull(body.iconPackId);
      if (body.enableParallax !== undefined) set.enableParallax = toBoolean(body.enableParallax);
      if (body.isFavorite !== undefined) set.isFavorite = toBoolean(body.isFavorite);
      if (body.layout !== undefined) set.layout = normalizeLayout(body.layout);

      if (Object.keys(set).length === 0) {
        return res.status(400).json({ ok: false, error: 'No updatable fields provided' });
      }
      set.updatedAt = new Date();
      set.ownerUid = uid;
      set.uid = uid;

      const db = req.app.locals.db || (await storage.connect());
      const result = await db.collection('smart_cards').findOneAndUpdate(
        { sid, $or: [{ ownerUid: uid }, { uid }] },
        { $set: set },
        { returnDocument: 'after' },
      );
      const doc = result && (result.value || result);
      if (!doc || !doc.sid) {
        return res.status(404).json({ ok: false, error: 'Card not found or not authorized' });
      }
      return res.status(200).json({ ok: true, card: toWireSmartCard(doc) });
    } catch (error) {
      console.error('[smartCards] PATCH /:sid failed:', error);
      return res.status(500).json({ ok: false, error: error.message || 'update failed' });
    }
  });

  // ───────────────────────── DELETE /:sid ───────────────────────────────────
  router.delete('/:sid', async (req, res) => {
    try {
      const uid = String(req.auth?.sub || '').trim();
      if (!uid) return res.status(401).json({ ok: false, error: 'Unauthenticated' });
      const sid = trimOrEmpty(req.params.sid);
      if (!sid) return res.status(400).json({ ok: false, error: 'sid is required' });

      const db = req.app.locals.db || (await storage.connect());
      const result = await db.collection('smart_cards').deleteOne({
        sid,
        $or: [{ ownerUid: uid }, { uid }],
      });
      if (result.deletedCount !== 1) {
        return res.status(404).json({ ok: false, error: 'Card not found or not authorized' });
      }
      await cascadeSmartCardDelete(db, sid);
      return res.status(200).json({ ok: true, deleted: true });
    } catch (error) {
      console.error('[smartCards] DELETE /:sid failed:', error);
      return res.status(500).json({ ok: false, error: error.message || 'delete failed' });
    }
  });

  // ───────────────────── POST /propagate-identity ───────────────────────────
  // Re-sync userFullName/userAvatarUrl/userNickname/userOccupation across all
  // smart cards owned by the caller. One call after the user edits their
  // profile keeps every card fresh.
  router.post('/propagate-identity', async (req, res) => {
    try {
      const uid = String(req.auth?.sub || '').trim();
      if (!uid) return res.status(401).json({ ok: false, error: 'Unauthenticated' });

      const db = req.app.locals.db || (await storage.connect());
      const identity = await projectUserIdentity(db, uid);
      if (!identity.userFullName) {
        return res.status(409).json({
          ok: false,
          error: 'User profile is incomplete (missing fullName).',
        });
      }

      const now = new Date();
      const result = await db.collection('smart_cards').updateMany(
        { $or: [{ ownerUid: uid }, { uid }] },
        { $set: { ...identity, updatedAt: now, ownerUid: uid, uid } },
      );
      return res.status(200).json({
        ok: true,
        updated: result.modifiedCount || 0,
        identity,
      });
    } catch (error) {
      console.error('[smartCards] POST /propagate-identity failed:', error);
      return res.status(500).json({ ok: false, error: error.message || 'propagate failed' });
    }
  });

  return router;
}

module.exports = { createSmartCardsRoutes };

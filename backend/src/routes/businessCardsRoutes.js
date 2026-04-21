/**
 * REST routes for BusinessCards (Mongo `business_cards`).
 *
 * Canonical contract: see frontend types in `services/types/cards.ts`
 * (BusinessCardDoc). Field names here MUST match that file.
 *
 * Mount:
 *   app.use('/api/business-cards', gatewayKeyMiddleware, jwtAuthMiddleware,
 *           qrScopeMiddleware, createBusinessCardsRoutes({ storage }));
 *
 * Endpoints:
 *   GET    /                   → list own business cards (newest first)
 *   GET    /market-catalog     → published+active cards for Social Market (Mongo; replaces legacy Firestore)
 *   GET    /:bId               → read one (owner only in v1)
 *   POST   /                   → create (generates bId, starts 14d trial)
 *   PATCH  /:bId               → partial update
 *   DELETE /:bId               → hard delete + cascade (share/calls/mutes)
 */

const crypto = require('crypto');
const express = require('express');
const { scheduleBusinessCardEmbeddingSync } = require('../services/cardVectorEmbedding');

const TRIAL_DAYS = 14;
const MAX_VAULT_ITEMS = 12;
const MAX_KEYWORDS = 20;

/** Inline UUID-ish identifier, consistent with `services/newEntityId.ts`. */
function newBusinessCardId() {
  const bytes = crypto.randomBytes(16);
  // RFC4122-ish formatting 8-4-4-4-12 hex groups.
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

function trimOrEmpty(value) {
  return String(value ?? '').trim();
}

function trimOrNull(value) {
  const t = trimOrEmpty(value);
  return t ? t : null;
}

function toFiniteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === 1 || value === '1') return true;
  if (value === 'false' || value === 0 || value === '0') return false;
  return fallback;
}

function normalizeLayout(value) {
  return trimOrEmpty(value) === 'horizontal' ? 'horizontal' : 'vertical';
}

function normalizeLocationSource(value) {
  const v = trimOrEmpty(value);
  if (v === 'device_gps' || v === 'geocode_forward' || v === 'manual') return v;
  return 'device_gps';
}

function normalizeSubscriptionStatus(value) {
  const v = trimOrEmpty(value);
  if (v === 'active' || v === 'expired') return v;
  return 'trial';
}

/** Defensive sanitizer for slots coming from the client. */
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

function sanitizeMarketFacets(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const row of raw.slice(0, MAX_VAULT_ITEMS)) {
    const type = trimOrEmpty(row?.type);
    const label = trimOrEmpty(row?.label);
    const value = trimOrEmpty(row?.value);
    if (!type && !label && !value) continue;
    const facet = { type, label, value };
    const iconName = trimOrEmpty(row?.iconName);
    if (iconName) facet.iconName = iconName;
    out.push(facet);
  }
  return out;
}

function sanitizeKeywords(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const kw of raw) {
    const k = trimOrEmpty(kw);
    if (!k) continue;
    const lower = k.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(k);
    if (out.length >= MAX_KEYWORDS) break;
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

/**
 * Serialize a Mongo document to the canonical BusinessCardDoc wire shape
 * (ISO-string timestamps, default-filled fields).
 */
function toWireBusinessCard(doc) {
  if (!doc) return null;
  return {
    bId: String(doc.bId || ''),
    ownerUid: String(doc.ownerUid || ''),
    createdAt: toIso(doc.createdAt) || new Date(0).toISOString(),
    updatedAt: toIso(doc.updatedAt) || new Date(0).toISOString(),

    bcName: String(doc.bcName || ''),
    bcLogoUrl: doc.bcLogoUrl ? String(doc.bcLogoUrl) : null,
    bcContactName: String(doc.bcContactName || ''),

    bcPhysicalAddress: String(doc.bcPhysicalAddress || ''),
    bcLatitude: toFiniteNumber(doc.bcLatitude, 0),
    bcLongitude: toFiniteNumber(doc.bcLongitude, 0),
    bcLocationSource: normalizeLocationSource(doc.bcLocationSource),

    bcKeywords: Array.isArray(doc.bcKeywords) ? doc.bcKeywords.map(String) : [],
    bcMarketFacets: Array.isArray(doc.bcMarketFacets) ? doc.bcMarketFacets : [],
    isPublishedToMarket: Boolean(doc.isPublishedToMarket),
    publishedAt: toIso(doc.publishedAt),

    kycDocumentUrl: doc.kycDocumentUrl ? String(doc.kycDocumentUrl) : null,
    kycVerified: Boolean(doc.kycVerified),
    kycApprovedAt: toIso(doc.kycApprovedAt),
    kycTermsAccepted: Boolean(doc.kycTermsAccepted),
    businessTermsAccepted: Boolean(doc.businessTermsAccepted),
    subscriptionStatus: normalizeSubscriptionStatus(doc.subscriptionStatus),
    trialEndsAt: toIso(doc.trialEndsAt) || new Date(0).toISOString(),
    subscriptionExpiresAt: toIso(doc.subscriptionExpiresAt),

    vaultItemIds: Array.isArray(doc.vaultItemIds) ? doc.vaultItemIds.map(String) : [],
    publicCardSlots: Array.isArray(doc.publicCardSlots) ? doc.publicCardSlots : [],

    themeId: doc.themeId ? String(doc.themeId) : null,
    fontId: doc.fontId ? String(doc.fontId) : null,
    wallpaperId: doc.wallpaperId ? String(doc.wallpaperId) : null,
    iconPackId: doc.iconPackId ? String(doc.iconPackId) : null,
    enableParallax: Boolean(doc.enableParallax),
    isFavorite: Boolean(doc.isFavorite),
    layout: normalizeLayout(doc.layout),

    holdersCount: toFiniteNumber(doc.holdersCount, 0),
    viewCount: toFiniteNumber(doc.viewCount, 0),
    averageRating: toFiniteNumber(doc.averageRating, 5),
    totalRatings: toFiniteNumber(doc.totalRatings, 0),
    negativeRatingsCount: toFiniteNumber(doc.negativeRatingsCount, 0),

    isActive: doc.isActive !== false,
    lastQrUpdate: toIso(doc.lastQrUpdate),
    searchRankScore: toFiniteNumber(doc.searchRankScore, 0),
  };
}

/**
 * Cascade delete: remove everything that referenced the card's `bId`.
 * Same cleanup pattern used by the smart_cards delete in qrRoutes.
 */
async function cascadeBusinessCardDelete(db, bId) {
  await Promise.all([
    db.collection('share_permissions').deleteMany({ bId }),
    db.collection('ghost_link_invites').deleteMany({ 'card.bId': bId }),
    db.collection('call_logs').deleteMany({ 'card.bId': bId }),
    db.collection('card_subscriber_mutes').deleteMany({ bId }),
    db.collection('story_card_states').deleteMany({ bId }),
    db.collection('temporary_access').deleteMany({ bId }),
  ]);
}

function createBusinessCardsRoutes({ storage }) {
  const router = express.Router();

  // ───────────────────────── GET / — list mine ──────────────────────────────
  router.get('/', async (req, res) => {
    try {
      const uid = String(req.auth?.sub || '').trim();
      if (!uid) return res.status(401).json({ ok: false, error: 'Unauthenticated' });

      const db = req.app.locals.db || (await storage.connect());
      const cursor = db
        .collection('business_cards')
        .find({ ownerUid: uid })
        .sort({ createdAt: -1 });
      const docs = await cursor.toArray();
      return res.status(200).json({ ok: true, cards: docs.map(toWireBusinessCard) });
    } catch (error) {
      console.error('[businessCards] GET / failed:', error);
      return res.status(500).json({ ok: false, error: error.message || 'list failed' });
    }
  });

  // ───────────────────────── GET /market-catalog (before /:bId) ───────────
  router.get('/market-catalog', async (req, res) => {
    try {
      const uid = String(req.auth?.sub || '').trim();
      if (!uid) return res.status(401).json({ ok: false, error: 'Unauthenticated' });

      const db = req.app.locals.db || (await storage.connect());
      const docs = await db
        .collection('business_cards')
        .find({
          isActive: { $ne: false },
          isPublishedToMarket: true,
        })
        .sort({ updatedAt: -1 })
        .limit(200)
        .toArray();

      return res.status(200).json({ ok: true, cards: docs.map(toWireBusinessCard) });
    } catch (error) {
      console.error('[businessCards] GET /market-catalog failed:', error);
      return res.status(500).json({ ok: false, error: error.message || 'market catalog failed' });
    }
  });

  // ───────────────────────── GET /:bId — read one ───────────────────────────
  router.get('/:bId', async (req, res) => {
    try {
      const uid = String(req.auth?.sub || '').trim();
      if (!uid) return res.status(401).json({ ok: false, error: 'Unauthenticated' });
      const bId = trimOrEmpty(req.params.bId);
      if (!bId) return res.status(400).json({ ok: false, error: 'bId is required' });

      const db = req.app.locals.db || (await storage.connect());
      const doc = await db.collection('business_cards').findOne({ bId });
      if (!doc) return res.status(404).json({ ok: false, error: 'Card not found' });
      if (doc.ownerUid !== uid) {
        return res.status(403).json({ ok: false, error: 'Not authorized to read this card' });
      }
      return res.status(200).json({ ok: true, card: toWireBusinessCard(doc) });
    } catch (error) {
      console.error('[businessCards] GET /:bId failed:', error);
      return res.status(500).json({ ok: false, error: error.message || 'read failed' });
    }
  });

  // ───────────────────────── POST / — create ────────────────────────────────
  router.post('/', async (req, res) => {
    try {
      const uid = String(req.auth?.sub || '').trim();
      if (!uid) return res.status(401).json({ ok: false, error: 'Unauthenticated' });

      const body = req.body || {};
      const bcName = trimOrEmpty(body.bcName);
      const bcContactName = trimOrEmpty(body.bcContactName);
      const bcLatitude = Number(body.bcLatitude);
      const bcLongitude = Number(body.bcLongitude);
      const kycTermsAccepted = toBoolean(body.kycTermsAccepted);
      const businessTermsAccepted = toBoolean(body.businessTermsAccepted);

      if (!bcName) return res.status(400).json({ ok: false, error: 'bcName is required' });
      if (!bcContactName) return res.status(400).json({ ok: false, error: 'bcContactName is required' });
      if (!Number.isFinite(bcLatitude) || !Number.isFinite(bcLongitude)) {
        return res.status(400).json({ ok: false, error: 'bcLatitude and bcLongitude are required' });
      }
      if (!businessTermsAccepted) {
        return res.status(400).json({ ok: false, error: 'businessTermsAccepted must be true' });
      }

      const now = new Date();
      const trialEndsAt = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
      const bId = newBusinessCardId();

      const doc = {
        bId,
        ownerUid: uid,
        createdAt: now,
        updatedAt: now,

        bcName,
        bcLogoUrl: trimOrNull(body.bcLogoUrl),
        bcContactName,

        bcPhysicalAddress: trimOrEmpty(body.bcPhysicalAddress),
        bcLatitude,
        bcLongitude,
        bcLocationSource: normalizeLocationSource(body.bcLocationSource),

        bcKeywords: sanitizeKeywords(body.bcKeywords),
        bcMarketFacets: sanitizeMarketFacets(body.bcMarketFacets),
        isPublishedToMarket: false,
        publishedAt: null,

        kycDocumentUrl: trimOrNull(body.kycDocumentUrl),
        kycVerified: false,
        kycApprovedAt: null,
        kycTermsAccepted,
        businessTermsAccepted,
        subscriptionStatus: 'trial',
        trialEndsAt,
        subscriptionExpiresAt: null,

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
        viewCount: 0,
        averageRating: 5,
        totalRatings: 0,
        negativeRatingsCount: 0,

        isActive: true,
        lastQrUpdate: null,
        searchRankScore: 0,
      };

      const db = req.app.locals.db || (await storage.connect());
      await db.collection('business_cards').insertOne(doc);
      scheduleBusinessCardEmbeddingSync(db, doc);
      return res.status(201).json({ ok: true, card: toWireBusinessCard(doc) });
    } catch (error) {
      console.error('[businessCards] POST / failed:', error);
      return res.status(500).json({ ok: false, error: error.message || 'create failed' });
    }
  });

  // ───────────────────────── PATCH /:bId — update ───────────────────────────
  router.patch('/:bId', async (req, res) => {
    try {
      const uid = String(req.auth?.sub || '').trim();
      if (!uid) return res.status(401).json({ ok: false, error: 'Unauthenticated' });
      const bId = trimOrEmpty(req.params.bId);
      if (!bId) return res.status(400).json({ ok: false, error: 'bId is required' });

      const body = req.body || {};
      const set = {};

      // Identity (owner can rename, change logo, change contact)
      if (body.bcName !== undefined) set.bcName = trimOrEmpty(body.bcName);
      if (body.bcLogoUrl !== undefined) set.bcLogoUrl = trimOrNull(body.bcLogoUrl);
      if (body.bcContactName !== undefined) set.bcContactName = trimOrEmpty(body.bcContactName);

      // Location
      if (body.bcPhysicalAddress !== undefined) set.bcPhysicalAddress = trimOrEmpty(body.bcPhysicalAddress);
      if (body.bcLatitude !== undefined) {
        const n = Number(body.bcLatitude);
        if (!Number.isFinite(n)) return res.status(400).json({ ok: false, error: 'bcLatitude must be a number' });
        set.bcLatitude = n;
      }
      if (body.bcLongitude !== undefined) {
        const n = Number(body.bcLongitude);
        if (!Number.isFinite(n)) return res.status(400).json({ ok: false, error: 'bcLongitude must be a number' });
        set.bcLongitude = n;
      }
      if (body.bcLocationSource !== undefined) set.bcLocationSource = normalizeLocationSource(body.bcLocationSource);

      // Discoverability
      if (body.bcKeywords !== undefined) set.bcKeywords = sanitizeKeywords(body.bcKeywords);
      if (body.bcMarketFacets !== undefined) set.bcMarketFacets = sanitizeMarketFacets(body.bcMarketFacets);
      if (body.isPublishedToMarket !== undefined) {
        set.isPublishedToMarket = toBoolean(body.isPublishedToMarket);
        if (set.isPublishedToMarket && !body.publishedAt) set.publishedAt = new Date();
      }

      // Content
      if (body.vaultItemIds !== undefined) set.vaultItemIds = sanitizeVaultItemIds(body.vaultItemIds);
      if (body.publicCardSlots !== undefined) set.publicCardSlots = sanitizePublicCardSlots(body.publicCardSlots);

      // Presentation
      if (body.themeId !== undefined) set.themeId = trimOrNull(body.themeId);
      if (body.fontId !== undefined) set.fontId = trimOrNull(body.fontId);
      if (body.wallpaperId !== undefined) set.wallpaperId = trimOrNull(body.wallpaperId);
      if (body.iconPackId !== undefined) set.iconPackId = trimOrNull(body.iconPackId);
      if (body.enableParallax !== undefined) set.enableParallax = toBoolean(body.enableParallax);
      if (body.isFavorite !== undefined) set.isFavorite = toBoolean(body.isFavorite);
      if (body.layout !== undefined) set.layout = normalizeLayout(body.layout);

      // KYC (termsAccepted only; verification flags are admin-controlled)
      if (body.kycDocumentUrl !== undefined) set.kycDocumentUrl = trimOrNull(body.kycDocumentUrl);
      if (body.kycTermsAccepted !== undefined) set.kycTermsAccepted = toBoolean(body.kycTermsAccepted);
      if (body.businessTermsAccepted !== undefined) set.businessTermsAccepted = toBoolean(body.businessTermsAccepted);

      // Subscription (DEV: client-writable so the demo license button works.
      // PROD transitions will eventually land on a dedicated RevenueCat webhook
      // handler that bypasses this PATCH route — lock it down then.)
      if (body.subscriptionStatus !== undefined) {
        set.subscriptionStatus = normalizeSubscriptionStatus(body.subscriptionStatus);
      }
      if (body.subscriptionExpiresAt !== undefined) {
        const v = body.subscriptionExpiresAt;
        if (v === null) {
          set.subscriptionExpiresAt = null;
        } else {
          const d = new Date(v);
          if (Number.isNaN(d.getTime())) {
            return res.status(400).json({ ok: false, error: 'subscriptionExpiresAt must be an ISO date or null' });
          }
          set.subscriptionExpiresAt = d;
        }
      }

      if (Object.keys(set).length === 0) {
        return res.status(400).json({ ok: false, error: 'No updatable fields provided' });
      }
      set.updatedAt = new Date();

      const db = req.app.locals.db || (await storage.connect());
      const result = await db.collection('business_cards').findOneAndUpdate(
        { bId, ownerUid: uid },
        { $set: set },
        { returnDocument: 'after' },
      );
      const doc = result && (result.value || result); // driver-version compat
      if (!doc || !doc.bId) {
        return res.status(404).json({ ok: false, error: 'Card not found or not authorized' });
      }
      scheduleBusinessCardEmbeddingSync(db, doc);
      return res.status(200).json({ ok: true, card: toWireBusinessCard(doc) });
    } catch (error) {
      console.error('[businessCards] PATCH /:bId failed:', error);
      return res.status(500).json({ ok: false, error: error.message || 'update failed' });
    }
  });

  // ───────────────────────── DELETE /:bId ───────────────────────────────────
  router.delete('/:bId', async (req, res) => {
    try {
      const uid = String(req.auth?.sub || '').trim();
      if (!uid) return res.status(401).json({ ok: false, error: 'Unauthenticated' });
      const bId = trimOrEmpty(req.params.bId);
      if (!bId) return res.status(400).json({ ok: false, error: 'bId is required' });

      const db = req.app.locals.db || (await storage.connect());
      const result = await db.collection('business_cards').deleteOne({ bId, ownerUid: uid });
      if (result.deletedCount !== 1) {
        return res.status(404).json({ ok: false, error: 'Card not found or not authorized' });
      }
      await cascadeBusinessCardDelete(db, bId);
      return res.status(200).json({ ok: true, deleted: true });
    } catch (error) {
      console.error('[businessCards] DELETE /:bId failed:', error);
      return res.status(500).json({ ok: false, error: error.message || 'delete failed' });
    }
  });

  return router;
}

module.exports = { createBusinessCardsRoutes };

/**
 * Rutas públicas (sin JWT) para enlaces universales de tarjeta (QR TTL 24h).
 * El token opaco es el secreto; no usar API gateway key en el cliente web.
 */

const express = require('express');
const { parseAndValidateTemporaryAccess } = require('../lib/temporaryAccessToken');

const QR_SCAN_SOURCE = 'qr_scan';

function sanitizeSearchFacetsPublic(raw) {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out = [];
  for (const row of raw.slice(0, 48)) {
    const type = String(row?.type ?? '').trim().slice(0, 120);
    const label = String(row?.label ?? '').trim().slice(0, 240);
    const value = String(row?.value ?? '').trim().slice(0, 4000);
    if (!type && !label && !value) {
      continue;
    }
    out.push({ type, label, value });
  }
  return out;
}

function sanitizeAnalyticsSegmentKey(raw) {
  const s = String(raw || 'unknown')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 64);
  return s || 'unknown';
}

/**
 * Registra vista desde QR físico en la misma estructura que POST /api/qr/analytics/track.
 */
async function bumpUniversalQrScanAnalytics(db, cardId) {
  const ts = new Date();
  const dayKey = ts.toISOString().slice(0, 10);
  const monthKey = ts.toISOString().slice(0, 7);
  const srcKey = sanitizeAnalyticsSegmentKey(QR_SCAN_SOURCE);
  const now = new Date();
  const iconType = sanitizeAnalyticsSegmentKey('universal_open');

  const dailyId = `d:${cardId}:${dayKey}`;
  await db.collection('card_analytics').updateOne(
    { _id: dailyId },
    {
      $inc: {
        totalInteractions: 1,
        [`icons.${iconType}`]: 1,
        [`sources.${srcKey}`]: 1,
      },
      $set: { updatedAt: now },
      $setOnInsert: {
        cardId,
        granularity: 'day',
        periodKey: dayKey,
        monthKey,
        createdAt: now,
      },
    },
    { upsert: true },
  );

  const monthlyId = `m:${cardId}:${monthKey}`;
  await db.collection('card_analytics').updateOne(
    { _id: monthlyId },
    {
      $inc: {
        totalInteractions: 1,
        [`icons.${iconType}`]: 1,
        [`sources.${srcKey}`]: 1,
      },
      $set: { updatedAt: now },
      $setOnInsert: {
        cardId,
        granularity: 'month',
        periodKey: monthKey,
        createdAt: now,
      },
    },
    { upsert: true },
  );
}

function createPublicUniversalRoutes({ storage }) {
  const router = express.Router();

  router.get('/universal-card', async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    try {
      const token = String(req.query?.token || '').trim();
      const source = String(req.query?.source || '').trim().toLowerCase();

      if (!token || token.length < 16 || token.length > 128) {
        return res.status(400).json({ ok: false, error: 'token is required' });
      }

      const db = await storage.connect();
      const now = new Date();

      const validation = await parseAndValidateTemporaryAccess(db, token);
      if (!validation.ok) {
        return res.status(410).json({
          ok: false,
          expired: true,
          error: 'Este acceso ha expirado. Escanea el QR actualizado o únete al Búnker.',
        });
      }

      const { ownerUid, cardId, expiresAt } = validation;

      const cardDoc = await db.collection('smart_cards').findOne(
        { ownerUid, cardId },
        {
          projection: {
            name: 1,
            layout: 1,
            themeId: 1,
            fontId: 1,
            fontName: 1,
            fontFamily: 1,
            fontTier: 1,
            wallpaperId: 1,
            wallpaperUrl: 1,
            wallpaperThumbUrl: 1,
            wallpaperTier: 1,
            enableParallax: 1,
            ownerNickname: 1,
            ownerPhotoUrl: 1,
            searchFacets: 1,
            holdersCount: 1,
            ratingAvg: 1,
            totalRatings: 1,
            publicCardSlots: 1,
            updatedAt: 1,
          },
        },
      );

      if (!cardDoc) {
        return res.status(404).json({ ok: false, error: 'Card not found' });
      }

      const storyRow = await db.collection('story_card_states').findOne(
        {
          ownerUid,
          cardId,
          expiresAt: { $gt: now },
        },
        { projection: { state: 1 } },
      );
      let storyState = 'none';
      if (storyRow) {
        const s = String(storyRow.state || '').toLowerCase();
        if (s === 'vip') {
          storyState = 'vip';
        } else if (s === 'normal') {
          storyState = 'normal';
        }
      }

      const slots = Array.isArray(cardDoc.publicCardSlots) ? cardDoc.publicCardSlots : [];

      const payload = {
        cardId,
        ownerUid,
        name: String(cardDoc.name || 'Smart Card'),
        layout: String(cardDoc.layout || 'vertical') === 'horizontal' ? 'horizontal' : 'vertical',
        themeId: cardDoc.themeId || null,
        fontId: cardDoc.fontId ? String(cardDoc.fontId) : null,
        fontName: cardDoc.fontName ? String(cardDoc.fontName) : null,
        fontFamily: cardDoc.fontFamily ? String(cardDoc.fontFamily) : null,
        fontTier: cardDoc.fontTier === 'premium' ? 'premium' : cardDoc.fontTier === 'free' ? 'free' : null,
        wallpaperId: cardDoc.wallpaperId ? String(cardDoc.wallpaperId) : null,
        wallpaperUrl: cardDoc.wallpaperUrl ? String(cardDoc.wallpaperUrl) : null,
        wallpaperThumbUrl: cardDoc.wallpaperThumbUrl ? String(cardDoc.wallpaperThumbUrl) : null,
        wallpaperTier: cardDoc.wallpaperTier === 'premium' ? 'premium' : cardDoc.wallpaperTier === 'free' ? 'free' : null,
        enableParallax: Boolean(cardDoc.enableParallax),
        ownerNickname: cardDoc.ownerNickname ? String(cardDoc.ownerNickname) : null,
        ownerPhotoUrl: cardDoc.ownerPhotoUrl ? String(cardDoc.ownerPhotoUrl) : null,
        searchFacets: sanitizeSearchFacetsPublic(cardDoc.searchFacets),
        holdersCount: Number(cardDoc.holdersCount || 0),
        ratingAvg: Number(cardDoc.ratingAvg || 5),
        totalRatings: Number.isFinite(Number(cardDoc.totalRatings)) ? Math.max(0, Math.floor(Number(cardDoc.totalRatings))) : 0,
        storyState,
        slots,
        expiresAt: expiresAt.toISOString(),
      };

      if (source === QR_SCAN_SOURCE) {
        try {
          await bumpUniversalQrScanAnalytics(db, cardId);
        } catch (e) {
          console.warn('[public/universal-card] analytics bump failed:', e?.message || e);
        }
      }

      return res.status(200).json({
        ok: true,
        source: source || null,
        card: payload,
      });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
  });

  router.options('/universal-card', (_req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  });

  return router;
}

module.exports = {
  createPublicUniversalRoutes,
  QR_SCAN_SOURCE,
};

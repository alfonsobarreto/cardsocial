/**
 * Rutas públicas (sin JWT) para enlaces universales de tarjeta (QR TTL 24h).
 * El token opaco es el secreto; no usar API gateway key en el cliente web.
 */

const express = require('express');
const { env } = require('../config');
const { rewritePublicCardMediaUrls } = require('../lib/vaultPublicUrlRewrite');
const { clientLocaleIsSpanish } = require('../lib/httpRequestLocale');
const { parseAndValidateTemporaryAccess } = require('../lib/temporaryAccessToken');
const { resolvePublicIdentity } = require('../lib/resolvePublicIdentity');
const { readSmartCardScName } = require('../lib/smartCardScName');
const { buildMongoExtendedProfileFields } = require('../lib/extendedUserIdentity');

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
 * Slots públicos para web/app: forma estable + itemId sintético si faltara (datos viejos en Mongo).
 */
/** Estilo público de smart_cards para vista previa QR (tema / layout / ratings). */
function previewStyleFromSmartCardDoc(cardDoc) {
  if (!cardDoc) {
    return {
      themeId: '',
      layout: 'vertical',
      wallpaperUrl: null,
      enableParallax: false,
      holdersCount: 0,
      ratingAvg: 0,
      totalRatings: 0,
    };
  }
  return {
    themeId: cardDoc.themeId ? String(cardDoc.themeId) : '',
    layout: String(cardDoc.layout || 'vertical') === 'horizontal' ? 'horizontal' : 'vertical',
    wallpaperUrl: cardDoc.wallpaperUrl ? String(cardDoc.wallpaperUrl) : null,
    enableParallax: Boolean(cardDoc.enableParallax),
    holdersCount: Math.max(0, Math.floor(Number(cardDoc.holdersCount ?? 0))),
    ratingAvg: Number.isFinite(Number(cardDoc.ratingAvg)) ? Number(cardDoc.ratingAvg) : 0,
    totalRatings: Math.max(0, Math.floor(Number(cardDoc.totalRatings ?? 0))),
  };
}

/** Estilo público de business_cards: fuente canónica para `/b/...` y QR business. */
function previewStyleFromBusinessCardDoc(cardDoc) {
  if (!cardDoc) {
    return {
      themeId: '',
      layout: 'vertical',
      wallpaperUrl: null,
      enableParallax: false,
      holdersCount: 0,
      ratingAvg: 0,
      totalRatings: 0,
    };
  }
  return {
    themeId: cardDoc.themeId ? String(cardDoc.themeId) : '',
    layout: String(cardDoc.layout || 'vertical') === 'horizontal' ? 'horizontal' : 'vertical',
    wallpaperUrl: null,
    enableParallax: Boolean(cardDoc.enableParallax),
    holdersCount: Math.max(0, Math.floor(Number(cardDoc.holdersCount ?? 0))),
    ratingAvg: Number.isFinite(Number(cardDoc.averageRating)) ? Number(cardDoc.averageRating) : 0,
    totalRatings: Math.max(0, Math.floor(Number(cardDoc.totalRatings ?? 0))),
  };
}

function normalizePublicCardSlotsForUniversal(raw) {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out = [];
  for (let i = 0; i < raw.length && out.length < 24; i += 1) {
    const row = raw[i] || {};
    if (row.isPrivate === true || String(row.visibility || '').toLowerCase() === 'private') {
      continue;
    }
    const itemId = String(row.itemId || '').trim().slice(0, 120) || `legacy-${i}`;
    const type = String(row.type || 'link').trim().slice(0, 64) || 'link';
    const label = String(row.label || '').trim().slice(0, 200);
    const value = String(row.value || '').trim().slice(0, 4000);
    const iconNameRaw = String(row.iconName || '').trim();
    const iconName = iconNameRaw ? iconNameRaw.slice(0, 120) : null;
    const rawIcon = String(row.icon || '').trim();
    const icon = /^https?:\/\//i.test(rawIcon) ? rawIcon.slice(0, 4000) : undefined;
    const vaultMimeRaw = String(row.vaultMimeType || '').trim();
    const vaultMimeType = vaultMimeRaw ? vaultMimeRaw.slice(0, 120) : undefined;
    const slot = {
      itemId,
      type,
      label,
      value,
      ...(iconName ? { iconName } : {}),
      ...(icon ? { icon } : {}),
      ...(vaultMimeType ? { vaultMimeType } : {}),
    };
    out.push(slot);
  }
  return out;
}

/**
 * Registra vista desde QR físico en la misma estructura que POST /api/qr/analytics/track.
 */
async function bumpUniversalQrScanAnalytics(db, cardKey, sid, bId) {
  const ts = new Date();
  const dayKey = ts.toISOString().slice(0, 10);
  const monthKey = ts.toISOString().slice(0, 7);
  const srcKey = sanitizeAnalyticsSegmentKey(QR_SCAN_SOURCE);
  const now = new Date();
  const iconType = sanitizeAnalyticsSegmentKey('universal_open');

  const dailyId = `d:${cardKey}:${dayKey}`;
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
        sid: sid || null,
        bId: bId || null,
        granularity: 'day',
        periodKey: dayKey,
        monthKey,
        createdAt: now,
      },
    },
    { upsert: true },
  );

  const monthlyId = `m:${cardKey}:${monthKey}`;
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
        sid: sid || null,
        bId: bId || null,
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
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept-Language');

    try {
      const isEs = clientLocaleIsSpanish(req);
      const token = String(req.query?.token || '').trim();
      const source = String(req.query?.source || '').trim().toLowerCase();

      if (!token || token.length < 16 || token.length > 128) {
        return res.status(400).json({
          ok: false,
          error: isEs ? 'El token no es válido o falta.' : 'Invalid or missing token.',
        });
      }

      const db = await storage.connect();
      const now = new Date();

      const validation = await parseAndValidateTemporaryAccess(db, token);
      if (!validation.ok) {
        return res.status(410).json({
          ok: false,
          expired: true,
          error: isEs
            ? 'Este acceso ha expirado. Escanea el QR actualizado o únete al Búnker.'
            : 'This access has expired. Scan the updated QR or join from the app.',
        });
      }

      const { uid: issuerUid, sid: valSid, bId: valBId, expiresAt } = validation;
      const sid = valSid != null && String(valSid).trim() ? String(valSid).trim() : null;
      const bId = valBId != null && String(valBId).trim() ? String(valBId).trim() : null;
      const cardKey = sid || bId;

      const [cardDoc, bizDoc] = await Promise.all([
        db.collection('smart_cards').findOne(
          { uid: issuerUid, $or: [{ sid: cardKey }, { bId: cardKey }] },
          {
            projection: {
              scName: 1,
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
              ownerDisplayName: 1,
              ownerNickname: 1,
              ownerPhotoUrl: 1,
              ownerOccupation: 1,
              searchFacets: 1,
              holdersCount: 1,
              ratingAvg: 1,
              totalRatings: 1,
              publicCardSlots: 1,
              updatedAt: 1,
            },
          },
        ),
        bId
          ? db.collection('business_cards').findOne(
              { ownerUid: issuerUid, bId },
              {
                projection: {
                  bcName: 1,
                  bcContactName: 1,
                  bcLogoUrl: 1,
                  publicCardSlots: 1,
                  themeId: 1,
                  layout: 1,
                  enableParallax: 1,
                  holdersCount: 1,
                  averageRating: 1,
                  totalRatings: 1,
                  updatedAt: 1,
                },
              },
            )
          : Promise.resolve(null),
      ]);

      if (!cardDoc && !bizDoc) {
        return res.status(404).json({
          ok: false,
          error: isEs ? 'No se encontró la tarjeta.' : 'Card not found.',
        });
      }
      const isBusinessCard = Boolean(bId && bizDoc);
      const style = isBusinessCard ? previewStyleFromBusinessCardDoc(bizDoc) : previewStyleFromSmartCardDoc(cardDoc);

      const idn = await resolvePublicIdentity(db, issuerUid, cardKey);

      const storyRow = await db.collection('story_card_states').findOne(
        {
          uid: issuerUid,
          $and: [
            { $or: [{ sid: cardKey }, { bId: cardKey }] },
            { expiresAt: { $gt: now } },
          ],
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

      const slots = normalizePublicCardSlotsForUniversal(
        isBusinessCard ? bizDoc.publicCardSlots : cardDoc.publicCardSlots,
      );

      // Identidad real del emisor (users + profiles), misma forma que business-card-preview:
      // `ownerPhotoUrl` sigue siendo la foto en el doc de tarjeta (wireframe / logo business);
      // `userAvatarUrl` es la foto de persona en Mongo (lista contactos / Ghost-Link).
      const [usersDoc, profilesDoc] = await Promise.all([
        db.collection('users').findOne(
          { uid: issuerUid },
          {
            projection: {
              userFullName: 1,
              displayName: 1,
              name: 1,
              fullName: 1,
              firstName: 1,
              lastName: 1,
              userNickName: 1,
              nickname: 1,
              userNickNameLower: 1,
              nicknameLower: 1,
              userAvatarUrl: 1,
            },
          },
        ),
        db.collection('profiles').findOne(
          { uid: issuerUid },
          {
            projection: {
              userFullName: 1,
              displayName: 1,
              name: 1,
              fullName: 1,
              firstName: 1,
              lastName: 1,
              userNickName: 1,
              nickname: 1,
              userNickNameLower: 1,
              nicknameLower: 1,
              userAvatarUrl: 1,
            },
          },
        ),
      ]);
      const issuer = buildMongoExtendedProfileFields(issuerUid, usersDoc, profilesDoc);

      const payload = {
        uid: issuerUid,
        sid,
        bId,
        scName: String(
          (isBusinessCard && bizDoc.bcName ? String(bizDoc.bcName).trim() : '') ||
            readSmartCardScName(cardDoc) ||
            idn.cardTitle ||
            'Smart Card',
        ),
        layout: style.layout,
        themeId: style.themeId || null,
        fontId: cardDoc?.fontId ? String(cardDoc.fontId) : null,
        fontName: cardDoc?.fontName ? String(cardDoc.fontName) : null,
        fontFamily: cardDoc?.fontFamily ? String(cardDoc.fontFamily) : null,
        fontTier: cardDoc?.fontTier === 'premium' ? 'premium' : cardDoc?.fontTier === 'free' ? 'free' : null,
        wallpaperId: cardDoc?.wallpaperId ? String(cardDoc.wallpaperId) : null,
        wallpaperUrl: style.wallpaperUrl || null,
        wallpaperThumbUrl: cardDoc?.wallpaperThumbUrl ? String(cardDoc.wallpaperThumbUrl) : null,
        wallpaperTier: cardDoc?.wallpaperTier === 'premium' ? 'premium' : cardDoc?.wallpaperTier === 'free' ? 'free' : null,
        enableParallax: style.enableParallax,
        ownerDisplayName: idn.fullName,
        bcContactName: isBusinessCard && bizDoc.bcContactName ? String(bizDoc.bcContactName).trim() : null,
        ownerNickname: cardDoc?.ownerNickname ? String(cardDoc.ownerNickname) : null,
        ownerPhotoUrl: isBusinessCard && bizDoc.bcLogoUrl ? String(bizDoc.bcLogoUrl) : cardDoc?.ownerPhotoUrl ? String(cardDoc.ownerPhotoUrl) : null,
        ownerOccupation: cardDoc?.ownerOccupation ? String(cardDoc.ownerOccupation) : null,
        userFullName: issuer.fullName ? String(issuer.fullName) : null,
        userNickName: issuer.nickname ? String(issuer.nickname) : null,
        userAvatarUrl: issuer.userAvatarUrl || null,
        searchFacets: sanitizeSearchFacetsPublic(cardDoc?.searchFacets),
        holdersCount: style.holdersCount,
        ratingAvg: style.ratingAvg || 5,
        totalRatings: style.totalRatings,
        storyState,
        slots,
        expiresAt: expiresAt.toISOString(),
      };

      if (source === QR_SCAN_SOURCE) {
        try {
          await bumpUniversalQrScanAnalytics(db, cardKey, sid, bId);
        } catch (e) {
          console.warn('[public/universal-card] analytics bump failed:', e?.message || e);
        }
      }

      return res.status(200).json({
        ok: true,
        source: source || null,
        card: rewritePublicCardMediaUrls(payload, env.publicVaultFileBaseUrl),
      });
    } catch (error) {
      const isEs = clientLocaleIsSpanish(req);
      return res.status(500).json({
        ok: false,
        error: isEs ? 'Error del servidor. Intenta de nuevo.' : 'Server error. Please try again.',
      });
    }
  });

  router.options('/universal-card', (_req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept-Language');
    return res.status(204).end();
  });

  /**
   * Vista previa de Business Card (QR permanente / deep link) sin token opaco — misma forma que qr-token-preview.
   */
  router.get('/business-card-preview', async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept-Language');

    try {
      const isEs = clientLocaleIsSpanish(req);
      const uid = String(req.query?.uid || '').trim();
      const bId = String(req.query?.bId || '').trim();
      if (!uid || !bId) {
        return res.status(400).json({
          ok: false,
          error: isEs ? 'Faltan uid o bId.' : 'uid and bId are required.',
        });
      }

      const db = await storage.connect();
      const [bizDoc, cardDoc] = await Promise.all([
        db.collection('business_cards').findOne(
          { bId, ownerUid: uid },
          {
            projection: {
              bcName: 1,
              bcContactName: 1,
              bcLogoUrl: 1,
              publicCardSlots: 1,
              themeId: 1,
              layout: 1,
              enableParallax: 1,
              holdersCount: 1,
              averageRating: 1,
              totalRatings: 1,
            },
          },
        ),
        db.collection('smart_cards').findOne(
          { uid, bId },
          {
            projection: {
              scName: 1,
              ownerNickname: 1,
              ownerPhotoUrl: 1,
              ownerOccupation: 1,
              publicCardSlots: 1,
              themeId: 1,
              layout: 1,
              wallpaperUrl: 1,
              enableParallax: 1,
              holdersCount: 1,
              ratingAvg: 1,
              totalRatings: 1,
            },
          },
        ),
      ]);
      if (!bizDoc) {
        return res.status(404).json({
          ok: false,
          error: isEs ? 'No se encontró la tarjeta.' : 'Card not found.',
        });
      }

      const idn = await resolvePublicIdentity(db, uid, bId);
      const bcNamePub = bizDoc.bcName != null && String(bizDoc.bcName).trim() ? String(bizDoc.bcName).trim() : null;
      const bcContactNamePub =
        bizDoc.bcContactName != null && String(bizDoc.bcContactName).trim()
          ? String(bizDoc.bcContactName).trim()
          : null;
      const slots = normalizePublicCardSlotsForUniversal(bizDoc.publicCardSlots);
      const style = previewStyleFromBusinessCardDoc(bizDoc);
      const far = new Date();
      far.setFullYear(far.getFullYear() + 10);

      return res.status(200).json(
        rewritePublicCardMediaUrls(
          {
            ok: true,
            uid,
            bId,
            token: '',
            expiresAt: far.toISOString(),
            // Business public payload is brand/card identity only. Do not expose
            // or bind the owner's personal profile fields to a BusinessCard.
            ownerDisplayName: bcContactNamePub || bcNamePub || '',
            cardName: String(bcNamePub || readSmartCardScName(cardDoc) || idn.cardTitle || ''),
            /** Subtítulo en cabecera (tarjeta negocio) — solo `business_cards.bcContactName`. */
            bcContactName: bcContactNamePub,
            ownerNickname: null,
            ownerPhotoUrl: bizDoc.bcLogoUrl ? String(bizDoc.bcLogoUrl) : cardDoc?.ownerPhotoUrl ? String(cardDoc.ownerPhotoUrl) : null,
            ownerOccupation: null,
            userFullName: null,
            userNickName: null,
            userAvatarUrl: null,
            slots,
            ...style,
          },
          env.publicVaultFileBaseUrl,
        ),
      );
    } catch (error) {
      const isEs = clientLocaleIsSpanish(req);
      return res.status(500).json({
        ok: false,
        error: isEs ? 'Error del servidor. Intenta de nuevo.' : 'Server error. Please try again.',
      });
    }
  });

  router.options('/business-card-preview', (_req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept-Language');
    return res.status(204).end();
  });

  /**
   * Vista previa de QR dinámico (qr_tokens) sin consumir el token — para modal de clasificación en app.
   */
  router.get('/qr-token-preview', async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept-Language');

    try {
      const isEs = clientLocaleIsSpanish(req);
      const token = String(req.query?.token || '').trim();
      if (!token || token.length < 16 || token.length > 128) {
        return res.status(400).json({
          ok: false,
          error: isEs ? 'El token no es válido o falta.' : 'Invalid or missing token.',
        });
      }

      const db = await storage.connect();
      const now = new Date();

      const tokenDoc = await db.collection('qr_tokens').findOne(
        { token },
               { projection: { uid: 1, sid: 1, bId: 1, status: 1, expiresAt: 1 } },
      );
      if (!tokenDoc || String(tokenDoc.status || '') !== 'unused') {
        return res.status(410).json({
          ok: false,
          expired: true,
          error: isEs ? 'El token expiró o ya fue usado.' : 'Token expired or already used.',
        });
      }
      const exp = tokenDoc.expiresAt ? new Date(tokenDoc.expiresAt) : null;
      if (!exp || exp.getTime() <= now.getTime()) {
        return res.status(410).json({
          ok: false,
          expired: true,
          error: isEs ? 'El token expiró.' : 'Token expired.',
        });
      }

      const issuerUid = String(tokenDoc.uid || '').trim();
      const sid = tokenDoc.sid != null && String(tokenDoc.sid).trim() ? String(tokenDoc.sid).trim() : null;
      const bId = tokenDoc.bId != null && String(tokenDoc.bId).trim() ? String(tokenDoc.bId).trim() : null;
      const cardKey = sid || bId;
      if (!issuerUid || !cardKey) {
        return res.status(400).json({
          ok: false,
          error: isEs ? 'Datos del token no válidos.' : 'Invalid token payload.',
        });
      }

      const cardDoc = await db.collection('smart_cards').findOne(
        { uid: issuerUid, $or: [{ sid: cardKey }, { bId: cardKey }] },
        {
          projection: {
            scName: 1,
            ownerNickname: 1,
            ownerPhotoUrl: 1,
            ownerOccupation: 1,
            publicCardSlots: 1,
            themeId: 1,
            layout: 1,
            wallpaperUrl: 1,
            enableParallax: 1,
            holdersCount: 1,
            ratingAvg: 1,
            totalRatings: 1,
          },
        },
      );
      if (!cardDoc) {
        return res.status(404).json({
          ok: false,
          error: isEs ? 'No se encontró la tarjeta.' : 'Card not found.',
        });
      }

      const idn = await resolvePublicIdentity(db, issuerUid, cardKey);
      const slots = normalizePublicCardSlotsForUniversal(cardDoc.publicCardSlots);
      const style = previewStyleFromSmartCardDoc(cardDoc);

      return res.status(200).json(
        rewritePublicCardMediaUrls(
          {
            ok: true,
            uid: issuerUid,
            sid,
            bId,
            token,
            expiresAt: exp.toISOString(),
            ownerDisplayName: idn.fullName,
            cardName: String(readSmartCardScName(cardDoc) || idn.cardTitle || ''),
            ownerNickname: cardDoc.ownerNickname ? String(cardDoc.ownerNickname) : null,
            ownerPhotoUrl: cardDoc.ownerPhotoUrl ? String(cardDoc.ownerPhotoUrl) : null,
            ownerOccupation: cardDoc.ownerOccupation ? String(cardDoc.ownerOccupation) : null,
            slots,
            ...style,
          },
          env.publicVaultFileBaseUrl,
        ),
      );
    } catch (error) {
      const isEs = clientLocaleIsSpanish(req);
      return res.status(500).json({
        ok: false,
        error: isEs ? 'Error del servidor. Intenta de nuevo.' : 'Server error. Please try again.',
      });
    }
  });

  router.options('/qr-token-preview', (_req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept-Language');
    return res.status(204).end();
  });

  return router;
}

module.exports = {
  createPublicUniversalRoutes,
  QR_SCAN_SOURCE,
};

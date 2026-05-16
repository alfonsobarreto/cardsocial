/**
 * Rutas públicas (sin JWT) para enlaces universales de tarjeta (QR TTL 24h).
 * El token opaco es el secreto; no usar API gateway key en el cliente web.
 */

const express = require('express');
const { env } = require('../config');
const { rewritePublicCardMediaUrls } = require('../lib/vaultPublicUrlRewrite');
const { sanitizeAnalyticsSegmentKey, recordCardAnalyticsEvent } = require('../services/cardAnalyticsRecord');
const { clientLocaleIsSpanish } = require('../lib/httpRequestLocale');
const { parseAndValidateTemporaryAccess } = require('../lib/temporaryAccessToken');
const { resolvePublicIdentity } = require('../lib/resolvePublicIdentity');
const { readSmartCardScName } = require('../lib/smartCardScName');
const { buildMongoExtendedProfileFields } = require('../lib/extendedUserIdentity');
const { getFirestoreOptional } = require('../lib/firebaseAdminApp');
const { buildUserFacingJson } = require('../lib/userFacingErrors');

const BUSINESS_MEDAL_KEYS = ['compromiso', 'servicio', 'confianza', 'prestigio', 'excelencia'];
const SOCIAL_MEDAL_KEYS = ['creativo', 'conector', 'visionario', 'conversador', 'guru'];

/** Insignia azul público cuando `users.{legacyTier}` ≥ Silver */
function legacyOfficialPartnerFromFirestoreUser(raw) {
  const t = String(raw?.legacyTier ?? '').trim().toLowerCase();
  return ['silver', 'gold', 'platinum', 'diamond'].includes(t);
}

function sanitizeBusinessMedalCounts(raw) {
  /** @type {Record<string, number>} */
  const out = {};
  for (const k of BUSINESS_MEDAL_KEYS) {
    let n = 0;
    if (raw && typeof raw === 'object' && raw[k] != null) {
      n = Math.max(0, Math.floor(Number(raw[k])));
      if (!Number.isFinite(n)) n = 0;
    }
    out[k] = n;
  }
  return out;
}

function sanitizeSocialMedalCounts(raw) {
  /** @type {Record<string, number>} */
  const out = {};
  for (const k of SOCIAL_MEDAL_KEYS) {
    let n = 0;
    if (raw && typeof raw === 'object' && raw[k] != null) {
      n = Math.max(0, Math.floor(Number(raw[k])));
      if (!Number.isFinite(n)) n = 0;
    }
    out[k] = n;
  }
  return out;
}

const QR_SCAN_SOURCE = 'qr_scan';

function publicAnalyticsClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) {
    return xff.split(',')[0].trim().slice(0, 128);
  }
  const xri = req.headers['x-real-ip'];
  if (typeof xri === 'string' && xri.trim()) {
    return xri.trim().slice(0, 128);
  }
  const raw = req.ip || req.socket?.remoteAddress || '';
  return String(raw || 'unknown').trim().slice(0, 128) || 'unknown';
}

/** Límite deslizante por IP+card+tarea (solo memoria proceso; suficiente con un App Service detrás de Front Door). */
const PUBLIC_ANALYTICS_RATE_BUCKETS = new Map();

function allowPublicAnalyticsRate(ip, bucketKey, maxHits, windowMs) {
  const mapKey = `${String(ip)}::${String(bucketKey)}`;
  const now = Date.now();
  let arr = PUBLIC_ANALYTICS_RATE_BUCKETS.get(mapKey);
  if (!Array.isArray(arr)) {
    arr = [];
  }
  arr = arr.filter((t) => now - t < windowMs);
  if (arr.length >= maxHits) {
    PUBLIC_ANALYTICS_RATE_BUCKETS.set(mapKey, arr);
    return false;
  }
  arr.push(now);
  PUBLIC_ANALYTICS_RATE_BUCKETS.set(mapKey, arr);
  return true;
}

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

/** SEO en `business_cards.bcKeywords` — solo preview pública de negocio (no smart_cards). */
function sanitizeBcKeywordsPublic(raw) {
  if (!Array.isArray(raw)) {
    return [];
  }
  const seen = new Set();
  const out = [];
  for (const kw of raw) {
    const k = String(kw ?? '').trim().slice(0, 120);
    if (!k) continue;
    const lower = k.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(k);
    if (out.length >= 20) break;
  }
  return out;
}

/**
 * `smart_cards` mezcla legado (`uid` + `itemIds`) y API REST (`ownerUid` + `vaultItemIds`).
 * Sin este filtro, el QR / universal-card no encuentra la fila o lee slots desactualizados.
 */
function smartCardPublicFindFilter(issuerUid, cardKey) {
  const u = String(issuerUid || '').trim();
  const k = String(cardKey || '').trim();
  if (!u || !k) return null;
  return {
    $and: [
      { $or: [{ uid: u }, { ownerUid: u }] },
      { $or: [{ sid: k }, { bId: k }] },
    ],
  };
}

/**
 * Estilo público de smart_cards para vista previa QR (tema / layout).
 */
function previewStyleFromSmartCardDoc(cardDoc) {
  if (!cardDoc) {
    return {
      themeId: '',
      layout: 'vertical',
      wallpaperUrl: null,
      enableParallax: false,
    };
  }
  return {
    themeId: cardDoc.themeId ? String(cardDoc.themeId) : '',
    layout: String(cardDoc.layout || 'vertical') === 'horizontal' ? 'horizontal' : 'vertical',
    wallpaperUrl: cardDoc.wallpaperUrl ? String(cardDoc.wallpaperUrl) : null,
    enableParallax: Boolean(cardDoc.enableParallax),
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
    };
  }
  return {
    themeId: cardDoc.themeId ? String(cardDoc.themeId) : '',
    layout: String(cardDoc.layout || 'vertical') === 'horizontal' ? 'horizontal' : 'vertical',
    wallpaperUrl: null,
    enableParallax: Boolean(cardDoc.enableParallax),
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

function publicSlotsForCurrentVaultIds(rawSlots, rawVaultItemIds) {
  if (!Array.isArray(rawSlots)) {
    return [];
  }
  if (!Array.isArray(rawVaultItemIds)) {
    return rawSlots;
  }
  const activeIds = new Set(rawVaultItemIds.map((id) => String(id || '').trim()).filter(Boolean));
  if (!activeIds.size) {
    return [];
  }
  return rawSlots.filter((slot) => activeIds.has(String(slot?.itemId || '').trim()));
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

  await db.collection('card_analytics').insertOne({
    _id: `e:${cardKey}:${ts.getTime()}:${Math.random().toString(16).slice(2, 10)}`,
    cardId: cardKey,
    type: 'qr_scan',
    subType: iconType,
    timestamp: ts,
    sid: sid || null,
    bId: bId || null,
    source: srcKey,
    createdAt: now,
  });

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
      const cardKeyFilter = smartCardPublicFindFilter(issuerUid, cardKey);

      const [cardDoc, bizDoc] = await Promise.all([
        cardKeyFilter
          ? db.collection('smart_cards').findOne(
          cardKeyFilter,
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
              vaultItemIds: 1,
              updatedAt: 1,
            },
          },
        )
          : Promise.resolve(null),
        bId
          ? db.collection('business_cards').findOne(
              { ownerUid: issuerUid, bId },
              {
                projection: {
                  bcName: 1,
                  bcContactName: 1,
                  bcLogoUrl: 1,
                  publicCardSlots: 1,
                  vaultItemIds: 1,
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
          $and: [
            { $or: [{ uid: issuerUid }, { ownerUid: issuerUid }] },
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
        publicSlotsForCurrentVaultIds(
          isBusinessCard ? bizDoc.publicCardSlots : cardDoc.publicCardSlots,
          isBusinessCard ? bizDoc.vaultItemIds : cardDoc.vaultItemIds,
        ),
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
        storyState,
        slots,
        expiresAt: expiresAt.toISOString(),
      };

      /** Medallas públicas: mismo doc `medals/` que la app (`bId` negocio vs `sid` smart). */
      let businessMedalCountsPack =
        isBusinessCard && bId ? sanitizeBusinessMedalCounts(null) : undefined;
      let socialMedalCountsPack =
        !isBusinessCard && sid ? sanitizeSocialMedalCounts(null) : undefined;
      const medalsDocKey =
        isBusinessCard && bId ? bId : !isBusinessCard && sid ? sid : null;
      try {
        const fs = getFirestoreOptional();
        if (fs && medalsDocKey) {
          const medalSnap = await fs.collection('medals').doc(medalsDocKey).get();
          if (medalSnap.exists) {
            const rawC = medalSnap.data()?.counts;
            if (isBusinessCard && bId) {
              businessMedalCountsPack = sanitizeBusinessMedalCounts(rawC);
            } else if (!isBusinessCard && sid) {
              socialMedalCountsPack = sanitizeSocialMedalCounts(rawC);
            }
          }
        }
      } catch (_e) {
        /* Firestore opcional */
      }
      if (businessMedalCountsPack !== undefined) {
        payload.businessMedalCounts = businessMedalCountsPack;
      }
      if (socialMedalCountsPack !== undefined) {
        payload.socialMedalCounts = socialMedalCountsPack;
      }

      let legacyOfficialPartner = false;
      try {
        const fsPartners = getFirestoreOptional();
        if (fsPartners) {
          const uSnap = await fsPartners.collection('users').doc(issuerUid).get();
          legacyOfficialPartner = uSnap.exists ? legacyOfficialPartnerFromFirestoreUser(uSnap.data()) : false;
        }
      } catch (_p) {
        /* Firestore opcional */
      }
      payload.legacyOfficialPartner = legacyOfficialPartner;

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
      console.error('[public/universal-card] 500', error);
      return res.status(500).json(buildUserFacingJson(req, 'server_error', 'SERVER_INTERNAL_ERROR'));
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
              bcKeywords: 1,
              publicCardSlots: 1,
              vaultItemIds: 1,
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
          { $and: [{ $or: [{ uid }, { ownerUid: uid }] }, { bId }] },
          {
            projection: {
              scName: 1,
              ownerNickname: 1,
              ownerPhotoUrl: 1,
              ownerOccupation: 1,
              publicCardSlots: 1,
              vaultItemIds: 1,
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
      const slots = normalizePublicCardSlotsForUniversal(
        publicSlotsForCurrentVaultIds(bizDoc.publicCardSlots, bizDoc.vaultItemIds),
      );
      const style = previewStyleFromBusinessCardDoc(bizDoc);
      const far = new Date();
      far.setFullYear(far.getFullYear() + 10);

      let businessMedalCounts = sanitizeBusinessMedalCounts(null);
      try {
        const fs = getFirestoreOptional();
        if (fs) {
          const medalSnap = await fs.collection('medals').doc(bId).get();
          if (medalSnap.exists) {
            const mData = medalSnap.data();
            businessMedalCounts = sanitizeBusinessMedalCounts(mData?.counts);
          }
        }
      } catch (_e) {
        /* Firestore opcional: sin conteos si falla */
      }

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
            bcKeywords: sanitizeBcKeywordsPublic(bizDoc?.bcKeywords),
            ownerOccupation: null,
            userFullName: null,
            userNickName: null,
            userAvatarUrl: null,
            slots,
            businessMedalCounts,
            ...style,
          },
          env.publicVaultFileBaseUrl,
        ),
      );
    } catch (error) {
      console.error('[public/business-card-preview] 500', error);
      return res.status(500).json(buildUserFacingJson(req, 'server_error', 'SERVER_INTERNAL_ERROR'));
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

      const tkFilter = smartCardPublicFindFilter(issuerUid, cardKey);
      const smartProjection = {
        scName: 1,
        ownerNickname: 1,
        ownerPhotoUrl: 1,
        ownerOccupation: 1,
        publicCardSlots: 1,
        vaultItemIds: 1,
        themeId: 1,
        layout: 1,
        wallpaperUrl: 1,
        enableParallax: 1,
        holdersCount: 1,
        ratingAvg: 1,
        totalRatings: 1,
      };
      const bizProjection = {
        bcName: 1,
        bcContactName: 1,
        bcLogoUrl: 1,
        publicCardSlots: 1,
        vaultItemIds: 1,
        themeId: 1,
        layout: 1,
        enableParallax: 1,
        holdersCount: 1,
        averageRating: 1,
        totalRatings: 1,
      };
      const [cardDoc, bizDoc] = await Promise.all([
        tkFilter ? db.collection('smart_cards').findOne(tkFilter, { projection: smartProjection }) : Promise.resolve(null),
        bId
          ? db.collection('business_cards').findOne({ ownerUid: issuerUid, bId }, { projection: bizProjection })
          : Promise.resolve(null),
      ]);
      if (!cardDoc && !bizDoc) {
        return res.status(404).json({
          ok: false,
          error: isEs ? 'No se encontró la tarjeta.' : 'Card not found.',
        });
      }
      const isBusinessCard = Boolean(bId && bizDoc);

      const idn = await resolvePublicIdentity(db, issuerUid, cardKey);
      const slots = normalizePublicCardSlotsForUniversal(
        publicSlotsForCurrentVaultIds(
          isBusinessCard ? bizDoc.publicCardSlots : cardDoc.publicCardSlots,
          isBusinessCard ? bizDoc.vaultItemIds : cardDoc.vaultItemIds,
        ),
      );
      const style = isBusinessCard ? previewStyleFromBusinessCardDoc(bizDoc) : previewStyleFromSmartCardDoc(cardDoc);

      const bcNamePub =
        isBusinessCard && bizDoc.bcName != null && String(bizDoc.bcName).trim() ? String(bizDoc.bcName).trim() : null;
      const bcContactNamePub =
        isBusinessCard && bizDoc.bcContactName != null && String(bizDoc.bcContactName).trim()
          ? String(bizDoc.bcContactName).trim()
          : null;

      return res.status(200).json(
        rewritePublicCardMediaUrls(
          {
            ok: true,
            uid: issuerUid,
            sid,
            bId,
            token,
            expiresAt: exp.toISOString(),
            ownerDisplayName: isBusinessCard
              ? bcContactNamePub || bcNamePub || ''
              : idn.fullName,
            cardName: String(
              (isBusinessCard && bcNamePub) ||
                readSmartCardScName(cardDoc) ||
                idn.cardTitle ||
                '',
            ),
            bcContactName: isBusinessCard ? bcContactNamePub : null,
            ownerNickname: isBusinessCard ? null : cardDoc?.ownerNickname ? String(cardDoc.ownerNickname) : null,
            ownerPhotoUrl: isBusinessCard
              ? bizDoc.bcLogoUrl
                ? String(bizDoc.bcLogoUrl)
                : cardDoc?.ownerPhotoUrl
                  ? String(cardDoc.ownerPhotoUrl)
                  : null
              : cardDoc?.ownerPhotoUrl
                ? String(cardDoc.ownerPhotoUrl)
                : null,
            ownerOccupation: isBusinessCard ? null : cardDoc?.ownerOccupation ? String(cardDoc.ownerOccupation) : null,
            slots,
            ...style,
          },
          env.publicVaultFileBaseUrl,
        ),
      );
    } catch (error) {
      console.error('[public/qr-token-preview] 500', error);
      return res.status(500).json(buildUserFacingJson(req, 'server_error', 'SERVER_INTERNAL_ERROR'));
    }
  });

  router.options('/qr-token-preview', (_req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept-Language');
    return res.status(204).end();
  });

  /**
   * Tracking anónimo de vistas/clics desde `/b/:bId` (firma QR / web).
   * No JWT: validamos que exista la business card; rate-limit por IP.
   */
  router.options('/analytics/track', (_req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept-Language');
    res.setHeader('Access-Control-Max-Age', '86400');
    return res.status(204).end();
  });

  router.post('/analytics/track', express.json({ limit: '12kb' }), async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');

    try {
      const ownerUid = String(req.body?.uid || '').trim();
      const bId = String(req.body?.bId || '').trim();
      const eventRaw = String(req.body?.eventType || req.body?.type || '').trim().toLowerCase();
      const ip = publicAnalyticsClientIp(req);

      if (!ownerUid || ownerUid.length > 140 || !bId || bId.length > 140 || !eventRaw) {
        return res.status(400).json(buildUserFacingJson(req, 'auth_forbidden', 'invalid_body'));
      }

      let mongoEventType = eventRaw === 'click' ? 'icon_click' : eventRaw === 'view' ? 'view' : '';
      if (!mongoEventType) {
        return res.status(400).json(buildUserFacingJson(req, 'auth_forbidden', 'invalid_event_type'));
      }

      const viewWindowMs = 60 * 1000;
      const clickWindowMs = 60 * 1000;
      const maxViewsPerMin = Math.max(
        1,
        Math.min(
          60,
          Number.parseInt(String(process.env.PUBLIC_ANALYTICS_VIEWS_PER_WINDOW || '12'), 10) || 12,
        ),
      );
      const maxClicksPerMin = Math.max(
        10,
        Math.min(
          200,
          Number.parseInt(String(process.env.PUBLIC_ANALYTICS_CLICKS_PER_WINDOW || '45'), 10) || 45,
        ),
      );

      if (mongoEventType === 'view') {
        const okHit = allowPublicAnalyticsRate(ip, `view:${bId}`, maxViewsPerMin, viewWindowMs);
        if (!okHit) {
          return res.status(429).json(buildUserFacingJson(req, 'auth_forbidden', 'rate_limited'));
        }
      } else if (mongoEventType === 'icon_click') {
        const okHit = allowPublicAnalyticsRate(ip, `click:${bId}`, maxClicksPerMin, clickWindowMs);
        if (!okHit) {
          return res.status(429).json(buildUserFacingJson(req, 'auth_forbidden', 'rate_limited'));
        }
      }

      const db = await storage.connect();
      const exists = await db.collection('business_cards').findOne(
        { ownerUid, bId },
        { projection: { _id: 1 } },
      );
      if (!exists) {
        return res.status(404).json(buildUserFacingJson(req, 'auth_forbidden', 'not_found'));
      }

      const source = sanitizeAnalyticsSegmentKey(req.body?.source || 'public_web');
      let subType;
      if (mongoEventType === 'view') {
        subType = sanitizeAnalyticsSegmentKey(req.body?.subType ?? 'modal_open');
      } else {
        subType = sanitizeAnalyticsSegmentKey(
          req.body?.subType || req.body?.iconType || req.body?.slotType || 'unknown',
        );
      }

      let ts = new Date();
      if (req.body?.timestamp != null) {
        const t2 = new Date(req.body.timestamp);
        if (!Number.isNaN(t2.getTime())) {
          ts = t2;
        }
      }

      await recordCardAnalyticsEvent(db, {
        cardKey: bId,
        sid: null,
        bId,
        type: mongoEventType,
        subType,
        source,
        viewerUid: null,
        timestamp: ts,
      });

      return res.status(200).json({ ok: true });
    } catch {
      return res.status(500).json(buildUserFacingJson(req, 'auth_forbidden', 'server_error'));
    }
  });

  return router;
}

module.exports = {
  createPublicUniversalRoutes,
  QR_SCAN_SOURCE,
};

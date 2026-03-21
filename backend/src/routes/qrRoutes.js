const crypto = require('crypto');
const express = require('express');

const QR_TTL_SECONDS = 60;
const STORY_NORMAL_TTL_HOURS = 24;
const STORY_VIP_TTL_DAYS = 7;
const GHOST_LINK_INVITE_TTL_SECONDS = 45;

function normalizeString(value, fallback = null) {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function createQrRoutes({ storage }) {
  const router = express.Router();

  function buildRelationKey(uidA, uidB) {
    return [String(uidA || '').trim(), String(uidB || '').trim()].sort().join('::');
  }

  async function resolveUserProfile(db, uid) {
    const safeUid = String(uid || '').trim();
    if (!safeUid) {
      return { uid: '', name: 'Usuario', photoUrl: null };
    }

    const usersDoc = await db.collection('users').findOne(
      { uid: safeUid },
      { projection: { displayName: 1, name: 1, fullName: 1, photoUrl: 1, avatarUrl: 1, profilePhoto: 1 } }
    );
    const profilesDoc = usersDoc
      ? null
      : await db.collection('profiles').findOne(
          { uid: safeUid },
          { projection: { displayName: 1, name: 1, fullName: 1, photoUrl: 1, avatarUrl: 1, profilePhoto: 1 } }
        );

    const source = usersDoc || profilesDoc || null;
    const name = String(source?.displayName || source?.name || source?.fullName || `User ${safeUid.slice(0, 6)}`).trim();
    const photoUrl = String(source?.photoUrl || source?.avatarUrl || source?.profilePhoto || '').trim() || null;

    return {
      uid: safeUid,
      name,
      photoUrl,
    };
  }

  async function resolveUserProfileExtended(db, uid) {
    const safeUid = String(uid || '').trim();
    if (!safeUid) {
      return {
        uid: '',
        name: 'Usuario',
        nickname: 'user',
        photoUrl: null,
      };
    }

    const usersDoc = await db.collection('users').findOne(
      { uid: safeUid },
      { projection: { displayName: 1, name: 1, fullName: 1, nickname: 1, nicknameLower: 1, photoUrl: 1, avatarUrl: 1, profilePhoto: 1 } }
    );
    const profilesDoc = usersDoc
      ? null
      : await db.collection('profiles').findOne(
          { uid: safeUid },
          { projection: { displayName: 1, name: 1, fullName: 1, nickname: 1, nicknameLower: 1, photoUrl: 1, avatarUrl: 1, profilePhoto: 1 } }
        );

    const source = usersDoc || profilesDoc || null;
    const name = String(source?.displayName || source?.name || source?.fullName || `User ${safeUid.slice(0, 6)}`).trim();
    const nickname = String(source?.nickname || source?.nicknameLower || name.toLowerCase().replace(/\s+/g, '_')).trim();
    const photoUrl = String(source?.photoUrl || source?.avatarUrl || source?.profilePhoto || '').trim() || null;

    return {
      uid: safeUid,
      name,
      nickname,
      photoUrl,
    };
  }

  router.post('/voip/ghost-link/start', async (req, res) => {
    try {
      const authUid = String(req.auth?.sub || '').trim();
      const ownerUid = String(req.body?.ownerUid || authUid || '').trim();
      const targetUid = String(req.body?.targetUid || '').trim();
      const sourceCardName = String(req.body?.sourceCardName || '').trim();
      const sourceCardId = normalizeString(req.body?.sourceCardId, null);

      if (!ownerUid || !targetUid || !sourceCardName) {
        return res.status(400).json({ ok: false, error: 'ownerUid, targetUid y sourceCardName son obligatorios' });
      }
      if (authUid && authUid !== ownerUid) {
        return res.status(403).json({ ok: false, error: 'Forbidden: ownerUid does not match authenticated user' });
      }

      const db = await storage.connect();
      const relationKey = buildRelationKey(ownerUid, targetUid);
      const blocked = await db.collection('blocked_relations').findOne({ relationKey });
      if (blocked) {
        return res.status(403).json({ ok: false, error: 'Access denied: blocked relationship' });
      }

      const caller = await resolveUserProfileExtended(db, ownerUid);
      const receiver = await resolveUserProfileExtended(db, targetUid);

      // Azure Communication Services integration point (server-bridged app-to-app data call).
      const now = new Date();
      const sessionId = `acs_${ownerUid.slice(0, 8)}_${targetUid.slice(0, 8)}_${Date.now()}`;
      const inviteId = crypto.randomBytes(16).toString('hex');
      const expiresAt = new Date(now.getTime() + GHOST_LINK_INVITE_TTL_SECONDS * 1000);

      await db.collection('ghost_link_invites').findOneAndUpdate(
        { inviteId },
        {
          $set: {
            inviteId,
            sessionId,
            ownerUid,
            targetUid,
            sourceCardName,
            sourceCardId,
            callChannel: 'ghost-link-voip',
            callerDisplay: {
              name: caller.name,
              nickname: caller.nickname,
              photoUrl: caller.photoUrl,
            },
            receiverDisplay: {
              name: receiver.name,
              nickname: receiver.nickname,
              photoUrl: receiver.photoUrl,
            },
            status: 'ringing',
            createdAt: now,
            updatedAt: now,
            expiresAt,
          },
        },
        {
          upsert: true,
          returnDocument: 'after',
          includeResultMetadata: false,
        }
      );

      return res.status(200).json({
        ok: true,
        inviteId,
        sessionId,
        engine: 'azure-communication-services',
        callChannel: 'ghost-link-voip',
        sourceCardId,
        sourceCardName,
        callerDisplay: {
          name: caller.name,
          nickname: caller.nickname,
          photoUrl: caller.photoUrl,
          sourceCardName,
        },
        receiverDisplay: {
          name: receiver.name,
          nickname: receiver.nickname,
          photoUrl: receiver.photoUrl,
          sourceCardName,
        },
      });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
  });

  router.get('/voip/ghost-link/incoming', async (req, res) => {
    try {
      const authUid = String(req.auth?.sub || '').trim();
      const ownerUid = String(req.query?.ownerUid || authUid || '').trim();

      if (!ownerUid) {
        return res.status(400).json({ ok: false, error: 'ownerUid is required' });
      }
      if (authUid && authUid !== ownerUid) {
        return res.status(403).json({ ok: false, error: 'Forbidden: ownerUid does not match authenticated user' });
      }

      const db = await storage.connect();
      const now = new Date();

      const invite = await db.collection('ghost_link_invites').findOne(
        {
          targetUid: ownerUid,
          status: 'ringing',
          expiresAt: { $gt: now },
        },
        {
          sort: { createdAt: -1 },
          projection: {
            inviteId: 1,
            sessionId: 1,
            ownerUid: 1,
            targetUid: 1,
            sourceCardName: 1,
            sourceCardId: 1,
            callChannel: 1,
            callerDisplay: 1,
            receiverDisplay: 1,
            createdAt: 1,
            updatedAt: 1,
            expiresAt: 1,
          },
        }
      );

      if (!invite) {
        return res.status(200).json({ ok: true, ownerUid, invite: null });
      }

      return res.status(200).json({
        ok: true,
        ownerUid,
        invite: {
          inviteId: String(invite.inviteId || ''),
          sessionId: String(invite.sessionId || ''),
          ownerUid: String(invite.ownerUid || ''),
          targetUid: String(invite.targetUid || ''),
          sourceCardName: String(invite.sourceCardName || 'Tarjeta Social'),
          sourceCardId: normalizeString(invite.sourceCardId, null),
          callChannel: 'ghost-link-voip',
          callerDisplay: {
            name: String(invite?.callerDisplay?.name || 'Contacto'),
            nickname: String(invite?.callerDisplay?.nickname || 'user'),
            photoUrl: normalizeString(invite?.callerDisplay?.photoUrl, null),
          },
          receiverDisplay: {
            name: String(invite?.receiverDisplay?.name || 'Contacto'),
            nickname: String(invite?.receiverDisplay?.nickname || 'user'),
            photoUrl: normalizeString(invite?.receiverDisplay?.photoUrl, null),
          },
          createdAt: invite.createdAt ? new Date(invite.createdAt).toISOString() : null,
          updatedAt: invite.updatedAt ? new Date(invite.updatedAt).toISOString() : null,
          expiresAt: invite.expiresAt ? new Date(invite.expiresAt).toISOString() : null,
        },
      });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
  });

  router.post('/voip/ghost-link/respond', async (req, res) => {
    try {
      const authUid = String(req.auth?.sub || '').trim();
      const ownerUid = String(req.body?.ownerUid || authUid || '').trim();
      const inviteId = String(req.body?.inviteId || '').trim();
      const action = String(req.body?.action || '').trim().toLowerCase();

      if (!ownerUid || !inviteId || !action) {
        return res.status(400).json({ ok: false, error: 'ownerUid, inviteId y action son requeridos' });
      }
      if (authUid && authUid !== ownerUid) {
        return res.status(403).json({ ok: false, error: 'Forbidden: ownerUid does not match authenticated user' });
      }
      if (!['accept', 'reject', 'end'].includes(action)) {
        return res.status(400).json({ ok: false, error: 'action must be accept|reject|end' });
      }

      const db = await storage.connect();
      const now = new Date();

      let filter = null;
      let nextStatus = null;

      if (action === 'accept') {
        filter = {
          inviteId,
          targetUid: ownerUid,
          status: 'ringing',
          expiresAt: { $gt: now },
        };
        nextStatus = 'accepted';
      } else if (action === 'reject') {
        filter = {
          inviteId,
          targetUid: ownerUid,
          status: 'ringing',
        };
        nextStatus = 'rejected';
      } else {
        filter = {
          inviteId,
          $or: [{ ownerUid }, { targetUid: ownerUid }],
          status: { $in: ['ringing', 'accepted'] },
        };
        nextStatus = 'ended';
      }

      const updated = await db.collection('ghost_link_invites').findOneAndUpdate(
        filter,
        {
          $set: {
            status: nextStatus,
            updatedAt: now,
            respondedByUid: ownerUid,
            respondedAt: now,
            acceptedAt: action === 'accept' ? now : null,
            rejectedAt: action === 'reject' ? now : null,
            endedAt: action === 'end' ? now : null,
          },
        },
        {
          returnDocument: 'after',
          includeResultMetadata: false,
        }
      );

      if (!updated) {
        return res.status(404).json({ ok: false, error: 'Invite not found or already handled' });
      }

      return res.status(200).json({
        ok: true,
        ownerUid,
        inviteId,
        status: String(updated.status || nextStatus),
      });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
  });

  router.post('/issue', async (req, res) => {
    try {
      const ownerUid = String(req.body?.ownerUid || req.auth?.sub || '').trim();
      const cardId = String(req.body?.cardId || '').trim();

      if (!ownerUid) {
        return res.status(400).json({ ok: false, error: 'ownerUid is required' });
      }
      if (!cardId) {
        return res.status(400).json({ ok: false, error: 'cardId is required' });
      }

      const now = new Date();
      const expiresAt = new Date(now.getTime() + QR_TTL_SECONDS * 1000);
      const token = crypto.randomBytes(24).toString('hex');

      const db = await storage.connect();
      await db.collection('qr_tokens').insertOne({
        token,
        cardId,
        ownerUid,
        status: 'unused',
        oneTime: true,
        createdAt: now,
        expiresAt,
        scannedAt: null,
        scannedByUid: null,
        sharePermissionId: null,
      });

      return res.status(201).json({
        ok: true,
        token,
        ttlSec: QR_TTL_SECONDS,
        expiresAt: expiresAt.toISOString(),
      });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
  });

  router.post('/consume', async (req, res) => {
    try {
      const receiverUid = String(req.body?.receiverUid || req.auth?.sub || '').trim();
      const token = String(req.body?.token || '').trim();

      if (!receiverUid) {
        return res.status(400).json({ ok: false, error: 'receiverUid is required' });
      }
      if (!token) {
        return res.status(400).json({ ok: false, error: 'token is required' });
      }

      const db = await storage.connect();
      const now = new Date();

      const tokenDoc = await db.collection('qr_tokens').findOne(
        { token },
        {
          projection: {
            ownerUid: 1,
            cardId: 1,
            status: 1,
            expiresAt: 1,
          },
        }
      );
      if (!tokenDoc) {
        return res.status(410).json({ ok: false, error: 'Token expired, revoked or already consumed' });
      }

      const ownerUidFromToken = String(tokenDoc.ownerUid || '').trim();
      if (!ownerUidFromToken) {
        return res.status(400).json({ ok: false, error: 'Token payload is invalid' });
      }

      const relationKey = buildRelationKey(ownerUidFromToken, receiverUid);
      const blocked = await db.collection('blocked_relations').findOne({ relationKey });
      if (blocked) {
        return res.status(403).json({ ok: false, error: 'Access denied: blocked relationship' });
      }

      const consumed = await db.collection('qr_tokens').findOneAndUpdate(
        {
          token,
          status: 'unused',
          expiresAt: { $gt: now },
        },
        {
          $set: {
            status: 'scanned',
            scannedAt: now,
            scannedByUid: receiverUid,
          },
        },
        {
          returnDocument: 'after',
          includeResultMetadata: false,
        }
      );

      const qrToken = consumed;
      if (!qrToken) {
        return res.status(410).json({ ok: false, error: 'Token expired, revoked or already consumed' });
      }

      const ownerUid = String(qrToken.ownerUid || '').trim();
      const cardId = String(qrToken.cardId || '').trim();
      if (!ownerUid || !cardId) {
        return res.status(400).json({ ok: false, error: 'Token payload is invalid' });
      }

      const permissionResult = await db.collection('share_permissions').findOneAndUpdate(
        {
          ownerUid,
          targetUid: receiverUid,
          cardId,
        },
        {
          $set: {
            scope: 'view',
            isRevoked: false,
            revokedAt: null,
            expiresAt: null,
          },
          $setOnInsert: {
            createdAt: now,
          },
        },
        {
          upsert: true,
          returnDocument: 'after',
          includeResultMetadata: false,
        }
      );

      await db.collection('qr_tokens').updateOne(
        { _id: qrToken._id },
        { $set: { sharePermissionId: permissionResult?._id || null } }
      );

      return res.status(200).json({
        ok: true,
        ownerUid,
        receiverUid,
        cardId,
        shareGranted: true,
      });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
  });

  router.get('/user/:uid/premium-status', async (req, res) => {
    try {
      const requestedUid = String(req.params?.uid || '').trim();
      if (!requestedUid) return res.status(400).json({ ok: false, error: 'uid required' });
      const db = await storage.connect();
      const userDoc = await db.collection('users').findOne({ uid: requestedUid }, { projection: { isPremium: 1, subscriptionExpiresAt: 1, subscriptionStatus: 1 } });
      if (!userDoc) return res.status(404).json({ ok: false, error: 'User not found' });
      const now = new Date();
      const expiresAt = userDoc.subscriptionExpiresAt ? new Date(userDoc.subscriptionExpiresAt) : null;
      const isPremium = Boolean(userDoc.isPremium) && (!expiresAt || expiresAt > now);
      return res.status(200).json({ ok: true, uid: requestedUid, isPremium, subscriptionStatus: userDoc.subscriptionStatus || 'free', expiresAt: expiresAt ? expiresAt.toISOString() : null });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
  });

  router.get('/cards', async (req, res) => {
    try {
      const authUid = String(req.auth?.sub || '').trim();
      const ownerUid = String(req.query?.ownerUid || authUid || '').trim();
      if (!ownerUid) {
        return res.status(400).json({ ok: false, error: 'ownerUid is required' });
      }
      if (authUid && authUid !== ownerUid) {
        return res.status(403).json({ ok: false, error: 'Forbidden: ownerUid does not match authenticated user' });
      }

      const db = await storage.connect();
      const cards = await db.collection('smart_cards').find(
        { ownerUid },
        { sort: { updatedAt: -1 } }
      ).toArray();

      return res.status(200).json({
        ok: true,
        cards: cards.map((card) => ({
          cardId: String(card.cardId || card._id || ''),
          name: String(card.name || 'Smart Card'),
          layout: String(card.layout || 'vertical') === 'horizontal' ? 'horizontal' : 'vertical',
          themeId: card.themeId || null,
          fontId: card.fontId || null,
          fontName: card.fontName || null,
          fontFamily: card.fontFamily || null,
          fontTier: card.fontTier || null,
          wallpaperId: card.wallpaperId || null,
          wallpaperUrl: card.wallpaperUrl || null,
          wallpaperThumbUrl: card.wallpaperThumbUrl || null,
          wallpaperTier: card.wallpaperTier || null,
          wallpaperPriceCredits: Number(card.wallpaperPriceCredits || 0),
          enableParallax: Boolean(card.enableParallax),
          isFavorite: Boolean(card.isFavorite),
          itemIds: Array.isArray(card.itemIds) ? card.itemIds : [],
          holdersCount: Number(card.holdersCount || 0),
          ratingAvg: Number(card.ratingAvg || 5),
          ownerNickname: card.ownerNickname || null,
          ownerPhotoUrl: card.ownerPhotoUrl || null,
          createdAt: card.createdAt ? new Date(card.createdAt).toISOString() : new Date().toISOString(),
          updatedAt: card.updatedAt ? new Date(card.updatedAt).toISOString() : new Date().toISOString(),
        })),
      });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
  });

  router.put('/cards/:cardId', async (req, res) => {
    try {
      const authUid = String(req.auth?.sub || '').trim();
      const ownerUid = String(req.body?.ownerUid || authUid || '').trim();
      const cardId = String(req.params?.cardId || req.body?.cardId || '').trim();

      if (!ownerUid || !cardId) {
        return res.status(400).json({ ok: false, error: 'ownerUid and cardId are required' });
      }
      if (authUid && authUid !== ownerUid) {
        return res.status(403).json({ ok: false, error: 'Forbidden: ownerUid does not match authenticated user' });
      }

      const now = new Date();
      const db = await storage.connect();

      await db.collection('smart_cards').findOneAndUpdate(
        { ownerUid, cardId },
        {
          $set: {
            name: String(req.body?.name || 'Smart Card').trim(),
            layout: String(req.body?.layout || 'vertical') === 'horizontal' ? 'horizontal' : 'vertical',
            themeId: req.body?.themeId ? String(req.body.themeId) : null,
            fontId: req.body?.fontId ? String(req.body.fontId) : null,
            fontName: req.body?.fontName ? String(req.body.fontName) : null,
            fontFamily: req.body?.fontFamily ? String(req.body.fontFamily) : null,
            fontTier: String(req.body?.fontTier || '') === 'premium' ? 'premium' : String(req.body?.fontTier || '') === 'free' ? 'free' : null,
            wallpaperId: req.body?.wallpaperId ? String(req.body.wallpaperId) : null,
            wallpaperUrl: req.body?.wallpaperUrl ? String(req.body.wallpaperUrl) : null,
            wallpaperThumbUrl: req.body?.wallpaperThumbUrl ? String(req.body.wallpaperThumbUrl) : null,
            wallpaperTier: String(req.body?.wallpaperTier || '') === 'premium' ? 'premium' : String(req.body?.wallpaperTier || '') === 'free' ? 'free' : null,
            wallpaperPriceCredits: Number(req.body?.wallpaperPriceCredits || 0),
            enableParallax: Boolean(req.body?.enableParallax),
            isFavorite: Boolean(req.body?.isFavorite),
            itemIds: Array.isArray(req.body?.itemIds) ? req.body.itemIds.map((id) => String(id)) : [],
            holdersCount: Number(req.body?.holdersCount || 0),
            ratingAvg: Number(req.body?.ratingAvg || 5),
            ownerNickname: req.body?.ownerNickname ? String(req.body.ownerNickname) : null,
            ownerPhotoUrl: req.body?.ownerPhotoUrl ? String(req.body.ownerPhotoUrl) : null,
            updatedAt: now,
          },
          $setOnInsert: {
            ownerUid,
            cardId,
            createdAt: now,
          },
        },
        {
          upsert: true,
          returnDocument: 'after',
          includeResultMetadata: false,
        }
      );

      return res.status(200).json({ ok: true, ownerUid, cardId });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
  });

  router.delete('/cards/:cardId', async (req, res) => {
    try {
      const authUid = String(req.auth?.sub || '').trim();
      const ownerUid = String(req.body?.ownerUid || req.query?.ownerUid || authUid || '').trim();
      const cardId = String(req.params?.cardId || '').trim();

      if (!ownerUid || !cardId) {
        return res.status(400).json({ ok: false, error: 'ownerUid and cardId are required' });
      }
      if (authUid && authUid !== ownerUid) {
        return res.status(403).json({ ok: false, error: 'Forbidden: ownerUid does not match authenticated user' });
      }

      const db = await storage.connect();
      const deleted = await db.collection('smart_cards').deleteOne({ ownerUid, cardId });

      await db.collection('share_permissions').deleteMany({ ownerUid, cardId });

      return res.status(200).json({ ok: true, ownerUid, cardId, deleted: Number(deleted?.deletedCount || 0) > 0 });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
  });

  router.get('/contacts/received', async (req, res) => {
    try {
      const authUid = String(req.auth?.sub || '').trim();
      const ownerUid = String(req.query?.ownerUid || authUid || '').trim();
      if (!ownerUid) {
        return res.status(400).json({ ok: false, error: 'ownerUid is required' });
      }
      if (authUid && authUid !== ownerUid) {
        return res.status(403).json({ ok: false, error: 'Forbidden: ownerUid does not match authenticated user' });
      }

      const db = await storage.connect();
      const now = new Date();

      const perms = await db.collection('share_permissions').find(
        {
          targetUid: ownerUid,
          isRevoked: { $ne: true },
          $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }, { expiresAt: { $exists: false } }],
        },
        { projection: { ownerUid: 1, cardId: 1, createdAt: 1 } }
      ).toArray();

      const latestPermByOwner = new Map();
      for (const row of perms) {
        const sourceUid = String(row.ownerUid || '').trim();
        if (!sourceUid) {
          continue;
        }
        const rowDate = row.createdAt ? new Date(row.createdAt) : new Date(0);
        const prev = latestPermByOwner.get(sourceUid);
        if (!prev || rowDate.getTime() > prev.createdAt.getTime()) {
          latestPermByOwner.set(sourceUid, {
            ownerUid: sourceUid,
            cardId: String(row.cardId || '').trim() || null,
            createdAt: rowDate,
          });
        }
      }

      const ownerUids = Array.from(latestPermByOwner.keys());
      const activeStories = await db.collection('story_states').find(
        {
          ownerUid: { $in: ownerUids },
          expiresAt: { $gt: now },
        },
        {
          projection: {
            ownerUid: 1,
            state: 1,
            expiresAt: 1,
          },
        }
      ).toArray();

      const storyByOwner = new Map();
      for (const row of activeStories) {
        const uid = String(row.ownerUid || '').trim();
        if (!uid) {
          continue;
        }
        const state = String(row.state || 'none');
        if (state === 'normal' || state === 'vip') {
          storyByOwner.set(uid, state);
        }
      }

      const contacts = [];
      for (const uid of ownerUids) {
        const permMeta = latestPermByOwner.get(uid) || null;
        const profile = await resolveUserProfile(db, uid);
        let cardName = 'Tarjeta Social';
        let holdersCount = 0;
        let avg = 5;

        if (permMeta?.cardId) {
          const cardDoc = await db.collection('smart_cards').findOne(
            {
              ownerUid: uid,
              cardId: permMeta.cardId,
            },
            {
              projection: {
                name: 1,
                holdersCount: 1,
                ratingAvg: 1,
              },
            }
          );

          if (cardDoc) {
            cardName = String(cardDoc.name || 'Tarjeta Social');
            holdersCount = Number(cardDoc.holdersCount || 0);
            avg = Number(cardDoc.ratingAvg || 5);
          }
        }

        if (!Number.isFinite(avg) || avg <= 0) {
          const ratingAgg = await db.collection('smart_cards').aggregate([
            { $match: { ownerUid: uid } },
            { $group: { _id: null, avg: { $avg: '$ratingAvg' } } },
          ]).toArray();
          avg = Number(ratingAgg?.[0]?.avg || 5);
        }

        contacts.push({
          uid,
          name: profile.name,
          nickname: profile.name.toLowerCase().replace(/\s+/g, '_'),
          photoUrl: profile.photoUrl,
          ratingAvg: Number.isFinite(avg) ? avg : 5,
          cardName,
          holdersCount,
          addedAt: permMeta?.createdAt ? permMeta.createdAt.toISOString() : null,
          storyState: storyByOwner.get(uid) || 'none',
        });
      }

      return res.status(200).json({ ok: true, ownerUid, count: contacts.length, contacts });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
  });

  router.post('/relationships/remove', async (req, res) => {
    try {
      const authUid = String(req.auth?.sub || '').trim();
      const ownerUid = String(req.body?.ownerUid || authUid || '').trim();
      const targetUid = String(req.body?.targetUid || '').trim();

      if (!ownerUid || !targetUid) {
        return res.status(400).json({ ok: false, error: 'ownerUid and targetUid are required' });
      }
      if (authUid && authUid !== ownerUid) {
        return res.status(403).json({ ok: false, error: 'Forbidden: ownerUid does not match authenticated user' });
      }

      const db = await storage.connect();
      const deleted = await db.collection('share_permissions').deleteMany({
        $or: [
          { ownerUid, targetUid },
          { ownerUid: targetUid, targetUid: ownerUid },
        ],
      });

      return res.status(200).json({
        ok: true,
        ownerUid,
        targetUid,
        deletedLinks: Number(deleted?.deletedCount || 0),
      });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
  });

  router.post('/stories/state', async (req, res) => {
    try {
      const authUid = String(req.auth?.sub || '').trim();
      const ownerUid = String(req.body?.ownerUid || authUid || '').trim();
      const incomingState = String(req.body?.state || 'none').trim().toLowerCase();
      const incomingPaidExternal = req.body?.isPaidExternal === true;
      const incomingSourceRaw = normalizeString(req.body?.vipSource, 'manual');
      const vipSource = ['manual', 'subscription', 'external_partner'].includes(incomingSourceRaw) ? incomingSourceRaw : 'manual';
      const paidChannel = normalizeString(req.body?.paidChannel, null);
      const manualReason = normalizeString(req.body?.manualReason, null);

      if (!ownerUid) {
        return res.status(400).json({ ok: false, error: 'ownerUid is required' });
      }
      if (authUid && authUid !== ownerUid) {
        return res.status(403).json({ ok: false, error: 'Forbidden: ownerUid does not match authenticated user' });
      }
      if (!['none', 'normal', 'vip'].includes(incomingState)) {
        return res.status(400).json({ ok: false, error: 'state must be one of none|normal|vip' });
      }

      const db = await storage.connect();
      const now = new Date();

      if (incomingState === 'none') {
        await db.collection('story_states').deleteOne({ ownerUid });
        return res.status(200).json({ ok: true, ownerUid, state: 'none', expiresAt: null });
      }

      const expiresAt = incomingState === 'vip'
        ? new Date(now.getTime() + STORY_VIP_TTL_DAYS * 24 * 60 * 60 * 1000)
        : new Date(now.getTime() + STORY_NORMAL_TTL_HOURS * 60 * 60 * 1000);

      await db.collection('story_states').findOneAndUpdate(
        { ownerUid },
        {
          $set: {
            ownerUid,
            state: incomingState,
            isPaidExternal: incomingState === 'vip' ? incomingPaidExternal : false,
            vipSource: incomingState === 'vip' ? vipSource : 'manual',
            paidChannel: incomingState === 'vip' ? paidChannel : null,
            manualReason: incomingState === 'vip' ? manualReason : null,
            externalPaidAt: incomingState === 'vip' && incomingPaidExternal ? now : null,
            activatedByUid: authUid || ownerUid,
            expiresAt,
            updatedAt: now,
          },
          $setOnInsert: {
            createdAt: now,
          },
        },
        {
          upsert: true,
          returnDocument: 'after',
          includeResultMetadata: false,
        }
      );

      return res.status(200).json({
        ok: true,
        ownerUid,
        state: incomingState,
        expiresAt: expiresAt.toISOString(),
        isPaidExternal: incomingState === 'vip' ? incomingPaidExternal : false,
        vipSource: incomingState === 'vip' ? vipSource : null,
        paidChannel: incomingState === 'vip' ? paidChannel : null,
      });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
  });

  router.post('/stories/vip/manual', async (req, res) => {
    try {
      const authUid = String(req.auth?.sub || '').trim();
      const ownerUid = String(req.body?.ownerUid || '').trim();
      const paidChannel = normalizeString(req.body?.paidChannel, 'offline_partner');
      const manualReason = normalizeString(req.body?.manualReason, 'Pago confirmado fuera de app');
      const isPaidExternal = req.body?.isPaidExternal !== false;
      const vipDaysInput = Number(req.body?.vipDays || STORY_VIP_TTL_DAYS);
      const vipDays = Number.isFinite(vipDaysInput) ? Math.max(1, Math.min(30, Math.floor(vipDaysInput))) : STORY_VIP_TTL_DAYS;

      if (!ownerUid) {
        return res.status(400).json({ ok: false, error: 'ownerUid is required' });
      }

      const db = await storage.connect();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + vipDays * 24 * 60 * 60 * 1000);

      await db.collection('story_states').findOneAndUpdate(
        { ownerUid },
        {
          $set: {
            ownerUid,
            state: 'vip',
            isPaidExternal,
            vipSource: isPaidExternal ? 'external_partner' : 'manual',
            paidChannel,
            manualReason,
            externalPaidAt: isPaidExternal ? now : null,
            activatedByUid: authUid || 'backend_manual',
            expiresAt,
            updatedAt: now,
          },
          $setOnInsert: {
            createdAt: now,
          },
        },
        {
          upsert: true,
          returnDocument: 'after',
          includeResultMetadata: false,
        }
      );

      return res.status(200).json({
        ok: true,
        ownerUid,
        state: 'vip',
        vipDays,
        isPaidExternal,
        vipSource: isPaidExternal ? 'external_partner' : 'manual',
        paidChannel,
        expiresAt: expiresAt.toISOString(),
      });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
  });

  router.get('/stories/state', async (req, res) => {
    try {
      const authUid = String(req.auth?.sub || '').trim();
      const ownerUid = String(req.query?.ownerUid || authUid || '').trim();

      if (!ownerUid) {
        return res.status(400).json({ ok: false, error: 'ownerUid is required' });
      }
      if (authUid && authUid !== ownerUid) {
        return res.status(403).json({ ok: false, error: 'Forbidden: ownerUid does not match authenticated user' });
      }

      const db = await storage.connect();
      const now = new Date();
      const row = await db.collection('story_states').findOne({ ownerUid });

      if (!row || !row.expiresAt || new Date(row.expiresAt).getTime() <= now.getTime()) {
        return res.status(200).json({ ok: true, ownerUid, state: 'none', expiresAt: null });
      }

      const state = String(row.state || 'none');
      return res.status(200).json({
        ok: true,
        ownerUid,
        state: state === 'vip' ? 'vip' : state === 'normal' ? 'normal' : 'none',
        expiresAt: new Date(row.expiresAt).toISOString(),
        isPaidExternal: Boolean(row.isPaidExternal),
        vipSource: normalizeString(row.vipSource, null),
        paidChannel: normalizeString(row.paidChannel, null),
      });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
  });

  router.get('/stories/ads/house', async (req, res) => {
    try {
      const authUid = String(req.auth?.sub || '').trim();
      const ownerUid = String(req.query?.ownerUid || authUid || '').trim();

      if (!ownerUid) {
        return res.status(400).json({ ok: false, error: 'ownerUid is required' });
      }
      if (authUid && authUid !== ownerUid) {
        return res.status(403).json({ ok: false, error: 'Forbidden: ownerUid does not match authenticated user' });
      }

      const db = await storage.connect();
      const row = await db.collection('stories_house_ads').findOne({ ownerUid, isActive: true });

      if (!row) {
        return res.status(200).json({ ok: true, ownerUid, ad: null });
      }

      return res.status(200).json({
        ok: true,
        ownerUid,
        ad: {
          title: normalizeString(row.title, 'Mi Sueno Mexicano'),
          subtitle: normalizeString(row.subtitle, 'Casa destacada en tu zona'),
          priceLabel: normalizeString(row.priceLabel, '$0 MXN'),
          locationLabel: normalizeString(row.locationLabel, 'Ubicacion no disponible'),
          photoUrl: normalizeString(row.photoUrl, null),
          ctaLabel: normalizeString(row.ctaLabel, 'Ver propiedad'),
          ctaUrl: normalizeString(row.ctaUrl, null),
          updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : new Date().toISOString(),
        },
      });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
  });

  router.put('/stories/ads/house', async (req, res) => {
    try {
      const authUid = String(req.auth?.sub || '').trim();
      const ownerUid = String(req.body?.ownerUid || authUid || '').trim();

      if (!ownerUid) {
        return res.status(400).json({ ok: false, error: 'ownerUid is required' });
      }
      if (authUid && authUid !== ownerUid) {
        return res.status(403).json({ ok: false, error: 'Forbidden: ownerUid does not match authenticated user' });
      }

      const db = await storage.connect();
      const now = new Date();

      await db.collection('stories_house_ads').findOneAndUpdate(
        { ownerUid },
        {
          $set: {
            ownerUid,
            title: normalizeString(req.body?.title, 'Mi Sueno Mexicano'),
            subtitle: normalizeString(req.body?.subtitle, null),
            priceLabel: normalizeString(req.body?.priceLabel, '$0 MXN'),
            locationLabel: normalizeString(req.body?.locationLabel, 'Ubicacion no disponible'),
            photoUrl: normalizeString(req.body?.photoUrl, null),
            ctaLabel: normalizeString(req.body?.ctaLabel, 'Ver propiedad'),
            ctaUrl: normalizeString(req.body?.ctaUrl, null),
            isActive: req.body?.isActive !== false,
            updatedAt: now,
          },
          $setOnInsert: {
            createdAt: now,
          },
        },
        {
          upsert: true,
          returnDocument: 'after',
          includeResultMetadata: false,
        }
      );

      return res.status(200).json({ ok: true, ownerUid });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
  });

  router.get('/cards/:cardId/subscribers', async (req, res) => {
    try {
      const authUid = String(req.auth?.sub || '').trim();
      const ownerUid = String(req.query?.ownerUid || authUid || '').trim();
      const cardId = String(req.params?.cardId || '').trim();

      if (!ownerUid) {
        return res.status(400).json({ ok: false, error: 'ownerUid is required' });
      }
      if (!cardId) {
        return res.status(400).json({ ok: false, error: 'cardId is required' });
      }
      if (authUid && authUid !== ownerUid) {
        return res.status(403).json({ ok: false, error: 'Forbidden: ownerUid does not match authenticated user' });
      }

      const db = await storage.connect();
      const now = new Date();

      const permissions = await db.collection('share_permissions').find(
        {
          ownerUid,
          cardId,
          isRevoked: { $ne: true },
          $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }, { expiresAt: { $exists: false } }],
        },
        { projection: { targetUid: 1 } }
      ).toArray();

      const subscriberUids = Array.from(new Set(permissions.map((p) => String(p.targetUid || '').trim()).filter(Boolean)));
      const amixesCursor = await db.collection('share_permissions').find(
        {
          ownerUid: { $in: subscriberUids },
          targetUid: ownerUid,
          isRevoked: { $ne: true },
          $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }, { expiresAt: { $exists: false } }],
        },
        { projection: { ownerUid: 1 } }
      ).toArray();
      const amixesSet = new Set(amixesCursor.map((row) => String(row.ownerUid || '').trim()));

      const subscribers = [];
      for (const uid of subscriberUids) {
        const profile = await resolveUserProfile(db, uid);
        subscribers.push({
          uid,
          name: profile.name,
          photoUrl: profile.photoUrl,
          isAmixes: amixesSet.has(uid),
        });
      }

      return res.status(200).json({
        ok: true,
        ownerUid,
        cardId,
        count: subscribers.length,
        subscribers,
      });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
  });

  router.delete('/cards/:cardId/subscribers/:targetUid', async (req, res) => {
    try {
      const authUid = String(req.auth?.sub || '').trim();
      const ownerUid = String(req.body?.ownerUid || req.query?.ownerUid || authUid || '').trim();
      const cardId = String(req.params?.cardId || '').trim();
      const targetUid = String(req.params?.targetUid || req.body?.targetUid || '').trim();

      if (!ownerUid || !cardId || !targetUid) {
        return res.status(400).json({ ok: false, error: 'ownerUid, cardId and targetUid are required' });
      }
      if (authUid && authUid !== ownerUid) {
        return res.status(403).json({ ok: false, error: 'Forbidden: ownerUid does not match authenticated user' });
      }

      const db = await storage.connect();
      const deleted = await db.collection('share_permissions').deleteMany({
        ownerUid,
        targetUid,
        cardId,
      });

      return res.status(200).json({
        ok: true,
        ownerUid,
        targetUid,
        cardId,
        deletedCount: Number(deleted?.deletedCount || 0),
      });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
  });

  router.post('/relationships/block', async (req, res) => {
    try {
      const authUid = String(req.auth?.sub || '').trim();
      const ownerUid = String(req.body?.ownerUid || authUid || '').trim();
      const targetUid = String(req.body?.targetUid || '').trim();

      if (!ownerUid || !targetUid) {
        return res.status(400).json({ ok: false, error: 'ownerUid and targetUid are required' });
      }
      if (authUid && authUid !== ownerUid) {
        return res.status(403).json({ ok: false, error: 'Forbidden: ownerUid does not match authenticated user' });
      }

      const db = await storage.connect();
      const deleted = await db.collection('share_permissions').deleteMany({
        $or: [
          { ownerUid, targetUid },
          { ownerUid: targetUid, targetUid: ownerUid },
        ],
      });

      const now = new Date();
      const relationKey = buildRelationKey(ownerUid, targetUid);
      await db.collection('blocked_relations').findOneAndUpdate(
        { relationKey },
        {
          $set: {
            relationKey,
            uidA: [ownerUid, targetUid].sort()[0],
            uidB: [ownerUid, targetUid].sort()[1],
            blockedByUid: ownerUid,
            updatedAt: now,
          },
          $setOnInsert: {
            createdAt: now,
          },
        },
        {
          upsert: true,
          returnDocument: 'after',
          includeResultMetadata: false,
        }
      );

      return res.status(200).json({
        ok: true,
        ownerUid,
        targetUid,
        deletedLinks: Number(deleted?.deletedCount || 0),
      });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
  });

  router.get('/relationships/blocked', async (req, res) => {
    try {
      const authUid = String(req.auth?.sub || '').trim();
      const ownerUid = String(req.query?.ownerUid || authUid || '').trim();

      if (!ownerUid) {
        return res.status(400).json({ ok: false, error: 'ownerUid is required' });
      }
      if (authUid && authUid !== ownerUid) {
        return res.status(403).json({ ok: false, error: 'Forbidden: ownerUid does not match authenticated user' });
      }

      const db = await storage.connect();
      const rows = await db.collection('blocked_relations').find(
        {
          $or: [{ uidA: ownerUid }, { uidB: ownerUid }],
        },
        {
          projection: {
            uidA: 1,
            uidB: 1,
            blockedByUid: 1,
            createdAt: 1,
            updatedAt: 1,
          },
          sort: { updatedAt: -1 },
        }
      ).toArray();

      const blockedUsers = [];
      for (const row of rows) {
        const otherUid = String(row.uidA === ownerUid ? row.uidB : row.uidA || '').trim();
        if (!otherUid) {
          continue;
        }
        const profile = await resolveUserProfile(db, otherUid);
        blockedUsers.push({
          uid: otherUid,
          name: profile.name,
          photoUrl: profile.photoUrl,
          blockedByUid: String(row.blockedByUid || ''),
          createdAt: row.createdAt || null,
          blockedAt: row.updatedAt || row.createdAt || null,
        });
      }

      return res.status(200).json({
        ok: true,
        ownerUid,
        count: blockedUsers.length,
        blockedUsers,
      });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
  });

  router.delete('/relationships/blocked/:targetUid', async (req, res) => {
    try {
      const authUid = String(req.auth?.sub || '').trim();
      const ownerUid = String(req.body?.ownerUid || req.query?.ownerUid || authUid || '').trim();
      const targetUid = String(req.params?.targetUid || req.body?.targetUid || '').trim();

      if (!ownerUid || !targetUid) {
        return res.status(400).json({ ok: false, error: 'ownerUid and targetUid are required' });
      }
      if (authUid && authUid !== ownerUid) {
        return res.status(403).json({ ok: false, error: 'Forbidden: ownerUid does not match authenticated user' });
      }

      const db = await storage.connect();
      const relationKey = buildRelationKey(ownerUid, targetUid);
      const deleted = await db.collection('blocked_relations').deleteOne({ relationKey });

      return res.status(200).json({
        ok: true,
        ownerUid,
        targetUid,
        unblocked: Number(deleted?.deletedCount || 0) > 0,
      });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
  });

  router.get('/calls/history', async (req, res) => {
    try {
      const authUid = String(req.auth?.sub || '').trim();
      const ownerUid = String(req.query?.ownerUid || authUid || '').trim();

      if (!ownerUid) {
        return res.status(400).json({ ok: false, error: 'ownerUid is required' });
      }
      if (authUid && authUid !== ownerUid) {
        return res.status(403).json({ ok: false, error: 'Forbidden: ownerUid does not match authenticated user' });
      }

      const db = await storage.connect();
      const now = new Date();

      const rows = await db.collection('call_logs').find(
        { ownerUid },
        {
          projection: {
            callId: 1,
            peerUid: 1,
            sourceCardName: 1,
            sourceCardId: 1,
            callChannel: 1,
            direction: 1,
            status: 1,
            durationSec: 1,
            tags: 1,
            voiceNoteUri: 1,
            voiceNoteName: 1,
            createdAt: 1,
            updatedAt: 1,
          },
          sort: { createdAt: -1 },
        }
      ).toArray();

      const peerUids = Array.from(new Set(rows.map((row) => String(row.peerUid || '').trim()).filter(Boolean)));
      const activeStories = await db.collection('story_states').find(
        {
          ownerUid: { $in: peerUids },
          expiresAt: { $gt: now },
        },
        {
          projection: {
            ownerUid: 1,
            state: 1,
          },
        }
      ).toArray();

      const storyByOwner = new Map();
      for (const story of activeStories) {
        const uid = String(story.ownerUid || '').trim();
        const state = String(story.state || 'none');
        if (!uid) {
          continue;
        }
        if (state === 'normal' || state === 'vip') {
          storyByOwner.set(uid, state);
        }
      }

      const history = [];
      for (const row of rows) {
        const peerUid = String(row.peerUid || '').trim();
        const profile = await resolveUserProfileExtended(db, peerUid);

        history.push({
          callId: String(row.callId || ''),
          peerUid,
          name: profile.name,
          nickname: profile.nickname,
          photoUrl: profile.photoUrl,
          sourceCardName: String(row.sourceCardName || 'Tarjeta Social'),
          sourceCardId: normalizeString(row.sourceCardId, null),
          callChannel: 'ghost-link-voip',
          storyState: storyByOwner.get(peerUid) || 'none',
          direction: String(row.direction || 'incoming'),
          status: String(row.status || 'completed'),
          durationSec: Number(row.durationSec || 0),
          tags: Array.isArray(row.tags) ? row.tags.map((tag) => String(tag)) : [],
          voiceNoteUri: row.voiceNoteUri ? String(row.voiceNoteUri) : null,
          voiceNoteName: row.voiceNoteName ? String(row.voiceNoteName) : null,
          createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : new Date().toISOString(),
          updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : new Date().toISOString(),
        });
      }

      return res.status(200).json({
        ok: true,
        ownerUid,
        count: history.length,
        history,
      });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
  });

  router.post('/calls/logs', async (req, res) => {
    try {
      const authUid = String(req.auth?.sub || '').trim();
      const ownerUid = String(req.body?.ownerUid || authUid || '').trim();
      const peerUid = String(req.body?.peerUid || '').trim();
      const direction = String(req.body?.direction || 'incoming').trim().toLowerCase();
      const status = String(req.body?.status || 'completed').trim().toLowerCase();
      const durationSec = Number(req.body?.durationSec || 0);
      const tags = Array.isArray(req.body?.tags) ? req.body.tags.map((tag) => String(tag).trim()).filter(Boolean) : [];
      const voiceNoteUri = req.body?.voiceNoteUri ? String(req.body.voiceNoteUri).trim() : null;
      const voiceNoteName = req.body?.voiceNoteName ? String(req.body.voiceNoteName).trim() : null;
      const sourceCardName = normalizeString(req.body?.sourceCardName, 'Tarjeta Social');
      const sourceCardId = normalizeString(req.body?.sourceCardId, null);
      const callChannel = 'ghost-link-voip';

      if (!ownerUid || !peerUid) {
        return res.status(400).json({ ok: false, error: 'ownerUid and peerUid are required' });
      }
      if (authUid && authUid !== ownerUid) {
        return res.status(403).json({ ok: false, error: 'Forbidden: ownerUid does not match authenticated user' });
      }
      if (!['incoming', 'outgoing', 'missed'].includes(direction)) {
        return res.status(400).json({ ok: false, error: 'direction must be incoming|outgoing|missed' });
      }
      if (!['completed', 'missed', 'rejected'].includes(status)) {
        return res.status(400).json({ ok: false, error: 'status must be completed|missed|rejected' });
      }

      const db = await storage.connect();
      const now = new Date();
      const callId = `${ownerUid}_${peerUid}_${now.getTime()}`;

      await db.collection('call_logs').insertOne({
        callId,
        ownerUid,
        peerUid,
        direction,
        status,
        durationSec: Number.isFinite(durationSec) ? Math.max(0, Math.floor(durationSec)) : 0,
        tags,
        voiceNoteUri,
        voiceNoteName,
        sourceCardName,
        sourceCardId,
        callChannel,
        createdAt: now,
        updatedAt: now,
      });

      return res.status(201).json({ ok: true, ownerUid, callId });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
  });

  router.patch('/calls/logs/:callId', async (req, res) => {
    try {
      const authUid = String(req.auth?.sub || '').trim();
      const ownerUid = String(req.body?.ownerUid || authUid || '').trim();
      const callId = String(req.params?.callId || req.body?.callId || '').trim();

      if (!ownerUid || !callId) {
        return res.status(400).json({ ok: false, error: 'ownerUid and callId are required' });
      }
      if (authUid && authUid !== ownerUid) {
        return res.status(403).json({ ok: false, error: 'Forbidden: ownerUid does not match authenticated user' });
      }

      const tags = Array.isArray(req.body?.tags)
        ? req.body.tags.map((tag) => String(tag).trim()).filter(Boolean)
        : null;
      const voiceNoteUri = req.body?.voiceNoteUri === null ? null : req.body?.voiceNoteUri ? String(req.body.voiceNoteUri).trim() : undefined;
      const voiceNoteName = req.body?.voiceNoteName === null ? null : req.body?.voiceNoteName ? String(req.body.voiceNoteName).trim() : undefined;

      const $set = {
        updatedAt: new Date(),
      };
      if (tags) {
        $set.tags = tags;
      }
      if (voiceNoteUri !== undefined) {
        $set.voiceNoteUri = voiceNoteUri;
      }
      if (voiceNoteName !== undefined) {
        $set.voiceNoteName = voiceNoteName;
      }

      const db = await storage.connect();
      const updated = await db.collection('call_logs').findOneAndUpdate(
        {
          ownerUid,
          callId,
        },
        {
          $set,
        },
        {
          returnDocument: 'after',
          includeResultMetadata: false,
        }
      );

      if (!updated) {
        return res.status(404).json({ ok: false, error: 'Call log not found' });
      }

      return res.status(200).json({ ok: true, ownerUid, callId });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
  });

  return router;
}

module.exports = {
  createQrRoutes,
};

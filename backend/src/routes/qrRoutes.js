const crypto = require('crypto');
const express = require('express');

const QR_TTL_SECONDS = 120;
/** QR universal web / app link (colección temporary_access). */
const TEMPORARY_ACCESS_TTL_MS = 24 * 60 * 60 * 1000;
const UNIVERSAL_QR_SOURCE = 'qr_scan';
const STORY_NORMAL_TTL_HOURS = 24;
const STORY_VIP_TTL_DAYS = 7;
const GHOST_LINK_INVITE_TTL_SECONDS = 45;

const DEFAULT_BUNKER_GROUPS = ['Random', 'Family', 'Social', 'Work'];

const { buildGhostLinkAgoraInvite } = require('../lib/agoraGhostLink');
const { mergeContactProfileFromCard } = require('../lib/contactIdentityMerge');
const { clientLocaleIsSpanish } = require('../lib/httpRequestLocale');
const { parseAndValidateTemporaryAccess } = require('../lib/temporaryAccessToken');
const { env } = require('../config');

function normalizeString(value, fallback = null) {
  const text = String(value ?? '').trim();
  return text || fallback;
}

/** Facetas para búsqueda en contactos (sin datos tipo teléfono; las envía el cliente). */
function sanitizeSearchFacets(raw) {
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

/**
 * Slots visibles en la vista web pública (sincronizados desde la app).
 * Excluye ítems marcados privados; nunca incluir el vault completo del dispositivo.
 */
function sanitizePublicCardSlots(raw) {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out = [];
  for (const row of raw.slice(0, 24)) {
    if (row?.isPrivate === true || String(row?.visibility || '').toLowerCase() === 'private') {
      continue;
    }
    const itemId = String(row?.itemId || '').trim().slice(0, 120);
    if (!itemId) {
      continue;
    }
    const type = String(row?.type || 'link').trim().slice(0, 64);
    const label = String(row?.label || '').trim().slice(0, 200);
    const value = String(row?.value || '').trim().slice(0, 4000);
    const iconName = String(row?.iconName || '').trim().slice(0, 120);
    const rawIcon = String(row?.icon || '').trim();
    const iconUrl = /^https?:\/\//i.test(rawIcon) ? rawIcon.slice(0, 4000) : null;
    const vaultMimeRaw = String(row?.vaultMimeType || '').trim();
    const vaultMimeType = vaultMimeRaw ? vaultMimeRaw.slice(0, 120) : null;
    const rowOut = {
      itemId,
      type,
      label,
      value,
      iconName: iconName || null,
    };
    if (iconUrl) {
      rowOut.icon = iconUrl;
    }
    if (vaultMimeType) {
      rowOut.vaultMimeType = vaultMimeType;
    }
    out.push(rowOut);
  }
  return out;
}

/**
 * Cuenta receptores activos por tarjeta desde `share_permissions` (no revocados, no expirados).
 * Fuente de verdad para "cuántas personas tienen esta tarjeta"; independiente de `smart_cards.holdersCount`.
 */
async function aggregateActiveReceiverCountByCardId(db, ownerUid, cardIds, now) {
  const ou = String(ownerUid || '').trim();
  const ids = [...new Set((cardIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
  const map = new Map();
  for (const id of ids) {
    map.set(id, 0);
  }
  if (!ou || !ids.length) {
    return map;
  }

  const expiryOr = [
    { expiresAt: null },
    { expiresAt: { $gt: now } },
    { expiresAt: { $exists: false } },
  ];

  const rows = await db.collection('share_permissions').aggregate([
    {
      $match: {
        ownerUid: ou,
        cardId: { $in: ids },
        isRevoked: { $ne: true },
        $or: expiryOr,
      },
    },
    { $group: { _id: '$cardId', n: { $sum: 1 } } },
  ]).toArray();

  for (const row of rows) {
    const cid = String(row?._id || '').trim();
    if (cid) {
      map.set(cid, Number(row.n || 0));
    }
  }
  return map;
}

function getPublicUniversalCardBaseUrl() {
  const base = String(env.publicUniversalCardBaseUrl || 'https://cardsocial.me').trim();
  return base.replace(/\/+$/, '') || 'https://cardsocial.me';
}

/** Claves seguras para `$inc` anidado en `card_analytics` (evita `$` y puntos raros). */
function sanitizeAnalyticsSegmentKey(raw) {
  const s = String(raw || 'unknown')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 64);
  return s || 'unknown';
}

function createQrRoutes({ storage }) {
  const router = express.Router();

  async function fetchLatestCardIdentityDoc(db, ownerUid) {
    const uid = String(ownerUid || '').trim();
    if (!uid) {
      return null;
    }
    return db.collection('smart_cards').findOne(
      { ownerUid: uid },
      {
        sort: { updatedAt: -1 },
        projection: {
          ownerDisplayName: 1,
          ownerNickname: 1,
          ownerPhotoUrl: 1,
          ownerOccupation: 1,
          updatedAt: 1,
        },
      },
    );
  }
  // Cambiar nickname con bloqueo de 30 días
  router.put('/users/:uid/nickname', async (req, res) => {
    try {
      const db = await storage.connect();
      const uid = String(req.params.uid || '').trim();
      const newNickname = String(req.body?.nickname || '').trim();
      if (!uid || !newNickname) {
        return res.status(400).json({ ok: false, error: 'uid y nickname requeridos' });
      }
      // Buscar usuario
      const user = await db.collection('users').findOne({ uid });
      if (!user) {
        return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
      }
      // Validar bloqueo de 30 días
      const now = new Date();
      const lastChange = user.lastUsernameChange ? new Date(user.lastUsernameChange) : null;
      if (lastChange && (now - lastChange) < 30 * 24 * 60 * 60 * 1000) {
        const nextAllowed = new Date(lastChange.getTime() + 30 * 24 * 60 * 60 * 1000);
        return res.status(403).json({ ok: false, error: 'Solo puedes cambiar tu nombre de usuario cada 30 días', nextAllowed });
      }
      // Validar unicidad
      const exists = await db.collection('users').findOne({ nicknameLower: newNickname.toLowerCase() });
      if (exists && String(exists.uid) !== uid) {
        return res.status(409).json({ ok: false, error: 'Ese nombre de usuario ya está en uso' });
      }
      // Actualizar nickname y lastUsernameChange
      await db.collection('users').updateOne(
        { uid },
        {
          $set: {
            nickname: newNickname,
            nicknameLower: newNickname.toLowerCase(),
            lastUsernameChange: now,
            updatedAt: now,
          },
        }
      );
      return res.status(200).json({ ok: true, nickname: newNickname, lastUsernameChange: now });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
  });

  function buildRelationKey(uidA, uidB) {
    return [String(uidA || '').trim(), String(uidB || '').trim()].sort().join('::');
  }

  /**
   * Grafo interno Card-Social: arista A—B si existe share_permission activa
   * (ownerUid=A, targetUid=B). Sin agenda ni datos externos.
   */
  async function buildShareNeighborMap(db, now) {
    const perms = await db.collection('share_permissions').find(
      {
        isRevoked: { $ne: true },
        $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }, { expiresAt: { $exists: false } }],
      },
      { projection: { ownerUid: 1, targetUid: 1 } }
    ).toArray();

    const neighbors = new Map();
    const addEdge = (a, b) => {
      const x = String(a || '').trim();
      const y = String(b || '').trim();
      if (!x || !y || x === y) {
        return;
      }
      if (!neighbors.has(x)) neighbors.set(x, new Set());
      if (!neighbors.has(y)) neighbors.set(y, new Set());
      neighbors.get(x).add(y);
      neighbors.get(y).add(x);
    };
    for (const p of perms) {
      addEdge(p.ownerUid, p.targetUid);
    }
    return neighbors;
  }

  function mutualNeighborUids(neighbors, uidA, uidB) {
    const sa = neighbors.get(uidA);
    const sb = neighbors.get(uidB);
    if (!sa || !sb) {
      return [];
    }
    const out = [];
    const iter = sa.size <= sb.size ? sa : sb;
    const other = sa.size <= sb.size ? sb : sa;
    for (const u of iter) {
      if (u === uidA || u === uidB) {
        continue;
      }
      if (other.has(u)) {
        out.push(u);
      }
    }
    out.sort();
    return out;
  }

  async function purgeInteractionForBlock(db, uidA, uidB) {
    await db.collection('ghost_link_invites').deleteMany({
      $or: [
        { ownerUid: uidA, targetUid: uidB },
        { ownerUid: uidB, targetUid: uidA },
      ],
    });
    await db.collection('call_logs').deleteMany({
      $or: [
        { ownerUid: uidA, peerUid: uidB },
        { ownerUid: uidB, peerUid: uidA },
      ],
    });
    await db.collection('card_subscriber_mutes').deleteMany({
      $or: [
        { ownerUid: uidA, targetUid: uidB },
        { ownerUid: uidB, targetUid: uidA },
      ],
    });
    // Chats: enlazar aquí cuando exista colección de mensajes.
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

      let caller = await resolveUserProfileExtended(db, ownerUid);
      let receiver = await resolveUserProfileExtended(db, targetUid);
      const callerCard = await fetchLatestCardIdentityDoc(db, ownerUid);
      const receiverCard = await fetchLatestCardIdentityDoc(db, targetUid);
      caller = mergeContactProfileFromCard(caller, ownerUid, callerCard);
      receiver = mergeContactProfileFromCard(receiver, targetUid, receiverCard);

      const now = new Date();
      const sessionId = `acs_${ownerUid.slice(0, 8)}_${targetUid.slice(0, 8)}_${Date.now()}`;
      const inviteId = crypto.randomBytes(16).toString('hex');
      const expiresAt = new Date(now.getTime() + GHOST_LINK_INVITE_TTL_SECONDS * 1000);
      const agoraChannelName = `gl_${inviteId}`;
      const agoraInvite = buildGhostLinkAgoraInvite({
        ownerUid,
        targetUid,
        channelName: agoraChannelName,
        ttlSeconds: GHOST_LINK_INVITE_TTL_SECONDS,
      });

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
            ...(agoraInvite ? { agora: agoraInvite } : {}),
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
        engine: agoraInvite ? 'agora' : 'signaling-only',
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
        ...(agoraInvite
          ? {
              agora: {
                appId: agoraInvite.appId,
                channelName: agoraInvite.channelName,
                token: agoraInvite.callerToken,
                uid: agoraInvite.callerUid,
              },
            }
          : {}),
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
            agora: 1,
          },
        }
      );

      if (!invite) {
        return res.status(200).json({ ok: true, ownerUid, invite: null });
      }

      const agoraCallee =
        invite.agora && invite.agora.appId && invite.agora.calleeToken
          ? {
              appId: String(invite.agora.appId),
              channelName: String(invite.agora.channelName || ''),
              token: String(invite.agora.calleeToken),
              uid: Number(invite.agora.calleeUid),
            }
          : null;

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
          ...(agoraCallee ? { agora: agoraCallee } : {}),
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

  /**
   * Enlace universal TTL 24h para QR marketing (web + Universal Link).
   * URL: {PUBLIC_UNIVERSAL_CARD_BASE_URL}/u/{token}?source=qr_scan
   * Alias: POST /universal-link/issue (mismo cuerpo).
   */
  async function issueTemporaryUniversalAccessRoute(req, res) {
    try {
      const ownerUid = String(req.body?.ownerUid || req.auth?.sub || '').trim();
      const cardId = String(req.body?.cardId || '').trim();

      if (!ownerUid) {
        return res.status(400).json({ ok: false, error: 'ownerUid is required' });
      }
      if (!cardId) {
        return res.status(400).json({ ok: false, error: 'cardId is required' });
      }

      const db = await storage.connect();
      const owns = await db.collection('smart_cards').findOne({ ownerUid, cardId }, { projection: { cardId: 1 } });
      if (!owns) {
        return res.status(404).json({ ok: false, error: 'Card not found for this owner' });
      }

      const now = new Date();
      const expiresAt = new Date(now.getTime() + TEMPORARY_ACCESS_TTL_MS);
      const token = crypto.randomBytes(24).toString('hex');

      await db.collection('temporary_access').insertOne({
        token,
        cardId,
        ownerUid,
        source: UNIVERSAL_QR_SOURCE,
        createdAt: now,
        expiresAt,
      });

      const base = getPublicUniversalCardBaseUrl();
      const universalUrl = `${base}/u/${encodeURIComponent(token)}?source=${encodeURIComponent(UNIVERSAL_QR_SOURCE)}`;

      return res.status(201).json({
        ok: true,
        token,
        universalUrl,
        ttlSec: Math.floor(TEMPORARY_ACCESS_TTL_MS / 1000),
        expiresAt: expiresAt.toISOString(),
        source: UNIVERSAL_QR_SOURCE,
      });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
  }

  router.post('/temporary-access/issue', issueTemporaryUniversalAccessRoute);
  router.post('/universal-link/issue', issueTemporaryUniversalAccessRoute);

  /**
   * Canjea acceso temporal 24h → share_permission (sin consumir el documento TTL; varios receptores pueden unirse mientras el token exista).
   */
  router.post('/temporary-access/redeem', async (req, res) => {
    try {
      const isEs = clientLocaleIsSpanish(req);
      const receiverUid = String(req.body?.receiverUid || req.auth?.sub || '').trim();
      const token = String(req.body?.token || '').trim();

      if (!receiverUid) {
        return res.status(400).json({
          ok: false,
          error: isEs ? 'Se requiere receiverUid.' : 'receiverUid is required.',
        });
      }
      if (!token) {
        return res.status(400).json({
          ok: false,
          error: isEs ? 'Se requiere token.' : 'token is required.',
        });
      }

      const db = await storage.connect();
      const now = new Date();

      const validation = await parseAndValidateTemporaryAccess(db, token);
      if (!validation.ok) {
        return res.status(410).json({
          ok: false,
          error: isEs ? 'Acceso expirado o token no válido.' : 'Access expired or invalid token.',
        });
      }

      const ownerUid = String(validation.ownerUid || '').trim();
      const cardId = String(validation.cardId || '').trim();
      if (!ownerUid || !cardId) {
        return res.status(400).json({
          ok: false,
          error: isEs ? 'Datos del token no válidos.' : 'Invalid token payload.',
        });
      }

      const relationKey = buildRelationKey(ownerUid, receiverUid);
      const blocked = await db.collection('blocked_relations').findOne({ relationKey });
      if (blocked) {
        return res.status(403).json({
          ok: false,
          error: isEs ? 'Acceso denegado: relación bloqueada.' : 'Access denied: blocked relationship.',
        });
      }

      await db.collection('share_permissions').findOneAndUpdate(
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
        },
      );

      return res.status(200).json({
        ok: true,
        ownerUid,
        receiverUid,
        cardId,
        shareGranted: true,
      });
    } catch (error) {
      const isEs = clientLocaleIsSpanish(req);
      return res.status(500).json({
        ok: false,
        error: isEs ? 'Error del servidor. Intenta de nuevo.' : 'Server error. Please try again.',
      });
    }
  });

  /**
   * Grupos del Búnker para el receptor: defaults + nombres guardados en nube (`bunker_groups`).
   */
  router.get('/bunker/groups', async (req, res) => {
    try {
      const isEs = clientLocaleIsSpanish(req);
      const viewerUid = String(req.auth?.sub || '').trim();
      if (!viewerUid) {
        return res.status(401).json({
          ok: false,
          error: isEs ? 'No autorizado.' : 'Unauthorized.',
        });
      }

      const db = await storage.connect();
      const rows = await db
        .collection('bunker_groups')
        .find({ viewerUid }, { projection: { groupName: 1, _id: 0 } })
        .sort({ groupName: 1 })
        .toArray();
      const fromDb = rows.map((r) => String(r.groupName || '').trim()).filter(Boolean);
      const merged = new Set([...DEFAULT_BUNKER_GROUPS, ...fromDb]);
      const groups = Array.from(merged).sort((a, b) => {
        const ia = DEFAULT_BUNKER_GROUPS.indexOf(a);
        const ib = DEFAULT_BUNKER_GROUPS.indexOf(b);
        if (ia !== -1 && ib !== -1) {
          return ia - ib;
        }
        if (ia !== -1) {
          return -1;
        }
        if (ib !== -1) {
          return 1;
        }
        return a.localeCompare(b, 'en', { sensitivity: 'base' });
      });

      return res.status(200).json({ ok: true, groups });
    } catch (error) {
      const isEs = clientLocaleIsSpanish(req);
      return res.status(500).json({
        ok: false,
        error: isEs ? 'Error del servidor. Intenta de nuevo.' : 'Server error. Please try again.',
      });
    }
  });

  /** Registra un nombre de grupo personalizado usado por el receptor (para futuros desplegables). */
  router.post('/bunker/groups/track', async (req, res) => {
    try {
      const isEs = clientLocaleIsSpanish(req);
      const viewerUid = String(req.auth?.sub || '').trim();
      const groupName = String(req.body?.groupName || '')
        .trim()
        .slice(0, 60);
      if (!viewerUid) {
        return res.status(401).json({
          ok: false,
          error: isEs ? 'No autorizado.' : 'Unauthorized.',
        });
      }
      if (!groupName) {
        return res.status(400).json({
          ok: false,
          error: isEs ? 'Se requiere groupName.' : 'groupName is required.',
        });
      }
      if (DEFAULT_BUNKER_GROUPS.includes(groupName)) {
        return res.status(200).json({ ok: true });
      }

      const db = await storage.connect();
      const now = new Date();
      await db.collection('bunker_groups').updateOne(
        { viewerUid, groupName },
        {
          $set: { updatedAt: now },
          $setOnInsert: {
            viewerUid,
            groupName,
            createdAt: now,
          },
        },
        { upsert: true },
      );

      return res.status(200).json({ ok: true });
    } catch (error) {
      const isEs = clientLocaleIsSpanish(req);
      return res.status(500).json({
        ok: false,
        error: isEs ? 'Error del servidor. Intenta de nuevo.' : 'Server error. Please try again.',
      });
    }
  });

  router.post('/consume', async (req, res) => {
    try {
      const isEs = clientLocaleIsSpanish(req);
      const receiverUid = String(req.body?.receiverUid || req.auth?.sub || '').trim();
      const token = String(req.body?.token || '').trim();

      if (!receiverUid) {
        return res.status(400).json({
          ok: false,
          error: isEs ? 'Se requiere receiverUid.' : 'receiverUid is required.',
        });
      }
      if (!token) {
        return res.status(400).json({
          ok: false,
          error: isEs ? 'Se requiere token.' : 'token is required.',
        });
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
        return res.status(410).json({
          ok: false,
          error: isEs
            ? 'El token expiró, fue revocado o ya se usó.'
            : 'Token expired, revoked or already consumed.',
        });
      }

      const ownerUidFromToken = String(tokenDoc.ownerUid || '').trim();
      if (!ownerUidFromToken) {
        return res.status(400).json({
          ok: false,
          error: isEs ? 'Datos del token no válidos.' : 'Token payload is invalid.',
        });
      }

      const relationKey = buildRelationKey(ownerUidFromToken, receiverUid);
      const blocked = await db.collection('blocked_relations').findOne({ relationKey });
      if (blocked) {
        return res.status(403).json({
          ok: false,
          error: isEs ? 'Acceso denegado: relación bloqueada.' : 'Access denied: blocked relationship.',
        });
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
        return res.status(410).json({
          ok: false,
          error: isEs
            ? 'El token expiró, fue revocado o ya se usó.'
            : 'Token expired, revoked or already consumed.',
        });
      }

      const ownerUid = String(qrToken.ownerUid || '').trim();
      const cardId = String(qrToken.cardId || '').trim();
      if (!ownerUid || !cardId) {
        return res.status(400).json({
          ok: false,
          error: isEs ? 'Datos del token no válidos.' : 'Token payload is invalid.',
        });
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
      const isEs = clientLocaleIsSpanish(req);
      return res.status(500).json({
        ok: false,
        error: isEs ? 'Error del servidor. Intenta de nuevo.' : 'Server error. Please try again.',
      });
    }
  });

  /**
   * Otorga share_permission por QR permanente de Business Card (sin qr_tokens).
   */
  router.post('/grant-business-share', async (req, res) => {
    try {
      const isEs = clientLocaleIsSpanish(req);
      const receiverUid = String(req.body?.receiverUid || req.auth?.sub || '').trim();
      const ownerUid = String(req.body?.ownerUid || '').trim();
      const cardId = String(req.body?.cardId || '').trim();

      if (!receiverUid) {
        return res.status(400).json({
          ok: false,
          error: isEs ? 'Se requiere receiverUid.' : 'receiverUid is required.',
        });
      }
      if (!ownerUid || !cardId) {
        return res.status(400).json({
          ok: false,
          error: isEs ? 'Se requiere ownerUid y cardId.' : 'ownerUid and cardId are required.',
        });
      }
      if (receiverUid === ownerUid) {
        return res.status(400).json({
          ok: false,
          error: isEs ? 'No puedes agregarte a ti mismo.' : 'You cannot add yourself.',
        });
      }

      const db = await storage.connect();
      const now = new Date();

      const relationKey = buildRelationKey(ownerUid, receiverUid);
      const blocked = await db.collection('blocked_relations').findOne({ relationKey });
      if (blocked) {
        return res.status(403).json({
          ok: false,
          error: isEs ? 'Acceso denegado: relación bloqueada.' : 'Access denied: blocked relationship.',
        });
      }

      /** Negocios solo en Firestore comparten el mismo QR: el permiso es válido sin fila en `smart_cards`. */
      await db.collection('share_permissions').findOneAndUpdate(
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
        },
      );

      /* Calcular holders reales después del upsert */
      const countsMap = await aggregateActiveReceiverCountByCardId(db, ownerUid, [cardId], now);
      const holdersCount = countsMap.get(cardId) ?? 0;

      return res.status(200).json({
        ok: true,
        ownerUid,
        receiverUid,
        cardId,
        shareGranted: true,
        holdersCount,
      });
    } catch (error) {
      const isEs = clientLocaleIsSpanish(req);
      return res.status(500).json({
        ok: false,
        error: isEs ? 'Error del servidor. Intenta de nuevo.' : 'Server error. Please try again.',
      });
    }
  });

  /**
   * Retorna holdersCount real (desde share_permissions) para las business cards del owner.
   * GET /api/qr/business-holders?ownerUid=xxx&cardIds=id1,id2
   */
  router.get('/business-holders', async (req, res) => {
    try {
      const ownerUid = String(req.query?.ownerUid || req.auth?.sub || '').trim();
      const rawIds = String(req.query?.cardIds || '').trim();
      if (!ownerUid || !rawIds) {
        return res.status(400).json({ ok: false, error: 'ownerUid and cardIds required' });
      }
      const cardIds = rawIds.split(',').map((s) => s.trim()).filter(Boolean);
      if (!cardIds.length) {
        return res.status(200).json({ ok: true, counts: {} });
      }
      const db = await storage.connect();
      const countsMap = await aggregateActiveReceiverCountByCardId(db, ownerUid, cardIds, new Date());
      const counts = {};
      for (const [cid, n] of countsMap) {
        counts[cid] = n;
      }
      return res.status(200).json({ ok: true, counts });
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
      const now = new Date();
      const cards = await db.collection('smart_cards').find(
        { ownerUid },
        { sort: { updatedAt: -1 } }
      ).toArray();

      const cardIdList = cards.map((c) => String(c.cardId || c._id || '').trim()).filter(Boolean);
      const receiverCountByCardId = await aggregateActiveReceiverCountByCardId(db, ownerUid, cardIdList, now);

      return res.status(200).json({
        ok: true,
        cards: cards.map((card) => {
          const cid = String(card.cardId || card._id || '').trim();
          return {
          cardId: cid,
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
          holdersCount: receiverCountByCardId.get(cid) ?? 0,
          ratingAvg: Number(card.ratingAvg || 5),
          ownerDisplayName: card.ownerDisplayName || null,
          ownerNickname: card.ownerNickname || null,
          ownerPhotoUrl: card.ownerPhotoUrl || null,
          ownerOccupation: card.ownerOccupation || null,
          searchFacets: sanitizeSearchFacets(card.searchFacets),
          publicCardSlots: sanitizePublicCardSlots(card.publicCardSlots),
          createdAt: card.createdAt ? new Date(card.createdAt).toISOString() : new Date().toISOString(),
          updatedAt: card.updatedAt ? new Date(card.updatedAt).toISOString() : new Date().toISOString(),
        };
        }),
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

      const setDoc = {
        name: String(req.body?.name || 'Smart Card').trim(),
        layout: String(req.body?.layout || 'vertical') === 'horizontal' ? 'horizontal' : 'vertical',
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
        ownerDisplayName: req.body?.ownerDisplayName ? String(req.body.ownerDisplayName).trim().slice(0, 240) : null,
        ownerNickname: req.body?.ownerNickname ? String(req.body.ownerNickname).trim().slice(0, 240) : null,
        ownerPhotoUrl: req.body?.ownerPhotoUrl ? String(req.body.ownerPhotoUrl).trim() : null,
        ownerOccupation: req.body?.ownerOccupation ? String(req.body.ownerOccupation).trim().slice(0, 240) : null,
        searchFacets: sanitizeSearchFacets(req.body?.searchFacets),
        updatedAt: now,
      };
      // themeId: solo sobreescribir si se envía un valor no vacío; evita borrar el themeId existente en MongoDB
      // cuando el cliente no lo incluye o lo envía como undefined/null.
      if (req.body?.themeId) {
        setDoc.themeId = String(req.body.themeId).trim();
      }
      // Incluir si el cliente envía la clave (incl. array vacío). `in` evita fallos raros con hasOwnProperty en body parseado.
      if (req.body != null && 'publicCardSlots' in req.body) {
        setDoc.publicCardSlots = sanitizePublicCardSlots(req.body.publicCardSlots);
      }

      await db.collection('smart_cards').findOneAndUpdate(
        { ownerUid, cardId },
        {
          $set: setDoc,
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

      /** Una fila por permiso activo (ownerUid + cardId); no colapsar a “solo la última tarjeta por emisor”. */
      const permEntries = [];
      for (const row of perms) {
        const sourceUid = String(row.ownerUid || '').trim();
        if (!sourceUid) {
          continue;
        }
        const rowDate = row.createdAt ? new Date(row.createdAt) : new Date(0);
        const cid = String(row.cardId || '').trim();
        permEntries.push({
          ownerUid: sourceUid,
          cardId: cid || null,
          createdAt: rowDate,
        });
      }
      permEntries.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      const ownerUids = [...new Set(permEntries.map((e) => e.ownerUid))];
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

      const pairsForCardStories = [];
      const pairKeySeen = new Set();
      for (const e of permEntries) {
        const cid = e.cardId ? String(e.cardId).trim() : '';
        if (!cid) {
          continue;
        }
        const pk = `${e.ownerUid}::${cid}`;
        if (pairKeySeen.has(pk)) {
          continue;
        }
        pairKeySeen.add(pk);
        pairsForCardStories.push({ ownerUid: e.ownerUid, cardId: cid });
      }

      /** Conteo real de receptores por tarjeta (share_permissions); smart_cards.holdersCount suele estar desactualizado. */
      const holderCountByOwnerCard = new Map();
      if (pairsForCardStories.length) {
        const expiryOr = [
          { expiresAt: null },
          { expiresAt: { $gt: now } },
          { expiresAt: { $exists: false } },
        ];
        for (const p of pairsForCardStories) {
          holderCountByOwnerCard.set(`${p.ownerUid}::${p.cardId}`, 0);
        }
        const permMatch = {
          $or: pairsForCardStories.map((p) => ({
            ownerUid: p.ownerUid,
            cardId: p.cardId,
            isRevoked: { $ne: true },
            $or: expiryOr,
          })),
        };
        const holderAgg = await db.collection('share_permissions').aggregate([
          { $match: permMatch },
          { $group: { _id: { ou: '$ownerUid', cid: '$cardId' }, n: { $sum: 1 } } },
        ]).toArray();
        for (const row of holderAgg) {
          const ou = String(row._id?.ou || '').trim();
          const cid = String(row._id?.cid || '').trim();
          if (ou && cid) {
            holderCountByOwnerCard.set(`${ou}::${cid}`, Number(row.n || 0));
          }
        }
      }

      let storyCardRows = [];
      if (pairsForCardStories.length) {
        storyCardRows = await db.collection('story_card_states').find({
          $or: pairsForCardStories.map((p) => ({ ownerUid: p.ownerUid, cardId: p.cardId })),
          expiresAt: { $gt: now },
        }).toArray();
      }
      const storyCardByKey = new Map();
      for (const row of storyCardRows) {
        const ou = String(row.ownerUid || '').trim();
        const cid = String(row.cardId || '').trim();
        if (!ou || !cid) {
          continue;
        }
        const state = String(row.state || 'none');
        if (state === 'normal' || state === 'vip') {
          storyCardByKey.set(`${ou}::${cid}`, state);
        }
      }

      const muteRows = await db.collection('card_subscriber_mutes').find({
        targetUid: ownerUid,
        ownerUid: { $in: ownerUids },
        muted: true,
      }).toArray();
      const mutedCardKeys = new Set(muteRows.map((m) => `${String(m.ownerUid || '').trim()}::${String(m.cardId || '').trim()}`));

      const neighborMap = await buildShareNeighborMap(db, now);

      const profileCache = new Map();
      const resolveProfileCached = async (uid) => {
        if (profileCache.has(uid)) {
          return profileCache.get(uid);
        }
        const p = await resolveUserProfileExtended(db, uid);
        profileCache.set(uid, p);
        return p;
      };

      const contacts = [];
      for (const permEntry of permEntries) {
        const uid = permEntry.ownerUid;
        const permMeta = permEntry;
        const holderKey =
          permMeta?.cardId && String(permMeta.cardId).trim()
            ? `${uid}::${String(permMeta.cardId).trim()}`
            : '';
        const holdersCount = holderKey && holderCountByOwnerCard.has(holderKey)
          ? holderCountByOwnerCard.get(holderKey)
          : 0;
        let profile = await resolveProfileCached(uid);
        let cardName = 'Tarjeta Social';
        let avg = 5;
        let searchFacets = [];
        let totalRatings = 0;
        let themeId = 'deep_teal';
        let layout = 'vertical';
        let fontId = null;
        let fontName = null;
        let fontFamily = null;
        let fontTier = null;
        let wallpaperId = null;
        let wallpaperUrl = null;
        let wallpaperThumbUrl = null;
        let wallpaperTier = null;
        let wallpaperPriceCredits = 0;
        let enableParallax = false;
        let itemIds = [];
        let cardUpdatedAt = null;

        let cardDocForProfile = null;
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
                searchFacets: 1,
                totalRatings: 1,
                themeId: 1,
                layout: 1,
                fontId: 1,
                fontName: 1,
                fontFamily: 1,
                fontTier: 1,
                wallpaperId: 1,
                wallpaperUrl: 1,
                wallpaperThumbUrl: 1,
                wallpaperTier: 1,
                wallpaperPriceCredits: 1,
                enableParallax: 1,
                itemIds: 1,
                updatedAt: 1,
                ownerDisplayName: 1,
                ownerNickname: 1,
                ownerPhotoUrl: 1,
                ownerOccupation: 1,
                publicCardSlots: 1,
              },
            }
          );
          cardDocForProfile = cardDoc;

          if (cardDoc) {
            cardName = String(cardDoc.name || 'Tarjeta Social');
            avg = Number(cardDoc.ratingAvg || 5);
            searchFacets = sanitizeSearchFacets(cardDoc.searchFacets);
            totalRatings = Number(cardDoc.totalRatings ?? 0);
            themeId = String(cardDoc.themeId || 'deep_teal').trim() || 'deep_teal';
            layout = String(cardDoc.layout || 'vertical') === 'horizontal' ? 'horizontal' : 'vertical';
            fontId = cardDoc.fontId ? String(cardDoc.fontId) : null;
            fontName = cardDoc.fontName ? String(cardDoc.fontName) : null;
            fontFamily = cardDoc.fontFamily ? String(cardDoc.fontFamily) : null;
            fontTier = cardDoc.fontTier === 'premium' ? 'premium' : cardDoc.fontTier === 'free' ? 'free' : null;
            wallpaperId = cardDoc.wallpaperId ? String(cardDoc.wallpaperId) : null;
            wallpaperUrl = cardDoc.wallpaperUrl ? String(cardDoc.wallpaperUrl) : null;
            wallpaperThumbUrl = cardDoc.wallpaperThumbUrl ? String(cardDoc.wallpaperThumbUrl) : null;
            wallpaperTier = cardDoc.wallpaperTier === 'premium' ? 'premium' : cardDoc.wallpaperTier === 'free' ? 'free' : null;
            wallpaperPriceCredits = Number(cardDoc.wallpaperPriceCredits || 0);
            enableParallax = Boolean(cardDoc.enableParallax);
            itemIds = Array.isArray(cardDoc.itemIds) ? cardDoc.itemIds.map((id) => String(id)) : [];
            cardUpdatedAt = cardDoc.updatedAt ? new Date(cardDoc.updatedAt).toISOString() : null;
          }
        }

        profile = mergeContactProfileFromCard(profile, uid, cardDocForProfile);

        if (!Number.isFinite(avg) || avg <= 0) {
          const ratingAgg = await db.collection('smart_cards').aggregate([
            { $match: { ownerUid: uid } },
            { $group: { _id: null, avg: { $avg: '$ratingAvg' } } },
          ]).toArray();
          avg = Number(ratingAgg?.[0]?.avg || 5);
        }

        const cardIdForStory = permMeta?.cardId ? String(permMeta.cardId).trim() : '';
        const muteKey = `${uid}::${cardIdForStory}`;
        let storyState = 'none';
        if (cardIdForStory && mutedCardKeys.has(muteKey)) {
          storyState = 'none';
        } else if (cardIdForStory) {
          // Historia anclada a tarjeta: solo suscriptores de esa cardId ven el estado (no fallback a story global).
          storyState = storyCardByKey.get(muteKey) || 'none';
        } else {
          // Compartidos legacy sin cardId en permiso: mantener visibilidad por story_states global.
          storyState = storyByOwner.get(uid) || 'none';
        }

        const mutualContactsCount = mutualNeighborUids(neighborMap, ownerUid, uid).length;

        const publicCardSlots = cardDocForProfile
          ? sanitizePublicCardSlots(cardDocForProfile.publicCardSlots)
          : [];

        contacts.push({
          uid,
          cardId: cardIdForStory || null,
          name: profile.name,
          nickname: profile.nickname,
          photoUrl: profile.photoUrl,
          ownerOccupation: profile.ownerOccupation != null ? profile.ownerOccupation : null,
          ratingAvg: Number.isFinite(avg) ? avg : 5,
          cardName,
          holdersCount,
          addedAt: permMeta?.createdAt ? permMeta.createdAt.toISOString() : null,
          storyState,
          searchFacets,
          publicCardSlots,
          mutualContactsCount,
          totalRatings: Number.isFinite(totalRatings) ? Math.max(0, Math.floor(totalRatings)) : 0,
          channelMuted: Boolean(cardIdForStory && mutedCardKeys.has(muteKey)),
          themeId,
          layout,
          fontId,
          fontName,
          fontFamily,
          fontTier,
          wallpaperId,
          wallpaperUrl,
          wallpaperThumbUrl,
          wallpaperTier,
          wallpaperPriceCredits,
          enableParallax,
          itemIds,
          cardUpdatedAt,
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
      const cardIdScoped = String(req.body?.cardId || '').trim();

      if (!ownerUid || !targetUid) {
        return res.status(400).json({ ok: false, error: 'ownerUid and targetUid are required' });
      }
      if (authUid && authUid !== ownerUid) {
        return res.status(403).json({ ok: false, error: 'Forbidden: ownerUid does not match authenticated user' });
      }

      const db = await storage.connect();
      let deleted;
      if (cardIdScoped) {
        /** Quitar solo el vínculo de esa tarjeta; el mismo emisor puede seguir apareciendo con otras cardId. */
        deleted = await db.collection('share_permissions').deleteMany({
          $or: [
            { ownerUid: targetUid, targetUid: ownerUid, cardId: cardIdScoped },
            { ownerUid, targetUid: targetUid, cardId: cardIdScoped },
          ],
        });
      } else {
        deleted = await db.collection('share_permissions').deleteMany({
          $or: [
            { ownerUid, targetUid },
            { ownerUid: targetUid, targetUid: ownerUid },
          ],
        });
      }

      return res.status(200).json({
        ok: true,
        ownerUid,
        targetUid,
        cardId: cardIdScoped || null,
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
      const cardIdBody = normalizeString(req.body?.cardId, null);

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

      if (cardIdBody) {
        if (incomingState === 'none') {
          await db.collection('story_card_states').deleteOne({ ownerUid, cardId: cardIdBody });
          return res.status(200).json({
            ok: true,
            ownerUid,
            cardId: cardIdBody,
            state: 'none',
            expiresAt: null,
          });
        }

        const expiresAt = incomingState === 'vip'
          ? new Date(now.getTime() + STORY_VIP_TTL_DAYS * 24 * 60 * 60 * 1000)
          : new Date(now.getTime() + STORY_NORMAL_TTL_HOURS * 60 * 60 * 1000);

        await db.collection('story_card_states').findOneAndUpdate(
          { ownerUid, cardId: cardIdBody },
          {
            $set: {
              ownerUid,
              cardId: cardIdBody,
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
          cardId: cardIdBody,
          state: incomingState,
          expiresAt: expiresAt.toISOString(),
          isPaidExternal: incomingState === 'vip' ? incomingPaidExternal : false,
          vipSource: incomingState === 'vip' ? vipSource : null,
          paidChannel: incomingState === 'vip' ? paidChannel : null,
        });
      }

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
      const cardIdQuery = normalizeString(req.query?.cardId, null);

      if (!ownerUid) {
        return res.status(400).json({ ok: false, error: 'ownerUid is required' });
      }
      if (authUid && authUid !== ownerUid) {
        return res.status(403).json({ ok: false, error: 'Forbidden: ownerUid does not match authenticated user' });
      }

      const db = await storage.connect();
      const now = new Date();

      if (cardIdQuery) {
        const row = await db.collection('story_card_states').findOne({ ownerUid, cardId: cardIdQuery });
        if (!row || !row.expiresAt || new Date(row.expiresAt).getTime() <= now.getTime()) {
          return res.status(200).json({
            ok: true,
            ownerUid,
            cardId: cardIdQuery,
            state: 'none',
            expiresAt: null,
          });
        }
        const state = String(row.state || 'none');
        return res.status(200).json({
          ok: true,
          ownerUid,
          cardId: cardIdQuery,
          state: state === 'vip' ? 'vip' : state === 'normal' ? 'normal' : 'none',
          expiresAt: new Date(row.expiresAt).toISOString(),
          isPaidExternal: Boolean(row.isPaidExternal),
          vipSource: normalizeString(row.vipSource, null),
          paidChannel: normalizeString(row.paidChannel, null),
        });
      }

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

  /**
   * Conversión / interacciones por tarjeta (Fase 2). Colección `card_analytics`:
   * documentos diarios `d:{cardId}:{YYYY-MM-DD}` y mensuales `m:{cardId}:{YYYY-MM}`.
   */
  router.post('/analytics/track', async (req, res) => {
    try {
      const authUid = String(req.auth?.sub || '').trim();
      if (!authUid) {
        return res.status(401).json({ ok: false, error: 'Unauthorized' });
      }

      const cardId = String(req.body?.cardId || '').trim();
      if (!cardId || cardId.length > 160) {
        return res.status(400).json({ ok: false, error: 'cardId is required' });
      }

      const iconType = sanitizeAnalyticsSegmentKey(req.body?.iconType);
      const source = String(req.body?.source || '').trim();
      const allowedSources = new Set(['search', 'story', 'card', 'qr_scan']);
      if (!allowedSources.has(source)) {
        return res.status(400).json({ ok: false, error: 'source must be search, story, card, or qr_scan' });
      }

      const ts = req.body?.timestamp ? new Date(req.body.timestamp) : new Date();
      if (Number.isNaN(ts.getTime())) {
        return res.status(400).json({ ok: false, error: 'invalid timestamp' });
      }

      const dayKey = ts.toISOString().slice(0, 10);
      const monthKey = ts.toISOString().slice(0, 7);
      const srcKey = sanitizeAnalyticsSegmentKey(source);
      const db = await storage.connect();
      const now = new Date();

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

      return res.status(200).json({ ok: true });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
  });

  router.get('/analytics/card/:cardId/summary', async (req, res) => {
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
      const owns = await db.collection('smart_cards').findOne({ ownerUid, cardId });
      if (!owns) {
        return res.status(404).json({ ok: false, error: 'Card not found for this owner' });
      }

      const minDay = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const docs = await db
        .collection('card_analytics')
        .find({
          cardId,
          granularity: 'day',
          periodKey: { $gte: minDay },
        })
        .toArray();

      let totalViews = 0;
      const iconAgg = Object.create(null);
      for (const d of docs) {
        totalViews += Number(d.totalInteractions || 0) || 0;
        const icons = d.icons && typeof d.icons === 'object' ? d.icons : {};
        for (const [k, v] of Object.entries(icons)) {
          const n = Number(v || 0) || 0;
          iconAgg[k] = (iconAgg[k] || 0) + n;
        }
      }

      const topIcons = Object.entries(iconAgg)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([iconType, count]) => ({ iconType, count: Number(count) }));

      return res.status(200).json({
        ok: true,
        cardId,
        totalViews,
        topIcons,
      });
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
        { projection: { targetUid: 1, createdAt: 1 } }
      ).toArray();

      /** Map targetUid → earliest createdAt (addedAt). */
      const addedAtByUid = new Map();
      for (const p of permissions) {
        const tuid = String(p.targetUid || '').trim();
        if (!tuid) continue;
        const ts = p.createdAt ? new Date(p.createdAt) : null;
        if (ts && (!addedAtByUid.has(tuid) || ts < addedAtByUid.get(tuid))) {
          addedAtByUid.set(tuid, ts);
        }
      }

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

      const neighborMap = await buildShareNeighborMap(db, now);

      const muteRows = await db.collection('card_subscriber_mutes').find({
        ownerUid,
        cardId,
        muted: true,
      }).toArray();
      const mutedSet = new Set(muteRows.map((m) => String(m.targetUid || '').trim()).filter(Boolean));

      const ratingBySub = new Map();
      if (subscriberUids.length) {
        const ratingAgg = await db.collection('smart_cards').aggregate([
          { $match: { ownerUid: { $in: subscriberUids } } },
          { $group: { _id: '$ownerUid', avgRating: { $avg: '$ratingAvg' } } },
        ]).toArray();
        for (const row of ratingAgg) {
          const uidKey = String(row._id || '').trim();
          const avg = Number(row.avgRating);
          ratingBySub.set(uidKey, Number.isFinite(avg) ? avg : 0);
        }
      }

      const subscribers = [];
      for (const uid of subscriberUids) {
        let profile = await resolveUserProfileExtended(db, uid);
        const idCard = await fetchLatestCardIdentityDoc(db, uid);
        profile = mergeContactProfileFromCard(profile, uid, idCard);
        const mutualIds = mutualNeighborUids(neighborMap, ownerUid, uid);
        const mutualCount = mutualIds.length;
        const mutualPreviewPhotos = [];
        for (const mid of mutualIds.slice(0, 3)) {
          const mp = await resolveUserProfile(db, mid);
          if (mp.photoUrl) {
            mutualPreviewPhotos.push(mp.photoUrl);
          }
        }
        const userRating = ratingBySub.has(uid) ? ratingBySub.get(uid) : 0;

        const addedDate = addedAtByUid.get(uid);
        subscribers.push({
          uid,
          name: profile.name,
          fullName: profile.name,
          nickname: profile.nickname,
          photoUrl: profile.photoUrl,
          ownerOccupation: profile.ownerOccupation || null,
          isAmixes: amixesSet.has(uid),
          userRating: Number.isFinite(userRating) ? userRating : 0,
          mutualCount,
          mutualPreviewPhotos,
          muted: mutedSet.has(uid),
          addedAt: addedDate ? addedDate.toISOString() : null,
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

      await db.collection('card_subscriber_mutes').deleteMany({
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

  router.post('/cards/:cardId/subscribers/:targetUid/mute', async (req, res) => {
    try {
      const authUid = String(req.auth?.sub || '').trim();
      const ownerUid = String(req.body?.ownerUid || req.query?.ownerUid || authUid || '').trim();
      const cardId = String(req.params?.cardId || '').trim();
      const targetUid = String(req.params?.targetUid || '').trim();
      const muted = req.body?.muted === true;

      if (!ownerUid || !cardId || !targetUid) {
        return res.status(400).json({ ok: false, error: 'ownerUid, cardId and targetUid are required' });
      }
      if (authUid && authUid !== ownerUid && authUid !== targetUid) {
        return res.status(403).json({ ok: false, error: 'Forbidden: caller must be card owner or subscriber' });
      }

      const db = await storage.connect();
      const now = new Date();

      if (authUid === targetUid && authUid !== ownerUid) {
        const permOk = await db.collection('share_permissions').findOne({
          ownerUid,
          targetUid: authUid,
          cardId,
          isRevoked: { $ne: true },
          $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }, { expiresAt: { $exists: false } }],
        });
        if (!permOk) {
          return res.status(403).json({ ok: false, error: 'Forbidden: no active share for this card' });
        }
      }

      if (!muted) {
        await db.collection('card_subscriber_mutes').deleteOne({ ownerUid, cardId, targetUid });
        return res.status(200).json({ ok: true, ownerUid, cardId, targetUid, muted: false });
      }

      await db.collection('card_subscriber_mutes').findOneAndUpdate(
        { ownerUid, cardId, targetUid },
        {
          $set: {
            ownerUid,
            cardId,
            targetUid,
            muted: true,
            updatedAt: now,
          },
          $setOnInsert: {
            createdAt: now,
          },
        },
        { upsert: true, returnDocument: 'after', includeResultMetadata: false }
      );

      return res.status(200).json({ ok: true, ownerUid, cardId, targetUid, muted: true });
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

      await purgeInteractionForBlock(db, ownerUid, targetUid);

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
        let profile = await resolveUserProfileExtended(db, otherUid);
        const bCard = await fetchLatestCardIdentityDoc(db, otherUid);
        profile = mergeContactProfileFromCard(profile, otherUid, bCard);
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
        let profile = await resolveUserProfileExtended(db, peerUid);
        const peerCard = await fetchLatestCardIdentityDoc(db, peerUid);
        profile = mergeContactProfileFromCard(profile, peerUid, peerCard);

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

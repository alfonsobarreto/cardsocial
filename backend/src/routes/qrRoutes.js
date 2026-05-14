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

const { buildGhostLinkAgoraInviteWithVoipGate } = require('../lib/agoraGhostLink');
const { recordVoipUsageForGhostOutgoingLog, getVoipMinutesSummary } = require('../lib/voipUsageService');
const { sendPushToUser } = require('../lib/pushNotifications');
const { mergeContactProfileFromCard, enrichSubscriberProfileFromCard } = require('../lib/contactIdentityMerge');
const { buildMongoExtendedProfileFields, mergeUsersAndProfilesDocuments } = require('../lib/extendedUserIdentity');
const { pickFirstNonGeneric, isGenericUserLabel } = require('../lib/resolvePublicIdentity');
const { readSmartCardScName } = require('../lib/smartCardScName');
const { clientLocaleIsSpanish } = require('../lib/httpRequestLocale');
const { parseAndValidateTemporaryAccess } = require('../lib/temporaryAccessToken');
const { composeIssuerSnapshot } = require('../lib/issuerSnapshot');
const { resolveIssuerPremiumSaveExperience } = require('../lib/issuerPremiumSaveSignal');
const { env } = require('../config');

function normalizeString(value, fallback = null) {
  const text = String(value ?? '').trim();
  return text || fallback;
}

/** Fila `smart_cards`: dueño + clave pública (sid o bId, mismos valores no deberían colisionar). */
function smartCardKeyQuery(uid, key) {
  const u = String(uid || '').trim();
  const k = String(key || '').trim();
  if (!u || !k) return null;
  return { uid: u, $or: [{ sid: k }, { bId: k }] };
}

/** Permiso compartido activo entre emisor y receptor para una tarjeta identificada por clave pública. */
function sharePermQuery(issuerUid, targetUid, key) {
  const a = String(issuerUid || '').trim();
  const b = String(targetUid || '').trim();
  const k = String(key || '').trim();
  if (!a || !b || !k) return null;
  return { uid: a, targetUid: b, $or: [{ sid: k }, { bId: k }] };
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
async function aggregateActiveReceiverCountByKeys(db, issuerUid, cardKeys, now) {
  const u = String(issuerUid || '').trim();
  const ids = [...new Set((cardKeys || []).map((id) => String(id || '').trim()).filter(Boolean))];
  const map = new Map();
  for (const id of ids) {
    map.set(id, 0);
  }
  if (!u || !ids.length) {
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
        uid: u,
        isRevoked: { $ne: true },
        $and: [
          { $or: [{ sid: { $in: ids } }, { bId: { $in: ids } }] },
          { $or: expiryOr },
        ],
      },
    },
    { $addFields: { _cardKey: { $ifNull: ['$bId', '$sid'] } } },
    { $group: { _id: '$_cardKey', n: { $sum: 1 } } },
  ]).toArray();

  for (const row of rows) {
    const cid = String(row?._id || '').trim();
    if (cid) {
      map.set(cid, Number(row.n || 0));
    }
  }
  return map;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/**
 * Histórico de altas (share_permissions) por día / mes / año dentro de un rango.
 * Fecha de evento: createdAt o, si falta, updatedAt.
 */
async function aggregateBusinessHolderHistoryBuckets(
  db,
  issuerUid,
  bIdRaw,
  granularity,
  monthCursorRaw,
  yearCursorRaw,
) {
  const u = String(issuerUid || '').trim();
  const bId = String(bIdRaw || '').trim();
  const mode = String(granularity || 'monthly').toLowerCase();
  const monthCursor = Number(monthCursorRaw ?? 0) || 0;
  const yearCursor = Number(yearCursorRaw ?? 0) || 0;

  const now = new Date();
  const buckets = [];
  let start;
  let end;
  let dateFormat;
  let periodLabelKey = '';

  if (mode === 'daily') {
    const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + monthCursor, 1));
    start = base;
    end = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0, 23, 59, 59, 999));
    dateFormat = '%Y-%m-%d';
    periodLabelKey = `${base.getUTCFullYear()}-${pad2(base.getUTCMonth() + 1)}`;
    const y = base.getUTCFullYear();
    const m = base.getUTCMonth();
    const dim = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    for (let day = 1; day <= dim; day += 1) {
      const key = `${y}-${pad2(m + 1)}-${pad2(day)}`;
      buckets.push({ key, count: 0 });
    }
  } else if (mode === 'monthly') {
    const y = now.getUTCFullYear() + yearCursor;
    start = new Date(Date.UTC(y, 0, 1));
    end = new Date(Date.UTC(y, 11, 31, 23, 59, 59, 999));
    dateFormat = '%Y-%m';
    periodLabelKey = String(y);
    for (let m = 0; m < 12; m += 1) {
      const key = `${y}-${pad2(m + 1)}`;
      buckets.push({ key, count: 0 });
    }
  } else {
    const endY = now.getUTCFullYear() + yearCursor;
    const startY = endY - 5;
    start = new Date(Date.UTC(startY, 0, 1));
    end = new Date(Date.UTC(endY, 11, 31, 23, 59, 59, 999));
    dateFormat = '%Y';
    periodLabelKey = `${startY}-${endY}`;
    for (let y = startY; y <= endY; y += 1) {
      buckets.push({ key: String(y), count: 0 });
    }
  }

  const countByKey = new Map(buckets.map((b) => [b.key, 0]));
  const rows = await db
    .collection('share_permissions')
    .aggregate([
      {
        $match: {
          uid: u,
          bId,
          $or: [{ sid: null }, { sid: { $exists: false } }],
        },
      },
      {
        $addFields: {
          _eventAt: { $ifNull: ['$createdAt', '$updatedAt'] },
        },
      },
      {
        $match: {
          _eventAt: { $gte: start, $lte: end },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: dateFormat, date: '$_eventAt', timezone: 'UTC' } },
          count: { $sum: 1 },
        },
      },
    ])
    .toArray();

  for (const row of rows) {
    const k = String(row?._id || '').trim();
    if (k && countByKey.has(k)) {
      countByKey.set(k, Number(row.count || 0) || 0);
    }
  }

  const filled = buckets.map((b) => ({ key: b.key, count: countByKey.get(b.key) ?? 0 }));
  const sumInRange = filled.reduce((acc, b) => acc + b.count, 0);

  return {
    buckets: filled,
    sumInRange,
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    granularity: mode,
    periodLabelKey,
  };
}

/** Filtro único para `story_card_states`: visor + sid o bId (no ambos). */
function storyCardScopeFilter(viewerUid, sidRaw, bIdRaw) {
  const u = String(viewerUid || '').trim();
  const sid = sidRaw != null && String(sidRaw).trim() ? String(sidRaw).trim() : null;
  const bId = bIdRaw != null && String(bIdRaw).trim() ? String(bIdRaw).trim() : null;
  if (!u || (!sid && !bId)) {
    return null;
  }
  if (sid) {
    return { uid: u, sid };
  }
  return { uid: u, bId };
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

function analyticsStartOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function analyticsAddPeriod(date, mode, offset) {
  const d = new Date(date);
  if (mode === 'day') d.setDate(d.getDate() + offset);
  else if (mode === 'week') d.setDate(d.getDate() + offset * 7);
  else if (mode === 'month') d.setMonth(d.getMonth() + offset);
  else if (mode === 'year') d.setFullYear(d.getFullYear() + offset);
  return d;
}

function analyticsPeriodWindow(modeRaw, offsetRaw) {
  const mode = ['day', 'week', 'month', 'year'].includes(String(modeRaw)) ? String(modeRaw) : 'week';
  const offset = Math.min(0, Number.parseInt(String(offsetRaw || '0'), 10) || 0);
  const target = analyticsAddPeriod(new Date(), mode, offset);
  let start;
  let end;
  let labels;

  if (mode === 'day') {
    start = analyticsStartOfDay(target);
    end = new Date(start);
    end.setDate(end.getDate() + 1);
    labels = Array.from({ length: 24 }, (_, i) => String(i));
  } else if (mode === 'week') {
    start = analyticsStartOfDay(target);
    const day = start.getDay() || 7;
    start.setDate(start.getDate() - day + 1);
    end = new Date(start);
    end.setDate(end.getDate() + 7);
    labels = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  } else if (mode === 'month') {
    start = new Date(target.getFullYear(), target.getMonth(), 1);
    end = new Date(target.getFullYear(), target.getMonth() + 1, 1);
    labels = Array.from({ length: 30 }, (_, i) => String(i + 1));
  } else {
    start = new Date(target.getFullYear(), 0, 1);
    end = new Date(target.getFullYear() + 1, 0, 1);
    labels = ['E', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
  }

  return { mode, offset, start, end, labels };
}

function analyticsBucketIndex(ts, mode, start) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return -1;
  if (mode === 'day') return d.getHours();
  if (mode === 'week') return Math.floor((analyticsStartOfDay(d).getTime() - start.getTime()) / 86_400_000);
  if (mode === 'month') return Math.min(29, Math.max(0, d.getDate() - 1));
  return d.getMonth();
}

function createQrRoutes({ storage }) {
  const router = express.Router();

  async function fetchLatestCardIdentityDoc(db, subjectUid) {
    const uid = String(subjectUid || '').trim();
    if (!uid) {
      return null;
    }
    return db.collection('smart_cards').findOne(
      { uid },
      {
        sort: { updatedAt: -1 },
        projection: {
          cardType: 1,
          ownerDisplayName: 1,
          ownerNickname: 1,
          ownerPhotoUrl: 1,
          ownerOccupation: 1,
          updatedAt: 1,
        },
      },
    );
  }

  async function fetchPersonalCardIdentityDoc(db, subjectUid) {
    const uid = String(subjectUid || '').trim();
    if (!uid) {
      return null;
    }
    const proj = {
      cardType: 1,
      ownerDisplayName: 1,
      ownerNickname: 1,
      ownerPhotoUrl: 1,
      ownerOccupation: 1,
      updatedAt: 1,
    };
    const personal = await db.collection('smart_cards').findOne(
      { uid, cardType: { $ne: 'business' } },
      { sort: { updatedAt: -1 }, projection: proj },
    );
    if (personal) {
      return personal;
    }
    return db.collection('smart_cards').findOne(
      { uid },
      { sort: { updatedAt: -1 }, projection: proj },
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
      const lower = newNickname.toLowerCase();
      const exists = await db.collection('users').findOne({
        uid: { $ne: uid },
        $or: [{ nicknameLower: lower }, { userNickNameLower: lower }],
      });
      if (exists) {
        return res.status(409).json({ ok: false, error: 'Ese nombre de usuario ya está en uso' });
      }
      await db.collection('users').updateOne(
        { uid },
        {
          $set: {
            userNickName: newNickname,
            userNickNameLower: lower,
            nickname: newNickname,
            nicknameLower: lower,
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

  /**
   * Sincroniza la URL del avatar de perfil a Mongo (`users` + `profiles`).
   * Firestore ya la tiene desde la app; el API QR / contactos / receptores lee solo Mongo.
   */
  router.put('/users/:uid/profile-avatar', async (req, res) => {
    try {
      const authUid = String(req.auth?.sub || '').trim();
      const uid = String(req.params.uid || '').trim();
      const raw = req.body?.userAvatarUrl != null ? String(req.body.userAvatarUrl).trim() : '';
      if (!authUid) {
        return res.status(401).json({ ok: false, error: 'Unauthenticated' });
      }
      if (!uid) {
        return res.status(400).json({ ok: false, error: 'uid is required' });
      }
      if (authUid !== uid) {
        return res.status(403).json({ ok: false, error: 'Forbidden' });
      }
      if (!raw) {
        return res.status(400).json({ ok: false, error: 'userAvatarUrl is required' });
      }
      if (!/^https?:\/\//i.test(raw)) {
        return res.status(400).json({ ok: false, error: 'userAvatarUrl must be an http(s) URL' });
      }
      if (raw.length > 4096) {
        return res.status(400).json({ ok: false, error: 'userAvatarUrl too long' });
      }

      const db = await storage.connect();
      const now = new Date();
      await db.collection('users').updateOne(
        { uid },
        {
          $set: {
            userAvatarUrl: raw,
            updatedAt: now,
          },
          $setOnInsert: {
            uid,
            createdAt: now,
          },
        },
        { upsert: true },
      );
      await db.collection('profiles').updateOne({ uid }, { $set: { userAvatarUrl: raw, updatedAt: now } });

      await refreshIssuerSnapshotsForOwner(db, uid);

      return res.status(200).json({ ok: true, userAvatarUrl: raw });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
  });

  function buildRelationKey(uidA, uidB) {
    return [String(uidA || '').trim(), String(uidB || '').trim()].sort().join('::');
  }

  /**
   * Grafo interno Card-Social: arista A—B si existe share_permission activa
   * (uid=A, targetUid=B). Sin agenda ni datos externos.
   */
  async function buildShareNeighborMap(db, now) {
    const perms = await db.collection('share_permissions').find(
      {
        isRevoked: { $ne: true },
        $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }, { expiresAt: { $exists: false } }],
      },
      { projection: { uid: 1, targetUid: 1 } }
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
      addEdge(p.uid, p.targetUid);
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
        { callerUid: uidA, targetUid: uidB },
        { callerUid: uidB, targetUid: uidA },
      ],
    });
    await db.collection('call_logs').deleteMany({
      $or: [
        { uid: uidA, peerUid: uidB },
        { uid: uidB, peerUid: uidA },
      ],
    });
    await db.collection('card_subscriber_mutes').deleteMany({
      $or: [
        { uid: uidA, targetUid: uidB },
        { uid: uidB, targetUid: uidA },
      ],
    });
    // Chats: enlazar aquí cuando exista colección de mensajes.
  }

  async function resolveUserProfile(db, uid) {
    const safeUid = String(uid || '').trim();
    if (!safeUid) {
      return { uid: '', name: 'Usuario', userAvatarUrl: null };
    }

    const profileProj = {
      displayName: 1,
      name: 1,
      userFullName: 1,
      fullName: 1,
      userAvatarUrl: 1,
    };
    const [usersDoc, profilesDoc] = await Promise.all([
      db.collection('users').findOne({ uid: safeUid }, { projection: profileProj }),
      db.collection('profiles').findOne({ uid: safeUid }, { projection: profileProj }),
    ]);

    const merged = mergeUsersAndProfilesDocuments(usersDoc, profilesDoc);
    const name =
      pickFirstNonGeneric(
        merged?.userFullName,
        merged?.fullName,
        merged?.displayName,
        merged?.name,
      ) || 'Usuario';
    const userAvatarUrl = String(merged?.userAvatarUrl || '').trim() || null;

    return {
      uid: safeUid,
      name,
      userAvatarUrl,
    };
  }

  async function resolveUserProfileExtended(db, uid) {
    const safeUid = String(uid || '').trim();
    if (!safeUid) {
      return {
        uid: '',
        fullName: 'Usuario',
        username: '',
        name: 'Usuario',
        nickname: '',
        userAvatarUrl: null,
        ownerOccupation: null,
      };
    }

    const extendedProj = {
      displayName: 1,
      name: 1,
      userFullName: 1,
      fullName: 1,
      firstName: 1,
      lastName: 1,
      userNickName: 1,
      nickname: 1,
      userNickNameLower: 1,
      nicknameLower: 1,
      userAvatarUrl: 1,
    };
    const [usersDoc, profilesDoc] = await Promise.all([
      db.collection('users').findOne({ uid: safeUid }, { projection: extendedProj }),
      db.collection('profiles').findOne({ uid: safeUid }, { projection: extendedProj }),
    ]);

    return buildMongoExtendedProfileFields(safeUid, usersDoc, profilesDoc);
  }

  /**
   * Tras actualizar Mongo `users.userAvatarUrl`, recalcula `issuerSnapshot` en todas las
   * `smart_cards` del dueño (misma lógica que PUT /cards/:cardRef).
   */
  async function refreshIssuerSnapshotsForOwner(db, userUid) {
    const uid = String(userUid || '').trim();
    if (!uid) return;
    const issuerProfile = await resolveUserProfileExtended(db, uid);
    const now = new Date();
    const cards = await db.collection('smart_cards').find({ ownerUid: uid }).toArray();
    for (const card of cards) {
      const sanitizedSlotsForSnapshot = sanitizePublicCardSlots(card.publicCardSlots || []);
      const itemIdsArr = Array.isArray(card.itemIds) ? card.itemIds.map((id) => String(id)) : [];
      const snap = composeIssuerSnapshot(uid, issuerProfile, sanitizedSlotsForSnapshot, itemIdsArr);
      await db.collection('smart_cards').updateOne(
        { _id: card._id },
        { $set: { issuerSnapshot: snap, updatedAt: now } },
      );
    }
  }

  // ── Push token registration ──
  router.post('/push/register', async (req, res) => {
    try {
      const authUid = String(req.auth?.sub || '').trim();
      const userUid = String(req.body?.uid || authUid || '').trim();
      const token = String(req.body?.token || '').trim();

      if (!userUid || !token) {
        return res.status(400).json({ ok: false, error: 'uid and token are required' });
      }
      if (authUid && authUid !== userUid) {
        return res.status(403).json({ ok: false, error: 'Forbidden' });
      }

      const db = await storage.connect();
      await db.collection('push_tokens').updateOne(
        { uid: userUid, token },
        { $set: { uid: userUid, token, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
        { upsert: true },
      );

      return res.status(200).json({ ok: true });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
  });

  router.post('/voip/ghost-link/start', async (req, res) => {
    try {
      const authUid = String(req.auth?.sub || '').trim();
      const callerUid = String(req.body?.uid || authUid || '').trim();
      const targetUid = String(req.body?.targetUid || '').trim();
      const sourceCardName = String(req.body?.sourceCardName || '').trim();
      const sourceSid = normalizeString(req.body?.sourceSid, null);
      const sourceBId = normalizeString(req.body?.sourceBId, null);
      const sourceKey = sourceBId || sourceSid;
      const callType = ['audio', 'video'].includes(String(req.body?.callType || '').trim())
        ? String(req.body.callType).trim()
        : 'audio';

      if (!callerUid || !targetUid || !sourceCardName) {
        return res.status(400).json({ ok: false, error: 'uid, targetUid y sourceCardName son obligatorios' });
      }
      if (authUid && authUid !== callerUid) {
        return res.status(403).json({ ok: false, error: 'Forbidden: uid does not match authenticated user' });
      }

      const db = await storage.connect();
      const now = new Date();
      const relationKey = buildRelationKey(callerUid, targetUid);
      const blocked = await db.collection('blocked_relations').findOne({ relationKey });
      if (blocked) {
        return res.status(403).json({ ok: false, error: 'Access denied: blocked relationship' });
      }

      if (sourceKey) {
        const cardDoc = await db.collection('smart_cards').findOne(
          smartCardKeyQuery(callerUid, sourceKey),
          { projection: { silenced: 1, uid: 1 } },
        );
        if (cardDoc?.silenced === true) {
          return res.status(403).json({ ok: false, error: 'Call blocked: card is muted' });
        }

        const issuerForMute = String(cardDoc?.uid || callerUid).trim();
        const subscriberMuted = await db.collection('card_subscriber_mutes').findOne({
          uid: issuerForMute,
          targetUid,
          muted: true,
          $or: [{ sid: sourceKey }, { bId: sourceKey }],
        });
        if (subscriberMuted) {
          return res.status(403).json({ ok: false, error: 'Call blocked: card is muted' });
        }
      }

      let caller = await resolveUserProfileExtended(db, callerUid);
      let receiver = await resolveUserProfileExtended(db, targetUid);
      const callerCard = await fetchLatestCardIdentityDoc(db, callerUid);
      const receiverCard = await fetchLatestCardIdentityDoc(db, targetUid);
      caller = mergeContactProfileFromCard(caller, callerUid, callerCard);
      receiver = mergeContactProfileFromCard(receiver, targetUid, receiverCard);

      let sharedCard = null;
      if (sourceKey) {
        sharedCard = await db.collection('smart_cards').findOne(
          smartCardKeyQuery(callerUid, sourceKey),
          {
            projection: {
              sid: 1,
              bId: 1,
              scName: 1,
              cardType: 1,
              ownerDisplayName: 1,
              ownerPhotoUrl: 1,
            },
          },
        );
      }

      const hintedKind = String(req.body?.sourceCardKind || '').trim().toLowerCase();
      const hintedPhoto = normalizeString(req.body?.sourceCardPhotoUrl, null);
      const hintedDisplayName = normalizeString(req.body?.sourceCardDisplayName, null);

      const mongoCardKind = String(sharedCard?.cardType || '').trim().toLowerCase();
      let cardType = mongoCardKind === 'business' ? 'business' : 'personal';
      if (!sharedCard) {
        cardType = hintedKind === 'business' ? 'business' : 'personal';
      }

      let cardName = String(
        sharedCard?.ownerDisplayName || readSmartCardScName(sharedCard) || sourceCardName || 'Tarjeta Social',
      ).trim();
      if (hintedDisplayName && !sharedCard) {
        cardName = hintedDisplayName;
      }

      let cardPhoto = String(sharedCard?.ownerPhotoUrl || '').trim() || null;
      if (!cardPhoto && sharedCard) {
        if (mongoCardKind === 'business') {
          cardPhoto = hintedPhoto;
        } else {
          cardPhoto = caller.userAvatarUrl;
        }
      }

      if (!sharedCard && sourceKey) {
        const perm = await db.collection('share_permissions').findOne({
          uid: callerUid,
          targetUid,
          isRevoked: { $ne: true },
          $and: [
            { $or: [{ sid: sourceKey }, { bId: sourceKey }] },
            { $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }, { expiresAt: { $exists: false } }] },
          ],
        });
        if (perm) {
          if (hintedKind === 'business' || hintedKind === 'personal') {
            cardType = hintedKind === 'business' ? 'business' : 'personal';
          } else {
            cardType = 'business';
          }
          cardPhoto = hintedPhoto || cardPhoto;
          if (hintedDisplayName) {
            cardName = hintedDisplayName;
          }
        }
      }

      const sessionId = `acs_${callerUid.slice(0, 8)}_${targetUid.slice(0, 8)}_${Date.now()}`;
      const inviteId = crypto.randomBytes(16).toString('hex');
      const expiresAt = new Date(now.getTime() + GHOST_LINK_INVITE_TTL_SECONDS * 1000);
      const agoraChannelName = `gl_${inviteId}`;
      let agoraInvite = null;
      try {
        agoraInvite = await buildGhostLinkAgoraInviteWithVoipGate(storage, {
          callerUid,
          targetUid,
          channelName: agoraChannelName,
          ttlSeconds: GHOST_LINK_INVITE_TTL_SECONDS,
        });
      } catch (e) {
        if (e && e.code === 'VOIP_MINUTES_EXHAUSTED') {
          return res.status(403).json({
            ok: false,
            error: e.message || 'Minutos de llamadas agotados',
            errorCode: 'VOIP_MINUTES_EXHAUSTED',
          });
        }
        throw e;
      }

      const outSid = sharedCard?.sid != null && String(sharedCard.sid).trim() ? String(sharedCard.sid).trim() : sourceSid;
      const outBId = sharedCard?.bId != null && String(sharedCard.bId).trim() ? String(sharedCard.bId).trim() : sourceBId;

      const cardPayload = {
        sid: outSid || null,
        bId: outBId || null,
        cardName,
        cardPhoto,
        cardType,
      };

      if (cardType === 'business' && outBId) {
        const bizInviteDoc = await db.collection('business_cards').findOne(
          { bId: outBId, ownerUid: callerUid },
          { projection: { bcName: 1, bcLogoUrl: 1, bcContactName: 1 } },
        );
        if (bizInviteDoc) {
          if (bizInviteDoc.bcName != null && String(bizInviteDoc.bcName).trim()) {
            cardPayload.bcName = String(bizInviteDoc.bcName).trim();
          }
          if (bizInviteDoc.bcLogoUrl != null && String(bizInviteDoc.bcLogoUrl).trim()) {
            cardPayload.bcLogoUrl = String(bizInviteDoc.bcLogoUrl).trim();
          }
          if (bizInviteDoc.bcContactName != null && String(bizInviteDoc.bcContactName).trim()) {
            cardPayload.bcContactName = String(bizInviteDoc.bcContactName).trim();
          }
        }
      }

      await db.collection('ghost_link_invites').findOneAndUpdate(
        { inviteId },
        {
          $set: {
            inviteId,
            sessionId,
            callerUid,
            targetUid,
            sourceCardName: cardName,
            sourceSid: outSid || null,
            sourceBId: outBId || null,
            callChannel: 'ghost-link-voip',
            callType,
            card: cardPayload,
            callerDisplay: {
              name: caller.name,
              nickname: caller.nickname,
              userAvatarUrl: caller.userAvatarUrl,
              userFullName: caller.name,
            },
            receiverDisplay: {
              name: receiver.name,
              nickname: receiver.nickname,
              userAvatarUrl: receiver.userAvatarUrl,
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

      void sendPushToUser(db, targetUid, {
        title: 'Ghost-Link',
        body: callType === 'video'
          ? `${caller.name || 'Alguien'} te está videollamando`
          : `${caller.name || 'Alguien'} te está llamando`,
        data: {
          type: 'ghost-link-incoming',
          inviteId,
          callerUid,
          callerName: caller.name,
          cardName,
          callType,
        },
        channelId: 'ghost-link-calls',
      });

      return res.status(200).json({
        ok: true,
        inviteId,
        sessionId,
        engine: agoraInvite ? 'agora' : 'signaling-only',
        callType,
        callChannel: 'ghost-link-voip',
        sourceSid: outSid || null,
        sourceBId: outBId || null,
        sourceCardName: cardName,
        card: cardPayload,
        callerDisplay: {
          name: caller.name,
          nickname: caller.nickname,
          userAvatarUrl: caller.userAvatarUrl,
          userFullName: caller.name,
        },
        receiverDisplay: {
          name: receiver.name,
          nickname: receiver.nickname,
          userAvatarUrl: receiver.userAvatarUrl,
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

  router.get('/voip/minutes-summary', async (req, res) => {
    try {
      const authUid = String(req.auth?.sub || '').trim();
      const userUid = String(req.query?.uid || authUid || '').trim();
      if (!userUid) {
        return res.status(400).json({ ok: false, error: 'uid is required' });
      }
      if (authUid && authUid !== userUid) {
        return res.status(403).json({ ok: false, error: 'Forbidden: uid does not match authenticated user' });
      }
      const summary = await getVoipMinutesSummary(storage, userUid);
      return res.status(200).json({
        ok: true,
        uid: userUid,
        unlimited: Boolean(summary.unlimited),
        cycleKey: summary.cycleKey,
        subscriptionUsedMinutes: summary.subscriptionUsedMinutes,
        subscriptionIncludedMinutes: summary.subscriptionIncludedMinutes,
        purchasedMinutesRemaining: summary.purchasedMinutesRemaining,
        totalAvailableMinutes: summary.totalAvailableMinutes,
      });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
  });

  router.get('/voip/ghost-link/incoming', async (req, res) => {
    try {
      const authUid = String(req.auth?.sub || '').trim();
      const userUid = String(req.query?.uid || authUid || '').trim();

      if (!userUid) {
        return res.status(400).json({ ok: false, error: 'uid is required' });
      }
      if (authUid && authUid !== userUid) {
        return res.status(403).json({ ok: false, error: 'Forbidden: uid does not match authenticated user' });
      }

      const db = await storage.connect();
      const now = new Date();

      const invite = await db.collection('ghost_link_invites').findOne(
        {
          targetUid: userUid,
          status: 'ringing',
          expiresAt: { $gt: now },
        },
        {
          sort: { createdAt: -1 },
          projection: {
            inviteId: 1,
            sessionId: 1,
            callerUid: 1,
            targetUid: 1,
            sourceCardName: 1,
            sourceSid: 1,
            sourceBId: 1,
            callChannel: 1,
            card: 1,
            callerDisplay: 1,
            receiverDisplay: 1,
            createdAt: 1,
            updatedAt: 1,
            expiresAt: 1,
            callType: 1,
            agora: 1,
          },
        }
      );

      if (!invite) {
        return res.status(200).json({ ok: true, uid: userUid, invite: null });
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

      const inviteCard = invite.card || {};
      /** Smart entrante: título UI = **tu** tarjeta (`smart_cards` del receptor), no la del caller. */
      let incomingSmartCardName = String(inviteCard.cardName || invite.sourceCardName || 'Tarjeta Social').trim();
      const incomingIsPersonal = String(inviteCard.cardType || '').toLowerCase() !== 'business';
      const sidRecv = normalizeString(invite.sourceSid, null);
      if (incomingIsPersonal && sidRecv && userUid) {
        const receiverCard = await db.collection('smart_cards').findOne(smartCardKeyQuery(userUid, sidRecv), {
          projection: { scName: 1, ownerDisplayName: 1, cardType: 1 },
        });
        if (receiverCard && String(receiverCard.cardType || '').toLowerCase() !== 'business') {
          const localSc = readSmartCardScName(receiverCard) || String(receiverCard.ownerDisplayName || '').trim();
          if (localSc) {
            incomingSmartCardName = String(localSc).trim();
          }
        }
      }
      return res.status(200).json({
        ok: true,
        uid: userUid,
        invite: {
          inviteId: String(invite.inviteId || ''),
          sessionId: String(invite.sessionId || ''),
          callerUid: String(invite.callerUid || ''),
          targetUid: String(invite.targetUid || ''),
          sourceCardName: String(invite.sourceCardName || 'Tarjeta Social'),
          sourceSid: normalizeString(invite.sourceSid, null),
          sourceBId: normalizeString(invite.sourceBId, null),
          callChannel: 'ghost-link-voip',
          callType: String(invite.callType || 'audio'),
          card: {
            sid: normalizeString(inviteCard.sid, null),
            bId: normalizeString(inviteCard.bId, null),
            cardName: incomingSmartCardName || 'Tarjeta Social',
            cardPhoto: normalizeString(inviteCard.cardPhoto, null),
            cardType: String(inviteCard.cardType || '').toLowerCase() === 'business' ? 'business' : 'personal',
            bcName: normalizeString(inviteCard.bcName, null),
            bcLogoUrl: normalizeString(inviteCard.bcLogoUrl, null),
            bcContactName: normalizeString(inviteCard.bcContactName, null),
          },
          callerDisplay: {
            name: String(invite?.callerDisplay?.name || 'Contacto'),
            nickname: String(invite?.callerDisplay?.nickname || 'user'),
            userAvatarUrl: normalizeString(invite?.callerDisplay?.userAvatarUrl, null),
            userFullName: String(
              invite?.callerDisplay?.userFullName || invite?.callerDisplay?.name || 'Contacto',
            ),
          },
          receiverDisplay: {
            name: String(invite?.receiverDisplay?.name || 'Contacto'),
            nickname: String(invite?.receiverDisplay?.nickname || 'user'),
            userAvatarUrl: normalizeString(invite?.receiverDisplay?.userAvatarUrl, null),
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

  /** Emisor (caller): estado de una invitación concreta tras `start` (ringing → accepted | rejected | …). */
  router.get('/voip/ghost-link/outgoing-invite', async (req, res) => {
    try {
      const authUid = String(req.auth?.sub || '').trim();
      const userUid = String(req.query?.uid || authUid || '').trim();
      const inviteId = String(req.query?.inviteId || '').trim();

      if (!userUid || !inviteId) {
        return res.status(400).json({ ok: false, error: 'uid e inviteId son requeridos' });
      }
      if (authUid && authUid !== userUid) {
        return res.status(403).json({ ok: false, error: 'Forbidden: uid does not match authenticated user' });
      }

      const db = await storage.connect();
      const now = new Date();

      const invite = await db.collection('ghost_link_invites').findOne(
        { callerUid: userUid, inviteId },
        { projection: { status: 1, expiresAt: 1, inviteId: 1 } },
      );

      if (!invite) {
        return res.status(200).json({ ok: true, uid: userUid, inviteId, status: 'not_found' });
      }

      const statusRaw = String(invite.status || '').trim();
      if (statusRaw === 'ringing' && invite.expiresAt && new Date(invite.expiresAt) <= now) {
        return res.status(200).json({ ok: true, uid: userUid, inviteId, status: 'expired' });
      }

      return res.status(200).json({
        ok: true,
        uid: userUid,
        inviteId,
        status: statusRaw || 'unknown',
      });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
  });

  router.post('/voip/ghost-link/respond', async (req, res) => {
    try {
      const authUid = String(req.auth?.sub || '').trim();
      const userUid = String(req.body?.uid || authUid || '').trim();
      const inviteId = String(req.body?.inviteId || '').trim();
      const action = String(req.body?.action || '').trim().toLowerCase();

      if (!userUid || !inviteId || !action) {
        return res.status(400).json({ ok: false, error: 'uid, inviteId y action son requeridos' });
      }
      if (authUid && authUid !== userUid) {
        return res.status(403).json({ ok: false, error: 'Forbidden: uid does not match authenticated user' });
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
          targetUid: userUid,
          status: 'ringing',
          expiresAt: { $gt: now },
        };
        nextStatus = 'accepted';
      } else if (action === 'reject') {
        filter = {
          inviteId,
          targetUid: userUid,
          status: 'ringing',
        };
        nextStatus = 'rejected';
      } else {
        filter = {
          inviteId,
          $or: [{ callerUid: userUid }, { targetUid: userUid }],
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
            respondedByUid: userUid,
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
        uid: userUid,
        inviteId,
        status: String(updated.status || nextStatus),
      });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
  });

  router.post('/issue', async (req, res) => {
    try {
      const uid = String(req.body?.uid || req.auth?.sub || '').trim();
      const sid = String(req.body?.sid || '').trim();

      if (!uid) {
        return res.status(400).json({ ok: false, error: 'uid is required' });
      }
      if (!sid) {
        return res.status(400).json({ ok: false, error: 'sid is required' });
      }

      const now = new Date();
      const expiresAt = new Date(now.getTime() + QR_TTL_SECONDS * 1000);
      const token = crypto.randomBytes(24).toString('hex');

      const db = await storage.connect();
      await db.collection('qr_tokens').insertOne({
        token,
        uid,
        sid,
        bId: null,
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
      const issuerUid = String(req.body?.uid || req.auth?.sub || '').trim();
      const sid = String(req.body?.sid || '').trim();
      const bId = String(req.body?.bId || '').trim();
      const cardKey = sid || bId;

      if (!issuerUid) {
        return res.status(400).json({ ok: false, error: 'uid is required' });
      }
      if (!cardKey) {
        return res.status(400).json({ ok: false, error: 'sid or bId is required' });
      }

      const db = await storage.connect();
      const owns = await db.collection('smart_cards').findOne(smartCardKeyQuery(issuerUid, cardKey), { projection: { sid: 1, bId: 1 } });
      if (!owns) {
        return res.status(404).json({ ok: false, error: 'Card not found for this owner' });
      }

      const rowSid = owns.sid != null && String(owns.sid).trim() ? String(owns.sid).trim() : null;
      const rowBId = owns.bId != null && String(owns.bId).trim() ? String(owns.bId).trim() : null;

      const now = new Date();

      /** Un solo enlace vigente por tarjeta: reutilizar el token hasta que expire (evita 100 QR distintos en 24 h). */
      const existing = await db.collection('temporary_access').findOne(
        {
          uid: issuerUid,
          sid: rowSid,
          bId: rowBId,
          source: UNIVERSAL_QR_SOURCE,
          expiresAt: { $gt: now },
        },
        { sort: { expiresAt: -1 } },
      );

      if (existing && String(existing.token || '').trim()) {
        const token = String(existing.token).trim();
        const exp = existing.expiresAt instanceof Date ? existing.expiresAt : new Date(existing.expiresAt);
        const ttlMs = Math.max(0, exp.getTime() - now.getTime());
        /** Borra otros tokens 24h de la misma tarjeta (p. ej. emitidos antes del fix); solo debe quedar uno vigente. */
        await db.collection('temporary_access').deleteMany({
          uid: issuerUid,
          sid: rowSid,
          bId: rowBId,
          source: UNIVERSAL_QR_SOURCE,
          token: { $ne: token },
        });
        const base = getPublicUniversalCardBaseUrl();
        const universalUrl = `${base}/u/${encodeURIComponent(token)}?source=${encodeURIComponent(UNIVERSAL_QR_SOURCE)}`;

        return res.status(200).json({
          ok: true,
          token,
          universalUrl,
          ttlSec: Math.max(1, Math.floor(ttlMs / 1000)),
          expiresAt: exp.toISOString(),
          source: UNIVERSAL_QR_SOURCE,
          reused: true,
        });
      }

      const expiresAt = new Date(now.getTime() + TEMPORARY_ACCESS_TTL_MS);
      const token = crypto.randomBytes(24).toString('hex');

      await db.collection('temporary_access').insertOne({
        token,
        uid: issuerUid,
        sid: rowSid,
        bId: rowBId,
        source: UNIVERSAL_QR_SOURCE,
        createdAt: now,
        expiresAt,
      });

      await db.collection('temporary_access').deleteMany({
        uid: issuerUid,
        sid: rowSid,
        bId: rowBId,
        source: UNIVERSAL_QR_SOURCE,
        token: { $ne: token },
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
        reused: false,
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

      const issuerUid = String(validation.uid || '').trim();
      const sid = validation.sid != null && String(validation.sid).trim() ? String(validation.sid).trim() : null;
      const bId = validation.bId != null && String(validation.bId).trim() ? String(validation.bId).trim() : null;
      if (!issuerUid || (!sid && !bId)) {
        return res.status(400).json({
          ok: false,
          error: isEs ? 'Datos del token no válidos.' : 'Invalid token payload.',
        });
      }

      const relationKey = buildRelationKey(issuerUid, receiverUid);
      const blocked = await db.collection('blocked_relations').findOne({ relationKey });
      if (blocked) {
        return res.status(403).json({
          ok: false,
          error: isEs ? 'Acceso denegado: relación bloqueada.' : 'Access denied: blocked relationship.',
        });
      }

      await db.collection('share_permissions').findOneAndUpdate(
        {
          uid: issuerUid,
          targetUid: receiverUid,
          sid,
          bId,
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

      const issuerPremiumExperience = await resolveIssuerPremiumSaveExperience(storage, issuerUid);

      return res.status(200).json({
        ok: true,
        uid: issuerUid,
        receiverUid,
        sid,
        bId,
        shareGranted: true,
        issuerPremiumExperience,
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
            uid: 1,
            sid: 1,
            bId: 1,
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

      const issuerFromToken = String(tokenDoc.uid || '').trim();
      if (!issuerFromToken) {
        return res.status(400).json({
          ok: false,
          error: isEs ? 'Datos del token no válidos.' : 'Token payload is invalid.',
        });
      }

      const relationKey = buildRelationKey(issuerFromToken, receiverUid);
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

      const issuerUid = String(qrToken.uid || '').trim();
      const sid = qrToken.sid != null && String(qrToken.sid).trim() ? String(qrToken.sid).trim() : null;
      const bId = qrToken.bId != null && String(qrToken.bId).trim() ? String(qrToken.bId).trim() : null;
      if (!issuerUid || (!sid && !bId)) {
        return res.status(400).json({
          ok: false,
          error: isEs ? 'Datos del token no válidos.' : 'Token payload is invalid.',
        });
      }

      const permissionResult = await db.collection('share_permissions').findOneAndUpdate(
        {
          uid: issuerUid,
          targetUid: receiverUid,
          sid,
          bId,
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

      const issuerPremiumExperience = await resolveIssuerPremiumSaveExperience(storage, issuerUid);

      return res.status(200).json({
        ok: true,
        uid: issuerUid,
        receiverUid,
        sid,
        bId,
        shareGranted: true,
        issuerPremiumExperience,
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
      const userUid = String(req.body?.uid || '').trim();
      const bId = String(req.body?.bId || '').trim();

      if (!receiverUid) {
        return res.status(400).json({
          ok: false,
          error: isEs ? 'Se requiere receiverUid.' : 'receiverUid is required.',
        });
      }
      if (!userUid || !bId) {
        return res.status(400).json({
          ok: false,
          error: isEs ? 'Se requiere uid y bId.' : 'uid and bId are required.',
        });
      }
      if (receiverUid === userUid) {
        return res.status(400).json({
          ok: false,
          error: isEs ? 'No puedes agregarte a ti mismo.' : 'You cannot add yourself.',
        });
      }

      const db = await storage.connect();
      const now = new Date();

      const relationKey = buildRelationKey(userUid, receiverUid);
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
          uid: userUid,
          targetUid: receiverUid,
          sid: null,
          bId,
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
      const countsMap = await aggregateActiveReceiverCountByKeys(db, userUid, [bId], now);
      const holdersCount = countsMap.get(bId) ?? 0;

      const issuerPremiumExperience = await resolveIssuerPremiumSaveExperience(storage, userUid);

      return res.status(200).json({
        ok: true,
        uid: userUid,
        receiverUid,
        bId,
        shareGranted: true,
        holdersCount,
        issuerPremiumExperience,
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
   * Retorna holdersCount real (desde share_permissions) para las business cards del issuer.
   * GET /api/qr/business-holders?uid=…&keys=id1,id2
   */
  router.get('/business-holders', async (req, res) => {
    try {
      const userUid = String(req.query?.uid || req.auth?.sub || '').trim();
      const rawIds = String(req.query?.keys || '').trim();
      if (!userUid || !rawIds) {
        return res.status(400).json({ ok: false, error: 'uid and keys required' });
      }
      const cardKeys = rawIds.split(',').map((s) => s.trim()).filter(Boolean);
      if (!cardKeys.length) {
        return res.status(200).json({ ok: true, counts: {} });
      }
      const db = await storage.connect();
      const countsMap = await aggregateActiveReceiverCountByKeys(db, userUid, cardKeys, new Date());
      const counts = {};
      for (const [cid, n] of countsMap) {
        counts[cid] = n;
      }
      return res.status(200).json({ ok: true, counts });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
  });

  /**
   * Histórico de receptores (altas por fecha) para una business card.
   * GET /api/qr/business-holders-history?uid=&bId=&granularity=daily|monthly|yearly&monthCursor=0&yearCursor=0
   */
  router.get('/business-holders-history', async (req, res) => {
    try {
      const authUid = String(req.auth?.sub || '').trim();
      const userUid = String(req.query?.uid || authUid || '').trim();
      const bId = String(req.query?.bId || '').trim();
      const granularity = String(req.query?.granularity || 'monthly');
      const monthCursor = Number(req.query?.monthCursor ?? 0) || 0;
      const yearCursor = Number(req.query?.yearCursor ?? 0) || 0;

      if (!userUid || !bId) {
        return res.status(400).json({ ok: false, error: 'uid and bId required' });
      }
      if (authUid && authUid !== userUid) {
        return res.status(403).json({ ok: false, error: 'Forbidden: uid does not match authenticated user' });
      }

      const db = await storage.connect();
      const now = new Date();
      const history = await aggregateBusinessHolderHistoryBuckets(
        db,
        userUid,
        bId,
        granularity,
        monthCursor,
        yearCursor,
      );
      const countsMap = await aggregateActiveReceiverCountByKeys(db, userUid, [bId], now);
      const totalActive = countsMap.get(bId) ?? 0;

      return res.status(200).json({
        ok: true,
        bId,
        totalActive,
        sumInRange: history.sumInRange,
        granularity: history.granularity,
        periodLabelKey: history.periodLabelKey,
        startAt: history.startAt,
        endAt: history.endAt,
        buckets: history.buckets,
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
      const userUid = String(req.query?.uid || authUid || '').trim();
      if (!userUid) {
        return res.status(400).json({ ok: false, error: 'uid is required' });
      }
      if (authUid && authUid !== userUid) {
        return res.status(403).json({ ok: false, error: 'Forbidden: uid does not match authenticated user' });
      }

      const db = await storage.connect();
      const now = new Date();
      // Incluye `cardType: 'business'` (espejo Mongo de Business Card) para que el cliente pueda
      // fusionar `ownerPhotoUrl` (logo vault) con la lista de Firestore. Mis Tarjetas filtra
      // `cardType !== 'business'` al hidratar Smart Cards.
      const cards = await db.collection('smart_cards').find(
        { uid: userUid },
        { sort: { updatedAt: -1 } }
      ).toArray();

      const cardKeyList = cards.map((c) => String(c.sid || c.bId || c._id || '').trim()).filter(Boolean);
      const receiverCountByKey = await aggregateActiveReceiverCountByKeys(db, userUid, cardKeyList, now);

      return res.status(200).json({
        ok: true,
        cards: cards.map((card) => {
          const cid = String(card.sid || card.bId || card._id || '').trim();
          const isBiz = card.cardType === 'business';
          return {
          ...(isBiz ? { bId: cid } : { sid: cid }),
          scName: String(readSmartCardScName(card) || 'Smart Card'),
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
          holdersCount: receiverCountByKey.get(cid) ?? 0,
          ratingAvg: Number(card.ratingAvg || 5),
          ownerDisplayName: card.ownerDisplayName || null,
          ownerNickname: card.ownerNickname || null,
          ownerPhotoUrl: card.ownerPhotoUrl || null,
          ownerOccupation: card.ownerOccupation || null,
          cardType: card.cardType === 'business' ? 'business' : 'smart',
          searchFacets: sanitizeSearchFacets(card.searchFacets),
          publicCardSlots: sanitizePublicCardSlots(card.publicCardSlots),
          ...(card.issuerSnapshot && typeof card.issuerSnapshot === 'object'
            ? { issuerSnapshot: card.issuerSnapshot }
            : {}),
          createdAt: card.createdAt ? new Date(card.createdAt).toISOString() : new Date().toISOString(),
          updatedAt: card.updatedAt ? new Date(card.updatedAt).toISOString() : new Date().toISOString(),
        };
        }),
      });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
  });

  router.put('/cards/:cardRef', async (req, res) => {
    try {
      const authUid = String(req.auth?.sub || '').trim();
      const userUid = String(req.body?.uid || authUid || '').trim();
      const cardRef = String(req.params?.cardRef || req.body?.sid || req.body?.bId || '').trim();
      const cardType = req.body?.cardType === 'business' ? 'business' : 'smart';

      if (!userUid || !cardRef) {
        return res.status(400).json({ ok: false, error: 'uid and card key (sid or bId) are required' });
      }
      if (authUid && authUid !== userUid) {
        return res.status(403).json({ ok: false, error: 'Forbidden: uid does not match authenticated user' });
      }

      const now = new Date();
      const db = await storage.connect();

      const scNameVal = String(req.body?.scName ?? 'Smart Card').trim() || 'Smart Card';

      const sid = cardType === 'business' ? null : cardRef;
      const bId = cardType === 'business' ? cardRef : null;

      const filter = cardType === 'business' ? { uid: userUid, bId: cardRef } : { uid: userUid, sid: cardRef };

      const itemIdsArr = Array.isArray(req.body?.itemIds) ? req.body.itemIds.map((id) => String(id)) : [];

      let sanitizedSlotsForSnapshot = [];
      if (req.body != null && 'publicCardSlots' in req.body) {
        sanitizedSlotsForSnapshot = sanitizePublicCardSlots(req.body.publicCardSlots);
      } else {
        const existingSlotsDoc = await db.collection('smart_cards').findOne(filter, { projection: { publicCardSlots: 1 } });
        sanitizedSlotsForSnapshot = sanitizePublicCardSlots(existingSlotsDoc?.publicCardSlots || []);
      }

      const setDoc = {
        uid: userUid,
        sid,
        bId,
        scName: scNameVal,
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
        itemIds: itemIdsArr,
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
      // cardType: 'business' | 'smart' — solo sobreescribir si el cliente lo envía
      if (req.body?.cardType === 'business' || req.body?.cardType === 'smart') {
        setDoc.cardType = req.body.cardType;
      }
      // Incluir si el cliente envía la clave (incl. array vacío). `in` evita fallos raros con hasOwnProperty en body parseado.
      if (req.body != null && 'publicCardSlots' in req.body) {
        setDoc.publicCardSlots = sanitizedSlotsForSnapshot;
      }

      const issuerProfile = await resolveUserProfileExtended(db, userUid);
      setDoc.issuerSnapshot = composeIssuerSnapshot(userUid, issuerProfile, sanitizedSlotsForSnapshot, itemIdsArr);

      await db.collection('smart_cards').findOneAndUpdate(
        filter,
        {
          $set: setDoc,
          $setOnInsert: {
            createdAt: now,
          },
          $unset: { name: '' },
        },
        {
          upsert: true,
          returnDocument: 'after',
          includeResultMetadata: false,
        }
      );

      return res.status(200).json({ ok: true, uid: userUid, sid, bId });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
  });

  router.delete('/cards/:cardRef', async (req, res) => {
    try {
      const authUid = String(req.auth?.sub || '').trim();
      const userUid = String(req.body?.uid || req.query?.uid || authUid || '').trim();
      const cardRef = String(req.params?.cardRef || '').trim();

      if (!userUid || !cardRef) {
        return res.status(400).json({ ok: false, error: 'uid and card key are required' });
      }
      if (authUid && authUid !== userUid) {
        return res.status(403).json({ ok: false, error: 'Forbidden: uid does not match authenticated user' });
      }

      const db = await storage.connect();
      const q = smartCardKeyQuery(userUid, cardRef);
      if (!q) {
        return res.status(400).json({ ok: false, error: 'invalid card key' });
      }
      const deleted = await db.collection('smart_cards').deleteOne(q);

      await db.collection('share_permissions').deleteMany({
        uid: userUid,
        $or: [{ sid: cardRef }, { bId: cardRef }],
      });

      await db.collection('ghost_link_invites').deleteMany({
        $or: [{ sourceSid: cardRef }, { sourceBId: cardRef }],
      });

      await db.collection('call_logs').deleteMany({
        $or: [{ sourceSid: cardRef }, { sourceBId: cardRef }],
      });

      await db.collection('card_subscriber_mutes').deleteMany({
        uid: userUid,
        $or: [{ sid: cardRef }, { bId: cardRef }],
      });

      return res.status(200).json({ ok: true, uid: userUid, deleted: Number(deleted?.deletedCount || 0) > 0 });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
  });

  router.get('/contacts/received', async (req, res) => {
    try {
      const authUid = String(req.auth?.sub || '').trim();
      const userUid = String(req.query?.uid || authUid || '').trim();
      if (!userUid) {
        return res.status(400).json({ ok: false, error: 'uid is required' });
      }
      if (authUid && authUid !== userUid) {
        return res.status(403).json({ ok: false, error: 'Forbidden: uid does not match authenticated user' });
      }

      const db = await storage.connect();
      const now = new Date();

      const perms = await db.collection('share_permissions').find(
        {
          targetUid: userUid,
          isRevoked: { $ne: true },
          $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }, { expiresAt: { $exists: false } }],
        },
        { projection: { uid: 1, sid: 1, bId: 1, createdAt: 1 } }
      ).toArray();

      /** Una fila por permiso activo (uid emisor + sid/bId); no colapsar a “solo la última tarjeta por emisor”. */
      const permEntries = [];
      for (const row of perms) {
        const sourceUid = String(row.uid || '').trim();
        if (!sourceUid) {
          continue;
        }
        const rowDate = row.createdAt ? new Date(row.createdAt) : new Date(0);
        const sidV = row.sid != null && String(row.sid).trim() ? String(row.sid).trim() : null;
        const bIdV = row.bId != null && String(row.bId).trim() ? String(row.bId).trim() : null;
        const cardKey = bIdV || sidV || '';
        permEntries.push({
          issuerUid: sourceUid,
          sid: sidV,
          bId: bIdV,
          cardKey,
          createdAt: rowDate,
        });
      }
      permEntries.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      const issuerUids = [...new Set(permEntries.map((e) => e.issuerUid))];
      const activeStories = await db.collection('story_states').find(
        {
          uid: { $in: issuerUids },
          expiresAt: { $gt: now },
        },
        {
          projection: {
            uid: 1,
            state: 1,
            expiresAt: 1,
          },
        }
      ).toArray();

      const storyByOwner = new Map();
      for (const row of activeStories) {
        const uid = String(row.uid || '').trim();
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
        const cid = e.cardKey ? String(e.cardKey).trim() : '';
        if (!cid) {
          continue;
        }
        const pk = `${e.issuerUid}::${cid}`;
        if (pairKeySeen.has(pk)) {
          continue;
        }
        pairKeySeen.add(pk);
        pairsForCardStories.push({ uid: e.issuerUid, cardKey: cid });
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
          holderCountByOwnerCard.set(`${p.uid}::${p.cardKey}`, 0);
        }
        const permMatch = {
          $or: pairsForCardStories.map((p) => ({
            uid: p.uid,
            isRevoked: { $ne: true },
            $and: [
              { $or: [{ sid: p.cardKey }, { bId: p.cardKey }] },
              { $or: expiryOr },
            ],
          })),
        };
        const holderAgg = await db.collection('share_permissions').aggregate([
          { $match: permMatch },
          { $addFields: { _ck: { $ifNull: ['$bId', '$sid'] } } },
          { $group: { _id: { ou: '$uid', cid: '$_ck' }, n: { $sum: 1 } } },
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
          $or: pairsForCardStories.map((p) => ({
            uid: p.uid,
            $and: [
              { $or: [{ sid: p.cardKey }, { bId: p.cardKey }] },
              { expiresAt: { $gt: now } },
            ],
          })),
        }).toArray();
      }
      const storyCardByKey = new Map();
      for (const row of storyCardRows) {
        const ou = String(row.uid || '').trim();
        const cid = String(row.bId || row.sid || '').trim();
        if (!ou || !cid) {
          continue;
        }
        const state = String(row.state || 'none');
        if (state === 'normal' || state === 'vip') {
          storyCardByKey.set(`${ou}::${cid}`, state);
        }
      }

      const muteRows = await db.collection('card_subscriber_mutes').find({
        targetUid: userUid,
        uid: { $in: issuerUids },
        muted: true,
      }).toArray();
      const mutedCardKeys = new Set(
        muteRows.map((m) => `${String(m.uid || '').trim()}::${String(m.bId || m.sid || '').trim()}`),
      );

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

      /** `business_cards` (bcContactName, bcLogoUrl) por emisor + bId — una query por par único. */
      const businessCardFieldsCache = new Map();

      const contacts = [];
      for (const permEntry of permEntries) {
        const uid = permEntry.issuerUid;
        const permMeta = permEntry;
        const holderKey =
          permMeta?.cardKey && String(permMeta.cardKey).trim()
            ? `${uid}::${String(permMeta.cardKey).trim()}`
            : '';
        const holdersCount = holderKey && holderCountByOwnerCard.has(holderKey)
          ? holderCountByOwnerCard.get(holderKey)
          : 0;
        let profile = await resolveProfileCached(uid);
        let cardName = 'Tarjeta Social';
        let avg = 5;
        let searchFacets = [];
        let totalRatings = 0;
        let themeId = 'obsidian';
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
        if (permMeta?.cardKey) {
          const cardDoc = await db.collection('smart_cards').findOne(
            smartCardKeyQuery(uid, permMeta.cardKey),
            {
              projection: {
                scName: 1,
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
                cardType: 1,
              },
            }
          );
          cardDocForProfile = cardDoc;

          if (cardDoc) {
            cardName = String(readSmartCardScName(cardDoc) || 'Tarjeta Social');
            avg = Number(cardDoc.ratingAvg || 5);
            searchFacets = sanitizeSearchFacets(cardDoc.searchFacets);
            totalRatings = Number(cardDoc.totalRatings ?? 0);
            themeId = String(cardDoc.themeId || 'obsidian').trim() || 'obsidian';
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

        const cardType = cardDocForProfile?.cardType === 'business' ? 'business' : 'smart';
        /** Negocio: no mezclar perfil Mongo del emisor (privacidad); solo datos de tarjeta / `business_cards`. */
        if (cardType !== 'business') {
          profile = mergeContactProfileFromCard(profile, uid, cardDocForProfile);
        }

        if (!Number.isFinite(avg) || avg <= 0) {
          const ratingAgg = await db.collection('smart_cards').aggregate([
            { $match: { uid } },
            { $group: { _id: null, avg: { $avg: '$ratingAvg' } } },
          ]).toArray();
          avg = Number(ratingAgg?.[0]?.avg || 5);
        }

        const cardKeyForStory = permMeta?.cardKey ? String(permMeta.cardKey).trim() : '';
        const muteKey = `${uid}::${cardKeyForStory}`;
        let storyState = 'none';
        if (cardKeyForStory && mutedCardKeys.has(muteKey)) {
          storyState = 'none';
        } else if (cardKeyForStory) {
          storyState = storyCardByKey.get(muteKey) || 'none';
        } else {
          storyState = storyByOwner.get(uid) || 'none';
        }

        const mutualContactsCount = mutualNeighborUids(neighborMap, userUid, uid).length;

        const publicCardSlots = cardDocForProfile
          ? sanitizePublicCardSlots(cardDocForProfile.publicCardSlots)
          : [];

        let bcNameResolved = null;
        let bcContactName = null;
        let bcLogoUrl = null;
        if (cardType === 'business' && permMeta.bId) {
          const bIdKey = String(permMeta.bId).trim();
          const cacheKey = `${uid}::${bIdKey}`;
          if (businessCardFieldsCache.has(cacheKey)) {
            const cached = businessCardFieldsCache.get(cacheKey);
            bcNameResolved = cached.bcName ?? null;
            bcContactName = cached.bcContactName;
            bcLogoUrl = cached.bcLogoUrl;
          } else {
            const bizDoc = await db.collection('business_cards').findOne(
              { bId: bIdKey, ownerUid: uid },
              { projection: { bcName: 1, bcContactName: 1, bcLogoUrl: 1 } },
            );
            const rawBcName = bizDoc && bizDoc.bcName != null ? String(bizDoc.bcName).trim() : '';
            bcNameResolved = rawBcName || null;
            const rawName = bizDoc && bizDoc.bcContactName != null ? String(bizDoc.bcContactName).trim() : '';
            bcContactName = rawName || null;
            const rawLogo =
              bizDoc && bizDoc.bcLogoUrl != null && String(bizDoc.bcLogoUrl).trim()
                ? String(bizDoc.bcLogoUrl).trim()
                : null;
            bcLogoUrl = rawLogo;
            businessCardFieldsCache.set(cacheKey, { bcName: bcNameResolved, bcContactName, bcLogoUrl });
          }
        }

        const isBusinessRow = cardType === 'business';
        /** Negocio: `cardName` alineado a `business_cards.bcName` (misma línea que Mis Tarjetas / emisor). */
        const cardNameOut = isBusinessRow && bcNameResolved ? bcNameResolved : cardName;
        contacts.push({
          uid,
          sid: permMeta.sid,
          bId: permMeta.bId,
          userFullName: isBusinessRow ? '' : profile.name,
          userNickName: isBusinessRow ? '' : profile.nickname,
          userAvatarUrl: isBusinessRow ? null : profile.userAvatarUrl,
          /** Nombre comercial canónico (`business_cards.bcName`); solo business — unifica con emisor. */
          bcName: isBusinessRow ? bcNameResolved : null,
          /** Nombre de contacto en tarjeta negocio (Mongo `business_cards`); solo business. */
          bcContactName: isBusinessRow ? bcContactName : null,
          /** Logo de marca (`business_cards.bcLogoUrl`); solo business — no confundir con foto de perfil. */
          bcLogoUrl: isBusinessRow ? bcLogoUrl : null,
          /** Smart: espejo Mongo. Business: no exponer (usar `bcLogoUrl`). */
          ownerPhotoUrl: isBusinessRow
            ? null
            : cardDocForProfile?.ownerPhotoUrl != null && String(cardDocForProfile.ownerPhotoUrl).trim()
              ? String(cardDocForProfile.ownerPhotoUrl).trim()
              : null,
          ownerOccupation: isBusinessRow ? null : profile.ownerOccupation != null ? profile.ownerOccupation : null,
          ratingAvg: Number.isFinite(avg) ? avg : 5,
          cardName: cardNameOut,
          holdersCount,
          addedAt: permMeta?.createdAt ? permMeta.createdAt.toISOString() : null,
          storyState,
          searchFacets,
          publicCardSlots,
          mutualContactsCount,
          totalRatings: Number.isFinite(totalRatings) ? Math.max(0, Math.floor(totalRatings)) : 0,
          channelMuted: Boolean(cardKeyForStory && mutedCardKeys.has(muteKey)),
          themeId,
          layout,
          fontId,
          fontName,
          fontFamily,
          fontTier,
          /** Business: shell visual = solo `themeId` (catálogo Chest); sin capa premium wallpaper en API. */
          wallpaperId: isBusinessRow ? null : wallpaperId,
          wallpaperUrl: isBusinessRow ? null : wallpaperUrl,
          wallpaperThumbUrl: isBusinessRow ? null : wallpaperThumbUrl,
          wallpaperTier: isBusinessRow ? null : wallpaperTier,
          wallpaperPriceCredits: isBusinessRow ? 0 : wallpaperPriceCredits,
          enableParallax,
          itemIds,
          cardUpdatedAt,
          cardType,
        });
      }

      return res.status(200).json({ ok: true, uid: userUid, count: contacts.length, contacts });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
  });

  router.post('/relationships/remove', async (req, res) => {
    try {
      const authUid = String(req.auth?.sub || '').trim();
      const userUid = String(req.body?.uid || authUid || '').trim();
      const targetUid = String(req.body?.targetUid || '').trim();
      const cardKeyScoped = String(req.body?.sid || req.body?.bId || '').trim();

      if (!userUid || !targetUid) {
        return res.status(400).json({ ok: false, error: 'uid and targetUid are required' });
      }
      if (authUid && authUid !== userUid) {
        return res.status(403).json({ ok: false, error: 'Forbidden: uid does not match authenticated user' });
      }

      const db = await storage.connect();
      let deleted;
      if (cardKeyScoped) {
        deleted = await db.collection('share_permissions').deleteMany({
          $or: [
            {
              uid: targetUid,
              targetUid: userUid,
              $or: [{ sid: cardKeyScoped }, { bId: cardKeyScoped }],
            },
            {
              uid: userUid,
              targetUid,
              $or: [{ sid: cardKeyScoped }, { bId: cardKeyScoped }],
            },
          ],
        });
      } else {
        deleted = await db.collection('share_permissions').deleteMany({
          $or: [
            { uid: userUid, targetUid },
            { uid: targetUid, targetUid: userUid },
          ],
        });
      }

      return res.status(200).json({
        ok: true,
        uid: userUid,
        targetUid,
        deletedLinks: Number(deleted?.deletedCount || 0),
      });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
  });

  /**
   * Stories API — legacy / compatibilidad.
   * La app actual ya no consume estas rutas; se mantienen para datos existentes o clientes antiguos.
   */
  router.post('/stories/state', async (req, res) => {
    try {
      const authUid = String(req.auth?.sub || '').trim();
      const userUid = String(req.body?.uid || authUid || '').trim();
      const incomingState = String(req.body?.state || 'none').trim().toLowerCase();
      const incomingPaidExternal = req.body?.isPaidExternal === true;
      const incomingSourceRaw = normalizeString(req.body?.vipSource, 'manual');
      const vipSource = ['manual', 'subscription', 'external_partner'].includes(incomingSourceRaw) ? incomingSourceRaw : 'manual';
      const paidChannel = normalizeString(req.body?.paidChannel, null);
      const manualReason = normalizeString(req.body?.manualReason, null);
      const scopeSid = normalizeString(req.body?.sid, null);
      const scopeBId = normalizeString(req.body?.bId, null);
      const cardScope = storyCardScopeFilter(userUid, scopeSid, scopeBId);

      if (!userUid) {
        return res.status(400).json({ ok: false, error: 'uid is required' });
      }
      if (authUid && authUid !== userUid) {
        return res.status(403).json({ ok: false, error: 'Forbidden: uid does not match authenticated user' });
      }
      if (!['none', 'normal', 'vip'].includes(incomingState)) {
        return res.status(400).json({ ok: false, error: 'state must be one of none|normal|vip' });
      }

      const db = await storage.connect();
      const now = new Date();

      if (cardScope) {
        if (incomingState === 'none') {
          await db.collection('story_card_states').deleteOne(cardScope);
          return res.status(200).json({
            ok: true,
            uid: userUid,
            sid: cardScope.sid || null,
            bId: cardScope.bId || null,
            state: 'none',
            expiresAt: null,
          });
        }

        const expiresAt = incomingState === 'vip'
          ? new Date(now.getTime() + STORY_VIP_TTL_DAYS * 24 * 60 * 60 * 1000)
          : new Date(now.getTime() + STORY_NORMAL_TTL_HOURS * 60 * 60 * 1000);

        await db.collection('story_card_states').findOneAndUpdate(
          cardScope,
          {
            $set: {
              uid: userUid,
              sid: cardScope.sid ?? null,
              bId: cardScope.bId ?? null,
              state: incomingState,
              isPaidExternal: incomingState === 'vip' ? incomingPaidExternal : false,
              vipSource: incomingState === 'vip' ? vipSource : 'manual',
              paidChannel: incomingState === 'vip' ? paidChannel : null,
              manualReason: incomingState === 'vip' ? manualReason : null,
              externalPaidAt: incomingState === 'vip' && incomingPaidExternal ? now : null,
              activatedByUid: authUid || userUid,
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
          uid: userUid,
          sid: cardScope.sid || null,
          bId: cardScope.bId || null,
          state: incomingState,
          expiresAt: expiresAt.toISOString(),
          isPaidExternal: incomingState === 'vip' ? incomingPaidExternal : false,
          vipSource: incomingState === 'vip' ? vipSource : null,
          paidChannel: incomingState === 'vip' ? paidChannel : null,
        });
      }

      if (incomingState === 'none') {
        await db.collection('story_states').deleteOne({ uid: userUid });
        return res.status(200).json({ ok: true, uid: userUid, state: 'none', expiresAt: null });
      }

      const expiresAt = incomingState === 'vip'
        ? new Date(now.getTime() + STORY_VIP_TTL_DAYS * 24 * 60 * 60 * 1000)
        : new Date(now.getTime() + STORY_NORMAL_TTL_HOURS * 60 * 60 * 1000);

      await db.collection('story_states').findOneAndUpdate(
        { uid: userUid },
        {
          $set: {
            uid: userUid,
            state: incomingState,
            isPaidExternal: incomingState === 'vip' ? incomingPaidExternal : false,
            vipSource: incomingState === 'vip' ? vipSource : 'manual',
            paidChannel: incomingState === 'vip' ? paidChannel : null,
            manualReason: incomingState === 'vip' ? manualReason : null,
            externalPaidAt: incomingState === 'vip' && incomingPaidExternal ? now : null,
            activatedByUid: authUid || userUid,
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
        uid: userUid,
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
      const userUid = String(req.body?.uid || '').trim();
      const paidChannel = normalizeString(req.body?.paidChannel, 'offline_partner');
      const manualReason = normalizeString(req.body?.manualReason, 'Pago confirmado fuera de app');
      const isPaidExternal = req.body?.isPaidExternal !== false;
      const vipDaysInput = Number(req.body?.vipDays || STORY_VIP_TTL_DAYS);
      const vipDays = Number.isFinite(vipDaysInput) ? Math.max(1, Math.min(30, Math.floor(vipDaysInput))) : STORY_VIP_TTL_DAYS;

      if (!userUid) {
        return res.status(400).json({ ok: false, error: 'uid is required' });
      }

      const db = await storage.connect();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + vipDays * 24 * 60 * 60 * 1000);

      await db.collection('story_states').findOneAndUpdate(
        { uid: userUid },
        {
          $set: {
            uid: userUid,
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
        uid: userUid,
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
      const userUid = String(req.query?.uid || authUid || '').trim();
      const sidQuery = normalizeString(req.query?.sid, null);
      const bIdQuery = normalizeString(req.query?.bId, null);
      const cardScope = storyCardScopeFilter(userUid, sidQuery, bIdQuery);

      if (!userUid) {
        return res.status(400).json({ ok: false, error: 'uid is required' });
      }
      if (authUid && authUid !== userUid) {
        return res.status(403).json({ ok: false, error: 'Forbidden: uid does not match authenticated user' });
      }

      const db = await storage.connect();
      const now = new Date();

      if (cardScope) {
        const row = await db.collection('story_card_states').findOne(cardScope);
        if (!row || !row.expiresAt || new Date(row.expiresAt).getTime() <= now.getTime()) {
          return res.status(200).json({
            ok: true,
            uid: userUid,
            sid: cardScope.sid || null,
            bId: cardScope.bId || null,
            state: 'none',
            expiresAt: null,
          });
        }
        const state = String(row.state || 'none');
        return res.status(200).json({
          ok: true,
          uid: userUid,
          sid: cardScope.sid || null,
          bId: cardScope.bId || null,
          state: state === 'vip' ? 'vip' : state === 'normal' ? 'normal' : 'none',
          expiresAt: new Date(row.expiresAt).toISOString(),
          isPaidExternal: Boolean(row.isPaidExternal),
          vipSource: normalizeString(row.vipSource, null),
          paidChannel: normalizeString(row.paidChannel, null),
        });
      }

      const row = await db.collection('story_states').findOne({ uid: userUid });

      if (!row || !row.expiresAt || new Date(row.expiresAt).getTime() <= now.getTime()) {
        return res.status(200).json({ ok: true, uid: userUid, state: 'none', expiresAt: null });
      }

      const state = String(row.state || 'none');
      return res.status(200).json({
        ok: true,
        uid: userUid,
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
      const userUid = String(req.query?.uid || authUid || '').trim();

      if (!userUid) {
        return res.status(400).json({ ok: false, error: 'uid is required' });
      }
      if (authUid && authUid !== userUid) {
        return res.status(403).json({ ok: false, error: 'Forbidden: uid does not match authenticated user' });
      }

      const db = await storage.connect();
      const row = await db.collection('stories_house_ads').findOne({ uid: userUid, isActive: true });

      if (!row) {
        return res.status(200).json({ ok: true, uid: userUid, ad: null });
      }

      return res.status(200).json({
        ok: true,
        uid: userUid,
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
      const userUid = String(req.body?.uid || authUid || '').trim();

      if (!userUid) {
        return res.status(400).json({ ok: false, error: 'uid is required' });
      }
      if (authUid && authUid !== userUid) {
        return res.status(403).json({ ok: false, error: 'Forbidden: uid does not match authenticated user' });
      }

      const db = await storage.connect();
      const now = new Date();

      await db.collection('stories_house_ads').findOneAndUpdate(
        { uid: userUid },
        {
          $set: {
            uid: userUid,
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

      return res.status(200).json({ ok: true, uid: userUid });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
  });

  /**
   * Conversión / interacciones por tarjeta (Fase 2). Colección `card_analytics`:
   * documentos diarios `d:{cardKey}:{YYYY-MM-DD}` y mensuales `m:{cardKey}:{YYYY-MM}`.
   */
  router.post('/analytics/track', async (req, res) => {
    try {
      const authUid = String(req.auth?.sub || '').trim();
      if (!authUid) {
        return res.status(401).json({ ok: false, error: 'Unauthorized' });
      }

      const sid = String(req.body?.sid || '').trim();
      const bId = String(req.body?.bId || '').trim();
      const cardKey = sid || bId;
      if (!cardKey || cardKey.length > 160) {
        return res.status(400).json({ ok: false, error: 'sid or bId is required' });
      }

      const type = sanitizeAnalyticsSegmentKey(req.body?.type || req.body?.actionType || 'icon_click');
      const allowedTypes = new Set(['view', 'icon_click', 'qr_scan']);
      if (!allowedTypes.has(type)) {
        return res.status(400).json({ ok: false, error: 'type must be view, icon_click, or qr_scan' });
      }
      const subType = sanitizeAnalyticsSegmentKey(req.body?.subType || req.body?.iconType || (type === 'view' ? 'modal_open' : type));
      const iconType = subType;
      const source = String(req.body?.source || type).trim().slice(0, 64);

      const ts = req.body?.timestamp ? new Date(req.body.timestamp) : new Date();
      if (Number.isNaN(ts.getTime())) {
        return res.status(400).json({ ok: false, error: 'invalid timestamp' });
      }

      const dayKey = ts.toISOString().slice(0, 10);
      const monthKey = ts.toISOString().slice(0, 7);
      const srcKey = sanitizeAnalyticsSegmentKey(source);
      const db = await storage.connect();
      const now = new Date();

      await db.collection('card_analytics').insertOne({
        _id: `e:${cardKey}:${ts.getTime()}:${crypto.randomBytes(4).toString('hex')}`,
        cardId: cardKey,
        type,
        subType,
        timestamp: ts,
        sid: sid || null,
        bId: bId || null,
        viewerUid: authUid,
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

      return res.status(200).json({ ok: true });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
  });

  router.get('/analytics/card/:cardRef/summary', async (req, res) => {
    try {
      const authUid = String(req.auth?.sub || '').trim();
      const userUid = String(req.query?.uid || authUid || '').trim();
      const cardRef = String(req.params?.cardRef || '').trim();

      if (!userUid) {
        return res.status(400).json({ ok: false, error: 'uid is required' });
      }
      if (!cardRef) {
        return res.status(400).json({ ok: false, error: 'card key is required' });
      }
      if (authUid && authUid !== userUid) {
        return res.status(403).json({ ok: false, error: 'Forbidden: uid does not match authenticated user' });
      }

      const db = await storage.connect();
      const owns = await db.collection('smart_cards').findOne(smartCardKeyQuery(userUid, cardRef));
      if (!owns) {
        return res.status(404).json({ ok: false, error: 'Card not found for this owner' });
      }

      const minDay = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const docs = await db
        .collection('card_analytics')
        .find({
          $or: [{ sid: cardRef }, { bId: cardRef }],
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

      const isBiz = owns.cardType === 'business';
      return res.status(200).json({
        ok: true,
        ...(isBiz ? { bId: cardRef } : { sid: cardRef }),
        totalViews,
        topIcons,
      });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
  });

  router.get('/analytics/card/:cardRef/events-summary', async (req, res) => {
    try {
      const authUid = String(req.auth?.sub || '').trim();
      const userUid = String(req.query?.uid || authUid || '').trim();
      const cardRef = String(req.params?.cardRef || '').trim();

      if (!userUid) {
        return res.status(400).json({ ok: false, error: 'uid is required' });
      }
      if (!cardRef) {
        return res.status(400).json({ ok: false, error: 'card key is required' });
      }
      if (authUid && authUid !== userUid) {
        return res.status(403).json({ ok: false, error: 'Forbidden: uid does not match authenticated user' });
      }

      const db = await storage.connect();
      const owns = await db.collection('smart_cards').findOne(smartCardKeyQuery(userUid, cardRef));
      if (!owns) {
        return res.status(404).json({ ok: false, error: 'Card not found for this owner' });
      }

      const window = analyticsPeriodWindow(req.query?.periodMode, req.query?.periodOffset);
      const docs = await db
        .collection('card_analytics')
        .find({
          $or: [{ cardId: cardRef }, { sid: cardRef }, { bId: cardRef }],
          type: { $in: ['view', 'icon_click', 'qr_scan'] },
          timestamp: { $gte: window.start, $lt: window.end },
        })
        .toArray();

      const points = window.labels.map(() => 0);
      const iconAgg = Object.create(null);
      let totalViews = 0;
      let totalClicks = 0;

      for (const d of docs) {
        const type = String(d.type || '').trim();
        if (type === 'view' || type === 'qr_scan') {
          totalViews += 1;
          const bucket = analyticsBucketIndex(d.timestamp, window.mode, window.start);
          if (bucket >= 0 && bucket < points.length) {
            points[bucket] += 1;
          }
        } else if (type === 'icon_click') {
          totalClicks += 1;
          const subType = sanitizeAnalyticsSegmentKey(d.subType || 'unknown');
          iconAgg[subType] = (iconAgg[subType] || 0) + 1;
        }
      }

      const topIcons = Object.entries(iconAgg)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([iconType, count]) => ({ iconType, count: Number(count) }));

      const isBiz = owns.cardType === 'business';
      return res.status(200).json({
        ok: true,
        cardId: cardRef,
        ...(isBiz ? { bId: cardRef } : { sid: cardRef }),
        periodMode: window.mode,
        periodOffset: window.offset,
        startAt: window.start.toISOString(),
        endAt: window.end.toISOString(),
        labels: window.labels,
        points,
        totalViews,
        totalClicks,
        clickRate: totalViews > 0 ? Math.round((totalClicks / totalViews) * 100) : 0,
        topIcons,
      });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
  });

  router.get('/cards/:cardRef/subscribers', async (req, res) => {
    try {
      const authUid = String(req.auth?.sub || '').trim();
      const userUid = String(req.query?.uid || authUid || '').trim();
      const cardRef = String(req.params?.cardRef || '').trim();

      if (!userUid) {
        return res.status(400).json({ ok: false, error: 'uid is required' });
      }
      if (!cardRef) {
        return res.status(400).json({ ok: false, error: 'card key is required' });
      }
      if (authUid && authUid !== userUid) {
        return res.status(403).json({ ok: false, error: 'Forbidden: uid does not match authenticated user' });
      }

      const db = await storage.connect();
      const now = new Date();

      const permissions = await db.collection('share_permissions').find(
        {
          uid: userUid,
          isRevoked: { $ne: true },
          $and: [
            { $or: [{ sid: cardRef }, { bId: cardRef }] },
            { $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }, { expiresAt: { $exists: false } }] },
          ],
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
          uid: { $in: subscriberUids },
          targetUid: userUid,
          isRevoked: { $ne: true },
          $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }, { expiresAt: { $exists: false } }],
        },
        { projection: { uid: 1 } }
      ).toArray();
      const amixesSet = new Set(amixesCursor.map((row) => String(row.uid || '').trim()));

      const neighborMap = await buildShareNeighborMap(db, now);

      const muteRows = await db.collection('card_subscriber_mutes').find({
        uid: userUid,
        $or: [{ sid: cardRef }, { bId: cardRef }],
        muted: true,
      }).toArray();
      const mutedSet = new Set(muteRows.map((m) => String(m.targetUid || '').trim()).filter(Boolean));

      const ratingBySub = new Map();
      if (subscriberUids.length) {
        const ratingAgg = await db.collection('smart_cards').aggregate([
          { $match: { uid: { $in: subscriberUids } } },
          { $group: { _id: '$uid', avgRating: { $avg: '$ratingAvg' } } },
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
        const idCard = await fetchPersonalCardIdentityDoc(db, uid);
        profile = enrichSubscriberProfileFromCard(profile, idCard);
        const mutualIds = mutualNeighborUids(neighborMap, userUid, uid);
        const mutualCount = mutualIds.length;
        const mutualPreviewPhotos = [];
        for (const mid of mutualIds.slice(0, 3)) {
          const mp = await resolveUserProfile(db, mid);
          if (mp.userAvatarUrl) {
            mutualPreviewPhotos.push(mp.userAvatarUrl);
          }
        }
        const userRating = ratingBySub.has(uid) ? ratingBySub.get(uid) : 0;

        const addedDate = addedAtByUid.get(uid);
        subscribers.push({
          uid,
          fullName: profile.fullName || profile.name,
          username: profile.username || '',
          name: profile.fullName || profile.name,
          nickname: profile.username || '',
          userAvatarUrl: profile.userAvatarUrl,
          ownerOccupation: profile.ownerOccupation || null,
          isAmixes: amixesSet.has(uid),
          userRating: Number.isFinite(userRating) ? userRating : 0,
          mutualCount,
          mutualPreviewPhotos,
          muted: mutedSet.has(uid),
          addedAt: addedDate ? addedDate.toISOString() : null,
        });
      }

      const cardRow = await db.collection('smart_cards').findOne(smartCardKeyQuery(userUid, cardRef), { projection: { cardType: 1, sid: 1, bId: 1 } });
      const isBiz = cardRow?.cardType === 'business';

      return res.status(200).json({
        ok: true,
        uid: userUid,
        ...(isBiz ? { bId: cardRef } : { sid: cardRef }),
        count: subscribers.length,
        subscribers,
      });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
  });

  router.delete('/cards/:cardRef/subscribers/:targetUid', async (req, res) => {
    try {
      const authUid = String(req.auth?.sub || '').trim();
      const userUid = String(req.body?.uid || req.query?.uid || authUid || '').trim();
      const cardRef = String(req.params?.cardRef || '').trim();
      const targetUid = String(req.params?.targetUid || req.body?.targetUid || '').trim();

      if (!userUid || !cardRef || !targetUid) {
        return res.status(400).json({ ok: false, error: 'uid, card key and targetUid are required' });
      }
      if (authUid && authUid !== userUid) {
        return res.status(403).json({ ok: false, error: 'Forbidden: uid does not match authenticated user' });
      }

      const db = await storage.connect();
      const spQ = sharePermQuery(userUid, targetUid, cardRef);
      if (!spQ) {
        return res.status(400).json({ ok: false, error: 'invalid share key' });
      }
      const deleted = await db.collection('share_permissions').deleteMany(spQ);

      await db.collection('card_subscriber_mutes').deleteMany({
        uid: userUid,
        targetUid,
        $or: [{ sid: cardRef }, { bId: cardRef }],
      });

      await db.collection('ghost_link_invites').deleteMany({
        $and: [
          { $or: [{ sourceSid: cardRef }, { sourceBId: cardRef }] },
          {
            $or: [
              { callerUid: userUid, targetUid },
              { callerUid: targetUid, targetUid: userUid },
            ],
          },
        ],
      });

      await db.collection('call_logs').deleteMany({
        $and: [
          { $or: [{ sourceSid: cardRef }, { sourceBId: cardRef }] },
          {
            $or: [
              { uid: userUid, peerUid: targetUid },
              { uid: targetUid, peerUid: userUid },
            ],
          },
        ],
      });

      return res.status(200).json({
        ok: true,
        uid: userUid,
        targetUid,
        deletedCount: Number(deleted?.deletedCount || 0),
      });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
  });

  router.post('/cards/:cardRef/subscribers/:targetUid/mute', async (req, res) => {
    try {
      const authUid = String(req.auth?.sub || '').trim();
      const userUid = String(req.body?.uid || req.query?.uid || authUid || '').trim();
      const cardRef = String(req.params?.cardRef || '').trim();
      const targetUid = String(req.params?.targetUid || '').trim();
      const muted = req.body?.muted === true;

      if (!userUid || !cardRef || !targetUid) {
        return res.status(400).json({ ok: false, error: 'uid, card key and targetUid are required' });
      }
      if (authUid && authUid !== userUid && authUid !== targetUid) {
        return res.status(403).json({ ok: false, error: 'Forbidden: caller must be card owner or subscriber' });
      }

      const db = await storage.connect();
      const now = new Date();

      if (authUid === targetUid && authUid !== userUid) {
        const permOk = await db.collection('share_permissions').findOne({
          uid: userUid,
          targetUid: authUid,
          isRevoked: { $ne: true },
          $and: [
            { $or: [{ sid: cardRef }, { bId: cardRef }] },
            { $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }, { expiresAt: { $exists: false } }] },
          ],
        });
        if (!permOk) {
          return res.status(403).json({ ok: false, error: 'Forbidden: no active share for this card' });
        }
      }

      const cdoc = await db.collection('smart_cards').findOne(smartCardKeyQuery(userUid, cardRef), { projection: { sid: 1, bId: 1 } });
      let sid = cdoc?.sid != null && String(cdoc.sid).trim() ? String(cdoc.sid).trim() : null;
      let bId = cdoc?.bId != null && String(cdoc.bId).trim() ? String(cdoc.bId).trim() : null;
      if (!cdoc) {
        sid = cardRef;
        bId = null;
      }

      const muteFilter = { uid: userUid, targetUid, sid, bId };

      if (!muted) {
        await db.collection('card_subscriber_mutes').deleteOne({
          uid: userUid,
          targetUid,
          $or: [{ sid: cardRef }, { bId: cardRef }],
        });
        return res.status(200).json({ ok: true, uid: userUid, targetUid, muted: false });
      }

      await db.collection('card_subscriber_mutes').findOneAndUpdate(
        muteFilter,
        {
          $set: {
            uid: userUid,
            sid,
            bId,
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

      return res.status(200).json({ ok: true, uid: userUid, targetUid, muted: true });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
  });

  router.post('/cards/:cardRef/silence', async (req, res) => {
    try {
      const authUid = String(req.auth?.sub || '').trim();
      const userUid = String(req.body?.uid || req.query?.uid || authUid || '').trim();
      const cardRef = String(req.params?.cardRef || '').trim();
      const silenced = req.body?.silenced === true;

      if (!userUid || !cardRef) {
        return res.status(400).json({ ok: false, error: 'uid and card key are required' });
      }
      if (authUid && authUid !== userUid) {
        return res.status(403).json({ ok: false, error: 'Forbidden: uid does not match authenticated user' });
      }

      const db = await storage.connect();
      const q = smartCardKeyQuery(userUid, cardRef);
      if (!q) {
        return res.status(400).json({ ok: false, error: 'invalid card key' });
      }
      await db.collection('smart_cards').updateOne(
        q,
        { $set: { silenced, updatedAt: new Date() } },
      );

      return res.status(200).json({ ok: true, uid: userUid, silenced });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
  });

  router.post('/relationships/block', async (req, res) => {
    try {
      const authUid = String(req.auth?.sub || '').trim();
      const userUid = String(req.body?.uid || authUid || '').trim();
      const targetUid = String(req.body?.targetUid || '').trim();

      if (!userUid || !targetUid) {
        return res.status(400).json({ ok: false, error: 'uid and targetUid are required' });
      }
      if (authUid && authUid !== userUid) {
        return res.status(403).json({ ok: false, error: 'Forbidden: uid does not match authenticated user' });
      }

      const db = await storage.connect();
      const deleted = await db.collection('share_permissions').deleteMany({
        $or: [
          { uid: userUid, targetUid },
          { uid: targetUid, targetUid: userUid },
        ],
      });

      await purgeInteractionForBlock(db, userUid, targetUid);

      const now = new Date();
      const relationKey = buildRelationKey(userUid, targetUid);
      await db.collection('blocked_relations').findOneAndUpdate(
        { relationKey },
        {
          $set: {
            relationKey,
            uidA: [userUid, targetUid].sort()[0],
            uidB: [userUid, targetUid].sort()[1],
            blockedByUid: userUid,
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
        uid: userUid,
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
      const userUid = String(req.query?.uid || authUid || '').trim();

      if (!userUid) {
        return res.status(400).json({ ok: false, error: 'uid is required' });
      }
      if (authUid && authUid !== userUid) {
        return res.status(403).json({ ok: false, error: 'Forbidden: uid does not match authenticated user' });
      }

      const db = await storage.connect();
      const rows = await db.collection('blocked_relations').find(
        {
          $or: [{ uidA: userUid }, { uidB: userUid }],
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
        const otherUid = String(row.uidA === userUid ? row.uidB : row.uidA || '').trim();
        if (!otherUid) {
          continue;
        }
        let profile = await resolveUserProfileExtended(db, otherUid);
        const bCard = await fetchLatestCardIdentityDoc(db, otherUid);
        profile = mergeContactProfileFromCard(profile, otherUid, bCard);
        blockedUsers.push({
          uid: otherUid,
          name: profile.name,
          userAvatarUrl: profile.userAvatarUrl,
          blockedByUid: String(row.blockedByUid || ''),
          createdAt: row.createdAt || null,
          blockedAt: row.updatedAt || row.createdAt || null,
        });
      }

      return res.status(200).json({
        ok: true,
        uid: userUid,
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
      const userUid = String(req.body?.uid || req.query?.uid || authUid || '').trim();
      const targetUid = String(req.params?.targetUid || req.body?.targetUid || '').trim();

      if (!userUid || !targetUid) {
        return res.status(400).json({ ok: false, error: 'uid and targetUid are required' });
      }
      if (authUid && authUid !== userUid) {
        return res.status(403).json({ ok: false, error: 'Forbidden: uid does not match authenticated user' });
      }

      const db = await storage.connect();
      const relationKey = buildRelationKey(userUid, targetUid);
      const deleted = await db.collection('blocked_relations').deleteOne({ relationKey });

      return res.status(200).json({
        ok: true,
        uid: userUid,
        targetUid,
        unblocked: Number(deleted?.deletedCount || 0) > 0,
      });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
  });

  /**
   * Historial de llamadas: lee `call_logs` y enriquece con perfil + `smart_cards` (solo smart).
   * NEGOCIO (Ghost-Link):
   * - Título / logo / `bcContactName` saliente: SOLO `business_cards` (bId + ownerUid del negocio llamado). Nada de campos owner* en smart_cards.
   * - Entrante a TU negocio: título = `bcName`; foto de fila + `display.displayPhoto` = avatar del caller (`peerUid`); subtítulo = `userFullName` del caller. Logo del negocio sólo en saliente / `bcLogoUrl` en JSON auxiliar.
   * - `userAvatarUrl` en filas business entrantes: foto de perfil del caller (paridad con Smart Card entrante).
   * Si una fila falla al enriquecer, se devuelve una entrada mínima para no vaciar la lista.
   */
  router.get('/calls/history', async (req, res) => {
    try {
      const authUid = String(req.auth?.sub || '').trim();
      const userUid = String(req.query?.uid || authUid || '').trim();

      if (!userUid) {
        return res.status(400).json({ ok: false, error: 'uid is required' });
      }
      if (authUid && authUid !== userUid) {
        return res.status(403).json({ ok: false, error: 'Forbidden: uid does not match authenticated user' });
      }

      const db = await storage.connect();
      const now = new Date();

      const rows = await db.collection('call_logs')
        .find({ uid: userUid })
        .project({
          uid: 1,
          callId: 1,
          peerUid: 1,
          sourceCardName: 1,
          sourceSid: 1,
          sourceBId: 1,
          callChannel: 1,
          direction: 1,
          status: 1,
          durationSec: 1,
          tags: 1,
          voiceNoteUri: 1,
          voiceNoteName: 1,
          callType: 1,
          isBusinessCard: 1,
          emitterCardPhotoUrl: 1,
          createdAt: 1,
          updatedAt: 1,
        })
        .sort({ createdAt: -1 })
        .toArray();

      const peerUids = Array.from(new Set(rows.map((row) => String(row.peerUid || '').trim()).filter(Boolean)));
      const activeStories = await db.collection('story_states').find(
        {
          uid: { $in: peerUids },
          expiresAt: { $gt: now },
        },
        {
          projection: {
            uid: 1,
            state: 1,
          },
        }
      ).toArray();

      const storyByOwner = new Map();
      for (const story of activeStories) {
        const uid = String(story.uid || '').trim();
        const state = String(story.state || 'none');
        if (!uid) {
          continue;
        }
        if (state === 'normal' || state === 'vip') {
          storyByOwner.set(uid, state);
        }
      }

      function fallbackCallHistoryItem(row, storyMap) {
        const peerUidF = String(row.peerUid || '').trim();
        const isBiz = row.isBusinessCard === true || row.isBusinessCard === 'true';
        return {
          callId: String(row.callId || ''),
          peerUid: peerUidF,
          displayCardName: String(row.sourceCardName || 'Tarjeta Social').trim(),
          isBusinessCard: isBiz,
          displayCardIsBusiness: isBiz,
          emitterCardContactName: null,
          peerFullName: 'Usuario',
          peerPersonalName: 'Usuario',
          userFullName: 'Usuario',
          userAvatarUrl: null,
          sourceCardName: String(row.sourceCardName || 'Tarjeta Social'),
          sourceSid: normalizeString(row.sourceSid, null),
          sourceBId: normalizeString(row.sourceBId, null),
          callChannel: 'ghost-link-voip',
          callType: String(row.callType || '').trim() === 'video' ? 'video' : 'audio',
          storyState: storyMap.get(peerUidF) || 'none',
          direction: String(row.direction || 'incoming'),
          status: String(row.status || 'completed'),
          durationSec: Number(row.durationSec || 0),
          tags: Array.isArray(row.tags) ? row.tags.map((tag) => String(tag)) : [],
          voiceNoteUri: row.voiceNoteUri ? String(row.voiceNoteUri) : null,
          voiceNoteName: row.voiceNoteName ? String(row.voiceNoteName) : null,
          createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : new Date().toISOString(),
          updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : new Date().toISOString(),
          display: {
            cardType: isBiz ? 'business' : 'smart',
            key: normalizeString(row.sourceBId, null) || normalizeString(row.sourceSid, null) || '',
            ownerUid: peerUidF,
            displayTitle: String(row.sourceCardName || 'Tarjeta Social').trim(),
            displayPhoto: null,
            displaySubtitle: null,
          },
          bcName: null,
          bcContactName: null,
          bcLogoUrl: null,
        };
      }

      /**
       * CallDisplayCard: business entrante → título `bcName`, foto = avatar caller, subtítulo = nombre caller;
       * business saliente → foto logo negocio, subtítulo = `bcContactName`.
       */
      function buildDisplayForHistoryRow({
        uiIsBusiness,
        sourceBIdNorm,
        sourceSidNorm,
        peerUid,
        displayCardName,
        bcName,
        userAvatarUrl,
        peerFullName,
        bcLogoUrl,
        bcContactName,
        direction,
      }) {
        const title = String(displayCardName || '').trim();
        const photoSmart = String(userAvatarUrl || '').trim() || null;
        const incomingLike = direction === 'incoming' || direction === 'missed';
        if (uiIsBusiness) {
          const photoBiz = String(bcLogoUrl || '').trim() || null;
          const subtitle = incomingLike
            ? String(peerFullName || '').trim() || null
            : String(bcContactName || '').trim() || null;
          const titleBiz = String(bcName || title || '').trim();
          return {
            cardType: 'business',
            key: sourceBIdNorm || sourceSidNorm || '',
            ownerUid: String(peerUid || '').trim(),
            displayTitle: titleBiz,
            displayPhoto: incomingLike ? photoSmart || photoBiz : photoBiz,
            displaySubtitle: subtitle,
          };
        }
        /** Smart entrante/missed: título = **tu** tarjeta (`displayCardName`); subtítulo = nombre del caller (`peerFullName`). */
        if (incomingLike) {
          return {
            cardType: 'smart',
            key: sourceSidNorm || sourceBIdNorm || '',
            ownerUid: String(peerUid || '').trim(),
            displayTitle: String(title || '').trim() || 'Tarjeta Social',
            displayPhoto: photoSmart,
            displaySubtitle: String(peerFullName || '').trim() || null,
          };
        }
        return {
          cardType: 'smart',
          key: sourceSidNorm || sourceBIdNorm || '',
          ownerUid: String(peerUid || '').trim(),
          displayTitle: String(peerFullName || title || '').trim(),
          displayPhoto: photoSmart,
          displaySubtitle: null,
        };
      }

      const history = [];
      for (const row of rows) {
        try {
          const logViewerUid = String(row.uid || userUid || '').trim();
          const peerUid = String(row.peerUid || '').trim();
          const direction = String(row.direction || '').trim().toLowerCase();
          const incomingLike = direction === 'incoming' || direction === 'missed';
          /** Tarjeta “puente” Ghost-Link: saliente → tarjeta del que llama (dueño del log); entrante → tarjeta del caller. */
          const cardEmitterUid = direction === 'outgoing' ? logViewerUid : peerUid;

          const sourceSidNorm = normalizeString(row.sourceSid, null);
          const sourceBIdNorm = normalizeString(row.sourceBId, null);
          const bridgeKey = sourceSidNorm || sourceBIdNorm;

          let sourceCard = null;
          if (bridgeKey && cardEmitterUid) {
            sourceCard = await db.collection('smart_cards').findOne(
              smartCardKeyQuery(cardEmitterUid, bridgeKey),
              {
                projection: {
                  scName: 1,
                  ownerDisplayName: 1,
                  ownerPhotoUrl: 1,
                  userAvatarUrl: 1,
                  cardType: 1,
                },
              },
            );
          }
          let emitterIsBusiness = row.isBusinessCard === true || row.isBusinessCard === 'true';
          if (row.isBusinessCard !== true && row.isBusinessCard !== false && sourceCard) {
            emitterIsBusiness = String(sourceCard.cardType || '').toLowerCase() === 'business';
          }

          /** Negocio: título / contacto / logo desde `business_cards` (nunca owner* de smart_cards). */
          let bizDoc = null;
          if (emitterIsBusiness && sourceBIdNorm) {
            const bizOwnerUid = incomingLike ? logViewerUid : peerUid;
            bizDoc = await db.collection('business_cards').findOne(
              { bId: sourceBIdNorm, ownerUid: bizOwnerUid },
              { projection: { bcName: 1, bcContactName: 1, bcLogoUrl: 1 } },
            );
          }
          let bcNameOut =
            bizDoc && bizDoc.bcName != null && String(bizDoc.bcName).trim()
              ? String(bizDoc.bcName).trim()
              : null;
          let bcContactNameOut =
            bizDoc && bizDoc.bcContactName != null && String(bizDoc.bcContactName).trim()
              ? String(bizDoc.bcContactName).trim()
              : null;
          let bcLogoUrlOut =
            bizDoc && bizDoc.bcLogoUrl != null && String(bizDoc.bcLogoUrl).trim()
              ? String(bizDoc.bcLogoUrl).trim()
              : null;
          if (emitterIsBusiness && !bcLogoUrlOut && row.emitterCardPhotoUrl) {
            const snap = String(row.emitterCardPhotoUrl || '').trim();
            bcLogoUrlOut = snap || null;
          }

          const peerProfile = await resolveUserProfileExtended(db, peerUid);
          /** Nombre del interlocutor (peer): perfil Mongo; en entrante a tu negocio = quien te llama. */
          let profileFullName =
            String(peerProfile.userFullName || peerProfile.fullName || peerProfile.name || '').trim();

          /**
           * Entrante/perdida a TU negocio (`emitterIsBusiness`): antes solo rellenábamos el nombre del caller
           * desde users/profiles. Si están vacíos (migración Firebase, perfil incompleto), la UI caía en
           * `peerPersonalName || 'Usuario'`. Misma fuente que smart entrante: `ownerDisplayName` de la
           * smart card personal más reciente del peer.
           */
          if (!profileFullName && incomingLike && emitterIsBusiness && peerUid) {
            const callerIdentity = await fetchPersonalCardIdentityDoc(db, peerUid);
            const fromCallerCard = String(callerIdentity?.ownerDisplayName || '').trim();
            if (fromCallerCard) {
              profileFullName = fromCallerCard;
            }
          }

          /** Smart: foto de perfil / tarjeta. Business entrante: avatar del caller (paridad UI con subtítulo). */
          let userAvatarUrl = null;
          if (!emitterIsBusiness) {
            userAvatarUrl = String(peerProfile.userAvatarUrl || '').trim() || null;
            if (direction === 'outgoing') {
              const emitterProfile = await resolveUserProfileExtended(db, logViewerUid);
              const cardPhotoRaw = sourceCard
                ? String(sourceCard.userAvatarUrl || sourceCard.ownerPhotoUrl || '').trim()
                : '';
              const cardPhoto = cardPhotoRaw || null;
              const snapEmitter = String(row.emitterCardPhotoUrl || '').trim() || null;
              const peerAv = String(peerProfile.userAvatarUrl || '').trim() || null;
              const fromProfile = String(emitterProfile.userAvatarUrl || '').trim() || null;
              userAvatarUrl = cardPhoto || snapEmitter || peerAv || fromProfile || null;
            } else if (incomingLike && sourceCard) {
              const cardPhoto = String(sourceCard.userAvatarUrl || sourceCard.ownerPhotoUrl || '').trim();
              if (cardPhoto) {
                userAvatarUrl = cardPhoto || userAvatarUrl;
              }
            }

            if (!userAvatarUrl && peerUid) {
              const peerCard = await db.collection('smart_cards').findOne(
                { uid: peerUid },
                { projection: { userAvatarUrl: 1, ownerPhotoUrl: 1 } },
              );
              if (peerCard) {
                userAvatarUrl =
                  String(peerCard.userAvatarUrl || peerCard.ownerPhotoUrl || userAvatarUrl || '').trim() || null;
              }
            }
          } else if (incomingLike) {
            userAvatarUrl = String(peerProfile.userAvatarUrl || '').trim() || null;
          }

          let peerPrimaryDoc = null;
          if (!emitterIsBusiness && peerUid) {
            peerPrimaryDoc = await fetchPersonalCardIdentityDoc(db, peerUid);
            if (peerPrimaryDoc && !profileFullName) {
              const fromCard = String(peerPrimaryDoc.ownerDisplayName || '').trim();
              if (fromCard) {
                profileFullName = fromCard;
              }
            }
          }

          if (!emitterIsBusiness && !profileFullName && sourceCard) {
            const fromSource = String(sourceCard.ownerDisplayName || '').trim();
            if (fromSource) {
              profileFullName = fromSource;
            }
          }

          const peerPersonalName = profileFullName || 'Usuario';

          let localViewerCard = null;
          if (incomingLike && logViewerUid && !emitterIsBusiness) {
            localViewerCard = await db.collection('smart_cards').findOne(
              { uid: logViewerUid, cardType: { $ne: 'business' } },
              { sort: { updatedAt: -1 }, projection: { scName: 1, cardType: 1 } },
            );
            if (!localViewerCard) {
              localViewerCard = await db.collection('smart_cards').findOne(
                { uid: logViewerUid },
                { sort: { updatedAt: -1 }, projection: { scName: 1, cardType: 1 } },
              );
            }
          }

          let displayCardName = readSmartCardScName(sourceCard)
            ? readSmartCardScName(sourceCard)
            : String(row.sourceCardName || 'Tarjeta Social').trim();
          let uiIsBusiness = emitterIsBusiness;
          if (emitterIsBusiness && bcNameOut) {
            displayCardName = bcNameOut;
          }
          if (incomingLike && localViewerCard && !emitterIsBusiness) {
            const localName = readSmartCardScName(localViewerCard);
            if (localName) {
              displayCardName = localName;
            }
            uiIsBusiness = String(localViewerCard.cardType || '').toLowerCase() === 'business';
          } else if (!incomingLike && sourceCard) {
            uiIsBusiness = String(sourceCard.cardType || '').toLowerCase() === 'business';
            if (!emitterIsBusiness) {
              displayCardName = readSmartCardScName(sourceCard) || displayCardName;
            } else if (!bcNameOut) {
              displayCardName = String(row.sourceCardName || displayCardName || '').trim() || displayCardName;
            }
          } else if (!incomingLike && !sourceCard) {
            uiIsBusiness = emitterIsBusiness;
          }

          /** Legacy: no rellenar desde ownerDisplayName en negocio. */
          const emitterCardContactName = null;

          let peerFullName = profileFullName;
          if (incomingLike) {
            peerFullName = profileFullName;
          } else if (!emitterIsBusiness) {
            const peerPrimary =
              peerPrimaryDoc || (peerUid ? await fetchPersonalCardIdentityDoc(db, peerUid) : null);
            const primaryIsBusiness =
              peerPrimary && String(peerPrimary.cardType || '').toLowerCase() === 'business';
            if (primaryIsBusiness) {
              const pub = String(peerPrimary.ownerDisplayName || '').trim();
              peerFullName = pub || profileFullName;
            } else {
              peerFullName = profileFullName;
            }
          } else {
            peerFullName = profileFullName;
          }

          const callType = String(row.callType || '').trim() === 'video' ? 'video' : 'audio';

          const display = buildDisplayForHistoryRow({
            uiIsBusiness,
            sourceBIdNorm,
            sourceSidNorm,
            peerUid,
            displayCardName,
            bcName: bcNameOut,
            userAvatarUrl,
            peerFullName,
            bcLogoUrl: bcLogoUrlOut,
            bcContactName: bcContactNameOut,
            direction,
          });

          history.push({
            callId: String(row.callId || ''),
            peerUid,
            displayCardName,
            isBusinessCard: emitterIsBusiness,
            displayCardIsBusiness: uiIsBusiness,
            emitterCardContactName,
            bcName: bcNameOut,
            bcContactName: bcContactNameOut,
            bcLogoUrl: bcLogoUrlOut,
            peerFullName,
            peerPersonalName,
            userFullName: peerFullName,
            userAvatarUrl,
            sourceCardName: String(row.sourceCardName || 'Tarjeta Social'),
            sourceSid: sourceSidNorm,
            sourceBId: sourceBIdNorm,
            callChannel: 'ghost-link-voip',
            callType,
            storyState: storyByOwner.get(peerUid) || 'none',
            direction: String(row.direction || 'incoming'),
            status: String(row.status || 'completed'),
            durationSec: Number(row.durationSec || 0),
            tags: Array.isArray(row.tags) ? row.tags.map((tag) => String(tag)) : [],
            voiceNoteUri: row.voiceNoteUri ? String(row.voiceNoteUri) : null,
            voiceNoteName: row.voiceNoteName ? String(row.voiceNoteName) : null,
            createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : new Date().toISOString(),
            updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : new Date().toISOString(),
            display,
          });
        } catch (rowErr) {
          console.warn('[calls/history] row enrich failed', String(row?.callId || ''), rowErr?.message || rowErr);
          history.push(fallbackCallHistoryItem(row, storyByOwner));
        }
      }

      return res.status(200).json({
        ok: true,
        uid: userUid,
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
      const userUid = String(req.body?.uid || authUid || '').trim();
      const peerUid = String(req.body?.peerUid || '').trim();
      const direction = String(req.body?.direction || 'incoming').trim().toLowerCase();
      const status = String(req.body?.status || 'completed').trim().toLowerCase();
      const durationSec = Number(req.body?.durationSec || 0);
      const tags = Array.isArray(req.body?.tags) ? req.body.tags.map((tag) => String(tag).trim()).filter(Boolean) : [];
      const voiceNoteUri = req.body?.voiceNoteUri ? String(req.body.voiceNoteUri).trim() : null;
      const voiceNoteName = req.body?.voiceNoteName ? String(req.body.voiceNoteName).trim() : null;
      const sourceCardName = normalizeString(req.body?.sourceCardName, 'Tarjeta Social');
      const sourceSid = normalizeString(req.body?.sourceSid, null);
      const sourceBId = normalizeString(req.body?.sourceBId, null);
      const callChannel = 'ghost-link-voip';
      const callType = ['audio', 'video'].includes(String(req.body?.callType || '').trim())
        ? String(req.body.callType).trim()
        : 'audio';
      const isBusinessCard = req.body?.isBusinessCard === true || req.body?.isBusinessCard === 'true';
      const emitterCardPhotoUrl = req.body?.emitterCardPhotoUrl
        ? String(req.body.emitterCardPhotoUrl).trim()
        : null;

      if (!userUid || !peerUid) {
        return res.status(400).json({ ok: false, error: 'uid and peerUid are required' });
      }
      if (authUid && authUid !== userUid) {
        return res.status(403).json({ ok: false, error: 'Forbidden: uid does not match authenticated user' });
      }
      if (!['incoming', 'outgoing', 'missed'].includes(direction)) {
        return res.status(400).json({ ok: false, error: 'direction must be incoming|outgoing|missed' });
      }
      if (!['completed', 'missed', 'rejected'].includes(status)) {
        return res.status(400).json({ ok: false, error: 'status must be completed|missed|rejected' });
      }

      const db = await storage.connect();
      const now = new Date();
      const callId = `${userUid}_${peerUid}_${now.getTime()}`;

      await db.collection('call_logs').insertOne({
        callId,
        uid: userUid,
        peerUid,
        direction,
        status,
        durationSec: Number.isFinite(durationSec) ? Math.max(0, Math.floor(durationSec)) : 0,
        tags,
        voiceNoteUri,
        voiceNoteName,
        sourceCardName,
        sourceSid,
        sourceBId,
        callChannel,
        callType,
        isBusinessCard,
        emitterCardPhotoUrl: emitterCardPhotoUrl || null,
        createdAt: now,
        updatedAt: now,
      });

      if (
        callChannel === 'ghost-link-voip' &&
        direction === 'outgoing' &&
        status === 'completed'
      ) {
        try {
          await recordVoipUsageForGhostOutgoingLog(storage, userUid, peerUid, durationSec);
        } catch (voipErr) {
          console.warn('[calls/logs] voip usage record failed', userUid, voipErr?.message || voipErr);
        }
      }

      return res.status(201).json({ ok: true, uid: userUid, callId });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
  });

  router.patch('/calls/logs/:callId', async (req, res) => {
    try {
      const authUid = String(req.auth?.sub || '').trim();
      const userUid = String(req.body?.uid || authUid || '').trim();
      const callId = String(req.params?.callId || req.body?.callId || '').trim();

      if (!userUid || !callId) {
        return res.status(400).json({ ok: false, error: 'uid and callId are required' });
      }
      if (authUid && authUid !== userUid) {
        return res.status(403).json({ ok: false, error: 'Forbidden: uid does not match authenticated user' });
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
          uid: userUid,
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

      return res.status(200).json({ ok: true, uid: userUid, callId });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
  });

  return router;
}

module.exports = {
  createQrRoutes,
};

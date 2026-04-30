/**
 * Resolución de segmentos para Communication Hub (preview + send).
 * Idioma y email: prioriza Firestore users/{uid} si existe cliente Admin; si no, Mongo users.
 */

const { Timestamp } = require('firebase-admin/firestore');

/** @typedef {{ uid: string; email: string; languageRaw: string; languageNorm: string }} BroadcastRecipient */

const SEGMENTS = /** @type {const} */ ([
  'new_users',
  'new_users_week',
  'welcome_monday',
  'expiring_licenses',
  'credit_holders',
  'coin_expiry_risk',
  'subscription_30d',
  'subscription_expiring_7d',
]);

function normalizeLang(raw) {
  const s = String(raw || '')
    .trim()
    .toLowerCase();
  if (!s) return 'en';
  if (s.startsWith('es')) return 'es';
  if (s.startsWith('it')) return 'it';
  if (s.startsWith('fr')) return 'fr';
  if (s.startsWith('pt')) return 'pt';
  if (s.startsWith('en')) return 'en';
  return 'en';
}

function mongoUserId(row) {
  const u = row && typeof row.uid === 'string' ? row.uid.trim() : '';
  if (u) return u;
  return '';
}

function startOfUtcDay(d) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function previousIsoWeekUtcBounds(now = new Date()) {
  const d = startOfUtcDay(now);
  const dow = d.getUTCDay();
  const toMonday = dow === 0 ? 6 : dow - 1;
  d.setUTCDate(d.getUTCDate() - toMonday);
  const thisMonday = new Date(d);
  const lastMonday = new Date(thisMonday);
  lastMonday.setUTCDate(lastMonday.getUTCDate() - 7);
  const lastSunday = new Date(thisMonday);
  lastSunday.setUTCDate(lastSunday.getUTCDate() - 1);
  lastSunday.setUTCHours(23, 59, 59, 999);
  return { start: lastMonday, end: lastSunday };
}

/**
 * @param {import('mongodb').Db} db
 * @param {FirebaseFirestore.Firestore | null} fs
 * @param {string} segment
 * @param {{ days?: number }} [options]
 * @returns {Promise<BroadcastRecipient[]>}
 */
async function resolveBroadcastRecipients(db, fs, segment, options = {}) {
  if (!SEGMENTS.includes(segment)) {
    const err = new Error(`Unknown segment: ${segment}`);
    err.code = 'BAD_SEGMENT';
    throw err;
  }

  const now = new Date();
  const days = Math.max(1, Math.min(90, Number(options.days) || 7));
  const daysNewUsers = segment === 'new_users_week' ? 7 : days;
  /** @type {Map<string, { uid: string; email: string; languageRaw: string }>} */
  const acc = new Map();

  const put = (uid, email, languageRaw) => {
    const u = String(uid || '').trim();
    if (!u) return;
    const em = String(email || '').trim().toLowerCase();
    acc.set(u, { uid: u, email: em, languageRaw: String(languageRaw || '').trim() });
  };

  if (segment === 'new_users' || segment === 'new_users_week') {
    const since = new Date(now);
    since.setUTCDate(since.getUTCDate() - daysNewUsers);
    since.setUTCHours(0, 0, 0, 0);
    if (fs) {
      const snap = await fs
        .collection('users')
        .where('createdAt', '>=', Timestamp.fromDate(since))
        .limit(8000)
        .get();
      snap.forEach((doc) => {
        const d = doc.data();
        put(doc.id, d.emailLower || d.email, d.language || d.appLanguage || d.locale);
      });
    } else {
      const rows = await db
        .collection('users')
        .find(
          { createdAt: { $gte: since } },
          { projection: { uid: 1, email: 1, emailLower: 1, language: 1, appLanguage: 1 } },
        )
        .limit(8000)
        .toArray();
      for (const r of rows) {
        const id = mongoUserId(r);
        if (!id) continue;
        put(id, r.emailLower || r.email, r.language || r.appLanguage);
      }
    }
  } else if (segment === 'welcome_monday') {
    const { start, end } = previousIsoWeekUtcBounds(now);
    if (fs) {
      const snap = await fs
        .collection('users')
        .where('createdAt', '>=', Timestamp.fromDate(start))
        .where('createdAt', '<=', Timestamp.fromDate(end))
        .limit(8000)
        .get();
      snap.forEach((doc) => {
        const d = doc.data();
        put(doc.id, d.emailLower || d.email, d.language || d.appLanguage || d.locale);
      });
    } else {
      const rows = await db
        .collection('users')
        .find(
          { createdAt: { $gte: start, $lte: end } },
          { projection: { uid: 1, email: 1, emailLower: 1, language: 1, appLanguage: 1 } },
        )
        .limit(8000)
        .toArray();
      for (const r of rows) {
        const id = mongoUserId(r);
        if (!id) continue;
        put(id, r.emailLower || r.email, r.language || r.appLanguage);
      }
    }
  } else if (segment === 'expiring_licenses') {
    const in7 = new Date(now.getTime() + 7 * 86400000);
    const uids = await db.collection('business_card_licenses').distinct('uid', {
      isActive: true,
      expiresAt: { $gt: now, $lte: in7 },
    });
    for (const uid of uids) put(String(uid), '', '');
  } else if (segment === 'credit_holders') {
    const rows = await db
      .collection('users')
      .find(
        { creditsBalance: { $gt: 0 } },
        { projection: { uid: 1, email: 1, emailLower: 1, language: 1, appLanguage: 1 } },
      )
      .limit(12000)
      .toArray();
    for (const r of rows) {
      const id = mongoUserId(r);
      if (!id) continue;
      put(id, r.emailLower || r.email, r.language || r.appLanguage);
    }
  } else if (segment === 'coin_expiry_risk') {
    const sixMonthsAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 6, now.getUTCDate()));
    const rows = await db
      .collection('users')
      .find(
        {
          creditsBalance: { $gt: 0 },
          $or: [
            { lastCreditActivityAt: { $lt: sixMonthsAgo } },
            { lastUpdated: { $lt: sixMonthsAgo } },
            { updatedAt: { $lt: sixMonthsAgo } },
            { createdAt: { $lt: sixMonthsAgo } },
          ],
        },
        { projection: { uid: 1, email: 1, emailLower: 1, language: 1, appLanguage: 1 } },
      )
      .limit(12000)
      .toArray();
    for (const r of rows) {
      const id = mongoUserId(r);
      if (!id) continue;
      put(id, r.emailLower || r.email, r.language || r.appLanguage);
    }
  } else if (segment === 'subscription_30d') {
    const in30 = new Date(now.getTime() + 30 * 86400000);
    const rows = await db
      .collection('users')
      .find(
        {
          subscriptionExpiresAt: { $gt: now, $lte: in30 },
        },
        { projection: { uid: 1, email: 1, emailLower: 1, language: 1, appLanguage: 1 } },
      )
      .limit(8000)
      .toArray();
    for (const r of rows) {
      const id = mongoUserId(r);
      if (!id) continue;
      put(id, r.emailLower || r.email, r.language || r.appLanguage);
    }
  } else if (segment === 'subscription_expiring_7d') {
    const in7s = new Date(now.getTime() + 7 * 86400000);
    const rows = await db
      .collection('users')
      .find(
        {
          subscriptionExpiresAt: { $gt: now, $lte: in7s },
        },
        { projection: { uid: 1, email: 1, emailLower: 1, language: 1, appLanguage: 1 } },
      )
      .limit(8000)
      .toArray();
    for (const r of rows) {
      const id = mongoUserId(r);
      if (!id) continue;
      put(id, r.emailLower || r.email, r.language || r.appLanguage);
    }
  }

  const uids = [...acc.keys()];
  if (uids.length && fs) {
    const chunk = 10;
    for (let i = 0; i < uids.length; i += chunk) {
      const part = uids.slice(i, i + chunk);
      const refs = part.map((uid) => fs.collection('users').doc(uid));
      const snaps = await fs.getAll(...refs);
      snaps.forEach((s, j) => {
        if (!s.exists) return;
        const d = s.data();
        const prev = acc.get(part[j]);
        if (!prev) return;
        const email = String(d.emailLower || d.email || prev.email || '')
          .trim()
          .toLowerCase();
        const lang = d.language || d.appLanguage || d.locale || prev.languageRaw;
        acc.set(part[j], { uid: part[j], email, languageRaw: String(lang || '').trim() });
      });
    }
  }

  if (uids.length) {
    const needEmail = uids.filter((u) => !acc.get(u)?.email);
    if (needEmail.length) {
      const rows = await db
        .collection('users')
        .find(
          { uid: { $in: needEmail } },
          { projection: { uid: 1, email: 1, emailLower: 1, language: 1, appLanguage: 1 } },
        )
        .limit(needEmail.length)
        .toArray();
      const byUid = new Map(rows.map((r) => [mongoUserId(r), r]));
      for (const uid of needEmail) {
        const row = byUid.get(uid);
        const cur = acc.get(uid);
        if (!cur || !row) continue;
        const email = String(cur.email || row.emailLower || row.email || '')
          .trim()
          .toLowerCase();
        const lang = cur.languageRaw || row.language || row.appLanguage || '';
        acc.set(uid, { uid, email, languageRaw: String(lang || '').trim() });
      }
    }
  }

  return [...acc.values()].map((r) => ({
    ...r,
    languageNorm: normalizeLang(r.languageRaw),
  }));
}

module.exports = {
  SEGMENTS,
  resolveBroadcastRecipients,
  normalizeLang,
};

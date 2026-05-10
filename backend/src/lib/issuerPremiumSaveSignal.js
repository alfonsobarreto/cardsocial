/**
 * Paridad conceptual con la app (`services/tiersConfigService.effectiveTierKeyFromUserData`)
 * + Legacy Path (`services/legacyPathEngine`): platino/diamante empujan la micro-interacción “Ferrari”.
 */

const { getFirestoreOptional } = require('./firebaseAdminApp');

const LEGACY_ORDER = ['none', 'silver', 'gold', 'platinum', 'diamond'];

function legacyRank(tier) {
  const i = LEGACY_ORDER.indexOf(tier);
  return i >= 0 ? i : 0;
}

function parseLegacyTier(raw) {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (s === 'silver' || s === 'gold' || s === 'platinum' || s === 'diamond' || s === 'none') {
    return s;
  }
  return 'none';
}

function normalizeTierKey(value) {
  const t = String(value ?? '')
    .trim()
    .toLowerCase();
  if (t === 'free' || t === 'influencer' || t === 'business') return t;
  return null;
}

function subscriptionTierActive(data) {
  if (!data || typeof data !== 'object') return false;
  const untilRaw = data.premiumUntil ?? data.subscriptionExpiresAt;
  if (untilRaw != null && untilRaw !== '') {
    let d = null;
    if (untilRaw instanceof Date) {
      d = untilRaw;
    } else if (untilRaw && typeof untilRaw.toDate === 'function') {
      try {
        d = untilRaw.toDate();
      } catch {
        d = null;
      }
    } else {
      d = new Date(String(untilRaw));
    }
    if (d && !Number.isNaN(d.getTime()) && d.getTime() > Date.now()) return true;
  }
  const st = String(data.subscriptionStatus ?? '').trim().toLowerCase();
  if (st === 'active' && data.isPremium === true) return true;
  return false;
}

function effectiveTierKeyFromUserData(data) {
  if (!data || typeof data !== 'object') return 'free';
  if (!subscriptionTierActive(data)) return 'free';
  const t = normalizeTierKey(data.tier ?? data.currentTier ?? data.subscriptionTier);
  if (t === 'influencer' || t === 'business') return t;
  return 'free';
}

/** Emisor con rol operativo → siempre experiencia “Ferrari” al guardarse en Búnker (paridad cliente `roleService`). */
function issuerHasAdminOrSuperAdminRole(data) {
  if (!data || typeof data !== 'object') return false;
  const r = String(data.role ?? '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_');
  return r === 'super_admin' || r === 'admin';
}

/**
 * Tier pago efectivo (`business` / `influencer`) o Legacy ≥ Platino → feedback premium al guardar en Búnker.
 * @param {Record<string, unknown>|null|undefined} data — doc Firestore `users/{uid}` o subset Mongo `users`.
 */
function issuerPremiumSaveExperienceFromUserDocData(data) {
  if (!data || typeof data !== 'object') return false;
  if (issuerHasAdminOrSuperAdminRole(data)) return true;
  const tier = effectiveTierKeyFromUserData(data);
  if (tier === 'business' || tier === 'influencer') return true;
  const legacy = parseLegacyTier(data.legacyTier);
  return legacyRank(legacy) >= legacyRank('platinum');
}

/**
 * Intenta Firestore Admin; si no hay admin o sin doc, lee Mongo `users` como respaldo con proyección mínima.
 * @param {*} storage — `createQrRoutes({ storage })` con `connect()`.
 * @param {string} issuerUid
 */
async function resolveIssuerPremiumSaveExperience(storage, issuerUid) {
  const id = String(issuerUid || '').trim();
  if (!id) return false;

  const fs = getFirestoreOptional();
  if (fs) {
    try {
      const snap = await fs.collection('users').doc(id).get();
      if (snap.exists) {
        return issuerPremiumSaveExperienceFromUserDocData(snap.data());
      }
    } catch {
      /* cae a mongo */
    }
  }

  try {
    const connect = storage && typeof storage.connect === 'function' ? storage.connect.bind(storage) : null;
    if (!connect) return false;
    const db = await connect();
    const u = await db.collection('users').findOne(
      { uid: id },
      {
        projection: {
          role: 1,
          tier: 1,
          currentTier: 1,
          subscriptionTier: 1,
          isPremium: 1,
          subscriptionStatus: 1,
          premiumUntil: 1,
          subscriptionExpiresAt: 1,
          legacyTier: 1,
        },
      },
    );
    if (u && typeof u === 'object') {
      return issuerPremiumSaveExperienceFromUserDocData(u);
    }
  } catch {
    return false;
  }

  return false;
}

module.exports = {
  issuerHasAdminOrSuperAdminRole,
  issuerPremiumSaveExperienceFromUserDocData,
  resolveIssuerPremiumSaveExperience,
};

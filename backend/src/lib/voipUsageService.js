/**
 * Minutos VoIP (Agora Ghost-Link): cupo incluido por tier (`system_config/tiers.voipMinutesIncluded`)
 * + saldo comprado (`voipPurchasedMinutesRemaining`, futura tienda).
 * El uso incluido se reinicia cada mes UTC (lazy al leer/escribir). Los minutos comprados no caducan con el ciclo.
 */

const { getFirestoreOptional } = require('./firebaseAdminApp');

/** @typedef {'free'|'influencer'|'business'} TierKey */

/** Sin minutos por defecto: solo Firestore `system_config/tiers` (cache 60s). */
const ZERO_VOIP_INCLUDED = 0;

function utcMonthKey(d = new Date()) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function normalizeTierKey(value) {
  const t = String(value ?? '')
    .trim()
    .toLowerCase();
  if (t === 'free') return 'free';
  if (t === 'influencer') return 'influencer';
  /** Business / Pro / alias usados en RC, CMS o datos legacy */
  if (
    t === 'business' ||
    t === 'corporate' ||
    t === 'pro' ||
    t === 'premium' ||
    t === 'card_social_pro' ||
    t === 'cardsocialpro' ||
    t === 'negocio'
  ) {
    return 'business';
  }
  return null;
}

/**
 * Misma señal de “suscripción útil” que `limitService.isPremiumUser` (app): no exigir isPremium y active a la vez.
 */
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
  if (st === 'active' || st === 'active-premium') return true;
  if (data.isPremium === true) return true;
  return false;
}

/**
 * Tier efectivo para cupo VoIP: alineado con `tiersConfigService` (trial Radar → business;
 * suscripción activa sin `tier` → business, donde suelen estar los minutos del CMS).
 */
async function resolveEffectiveVoipTierKey(merged) {
  if (await readRadarTrialEnabledFromFirestore()) {
    return 'business';
  }
  if (!subscriptionTierActive(merged)) {
    return 'free';
  }
  const t = normalizeTierKey(merged.tier ?? merged.currentTier ?? merged.subscriptionTier);
  if (t === 'influencer' || t === 'business') return t;
  if (t === 'free') return 'free';
  return 'business';
}

function issuerHasAdminOrSuperAdminRole(data) {
  if (!data || typeof data !== 'object') return false;
  const r = String(data.role ?? '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_');
  return r === 'super_admin' || r === 'admin';
}

/** Suscripción activa con cupo propio (Influencer, Business o Pro sin campo `tier`). */
function callerHasBillablePaidTier(data) {
  if (!data || typeof data !== 'object') return false;
  if (!subscriptionTierActive(data)) return false;
  const t = normalizeTierKey(data.tier ?? data.currentTier ?? data.subscriptionTier);
  if (t === 'free') return false;
  if (t === 'influencer' || t === 'business') return true;
  return true;
}

/** Tier Business activo: puede asumir coste cuando un contacto gratis inicia la llamada. */
function calleeIsBusinessServiceTier(data) {
  if (!data || typeof data !== 'object') return false;
  if (!subscriptionTierActive(data)) return false;
  return normalizeTierKey(data.tier ?? data.currentTier ?? data.subscriptionTier) === 'business';
}

/**
 * @param {*} storage
 * @param {string} callerUid
 * @param {string} targetUid
 */
async function resolveVoipBillingUid(storage, callerUid, targetUid) {
  const c = String(callerUid || '').trim();
  const t = String(targetUid || '').trim();
  if (!c) return c;
  const caller = await readUserMergeFirestoreMongo(storage, c);
  if (issuerHasAdminOrSuperAdminRole(caller)) return c;
  if (callerHasBillablePaidTier(caller)) return c;
  if (!t) return c;
  const target = await readUserMergeFirestoreMongo(storage, t);
  if (calleeIsBusinessServiceTier(target)) return t;
  return c;
}

function coerceNumber(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * @param {Record<string, unknown>|undefined} rawTiersDoc
 * @param {TierKey} key
 */
function voipIncludedForTier(rawTiersDoc, key) {
  if (!rawTiersDoc || typeof rawTiersDoc !== 'object') return ZERO_VOIP_INCLUDED;
  const block = rawTiersDoc[key];
  if (!block || typeof block !== 'object') return ZERO_VOIP_INCLUDED;
  const n = Number(block.voipMinutesIncluded);
  if (Number.isFinite(n)) return Math.max(0, Math.floor(n));
  return ZERO_VOIP_INCLUDED;
}

let tiersCache = { at: 0, doc: null };
const TIERS_CACHE_MS = 60_000;

async function loadTiersDocFresh(fs) {
  const snap = await fs.collection('system_config').doc('tiers').get();
  return snap.exists ? snap.data() : null;
}

/**
 * @param {import('firebase-admin').firestore.Firestore} fs
 */
async function getTiersDocCached(fs) {
  const now = Date.now();
  if (tiersCache.doc != null && now - tiersCache.at < TIERS_CACHE_MS) {
    return tiersCache.doc;
  }
  const doc = await loadTiersDocFresh(fs);
  tiersCache = { at: now, doc };
  return doc;
}

/**
 * @param {*} storage
 * @param {string} uid
 * @returns {Promise<Record<string, unknown>>}
 */
async function readUserMergeFirestoreMongo(storage, uid) {
  const id = String(uid || '').trim();
  const fromFs = {};
  const fs = getFirestoreOptional();
  if (fs) {
    try {
      const snap = await fs.collection('users').doc(id).get();
      if (snap.exists) {
        Object.assign(fromFs, snap.data() || {});
      }
    } catch {
      /* mongo only */
    }
  }
  let fromMongo = null;
  try {
    const connect = storage && typeof storage.connect === 'function' ? storage.connect.bind(storage) : null;
    if (connect) {
      const db = await connect();
      fromMongo = await db.collection('users').findOne(
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
            voipSubscriptionMinutesUsed: 1,
            voipSubscriptionCycleKey: 1,
            voipPurchasedMinutesRemaining: 1,
          },
        },
      );
    }
  } catch {
    fromMongo = null;
  }
  const out = { ...(fromMongo && typeof fromMongo === 'object' ? fromMongo : {}) };
  Object.assign(out, fromFs);
  return out;
}

/** `system_config/market_radar.radar_trial_enabled` — cache corta (misma fuente que mint Radar). */
const RADAR_TRIAL_AGORA_CAP_SEC = 60 * 60;
const AGORA_SUPERADMIN_MIN_PRIVILEGE_SEC = 24 * 60 * 60;

let radarTrialCache = { at: 0, value: false };
const RADAR_TRIAL_CACHE_MS = 30_000;

async function readRadarTrialEnabledFromFirestore() {
  const fs = getFirestoreOptional();
  if (!fs) return false;
  const now = Date.now();
  if (now - radarTrialCache.at < RADAR_TRIAL_CACHE_MS) return radarTrialCache.value;
  try {
    const snap = await fs.collection('system_config').doc('market_radar').get();
    const v = Boolean(snap.exists && snap.data()?.radar_trial_enabled === true);
    radarTrialCache = { at: now, value: v };
    return v;
  } catch {
    radarTrialCache = { at: now, value: false };
    return false;
  }
}

/** Solo `super_admin` queda exento del tope Agora de 60 min en modo prueba (`admin` sí recibe el tope). */
function isSuperAdminOnlyRole(data) {
  if (!data || typeof data !== 'object') return false;
  const r = String(data.role ?? '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_');
  return r === 'super_admin';
}

/**
 * TTL token/privilegio Agora (`agora-token` v2: segundos desde “ahora”) para Ghost-Link.
 * Modo prueba ON: 60 min por lado salvo `role === super_admin`.
 *
 * @param {*} storage
 * @param {string} callerUid
 * @param {string} targetUid
 * @param {number} ttlSeconds
 */
async function computeGhostLinkAgoraExpireDurations(storage, callerUid, targetUid, ttlSeconds) {
  const baseTtl = Math.max(60, Number(ttlSeconds || 45) + 300);
  const trial = await readRadarTrialEnabledFromFirestore();
  if (!trial) {
    return {
      callerTokenExpire: baseTtl,
      callerPrivilegeExpire: baseTtl,
      calleeTokenExpire: baseTtl,
      calleePrivilegeExpire: baseTtl,
      trialCap: null,
    };
  }
  const c = String(callerUid || '').trim();
  const t = String(targetUid || '').trim();
  const [caller, callee] = await Promise.all([
    readUserMergeFirestoreMongo(storage, c),
    t ? readUserMergeFirestoreMongo(storage, t) : Promise.resolve({}),
  ]);
  const callerSuper = isSuperAdminOnlyRole(caller);
  const calleeSuper = isSuperAdminOnlyRole(callee);
  const longTtl = Math.max(baseTtl, AGORA_SUPERADMIN_MIN_PRIVILEGE_SEC);
  return {
    callerTokenExpire: callerSuper ? longTtl : RADAR_TRIAL_AGORA_CAP_SEC,
    callerPrivilegeExpire: callerSuper ? longTtl : RADAR_TRIAL_AGORA_CAP_SEC,
    calleeTokenExpire: calleeSuper ? longTtl : RADAR_TRIAL_AGORA_CAP_SEC,
    calleePrivilegeExpire: calleeSuper ? longTtl : RADAR_TRIAL_AGORA_CAP_SEC,
    trialCap: {
      callerMinutes: callerSuper ? null : 60,
      calleeMinutes: calleeSuper ? null : 60,
    },
  };
}

/**
 * @param {Record<string, unknown>} merged
 * @param {string} month
 */
function ensureCycleResetFields(merged, month) {
  let used = coerceNumber(merged.voipSubscriptionMinutesUsed, 0);
  let cycle = String(merged.voipSubscriptionCycleKey || '').trim();
  if (cycle !== month) {
    used = 0;
    cycle = month;
  }
  return { used, cycle, purchased: Math.max(0, Math.floor(coerceNumber(merged.voipPurchasedMinutesRemaining, 0))) };
}

function billableMinutes(durationSec) {
  const s = Number(durationSec);
  if (!Number.isFinite(s) || s <= 0) return 0;
  return Math.ceil(s / 60);
}

/**
 * @param {*} storage
 * @param {string} uid
 */
async function persistVoipFields(storage, uid, patch) {
  const id = String(uid || '').trim();
  const fs = getFirestoreOptional();
  if (fs) {
    try {
      await fs.collection('users').doc(id).set(patch, { merge: true });
    } catch (e) {
      console.warn('[voipUsage] Firestore persist failed', id, e?.message || e);
    }
  }
  try {
    const connect = storage && typeof storage.connect === 'function' ? storage.connect.bind(storage) : null;
    if (!connect) return;
    const db = await connect();
    await db.collection('users').updateOne(
      { uid: id },
      {
        $set: {
          ...patch,
          updatedAt: new Date(),
        },
      },
      { upsert: true },
    );
  } catch (e) {
    console.warn('[voipUsage] Mongo persist failed', id, e?.message || e);
  }
}

/**
 * @param {*} storage
 * @param {string} callerUid
 * @returns {Promise<{ ok: boolean, error?: string, summary?: object }>}
 */
async function checkCallerVoipMinutes(storage, callerUid) {
  const uid = String(callerUid || '').trim();
  if (!uid) {
    return { ok: false, error: 'uid requerido' };
  }
  const fs = getFirestoreOptional();
  const month = utcMonthKey();
  const merged = await readUserMergeFirestoreMongo(storage, uid);
  if (issuerHasAdminOrSuperAdminRole(merged)) {
    return {
      ok: true,
      summary: {
        unlimited: true,
        cycleKey: month,
        subscriptionUsedMinutes: 0,
        subscriptionIncludedMinutes: 0,
        purchasedMinutesRemaining: 0,
        totalAvailableMinutes: 999999,
      },
    };
  }
  const tier = await resolveEffectiveVoipTierKey(merged);
  let rawTiers = null;
  if (fs) {
    try {
      rawTiers = await getTiersDocCached(fs);
    } catch {
      rawTiers = null;
    }
  }
  const included = voipIncludedForTier(rawTiers, tier);
  const { used, cycle, purchased } = ensureCycleResetFields(merged, month);
  const persistedCycle = String(merged.voipSubscriptionCycleKey || '').trim();
  if (persistedCycle !== month) {
    await persistVoipFields(storage, uid, {
      voipSubscriptionCycleKey: month,
      voipSubscriptionMinutesUsed: 0,
    });
  }
  const subRemaining = Math.max(0, included - used);
  const total = subRemaining + purchased;
  if (total < 1) {
    return {
      ok: false,
      error: 'Minutos de llamadas agotados. Actualiza tu plan o compra minutos (próximamente en tienda).',
      summary: {
        unlimited: false,
        cycleKey: cycle,
        subscriptionUsedMinutes: used,
        subscriptionIncludedMinutes: included,
        purchasedMinutesRemaining: purchased,
        totalAvailableMinutes: total,
      },
    };
  }
  return {
    ok: true,
    summary: {
      unlimited: false,
      cycleKey: cycle,
      subscriptionUsedMinutes: used,
      subscriptionIncludedMinutes: included,
      purchasedMinutesRemaining: purchased,
      totalAvailableMinutes: total,
    },
  };
}

/**
 * @param {*} storage
 * @param {string} callerUid
 * @param {string} targetUid
 */
async function checkVoipGateForGhostLink(storage, callerUid, targetUid) {
  const c = String(callerUid || '').trim();
  if (!c) return { ok: false, error: 'uid requerido', billingUid: c };
  const caller = await readUserMergeFirestoreMongo(storage, c);
  if (issuerHasAdminOrSuperAdminRole(caller)) {
    return { ok: true, billingUid: c };
  }
  const billingUid = await resolveVoipBillingUid(storage, callerUid, targetUid);
  const gate = await checkCallerVoipMinutes(storage, billingUid);
  if (!gate.ok && billingUid !== c) {
    return {
      ok: false,
      error:
        'El negocio no tiene minutos de llamada disponibles. El titular del plan Business debe ampliar cupo o comprar minutos.',
      billingUid,
      summary: gate.summary,
    };
  }
  return { ...gate, billingUid };
}

/**
 * @param {*} storage
 * @param {string} userUid
 * @param {number} durationSec
 */
async function recordVoipUsageForOutgoingCall(storage, userUid, durationSec) {
  const uid = String(userUid || '').trim();
  const bill = billableMinutes(durationSec);
  if (!uid || bill < 1) return;
  const fs = getFirestoreOptional();
  const month = utcMonthKey();
  const merged = await readUserMergeFirestoreMongo(storage, uid);
  if (issuerHasAdminOrSuperAdminRole(merged)) return;
  let { used, cycle, purchased } = ensureCycleResetFields(merged, month);
  const tier = await resolveEffectiveVoipTierKey(merged);
  let rawTiers = null;
  if (fs) {
    try {
      rawTiers = await getTiersDocCached(fs);
    } catch {
      rawTiers = null;
    }
  }
  const included = voipIncludedForTier(rawTiers, tier);
  let remaining = bill;
  const subRemaining = Math.max(0, included - used);
  const takeSub = Math.min(remaining, subRemaining);
  used += takeSub;
  remaining -= takeSub;
  if (remaining > 0) {
    purchased = Math.max(0, purchased - remaining);
  }
  await persistVoipFields(storage, uid, {
    voipSubscriptionCycleKey: cycle,
    voipSubscriptionMinutesUsed: used,
    voipPurchasedMinutesRemaining: purchased,
  });
}

/**
 * @param {*} storage
 * @param {string} callerUid
 * @param {string} peerUid
 * @param {number} durationSec
 */
async function recordVoipUsageForGhostOutgoingLog(storage, callerUid, peerUid, durationSec) {
  const billingUid = await resolveVoipBillingUid(storage, callerUid, peerUid);
  await recordVoipUsageForOutgoingCall(storage, billingUid, durationSec);
}

/**
 * @param {*} storage
 * @param {string} uid
 */
async function getVoipMinutesSummary(storage, uid) {
  const r = await checkCallerVoipMinutes(storage, uid);
  return (
    r.summary || {
      unlimited: false,
      cycleKey: utcMonthKey(),
      subscriptionUsedMinutes: 0,
      subscriptionIncludedMinutes: 0,
      purchasedMinutesRemaining: 0,
      totalAvailableMinutes: 0,
    }
  );
}

module.exports = {
  checkCallerVoipMinutes,
  checkVoipGateForGhostLink,
  resolveVoipBillingUid,
  recordVoipUsageForOutgoingCall,
  recordVoipUsageForGhostOutgoingLog,
  getVoipMinutesSummary,
  utcMonthKey,
  computeGhostLinkAgoraExpireDurations,
};

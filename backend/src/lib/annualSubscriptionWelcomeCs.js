/**
 * Bono único de CS al activar o renovar suscripción ANUAL (RevenueCat).
 * Montos por tier en Firestore `system_config/tiers` → `{free|influencer|business}.annualWelcomeGiftCs`.
 * Sin regalo mensual: solo INITIAL_PURCHASE / RENEWAL cuando la suscripción es anual.
 */

const crypto = require('crypto');
const { FieldValue } = require('firebase-admin/firestore');

const TIER_KEYS = ['free', 'influencer', 'business'];

/**
 * @param {string} productId
 * @returns {'free'|'influencer'|'business'}
 */
function tierKeyFromRcProductId(productId) {
  const p = String(productId || '').toLowerCase();
  if (p.includes('influencer')) return 'influencer';
  if (p.includes('business')) return 'business';
  return 'business';
}

/**
 * Excluye mensual; incluye anual por duración o por nombre del SKU.
 * @param {Record<string, unknown>} ev RevenueCat event object
 * @param {string} [productId]
 */
function isAnnualSubscriptionRcEvent(ev, productId) {
  const pid = String(productId || ev?.product_id || '').toLowerCase();
  if (/\bmonthly\b|\bmonth\b|_mo\b|_month\b|p1m\b|30_day|30day/.test(pid)) {
    return false;
  }
  const purchasedMs = (() => {
    const n = Number(ev?.purchased_at_ms ?? 0);
    if (Number.isFinite(n) && n > 0) return n;
    if (ev?.purchase_date || ev?.purchased_at) {
      const d = new Date(String(ev.purchase_date || ev.purchased_at));
      const t = d.getTime();
      return Number.isFinite(t) ? t : 0;
    }
    return 0;
  })();
  const expMs = (() => {
    const n = Number(ev?.expiration_at_ms ?? 0);
    if (Number.isFinite(n) && n > 0) return n;
    if (ev?.expiration_date || ev?.expiration_at) {
      const d = new Date(String(ev.expiration_date || ev.expiration_at));
      const t = d.getTime();
      return Number.isFinite(t) ? t : 0;
    }
    return 0;
  })();
  if (Number.isFinite(purchasedMs) && Number.isFinite(expMs) && expMs > purchasedMs) {
    const days = (expMs - purchasedMs) / 86400000;
    if (days >= 300) return true;
    if (days <= 45) return false;
  }
  if (/\bannual\b|\byearly\b|_year|year_|12m|p1y|_yr\b/.test(pid)) return true;
  return false;
}

function coerceTierAnnualGiftCs(rawTier) {
  if (!rawTier || typeof rawTier !== 'object') return 0;
  return Math.max(0, Math.floor(Number(rawTier.annualWelcomeGiftCs) || 0));
}

/**
 * @param {FirebaseFirestore.Firestore} fs
 * @returns {Promise<Record<string, { annualWelcomeGiftCs: number }>>}
 */
async function loadAnnualWelcomeGiftCsByTier(fs) {
  const snap = await fs.collection('system_config').doc('tiers').get();
  const data = snap.exists ? snap.data() || {} : {};
  /** @type {Record<string, { annualWelcomeGiftCs: number }>} */
  const out = {};
  for (const key of TIER_KEYS) {
    const tierObj = data[key];
    out[key] = {
      annualWelcomeGiftCs: coerceTierAnnualGiftCs(typeof tierObj === 'object' && tierObj ? tierObj : {}),
    };
  }
  return out;
}

function stableGrantDocId(uid, productId, ev) {
  const explicit = ev?.id != null ? String(ev.id).trim() : '';
  if (explicit) {
    return explicit.replace(/[/\\]/g, '_').slice(0, 450);
  }
  const purchasePart =
    ev?.purchased_at_ms != null
      ? String(ev.purchased_at_ms)
      : String(ev?.purchase_date || ev?.purchased_at || '');
  const h = crypto
    .createHash('sha256')
    .update(`${uid}|${productId}|${purchasePart}|${ev?.type || ''}`, 'utf8')
    .digest('hex')
    .slice(0, 40);
  return `h_${h}`;
}

/**
 * Transacción idempotente: un evento RC no otorga dos veces.
 * @param {FirebaseFirestore.Firestore} fs
 * @param {{ uid: string, rcEvent: Record<string, unknown>, productId: string }} p
 * @returns {Promise<{ granted: boolean, amount?: number, tierKey?: string, reason?: string }>}
 */
async function grantAnnualWelcomeCsIfEligible(fs, { uid, rcEvent, productId }) {
  if (!fs || !uid) {
    return { granted: false, reason: 'missing_fs_or_uid' };
  }
  if (!isAnnualSubscriptionRcEvent(rcEvent, productId)) {
    return { granted: false, reason: 'not_annual_period' };
  }

  const tierKey = tierKeyFromRcProductId(productId);
  const tiersMeta = await loadAnnualWelcomeGiftCsByTier(fs);
  const amount = tiersMeta[tierKey]?.annualWelcomeGiftCs ?? 0;
  if (!amount) {
    return { granted: false, reason: 'zero_amount_for_tier', tierKey };
  }

  const grantId = stableGrantDocId(uid, productId, rcEvent);
  const idemRef = fs.doc(`users/${uid}/credits/rcAnnualWelcomeGrants/${grantId}`);
  const balRef = fs.doc(`users/${uid}/credits/balance`);
  const txDocId = `rc_aw_${grantId}`.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 120);
  const txRef = fs.doc(`users/${uid}/credits/transactions/${txDocId}`);

  let granted = false;
  await fs.runTransaction(async (tx) => {
    const idemSnap = await tx.get(idemRef);
    if (idemSnap.exists) {
      return;
    }
    const balSnap = await tx.get(balRef);
    tx.set(idemRef, {
      productId: String(productId || ''),
      amount,
      tierKey,
      rcEventType: rcEvent?.type != null ? String(rcEvent.type) : null,
      createdAt: FieldValue.serverTimestamp(),
    });

    if (!balSnap.exists) {
      tx.set(balRef, {
        userId: uid,
        creditsBalance: amount,
        totalCreditsEarned: amount,
        totalCreditsSpent: 0,
        welcomeBonusUsed: false,
        createdAt: new Date().toISOString(),
        lastUpdated: FieldValue.serverTimestamp(),
      });
    } else {
      tx.update(balRef, {
        creditsBalance: FieldValue.increment(amount),
        totalCreditsEarned: FieldValue.increment(amount),
        lastUpdated: FieldValue.serverTimestamp(),
      });
    }

    tx.set(txRef, {
      type: 'earn',
      amount,
      reason: 'annual_subscription_welcome_cs',
      timestamp: new Date().toISOString(),
    });
    granted = true;
  });

  if (granted) {
    console.log(
      JSON.stringify({
        tag: 'annual_welcome_cs_granted',
        uid,
        tierKey,
        amount,
        productId: String(productId || ''),
      }),
    );
  }
  return granted ? { granted: true, amount, tierKey } : { granted: false, reason: 'already_granted_or_skipped' };
}

module.exports = {
  tierKeyFromRcProductId,
  isAnnualSubscriptionRcEvent,
  grantAnnualWelcomeCsIfEligible,
};

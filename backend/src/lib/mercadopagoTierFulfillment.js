/**
 * Activa tier de suscripción tras pago aprobado en Mercado Pago (Perú / LATAM).
 */

const { grantAnnualWelcomeCsIfEligible } = require('./annualSubscriptionWelcomeCs');

function addMonths(date, months) {
  const d = new Date(date.getTime());
  d.setMonth(d.getMonth() + months);
  return d;
}

/**
 * @param {import('mongodb').Db} db
 * @param {import('firebase-admin/firestore').Firestore | null} fs
 */
async function fulfillMercadoPagoTierSubscription(db, fs, params) {
  const uid = String(params.uid || '').trim();
  const tierKey = String(params.tierKey || '').trim().toLowerCase();
  const billingPeriod = String(params.billingPeriod || 'monthly').trim().toLowerCase();
  const paymentId = String(params.paymentId || '').trim();
  const preferenceId = String(params.preferenceId || '').trim();
  const currencyId = String(params.currencyId || 'PEN').trim().toUpperCase();
  const amount = Number(params.amount) || 0;

  if (!uid || (tierKey !== 'influencer' && tierKey !== 'business')) {
    throw new Error('invalid_tier_fulfillment');
  }

  const months = billingPeriod === 'annual' ? 12 : 1;
  const now = new Date();
  const expiresAt = addMonths(now, months);

  const payload = {
    isPremium: true,
    subscriptionStatus: 'active',
    tier: tierKey,
    currentTier: tierKey,
    subscriptionTier: tierKey,
    subscriptionProvider: 'mercadopago',
    subscriptionBillingPeriod: billingPeriod,
    premiumUntil: expiresAt,
    subscriptionExpiresAt: expiresAt,
    subscriptionStartedAt: now,
    mercadopagoLastPaymentId: paymentId || null,
    mercadopagoLastPreferenceId: preferenceId || null,
    mercadopagoLastCurrency: currencyId,
    mercadopagoLastAmount: amount,
    updatedAt: now,
  };

  if (fs) {
    await fs.collection('users').doc(uid).set(payload, { merge: true });

    if (billingPeriod === 'annual') {
      try {
        await grantAnnualWelcomeCsIfEligible(fs, {
          uid,
          rcEvent: { type: 'INITIAL_PURCHASE', product_id: `mp_${tierKey}_annual` },
          productId: `mp_${tierKey}_annual`,
        });
      } catch (grantErr) {
        console.warn('[mercadopago] annual welcome CS skipped:', grantErr?.message || grantErr);
      }
    }
  }

  await db.collection('users').updateOne(
    { _id: uid },
    {
      $set: {
        ...payload,
        _id: uid,
      },
    },
    { upsert: true },
  );

  return { uid, tierKey, billingPeriod, expiresAt: expiresAt.toISOString() };
}

module.exports = { fulfillMercadoPagoTierSubscription };

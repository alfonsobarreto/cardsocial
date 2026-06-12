/**
 * Mercado Pago Checkout Pro — preferencias + webhook (Perú: PEN / USD).
 *
 * POST /api/payments/mercadopago/checkout   (Bearer Firebase)
 * POST /api/payments/mercadopago/webhook    (IPN Mercado Pago)
 * GET  /api/payments/mercadopago/config     (público: enabled + public key)
 */

const express = require('express');
const { randomUUID } = require('crypto');

const { verifyFirebaseIdToken } = require('../lib/firebaseAdminApp');
const { getFirestoreOptional } = require('../lib/firebaseAdminApp');
const {
  getPublicKey,
  isMercadoPagoConfigured,
  useSandboxCheckout,
  getPreferenceClient,
  getPaymentClient,
} = require('../lib/mercadopagoClient');
const { fulfillMercadoPagoTierSubscription } = require('../lib/mercadopagoTierFulfillment');
const { buildUserFacingJson } = require('../lib/userFacingErrors');

const TIERS_REF_PATH = 'system_config/tiers';

function corsPublic(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept-Language');
}

function normalizeTierKey(raw) {
  const t = String(raw || '').trim().toLowerCase();
  if (t === 'influencer' || t === 'business') return t;
  return null;
}

function normalizeBillingPeriod(raw) {
  const b = String(raw || '').trim().toLowerCase();
  if (b === 'annual' || b === 'year' || b === 'yearly') return 'annual';
  return 'monthly';
}

function normalizeCurrencyId(raw) {
  const c = String(raw || 'PEN').trim().toUpperCase();
  return c === 'USD' ? 'USD' : 'PEN';
}

function usdToPenRate() {
  const n = Number(process.env.MERCADOPAGO_USD_TO_PEN_RATE);
  return Number.isFinite(n) && n > 0 ? n : 3.75;
}

function convertUsdToCurrency(amountUsd, currencyId) {
  const usd = Math.max(0, Number(amountUsd) || 0);
  if (currencyId === 'USD') return Math.round(usd * 100) / 100;
  return Math.round(usd * usdToPenRate() * 100) / 100;
}

async function readTierPricesFromFirestore(fs) {
  if (!fs) return null;
  const snap = await fs.collection('system_config').doc('tiers').get();
  if (!snap.exists) return null;
  return snap.data() || null;
}

function tierPriceUsd(tiersDoc, tierKey, billingPeriod) {
  const row = tiersDoc?.[tierKey];
  if (!row || typeof row !== 'object') return null;
  const monthly = Math.max(0, Number(row.monthlyPriceUsd) || 0);
  const annual = Math.max(0, Number(row.annualPriceUsd) || 0);
  if (billingPeriod === 'annual') {
    return annual > 0 ? annual : monthly * 12;
  }
  return monthly;
}

function resolveSiteBase(env) {
  return String(env.publicUniversalCardBaseUrl || 'https://cardsocial.me').replace(/\/+$/, '');
}

function resolveApiPublicBase(env) {
  const candidates = [
    process.env.MERCADOPAGO_WEBHOOK_BASE_URL,
    process.env.PUBLIC_VAULT_FILE_BASE_URL,
    process.env.EXPO_PUBLIC_BACKEND_BASE_URL,
    process.env.EXPO_PUBLIC_MODERATION_API_URL,
    env.publicVaultFileBaseUrl,
  ];
  for (const raw of candidates) {
    const s = String(raw || '').trim().replace(/\/+$/, '');
    if (s && !/^https?:\/\/(localhost|127\.0\.0\.1)/i.test(s)) return s;
  }
  return `http://127.0.0.1:${env.port || 4000}`;
}

function resolveWebhookUrl(env) {
  const forced = String(process.env.MERCADOPAGO_NOTIFICATION_URL || '').trim().replace(/\/+$/, '');
  if (forced) return forced;
  return `${resolveApiPublicBase(env)}/api/payments/mercadopago/webhook`;
}

function parseExternalReference(ref) {
  const raw = String(ref || '').trim();
  if (!raw) return null;
  try {
    const j = JSON.parse(raw);
    if (j && j.uid) return j;
  } catch {
    /* legacy pipe format */
  }
  const parts = raw.split('|');
  if (parts.length >= 4) {
    return {
      sessionId: parts[0],
      uid: parts[1],
      tierKey: parts[2],
      billingPeriod: parts[3],
      currencyId: parts[4] || 'PEN',
    };
  }
  return null;
}

function createMercadoPagoCheckoutRoutes({ storage, env }) {
  const router = express.Router();

  router.options('/config', (_req, res) => {
    corsPublic(res);
    res.status(204).end();
  });

  router.get('/config', (_req, res) => {
    corsPublic(res);
    res.json({
      ok: true,
      enabled: isMercadoPagoConfigured(),
      publicKey: getPublicKey() || null,
      sandbox: useSandboxCheckout(),
      checkoutType: 'checkout_api_preference',
      supportedCurrencies: ['PEN', 'USD'],
      country: 'PE',
      usdToPenRate: usdToPenRate(),
    });
  });

  router.options('/checkout', (_req, res) => {
    corsPublic(res);
    res.status(204).end();
  });

  router.post('/checkout', async (req, res) => {
    corsPublic(res);
    try {
      if (!isMercadoPagoConfigured()) {
        return res.status(503).json({
          ok: false,
          errorCode: 'mp_not_configured',
          error: 'Mercado Pago no está configurado en el servidor.',
        });
      }

      const authHeader = String(req.headers.authorization || '');
      const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
      const idToken = match?.[1]?.trim();
      if (!idToken) {
        return res.status(401).json({ ok: false, errorCode: 'missing_bearer_token' });
      }

      let decoded;
      try {
        decoded = await verifyFirebaseIdToken(idToken);
      } catch {
        return res.status(401).json({ ok: false, errorCode: 'invalid_or_expired_id_token' });
      }

      const uid = String(decoded.uid || '').trim();
      const payerEmail = decoded.email ? String(decoded.email).trim() : '';
      if (!uid) {
        return res.status(401).json({ ok: false, errorCode: 'invalid_or_expired_id_token' });
      }

      const tierKey = normalizeTierKey(req.body?.tierKey);
      const billingPeriod = normalizeBillingPeriod(req.body?.billingPeriod);
      const currencyId = normalizeCurrencyId(req.body?.currencyId);

      if (!tierKey) {
        return res.status(400).json({ ok: false, errorCode: 'invalid_tier' });
      }

      const fs = getFirestoreOptional();
      const tiersDoc = await readTierPricesFromFirestore(fs);
      const priceUsd = tierPriceUsd(tiersDoc, tierKey, billingPeriod);
      if (priceUsd == null || priceUsd <= 0) {
        return res.status(503).json({
          ok: false,
          errorCode: 'tier_price_unavailable',
          error: 'Precio del plan no disponible. Configura system_config/tiers.',
        });
      }

      const unitPrice = convertUsdToCurrency(priceUsd, currencyId);
      if (unitPrice <= 0) {
        return res.status(400).json({ ok: false, errorCode: 'invalid_amount' });
      }

      const sessionId = randomUUID();
      const siteBase = resolveSiteBase(env);
      const externalReference = JSON.stringify({
        sessionId,
        uid,
        tierKey,
        billingPeriod,
        currencyId,
      });

      const tierLabel = tierKey === 'influencer' ? 'Influencer' : 'Business';
      const periodLabel = billingPeriod === 'annual' ? 'Anual' : 'Mensual';

      const preferenceBody = {
        items: [
          {
            id: `cs_${tierKey}_${billingPeriod}`,
            title: `Card-Social ${tierLabel} (${periodLabel})`,
            description: `Suscripción Card-Social — plan ${tierLabel}`,
            quantity: 1,
            currency_id: currencyId,
            unit_price: unitPrice,
          },
        ],
        payer: payerEmail ? { email: payerEmail } : undefined,
        external_reference: externalReference,
        back_urls: {
          success: `${siteBase}/es/suscripciones?mp=success`,
          failure: `${siteBase}/es/suscripciones?mp=failure`,
          pending: `${siteBase}/es/suscripciones?mp=pending`,
        },
        auto_return: 'approved',
        notification_url: resolveWebhookUrl(env),
        statement_descriptor: 'CARD-SOCIAL',
        metadata: {
          uid,
          tierKey,
          billingPeriod,
          currencyId,
          sessionId,
        },
      };

      const preference = getPreferenceClient();
      const mpRes = await preference.create({ body: preferenceBody });
      const preferenceId = String(mpRes?.id || '').trim();
      const initPoint = useSandboxCheckout()
        ? String(mpRes?.sandbox_init_point || mpRes?.init_point || '').trim()
        : String(mpRes?.init_point || mpRes?.sandbox_init_point || '').trim();

      if (!preferenceId || !initPoint) {
        return res.status(502).json({ ok: false, errorCode: 'mp_preference_failed' });
      }

      const db = await storage.connect();
      await db.collection('mp_checkout_sessions').insertOne({
        sessionId,
        preferenceId,
        uid,
        tierKey,
        billingPeriod,
        currencyId,
        unitPrice,
        priceUsd,
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      return res.status(200).json({
        ok: true,
        preferenceId,
        initPoint,
        sessionId,
        currencyId,
        amount: unitPrice,
      });
    } catch (error) {
      console.error('[mercadopago/checkout]', error?.message || error);
      return res.status(502).json({
        ok: false,
        errorCode: 'mp_checkout_failed',
        error: error?.message || 'checkout_failed',
      });
    }
  });

  router.post('/webhook', async (req, res) => {
    try {
      const topic = String(req.query?.topic || req.body?.type || '').trim();
      const paymentIdRaw = req.query?.['data.id'] || req.body?.data?.id || req.body?.id;
      const paymentId = paymentIdRaw != null ? String(paymentIdRaw).trim() : '';

      if (!isMercadoPagoConfigured()) {
        return res.status(503).send('mp_not_configured');
      }

      if (topic && topic !== 'payment' && req.body?.type !== 'payment') {
        return res.status(200).send('ignored');
      }
      if (!paymentId) {
        return res.status(200).send('no_payment_id');
      }

      const paymentClient = getPaymentClient();
      const payment = await paymentClient.get({ id: paymentId });
      const status = String(payment?.status || '').trim().toLowerCase();
      const externalRef = parseExternalReference(payment?.external_reference);
      const meta = payment?.metadata || {};

      const uid = String(externalRef?.uid || meta.uid || '').trim();
      const tierKey = normalizeTierKey(externalRef?.tierKey || meta.tierKey);
      const billingPeriod = normalizeBillingPeriod(externalRef?.billingPeriod || meta.billingPeriod);
      const currencyId = normalizeCurrencyId(externalRef?.currencyId || meta.currencyId || payment?.currency_id);
      const sessionId = String(externalRef?.sessionId || meta.sessionId || '').trim();
      const preferenceId = String(payment?.preference_id || '').trim();

      const db = await storage.connect();
      const fs = getFirestoreOptional();

      if (status !== 'approved') {
        if (sessionId) {
          await db.collection('mp_checkout_sessions').updateOne(
            { sessionId },
            { $set: { status, paymentId, updatedAt: new Date() } },
          );
        }
        return res.status(200).send('not_approved');
      }

      if (!uid || !tierKey) {
        console.warn('[mercadopago/webhook] missing uid/tier', { paymentId, externalRef, meta });
        return res.status(200).send('missing_metadata');
      }

      const existing = await db.collection('mp_fulfilled_payments').findOne({ paymentId });
      if (existing) {
        return res.status(200).send('already_fulfilled');
      }

      await fulfillMercadoPagoTierSubscription(db, fs, {
        uid,
        tierKey,
        billingPeriod,
        paymentId,
        preferenceId,
        currencyId,
        amount: Number(payment?.transaction_amount) || 0,
      });

      await db.collection('mp_fulfilled_payments').insertOne({
        paymentId,
        preferenceId,
        sessionId,
        uid,
        tierKey,
        billingPeriod,
        currencyId,
        fulfilledAt: new Date(),
      });

      if (sessionId) {
        await db.collection('mp_checkout_sessions').updateOne(
          { sessionId },
          { $set: { status: 'approved', paymentId, updatedAt: new Date() } },
        );
      }

      return res.status(200).send('ok');
    } catch (error) {
      console.error('[mercadopago/webhook]', error?.message || error);
      return res.status(500).send('error');
    }
  });

  return router;
}

module.exports = { createMercadoPagoCheckoutRoutes };

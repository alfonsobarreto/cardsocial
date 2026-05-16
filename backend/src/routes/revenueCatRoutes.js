/**
 * revenueCatRoutes.js - Webhook listener para RevenueCat
 * Recibe eventos de compra/suscripción desde RevenueCat
 * Actualiza isPremium en Firestore cuando el usuario activa la suscripción
 * y acredita annualWelcomeGiftCs (CMS) solo en compras/renovaciones ANUALES.
 */

const express = require('express');
const router = express.Router();
const { createMongoStorage } = require('../services/mongoStorage');
const { env } = require('../config');
const { getFirestoreOptional } = require('../lib/firebaseAdminApp');
const { grantAnnualWelcomeCsIfEligible } = require('../lib/annualSubscriptionWelcomeCs');
const { buildUserFacingJson } = require('../lib/userFacingErrors');

const storage = createMongoStorage({
  uri: env.mongoUri,
  dbName: env.mongoDbName,
});

/**
 * RevenueCat envía `event` anidado; soporta también el shape simplificado del stub interno.
 */
function extractRcWebhookPayload(reqBody) {
  const body = reqBody || {};
  const event = body.event && typeof body.event === 'object' ? body.event : body;
  const appUserId = String(event.app_user_id || body.app_user_id || '').trim();
  const productId = String(event.product_id || body.product_id || '').trim();
  return { event, appUserId, productId };
}

/**
 * POST /revenueCat/webhook
 *
 * Headers esperados:
 * - Authorization: Bearer <RevenueCat Secret API Key> (misma variable que usa el dashboard del webhook)
 */
router.post('/webhook', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    const bearerToken = authHeader.replace('Bearer ', '');

    if (bearerToken !== env.revenueCatApiKey) {
      console.warn(
        'RevenueCat webhook: Unauthorized - invalid API key',
        'Expected:',
        env.revenueCatApiKey ? 'set' : 'NOT SET',
        'Got:',
        bearerToken ? 'provided' : 'missing',
      );
      return res.status(401).json(buildUserFacingJson(req, 'invalid_body', 'REVENUECAT_WEBHOOK_UNAUTHORIZED'));
    }

    const { event, appUserId, productId } = extractRcWebhookPayload(req.body);

    if (!event || !appUserId) {
      return res.status(400).json(buildUserFacingJson(req, 'invalid_body', 'REVENUECAT_WEBHOOK_PAYLOAD_INVALID'));
    }

    console.log(
      'RevenueCat webhook received:',
      JSON.stringify({
        eventType: event.type,
        userId: appUserId,
        productId,
        purchaseDate: event.purchase_date,
        expirationDate: event.expiration_date,
      }),
    );

    const db = await storage.connect();
    const fs = getFirestoreOptional();

    if (event.type === 'INITIAL_PURCHASE' || event.type === 'RENEWAL') {
      console.log(`Activating premium for user: ${appUserId}`);

      const premiumPayload = {
        isPremium: true,
        subscriptionStatus: 'active-premium',
        subscriptionPlan: 'premium',
        revenueCatSubscriptionId: appUserId,
        subscriptionStartedAt: event.purchase_date ? new Date(event.purchase_date) : new Date(),
        subscriptionExpiresAt: event.expiration_date
          ? new Date(event.expiration_date)
          : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        updatedAt: new Date(),
      };

      if (fs) {
        await fs.collection('users').doc(appUserId).set(premiumPayload, { merge: true });

        try {
          const giftResult = await grantAnnualWelcomeCsIfEligible(fs, {
            uid: appUserId,
            rcEvent: event,
            productId,
          });
          console.log('RevenueCat annual welcome CS:', giftResult);
        } catch (grantErr) {
          console.error('annualWelcomeGiftCs grant failed:', grantErr);
        }
      } else {
        console.warn('[RevenueCat] Firestore Admin no configurado — no se actualizó users ni bono anual.');
      }

      const usersCollection = db.collection('users');
      await usersCollection.updateOne(
        { _id: appUserId },
        {
          $set: {
            isPremium: true,
            subscriptionStatus: 'active-premium',
            subscriptionPlan: 'premium',
            revenueCatSubscriptionId: appUserId,
            subscriptionExpiresAt: event.expiration_date
              ? new Date(event.expiration_date)
              : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            updatedAt: new Date(),
          },
        },
        { upsert: true },
      );

      return res.status(200).json({
        ok: true,
        message: 'Premium activated',
        userId: appUserId,
        isPremium: true,
        subscriptionExpiresAt: event.expiration_date,
      });
    }

    if (event.type === 'CANCELLATION') {
      console.log(`Canceling premium for user: ${appUserId}`);

      if (fs) {
        await fs.collection('users').doc(appUserId).set(
          {
            isPremium: false,
            subscriptionStatus: 'cancelled',
            subscriptionPlan: 'free',
            subscriptionExpiresAt: null,
            updatedAt: new Date(),
          },
          { merge: true },
        );
      }

      const usersCollection = db.collection('users');
      await usersCollection.updateOne(
        { _id: appUserId },
        {
          $set: {
            isPremium: false,
            subscriptionStatus: 'cancelled',
            subscriptionPlan: 'free',
            subscriptionExpiresAt: null,
            updatedAt: new Date(),
          },
        },
      );

      return res.status(200).json({
        ok: true,
        message: 'Premium cancelled - Dull Mode activated',
        userId: appUserId,
        isPremium: false,
      });
    }

    return res.status(200).json({
      ok: true,
      message: `Event type ${event.type} processed`,
    });
  } catch (error) {
    console.error('RevenueCat webhook error:', error);
    return res.status(500).json(
      buildUserFacingJson(req, 'server_error', 'SERVER_INTERNAL_ERROR'),
    );
  }
});

router.get('/user/:uid/subscription-status', async (req, res) => {
  try {
    const { uid } = req.params;

    if (!uid) {
      return res.status(400).json(buildUserFacingJson(req, 'invalid_body', 'REVENUECAT_USER_ID_REQUIRED'));
    }

    const fs = getFirestoreOptional();
    if (!fs) {
      return res.status(503).json(buildUserFacingJson(req, 'service_unavailable', 'FIRESTORE_ADMIN_UNAVAILABLE'));
    }

    const userDoc = await fs.collection('users').doc(uid).get();

    if (!userDoc.exists) {
      return res.status(404).json(buildUserFacingJson(req, 'invalid_body', 'REVENUECAT_USER_NOT_FOUND'));
    }

    const userData = userDoc.data();
    const isPremium = Boolean(userData?.isPremium);
    const expiresAt = userData?.subscriptionExpiresAt
      ? userData.subscriptionExpiresAt.toDate
        ? userData.subscriptionExpiresAt.toDate()
        : new Date(userData.subscriptionExpiresAt)
      : null;
    const now = new Date();

    const isExpired = expiresAt && expiresAt < now;
    const actualPremium = isPremium && !isExpired;

    return res.status(200).json({
      ok: true,
      userId: uid,
      isPremium: actualPremium,
      subscriptionStatus: userData?.subscriptionStatus || 'unknown',
      subscriptionPlan: userData?.subscriptionPlan || 'free',
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
      daysRemaining: expiresAt ? Math.floor((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : 0,
    });
  } catch (error) {
    console.error('Error fetching subscription status:', error);
    return res.status(500).json(buildUserFacingJson(req, 'server_error', 'SERVER_INTERNAL_ERROR'));
  }
});

module.exports = router;

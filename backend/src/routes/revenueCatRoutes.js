/**
 * revenueCatRoutes.js - Webhook listener para RevenueCat
 * Recibe eventos de compra/suscripción desde RevenueCat
 * Actualiza isPremium en Firestore cuando el usuario activa la suscripción
 */

const express = require('express');
const router = express.Router();
const { createMongoStorage } = require('../services/mongoStorage');
const { admin } = require('../config');
const { env } = require('../config');

const storage = createMongoStorage({
  uri: env.mongoUri,
  dbName: env.mongoDbName,
});

/**
 * POST /revenueCat/webhook
 * 
 * Webhook recibido de RevenueCat cuando:
 * - Usuario inicia suscripción (INITIAL_PURCHASE)
 * - Usuario renueva suscripción (RENEWAL)
 * - Usuario canceala (CANCELLATION)
 * 
 * Headers esperados:
 * - Authorization: Bearer <RevenueCat API Key> (validación de RevenueCat)
 * 
 * Body:
 * {
 *   "event": {
 *     "type": "INITIAL_PURCHASE|RENEWAL|CANCELLATION",
 *     "purchase_date": "2026-03-21T10:00:00Z",
 *     "expiration_date": "2026-04-21T10:00:00Z"
 *   },
 *   "app_user_id": "user_uid_from_card_social",
 *   "product_id": "card_social_premium_monthly"
 * }
 */
router.post('/webhook', async (req, res) => {
  try {
    // 1. Validar que la request viene de RevenueCat (verificar API Key)
    const authHeader = req.headers.authorization || '';
    const bearerToken = authHeader.replace('Bearer ', '');

    if (bearerToken !== env.revenueCatApiKey) {
      console.warn(
        'RevenueCat webhook: Unauthorized - invalid API key',
        'Expected:',
        env.revenueCatApiKey ? 'set' : 'NOT SET',
        'Got:',
        bearerToken ? 'provided' : 'missing'
      );
      return res.status(401).json({
        ok: false,
        error: 'Unauthorized: Invalid RevenueCat API Key',
      });
    }

    const { event, app_user_id, product_id } = req.body;

    if (!event || !app_user_id) {
      return res.status(400).json({
        ok: false,
        error: 'Missing event or app_user_id',
      });
    }

    console.log('RevenueCat webhook received:', {
      eventType: event.type,
      userId: app_user_id,
      productId: product_id,
      purchaseDate: event.purchase_date,
      expirationDate: event.expiration_date,
    });

    const db = await storage.connect();

    // 2. Procesar evento de compra/renovación
    if (event.type === 'INITIAL_PURCHASE' || event.type === 'RENEWAL') {
      // Usuario pagó → Activar Premium
      console.log(`Activating premium for user: ${app_user_id}`);

      // Actualizar en Firestore (fuente primaria)
      const firebaseUserRef = admin.firestore().collection('users').doc(app_user_id);
      await firebaseUserRef.update({
        isPremium: true,
        subscriptionStatus: 'active-premium',
        subscriptionPlan: 'premium',
        revenueCatSubscriptionId: app_user_id,
        subscriptionStartedAt: event.purchase_date ? new Date(event.purchase_date) : new Date(),
        subscriptionExpiresAt: event.expiration_date ? new Date(event.expiration_date) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        updatedAt: new Date(),
      });

      // Espejo en MongoDB (para backend queries)
      const usersCollection = db.collection('users');
      await usersCollection.updateOne(
        { _id: app_user_id },
        {
          $set: {
            isPremium: true,
            subscriptionStatus: 'active-premium',
            subscriptionPlan: 'premium',
            revenueCatSubscriptionId: app_user_id,
            subscriptionExpiresAt: event.expiration_date
              ? new Date(event.expiration_date)
              : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            updatedAt: new Date(),
          },
        },
        { upsert: true }
      );

      return res.status(200).json({
        ok: true,
        message: 'Premium activated',
        userId: app_user_id,
        isPremium: true,
        subscriptionExpiresAt: event.expiration_date,
      });
    }

    // 3. Procesar evento de cancelación
    if (event.type === 'CANCELLATION') {
      // Usuario canceló → Volver a Dull Mode (isPremium = false)
      console.log(`Canceling premium for user: ${app_user_id}`);

      const firebaseUserRef = admin.firestore().collection('users').doc(app_user_id);
      await firebaseUserRef.update({
        isPremium: false,
        subscriptionStatus: 'cancelled',
        subscriptionPlan: 'free',
        subscriptionExpiresAt: null,
        updatedAt: new Date(),
      });

      const usersCollection = db.collection('users');
      await usersCollection.updateOne(
        { _id: app_user_id },
        {
          $set: {
            isPremium: false,
            subscriptionStatus: 'cancelled',
            subscriptionPlan: 'free',
            subscriptionExpiresAt: null,
            updatedAt: new Date(),
          },
        }
      );

      return res.status(200).json({
        ok: true,
        message: 'Premium cancelled - Dull Mode activated',
        userId: app_user_id,
        isPremium: false,
      });
    }

    // Event type desconocido pero procesado sin error
    return res.status(200).json({
      ok: true,
      message: `Event type ${event.type} processed`,
    });
  } catch (error) {
    console.error('RevenueCat webhook error:', error);
    return res.status(500).json({
      ok: false,
      error: 'Internal server error processing webhook',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /revenueCat/user/:uid/subscription-status
 * Endpoint para que frontend verifique estado de suscripción
 * Retorna isPremium exacto, expiración y estado
 */
router.get('/user/:uid/subscription-status', async (req, res) => {
  try {
    const { uid } = req.params;

    if (!uid) {
      return res.status(400).json({
        ok: false,
        error: 'User ID required',
      });
    }

    // Leer de Firestore (autoritativo)
    const userDoc = await admin
      .firestore()
      .collection('users')
      .doc(uid)
      .get();

    if (!userDoc.exists) {
      return res.status(404).json({
        ok: false,
        error: 'User not found',
      });
    }

    const userData = userDoc.data();
    const isPremium = Boolean(userData?.isPremium);
    const expiresAt = userData?.subscriptionExpiresAt
      ? new Date(userData.subscriptionExpiresAt)
      : null;
    const now = new Date();

    // Validar fecha de expiración
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
    return res.status(500).json({
      ok: false,
      error: 'Failed to fetch subscription status',
    });
  }
});

module.exports = router;

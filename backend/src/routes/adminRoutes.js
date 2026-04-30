/**
 * Admin Routes - Card-Social Backend (JavaScript version)
 * Endpoints: Login, Mint Assets, Publish Assets, Get Stats
 * Base: /api/admin
 * Security: JWT Bearer Token + Gateway Key
 *
 * `createAdminRoutes({ gatewayKeyMiddleware, jwtAuthMiddleware, adminSystemScopeMiddleware })`
 * recibe las mismas instancias que `server.js` para evitar ReferenceError y duplicar claves API.
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');

const { env } = require('../config');
const {
  createGatewayKeyMiddleware,
  createJwtAuthMiddleware,
  createScopeMiddleware,
} = require('../middleware/strongAuth');

function toSafeFloat(value, fallback = 0) {
  const parsed = Number.parseFloat(String(value ?? fallback));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, parsed);
}

function monthKey(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function monthStartUtc(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0));
}

function sixMonthsAgoUtc(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 6, date.getUTCDate(), 0, 0, 0, 0));
}

async function fetchJsonCost(url, apiKey) {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      ...(apiKey ? { 'x-api-key': apiKey } : {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Cost API failed: ${response.status}`);
  }

  const payload = await response.json().catch(() => ({}));
  return toSafeFloat(
    payload?.monthlyUsd
      ?? payload?.monthly_usd
      ?? payload?.totalUsd
      ?? payload?.total_usd
      ?? payload?.cost
      ?? payload?.value,
    0
  );
}

async function resolveInfraCosts() {
  const month = monthKey();
  let source = 'mock';

  let azure = toSafeFloat(process.env.AZURE_MONTHLY_COST_USD, 0);
  let mongo = toSafeFloat(process.env.MONGO_MONTHLY_COST_USD, 0);

  if (azure > 0 || mongo > 0) {
    source = 'env';
  }

  const azureCostApi = String(process.env.AZURE_COST_API_URL || '').trim();
  const mongoCostApi = String(process.env.MONGO_COST_API_URL || '').trim();
  const azureCostApiKey = String(process.env.AZURE_COST_API_KEY || '').trim();
  const mongoCostApiKey = String(process.env.MONGO_COST_API_KEY || '').trim();

  if (azureCostApi) {
    try {
      const azureApiCost = await fetchJsonCost(azureCostApi, azureCostApiKey);
      if (azureApiCost >= 0) {
        azure = azureApiCost;
        source = 'api';
      }
    } catch (_error) {
      // Keep env/mock fallback.
    }
  }

  if (mongoCostApi) {
    try {
      const mongoApiCost = await fetchJsonCost(mongoCostApi, mongoCostApiKey);
      if (mongoApiCost >= 0) {
        mongo = mongoApiCost;
        source = 'api';
      }
    } catch (_error) {
      // Keep env/mock fallback.
    }
  }

  if (source === 'mock') {
    const monthSeed = Number(month.slice(-2));
    azure = Number((6.75 + monthSeed * 0.41).toFixed(2));
    mongo = Number((4.2 + monthSeed * 0.27).toFixed(2));
  }

  return {
    month,
    source,
    azure_usd: Number(azure.toFixed(2)),
    mongo_usd: Number(mongo.toFixed(2)),
    total_usd: Number((azure + mongo).toFixed(2)),
  };
}

/**
 * Admin Credentials (from environment or defaults)
 * IMPORTANT: In production, use database or secure vault
 */
const ADMIN_CREDS = {
  username: process.env.ADMIN_USER || 'admin_pochobs',
  password_hash: process.env.ADMIN_PASS_HASH || '$2a$10$8LvWuFpd5OMnG.Q9X2yFy.5tpOy09fHPeHBx8hv1z3Z9q1Wk2hPg2', // 'admin@Card2026'
};

const PURCHASE_ORIGINS = ['apple_pay', 'subscription', 'direct_credits'];

/**
 * @param {object} [options]
 * @param {import('express').RequestHandler} [options.gatewayKeyMiddleware]
 * @param {import('express').RequestHandler} [options.jwtAuthMiddleware]
 * @param {import('express').RequestHandler} [options.adminSystemScopeMiddleware]
 */
function createAdminRoutes(options = {}) {
  const gatewayKeyMiddleware =
    options.gatewayKeyMiddleware
    || createGatewayKeyMiddleware({ apiGatewayKey: env.apiGatewayKey });

  const jwtAuthMiddleware =
    options.jwtAuthMiddleware
    || createJwtAuthMiddleware({
      jwtSecret: env.jwtSecret,
      jwtIssuer: env.jwtIssuer,
      jwtAudience: env.jwtAudience,
    });

  const adminSystemScopeMiddleware =
    options.adminSystemScopeMiddleware
    || createScopeMiddleware('admin.system');

  const router = express.Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 },
  });

  /**
   * 🔐 JWT Verification Middleware (panel legacy username/password)
   */
  const verifyAdminToken = (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing or invalid authorization header' });
      }

      const token = authHeader.substring(7);
      const decoded = jwt.verify(
        token,
        env.jwtSecret || 'your-secret-key-change-in-production',
        {
          issuer: env.jwtIssuer || 'card-social-admin',
          audience: env.jwtAudience || 'card-social-api',
        },
      );

      if (decoded.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden: admin role required' });
      }

      req.admin = decoded;
      next();
    } catch (error) {
      console.error('❌ Token verification error:', error.message);
      res.status(401).json({ error: 'Invalid or expired token' });
    }
  };

  /**
   * 🔐 POST /api/admin/login
   * Authenticate admin and issue JWT
   */
  router.post('/login', async (req, res) => {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
      }

      if (username !== ADMIN_CREDS.username) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const isValidPassword = await bcrypt.compare(password, ADMIN_CREDS.password_hash);
      if (!isValidPassword) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const token = jwt.sign(
        {
          sub: ADMIN_CREDS.username,
          role: 'admin',
          iat: Math.floor(Date.now() / 1000),
        },
        env.jwtSecret || 'your-secret-key-change-in-production',
        {
          expiresIn: '30m',
          issuer: env.jwtIssuer || 'card-social-admin',
          audience: env.jwtAudience || 'card-social-api',
        },
      );

      return res.status(200).json({
        success: true,
        token,
        expires_in: 30 * 60,
        token_type: 'Bearer',
      });
    } catch (error) {
      console.error('❌ Login route error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * 🎨 POST /api/admin/mint_asset
   */
  router.post(
    '/mint_asset',
    verifyAdminToken,
    upload.fields([
      { name: 'wallpaper_vertical', maxCount: 1 },
      { name: 'wallpaper_horizontal', maxCount: 1 },
      { name: 'icons', maxCount: 24 },
      { name: 'font', maxCount: 1 },
      { name: 'preview', maxCount: 1 },
    ]),
    async (req, res) => {
      try {
        const { collection, name, rarity, price_cs } = req.body;
        const files = req.files || {};

        if (!collection || !name || !rarity) {
          return res.status(400).json({
            error: 'Missing required fields: collection, name, rarity',
          });
        }

        const validCollections = ['skins', 'collectibles', 'wallpapers', 'fonts'];
        if (!validCollections.includes(collection)) {
          return res.status(400).json({ error: 'Invalid collection type' });
        }

        const assetId = `MINT_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        return res.status(201).json({
          success: true,
          unique_id: assetId,
          collection,
          name,
          rarity,
          status: 'draft',
          created_at: new Date().toISOString(),
          message: `Asset created in draft: ${assetId}`,
        });
      } catch (error) {
        console.error('❌ Mint route error:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
      }
    },
  );

  router.post('/publish_asset', verifyAdminToken, async (req, res) => {
    try {
      const { mint_id, confirm_ready } = req.body;

      if (!mint_id || !confirm_ready) {
        return res.status(400).json({ error: 'mint_id and confirm_ready required' });
      }

      return res.status(200).json({
        success: true,
        unique_id: mint_id,
        status: 'published',
        published_at: new Date().toISOString(),
        message: `Asset published: ${mint_id}`,
      });
    } catch (error) {
      console.error('❌ Publish route error:', error);
      res.status(500).json({ error: error.message || 'Internal server error' });
    }
  });

  router.get('/stats', verifyAdminToken, async (req, res) => {
    try {
      return res.status(200).json({
        success: true,
        stats: {
          _id: 'market_stats',
          total_assets: 42,
          published: 28,
          draft: 14,
          total_revenue_cs: 1250,
          top_collection: 'skins',
          last_update: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error('❌ Stats route error:', error);
      res.status(500).json({ error: error.message || 'Internal server error' });
    }
  });

  router.get('/billing-status', verifyAdminToken, async (req, res) => {
    try {
      const db = req.app.locals.db;
      const cloudCosts = await resolveInfraCosts();

      if (!db) {
        return res.status(200).json({
          success: true,
          finance: {
            cloudCosts,
            csCentralBank: { emitted: 0, inChests: 0, returnedToAdmin: 0 },
            transactionAudit: {
              originCounts: { apple_pay: 0, subscription: 0, direct_credits: 0 },
              unusedCreditsOverSixMonths: 0,
              recent: [],
            },
            adminBalance: {
              uid: String(process.env.ADMIN_OWNER_UID || process.env.ADMIN_USER || 'admin_pochobs'),
              myCreditsCS: 0,
              qrsCreated: 0,
              qrsCreatedThisMonth: 0,
              monthlyInfraSpendUSD: cloudCosts.total_usd,
            },
          },
        });
      }

      const usersCollection = db.collection('users');
      const qrTokensCollection = db.collection('qr_tokens');
      const txCollection = db.collection('cs_transactions');

      const now = new Date();
      const startOfMonth = monthStartUtc(now);
      const sixMonthsAgo = sixMonthsAgoUtc(now);

      const [creditsAgg = {}] = await usersCollection
        .aggregate([
          {
            $group: {
              _id: null,
              inChests: { $sum: { $ifNull: ['$creditsBalance', 0] } },
              totalEarned: { $sum: { $ifNull: ['$totalCreditsEarned', 0] } },
              totalSpent: { $sum: { $ifNull: ['$totalCreditsSpent', 0] } },
            },
          },
        ])
        .toArray();

      const returnedTxAgg = await txCollection
        .aggregate([
          { $match: { flow: 'return' } },
          { $group: { _id: null, total: { $sum: { $ifNull: ['$amountCs', 0] } } } },
        ])
        .toArray();

      const originRows = await txCollection
        .aggregate([
          { $match: { origin: { $in: PURCHASE_ORIGINS } } },
          { $group: { _id: '$origin', total: { $sum: 1 } } },
        ])
        .toArray();

      const originCounts = {
        apple_pay: 0,
        subscription: 0,
        direct_credits: 0,
      };

      for (const row of originRows) {
        const key = String(row?._id || '');
        if (Object.prototype.hasOwnProperty.call(originCounts, key)) {
          originCounts[key] = Number(row?.total || 0);
        }
      }

      const inactiveCreditsUsers = await usersCollection.countDocuments({
        creditsBalance: { $gt: 0 },
        $or: [
          { lastCreditActivityAt: { $lt: sixMonthsAgo } },
          { lastUpdated: { $lt: sixMonthsAgo } },
          { updatedAt: { $lt: sixMonthsAgo } },
          { createdAt: { $lt: sixMonthsAgo } },
        ],
      });

      const recentTx = await txCollection
        .find(
          {},
          {
            projection: {
              _id: 0,
              txId: 1,
              userId: 1,
              origin: 1,
              flow: 1,
              amountCs: 1,
              reason: 1,
              createdAt: 1,
            },
          },
        )
        .sort({ createdAt: -1 })
        .limit(20)
        .toArray();

      const adminUid = String(process.env.ADMIN_OWNER_UID || process.env.ADMIN_USER || 'admin_pochobs');

      const adminUserDoc = await usersCollection.findOne(
        {
          $or: [{ uid: adminUid }, { nickname: adminUid }, { email: adminUid }],
        },
        { projection: { creditsBalance: 1 } },
      );

      const qrsCreated = await qrTokensCollection.countDocuments({ uid: adminUid });
      const qrsCreatedThisMonth = await qrTokensCollection.countDocuments({
        uid: adminUid,
        $or: [{ createdAt: { $gte: startOfMonth } }, { created_at: { $gte: startOfMonth } }],
      });

      const inChests = Number(creditsAgg?.inChests || 0);
      const emittedFromUsers = Number(creditsAgg?.totalEarned || 0);
      const spentFromUsers = Number(creditsAgg?.totalSpent || 0);
      const returnedFromTx = Number(returnedTxAgg[0]?.total || 0);
      const returnedToAdmin = returnedFromTx > 0 ? returnedFromTx : spentFromUsers;
      const emitted = Math.max(emittedFromUsers, inChests + returnedToAdmin);

      return res.status(200).json({
        success: true,
        finance: {
          cloudCosts,
          csCentralBank: {
            emitted,
            inChests,
            returnedToAdmin,
          },
          transactionAudit: {
            originCounts,
            unusedCreditsOverSixMonths: inactiveCreditsUsers,
            recent: recentTx,
          },
          adminBalance: {
            uid: adminUid,
            myCreditsCS: Number(adminUserDoc?.creditsBalance || 0),
            qrsCreated,
            qrsCreatedThisMonth,
            monthlyInfraSpendUSD: cloudCosts.total_usd,
          },
        },
      });
    } catch (error) {
      console.error('Admin billing-status route error:', error.message || error);
      return res.status(500).json({ error: error.message || 'Internal server error' });
    }
  });

  /**
   * GET /api/admin/nfc/cards — mismo stack que system-stats (gateway + JWT gateway + scope admin.system).
   */
  router.get(
    '/nfc/cards',
    gatewayKeyMiddleware,
    jwtAuthMiddleware,
    adminSystemScopeMiddleware,
    async (req, res) => {
      try {
        const db = req.app.locals.db;

        const adminUid = String(req.auth?.sub || '').trim();
        if (!adminUid) {
          return res.status(403).json({ ok: false, error: 'Admin access required.' });
        }

        const nfcCards = await db.collection('nfc_cards')
          .find({})
          .sort({ updatedAt: -1 })
          .toArray();

        return res.status(200).json({ ok: true, nfcCards });
      } catch (error) {
        console.error('[admin/nfc/cards]', error);
        return res.status(500).json({ ok: false, error: 'Failed to fetch NFC cards inventory.' });
      }
    },
  );

  return router;
}

module.exports = { createAdminRoutes };

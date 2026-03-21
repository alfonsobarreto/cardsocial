/**
 * Admin Routes - Card-Social Backend (JavaScript version)
 * Endpoints: Login, Mint Assets, Publish Assets, Get Stats
 * Base: /api/admin
 * Security: JWT Bearer Token + Gateway Key
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');

const { env } = require('../config');

const router = express.Router();
const upload = multer({ 
  storage: multer.memoryStorage(), 
  limits: { fileSize: 50 * 1024 * 1024 } 
});

/**
 * Admin Credentials (from environment or defaults)
 * IMPORTANT: In production, use database or secure vault
 */
const ADMIN_CREDS = {
  username: process.env.ADMIN_USER || 'admin_pochobs',
  password_hash: process.env.ADMIN_PASS_HASH || '$2a$10$8LvWuFpd5OMnG.Q9X2yFy.5tpOy09fHPeHBx8hv1z3Z9q1Wk2hPg2', // 'admin@Card2026'
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

    // Validate credentials
    if (username !== ADMIN_CREDS.username) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Compare password with bcrypt hash
    const isValidPassword = await bcrypt.compare(password, ADMIN_CREDS.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Issue JWT token (30 minutes)
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
      }
    );

    return res.status(200).json({
      success: true,
      token,
      expires_in: 30 * 60, // 30 minutes in seconds
      token_type: 'Bearer',
    });
  } catch (error) {
    console.error('❌ Login route error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * 🔐 JWT Verification Middleware
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
      }
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
 * 🎨 POST /api/admin/mint_asset
 * Create a new asset in DRAFT state with files
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

      // Validations
      if (!collection || !name || !rarity) {
        return res.status(400).json({ 
          error: 'Missing required fields: collection, name, rarity' 
        });
      }

      const validCollections = ['skins', 'collectibles', 'wallpapers', 'fonts'];
      if (!validCollections.includes(collection)) {
        return res.status(400).json({ error: 'Invalid collection type' });
      }

      // Create mock asset response (in production, save to MongoDB)
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
  }
);

/**
 * 📢 POST /api/admin/publish_asset
 * Publish an asset from DRAFT to PUBLISHED
 */
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

/**
 * 📊 GET /api/admin/stats
 * Get market statistics
 */
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

module.exports = { createAdminRoutes: () => router };

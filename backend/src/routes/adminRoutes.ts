/**
 * Admin Routes - Card-Social Backend
 * Login, borradores de activos del Market, publicación y estadísticas.
 */

import express, { Request, Response } from 'express';
import multer from 'multer';
import AdminAuthService from '../services/adminAuthService.js';
import MarketAssetDraftService from '../services/marketAssetDraftService.js';
import { Db } from 'mongodb';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { buildUserFacingJson, buildUserFacingSuccessJson } = require('../lib/userFacingErrors.js');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// ═══════════════════════════════════════════════╗
// 🔐 POST /api/admin/login
// Autenticación de Admin y emisión de JWT
// ═══════════════════════════════════════════════╝
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json(buildUserFacingJson(req, 'invalid_body', 'REQUIRED_FIELDS_MISSING'));
    }

    const token = await AdminAuthService.login(username, password);

    if (!token) {
      return res.status(401).json(buildUserFacingJson(req, 'invalid_body', 'ADMIN_INVALID_CREDENTIALS'));
    }

    res.json({
      success: true,
      token,
      expires_in: 30 * 60, // 30 minutos en segundos
      token_type: 'Bearer',
    });
  } catch (error) {
    console.error('❌ Login route error:', error);
    res.status(500).json(buildUserFacingJson(req, 'server_error', 'SERVER_INTERNAL_ERROR'));
  }
});

// ═══════════════════════════════════════════════╗
// 🎨 POST /api/admin/market_asset_draft
// Crear un nuevo asset en estado DRAFT con archivos
// Requiere: JWT Bearer Token válido
// ═══════════════════════════════════════════════╝
router.post(
  '/market_asset_draft',
  AdminAuthService.middleware(),
  upload.fields([
    { name: 'wallpaper_vertical', maxCount: 1 },
    { name: 'wallpaper_horizontal', maxCount: 1 },
    { name: 'icons', maxCount: 24 },
    { name: 'font', maxCount: 1 },
    { name: 'preview', maxCount: 1 },
  ]),
  async (req: Request, res: Response) => {
    try {
      const { collection, name, rarity, price_cs } = req.body;
      const files = (req as any).files;

      // Validaciones
      if (!collection || !name || !rarity) {
        return res.status(400).json(buildUserFacingJson(req, 'invalid_body', 'REQUIRED_FIELDS_MISSING'));
      }

      if (!['skins', 'collectibles', 'wallpapers', 'fonts'].includes(collection)) {
        return res.status(400).json(buildUserFacingJson(req, 'invalid_body', 'ADMIN_INVALID_COLLECTION_TYPE'));
      }

      const db = (req as any).db as Db;
      const draftService = new MarketAssetDraftService(db);

      // Preparar archivos
      const filesBuffer: any = {};
      if (files.wallpaper_vertical) filesBuffer.wallpaper_vertical = files.wallpaper_vertical[0].buffer;
      if (files.wallpaper_horizontal) filesBuffer.wallpaper_horizontal = files.wallpaper_horizontal[0].buffer;
      if (files.icons) filesBuffer.icons = files.icons.map((f: any) => f.buffer);
      if (files.font) filesBuffer.font = files.font[0].buffer;
      if (files.preview) filesBuffer.preview = files.preview[0].buffer;

      const draftRequest = {
        collection,
        name,
        rarity,
        price_cs: parseInt(price_cs) || 0,
        files: filesBuffer,
      };

      const result = await draftService.createDraftAsset(draftRequest);

      res.json(
        buildUserFacingSuccessJson(req, 'ASSET_DRAFT_CREATED', {
          success: true,
          ...result,
        }),
      );
    } catch (error) {
      console.error('❌ Market draft route error:', error);
      res.status(500).json(buildUserFacingJson(req, 'server_error', 'SERVER_INTERNAL_ERROR'));
    }
  }
);

// ═══════════════════════════════════════════════╗
// 📢 POST /api/admin/publish_asset
// Publicar un asset del estado DRAFT a PUBLISHED
// Activa para distribución inmediata
// ═══════════════════════════════════════════════╝
router.post('/publish_asset', AdminAuthService.middleware(), async (req: Request, res: Response) => {
  try {
    const { draft_id, confirm_ready } = req.body;

    if (!draft_id || !confirm_ready) {
      return res.status(400).json(buildUserFacingJson(req, 'invalid_body', 'REQUIRED_FIELDS_MISSING'));
    }

    const db = (req as any).db as Db;
    const draftPublishService = new MarketAssetDraftService(db);

    const result = await draftPublishService.publishAsset(draft_id);

    res.json(
      buildUserFacingSuccessJson(req, 'ASSET_PUBLISHED', {
        success: true,
        ...result,
      }),
    );
  } catch (error) {
    console.error('❌ Publish route error:', error);
    res.status(500).json(buildUserFacingJson(req, 'server_error', 'SERVER_INTERNAL_ERROR'));
  }
});

// ═══════════════════════════════════════════════╗
// 📊 GET /api/admin/stats
// Obtener estadísticas del market
// ═══════════════════════════════════════════════╝
router.get('/stats', AdminAuthService.middleware(), async (req: Request, res: Response) => {
  try {
    const db = (req as any).db as Db;
    const draftStatsService = new MarketAssetDraftService(db);

    const stats = await draftStatsService.getMarketStats();

    res.json({
      success: true,
      stats,
    });
  } catch (error) {
    console.error('❌ Stats route error:', error);
    res.status(500).json(buildUserFacingJson(req, 'server_error', 'SERVER_INTERNAL_ERROR'));
  }
});

// ═══════════════════════════════════════════════╗
// 📋 GET /api/admin/assets
// Listar todos los assets con filtros opcionales
// ═══════════════════════════════════════════════╝
router.get('/assets', AdminAuthService.middleware(), async (req: Request, res: Response) => {
  try {
    const { collection, status } = req.query;
    const filter: any = {};

    if (collection) filter.collection = collection;
    if (status) filter.status = status;

    const db = (req as any).db as Db;
    const draftListService = new MarketAssetDraftService(db);

    const assets = await draftListService.listAssets(filter);

    res.json({
      success: true,
      total: assets.length,
      assets,
    });
  } catch (error) {
    console.error('❌ Assets list route error:', error);
    res.status(500).json(buildUserFacingJson(req, 'server_error', 'SERVER_INTERNAL_ERROR'));
  }
});

// ═══════════════════════════════════════════════╗
// 🎯 GET /api/admin/preview/:draft_id
// Generar y retornar preview en tiempo real
// ═══════════════════════════════════════════════╝
router.get('/preview/:draft_id', AdminAuthService.middleware(), async (req: Request, res: Response) => {
  try {
    const { draft_id } = req.params;

    const db = (req as any).db as Db;
    const previewService = new MarketAssetDraftService(db);

    const previewBuffer = await previewService.generatePreview(draft_id);

    res.setHeader('Content-Type', 'image/png');
    res.send(previewBuffer);
  } catch (error) {
    console.error('❌ Preview route error:', error);
    res.status(500).json(buildUserFacingJson(req, 'server_error', 'SERVER_INTERNAL_ERROR'));
  }
});

// ═══════════════════════════════════════════════╗
// 🏥 GET /api/admin/health
// Health check del admin panel (sin JWT requerido)
// ═══════════════════════════════════════════════╝
router.get('/health', (req: Request, res: Response) => {
  res.json(
    buildUserFacingSuccessJson(req, 'STATUS_OK', {
      status: 'ok',
      service: 'card-social-admin-api',
      timestamp: new Date().toISOString(),
    }),
  );
});

export default router;

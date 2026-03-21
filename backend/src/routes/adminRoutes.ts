/**
 * Admin Routes - Card-Social Backend
 * Endpoints para: Login, Mint Assets, Publish Assets, Get Stats
 *
 * Base: /api/admin
 * Security: JWT Bearer Token + Gateway Key
 * Session: 30 minutos de expiración
 */

import express, { Request, Response } from 'express';
import multer from 'multer';
import AdminAuthService from '../services/adminAuthService.js';
import MarketMintService from '../services/marketMintService.js';
import { Db } from 'mongodb';

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
      return res.status(400).json({ error: 'Username and password required' });
    }

    const token = await AdminAuthService.login(username, password);

    if (!token) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    res.json({
      success: true,
      token,
      expires_in: 30 * 60, // 30 minutos en segundos
      token_type: 'Bearer',
    });
  } catch (error) {
    console.error('❌ Login route error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ═══════════════════════════════════════════════╗
// 🎨 POST /api/admin/mint_asset
// Crear un nuevo asset en estado DRAFT con archivos
// Requiere: JWT Bearer Token válido
// ═══════════════════════════════════════════════╝
router.post(
  '/mint_asset',
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
        return res.status(400).json({ error: 'Missing required fields: collection, name, rarity' });
      }

      if (!['skins', 'collectibles', 'wallpapers', 'fonts'].includes(collection)) {
        return res.status(400).json({ error: 'Invalid collection type' });
      }

      const db = (req as any).db as Db;
      const mintService = new MarketMintService(db);

      // Preparar archivos
      const filesBuffer: any = {};
      if (files.wallpaper_vertical) filesBuffer.wallpaper_vertical = files.wallpaper_vertical[0].buffer;
      if (files.wallpaper_horizontal) filesBuffer.wallpaper_horizontal = files.wallpaper_horizontal[0].buffer;
      if (files.icons) filesBuffer.icons = files.icons.map((f: any) => f.buffer);
      if (files.font) filesBuffer.font = files.font[0].buffer;
      if (files.preview) filesBuffer.preview = files.preview[0].buffer;

      const mintRequest = {
        collection,
        name,
        rarity,
        price_cs: parseInt(price_cs) || 0,
        files: filesBuffer,
      };

      const result = await mintService.mintAsset(mintRequest);

      res.json({
        success: true,
        ...result,
        message: `Asset created in draft: ${result.unique_id}`,
      });
    } catch (error) {
      console.error('❌ Mint route error:', error);
      res.status(500).json({ error: (error as Error).message });
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
    const { mint_id, confirm_ready } = req.body;

    if (!mint_id || !confirm_ready) {
      return res.status(400).json({ error: 'mint_id and confirm_ready required' });
    }

    const db = (req as any).db as Db;
    const mintService = new MarketMintService(db);

    const result = await mintService.publishAsset(mint_id);

    res.json({
      success: true,
      ...result,
      message: `Asset published: ${result.unique_id}`,
    });
  } catch (error) {
    console.error('❌ Publish route error:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// ═══════════════════════════════════════════════╗
// 📊 GET /api/admin/stats
// Obtener estadísticas del market
// ═══════════════════════════════════════════════╝
router.get('/stats', AdminAuthService.middleware(), async (req: Request, res: Response) => {
  try {
    const db = (req as any).db as Db;
    const mintService = new MarketMintService(db);

    const stats = await mintService.getMarketStats();

    res.json({
      success: true,
      stats,
    });
  } catch (error) {
    console.error('❌ Stats route error:', error);
    res.status(500).json({ error: (error as Error).message });
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
    const mintService = new MarketMintService(db);

    const assets = await mintService.listAssets(filter);

    res.json({
      success: true,
      total: assets.length,
      assets,
    });
  } catch (error) {
    console.error('❌ Assets list route error:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// ═══════════════════════════════════════════════╗
// 🎯 GET /api/admin/preview/:mint_id
// Generar y retornar preview en tiempo real
// ═══════════════════════════════════════════════╝
router.get('/preview/:mint_id', AdminAuthService.middleware(), async (req: Request, res: Response) => {
  try {
    const { mint_id } = req.params;

    const db = (req as any).db as Db;
    const mintService = new MarketMintService(db);

    const previewBuffer = await mintService.generatePreview(mint_id);

    res.setHeader('Content-Type', 'image/png');
    res.send(previewBuffer);
  } catch (error) {
    console.error('❌ Preview route error:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// ═══════════════════════════════════════════════╗
// 🏥 GET /api/admin/health
// Health check del admin panel (sin JWT requerido)
// ═══════════════════════════════════════════════╝
router.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'card-social-admin-api',
    timestamp: new Date().toISOString(),
  });
});

export default router;

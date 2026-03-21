/**
 * Vault Sync Routes
 * Endpoints para sincronización Mobile ↔ Market Assets
 *
 * Base: /api/sync
 * No requiere JWT (Mobile app se autentica por UID)
 */

import express, { Request, Response } from 'express';
import MarketSyncService from '../services/marketSyncService.js';
import { Db } from 'mongodb';

const router = express.Router();

// ═══════════════════════════════════════════════╗
// 📱 POST /api/sync/init-vault
// Inicializar vault de nuevo usuario con iconos GRATIS
// ═══════════════════════════════════════════════╝
router.post('/init-vault', async (req: Request, res: Response) => {
  try {
    const { uid } = req.body;

    if (!uid) {
      return res.status(400).json({ error: 'UID required' });
    }

    const db = (req as any).db as Db;
    const syncService = new MarketSyncService(db);

    const result = await syncService.initializeNewUserVault(uid);

    if (!result) {
      return res.status(500).json({ error: 'Failed to initialize vault' });
    }

    res.json({
      success: true,
      message: `Vault initialized for user ${uid}`,
      free_icons_loaded: true,
    });
  } catch (error) {
    console.error('❌ Init vault error:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// ═══════════════════════════════════════════════╗
// 🔄 POST /api/sync/vault/:uid
// Sincronizar vault del usuario con market_assets
// ═══════════════════════════════════════════════╝
router.post('/vault/:uid', async (req: Request, res: Response) => {
  try {
    const { uid } = req.params;

    const db = (req as any).db as Db;
    const syncService = new MarketSyncService(db);

    const vaultItems = await syncService.syncUserVault(uid);

    res.json({
      success: true,
      uid,
      vault_items_count: vaultItems.length,
      items: vaultItems,
      synced_at: new Date(),
    });
  } catch (error) {
    console.error('❌ Sync vault error:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// ═══════════════════════════════════════════════╗
// 📋 GET /api/sync/vault/:uid
// Obtener vault actual del usuario
// ═══════════════════════════════════════════════╝
router.get('/vault/:uid', async (req: Request, res: Response) => {
  try {
    const { uid } = req.params;

    const db = (req as any).db as Db;
    const syncService = new MarketSyncService(db);

    const userVault = await syncService.getUserVault(uid);

    if (!userVault) {
      return res.status(404).json({ error: 'Vault not found for user' });
    }

    res.json({
      success: true,
      uid,
      vault: userVault,
      item_count: userVault.vault_items.length,
    });
  } catch (error) {
    console.error('❌ Get vault error:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// ═══════════════════════════════════════════════╗
// 🎨 GET /api/sync/skins/:uid
// Obtener skins disponibles para aplicar a tarjetas
// ═══════════════════════════════════════════════╝
router.get('/skins/:uid', async (req: Request, res: Response) => {
  try {
    const { uid } = req.params;

    const db = (req as any).db as Db;
    const syncService = new MarketSyncService(db);

    const availableSkins = await syncService.getAvailableSkins(uid);

    res.json({
      success: true,
      uid,
      available_skins: availableSkins.length,
      skins: availableSkins,
    });
  } catch (error) {
    console.error('❌ Get skins error:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// ═══════════════════════════════════════════════╗
// 📊 GET /api/sync/stats
// Obtener estadísticas de sincronización
// ═══════════════════════════════════════════════╝
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const db = (req as any).db as Db;
    const syncService = new MarketSyncService(db);

    const stats = await syncService.getSyncStats();

    res.json({
      success: true,
      ...stats,
    });
  } catch (error) {
    console.error('❌ Get stats error:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;

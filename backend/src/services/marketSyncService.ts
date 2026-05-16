/**
 * Market Sync Service
 * Sincronización bidireccional: Market Assets ↔ User Vault (Mobile)
 *
 * Features:
 * - Cargar iconos gratuitos al vault de nuevo usuario
 * - Actualizar vault cuando admin publica nuevo asset
 * - Mostrar skins disponibles en MyCards
 */

import { Db, Collection } from 'mongodb';

const SYNC_DOMAIN_MESSAGES = new Set(['not_found']);

function syncLogAndRethrowOrServerInternal(context: string, error: unknown): never {
  console.error(context, error);
  if (error instanceof Error && SYNC_DOMAIN_MESSAGES.has(error.message)) {
    throw error;
  }
  throw new Error('SERVER_INTERNAL_ERROR');
}

interface VaultItem {
  itemId: string; // market_asset unique_id
  type: 'basics_free' | 'purchased_skin' | 'font' | 'wallpaper';
  name: string;
  icon?: string; // SVG or URL
  added_at: Date;
  is_active: boolean;
}

interface UserVault {
  uid: string;
  vault_items: VaultItem[];
  last_sync: Date;
}

export class MarketSyncService {
  private db: Db;
  private vaultCollection: Collection;
  private marketCollection: Collection;

  constructor(db: Db) {
    this.db = db;
    this.vaultCollection = db.collection('user_vaults');
    this.marketCollection = db.collection('market_assets');
  }

  /**
   * Inicializar vault de nuevo usuario con iconos GRATIS
   * Se ejecuta en registro (onboarding)
   */
  async initializeNewUserVault(uid: string): Promise<boolean> {
    try {
      // Obtener todos los iconos GRATIS (basics_free, is_default=true)
      const freeIcons = await this.marketCollection
        .find({
          collection: 'basics_free',
          is_default: true,
          is_active: true,
          status: 'published',
        })
        .toArray();

      if (freeIcons.length === 0) {
        console.warn('⚠️ No free icons found in market_assets');
        return false;
      }

      // Mapear iconos de market a vault items
      const vaultItems: VaultItem[] = freeIcons.map((icon: any) => ({
        itemId: icon.unique_id,
        type: 'basics_free',
        name: icon.name,
        icon: icon.icon_svg || icon.preview_url,
        added_at: new Date(),
        is_active: true,
      }));

      // Crear documento de vault para el usuario
      const userVault: UserVault = {
        uid,
        vault_items: vaultItems,
        last_sync: new Date(),
      };

      await this.vaultCollection.insertOne(userVault);

      console.log(`✅ User vault initialized: ${uid} with ${vaultItems.length} free icons`);
      return true;
    } catch (error) {
      syncLogAndRethrowOrServerInternal('❌ Initialize vault error:', error);
    }
  }

  /**
   * Sincronizar vault del usuario (pull updates desde market_assets)
   * Se ejecuta al abrir MyVault o MyCards
   */
  async syncUserVault(uid: string): Promise<VaultItem[]> {
    try {
      // Obtener vault actual del usuario
      const userVault = await this.vaultCollection.findOne({ uid });
      if (!userVault) {
        console.warn('❌ syncUserVault: vault missing', { uid });
        throw new Error('not_found');
      }

      // Obtener todos los assets disponibles (published + gratuitos)
      const availableAssets = await this.marketCollection
        .find({
          status: 'published',
          is_active: true,
        })
        .toArray();

      // Mapear a vault items
      const updatedItems: VaultItem[] = availableAssets.map((asset: any) => {
        // Buscar si ya existe en el vault del usuario
        const existing = userVault.vault_items.find((v: VaultItem) => v.itemId === asset.unique_id);

        return {
          itemId: asset.unique_id,
          type: asset.collection as any,
          name: asset.name,
          icon: asset.icon_svg || asset.preview_url,
          added_at: existing?.added_at || new Date(),
          is_active: existing?.is_active !== false,
        };
      });

      // Actualizar vault
      await this.vaultCollection.updateOne(
        { uid },
        {
          $set: {
            vault_items: updatedItems,
            last_sync: new Date(),
          },
        }
      );

      console.log(`✅ Vault synced: ${uid} with ${updatedItems.length} items`);
      return updatedItems;
    } catch (error) {
      syncLogAndRethrowOrServerInternal('❌ Sync vault error:', error);
    }
  }

  /**
   * Obtener vault del usuario (con actualizaciones)
   */
  async getUserVault(uid: string): Promise<UserVault | null> {
    try {
      const userVault = await this.vaultCollection.findOne({ uid });
      return userVault as UserVault | null;
    } catch (error) {
      syncLogAndRethrowOrServerInternal('❌ Get vault error:', error);
    }
  }

  /**
   * Notificar a todos los usuarios cuando se publica un asset
   * (Usado por admin al publicar skin/coleccionable)
   */
  async notifyAllUsersNewAsset(assetId: string): Promise<number> {
    try {
      const asset = await this.marketCollection.findOne({ unique_id: assetId });
      if (!asset) {
        console.warn('❌ notifyAllUsersNewAsset: asset missing', { assetId });
        throw new Error('not_found');
      }

      // En MVP, solo logueamos. En producción, enviar push notification
      console.log(`📢 New asset published: ${asset.name} (${assetId})`);

      // Marcar todos los vaults como "dirty" para sync en próxima consulta
      await this.vaultCollection.updateMany(
        {},
        {
          $set: {
            needs_sync: true,
          },
        }
      );

      const updatedCount = (await this.vaultCollection.countDocuments({ needs_sync: true })) || 0;
      console.log(`✅ Notified ${updatedCount} users of new asset`);

      return updatedCount;
    } catch (error) {
      syncLogAndRethrowOrServerInternal('❌ Notify users error:', error);
    }
  }

  /**
   * Obtener skins disponibles para MyCards (aplicables a tarjeta)
   */
  async getAvailableSkins(uid: string): Promise<any[]> {
    try {
      const userVault = await this.getUserVault(uid);
      if (!userVault) {
        console.warn('❌ getAvailableSkins: vault missing', { uid });
        throw new Error('not_found');
      }

      // Filtrar solo skins de la vault del usuario
      const skinIds = userVault.vault_items
        .filter((v: VaultItem) => v.type === 'purchased_skin' || v.type === 'basics_free')
        .map((v: VaultItem) => v.itemId);

      if (skinIds.length === 0) {
        console.log(`ℹ️ No skins available for user: ${uid}`);
        return [];
      }

      const skins = await this.marketCollection
        .find({
          unique_id: { $in: skinIds },
          collection: 'skins',
        })
        .toArray();

      return skins;
    } catch (error) {
      syncLogAndRethrowOrServerInternal('❌ Get available skins error:', error);
    }
  }

  /**
   * Estadísticas de sincronización
   */
  async getSyncStats(): Promise<any> {
    try {
      const totalUsers = await this.vaultCollection.countDocuments();
      const totalAssets = await this.marketCollection.countDocuments({ status: 'published' });
      const freeAssets = await this.marketCollection.countDocuments({
        is_default: true,
        is_active: true,
      });

      return {
        total_users_with_vault: totalUsers,
        total_assets_published: totalAssets,
        free_assets_default: freeAssets,
        sync_timestamp: new Date(),
      };
    } catch (error) {
      syncLogAndRethrowOrServerInternal('❌ Get sync stats error:', error);
    }
  }
}

export default MarketSyncService;

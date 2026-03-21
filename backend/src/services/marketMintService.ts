/**
 * MarketMintService
 * Gestión de creación, publicación y distribución de activos del Market
 * Soporta: Skins, Wallpapers, Fonts, Collectibles
 */

import { MongoClient, Db, Collection } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';

interface Collectible {
  unique_id: string; // [COLLECTION]-[SERIE_###]
  edition_number: number; // 1-100
  collection_name: string;
  rarity: 'gratis' | 'comun' | 'lujo' | 'legendario' | 'coleccionable';
  price_cs: number;
  stock_limit: number;
  current_holders: string[]; // array de UIDs propietarios
  is_resaleable: boolean;
  preview_url: string;
  created_at: Date;
  published_at: Date | null;
  is_active: boolean;
}

interface Skin {
  unique_id: string;
  name: string;
  components: {
    wallpaper_vertical: string; // URL to asset
    wallpaper_horizontal: string;
    icons: string[]; // Array de URLs
    font: string; // URL to font file
  };
  preview_image: string;
  rarity: string;
  price_cs: number;
  created_at: Date;
  published_at: Date | null;
}

interface AdminMintRequest {
  collection: string; // 'skins' | 'collectibles' | 'wallpapers' | 'fonts'
  name: string;
  rarity: string;
  price_cs: number;
  files: {
    wallpaper_vertical?: Buffer;
    wallpaper_horizontal?: Buffer;
    icons?: Buffer[];
    font?: Buffer;
    preview?: Buffer;
  };
}

export class MarketMintService {
  private db: Db | null = null;
  private collection: Collection | null = null;

  constructor(db: Db) {
    this.db = db;
    this.collection = db.collection('market_assets');
  }

  /**
   * Generar ID único para activo: [COLLECTION][NAME]-[SERIE_###]
   * Ejemplo: SKINS_MARVEL-001, COLLECTIBLES_BIRTHDAY-042
   */
  private generateUniqueId(collection: string, name: string, edition: number): string {
    const sanitizedName = name
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    const editionStr = String(edition).padStart(3, '0');
    return `${collection.toUpperCase()}_${sanitizedName}-${editionStr}`;
  }

  /**
   * Crear (mint) un nuevo activo en estado DRAFT
   * Retorna el objeto con preview ready
   */
  async mintAsset(request: AdminMintRequest): Promise<any> {
    try {
      const draft = {
        unique_id: this.generateUniqueId(request.collection, request.name, 1),
        collection: request.collection,
        name: request.name,
        rarity: request.rarity,
        price_cs: request.price_cs,
        status: 'draft', // draft | published | retired
        files: request.files,
        created_at: new Date(),
        published_at: null,
        updated_by: 'admin_pochobs',
        is_active: false,
      };

      // Insertar el draft en la colección
      const result = await this.collection?.insertOne(draft);

      console.log(`✅ Asset minted (draft): ${draft.unique_id}`);

      return {
        mint_id: result?.insertedId,
        unique_id: draft.unique_id,
        status: 'draft',
        preview_ready: true,
        files_uploaded: Object.keys(request.files).length,
      };
    } catch (error) {
      console.error('❌ Mint error:', error);
      throw new Error(`Failed to mint asset: ${(error as Error).message}`);
    }
  }

  /**
   * Publicar un asset del estado DRAFT a PUBLISHED
   * Activa el activo para distribución
   */
  async publishAsset(mint_id: string): Promise<any> {
    try {
      // Buscar el draft
      const draft = await this.collection?.findOne({ _id: new (require('mongodb')).ObjectId(mint_id) });

      if (!draft) {
        throw new Error('Asset not found');
      }

      if (draft.status !== 'draft') {
        throw new Error('Only draft assets can be published');
      }

      // Inicializar colecciones según tipo
      let stock_limit = 100; // Default para collectibles
      if (draft.collection === 'skins') stock_limit = 1000;
      if (draft.collection === 'wallpapers') stock_limit = 500;
      if (draft.collection === 'fonts') stock_limit = 200;

      // Actualizar a PUBLISHED
      const updateResult = await this.collection?.updateOne(
        { _id: new (require('mongodb')).ObjectId(mint_id) },
        {
          $set: {
            status: 'published',
            published_at: new Date(),
            is_active: true,
            stock_limit,
            current_holders: [],
            edition_counter: 1,
          },
        }
      );

      console.log(`✅ Asset published: ${draft.unique_id}`);

      return {
        published: true,
        unique_id: draft.unique_id,
        status: 'published',
        stock_limit,
        available_editions: stock_limit,
      };
    } catch (error) {
      console.error('❌ Publish error:', error);
      throw new Error(`Failed to publish asset: ${(error as Error).message}`);
    }
  }

  /**
   * Generar preview en tiempo real
   * Compone: wallpaper + iconos + fuente
   */
  async generatePreview(mint_id: string): Promise<Buffer> {
    try {
      const asset = await this.collection?.findOne({ _id: new (require('mongodb')).ObjectId(mint_id) });

      if (!asset) {
        throw new Error('Asset not found');
      }

      // Aquí iría la lógica de Canvas/SVG para componer el preview
      // Por ahora, retornamos un placeholder
      const previewBuffer = Buffer.from('Preview placeholder - implementar Canvas composition');

      console.log(`✅ Preview generated: ${asset.unique_id}`);
      return previewBuffer;
    } catch (error) {
      console.error('❌ Preview generation error:', error);
      throw new Error(`Failed to generate preview: ${(error as Error).message}`);
    }
  }

  /**
   * Listar todos los assets (con filtros opcionales)
   */
  async listAssets(filter?: any): Promise<any[]> {
    try {
      const query = filter || {};
      const assets = await this.collection?.find(query).toArray();
      return assets || [];
    } catch (error) {
      console.error('❌ List error:', error);
      throw new Error(`Failed to list assets: ${(error as Error).message}`);
    }
  }

  /**
   * Obtener estadísticas del market
   */
  async getMarketStats(): Promise<any> {
    try {
      const stats = await this.collection?.aggregate([
        {
          $group: {
            _id: '$collection',
            total_assets: { $sum: 1 },
            published: { $sum: { $cond: ['$is_active', 1, 0] } },
            draft: { $sum: { $cond: [{ $eq: ['$status', 'draft'] }, 1, 0] } },
          },
        },
      ]).toArray();

      return stats;
    } catch (error) {
      console.error('❌ Stats error:', error);
      throw new Error(`Failed to get stats: ${(error as Error).message}`);
    }
  }
}

export default MarketMintService;

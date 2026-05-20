/**
 * Gestión de creación, publicación y distribución de activos del Market (borradores y publicados).
 * Soporta: Skins, Wallpapers, Fonts, Collectibles
 */

import { Db, Collection } from 'mongodb';

/** Códigos en `Error.message` que la capa HTTP puede mapear; nunca incluir `cause.message` ni PII. */
const DRAFT_DOMAIN_MESSAGES = new Set(['not_found', 'invalid_payload']);

function draftLogAndRethrowOrServerInternal(context: string, error: unknown): never {
  console.error(context, error);
  if (error instanceof Error && DRAFT_DOMAIN_MESSAGES.has(error.message)) {
    throw error;
  }
  throw new Error('SERVER_INTERNAL_ERROR');
}

interface AdminMarketDraftUploadRequest {
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

export class MarketAssetDraftService {
  private db: Db | null = null;
  private collection: Collection | null = null;

  constructor(db: Db) {
    this.db = db;
    this.collection = db.collection('market_assets');
  }

  /**
   * Generar ID único para activo: [COLLECTION][NAME]-[SERIE_###]
   */
  private generateUniqueId(collection: string, name: string, edition: number): string {
    const sanitizedName = name
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    const editionStr = String(edition).padStart(3, '0');
    return `${collection.toUpperCase()}_${sanitizedName}-${editionStr}`;
  }

  /**
   * Crear un nuevo activo en estado DRAFT
   */
  async createDraftAsset(request: AdminMarketDraftUploadRequest): Promise<any> {
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

      const result = await this.collection?.insertOne(draft);

      console.log(`✅ Asset draft created: ${draft.unique_id}`);

      return {
        draft_id: result?.insertedId,
        unique_id: draft.unique_id,
        status: 'draft',
        preview_ready: true,
        files_uploaded: Object.keys(request.files).length,
      };
    } catch (error) {
      draftLogAndRethrowOrServerInternal('❌ Market draft creation error:', error);
    }
  }

  async publishAsset(draftId: string): Promise<any> {
    try {
      const oid = new (require('mongodb')).ObjectId(draftId);
      const draftDoc = await this.collection?.findOne({ _id: oid });

      if (!draftDoc) {
        throw new Error('not_found');
      }

      if (draftDoc.status !== 'draft') {
        throw new Error('invalid_payload');
      }

      let stock_limit = 100;
      if (draftDoc.collection === 'skins') stock_limit = 1000;
      if (draftDoc.collection === 'wallpapers') stock_limit = 500;
      if (draftDoc.collection === 'fonts') stock_limit = 200;

      await this.collection?.updateOne(
        { _id: oid },
        {
          $set: {
            status: 'published',
            published_at: new Date(),
            is_active: true,
            stock_limit,
            current_holders: [],
            edition_counter: 1,
          },
        },
      );

      console.log(`✅ Asset published: ${draftDoc.unique_id}`);

      return {
        published: true,
        unique_id: draftDoc.unique_id,
        status: 'published',
        stock_limit,
        available_editions: stock_limit,
      };
    } catch (error) {
      draftLogAndRethrowOrServerInternal('❌ Publish error:', error);
    }
  }

  async generatePreview(draftId: string): Promise<Buffer> {
    try {
      const oid = new (require('mongodb')).ObjectId(draftId);
      const asset = await this.collection?.findOne({ _id: oid });

      if (!asset) {
        throw new Error('not_found');
      }

      const previewBuffer = Buffer.from('Preview placeholder - implementar composición Canvas');
      console.log(`✅ Preview generated: ${asset.unique_id}`);
      return previewBuffer;
    } catch (error) {
      draftLogAndRethrowOrServerInternal('❌ Preview generation error:', error);
    }
  }

  async listAssets(filter?: any): Promise<any[]> {
    try {
      const query = filter || {};
      const assets = await this.collection?.find(query).toArray();
      return assets || [];
    } catch (error) {
      draftLogAndRethrowOrServerInternal('❌ List error:', error);
    }
  }

  async getMarketStats(): Promise<any> {
    try {
      const stats = await this.collection
        ?.aggregate([
          {
            $group: {
              _id: '$collection',
              total_assets: { $sum: 1 },
              published: { $sum: { $cond: ['$is_active', 1, 0] } },
              draft: { $sum: { $cond: [{ $eq: ['$status', 'draft'] }, 1, 0] } },
            },
          },
        ])
        .toArray();

      return stats;
    } catch (error) {
      draftLogAndRethrowOrServerInternal('❌ Stats error:', error);
    }
  }
}

export default MarketAssetDraftService;

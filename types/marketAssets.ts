/**
 * Market Assets Types
 * Estructura de colecciones para Skins, Wallpapers, Fonts y Coleccionables
 */

export type AssetRarity = 'gratis' | 'comun' | 'lujo' | 'legendario' | 'coleccionable';
export type AssetCategory = 'skin' | 'wallpaper' | 'font' | 'collectible';
export type WallpaperOrientation = 'vertical' | 'horizontal';

/**
 * Coleccionable Único
 * ID Format: [COLLECTION][NAME]-[SERIE]
 * Ejemplo: MARVELSPIDERMAN4-100
 */
export interface Collectible {
  id: string; // UUID generada por DB
  unique_id: string; // MARVELSPIDERMAN-100 (profesional, sin rarity tag)
  collection_name: string; // "Marvel Spider-Man"
  series_name: string; // "Spider-Man 4"
  edition_number: number; // 1-100
  stock_limit: number; // Total de ediciones en la serie (ej: 100)
  current_holders: number; // Cuántos usuarios ya poseen esta edición
  rarity: AssetRarity; // 'coleccionable'
  description: string;
  image_url?: string; // URL del asset en Azure Blob Storage
  price_cs: number; // Precio en Crystal Shards
  is_resaleable: boolean; // Permite marketplace secundario
  created_at: Date;
  updated_at: Date;
}

/**
 * Skin (Tema completo: Wallpaper + Iconos + Font)
 */
export interface Skin {
  id: string;
  name: string; // "Lujo Edition", "Marvel Pack"
  rarity: AssetRarity;
  description: string;
  price_cs: number;
  components: {
    wallpaper_vertical: string; // URL Azure
    wallpaper_horizontal: string; // URL Azure
    icons: IconAsset[]; // Array de iconos incluidos
    font: FontAsset; // Font aplicada
  };
  preview_image?: string; // Screenshot del skin renderizado
  created_at: Date;
  updated_at: Date;
}

/**
 * Wallpaper (Individual, puede estar vinculado a Skin)
 */
export interface Wallpaper {
  id: string;
  name: string;
  orientation: WallpaperOrientation; // 'vertical' | 'horizontal'
  unique_id: string; // WALLPAPER-LUJO-001
  rarity: AssetRarity;
  image_url: string; // Azure URL
  price_cs?: number; // Si se vende por separado
  is_standalone: boolean; // Si puede comprarse sin skin
  created_at: Date;
  updated_at: Date;
}

/**
 * Icon Asset (Individual)
 */
export interface IconAsset {
  id: string;
  name: string; // "Crown", "Star", etc.
  unique_id?: string; // Opcional si es parte de pack
  rarity: AssetRarity;
  svg_url: string; // URL del SVG
  png_url?: string; // URL del PNG (alternativa)
  tags: string[]; // ['premium', 'gold', 'luxury']
  created_at: Date;
}

/**
 * Font Asset (Tipografía embebible)
 */
export interface FontAsset {
  id: string;
  family_name: string; // "Alfonso R.", "Ejecutivo"
  unique_id: string; // FONT-ALFONSO-001
  rarity: AssetRarity;
  ttf_url: string; // URL del archivo .ttf en Azure
  preview_text: string; // "Ejecutivo Moderno Font"
  weight_variants?: ('normal' | 'bold' | 'italic')[]; // Variantes disponibles
  created_at: Date;
}

/**
 * User Vault Assets (Inventario del usuario)
 * Estructura: [Gratis] -> [Skins Comprados] -> [Coleccionables]
 */
export interface UserVaultAsset {
  user_id: string; // UID del usuario
  free_tier_assets: string[]; // IDs de los 10 assets gratis por defecto
  purchased_skins: PurchasedSkin[];
  collectibles: OwnedCollectible[];
  created_at: Date;
  updated_at: Date;
}

/**
 * Skin comprado por usuario (con metadatos de compra)
 */
export interface PurchasedSkin {
  skin_id: string; // Referencia a Skin doc
  purchased_at: Date;
  price_paid_cs: number;
  transaction_id: string; // RevenueCat o interno
}

/**
 * Coleccionable en posesión del usuario
 */
export interface OwnedCollectible {
  collectible_id: string; // Referencia a Collectible
  unique_id: string; // MARVELSPIDERMAN4-100
  edition_number: number; // Su número de serie específico
  acquired_at: Date;
  acquisition_price_cs: number;
  is_for_sale?: boolean; // Si lo ofrece en marketplace secundario
  asking_price_cs?: number;
}

/**
 * Payload administrativo para crear un borrador de activo de Market en Card Studio.
 */
export interface AdminMarketDraftRequest {
  category: AssetCategory; // 'skin' | 'wallpaper' | 'font' | 'collectible'
  name: string;
  collection_name?: string; // Para coleccionables
  series_name?: string; // Para coleccionables
  edition_limit?: number; // Para series (ej: 100)
  rarity: AssetRarity;
  price_cs: number;
  description: string;

  // File uploads
  files: {
    wallpaper_vertical?: File;
    wallpaper_horizontal?: File;
    icons?: File[]; // SVG/PNG
    font?: File; // .ttf
    preview_image?: File;
  };

  metadata?: {
    tags?: string[];
    is_resaleable?: boolean;
  };
}

/**
 * Admin Publish Payload (Finalizar y publicar a cloud)
 */
export interface AdminPublishPayload {
  draft_id: string; // Referencia a borrador en DB
  confirm_ready: boolean; // Admin confirma que se ve bien en preview
  override_price?: number; // Ajuste en último momento
}

/**
 * Admin Session Token (JWT payload)
 */
export interface AdminSessionPayload {
  admin_id: string;
  username: string;
  role: 'admin' | 'super_admin';
  iat: number;
  exp: number; // Expira en 30 minutos
  iss: 'card-social-admin';
}

/**
 * Presentación visual de una Smart Card del emisor (lo que ve el receptor).
 * Alineado con `smart_cards` en Mongo y con el listado `/contacts/received`.
 */
export type IssuerSmartCardPresentation = {
  themeId?: string;
  layout?: 'vertical' | 'horizontal';
  fontId?: string | null;
  fontName?: string | null;
  fontFamily?: string | null;
  fontTier?: 'free' | 'premium' | null;
  wallpaperId?: string | null;
  wallpaperUrl?: string | null;
  wallpaperThumbUrl?: string | null;
  wallpaperTier?: 'free' | 'premium' | null;
  wallpaperPriceCredits?: number;
  enableParallax?: boolean;
  itemIds?: string[];
  /** ISO; para invalidar caché cuando el dueño actualiza la tarjeta */
  cardUpdatedAt?: string | null;
};

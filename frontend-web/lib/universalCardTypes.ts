export type PublicSlot = {
  itemId?: string;
  type: string;
  label: string;
  value: string;
  icon?: string | null;
  iconName?: string | null;
  vaultMimeType?: string | null;
};

export type CardData = {
  sid?: string;
  bId?: string;
  /** Titular (Ghost-Link / contexto de app). */
  uid?: string;
  /** Título de la tarjeta (alineado con Mongo `smart_cards.scName`). */
  scName: string;
  layout: 'vertical' | 'horizontal';
  themeId: string | null;
  wallpaperUrl: string | null;
  /**
   * Nombre persona canónico (API `userFullName`); si la API solo manda espejo Mongo,
   * `normalizeUniversalCardPayload` rellena desde `ownerDisplayName`.
   */
  userFullName?: string | null;
  userNickName?: string | null;
  ownerDisplayName: string;
  ownerNickname: string | null;
  /**
   * Imagen en el documento de tarjeta (API `ownerPhotoUrl` / Mongo `smart_cards`).
   * No es `userAvatarUrl`: en business suele ser logo; en smart, foto de la tarjeta.
   */
  cardWireframeImageUrl: string | null;
  ownerOccupation: string | null;
  /** Persona (Mongo users/profiles). */
  userAvatarUrl?: string | null;
  holdersCount: number;
  ratingAvg: number;
  totalRatings: number;
  slots: PublicSlot[];
  expiresAt: string;
};

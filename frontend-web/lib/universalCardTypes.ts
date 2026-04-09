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
  cardId: string;
  /** Titular (Ghost-Link / contexto de app). */
  ownerUid?: string;
  name: string;
  layout: 'vertical' | 'horizontal';
  themeId: string | null;
  wallpaperUrl: string | null;
  ownerDisplayName: string;
  ownerNickname: string | null;
  ownerPhotoUrl: string | null;
  ownerOccupation: string | null;
  holdersCount: number;
  ratingAvg: number;
  totalRatings: number;
  slots: PublicSlot[];
  expiresAt: string;
};

/**
 * Presentación visual de una Smart Card del emisor (lo que ve el receptor).
 * Alineado con `smart_cards` en Mongo y con el listado `/contacts/received`.
 */

/**
 * Fase D — identidad canónica (no duplicar conceptos con otros nombres):
 *
 * - **userFullName / userNickName / userAvatarUrl** — persona (Mongo `users`/`profiles`, API contactos, Ghost-Link `peer*` cuando es la misma semántica).
 * - **ownerPhotoUrl** — imagen guardada en `smart_cards` para el wireframe (smart: foto emisor en tarjeta; business: suele ser logo `bcLogoUrl`). No es alias de `userAvatarUrl`.
 * - **peerPhotoUrl** — solo en flujo llamada (VoIP): URL a mostrar para el par; en la práctica se rellena con `userAvatarUrl` del par, no con un tercer origen nuevo.
 * - **avatarUrl** — campo del modal `MyCardsPayload`: círculo de preview = persona → rellenar desde `userAvatarUrl` del emisor (`pickIssuerCircleAvatarUrl`).
 * - **photoUrl** — house ads / Firestore legacy; no mezclar con perfil.
 * - **displayName** — etiqueta de UI local derivada de `userFullName` o nombre de tarjeta.
 * - **bcName / scName** — nombres de tarjeta negocio / smart (`readSmartCardScName`).
 */
export function pickIssuerCircleAvatarUrl(input: { userAvatarUrl?: string | null }): string | null {
  const u = String(input.userAvatarUrl ?? '').trim();
  return u ? u : null;
}

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

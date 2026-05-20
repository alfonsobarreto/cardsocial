/**
 * Constantes de reglas de producto Card-Social (tarjetas, fotos por tipo, privilegios super_admin).
 */

/**
 * Reglas de foto por tipo de tarjeta.
 *
 * - personal / social: usa OBLIGATORIAMENTE la foto de perfil del usuario.
 *   El usuario NO puede customizar la foto de estas tarjetas.
 * - business: permite una foto custom (ej. logo del negocio, foto del local).
 *   Si no se asigna foto custom, cae back a la foto de perfil.
 *
 * Quién puede modificar fotos:
 * - El propietario de la tarjeta business puede cambiar su foto custom.
 * - pochobs_admin / super_admin puede cambiar fotos en CUALQUIER tarjeta
 *   (personal, social o business) sin restricción.
 */
export const CARD_PHOTO_RULES = Object.freeze({
  personal: { allowCustomPhoto: false, fallbackToProfilePhoto: true },
  social: { allowCustomPhoto: false, fallbackToProfilePhoto: true },
  business: { allowCustomPhoto: true, fallbackToProfilePhoto: true },
} as const);

/**
 * Privilegios del super_admin (pochobs_admin).
 * Fuente de verdad para la UI y los servicios.
 */
export const SUPER_ADMIN_PRIVILEGES = Object.freeze({
  unlimitedCards: true,
  unlimitedVaultItems: true,
  freeIconPackClaims: true, // sin costo de créditos
  collectibleStillDecrement: true, // coleccionables siguen usando 1 del supply (regla 99/100)
  canEditAnyCardPhoto: true, // puede cambiar foto en personal/social también
  canEditBusinessCardPhoto: true,
  hideProgressBar: true, // la barra de uso desaparece (ilimitado)
  subscriptionPlan: 'premium-infinite',
} as const);

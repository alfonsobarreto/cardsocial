/**
 * Economía CS (Card-Social credits) — tipo de cambio oficial en producto.
 * 100 CS = 1 USD de valor (unificado en app, web copy y costes derivados).
 */
export const CS_CREDITS_PER_USD = 100;

export function csCreditsFromUsd(usd: number): number {
  if (!Number.isFinite(usd) || usd <= 0) return 0;
  return Math.max(0, Math.round(usd * CS_CREDITS_PER_USD));
}

/** Bono bienvenida tras confirmar pago (~$10 USD al tipo legacy). */
export const WELCOME_BONUS_CS = csCreditsFromUsd(10);

export const PREMIUM_STORY_COST_CS: Record<'7d' | '30d', number> = {
  '7d': csCreditsFromUsd(5),
  '30d': csCreditsFromUsd(18),
};

/** Pack estudiantil (.edu + social): ~$100 USD en CS al tipo actual. */
export const STUDENT_PACK_BONUS_CS = csCreditsFromUsd(100);

/** Cashback licencia anual tarjeta de negocio (~$100 USD en CS). */
export const BUSINESS_CARD_CASHBACK_CS = csCreditsFromUsd(100);

/** Icono de catálogo Studio (vector) cuando STUDIO_CATALOG_VECTOR_ICONS_PAID es true — ~$2.50 USD. */
export const STUDIO_ICON_CREDIT_PRICE = csCreditsFromUsd(2.5);

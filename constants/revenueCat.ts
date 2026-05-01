/**
 * RevenueCat — identificadores del proyecto (dashboard: Entitlements).
 *
 * El **lookup identifier** del entitlement debe coincidir con la clave en
 * `customerInfo.entitlements.active[id]` (no siempre es el nombre visible).
 *
 * Docs: [React Native install](https://www.revenuecat.com/docs/getting-started/installation/reactnative),
 * [Expo](https://www.revenuecat.com/docs/getting-started/installation/expo).
 */

function parseAliasesFromEnv(): string[] {
  const raw = String(process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_PRO_ALIASES || '').trim();
  if (!raw) return [];
  return raw
    .split(/[,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Identificador principal (usado en paywalls `presentPaywallIfNeeded`, etc.). */
export const CARD_SOCIAL_PRO_ENTITLEMENT_ID =
  String(process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_PRO_ID || 'card_social_pro').trim() || 'card_social_pro';

/**
 * Todas las claves que comprobamos en `active` (por si en el dashboard usaste otro id
 * o el mismo texto que el nombre visible, p. ej. "Card-Social Pro").
 * Opcional: `EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_PRO_ALIASES=id1,id2`
 */
export const CARD_SOCIAL_PRO_ENTITLEMENT_LOOKUP_KEYS: string[] = Array.from(
  new Set(
    [
      CARD_SOCIAL_PRO_ENTITLEMENT_ID,
      ...parseAliasesFromEnv(),
      'card_social_pro',
      'Card-Social Pro',
    ].filter(Boolean),
  ),
);

/** Offering identifier opcional; si vacío, RC usa el "current" offering del proyecto. */
export const CARD_SOCIAL_PRO_OFFERING_ID = String(
  process.env.EXPO_PUBLIC_REVENUECAT_OFFERING_ID || '',
).trim();

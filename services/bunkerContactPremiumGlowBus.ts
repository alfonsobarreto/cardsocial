import { DeviceEventEmitter } from 'react-native';

/** Tras guardar contacto premium en Búnker: pulso dorado `shell.ctaAccent` en lista Contactos. */
export const BUNKER_CONTACT_PREMIUM_GLOW_EVENT = 'cardSocial.bunkerContactPremiumGlow' as const;

export type BunkerContactPremiumGlowPayload = { linkKey: string };

export function emitBunkerContactPremiumGlow(payload: BunkerContactPremiumGlowPayload): void {
  DeviceEventEmitter.emit(BUNKER_CONTACT_PREMIUM_GLOW_EVENT, payload);
}

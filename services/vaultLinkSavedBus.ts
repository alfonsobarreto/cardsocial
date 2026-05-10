import { DeviceEventEmitter } from 'react-native';

/** Tras guardar un ítem de bóveda: refresca Mis Tarjetas / wireframe sin cambiar de pestaña. */
export const VAULT_LINK_SAVED_EVENT = 'cardSocial.vaultLinkSaved' as const;

export type VaultLinkSavedPayload = {
  uid: string;
  linkId: string;
  /** Celda grid: pulso dorado al crear ítem (cuenta Ferrari). */
  premiumSensory?: boolean;
};

export function emitVaultLinkSaved(payload: VaultLinkSavedPayload): void {
  DeviceEventEmitter.emit(VAULT_LINK_SAVED_EVENT, payload);
}

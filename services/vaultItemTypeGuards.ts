import { isGhostLinkVaultType } from '@/constants/ghostLinkVault';
import { normalizeVaultItemTypeKey } from '@/services/deepSearch';

/**
 * Teléfono clásico (Bóveda): número libre; acción = marcador nativo tel:.
 * No confundir con Ghost-Link (VoIP por UID, sin valor telefónico).
 */
export function isClassicPhoneVaultType(type: string | null | undefined): boolean {
  if (isGhostLinkVaultType(type)) {
    return false;
  }
  const k = normalizeVaultItemTypeKey(type);
  if (!k) {
    return false;
  }
  if (
    k === 'telefono' ||
    k === 'telephone' ||
    k === 'phone' ||
    k === 'movil' ||
    k === 'mobile' ||
    k === 'cell' ||
    k === 'celular'
  ) {
    return true;
  }
  if (k.includes('telefono') || k.includes('telephone')) {
    return true;
  }
  return false;
}

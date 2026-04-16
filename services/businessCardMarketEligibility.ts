/**
 * Regla única Social Market (Fase 0): solo entran negocios con licencia/suscripción OK.
 * Trial activo o anualidad pagada vive en `users/{uid}/business_card_licenses/{bId}`
 * vía hasActiveBusinessLicense. Sin OK → invisible en el mercado (NULL para búsqueda).
 */

import { hasActiveBusinessLicense } from '@/services/businessLicenseService';
import type { BusinessCard } from '@/types/businessCard';

export async function isBusinessCardMarketEligible(
  card: Pick<BusinessCard, 'uid' | 'bId'>,
): Promise<boolean> {
  const uid = String(card.uid || '').trim();
  const bId = String(card.bId || '').trim();
  if (!uid || !bId) {
    return false;
  }
  return hasActiveBusinessLicense(uid, bId);
}

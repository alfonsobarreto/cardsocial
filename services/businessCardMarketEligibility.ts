/**
 * Regla única Social Market (Fase 0): solo entran negocios con licencia/suscripción OK.
 * Trial activo o anualidad pagada vive en `users/{ownerUid}/business_card_licenses/{cardId}`
 * vía hasActiveBusinessLicense. Sin OK → invisible en el mercado (NULL para búsqueda).
 */

import { hasActiveBusinessLicense } from '@/services/businessLicenseService';
import type { BusinessCard } from '@/types/businessCard';

export async function isBusinessCardMarketEligible(
  card: Pick<BusinessCard, 'ownerUid' | 'id'>,
): Promise<boolean> {
  const ownerUid = String(card.ownerUid || '').trim();
  const cardId = String(card.id || '').trim();
  if (!ownerUid || !cardId) {
    return false;
  }
  return hasActiveBusinessLicense(ownerUid, cardId);
}

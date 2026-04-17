/**
 * Business Card Service (legacy shim).
 *
 * Historial: este archivo antes hacía I/O directo contra Firestore
 * `businessCards`. Con el rebuild (pasos 3, 6, 9, 10), **toda** creación /
 * lectura / mutación / listado de Business Cards pasó al par:
 *
 *   - Backend:  `backend/src/routes/businessCardsRoutes.js`
 *   - Frontend: `services/businessCardsRepo.ts` (REST → MongoDB)
 *
 * Lo único que sobrevive aquí es `readBusinessCardIdentityFields`, un helper
 * puro que extrae los 3 campos canónicos (`bcName`, `bcContactName`,
 * `bcLogoUrl`) de un objeto arbitrario, y que aún se usa en:
 *
 *   - services/adaptBusinessCardMarketPremium.ts
 *   - services/storiesFeedInjectionService.ts
 *   - services/searchService.ts
 *   - app/scan.tsx
 *
 * Todo el resto (createBusinessCard, listBusinessCardsByOwner,
 * updateBusinessCard, rateBusinessCard, mergeBusinessCardRowsWithMongoOwnerPhoto,
 * etc.) se eliminó porque ya nadie lo importa. Esos caminos eran los que
 * provocaban la “Contract Poverty” y la doble fuente (Firestore ↔ Mongo) que
 * el rebuild cortó de raíz.
 */

/** Igual que Smart Cards (12 slots): máx. ítems de Bóveda por tarjeta de negocio. */
export const MAX_BUSINESS_VAULT_DATA_SLOTS = 12;

/**
 * Lee los 3 campos canónicos de identidad de tarjeta business desde un doc
 * arbitrario (Firestore legacy, Mongo `business_cards`, snapshot denormalizado).
 * Devuelve strings recortados (nunca `null`/`undefined`).
 */
export function readBusinessCardIdentityFields(data: Record<string, unknown>): {
  bcName: string;
  bcContactName: string;
  bcLogoUrl: string;
} {
  return {
    bcName: String(data.bcName ?? '').trim(),
    bcContactName: String(data.bcContactName ?? '').trim(),
    bcLogoUrl: String(data.bcLogoUrl ?? '').trim(),
  };
}

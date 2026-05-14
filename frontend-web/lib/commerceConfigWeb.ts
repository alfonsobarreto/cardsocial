/**
 * Paridad con `services/commerceConfigService.ts` (app): lectura de `system_config/commerce`.
 * En web no usamos RevenueCat; solo catálogo publicado en Firestore.
 */
export type { PublicCommercePack as CommerceCreditPackWeb } from '@/lib/publicSystemConfig';
export { fetchPublicCommerceConfig as getCommerceConfigForWeb } from '@/lib/publicSystemConfig';

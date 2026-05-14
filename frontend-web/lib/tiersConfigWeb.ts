/**
 * Paridad con `services/tiersConfigService.ts` (app móvil): mismo documento y coerción
 * vía `mergeTiersConfigFromFirestore`.
 */
export type { TierKey, TiersConfig, TierLimits, AddOnsConfig } from '@/lib/studioTierPolicy';
export { mergeTiersConfigFromFirestore, DEFAULT_TIERS_CONFIG } from '@/lib/studioTierPolicy';
export { fetchPublicTiersConfig as getTiersConfigForWeb } from '@/lib/publicSystemConfig';

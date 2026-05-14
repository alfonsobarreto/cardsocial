/**
 * Acceso a Market Radar Pro (mint en Card Studio): flags en `users/{uid}`.
 * Superadmin publica precio en `system_config/market_radar`.
 */
export function userHasMarketRadarProAccess(
  data: Record<string, unknown> | null | undefined,
  isOpsAdmin: boolean,
): boolean {
  if (isOpsAdmin) return true;
  if (!data) return false;
  if (data.marketRadarProActive === true) return true;
  const exp = data.marketRadarProExpiresAt as { toMillis?: () => number } | undefined;
  if (exp && typeof exp.toMillis === 'function' && exp.toMillis() > Date.now()) return true;
  return false;
}

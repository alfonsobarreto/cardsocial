/**
 * Modo prueba / entorno de gracia para el dashboard (sin inyectar fechas ficticias).
 *
 * - `EXPO_PUBLIC_DASHBOARD_TESTING_GRACE_MODE`: flag de build (1/true).
 * - `radar_trial_enabled`: Firestore `system_config/market_radar` (también en cache sync).
 *
 * La UI del badge de expiración usa `isDashboardTrialDisplayMode` para mostrar
 * “Modo prueba” en lugar de una fecha; con todo apagado, solo fechas reales de compra.
 */

export function isDashboardTestingGraceModeEnabled(): boolean {
  const v = process.env.EXPO_PUBLIC_DASHBOARD_TESTING_GRACE_MODE;
  return v === '1' || v === 'true' || v === 'TRUE';
}

/** True si el entorno de pruebas o el trial global de Radar está activo. */
export function isDashboardTrialDisplayMode(envTestingGrace: boolean, radarTrialEnabled: boolean): boolean {
  return envTestingGrace || radarTrialEnabled === true;
}

/**
 * Alerta post-creación de Business Card con mención al periodo de prueba.
 *
 * Reglas:
 * - Modo prueba activo (`isDashboardTrialDisplayMode`): nunca mostrar.
 * - Modo prueba off: el copy usa `freeTrialDays` del tier `business` en `system_config/tiers`.
 * - `BUSINESS_CARD_CREATE_TRIAL_ALERT_UI_ENABLED`: interruptor maestro de UI (silenciado por defecto).
 *
 * El trial real lo aplica el backend al crear la tarjeta; este módulo solo gobierna el mensaje en app.
 */

import {
  isDashboardTestingGraceModeEnabled,
  isDashboardTrialDisplayMode,
} from '@/services/dashboardTestingGrace';
import { getRadarTrialEnabledSync } from '@/services/radarTrialEnabledCache';
import { getTiersConfig } from '@/services/tiersConfigService';

/** Cambiar a `true` cuando quieras reactivar el Alert en createBusinessCard. */
export const BUSINESS_CARD_CREATE_TRIAL_ALERT_UI_ENABLED = false;

export function isBusinessCardAppTestModeActive(): boolean {
  return isDashboardTrialDisplayMode(isDashboardTestingGraceModeEnabled(), getRadarTrialEnabledSync());
}

/** Días de prueba publicados en superadmin (tier business). */
export async function resolveBusinessCardTrialDaysFromTierPolicy(): Promise<number> {
  const tiers = await getTiersConfig();
  return Math.max(0, tiers?.business?.freeTrialDays ?? 0);
}

export function shouldShowBusinessCardCreateTrialAlert(params: {
  testModeActive: boolean;
  tierTrialDays: number;
  uiEnabled?: boolean;
}): boolean {
  const uiOn = params.uiEnabled ?? BUSINESS_CARD_CREATE_TRIAL_ALERT_UI_ENABLED;
  if (!uiOn) return false;
  if (params.testModeActive) return false;
  return params.tierTrialDays > 0;
}

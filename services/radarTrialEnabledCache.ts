/**
 * Cache sincrónico de `system_config/market_radar.radar_trial_enabled`.
 * Actualizado por `marketRadarConfigService` (snapshot / getDoc).
 */
let radarTrialEnabled = false;

export function setRadarTrialEnabledCache(value: boolean): void {
  radarTrialEnabled = value;
}

export function getRadarTrialEnabledSync(): boolean {
  return radarTrialEnabled;
}

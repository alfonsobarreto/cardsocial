import { doc, getDoc, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { db } from '@/services/firebaseConfig';
import { setRadarTrialEnabledCache } from '@/services/radarTrialEnabledCache';

export type MarketRadarRemoteConfig = {
  proPriceUsd: number;
  proEquivalentCs: number;
  /** Prueba global (Firestore): tier efectivo business + Radar Studio sin gates Pro/tarjeta. */
  radarTrialEnabled: boolean;
};

const REF = doc(db, 'system_config', 'market_radar');

function coerceMarketRadarData(d: Record<string, unknown> | undefined): MarketRadarRemoteConfig {
  if (!d) {
    setRadarTrialEnabledCache(false);
    return { proPriceUsd: 0, proEquivalentCs: 0, radarTrialEnabled: false };
  }
  const trial = d.radar_trial_enabled === true;
  setRadarTrialEnabledCache(trial);
  return {
    proPriceUsd: Math.max(0, Number(d.proPriceUsd) || 0),
    proEquivalentCs: Math.max(0, Math.floor(Number(d.proEquivalentCs) || 0)),
    radarTrialEnabled: trial,
  };
}

export async function getMarketRadarRemoteConfig(): Promise<MarketRadarRemoteConfig> {
  try {
    const snap = await getDoc(REF);
    if (!snap.exists()) {
      setRadarTrialEnabledCache(false);
      return { proPriceUsd: 0, proEquivalentCs: 0, radarTrialEnabled: false };
    }
    return coerceMarketRadarData(snap.data() as Record<string, unknown>);
  } catch {
    setRadarTrialEnabledCache(false);
    return { proPriceUsd: 0, proEquivalentCs: 0, radarTrialEnabled: false };
  }
}

/** Suscripción en tiempo real; mantiene `getRadarTrialEnabledSync()` al día. */
export function subscribeMarketRadarRemoteConfig(
  onUpdate: (cfg: MarketRadarRemoteConfig) => void,
  onError?: (e: Error) => void,
): Unsubscribe {
  return onSnapshot(
    REF,
    (snap) => {
      const cfg = snap.exists()
        ? coerceMarketRadarData(snap.data() as Record<string, unknown>)
        : coerceMarketRadarData(undefined);
      onUpdate(cfg);
    },
    (err) => {
      if (onError) onError(err);
    },
  );
}

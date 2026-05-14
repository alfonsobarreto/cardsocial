import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/services/firebaseConfig';

export type MarketRadarRemoteConfig = {
  proPriceUsd: number;
  proEquivalentCs: number;
};

const REF = doc(db, 'system_config', 'market_radar');

export async function getMarketRadarRemoteConfig(): Promise<MarketRadarRemoteConfig> {
  try {
    const snap = await getDoc(REF);
    if (!snap.exists()) return { proPriceUsd: 0, proEquivalentCs: 0 };
    const d = snap.data() as Record<string, unknown>;
    return {
      proPriceUsd: Math.max(0, Number(d.proPriceUsd) || 0),
      proEquivalentCs: Math.max(0, Math.floor(Number(d.proEquivalentCs) || 0)),
    };
  } catch {
    return { proPriceUsd: 0, proEquivalentCs: 0 };
  }
}

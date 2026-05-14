import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { db } from '../config/firebase';

export type MarketRadarConfig = {
  proPriceUsd: number;
  proEquivalentCs: number;
};

export const DEFAULT_MARKET_RADAR_CONFIG: MarketRadarConfig = {
  proPriceUsd: 0,
  proEquivalentCs: 0,
};

const REF = doc(db, 'system_config', 'market_radar');
const AUDIT = collection(db, 'market_radar_audit_logs');

export async function getMarketRadarConfig(): Promise<MarketRadarConfig> {
  const snap = await getDoc(REF);
  if (!snap.exists()) {
    return { ...DEFAULT_MARKET_RADAR_CONFIG };
  }
  const d = snap.data() as Record<string, unknown>;
  const proPriceUsd = Math.max(0, Number(d.proPriceUsd) || 0);
  const proEquivalentCs = Math.max(0, Math.floor(Number(d.proEquivalentCs) || 0));
  return { proPriceUsd, proEquivalentCs };
}

export async function updateMarketRadarConfig(config: MarketRadarConfig, updatedBy: string): Promise<void> {
  await setDoc(
    REF,
    {
      proPriceUsd: Math.max(0, Number(config.proPriceUsd) || 0),
      proEquivalentCs: Math.max(0, Math.floor(Number(config.proEquivalentCs) || 0)),
      updatedAt: serverTimestamp(),
      updatedBy,
    },
    { merge: true },
  );
  await addDoc(AUDIT, {
    snapshot: {
      proPriceUsd: Math.max(0, Number(config.proPriceUsd) || 0),
      proEquivalentCs: Math.max(0, Math.floor(Number(config.proEquivalentCs) || 0)),
    },
    updatedBy,
    timestamp: serverTimestamp(),
  });
}

export type MarketRadarAuditRow = {
  id: string;
  updatedBy: string;
  proPriceUsd: number;
  proEquivalentCs: number;
  timestamp?: Date | null;
};

export async function getMarketRadarAuditLogs(): Promise<MarketRadarAuditRow[]> {
  const snap = await getDocs(query(AUDIT, orderBy('timestamp', 'desc'), limit(10)));
  return snap.docs.map((docSnap) => {
    const data = docSnap.data() as Record<string, unknown>;
    const snapshot = (data.snapshot as Record<string, unknown>) || {};
    const ts = data.timestamp as { toDate?: () => Date } | undefined;
    return {
      id: docSnap.id,
      updatedBy: String(data.updatedBy || 'unknown'),
      proPriceUsd: Math.max(0, Number(snapshot.proPriceUsd) || 0),
      proEquivalentCs: Math.max(0, Math.floor(Number(snapshot.proEquivalentCs) || 0)),
      timestamp: ts && typeof ts.toDate === 'function' ? ts.toDate() : null,
    };
  });
}

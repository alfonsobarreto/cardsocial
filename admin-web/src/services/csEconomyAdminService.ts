import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';

export type ThemeBundlePricingRow = {
  priceUsd: number;
  creditsCs: number;
};

export type CsEconomyAdminConfig = {
  welcomeBonusUsd: number;
  welcomeBonusCs: number;
  studentPackUsd: number;
  studentPackBonusCs: number;
  businessCardCashbackUsd: number;
  businessCardCashbackCs: number;
  studioIconUsd: number;
  studioIconCreditCs: number;
  themeBundles: Record<string, ThemeBundlePricingRow>;
};

const REF = doc(db, 'system_config', 'cs_economy');

const DEFAULT_THEME_BUNDLE_ID = 'texas_longhorns';

export const DEFAULT_CS_ECONOMY_ADMIN: CsEconomyAdminConfig = {
  welcomeBonusUsd: 0,
  welcomeBonusCs: 0,
  studentPackUsd: 0,
  studentPackBonusCs: 0,
  businessCardCashbackUsd: 0,
  businessCardCashbackCs: 0,
  studioIconUsd: 0,
  studioIconCreditCs: 0,
  themeBundles: {
    [DEFAULT_THEME_BUNDLE_ID]: { priceUsd: 0, creditsCs: 0 },
  },
};

function coerceThemeBundles(raw: unknown): Record<string, ThemeBundlePricingRow> {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_CS_ECONOMY_ADMIN.themeBundles };
  }
  const out: Record<string, ThemeBundlePricingRow> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const id = String(k).trim();
    if (!id || !v || typeof v !== 'object') continue;
    const o = v as Record<string, unknown>;
    out[id] = {
      priceUsd: Math.max(0, Number(o.priceUsd) || 0),
      creditsCs: Math.max(0, Math.floor(Number(o.creditsCs) || 0)),
    };
  }
  return Object.keys(out).length ? out : { ...DEFAULT_CS_ECONOMY_ADMIN.themeBundles };
}

export function coerceCsEconomyAdmin(data: Record<string, unknown> | undefined): CsEconomyAdminConfig {
  if (!data) return { ...DEFAULT_CS_ECONOMY_ADMIN, themeBundles: { ...DEFAULT_CS_ECONOMY_ADMIN.themeBundles } };
  return {
    welcomeBonusUsd: Math.max(0, Number(data.welcomeBonusUsd) || 0),
    welcomeBonusCs: Math.max(0, Math.floor(Number(data.welcomeBonusCs) || 0)),
    studentPackUsd: Math.max(0, Number(data.studentPackUsd) || 0),
    studentPackBonusCs: Math.max(0, Math.floor(Number(data.studentPackBonusCs) || 0)),
    businessCardCashbackUsd: Math.max(0, Number(data.businessCardCashbackUsd) || 0),
    businessCardCashbackCs: Math.max(0, Math.floor(Number(data.businessCardCashbackCs) || 0)),
    studioIconUsd: Math.max(0, Number(data.studioIconUsd) || 0),
    studioIconCreditCs: Math.max(0, Math.floor(Number(data.studioIconCreditCs) || 0)),
    themeBundles: coerceThemeBundles(data.themeBundles),
  };
}

export async function getCsEconomyAdminConfig(): Promise<CsEconomyAdminConfig> {
  const snap = await getDoc(REF);
  if (!snap.exists()) {
    return { ...DEFAULT_CS_ECONOMY_ADMIN, themeBundles: { ...DEFAULT_CS_ECONOMY_ADMIN.themeBundles } };
  }
  return coerceCsEconomyAdmin(snap.data() as Record<string, unknown>);
}

export async function updateCsEconomyAdminConfig(config: CsEconomyAdminConfig, updatedBy: string): Promise<void> {
  const cleaned = coerceCsEconomyAdmin(config as unknown as Record<string, unknown>);
  await setDoc(
    REF,
    {
      ...cleaned,
      updatedAt: serverTimestamp(),
      updatedBy,
    },
    { merge: true },
  );
}

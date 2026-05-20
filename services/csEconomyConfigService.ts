/**
 * Bonos y precios en CS publicados en `system_config/cs_economy` (Superadmin).
 * Sin valores inventados en código: si falta el documento o un campo, se coerciona a 0.
 */
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/services/firebaseConfig';

export type ThemeBundlePricingRow = {
  priceUsd: number;
  creditsCs: number;
};

export type CsEconomyConfig = {
  welcomeBonusUsd: number;
  welcomeBonusCs: number;
  businessCardCashbackUsd: number;
  businessCardCashbackCs: number;
  studioIconUsd: number;
  studioIconCreditCs: number;
  /** p.ej. `texas_longhorns` → par USD / CS */
  themeBundles: Record<string, ThemeBundlePricingRow>;
};

const REF = doc(db, 'system_config', 'cs_economy');

const EMPTY: CsEconomyConfig = {
  welcomeBonusUsd: 0,
  welcomeBonusCs: 0,
  businessCardCashbackUsd: 0,
  businessCardCashbackCs: 0,
  studioIconUsd: 0,
  studioIconCreditCs: 0,
  themeBundles: {},
};

function coerceThemeBundles(raw: unknown): Record<string, ThemeBundlePricingRow> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, ThemeBundlePricingRow> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const id = String(k).trim();
    if (!id || !v || typeof v !== 'object') continue;
    const o = v as Record<string, unknown>;
    const priceUsd = Math.max(0, Number(o.priceUsd) || 0);
    const creditsCs = Math.max(0, Math.floor(Number(o.creditsCs) || 0));
    out[id] = { priceUsd, creditsCs };
  }
  return out;
}

export function coerceCsEconomy(raw: Record<string, unknown> | undefined): CsEconomyConfig {
  if (!raw || typeof raw !== 'object') return { ...EMPTY, themeBundles: {} };
  const themeRaw = raw.themeBundles;
  return {
    welcomeBonusUsd: Math.max(0, Number(raw.welcomeBonusUsd) || 0),
    welcomeBonusCs: Math.max(0, Math.floor(Number(raw.welcomeBonusCs) || 0)),
    businessCardCashbackUsd: Math.max(0, Number(raw.businessCardCashbackUsd) || 0),
    businessCardCashbackCs: Math.max(0, Math.floor(Number(raw.businessCardCashbackCs) || 0)),
    studioIconUsd: Math.max(0, Number(raw.studioIconUsd) || 0),
    studioIconCreditCs: Math.max(0, Math.floor(Number(raw.studioIconCreditCs) || 0)),
    themeBundles: coerceThemeBundles(themeRaw),
  };
}

export async function getCsEconomyConfig(): Promise<CsEconomyConfig> {
  try {
    const snap = await getDoc(REF);
    if (!snap.exists()) {
      return { ...EMPTY, themeBundles: {} };
    }
    return coerceCsEconomy(snap.data() as Record<string, unknown>);
  } catch {
    return { ...EMPTY, themeBundles: {} };
  }
}

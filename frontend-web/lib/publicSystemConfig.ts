'use client';

/**
 * Lecturas públicas de `system_config/*` en el browser (misma app Firebase que la app móvil).
 */
import { doc, getDoc } from 'firebase/firestore';
import { getStudioDb } from '@/lib/studioFirebase';
import { mergeTiersConfigFromFirestore, type TiersConfig } from '@/lib/studioTierPolicy';

export type PublicCommercePack = {
  id: string;
  productId: string;
  priceUsd: number;
  equivalentCs: number;
  popular?: boolean;
};

export type PublicCommerceConfig = { creditPacks: PublicCommercePack[] };

export type PublicMarketRadarConfig = { proPriceUsd: number; proEquivalentCs: number };

export type PublicThemeBundleRow = { priceUsd: number; creditsCs: number };

export type PublicCsEconomyConfig = {
  welcomeBonusUsd: number;
  welcomeBonusCs: number;
  businessCardCashbackUsd: number;
  businessCardCashbackCs: number;
  studioIconUsd: number;
  studioIconCreditCs: number;
  themeBundles: Record<string, PublicThemeBundleRow>;
};

function db() {
  return getStudioDb();
}

export async function fetchPublicTiersConfig(): Promise<TiersConfig | null> {
  try {
    const snap = await getDoc(doc(db(), 'system_config', 'tiers'));
    if (!snap.exists()) return null;
    return mergeTiersConfigFromFirestore(snap.data());
  } catch {
    return null;
  }
}

function coercePack(raw: unknown, index: number): PublicCommercePack | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = String(o.id ?? `pack_${index}`).trim() || `pack_${index}`;
  const productId = String(o.productId ?? '').trim();
  const priceUsd = Number(o.priceUsd);
  const equivalentCs = Math.max(0, Math.floor(Number(o.equivalentCs) || 0));
  if (!productId || !Number.isFinite(priceUsd) || priceUsd <= 0) return null;
  return {
    id,
    productId,
    priceUsd: Math.max(0, priceUsd),
    equivalentCs,
    popular: Boolean(o.popular),
  };
}

export async function fetchPublicCommerceConfig(): Promise<PublicCommerceConfig> {
  try {
    const snap = await getDoc(doc(db(), 'system_config', 'commerce'));
    if (!snap.exists()) return { creditPacks: [] };
    const d = snap.data() as Record<string, unknown>;
    const raw = d.creditPacks;
    if (!Array.isArray(raw)) return { creditPacks: [] };
    return { creditPacks: raw.map((row, i) => coercePack(row, i)).filter((p): p is PublicCommercePack => p != null) };
  } catch {
    return { creditPacks: [] };
  }
}

export async function fetchPublicMarketRadarConfig(): Promise<PublicMarketRadarConfig> {
  try {
    const snap = await getDoc(doc(db(), 'system_config', 'market_radar'));
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

function coerceThemeBundles(raw: unknown): Record<string, PublicThemeBundleRow> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, PublicThemeBundleRow> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const id = String(k).trim();
    if (!id || !v || typeof v !== 'object') continue;
    const o = v as Record<string, unknown>;
    out[id] = {
      priceUsd: Math.max(0, Number(o.priceUsd) || 0),
      creditsCs: Math.max(0, Math.floor(Number(o.creditsCs) || 0)),
    };
  }
  return out;
}

export async function fetchPublicCsEconomyConfig(): Promise<PublicCsEconomyConfig> {
  try {
    const snap = await getDoc(doc(db(), 'system_config', 'cs_economy'));
    if (!snap.exists()) {
      return {
        welcomeBonusUsd: 0,
        welcomeBonusCs: 0,
        businessCardCashbackUsd: 0,
        businessCardCashbackCs: 0,
        studioIconUsd: 0,
        studioIconCreditCs: 0,
        themeBundles: {},
      };
    }
    const d = snap.data() as Record<string, unknown>;
    return {
      welcomeBonusUsd: Math.max(0, Number(d.welcomeBonusUsd) || 0),
      welcomeBonusCs: Math.max(0, Math.floor(Number(d.welcomeBonusCs) || 0)),
      businessCardCashbackUsd: Math.max(0, Number(d.businessCardCashbackUsd) || 0),
      businessCardCashbackCs: Math.max(0, Math.floor(Number(d.businessCardCashbackCs) || 0)),
      studioIconUsd: Math.max(0, Number(d.studioIconUsd) || 0),
      studioIconCreditCs: Math.max(0, Math.floor(Number(d.studioIconCreditCs) || 0)),
      themeBundles: coerceThemeBundles(d.themeBundles),
    };
  } catch {
    return {
      welcomeBonusUsd: 0,
      welcomeBonusCs: 0,
      businessCardCashbackUsd: 0,
      businessCardCashbackCs: 0,
      studioIconUsd: 0,
      studioIconCreditCs: 0,
      themeBundles: {},
    };
  }
}

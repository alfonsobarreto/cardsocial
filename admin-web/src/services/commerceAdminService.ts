import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';

export type CommerceCreditPackRow = {
  id: string;
  productId: string;
  priceUsd: number;
  equivalentCs: number;
  popular?: boolean;
};

export type CommerceVoipMinutePackRow = {
  id: string;
  productId: string;
  priceUsd: number;
  minutes: number;
  popular?: boolean;
};

export type CommerceIconDataSlotPackRow = {
  id: string;
  productId: string;
  priceUsd: number;
  slots: number;
  popular?: boolean;
};

export type CommerceAdminConfig = {
  creditPacks: CommerceCreditPackRow[];
  voipMinutePacks: CommerceVoipMinutePackRow[];
  iconDataSlotPacks: CommerceIconDataSlotPackRow[];
};

const REF = doc(db, 'system_config', 'commerce');

const EMPTY_CONFIG: CommerceAdminConfig = {
  creditPacks: [],
  voipMinutePacks: [],
  iconDataSlotPacks: [],
};

function coerceCreditPack(raw: unknown, index: number): CommerceCreditPackRow | null {
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

function coerceVoipMinutePack(raw: unknown, index: number): CommerceVoipMinutePackRow | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = String(o.id ?? `voip_${index}`).trim() || `voip_${index}`;
  const productId = String(o.productId ?? '').trim();
  const priceUsd = Number(o.priceUsd);
  const minutes = Math.max(1, Math.floor(Number(o.minutes) || 0));
  if (!productId || !Number.isFinite(priceUsd) || priceUsd <= 0) return null;
  return {
    id,
    productId,
    priceUsd: Math.max(0, priceUsd),
    minutes,
    popular: Boolean(o.popular),
  };
}

function coerceIconDataSlotPack(raw: unknown, index: number): CommerceIconDataSlotPackRow | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = String(o.id ?? `icon_${index}`).trim() || `icon_${index}`;
  const productId = String(o.productId ?? '').trim();
  const priceUsd = Number(o.priceUsd);
  const slots = Math.max(1, Math.floor(Number(o.slots) || 0));
  if (!productId || !Number.isFinite(priceUsd) || priceUsd <= 0) return null;
  return {
    id,
    productId,
    priceUsd: Math.max(0, priceUsd),
    slots,
    popular: Boolean(o.popular),
  };
}

function configFromDoc(d: Record<string, unknown>): CommerceAdminConfig {
  const creditRaw = d.creditPacks;
  const voipRaw = d.voipMinutePacks;
  const iconRaw = d.iconDataSlotPacks;
  return {
    creditPacks: Array.isArray(creditRaw)
      ? creditRaw.map((row, i) => coerceCreditPack(row, i)).filter((p): p is CommerceCreditPackRow => p != null)
      : [],
    voipMinutePacks: Array.isArray(voipRaw)
      ? voipRaw.map((row, i) => coerceVoipMinutePack(row, i)).filter((p): p is CommerceVoipMinutePackRow => p != null)
      : [],
    iconDataSlotPacks: Array.isArray(iconRaw)
      ? iconRaw.map((row, i) => coerceIconDataSlotPack(row, i)).filter((p): p is CommerceIconDataSlotPackRow => p != null)
      : [],
  };
}

export async function getCommerceAdminConfig(): Promise<CommerceAdminConfig> {
  const snap = await getDoc(REF);
  if (!snap.exists()) {
    return { ...EMPTY_CONFIG };
  }
  return configFromDoc(snap.data() as Record<string, unknown>);
}

export async function updateCommerceAdminConfig(config: CommerceAdminConfig, updatedBy: string): Promise<void> {
  const creditPacks = config.creditPacks
    .map((p, i) => coerceCreditPack(p, i))
    .filter((p): p is CommerceCreditPackRow => p != null);
  const voipMinutePacks = config.voipMinutePacks
    .map((p, i) => coerceVoipMinutePack(p, i))
    .filter((p): p is CommerceVoipMinutePackRow => p != null);
  const iconDataSlotPacks = config.iconDataSlotPacks
    .map((p, i) => coerceIconDataSlotPack(p, i))
    .filter((p): p is CommerceIconDataSlotPackRow => p != null);

  await setDoc(
    REF,
    {
      creditPacks,
      voipMinutePacks,
      iconDataSlotPacks,
      updatedAt: serverTimestamp(),
      updatedBy,
    },
    { merge: true },
  );
}

/**
 * Catálogo comercial publicado en Firestore `system_config/commerce`.
 * Sin precios por defecto en código: todo proviene del CMS o estado explícito (vacío / error).
 */
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/services/firebaseConfig';

export type CommerceCreditPack = {
  id: string;
  productId: string;
  priceUsd: number;
  /** Publicado en CMS junto al USD (sin conversión en código). */
  equivalentCs: number;
  popular?: boolean;
};

export type CommerceVoipMinutePack = {
  id: string;
  productId: string;
  priceUsd: number;
  minutes: number;
  popular?: boolean;
};

export type CommerceIconDataSlotPack = {
  id: string;
  productId: string;
  priceUsd: number;
  slots: number;
  popular?: boolean;
};

export type CommerceConfigLoaded = {
  creditPacks: CommerceCreditPack[];
  voipMinutePacks: CommerceVoipMinutePack[];
  iconDataSlotPacks: CommerceIconDataSlotPack[];
};

export type CommerceConfigResult =
  | { ok: true; source: 'firestore'; data: CommerceConfigLoaded }
  | { ok: false; reason: 'no_document' | 'read_error' };

const COMMERCE_REF = doc(db, 'system_config', 'commerce');

function coerceCreditPack(raw: unknown, index: number): CommerceCreditPack | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = String(o.id ?? `pack_${index}`).trim() || `pack_${index}`;
  const productId = String(o.productId ?? '').trim();
  const priceUsd = Number(o.priceUsd);
  const eqRaw = o.equivalentCs;
  const equivalentCs =
    eqRaw !== undefined && eqRaw !== null && String(eqRaw).trim() !== ''
      ? Math.max(0, Math.floor(Number(eqRaw) || 0))
      : 0;
  if (!productId || !Number.isFinite(priceUsd) || priceUsd <= 0) return null;
  return {
    id,
    productId,
    priceUsd: Math.max(0, priceUsd),
    equivalentCs,
    popular: Boolean(o.popular),
  };
}

function coerceVoipMinutePack(raw: unknown, index: number): CommerceVoipMinutePack | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = String(o.id ?? `voip_${index}`).trim() || `voip_${index}`;
  const productId = String(o.productId ?? '').trim();
  const priceUsd = Number(o.priceUsd);
  const minutes = Math.max(1, Math.floor(Number(o.minutes) || 0));
  if (!productId || !Number.isFinite(priceUsd) || priceUsd <= 0) return null;
  return { id, productId, priceUsd: Math.max(0, priceUsd), minutes, popular: Boolean(o.popular) };
}

function coerceIconDataSlotPack(raw: unknown, index: number): CommerceIconDataSlotPack | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = String(o.id ?? `icon_${index}`).trim() || `icon_${index}`;
  const productId = String(o.productId ?? '').trim();
  const priceUsd = Number(o.priceUsd);
  const slots = Math.max(1, Math.floor(Number(o.slots) || 0));
  if (!productId || !Number.isFinite(priceUsd) || priceUsd <= 0) return null;
  return { id, productId, priceUsd: Math.max(0, priceUsd), slots, popular: Boolean(o.popular) };
}

function configFromSnapshot(data: Record<string, unknown>): CommerceConfigLoaded {
  const creditRaw = data?.creditPacks;
  const voipRaw = data?.voipMinutePacks;
  const iconRaw = data?.iconDataSlotPacks;
  return {
    creditPacks: Array.isArray(creditRaw)
      ? creditRaw.map((row, i) => coerceCreditPack(row, i)).filter((p): p is CommerceCreditPack => p != null)
      : [],
    voipMinutePacks: Array.isArray(voipRaw)
      ? voipRaw.map((row, i) => coerceVoipMinutePack(row, i)).filter((p): p is CommerceVoipMinutePack => p != null)
      : [],
    iconDataSlotPacks: Array.isArray(iconRaw)
      ? iconRaw.map((row, i) => coerceIconDataSlotPack(row, i)).filter((p): p is CommerceIconDataSlotPack => p != null)
      : [],
  };
}

export async function getCommerceConfig(): Promise<CommerceConfigResult> {
  try {
    const snap = await getDoc(COMMERCE_REF);
    if (!snap.exists()) {
      return { ok: false, reason: 'no_document' };
    }
    return {
      ok: true,
      source: 'firestore',
      data: configFromSnapshot(snap.data() as Record<string, unknown>),
    };
  } catch {
    return { ok: false, reason: 'read_error' };
  }
}

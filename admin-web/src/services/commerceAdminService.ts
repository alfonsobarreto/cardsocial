import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';

export type CommerceCreditPackRow = {
  id: string;
  productId: string;
  priceUsd: number;
  equivalentCs: number;
  popular?: boolean;
};

export type CommerceAdminConfig = {
  creditPacks: CommerceCreditPackRow[];
};

const REF = doc(db, 'system_config', 'commerce');

function coercePack(raw: unknown, index: number): CommerceCreditPackRow | null {
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

export async function getCommerceAdminConfig(): Promise<CommerceAdminConfig> {
  const snap = await getDoc(REF);
  if (!snap.exists()) {
    return { creditPacks: [] };
  }
  const d = snap.data() as Record<string, unknown>;
  const raw = d.creditPacks;
  if (!Array.isArray(raw)) {
    return { creditPacks: [] };
  }
  const creditPacks = raw.map((row, i) => coercePack(row, i)).filter((p): p is CommerceCreditPackRow => p != null);
  return { creditPacks };
}

export async function updateCommerceAdminConfig(config: CommerceAdminConfig, updatedBy: string): Promise<void> {
  const creditPacks = config.creditPacks
    .map((p, i) => coercePack(p, i))
    .filter((p): p is CommerceCreditPackRow => p != null);
  await setDoc(
    REF,
    {
      creditPacks,
      updatedAt: serverTimestamp(),
      updatedBy,
    },
    { merge: true },
  );
}

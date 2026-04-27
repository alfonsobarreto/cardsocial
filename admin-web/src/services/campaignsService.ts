import {
  addDoc,
  collection,
  doc,
  getDocs,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../config/firebase';

export type VipCampaignType = 'Influencer' | 'Business';

export type VipGrantedTier = 'influencer' | 'business';

export type VipCampaign = {
  id: string;
  name: string;
  type: VipCampaignType;
  grantedTier: VipGrantedTier;
  maxUses: number;
  currentUses: number;
  active: boolean;
  refCode: string;
  createdAt?: Date | { toDate?: () => Date; seconds?: number } | null;
};

type VipCampaignDoc = Omit<VipCampaign, 'id'>;

const COLLECTION = collection(db, 'vip_campaigns');

function randomRefCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  const cryptoObj = globalThis.crypto;
  if (cryptoObj?.getRandomValues) {
    const bytes = new Uint8Array(8);
    cryptoObj.getRandomValues(bytes);
    for (let i = 0; i < 8; i += 1) {
      out += chars[bytes[i] % chars.length];
    }
  } else {
    for (let i = 0; i < 8; i += 1) {
      out += chars[Math.floor(Math.random() * chars.length)];
    }
  }
  return `VIP-${out}`;
}

function toMillis(value: VipCampaign['createdAt']) {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  return 0;
}

function normalizeCampaign(id: string, data: Partial<VipCampaignDoc>): VipCampaign {
  return {
    id,
    name: String(data.name ?? ''),
    type: (data.type === 'Business' ? 'Business' : 'Influencer') as VipCampaignType,
    grantedTier: (data.grantedTier === 'business' ? 'business' : 'influencer') as VipGrantedTier,
    maxUses: Math.max(0, Number(data.maxUses) || 0),
    currentUses: Math.max(0, Number(data.currentUses) || 0),
    active: data.active !== false,
    refCode: String(data.refCode ?? ''),
    createdAt: data.createdAt,
  };
}

export async function getCampaigns(): Promise<VipCampaign[]> {
  const snapshot = await getDocs(COLLECTION);

  return snapshot.docs
    .map((item) => normalizeCampaign(item.id, item.data() as Partial<VipCampaignDoc>))
    .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
}

export type CreateCampaignInput = {
  name: string;
  type: VipCampaignType;
  grantedTier: VipGrantedTier;
  maxUses: number;
};

export async function createCampaign(input: CreateCampaignInput): Promise<string> {
  const refCode = randomRefCode();

  const docRef = await addDoc(COLLECTION, {
    name: input.name.trim(),
    type: input.type,
    grantedTier: input.grantedTier,
    maxUses: Math.max(1, input.maxUses),
    currentUses: 0,
    active: true,
    refCode,
    createdAt: serverTimestamp(),
  });

  return docRef.id;
}

export async function toggleCampaignStatus(campaignId: string, active: boolean): Promise<void> {
  await updateDoc(doc(db, 'vip_campaigns', campaignId), {
    active,
  });
}

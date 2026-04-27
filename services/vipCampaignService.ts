import { db } from '@/services/firebaseConfig';
import {
  arrayUnion,
  collection,
  doc,
  getDocs,
  increment,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from 'firebase/firestore';

export type VipGrantedTier = 'influencer' | 'business';

export type VipCampaignRedeemResult = {
  grantedTier: VipGrantedTier;
  durationDays: number;
  premiumUntil: string;
};

type VipCampaignDoc = {
  name?: string;
  refCode?: string;
  grantedTier?: VipGrantedTier;
  durationDays?: number;
  maxUses?: number;
  currentUses?: number;
  active?: boolean;
  redeemedUsers?: string[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

function normalizeTier(value: unknown): VipGrantedTier {
  return value === 'business' ? 'business' : 'influencer';
}

export async function redeemVipCampaign(
  campaignCode: string,
  userId: string,
): Promise<VipCampaignRedeemResult> {
  const refCode = String(campaignCode || '').trim();
  if (!refCode) {
    throw new Error('Código de campaña inválido');
  }

  const campaignsQuery = query(collection(db, 'vip_campaigns'), where('refCode', '==', refCode));
  const campaignSnapshot = await getDocs(campaignsQuery);

  if (campaignSnapshot.empty) {
    throw new Error('Campaña VIP inválida');
  }

  const campaignRef = campaignSnapshot.docs[0].ref;
  const userRef = doc(db, 'users', userId);
  const redemptionRef = doc(collection(db, 'redemption_logs'));

  return runTransaction(db, async (transaction) => {
    const campaignDoc = await transaction.get(campaignRef);
    const userDoc = await transaction.get(userRef);

    if (!campaignDoc.exists()) {
      throw new Error('Campaña VIP inválida');
    }

    if (!userDoc.exists()) {
      throw new Error('Usuario no encontrado');
    }

    const campaign = campaignDoc.data() as VipCampaignDoc;
    const active = campaign.active !== false;
    const currentUses = Math.max(0, Number(campaign.currentUses || 0));
    const maxUses = Math.max(1, Number(campaign.maxUses || 0));
    const redeemedUsers = Array.isArray(campaign.redeemedUsers) ? campaign.redeemedUsers : [];

    if (!active) {
      throw new Error('Esta campaña VIP ya no está activa');
    }

    if (currentUses >= maxUses) {
      throw new Error('Esta campaña VIP alcanzó su límite de usos');
    }

    if (redeemedUsers.includes(userId)) {
      throw new Error('Ya has canjeado esta campaña VIP');
    }

    const grantedTier = normalizeTier(campaign.grantedTier);
    const durationDays = Math.max(1, Number(campaign.durationDays || 365));
    const premiumUntil = new Date(Date.now() + durationDays * DAY_MS).toISOString();

    transaction.update(userRef, {
      tier: grantedTier,
      currentTier: grantedTier,
      isPremium: true,
      subscriptionStatus: 'active',
      premiumUntil,
      subscriptionExpiresAt: premiumUntil,
      vipCampaignCode: refCode,
      vipCampaignRedeemedAt: serverTimestamp(),
    });

    transaction.update(campaignRef, {
      currentUses: increment(1),
      redeemedUsers: arrayUnion(userId),
      updatedAt: serverTimestamp(),
    });

    transaction.set(redemptionRef, {
      campaignId: campaignDoc.id,
      campaignCode: refCode,
      campaignName: campaign.name || '',
      redeemedBy: userId,
      redeemedAt: serverTimestamp(),
      grantedTier,
      durationDays,
      premiumUntil,
      redemptionType: 'vip_campaign',
    });

    return {
      grantedTier,
      durationDays,
      premiumUntil,
    };
  });
}

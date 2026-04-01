import { db } from '@/services/firebaseConfig';
import {
  deriveBusinessCardLifecycleSnapshot,
  transitionBusinessCardToDull,
} from '@/services/businessCardLifecycleService';
import type { BusinessCard, BusinessCardLifecycleState } from '@/types/businessCard';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

export interface BusinessCardSubscriptionSummary {
  cardId: string;
  businessName: string;
  lifecycleState: BusinessCardLifecycleState;
  autopayEnabled: boolean;
  paymentsQuarantined: boolean;
  trialEndsAt: string | null;
  annualContractEndsAt: string | null;
  dullStartedAt: string | null;
  purgeAt: string | null;
  lastUpdated: string | null;
  hasActiveAccess: boolean;
  canCancelNow: boolean;
}

function toIso(value: unknown): string | null {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'string') {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
  }
  if (typeof value === 'object' && value && typeof (value as any).toDate === 'function') {
    const dateValue = (value as any).toDate();
    return dateValue instanceof Date ? dateValue.toISOString() : null;
  }
  return null;
}

export async function listOwnedBusinessCardSubscriptions(userId: string): Promise<BusinessCardSubscriptionSummary[]> {
  const cardsSnap = await getDocs(
    query(
      collection(db, 'businessCards'),
      where('ownerUid', '==', userId),
      where('type', '==', 'business'),
    ),
  );

  const rows = cardsSnap.docs.map((row) => {
    const card = row.data() as Partial<BusinessCard>;
    const snapshot = deriveBusinessCardLifecycleSnapshot(card);
    const lifecycleState = snapshot.state;

    return {
      cardId: row.id,
      businessName: String(card.businessName || 'Business Card'),
      lifecycleState,
      autopayEnabled: Boolean((card as any).autopayEnabled ?? true),
      paymentsQuarantined: Boolean((card as any).paymentsQuarantined ?? true),
      trialEndsAt: toIso((card as any).trialEndsAt),
      annualContractEndsAt: toIso((card as any).annualContractEndsAt) ?? toIso((card as any).subscriptionExpires),
      dullStartedAt: toIso((card as any).dullStartedAt),
      purgeAt: snapshot.purgeAt,
      lastUpdated: toIso((card as any).lastUpdated) ?? toIso((card as any).createdAt),
      hasActiveAccess: snapshot.hasActiveAccess,
      canCancelNow: lifecycleState === 'trial_active' || lifecycleState === 'active_paid',
    } satisfies BusinessCardSubscriptionSummary;
  });

  return rows.sort((a, b) => {
    const aTs = Date.parse(a.lastUpdated || '');
    const bTs = Date.parse(b.lastUpdated || '');
    const safeA = Number.isFinite(aTs) ? aTs : 0;
    const safeB = Number.isFinite(bTs) ? bTs : 0;
    return safeB - safeA;
  });
}

export async function setBusinessCardAutopay(params: {
  userId: string;
  cardId: string;
  enabled: boolean;
}): Promise<{ success: boolean; message: string }> {
  const cardRef = doc(db, 'businessCards', params.cardId);
  const cardSnap = await getDoc(cardRef);
  if (!cardSnap.exists()) {
    return { success: false, message: 'Business card not found.' };
  }

  const card = cardSnap.data() as Partial<BusinessCard>;
  if (String(card.ownerUid || '') !== params.userId) {
    return { success: false, message: 'Not authorized for this business card.' };
  }

  const snapshot = deriveBusinessCardLifecycleSnapshot(card);
  if (!snapshot.hasActiveAccess) {
    return { success: false, message: 'Autopay can only be changed for active contracts.' };
  }

  const nowIso = new Date().toISOString();
  await updateDoc(cardRef, {
    autopayEnabled: params.enabled,
    lastUpdated: nowIso,
  });

  const licenseDocId = `${params.userId}_${params.cardId}`;
  await Promise.all([
    setDoc(
      doc(db, 'users', params.userId, 'business_card_licenses', params.cardId),
      {
        cardId: params.cardId,
        userId: params.userId,
        autopayEnabled: params.enabled,
        updatedAt: nowIso,
        updatedAtServer: serverTimestamp(),
      },
      { merge: true },
    ),
    setDoc(
      doc(db, 'business_card_licenses', licenseDocId),
      {
        cardId: params.cardId,
        userId: params.userId,
        autopayEnabled: params.enabled,
        updatedAt: nowIso,
        updatedAtServer: serverTimestamp(),
      },
      { merge: true },
    ),
  ]);

  return { success: true, message: 'Autopay updated.' };
}

export async function cancelBusinessCardSubscriptionNow(params: {
  userId: string;
  cardId: string;
}): Promise<{ success: boolean; message: string }> {
  const cardRef = doc(db, 'businessCards', params.cardId);
  const cardSnap = await getDoc(cardRef);
  if (!cardSnap.exists()) {
    return { success: false, message: 'Business card not found.' };
  }

  const card = cardSnap.data() as Partial<BusinessCard>;
  if (String(card.ownerUid || '') !== params.userId) {
    return { success: false, message: 'Not authorized for this business card.' };
  }

  const snapshot = deriveBusinessCardLifecycleSnapshot(card);
  if (!snapshot.hasActiveAccess) {
    return { success: false, message: 'This business card does not have an active contract to cancel.' };
  }

  await transitionBusinessCardToDull({
    cardId: params.cardId,
    ownerUid: params.userId,
    reason: snapshot.state === 'trial_active' ? 'trial_cancelled' : 'renewal_failed',
  });

  const nowIso = new Date().toISOString();
  const licenseDocId = `${params.userId}_${params.cardId}`;
  await Promise.all([
    updateDoc(doc(db, 'businessCards', params.cardId), {
      autopayEnabled: false,
      cancelledAt: nowIso,
      cancellationReason: 'manual_immediate',
      lastUpdated: nowIso,
    }),
    setDoc(
      doc(db, 'users', params.userId, 'business_card_licenses', params.cardId),
      {
        cardId: params.cardId,
        userId: params.userId,
        isActive: false,
        autopayEnabled: false,
        cancelledAt: nowIso,
        updatedAt: nowIso,
        updatedAtServer: serverTimestamp(),
      },
      { merge: true },
    ),
    setDoc(
      doc(db, 'business_card_licenses', licenseDocId),
      {
        cardId: params.cardId,
        userId: params.userId,
        isActive: false,
        autopayEnabled: false,
        cancelledAt: nowIso,
        updatedAt: nowIso,
        updatedAtServer: serverTimestamp(),
      },
      { merge: true },
    ),
  ]);

  return { success: true, message: 'Subscription cancelled and card moved to dull mode.' };
}

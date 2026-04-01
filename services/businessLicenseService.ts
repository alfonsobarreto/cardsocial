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
import { db } from '@/services/firebaseConfig';
import type { BusinessCard } from '@/types/businessCard';
import {
  buildLifecycleV1PatchFromLegacyCard,
  deriveBusinessCardLifecycleSnapshot,
} from '@/services/businessCardLifecycleService';

export interface BusinessCardLicense {
  userId: string;
  cardId: string;
  annualPriceUsd: number;
  startedAt: string;
  expiresAt: string;
  isActive: boolean;
  purchaseId?: string;
  platform?: 'ios' | 'android';
  cashbackCreditsGranted: number;
  updatedAt: string;
}

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

async function getLegacyLicenseRow(userId: string, cardId: string): Promise<Partial<BusinessCardLicense> | null> {
  // Primary path: deterministic doc id = cardId.
  const byIdSnap = await getDoc(doc(db, 'users', userId, 'business_card_licenses', cardId));
  if (byIdSnap.exists()) {
    return byIdSnap.data() as Partial<BusinessCardLicense>;
  }

  // Backward-compat fallback.
  const legacyQuery = await getDocs(
    query(
      collection(db, 'users', userId, 'business_card_licenses'),
      where('cardId', '==', cardId),
    ),
  );
  if (!legacyQuery.empty) {
    return legacyQuery.docs[0].data() as Partial<BusinessCardLicense>;
  }
  return null;
}

async function ensureBusinessCardLifecycleV1(userId: string, cardId: string): Promise<Partial<BusinessCard> | null> {
  const cardRef = doc(db, 'businessCards', cardId);
  const cardSnap = await getDoc(cardRef);
  if (!cardSnap.exists()) {
    return null;
  }

  const card = cardSnap.data() as Partial<BusinessCard>;
  if (card.type !== 'business') {
    return card;
  }

  // Already in v1 lifecycle contract.
  if (String((card as any).lifecycleVersion || '') === 'v1' && (card as any).lifecycleState) {
    return card;
  }

  const legacyLicense = await getLegacyLicenseRow(userId, cardId);
  const patch = buildLifecycleV1PatchFromLegacyCard(card, legacyLicense);
  await updateDoc(cardRef, patch);
  return {
    ...card,
    ...patch,
  };
}

async function syncBusinessCardFromLicense(
  cardId: string,
  license: BusinessCardLicense,
): Promise<void> {
  const cardRef = doc(db, 'businessCards', cardId);
  const cardSnap = await getDoc(cardRef);
  if (!cardSnap.exists()) {
    return;
  }

  const card = cardSnap.data() as Partial<BusinessCard>;
  if (card.type !== 'business') {
    return;
  }

  const nowIso = new Date().toISOString();
  const migratedBase = buildLifecycleV1PatchFromLegacyCard(
    {
      ...card,
      lifecycleVersion: 'v1',
      lifecycleState: 'active_paid',
      annualContractStartedAt: license.startedAt,
      annualContractEndsAt: license.expiresAt,
      subscriptionExpires: license.expiresAt,
      dullStartedAt: null,
      purgeAt: null,
      trialConsumedOwner: true,
      autopayEnabled: (card as any).autopayEnabled ?? true,
    },
    license,
  );

  await updateDoc(cardRef, {
    ...migratedBase,
    lifecycleVersion: 'v1',
    lifecycleState: 'active_paid',
    annualContractStartedAt: license.startedAt,
    annualContractEndsAt: license.expiresAt,
    subscriptionExpires: license.expiresAt,
    dullStartedAt: null,
    purgeAt: null,
    isActive: true,
    lastUpdated: nowIso,
  });
}

export async function activateOrRenewBusinessLicense(params: {
  userId: string;
  cardId: string;
  purchaseId?: string;
  platform?: 'ios' | 'android';
  annualPriceUsd: number;
  cashbackCreditsGranted: number;
}): Promise<BusinessCardLicense> {
  const now = new Date();
  const nowIso = now.toISOString();
  const userLicenseRef = doc(db, 'users', params.userId, 'business_card_licenses', params.cardId);

  let currentExpiresAt = now.getTime();
  const existing = await getDocs(
    query(
      collection(db, 'users', params.userId, 'business_card_licenses'),
      where('cardId', '==', params.cardId),
    ),
  );
  if (!existing.empty) {
    const current = existing.docs[0].data() as Partial<BusinessCardLicense>;
    const expTs = Date.parse(String(current.expiresAt || ''));
    if (Number.isFinite(expTs) && expTs > now.getTime()) {
      currentExpiresAt = expTs;
    }
  }

  const nextExpires = new Date(currentExpiresAt + ONE_YEAR_MS).toISOString();
  const license: BusinessCardLicense = {
    userId: params.userId,
    cardId: params.cardId,
    annualPriceUsd: params.annualPriceUsd,
    startedAt: nowIso,
    expiresAt: nextExpires,
    isActive: true,
    purchaseId: params.purchaseId,
    platform: params.platform,
    cashbackCreditsGranted: params.cashbackCreditsGranted,
    updatedAt: nowIso,
  };

  await setDoc(
    userLicenseRef,
    {
      ...license,
      updatedAtServer: serverTimestamp(),
    },
    { merge: true },
  );

  await setDoc(
    doc(db, 'business_card_licenses', `${params.userId}_${params.cardId}`),
    {
      ...license,
      updatedAtServer: serverTimestamp(),
    },
    { merge: true },
  );

  await syncBusinessCardFromLicense(params.cardId, license);
  return license;
}

export async function hasActiveBusinessLicense(userId: string, cardId: string): Promise<boolean> {
  try {
    const hydratedCard = await ensureBusinessCardLifecycleV1(userId, cardId);
    if (hydratedCard && hydratedCard.type === 'business') {
      const snapshot = deriveBusinessCardLifecycleSnapshot(hydratedCard);
      return snapshot.hasActiveAccess;
    }

    // Fallback for non-migrated edge rows.
    const row = await getLegacyLicenseRow(userId, cardId);
    if (!row || !row.isActive) {
      return false;
    }
    const expiresTs = Date.parse(String(row.expiresAt || ''));
    return Number.isFinite(expiresTs) && expiresTs > Date.now();
  } catch {
    return false;
  }
}
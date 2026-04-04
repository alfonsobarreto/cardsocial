import { collection, doc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db } from '@/services/firebaseConfig';

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

  /** Firestore no acepta `undefined` en campos — omitir opcionales vacíos. */
  const licenseForFirestore = Object.fromEntries(
    Object.entries({
      ...license,
      updatedAtServer: serverTimestamp(),
    }).filter(([, v]) => v !== undefined),
  );

  await setDoc(userLicenseRef, licenseForFirestore, { merge: true });

  await setDoc(
    doc(db, 'business_card_licenses', `${params.userId}_${params.cardId}`),
    licenseForFirestore,
    { merge: true },
  );

  return license;
}

export async function hasActiveBusinessLicense(userId: string, cardId: string): Promise<boolean> {
  try {
    const snap = await getDocs(
      query(
        collection(db, 'users', userId, 'business_card_licenses'),
        where('cardId', '==', cardId),
      ),
    );
    if (snap.empty) {
      return false;
    }

    const row = snap.docs[0].data() as Partial<BusinessCardLicense>;
    if (!row.isActive) {
      return false;
    }
    const expiresTs = Date.parse(String(row.expiresAt || ''));
    return Number.isFinite(expiresTs) && expiresTs > Date.now();
  } catch {
    return false;
  }
}
import { collection, doc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db } from '@/services/firebaseConfig';

export interface BusinessCardLicense {
  uid: string;
  bId: string;
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
  uid: string;
  bId: string;
  purchaseId?: string;
  platform?: 'ios' | 'android';
  annualPriceUsd: number;
  cashbackCreditsGranted: number;
}): Promise<BusinessCardLicense> {
  const now = new Date();
  const nowIso = now.toISOString();
  const userLicenseRef = doc(db, 'users', params.uid, 'business_card_licenses', params.bId);

  let currentExpiresAt = now.getTime();
  const existing = await getDocs(
    query(
      collection(db, 'users', params.uid, 'business_card_licenses'),
      where('bId', '==', params.bId),
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
    uid: params.uid,
    bId: params.bId,
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
    doc(db, 'business_card_licenses', `${params.uid}_${params.bId}`),
    licenseForFirestore,
    { merge: true },
  );

  return license;
}

export async function hasActiveBusinessLicense(uid: string, bId: string): Promise<boolean> {
  try {
    const snap = await getDocs(
      query(
        collection(db, 'users', uid, 'business_card_licenses'),
        where('bId', '==', bId),
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
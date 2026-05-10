/**
 * Fuente de verdad de referidos: Firestore colección raíz `referrals`.
 * Convención: doc id = `referredUid` (usuario que se registró). Solo ese usuario puede crear el doc.
 */

import {
  doc,
  getCountFromServer,
  getDoc,
  query,
  collection,
  where,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';

import { db } from '@/services/firebaseConfig';

export const REFERRALS_COLLECTION = 'referrals';

export async function countSuccessfulReferralsForReferrer(referrerUid: string): Promise<number> {
  const ref = String(referrerUid || '').trim();
  if (!ref) return 0;
  const q = query(
    collection(db, REFERRALS_COLLECTION),
    where('referrerUid', '==', ref),
    where('status', '==', 'completed'),
  );
  const agg = await getCountFromServer(q);
  const n = Number(agg.data().count ?? 0);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/**
 * Registra atribución: el usuario recién creado (`referredUid`) confirma quién lo invitó.
 * Falla silenciosa si otro referrer ya reclamó este `referredUid`.
 */
export async function upsertSuccessfulReferralAttribution(params: {
  referredUid: string;
  referrerUid: string;
}): Promise<{ ok: boolean; reason?: string }> {
  const referredUid = String(params.referredUid || '').trim();
  const referrerUid = String(params.referrerUid || '').trim();
  if (!referredUid || !referrerUid || referredUid === referrerUid) {
    return { ok: false, reason: 'invalid_uids' };
  }
  const dref = doc(db, REFERRALS_COLLECTION, referredUid);
  const existing = await getDoc(dref);
  if (existing.exists()) {
    const prevReferrer = String(existing.data()?.referrerUid ?? '').trim();
    if (prevReferrer && prevReferrer !== referrerUid) {
      return { ok: false, reason: 'attribution_already_set' };
    }
    if (prevReferrer === referrerUid) {
      return { ok: true };
    }
  }

  await setDoc(
    dref,
    {
      referredUid,
      referrerUid,
      status: 'completed',
      updatedAt: serverTimestamp(),
      ...(!existing.exists
        ? {
            createdAt: serverTimestamp(),
          }
        : {}),
    },
    { merge: true },
  );
  return { ok: true };
}

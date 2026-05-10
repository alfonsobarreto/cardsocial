/**
 * Hook: cuenta referidos (`referrals` / Firestore), persiste `legacyTier` en `users/{uid}`
 * y dispara correos físicos PVC / Metal (dedupe en perfil).
 */

import {
  LEGACY_DIAMOND_RADAR_STUDIO_FALLBACK_ORIGIN,
  LEGACY_REFERRALS_CEILING_UI,
  checkLegacyTier,
  parseLegacyTier,
  type LegacyTierStored,
} from '@/services/legacyPathEngine';
import { REFERRALS_COLLECTION } from '@/services/referralsFirestoreService';
import { requestLegacyPhysicalBenefitEmail } from '@/services/requestLegacyPhysicalBenefitEmail';
import { auth, db } from '@/services/firebaseConfig';
import { useCallback, useEffect, useState } from 'react';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';

export type LegacyPathLiveState = {
  loading: boolean;
  referralsCount: number;
  legacyTier: LegacyTierStored;
  showPartnerBadge: boolean;
};

const emptyIdle: LegacyPathLiveState = {
  loading: false,
  referralsCount: 0,
  legacyTier: 'none',
  showPartnerBadge: false,
};

const emptyLoading: LegacyPathLiveState = {
  loading: true,
  referralsCount: 0,
  legacyTier: 'none',
  showPartnerBadge: false,
};

type LegacyEmailsSent = {
  pvcOrHigher?: boolean;
  metal?: boolean;
};

function tierGe(t: LegacyTierStored, gate: Exclude<LegacyTierStored, 'none'>): boolean {
  const order: LegacyTierStored[] = ['none', 'silver', 'gold', 'platinum', 'diamond'];
  return order.indexOf(t) >= order.indexOf(gate);
}

function shouldEmitPvcEmail(prevTier: LegacyTierStored, nextTier: LegacyTierStored): boolean {
  const atGold = tierGe(nextTier, 'gold');
  const wasBelowGold = !tierGe(prevTier, 'gold');
  return wasBelowGold && atGold;
}

function shouldEmitMetalEmail(prevTier: LegacyTierStored, nextTier: LegacyTierStored): boolean {
  const atPlat = tierGe(nextTier, 'platinum');
  const wasBelowPlat = !tierGe(prevTier, 'platinum');
  return wasBelowPlat && atPlat;
}

async function persistLegacy(uid: string, count: number, tier: LegacyTierStored): Promise<void> {
  await updateDoc(doc(db, 'users', uid), {
    referralSuccessfulCount: count,
    legacyTier: tier,
    legacyPathSyncedAt: serverTimestamp(),
  }).catch(() => undefined);
}

async function handleMilestoneEmails(
  uid: string,
  prevTier: LegacyTierStored,
  nextTier: LegacyTierStored,
): Promise<void> {
  const userSnap = await getDoc(doc(db, 'users', uid));
  const raw = userSnap.exists() ? (userSnap.data() as Record<string, unknown>)?.legacyPhysicalBenefitEmails : null;
  const sent =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as LegacyEmailsSent) : {};

  try {
    if (shouldEmitPvcEmail(prevTier, nextTier) && !sent.pvcOrHigher) {
      await requestLegacyPhysicalBenefitEmail({ milestone: 'pvc_or_higher' });
    }
    if (shouldEmitMetalEmail(prevTier, nextTier) && !sent.metal) {
      await requestLegacyPhysicalBenefitEmail({ milestone: 'metal_card' });
    }
  } catch {
    /* Correo mejor esfuerzo */
  }
}

export function useLegacyPathEngine(enabled: boolean): LegacyPathLiveState {
  const [state, setState] = useState<LegacyPathLiveState>(() => (enabled ? emptyLoading : emptyIdle));

  const applyCount = useCallback(async (uid: string, nextCount: number) => {
    const userSnap = await getDoc(doc(db, 'users', uid));
    const prevTier = parseLegacyTier(
      userSnap.exists() ? (userSnap.data() as Record<string, unknown>).legacyTier : undefined,
    );
    const nextTier = checkLegacyTier(nextCount);

    await persistLegacy(uid, nextCount, nextTier);
    await handleMilestoneEmails(uid, prevTier, nextTier);

    setState({
      loading: false,
      referralsCount: nextCount,
      legacyTier: nextTier,
      showPartnerBadge: nextTier !== 'none',
    });
  }, []);

  useEffect(() => {
    if (!enabled) {
      setState(emptyIdle);
      return;
    }

    const user = auth.currentUser;
    const uid = user?.uid ?? '';
    if (!uid) {
      setState(emptyIdle);
      return;
    }

    setState(emptyLoading);

    const qSnap = query(
      collection(db, REFERRALS_COLLECTION),
      where('referrerUid', '==', uid),
      where('status', '==', 'completed'),
    );

    const unsub = onSnapshot(
      qSnap,
      (snap) => {
        void applyCount(uid, snap.size);
      },
      () => setState((s) => ({ ...s, loading: false })),
    );

    return () => unsub();
  }, [enabled, applyCount]);

  return state;
}

export { LEGACY_REFERRALS_CEILING_UI, LEGACY_DIAMOND_RADAR_STUDIO_FALLBACK_ORIGIN };

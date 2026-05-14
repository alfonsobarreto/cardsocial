import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '@/services/firebaseConfig';
import { STUDENT_PACK_ELIGIBLE_PROVIDERS } from '@/constants/businessRules';
import type { SocialProviderId } from '@/services/socialAuth';

const ELIGIBLE_SOCIAL_PROVIDERS = new Set(STUDENT_PACK_ELIGIBLE_PROVIDERS);

const isEduEmail = (emailLower: string): boolean => {
  return emailLower.endsWith('.edu') || emailLower.includes('.edu.');
};

export interface StudentPackGrantResult {
  eligible: boolean;
  granted: boolean;
  reason: 'granted' | 'already-granted' | 'not-eligible';
  bonusAmount: number;
}

export async function grantStudentPackCreditsIfEligible(params: {
  uid: string;
  emailLower: string;
  authProvider: SocialProviderId | 'password';
}): Promise<StudentPackGrantResult> {
  const { uid, emailLower, authProvider } = params;
  const eligible =
    isEduEmail(emailLower) &&
    authProvider !== 'password' &&
    ELIGIBLE_SOCIAL_PROVIDERS.has(authProvider);

  if (!eligible) {
    return {
      eligible: false,
      granted: false,
      reason: 'not-eligible',
      bonusAmount: 0,
    };
  }

  const userRef = doc(db, 'users', uid);
  const economyRef = doc(db, 'system_config', 'cs_economy');
  const creditsRef = doc(db, `users/${uid}/credits/balance`);
  const grantRef = doc(db, 'student_pack_grants', uid);

  const txResult = await runTransaction(db, async (tx) => {
    const [userSnap, creditsSnap, grantSnap, economySnap] = await Promise.all([
      tx.get(userRef),
      tx.get(creditsRef),
      tx.get(grantRef),
      tx.get(economyRef),
    ]);

    if (!userSnap.exists() || !creditsSnap.exists()) {
      throw new Error('No se encontró el perfil o balance para aplicar Student Pack.');
    }

    const userData = userSnap.data() as Record<string, any>;
    const creditsData = creditsSnap.data() as Record<string, any>;

    if (userData.studentPackGrant?.granted === true || grantSnap.exists()) {
      return { status: 'already-granted' as const, bonus: 0 };
    }

    const bonusCs = Math.max(
      0,
      Math.floor(Number((economySnap.data() as Record<string, unknown> | undefined)?.studentPackBonusCs) || 0),
    );

    const currentBalance = Number(creditsData.creditsBalance || 0);
    const currentEarned = Number(creditsData.totalCreditsEarned || 0);

    tx.update(creditsRef, {
      creditsBalance: currentBalance + bonusCs,
      totalCreditsEarned: currentEarned + bonusCs,
      lastUpdated: serverTimestamp(),
    });

    tx.update(userRef, {
      studentPackGrant: {
        granted: true,
        eligible: true,
        emailLower,
        provider: authProvider,
        amount: bonusCs,
        grantedAt: serverTimestamp(),
      },
      updatedAt: serverTimestamp(),
    });

    tx.set(grantRef, {
      uid,
      emailLower,
      provider: authProvider,
      amount: bonusCs,
      granted: true,
      grantedAt: serverTimestamp(),
      source: 'signup',
    });

    return { status: 'granted' as const, bonus: bonusCs };
  });

  return {
    eligible: true,
    granted: txResult.status === 'granted',
    reason: txResult.status,
    bonusAmount: txResult.status === 'granted' ? txResult.bonus : 0,
  };
}

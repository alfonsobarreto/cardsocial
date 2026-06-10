/**
 * Cupo de Business Cards según tier en Firestore + límites publicados en `system_config/tiers`.
 */

import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/services/firebaseConfig';
import { listMyBusinessCards } from '@/services/businessCardsRepo';
import { POCHOBS_SUPERADMIN_EMAIL } from '@/services/roleService';
import { effectiveTierKeyFromUserData, getTiersConfig } from '@/services/tiersConfigService';
import { readUserNickNameLower } from '@/services/userIdentityFields';

const PRIVILEGED_NICKNAMES = new Set(['pochobs_admin']);
const SUPER_ADMIN_UNLIMITED = 999999;

function isSuperPrivilegedUser(data: Record<string, unknown>): boolean {
  const role = String(data?.role || '').trim().toLowerCase();
  const nicknameLower = readUserNickNameLower(data);
  const emailLower = String(data?.emailLower ?? data?.email ?? '').trim().toLowerCase();
  return (
    role === 'super_admin' ||
    PRIVILEGED_NICKNAMES.has(nicknameLower) ||
    emailLower === POCHOBS_SUPERADMIN_EMAIL
  );
}

export type BusinessCardSlotAvailability = {
  used: number;
  max: number;
  remaining: number;
  canCreate: boolean;
};

export async function getBusinessCardSlotAvailability(userId: string): Promise<BusinessCardSlotAvailability> {
  const uid = String(userId || '').trim();
  if (!uid) {
    return { used: 0, max: 0, remaining: 0, canCreate: false };
  }

  const [tiers, cards] = await Promise.all([getTiersConfig(), listMyBusinessCards(uid)]);

  const used = cards.length;

  const snap = await getDoc(doc(db, 'users', uid));
  const data = snap.exists() ? (snap.data() as Record<string, unknown>) : {};

  if (isSuperPrivilegedUser(data)) {
    return {
      used,
      max: SUPER_ADMIN_UNLIMITED,
      remaining: SUPER_ADMIN_UNLIMITED,
      canCreate: true,
    };
  }

  const tier = effectiveTierKeyFromUserData(data);
  if (!tiers) {
    return { used, max: 0, remaining: 0, canCreate: false };
  }
  const max = Math.max(0, tiers[tier].businessCardsLimit);
  const remaining = Math.max(0, max - used);
  return { used, max, remaining, canCreate: remaining > 0 };
}

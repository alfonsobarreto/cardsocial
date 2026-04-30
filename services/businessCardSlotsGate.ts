/**
 * Cupo de Business Cards según tier en Firestore + límites publicados en `system_config/tiers`.
 * `super_admin` → sin tope práctico. No modifica la pantalla de suscripción; solo sirve para gating.
 */

import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/services/firebaseConfig';
import { listMyBusinessCards } from '@/services/businessCardsRepo';
import { isSuperAdmin } from '@/services/roleService';
import { effectiveTierKeyFromUserData, getTiersConfig } from '@/services/tiersConfigService';

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

  const [admin, tiers, cards] = await Promise.all([
    isSuperAdmin(uid),
    getTiersConfig(),
    listMyBusinessCards(uid),
  ]);

  const used = cards.length;

  if (admin) {
    const max = Math.max(used + 1, 9999);
    return { used, max, remaining: Math.max(0, max - used), canCreate: true };
  }

  const snap = await getDoc(doc(db, 'users', uid));
  const data = snap.exists() ? (snap.data() as Record<string, unknown>) : {};
  const tier = effectiveTierKeyFromUserData(data);
  const max = Math.max(0, tiers[tier].businessCardsLimit);
  const remaining = Math.max(0, max - used);
  return { used, max, remaining, canCreate: remaining > 0 };
}

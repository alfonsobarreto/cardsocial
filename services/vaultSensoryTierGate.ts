/**
 * Tier “Ferrari” para feedback sensorial al guardar en la Bóveda (`users/{uid}` legible solo por el dueño).
 * Incluye: Business / Influencer / Legacy ≥ Platino + rol `super_admin` / `admin`
 * (+ email supremo paridad `register.tsx` cuando el doc aún no trae `role`).
 */
import { doc, getDoc } from 'firebase/firestore';

import { auth, db } from '@/services/firebaseConfig';
import { parseLegacyTier, tierRank } from '@/services/legacyPathEngine';
import { effectiveTierKeyFromUserData } from '@/services/tiersConfigService';

/** Mismo refuerzo que `roleService`: doc sin `role` aún. */
const POCHOBS_SUPER_EMAIL = 'pochobs@gmail.com';

function userDocQualifiesFerrari(d: Record<string, unknown>): boolean {
  const roleNorm = String(d.role ?? '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_');
  if (roleNorm === 'super_admin' || roleNorm === 'admin') return true;

  const tk = effectiveTierKeyFromUserData(d);
  if (tk === 'business' || tk === 'influencer') return true;
  const leg = parseLegacyTier(d.legacyTier);
  return tierRank(leg) >= tierRank('platinum');
}

function sessionEmailIsSupreme(uid: string): boolean {
  try {
    const u = auth.currentUser;
    if (u && u.uid === uid && String(u.email || '').trim().toLowerCase() === POCHOBS_SUPER_EMAIL) {
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

export async function viewerQualifiesVaultFerrariSensory(uid: string): Promise<boolean> {
  const id = String(uid || '').trim();
  if (!id) return false;
  try {
    const snap = await getDoc(doc(db, 'users', id));
    if (snap.exists()) {
      return userDocQualifiesFerrari(snap.data() as Record<string, unknown>);
    }
  } catch {
    /* cae a fallback email */
  }

  return sessionEmailIsSupreme(id);
}

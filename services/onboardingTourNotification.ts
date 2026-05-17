import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

import { db } from '@/services/firebaseConfig';

export const SYS_ONBOARDING_TOUR_TEMPLATE_ID = 'SYS_ONBOARDING_TOUR' as const;

/** Doc auxiliar: si el usuario ya recibió esta notificación alguna vez, no volver a crearla tras borrarla. */
const FLAG_COLLECTION = 'private_app_state';
const FLAG_DOC_ID = 'onboarding_notification';

function tourNotificationFlagRef(uid: string) {
  return doc(db, 'users', uid, FLAG_COLLECTION, FLAG_DOC_ID);
}

/** No toca notificaciones existentes; solo crea si no hay doc con este template y el flag no indica recepción previa. */
export async function ensureOnboardingTourNotification(uid: string): Promise<void> {
  const q = query(
    collection(db, 'users', uid, 'notifications'),
    where('templateId', '==', SYS_ONBOARDING_TOUR_TEMPLATE_ID),
    limit(1),
  );
  const existing = await getDocs(q);
  if (!existing.empty) {
    await setDoc(
      tourNotificationFlagRef(uid),
      { hasReceivedOnboardingNotification: true, updatedAt: serverTimestamp() },
      { merge: true },
    ).catch(() => {});
    return;
  }

  const flagSnap = await getDoc(tourNotificationFlagRef(uid));
  if (flagSnap.exists() && flagSnap.data()?.hasReceivedOnboardingNotification === true) {
    return;
  }

  const notifRef = doc(collection(db, 'users', uid, 'notifications'));
  const batch = writeBatch(db);
  batch.set(notifRef, {
    templateId: SYS_ONBOARDING_TOUR_TEMPLATE_ID,
    read: false,
    createdAt: serverTimestamp(),
  });
  batch.set(
    tourNotificationFlagRef(uid),
    { hasReceivedOnboardingNotification: true, updatedAt: serverTimestamp() },
    { merge: true },
  );
  await batch.commit();
}

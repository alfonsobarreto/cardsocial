/**
 * Señalización opcional vía Firestore para consentimiento de cámara en llamadas Ghost-Link
 * que empezaron en audio (sin cambiar el backend de invitaciones).
 *
 * Requiere reglas en `firestore.rules` para la colección `ghostLinkVoipSignals`.
 */

import { deleteDoc, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';

import { db } from '@/services/firebaseConfig';

const COL = 'ghostLinkVoipSignals';

export type GhostLinkCameraSignalSnapshot = {
  requestBy: string | null;
  response: 'accept' | 'deny' | null;
};

export function watchGhostLinkCameraSignal(
  sessionId: string,
  onChange: (snap: GhostLinkCameraSignalSnapshot) => void,
): () => void {
  const ref = doc(db, COL, sessionId);
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        onChange({ requestBy: null, response: null });
        return;
      }
      const d = snap.data();
      const res = d?.response;
      const response =
        res === 'accept' || res === 'deny' ? res : null;
      onChange({
        requestBy: typeof d?.requestBy === 'string' ? d.requestBy : null,
        response,
      });
    },
    () => {
      onChange({ requestBy: null, response: null });
    },
  );
}

export async function writeGhostLinkCameraRequest(sessionId: string, fromUid: string): Promise<void> {
  const ref = doc(db, COL, sessionId);
  await setDoc(
    ref,
    {
      requestBy: fromUid,
      response: null,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function writeGhostLinkCameraResponse(
  sessionId: string,
  response: 'accept' | 'deny',
): Promise<void> {
  const ref = doc(db, COL, sessionId);
  await setDoc(
    ref,
    {
      response,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function clearGhostLinkCameraSignal(sessionId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, COL, sessionId));
  } catch {
    /* doc ausente u offline */
  }
}

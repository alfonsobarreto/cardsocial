/**
 * Misma lógica que `app/signin.tsx` → inicio con nombre de usuario;
 * resuelve emails de Firebase a partir de Firestore (incl. pendingEmail* tras cambio de correo).
 */
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { firestoreFirstStudioUserDocByNickLower } from '@/lib/studioUserIdentityFields';
import { getStudioDb } from '@/lib/studioFirebase';

export function signInEmailsFromUserDoc(data: Record<string, unknown>): string[] {
  const primary = String(data.emailLower || data.email || '')
    .trim()
    .toLowerCase();
  const pending = String(data.pendingEmailLower || data.pendingEmail || '')
    .trim()
    .toLowerCase();
  const out: string[] = [];
  if (primary) out.push(primary);
  if (pending && pending !== primary) out.push(pending);
  return out;
}

/** Lectura cliente (suele fallar con reglas salvo pruebas locales). */
export async function resolveEmailCandidatesFromUsername(rawUsername: string): Promise<string[] | null> {
  const db = getStudioDb();
  const normalizedUsername = rawUsername.trim().toLowerCase();
  if (!normalizedUsername) {
    return null;
  }

  const byLowerDoc = await firestoreFirstStudioUserDocByNickLower(db, normalizedUsername);
  if (byLowerDoc) {
    const emails = signInEmailsFromUserDoc(byLowerDoc.data() as Record<string, unknown>);
    return emails.length ? emails : null;
  }

  const usersRef = collection(db, 'users');
  const byNickname = await getDocs(
    query(usersRef, where('nickname', '==', rawUsername.trim()), limit(1)),
  );
  if (!byNickname.empty) {
    const emails = signInEmailsFromUserDoc(byNickname.docs[0].data() as Record<string, unknown>);
    return emails.length ? emails : null;
  }

  const byUserNick = await getDocs(
    query(usersRef, where('userNickName', '==', rawUsername.trim()), limit(1)),
  );
  if (!byUserNick.empty) {
    const emails = signInEmailsFromUserDoc(byUserNick.docs[0].data() as Record<string, unknown>);
    return emails.length ? emails : null;
  }

  return null;
}

/** @deprecated Prefer `resolveEmailCandidatesFromUsername`; conservado por compatibilidad. */
export async function resolveEmailFromUsername(rawUsername: string): Promise<string | null> {
  const list = await resolveEmailCandidatesFromUsername(rawUsername);
  return list?.[0] ?? null;
}

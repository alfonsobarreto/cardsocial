/**
 * Misma lógica que `app/signin.tsx` → inicio con nombre de usuario;
 * resuelve el email de Firebase a partir de Firestore.
 */
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { firestoreFirstUserDocByNickLower } from '@card-social/services/userIdentityFields';
import { getStudioDb } from '@/lib/studioFirebase';

export async function resolveEmailFromUsername(rawUsername: string): Promise<string | null> {
  const db = getStudioDb();
  const normalizedUsername = rawUsername.trim().toLowerCase();
  if (!normalizedUsername) {
    return null;
  }

  const byLowerDoc = await firestoreFirstUserDocByNickLower(db, normalizedUsername);
  if (byLowerDoc) {
    const userData = byLowerDoc.data() as { email?: string; emailLower?: string };
    return String(userData.emailLower || userData.email || '').trim().toLowerCase() || null;
  }

  const usersRef = collection(db, 'users');
  const byNickname = await getDocs(
    query(usersRef, where('nickname', '==', rawUsername.trim()), limit(1)),
  );
  if (!byNickname.empty) {
    const userData = byNickname.docs[0].data() as { email?: string; emailLower?: string };
    return String(userData.emailLower || userData.email || '').trim().toLowerCase() || null;
  }

  const byUserNick = await getDocs(
    query(usersRef, where('userNickName', '==', rawUsername.trim()), limit(1)),
  );
  if (!byUserNick.empty) {
    const userData = byUserNick.docs[0].data() as { email?: string; emailLower?: string };
    return String(userData.emailLower || userData.email || '').trim().toLowerCase() || null;
  }

  return null;
}

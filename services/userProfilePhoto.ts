import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/services/firebaseConfig';
import { readUserAvatarUrl } from '@/services/userIdentityFields';

function toRenderableImageUri(value: string | null | undefined): string | null {
  const uri = String(value || '').trim();
  if (!uri) return null;
  if (uri.startsWith('https://') || uri.startsWith('http://')) return uri;
  if (uri.startsWith('file://')) return uri;
  if (uri.startsWith('data:image/')) return uri;
  return null;
}

/**
 * Foto de perfil vigente en Firestore (`users/{uid}.userAvatarUrl`).
 * No usa fotos denormalizadas en tarjetas / Mongo.
 */
export async function fetchUserProfilePhotoUrl(uid: string): Promise<string | null> {
  const id = String(uid || '').trim();
  if (!id) return null;
  try {
    const snap = await getDoc(doc(db, 'users', id));
    if (!snap.exists()) return null;
    const data = snap.data() as Record<string, unknown>;
    return toRenderableImageUri(readUserAvatarUrl(data) || null);
  } catch {
    return null;
  }
}

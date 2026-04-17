import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/services/firebaseConfig';
import { readUserAvatarUrl } from '@/services/userIdentityFields';

/** Normaliza URL para `<Image` / ExpoImage (incl. `//cdn...` → `https://cdn...`). */
export function toRenderableImageUri(value: string | null | undefined): string | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  let uri = raw;
  if (uri.startsWith('//')) uri = `https:${uri}`;
  if (uri.startsWith('https://') || uri.startsWith('http://')) return uri;
  if (uri.startsWith('file://')) return uri;
  if (uri.startsWith('data:image/')) return uri;
  return null;
}

/**
 * Misma lógica que perfil / registro: `userAvatarUrl` y campos legacy, luego `auth.photoURL`.
 */
export function resolveProfileAvatarDisplayUri(
  data: Record<string, unknown> | null | undefined,
  authPhotoURL: string | null | undefined
): string | null {
  const candidates: string[] = [];
  if (data) {
    candidates.push(
      readUserAvatarUrl(data),
      String(data.photoUrl ?? '').trim(),
      String(data.userAvatar ?? '').trim(),
      String(data.avatarUrl ?? '').trim(),
      typeof data.profilePhoto === 'string' ? data.profilePhoto.trim() : String(data.profilePhoto ?? '').trim()
    );
  }
  const auth = String(authPhotoURL ?? '').trim();
  if (auth) candidates.push(auth);
  for (const c of candidates) {
    const u = toRenderableImageUri(c);
    if (u) return u;
  }
  return null;
}

/**
 * Foto de perfil vigente en Firestore (`users/{uid}`).
 */
export async function fetchUserProfilePhotoUrl(uid: string): Promise<string | null> {
  const id = String(uid || '').trim();
  if (!id) return null;
  try {
    const snap = await getDoc(doc(db, 'users', id));
    if (!snap.exists()) return null;
    const data = snap.data() as Record<string, unknown>;
    return resolveProfileAvatarDisplayUri(data, null);
  } catch {
    return null;
  }
}

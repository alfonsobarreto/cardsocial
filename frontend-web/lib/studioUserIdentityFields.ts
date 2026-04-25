import { collection, deleteField, getDocs, limit, query, where, type Firestore } from 'firebase/firestore';

export function readStudioUserFullName(data: Record<string, unknown> | undefined | null): string {
  if (!data) return 'Usuario';
  const userFullName = String(data.userFullName ?? '').trim();
  if (userFullName) return userFullName;
  const legacy = String(data.fullName ?? '').trim();
  if (legacy) return legacy;
  const firstName = String(data.firstName ?? '').trim();
  const lastName = String(data.lastName ?? '').trim();
  const composed = `${firstName} ${lastName}`.trim();
  return composed || String(data.displayName ?? data.name ?? '').trim() || 'Usuario';
}

export function readStudioUserNickName(data: Record<string, unknown> | undefined | null): string {
  if (!data) return '';
  return String(data.userNickName ?? data.nickname ?? '').trim().replace(/^@+/g, '');
}

export function readStudioUserAvatarUrl(data: Record<string, unknown> | undefined | null): string {
  if (!data) return '';
  return String(data.userAvatarUrl ?? '').trim();
}

export function firestoreStudioUserFullNameWrite(trimmedFullName: string): Record<string, string> {
  const value = trimmedFullName.trim();
  return { userFullName: value, fullName: value };
}

export function firestoreStudioUserNickNameWrite(trimmedNick: string): Record<string, string> {
  const value = trimmedNick.trim();
  const lower = value.toLowerCase();
  return {
    userNickName: value,
    userNickNameLower: lower,
    nickname: value,
    nicknameLower: lower,
  };
}

export function firestoreStudioUserAvatarUrlWrite(publicUrl: string | null | undefined): Record<string, unknown> {
  const value = publicUrl != null ? String(publicUrl).trim() : '';
  const wipeLegacy: Record<string, unknown> = {
    userAvatar: deleteField(),
    photoUrl: deleteField(),
    avatarUrl: deleteField(),
    profilePhoto: deleteField(),
  };
  if (value) return { userAvatarUrl: value, ...wipeLegacy };
  return { userAvatarUrl: deleteField(), ...wipeLegacy };
}

export async function firestoreFirstStudioUserDocByNickLower(db: Firestore, lower: string) {
  const usersRef = collection(db, 'users');
  const byNew = await getDocs(query(usersRef, where('userNickNameLower', '==', lower), limit(1)));
  if (!byNew.empty) return byNew.docs[0];
  const byLegacy = await getDocs(query(usersRef, where('nicknameLower', '==', lower), limit(1)));
  if (!byLegacy.empty) return byLegacy.docs[0];
  return null;
}

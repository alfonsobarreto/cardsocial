/**
 * Identidad canónica en app y Firestore:
 * - userFullName / userNickName / userNickNameLower
 * - userAvatarUrl (URL pública de la foto de perfil)
 * - Solo en registro se guardan además firstName y lastName por separado.
 * Espejos legacy (fullName, nickname, …) al escribir nombres; al escribir avatar se eliminan claves antiguas de foto.
 */

import {
  collection,
  deleteField,
  getDocs,
  limit,
  query,
  where,
  type Firestore,
} from 'firebase/firestore';

export function readUserFullName(data: Record<string, unknown> | undefined | null): string {
  if (!data) return 'Usuario';
  const u = String(data.userFullName ?? '').trim();
  if (u) return u;
  const legacy = String(data.fullName ?? '').trim();
  if (legacy) return legacy;
  const fn = String(data.firstName ?? '').trim();
  const ln = String(data.lastName ?? '').trim();
  const composed = `${fn} ${ln}`.trim();
  if (composed) return composed;
  return String(data.displayName ?? data.name ?? '').trim() || 'Usuario';
}

/**
 * Nombre para VoIP / pastilla Ghost-Link: solo campos “nombre real”, nunca un texto que coincida con el @nick.
 * Todos los candidatos (userFullName, composed, legacy fullName) se comparan contra el nickname.
 */
export function readVoipCanonicalFullName(data: Record<string, unknown> | undefined | null): string {
  if (!data) return '';
  const nick = readUserNickName(data).toLowerCase().replace(/\s+/g, '');
  const notNick = (s: string) => s.length > 0 && s.toLowerCase().replace(/\s+/g, '') !== nick;
  const u = String(data.userFullName ?? '').trim();
  if (notNick(u)) return u;
  const fn = String(data.firstName ?? '').trim();
  const ln = String(data.lastName ?? '').trim();
  const composed = `${fn} ${ln}`.trim();
  if (notNick(composed)) return composed;
  const legacy = String(data.fullName ?? '').trim();
  if (notNick(legacy)) return legacy;
  return '';
}

export function readUserNickName(data: Record<string, unknown> | undefined | null): string {
  if (!data) return '';
  return String(data.userNickName ?? data.nickname ?? '').trim().replace(/^@+/g, '');
}

export function readUserNickNameLower(data: Record<string, unknown> | undefined | null): string {
  if (!data) return '';
  const u = String(data.userNickNameLower ?? '').trim().toLowerCase();
  if (u) return u;
  const n = String(data.nicknameLower ?? '').trim().toLowerCase();
  if (n) return n;
  return readUserNickName(data).toLowerCase();
}

/** Firestore: nombre completo canónico + espejo legacy. */
export function firestoreUserFullNameWrite(trimmedFullName: string): Record<string, string> {
  const t = trimmedFullName.trim();
  return { userFullName: t, fullName: t };
}

/** Firestore / Mongo: nickname canónico + espejo legacy (índices nicknameLower). */
export function firestoreUserNickNameWrite(trimmedNick: string): Record<string, string> {
  const t = trimmedNick.trim();
  const lower = t.toLowerCase();
  return {
    userNickName: t,
    userNickNameLower: lower,
    nickname: t,
    nicknameLower: lower,
  };
}

/** Busca usuario por handle en minúsculas (nuevo campo primero). */
export async function firestoreFirstUserDocByNickLower(db: Firestore, lower: string) {
  const usersRef = collection(db, 'users');
  const byNew = await getDocs(query(usersRef, where('userNickNameLower', '==', lower), limit(1)));
  if (!byNew.empty) return byNew.docs[0];
  const byLegacy = await getDocs(query(usersRef, where('nicknameLower', '==', lower), limit(1)));
  if (!byLegacy.empty) return byLegacy.docs[0];
  return null;
}

/** URL de avatar de perfil: solo `userAvatarUrl`. */
export function readUserAvatarUrl(data: Record<string, unknown> | undefined | null): string {
  if (!data) return '';
  return String(data.userAvatarUrl ?? '').trim();
}

/**
 * Firestore `users/{uid}`: campo `userAvatarUrl` y borra claves antiguas.
 * Pasar `null` o cadena vacía para quitar avatar.
 */
export function firestoreUserAvatarUrlWrite(publicUrl: string | null | undefined): Record<string, unknown> {
  const t = publicUrl != null ? String(publicUrl).trim() : '';
  const wipeLegacy: Record<string, unknown> = {
    userAvatar: deleteField(),
    photoUrl: deleteField(),
    avatarUrl: deleteField(),
    profilePhoto: deleteField(),
  };
  if (t) {
    return { userAvatarUrl: t, ...wipeLegacy };
  }
  return { userAvatarUrl: deleteField(), ...wipeLegacy };
}

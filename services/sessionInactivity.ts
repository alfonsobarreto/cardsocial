import type { User } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { signOut } from 'firebase/auth';

import { auth } from '@/services/firebaseConfig';
import { sessionLastActivityKey, trustedDeviceSessionKey } from '@/services/sessionPolicyKeys';
import { clearLocalCachesForSignOut } from '@/services/userScopedStorage';

/** Ocho horas sin actividad (solo si no es dispositivo de confianza). */
export const SESSION_INACTIVITY_LIMIT_MS = 8 * 60 * 60 * 1000;

export function firebaseUserMayEnterMainApp(user: User | null): boolean {
  if (!user) return false;
  const usesPassword = user.providerData.some((p) => p.providerId === 'password');
  if (usesPassword && !user.emailVerified) return false;
  return true;
}

export async function getSessionLastActivityMs(uid: string): Promise<number | null> {
  const raw = await AsyncStorage.getItem(sessionLastActivityKey(uid));
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export async function touchSessionActivity(uid: string): Promise<void> {
  await AsyncStorage.setItem(sessionLastActivityKey(uid), String(Date.now()));
}

export async function clearSessionActivity(uid: string | null | undefined): Promise<void> {
  const id = String(uid || '').trim();
  if (!id) return;
  await AsyncStorage.removeItem(sessionLastActivityKey(id));
}

export async function isTrustedDeviceSession(uid: string): Promise<boolean> {
  const raw = await AsyncStorage.getItem(trustedDeviceSessionKey(uid));
  return raw === '1';
}

export async function setTrustedDeviceSession(uid: string, trusted: boolean): Promise<void> {
  const key = trustedDeviceSessionKey(uid);
  if (trusted) {
    await AsyncStorage.setItem(key, '1');
  } else {
    await AsyncStorage.removeItem(key);
  }
}

export async function clearTrustedDeviceSession(uid: string | null | undefined): Promise<void> {
  const id = String(uid || '').trim();
  if (!id) return;
  await AsyncStorage.removeItem(trustedDeviceSessionKey(id));
}

function isSessionExpiredByInactivity(lastActivityMs: number | null, nowMs: number = Date.now()): boolean {
  if (lastActivityMs == null) return false;
  return nowMs - lastActivityMs > SESSION_INACTIVITY_LIMIT_MS;
}

/** Mueve el reloj de inactividad solo si esta sesión no es “dispositivo de confianza”. */
export async function touchSessionActivityForNonTrusted(uid: string): Promise<void> {
  if (await isTrustedDeviceSession(uid)) return;
  await touchSessionActivity(uid);
}

/**
 * Comprueba inactividad (si no es dispositivo de confianza). Si expira, limpia y cierra Firebase.
 * Si no expira, actualiza la marca de actividad (uso detectado).
 */
export async function enforceInactivitySignOutIfNeeded(): Promise<'ok' | 'signed_out'> {
  const user = auth.currentUser;
  if (!user) return 'ok';
  const uid = user.uid;

  if (await isTrustedDeviceSession(uid)) {
    return 'ok';
  }

  const last = await getSessionLastActivityMs(uid);

  if (isSessionExpiredByInactivity(last)) {
    await clearLocalCachesForSignOut(uid);
    await clearSessionActivity(uid);
    await clearTrustedDeviceSession(uid);
    await signOut(auth).catch(() => null);
    return 'signed_out';
  }

  await touchSessionActivity(uid);
  return 'ok';
}

/** Chequeo periódico en primer plano sin refrescar la marca (p. ej. una sola pantalla abierta 8h). */
export async function checkInactivitySignOutWithoutTouch(): Promise<'ok' | 'signed_out'> {
  const user = auth.currentUser;
  if (!user) return 'ok';
  const uid = user.uid;

  if (await isTrustedDeviceSession(uid)) {
    return 'ok';
  }

  const last = await getSessionLastActivityMs(uid);

  if (isSessionExpiredByInactivity(last)) {
    await clearLocalCachesForSignOut(uid);
    await clearSessionActivity(uid);
    await clearTrustedDeviceSession(uid);
    await signOut(auth).catch(() => null);
    return 'signed_out';
  }
  return 'ok';
}

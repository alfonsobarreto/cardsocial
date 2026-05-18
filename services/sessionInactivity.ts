import type { User } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { signOut } from 'firebase/auth';

import { auth } from '@/services/firebaseConfig';
import { sessionLastActivityKey, trustedDeviceSessionKey } from '@/services/sessionPolicyKeys';
import { clearLocalCachesForSignOut } from '@/services/userScopedStorage';

/** Ocho horas sin actividad (solo si no es dispositivo de confianza). */
export const SESSION_INACTIVITY_LIMIT_MS = 8 * 60 * 60 * 1000;

/**
 * Margen por encima del límite antes de declarar expirada la sesión.
 * Evita cierres erróneos por carreras de unos pocos ms entre touch y lectura periódica.
 */
export const SESSION_INACTIVITY_EXPIRY_GRACE_MS = 5_000;

/** Serializa escrituras de última actividad para evitar condiciones de carrera en AsyncStorage. */
let touchActivityWriteChain: Promise<void> = Promise.resolve();

/**
 * Indica si la sesión debe considerarse expirada por inactividad o anomalía de reloj.
 *
 * - `lastActivityMs == null`: estado inválido; quien llama debe hacer `touchSessionActivity` antes
 *   de interpretar el resultado (véase `enforceInactivitySignOutIfNeeded` / `checkInactivitySignOutWithoutTouch`).
 * - `nowMs < lastActivityMs` (reloj atrasado): se trata como anomalía → expirado.
 */
function isSessionExpiredByInactivity(lastActivityMs: number | null, nowMs: number = Date.now()): boolean {
  if (lastActivityMs == null) {
    return true;
  }
  const delta = nowMs - lastActivityMs;
  if (delta < 0) {
    return true;
  }
  return delta > SESSION_INACTIVITY_LIMIT_MS + SESSION_INACTIVITY_EXPIRY_GRACE_MS;
}

/** Correos que omiten la pantalla de “verifica tu correo” (cuentas operativas / prueba). */
const EMAIL_VERIFICATION_BYPASS_EMAILS_LOWER = new Set<string>([
  'pochobs@gmail.com',
]);

/** Dominios organización / pruebas (p. ej. cuentas @cardsocial.me). */
const EMAIL_VERIFICATION_BYPASS_DOMAIN_SUFFIXES = ['@cardsocial.me', '@cardsocial.app'];

function parseCommaList(raw: string | undefined): string[] {
  return String(raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function isPasswordEmailVerificationBypassed(user: User): boolean {
  const email = String(user.email || '').trim().toLowerCase();
  if (email) {
    if (EMAIL_VERIFICATION_BYPASS_EMAILS_LOWER.has(email)) return true;
    for (const suffix of EMAIL_VERIFICATION_BYPASS_DOMAIN_SUFFIXES) {
      if (email.endsWith(suffix)) return true;
    }
    for (const extra of parseCommaList(process.env.EXPO_PUBLIC_AUTH_EMAIL_VERIFY_BYPASS_EMAILS)) {
      if (email === extra.toLowerCase()) return true;
    }
  }
  const uid = user.uid;
  for (const id of parseCommaList(process.env.EXPO_PUBLIC_AUTH_EMAIL_VERIFY_BYPASS_UIDS)) {
    if (uid === id) return true;
  }
  return false;
}

export function firebaseUserMayEnterMainApp(user: User | null): boolean {
  if (!user) return false;
  const usesPassword = user.providerData.some((p) => p.providerId === 'password');
  if (usesPassword && !user.emailVerified) {
    if (isPasswordEmailVerificationBypassed(user)) return true;
    return false;
  }
  return true;
}

export async function getSessionLastActivityMs(uid: string): Promise<number | null> {
  const raw = await AsyncStorage.getItem(sessionLastActivityKey(uid));
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export async function touchSessionActivity(uid: string): Promise<void> {
  const op = touchActivityWriteChain.catch(() => {}).then(() =>
    AsyncStorage.setItem(sessionLastActivityKey(uid), String(Date.now())),
  );
  touchActivityWriteChain = op.catch(() => {});
  await op;
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
  if (last == null) {
    await touchSessionActivity(uid);
    return 'ok';
  }

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

/** Chequeo PERIODICO en primer plano sin refrescar la marca salvo que falte baseline (clave ausente / inválida). */
export async function checkInactivitySignOutWithoutTouch(): Promise<'ok' | 'signed_out'> {
  const user = auth.currentUser;
  if (!user) return 'ok';
  const uid = user.uid;

  if (await isTrustedDeviceSession(uid)) {
    return 'ok';
  }

  const last = await getSessionLastActivityMs(uid);
  if (last == null) {
    await touchSessionActivity(uid);
    return 'ok';
  }

  if (isSessionExpiredByInactivity(last)) {
    await clearLocalCachesForSignOut(uid);
    await clearSessionActivity(uid);
    await clearTrustedDeviceSession(uid);
    await signOut(auth).catch(() => null);
    return 'signed_out';
  }
  return 'ok';
}
